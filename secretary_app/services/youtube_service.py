import os
import requests
from datetime import datetime, timedelta
import pytz
from supabase_client import supabase

JST = pytz.timezone('Asia/Tokyo')
YOUTUBE_API_KEY = os.getenv('YOUTUBE_API_KEY') or os.getenv('GEMINI_API_KEY')

def get_channel_info(channel_id):
    """チャンネルの詳細情報を取得"""
    if not YOUTUBE_API_KEY:
        return {"error": "YouTube API Key not set"}
    
    url = "https://www.googleapis.com/youtube/v3/channels"
    params = {
        "part": "snippet,statistics,contentDetails",
        "id": channel_id,
        "key": YOUTUBE_API_KEY
    }
    try:
        res = requests.get(url, params=params)
        res.raise_for_status()
        data = res.json()
        if not data.get("items"):
            return {"error": "Channel not found"}
        
        item = data["items"][0]
        snippet = item["snippet"]
        stats = item["statistics"]
        content_details = item["contentDetails"]
        
        return {
            "channel_id": channel_id,
            "title": snippet["title"],
            "description": snippet["description"],
            "thumbnail_url": snippet["thumbnails"]["default"]["url"],
            "subscriber_count": stats.get("subscriberCount"),
            "video_count": stats.get("videoCount"),
            "uploads_playlist_id": content_details["relatedPlaylists"]["uploads"]
        }
    except Exception as e:
        return {"error": str(e)}

def get_video_info(video_id):
    """動画の詳細情報を取得"""
    if not YOUTUBE_API_KEY:
        return {"error": "YouTube API Key not set"}
    
    url = "https://www.googleapis.com/youtube/v3/videos"
    params = {
        "part": "snippet,statistics,contentDetails",
        "id": video_id,
        "key": YOUTUBE_API_KEY
    }
    try:
        res = requests.get(url, params=params)
        res.raise_for_status()
        data = res.json()
        if not data.get("items"):
            return {"error": "Video not found"}
        
        item = data["items"][0]
        snippet = item["snippet"]
        return {
            "video_id": video_id,
            "title": snippet["title"],
            "description": snippet["description"],
            "channel_id": snippet["channelId"],
            "channel_title": snippet["channelTitle"],
            "published_at": snippet["publishedAt"],
            "thumbnail_url": snippet["thumbnails"]["medium"]["url"]
        }
    except Exception as e:
        return {"error": str(e)}

def register_channel(user_id, channel_id, category="未分類"):
    """チャンネルを登録する"""
    info = get_channel_info(channel_id)
    if "error" in info:
        return info
    
    payload = {
        "user_id": user_id,
        "channel_id": channel_id,
        "channel_title": info["title"],
        "thumbnail_url": info["thumbnail_url"],
        "category": category
    }
    
    try:
        res = supabase.table("youtube_channels").upsert(payload).execute()
        return res.data[0] if res.data else info
    except Exception as e:
        return {"error": str(e)}

def get_registered_channels(user_id):
    """ユーザーが登録したチャンネル一覧を取得"""
    try:
        res = supabase.table("youtube_channels").select("*").eq("user_id", user_id).execute()
        return res.data or []
    except Exception as e:
        return {"error": str(e)}

def get_channel_videos(channel_id, max_results=20):
    """特定のチャンネルの動画一覧を取得（最新順）"""
    # まずチャンネルの 'uploads' プレイリスト ID を取得
    info = get_channel_info(channel_id)
    if "error" in info:
        return info
    
    uploads_id = info["uploads_playlist_id"]
    url = "https://www.googleapis.com/youtube/v3/playlistItems"
    params = {
        "part": "snippet,contentDetails",
        "playlistId": uploads_id,
        "maxResults": max_results,
        "key": YOUTUBE_API_KEY
    }
    
    try:
        res = requests.get(url, params=params)
        res.raise_for_status()
        data = res.json()
        
        videos = []
        for item in data.get("items", []):
            snippet = item["snippet"]
            content_details = item["contentDetails"]
            videos.append({
                "video_id": content_details["videoId"],
                "title": snippet["title"],
                "published_at": snippet["publishedAt"],
                "thumbnail_url": snippet["thumbnails"]["medium"]["url"]
            })
        return videos
    except Exception as e:
        return {"error": str(e)}

def update_watch_history(user_id, video_id, title, position=0, is_completed=False):
    """視聴履歴を更新"""
    payload = {
        "user_id": user_id,
        "video_id": video_id,
        "title": title,
        "last_position_seconds": position,
        "is_completed": is_completed,
        "watched_at": datetime.now(JST).isoformat()
    }
    try:
        res = supabase.table("youtube_watch_history").upsert(payload, on_conflict="user_id,video_id").execute()
        return res.data[0] if res.data else payload
    except Exception as e:
        return {"error": str(e)}

def get_watch_history(user_id, video_id=None):
    """視聴履歴を取得"""
    try:
        query = supabase.table("youtube_watch_history").select("*").eq("user_id", user_id)
        if video_id:
            query = query.eq("video_id", video_id)
        res = query.order("watched_at", desc=True).execute()
        return res.data or []
    except Exception as e:
        return {"error": str(e)}
