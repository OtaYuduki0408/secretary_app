import asyncio
from supabase import create_client_async
import os

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_ANON_KEY")

async def main():
    supabase = create_client_async(url, key)

    async def handle_insert(payload):
        print("新しいレコード:", payload)

    # actions テーブルを購読
    subscription = supabase.realtime.channel("public:actions") \
        .on("postgres_changes", {
            "event": "INSERT",
            "schema": "public",
            "table": "actions"
        }, handle_insert) \
        .subscribe()

    print("購読開始")
    while True:
        await asyncio.sleep(1)

asyncio.run(main())
