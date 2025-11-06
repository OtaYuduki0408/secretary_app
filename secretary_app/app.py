from flask import Flask, render_template, jsonify, request, redirect, url_for, session
from services.user_service import (
    get_all_users, get_user_by_email, add_user, update_user, delete_user)
from services.category_service import (
    get_all_categories, add_category, delete_category, clear_all_categories)
from services.auth_service import register_user, login_user
from services.finance_service import get_finance_summary, get_all_finance_records
from flask import Flask, render_template, jsonify, request, redirect, url_for, session, abort
from spotipy.oauth2 import SpotifyOAuth
import spotipy
import os

from services.user_service import (
    get_all_users, get_user_by_email, add_user, update_user, delete_user
)
from services.category_service import (
    get_all_categories, add_category, delete_category, clear_all_categories
)
from services.auth_service import register_user, login_user
from services.finance_service import get_finance_summary, get_all_finance_records
from services.chat_space_model import ChatSpaceModel
import os



app = Flask(__name__, template_folder='templates', static_folder='static')
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    print("Warning: GEMINI_API_KEY environment variable not set. ChatSpaceModel may not function correctly.")
chat_space_model = ChatSpaceModel(gemini_api_key=GEMINI_API_KEY)

app.secret_key = os.getenv("SECRET_KEY", "devsecret")  # セッション用

PLAYER_BAR_SNIPPET = """
  <div id="vs-playerbar" hidden>
    <div class="vs-section vs-main-controls">
      <button id="vs-prev" class="vs-button" title="Prev">&#9198;</button>
      <button id="vs-play" class="vs-button" title="Play/Pause">&#9654;</button>
      <button id="vs-next" class="vs-button" title="Next">&#9197;</button>
    </div>
    <div class="vs-section vs-timeline">
      <span id="vs-time">0:00</span>
      <input id="vs-seek" type="range" min="0" max="1000" value="0" />
      <span id="vs-dur">0:00</span>
    </div>
    <div class="vs-section vs-options">
      <button id="vs-loop" class="vs-button" title="Repeat">&#128257;</button>
      <button id="vs-shuffle" class="vs-button" title="Shuffle">&#128256;</button>
      <input id="vs-vol" type="range" min="0" max="100" value="80" title="Volume" />
    </div>
  </div>
  <div id="toast" hidden aria-live="polite" aria-atomic="true"></div>
"""

# ====================================================================
# ✅ Spotify 認証情報
# ====================================================================
_DEFAULT_CLIENT_ID = '6e488b5a5d3045089c2764317b756eee'
_DEFAULT_CLIENT_SECRET = 'd4f1f05bcaa4472bba1ce6bae2455eb8'
SPOTIPY_CLIENT_ID = os.environ.get('SPOTIPY_CLIENT_ID') or _DEFAULT_CLIENT_ID
SPOTIPY_CLIENT_SECRET = os.environ.get('SPOTIPY_CLIENT_SECRET') or _DEFAULT_CLIENT_SECRET

# ✅ HTTPS コールバック（Dashboard側にも完全一致で登録）
SPOTIPY_REDIRECT_URI = "https://127.0.0.1:5000/spotify-callback"

# ✅ スコープは配列で管理して join（全角/改行/スペース抜け事故を防止）
SCOPE = (
    "user-read-private user-read-email "
    "streaming user-read-playback-state user-modify-playback-state "
    "playlist-read-private playlist-read-collaborative user-top-read "
    "playlist-modify-public playlist-modify-private"
)

def get_spotify_oauth():
    return SpotifyOAuth(
        client_id=SPOTIPY_CLIENT_ID,
        client_secret=SPOTIPY_CLIENT_SECRET,
        redirect_uri=SPOTIPY_REDIRECT_URI,
        scope=SCOPE,
        cache_path=None
    )

# ====== 汎用ヘルパ ======
def _get_token_info():
    return session.get('spotify_token_info')

def _save_token_info(token_info: dict):
    session['spotify_token_info'] = token_info

def _ensure_access_token() -> str:
    """有効な access_token を返す（期限切れなら refresh）。未認証なら 401。"""
    token_info = _get_token_info()
    if not token_info:
        abort(401, description="Not authenticated to Spotify")
    sp_oauth = get_spotify_oauth()
    if sp_oauth.is_token_expired(token_info):
        token_info = sp_oauth.refresh_access_token(token_info['refresh_token'])
        _save_token_info(token_info)
    return token_info['access_token']

# 追加: スコープ比較ヘルパ
def _has_required_scopes(token_info, required_scope: str) -> bool:
    cur = set((token_info or {}).get("scope", "").split())
    need = set(required_scope.split())
    return need.issubset(cur)

# --------------------
# ページ
# --------------------
@app.route('/')
def main():
    return render_template('main.html')

@app.route('/categories')
def categories():
    return render_template('categories.html')

@app.route('/expense')
def expense():
    return render_template('expense.html')

@app.route('/slot')
def slot():
    return render_template('slot.html')

@app.route('/calendar')
def calendar_page():
    return render_template('calender.html')

@app.route('/oauth-callback')
def oauth_callback_A():
    return render_template('oauth-callback.html')

@app.route("/finance")
def finance():
    income_stats, expense_stats = get_finance_summary()
    
    # ★ データベースから全レコードを取得する関数を呼び出す
    all_records = get_all_finance_records() 

    # テンプレートに渡す
    return render_template(
        "finance.html",
        income_stats=income_stats,
        expense_stats=expense_stats,
        all_records=all_records
    )

@app.route("/nm")
def nm():
    return render_template("notification_test.html")


# --------------------
# Spotify 認証フロー
# --------------------
@app.route('/spotify-login')
def spotify_login():
    # 新規ログインでも古いトークンがあれば一度破棄してから
    session.pop('spotify_token_info', None)
    sp_oauth = get_spotify_oauth()
    return redirect(sp_oauth.get_authorize_url() + "&show_dialog=true")

@app.route('/spotify-relogin')
def spotify_relogin():
    # ★ ここが重要：セッション内の古いトークンを必ず捨てる
    session.pop('spotify_token_info', None)
    sp_oauth = get_spotify_oauth()
    return redirect(sp_oauth.get_authorize_url() + "&show_dialog=true")

@app.route('/spotify-callback')
def spotify_callback():
    sp_oauth = get_spotify_oauth()
    if request.args.get('error'):
        err = request.args.get('error')
        return render_template('spotify.html', is_authenticated=False,
                               error_message=f"Spotify認証エラー: {err}")

    code = request.args.get('code')
    try:
        token_info = sp_oauth.get_access_token(code)  # spotipy標準
        # 取得できたスコープをログ代わりに保持（後で /api/spotify/scope で見える）
        session['spotify_token_info'] = token_info
    except Exception as e:
        return render_template('spotify.html', is_authenticated=False,
                               error_message=f"トークン交換エラー: {e}")

    return redirect(url_for('spotify_page'))


@app.route('/spotify')
def spotify_page():
    sp_oauth = get_spotify_oauth()
    token_info = _get_token_info()

    if not token_info:
        auth_url = sp_oauth.get_authorize_url()
        return render_template('spotify.html', is_authenticated=False, auth_url=auth_url)

    # 期限切れなら更新
    if sp_oauth.is_token_expired(token_info):
        try:
            token_info = sp_oauth.refresh_access_token(token_info['refresh_token'])
            _save_token_info(token_info)
        except Exception as e:
            return render_template('spotify.html', is_authenticated=False,
                                   error_message=f'トークン更新に失敗: {e}')

    # ✅ 必須スコープが無ければ強制再同意へ
    if not _has_required_scopes(token_info, SCOPE):
        return redirect(url_for('spotify_relogin'))

    try:
        sp = spotipy.Spotify(auth=token_info['access_token'])
        user_data  = sp.current_user()
        top_tracks = sp.current_user_top_tracks(limit=5, time_range='medium_term')

        # プレイリスト（ページング）
        playlists = []
        results = sp.current_user_playlists(limit=50, offset=0)
        while True:
            playlists.extend(results.get('items', []))
            if results.get('next'):
                results = sp.next(results)
            else:
                break

        return render_template(
            'spotify.html',
            is_authenticated=True,
            user=user_data,
            tracks=top_tracks.get('items', []),
            playlists=playlists,
            focus_section=request.args.get('section', '')
        )
    except spotipy.exceptions.SpotifyException as e:
        # Spotify API からの具体的なエラーを表示
        return render_template('spotify.html', is_authenticated=False,
                               error_message=f'Spotify API エラー: {e}')
    except Exception as e:
        return render_template('spotify.html', is_authenticated=False,
                               error_message=f'不明なエラー: {e}')

    except Exception:
        return render_template('spotify.html', is_authenticated=False,
                               error_message='Spotifyからのデータ取得に失敗しました。もう一度お試しください。')

# === デバッグ: 現在のスコープ/ユーザー/デバイス ===
@app.route('/api/spotify/me')
def api_spotify_me():
    try:
        token = _ensure_access_token()
        sp = spotipy.Spotify(auth=token)
        me = sp.current_user()
        devices = sp.devices()
        return jsonify({
            "user": {"id": me.get("id"), "display_name": me.get("display_name")},
            "devices": devices.get("devices", []),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --------------------
# 認証/ユーザー管理（既存）
# --------------------
@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        name = request.form['name']
        email = request.form['email']
        password = request.form['password']
        result = register_user(name, email, password)
        if "error" in result:
            return render_template('register.html', error=result["error"])
        return redirect(url_for('login'))
    return render_template('register.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email = request.form['email']
        password = request.form['password']
        result = login_user(email, password)
        if "error" in result:
            return render_template('login.html', error=result["error"])
        session['user'] = result["user"]
        return redirect(url_for('main'))
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.pop('user', None)
    session.pop('spotify_token_info', None)
    return redirect(url_for('login'))


# --------------------
# REST API（既存）
# --------------------
@app.route("/users", methods=["GET"])
def get_users_route():
    return jsonify(get_all_users())

@app.route("/user/<email>", methods=["GET"])
def get_user_route(email):
    return jsonify(get_user_by_email(email))

@app.route("/user", methods=["POST"])
def add_user_route():
    data = request.json
    return jsonify(add_user(data))

@app.route("/user", methods=["PUT"])
def update_user_route():
    data = request.json
    return jsonify(update_user(data["email"], {"name": data["name"]}))

@app.route("/user", methods=["DELETE"])
def delete_user_route():
    email = request.args.get("email")
    return jsonify(delete_user(email))

@app.route("/api/categories", methods=["GET"])
def get_categories_route():
    return jsonify(get_all_categories())

@app.route("/api/categories", methods=["POST"])
def add_category_route():
    name = request.json.get("name")
    return jsonify(add_category(name))

@app.route("/api/categories/<id>", methods=["DELETE"])
def delete_category_route(id):
    return jsonify(delete_category(id))

@app.route("/api/categories/clear", methods=["DELETE"])
def clear_categories_route():
    return jsonify(clear_all_categories())


# --------------------
# ✅ Spotify 用 API（検索 / 曲追加 / トークン供給 / スコープ確認）
# --------------------
@app.route('/api/spotify/search')
def spotify_search_api():
    q = request.args.get('q', '').strip()
    if not q:
        return jsonify({"tracks": []})

    try:
        access_token = _ensure_access_token()
        sp = spotipy.Spotify(auth=access_token)

        res = sp.search(q=q, type='track', limit=50, market='JP')
        tracks_out = []
        for item in res.get('tracks', {}).get('items', []):
            tracks_out.append({
                "id": item["id"],
                "name": item["name"],
                "artists": ", ".join(a["name"] for a in item.get("artists", [])),
                "album": item.get("album", {}).get("name"),
                "image": (item.get("album", {}).get("images", []) or [{}])[0].get("url"),
                "preview_url": item.get("preview_url"),
                "external_url": item.get("external_urls", {}).get("spotify"),
                "uri": item.get("uri"),
                "duration_ms": item.get("duration_ms"),
            })
        return jsonify({"tracks": tracks_out})
    except spotipy.exceptions.SpotifyException as e:
        return jsonify({"error": str(e), "tracks": []}), 500
    except Exception:
        return jsonify({"error": "search_failed", "tracks": []}), 500

@app.route('/api/spotify/create-playlist', methods=['POST'])
def spotify_create_playlist():
    data = request.get_json(force=True) or {}
    name = (data.get('name') or '').strip()
    description = (data.get('description') or '').strip()
    public = bool(data.get('public', False))

    if not name:
        return jsonify({"error": "missing_name"}), 400

    try:
        access_token = _ensure_access_token()
        sp = spotipy.Spotify(auth=access_token)
        me = sp.current_user()
        playlist = sp.user_playlist_create(
            me.get('id'),
            name,
            public=public,
            description=description or None
        )
        return jsonify({"playlist": playlist}), 201
    except spotipy.exceptions.SpotifyException as e:
        return jsonify({"error": str(e)}), 500
    except Exception as exc:
        return jsonify({"error": "create_failed", "detail": str(exc)}), 500


@app.route('/api/spotify/playlist/<playlist_id>', methods=['DELETE'])
def spotify_delete_playlist(playlist_id):
    if not playlist_id:
        return jsonify({"error": "missing_playlist_id"}), 400
    try:
        access_token = _ensure_access_token()
        sp = spotipy.Spotify(auth=access_token)
        sp.current_user_unfollow_playlist(playlist_id)
        return jsonify({"ok": True})
    except spotipy.exceptions.SpotifyException as e:
        return jsonify({"error": str(e)}), 500
    except Exception:
        return jsonify({"error": "delete_failed"}), 500


@app.route('/api/spotify/add-track', methods=['POST'])
def spotify_add_track():
    data = request.get_json(force=True)
    playlist_id = data.get('playlist_id')
    track_uri   = data.get('track_uri')

    if not playlist_id or not track_uri:
        return jsonify({"error": "missing playlist_id or track_uri"}), 400

    try:
        access_token = _ensure_access_token()
        sp = spotipy.Spotify(auth=access_token)
        sp.playlist_add_items(playlist_id, [track_uri])
        return jsonify({"ok": True})
    except spotipy.exceptions.SpotifyException as e:
        return jsonify({"error": str(e)}), 500
    except Exception:
        return jsonify({"error": "add_failed"}), 500
    
    # === 既存 import/関数はそのまま ===

@app.route('/spotify/playlist/<playlist_id>')
def spotify_playlist(playlist_id):
    """
    プレイリスト詳細（曲一覧）ページ
    """
    try:
        access_token = _ensure_access_token()
        sp = spotipy.Spotify(auth=access_token)

        # ヘッダー情報
        pl = sp.playlist(
            playlist_id,
            fields="id,name,uri,images,owner(display_name),tracks(total),external_urls.spotify"
        )

        # 曲一覧（ページング対応）
        tracks = []
        results = sp.playlist_items(
            playlist_id,
            limit=100,
            offset=0,
            fields="items(track(name,uri,duration_ms,artists(name),album(name,images),external_urls.spotify)),next"
        )
        while True:
            for item in results.get('items', []):
                tr = item.get('track') or {}
                if not tr:
                    continue
                images = (tr.get('album', {}).get('images') or [])
                # 小さい順→大きい順どちらでも良いが、なければ None
                img = (images[-1]['url'] if images else None) or (images[0]['url'] if images else None)

                tracks.append({
                    "name": tr.get("name"),
                    "uri": tr.get("uri"),
                    "duration_ms": tr.get("duration_ms") or 0,
                    "artists": ", ".join([a.get("name","") for a in tr.get("artists", [])]),
                    "album": tr.get("album", {}).get("name"),
                    "image": img,
                    "external": tr.get("external_urls", {}).get("spotify"),
                })
            if results.get('next'):
                results = sp.next(results)
            else:
                break

        return render_template("spotify_playlist.html", playlist=pl, tracks=tracks, is_authenticated=True)

    except spotipy.exceptions.SpotifyException as e:
        return render_template("spotify.html", is_authenticated=False,
                               error_message=f"Spotify API エラー: {e}")
    except Exception as e:
        return render_template("spotify.html", is_authenticated=False,
                               error_message=f"プレイリスト取得に失敗: {e}")


# ✅ SDK 用：常に最新の access_token を返す（スコープ不足なら 403）
@app.route('/api/spotify/token')
def api_spotify_token():
    sp_oauth = get_spotify_oauth()
    token_info = session.get('spotify_token_info')
    if not token_info:
        return jsonify({"error": "not_authenticated"}), 401
    if sp_oauth.is_token_expired(token_info):
        try:
            token_info = sp_oauth.refresh_access_token(token_info['refresh_token'])
            session['spotify_token_info'] = token_info
        except Exception:
            return jsonify({"error": "refresh_failed"}), 401
    if not _has_required_scopes(token_info, SCOPE):
        return jsonify({"error": "invalid_scopes",
                        "scope": token_info.get("scope","")}), 403
    return jsonify({"access_token": token_info["access_token"],
                    "scope": token_info.get("scope","")})

# ✅ 現在のスコープ可視化（デバッグ用）
@app.route('/api/spotify/scope')
def spotify_scope():
    token_info = session.get('spotify_token_info')
    if not token_info:
        return jsonify({"authenticated": False}), 401
    return jsonify({
        "authenticated": True,
        "scope": token_info.get("scope", ""),
        "has_all_required": _has_required_scopes(token_info, SCOPE)
    })


@app.after_request
def ensure_spotify_playerbar(response):
    """Inject Spotify player bar markup and scripts into every HTML response."""
    content_type = (response.headers.get("Content-Type") or "").lower()
    if (
        200 <= response.status_code < 300
        and not response.direct_passthrough
        and "text/html" in content_type
    ):
        body = response.get_data(as_text=True)
        if "</body>" in body:
            fragments = []
            if 'id="vs-playerbar"' not in body:
                fragments.append(PLAYER_BAR_SNIPPET)
            if "js/spotify.js" not in body:
                script_path = url_for("static", filename="js/spotify.js")
                fragments.append(f'<script src="{script_path}" defer></script>')
            if "sdk.scdn.co/spotify-player.js" not in body:
                fragments.append('<script src="https://sdk.scdn.co/spotify-player.js" defer></script>')
            if fragments:
                body = body.replace("</body>", "".join(fragments) + "</body>")
                response.set_data(body)
    return response


@app.route('/api/chat', methods=['POST'])
def chat_api():
    data = request.get_json()
    user_input = data.get('inputValue', '')
    print("--- [DEBUG] /api/chat: Received request ---")
    app.logger.info(f"Received chat input from frontend: {user_input}")
    
    # ChatSpaceModelのcheck_chat_spaceメソッドを呼び出す
    print("--- [DEBUG] /api/chat: Calling check_chat_space ---")
    response_data = chat_space_model.check_chat_space(user_input)
    print(f"--- [DEBUG] /api/chat: Received response from check_chat_space: {response_data} ---")
    
    return jsonify(response_data)


import os
import json
from flask import redirect, url_for, request, session, jsonify, render_template
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from services.ScheduleManager import ScheduleManager

# Google OAuth 配置
CLIENT_SECRETS_FILE = "client_secret.json"
SCOPES = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
    "openid",
    "email",
    "profile"
]

# ==== 回调 ====
@app.route("/oauth-callback")
def oauth_callback():
    """Google 返回后保存 token 并跳转到 /calendar"""
    state = session.get("oauth_state")
    flow = Flow.from_client_secrets_file(
        CLIENT_SECRETS_FILE,
        scopes=SCOPES,
        state=state,
        redirect_uri="https://127.0.0.1:5000/oauth-callback"
    )
    flow.fetch_token(authorization_response=request.url)
    creds = flow.credentials

    creds_info = {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": list(creds.scopes)
    }

    sm = ScheduleManager()
    sm.set_credentials_from_info(creds_info)

    return redirect("/calendar")



if __name__ == '__main__':
    app.run(
        host='0.0.0.0',
        port=5000,
        debug=True,
        ssl_context='adhoc'
    )
