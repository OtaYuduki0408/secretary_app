from supabase_client import supabase

# ✅ ユーザー登録
def register_user(name, email, password):
    try:
        # Supabase Auth でユーザー登録
        auth_res = supabase.auth.sign_up({
            "email": email,
            "password": password
        })

        if not auth_res or not auth_res.user:
            return {"success": False, "error": "認証登録に失敗しました。"}

        user_id = auth_res.user.id

        # 既に public.users に登録済みでないか確認
        existing = supabase.table("users").select("*").eq("id", user_id).execute()
        if not existing.data:
            supabase.table("users").insert({
                "id": user_id,   # auth.users.id と同じUUID
                "name": name,
                "email": email
            }).execute()

        return {"success": True, "message": "登録完了", "user_id": user_id}

    except Exception as e:
        return {"success": False, "error": str(e)}


# ✅ ログイン
def login_user(email, password):
    try:
        res = supabase.auth.sign_in_with_password({
            "email": email,
            "password": password
        })

        if not res or not res.user:
            return {"success": False, "error": "ログインに失敗しました。"}

        user = res.user
        user_id = user.id

        # public.users からプロフィールを取得
        profile_res = supabase.table("users").select("*").eq("id", user_id).execute()
        profile = profile_res.data[0] if profile_res.data else None

        return {
            "success": True,
            "message": "ログイン成功",
            "user": {
                "id": user_id,
                "email": user.email
            },
            "profile": profile
        }

    except Exception as e:
        return {"success": False, "error": str(e)}
