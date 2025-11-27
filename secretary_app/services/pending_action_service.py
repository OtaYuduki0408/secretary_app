from supabase_client import supabase
from datetime import datetime
import json
import pytz
import threading

TABLE_NAME = "pending_user_actions"
JST = pytz.timezone('Asia/Tokyo')

# ユーザーIDごとのロックを管理する辞書
user_locks = {}
# user_locks辞書自体を保護するためのロック
locks_lock = threading.Lock()

def get_lock_for_user(user_id):
    """ユーザーIDに対応するロックオブジェクトを取得または生成する"""
    with locks_lock:
        if user_id not in user_locks:
            user_locks[user_id] = threading.Lock()
        return user_locks[user_id]

def get_pending_actions(user_id: str):
    """
    指定されたユーザーの保留中のアクションをアトミックに取得し、
    ステータスを処理済みに更新する。
    """
    user_lock = get_lock_for_user(user_id)
    
    # ノンブロッキングでロックを取得しようと試みる
    if not user_lock.acquire(blocking=False):
        # ロックが取得できない場合（他のスレッドが処理中）は、空のリストを返す
        print(f"INFO: Action processing for user {user_id} is already in progress. Skipping.")
        return []

    try:
        now_jst = datetime.now(JST)
        
        # まず、ユーザーの全ての保留中のアクションを取得
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
                    scheduled_at_str = action_data['scheduled_at']
                    # ISO 8601形式の文字列をdatetimeオブジェクトに変換
                    scheduled_at_dt = datetime.fromisoformat(scheduled_at_str)
                    
                    # タイムゾーン情報がない場合はJSTを付与
                    if scheduled_at_dt.tzinfo is None:
                        scheduled_at_dt = JST.localize(scheduled_at_dt)
                    
                    if scheduled_at_dt <= now_jst:
                        actions_to_process.append(action)
                except (ValueError, TypeError) as e:
                    print(f"WARN: Invalid scheduled_at format for action ID {action.get('id')}: {action_data.get('scheduled_at')}. Error: {e}")
                    pass
        
        if not actions_to_process:
            return []

        # 実行予定時刻とIDでソートして、実行順序の一貫性を保証する
        actions_to_process.sort(key=lambda x: (datetime.fromisoformat(x['action_data']['scheduled_at']), x['id']))

        # 取得したアクションのステータスを'processed'に更新
        action_ids = [action['id'] for action in actions_to_process]
        (
            supabase.table(TABLE_NAME)
            .update({"status": "processed", "processed_at": now_jst.isoformat()})
            .in_("id", action_ids)
            .execute()
        )
        
        return actions_to_process
    except Exception as e:
        print(f"❗ get_pending_actions エラー: {e}")
        return {"error": str(e)}
    finally:
        # どのような状況でも必ずロックを解放する
        user_lock.release()

def add_pending_action(user_id: str, command_id: int, action_data: dict):
    """
    保留中のアクションをpending_user_actionsテーブルに追加する。
    """
    try:
        insert_data = {
            "user_id": user_id,
            "command_id": command_id,
            "action_data": action_data,
            "status": "pending",
            "created_at": datetime.now(JST).isoformat(),
        }
        response = supabase.table(TABLE_NAME).insert(insert_data).execute()
        
        if response.data:
            # action_data内のdatetimeオブジェクトをISO 8601文字列に変換
            if 'scheduled_at' in action_data and isinstance(action_data['scheduled_at'], datetime):
                action_data['scheduled_at'] = action_data['scheduled_at'].isoformat()
            if 'triggered_at' in action_data and isinstance(action_data['triggered_at'], datetime):
                action_data['triggered_at'] = action_data['triggered_at'].isoformat()
                
            return response.data[0]
        return {"error": "保留中のアクションの追加に失敗しました"}
    except Exception as e:
        print(f"❗ add_pending_action エラー: {e}")
        return {"error": str(e)}