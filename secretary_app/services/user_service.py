from supabase_client import supabase  # ← app.py ではなく共通クライアントからimport

TABLE_NAME = "users"


# ✅ 全ユーザー取得
def get_all_users():
    try:
        response = supabase.table(TABLE_NAME).select("*").execute()
        return response.data
    except Exception as e:
        return {"error": str(e)}


# ✅ メールで特定ユーザーを取得
def get_user_by_email(email: str):
    try:
        response = supabase.table(TABLE_NAME).select("*").eq("email", email).execute()
        if response.data:
            return response.data[0]
        else:
            return {"message": "User not found"}
    except Exception as e:
        return {"error": str(e)}


# ✅ 新規ユーザー登録
def add_user(data: dict):
    """
    data = {
      "email": "sample@example.com",
      "name": "Naoya",
      "age": 25
    }
    """
    try:
        response = supabase.table(TABLE_NAME).insert(data).execute()
        return {"message": "User added successfully", "data": response.data}
    except Exception as e:
        return {"error": str(e)}


# ✅ ユーザー情報を更新
def update_user(email: str, new_data: dict):
    """
    new_data = {"name": "New Name"}
    """
    try:
        response = (
            supabase.table(TABLE_NAME)
            .update(new_data)
            .eq("email", email)
            .execute()
        )
        return {"message": "User updated", "data": response.data}
    except Exception as e:
        return {"error": str(e)}


# ✅ ユーザーを削除
def delete_user(email: str):
    try:
        response = supabase.table(TABLE_NAME).delete().eq("email", email).execute()
        return {"message": "User deleted", "data": response.data}
    except Exception as e:
        return {"error": str(e)}
