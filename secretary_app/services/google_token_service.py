from typing import Optional, Dict, Any
from supabase_client import supabase

TABLE = "google_credentials"


def get_credentials(user_id: str) -> Optional[Dict[str, Any]]:
    """Supabase から対象ユーザーのGoogle認証情報(JSON)を取得する。"""
    user_id_str = str(user_id) if user_id is not None else None
    res = supabase.table(TABLE).select("credentials").eq("user_id", user_id_str).limit(1).execute()
    if getattr(res, "data", None):
        return res.data[0].get("credentials")
    return None


def upsert_credentials(user_id: str, credentials: Dict[str, Any]) -> None:
    """ユーザーのGoogle認証情報(JSON)を保存・更新する。"""
    payload = {"user_id": str(user_id) if user_id is not None else None, "credentials": credentials}
    supabase.table(TABLE).upsert(payload, on_conflict="user_id").execute()

