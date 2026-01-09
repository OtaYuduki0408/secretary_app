import os

REQUIRED_ENV = [
    "GCP_API_KEY",
    "GEMINI_API_KEY",
    "SECRET_KEY",
    "SUPABASE_URL",
    "SUPABASE_KEY",
    "SWITCHBOT_TOKEN",
    "SWITCHBOT_SECRET",
]

print("=== ENV VALUES DUMP ===")

for key in REQUIRED_ENV:
    try:
        value = os.environ[key]   # 値をそのまま取得
        print(f"{key} = {value}")
    except KeyError:
        print(f"{key} = <NOT SET>")

print("=======================")
