import os
from supabase import create_client, Client
from dotenv import load_dotenv

# .envファイルの読み込み
if not load_dotenv():
    print("Warning: .env file not found")

# 環境変数の取得と検証
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# 必須の環境変数が設定されているか確認
if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Missing required environment variables: SUPABASE_URL and SUPABASE_KEY must be set")

# Supabaseクライアントの初期化
try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
except Exception as e:
    raise Exception(f"Failed to initialize Supabase client: {str(e)}")