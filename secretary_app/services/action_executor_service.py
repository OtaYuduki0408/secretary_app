from supabase_client import supabase
from datetime import datetime, timedelta
from flask import current_app
import json
import base64
from email.mime.text import MIMEText
import google.auth
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from services.google_token_service import get_credentials
from services.ScheduleManager import ScheduleManager
import pytz
from google.auth.transport.requests import Request # メール送信時のクレデンシャル更新に必要
from services.finance_service import ( # finance_serviceから必要な関数をインポート
    get_current_balance,
    get_monthly_expense,
    get_daily_expense,
    get_monthly_goal,
    get_all_finance_records,
    upsert_monthly_goal
)
from services.memo_service import get_all_memos # memo_serviceから必要な関数をインポート

TABLE_NAME = "pending_user_actions"
JST = pytz.timezone('Asia/Tokyo')


def _format_event_time(iso_time: str, tz=JST) -> str:
    """ISO形式の時刻文字列を「〇月〇日〇時〇分」形式に整形する"""
    if not iso_time:
        return ""
    try:
        # 'Z'がある場合はUTCとしてパース
        dt_object = datetime.fromisoformat(iso_time.replace('Z', '+00:00'))
        dt_local = dt_object.astimezone(tz)
        return dt_local.strftime('%m月%d日%H時%M分')
    except ValueError:
        return iso_time # パースできない場合はそのまま返す

def _parse_time_param(param_value, current_dt: datetime):
    """'実行された年'などの特殊な値を実際の年月に変換するヘルパー関数"""
    if param_value == '実行された年': return current_dt.year
    if param_value == '実行された月': return current_dt.month
    if param_value == '実行された日': return current_dt.day
    if param_value == '実行された時刻': return f"{current_dt.hour:02d}:{current_dt.minute:02d}"
    return param_value


def _execute_calendar_read_aloud(user_id: str, detail_data: dict, triggered_at: datetime) -> dict:
    """
    カレンダーイベントを読み上げる。
    Args:
        user_id (str): ユーザーID。
        detail_data (dict): アクションのdetail部分のデータ。
        triggered_at (datetime): トリガーが発動した日時。

    Returns:
        dict: 実行結果。
    """
    sm = current_app.calendar_manager
    if not sm.is_authenticated(user_id):
        return {"status": "error", "message": "Googleアカウントがリンクされていません。", "needs_link": True}

    # detail_dataから検索範囲を抽出
    current_dt_jst = triggered_at.astimezone(JST) # 基準はJST

    start_year = _parse_time_param(detail_data.get('start_year'), current_dt_jst)
    start_month = _parse_time_param(detail_data.get('start_month'), current_dt_jst)
    start_day = _parse_time_param(detail_data.get('start_day'), current_dt_jst)
    start_time_str = _parse_time_param(detail_data.get('start_time'), current_dt_jst)

    end_year = _parse_time_param(detail_data.get('end_year'), current_dt_jst)
    end_month = _parse_time_param(detail_data.get('end_month'), current_dt_jst)
    end_day = _parse_time_param(detail_data.get('end_day'), current_dt_jst)
    end_time_str = _parse_time_param(detail_data.get('end_time'), current_dt_jst)

    try:
        # 時刻文字列を安全に解析
        start_hour, start_minute = (0, 0)
        if isinstance(start_time_str, str) and ':' in start_time_str:
            parts = start_time_str.split(':')
            try:
                start_hour = int(parts[0])
                start_minute = int(parts[1]) if len(parts) > 1 else 0
            except ValueError:
                pass # 数値に変換できなければデフォルト値のまま

        end_hour, end_minute = (23, 59)
        if isinstance(end_time_str, str) and ':' in end_time_str:
            parts = end_time_str.split(':')
            try:
                end_hour = int(parts[0])
                end_minute = int(parts[1]) if len(parts) > 1 else 59
            except ValueError:
                pass # 数値に変換できなければデフォルト値のまま

        # 日付と時刻を結合してdatetimeオブジェクトを作成
        start_datetime = datetime(
            int(start_year) if start_year else current_dt_jst.year,
            int(start_month) if start_month else current_dt_jst.month,
            int(start_day) if start_day else current_dt_jst.day,
            start_hour,
            start_minute
        )
        end_datetime = datetime(
            int(end_year) if end_year else current_dt_jst.year,
            int(end_month) if end_month else current_dt_jst.month,
            int(end_day) if end_day else current_dt_jst.day,
            end_hour,
            end_minute
        )
        # JSTをローカライズ
        start_datetime = JST.localize(start_datetime)
        end_datetime = JST.localize(end_datetime)

    except Exception as e:
        import traceback
        print(f"カレンダー読み上げ: 日時解析エラー: {e}")
        print(traceback.format_exc())
        return {"status": "error", "message": f"カレンダー読み上げに失敗しました: 日時解析エラー {e}"}

    # ScheduleManagerを使ってイベントを取得
    events = sm.list_events(user_id, time_min=start_datetime.isoformat(), time_max=end_datetime.isoformat())

    if not events:
        return {
            "status": "success",
            "message": "指定期間のイベントは見つかりませんでした。",
            "category": "カレンダー",
            "display_data": {
                "start_datetime": start_datetime.isoformat(), # 検索範囲の開始日時
                "end_datetime": end_datetime.isoformat(),   # 検索範囲の終了日時
                "events": []
            }
        }

    speech_parts = ["カレンダー情報を読み上げます。"]

    # 日付表示の整形
    # 期間が1日のみの場合
    if start_datetime.date() == end_datetime.date():
        date_str = start_datetime.strftime('%Y年%m月%d日')
        speech_parts.append(f"{date_str}に")
    # 期間が1ヶ月全体の場合 (1日から月末まで)
    elif start_datetime.day == 1 and end_datetime.day == ((start_datetime + timedelta(days=32)).replace(day=1) - timedelta(days=1)).day:
        date_str = start_datetime.strftime('%Y年%m月')
        speech_parts.append(f"{date_str}の")
    else:
        # それ以外の期間
        start_date_str = start_datetime.strftime('%Y年%m月%d日')
        end_date_str = end_datetime.strftime('%Y年%m月%d日')
        speech_parts.append(f"{start_date_str}から{end_date_str}に")
    
    speech_parts.append(f"登録されている予定が{len(events)}件見つかりました。")

    for event in events:
        summary = event.get('summary', 'タイトルなし')
        event_start_iso = event.get('start', {}).get('dateTime', event.get('start', {}).get('date'))
        event_end_iso = event.get('end', {}).get('dateTime', event.get('end', {}).get('date'))

        start_time_fmt = ""
        end_time_fmt = ""

        if event_start_iso:
            try:
                start_dt_obj = datetime.fromisoformat(event_start_iso.replace('Z', '+00:00')).astimezone(JST)
                start_time_fmt = start_dt_obj.strftime('%p%I時%M分').replace('AM', '午前').replace('PM', '午後')
            except ValueError:
                pass
        
        if event_end_iso:
            try:
                end_dt_obj = datetime.fromisoformat(event_end_iso.replace('Z', '+00:00')).astimezone(JST)
                end_time_fmt = end_dt_obj.strftime('%p%I時%M分').replace('AM', '午前').replace('PM', '午後')
            except ValueError:
                pass
        
        if start_time_fmt and end_time_fmt:
            speech_parts.append(f"{start_time_fmt}から{end_time_fmt}まで{summary}、")
        elif start_time_fmt:
            speech_parts.append(f"{start_time_fmt}から{summary}、")
        else:
            speech_parts.append(f"{summary}、")
            
    speech_parts.append(f"以上{len(events)}件見つかりました。")
            
    # フロントエンドで表示しやすいように整形したイベント情報も渡す
    display_events = []
    for event in events:
        summary = event.get('summary', 'タイトルなし')
        event_start_iso = event.get('start', {}).get('dateTime', event.get('start', {}).get('date'))
        event_end_iso = event.get('end', {}).get('dateTime', event.get('end', {}).get('date'))
        
        display_events.append({
            "summary": summary,
            "start_time_iso": event_start_iso,
            "end_time_iso": event_end_iso,
            "formatted_start_time": _format_event_time(event_start_iso),
            "formatted_end_time": _format_event_time(event_end_iso),
        })

    return {
        "status": "success",
        "message": "".join(speech_parts),
        "category": "カレンダー",
        "display_data": {
            "start_datetime": start_datetime.isoformat(),
            "end_datetime": end_datetime.isoformat(),
            "events": display_events
        }
    }

def _execute_finance_read_aloud(user_id: str, detail_data: dict, triggered_at: datetime) -> dict:
    """
    収支管理データを読み上げる。
    Args:
        user_id (str): ユーザーID。
        detail_data (dict): アクションのdetail部分のデータ。
        triggered_at (datetime): トリガーが発動した日時。

    Returns:
        dict: 実行結果。
    """
    item = detail_data.get('item') # 個別項目 (例: total_balance, monthly_expense)
    fmt = detail_data.get('format') # 読み上げ形式 (individual, expense, income, balance)

    current_dt_jst = triggered_at.astimezone(JST)

    # 期間情報の解析
    start_year = _parse_time_param(detail_data.get('start_year'), current_dt_jst)
    start_month = _parse_time_param(detail_data.get('start_month'), current_dt_jst)
    start_day = _parse_time_param(detail_data.get('start_day'), current_dt_jst)
    start_time_str = _parse_time_param(detail_data.get('start_time'), current_dt_jst)

    end_year = _parse_time_param(detail_data.get('end_year'), current_dt_jst)
    end_month = _parse_time_param(detail_data.get('end_month'), current_dt_jst)
    end_day = _parse_time_param(detail_data.get('end_day'), current_dt_jst)
    end_time_str = _parse_time_param(detail_data.get('end_time'), current_dt_jst)

    has_period_filter = any(val for val in [start_year, start_month, start_day, start_time_str, end_year, end_month, end_day, end_time_str] if val and not str(val).startswith('実行された'))


    message_parts = ["収支管理情報を読み上げます。"]
    finance_display_data = {"type": "summary", "date_range": "", "details": {}}
    
    total_income = 0
    total_expense = 0
    net_balance = 0
    
    start_datetime, end_datetime = None, None
    date_range_str = ""

    if has_period_filter:
        try:
            # 期間指定がある場合、指定された日時でdatetimeオブジェクトを作成
            s_year = int(start_year) if start_year else current_dt_jst.year
            s_month = int(start_month) if start_month else 1
            s_day = int(start_day) if start_day else 1
            s_hour = int(start_time_str.split(':')[0]) if start_time_str and ':' in start_time_str else 0
            s_minute = int(start_time_str.split(':')[1]) if start_time_str and ':' in start_time_str else 0

            e_year = int(end_year) if end_year else current_dt_jst.year
            e_month = int(end_month) if end_month else 12
            # 月末日を正しく計算
            if end_month and not end_day:
                next_month = datetime(e_year, e_month, 1) + timedelta(days=32)
                e_day = (next_month.replace(day=1) - timedelta(days=1)).day
            else:
                e_day = int(end_day) if end_day else 31
            
            e_hour = int(end_time_str.split(':')[0]) if end_time_str and ':' in end_time_str else 23
            e_minute = int(end_time_str.split(':')[1]) if end_time_str and ':' in end_time_str else 59
            
            start_datetime = JST.localize(datetime(s_year, s_month, s_day, s_hour, s_minute))
            end_datetime = JST.localize(datetime(e_year, e_month, e_day, e_hour, e_minute))

        except Exception as e:
            print(f"収支読み上げ: 日時解析エラー: {e}")
            return {"status": "error", "message": f"日時形式の解析に失敗しました: {e}"}

        date_range_str = f"{start_datetime.strftime('%Y年%m月%d日')}から{end_datetime.strftime('%Y年%m月%d日')}"
        finance_display_data["date_range"] = date_range_str

        all_records = get_all_finance_records(user_id)
        filtered_records = [
            r for r in all_records 
            if r.get('date') and start_datetime <= datetime.fromisoformat(r['date'].replace('Z', '+00:00')).astimezone(JST) <= end_datetime
        ]
        
        if not filtered_records:
            total_income = 0
            total_expense = 0
        else:
            total_income = sum(r.get('amount', 0) for r in filtered_records if r.get('type') == 'income')
            total_expense = sum(r.get('amount', 0) for r in filtered_records if r.get('type') == 'expense')

    else:
        # 期間指定がない場合 (当月の集計)
        date_range_str = current_dt_jst.strftime('%Y年%m月')
        finance_display_data["date_range"] = date_range_str

        all_records = get_all_finance_records(user_id)
        current_month_str = current_dt_jst.strftime('%Y-%m')
        
        monthly_records = [
            r for r in all_records
            if r.get('date') and datetime.fromisoformat(r['date'].replace('Z', '+00:00')).strftime('%Y-%m') == current_month_str
        ]

        total_income = sum(r.get('amount', 0) for r in monthly_records if r.get('type') == 'income')
        total_expense = get_monthly_expense(user_id) # 既存の関数を利用

    net_balance = total_income - total_expense

    # 読み上げ形式(fmt)に応じてメッセージを構築
    if fmt == 'individual':
        if not has_period_filter:
            if item == 'total_balance':
                balance = get_current_balance(user_id)
                message_parts.append(f"現在の所持金は{balance}円です。")
                finance_display_data["details"] = {"item": "total_balance", "value": balance, "unit": "円"}
            elif item == 'monthly_expense':
                message_parts.append(f"今月の合計支出は{total_expense}円です。")
                finance_display_data["details"] = {"item": "monthly_expense", "value": total_expense, "unit": "円"}
            elif item == 'daily_expense':
                expense = get_daily_expense(user_id)
                message_parts.append(f"今日の合計支出は{expense}円です。")
                finance_display_data["details"] = {"item": "daily_expense", "value": expense, "unit": "円"}
            elif item == 'monthly_income':
                message_parts.append(f"今月の合計収入は{total_income}円です。")
                finance_display_data["details"] = {"item": "monthly_income", "value": total_income, "unit": "円"}
            elif item == 'remaining_to_target':
                goal = get_monthly_goal(user_id)
                if goal and goal.get('goal_amount'):
                    goal_amount = goal['goal_amount']
                    remaining = goal_amount - total_expense
                    message_parts.append(f"今月の目標額{goal_amount}円に対し、残り{remaining}円使えます。")
                    finance_display_data["details"] = {"item": "remaining_to_target", "goal_amount": goal_amount, "current_expense": total_expense, "remaining": remaining, "unit": "円"}
                else:
                    message_parts.append("今月の目標額が設定されていません。")
                    finance_display_data["details"] = {"item": "remaining_to_target", "message": "目標額未設定"}
            else:
                message_parts.append("指定された収支個別項目は見つかりませんでした。")
                finance_display_data["details"] = {"message": "指定個別項目なし"}
        else:
            message_parts.append(f"{date_range_str}の収支情報で個別項目は指定できません。")
            finance_display_data["details"] = {"message": "個別項目での期間指定はサポートされていません"}
    elif fmt == 'income':
        message_parts.append(f"{date_range_str}の合計収入は{total_income}円です。")
        finance_display_data["details"] = {"item": "total_income", "value": total_income, "unit": "円"}
    elif fmt == 'expense':
        message_parts.append(f"{date_range_str}の合計支出は{total_expense}円です。")
        finance_display_data["details"] = {"item": "total_expense", "value": total_expense, "unit": "円"}
    elif fmt == 'balance' or fmt is None:
        message_parts.append(f"{date_range_str}の合計収入は{total_income}円、合計支出は{total_expense}円です。収支は{net_balance}円です。")
        finance_display_data["details"] = { "item": "period_summary", "summary": { "total_income": total_income, "total_expense": total_expense, "net_balance": net_balance, "unit": "円" } }
    else:
        message_parts.append("収支の読み上げ形式が不明です。")
        finance_display_data["details"] = {"message": "不明な読み上げ形式"}

    return {"status": "success", "message": "".join(message_parts), "category": "収支管理", "display_data": finance_display_data}

def _execute_memo_read_aloud(user_id: str, detail_data: dict, triggered_at: datetime) -> dict:
    """
    メモを読み上げる。
    Args:
        user_id (str): ユーザーID。
        detail_data (dict): アクションのdetail部分のデータ。
        triggered_at (datetime): トリガーが発動した日時。
    Returns:
        dict: 実行結果。
    """
    current_dt_jst = triggered_at.astimezone(JST)

    # 期間情報の解析
    start_year = _parse_time_param(detail_data.get('start_year'), current_dt_jst)
    start_month = _parse_time_param(detail_data.get('start_month'), current_dt_jst)
    start_day = _parse_time_param(detail_data.get('start_day'), current_dt_jst)
    start_time_str = _parse_time_param(detail_data.get('start_time'), current_dt_jst)

    end_year = _parse_time_param(detail_data.get('end_year'), current_dt_jst)
    end_month = _parse_time_param(detail_data.get('end_month'), current_dt_jst)
    end_day = _parse_time_param(detail_data.get('end_day'), current_dt_jst)
    end_time_str = _parse_time_param(detail_data.get('end_time'), current_dt_jst)

    start_datetime, end_datetime = None, None
    try:
        start_datetime = datetime(
            int(start_year) if start_year else current_dt_jst.year,
            int(start_month) if start_month else 1,
            int(start_day) if start_day else 1,
            int(start_time_str.split(':')[0]) if start_time_str else 0,
            int(start_time_str.split(':')[1]) if start_time_str else 0
        )
        end_datetime = datetime(
            int(end_year) if end_year else current_dt_jst.year,
            int(end_month) if end_month else 12,
            int(end_day) if end_day else 31,
            int(end_time_str.split(':')[0]) if end_time_str else 23,
            int(end_time_str.split(':')[1]) if end_time_str else 59
        )
        start_datetime = JST.localize(start_datetime)
        end_datetime = JST.localize(end_datetime)
    except Exception as e:
        print(f"メモ読み上げ: 日時解析エラー: {e}")
        # エラーが発生しても続行できるよう、ここではエラーを返さない（全体をフィルタリングしない）

    # get_all_memos関数には直接datetimeオブジェクトを渡せないため、isoformatに変換
    start_date_iso = start_datetime.isoformat() if start_datetime else ""
    end_date_iso = end_datetime.isoformat() if end_datetime else ""

    memos = get_all_memos(
        user_id=user_id,
        start_date=start_date_iso,
        end_date=end_date_iso
    )

    if not memos:
        return {
            "status": "success",
            "message": "指定期間のメモは見つかりませんでした。",
            "category": "メモ",
            "display_data": {
                "start_date_iso": start_date_iso, # 検索範囲の開始日時
                "end_date_iso": end_date_iso,     # 検索範囲の終了日時
                "memos": []
            }
        }

    speech_parts = ["メモをお知らせします。"]
    for memo in memos:
        speech_parts.append(f"タイトル、{memo.get('title', '無題')}。内容、{memo.get('content', '内容なし')}。")
    
    return {
        "status": "success",
        "message": "".join(speech_parts),
        "category": "メモ",
        "display_data": {
            "start_date_iso": start_date_iso,
            "end_date_iso": end_date_iso,
            "memos": memos # 取得したメモリストをそのまま渡す
        }
    }

def _execute_email_send(user_id: str, detail_data: dict) -> dict:
    """
    メールを送信する。
    Args:
        user_id (str): ユーザーID。
        detail_data (dict): アクションのdetail部分のデータ。
    Returns:
        dict: 実行結果。
    """
    to_email = detail_data.get('to')
    subject = detail_data.get('subject', '無題')
    body = detail_data.get('body', '')

    if not to_email:
        return {"status": "error", "message": "送信先メールアドレスが指定されていません。"}
    if not subject and not body:
        return {"status": "error", "message": "メールの件名または本文が空です。"}

    try:
        creds_info = get_credentials(user_id)
        if not creds_info:
            return {"status": "error", "message": "Googleアカウントがリンクされていません。", "needs_link": True}
        
        creds = Credentials.from_authorized_user_info(creds_info)
        # 期限切れなら更新
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
            # 更新されたクレデンシャルを保存（必要であれば）
            current_app.calendar_manager._save_creds_for_user(user_id, creds)

        service = build('gmail', 'v1', credentials=creds, cache_discovery=False)
        
        message = MIMEText(body)
        message['to'] = to_email
        message['subject'] = subject
        raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode()

        # Gmail APIでメールを送信
        send_message = service.users().messages().send(userId='me', body={'raw': raw_message}).execute()
        
        return {"status": "success", "message": f"メールを{to_email}に送信しました。件名: {subject}"}
    except Exception as e:
        print(f"メール送信エラー: {e}")
        return {"status": "error", "message": f"メール送信に失敗しました: {str(e)}"}


def _execute_speak(detail_data: dict) -> dict:
    """
    指定されたテキストを発声する。
    Args:
        detail_data (dict): アクションのdetail部分のデータ。
    Returns:
        dict: 実行結果。
    """
    text_to_speak = detail_data.get('text', '')
    if text_to_speak:
        return {"status": "success", "message": text_to_speak}
    return {"status": "error", "message": "発声するテキストが指定されていません。"}

def _execute_alert(detail_data: dict) -> dict:
    """
    アラート音を鳴らす指示を出す。
    Args:
        detail_data (dict): アクションのdetail部分のデータ。
    Returns:
        dict: 実行結果。
    """
    sound_type = detail_data.get('sound', 'default') # デフォルト値を設定
    return {"status": "success", "message": f"アラート音'{sound_type}'を再生します。", "action": "play_alert_sound", "sound_type": sound_type}



def execute_action(user_id: str, action_data: dict) -> dict: # triggered_atをaction_dataから取得するように変更
    """
    アクションデータを解析し、適切な処理を実行する。
    Args:
        user_id (str): アクションを実行するユーザーのID。
        action_data (dict): 実行するアクションの詳細。scheduled_atとtriggered_atを含む。

    Returns:
        dict: 実行結果（成功/失敗、メッセージなど）。
    """
    category = action_data.get('category')
    sub = action_data.get('sub')
    detail = action_data.get('detail', {})
    
    # action_data内のtriggered_atを使用
    triggered_at_iso = action_data.get('triggered_at')
    if not triggered_at_iso:
        print("ERROR: action_dataにtriggered_atが含まれていません。")
        return {"status": "error", "message": "アクション実行時にトリガー時刻が不明です。"}
    triggered_at = datetime.fromisoformat(triggered_at_iso)

    if category == 'カレンダー' and sub == '読み上げ':
        return _execute_calendar_read_aloud(user_id, detail, triggered_at)
    elif category == '収支管理' and sub == '読み上げ':
        return _execute_finance_read_aloud(user_id, detail, triggered_at)
    elif category == 'メモ' and sub == '読み上げ':
        return _execute_memo_read_aloud(user_id, detail, triggered_at)
    elif category == 'メール' and sub == '送信':
        return _execute_email_send(user_id, detail)
    elif category == '発声' and sub == '実行':
        return _execute_speak(detail)
    elif category == 'アラート' and sub == '実行':
        return _execute_alert(detail)
    # 他のアクションタイプもここに追加
    
    return {"status": "error", "message": f"不明なアクション: {category}:{sub}"}