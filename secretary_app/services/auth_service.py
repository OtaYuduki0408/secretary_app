from supabase_client import supabase
from datetime import datetime

# プロフィールテーブル（public.users）
TABLE_PROFILES = "users"


def register_user(name: str, email: str, password: str):
    """
    Supabase Auth でユーザーを作成し、public.users にプロフィールを作成する。
    - auth.users.id を public.users.id として参照整合させる
    - email は auth 側で管理し、profiles には name のみ保存
    """
    try:
        # 既存ユーザー確認（Admin API）
        try:
            exist = supabase.auth.admin.get_user_by_email(email)
            if exist and getattr(exist, "user", None):
                # ユーザーが見つかった場合
                return {"error": "このメールアドレスは既に登録されています。"}
        except Exception as e:
            # get_user_by_email がエラーを投げた場合 (例: 存在しないメールアドレス)
            # ここではユーザーが存在しないと判断し、処理を続行
            pass

        # 管理者としてユーザー作成（メール確認済みにする）
        created = supabase.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True,
        })

        user_obj = getattr(created, "user", None) or created
        user_id = getattr(user_obj, "id", None)
        if not user_id:
            return {"error": "ユーザー作成に失敗しました。"}

        # プロフィール新規作成（id は auth.users の id）
        prof = supabase.table(TABLE_PROFILES).insert({
            "id": user_id,
            "name": name,
        }).execute()

        if getattr(prof, "error", None):
            # プロフィール作成失敗時は auth 側をクリーンアップ
            try:
                supabase.auth.admin.delete_user(user_id)
            except Exception:
                pass
            return {"error": f"プロフィール作成に失敗しました: {getattr(prof, 'error', '')}"}

    except Exception as e:
        return {"error": str(e)}


def login_user(email: str, password: str):
    """
    Supabase Auth でログインし、プロフィール情報を返す。
    セッション自体はフロントで保持せず、サーバー側セッションに最低限の情報を格納。
    """
    try:
        res = supabase.auth.sign_in_with_password({
            "email": email,
            "password": password,
        })

        user_obj = getattr(res, "user", None)
        session = getattr(res, "session", None)
        if not user_obj:
            return {"error": "認証に失敗しました。"}

        user_id = getattr(user_obj, "id", None)
        if not user_id:
            return {"error": "ユーザーIDを取得できませんでした。"}

        # プロフィール取得（存在しない場合は最小限で自動作成）
        prof_res = supabase.table(TABLE_PROFILES).select("*").eq("id", user_id).execute()
        profile = prof_res.data[0] if prof_res.data else None
        if not profile:
            fallback_name = (getattr(user_obj, "user_metadata", {}) or {}).get("name") or ""
            supabase.table(TABLE_PROFILES).insert({
                "id": user_id,
                "name": fallback_name,
            }).execute()
            profile = {"id": user_id, "name": fallback_name}

        return {
            "message": "ログイン成功",
            "user": {
                "id": user_id,
                "email": getattr(user_obj, "email", email),
                "name": profile.get("name", ""),
            },
            "session": bool(session),
        }
    except Exception as e:
        return {"error": str(e)}

