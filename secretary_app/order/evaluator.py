# order/evaluator.py
import os
from supabase_client import supabase
from datetime import datetime
import pytz
from services import local_calendar_service
from services import switchbot_service
from services.finance_service import (
    get_all_finance_records,
    get_last_finance_error,
    get_current_balance,
    get_monthly_expense,
    get_daily_expense,
    get_monthly_goal,
)

# タイムゾーン設定
JST = pytz.timezone('Asia/Tokyo')
# Supabase障害時のフォールバック用キャッシュ
_CACHED_ORDERS = []
_CACHED_AT = None

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
    compare = (trigger_value or {}).get('compare') or 'gte'
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
    use_lte = compare == 'lte'
    if amount is not None:
        triggered = value <= amount if use_lte else value >= amount
    elif percentage is not None and goal_amount is not None:
        threshold = float(goal_amount) * (percentage / 100.0)
        triggered = value <= threshold if use_lte else value >= threshold

    app_logger.debug(
        f"[FIN_TRIGGER] item={item} compare={compare} value={value} amount={amount} percentage={percentage} triggered={triggered}"
    )
    return triggered


def _evaluate_finance_threshold_edge(trigger_value, now_jst, app_logger=None, user_id=None, order_data=None):
    item = (trigger_value or {}).get('item') or ''
    compare = (trigger_value or {}).get('compare') or 'gte'
    amount = _safe_float((trigger_value or {}).get('amount'))
    percentage = _safe_float((trigger_value or {}).get('percentage'))

    value = _get_finance_item_value(item, user_id, now_jst, app_logger)
    if value is None:
        app_logger.debug(f"[FIN_EDGE] value is None for item={item}")
        return False, False

    threshold = None
    if amount is not None:
        threshold = amount
    elif percentage is not None:
        goal = get_monthly_goal(user_id)
        goal_amount = (goal or {}).get('goal_amount')
        if goal_amount is None:
            app_logger.debug("[FIN_EDGE] percentage provided but goal_amount is None")
            return False, False
        threshold = float(goal_amount) * (percentage / 100.0)

    if threshold is None:
        app_logger.debug("[FIN_EDGE] threshold is None")
        return False, False

    is_over = value >= threshold if compare != 'lte' else value <= threshold

    trigger_states = {}
    if isinstance(order_data, dict):
        trigger_states = order_data.setdefault('trigger_states', {})
    finance_state = trigger_states.setdefault('finance_threshold', {})

    was_over = finance_state.get('last_over')
    state_changed = False
    should_fire = False

    if was_over is None:
        finance_state['last_over'] = is_over
        state_changed = True
    else:
        if was_over is False and is_over is True:
            should_fire = True
        if was_over != is_over:
            finance_state['last_over'] = is_over
            state_changed = True

    app_logger.debug(
        f"[FIN_EDGE] item={item} compare={compare} value={value} threshold={threshold} is_over={is_over} was_over={was_over} fire={should_fire}"
    )

    return should_fire, state_changed


def _extract_motion_detected(status_body):
    """SwitchBot人感センサーの状態を判定する。"""
    if not isinstance(status_body, dict):
        return None
    for key in [
        'motionDetected',
        'moveDetected',
        'detected',
        'isMotionDetected',
        'isDetected',
        'motion',
        'moving',
        'presence',
        'pir'
    ]:
        if key in status_body:
            value = status_body.get(key)
            if isinstance(value, bool):
                return value
            if isinstance(value, (int, float)):
                return value != 0
            if isinstance(value, str):
                normalized = value.strip().lower()
                if normalized in ('true', '1', 'yes', 'on', 'detected', 'motion'):
                    return True
                if normalized in ('false', '0', 'no', 'off', 'none', 'clear'):
                    return False

    status_text = status_body.get('status')
    if isinstance(status_text, str):
        normalized = status_text.strip().lower()
        if 'detect' in normalized or 'motion' in normalized:
            return True
        if normalized in ('normal', 'clear', 'no motion', 'inactive'):
            return False
    return None


def _extract_brightness(status_body):
    """SwitchBot人感センサーの明るさ状態を取得する。"""
    if not isinstance(status_body, dict):
        return None
    value = status_body.get('brightness')
    if not value:
        return None
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized == 'dim':
            return 'dark'
        if normalized in ('bright', 'dark'):
            return normalized
    return None


def _evaluate_switchbot_motion_edge(trigger_value, app_logger=None, order_data=None):
    """SwitchBot人感センサーの立ち上がり検知。"""
    device_id = (trigger_value or {}).get('device_id') or (trigger_value or {}).get('deviceId')
    if not device_id:
        if app_logger:
            app_logger.debug("[SWITCHBOT_TRIGGER] device_id is missing")
        return False, False

    brightness_condition = (trigger_value or {}).get('brightness_condition') or ''
    motion_condition = (trigger_value or {}).get('motion_condition') or ''

    api_token = os.getenv("SWITCHBOT_TOKEN")
    api_secret = os.getenv("SWITCHBOT_SECRET")
    if not api_token or not api_secret:
        if app_logger:
            app_logger.debug("[SWITCHBOT_TRIGGER] token or secret is missing")
        return False, False

    status = switchbot_service.get_device_status(api_token, api_secret, device_id)
    if not status or status.get('statusCode') != 100:
        if app_logger:
            app_logger.debug(f"[SWITCHBOT_TRIGGER] status fetch failed: {status}")
        return False, False

    body = status.get('body') or {}
    detected = _extract_motion_detected(body)
    brightness = _extract_brightness(body)

    state_message = f"[SWITCHBOT_TRIGGER] status device_id={device_id} detected={detected} brightness={brightness} raw={body}"
    # 以前のログ出力: print(state_message) と app_logger.debug(state_message) は削除されました。
    if detected is None:
        if app_logger:
            app_logger.debug(f"[SWITCHBOT_TRIGGER] motion detect field not found: {body}")
        return False, False

    trigger_states = {}
    if isinstance(order_data, dict):
        trigger_states = order_data.setdefault('trigger_states', {})
    switchbot_state = trigger_states.setdefault('switchbot_motion', {})
    state_key = f"{device_id}|{brightness_condition}|{motion_condition}"
    device_state = switchbot_state.setdefault(state_key, {})

    # 条件判定 (brightness/motion が指定されている場合のみ評価)
    motion_match = True
    if motion_condition == 'present':
        motion_match = detected is True
    elif motion_condition == 'absent':
        motion_match = detected is False

    brightness_match = True
    if brightness_condition == 'bright':
        brightness_match = brightness == 'bright'
    elif brightness_condition == 'dark':
        brightness_match = brightness == 'dark'

    current_match = motion_match and brightness_match
    was_match = device_state.get('last_match')
    should_fire = False
    state_changed = False

    if was_match is None:
        device_state['last_match'] = current_match
        state_changed = True
    else:
        if was_match is False and current_match is True:
            should_fire = True
        if was_match != current_match:
            device_state['last_match'] = current_match
            state_changed = True

    if app_logger:
        app_logger.debug(
            f"[SWITCHBOT_TRIGGER] device_id={device_id} brightness={brightness} detected={detected} "
            f"cond_brightness={brightness_condition} cond_motion={motion_condition} match={current_match} "
            f"was_match={was_match} fire={should_fire}"
        )

    return should_fire, state_changed


def evaluate_triggers(app_logger):
    # 定期的にトリガーを評価
    app_logger.debug(f"[{datetime.now()}] Evaluating triggers...")

    dispatch_list = []
    try:
        response = supabase.table('custom_orders').select('id, user_id, order_data').execute()
        orders = response.data
        if orders is not None:
            global _CACHED_ORDERS, _CACHED_AT
            _CACHED_ORDERS = orders
            _CACHED_AT = datetime.now()
    except Exception as e:
        app_logger.error(f"Error fetching custom orders from Supabase: {e}")
        if _CACHED_ORDERS:
            app_logger.debug(f"[CACHE] Using cached orders. cached_at={_CACHED_AT}")
            orders = _CACHED_ORDERS
        else:
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
        order_id = order.get('id')
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
            should_fire, state_changed = _evaluate_finance_threshold_edge(
                trigger_value, now_jst, app_logger, user_id, order_data
            )
            if state_changed and isinstance(order_data, dict) and order_id:
                try:
                    supabase.table('custom_orders').update({'order_data': order_data}).match({'id': order_id, 'user_id': user_id}).execute()
                    app_logger.debug(f"[FIN_EDGE] state updated for order_id={order_id}")
                except Exception as e:
                    app_logger.error(f"[FIN_EDGE] failed to update state: {e}")
        elif trigger_category == 'SwitchBot' and trigger_sub == '人感センサーが反応したら':
            should_fire, state_changed = _evaluate_switchbot_motion_edge(
                trigger_value, app_logger, order_data
            )
            if state_changed and isinstance(order_data, dict) and order_id:
                try:
                    supabase.table('custom_orders').update({'order_data': order_data}).match({'id': order_id, 'user_id': user_id}).execute()
                    app_logger.debug(f"[SWITCHBOT_TRIGGER] state updated for order_id={order_id}")
                except Exception as e:
                    app_logger.error(f"[SWITCHBOT_TRIGGER] failed to update state: {e}")
        else:
            app_logger.debug(f"[TRIGGER] skip category={trigger_category} sub={trigger_sub}")
            continue

        if should_fire:
            app_logger.debug(f"Trigger activated for user {user_id}. Processing actions...")
            try:
                steps = order_data.get("steps") or []
                actions = order_data.get("actions") or []
                step_summ = []
                for s in steps:
                    if not isinstance(s, dict):
                        continue
                    kind = s.get("kind", "action")
                    if kind == "action":
                        act = s.get("action", {}) or {}
                        step_summ.append(f"action:{act.get('category')}:{act.get('sub')}")
                    elif kind == "condition":
                        step_summ.append("condition")
                    else:
                        step_summ.append(kind)
                action_summ = [
                    f"{a.get('category')}:{a.get('sub')}" for a in actions if isinstance(a, dict)
                ]
                print(f"[TRIGGER_FIRE] user_id={user_id} steps={len(steps)} actions={len(actions)} step_list={step_summ} action_list={action_summ}")
            except Exception as e:
                print(f"[TRIGGER_FIRE] summary log failed: {e}")
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
                        finance_error = get_last_finance_error()
                        if finance_error:
                            action.setdefault('detail', {})['error'] = finance_error
                            app_logger.error(f"Finance data error for user {user_id}: {finance_error}")
                            modified_actions.append(action)
                            continue
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


def evaluate_switchbot_triggers(app_logger):
    """SwitchBot人感センサーのみを毎秒評価する。"""
    app_logger.debug(f"[{datetime.now()}] Evaluating SwitchBot triggers...")

    dispatch_list = []
    try:
        response = supabase.table('custom_orders').select('id, user_id, order_data').execute()
        orders = response.data
    except Exception as e:
        app_logger.error(f"Error fetching custom orders from Supabase: {e}")
        return dispatch_list

    if not orders:
        return dispatch_list

    for order in orders:
        user_id = order.get('user_id')
        order_data = order.get('order_data')
        order_id = order.get('id')

        if not order_data or not order_data.get('triggers'):
            continue

        trigger = order_data['triggers'][0]
        trigger_category = trigger.get('category')
        trigger_sub = trigger.get('sub')
        trigger_value = trigger.get('value') or {}

        if trigger_category != 'SwitchBot' or trigger_sub != '人感センサーが反応したら':
            continue

        scan_message = f"[SWITCHBOT_TRIGGER] scan start user_id={user_id} order_id={order_id} trigger={trigger}"
        should_fire, state_changed = _evaluate_switchbot_motion_edge(
            trigger_value, app_logger, order_data
        )
        if state_changed and isinstance(order_data, dict) and order_id:
            try:
                supabase.table('custom_orders').update({'order_data': order_data}).match({'id': order_id, 'user_id': user_id}).execute()
                app_logger.debug(f"[SWITCHBOT_TRIGGER] state updated for order_id={order_id}")
            except Exception as e:
                app_logger.error(f"[SWITCHBOT_TRIGGER] failed to update state: {e}")

        if not should_fire:
            continue

        app_logger.debug(f"[SWITCHBOT_TRIGGER] Trigger activated for user {user_id}. Processing actions...")
        steps = order_data.get('steps')
        actions_to_process = []
        if isinstance(steps, list) and steps:
            actions_to_process = _collect_actions_from_steps(steps)
            app_logger.debug(f"[SWITCHBOT_TRIGGER] Actions in order_data steps: {actions_to_process}")
        else:
            actions_to_process.extend(order_data.get('actions', []) or [])
            for condition in order_data.get('conditions', []) or []:
                actions_to_process.extend(_collect_actions_from_condition(condition))
            app_logger.debug(f"[SWITCHBOT_TRIGGER] Actions in order_data: {actions_to_process}")

        if not (isinstance(steps, list) and steps):
            order_data['actions'] = actions_to_process

        dispatch_list.append((user_id, order_data))

    return dispatch_list
