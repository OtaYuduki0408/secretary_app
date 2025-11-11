from supabase_client import supabase 

TABLE_NAME = "memos"

def get_all_memos(keyword: str = "", search_type: str = "all", start_date: str = "", end_date: str = ""):
    """
    全てのメモを取得する。
    """
    try:
        # created_at (作成日時) の降順でソート
        query = supabase.table(TABLE_NAME).select("*").order("created_at", desc=True)
        response = query.execute()
        return response.data or []
    except Exception as e:
        return {"error": f"データベースからのメモ読み込みに失敗しました: {str(e)}"}


def add_memo(title: str, content: str, is_pinned: bool, priority: int):
    """
    新しいメモを追加する。
    """
    try:
        insert_data = {
            "title": title,
            "content": content,
            "is_pinned": is_pinned,
        }
        if priority is not None:
            insert_data["priority"] = priority

        response = supabase.table(TABLE_NAME).insert(insert_data).execute()
        if response.data:
            return response.data[0]
        return {"error": "メモの挿入に失敗しました"}
    except Exception as e:
        print("❌ add_memo エラー:", e)
        return {"error": str(e)}


def delete_memo(memo_id: str):
    """
    指定したメモを削除する。
    """
    try:
        response = supabase.table(TABLE_NAME).delete().eq("id", memo_id).execute()
        if not response.data:
            return {"error": "指定したIDのメモは存在しません"}
        return {"message": f"メモ(ID={memo_id})を削除しました"}
    except Exception as e:
        print("❌ delete_memo エラー:", e)
        return {"error": str(e)}


def update_memo(memo_id: str, data: dict):
    """
    指定したメモを更新する。
    """
    try:
        response = supabase.table(TABLE_NAME).update(data).eq("id", memo_id).execute()
        if response.data:
            return response.data[0]
        return {"error": "指定したIDのメモは存在しません"}
    except Exception as e:
        print("❌ update_memo エラー:", e)
        return {"error": str(e)}


def delete_memos_bulk(memo_ids: list):
    """
    指定したIDのリストに一致するメモをまとめて削除する。
    """
    try:
        response = supabase.table(TABLE_NAME).delete().in_("id", memo_ids).execute()
        if not response.data:
            return {"error": "指定したIDのメモは存在しないか、削除に失敗しました"}
        return {"message": f"{len(response.data)}件のメモを削除しました"}
    except Exception as e:
        print("❌ delete_memos_bulk エラー:", e)
        return {"error": str(e)}
