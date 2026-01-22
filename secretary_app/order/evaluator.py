# C:\Users\y_oota\Documents\secretary_app\secretary_app\order\evaluator.py
from supabase_client import supabase
from datetime import datetime, timedelta
import pytz
from services import local_calendar_service
from services.finance_service import get_finance_summary, get_all_finance_records

# タイムゾーン設定
JST = pytz.timezone('Asia/Tokyo')

def _evaluate_time_trigger(trigger, now_jst, current_time_str, current_day_of_week_jp):
    """
    時間トリガーが発動条件を満たしているか評価する。
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

    date_match = True
    if trigger_year and trigger_month and trigger_day:
        try:
            trigger_date = datetime(int(trigger_year), int(trigger_month), int(trigger_day)).date()
            date_match = (trigger_date == now_jst.date())
        except (ValueError, TypeError):
            date_match = False

    day_of_week_match = True
    if trigger_day_of_week:
        day_of_week_match = (current_day_of_week_jp in trigger_day_of_week)
    
    return time_match and date_match and day_of_week_match

def evaluate_triggers(app_logger):
    """
    毎分実行され、トリガーを評価し、ディスパッチすべきコマンドのリストを返す。
    """
    app_logger.debug(f"[{datetime.now()}] Evaluating triggers...")
    
    dispatch_list = []
    try:
        response = supabase.table('custom_orders').select('id, user_id, order_data').execute()
        orders = response.data
    except Exception as e:
        app_logger.error(f"Error fetching custom orders from Supabase: {e}")
        return dispatch_list
    
    if not orders:
        return dispatch_list

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
        if trigger.get('category') != '時間':
            continue

        if _evaluate_time_trigger(trigger, now_jst, current_time_str, current_day_of_week_jp):
            app_logger.debug(f"Trigger activated for user {user_id}. Processing actions...")
            app_logger.debug(f"DEBUG: Actions in order_data before processing: {order_data.get('actions', [])}")
            
            modified_actions = []
            finance_summary_calculated = False
            income_total, expense_total, balance = 0, 0, 0

            for action in order_data.get('actions', []):
                if action.get('category') == 'カレンダー' and action.get('sub') == '読み上げ':
                    try:
                        today_start = now_jst.replace(hour=0, minute=0, second=0, microsecond=0)
                        today_end = now_jst.replace(hour=23, minute=59, second=59, microsecond=999999)
                        
                        events = local_calendar_service.get_events(user_id, today_start.isoformat(), today_end.isoformat())
                        app_logger.debug(f"list_events returned {len(events)} events.")

                        if events:
                            upcoming_events = [e for e in events if datetime.fromisoformat(e['start_time']).astimezone(JST) >= now_jst]
                            event = upcoming_events[0] if upcoming_events else events[0]
                            
                            action['detail'].update({
                                'summary': event.get('title', '名称未設定イベント'),
                                'start_time': datetime.fromisoformat(event['start_time']).astimezone(JST).strftime('%H:%M'),
                                'end_time': datetime.fromisoformat(event['end_time']).astimezone(JST).strftime('%H:%M'),
                                'start_day': datetime.fromisoformat(event['start_time']).astimezone(JST).strftime('%Y年%m月%d日'),
                                'end_day': datetime.fromisoformat(event['end_time']).astimezone(JST).strftime('%Y年%m月%d日'),
                                'event_link': None
                            })
                            app_logger.debug(f"Injected calendar event details: summary={action['detail']['summary']}")
                        else:
                            action['detail']['summary'] = '今日の予定はありません'
                    except Exception as e:
                        app_logger.error(f"Error processing calendar action for user {user_id}: {e}")
                        action['detail']['summary'] = 'カレンダー情報の取得に失敗しました。'

                # elif action.get('category') == '収支管理' and action.get('sub') == '読み上げ':
                #     try:
                #         format_type = action['detail'].get('format')
                #         app_logger.debug(f"Processing finance action for format: {format_type}")

                #         if format_type == 'individual':
                #             all_records = get_all_finance_records(user_id)
                #             action['detail']['records'] = all_records
                #             app_logger.debug(f"Injected {len(all_records)} individual finance records.")
                        
                #         else: # income, expense, balance の場合
                #             if not finance_summary_calculated:
                #                 income_stats, expense_stats = get_finance_summary(user_id)
                #                 income_total = sum(item.get('amount', 0) for item in income_stats)
                #                 expense_total = sum(item.get('amount', 0) for item in expense_stats)
                #                 balance = income_total - expense_total
                #                 finance_summary_calculated = True
                #                 app_logger.debug(f"Calculated finance summary: income={income_total}, expense={expense_total}")
                            
                #             action['detail']['income_total'] = income_total
                #             action['detail']['expense_total'] = expense_total
                #             action['detail']['balance'] = balance
                #             app_logger.debug(f"Injected finance summary into action for format: {format_type}")

                #     except Exception as e:
                #         app_logger.error(f"Error processing finance action for user {user_id}: {e}", exc_info=True)
                #         try:
                #             # For debugging: Log the type and value of what get_finance_summary returns
                #             income_stats_debug, expense_stats_debug = get_finance_summary(user_id)
                #             app_logger.error(f"DEBUG_INFO: income_stats type={type(income_stats_debug)}, value={income_stats_debug}")
                #             app_logger.error(f"DEBUG_INFO: expense_stats type={type(expense_stats_debug)}, value={expense_stats_debug}")
                #         except Exception as debug_e:
                #             app_logger.error(f"DEBUG_INFO: Failed to even run get_finance_summary for debugging: {debug_e}")
                #         action['detail']['error'] = '収支情報の取得に失敗しました。'

                modified_actions.append(action)
            
            order_data['actions'] = modified_actions
            dispatch_list.append((user_id, order_data))
    
    return dispatch_list

