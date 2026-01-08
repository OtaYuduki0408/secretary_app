from models.event import Event
from order.models import db
from datetime import datetime

def add_event(user_id, title, start_time, end_time, description=None):
    """新しいイベントをDBに追加する"""
    try:
        new_event = Event(
            user_id=user_id,
            title=title,
            start_time=start_time,
            end_time=end_time,
            description=description
        )
        db.session.add(new_event)
        db.session.commit()
        return new_event.to_dict()
    except Exception as e:
        db.session.rollback()
        print(f"[ERROR] Failed to add event: {e}")
        raise

def get_events(user_id, start_time_iso=None, end_time_iso=None):
    """指定されたユーザーと期間のイベントをDBから取得する"""
    try:
        query = Event.query.filter_by(user_id=user_id)

        if start_time_iso:
            start_time = datetime.fromisoformat(start_time_iso.replace('Z', '+00:00'))
            query = query.filter(Event.end_time >= start_time)

        if end_time_iso:
            end_time = datetime.fromisoformat(end_time_iso.replace('Z', '+00:00'))
            query = query.filter(Event.start_time <= end_time)

        events = query.order_by(Event.start_time.asc()).all()
        return [event.to_dict() for event in events]
    except Exception as e:
        print(f"[ERROR] Failed to get events: {e}")
        raise

def get_event_by_id(event_id, user_id):
    """IDで単一のイベントを取得する"""
    try:
        event = Event.query.filter_by(id=event_id, user_id=user_id).first()
        return event.to_dict() if event else None
    except Exception as e:
        print(f"[ERROR] Failed to get event by id: {e}")
        raise

def update_event(event_id, user_id, **kwargs):
    """イベント情報を更新する"""
    try:
        event = Event.query.filter_by(id=event_id, user_id=user_id).first()
        if not event:
            return None

        for key, value in kwargs.items():
            if hasattr(event, key):
                # 日時文字列はdatetimeオブジェクトに変換
                if key in ['start_time', 'end_time'] and isinstance(value, str):
                    value = datetime.fromisoformat(value.replace('Z', '+00:00'))
                setattr(event, key, value)
        
        db.session.commit()
        return event.to_dict()
    except Exception as e:
        db.session.rollback()
        print(f"[ERROR] Failed to update event: {e}")
        raise

def delete_event(event_id, user_id):
    """イベントを削除する"""
    try:
        event = Event.query.filter_by(id=event_id, user_id=user_id).first()
        if not event:
            return False # 削除対象が見つからない
        
        db.session.delete(event)
        db.session.commit()
        return True
    except Exception as e:
        db.session.rollback()
        print(f"[ERROR] Failed to delete event: {e}")
        raise
