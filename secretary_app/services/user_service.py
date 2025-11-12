from supabase_client import supabase

TABLE_NAME = "users"


# ✅ 全ユーザー取得
def get_all_users():
    try:
        response = supabase.table(TABLE_NAME).select("*").execute()
        return {"success": True, "data": response.data}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ✅ ID でユーザー取得（auth.users と紐づけ前提）
def get_user_by_id(user_id: str):
    try:
        response = supabase.table(TABLE_NAME).select("*").eq("id", user_id).execute()
        if response.data:
            return {"success": True, "data": response.data[0]}
        return {"success": False, "error": "User not found"}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ✅ 新規ユーザー追加（管理者用途）
def add_user(data: dict):
    try:
        response = supabase.table(TABLE_NAME).insert(data).execute()
        return {"success": True, "data": response.data}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ✅ ユーザー更新
def update_user(user_id: str, new_data: dict):
    try:
        response = supabase.table(TABLE_NAME).update(new_data).eq("id", user_id).execute()
        return {"success": True, "data": response.data}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ✅ ユーザー削除
def delete_user(user_id: str):
    try:
        response = supabase.table(TABLE_NAME).delete().eq("id", user_id).execute()
        return {"success": True, "data": response.data}
    except Exception as e:
        return {"success": False, "error": str(e)}
