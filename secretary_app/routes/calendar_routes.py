from flask import Blueprint, request, jsonify, session
from services.google_calendar_service import GoogleCalendarService

# Blueprintを作成
calendar_bp = Blueprint('calendar_bp', __name__)

# ユーザーIDをセッションから取得する補助関数
def _get_user_id():
    user = session.get('user')
    if not user or not user.get('id'):
        return None
    return user.get('id')

def _get_service():
    user_id = _get_user_id()
    if not user_id:
        return None
    return GoogleCalendarService(user_id)

@calendar_bp.route('/api/local_calendar/events', methods=['POST'])
def handle_add_event():
    service = _get_service()
    if not service:
        return jsonify({"error": "User not authenticated"}), 401

    data = request.get_json()
    if not data or not data.get('title') or not data.get('start_time') or not data.get('end_time'):
        return jsonify({"error": "Missing required fields"}), 400

    try:
        new_event = service.add_event(
            title=data['title'],
            start_time=data['start_time'],
            end_time=data['end_time'],
            description=data.get('description', '')
        )
        return jsonify(new_event), 201
    except RuntimeError as e:
        if str(e) == "not_authenticated":
            return jsonify({"error": "Google authentication required"}), 403
        return jsonify({"error": str(e)}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

from datetime import datetime, timezone

@calendar_bp.route('/api/local_calendar/events', methods=['GET'])
def handle_get_events():
    service = _get_service()
    if not service:
        return jsonify({"error": "User not authenticated"}), 401
    
    # フロントからは time_min/time_max が渡される場合もある（FullCalendar）
    time_min = request.args.get('start') # FullCalendarは 'start' と 'end' で送ってくる
    time_max = request.args.get('end')
    
    try:
        events = service.list_events(time_min=time_min, time_max=time_max)
        return jsonify(events)
    except RuntimeError as e:
        if str(e) == "not_authenticated":
            return jsonify({"error": "Google authentication required"}), 403
        return jsonify({"error": str(e)}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@calendar_bp.route('/api/local_calendar/events/<string:event_id>', methods=['PUT'])
def handle_update_event(event_id):
    service = _get_service()
    if not service:
        return jsonify({"error": "User not authenticated"}), 401

    data = request.get_json()
    if not data:
        return jsonify({"error": "No update data provided"}), 400

    try:
        updated_event = service.update_event(
            event_id=event_id,
            title=data.get('title'),
            start_time=data.get('start_time'),
            end_time=data.get('end_time'),
            description=data.get('description')
        )
        return jsonify(updated_event)
    except RuntimeError as e:
        if str(e) == "not_authenticated":
            return jsonify({"error": "Google authentication required"}), 403
        return jsonify({"error": str(e)}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@calendar_bp.route('/api/local_calendar/events/<string:event_id>', methods=['DELETE'])
def handle_delete_event(event_id):
    service = _get_service()
    if not service:
        return jsonify({"error": "User not authenticated"}), 401

    try:
        success = service.delete_event(event_id)
        if not success:
            return jsonify({"error": "Event not found"}), 404
        return jsonify({"message": "Event deleted successfully"}), 200
    except RuntimeError as e:
        if str(e) == "not_authenticated":
            return jsonify({"error": "Google authentication required"}), 403
        return jsonify({"error": str(e)}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500
