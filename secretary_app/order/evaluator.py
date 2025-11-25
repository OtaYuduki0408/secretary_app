from supabase_client import supabase
from datetime import datetime, timedelta # timedeltaを追加
import json
import pytz
from services import pending_action_service
from services.finance_service import get_current_balance, get_monthly_expense, get_daily_expense, get_monthly_goal
from services.memo_service import get_all_memos
from flask import current_app
from math import radians, sin, cos, sqrt, atan2

# タイムゾーン設定
JST = pytz.timezone('Asia/Tokyo')

# Supabaseにpending_user_actionsテーブルが存在しない場合に作成を試みる
# この処理はアプリケーション起動時に一度だけ実行されるべきだが、
# ジョブ内で初回実行時にチェックする形にする
def _ensure_pending_actions_table_exists():
    # 実際にはSupabaseのSDKでテーブルの存在チェックや作成は直接できないので、
    # insert/selectが失敗しないことを期待するか、事前に手動で作成する
    # ここでは便宜上、テーブル名を返すだけにする
    return 'pending_user_actions'

def _calculate_action_execution_time(timing_data: dict, triggered_at: datetime) -> datetime:
    """
    アクションの実行タイミングを計算する。
    絶対指定が相対指定に優先する。
    Args:
        timing_data (dict): アクションのタイミング情報を含む辞書 (date_abs, date_rel, time_abs, time_rel)。
        triggered_at (datetime): トリガーが発動した日時 (タイムゾーン情報を持つdatetimeオブジェクト)。

    Returns:
        datetime: 実際にアクションが実行されるべき日時。
    """
    execution_time = triggered_at # 基準はトリガー発動日時

    # 1. 日付の指定 (絶対指定が優先)
    date_abs = timing_data.get('date_abs')
    date_rel_str = timing_data.get('date_rel')

    if date_abs:
        # 絶対日付が指定されている場合 (YYYY-MM-DD形式を想定)
        try:
            # 実行時の時刻は維持し、日付部分のみ置き換える
            abs_date = datetime.strptime(date_abs, '%Y-%m-%d').date()
            execution_time = execution_time.replace(year=abs_date.year, month=abs_date.month, day=abs_date.day)
        except ValueError:
            pass # 無効な日付形式は無視
    elif date_rel_str:
        # 相対日付 (+n 日) が指定されている場合
        try:
            days_offset = int(date_rel_str)
            execution_time += timedelta(days=days_offset)
        except ValueError:
            pass # 無効な数値は無視

    # 2. 時刻の指定 (絶対指定が優先)
    time_abs = timing_data.get('time_abs')
    time_rel_str = timing_data.get('time_rel')

    if time_abs:
        # 絶対時刻が指定されている場合 (HH:MM形式を想定)
        try:
            abs_time = datetime.strptime(time_abs, '%H:%M').time()
            execution_time = execution_time.replace(hour=abs_time.hour, minute=abs_time.minute, second=0, microsecond=0)
        except ValueError:
            pass # 無効な時刻形式は無視
    elif time_rel_str:
        # 相対時刻 (+HH:MM:SS) が指定されている場合
        try:
            # HH:MM:SS 形式のパースを強化
            parts = time_rel_str.split(':')
            hours = int(parts[0]) if len(parts) > 0 else 0
            minutes = int(parts[1]) if len(parts) > 1 else 0
            seconds = int(parts[2]) if len(parts) > 2 else 0
            execution_time += timedelta(hours=hours, minutes=minutes, seconds=seconds)
        except ValueError:
            pass # 無効な時刻形式は無視
    
    # タイムゾーン情報を付与 (JSTとして扱う)
    if execution_time.tzinfo is None:
        execution_time = JST.localize(execution_time)

    return execution_time


def _evaluate_time_trigger(trigger, now_jst, current_time_str, current_day_of_week_jp):
    """時間トリガーを評価するヘルパー関数"""
    # order と order_data の取得は不要
    # trigger.get('category') == '時間' のチェックは呼び出し元で既にされているので不要
    
    is_triggered = False
    
    trigger_value = trigger.get('value')

    if not trigger_value:
        return False # トリガー値がなければ発動しない

    trigger_year = trigger_value.get('year')
    trigger_month = trigger_value.get('month')
    trigger_day = trigger_value.get('day')
    trigger_day_of_week = trigger_value.get('day_of_week') # リスト ["月", "水", "金"] または None
    trigger_time_start = trigger_value.get('time_start') # "HH:MM"

    # 1. 時間が一致するか
    time_match = (trigger_time_start == current_time_str)

    # 2. 年月日が指定されている場合
    if trigger_year and trigger_month and trigger_day:
        try:
            # 'str'型であることを確認し、intに変換
            trigger_date = datetime(int(str(trigger_year)), int(str(trigger_month)), int(str(trigger_day))).date()
            date_match = (trigger_date == now_jst.date())
        except ValueError:
            date_match = False # 不正な日付の場合は一致しない
    else:
        date_match = True # 年月日未指定の場合は日付は常に一致とみなす

    # 3. 曜日が指定されている場合
    if trigger_day_of_week: # 曜日が指定されている (例: ["月", "水"])
        day_of_week_match = (current_day_of_week_jp in trigger_day_of_week)
    else:
        day_of_week_match = True # 曜日未指定の場合は曜日は常に一致とみなす
    
    # すべての条件が満たされたらトリガー発動
    is_triggered = time_match and date_match and day_of_week_match

    return is_triggered

def _evaluate_calendar_trigger(order, user_id, now_jst, current_time_str, current_day_of_week_jp):
    """カレンダートリガーを評価するヘルパー関数"""
    order_data = order.get('order_data')
    trigger = order_data.get('trigger')
    trigger_value = trigger.get('value')
    
    is_triggered = False

    if trigger.get('sub') == 'この予定があるなら':
        # "この予定があるなら" のロジック
        search_type = trigger_value.get('search_type') # exact_match or partial_match
        title = trigger_value.get('title')
        
        # '実行された年', '実行された月' などの特殊な値を現在の日時に置き換える
        start_year = trigger_value.get('start_year')
        if start_year == '実行された年':
            start_year = now_jst.year
        
        start_month = trigger_value.get('start_month')
        if start_month == '実行された月':
            start_month = now_jst.month

        start_day = trigger_value.get('start_day')
        if start_day == '実行された日':
            start_day = now_jst.day
        
        start_time_val = trigger_value.get('start_time')
        if start_time_val == '実行された時刻':
            start_time_val = now_jst.strftime('%H:%M')

        end_year = trigger_value.get('end_year')
        if end_year == '実行された年':
            end_year = now_jst.year
        
        end_month = trigger_value.get('end_month')
        if end_month == '実行された月':
            end_month = now_jst.month
        
        end_day = trigger_value.get('end_day')
        if end_day == '実行された日':
            end_day = now_jst.day

        end_time_val = trigger_value.get('end_time')
        if end_time_val == '実行された時刻':
            end_time_val = now_jst.strftime('%H:%M')

        try:
            time_min = datetime(int(start_year), int(start_month), int(start_day), 
                                int(start_time_val.split(':')[0]), int(start_time_val.split(':')[1]), tzinfo=JST) # pytz.timezone('Asia/Tokyo')をJSTに変更
            time_max = datetime(int(end_year), int(end_month), int(end_day),
                                int(end_time_val.split(':')[0]), int(end_time_val.split(':')[1]), tzinfo=JST) # pytz.timezone('Asia/Tokyo')をJSTに変更
        except (ValueError, TypeError) as e:
            print(f"カレンダートリガーの日時解析エラー: {e}, trigger_value: {trigger_value}")
            return False

        if not current_app.calendar_manager.is_google_linked(user_id):
            print(f"ユーザー {user_id} のGoogleアカウントがリンクされていません。カレンダートリガー評価をスキップします。")
            return False
        
        events = current_app.calendar_manager.get_events_in_range(user_id, time_min, time_max)
        
        if events:
            for event in events:
                event_summary = event.get('summary', '')
                if search_type == 'exact_match':
                    if event_summary == title:
                        is_triggered = True
                        break
                elif search_type == 'partial_match':
                    if title in event_summary:
                        is_triggered = True
                        break
    
    # 他のサブカテゴリのロジックはここに elif で追加
    # elif trigger.get('sub') == '入力があったら':
    #     pass
    # elif trigger.get('sub') == '予定の時間になったら':
    #     pass

    return is_triggered

def _evaluate_finance_trigger(order, user_id):
    """収支管理トリガーを評価するヘルパー関数"""
    order_data = order.get('order_data')
    trigger = order_data.get('trigger')
    trigger_value = trigger.get('value')
    
    is_triggered = False

    if trigger.get('sub') == '特定金額になったら':
        item = trigger_value.get('item')
        target_amount_str = trigger_value.get('amount')
        target_percentage_str = trigger_value.get('percentage')

        current_value = 0
        if item == 'total_balance':
            current_value = get_current_balance(user_id)
        elif item == 'monthly_expense' or item == 'monthly_expense_no_necessities':
            current_value = get_monthly_expense(user_id)
        elif item == 'daily_expense' or item == 'daily_expense_no_necessities':
            current_value = get_daily_expense(user_id)
        elif item == 'remaining_to_target':
            goal = get_monthly_goal(user_id)
            goal_amount = goal.get('goal_amount') if goal else 0
            current_expense = get_monthly_expense(user_id) # 今月の支出
            current_value = goal_amount - current_expense # 残金

        target_amount = None
        if target_amount_str:
            try:
                target_amount = float(target_amount_str)
            except ValueError:
                print(f"財務トリガーの金額解析エラー (amount): {target_amount_str}")
                return False
        
        target_percentage = None
        if target_percentage_str and item != 'remaining_to_target': # 残金は割合では指定しない想定
            try:
                target_percentage = float(target_percentage_str)
            except ValueError:
                print(f"財務トリガーの割合解析エラー (percentage): {target_percentage_str}")
                return False

        if target_amount is not None:
            # 「残高が◯◯円以下」は total_balance が target_amount 以下のとき発動
            # 「出費が◯◯円を超えた」は monthly_expense が target_amount を超えたとき発動
            # 「今日の支出が◯◯円を超えた」は daily_expense が target_amount を超えたとき発動
            # 「目標金額までの残金が◯◯円以下」は remaining_to_target が target_amount 以下のとき発動
            if item == 'total_balance' or item == 'remaining_to_target':
                if current_value <= target_amount:
                    is_triggered = True
            elif item == 'monthly_expense' or item == 'daily_expense' or item == 'monthly_expense_no_necessities' or item == 'daily_expense_no_necessities':
                if current_value >= target_amount:
                    is_triggered = True
        elif target_percentage is not None:
            # 例えば「今月の支出が目標額のn%を超えたら」
            if item == 'monthly_expense' or item == 'monthly_expense_no_necessities':
                goal = get_monthly_goal(user_id)
                goal_amount = goal.get('goal_amount') if goal else 0
                if goal_amount > 0 and (current_value / goal_amount * 100) >= target_percentage:
                    is_triggered = True

    # 他のサブカテゴリのロジックはここに elif で追加
    # elif trigger.get('sub') == '入力があったら':
    #     pass

    return is_triggered

def _evaluate_memo_trigger(order, user_id):
    """メモトリガーを評価するヘルパー関数"""
    order_data = order.get('order_data')
    trigger = order.get('trigger')
    trigger_value = trigger.get('value')
    
    is_triggered = False

    if trigger.get('sub') == '入力があったら': # 現在存在するメモが特定のフィルター条件を満たしているか
        filters = trigger_value.get('filters', [])
        
        # ユーザーのすべてのメモを取得
        memos = get_all_memos(user_id) # memo_service.pyからインポート

        if not memos:
            return False

        # 各メモがフィルター条件を満たすか評価
        for memo_entry in memos:
            memo_content = memo_entry.get('content', '')
            
            # フィルターロジックの評価
            filter_match = True
            for i, f in enumerate(filters):
                filter_text = f.get('text', '')
                filter_logic = f.get('logic', 'AND') # デフォルトはAND
                
                current_filter_result = (filter_text in memo_content)
                
                if i == 0: # 最初のフィルター
                    if filter_logic == 'NOT':
                        filter_match = not current_filter_result
                    else:
                        filter_match = current_filter_result
                else: # 2番目以降のフィルター
                    if filter_logic == 'AND':
                        filter_match = filter_match and current_filter_result
                    elif filter_logic == 'OR':
                        filter_match = filter_match or current_filter_result
                    elif filter_logic == 'NAND':
                        filter_match = not (filter_match and current_filter_result)
                    elif filter_logic == 'NOR':
                        filter_match = not (filter_match or current_filter_result)
                    elif filter_logic == 'XOR':
                        filter_match = (filter_match != current_filter_result)
                    elif filter_logic == 'XNOR':
                        filter_match = (filter_match == current_filter_result)
                    elif filter_logic == 'NOT': # 後続のNOTは「AND NOT」として扱う
                        filter_match = filter_match and (not current_filter_result)
                
                if not filter_match: # 途中で条件を満たさなくなったらbreak
                    break
            
            if filter_match:
                is_triggered = True
                break # いずれかのメモが条件を満たせばトリガー発動

    return is_triggered

def evaluate_conditions(conditions_list, order_data, user_id, now_jst, current_time_str, current_day_of_week_jp, current_trigger_data=None):
    """
    カスタム命令の条件リストを評価する再帰関数。
    current_data は、トリガーによって得られた追加データ（例: 場所トリガーの位置情報、カレンダーイベントデータなど）。
    """
    if not conditions_list:
        return True # 条件がない場合は常にTrue

    overall_result = True
    previous_condition_result = None

    for i, condition in enumerate(conditions_list):
        condition_type = condition.get('type')
        condition_logic = condition.get('logic')
        expr = condition.get('expr')
        nested_conditions = condition.get('nested', [])
        nested_actions = condition.get('actions', []) # ネストされたアクション

        current_condition_result = False

        if condition_type == 'if':
            is_expr_met, evaluated_data = _evaluate_condition_expr(expr, user_id, now_jst, current_time_str, current_day_of_week_jp)
            if nested_conditions:
                # ネストされた条件も評価
                nested_conditions_met = evaluate_conditions(
                    nested_conditions, order_data, user_id, now_jst, current_time_str, current_day_of_week_jp, evaluated_data
                )
                current_condition_result = is_expr_met and nested_conditions_met
            else:
                current_condition_result = is_expr_met
            
            # ネストされたアクションのキューイング (条件が満たされた場合)
            if current_condition_result and nested_actions:
                for action in nested_actions:
                    action['scheduled_at'] = _calculate_action_execution_time(action.get('timing', {}), now_jst).isoformat()
                    action['triggered_at'] = now_jst.isoformat()
                    pending_action_service.add_pending_action(
                        user_id=user_id,
                        command_id=order_data.get('id'),
                        action_data=action
                    )
                    print(f"ネストアクションをpending_user_actionsに格納: {action.get('category')}:{action.get('sub')} (予定時刻: {action['scheduled_at']})")


        elif condition_type == 'else':
            if i == 0 or previous_condition_result is None:
                # else が最初の条件ブロックであるか、前の条件結果が不明な場合はエラーまたは無視
                print("WARNING: 'else' condition found at the beginning or without previous 'if'. Skipping.")
                current_condition_result = False
            else:
                # 前の条件が満たされなかった場合にelseがTrue
                current_condition_result = not previous_condition_result
            
            # else の内部にもネストされた条件やアクションがある場合を考慮
            if nested_conditions:
                nested_conditions_met = evaluate_conditions(
                    nested_conditions, order_data, user_id, now_jst, current_time_str, current_day_of_week_jp, current_trigger_data
                )
                current_condition_result = current_condition_result and nested_conditions_met
            
            # ネストされたアクションのキューイング (条件が満たされた場合)
            if current_condition_result and nested_actions:
                for action in nested_actions:
                    action['scheduled_at'] = _calculate_action_execution_time(action.get('timing', {}), now_jst).isoformat()
                    action['triggered_at'] = now_jst.isoformat()
                    pending_action_service.add_pending_action(
                        user_id=user_id,
                        command_id=order_data.get('id'),
                        action_data=action
                    )
                    print(f"ネストアクションをpending_user_actionsに格納 (else): {action.get('category')}:{action.get('sub')} (予定時刻: {action['scheduled_at']})")


        # 論理演算子の適用
        if i == 0: # 最初の条件
            overall_result = current_condition_result
        else:
            if condition_logic == 'AND':
                overall_result = overall_result and current_condition_result
            elif condition_logic == 'OR':
                overall_result = overall_result or current_condition_result
            elif condition_logic == 'NOT': # NOTは前の結果を反転させてANDで結合
                overall_result = overall_result and (not current_condition_result)
            elif condition_logic == 'NAND':
                overall_result = not (overall_result and current_condition_result)
            elif condition_logic == 'NOR':
                overall_result = not (overall_result or current_condition_result)
            elif condition_logic == 'XOR':
                overall_result = (overall_result != current_condition_result)
            elif condition_logic == 'XNOR':
                overall_result = (overall_result == current_condition_result)
        
        previous_condition_result = current_condition_result # 次のelseのために結果を保存

    return overall_result

def evaluate_triggers(): # appインスタンスを受け取らないように修正
    # ここで直接 current_app を使うと、RuntimeError になる可能性があるので
    # 呼び出し元で app_context を管理する必要がある
    print(f"[{datetime.now()}] Evaluating triggers (inside evaluator)...")
    
    # Supabaseからすべてのカスタム命令を取得
    response = supabase.table('custom_orders').select('id, user_id, order_data').execute()
    orders = response.data
    
    if not orders:
        print("No custom orders found.")
        return

    # 日本時間 (JST) を取得
    # pytz.timezone('Asia/Tokyo')をJSTに変更
    now_jst = datetime.now(JST)
    current_time_str = now_jst.strftime('%H:%M')
    current_day_of_week = now_jst.strftime('%a') # 'Mon', 'Tue', ...

    day_mapping = {
        'Mon': '月', 'Tue': '火', 'Wed': '水', 'Thu': '木',
        'Fri': '金', 'Sat': '土', 'Sun': '日'
    }
    current_day_of_week_jp = day_mapping.get(current_day_of_week, '')

    pending_actions_table_name = _ensure_pending_actions_table_exists()
    
    for order in orders:
        command_id = order.get('id')
        user_id = order.get('user_id')
        order_data = order.get('order_data')
        # order_data が None の場合も考慮
        if not order_data:
            print(f"WARN: Command ID={command_id} に order_data が定義されていません。スキップします。")
            continue

        # trigger の取得と None チェック
        trigger = order_data.get('triggers')[0] if order_data.get('triggers') else None 
        if trigger is None:
            print(f"WARN: Command ID={command_id} にトリガーが定義されていません。スキップします。")
            continue

        # trigger_category の取得と None チェック
        trigger_category = trigger.get('category')
        if trigger_category is None:
            print(f"WARN: Command ID={command_id} のトリガーカテゴリが定義されていません。スキップします。")
            continue
        
        is_triggered = False
        current_trigger_data = {} # トリガーから得られたデータ（条件判定で使う可能性）
        
        # 各トリガーヘルパー関数に渡す前に、trigger_value の存在チェックを追加
        trigger_value = trigger.get('value')
        if trigger_value is None:
            print(f"WARN: Command ID={command_id} のトリガー ({trigger_category}) に value が定義されていません。スキップします。")
            continue

        if trigger_category == '時間':
            is_triggered = _evaluate_time_trigger(trigger, now_jst, current_time_str, current_day_of_week_jp)
        elif trigger_category == '場所':
            pass # evaluate_location_triggers はWebhookから呼ばれるため、ここでは直接評価しない
        elif trigger_category == 'カレンダー':
            is_triggered = _evaluate_calendar_trigger(order, user_id, now_jst, current_time_str, current_day_of_week_jp)
        elif trigger_category == '収支管理':
            is_triggered = _evaluate_finance_trigger(order, user_id)
        elif trigger_category == 'メモ':
            is_triggered = _evaluate_memo_trigger(order, user_id)
        
        if is_triggered:
            print(f"トリガー発動: Command ID={command_id}, User ID={user_id}, Trigger Type={trigger_category}")
            
            # 条件判定ロジック
            conditions_list = order_data.get('conditions', [])
            conditions_met = evaluate_conditions(conditions_list, order_data, user_id, now_jst, current_time_str, current_day_of_week_jp, current_trigger_data)

            if conditions_met:
                # アクションをpending_user_actionsに格納
                actions_to_execute = order_data.get('actions', [])
                
                for action in actions_to_execute:
                    action['scheduled_at'] = _calculate_action_execution_time(action.get('timing', {}), now_jst).isoformat()
                    action['triggered_at'] = now_jst.isoformat()
                    pending_action_service.add_pending_action(
                        user_id=user_id,
                        command_id=command_id,
                        action_data=action
                    )
                    print(f"アクションをpending_user_actionsに格納: {action.get('category')}:{action.get('sub')} (予定時刻: {action['scheduled_at']})")

# Haversine距離計算関数 (2点間の距離をメートルで計算)
def haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371000  # 地球の半径 (メートル)

    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])

    dlon = lon2 - lon1
    dlat = lat2 - lat1

    a = sin(dlat / 2)**2 + cos(lat1) * cos(lat2) * sin(dlon / 2)**2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))

    distance = R * c
    return distance

def _evaluate_condition_expr(expr, user_id, now_jst, current_time_str, current_day_of_week_jp):
    """条件の 'expr' 部分を評価するヘルパー関数 (トリガー評価ロジックを流用)"""
    if not expr or not expr.get('category'):
        return False, {{}} # exprがないか、カテゴリがない場合は評価できない

    expr_category = expr.get('category')
    
    # 評価のためにダミーのorder_dataを構築
    dummy_order = {
        'order_data': {
            'trigger': expr # exprをトリガーと見立てて評価
        }
    }
    
    is_expr_met = False
    evaluated_data = {{}} # 評価結果から得られるデータ（例: 財務値、イベントリストなど）

    if expr_category == '時間':
        is_expr_met = _evaluate_time_trigger(dummy_order, now_jst, current_time_str, current_day_of_week_jp)
    elif expr_category == '場所':
        # 条件の場所は、現在のユーザー位置情報と比較する必要がある
        # current_data に現在の位置情報があることを期待
        # TODO: current_data から位置情報を取得し、haversine_distance を使用
        pass
    elif expr_category == 'カレンダー':
        is_expr_met = _evaluate_calendar_trigger(dummy_order, user_id, now_jst, current_time_str, current_day_of_week_jp)
        # TODO: evaluated_data には、合致したイベント情報などを含める
    elif expr_category == '収支管理':
        is_expr_met = _evaluate_finance_trigger(dummy_order, user_id)
        # TODO: evaluated_data には、現在の財務値などを含める
    elif expr_category == 'メモ':
        is_expr_met = _evaluate_memo_trigger(dummy_order, user_id)
        # TODO: evaluated_data には、合致したメモ情報などを含める

    return is_expr_met, evaluated_data

def evaluate_location_triggers(app, user_id, current_latitude, current_longitude):
    """
    ユーザーの位置情報に基づいて場所トリガーを評価し、アクションをキューに格納する。
    Webhookから呼び出されることを想定。
    """
    with app.app_context():
        print(f"[{datetime.now()}] Evaluating location triggers for user {user_id} at ({current_latitude}, {current_longitude})...")
        try:
            # ユーザーの場所トリガーを持つカスタム命令のみを取得
            response = supabase.table('custom_orders') \
                .select('id, user_id, order_data') \
                .eq('user_id', user_id) \
                .contains('order_data', {'trigger': {'category': '場所'}}) \
                .execute()
            orders = response.data

            if not orders:
                print(f"No location-based custom orders found for user {user_id}.")
                return

            for order in orders:
                order_data = order.get('order_data')
                command_id = order.get('id')
                trigger = order_data.get('trigger')

                if trigger and trigger.get('category') == '場所':
                    trigger_value = trigger.get('value')
                    
                    target_latitude = float(trigger_value.get('latitude'))
                    target_longitude = float(trigger_value.get('longitude'))
                    allowed_range = float(trigger_value.get('range', 1000)) # デフォルト1000m

                    distance = haversine_distance(current_latitude, current_longitude, target_latitude, target_longitude)
                    
                    if distance <= allowed_range:
                        print(f"場所トリガー発動: Command ID={command_id}, User ID={user_id}, Distance={distance:.2f}m (Allowed: {allowed_range}m)")

                        # TODO: ここに条件判定ロジックを実装
                        conditions_met = True # 現時点では条件を常に満たすとする

                        if conditions_met:
                            actions_to_execute = order_data.get('actions', [])
                            for action in actions_to_execute:
                                action['scheduled_at'] = _calculate_action_execution_time(action.get('timing', {}), now_jst).isoformat()
                                action['triggered_at'] = now_jst.isoformat()
                                pending_action_service.add_pending_action(
                                    user_id=user_id,
                                    command_id=command_id,
                                    action_data=action
                                )
                                print(f"アクションをpending_user_actionsに格納 (場所トリガー): {action.get('category')}:{action.get('sub')} (予定時刻: {action['scheduled_at']})")
                    else:
                        print(f"場所トリガー未発動: Command ID={command_id}, User ID={user_id}, Distance={distance:.2f}m (Allowed: {allowed_range}m)")

        except Exception as e:
            print(f"Error evaluating location triggers: {e}")