import os
import requests
import copy  # deepcopy 用

from services.official_commands import OFFICIAL_COMMANDS
from services.custom_order_service import create_order as create_custom_order

# プロフィールテーブル
TABLE_PROFILES = "users"

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("SUPABASE_URL と SUPABASE_KEY を環境変数に設定してください。")

AUTH_URL = f"{SUPABASE_URL}/auth/v1"
REST_URL = f"{SUPABASE_URL}/rest/v1"


def _auth_headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }


def _rest_headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def _rpc_get_user_id_by_email(email: str):
    url = f"{REST_URL}/rpc/get_user_id_by_email"
    payload = {"p_email": email}
    res = requests.post(url, headers=_rest_headers(), json=payload, timeout=10)
    if not res.ok:
        raise RuntimeError(f"RPC get_user_id_by_email failed: {res.status_code} {res.text}")
    return res.json()


def _auth_sign_up(email: str, password: str):
    url = f"{AUTH_URL}/signup"
    payload = {"email": email, "password": password}
    res = requests.post(url, headers=_auth_headers(), json=payload, timeout=10)
    if not res.ok:
        raise RuntimeError(f"Sign up failed: {res.status_code} {res.text}")
    return res.json()


def _auth_sign_in(email: str, password: str):
    url = f"{AUTH_URL}/token?grant_type=password"
    payload = {"email": email, "password": password}
    res = requests.post(url, headers=_auth_headers(), json=payload, timeout=10)
    if not res.ok:
        raise RuntimeError(f"Sign in failed: {res.status_code} {res.text}")
    return res.json()


def _profiles_insert(user_id: str, name: str):
    url = f"{REST_URL}/{TABLE_PROFILES}"
    payload = {"id": user_id, "name": name}
    res = requests.post(url, headers=_rest_headers(), json=payload, timeout=10)
    if not res.ok:
        raise RuntimeError(f"Insert profile failed: {res.status_code} {res.text}")
    return res.json()


def _profiles_get_by_id(user_id: str):
    url = f"{REST_URL}/{TABLE_PROFILES}?id=eq.{user_id}"
    res = requests.get(url, headers=_rest_headers(), timeout=10)
    if not res.ok:
        raise RuntimeError(f"Select profile failed: {res.status_code} {res.text}")
    data = res.json()
    return data[0] if data else None


def _auth_admin_delete(user_id: str):
    # service_role 以外では失敗するので、失敗は無視
    url = f"{AUTH_URL}/admin/users/{user_id}"
    res = requests.delete(url, headers=_auth_headers(), timeout=10)
    return res.ok


def register_user(name: str, email: str, password: str):
    """
    Supabase Auth でユーザーを作成し、public.users にプロフィールを作成する。
    """
    try:
        # 既存ユーザーの重複チェック (RPC)
        rpc_data = _rpc_get_user_id_by_email(email)
        if rpc_data:
            return {"error": "このメールアドレスは既に登録されています。"}

        # Auth 作成
        res = _auth_sign_up(email, password)
        user_obj = res.get("user") if isinstance(res, dict) else None
        session = res.get("session") if isinstance(res, dict) else None
        user_id = (user_obj or {}).get("id")
        if not user_id:
            return {"error": "ユーザー作成に失敗しました。"}

        # プロフィール登録
        try:
            _profiles_insert(user_id, name)
        except Exception as e:
            _auth_admin_delete(user_id)
            return {"error": f"プロフィール作成に失敗しました: {e}"}

        # 初期コマンドの登録
        for official_cmd_data in OFFICIAL_COMMANDS:
            result = create_custom_order(user_id, copy.deepcopy(official_cmd_data))
            if "error" in result:
                print(f"ERROR: 公式コマンド '{official_cmd_data.get('name')}' の登録に失敗しました: {result['error']}")

        return {
            "message": "登録成功",
            "user": {
                "id": user_id,
                "email": (user_obj or {}).get("email", email),
                "name": name,
            },
            "session": bool(session),
        }
    except Exception as e:
        return {"error": repr(e)}


def login_user(email: str, password: str):
    """
    Supabase Auth でログインし、プロフィール情報を返す。
    """
    try:
        res = _auth_sign_in(email, password)
        user_obj = res.get("user") if isinstance(res, dict) else None
        session = res.get("session") if isinstance(res, dict) else None
        if not user_obj:
            return {"error": "認証に失敗しました。"}

        user_id = (user_obj or {}).get("id")
        if not user_id:
            return {"error": "ユーザーIDが取得できませんでした。"}

        profile = _profiles_get_by_id(user_id)
        if not profile:
            fallback_name = (user_obj or {}).get("user_metadata", {}) or {}
            fallback_name = fallback_name.get("name") or ""
            _profiles_insert(user_id, fallback_name)
            profile = {"id": user_id, "name": fallback_name}

        return {
            "message": "ログイン成功",
            "user": {
                "id": user_id,
                "email": (user_obj or {}).get("email", email),
                "name": profile.get("name", ""),
            },
            "session": bool(session),
        }
    except Exception as e:
        return {"error": str(e)}
