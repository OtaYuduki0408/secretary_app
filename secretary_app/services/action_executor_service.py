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
        # 日付と時刻を結合してdatetimeオブジェクトを作成
        start_datetime = datetime(
            int(start_year) if start_year else current_dt_jst.year,
            int(start_month) if start_month else current_dt_jst.month,
            int(start_day) if start_day else current_dt_jst.day,
            int(start_time_str.split(':')[0]) if start_time_str else 0,
            int(start_time_str.split(':')[1]) if start_time_str else 0
        )
        end_datetime = datetime(
            int(end_year) if end_year else current_dt_jst.year,
            int(end_month) if end_month else current_dt_jst.month,
            int(end_day) if end_day else current_dt_jst.day,
            int(end_time_str.split(':')[0]) if end_time_str else 23, # デフォルトで一日の終わり
            int(end_time_str.split(':')[1]) if end_time_str else 59  # デフォルトで一日の終わり
        )
        # JSTをローカライズ
        start_datetime = JST.localize(start_datetime)
        end_datetime = JST.localize(end_datetime)

    except Exception as e:
        print(f"カレンダー読み上げ: 日時解析エラー: {e}")
        return {"status": "error", "message": f"カレンダー読み上げに失敗しました: 日時解析エラー {e}"}

    # ScheduleManagerを使ってイベントを取得
    events = sm.list_events(user_id, time_min=start_datetime.isoformat(), time_max=end_datetime.isoformat())

    if not events:
        return {"status": "success", "message": "指定期間のイベントは見つかりませんでした。", "category": "カレンダー"}

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
            
    return {"status": "success", "message": "".join(speech_parts), "category": "カレンダー"}

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
    item = detail_data.get('item')
    fmt = detail_data.get('format')

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
            int(start_month) if start_month else 1, # デフォルトで月の初日
            int(start_day) if start_day else 1,
            int(start_time_str.split(':')[0]) if start_time_str else 0,
            int(start_time_str.split(':')[1]) if start_time_str else 0
        )
        end_datetime = datetime(
            int(end_year) if end_year else current_dt_jst.year,
            int(end_month) if end_month else 12, # デフォルトで年の最終月
            int(end_day) if end_day else 31, # デフォルトで月の最終日
            int(end_time_str.split(':')[0]) if end_time_str else 23,
            int(end_time_str.split(':')[1]) if end_time_str else 59
        )
        start_datetime = JST.localize(start_datetime)
        end_datetime = JST.localize(end_datetime)
    except Exception as e:
        print(f"収支読み上げ: 日時解析エラー: {e}")
        # 日時解析に失敗しても続行できるように、ここではエラーを返さない（全体をフィルタリングしない）


    message_parts = ["収支管理情報を読み上げます。"]
    
    # 日付範囲の文字列を作成
    date_range_str = ""
    if start_datetime and end_datetime:
        if start_datetime.date() == end_datetime.date():
            date_range_str = start_datetime.strftime('%Y年%m月%d日')
        else:
            date_range_str = f"{start_datetime.strftime('%Y年%m月%d日')}から{end_datetime.strftime('%Y年%m月%d日')}"
    else:
        # 期間指定がない場合、今日の日付を使用
        date_range_str = current_dt_jst.strftime('%Y年%m月%d日')

    # 期間指定がない場合のシンプルな読み上げ
    if not (start_datetime and end_datetime):
        if item == 'total_balance':
            balance = get_current_balance(user_id)
            message_parts.append(f"現在の所持金は{balance}円です。")
        elif item == 'monthly_expense':
            expense = get_monthly_expense(user_id)
            message_parts.append(f"今月の合計支出は{expense}円です。")
        elif item == 'daily_expense':
            expense = get_daily_expense(user_id)
            message_parts.append(f"今日の合計支出は{expense}円です。")
        elif item == 'monthly_income':
            all_records = get_all_finance_records(user_id)
            current_month_str = current_dt_jst.strftime('%Y-%m')
            monthly_income = sum(
                r.get('amount', 0) for r in all_records
                if r.get('type') == 'income' and datetime.fromisoformat(r['date']).strftime('%Y-%m') == current_month_str
            )
            message_parts.append(f"今月の合計収入は{monthly_income}円です。")
        elif item == 'remaining_to_target':
            goal = get_monthly_goal(user_id)
            if goal and goal.get('goal_amount'):
                goal_amount = goal['goal_amount']
                current_expense = get_monthly_expense(user_id)
                remaining = goal_amount - current_expense
                message_parts.append(f"今月の目標額{goal_amount}円に対し、残り{remaining}円使えます。")
            else:
                message_parts.append("今月の目標額が設定されていません。")
        # TODO: monthly_expense_no_necessities, daily_expense_no_necessities もここに追加
    else:
        # 期間指定がある場合
        all_records = get_all_finance_records(user_id)
        
        filtered_records = []
        for record in all_records:
            record_date_str = record.get('date')
            if not record_date_str: continue
            
            try:
                record_dt = JST.localize(datetime.fromisoformat(record_date_str))
            except ValueError:
                record_dt = datetime.fromisoformat(record_date_str.replace('Z', '+00:00')).astimezone(JST)

            if start_datetime <= record_dt <= end_datetime:
                filtered_records.append(record)

        if not filtered_records:
            message_parts.append(f"{date_range_str}の収支は見つかりませんでした。")
        else:
            total_income = sum(r.get('amount', 0) for r in filtered_records if r.get('type') == 'income')
            total_expense = sum(r.get('amount', 0) for r in filtered_records if r.get('type') == 'expense')
            
            if fmt == 'individual':
                message_parts.append(f"{date_range_str}の合計収入は{total_income}円、合計支出は{total_expense}円です。差し引き{total_income - total_expense}円です。")
            elif fmt == 'income':
                message_parts.append(f"{date_range_str}の合計収入は{total_income}円です。")
            elif fmt == 'expense':
                message_parts.append(f"{date_range_str}の合計支出は{total_expense}円です。")
            elif fmt == 'balance':
                message_parts.append(f"{date_range_str}の収支は{total_income - total_expense}円です。")
            else: # デフォルトは収支
                message_parts.append(f"{date_range_str}の収支は{total_income - total_expense}円です。")

    if len(message_parts) == 1: # 最初のメッセージ「収支管理情報を読み上げます。」しかない場合
        message_parts.append("指定された収支項目は見つかりませんでした。")

    return {"status": "success", "message": "".join(message_parts), "category": "収支管理"}

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
        return {"status": "success", "message": "指定期間のメモは見つかりませんでした。", "category": "メモ"}

    speech_parts = ["メモをお知らせします。"]
    for memo in memos:
        speech_parts.append(f"タイトル、{memo.get('title', '無題')}。内容、{memo.get('content', '内容なし')}。")
    
    return {"status": "success", "message": "".join(speech_parts), "category": "メモ"}

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
