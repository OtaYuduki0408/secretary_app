from flask import Blueprint, request, jsonify, session
from services import local_calendar_service
from datetime import datetime

# Blueprintを作成
calendar_bp = Blueprint('calendar_bp', __name__)

# ユーザーIDをセッションから取得する補助関数
def _get_user_id():
    # session['user']['id'] から取得することを想定
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
        # Replace 'Z' with '+00:00' for reliable parsing
        start_time_str = data['start_time'].replace('Z', '+00:00')
        end_time_str = data['end_time'].replace('Z', '+00:00')
        
        start_time = datetime.fromisoformat(start_time_str)
        end_time = datetime.fromisoformat(end_time_str)
        
        new_event = local_calendar_service.add_event(
            user_id=user_id,
            title=data['title'],
            start_time=start_time,
            end_time=end_time,
            description=data.get('description')
        )
        return jsonify(new_event), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@calendar_bp.route('/api/local_calendar/events', methods=['GET'])
def handle_get_events():
    user_id = _get_user_id()
    if not user_id:
        return jsonify({"error": "User not authenticated"}), 401
    
    start_time_iso = request.args.get('start_time')
    end_time_iso = request.args.get('end_time')

    try:
        events = local_calendar_service.get_events(user_id, start_time_iso, end_time_iso)
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
