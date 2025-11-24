from flask import Blueprint, request, jsonify, current_app
from services import pending_action_service # pending_action_serviceを使用
from order.evaluator import evaluate_location_triggers # 新規作成する関数をインポート

webhook_bp = Blueprint("webhook", __name__, url_prefix='/webhook')

@webhook_bp.route('/location', methods=['POST'])
def location_webhook():
    """
    Androidアプリから位置情報を受け取り、場所トリガーを評価する。
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid data"}), 400

    user_id = data.get('user_id')
    latitude = data.get('latitude')
    longitude = data.get('longitude')
    # timestamp = data.get('timestamp') # 必要に応じて

    if not all([user_id, latitude, longitude]):
        return jsonify({"error": "Missing user_id, latitude, or longitude"}), 400

    # ここでEvaluatorモジュールを呼び出し、場所トリガーを評価
    # evaluate_location_triggers 関数を evaluater.py に定義することを想定
    try:
        # evaluate_location_triggers は、実行すべきアクションを pending_action_service を通じてキューに格納する
        evaluate_location_triggers(current_app, user_id, latitude, longitude)
        return jsonify({"message": "Location data received and triggers evaluated"}), 200
    except Exception as e:
        print(f"❗ Location webhook error: {e}")
        return jsonify({"error": str(e)}), 500
