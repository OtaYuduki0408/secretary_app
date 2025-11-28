# C:\Users\y_oota\Documents\secretary_app\secretary_app\order\evaluator.py
from supabase_client import supabase
from datetime import datetime
import pytz

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


def evaluate_triggers():
    """
    毎分実行され、トリガーを評価し、ディスパッチすべきコマンドのリストを返す。
    Returns:
        list: [(user_id, order_data), ...]
    """
    print(f"[{datetime.now()}] Evaluating triggers...")
    
    dispatch_list = []

    try:
        # Supabaseからすべてのカスタム命令を取得
        response = supabase.table('custom_orders').select('id, user_id, order_data').execute()
        orders = response.data
    except Exception as e:
        print(f"Error fetching custom orders from Supabase: {e}")
        return dispatch_list
    
    if not orders:
        print("No custom orders found.")
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
            print(f"Trigger activated for user {user_id}. Adding to dispatch list.")
            dispatch_list.append((user_id, order_data))
    
    return dispatch_list

