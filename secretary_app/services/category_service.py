from supabase_client import supabase

TABLE_NAME = "categories"

def get_all_categories():
    try:
        response = supabase.table(TABLE_NAME).select("*").execute()
        return response.data
    except Exception as e:
        return {"error": str(e)}

def add_category(name: str, type: str):
    try:
        # 重複チェック
        existing_categories = supabase.table(TABLE_NAME)\\
            .select("id")\\
            .eq("name", name)\\
            .eq("type", type)\\
            .execute()
        
        if existing_categories.data:
            return {"error": "同じ名前と種類のカテゴリが既に存在します。"}

        response = supabase.table(TABLE_NAME).insert({"name": name, "type": type}).execute()
        return {"message": "Category added", "data": response.data}
    except Exception as e:
        return {"error": str(e)}

def delete_category(id: str):
    try:
        response = supabase.table(TABLE_NAME).delete().eq("id", id).execute()
        return {"message": "Category deleted", "data": response.data}
    except Exception as e:
        return {"error": str(e)}

def clear_all_categories():
    try:
        response = supabase.table(TABLE_NAME).delete().neq("id", "").execute()
        return {"message": "All categories cleared", "data": response.data}
    except Exception as e:
        return {"error": str(e)}
