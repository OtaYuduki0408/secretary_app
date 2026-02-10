import json
from datetime import datetime, timedelta
from typing import Optional

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from google.auth.transport.requests import Request

from services.google_token_service import get_credentials, upsert_credentials
import pytz # pytzをインポート


SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/userinfo.email",
    # "https://www.googleapis.com/auth/calendar",
]

# JST (Asia/Tokyo) タイムゾーンを定義
JST = pytz.timezone('Asia/Tokyo')

class ScheduleManager:
        """
        Googleカレンダー操作をユーザー単位の認証情報(Supabase保管)で実行する。
        - 認証情報は Supabase テーブル google_credentials に保存する
        - 各APIは user_id を必須にし、そのユーザーのトークンでGoogle APIを実行する
        """
    
        def __init__(self, scopes=SCOPES):
            self.scopes = scopes
    
        # 認証情報の取得/更新 ----------------------------------------------------
        def _load_creds_for_user(self, user_id: str) -> Optional[Credentials]:
            print(f"DEBUG: Attempting to load credentials for user: {user_id}")
            data = get_credentials(user_id)
            if not data:
                print(f"DEBUG: No credentials found for user: {user_id} in Supabase.")
                return None
            print(f"DEBUG: Credentials data loaded from Supabase for user: {user_id}")
            try:
                creds = Credentials.from_authorized_user_info(data, scopes=self.scopes)
                print(f"DEBUG: Credentials object created for user: {user_id}. Valid: {creds.valid}, Expired: {creds.expired}")
            except Exception as e:
                print(f"ERROR: Failed to create Credentials object for user: {user_id}. Error: {e}")
                import traceback
                print(traceback.format_exc())
                return None
            # 期限切れなら更新
            try:
                if creds and creds.expired and creds.refresh_token:
                    print(f"DEBUG: Credentials expired for user: {user_id}. Attempting to refresh.")
                    creds.refresh(Request())
                    self._save_creds_for_user(user_id, creds)
                    print(f"DEBUG: Credentials refreshed and saved for user: {user_id}.")
                elif creds and creds.expired and not creds.refresh_token:
                    print(f"DEBUG: Credentials expired for user: {user_id}, but no refresh token available.")
                elif creds:
                    print(f"DEBUG: Credentials not expired for user: {user_id}.")
            except Exception as e:
                print(f"ERROR: Failed to refresh credentials for user: {user_id}. Error: {e}")
                import traceback
                print(traceback.format_exc())
                return None
            return creds
    
        def _save_creds_for_user(self, user_id: str, creds: Credentials) -> None:
            payload = {
                "token": creds.token,
                "refresh_token": creds.refresh_token,
                "token_uri": creds.token_uri,
                "client_id": creds.client_id,
                "client_secret": creds.client_secret,
                "scopes": list(creds.scopes or []),
            }
            upsert_credentials(user_id, payload)
    
        def is_authenticated(self, user_id: str) -> bool:
            creds = self._load_creds_for_user(user_id)
            return bool(creds and creds.valid)
    
        def set_credentials_from_info(self, user_id: str, creds_info: dict) -> None:
            """OAuth完了後の creds_info(dict) を保存。必要なら即リフレッシュ。"""
            creds = Credentials.from_authorized_user_info(creds_info, scopes=self.scopes)
            if creds.expired and creds.refresh_token:
                try:
                    creds.refresh(Request())
                except Exception:
                    pass
            self._save_creds_for_user(user_id, creds)
    
        # Googleサービスのビルド -------------------------------------------------
        def _build_service(self, user_id: str, api_name: str, version: str):
            creds = self._load_creds_for_user(user_id)
            if not creds:
                raise RuntimeError("not_authenticated")
            return build(api_name, version, credentials=creds, cache_discovery=False)
    
        # カレンダー操作 ---------------------------------------------------------
        """
        def _to_rfc3339(self, dt_str: str) -> str:
            
            # Google Calendar API に渡す RFC3339 形式へ正規化する。
            # 受け取りは「YYYY-MM-DD HH:MM:SS」や「YYYY-MM-DDTHH:MM:SS」想定。
            # タイムゾーンが無い場合はそのまま（別途 timeZone フィールドで指定）。
            
            if not dt_str:
                return dt_str
            s = dt_str.strip().replace(" ", "T")
            try:
                # 'Z' は +00:00 として扱う
                parsed = datetime.fromisoformat(s.replace("Z", "+00:00"))
                # 秒までに揃える（ミリ秒を落とす）
                return parsed.isoformat(timespec="seconds")
            except Exception:
                # パースできない場合は置換のみの結果を返す（最悪でも 'T' 区切り）
                return s
    
        def add_event(self, user_id: str, title: str, start_iso: str, end_iso: str | None = None, description: str = ""):
            try:
                service = self._build_service(user_id, "calendar", "v3")
    
                # 入力の正規化（RFC3339に揃え、timeZoneは別で付与）
                start_rfc3339 = self._to_rfc3339(start_iso)
                if not end_iso:
                    # end が無い場合は +1 時間
                    try:
                        base = datetime.fromisoformat(start_rfc3339.replace("Z", "+00:00"))
                        end_iso = (base + timedelta(hours=1)).isoformat(timespec="seconds")
                    except Exception:
                        # どうしてもパースできなければ start をそのまま基準にしておく
                        end_iso = start_rfc3339
                end_rfc3339 = self._to_rfc3339(end_iso)
    
                event = {
                    "summary": title,
                    "description": description,
                    # タイムゾーンは日本時間に固定（必要ならユーザー設定に）
                    "start": {"dateTime": start_rfc3339, "timeZone": "Asia/Tokyo"},
                    "end": {"dateTime": end_rfc3339, "timeZone": "Asia/Tokyo"},
                }
                created = service.events().insert(calendarId="primary", body=event).execute()
                return created
            except HttpError as e:
                try:
                    error_details = json.loads(e.content.decode('utf-8'))
                    error_message = error_details.get('error', {}).get('message', 'Unknown error')
                    print(f"[ERROR] Google Calendar API error in add_event: {error_details}")
                    raise Exception(f"Google Calendar API Error: {error_message}") from e
                except (json.JSONDecodeError, AttributeError):
                    error_message = str(e)
                    print(f"[ERROR] Google Calendar API error in add_event (could not parse error content): {error_message}")
                    raise Exception(f"Google Calendar API Error: {error_message}") from e
            except Exception as e:
                # その他の例外
                print(f"[ERROR] An unexpected error occurred in add_event: {e}")
                raise
    
        def delete_event(self, user_id: str, event_id: str):
            service = self._build_service(user_id, "calendar", "v3")
            event_to_delete = service.events().get(calendarId="primary", eventId=event_id).execute()
            service.events().delete(calendarId="primary", eventId=event_id).execute()
            return {"status": "deleted", "id": event_id, "event": event_to_delete}
    
    
        def list_events(self, user_id: str, time_min: str | None = None, time_max: str | None = None, max_results: int = 50):
            service = self._build_service(user_id, "calendar", "v3")
    
            # time_minとtime_maxがJSTのISO形式で渡されることを想定し、UTCに変換
            if time_min:
                try:
                    # 'Z' がない場合があるため、一度 naive な datetime オブジェクトとしてパースし、JSTとしてローカライズ
                    dt_obj_naive = datetime.fromisoformat(time_min.replace('Z', ''))
                    dt_obj_jst = JST.localize(dt_obj_naive, is_dst=None)
                    time_min_utc = dt_obj_jst.astimezone(pytz.utc).isoformat()
                except ValueError:
                    # パースに失敗した場合はそのまま渡す（API側でエラーになる可能性あり）
                    time_min_utc = time_min
            else:
                # デフォルトは現在時刻から
                time_min_utc = datetime.utcnow().isoformat() + "Z"
    
            if time_max:
                try:
                    # 'Z' がない場合があるため、一度 naive な datetime オブジェクトとしてパースし、JSTとしてローカライズ
                    dt_obj_naive = datetime.fromisoformat(time_max.replace('Z', ''))
                    dt_obj_jst = JST.localize(dt_obj_naive, is_dst=None)
                    time_max_utc = dt_obj_jst.astimezone(pytz.utc).isoformat()
                except ValueError:
                    # パースに失敗した場合はそのまま渡す（API側でエラーになる可能性あり）
                    time_max_utc = time_max
            else:
                # デフォルトは現在時刻から7日後
                time_max_utc = (datetime.utcnow() + timedelta(days=7)).isoformat() + "Z"
                
            events_result = service.events().list(
                calendarId="primary",
                timeMin=time_min_utc,
                timeMax=time_max_utc,
                maxResults=max_results,
                singleEvents=True,
                orderBy="startTime",
            ).execute()
            items = events_result.get("items", [])
            return items
    
        def update_event(self, user_id: str, event_id: str, new_start_iso: str | None = None, new_end_iso: str | None = None,
                         new_summary: str | None = None, new_description: str | None = None):
            service = self._build_service(user_id, "calendar", "v3")
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
            return {"status": "updated", "original_event": original_event, "updated_event": updated}
        """
