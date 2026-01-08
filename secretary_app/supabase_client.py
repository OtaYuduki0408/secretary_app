import os
from supabase import create_client, Client

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# --- START: デバッグ用のPRINT文 ---
print("--- [DEBUG] Initializing Supabase Client ---")
print(f"SUPABASE_URL: {SUPABASE_URL}")
if SUPABASE_KEY:
    # キー全体をログに出さないように、一部だけ表示
    print(f"SUPABASE_KEY (partial): {SUPABASE_KEY[:5]}...{SUPABASE_KEY[-5:]}")
else:
    print("SUPABASE_KEY: NOT SET")
print("------------------------------------------")
# --- END: デバッグ用のPRINT文 ---

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("SUPABASE_URL と SUPABASE_KEY を環境変数に設定してください。")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

