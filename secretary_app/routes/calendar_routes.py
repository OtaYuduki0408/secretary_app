from flask import Blueprint, request, jsonify, session
from services import local_calendar_service

# Blueprintを作成
calendar_bp = Blueprint('calendar_bp', __name__)

# ユーザーIDをセッションから取得する補助関数
def _get_user_id():
    user = session.get('user')
    if not user or not user.get('id'):
        return None
    return user.get('id')

@calendar_bp.route('/api/local_calendar/events', methods=['POST'])
def handle_add_event():
    user_id = _get_user_id()
    if not user_id:
        return jsonify({"error": "User not authenticated"}), 401

    data = request.get_json()
    if not data or not data.get('title') or not data.get('start_time') or not data.get('end_time'):
        return jsonify({"error": "Missing required fields"}), 400

    try:
        # タイムゾーン変換はサービス層に任せ、文字列をそのまま渡す
        new_event = local_calendar_service.add_event(
            user_id=user_id,
            title=data['title'],
            start_time=data['start_time'], # 文字列のまま
            end_time=data['end_time'],     # 文字列のまま
            description=data.get('description')
        )
        return jsonify(new_event), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

from datetime import datetime, timezone

@calendar_bp.route('/api/local_calendar/events', methods=['GET'])
def handle_get_events():
    user_id = _get_user_id()
    if not user_id:
        return jsonify({"error": "User not authenticated"}), 401
    
    # フロントからの日付範囲指定は無視し、常に現在時刻を開始点とする
    start_time_iso = datetime.now(timezone.utc).isoformat()
    
    try:
        # limit=6 を渡して直近6件を取得する
        events = local_calendar_service.get_events(user_id, start_time_iso=start_time_iso, end_time_iso=None, limit=6)
        return jsonify(events)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@calendar_bp.route('/api/local_calendar/events/<int:event_id>', methods=['PUT'])
def handle_update_event(event_id):
    user_id = _get_user_id()
    if not user_id:
        return jsonify({"error": "User not authenticated"}), 401

    data = request.get_json()
    if not data:
        return jsonify({"error": "No update data provided"}), 400

    try:
        # data には日時文字列が含まれていると想定し、そのまま渡す
        updated_event = local_calendar_service.update_event(event_id, user_id, **data)
        if not updated_event:
            return jsonify({"error": "Event not found or permission denied"}), 404
        return jsonify(updated_event)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@calendar_bp.route('/api/local_calendar/events/<int:event_id>', methods=['DELETE'])
def handle_delete_event(event_id):
    user_id = _get_user_id()
    if not user_id:
        return jsonify({"error": "User not authenticated"}), 401

    try:
        success = local_calendar_service.delete_event(event_id, user_id)
        if not success:
            return jsonify({"error": "Event not found or permission denied"}), 404
        return jsonify({"message": "Event deleted successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
