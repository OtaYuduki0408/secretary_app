# order/evaluator.py
from supabase_client import supabase
from datetime import datetime
import pytz
from services import local_calendar_service
from services.finance_service import (
    get_all_finance_records,
    get_current_balance,
    get_monthly_expense,
    get_daily_expense,
    get_monthly_goal,
)

# タイムゾーン設定
JST = pytz.timezone('Asia/Tokyo')

def _evaluate_time_trigger(trigger, now_jst, current_time_str, current_day_of_week_jp, app_logger=None):
    # 時間トリガーの評価
    trigger_value = trigger.get('value')
    if not trigger_value:
        if app_logger:
            app_logger.debug("[TIME_TRIGGER] trigger_value is empty")
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

    if app_logger:
        app_logger.debug(
            f"[TIME_TRIGGER] now={now_jst.isoformat()} current_time={current_time_str} "
            f"trigger_time={trigger_time_start} time_match={time_match} "
            f"trigger_date={{'year':{trigger_year},'month':{trigger_month},'day':{trigger_day}}} date_match={date_match} "
            f"trigger_day_of_week={trigger_day_of_week} current_day_of_week={current_day_of_week_jp} day_match={day_of_week_match}"
        )

    return time_match and date_match and day_of_week_match


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


def _safe_int(value):
    if value is None:
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        raw = value.strip()
        if not raw or "実行された" in raw:
            return None
        if raw.isdigit():
            return int(raw)
    return None


def _safe_float(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        raw = value.strip()
        if not raw or "実行された" in raw:
            return None
        try:
            return float(raw)
        except ValueError:
            return None
    return None


def _normalize_jst(dt):
    if dt.tzinfo is None:
        return JST.localize(dt)
    return dt.astimezone(JST)


def _build_datetime_from_parts(year, month, day, time_str, default_dt):
    year_val = _safe_int(year) or default_dt.year
    month_val = _safe_int(month) or default_dt.month
    day_val = _safe_int(day) or default_dt.day
    hour_val = default_dt.hour
    minute_val = default_dt.minute
    if isinstance(time_str, str) and time_str.strip():
        try:
            parts = time_str.strip().split(":")
            if len(parts) >= 2:
                hour_val = int(parts[0])
                minute_val = int(parts[1])
        except (ValueError, TypeError):
            pass
    try:
        return JST.localize(datetime(year_val, month_val, day_val, hour_val, minute_val))
    except ValueError:
        return None


def _match_contains(text, keyword):
    if not keyword:
        return True
    if not text:
        return False
    return keyword.lower() in text.lower()


def _evaluate_calendar_time_trigger(trigger_value, now_jst, current_time_str, app_logger=None, user_id=None):
    title = (trigger_value or {}).get('title') or ''
    day_of_week = (trigger_value or {}).get('day_of_week') or []
    start_year = (trigger_value or {}).get('start_year')
    start_month = (trigger_value or {}).get('start_month')
    start_day = (trigger_value or {}).get('start_day')
    start_time = (trigger_value or {}).get('start_time')

    today_start = now_jst.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = now_jst.replace(hour=23, minute=59, second=59, microsecond=999999)
    events = local_calendar_service.get_events(user_id, today_start.isoformat(), today_end.isoformat())
    app_logger.debug(f"[CAL_TRIGGER_TIME] events={len(events)} user_id={user_id}")

    day_mapping = {'Mon': '月', 'Tue': '火', 'Wed': '水', 'Thu': '木', 'Fri': '金', 'Sat': '土', 'Sun': '日'}

    for e in events:
        try:
            event_start = _normalize_jst(datetime.fromisoformat(e['start_time']))
        except Exception:
            continue
        if event_start.strftime('%H:%M') != current_time_str:
            continue

        if title and not _match_contains(e.get('title', ''), title):
            continue

        if day_of_week:
            event_day = day_mapping.get(event_start.strftime('%a'), '')
            if event_day not in day_of_week:
                continue

        if _safe_int(start_year) and event_start.year != _safe_int(start_year):
            continue
        if _safe_int(start_month) and event_start.month != _safe_int(start_month):
            continue
        if _safe_int(start_day) and event_start.day != _safe_int(start_day):
            continue
        if isinstance(start_time, str) and start_time.strip():
            if event_start.strftime('%H:%M') != start_time.strip():
                continue

        app_logger.debug(f"[CAL_TRIGGER_TIME] matched event: {e.get('title')}")
        return True
    return False




def _get_finance_item_value(item, user_id, now_jst, app_logger=None):
    if item == 'total_balance':
        return get_current_balance(user_id)
    if item == 'remaining_to_target':
        goal = get_monthly_goal(user_id)
        goal_amount = (goal or {}).get('goal_amount')
        if goal_amount is None:
            return None
        current_balance = get_current_balance(user_id)
        return max(float(goal_amount) - float(current_balance), 0.0)
    if item == 'monthly_expense':
        return get_monthly_expense(user_id)
    if item == 'monthly_expense_no_necessities':
        if app_logger:
            app_logger.debug("[FIN_TRIGGER] monthly_expense_no_necessities: 必需品判定がないため月間支出を使用")
        return get_monthly_expense(user_id)
    if item == 'monthly_income':
        records = get_all_finance_records(user_id)
        current_month = now_jst.strftime('%Y-%m')
        return sum(
            r.get('amount', 0) for r in records
            if r.get('type') == 'income' and datetime.fromisoformat(r["date"]).strftime('%Y-%m') == current_month
        )
    if item == 'daily_expense':
        return get_daily_expense(user_id)
    if item == 'daily_expense_no_necessities':
        if app_logger:
            app_logger.debug("[FIN_TRIGGER] daily_expense_no_necessities: 必需品判定がないため日次支出を使用")
        return get_daily_expense(user_id)
    return None


def _evaluate_finance_threshold_trigger(trigger_value, now_jst, app_logger=None, user_id=None):
    item = (trigger_value or {}).get('item') or ''
    amount = _safe_float((trigger_value or {}).get('amount'))
    percentage = _safe_float((trigger_value or {}).get('percentage'))

    value = _get_finance_item_value(item, user_id, now_jst, app_logger)
    if value is None:
        app_logger.debug(f"[FIN_TRIGGER] value is None for item={item}")
        return False

    goal_amount = None
    if percentage is not None:
        goal = get_monthly_goal(user_id)
        goal_amount = (goal or {}).get('goal_amount')
        if goal_amount is None:
            app_logger.debug("[FIN_TRIGGER] percentage provided but goal_amount is None")
            return False

    triggered = False
    if item == 'remaining_to_target':
        if amount is not None:
            triggered = value <= amount
        elif percentage is not None and goal_amount is not None:
            threshold = float(goal_amount) * (percentage / 100.0)
            triggered = value <= threshold
    else:
        if amount is not None:
            triggered = value >= amount
        elif percentage is not None and goal_amount is not None:
            threshold = float(goal_amount) * (percentage / 100.0)
            triggered = value >= threshold

    app_logger.debug(
        f"[FIN_TRIGGER] item={item} value={value} amount={amount} percentage={percentage} triggered={triggered}"
    )
    return triggered


def evaluate_triggers(app_logger):
    # 定期的にトリガーを評価
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
        app_logger.debug(f"[ORDER] id={order.get('id')} user_id={order.get('user_id')}")
        app_logger.debug(f"[ORDER] order_data keys: {list(order_data.keys()) if isinstance(order_data, dict) else order_data}")

        if not order_data or not order_data.get('triggers'):
            continue

        trigger = order_data['triggers'][0]
        app_logger.debug(f"[TRIGGER] {trigger}")
        trigger_category = trigger.get('category')
        trigger_sub = trigger.get('sub')
        trigger_value = trigger.get('value') or {}

        should_fire = False
        if trigger_category == '時間':
            should_fire = _evaluate_time_trigger(trigger, now_jst, current_time_str, current_day_of_week_jp, app_logger)
        elif trigger_category == 'カレンダー' and trigger_sub == '予定の時間になったら':
            should_fire = _evaluate_calendar_time_trigger(trigger_value, now_jst, current_time_str, app_logger, user_id)
        elif trigger_category == '収支管理' and trigger_sub == '特定金額になったら':
            should_fire = _evaluate_finance_threshold_trigger(trigger_value, now_jst, app_logger, user_id)
        else:
            app_logger.debug(f"[TRIGGER] skip category={trigger_category} sub={trigger_sub}")
            continue

        if should_fire:
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
                if action.get('category') == 'カレンダー' and action.get('sub') == '読み上げ':
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
                                        'summary': e.get('title', '予定'),
                                        'start_time': start_dt.strftime('%H:%M'),
                                        'end_time': end_dt.strftime('%H:%M'),
                                        'start_day': f"{start_dt.year}年{start_dt.month}月{start_dt.day}日",
                                        'end_day': f"{end_dt.year}年{end_dt.month}月{end_dt.day}日",
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
                                action.setdefault('detail', {})['summary'] = '今日の予定はありません'
                        else:
                            action.setdefault('detail', {})['summary'] = '今日の予定はありません'
                    except Exception as e:
                        app_logger.error(f"Error processing calendar action for user {user_id}: {e}")
                        action.setdefault('detail', {})['summary'] = 'カレンダー読み上げの処理に失敗しました。'

                elif action.get('category') == '収支管理' and action.get('sub') == '読み上げ':
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
                        action.setdefault('detail', {})['error'] = '収支読み上げの処理に失敗しました。'

                modified_actions.append(action)

            if not (isinstance(steps, list) and steps):
                order_data['actions'] = modified_actions
            app_logger.debug(f"[DISPATCH] user_id={user_id} order_id={order.get('id')} actions={len(modified_actions)} steps_present={isinstance(steps, list) and bool(steps)}")
            dispatch_list.append((user_id, order_data))

    return dispatch_list
