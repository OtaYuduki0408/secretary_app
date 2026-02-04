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

    # 1. 時刻のチェック
    trigger_time = trigger_value.get('time')
    if trigger_time != '毎時' and trigger_time != current_time_str:
        return False

    # 2. 曜日のチェック
    trigger_dow = trigger_value.get('day_of_week')
    if trigger_dow and current_day_of_week_jp not in trigger_dow:
        return False

    # 3. 日のチェック
    trigger_day = trigger_value.get('day')
    # 日が指定されていて、それが「毎日」ではなく、かつ現在の日と一致しない場合
    if trigger_day and str(trigger_day) not in ['毎日', 'x'] and str(now_jst.day) != str(trigger_day):
        return False

    # 4. 月のチェック
    trigger_month = trigger_value.get('month')
    # 月が指定されていて、それが「毎月」ではなく、かつ現在の月と一致しない場合
    if trigger_month and str(trigger_month) not in ['毎月', 'x'] and str(now_jst.month) != str(trigger_month):
        return False

    # 5. 年のチェック
    trigger_year = trigger_value.get('year')
    # 年が指定されていて、それが「毎年」ではなく、かつ現在の年と一致しない場合
    if trigger_year and str(trigger_year) not in ['毎年', 'x'] and str(now_jst.year) != str(trigger_year):
        return False

    # 全ての条件をクリアした場合
    if app_logger:
        app_logger.debug(f"Time trigger matched for value: {trigger_value}")
    return True

def evaluate_triggers(app_logger):
    app_logger.debug(f"[{datetime.now()}] Evaluating triggers...")
    dispatch_list = []
    try:
        response = supabase.table('custom_orders').select('id, user_id, order_data').execute()
        orders = response.data
    except Exception as e:
        app_logger.error(f"Error fetching custom orders from Supabase: {e}")
        orders = []

    if not orders: return dispatch_list

    now_jst = datetime.now(JST)
    current_time_str = now_jst.strftime('%H:%M')
    day_mapping = {'Mon': '月', 'Tue': '火', 'Wed': '水', 'Thu': '木', 'Fri': '金', 'Sat': '土', 'Sun': '日'}
    current_day_of_week_jp = day_mapping.get(now_jst.strftime('%a'), '')

    for order in orders:
        user_id, order_data, order_id = order.get('user_id'), order.get('order_data'), order.get('id')
        if not all([user_id, order_data, order_id, order_data.get('triggers')]): continue
        
        trigger = order_data['triggers'][0]
        should_fire = False
        if trigger.get('category') == '時間':
            should_fire = _evaluate_time_trigger(trigger, now_jst, current_time_str, current_day_of_week_jp, app_logger)
        
        if should_fire:
            app_logger.debug(f"Trigger activated for user {user_id} (Order ID: {order_id}). Dispatching raw order data.")
            dispatch_list.append((user_id, order_data))

    return dispatch_list


def evaluate_switchbot_triggers(app_logger):
    return []
