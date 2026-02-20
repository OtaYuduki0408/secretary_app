import json
import os
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from google.auth.transport.requests import Request

from services.google_token_service import get_credentials, upsert_credentials
import pytz

# JST (Asia/Tokyo) タイムゾーンを定義
JST = pytz.timezone('Asia/Tokyo')
UTC = pytz.utc

# 必要なスコープ（カレンダー操作用を追加）
SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/calendar",
]

class GoogleCalendarService:
    def __init__(self, user_id: str):
        self.user_id = user_id
        self.scopes = SCOPES

    def _load_creds(self) -> Optional[Credentials]:
        """Supabaseから認証情報を読み込み、Credentialsオブジェクトを作成する。"""
        data = get_credentials(self.user_id)
        if not data:
            return None

        try:
            creds = Credentials.from_authorized_user_info(data, scopes=self.scopes)
        except Exception as e:
            print(f"[ERROR] Failed to load credentials for user {self.user_id}: {e}")
            return None

        # 期限切れなら更新
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
                self._save_creds(creds)
            except Exception as e:
                print(f"[ERROR] Failed to refresh credentials for user {self.user_id}: {e}")
                return None
        
        return creds

    def _save_creds(self, creds: Credentials):
        """更新された認証情報をSupabaseに保存する。"""
        payload = {
            "token": creds.token,
            "refresh_token": creds.refresh_token,
            "token_uri": creds.token_uri,
            "client_id": creds.client_id,
            "client_secret": creds.client_secret,
            "scopes": list(creds.scopes or []),
        }
        upsert_credentials(self.user_id, payload)

    def _build_service(self):
        creds = self._load_creds()
        if not creds:
            raise RuntimeError("not_authenticated")
        return build("calendar", "v3", credentials=creds, cache_discovery=False)

    def _to_frontend_format(self, google_event: Dict[str, Any]) -> Dict[str, Any]:
        """Googleのイベント形式をフロントエンドが期待する形式に変換する。"""
        start = google_event.get("start", {})
        end = google_event.get("end", {})
        
        # 全日イベント (date) か 通常イベント (dateTime) かを判定
        start_time = start.get("dateTime") or start.get("date")
        end_time = end.get("dateTime") or end.get("date")

        return {
            "id": google_event.get("id"),
            "title": google_event.get("summary", "(無題)"),
            "start_time": start_time,
            "end_time": end_time,
            "description": google_event.get("description", ""),
            "location": google_event.get("location", ""),
            "htmlLink": google_event.get("htmlLink", "")
        }

    def list_events(self, time_min: Optional[str] = None, time_max: Optional[str] = None, max_results: int = 50) -> List[Dict[str, Any]]:
        """イベント一覧を取得する。"""
        service = self._build_service()

        # デフォルトは現在時刻から
        if not time_min:
            time_min = datetime.utcnow().isoformat() + "Z"
        
        try:
            events_result = service.events().list(
                calendarId="primary",
                timeMin=time_min,
                timeMax=time_max,
                maxResults=max_results,
                singleEvents=True,
                orderBy="startTime",
            ).execute()
            
            items = events_result.get("items", [])
            return [self._to_frontend_format(item) for item in items]
        except HttpError as e:
            print(f"[ERROR] Google Calendar list_events error: {e}")
            raise

    def add_event(self, title: str, start_time: str, end_time: str, description: str = "") -> Dict[str, Any]:
        """イベントを追加する。"""
        service = self._build_service()

        event_body = {
            "summary": title,
            "description": description,
            "start": {"dateTime": start_time, "timeZone": "Asia/Tokyo"},
            "end": {"dateTime": end_time, "timeZone": "Asia/Tokyo"},
        }

        try:
            created = service.events().insert(calendarId="primary", body=event_body).execute()
            return self._to_frontend_format(created)
        except HttpError as e:
            print(f"[ERROR] Google Calendar add_event error: {e}")
            raise

    def update_event(self, event_id: str, title: str = None, start_time: str = None, end_time: str = None, description: str = None) -> Dict[str, Any]:
        """イベントを更新する。"""
        service = self._build_service()

        try:
            # 現在のイベントを取得
            event = service.events().get(calendarId="primary", eventId=event_id).execute()

            if title is not None: event["summary"] = title
            if description is not None: event["description"] = description
            if start_time: event["start"] = {"dateTime": start_time, "timeZone": "Asia/Tokyo"}
            if end_time: event["end"] = {"dateTime": end_time, "timeZone": "Asia/Tokyo"}

            updated = service.events().update(calendarId="primary", eventId=event_id, body=event).execute()
            return self._to_frontend_format(updated)
        except HttpError as e:
            print(f"[ERROR] Google Calendar update_event error: {e}")
            raise

    def delete_event(self, event_id: str) -> bool:
        """イベントを削除する。"""
        service = self._build_service()
        try:
            service.events().delete(calendarId="primary", eventId=event_id).execute()
            return True
        except HttpError as e:
            if e.resp.status == 404:
                return False
            print(f"[ERROR] Google Calendar delete_event error: {e}")
            raise
