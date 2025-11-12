from supabase_client import supabase

# カテゴリーテーブル名
TABLE_NAME = "categories"


def get_user_categories(user_id: str):
    """
    ログインユーザーのカテゴリー一覧を取得します。
    エラー時には {"error": ...} を返します。
    """
    try:
        # NOTE: .execute()の結果は、成功時 response.data にリストが含まれます
        response = (
            supabase.table(TABLE_NAME)
            .select("*")
            .eq("user_id", user_id)
            .execute()
        )
        # 成功時はデータリスト自体を返す
        return response.data
    except Exception as e:
        # 失敗時はエラー辞書を返す
        print(f"Error getting categories for user {user_id}: {e}")
        return {"error": f"カテゴリーの取得中にエラーが発生しました: {str(e)}"}


def add_category(user_id: str, name: str, cat_type: str):
    """
    ユーザー専用カテゴリーを追加します。
    """
    try:
        # .execute() の結果はデータ構造がネストされているため、
        # フロントエンドが必要とする形式に合わせるため .data を取得
        response = (
            supabase.table(TABLE_NAME).insert({
                "user_id": user_id,
                "name": name,
                "type": cat_type
            })
            # 挿入されたデータを返すように要求
            .execute()
        )
        # 挿入されたレコード（リスト形式）の最初の要素を返す
        inserted_data = response.data[0] if response.data else None
        
        return {"message": "Category added", "data": inserted_data}
    except Exception as e:
        print(f"Error adding category: {e}")
        return {"error": f"カテゴリーの追加中にエラーが発生しました: {str(e)}"}


def delete_category(user_id: str, id: str):
    """
    指定されたIDとユーザーIDに一致するカテゴリーを削除します。
    """
    try:
        response = (
            supabase.table(TABLE_NAME)
            .delete()
            # 認証されたユーザーのカテゴリーのみ削除できるように二重チェック
            .eq("id", id)
            .eq("user_id", user_id)
            .execute()
        )
        # 削除されたレコード数がわかるようにcountを含めることも可能ですが、ここではシンプルに
        return {"message": "Category deleted", "data": response.data}
    except Exception as e:
        print(f"Error deleting category {id}: {e}")
        return {"error": f"カテゴリーの削除中にエラーが発生しました: {str(e)}"}


def clear_all_categories(user_id: str):
    """
    そのユーザーのカテゴリーをすべて削除します。
    """
    try:
        response = (
            supabase.table(TABLE_NAME)
            .delete()
            .eq("user_id", user_id)
            .execute()
        )
        # 削除されたレコードのリストは通常空ですが、成功メッセージを返します
        return {"message": "All categories cleared", "data": response.data}
    except Exception as e:
        print(f"Error clearing categories for user {user_id}: {e}")
        return {"error": f"全カテゴリーの削除中にエラーが発生しました: {str(e)}"}