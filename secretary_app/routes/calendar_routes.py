from flask import Blueprint, request, jsonify, session
from services import local_calendar_service
from datetime import datetime
import pytz

# Blueprintを作成
calendar_bp = Blueprint('calendar_bp', __name__)

# JST (Asia/Tokyo) タイムゾーンを定義
JST = pytz.timezone('Asia/Tokyo')

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
        # クライアントから送られてきた時刻文字列をJSTとしてパースし、UTCに変換
        # datetime.fromisoformatはタイムゾーン情報がない場合はnaiveなdatetimeを生成する
        # ここではクライアントからの時刻はJSTを意図していると仮定する
        start_time_naive = datetime.fromisoformat(data['start_time'].replace('Z', ''))
        end_time_naive = datetime.fromisoformat(data['end_time'].replace('Z', ''))

        # naiveなdatetimeオブジェクトをJSTのawareなdatetimeオブジェクトに変換
        start_time_jst = JST.localize(start_time_naive, is_dst=None)
        end_time_jst = JST.localize(end_time_naive, is_dst=None)

        # JSTからUTCに変換
        start_time_utc = start_time_jst.astimezone(pytz.utc)
        end_time_utc = end_time_jst.astimezone(pytz.utc)
        
        new_event = local_calendar_service.add_event(
            user_id=user_id,
            title=data['title'],
            start_time=start_time_utc,
            end_time=end_time_utc,
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
        # イベント取得時もタイムゾーンを考慮してUTCでパース
        if start_time_iso:
            start_time_utc = datetime.fromisoformat(start_time_iso.replace('Z', '+00:00')).astimezone(pytz.utc)
        else:
            start_time_utc = None

        if end_time_iso:
            end_time_utc = datetime.fromisoformat(end_time_iso.replace('Z', '+00:00')).astimezone(pytz.utc)
        else:
            end_time_utc = None

        events = local_calendar_service.get_events(user_id, start_time_utc, end_time_utc)
        
        # クライアントへの応答時にはJSTに変換して返す
        # to_dict() メソッドがタイムゾーン変換を適切に行うことを前提とするか、
        # ここで一つずつ変換して返す必要がある
        # 現時点では local_calendar_service.py の to_dict() での対応を期待
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
        # 更新データ内の時刻情報もJSTとしてパースしUTCに変換
        if 'start_time' in data and isinstance(data['start_time'], str):
            start_time_naive = datetime.fromisoformat(data['start_time'].replace('Z', ''))
            start_time_jst = JST.localize(start_time_naive, is_dst=None)
            data['start_time'] = start_time_jst.astimezone(pytz.utc)
        if 'end_time' in data and isinstance(data['end_time'], str):
            end_time_naive = datetime.fromisoformat(data['end_time'].replace('Z', ''))
            end_time_jst = JST.localize(end_time_naive, is_dst=None)
            data['end_time'] = end_time_jst.astimezone(pytz.utc)
        
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
