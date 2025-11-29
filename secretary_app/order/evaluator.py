# C:\Users\y_oota\Documents\secretary_app\secretary_app\order\evaluator.py
from supabase_client import supabase
from datetime import datetime, timedelta
import pytz
from services.ScheduleManager import ScheduleManager # ScheduleManagerをインポート

# タイムゾーン設定
JST = pytz.timezone('Asia/Tokyo')

def _evaluate_time_trigger(trigger, now_jst, current_time_str, current_day_of_week_jp):
    """
    時間トリガーが発動条件を満たしているか評価する。
    （この関数は変更なし）
    """
    trigger_value = trigger.get('value')
    if not trigger_value:
        return False

    trigger_year = trigger_value.get('year')
    trigger_month = trigger_value.get('month')
    trigger_day = trigger_value.get('day')
    trigger_day_of_week = trigger_value.get('day_of_week')
    trigger_time_start = trigger_value.get('time_start')

    time_match = (trigger_time_start == current_time_str)

    if trigger_year and trigger_month and trigger_day:
        try:
            trigger_date = datetime(int(trigger_year), int(trigger_month), int(trigger_day)).date()
            date_match = (trigger_date == now_jst.date())
        except (ValueError, TypeError):
            date_match = False
    else:
        date_match = True

    if trigger_day_of_week:
        day_of_week_match = (current_day_of_week_jp in trigger_day_of_week)
    else:
        day_of_week_match = True
    
    return time_match and date_match and day_of_week_match


def evaluate_triggers(app_logger):
    """
    毎分実行され、トリガーを評価し、ディスパッチすべきコマンドのリストを返す。
    Returns:
        list: [(user_id, order_data), ...]
    """
    app_logger.debug(f"[{datetime.now()}] Evaluating triggers...")
    
    dispatch_list = []
    sm = ScheduleManager() # ScheduleManagerのインスタンスを作成

    try:
        # Supabaseからすべてのカスタム命令を取得
        response = supabase.table('custom_orders').select('id, user_id, order_data').execute()
        orders = response.data
    except Exception as e:
        app_logger.error(f"Error fetching custom orders from Supabase: {e}")
        return dispatch_list
    
    if not orders:
        app_logger.debug("No custom orders found.")
        return dispatch_list

    # 現在時刻の準備
    now_jst = datetime.now(JST)
    current_time_str = now_jst.strftime('%H:%M')
    day_mapping = {'Mon': '月', 'Tue': '火', 'Wed': '水', 'Thu': '木', 'Fri': '金', 'Sat': '土', 'Sun': '日'}
    current_day_of_week_jp = day_mapping.get(now_jst.strftime('%a'), '')

    for order in orders:
        user_id = order.get('user_id')
        order_data = order.get('order_data')
        
        if not order_data or not order_data.get('triggers'):
            continue

        trigger = order_data['triggers'][0]
        trigger_category = trigger.get('category')

        is_triggered = False
        if trigger_category == '時間':
            is_triggered = _evaluate_time_trigger(trigger, now_jst, current_time_str, current_day_of_week_jp)
        
        if is_triggered:
            app_logger.debug(f"Trigger activated for user {user_id}. Processing actions...")
            app_logger.debug(f"DEBUG: Actions in order_data before processing: {order_data.get('actions', [])}")
            # アクションを処理してカレンダーイベントの詳細を注入
            modified_actions = []
            for action in order_data.get('actions', []):
                if action.get('category') == 'カレンダー' and action.get('sub') == '読み上げ':
                    # ここでカレンダーイベントを取得し、詳細をアクションに注入
                    try:
                        # 今日のイベントを取得
                        today_start = now_jst.replace(hour=0, minute=0, second=0, microsecond=0)
                        today_end = now_jst.replace(hour=23, minute=59, second=59, microsecond=999999)
                        
                        app_logger.debug(f"Calling list_events for user {user_id} from {today_start.isoformat()} to {today_end.isoformat()}")
                        events = sm.list_events(
                            user_id=user_id,
                            time_min=today_start.isoformat(),
                            time_max=today_end.isoformat()
                        )
                        app_logger.debug(f"list_events returned {len(events)} events.")
                        # app_logger.debug(f"Events details: {events}") # イベントが多数ある場合はコメントアウト

                        if events:
                            # 今日の一番近い（まだ始まっていないか、始まったばかりの）イベントを探す
                            upcoming_events = [e for e in events if datetime.fromisoformat(e['start']['dateTime']).astimezone(JST) >= now_jst]
                            
                            event = None
                            if upcoming_events:
                                event = upcoming_events[0] # 最も近い将来のイベント
                                app_logger.debug(f"Found upcoming event: {event.get('summary')}")
                            elif events: # 過ぎたイベントでもとりあえず表示
                                event = events[0]
                                app_logger.debug(f"No upcoming events, using first event: {event.get('summary')}")

                            if event:
                                action['detail']['summary'] = event.get('summary', '名称未設定イベント')
                                action['detail']['start_time'] = datetime.fromisoformat(event['start']['dateTime']).astimezone(JST).strftime('%H:%M')
                                action['detail']['end_time'] = datetime.fromisoformat(event['end']['dateTime']).astimezone(JST).strftime('%H:%M')
                                action['detail']['start_day'] = datetime.fromisoformat(event['start']['dateTime']).astimezone(JST).strftime('%Y年%m月%d日')
                                action['detail']['end_day'] = datetime.fromisoformat(event['end']['dateTime']).astimezone(JST).strftime('%Y年%m月%d日')
                                action['detail']['event_link'] = event.get('htmlLink')
                                app_logger.debug(f"Injected calendar event details: summary={action['detail']['summary']}, start_time={action['detail']['start_time']}")
                            else:
                                action['detail']['summary'] = '今日の予定はありません'
                                action['detail']['start_time'] = ''
                                action['detail']['end_time'] = ''
                                action['detail']['start_day'] = ''
                                action['detail']['end_day'] = ''
                                action['detail']['event_link'] = ''
                                app_logger.debug("No relevant calendar events found for today.")
                        else:
                            action['detail']['summary'] = '今日の予定はありません'
                            action['detail']['start_time'] = ''
                            action['detail']['end_time'] = ''
                            action['detail']['start_day'] = ''
                            action['detail']['end_day'] = ''
                            action['detail']['event_link'] = ''
                            app_logger.debug("No calendar events found for today.")
                    except RuntimeError as e:
                        app_logger.error(f"User {user_id} not authenticated for Google Calendar: {e}")
                        action['detail']['summary'] = 'Googleカレンダーが認証されていません。'
                        action['detail']['start_time'] = ''
                        action['detail']['end_time'] = ''
                        action['detail']['start_day'] = ''
                        action['detail']['end_day'] = ''
                        action['detail']['event_link'] = ''
                    except Exception as e:
                        app_logger.error(f"Error fetching calendar events for user {user_id}: {e}")
                        action['detail']['summary'] = 'カレンダー情報の取得中にエラーが発生しました。'
                        action['detail']['start_time'] = ''
                        action['detail']['end_time'] = ''
                        action['detail']['start_day'] = ''
                        action['detail']['end_day'] = ''
                        action['detail']['event_link'] = ''
                modified_actions.append(action)
            
            # 修正されたアクションでorder_dataを更新
            order_data['actions'] = modified_actions
            dispatch_list.append((user_id, order_data))
    
    return dispatch_list
