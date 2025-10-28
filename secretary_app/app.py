from flask import Flask, render_template, jsonify, request, redirect, url_for, session
from spotipy.oauth2 import SpotifyOAuth
import spotipy 
import os
from services.user_service import (
    get_all_users, get_user_by_email, add_user, update_user, delete_user)
from services.category_service import (
    get_all_categories, add_category, delete_category, clear_all_categories)
from services.auth_service import register_user, login_user
from services.finance_service import get_finance_summary, get_all_finance_records
import os


app = Flask(__name__,
            template_folder='templates',
            static_folder='static')

app.secret_key = os.getenv("SECRET_KEY", "devsecret")  # セッション用

# ====================================================================
# ✅ Spotify 認証情報 (ユーザーが提供した値で設定済み)
# ====================================================================
_DEFAULT_CLIENT_ID = '6e488b5a5d3045089c2764317b756eee' 
_DEFAULT_CLIENT_SECRET = 'd4f1f05bcaa4472bba1ce6bae2455eb8' 

# 環境変数から取得。未設定の場合は上記の値を使用
SPOTIPY_CLIENT_ID = os.environ.get('SPOTIPY_CLIENT_ID') or _DEFAULT_CLIENT_ID
SPOTIPY_CLIENT_SECRET = os.environ.get('SPOTIPY_CLIENT_SECRET') or _DEFAULT_CLIENT_SECRET
# ====================================================================


# コールバックURLを https に統一
# ✅ 修正箇所 1: SPOTIPY_REDIRECT_URI を https に統一
SPOTIPY_REDIRECT_URI = "https://127.0.0.1:5000/spotify-callback" 
# 必要な権限 (スコープ) — プレイリスト閲覧に必要
SCOPE = (
    "user-read-private user-read-email user-top-read "
    "playlist-read-private playlist-read-collaborative"
)
# もし曲の追加/削除も行うなら下も追加
# "playlist-modify-public playlist-modify-private"


# Spotipy認証オブジェクトの生成関数
def get_spotify_oauth():
    """SpotifyOAuthオブジェクトを生成し返します"""
    return SpotifyOAuth(
        client_id=SPOTIPY_CLIENT_ID,
        client_secret=SPOTIPY_CLIENT_SECRET,
        redirect_uri=SPOTIPY_REDIRECT_URI,
        scope=SCOPE,
        cache_path=None # ファイルではなくセッションに保存するためキャッシュは無効
    )

# --------------------
# ページルーティング (省略)
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

@app.route('/index')
def index_page():
    return render_template('index2.html')

@app.route('/calendar')
def calendar_page():
    return render_template('calender.html')

@app.route('/oauth-callback')
def oauth_callback():
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
        # ★ all_records を追加してテンプレートに渡す
        all_records=all_records 
    )

@app.route("/nm")
def nm():
    return render_template("notification_test.html")

@app.route('/spotify-login')
def spotify_login():
    # Client ID が設定されているか確認
    if SPOTIPY_CLIENT_ID == 'YOUR_CLIENT_ID_HERE' or SPOTIPY_CLIENT_SECRET == 'YOUR_CLIENT_SECRET_HERE':
         return "エラー: Client ID/Secret がコードに設定されていません。`app.py`を修正してください。", 500

    sp_oauth = get_spotify_oauth()
    # ユーザーをSpotifyの認証ページにリダイレクト
    auth_url = sp_oauth.get_authorize_url()
    return redirect(auth_url)

# ✅ Spotifyコールバックを処理
@app.route('/spotify-callback')
def spotify_callback():
    sp_oauth = get_spotify_oauth()
    # URLパラメータから認可コードを取得
    code = request.args.get('code')
    
    # Spotifyからのエラーチェック
    if request.args.get('error'):
        error_message = request.args.get('error')
        print(f"Spotify認証エラー発生: {error_message}")
        if error_message == 'access_denied':
            display_message = "ユーザーが認証を拒否しました。"
        elif error_message == 'invalid_client':
            display_message = "Client ID または Redirect URI の設定が間違っています。開発者ダッシュボードを確認してください。"
        else:
            display_message = f"Spotify認証エラー: {error_message}"
        
        return render_template('spotify.html', is_authenticated=False, error_message=display_message)


    # 認可コードをアクセストークンと交換
    try:
        token_info = sp_oauth.get_access_token(code)
    except Exception as e:
        # トークン交換時のエラー
        print(f"トークン交換エラー: {e}")
        return render_template('spotify.html', is_authenticated=False, error_message=f"トークンの交換中にエラーが発生しました: {str(e)}")


    # トークン情報をセッションに保存
    session['spotify_token_info'] = token_info
    
    # 連携ページへリダイレクト
    return redirect(url_for('spotify_page')) 

# ✅ Spotify連携ページ (ログイン状態の確認とデータ取得)
@app.route('/spotify')
def spotify_page():
    sp_oauth = get_spotify_oauth()
    token_info = session.get('spotify_token_info')

    # 未認証 → 認可URLを出して案内
    if not token_info:
        auth_url = sp_oauth.get_authorize_url()
        return render_template('spotify.html', is_authenticated=False, auth_url=auth_url)

    # 有効期限切れなら更新
    if sp_oauth.is_token_expired(token_info):
        try:
            token_info = sp_oauth.refresh_access_token(token_info['refresh_token'])
            session['spotify_token_info'] = token_info
        except Exception:
            return render_template(
                'spotify.html',
                is_authenticated=False,
                error_message='Spotifyのトークン更新に失敗しました。もう一度連携してください。'
            )

    # データ取得
    try:
        sp = spotipy.Spotify(auth=token_info['access_token'])

        # プロフィール＆よく聴く曲
        user_data  = sp.current_user()
        top_tracks = sp.current_user_top_tracks(limit=5, time_range='medium_term')

        # ★ プレイリスト（ページングで全件）
        playlists = []
        results = sp.current_user_playlists(limit=50, offset=0)
        while True:
            playlists.extend(results.get('items', []))
            if results.get('next'):
                results = sp.next(results)
            else:
                break

        # 正常系：テンプレに渡す（← ここで return したら、この関数は終了）
        return render_template(
            'spotify.html',
            is_authenticated=True,
            user=user_data,
            tracks=top_tracks.get('items', []),
            playlists=playlists
        )

    # 例外ハンドリング（順により具体→汎用）
    except spotipy.exceptions.SpotifyException as e:
        return render_template(
            'spotify.html',
            is_authenticated=False,
            error_message=f'Spotify API エラー: {e}'
        )
    except Exception:
        return render_template(
            'spotify.html',
            is_authenticated=False,
            error_message='Spotifyからのデータ取得に失敗しました。もう一度お試しください。'
        )
# 登録ページ (省略)
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


# ログインページ (省略)
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


# ログアウト (省略)
@app.route('/logout')
def logout():
    session.pop('user', None)
    session.pop('spotify_token_info', None) 
    return redirect(url_for('login'))

# --------------------
# APIルーティング (省略)
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

@app.route('/api/spotify/search')
def spotify_search_api():
    """
    クエリ文字列 q を受け取り、曲（tracks）を検索して JSON で返す。
    返すフィールドはフロントで使いやすい最小限。
    """
    q = request.args.get('q', '').strip()
    if not q:
        return jsonify({"tracks": []})

    sp_oauth = get_spotify_oauth()
    token_info = session.get('spotify_token_info')

    # 未認証なら空
    if not token_info:
        return jsonify({"tracks": []}), 401

    # 期限切れなら更新
    if sp_oauth.is_token_expired(token_info):
        try:
            token_info = sp_oauth.refresh_access_token(token_info['refresh_token'])
            session['spotify_token_info'] = token_info
        except Exception:
            return jsonify({"tracks": []}), 401

    try:
        sp = spotipy.Spotify(auth=token_info['access_token'])
        # トラックのみ検索（50件まで）
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
        # 認可周りの失敗など
        return jsonify({"error": str(e), "tracks": []}), 500
    except Exception as e:
        return jsonify({"error": "search_failed", "tracks": []}), 500

if __name__ == '__main__':
    app.run(
        host='0.0.0.0',
        port=5000,
        debug=True,
        # ✅ 修正箇所 2: ssl_context='adhoc' を追加して https に戻す
        ssl_context='adhoc' 
    )
