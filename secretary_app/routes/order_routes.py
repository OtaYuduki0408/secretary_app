from flask import Blueprint, request, jsonify, render_template, session
from services import custom_order_service, category_service, pending_action_service, address_service
import os

# Blueprintを定義
# static_folderとtemplate_folderを既存の'order'ディレクトリ構造に合わせる
order_bp = Blueprint('order', __name__,
                     url_prefix='/order',
                     template_folder=os.path.join(os.path.dirname(__file__), '..', 'order', 'templates'),
                     static_folder=os.path.join(os.path.dirname(__file__), '..', 'order', 'static'),
                     static_url_path='/static' # /order/static/css/index.css のようなURLに対応
                    )

# --- API Endpoints ---

@order_bp.route('/api/custom_orders', methods=['GET'])
def get_orders():
    """登録済みのカスタム命令をすべて取得する"""
    orders = custom_order_service.get_all_orders()
    if isinstance(orders, dict) and 'error' in orders:
        return jsonify(orders), 500
    return jsonify(orders)

@order_bp.route('/api/categories', methods=['GET'])
def get_categories():
    """すべてのカテゴリを取得する"""
    categories = category_service.get_all_categories()
    if isinstance(categories, dict) and 'error' in categories:
        return jsonify(categories), 500
    # フロントエンドが期待する形式に変換（例: [{"name": "カテゴリ名"}] のリスト）
    formatted_categories = [{"name": cat["name"]} for cat in categories]
    return jsonify(formatted_categories)

@order_bp.route('/api/custom_orders', methods=['POST'])
def add_order():
    """新しいカスタム命令を登録する"""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid data"}), 400
    
    new_order = custom_order_service.create_order(data)
    
    if isinstance(new_order, dict) and 'error' in new_order:
        return jsonify(new_order), 500
    return jsonify(new_order), 201

@order_bp.route('/api/custom_orders/<int:order_id>', methods=['PUT'])
def edit_order(order_id):
    """既存のカスタム命令を更新する"""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid data"}), 400
        
    updated_order = custom_order_service.update_order(order_id, data)

    if isinstance(updated_order, dict) and 'error' in updated_order:
        return jsonify(updated_order), 500
    return jsonify(updated_order)

@order_bp.route('/api/custom_orders/<int:order_id>', methods=['DELETE'])
def remove_order(order_id):
    """既存のカスタム命令を削除する"""
    result = custom_order_service.delete_order(order_id)
    if isinstance(result, dict) and 'error' in result:
        return jsonify(result), 404
    return jsonify(result)

@order_bp.route('/api/pending_actions/<string:user_id>', methods=['GET'])
def get_pending_actions_route(user_id):
    """ユーザーの保留中のアクションを取得し、ステータスを更新する"""
    try:
        actions = pending_action_service.get_pending_actions(user_id)
        if isinstance(actions, dict) and 'error' in actions:
            return jsonify(actions), 500 # エラーハンドリング
        if not actions:
            # アクションがない場合は、空のリストと204 No Contentを返す
            return jsonify([]), 200
        return jsonify(actions)
    except Exception as e:
        # 予期せぬ例外をキャッチし、ログに出力
        import traceback
        print(f"Error in get_pending_actions_route for user_id {user_id}: {e}")
        print(traceback.format_exc())
        # フロントエンドにはJSONでエラーを返す
        return jsonify({"error": "An unexpected error occurred on the server."}), 500

@order_bp.route('/api/past_addresses', methods=['GET'])
def get_past_addresses_api():
    """ユーザーの過去の住所を新しい順に取得する"""
    user_id = session.get('user', {}).get('id')
    if not user_id:
        return jsonify({"error": "User not authenticated"}), 401
    
    addresses = address_service.get_past_addresses(user_id)
    return jsonify(addresses)

@order_bp.route('/api/past_addresses', methods=['POST'])
def save_past_address_api():
    """過去の住所を保存する"""
    user_id = session.get('user', {}).get('id')
    if not user_id:
        return jsonify({"error": "User not authenticated"}), 401
    
    data = request.get_json()
    address = data.get('address')
    
    if not address or not address.strip():
        return jsonify({"error": "Address is required"}), 400
        
    success = address_service.add_past_address(user_id, address)
    if success:
        return jsonify({"message": "Address saved successfully"}), 201
    else:
        return jsonify({"error": "Failed to save address"}), 500

# --- HTML Serving Endpoint ---

@order_bp.route('/')
def index():
    """カスタム命令のUIページを配信する"""
    # /order/templates/html/index.html をレンダリング
    return render_template('html/index.html')
