# C:\Users\y_oota\Documents\secretary_app\secretary_app\services\address_service.py

from supabase_client import supabase
from postgrest.exceptions import APIError
import logging

TABLE_NAME = "past_addresses"

def add_past_address(user_id: str, address: str) -> bool:
    """
    過去の住所をSupabaseに保存します。
    """
    try:
        response = supabase.table(TABLE_NAME).insert({
            "user_id": user_id,
            "address": address
        }).execute()
        
        # Supabaseからのレスポンスをチェック（エラーがないか）
        if response.data:
            logging.info(f"Past address added successfully for user {user_id}: {address}")
            return True
        else:
            logging.error(f"Failed to add past address for user {user_id}: No data in response.")
            return False
    except APIError as e:
        logging.error(f"Supabase API Error when adding past address for user {user_id}: {e}")
        return False
    except Exception as e:
        logging.error(f"General Error when adding past address for user {user_id}: {e}")
        return False

def get_past_addresses(user_id: str) -> list:
    """
    指定されたユーザーの過去の住所を新しい順に取得します。
    """
    try:
        response = supabase.table(TABLE_NAME).select("address").eq("user_id", user_id).order("created_at", desc=True).execute()
        if response.data:
            return [record["address"] for record in response.data]
        else:
            return []
    except APIError as e:
        logging.error(f"Supabase API Error when getting past addresses for user {user_id}: {e}")
        return []
    except Exception as e:
        logging.error(f"General Error when getting past addresses for user {user_id}: {e}")
        return []
