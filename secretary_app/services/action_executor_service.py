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
    # '実行された年'などの特殊な値を実際の年月に変換
    def _parse_time_param(param_value, current_dt: datetime):
        if param_value == '実行された年': return current_dt.year
        if param_value == '実行された月': return current_dt.month
        if param_value == '実行された日': return current_dt.day
        if param_value == '実行された時刻': return f"{current_dt.hour:02d}:{current_dt.minute:02d}"
        return param_value

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
        return {"status": "success", "message": "指定期間のイベントは見つかりませんでした。"}

    speech_parts = ["カレンダーのイベントをお知らせします。"]
    for event in events:
        summary = event.get('summary', 'タイトルなし')
        event_start_iso = event.get('start', {}).get('dateTime', event.get('start', {}).get('date'))
        
        if event_start_iso:
            speech_parts.append(f"{_format_event_time(event_start_iso)}に{summary}があります。")
        else:
            speech_parts.append(f"{summary}があります。")
            
    return {"status": "success", "message": "".join(speech_parts)}


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
    elif category == '発声' and sub == '実行':
        return _execute_speak(detail)
    # 他のアクションタイプもここに追加
    
    return {"status": "error", "message": f"不明なアクション: {category}:{sub}"}
