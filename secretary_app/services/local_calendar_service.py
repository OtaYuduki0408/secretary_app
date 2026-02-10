import pytz
from datetime import datetime
from supabase_client import supabase
from flask import current_app

# Supabaseのテーブル名を定義
TABLE_NAME = 'events'
# タイムゾーンを定義
JST = pytz.timezone('Asia/Tokyo')
UTC = pytz.utc

def _to_utc(dt_str: str) -> str:
    """
    JST（日本時間）を想定したISO形式の文字列をUTCのISO形式文字列に変換する。
    タイムゾーン情報が含まれている場合はそれを尊重する。
    """
    if not dt_str:
        return None
    try:
        dt = datetime.fromisoformat(dt_str.replace('Z', '+00:00'))
        if dt.tzinfo is None:
            # タイムゾーン情報がない場合、JSTと見なしてUTCに変換
            dt = JST.localize(dt).astimezone(UTC)
        else:
            # タイムゾーン情報がある場合、UTCに変換
            dt = dt.astimezone(UTC)
        return dt.isoformat()
    except (ValueError, TypeError) as e:
        current_app.logger.error(f"Error converting timestamp to UTC: {dt_str} ({e})")
        # 変換に失敗した場合は元の値を返すか、エラーを発生させる
        # ここではNoneを返して、後続の処理でバリデーションすることを期待
        return None

def add_event(user_id, title, start_time, end_time, description=None):
    """新しいイベントをSupabaseに追加する"""
    try:
        utc_start = _to_utc(start_time)
        utc_end = _to_utc(end_time)

        if not all([user_id, title, utc_start, utc_end]):
             raise ValueError("Missing required fields for creating an event.")

        new_event_data = {
            'user_id': user_id,
            'title': title,
            'start_time': utc_start,
            'end_time': utc_end,
            'description': description
        }
        
        data, count = supabase.table(TABLE_NAME).insert(new_event_data).execute()
        
        if count and len(data[1]) > 0:
            return data[1][0]
        else:
            raise Exception("Failed to insert event into Supabase.")
            
    except Exception as e:
        current_app.logger.error(f"[ERROR] Failed to add event to Supabase: {e}", exc_info=True)
        raise

def get_events(user_id, start_time_iso=None, end_time_iso=None):
    """指定されたユーザーと期間のイベントをSupabaseから取得する"""
    try:
        query = supabase.table(TABLE_NAME).select("*").eq('user_id', user_id)

        if start_time_iso:
            utc_start = _to_utc(start_time_iso)
            query = query.filter('end_time', 'gte', utc_start)

        if end_time_iso:
            utc_end = _to_utc(end_time_iso)
            query = query.filter('start_time', 'lte', utc_end)

        data, count = query.order('start_time', desc=False).execute()
        
        return data[1] if count else []
    except Exception as e:
        current_app.logger.error(f"!!! [ERROR] Failed to get events from Supabase: {e}", exc_info=True)
        raise

def get_event_by_id(event_id, user_id):
    """IDで単一のイベントをSupabaseから取得する"""
    try:
        data, count = supabase.table(TABLE_NAME).select("*").eq('id', event_id).eq('user_id', user_id).maybe_single().execute()
        return data[1] if count else None
    except Exception as e:
        current_app.logger.error(f"[ERROR] Failed to get event by id from Supabase: {e}", exc_info=True)
        raise

def update_event(event_id, user_id, **kwargs):
    """イベント情報をSupabaseで更新する"""
    try:
        update_data = {}
        for key, value in kwargs.items():
            if key in ['title', 'description']:
                update_data[key] = value
            elif key in ['start_time', 'end_time'] and value:
                update_data[key] = _to_utc(value)

        if not update_data:
            return None # 更新するフィールドがない

        data, count = supabase.table(TABLE_NAME).update(update_data).eq('id', event_id).eq('user_id', user_id).execute()
        
        if count and len(data[1]) > 0:
            return data[1][0]
        else:
            # 更新対象がなかった場合も data[1] は空リスト
            return None

    except Exception as e:
        current_app.logger.error(f"[ERROR] Failed to update event in Supabase: {e}", exc_info=True)
        raise

def delete_event(event_id, user_id):
    """イベントをSupabaseから削除する"""
    try:
        data, count = supabase.table(TABLE_NAME).delete().eq('id', event_id).eq('user_id', user_id).execute()
        
        # 削除が成功したかどうかを返す
        return bool(count and len(data[1]) > 0)
    except Exception as e:
        current_app.logger.error(f"[ERROR] Failed to delete event from Supabase: {e}", exc_info=True)
        raise
