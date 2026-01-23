#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
SwitchBot人感センサーの状態を毎秒取得して表示する簡易スクリプト。

必要な環境変数:
  SWITCHBOT_TOKEN
  SWITCHBOT_SECRET
  SWITCHBOT_MOTION_DEVICE_ID  (任意: 引数で指定も可)
"""

import os
import sys
import time
from datetime import datetime

import requests

# services/switchbot_service.py と同等の署名処理
import hashlib
import hmac
import base64
import uuid


SWITCHBOT_API_BASE_URL = "https://api.switch-bot.com"


def generate_sign(token: str, secret: str) -> dict:
    """SwitchBot APIの署名を生成する。"""
    nonce = str(uuid.uuid4().hex)
    t = str(int(round(time.time() * 1000)))
    string_to_sign = f"{token}{t}{nonce}".encode("utf-8")
    secret_bytes = secret.encode("utf-8")

    sign = base64.b64encode(
        hmac.new(secret_bytes, msg=string_to_sign, digestmod=hashlib.sha256).digest()
    ).decode("utf-8")

    return {
        "Authorization": token,
        "sign": sign,
        "nonce": nonce,
        "t": t,
        "Content-Type": "application/json; charset=utf8",
    }


def get_device_status(api_token: str, api_secret: str, device_id: str) -> dict:
    """SwitchBotデバイスのステータスを取得する。"""
    headers = generate_sign(api_token, api_secret)
    url = f"{SWITCHBOT_API_BASE_URL}/v1.1/devices/{device_id}/status"
    try:
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        return {"statusCode": 500, "message": str(e)}


def get_devices(api_token: str, api_secret: str) -> dict:
    """SwitchBotデバイス一覧を取得する。"""
    headers = generate_sign(api_token, api_secret)
    url = f"{SWITCHBOT_API_BASE_URL}/v1.1/devices"
    try:
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        return {"statusCode": 500, "message": str(e)}


def select_device_from_list(devices):
    """デバイス一覧からユーザーに選択させる。"""
    if not devices:
        return None
    print("利用可能なデバイス:")
    for idx, device in enumerate(devices, start=1):
        name = device.get("name") or device.get("deviceName") or "名前未設定"
        dtype = device.get("type") or device.get("deviceType") or "不明"
        did = device.get("id") or device.get("deviceId") or ""
        print(f"{idx}. {name} ({dtype}) id={did}")
    while True:
        raw = input("使用するデバイス番号を入力してください: ").strip()
        if not raw:
            continue
        if not raw.isdigit():
            print("数字で入力してください。")
            continue
        choice = int(raw)
        if 1 <= choice <= len(devices):
            selected = devices[choice - 1]
            return selected.get("id") or selected.get("deviceId")
        print("範囲外です。")


def extract_motion_detected(status_body: dict):
    """人感センサーの検知状態を推定する。"""
    if not isinstance(status_body, dict):
        return None
    for key in [
        "motionDetected",
        "moveDetected",
        "detected",
        "isMotionDetected",
        "isDetected",
        "motion",
        "moving",
        "presence",
        "pir",
    ]:
        if key in status_body:
            value = status_body.get(key)
            if isinstance(value, bool):
                return value
            if isinstance(value, (int, float)):
                return value != 0
            if isinstance(value, str):
                normalized = value.strip().lower()
                if normalized in ("true", "1", "yes", "on", "detected", "motion"):
                    return True
                if normalized in ("false", "0", "no", "off", "none", "clear"):
                    return False
    status_text = status_body.get("status")
    if isinstance(status_text, str):
        normalized = status_text.strip().lower()
        if "detect" in normalized or "motion" in normalized:
            return True
        if normalized in ("normal", "clear", "no motion", "inactive"):
            return False
    return None


def main():
    api_token = os.getenv("SWITCHBOT_TOKEN")
    api_secret = os.getenv("SWITCHBOT_SECRET")
    device_id = os.getenv("SWITCHBOT_MOTION_DEVICE_ID")

    if len(sys.argv) >= 2:
        device_id = sys.argv[1]

    if not api_token or not api_secret:
        print("SWITCHBOT_TOKEN / SWITCHBOT_SECRET が設定されていません。")
        sys.exit(1)
    if not device_id:
        devices_resp = get_devices(api_token, api_secret)
        if devices_resp.get("statusCode") != 100:
            print(f"デバイス一覧の取得に失敗しました: {devices_resp.get('message')}")
            sys.exit(1)
        body = devices_resp.get("body") or {}
        device_list = body.get("deviceList") or []
        infrared_list = body.get("infraredRemoteList") or []
        formatted = []
        for d in device_list:
            formatted.append({
                "name": d.get("deviceName"),
                "type": d.get("deviceType"),
                "id": d.get("deviceId")
            })
        for r in infrared_list:
            formatted.append({
                "name": r.get("deviceName"),
                "type": r.get("remoteType"),
                "id": r.get("deviceId")
            })
        device_id = select_device_from_list(formatted)
        if not device_id:
            print("デバイスが選択されませんでした。")
            sys.exit(1)

    print(f"監視開始: device_id={device_id}")
    while True:
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        status = get_device_status(api_token, api_secret, device_id)
        if status.get("statusCode") != 100:
            print(f"[{now}] statusCode={status.get('statusCode')} error={status.get('message')}")
        else:
            body = status.get("body", {})
            detected = extract_motion_detected(body)
            print(f"[{now}] motion_detected={detected} raw={body}")
        time.sleep(1)


if __name__ == "__main__":
    main()
