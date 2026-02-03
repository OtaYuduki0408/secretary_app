from flask import Blueprint, jsonify, session
from services.user_settings_service import get_user_settings
from services.switchbot_service import get_switchbot_devices

switchbot_bp = Blueprint("switchbot_api", __name__, url_prefix="/api/switchbot")

@switchbot_bp.route("/devices", methods=["GET"])
def list_devices():
    user = session.get('user')
    if not user or not user.get('id'):
        return jsonify({"error": "User not authenticated"}), 401
    user_id = user.get('id')

    settings = get_user_settings(user_id)
    if not settings:
        return jsonify({"error": "User settings not found"}), 404

    switchbot_token = settings.get('switchbot_token')
    switchbot_secret = settings.get('switchbot_secret')

    if not switchbot_token or not switchbot_secret:
        return jsonify({"error": "SwitchBot API token or secret not configured"}), 400

    devices_response = get_switchbot_devices(switchbot_token, switchbot_secret)

    if devices_response.get("statusCode") != 100:
        return jsonify({"error": "Failed to get devices from SwitchBot API", "details": devices_response.get("message")}), 502

    # 必要な情報だけを抽出してフロントに返す
    device_list = []
    if 'body' in devices_response and 'deviceList' in devices_response['body']:
        for device in devices_response['body']['deviceList']:
            # 'Bot' (ボット) デバイスのみをフィルタリングする
            if device.get('deviceType') == 'Bot':
                device_list.append({
                    "deviceId": device.get('deviceId'),
                    "deviceName": device.get('deviceName')
                })

    return jsonify(device_list)
