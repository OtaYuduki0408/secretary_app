from supabase_client import supabase
from werkzeug.security import generate_password_hash, check_password_hash

TABLE_USERS = "users"  
TABLE_AUTH = "auth"    


# ✅ ユーザー登録
def register_user(name, email, password):
    # 既に登録済みか確認
    exists = supabase.table(TABLE_USERS).select("email").eq("email", email).execute()
    if exists.data:
        return {"error": "このメールアドレスはすでに登録されています。"}

    # users に登録
    user_res = supabase.table(TABLE_USERS).insert({
        "name": name,
        "email": email
    }).execute()

    if not user_res.data:
        return {"error": "ユーザー登録に失敗しました。"}

    user_id = user_res.data[0]["id"]

    # パスワードをハッシュ化
    hashed_password = generate_password_hash(password)

    # auth に登録
    auth_res = supabase.table(TABLE_AUTH).insert({
        "user_id": user_id,
        "password_hash": hashed_password,
        "salt": ""  # werkzeug では内部でソルトを扱うため空文字でもOK
    }).execute()

    if not auth_res.data:
        return {"error": "認証情報の登録に失敗しました。"}

    return {"message": "登録完了", "user_id": user_id}


# ✅ ログイン
def login_user(email, password):
    # email から users を検索
    user_res = supabase.table(TABLE_USERS).select("*").eq("email", email).execute()
    if not user_res.data:
        return {"error": "ユーザーが見つかりません。"}

    user = user_res.data[0]
    user_id = user["id"]

    # auth テーブルから password_hash を取得
    auth_res = supabase.table(TABLE_AUTH).select("password_hash").eq("user_id", user_id).execute()
    if not auth_res.data:
        return {"error": "パスワード情報が見つかりません。"}

    stored_hash = auth_res.data[0]["password_hash"]

    # パスワード照合
    if not check_password_hash(stored_hash, password):
        return {"error": "パスワードが正しくありません。"}

    return {"message": "ログイン成功", "user": user}
