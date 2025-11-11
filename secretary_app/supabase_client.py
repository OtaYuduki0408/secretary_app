import os
from supabase import create_client, Client
from dotenv import load_dotenv
 
load_dotenv()
 
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
 
# 環境変数がない場合はエラーを出す (念のためチェックを強化)
if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in the environment or .env file.")
 
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)