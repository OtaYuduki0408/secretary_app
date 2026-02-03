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
    device_list = []
    if 'body' in devices_response and 'deviceList' in devices_response['body']:
        for device in devices_response['body']['deviceList']:
            # 'Bot' (ボット) デバイスのみをフィルタリングする
            # 他のデバイスタイプも必要な場合は、このif文を調整または削除
            if device.get('deviceType') == 'Bot':
                device_list.append({
                    "deviceId": device.get('deviceId'),
                    "deviceName": device.get('deviceName')
                })

    return jsonify(device_list)
