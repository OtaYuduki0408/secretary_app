from supabase_client import supabase

TABLE_NAME = "custom_orders"

def get_all_orders(user_id: str):
    """
    指定されたユーザーのすべてのカスタム命令を取得する。
    """
    try:
        response = supabase.table(TABLE_NAME).select("id, name, order_data").eq("user_id", user_id).order("id", desc=True).execute()
        
        if response.data:
            for item in response.data:
                if 'order_data' in item and isinstance(item['order_data'], dict):
                    order_data_content = item.pop('order_data')
                    item.update(order_data_content)

        return response.data or []
    except Exception as e:
        print(f"❗ get_all_orders エラー: {e}")
        return {"error": f"データベースからの命令読み込みに失敗しました: {str(e)}"}

def create_order(user_id: str, data: dict):
    """
    新しいカスタム命令を追加する。
    """
    try:
        name = data.pop('name', '無題の命令')
        
        insert_data = {
            "user_id": user_id,
            "name": name,
            "order_data": data,
        }
        response = supabase.table(TABLE_NAME).insert(insert_data).execute()
        if response.data:
            return response.data[0]
        return {"error": "命令の挿入に失敗しました"}
    except Exception as e:
        print(f"❗ create_order エラー: {e}")
        return {"error": str(e)}

def update_order(user_id: str, order_id: int, data: dict):
    """
    指定したカスタム命令を更新する。
    """
    try:
        name = data.pop('name', None)
        
        update_data = {
            "order_data": data,
        }
        if name is not None:
            update_data["name"] = name

        response = (
            supabase.table(TABLE_NAME)
            .update(update_data)
            .match({'id': order_id, 'user_id': user_id})
            .execute()
        )
        if response.data:
            return response.data[0]
        return {"error": "指定したIDの命令は存在しないか、権限がありません"}
    except Exception as e:
        print(f"❗ update_order エラー: {e}")
        return {"error": str(e)}

def delete_order(user_id: str, order_id: int):
    """
    指定したカスタム命令を削除する。
    """
    try:
        response = (
            supabase.table(TABLE_NAME)
            .delete()
            .match({'id': order_id, 'user_id': user_id})
            .execute()
        )
        if not response.data:
            return {"error": "指定したIDの命令は存在しないか、権限がありません"}
        return {"message": f"命令(ID={order_id})を削除しました"}
    except Exception as e:
        print(f"❗ delete_order エラー: {e}")
        return {"error": str(e)}
