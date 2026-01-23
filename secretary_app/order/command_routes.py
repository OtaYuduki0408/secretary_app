from flask import Blueprint, request, jsonify
import os
from services import switchbot_service
from .command_manager import (
    get_all_commands,
    register_command,
    update_command,
    delete_command
)

command_bp = Blueprint("command", __name__)

# ============================
# APIルート
# ============================

@command_bp.route("/")
def index():
    return jsonify({"message": "命令管理システムAPI（Supabase版）稼働中"})


# ----------------------------
# 全コマンド取得
# ----------------------------
@command_bp.route("/commands", methods=["GET"])
def api_get_commands():
    try:
        commands = get_all_commands()
        return jsonify({"status": "success", "data": commands})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# ----------------------------
# コマンド登録
# ----------------------------
@command_bp.route("/commands", methods=["POST"])
def api_add_command():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"status": "error", "message": "データがありません"}), 400

        cmd = register_command(**data)
        return jsonify({"status": "success", "data": cmd})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# ----------------------------
# コマンド更新
# ----------------------------
@command_bp.route("/commands/<int:command_id>", methods=["PUT"])
def api_update_command(command_id):
    try:
        data = request.get_json()
        if not data:
            return jsonify({"status": "error", "message": "更新データがありません"}), 400

        ok = update_command(command_id, data)
        if ok:
            return jsonify({"status": "success", "message": "更新完了"})
        else:
            return jsonify({"status": "error", "message": "更新失敗"}), 404
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# ----------------------------
# コマンド削除
# ----------------------------
@command_bp.route("/commands/<int:command_id>", methods=["DELETE"])
def api_delete_command(command_id):
    try:
        ok = delete_command(command_id)
        if ok:
            return jsonify({"status": "success", "message": "削除完了"})
        else:
            return jsonify({"status": "error", "message": "削除対象が存在しません"}), 404
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@command_bp.route("/switchbot/devices", methods=["GET"])
def api_switchbot_devices():
    api_token = os.getenv("SWITCHBOT_TOKEN")
    api_secret = os.getenv("SWITCHBOT_SECRET")
    if not api_token or not api_secret:
        return jsonify({"devices": [], "error": "SwitchBot API credentials are not set."}), 400

    data = switchbot_service.get_switchbot_devices(api_token, api_secret)
    if not data or data.get("statusCode") != 100:
        return jsonify({"devices": [], "error": "Failed to fetch SwitchBot devices."}), 500

    body = data.get("body") or {}
    device_list = body.get("deviceList") or []
    infrared_list = body.get("infraredRemoteList") or []

    devices = []
    for device in device_list:
        devices.append({
            "name": device.get("deviceName"),
            "type": device.get("deviceType"),
            "id": device.get("deviceId"),
        })
    for remote in infrared_list:
        devices.append({
            "name": remote.get("deviceName"),
            "type": remote.get("remoteType"),
            "id": remote.get("deviceId"),
        })

    return jsonify({"devices": devices})
