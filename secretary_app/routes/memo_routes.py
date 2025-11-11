# routes/memo_routes.py
 
from flask import Blueprint, request, jsonify
from services.memo_service import add_memo, get_all_memos, delete_memo
 
memo_bp = Blueprint('memos', __name__)
 
@memo_bp.route('/', methods=['POST'])
def add_memo_route():
    data = request.get_json()
    title = data.get('title')
    content = data.get('content')
 
    if not title or not content:
        return jsonify({"error": "titleとcontentは必須です"}), 400
 
    result = add_memo(title=title, content=content)
 
    if "error" in result:
        return jsonify(result), 500
    return jsonify({"message": "メモを追加しました", "memo": result}), 201
 
 
@memo_bp.route('/', methods=['GET'])
def get_memos_route():
    keyword = request.args.get('q', '')
 
    memos_data = get_all_memos(keyword=keyword) 
    if "error" in memos_data:
        return jsonify(memos_data), 500
 
    return jsonify(memos_data)
 
 
@memo_bp.route('/<string:memo_id>', methods=['DELETE'])
def delete_memo_route(memo_id):
    result = delete_memo(memo_id=memo_id)
 
    if "error" in result:
        # メモが存在しない、または削除に失敗した場合
        return jsonify(result), 404 
    return jsonify({"message": f"メモ(ID={memo_id})を削除しました"})