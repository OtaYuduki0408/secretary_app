from supabase_client import supabase 
from flask import Blueprint, request, jsonify

TABLE_NAME = "memos"

from flask import Blueprint, request, jsonify
TABLE_NAME = "memos"

 
def get_all_memos(keyword: str = "", search_type: str = "all", start_date: str = "", end_date: str = ""):
    """
    全てのメモを取得する。キーワード、検索対象、日付範囲で絞り込みを行う。
    """
    try:
        query = supabase.table(TABLE_NAME).select("id, title, content, created_at, is_pinned, priority")
        
        # キーワード検索
        if keyword:
            search_pattern = f"%{keyword}%"
            if search_type == "title":
                query = query.ilike("title", search_pattern)
            elif search_type == "content":
                query = query.ilike("content", search_pattern)
            else: # "all"
                query = query.or_(f"title.ilike.{search_pattern},content.ilike.{search_pattern}")

        # 日付範囲での絞り込み
        if start_date:
            query = query.gte("created_at", start_date)
        if end_date:
            # 終了日はその日の終わりまでを含むように調整
            query = query.lte("created_at", f"{end_date}T23:59:59")

        # ピン留め(is_pinned=trueが先)、優先順位(priorityが小さいものが先、nullは後方)、作成日時(新しいものが先)の順でソート
        response = query.order("is_pinned", desc=True).order("priority", desc=False, nullsfirst=False).order("created_at", desc=True).execute()
        return response.data or []
    except Exception as e:
        print("❌ get_all_memos エラー:", e)
        return {"error": str(e)}
 
 
def add_memo(title: str, content: str, is_pinned: bool = False, priority: int = None):
    """
    新しいメモを追加する。
    """
    try:
        insert_data = {
            "title": title,
            "content": content,
            "is_pinned": is_pinned,
            "priority": priority
        }
        response = supabase.table(TABLE_NAME).insert(insert_data).execute()
        if response.data:
            return response.data[0] 
        return {"error": "メモの挿入に失敗しました"}
    except Exception as e:
        print("❌ add_memo エラー:", e)
        return {"error": str(e)}
 
 
def delete_memo(memo_id: str):
    """
    指定したメモを削除する。SupabaseのIDはUUIDなので文字列として扱う。
    """
    try:
        # idで指定し、レコードを削除
        response = supabase.table(TABLE_NAME).delete().eq("id", memo_id).execute()
        if not response.data:
            return {"error": "指定したIDのメモは存在しません"}
        return {"message": f"メモ(ID={memo_id})を削除しました"}
    except Exception as e:
        print("❌ delete_memo エラー:", e)
        return {"error": str(e)}

def update_memo(memo_id: str, data: dict):
    """
    指定したメモのデータを更新する。
    `data` 辞書に含まれるキーと値でレコードを更新する。
    """
    try:
        response = supabase.table(TABLE_NAME).update(data).eq("id", memo_id).execute()
        if response.data:
            return response.data[0]
        # Supabaseのupdateは、条件に合う行がない場合でもエラーにならず、空のdataを返す
        return {"error": "指定したIDのメモが見つからないか、更新に失敗しました"}
    except Exception as e:
        print("❌ update_memo エラー:", e)
        return {"error": str(e)}

def delete_memos_bulk(memo_ids: list):
    """
    指定されたIDのリストに一致するすべてのメモを削除する。
    """
    try:
        response = supabase.table(TABLE_NAME).delete().in_("id", memo_ids).execute()
        # response.dataには削除されたレコードが含まれる
        return {"message": f"{len(response.data)}件のメモを削除しました", "deleted_count": len(response.data)}
    except Exception as e:
        print("❌ delete_memos_bulk エラー:", e)
        return {"error": str(e)}