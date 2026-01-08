import os
from supabase import create_client, Client

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# --- DEBUG ---
print("--- DEBUG INFORMATION ---")
print(f"URL: '{SUPABASE_URL}'")
print(f"KEY IS SET: {'Yes' if SUPABASE_KEY else 'No'}")
print("-------------------------")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("SUPABASE_URL と SUPABASE_KEY を環境変数に設定してください。")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

