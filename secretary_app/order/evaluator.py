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
from services.memo_service import get_all_memos

# タイムゾーン設定
JST = pytz.timezone('Asia/Tokyo')

def _to_ascii(text):
    if text is None:
        return ""
    return str(text).strip().translate(str.maketrans("０１２３４５６７８９：", "0123456789:"))

def _normalize_time_hhmm(value):
    """
    時刻入力を HH:MM に正規化する。
    例: 9:0 / 09:00:00 / ９：００ -> 09:00
    """
    raw = _to_ascii(value)
    if not raw:
        return ""
    if raw in ("毎時", "x", "*"):
        return "毎時"
    parts = raw.split(":")
    if len(parts) < 2:
        return raw
    try:
        hour = int(parts[0])
        minute = int(parts[1])
    except ValueError:
        return raw
    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        return raw
    return f"{hour:02d}:{minute:02d}"

def _normalize_repeat_token(value, every_token):
    raw = _to_ascii(value)
    if not raw:
        return ""
    if raw in ("x", "*", every_token):
        return every_token
    return raw

def _try_int_text(value):
    try:
        return int(str(value))
    except (TypeError, ValueError):
        return None

def _safe_int(value):
    if value is None: return None
    if isinstance(value, int): return value
    if isinstance(value, float): return int(value)
    if isinstance(value, str):
        raw = value.strip()
        if not raw or "実行された" in raw: return None
        if raw.isdigit(): return int(raw)
    return None

def _normalize_jst(dt):
    if dt.tzinfo is None: return JST.localize(dt)
    return dt.astimezone(JST)

def _build_range_from_detail(detail, now_jst):
    detail = detail or {}
    start_year = _safe_int(detail.get('start_year')) or now_jst.year
    start_month = _safe_int(detail.get('start_month')) or now_jst.month
    start_day = _safe_int(detail.get('start_day')) or now_jst.day
    end_year = _safe_int(detail.get('end_year')) or now_jst.year
    end_month = _safe_int(detail.get('end_month')) or now_jst.month
    end_day = _safe_int(detail.get('end_day')) or now_jst.day
    
    start_time_str = detail.get('start_time', '00:00') or '00:00'
    end_time_str = detail.get('end_time', '23:59') or '23:59'

    try:
        start_hour, start_minute = map(int, start_time_str.split(':'))
        end_hour, end_minute = map(int, end_time_str.split(':'))
        start_dt = JST.localize(datetime(start_year, start_month, start_day, start_hour, start_minute))
        end_dt = JST.localize(datetime(end_year, end_month, end_day, end_hour, end_minute, 59))
        return start_dt, end_dt
    except (ValueError, TypeError):
        return None, None

def enrich_single_action(action, user_id, now_jst, app_logger):
    if not isinstance(action, dict): return action
    category, sub, detail = action.get('category'), action.get('sub'), action.get('detail', {})
    try:
        if category == 'カレンダー' and sub == '読み上げ':
            start_dt, end_dt = _build_range_from_detail(detail, now_jst)
            events = local_calendar_service.get_events(user_id, start_dt.isoformat() if start_dt else None, end_dt.isoformat() if end_dt else None)
            if events:
                detail['events'] = [{
                    'summary': e.get('title', '予定'), 'start_time': _normalize_jst(datetime.fromisoformat(e['start_time'])).strftime('%H:%M'),
                    'end_time': _normalize_jst(datetime.fromisoformat(e['end_time'])).strftime('%H:%M'),
                    'start_day': f"{_normalize_jst(datetime.fromisoformat(e['start_time'])).strftime('%Y年%m月%d日')}",
                } for e in events]
            else:
                detail['summary'] = '該当期間に予定はありません'
        elif category == '収支管理' and sub == '読み上げ':
            records = get_all_finance_records(user_id)
            if get_last_finance_error(): detail['error'] = get_last_finance_error()
            else:
                start_dt, end_dt = _build_range_from_detail(detail, now_jst)
                filtered = [r for r in records if start_dt <= _normalize_jst(datetime.fromisoformat(r['date'])) <= end_dt] if start_dt and end_dt else records
                detail.update({
                    'income_total': sum(r['amount'] for r in filtered if r['type'] == 'income'),
                    'expense_total': sum(r['amount'] for r in filtered if r['type'] == 'expense'),
                    'balance': sum(r['amount'] * (1 if r['type'] == 'income' else -1) for r in filtered),
                    'records': filtered if detail.get('format') == 'individual' else [],
                })
        elif category == 'メモ' and sub == '読み上げ':
            start_dt, end_dt = _build_range_from_detail(detail, now_jst)
            memos = get_all_memos(user_id, title=detail.get('title',''), content=detail.get('word',''), start_date=start_dt.isoformat() if start_dt else '', end_date=end_dt.isoformat() if end_dt else '')
            if isinstance(memos, dict) and memos.get('error'): detail['content'] = 'メモの取得に失敗'
            elif not memos: detail['content'] = '該当するメモは見つかりませんでした。'
            else: detail['content'] = "。 ".join([f"タイトル: {m.get('title', '無題')}, 内容: {m.get('content', 'なし')}" for m in memos[:5]])
    except Exception as e:
        app_logger.error(f"Error enriching action: {e}", exc_info=True)
        detail['error'] = 'アクションの準備中にエラーが発生しました。'
    action['detail'] = detail
    return action

def _evaluate_time_trigger(trigger, now_jst, current_time_str, current_day_of_week_jp, app_logger=None):
    trigger_value = trigger.get('value')
    if not trigger_value:
        return False

    if app_logger:
        app_logger.debug(f"[DEBUG_EVAL] _evaluate_time_trigger called. Current time: {current_time_str}, Day: {current_day_of_week_jp}. Trigger value: {trigger_value}")

    # 1. 時刻のチェック
    trigger_time = _normalize_time_hhmm(trigger_value.get('time'))
    current_time = _normalize_time_hhmm(current_time_str)
    if trigger_time and trigger_time != '毎時' and trigger_time != current_time:
        if app_logger:
            app_logger.debug(f"[DEBUG_EVAL] Time mismatch. Trigger: '{trigger_time}', Current: '{current_time}'.")
        return False

    # 2. 曜日のチェック
    trigger_dow = trigger_value.get('day_of_week')
    if isinstance(trigger_dow, str):
        trigger_dow = [d.strip() for d in trigger_dow.split(',') if d.strip()]
    if trigger_dow:
        normalized_dow = [str(d).strip() for d in trigger_dow if str(d).strip()]
        if '毎日' not in normalized_dow and current_day_of_week_jp not in normalized_dow:
            if app_logger:
                app_logger.debug(f"[DEBUG_EVAL] Day of week mismatch. Trigger: {normalized_dow}, Current: '{current_day_of_week_jp}'.")
            return False

    # 3. 日のチェック
    trigger_day = _normalize_repeat_token(trigger_value.get('day'), '毎日')
    if trigger_day and trigger_day != '毎日':
        trigger_day_int = _try_int_text(trigger_day)
        if trigger_day_int is None or now_jst.day != trigger_day_int:
            if app_logger:
                app_logger.debug(f"[DEBUG_EVAL] Day mismatch. Trigger: '{trigger_day}', Current: '{now_jst.day}'.")
            return False

    # 4. 月のチェック
    trigger_month = _normalize_repeat_token(trigger_value.get('month'), '毎月')
    if trigger_month and trigger_month != '毎月':
        trigger_month_int = _try_int_text(trigger_month)
        if trigger_month_int is None or now_jst.month != trigger_month_int:
            if app_logger:
                app_logger.debug(f"[DEBUG_EVAL] Month mismatch. Trigger: '{trigger_month}', Current: '{now_jst.month}'.")
            return False

    # 5. 年のチェック
    trigger_year = _normalize_repeat_token(trigger_value.get('year'), '毎年')
    if trigger_year and trigger_year != '毎年':
        trigger_year_int = _try_int_text(trigger_year)
        if trigger_year_int is None or now_jst.year != trigger_year_int:
            if app_logger:
                app_logger.debug(f"[DEBUG_EVAL] Year mismatch. Trigger: '{trigger_year}', Current: '{now_jst.year}'.")
            return False

    if app_logger:
        app_logger.debug(f"[DEBUG_EVAL] SUCCESS: Time trigger matched for value: {trigger_value}")
    return True

def evaluate_triggers(app_logger):
    app_logger.debug(f"--- [EVAL_TRIG] START: Evaluating triggers at {datetime.now(JST)} ---")
    dispatch_list = []
    try:
        response = supabase.table('custom_orders').select('id, user_id, order_data').execute()
        orders = response.data
        app_logger.debug(f"[EVAL_TRIG] Fetched {len(orders)} orders from Supabase.")
    except Exception as e:
        app_logger.error(f"!!! [EVAL_TRIG] Error fetching custom orders from Supabase: {e}", exc_info=True)
        orders = []

    if not orders:
        app_logger.debug("[EVAL_TRIG] No orders found. Exiting.")
        return dispatch_list

    now_jst = datetime.now(JST)
    current_time_str = now_jst.strftime('%H:%M')
    # ロケール依存のstrftime('%a')を使わず、曜日を安定して算出する
    current_day_of_week_jp = ['月', '火', '水', '木', '金', '土', '日'][now_jst.weekday()]

    for order in orders:
        user_id, order_data, order_id = order.get('user_id'), order.get('order_data'), order.get('id')
        if not all([user_id, order_data, order_id, isinstance(order_data.get('triggers'), list) and order_data.get('triggers')]):
            app_logger.warning(f"[EVAL_TRIG] Skipping invalid order object: {order}")
            continue
        
        trigger = order_data['triggers'][0]
        should_fire = False
        if trigger.get('category') == '時間':
            should_fire = _evaluate_time_trigger(trigger, now_jst, current_time_str, current_day_of_week_jp, app_logger)
        
        if should_fire:
            app_logger.debug(f"!!! [EVAL_TRIG] FIRE: Trigger activated for user {user_id} (Order ID: {order_id}). Appending to dispatch list.")
            dispatch_list.append((user_id, order_data))

    app_logger.debug(f"--- [EVAL_TRIG] END: evaluation finished. Found {len(dispatch_list)} triggers to fire. ---")
    return dispatch_list


def evaluate_switchbot_triggers(app_logger):
    return []
