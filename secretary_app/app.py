# -*- coding: utf-8 -*-
import os
import sys
from datetime import datetime, timedelta
from functools import wraps

from flask import (
    Flask, render_template, jsonify, request, redirect, url_for, session, abort, g,
    send_from_directory,
)
from spotipy.oauth2 import SpotifyOAuth
import spotipy
from services.google_oauth import build_web_flow, get_google_redirect_uri

# order配下のモジュール/ルートを使うためにパス追加
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'order'))

import json
from services.user_service import (
    get_all_users, get_user_by_email, add_user, update_user, delete_user
)
from services.category_service import (
    get_all_categories, add_category, delete_category, clear_all_categories
)
from services.auth_service import register_user, login_user
from services.expense_service import add_finance_record, delete_finance_record
from services.finance_service import (
    get_finance_summary,
    get_all_finance_records,
    get_current_balance,
    get_monthly_expense,
    get_daily_expense,
    get_monthly_goal,
    upsert_monthly_goal,
)
from services.chat_space_model import ChatSpaceModel
from services.memo_routes import memo_bp
from services.ScheduleManager import ScheduleManager
from order.models import db
from order.custom_order_routes import custom_order_bp
from order.command_routes import command_bp


# ============== 基本設定 ==============
app = Flask(__name__, template_folder='templates', static_folder='static')

# DBファイルのパス設定
instance_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'instance')
os.makedirs(instance_path, exist_ok=True)
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{os.path.join(instance_path, "orders.db")}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db.init_app(app)

# Blueprint登録
app.register_blueprint(custom_order_bp, url_prefix='/api')
app.register_blueprint(command_bp, url_prefix='/api')

from flask import Blueprint
custom_order_pages_bp = Blueprint(
    'custom_order_pages', __name__,
    template_folder='order/static/html', static_folder='order/static'
)
order_html_dir = os.path.join(os.path.dirname(__file__), 'order', 'static', 'html')

@custom_order_pages_bp.route('/')
def custom_order_index():
    return send_from_directory(order_html_dir, 'index.html')

@custom_order_pages_bp.route('/edit')
@custom_order_pages_bp.route('/edit/<int:order_id>')
def edit_command_page(order_id=None):
    return send_from_directory(order_html_dir, 'custom_order_edit.html')

app.register_blueprint(custom_order_pages_bp, url_prefix='/custom_order')


# ============== APIキー認証（api/* のみ）==============
ALLOWED_API_KEYS = set(os.environ.get('ALLOWED_API_KEYS', '').split(','))

@app.before_request
def require_api_key():
    if not request.path.startswith('/api/'):
        return
    if not ALLOWED_API_KEYS or ALLOWED_API_KEYS == {''}:
        return
    provided_key = request.headers.get('X-API-KEY')
    if provided_key not in ALLOWED_API_KEYS:
        return jsonify({'message': 'Error: Invalid or missing API Key.'}), 403


# ============== 環境変数とモジュール初期化 ==============
SECRET_KEY = os.getenv('SECRET_KEY')
if not SECRET_KEY:
    raise RuntimeError('SECRET_KEY 環境変数を設定してください。')
app.secret_key = SECRET_KEY
app.permanent_session_lifetime = timedelta(days=30)  # �ԑ˃Z�b�V�������炩�����g�p�Ԋm�点

GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
if not GEMINI_API_KEY:
    print('Warning: GEMINI_API_KEY not set. ChatSpaceModel may not work.')
chat_space_model = ChatSpaceModel(gemini_api_key=GEMINI_API_KEY)
calendar_manager = ScheduleManager()

QUICK_COMMANDS_FILE = os.path.join(os.path.dirname(__file__), 'quick_commands.json')

def load_quick_commands():
    if os.path.exists(QUICK_COMMANDS_FILE):
        with open(QUICK_COMMANDS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []

quick_commands = load_quick_commands()


# ============== Google OAuth ==============
GOOGLE_SCOPES = [
    'openid',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/calendar',
]
GOOGLE_REDIRECT_URI = get_google_redirect_uri()


# ============== Spotify 設定 ==============
SPOTIPY_CLIENT_ID = os.environ.get('SPOTIPY_CLIENT_ID')
if not SPOTIPY_CLIENT_ID:
    raise RuntimeError('SPOTIPY_CLIENT_ID 環境変数を設定してください。')
SPOTIPY_CLIENT_SECRET = os.environ.get('SPOTIPHY_CLIENT_SECRET') or os.environ.get('SPOTIPY_CLIENT_SECRET')
if not SPOTIPY_CLIENT_SECRET:
    raise RuntimeError('SPOTIPY_CLIENT_SECRET (または SPOTIPHY_CLIENT_SECRET) 環境変数を設定してください。')
SPOTIPY_REDIRECT_URI = os.environ.get('SPOTIPY_REDIRECT_URI', 'https://127.0.0.1:5000/spotify-callback')

# スコープはスペース区切りの1つの文字列で管理
# スコープはスペース区切りの1つの文字列で管理
SPOTIFY_SCOPES = (
    'streaming user-read-playback-state user-modify-playback-state '
    'playlist-read-private playlist-read-collaborative user-top-read '
    'playlist-modify-public playlist-modify-private'
)
REQUIRED_SPOTIFY_SCOPE = SPOTIFY_SCOPES

def get_spotify_oauth():
    return SpotifyOAuth(
        client_id=SPOTIPY_CLIENT_ID,
        client_secret=SPOTIPY_CLIENT_SECRET,
        redirect_uri=SPOTIPY_REDIRECT_URI,
        scope=SPOTIFY_SCOPES,
        cache_path=None,
    )

# トークン情報
def _get_token_info():
    return session.get('spotify_token_info')

def _save_token_info(token_info: dict):
    session['spotify_token_info'] = token_info

def _ensure_access_token() -> str:
    token_info = _get_token_info()
    if not token_info:
        abort(401, description='Not authenticated to Spotify')
    sp_oauth = get_spotify_oauth()
    if sp_oauth.is_token_expired(token_info):
        token_info = sp_oauth.refresh_access_token(token_info['refresh_token'])
        _save_token_info(token_info)
    return token_info['access_token']

def _has_required_scopes(token_info, required_scope: str) -> bool:
    cur = set((token_info or {}).get('scope', '').split())
    need = set(required_scope.split())
    return need.issubset(cur)


# ============== 認証デコレータ ==============
def login_required(view_func):
    @wraps(view_func)
    def wrapper(*args, **kwargs):
        if not session.get('user'):
            return redirect(url_for('login'))
        return view_func(*args, **kwargs)
    return wrapper

def api_login_required(view_func):
    @wraps(view_func)
    def wrapper(*args, **kwargs):
        email = request.headers.get('X-User-Email')
        password = request.headers.get('X-User-Password')

        if not email or not password:
            # JSONボディからも試行
            data = request.get_json(silent=True)
            if data:
                email = data.get('email')
                password = data.get('password')

        if not email or not password:
            return jsonify({'message': 'Error: Email and password are required for API authentication.'}), 401

        login_result = login_user(email, password)
        if 'error' in login_result:
            return jsonify({'message': f'Error: {login_result["error"]}'}), 401

        g.user_id = login_result['user']['id']
        return view_func(*args, **kwargs)
    return wrapper


# ============== トップページ ==============
@app.route('/')
@login_required
def main():
    user = session.get('user') or {}
    user_name = user.get('name') or user.get('email') or 'ユーザー'
    return render_template('main.html', user=user, user_name=user_name)

@app.route('/expense')
@login_required
def expense():
    user_id = session.get('user', {}).get('id')
    balance = get_current_balance(user_id)
    monthly_expense = get_monthly_expense(user_id)
    daily_expense = get_daily_expense(user_id)
    return render_template(
        'expense.html',
        balance=balance,
        monthly_expense=monthly_expense,
        daily_expense=daily_expense,
    )

@app.route('/categories')
@login_required
def categories():
    return render_template('categories.html')

@app.route('/slot')
def slot():
    return render_template('slot.html')

@app.route('/index')
def index_page():
    return render_template('index.html')

@app.route('/oauth-callback2')
def oauth_callback2():
    return render_template('oauth-callback2.html')

@app.route('/memo')
def memo():
    return render_template('memo.html')

@app.route('/calender')
def calender_page():
    return render_template('calender.html')


# ============== Google OAuth ログイン ==============
@app.route('/google-login')
def google_login():
    flow = build_web_flow(
        GOOGLE_SCOPES,
        redirect_uri=GOOGLE_REDIRECT_URI,
    )
    auth_url, state = flow.authorization_url(prompt='consent')
    session['oauth_state'] = state
    return redirect(auth_url)

@app.route('/oauth-callback')
def oauth_callback():
    state = session.pop('oauth_state', None)
    flow = build_web_flow(
        GOOGLE_SCOPES,
        state=state,
        redirect_uri=GOOGLE_REDIRECT_URI,
    )
    try:
        flow.fetch_token(authorization_response=request.url)
    except Exception as e:
        return render_template('oauth-callback.html', error=str(e))

    creds = flow.credentials
    creds_info = {
        'token': creds.token,
        'refresh_token': creds.refresh_token,
        'token_uri': creds.token_uri,
        'client_id': creds.client_id,
        'client_secret': creds.client_secret,
        'scopes': list(creds.scopes),
    }

    sm = ScheduleManager()
    user = session.get('user') or {}
    user_id = user.get('id')
    if not user_id:
        return render_template('oauth-callback.html', error='ユーザー未ログインのため、認証情報が取得できません')
    sm.set_credentials_from_info(user_id, creds_info)

    return render_template('oauth-callback.html', token=creds.token)


# ============== Finance 画面 ==============
@app.route('/finance')
@login_required
def finance():
    user_id = session.get('user', {}).get('id')
    income_stats, expense_stats = get_finance_summary(user_id)
    all_records = get_all_finance_records(user_id)
    goal_record = get_monthly_goal(user_id)
    goal_amount = (goal_record or {}).get('goal_amount')
    return render_template(
        'finance.html',
        income_stats=income_stats,
        expense_stats=expense_stats,
        all_records=all_records,
        goal_amount=goal_amount,
    )


# ============== 認証関連 ==============
@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        name = request.form['name']
        email = request.form['email']
        password = request.form['password']
        result = register_user(name, email, password)
        if 'error' in result:
            return render_template('register.html', error=result['error'])
        login_result = login_user(email, password)  # �F�؂��Ă���ԑ˃��O�C�����s��
        if 'error' in login_result:
            return render_template(
                'register.html',
                error='登録は完了しましたが自動ログインに失敗しました。ログイン画面から再度お試しください。'
            )
        session.permanent = True
        session['user'] = login_result['user']
        return redirect(url_for('main'))
    return render_template('register.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email = request.form['email']
        password = request.form['password']
        result = login_user(email, password)
        if 'error' in result:
            return render_template('login.html', error=result['error'])
        session.permanent = True
        session['user'] = result['user']
        return redirect(url_for('main'))
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.pop('user', None)
    session.pop('spotify_token_info', None)
    return redirect(url_for('login'))


# ============== REST API: カテゴリ/収支/ユーザー ==============
@app.route('/api/categories', methods=['GET'])
def get_categories_route():
    return jsonify(get_all_categories())

@app.route('/api/categories', methods=['POST'])
def add_category_route():
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'カテゴリ名が空です'}), 400
    return jsonify(add_category(name))

@app.route('/api/categories/<string:cat_id>', methods=['DELETE'])
def delete_category_route(cat_id):
    return jsonify(delete_category(cat_id))

@app.route('/api/categories/clear', methods=['DELETE'])
def clear_categories_route():
    return jsonify(clear_all_categories())

@app.route('/api/finance', methods=['GET'])
@login_required
def get_finance_records_route():
    user_id = session.get('user', {}).get('id')
    return jsonify(get_all_finance_records(user_id))

@app.route('/api/finance', methods=['POST'])
@login_required
def add_finance_record_route():
    data = request.get_json() or {}
    user_id = session.get('user', {}).get('id')
    data['user_id'] = user_id
    return jsonify(add_finance_record(data, user_id))

@app.route('/api/finance/<string:record_id>', methods=['DELETE'])
@login_required
def delete_finance_record_route(record_id):
    user_id = session.get('user', {}).get('id')
    return jsonify(delete_finance_record(record_id, user_id))

@app.route('/api/finance/summary', methods=['GET'])
@login_required
def get_finance_summary_route():
    user_id = session.get('user', {}).get('id')
    return jsonify({
        'balance': get_current_balance(user_id),
        'monthly_expense': get_monthly_expense(user_id),
        'daily_expense': get_daily_expense(user_id),
    })

@app.route('/api/finance/goal', methods=['GET'])
@login_required
def get_finance_goal_route():
    user_id = session.get('user', {}).get('id')
    record = get_monthly_goal(user_id)
    current_month = datetime.now().strftime('%Y-%m')
    return jsonify({
        'goal_amount': (record or {}).get('goal_amount'),
        'year_month': (record or {}).get('year_month', current_month),
    })

@app.route('/api/finance/goal', methods=['POST'])
@login_required
def upsert_finance_goal_route():
    user_id = session.get('user', {}).get('id')
    data = request.get_json() or {}
    try:
        goal_amount = float(data.get('goal_amount'))
        if goal_amount < 0:
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({'error': 'Invalid goal amount'}), 400

    year_month = data.get('year_month')
    result = upsert_monthly_goal(user_id, goal_amount, year_month)
    if 'error' in result:
        return jsonify({'error': result['error']}), 500
    return jsonify(result)

@app.route('/users', methods=['GET'])
def get_users_route():
    return jsonify(get_all_users())

@app.route('/user/<email>', methods=['GET'])
def get_user_route(email):
    return jsonify(get_user_by_email(email))

@app.route('/user', methods=['POST'])
def add_user_route():
    return jsonify(add_user(request.json))

@app.route('/user', methods=['PUT'])
def update_user_route():
    data = request.json
    return jsonify(update_user(data['email'], {'name': data['name']}))

@app.route('/user', methods=['DELETE'])
def delete_user_route():
    email = request.args.get('email')
    return jsonify(delete_user(email))


# ============== Spotify 認証/ページ ==============
@app.route('/spotify-login')
def spotify_login():
    session.pop('spotify_token_info', None)
    sp_oauth = get_spotify_oauth()
    return redirect(sp_oauth.get_authorize_url() + '&show_dialog=true')

@app.route('/spotify-relogin')
def spotify_relogin():
    session.pop('spotify_token_info', None)
    sp_oauth = get_spotify_oauth()
    return redirect(sp_oauth.get_authorize_url() + '&show_dialog=true')

@app.route('/spotify-callback')
def spotify_callback():
    sp_oauth = get_spotify_oauth()
    if request.args.get('error'):
        err = request.args.get('error')
        return render_template('spotify.html', is_authenticated=False,
                               error_message=f'Spotify認証エラー: {err}')
    code = request.args.get('code')
    try:
        token_info = sp_oauth.get_access_token(code)
        session['spotify_token_info'] = token_info
    except Exception as e:
        return render_template('spotify.html', is_authenticated=False,
                               error_message=f'トークン取得エラー: {e}')
    return redirect(url_for('spotify_page'))

@app.route('/spotify')
def spotify_page():
    sp_oauth = get_spotify_oauth()
    token_info = _get_token_info()
    if not token_info:
        auth_url = sp_oauth.get_authorize_url()
        return render_template('spotify.html', is_authenticated=False, auth_url=auth_url)
    if sp_oauth.is_token_expired(token_info):
        try:
            token_info = sp_oauth.refresh_access_token(token_info['refresh_token'])
            _save_token_info(token_info)
        except Exception as e:
            return render_template('spotify.html', is_authenticated=False,
                                   error_message=f'トークン更新に失敗: {e}')
    if not _has_required_scopes(token_info, REQUIRED_SPOTIFY_SCOPE):
        return redirect(url_for('spotify_relogin'))
    try:
        sp = spotipy.Spotify(auth=token_info['access_token'])
        user_data = sp.current_user()
        top_tracks = sp.current_user_top_tracks(limit=5, time_range='medium_term')
        playlists = []
        results = sp.current_user_playlists(limit=50, offset=0)
        while True:
            playlists.extend(results.get('items', []))
            if results.get('next'):
                results = sp.next(results)
            else:
                break
        return render_template(
            'spotify.html', is_authenticated=True, user=user_data,
            tracks=top_tracks.get('items', []), playlists=playlists,
            focus_section=request.args.get('section', '')
        )
    except spotipy.exceptions.SpotifyException as e:
        return render_template('spotify.html', is_authenticated=False,
                               error_message=f'Spotify API エラー: {e}')
    except Exception as e:
        return render_template('spotify.html', is_authenticated=False,
                               error_message=f'予期せぬエラー: {e}')

@app.route('/api/spotify/token')
def api_spotify_token():
    sp_oauth = get_spotify_oauth()
    token_info = session.get('spotify_token_info')
    if not token_info:
        return jsonify({'error': 'not_authenticated'}), 401
    if sp_oauth.is_token_expired(token_info):
        try:
            token_info = sp_oauth.refresh_access_token(token_info['refresh_token'])
            session['spotify_token_info'] = token_info
        except Exception:
            return jsonify({'error': 'refresh_failed'}), 401
    if not _has_required_scopes(token_info, REQUIRED_SPOTIFY_SCOPE):
        return jsonify({'error': 'invalid_scopes', 'scope': token_info.get('scope', '')}), 403
    return jsonify({'access_token': token_info['access_token'], 'scope': token_info.get('scope', '')})

@app.route('/api/spotify/scope')
def spotify_scope():
    token_info = session.get('spotify_token_info')
    if not token_info:
        return jsonify({'authenticated': False}), 401
    return jsonify({'authenticated': True, 'scope': token_info.get('scope', ''),
                    'has_all_required': _has_required_scopes(token_info, REQUIRED_SPOTIFY_SCOPE)})


# ============== Spotify プレイヤーバー挿入 ==============
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

@app.after_request
def ensure_spotify_playerbar(response):
    content_type = (response.headers.get('Content-Type') or '').lower()
    if (200 <= response.status_code < 300 and not response.direct_passthrough and 'text/html' in content_type):
        body = response.get_data(as_text=True)
        if '</body>' in body:
            fragments = []
            if 'id="vs-playerbar"' not in body:
                fragments.append(PLAYER_BAR_SNIPPET)
            if 'js/spotify.js' not in body:
                script_path = url_for('static', filename='js/spotify.js')
                fragments.append(f'<script src="{script_path}" defer></script>')
            if 'sdk.scdn.co/spotify-player.js' not in body:
                fragments.append('<script src="https://sdk.scdn.co/spotify-player.js" defer></script>')
            if fragments:
                body = body.replace('</body>', ''.join(fragments) + '</body>')
                response.set_data(body)
    return response


# ============== Chat API・SwitchBot/カレンダー更新処理 ==============


@app.route('/api/switchbot', methods=['POST'])
def control_switchbot():
    data = request.get_json() or {}
    command = data.get('command')
    result, status_code = execute_switchbot_command(command)
    return jsonify(result), status_code

@app.route('/api/chat', methods=['POST'])
@api_login_required
def chat_api_external():
    data = request.get_json() or {}
    user_input = data.get('inputValue', '')
    user_id = g.user_id
    response_data = chat_space_model.check_chat_space(user_input, user_id=user_id)

    action = response_data.get('action')

    if action == 'switchbot_control':
        command = response_data.get('data', {}).get('command')
        if command:
            switchbot_result, status_code = execute_switchbot_command(command)
            if status_code == 200 and switchbot_result.get('statusCode') == 100:
                response_data['message'] = 'SwitchBotを' + str(command) + 'しました'
                response_data['status'] = 'success'
            else:
                response_data['message'] = 'SwitchBotの操作に失敗しました'                
                response_data['status'] = 'error'

        elif action == 'calendar_update':
            sm = ScheduleManager()
        # 外部APIからのアクセスなので、user_idはg.user_idから取得
        if user_id and sm.is_google_linked(user_id):
            try:
                calendar_id = response_data.get('calendar_id')
                event_id = response_data.get('event_id')
                changes = response_data.get('changes', {})
                if calendar_id and event_id and changes:
                    ok = sm.update_event(user_id, calendar_id, event_id, changes)
                    if ok:
                        response_data['message'] = 'Googleカレンダーのイベントを更新しました'
                        response_data['status'] = 'success'
                    else:
                        response_data['message'] = 'Googleカレンダーの更新に失敗しました'
                        response_data['status'] = 'error'
                else:
                    response_data['message'] = '変更必須のイベントIDが欠落しています'
                    response_data['status'] = 'error'
            except Exception as e:
                response_data['message'] = f'Google繧ｫ繝ｬ繝ｳ繝繝ｼ縺ｮ莠亥ｮ壼､画峩縺ｫ螟ｱ謨励＠縺ｾ縺励◆: {str(e)}'
                response_data['status'] = 'error'
        else:
            # 外部APIからのアクセスなので、リダイレクトではなくエラーを返す
            response_data['message'] = 'Googleアカウントがリンクされていません。'
            response_data['status'] = 'needs_link'
            return jsonify(response_data), 401

    return jsonify(response_data)

@app.route('/web_api/chat', methods=['POST'])
@login_required # セッションベース認証
def chat_api_web():
    data = request.get_json() or {}
    user_input = data.get('inputValue', '')
    user_id = session.get('user', {}).get('id') # セッションからuser_idを取得
    response_data = {"status": "success", "message": ""}

    # シーシーのチェック
    if user_input.startswith("クイックコマンド"):
        print(f"DEBUG: シーシー検出: {user_input}")
        for qc in quick_commands:
            if user_input == qc["pattern"]:
                print(f"DEBUG: シーシーパターン一致: {qc['pattern']}")
                action = qc["action"]
                if action["type"] == "switchbot_command":
                    print(f"DEBUG: SwitchBotコマンド実行: {action}")
                    # SwitchBot操作を直接実行
                    device_name = action.get("device_name")
                    command_type = action.get("command_type")
                    command = action.get("command")
                    parameter = action.get("parameter", "default")

                    from services import switchbot_service
                    switchbot_api_token = os.getenv("SWITCHBOT_TOKEN")
                    switchbot_api_secret = os.getenv("SWITCHBOT_SECRET")

                    if not switchbot_api_token or not switchbot_api_secret:
                        print("ERROR: SwitchBot APIトークンまたはシークレットが設定されていません。")
                        response_data['message'] = "SwitchBot APIトークンまたはシークレットが設定されていません。"
                        response_data['status'] = 'error'
                        return jsonify(response_data)
                    
                    try:
                        devices_data = switchbot_service.get_switchbot_devices(switchbot_api_token, switchbot_api_secret)
                        if devices_data and devices_data.get("statusCode") == 100:
                            device_list = devices_data["body"].get("deviceList", [])
                            infrared_remote_list = devices_data["body"].get("infraredRemoteList", [])
                            
                            target_device_id = None
                            for device in device_list + infrared_remote_list:
                                if device.get("deviceName") == device_name:
                                    target_device_id = device.get("deviceId")
                                    break
                            
                            if target_device_id:
                                print(f"DEBUG: デバイスID取得成功: {target_device_id} for {device_name}")
                                switchbot_result, switchbot_message = chat_space_model._operate_switchbot(
                                    switchbot_api_token,
                                    switchbot_api_secret,
                                    target_device_id,
                                    command_type,
                                    command,
                                    parameter
                                )
                                if switchbot_result and switchbot_result.get("statusCode") == 100:
                                    response_data['message'] = f"シーシーで「{device_name}を{command}」を実行します。"
                                    response_data['status'] = 'success'
                                    print(f"DEBUG: SwitchBot操作成功: {response_data['message']}")
                                else:
                                    response_data['message'] = f"シーシーの実行に失敗しました。通常処理として実行します。"
                                    response_data['status'] = 'error'
                                    response_data['fallback_to_voicemate'] = True # フォールバックフラグ
                                    print(f"ERROR: SwitchBot操作失敗、フォールバック: {switchbot_message}")
                            else:
                                response_data['message'] = f"シーシーの実行に失敗しました。通常処理として実行します。"
                                response_data['status'] = 'error'
                                response_data['fallback_to_voicemate'] = True # フォールバックフラグ
                                print(f"ERROR: デバイス'{device_name}'が見つかりませんでした。フォールバック。")
                        else:
                            response_data['message'] = "シーシーの実行に失敗しました。通常処理として実行します。"
                            response_data['status'] = 'error'
                            response_data['fallback_to_voicemate'] = True # フォールバックフラグ
                            print(f"ERROR: SwitchBotデバイスの取得に失敗しました。フォールバック。")
                    except Exception as e:
                        print(f"ERROR: シーシー SwitchBot操作エラー、フォールバック: {e}")
                        response_data['message'] = "シーシーの実行に失敗しました。通常処理として実行します。"
                        response_data['status'] = 'error'
                        response_data['fallback_to_voicemate'] = True # フォールバックフラグ
                return jsonify(response_data)
        
        # シーシーパターンに一致しなかった場合
        print(f"DEBUG: シーシーパターン不一致: {user_input}")
        # シーシーとして認識されたが、パターンに一致しなかった場合は、通常の処理にフォールバック
        # その際、特別なメッセージは出さず、通常のLLM処理に任せる
        # ここではreturnしないことで、下の通常のchat_space_model処理に進む
    
    # シーシーに一致しない場合、通常のchat_space_model処理
    response_data = chat_space_model.check_chat_space(user_input, user_id=user_id)

    action = response_data.get('action')

    if action == 'switchbot_control':
        command = response_data.get('data', {}).get('command')
        if command:
            # chat_space_model._operate_switchbotはapi_secretも受け取るように修正されている
            switchbot_api_token = os.getenv("SWITCHBOT_TOKEN")
            switchbot_api_secret = os.getenv("SWITCHBOT_SECRET")
            device_id = response_data.get('data', {}).get('device_id') # LLMから取得したdevice_idを使用
            command_type = response_data.get('data', {}).get('command_type')
            parameter = response_data.get('data', {}).get('parameter', 'default')

            if not switchbot_api_token or not switchbot_api_secret:
                response_data['message'] = "SwitchBot APIトークンまたはシークレットが設定されていません。"
                response_data['status'] = 'error'
                print(f"DEBUG: APIトークンまたはシークレットが設定されていません。response_data: {response_data}")
                return jsonify(response_data)

            switchbot_result, switchbot_message = chat_space_model._operate_switchbot(
                switchbot_api_token,
                switchbot_api_secret,
                device_id,
                command_type,
                command,
                parameter
            )
            if switchbot_result and switchbot_result.get('statusCode') == 100:
                response_data['message'] = 'SwitchBotを' + str(command) + 'しました'
                response_data['status'] = 'success'
                print(f"DEBUG: SwitchBot操作成功。response_data: {response_data}")
            else:
                response_data['message'] = 'SwitchBotの操作に失敗しました。' # メッセージを修正
                response_data['status'] = 'error'
                print(f"DEBUG: SwitchBot操作失敗。response_data: {response_data}")

    elif action == 'calendar_update':
        sm = ScheduleManager()
        # Webブラウザからのアクセスなので、user_idはsessionから取得
        if user_id and sm.is_google_linked(user_id):
            try:
                calendar_id = response_data.get('calendar_id')
                event_id = response_data.get('event_id')
                changes = response_data.get('changes', {})
                if calendar_id and event_id and changes:
                    ok = sm.update_event(user_id, calendar_id, event_id, changes)
                    if ok:
                        response_data['message'] = 'Googleカレンダーのイベントを更新しました'
                        response_data['status'] = 'success'
                    else:
                        response_data['message'] = 'Googleカレンダーの更新に失敗しました'
                        response_data['status'] = 'error'
                else:
                    response_data['message'] = '変更必須のイベントIDが欠落しています'
                    response_data['status'] = 'error'
            except Exception as e:
                response_data['message'] = f'Googleカレンダーのイベント更新に失敗しました: {str(e)}'
                response_data['status'] = 'error'
        else:
            # Webブラウザからのアクセスなので、GoogleログインページへのURLを返す
            purpose = response_data.get('purpose', '')
            if isinstance(purpose, str) and purpose.startswith('C'):
                oauth_url = url_for('google_login')
                response_data['message'] = f'Googleアカウントがリンクされていません。こちらからリンクしてください: {oauth_url}'
                response_data['status'] = 'needs_link'
                print(f"DEBUG: Googleアカウントがリンクされていません。response_data: {response_data}")
                return jsonify(response_data), 401
            response_data['status'] = 'error'
    print(f"DEBUG: chat_api_webからの最終レスポンス: {response_data}")
    return jsonify(response_data)# メモAPIのBlueprint
app.register_blueprint(memo_bp, url_prefix='/api/memos')


# ============== DB初期化と起動 ==============
with app.app_context():
    db.create_all()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True, ssl_context='adhoc')
