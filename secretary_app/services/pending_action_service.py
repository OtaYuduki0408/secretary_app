from supabase_client import supabase
from datetime import datetime
import json
import pytz

TABLE_NAME = "pending_user_actions"
JST = pytz.timezone('Asia/Tokyo')

def get_pending_actions(user_id: str):
    """
    指定されたユーザーの保留中で、かつ実行予定時刻が現在以前のアクションを取得し、
    取得したアクションのステータスを処理済みに更新する。
    """
    try:
        now_jst = datetime.now(JST)
        
        # まず、ユーザーの全ての保留中のアクションを取得（scheduled_atフィルタリングはPython側で行う）
        response = (
            supabase.table(TABLE_NAME)
            .select("id, command_id, action_data")
            .eq("user_id", user_id)
            .eq("status", "pending")
            .execute()
        )
        all_pending_actions = response.data

        if not all_pending_actions:
            return []

        actions_to_process = []
        for action in all_pending_actions:
            action_data = action.get('action_data')
            if action_data and 'scheduled_at' in action_data:
                try:
                    scheduled_at_dt = datetime.fromisoformat(action_data['scheduled_at'])
                    if scheduled_at_dt.tzinfo is None:
                        scheduled_at_dt = JST.localize(scheduled_at_dt) # タイムゾーン情報がない場合はJSTとして扱う
                    
                    if scheduled_at_dt <= now_jst:
                        actions_to_process.append(action)
                except ValueError:
                    # scheduled_atが不正な形式の場合はスキップ
                    print(f"WARN: action_dataに不正なscheduled_at形式: {action_data.get('scheduled_at')}")
                    pass # Invalid format, skip this action
        
        # 実行予定時刻が早い順にソート
        actions_to_process.sort(key=lambda x: datetime.fromisoformat(x['action_data']['scheduled_at']).astimezone(JST))

        if not actions_to_process:
            return []

        # 取得したアクションのステータスを'processed'に更新
        action_ids = [action['id'] for action in actions_to_process]
        update_response = (
            supabase.table(TABLE_NAME)
            .update({"status": "processed", "processed_at": now_jst.isoformat()})
            .in_("id", action_ids)
            .execute()
        )
        
        return actions_to_process
    except Exception as e:
        print(f"❗ get_pending_actions エラー: {e}")
        return {"error": str(e)}

def add_pending_action(user_id: str, command_id: int, action_data: dict):
    """
    保留中のアクションをpending_user_actionsテーブルに追加する。
    scheduled_at と triggered_at は action_data 辞書の中に含まれることを想定。
    Args:
        user_id (str): ユーザーID。
        command_id (int): 親となるカスタム命令のID。
        action_data (dict): アクションの詳細データ (scheduled_atとtriggered_atを含む)。
    """
    try:
        insert_data = {
            "user_id": user_id,
            "command_id": command_id,
            "action_data": action_data, # scheduled_atとtriggered_atはこれに含まれている
            "status": "pending",
            "created_at": datetime.now(JST).isoformat(),
        }
        response = supabase.table(TABLE_NAME).insert(insert_data).execute()
        if response.data:
            return response.data[0]
        return {"error": "保留中のアクションの追加に失敗しました"}
    except Exception as e:
        print(f"❗ add_pending_action エラー: {e}")
        return {"error": str(e)}