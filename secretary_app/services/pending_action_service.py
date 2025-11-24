from supabase_client import supabase
from datetime import datetime

import json # 追加

TABLE_NAME = "pending_user_actions"

def get_pending_actions(user_id: str):
    """
    指定されたユーザーの保留中のアクションを取得し、ステータスを処理済みに更新する。
    """
    try:
        response = (
            supabase.table(TABLE_NAME)
            .select("id, command_id, action_data")
            .eq("user_id", user_id)
            .eq("status", "pending")
            .execute()
        )
        actions = response.data

        if not actions:
            return []

        # 取得したアクションのステータスを'processed'に更新
        action_ids = [action['id'] for action in actions]
        update_response = (
            supabase.table(TABLE_NAME)
            .update({"status": "processed", "processed_at": datetime.now().isoformat()})
            .in_("id", action_ids)
            .execute()
        )
        # action_data はDBから直接JSONBとして取得されるため、変換は不要

        return actions
    except Exception as e:
        print(f"❗ get_pending_actions エラー: {e}")
        return {"error": str(e)}

def add_pending_action(user_id: str, command_id: int, action_data: dict):
    """
    保留中のアクションをpending_user_actionsテーブルに追加する。
    これはEvaluatorモジュールから呼び出されることを想定。
    """
    try:
        insert_data = {
            "user_id": user_id,
            "command_id": command_id,
            "action_data": action_data,
            "status": "pending",
            "created_at": datetime.now().isoformat(),
        }
        response = supabase.table(TABLE_NAME).insert(insert_data).execute()
        if response.data:
            return response.data[0]
        return {"error": "保留中のアクションの追加に失敗しました"}
    except Exception as e:
        print(f"❗ add_pending_action エラー: {e}")
        return {"error": str(e)}
