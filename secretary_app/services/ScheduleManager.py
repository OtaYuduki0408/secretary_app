import os
import json
from datetime import datetime, timedelta
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from google.auth.transport.requests import Request
 
TOKEN_PATH = "token.json"
SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/calendar",
]
 
class ScheduleManager:
    def __init__(self, token_path=TOKEN_PATH, scopes=SCOPES, creds_info=None):
        self.token_path = token_path
        self.scopes = scopes
        self.creds = None
        # creds_info: dict (from oauth flow) OR None to load from token_path
        if creds_info:
            self.creds = Credentials.from_authorized_user_info(creds_info, scopes=self.scopes)
        else:
            self._load_token()
 
        if self.creds and self.creds.expired and self.creds.refresh_token:
            try:
                self.creds.refresh(Request())
                self._save_token()
            except Exception as e:
                # refresh error - leave as-is, higher layer should re-auth
                print("Credentials refresh failed:", e)
 
    def _load_token(self):
        if os.path.exists(self.token_path):
            with open(self.token_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            try:
                self.creds = Credentials.from_authorized_user_info(data, scopes=self.scopes)
            except Exception as e:
                print("Failed to load credentials:", e)
                self.creds = None
        else:
            self.creds = None
 
    def _save_token(self):
        if not self.creds:
            return
        data = {
            "token": self.creds.token,
            "refresh_token": self.creds.refresh_token,
            "token_uri": self.creds.token_uri,
            "client_id": self.creds.client_id,
            "client_secret": self.creds.client_secret,
            "scopes": list(self.creds.scopes or [])
        }
        with open(self.token_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
 
    def is_authenticated(self):
        return self.creds is not None and self.creds.valid
 
    def set_credentials_from_info(self, creds_info):
        """呼び出し元（Flask）で OAuth フローが完了した後に creds_info(dict)を渡して保存する"""
        self.creds = Credentials.from_authorized_user_info(creds_info, scopes=self.scopes)
        # refresh if needed
        if self.creds.expired and self.creds.refresh_token:
            try:
                self.creds.refresh(Request())
            except Exception as e:
                print("refresh failed:", e)
        self._save_token()
 
    def _build_service(self, api_name="calendar", version="v3"):
        if not self.creds:
            raise RuntimeError("not_authenticated")
        return build(api_name, version, credentials=self.creds, cache_discovery=False)
 
    def add_event(self, title, start_iso, end_iso=None, description=""):
        service = self._build_service()
        if not end_iso:
            # デフォルト 1 時間
            end_iso = (datetime.fromisoformat(start_iso) + timedelta(hours=1)).isoformat()
        event = {
            "summary": title,
            "description": description,
            "start": {"dateTime": start_iso},
            "end": {"dateTime": end_iso},
        }
        created = service.events().insert(calendarId="primary", body=event).execute()
        return created
 
    def delete_event(self, event_id):
        service = self._build_service()
        service.events().delete(calendarId="primary", eventId=event_id).execute()
        return {"status": "deleted", "id": event_id}
 
    def list_events(self, time_min=None, time_max=None, max_results=50):
        service = self._build_service()
        if not time_min:
            time_min = datetime.utcnow().isoformat() + "Z"
        if not time_max:
            time_max = (datetime.utcnow() + timedelta(days=7)).isoformat() + "Z"
        events_result = service.events().list(
            calendarId="primary",
            timeMin=time_min,
            timeMax=time_max,
            maxResults=max_results,
            singleEvents=True,
            orderBy="startTime"
        ).execute()
        items = events_result.get("items", [])
        return items
 
    def update_event(self, event_id, new_start_iso=None, new_end_iso=None, new_summary=None, new_description=None):
        service = self._build_service()
        event = service.events().get(calendarId="primary", eventId=event_id).execute()
        if new_summary is not None:
            event["summary"] = new_summary
        if new_description is not None:
            event["description"] = new_description
        if new_start_iso:
            event["start"] = {"dateTime": new_start_iso}
        if new_end_iso:
            event["end"] = {"dateTime": new_end_iso}
        updated = service.events().update(calendarId="primary", eventId=event_id, body=event).execute()
        return updated