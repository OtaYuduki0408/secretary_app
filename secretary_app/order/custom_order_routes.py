from flask import Blueprint, request, jsonify, session
from supabase_client import supabase
from postgrest.exceptions import APIError
import json

custom_order_bp = Blueprint("custom_order", __name__)

# ======================================================
# 📌 カスタムオーダー登録API (Supabase版 - user_id対応)
# ======================================================
@custom_order_bp.route("/custom_orders", methods=["POST"], endpoint="register_custom_order")
def register_order():
    print("--- [DEBUG] /api/custom_orders POST request received ---")
    
    user = session.get('user')
    if not user or not user.get('id'):
        print("--- [DEBUG] User not found in session. Returning 401. ---")
        return jsonify({"error": "User not authenticated"}), 401
    user_id = user.get('id')

    data = request.json
    print(f"--- [DEBUG] Request data: {data} ---")
    if not data or 'name' not in data or not data['name']:
        return jsonify({"error": "Invalid data: name is required"}), 400

    supabase_data = {
        'name': data.get('name'),
        'user_id': user_id
    }
    
    try:
        print(f"--- [DEBUG] Inserting simplified data into Supabase: {supabase_data} ---")
        response = supabase.table("custom_orders").insert(supabase_data).execute()
        print(f"--- [DEBUG] Supabase response: {response} ---")
        inserted_data = response.data[0] if response.data else None
        return jsonify({"message": "✅ カスタムオーダー登録完了 (nameのみ)", "data": inserted_data}), 201
    except APIError as e:
        print(f"--- [ERROR] Supabase API Error: {e.message} ---")
        return jsonify({"error": e.message}), 500
    except Exception as e:
        print(f"--- [ERROR] General Error in register_order: {e} ---")
        return jsonify({"error": str(e)}), 500


# ======================================================
# 📋 登録済みオーダー一覧取得 (Supabase版 - user_id対応)
# ======================================================
@custom_order_bp.route("/custom_orders", methods=["GET"], endpoint="list_custom_orders")
def list_orders():
    print("--- [DEBUG] /api/custom_orders GET request received ---")
    
    user = session.get('user')
    if not user or not user.get('id'):
        print("--- [DEBUG] User not found in session. Returning empty list. ---")
        return jsonify([]) # 認証されていなければ空のリストを返す
    user_id = user.get('id')

    try:
        print(f"--- [DEBUG] Selecting 'id, name' from Supabase for user_id: {user_id} ---")
        response = supabase.table("custom_orders").select("id, name").eq("user_id", user_id).order("id", desc=True).execute()
        print(f"--- [DEBUG] Supabase response in list_orders: {response} ---")
        return jsonify(response.data)
    except APIError as e:
        print(f"--- [ERROR] Supabase API Error in list_orders: {e.message} ---")
        return jsonify({"error": e.message}), 500
    except Exception as e:
        print(f"--- [ERROR] General Error in list_orders: {e} ---")
        return jsonify({"error": str(e)}), 500

# ======================================================
# 🔄 カスタムオーダー更新API (Supabase版 - user_id対応)
# ======================================================
@custom_order_bp.route("/custom_orders/<int:order_id>", methods=["PUT"], endpoint="update_custom_order")
def update_order(order_id):
    user = session.get('user')
    if not user or not user.get('id'):
        return jsonify({"error": "User not authenticated"}), 401
    user_id = user.get('id')

    data = request.json
    if not data or 'name' not in data or not data['name']:
        return jsonify({"error": "Invalid data: name is required"}), 400
    
    supabase_data = {'name': data.get('name')}

    try:
        # 更新前に、対象のレコードが本当にこのユーザーのものであることを確認
        response = supabase.table("custom_orders").update(supabase_data).match({'id': order_id, 'user_id': user_id}).execute()
        updated_data = response.data[0] if response.data else None
        if not updated_data:
            return jsonify({"error": "Order not found or permission denied"}), 404
        return jsonify({"message": f"✅ カスタムオーダー(ID: {order_id})を更新しました", "data": updated_data}), 200
    except APIError as e:
        print(f"--- [ERROR] Supabase API Error in update_order: {e.message} ---")
        return jsonify({"error": e.message}), 500
    except Exception as e:
        print(f"--- [ERROR] General Error in update_order: {e} ---")
        return jsonify({"error": str(e)}), 500


# ======================================================
# 🗑️ カスタムオーダー削除API (Supabase版 - user_id対応)
# ======================================================
@custom_order_bp.route("/custom_orders/<int:order_id>", methods=["DELETE"], endpoint="delete_custom_order")
def delete_order(order_id):
    user = session.get('user')
    if not user or not user.get('id'):
        return jsonify({"error": "User not authenticated"}), 401
    user_id = user.get('id')

    try:
        # 削除前に、対象のレコードが本当にこのユーザーのものであることを確認
        response = supabase.table("custom_orders").delete().match({'id': order_id, 'user_id': user_id}).execute()
        deleted_data = response.data[0] if response.data else None
        if not deleted_data:
            return jsonify({"error": "Order not found or permission denied"}), 404
        return jsonify({"message": f"✅ カスタムオーダー(ID: {order_id})を削除しました", "data": deleted_data}), 200
    except APIError as e:
        print(f"--- [ERROR] Supabase API Error in delete_order: {e.message} ---")
        return jsonify({"error": e.message}), 500
    except Exception as e:
        print(f"--- [ERROR] General Error in delete_order: {e} ---")
        return jsonify({"error": str(e)}), 500
