import time
import hashlib
import hmac
import base64
import requests

# --- 1. ユーザー情報 (ここを利用者さんの情報に置き換えてください) ---
# SwitchBot API トークン
TOKEN = "87f70ffd2329f4e533761b77e0681f4200e99e6a4f84ff22525ab65a5d65358a41d1bf675b579cad88e885b06b010ce8" 
# クライアントシークレット
SECRET = "034a7fe15be770c6bfe5c01af23691e8" 
# 操作したいBotのデバイスID
DEVICE_ID = "E13D0486756A" 

# --- 2. 認証のための署名（Sign）生成 ---
# 現在時刻のミリ秒単位のタイムスタンプを取得
t = int(round(time.time() * 1000))
# ノンス（一度限りの値）として、タイムスタンプを文字列として使用
nonce = str(t)
# シークレット、タイムスタンプ、ノンスを結合
string_to_sign = f"{TOKEN}{t}{nonce}"

# HMAC-SHA256で署名（Sign）を生成
# base64エンコードされたバイトデータを文字列にデコード
sign = base64.b64encode(
    hmac.new(
        bytes(SECRET, "utf-8"),
        bytes(string_to_sign, "utf-8"),
        hashlib.sha256
    ).digest()
).decode("utf-8")

# --- 3. APIリクエストの実行 ---

# APIエンドポイント (コマンド送信)
url = f"https://api.switch-bot.com/v1.1/devices/{DEVICE_ID}/commands"

# リクエストヘッダー
headers = {
    "Authorization": TOKEN,
    "sign": sign,
    "t": str(t),
    "nonce": nonce,
    "Content-Type": "application/json; charset=utf8"
}

# リクエストボディ（BotをONにするコマンド）
# 'press'はBotがボタンを押す操作（物理的なスイッチを押す）
# 'turnOn'はON/OFFスイッチをONにする操作
# ここでは物理的なボタンを押す操作（Botの基本動作）として 'press' を使用します。
body = {
    "command": "turnOn",
    "parameter": "default",
    "commandType": "command"
}

print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] SwitchBot Bot (ID: {DEVICE_ID}) に 'press' コマンドを送信中...")

try:
    # POSTリクエストの送信
    response = requests.post(url, headers=headers, json=body)
    response.raise_for_status() # HTTPエラー（4xx, 5xx）があれば例外を発生させる

    # レスポンスの確認
    data = response.json()
    
    print("--- APIレスポンス ---")
    print(data)
    
    # 成功判定
    if data.get("statusCode") == 100:
        print("\n✅ **操作成功！** SwitchBot Botが押されました。")
    else:
        print(f"\n❌ **操作失敗。** ステータスコード: {data.get('statusCode')}, メッセージ: {data.get('message')}")

except requests.exceptions.RequestException as e:
    print(f"\n致命的なリクエストエラーが発生しました: {e}")