from supabase_client import supabase
from datetime import datetime
import json
import pytz
# from flask import current_app # current_app をインポート

# Supabaseにpending_user_actionsテーブルが存在しない場合に作成を試みる
# この処理はアプリケーション起動時に一度だけ実行されるべきだが、
# ジョブ内で初回実行時にチェックする形にする
def _ensure_pending_actions_table_exists():
    # 実際にはSupabaseのSDKでテーブルの存在チェックや作成は直接できないので、
    # insert/selectが失敗しないことを期待するか、事前に手動で作成する
    # ここでは便宜上、テーブル名を返すだけにする
    return 'pending_user_actions'

def evaluate_triggers(): # appインスタンスを受け取らないように修正
    # ここで直接 current_app を使うと、RuntimeError になる可能性があるので
    # 呼び出し元で app_context を管理する必要がある
    print(f"[{datetime.now()}] Evaluating triggers (inside evaluator)...")
    
    try:
        # Supabaseからすべてのカスタム命令を取得
        response = supabase.table('custom_orders').select('id, user_id, order_data').execute()
        orders = response.data
        
        if not orders:
            print("No custom orders found.")
            return

        # 日本時間 (JST) を取得
        jst = pytz.timezone('Asia/Tokyo')
        now_jst = datetime.now(jst)
        current_time_str = now_jst.strftime('%H:%M')
        current_day_of_week = now_jst.strftime('%a') # 'Mon', 'Tue', ...

        day_mapping = {
            'Mon': '月', 'Tue': '火', 'Wed': '水', 'Thu': '木',
            'Fri': '金', 'Sat': '土', 'Sun': '日'
        }
        current_day_of_week_jp = day_mapping.get(current_day_of_week, '')

        pending_actions_table_name = _ensure_pending_actions_table_exists()
        
        for order in orders:
            order_data = order.get('order_data')
            user_id = order.get('user_id')
            command_id = order.get('id')

            if not order_data or not user_id:
                continue

            trigger = order_data.get('trigger')
            
            # ここからトリガーの評価ロジックを汎用化
            is_triggered = False
            trigger_type = trigger.get('category') # app.py -> evaluate_time_triggers
            
            if trigger_type == '時間': # 以前の 'time' トリガー
                if trigger.get('value') and trigger.get('value').get('time_start') == current_time_str:
                    # 曜日が指定されている場合はチェック
                    if trigger.get('value').get('day_of_week'):
                        if current_day_of_week_jp in trigger.get('value').get('day_of_week'):
                            is_triggered = True
                    else: # 曜日指定がない場合は常にTrue
                        is_triggered = True
                
            # 他のトリガータイプ（場所、カレンダー、収支管理、メモなど）の評価ロジックを追加

            if is_triggered:
                print(f"トリガー発動: Command ID={command_id}, User ID={user_id}, Trigger Type={trigger_type}")
                
                # TODO: ここに条件判定ロジックを実装
                # 現時点では条件をスキップしてアクションをキューに入れる
                
                # アクションをpending_user_actionsに格納
                actions_to_execute = order_data.get('actions', [])
                
                for action in actions_to_execute:
                    # 実行すべきアクションデータを整形
                    action_record = {
                        'user_id': user_id,
                        'command_id': command_id, # どのコマンドのアクションか識別のため
                        'action_data': action, # アクションの詳細JSON
                        'status': 'pending',
                        'created_at': now_jst.isoformat(),
                    }
                    
                    # pending_user_actionsテーブルに挿入
                    insert_response = supabase.table(pending_actions_table_name).insert(action_record).execute()
                    if insert_response.data:
                        print(f"アクションをpending_user_actionsに格納: {action.get('category')}:{action.get('sub')}")
                    else:
                        print(f"アクション格納失敗: {insert_response.json()}")

    except Exception as e:
        print(f"Error evaluating triggers: {e}")
