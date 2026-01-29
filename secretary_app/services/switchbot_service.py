# services/switchbot_service.py

import os
import requests
import json
import time
import hashlib
import hmac
import base64
import uuid

# SwitchBot APIのベースURL
SWITCHBOT_API_BASE_URL = "https://api.switch-bot.com"

def generate_sign(token: str, secret: str) -> dict:
    """
    SwitchBot APIの署名を生成する。
    """
    nonce = str(uuid.uuid4().hex) # uuidをインポートする必要がある
    t = str(int(round(time.time() * 1000)))
    string_to_sign = f"{token}{t}{nonce}".encode("utf-8")
    secret_bytes = secret.encode("utf-8")

    sign = base64.b64encode(
        hmac.new(secret_bytes, msg=string_to_sign, digestmod=hashlib.sha256).digest()
    ).decode('utf-8')

    return {
        'Authorization': token,
        'sign': sign,
        'nonce': nonce,
        't': t,
        'Content-Type': 'application/json; charset=utf8'
    }

def get_switchbot_devices(api_token: str, api_secret: str) -> dict:
    """
    SwitchBotのデバイスリストを取得する。
    """
    headers = generate_sign(api_token, api_secret)
    url = f"{SWITCHBOT_API_BASE_URL}/v1.1/devices"
    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status() # HTTPエラーが発生した場合に例外を発生させる
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"SwitchBotデバイス取得エラー: {e}")
        return {"statusCode": 500, "message": str(e)}

def send_device_command(api_token: str, api_secret: str, device_id: str, command_type: str, command: str, parameter: str = "default") -> dict:
    """
    SwitchBotデバイスにコマンドを送信する。
    """
    headers = generate_sign(api_token, api_secret)
    url = f"{SWITCHBOT_API_BASE_URL}/v1.1/devices/{device_id}/commands"
    payload = {
        "command": command,
        "parameter": parameter,
        "commandType": command_type
    }
    try:
        response = requests.post(url, headers=headers, json=payload)
        response.raise_for_status() # HTTPエラーが発生した場合に例外を発生させる
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"SwitchBotコマンド送信エラー: {e}")
        return {"statusCode": 500, "message": str(e)}

def get_device_status(api_token: str, api_secret: str, device_id: str) -> dict:
    """
    SwitchBotデバイスのステータスを取得する。
    """
    headers = generate_sign(api_token, api_secret)
    url = f"{SWITCHBOT_API_BASE_URL}/v1.1/devices/{device_id}/status"
    try:
        response = requests.get(url, headers=headers)
        if response.status_code == 429:
            return {"statusCode": 429, "message": "rate_limited"}
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        if hasattr(e, "response") and e.response is not None and e.response.status_code == 429:
            return {"statusCode": 429, "message": "rate_limited"}
        print(f"SwitchBotデバイス状態取得エラー: {e}")
        return {"statusCode": 500, "message": str(e)}
