import os
import hashlib
import hmac
import base64
import uuid
import time
import requests

# ----- トークンとシークレットを環境変数から取得 -----
token = os.getenv("SWITCHBOT_TOKEN")
secret = os.getenv("SWITCHBOT_SECRET")

if not token or not secret:
    raise ValueError("環境変数 SWITCHBOT_TOKEN または SWITCHBOT_SECRET が設定されていません。")

# ----- 署名作成 -----
def create_headers():
    nonce = uuid.uuid4().hex
    t = int(round(time.time() * 1000))
    string_to_sign = f"{token}{t}{nonce}".encode("utf-8")
    secret_bytes = secret.encode("utf-8")

    sign = base64.b64encode(
        hmac.new(secret_bytes, msg=string_to_sign, digestmod=hashlib.sha256).digest()
    )

    return {
        "Authorization": token,
        "t": str(t),
        "sign": sign.decode(),
        "nonce": nonce,
        "Content-Type": "application/json; charset=utf8",
    }

# ----- デバイス一覧取得 -----
url = "https://api.switch-bot.com/v1.1/devices"
headers = create_headers()
response = requests.get(url, headers=headers)
data = response.json()

device_list = data["body"]["deviceList"]

# ----- デバイス名だけのリスト -----
device_names = [device["deviceName"] for device in device_list]

# ----- 名前→ID の辞書 -----
device_name_id_map = {device["deviceName"]: device["deviceId"] for device in device_list}

# ----- 出力 -----
print("デバイス名リスト:")
for name in device_names:
    print("-", name)

print("\n名前 → ID の辞書:")
for name, dev_id in device_name_id_map.items():
    print(f"- {name}: {dev_id}")
