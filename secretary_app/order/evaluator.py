# order/evaluator.py
from supabase_client import supabase
from datetime import datetime
import pytz
from services import local_calendar_service
from services.finance_service import get_all_finance_records

# タイムゾーン設定
JST = pytz.timezone('Asia/Tokyo')

def _evaluate_time_trigger(trigger, now_jst, current_time_str, current_day_of_week_jp):
    # 時間トリガーの評価
    trigger_value = trigger.get('value')
    if not trigger_value:
        return False

def _collect_actions_from_condition(condition):
    actions = []
    if not isinstance(condition, dict):
        return actions
    actions.extend(condition.get('actions', []) or [])
    for nested in condition.get('nested', []) or []:
        actions.extend(_collect_actions_from_condition(nested))
    return actions


def _collect_actions_from_steps(steps):
    actions = []
    if not isinstance(steps, list):
        return actions
    for step in steps:
        if not isinstance(step, dict):
            continue
        if step.get('kind') == 'action' or step.get('type') == 'action':
            action = step.get('action') or (step if step.get('category') else None)
            if action:
                actions.append(action)
            continue
        if step.get('kind') == 'condition' or step.get('type') == 'condition' or step.get('expr') or step.get('type') in ('if', 'else'):
            condition = step.get('condition') or step
            actions.extend(_collect_actions_from_condition(condition))
    return actions


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
    # 毎分のトリガー評価
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
            steps = order_data.get('steps')
            actions_to_process = []
            if isinstance(steps, list) and steps:
                actions_to_process = _collect_actions_from_steps(steps)
                app_logger.debug(f"DEBUG: Actions in order_data steps before processing: {actions_to_process}")
            else:
                actions_to_process.extend(order_data.get('actions', []) or [])
                for condition in order_data.get('conditions', []) or []:
                    actions_to_process.extend(_collect_actions_from_condition(condition))
                app_logger.debug(f"DEBUG: Actions in order_data before processing: {actions_to_process}")

            modified_actions = []

            for action in actions_to_process:
                if not isinstance(action, dict):
                    continue
                if action.get('category') == '?????' and action.get('sub') == '????':
                    try:
                        today_start = now_jst.replace(hour=0, minute=0, second=0, microsecond=0)
                        today_end = now_jst.replace(hour=23, minute=59, second=59, microsecond=999999)

                        events = local_calendar_service.get_events(user_id, today_start.isoformat(), today_end.isoformat())
                        app_logger.debug(f"list_events returned {len(events)} events.")

                        if events:
                            event_items = []
                            for e in events:
                                try:
                                    start_dt = datetime.fromisoformat(e['start_time']).astimezone(JST)
                                    end_dt = datetime.fromisoformat(e['end_time']).astimezone(JST)
                                    event_items.append({
                                        'summary': e.get('title', '??'),
                                        'start_time': start_dt.strftime('%H:%M'),
                                        'end_time': end_dt.strftime('%H:%M'),
                                        'start_day': f"{start_dt.year}?{start_dt.month}?{start_dt.day}?",
                                        'end_day': f"{end_dt.year}?{end_dt.month}?{end_dt.day}?",
                                        'event_link': None
                                    })
                                except Exception as err:
                                    app_logger.debug(f"Failed to parse event for read aloud: {err}")

                            if event_items:
                                action.setdefault('detail', {})['events'] = event_items
                                action['detail'].update(event_items[0])
                                action['detail']['summary'] = event_items[0]['summary']
                                app_logger.debug(f"Injected calendar event details: count={len(event_items)}")
                            else:
                                action.setdefault('detail', {})['summary'] = '???????????'
                        else:
                            action.setdefault('detail', {})['summary'] = '???????????'
                    except Exception as e:
                        app_logger.error(f"Error processing calendar action for user {user_id}: {e}")
                        action.setdefault('detail', {})['summary'] = '????????????????????'

                elif action.get('category') == '????' and action.get('sub') == '????':
                    try:
                        format_type = action.get('detail', {}).get('format')
                        app_logger.debug(f"Processing finance action for format: {format_type}")

                        all_records = get_all_finance_records(user_id)
                        income_total = sum(r.get('amount', 0) for r in all_records if r.get('type') == 'income')
                        expense_total = sum(r.get('amount', 0) for r in all_records if r.get('type') == 'expense')
                        balance = income_total - expense_total

                        if format_type == 'individual':
                            action.setdefault('detail', {})['records'] = all_records
                            app_logger.debug(f"Injected {len(all_records)} individual finance records.")
                        else:
                            detail = action.setdefault('detail', {})
                            detail['income_total'] = income_total
                            detail['expense_total'] = expense_total
                            detail['balance'] = balance
                            app_logger.debug(
                                f"Injected finance summary: income={income_total}, expense={expense_total}, balance={balance}"
                            )
                    except Exception as e:
                        app_logger.error(f"Error processing finance action for user {user_id}: {e}", exc_info=True)
                        action.setdefault('detail', {})['error'] = '?????????????????'

                modified_actions.append(action)

            if not (isinstance(steps, list) and steps):
                order_data['actions'] = modified_actions
            dispatch_list.append((user_id, order_data))

    return dispatch_list