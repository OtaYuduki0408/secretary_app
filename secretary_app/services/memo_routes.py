# routes/memo_routes.py
 
from flask import Blueprint, request, jsonify, session, abort
from services.memo_service import add_memo, get_all_memos, delete_memo, update_memo, delete_memos_bulk

memo_bp = Blueprint('memos', __name__)


def _require_user_id():
    user = session.get('user') or {}
    user_id = user.get('id')
    if not user_id:
        abort(401, description='Authentication required')
    return user_id

@memo_bp.route('/api/memos', methods=['POST'])
def add_memo_route():
    user_id = _require_user_id()
    data = request.get_json()
    title = data.get('title')
    content = data.get('content')
 
    if not content: # contentは必須
        return jsonify({"error": "contentは必須です"}), 400

    # titleがなければcontentから生成
    if not title:
        title = content[:10] # contentの最初の10文字

    is_pinned = data.get('is_pinned', False)
    priority_val = data.get('priority')
    priority = int(priority_val) if priority_val not in [None, ''] else None

    result = add_memo(
        user_id=user_id,
        title=title,
        content=content,
        is_pinned=is_pinned,
        priority=priority
    )
 
    if "error" in result:
        return jsonify(result), 500
    return jsonify({"message": "メモを追加しました", "memo": result}), 201
 
 
@memo_bp.route('/api/memos', methods=['GET'])
def get_memos_route():
    user_id = _require_user_id()
    keyword = request.args.get('q', '')
    search_type = request.args.get('type', 'all')
    start_date = request.args.get('start', '')
    end_date = request.args.get('end', '')

    memos_data = get_all_memos(
        user_id=user_id,
        keyword=keyword,
        search_type=search_type,
        start_date=start_date,
        end_date=end_date
    )
    if "error" in memos_data:
        return jsonify(memos_data), 500
 
    return jsonify(memos_data)

@memo_bp.route('/api/memos/bulk', methods=['DELETE'])
def delete_memos_bulk_route():
    user_id = _require_user_id()
    data = request.get_json()
    memo_ids = data.get('ids')

    if not memo_ids or not isinstance(memo_ids, list):
        return jsonify({"error": "IDのリストが必要です"}), 400

    result = delete_memos_bulk(user_id=user_id, memo_ids=memo_ids)

    if "error" in result:
        return jsonify(result), 500
    
    return jsonify(result)
 
 
@memo_bp.route('/api/memos/<string:memo_id>', methods=['DELETE'])
def delete_memo_route(memo_id):
    user_id = _require_user_id()
    result = delete_memo(user_id=user_id, memo_id=memo_id)
 
    if "error" in result:
        # メモが存在しない、または削除に失敗した場合
        return jsonify(result), 404 
    return jsonify({"message": f"メモ(ID={memo_id})を削除しました"})

@memo_bp.route('/api/memos/<string:memo_id>', methods=['PUT'])
def update_memo_route(memo_id):
    user_id = _require_user_id()
    data = request.get_json()
    
    # 更新対象のデータだけを抽出
    update_data = {}
    if 'title' in data:
        update_data['title'] = data['title']
    if 'content' in data:
        update_data['content'] = data['content']
    if 'is_pinned' in data:
        update_data['is_pinned'] = data['is_pinned']
    if 'priority' in data:
        # priorityが空文字列などで送られてきた場合、Noneに変換
        priority_val = data.get('priority')
        update_data['priority'] = int(priority_val) if priority_val not in [None, ''] else None

    if not update_data:
        return jsonify({"error": "更新するデータがありません"}), 400

    result = update_memo(user_id=user_id, memo_id=memo_id, data=update_data)

    if "error" in result:
        return jsonify(result), 404 # 見つからない場合も考慮
    return jsonify({"message": "メモを更新しました", "memo": result})
