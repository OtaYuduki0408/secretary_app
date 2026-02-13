import os
from flask import Blueprint, jsonify
from services.switchbot_service import get_switchbot_devices

switchbot_bp = Blueprint("switchbot_api", __name__, url_prefix="/api/switchbot")

@switchbot_bp.route("/devices", methods=["GET"])
def list_devices():
    # ユーザー設定からではなく、環境変数から直接キーを取得
    switchbot_token = os.getenv('SWITCHBOT_TOKEN')
    switchbot_secret = os.getenv('SWITCHBOT_SECRET')

    if not switchbot_token or not switchbot_secret:
        return jsonify({"error": "SwitchBot API token or secret not configured in server environment."}), 500

    devices_response = get_switchbot_devices(switchbot_token, switchbot_secret)

    if devices_response.get("statusCode") != 100:
        return jsonify({"error": "Failed to get devices from SwitchBot API", "details": devices_response.get("message")}), 502

    # 必要な情報だけを抽出してフロントに返す
    # Bot本体デバイス + Hub Mini配下の赤外線リモコンを統合する
    device_list = []
    body = devices_response.get('body') or {}

    # 本体デバイス
    for device in body.get('deviceList') or []:
        device_type = device.get('deviceType') or ''
        supported_actions = ['turnOn', 'turnOff', 'press'] if device_type == 'Bot' else ['turnOn', 'turnOff']
        device_list.append({
            "deviceId": device.get('deviceId'),
            "deviceName": device.get('deviceName'),
            "deviceType": device_type,
            "commandType": "command",
            "parameter": "default",
            "supportedActions": supported_actions,
        })

    # Hub Mini配下の赤外線リモコン
    for remote in body.get('infraredRemoteList') or []:
        remote_type = remote.get('remoteType') or 'InfraredRemote'
        device_list.append({
            "deviceId": remote.get('deviceId'),
            "deviceName": remote.get('deviceName'),
            "deviceType": remote_type,
            "commandType": "command",
            "parameter": "default",
            "supportedActions": ['turnOn', 'turnOff'],
        })

    return jsonify(device_list)
