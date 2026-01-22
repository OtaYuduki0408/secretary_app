from supabase_client import supabase

TABLE_NAME = "user_settings"


def get_user_settings(user_id: str) -> dict | None:
    if not user_id:
        return None
    response = (
        supabase.table(TABLE_NAME)
        .select("settings_json")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if response.data and len(response.data) > 0:
        return response.data[0].get("settings_json") or {}
    return None


def upsert_user_settings(user_id: str, settings: dict) -> dict:
    payload = {
        "user_id": user_id,
        "settings_json": settings,
    }
    response = (
        supabase.table(TABLE_NAME)
        .upsert(payload, on_conflict="user_id")
        .execute()
    )
    return response.data[0] if response.data else {}
