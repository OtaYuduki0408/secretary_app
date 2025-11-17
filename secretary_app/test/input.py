from supabase import create_client
import os

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_ANON_KEY")

supabase = create_client(url, key)

# 例: actions にレコードを追加
data = {
    "user_id": "ユーザーID",
    "type": "test",
    "payload": {"message": "Hello"},
    "handled": False
}

res = supabase.table("actions").insert(data).execute()
print(res)
