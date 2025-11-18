from flask import Blueprint, request, jsonify, session
from services import custom_order_service

custom_order_bp = Blueprint("custom_order", __name__)

# ======================================================
# 📋 登録済みオーダー一覧取得
# ======================================================
@custom_order_bp.route("/custom_orders", methods=["GET"], endpoint="list_custom_orders")
def list_orders():
    user = session.get('user')
    if not user or not user.get('id'):
        # 認証されていない場合は空のリストを返す（UIがエラーにならないように）
        return jsonify([]), 200
    user_id = user.get('id')

    orders = custom_order_service.get_all_orders(user_id)
    
    if isinstance(orders, dict) and 'error' in orders:
        return jsonify(orders), 500
    return jsonify(orders)

# ======================================================
# 📌 カスタムオーダー登録API
# ======================================================
@custom_order_bp.route("/custom_orders", methods=["POST"], endpoint="register_custom_order")
def register_order():
    user = session.get('user')
    if not user or not user.get('id'):
        return jsonify({"error": "User not authenticated"}), 401
    user_id = user.get('id')

    data = request.json
    if not data or 'name' not in data or not data['name'].strip():
        return jsonify({"error": "Invalid data: name is required"}), 400

    new_order = custom_order_service.create_order(user_id, data)

    if isinstance(new_order, dict) and 'error' in new_order:
        return jsonify(new_order), 500
    return jsonify(new_order), 201

# ======================================================
# 🔄 カスタムオーダー更新API
# ======================================================
@custom_order_bp.route("/custom_orders/<int:order_id>", methods=["PUT"], endpoint="update_custom_order")
def update_order(order_id):
    user = session.get('user')
    if not user or not user.get('id'):
        return jsonify({"error": "User not authenticated"}), 401
    user_id = user.get('id')

    data = request.json
    if not data or 'name' not in data or not data['name'].strip():
        return jsonify({"error": "Invalid data: name is required"}), 400
    
    updated_order = custom_order_service.update_order(user_id, order_id, data)

    if isinstance(updated_order, dict) and 'error' in updated_order:
        return jsonify(updated_order), 404
    return jsonify(updated_order)

# ======================================================
# 🗑️ カスタムオーダー削除API
# ======================================================
@custom_order_bp.route("/custom_orders/<int:order_id>", methods=["DELETE"], endpoint="delete_custom_order")
def delete_order(order_id):
    user = session.get('user')
    if not user or not user.get('id'):
        return jsonify({"error": "User not authenticated"}), 401
    user_id = user.get('id')

    result = custom_order_service.delete_order(user_id, order_id)

    if isinstance(result, dict) and 'error' in result:
        return jsonify(result), 404
    return jsonify(result)
