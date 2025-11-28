from datetime import datetime
from supabase_client import supabase  # 共通クライアント

TABLE_PROFILES = "users"  # public.users（プロフィール）


# 全ユーザー取得（profiles）
def get_all_users():
    try:
        response = supabase.table(TABLE_PROFILES).select("*").execute()
        return response.data
    except Exception as e:
        return {"error": str(e)}


# メールで特定ユーザー取得（auth.users を Admin API で引き当て → profiles 参照）
def get_user_by_email(email: str):
    try:
        u = supabase.auth.admin.get_user_by_email(email)
        user = getattr(u, "user", None) or u
        user_id = getattr(user, "id", None)
        if not user_id:
            return {"message": "User not found"}
        prof = supabase.table(TABLE_PROFILES).select("*").eq("id", user_id).execute()
        return prof.data[0] if prof.data else {"message": "Profile not found"}
    except Exception as e:
        return {"error": str(e)}


# 新規ユーザー登録（Admin API + profiles）
def add_user(data: dict):
    """
    data 例:
    {
      "email": "sample@example.com",
      "password": "Passw0rd!",
      "name": "Naoya"
    }
    """
    try:
        email = data.get("email")
        password = data.get("password")
        name = data.get("name", "")
        if not email or not password:
            return {"error": "email と password は必須です。"}

        created = supabase.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True,
        })
        user = getattr(created, "user", None) or created
        user_id = getattr(user, "id", None)
        if not user_id:
            return {"error": "ユーザー作成に失敗しました。"}

        prof = supabase.table(TABLE_PROFILES).insert({
            "id": user_id,
            "name": name,
        }).execute()
        if getattr(prof, "error", None):
            return {"error": f"プロフィール作成に失敗しました: {getattr(prof, 'error', '')}"}

        return {"message": "User added successfully", "data": prof.data}
    except Exception as e:
        return {"error": str(e)}


# ユーザー情報更新（email で auth.users を特定 → profiles 更新）
def update_user(email: str, new_data: dict):
    try:
        u = supabase.auth.admin.get_user_by_email(email)
        user = getattr(u, "user", None) or u
        user_id = getattr(user, "id", None)
        if not user_id:
            return {"error": "User not found"}

        allowed = {"name"}
        payload = {k: v for k, v in (new_data or {}).items() if k in allowed}
        if not payload:
            return {"error": "更新可能な項目がありません。"}

        payload["updated_at"] = datetime.utcnow().isoformat() + "Z"

        res = supabase.table(TABLE_PROFILES).update(payload).eq("id", user_id).execute()
        return {"message": "User updated", "data": res.data}
    except Exception as e:
        return {"error": str(e)}


# ユーザー削除（profiles → auth.users）
def delete_user(email: str):
    try:
        u = supabase.auth.admin.get_user_by_email(email)
        user = getattr(u, "user", None) or u
        user_id = getattr(user, "id", None)
        if not user_id:
            return {"error": "User not found"}

        # プロフィール削除
        supabase.table(TABLE_PROFILES).delete().eq("id", user_id).execute()
        # 認証ユーザー削除
        supabase.auth.admin.delete_user(user_id)

        return {"message": "User deleted"}
    except Exception as e:
        return {"error": str(e)}

