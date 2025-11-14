from supabase_client import supabase

TABLE_NAME = "memos"


def get_all_memos(
    user_id: str,
    keyword: str = "",
    search_type: str = "all",
    start_date: str = "",
    end_date: str = ""
):
    """
    指定ユーザーのメモを取得する。
    """
    if not user_id:
        return {"error": "User ID is required"}

    try:
        query = (
            supabase.table(TABLE_NAME)
            .select("*")
            .eq("user_id", user_id)
            .order("is_pinned", desc=True)
            .order("created_at", desc=True)
        )

        if keyword:
            pattern = f"%{keyword}%"
            if search_type == "title":
                query = query.ilike("title", pattern)
            elif search_type == "content":
                query = query.ilike("content", pattern)
            else:
                query = query.or_(f"title.ilike.{pattern},content.ilike.{pattern}")

        if start_date:
            query = query.gte("created_at", start_date)
        if end_date:
            query = query.lte("created_at", end_date)

        response = query.execute()
        return response.data or []
    except Exception as e:
        return {"error": f"データベースからのメモ読み込みに失敗しました: {str(e)}"}


def add_memo(user_id: str, title: str, content: str, is_pinned: bool, priority: int):
    """
    新しいメモを追加する。
    """
    if not user_id:
        return {"error": "User ID is required"}

    try:
        insert_data = {
            "user_id": user_id,
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
        print("❗ add_memo エラー:", e)
        return {"error": str(e)}


def delete_memo(user_id: str, memo_id: str):
    """
    指定したメモを削除する。
    """
    if not user_id:
        return {"error": "User ID is required"}

    try:
        response = (
            supabase.table(TABLE_NAME)
            .delete()
            .eq("id", memo_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not response.data:
            return {"error": "指定したIDのメモは存在しません"}
        return {"message": f"メモ(ID={memo_id})を削除しました"}
    except Exception as e:
        print("❗ delete_memo エラー:", e)
        return {"error": str(e)}


def update_memo(user_id: str, memo_id: str, data: dict):
    """
    指定したメモを更新する。
    """
    if not user_id:
        return {"error": "User ID is required"}

    try:
        response = (
            supabase.table(TABLE_NAME)
            .update(data)
            .eq("id", memo_id)
            .eq("user_id", user_id)
            .execute()
        )
        if response.data:
            return response.data[0]
        return {"error": "指定したIDのメモは存在しません"}
    except Exception as e:
        print("❗ update_memo エラー:", e)
        return {"error": str(e)}


def delete_memos_bulk(user_id: str, memo_ids: list):
    """
    指定したIDリストに一致するメモをまとめて削除する。
    """
    if not user_id:
        return {"error": "User ID is required"}

    try:
        response = (
            supabase.table(TABLE_NAME)
            .delete()
            .eq("user_id", user_id)
            .in_("id", memo_ids)
            .execute()
        )
        if not response.data:
            return {"error": "指定したIDのメモは存在せず、削除に失敗しました"}
        return {"message": f"{len(response.data)}件のメモを削除しました"}
    except Exception as e:
        print("❗ delete_memos_bulk エラー:", e)
        return {"error": str(e)}
