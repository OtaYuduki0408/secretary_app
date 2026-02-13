import random
from datetime import datetime, timedelta

from services.user_settings_service import get_user_settings, upsert_user_settings


def _now_iso() -> str:
    return datetime.now().isoformat()


def _get_playlist_root(user_id: str) -> tuple[dict, dict]:
    settings = get_user_settings(user_id) or {}
    playlist = settings.get("playlist")
    if not isinstance(playlist, dict):
        playlist = {"tracks": []}
    tracks = playlist.get("tracks")
    if not isinstance(tracks, list):
        playlist["tracks"] = []
    settings["playlist"] = playlist
    return settings, playlist


def get_playlist(user_id: str) -> dict:
    if not user_id:
        return {"tracks": []}
    _, playlist = _get_playlist_root(user_id)
    return playlist


def add_playlist_track(user_id: str, track: dict) -> dict:
    settings, playlist = _get_playlist_root(user_id)
    tracks = playlist.get("tracks") or []

    video_id = str(track.get("video_id") or "").strip()
    if not video_id:
        return {"error": "video_id is required"}

    exists = any(
        isinstance(t, dict) and str(t.get("video_id") or "").strip() == video_id
        for t in tracks
    )
    if exists:
        return {"status": "exists", "video_id": video_id}

    title = str(track.get("title") or "").strip()
    artist = str(track.get("artist") or "").strip()
    url = str(track.get("url") or f"https://www.youtube.com/watch?v={video_id}").strip()
    created_at = str(track.get("created_at") or _now_iso()).strip()

    tracks.append(
        {
            "video_id": video_id,
            "title": title,
            "artist": artist,
            "url": url,
            "created_at": created_at,
        }
    )
    playlist["tracks"] = tracks
    settings["playlist"] = playlist
    upsert_user_settings(user_id, settings)
    return {"status": "success", "video_id": video_id}


def remove_playlist_track(user_id: str, video_id: str) -> dict:
    settings, playlist = _get_playlist_root(user_id)
    tracks = playlist.get("tracks") or []
    before = len(tracks)
    tracks = [
        t for t in tracks
        if not (isinstance(t, dict) and str(t.get("video_id") or "").strip() == str(video_id).strip())
    ]
    playlist["tracks"] = tracks
    settings["playlist"] = playlist
    upsert_user_settings(user_id, settings)
    removed = before - len(tracks)
    return {"status": "success", "removed": removed}


def _parse_iso(value: str) -> datetime | None:
    try:
        return datetime.fromisoformat(str(value))
    except Exception:
        return None


def build_playlist_play_plan(user_id: str, scope: str, order: str, artist: str = "", recent_days: int = 30) -> dict:
    playlist = get_playlist(user_id)
    tracks = [t for t in (playlist.get("tracks") or []) if isinstance(t, dict)]

    filtered = tracks
    scope = str(scope or "all").strip().lower()
    order = str(order or "sequential").strip().lower()
    artist = str(artist or "").strip()

    if scope == "artist":
        target = artist.lower()
        filtered = [
            t for t in filtered
            if str(t.get("artist") or "").strip().lower() == target
        ]
    elif scope == "recent":
        threshold = datetime.now() - timedelta(days=max(1, int(recent_days or 30)))
        recent_list = []
        for t in filtered:
            dt = _parse_iso(t.get("created_at"))
            if dt and dt >= threshold:
                recent_list.append(t)
        filtered = recent_list

    if order == "random":
        shuffled = list(filtered)
        random.shuffle(shuffled)
        filtered = shuffled
    else:
        filtered = sorted(
            filtered,
            key=lambda t: _parse_iso(t.get("created_at")) or datetime.min
        )

    videos = []
    for t in filtered:
        video_id = str(t.get("video_id") or "").strip()
        if not video_id:
            continue
        videos.append(
            {
                "id": video_id,
                "title": str(t.get("title") or "プレイリストの曲"),
                "url": str(t.get("url") or f"https://www.youtube.com/watch?v={video_id}"),
                "artist": str(t.get("artist") or ""),
            }
        )

    return {
        "scope": scope,
        "order": order,
        "artist": artist,
        "videos": videos,
    }

