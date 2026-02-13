import os
from flask import Blueprint, request, jsonify, session, current_app
from services import switchbot_service
from .command_manager import (
    get_all_commands,
    register_command,
    update_command,
    delete_command
)
from datetime import datetime
import pytz
from order.evaluator import enrich_single_action

command_bp = Blueprint("command", __name__)

# ... (他のルート) ...

@command_bp.route("/actions/execute/switchbot", methods=["POST"])
def api_execute_switchbot_action():
    data = request.get_json()
    print(f"[EXECUTE_SWITCHBOT] Received data: {data}")

    user_id = data.get('user_id')
    detail = data.get('detail')

    if not user_id or not detail:
        print(f"[EXECUTE_SWITCHBOT] FAILED: user_id or detail is missing.")
        return jsonify({"error": "Invalid request"}), 400
    
    print(f"[EXECUTE_SWITCHBOT] PASSED: user_id and detail are present.")

    try:
        # 環境変数からトークンとシークレットを取得
        token = os.getenv('SWITCHBOT_TOKEN')
        secret = os.getenv('SWITCHBOT_SECRET')

        if not token or not secret:
            print(f"[EXECUTE_SWITCHBOT] FAILED: SwitchBot token or secret is missing in environment variables.")
            return jsonify({"error": "SwitchBot API key not configured in server environment."}), 500

        device_id = detail.get('deviceId')
        command = detail.get('action')
        command_type = detail.get('commandType') or 'command'
        parameter = detail.get('parameter') or 'default'

        if not device_id or not command:
            print(f"[EXECUTE_SWITCHBOT] FAILED: deviceId or action is missing in detail. deviceId: {device_id is not None}, action: {command is not None}")
            return jsonify({"error": "deviceId and action are required"}), 400
        
        print("[EXECUTE_SWITCHBOT] PASSED: All checks are complete. Sending command...")

        api_command = command
        result = switchbot_service.send_device_command(
            api_token=token, api_secret=secret, device_id=device_id,
            command_type=command_type, command=api_command, parameter=parameter
        )
        
        return jsonify(result)

    except Exception as e:
        print(f"[ERROR] in api_execute_switchbot_action: {e}")
        return jsonify({"error": f"An internal error occurred: {str(e)}"}), 500
