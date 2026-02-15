#最新の情報を読み込めているかテスト 番号は22132
# -*- coding: utf-8 -*-
from gevent import monkey
monkey.patch_all()
import os
import sys
import re
import tempfile
import hashlib
from datetime import datetime, timedelta
from functools import wraps

# プロジェクトルートをsys.pathに追加
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import (
    Flask, render_template, jsonify, request, redirect, url_for, session, abort, g,
    send_from_directory, Blueprint
)
from flask_socketio import SocketIO

from services.google_oauth import build_web_flow, get_google_redirect_uri
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
import atexit

import json
import base64
from cryptography.fernet import Fernet, InvalidToken
from google.cloud import texttospeech
from services.user_service import (
    get_all_users, get_user_by_email, add_user, update_user, delete_user
)
from services.category_service import (
    get_all_categories, add_category, delete_category, clear_all_categories
)
from services.auth_service import register_user, login_user
from services.expense_service import add_finance_record, delete_finance_record, delete_finance_records, update_finance_record
from services.finance_service import (
    get_finance_summary,
    get_all_finance_records,
    get_current_balance,
    get_monthly_expense,
    get_daily_expense,
    get_monthly_goal,
    upsert_monthly_goal,
)
from services import local_calendar_service
from services.chat_space_model import ChatSpaceModel
from services.memo_routes import memo_bp
from services.ScheduleManager import ScheduleManager
from services.user_settings_service import get_user_settings, upsert_user_settings
from services.playlist_service import (
    get_playlist,
    add_playlist_track,
    remove_playlist_track,
    build_playlist_play_plan,
)
from services.custom_order_service import get_all_orders
from services import pending_action_service
from services.datetime_range_utils import build_range_from_detail as shared_build_range_from_detail
from order.models import db
from models.event import Event
from order.custom_order_routes import custom_order_bp
from order.command_routes import command_bp
from routes.order_routes import order_bp
from routes.calendar_routes import calendar_bp
from routes.switchbot_routes import switchbot_bp
from order.evaluator import evaluate_triggers, evaluate_switchbot_triggers

import logging

# APSchedulerの警告ログを抑制
logging.getLogger('apscheduler').setLevel(logging.ERROR)

# ============== 基本設定 ==============
app = Flask(__name__, template_folder='templates', static_folder='static')
socketio = SocketIO(app, async_mode='threading', cors_allowed_origins="*")
app.config['VERSION_TIMESTAMP'] = int(datetime.now().timestamp())

# 接続中のユーザーを管理するための辞書 {user_id: sid}
connected_users = {}

# DBファイルのパス設定
instance_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'instance')
os.makedirs(instance_path, exist_ok=True)
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{os.path.join(instance_path, "orders.db")}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db.init_app(app)

# APSchedulerの初期化
jobstores = { 'default': SQLAlchemyJobStore(url=app.config['SQLALCHEMY_DATABASE_URI']) }
executors = { 'default': {'type': 'threadpool', 'max_workers': 20} }
job_defaults = { 'coalesce': True, 'max_instances': 3 }
scheduler = BackgroundScheduler(jobstores=jobstores, executors=executors, job_defaults=job_defaults)
_scheduler_lock_handle = None

# Blueprint登録
app.register_blueprint(custom_order_bp, url_prefix='/api')
app.register_blueprint(command_bp, url_prefix='/api')
app.register_blueprint(order_bp, url_prefix='/order')
app.register_blueprint(calendar_bp)
app.register_blueprint(switchbot_bp)
app.register_blueprint(memo_bp)

custom_order_pages_bp = Blueprint('custom_order_pages', __name__, template_folder='order/static/html', static_folder='order/static')
order_html_dir = os.path.join(os.path.dirname(__file__), 'order', 'static', 'html')

@custom_order_pages_bp.route('/')
def custom_order_index():
    gcp_api_key = os.getenv('GCP_API_KEY')
    user_id = session.get('user', {}).get('id') if session.get('user') else None
    return render_template('index.html', gcp_api_key=gcp_api_key, user_id=user_id)

app.register_blueprint(custom_order_pages_bp, url_prefix='/custom_order')

@app.route('/img/<path:filename>')
def serve_img_file(filename):
    img_dir = os.path.join(app.root_path, 'img')
    return send_from_directory(img_dir, filename)


# ============== WebSocket 接続管理 ============== (print statements are kept as they are)
@socketio.on('connect')
def handle_connect():
    print(f"Client attempting to connect: sid={request.sid}")

@socketio.on('authenticate')
def handle_authenticate(data):
    user_id = data.get('user_id')
    if user_id:
        connected_users[user_id] = request.sid
        print(f"Client authenticated and connected: user_id={user_id}, sid={request.sid}")
    else:
        print(f"Authentication failed for sid={request.sid}")

@socketio.on('disconnect')
def handle_disconnect():
    disconnected_sid = request.sid
    user_id_to_remove = next((user_id for user_id, sid in connected_users.items() if sid == disconnected_sid), None)
    if user_id_to_remove:
        del connected_users[user_id_to_remove]
        print(f"Client disconnected: user_id={user_id_to_remove}, sid={disconnected_sid}")
    else:
        print(f"Unauthenticated client disconnected: sid={disconnected_sid}")

# ============== APIキー認証（api/* のみ）==============
ALLOWED_API_KEYS = set(os.environ.get('ALLOWED_API_KEYS', '').split(','))

@app.before_request
def require_api_key():
    if not request.path.startswith('/api/'):
        return None
    if not ALLOWED_API_KEYS or ALLOWED_API_KEYS == {''}:
        return None
    provided_key = request.headers.get('X-API-KEY')
    if provided_key not in ALLOWED_API_KEYS:
        return jsonify({'message': 'Error: Invalid or missing API Key.'}), 403
    return None


# ============== 環境変数とモジュール初期化 ============== (print statements are kept as they are)
SECRET_KEY = os.getenv('SECRET_KEY')
if not SECRET_KEY:
    raise RuntimeError('SECRET_KEY 環境変数を設定してください。')
app.secret_key = SECRET_KEY
app.permanent_session_lifetime = timedelta(days=30)

GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
if not GEMINI_API_KEY:
    print('Warning: GEMINI_API_KEY not set. ChatSpaceModel may not work.')
chat_space_model = ChatSpaceModel(gemini_api_key=GEMINI_API_KEY)
chat_space_model.set_logger(app.logger)
# calendar_manager = ScheduleManager()
# app.calendar_manager = calendar_manager

QUICK_COMMANDS_FILE = os.path.join(os.path.dirname(__file__), 'quick_commands.json')

def load_quick_commands():
    if os.path.exists(QUICK_COMMANDS_FILE):
        with open(QUICK_COMMANDS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []

quick_commands = load_quick_commands()


# ============== Google OAuth ============== (print statements are kept as they are)
GOOGLE_SCOPES = [
    'openid',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email',
    # 'https://www.googleapis.com/auth/calendar',
]
GOOGLE_REDIRECT_URI = get_google_redirect_uri()


# ============== 認証デコレータ ============== (print statements are kept as they are)
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


def _is_dev_fastlane_enabled() -> bool:
    return os.getenv('DEV_FASTLANE_ENABLED', '').lower() in {'1', 'true', 'yes', 'on'}


DEV_MOBILE_FORCED_EMAIL = os.getenv('DEV_MOBILE_FORCED_EMAIL', 'zelco054@gmail.com')
DEV_MOBILE_FORCED_PASSWORD = os.getenv('DEV_MOBILE_FORCED_PASSWORD', 'Orenz025')


def _build_fastlane_cipher() -> Fernet:
    secret = os.getenv('DEV_FASTLANE_SECRET', '')
    if not secret:
        raise RuntimeError('DEV_FASTLANE_SECRET is not set')
    digest = hashlib.sha256(secret.encode('utf-8')).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def _create_fastlane_token(user: dict, target: str) -> str:
    email = (user.get('email') or '').strip().lower()
    cipher = _build_fastlane_cipher()
    payload = {
        'target': target,
        'user': {
            'id': user.get('id'),
            'email': email or user.get('email'),
            'name': user.get('name'),
        },
    }
    raw = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    return cipher.encrypt(raw).decode('utf-8')


def _resolve_fastlane_user(token: str, target: str, ttl_seconds: int = 60 * 60 * 24 * 30):
    if not _is_dev_fastlane_enabled():
        abort(404)
    try:
        cipher = _build_fastlane_cipher()
    except RuntimeError:
        abort(404)
    try:
        raw = cipher.decrypt(token.encode('utf-8'), ttl=ttl_seconds)
        payload = json.loads(raw.decode('utf-8'))
    except (InvalidToken, ValueError, json.JSONDecodeError):
        abort(403)

    token_target = payload.get('target')
    token_user = payload.get('user') or {}
    token_email = (token_user.get('email') or '').strip().lower()
    if token_target != target:
        abort(403)
    if not token_user.get('id'):
        abort(403)
    token_user['email'] = token_email
    return token_user


# ============== トップページ ============== (print statements are kept as they are)
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

@app.route('/settings')
@login_required
def settings_page():
    return render_template('settings.html')

@app.route('/playlist')
@login_required
def playlist_page():
    return render_template('playlist.html')

@app.route('/calender')
@login_required
def calender_page():
    return render_template('calender.html')

@app.route('/dev/mobile/links')
def dev_mobile_links():
    if not _is_dev_fastlane_enabled():
        abort(404)
    base_url = request.host_url.rstrip('/')
    links = {
        'expense': f'{base_url}/dev/mobile/direct/expense',
        'calendar': f'{base_url}/dev/mobile/direct/calendar',
        'voice': f'{base_url}/dev/mobile/direct/voice',
    }
    return render_template('dev_mobile_links.html', links=links)


@app.route('/dev/mobile/bootstrap_login', methods=['POST'])
def dev_mobile_bootstrap_login():
    if not _is_dev_fastlane_enabled():
        abort(404)
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip()
    password = data.get('password') or ''
    if not email or not password:
        return jsonify({'error': 'email and password are required'}), 400
    result = login_user(email, password)
    if 'error' in result:
        return jsonify({'error': result['error']}), 401
    session.permanent = True
    session['user'] = result['user']
    return jsonify({'ok': True, 'user': result['user']})


@app.route('/dev/mobile/direct/expense')
def dev_mobile_direct_expense():
    if not _is_dev_fastlane_enabled():
        abort(404)
    return render_template(
        'mobile_expense.html',
        user={},
        balance=0,
        monthly_expense=0,
        daily_expense=0,
        forced_credentials={
            'email': DEV_MOBILE_FORCED_EMAIL,
            'password': DEV_MOBILE_FORCED_PASSWORD,
        },
    )


@app.route('/dev/mobile/direct/calendar')
def dev_mobile_direct_calendar():
    if not _is_dev_fastlane_enabled():
        abort(404)
    return render_template(
        'mobile_calendar.html',
        user={},
        forced_credentials={
            'email': DEV_MOBILE_FORCED_EMAIL,
            'password': DEV_MOBILE_FORCED_PASSWORD,
        },
    )


@app.route('/dev/mobile/direct/voice')
def dev_mobile_direct_voice():
    if not _is_dev_fastlane_enabled():
        abort(404)
    return render_template(
        'mobile_voice.html',
        user={},
        user_name='Developer',
        forced_credentials={
            'email': DEV_MOBILE_FORCED_EMAIL,
            'password': DEV_MOBILE_FORCED_PASSWORD,
        },
    )


@app.route('/dev/mobile/expense/<string:token>')
def dev_mobile_expense(token):
    user = _resolve_fastlane_user(token, 'expense')
    session.permanent = True
    session['user'] = user
    user_id = user.get('id')
    balance = get_current_balance(user_id)
    monthly_expense = get_monthly_expense(user_id)
    daily_expense = get_daily_expense(user_id)
    return render_template(
        'mobile_expense.html',
        user=user,
        balance=balance,
        monthly_expense=monthly_expense,
        daily_expense=daily_expense,
        forced_credentials={
            'email': DEV_MOBILE_FORCED_EMAIL,
            'password': DEV_MOBILE_FORCED_PASSWORD,
        },
    )


@app.route('/dev/mobile/calendar/<string:token>')
def dev_mobile_calendar(token):
    user = _resolve_fastlane_user(token, 'calendar')
    session.permanent = True
    session['user'] = user
    return render_template(
        'mobile_calendar.html',
        user=user,
        forced_credentials={
            'email': DEV_MOBILE_FORCED_EMAIL,
            'password': DEV_MOBILE_FORCED_PASSWORD,
        },
    )


@app.route('/dev/mobile/voice/<string:token>')
def dev_mobile_voice(token):
    user = _resolve_fastlane_user(token, 'voice')
    session.permanent = True
    session['user'] = user
    user_name = user.get('name') or user.get('email') or 'ユーザー'
    return render_template(
        'mobile_voice.html',
        user=user,
        user_name=user_name,
        forced_credentials={
            'email': DEV_MOBILE_FORCED_EMAIL,
            'password': DEV_MOBILE_FORCED_PASSWORD,
        },
    )


# ============== Google OAuth ログイン (無効化) ==============
# @app.route('/google-login')
# def google_login():
#     flow = build_web_flow(
#         GOOGLE_SCOPES,
#         redirect_uri=GOOGLE_REDIRECT_URI,
#     )
#     auth_url, state = flow.authorization_url(prompt='consent')
#     session['oauth_state'] = state
#     return redirect(auth_url)

# @app.route('/oauth-callback')
# def oauth_callback():
#     state = session.pop('oauth_state', None)
#     flow = build_web_flow(
#         GOOGLE_SCOPES,
#         state=state,
#         redirect_uri=GOOGLE_REDIRECT_URI,
#     )
#     try:
#         flow.fetch_token(authorization_response=request.url)
#     except Exception as e:
#         return render_template('oauth-callback.html', error=str(e))

#     creds = flow.credentials
#     creds_info = {
#         'token': creds.token,
#         'refresh_token': creds.refresh_token,
#         'token_uri': creds.token_uri,
#         'client_id': creds.client_id,
#         'client_secret': creds.client_secret,
#         'scopes': list(creds.scopes),
#     }

#     sm = ScheduleManager()
#     user = session.get('user') or {}
#     user_id = user.get('id')
#     if not user_id:
#         return render_template('oauth-callback.html', error='ユーザー未ログインのため、認証情報が取得できません')
#     sm.set_credentials_from_info(user_id, creds_info)

#     return render_template('oauth-callback.html', token=creds.token)


# ============== Finance 画面 ============== (print statements are kept as they are)
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


# ============== 認証関連 ============== (print statements are kept as they are)
@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        # --- START: Supabase Key Check ---
        import os
        SUPABASE_KEY = os.getenv("SUPABASE_KEY")
        print("--- [DEBUG] Checking SUPABASE_KEY in /register route ---")
        if SUPABASE_KEY:
            print(f"SUPABASE_KEY (partial): {SUPABASE_KEY[:5]}...{SUPABASE_KEY[-5:]}")
        else:
            print("SUPABASE_KEY: NOT SET")
        print("------------------------------------------")
        # --- END: Supabase Key Check ---
        name = request.form['name']
        email = request.form['email']
        password = request.form['password']
        
        print("--- [DEBUG] Calling register_user ---")
        result = register_user(name, email, password)
        print(f"--- [DEBUG] Result from register_user: {result} ---")
        print(f"--- [DEBUG] Type of result: {type(result)} ---")

        if result and 'error' in result:
            return render_template('register.html', error=result['error'])
        
        # register_userの成功結果をそのまま利用する
        session.permanent = True
        session['user'] = result['user']
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
    return redirect(url_for('login'))


# ============== REST API: カテゴリ/収支/ユーザー ============== (print statements are kept as they are)
@app.route('/api/categories', methods=['GET'])
def get_categories_route():
    return jsonify(get_all_categories())

@app.route('/api/categories', methods=['POST'])
def add_category_route():
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    type = (data.get('type') or '').strip() # type の値を取得
    if not name:
        print("DEBUG: Category name is empty") # デバッグログ
        return jsonify({'error': 'カテゴリ名が空です'}), 400
    if not type: # type がない場合のエラーハンドリング
        print("DEBUG: Category type is missing") # デバッグログ
        return jsonify({'error': 'カテゴリタイプが指定されていません'}), 400
    
    print(f"DEBUG: Calling add_category with name={name}, type={type}") # デバッグログ
    return jsonify(add_category(name, type)) # add_category に type を渡す

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
    all_records = get_all_finance_records(user_id)
    print(f"Fetched finance records: {all_records}")
    return jsonify(all_records)

@app.route('/api/finance', methods=['POST'])
@login_required
def add_finance_record_route():
    data = request.get_json() or {}
    user_id = session.get('user', {}).get('id')
    data['user_id'] = user_id
    return jsonify(add_finance_record(data, user_id))

@app.route('/api/finance/bulk-delete', methods=['DELETE'])
@login_required
def bulk_delete_finance_records_route():
    user_id = session.get('user', {}).get('id')
    data = request.get_json() or {}
    record_ids = data.get('ids')
    if not record_ids or not isinstance(record_ids, list):
        return jsonify({"error": "List of record IDs is required"}), 400
    return jsonify(delete_finance_records(record_ids, user_id))

@app.route('/api/finance/<string:record_id>', methods=['DELETE'])
@login_required
def delete_finance_record_route(record_id):
    user_id = session.get('user', {}).get('id')
    return jsonify(delete_finance_record(record_id, user_id))

@app.route('/api/finance/<string:record_id>', methods=['PUT'])
@login_required
def update_finance_record_route(record_id):
    user_id = session.get('user', {}).get('id')
    data = request.get_json() or {}
    return jsonify(update_finance_record(record_id, data, user_id))

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

@app.route('/api/user_settings', methods=['GET'])
@login_required
def get_user_settings_route():
    user_id = session.get('user', {}).get('id')
    settings = get_user_settings(user_id) or {}
    return jsonify(settings)

@app.route('/api/user_settings', methods=['POST'])
@login_required
def upsert_user_settings_route():
    user_id = session.get('user', {}).get('id')
    data = request.get_json() or {}
    if not isinstance(data, dict):
        return jsonify({'error': 'Invalid settings payload'}), 400
    result = upsert_user_settings(user_id, data)
    if isinstance(result, dict) and result.get('error'):
        return jsonify(result), 500
    return jsonify(result)

@app.route('/api/playlist', methods=['GET'])
@login_required
def get_playlist_route():
    user_id = session.get('user', {}).get('id')
    playlist = get_playlist(user_id)
    return jsonify(playlist)

@app.route('/api/playlist/tracks', methods=['POST'])
@login_required
def add_playlist_track_route():
    user_id = session.get('user', {}).get('id')
    data = request.get_json() or {}
    if not isinstance(data, dict):
        return jsonify({"error": "Invalid payload"}), 400
    result = add_playlist_track(user_id, data)
    if isinstance(result, dict) and result.get("error"):
        return jsonify(result), 400
    return jsonify(result)

@app.route('/api/playlist/tracks/<string:video_id>', methods=['DELETE'])
@login_required
def remove_playlist_track_route(video_id):
    user_id = session.get('user', {}).get('id')
    result = remove_playlist_track(user_id, video_id)
    return jsonify(result)

@app.route('/api/playlist/playplan', methods=['POST'])
@login_required
def build_playlist_playplan_route():
    user_id = session.get('user', {}).get('id')
    data = request.get_json() or {}
    scope = str(data.get("scope") or "all")
    order = str(data.get("order") or "sequential")
    artist = str(data.get("artist") or "")
    plan = build_playlist_play_plan(user_id, scope=scope, order=order, artist=artist, recent_days=30)
    return jsonify(plan)

@app.route('/api/youtube/preferences', methods=['POST'])
@login_required
def upsert_youtube_preferences_route():
    user_id = session.get('user', {}).get('id')
    data = request.get_json() or {}
    if not isinstance(data, dict):
        return jsonify({'error': 'Invalid payload'}), 400

    action = str(data.get('action') or '').strip()
    video = data.get('video') or {}
    query = str(data.get('query') or '').strip()
    reason = str(data.get('reason') or '').strip()
    if action not in ('save_current', 'reject_current'):
        return jsonify({'error': 'Unsupported action'}), 400
    if not isinstance(video, dict):
        return jsonify({'error': 'Invalid video payload'}), 400

    video_id = str(video.get('id') or video.get('video_id') or '').strip()
    title = str(video.get('title') or '').strip()
    if not video_id:
        return jsonify({'error': 'video.id is required'}), 400

    now_iso = datetime.now(JST).isoformat()
    video_url = f"https://www.youtube.com/watch?v={video_id}"
    settings = get_user_settings(user_id) or {}
    yt = settings.get('youtube_preferences') or {}

    saved_videos = yt.get('saved_videos') if isinstance(yt.get('saved_videos'), list) else []
    query_map = yt.get('query_map') if isinstance(yt.get('query_map'), dict) else {}
    blacklist = yt.get('blacklist') if isinstance(yt.get('blacklist'), list) else []

    if action == 'save_current':
        exists = any(str(v.get('video_id') or '') == video_id for v in saved_videos if isinstance(v, dict))
        if not exists:
            saved_videos.append({
                'video_id': video_id,
                'title': title,
                'url': video_url,
                'saved_at': now_iso,
            })
        if query:
            query_map[query.lower()] = {
                'video_id': video_id,
                'title': title,
                'url': video_url,
                'updated_at': now_iso,
            }
    elif action == 'reject_current':
        entry_exists = any(
            isinstance(e, dict) and
            str(e.get('video_id') or '') == video_id and
            str(e.get('query') or '').lower() == query.lower()
            for e in blacklist
        )
        if not entry_exists:
            blacklist.append({
                'query': query,
                'video_id': video_id,
                'title': title,
                'url': video_url,
                'reason': reason,
                'created_at': now_iso,
            })
        if query:
            mapped = query_map.get(query.lower())
            if isinstance(mapped, dict) and str(mapped.get('video_id') or '') == video_id:
                query_map.pop(query.lower(), None)

    yt['saved_videos'] = saved_videos
    yt['query_map'] = query_map
    yt['blacklist'] = blacklist
    settings['youtube_preferences'] = yt

    result = upsert_user_settings(user_id, settings)
    if isinstance(result, dict) and result.get('error'):
        return jsonify(result), 500

    return jsonify({
        'status': 'success',
        'action': action,
        'saved_videos_count': len(saved_videos),
        'blacklist_count': len(blacklist),
    })

# ============== Server-side TTS ==============
from services.weather_service import _get_jma_forecast_data, _extract_daily_series, DEFAULT_AREA_CODE, resolve_area_code_from_address

def _map_weather_to_icon(weather_text):
    if "晴" in weather_text:
        return "fa-sun"
    if "曇" in weather_text:
        return "fa-cloud"
    if "雨" in weather_text:
        return "fa-cloud-showers-heavy"
    if "雪" in weather_text:
        return "fa-snowflake"
    if "雷" in weather_text:
        return "fa-bolt"
    return "fa-smog" # Default icon

@app.route('/api/weather', methods=['GET'])
@login_required
def get_weather_route():
    user_id = session.get('user', {}).get('id')
    settings = get_user_settings(user_id) or {}
    address = (settings.get('main') or {}).get('address', '')
    area_code = resolve_area_code_from_address(address, DEFAULT_AREA_CODE)
    
    forecast_data = _get_jma_forecast_data(area_code)
    if not forecast_data:
        return jsonify({"error": "Failed to get weather data"}), 500

    area_name, time_defines, weathers, pops, temps_time, temps_values = _extract_daily_series(forecast_data)
    if not area_name:
        return jsonify({"error": "Failed to parse weather data"}), 500

    now = datetime.now(JST)
    today_date = now.date()
    tomorrow_date = (now + timedelta(days=1)).date()

    response = {
        "today": {"weather": "N/A", "temperature": "N/A", "pop": "N/A", "icon": "fa-question-circle"},
        "tomorrow": {"weather": "N/A", "temperature": "N/A", "pop": "N/A", "icon": "fa-question-circle"}
    }

    def _to_jst_safe(text):
        if not text:
            return None
        try:
            return datetime.fromisoformat(str(text).replace('Z', '+00:00')).astimezone(JST)
        except Exception:
            return None

    def _first_weather_for_date(target_date):
        for i, dt in enumerate(time_defines):
            if dt and dt.date() == target_date and i < len(weathers) and weathers[i]:
                return weathers[i]
        return "N/A"

    def _max_pop_for_date(target_date):
        # 6時間ごとの降水確率は forecast[0].timeSeries[1] に入る
        try:
            ts1 = (forecast_data[0].get("timeSeries") or [])[1]
            pop_times = [_to_jst_safe(t) for t in (ts1.get("timeDefines") or [])]
            pop_values = ((ts1.get("areas") or [{}])[0].get("pops") or [])
        except Exception:
            pop_times = []
            pop_values = []

        nums = []
        for i, dt in enumerate(pop_times):
            if not dt or dt.date() != target_date or i >= len(pop_values):
                continue
            raw = str(pop_values[i]).strip()
            if raw == "":
                continue
            try:
                nums.append(int(raw))
            except ValueError:
                continue
        if not nums:
            return "N/A"
        return str(max(nums))

    def _representative_temp_for_date(target_date):
        vals = []
        for i, dt in enumerate(temps_time):
            if not dt or dt.date() != target_date or i >= len(temps_values):
                continue
            raw = temps_values[i]
            if raw in (None, ""):
                continue
            try:
                vals.append(float(raw))
            except (TypeError, ValueError):
                continue
        if not vals:
            return "N/A"
        return str(int(round(max(vals))))

    # 今日
    for i, dt in enumerate(time_defines):
        if dt.date() == today_date:
            if response['today']['weather'] == 'N/A': # Set only first one
                response['today']['weather'] = weathers[i]
                response['today']['icon'] = _map_weather_to_icon(weathers[i])
    if response['today']['weather'] == 'N/A':
        response['today']['weather'] = _first_weather_for_date(today_date)
    response['today']['icon'] = _map_weather_to_icon(response['today']['weather'])
    response['today']['pop'] = _max_pop_for_date(today_date)
    response['today']['temperature'] = _representative_temp_for_date(today_date)

    # 明日
    for i, dt in enumerate(time_defines):
        if dt.date() == tomorrow_date:
            if response['tomorrow']['weather'] == 'N/A':
                response['tomorrow']['weather'] = weathers[i]
                response['tomorrow']['icon'] = _map_weather_to_icon(weathers[i])
    if response['tomorrow']['weather'] == 'N/A':
        response['tomorrow']['weather'] = _first_weather_for_date(tomorrow_date)
    response['tomorrow']['icon'] = _map_weather_to_icon(response['tomorrow']['weather'])
    response['tomorrow']['pop'] = _max_pop_for_date(tomorrow_date)
    response['tomorrow']['temperature'] = _representative_temp_for_date(tomorrow_date)
            
    return jsonify(response)


def text_to_speech_base64(text: str) -> str:
    """Google Cloud TTSを使用してテキストを音声に変換し、Base64エンコードされたMP3を返す"""
    try:
        client = texttospeech.TextToSpeechClient()
        synthesis_input = texttospeech.SynthesisInput(text=text)
        voice = texttospeech.VoiceSelectionParams(
            language_code="ja-JP", 
            name="ja-JP-Wavenet-B", # より自然な声 (標準のAより)
            ssml_gender=texttospeech.SsmlVoiceGender.FEMALE
        )
        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3,
            speaking_rate=1.1 # 少し早口に
        )
        
        response = client.synthesize_speech(
            input=synthesis_input, 
            voice=voice, 
            audio_config=audio_config
        )
        
        return base64.b64encode(response.audio_content).decode('utf-8')
    except Exception as e:
        print(f"!!! [TTS_ERROR] Google Cloud TTS API failed: {e}", file=sys.stderr)
        return None

@app.route('/api/tts', methods=['POST'])
@login_required
def tts_route():
    data = request.get_json()
    text = data.get('text')
    if not text:
        return jsonify({"error": "Text is required"}), 400
    
    audio_content = text_to_speech_base64(text)
    
    if audio_content:
        return jsonify({"audioContent": audio_content})
    else:
        return jsonify({"error": "Failed to generate audio"}), 500

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


# ============== YouTube Search API ==============
@app.route('/api/youtube_search', methods=['GET'])
@login_required
def youtube_search():
    query = request.args.get('q')
    if not query:
        return jsonify({'error': 'Query parameter is required'}), 400

    api_key = os.getenv('YOUTUBE_API_KEY') or os.getenv('GEMINI_API_KEY')
    if not api_key:
        return jsonify({'error': 'API key is not configured on the server'}), 500

    try:
        import requests
    except ImportError:
        # If requests is not installed, we can't proceed.
        print("--- [ERROR] The 'requests' library is not installed. Please run 'pip install requests'. ---")
        return jsonify({'error': 'The "requests" library is not installed on the server.'}), 500

    try:
        search_url = 'https://www.googleapis.com/youtube/v3/search'
        search_params = {
            'part': 'snippet',
            'q': query,
            'type': 'video',
            'maxResults': 25,
            'key': api_key
        }
        search_response = requests.get(search_url, params=search_params, timeout=12)
        search_response.raise_for_status()
        search_results = search_response.json()

        raw_items = []
        video_ids = []
        for item in search_results.get('items', []):
            video_id = item.get('id', {}).get('videoId')
            snippet = item.get('snippet', {}) or {}
            if not video_id:
                continue
            raw_items.append({
                'id': video_id,
                'title': snippet.get('title') or '',
                'channel_title': snippet.get('channelTitle') or '',
                'thumbnail_url': (
                    (snippet.get('thumbnails', {}).get('medium', {}) or {}).get('url')
                    or (snippet.get('thumbnails', {}).get('default', {}) or {}).get('url')
                    or ''
                ),
            })
            video_ids.append(video_id)

        details_map = {}
        if video_ids:
            videos_url = 'https://www.googleapis.com/youtube/v3/videos'
            videos_params = {
                'part': 'status,snippet',
                'id': ','.join(video_ids),
                'key': api_key
            }
            videos_response = requests.get(videos_url, params=videos_params, timeout=12)
            videos_response.raise_for_status()
            details_json = videos_response.json()
            for item in details_json.get('items', []):
                vid = item.get('id')
                if not vid:
                    continue
                status = item.get('status', {}) or {}
                snippet = item.get('snippet', {}) or {}
                embeddable = bool(status.get('embeddable', False))
                privacy_status = str(status.get('privacyStatus') or '')
                upload_status = str(status.get('uploadStatus') or '')
                playback_ok = embeddable and privacy_status == 'public' and upload_status == 'processed'
                fail_reason = ''
                if not playback_ok:
                    if not embeddable:
                        fail_reason = '埋め込み再生が許可されていません'
                    elif privacy_status != 'public':
                        fail_reason = f'公開状態が {privacy_status} のため再生できません'
                    elif upload_status != 'processed':
                        fail_reason = f'動画状態が {upload_status} のため再生できません'
                    else:
                        fail_reason = '再生条件を満たしていません'
                details_map[vid] = {
                    'embeddable': embeddable,
                    'privacy_status': privacy_status,
                    'upload_status': upload_status,
                    'playback_ok': playback_ok,
                    'fail_reason': fail_reason,
                    'channel_title': snippet.get('channelTitle') or '',
                }

        videos = []
        for item in raw_items:
            detail = details_map.get(item['id'], {})
            videos.append({
                'id': item['id'],
                'title': item['title'],
                'artist': detail.get('channel_title') or item.get('channel_title') or '',
                'thumbnail_url': item.get('thumbnail_url') or '',
                'embeddable': bool(detail.get('embeddable', False)),
                'privacy_status': detail.get('privacy_status') or '',
                'upload_status': detail.get('upload_status') or '',
                'playback_ok': bool(detail.get('playback_ok', False)),
                'fail_reason': detail.get('fail_reason') or ''
            })

        return jsonify({'videos': videos})

    except requests.exceptions.RequestException as e:
        print(f"--- [ERROR] YouTube Search API request failed: {e} ---")
        return jsonify({'error': str(e)}), 500


# ============== Chat API・SwitchBot/カレンダー更新処理 ============== (print statements are kept as they are)


@app.route('/api/switchbot', methods=['POST'])
def control_switchbot():
    data = request.get_json() or {}
    command = data.get('command')
    result, status_code = execute_switchbot_command(command) # execute_switchbot_command is assumed to be defined elsewhere
    return jsonify(result), status_code

@app.route('/api/chat', methods=['POST'])
@api_login_required
def chat_api_external():
    data = request.get_json() or {}
    user_input = data.get('inputValue', '')
    user_id = g.user_id
    settings = get_user_settings(user_id) or {}
    tone_response = (settings.get('main') or {}).get('toneResponse', '')
    response_data = chat_space_model.check_chat_space(
        user_input,
        user_id=user_id,
        tone_response=tone_response
    )

    action = response_data.get('action')

    if action == 'switchbot_control':
        command = response_data.get('data', {}).get('command')
        if command:
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

    # elif action == 'calendar_update':
    #     sm = ScheduleManager()
    #     # Webブラウザからのアクセスなので、user_idはsessionから取得
    #     if user_id and sm.is_google_linked(user_id):
    #         try:
    #             calendar_id = response_data.get('calendar_id')
    #             event_id = response_data.get('event_id')
    #             changes = response_data.get('changes', {})
    #             if calendar_id and event_id and changes:
    #                 ok = sm.update_event(user_id, calendar_id, event_id, changes)
    #                 if ok:
    #                     response_data['message'] = 'Googleカレンダーのイベントを更新しました'
    #                     response_data['status'] = 'success'
    #                 else:
    #                     response_data['message'] = 'Googleカレンダーの更新に失敗しました'
    #                     response_data['status'] = 'error'
    #             else:
    #                 response_data['message'] = '変更必須のイベントIDが欠落しています'
    #                 response_data['status'] = 'error'
    #         except Exception as e:
    #             response_data['message'] = f'Google繧ｫ繝ｬ繝ｳ繝繝ｼ縺ｮ莠亥ｮ壼､画峩縺ｫ螟ｱ謨励＠縺ｾ縺励◆: {str(e)}'
    #             response_data['status'] = 'error'
    #     else:
    #         # Webブラウザからのアクセスなので、GoogleログインページへのURLを返す
    #         purpose = response_data.get('purpose', '')
    #         if isinstance(purpose, str) and purpose.startswith('C'):
    #             oauth_url = url_for('google_login')
    #             response_data['message'] = f'Googleアカウントがリンクされていません。こちらからリンクしてください: {oauth_url}'
    #             response_data['status'] = 'needs_link'
    #             print(f"DEBUG: Googleアカウントがリンクされていません。response_data: {response_data}")
    #             return jsonify(response_data), 401
    #         response_data['status'] = 'error'
    triggered_by_voice = _handle_input_triggers(user_input, response_data, user_id)
    if triggered_by_voice:
        response_data['suppress_tts'] = True
        response_data['message'] = ""
    print(f"DEBUG: chat_api_webからの最終レスポンス: {response_data}")
    return jsonify(response_data)

import re
import copy
import pytz

JST = pytz.timezone('Asia/Tokyo')
from services import local_calendar_service
from services.memo_service import get_all_memos as get_all_memo_records
from services.weather_service import (
    get_weather_forecast_message,
    DEFAULT_AREA_CODE,
    resolve_area_code_from_address,
)


def _normalize_keyword_list(raw):
    if raw is None: return []
    if isinstance(raw, list):
        return [item for sublist in raw for item in _normalize_keyword_list(sublist) if item]
    if not isinstance(raw, str): raw = str(raw)
    return [p.strip() for p in re.split(r"[,\n、]+", raw) if p.strip()]

def _match_keywords(text, keywords):
    if not text or not keywords: return False
    lowered_text = text.lower()
    return all(k.lower() in lowered_text for k in keywords)

def _evaluate_filters(filters, text):
    if not filters: return True
    target = (text or "").lower()
    result = None
    for idx, f in enumerate(filters):
        token = (f.get('text') or '').strip()
        if not token: continue
        contains = token.lower() in target
        logic = (f.get('logic') or '').upper()
        if idx == 0:
            current = (not contains) if logic == 'NOT' else contains
        else:
            current = contains
        if result is None:
            result = current
            continue
        if logic == 'AND': result = result and current
        elif logic == 'OR': result = result or current
        elif logic == 'NOT': result = result and (not current)
        elif logic == 'NAND': result = not (result and current)
        elif logic == 'NOR': result = not (result or current)
        elif logic == 'XOR': result = (result and not current) or (not result and current)
        elif logic == 'XNOR': result = (result and current) or (not result and not current)
        else: result = result and current
    return True if result is None else result


def _map_purpose_to_action(purpose):
    if not isinstance(purpose, str) or len(purpose) < 2: return None, None
    category_map = {
        'C': 'カレンダー',
        'I': '収支管理',
        'M': 'メモ',
    }
    action_map = {
        'a': '追加',
        'd': '削除',
        'c': '変更',
        'g': '取得',
        's': '検索',
    }
    category = category_map.get(purpose[0])
    action = action_map.get(purpose[1])
    return category, action


def _date_range_to_utc_iso(start_dt, end_dt):
    start_utc = start_dt.astimezone(pytz.UTC).isoformat()
    end_utc = end_dt.astimezone(pytz.UTC).isoformat()
    return start_utc, end_utc

def _build_range_from_detail(detail, now_jst):
    start_dt, end_dt = shared_build_range_from_detail(detail, now_jst, JST)
    if not start_dt or not end_dt:
        app.logger.error("[DEBUG_BUILD_RANGE] Error building date range from detail.")
    return start_dt, end_dt

def _enrich_calendar_read(detail, user_id, now_jst, app_logger):
    app_logger.debug(f"[DEBUG_ENRICH] _enrich_calendar_read called for user {user_id} with detail: {detail}")
    start_dt, end_dt = _build_range_from_detail(detail, now_jst)
    app_logger.debug(f"[DEBUG_ENRICH] Calculated range for calendar: {start_dt} to {end_dt}")
    
    events = local_calendar_service.get_events(user_id, start_dt.isoformat() if start_dt else None, end_dt.isoformat() if end_dt else None)
    
    app_logger.debug(f"[DEBUG_ENRICH] local_calendar_service.get_events returned: {events}")

    if not events:
        detail['summary'] = '今日の予定はありません'
        detail['events'] = []
        app_logger.debug("[DEBUG_ENRICH] No calendar events found.")
        return detail

    event_items = []
    for e in events:
        try:
            start_local = datetime.fromisoformat(e['start_time']).astimezone(JST)
            end_local = datetime.fromisoformat(e['end_time']).astimezone(JST)
            event_items.append({
                'summary': e.get('title', '予定'),
                'start_time': start_local.strftime('%H:%M'),
                'end_time': end_local.strftime('%H:%M'),
                'start_day': f"{start_local.year}年{start_local.month}月{start_local.day}日",
                'end_day': f"{end_local.year}年{end_local.month}月{end_local.day}日",
                'event_link': None
            })
        except Exception as err:
            app_logger.error(f"[DEBUG_ENRICH] Calendar event parse error: {err}", exc_info=True)
            
    if event_items:
        detail['events'] = event_items
        detail.update(event_items[0])
        detail['summary'] = event_items[0]['summary']
    else:
        detail['summary'] = '今日の予定はありません'
        detail['events'] = []
    
    app_logger.debug(f"[DEBUG_ENRICH] Finished _enrich_calendar_read. Returning detail: {detail}")
    return detail

def _enrich_finance_read(detail, user_id, now_jst, app_logger):
    app_logger.debug(f"[DEBUG_ENRICH] _enrich_finance_read called for user {user_id} with detail: {detail}")
    format_type = detail.get('format')
    records = get_all_finance_records(user_id)
    start_dt, end_dt = _build_range_from_detail(detail, now_jst)
    
    app_logger.debug(f"[DEBUG_ENRICH] Calculated range for finance: {start_dt} to {end_dt}")
    
    filtered = []
    for r in records:
        date_str = r.get('date')
        if not date_str: continue
        try:
            record_dt = datetime.fromisoformat(date_str)
            if record_dt.tzinfo is None:
                record_dt = JST.localize(record_dt)
            if start_dt <= record_dt <= end_dt:
                filtered.append(r)
        except ValueError:
            continue

    income_total = sum(r.get('amount', 0) for r in filtered if r.get('type') == 'income')
    expense_total = sum(r.get('amount', 0) for r in filtered if r.get('type') == 'expense')
    balance = income_total - expense_total

    if format_type == 'individual':
        detail['records'] = filtered
    else:
        detail['income_total'] = income_total
        detail['expense_total'] = expense_total
        detail['balance'] = balance
    
    app_logger.debug(f"[DEBUG_ENRICH] Finished _enrich_finance_read. Returning detail with keys: {list(detail.keys())}")
    return detail

def _enrich_memo_read(detail, user_id, now_jst, app_logger):
    app_logger.debug(f"[DEBUG_ENRICH] _enrich_memo_read called for user {user_id} with detail: {detail}")
    start_dt, end_dt = _build_range_from_detail(detail, now_jst)
    start_utc, end_utc = _date_range_to_utc_iso(start_dt, end_dt) if start_dt and end_dt else (None, None)
    
    memos = get_all_memo_records(user_id=user_id, start_date=start_utc, end_date=end_utc)
    app_logger.debug(f"[DEBUG_ENRICH] get_all_memo_records returned: {memos}")
    
    if isinstance(memos, dict) and memos.get('error'):
        detail['content'] = 'メモの取得に失敗しました。'
        return detail
    if not memos:
        detail['content'] = '該当するメモは見つかりませんでした。'
        return detail
    parts = []
    for memo in memos[:5]:
        title = memo.get('title') or '無題'
        content = memo.get('content') or '内容なし'
        parts.append(f"タイトル: {title} / 内容: {content}")
    detail['content'] = " / ".join(parts)
    
    app_logger.debug(f"[DEBUG_ENRICH] Finished _enrich_memo_read. Returning detail: {detail}")
    return detail

def _normalize_alarm_time_text(raw_time):
    if raw_time is None:
        return None
    text = str(raw_time).strip()
    if not text:
        return None
    text = text.translate(str.maketrans("０１２３４５６７８９：", "0123456789:"))
    text = re.sub(r"\s+", "", text)
    m = re.fullmatch(r"(\d{1,2}):(\d{1,2})", text)
    if not m:
        return None
    hour = int(m.group(1))
    minute = int(m.group(2))
    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        return None
    return f"{hour:02d}:{minute:02d}"

def _build_special_alarm_read_detail(user_id, app_logger):
    """
    特殊命令「目覚まし」の時間トリガーを参照し、読み上げメッセージを構築する。
    """
    try:
        orders = get_all_orders(user_id)
        if isinstance(orders, dict) and orders.get('error'):
            return {"error": "目覚まし命令の取得に失敗しました。"}
        if not isinstance(orders, list) or not orders:
            return {"error": "目覚まし命令が見つかりませんでした。"}

        alarm_order = next((o for o in orders if str(o.get('name', '')).strip() == '目覚まし'), None)
        if not alarm_order:
            alarm_order = next((o for o in orders if '目覚まし' in str(o.get('name', ''))), None)
        if not alarm_order:
            return {"error": "目覚まし命令が見つかりませんでした。"}

        triggers = alarm_order.get('triggers') or []
        if not triggers or not isinstance(triggers[0], dict):
            return {"error": "目覚まし命令のトリガー情報が不正です。"}

        trigger0 = triggers[0]
        if str(trigger0.get('category') or '').strip() != '時間':
            return {"error": "目覚まし命令の先頭トリガーが時間ではありません。"}

        raw_time = (trigger0.get('value') or {}).get('time')
        normalized = _normalize_alarm_time_text(raw_time)
        if not normalized:
            return {"error": "目覚まし時刻が設定されていません。"}

        hour_str, minute_str = normalized.split(':')
        hour = int(hour_str)
        minute = int(minute_str)
        if minute == 0:
            message = f"明日の目覚ましの時間は{hour}時です"
        else:
            message = f"明日の目覚ましの時間は{hour}時{minute}分です"

        return {
            "message": message,
            "time": normalized,
            "order_id": alarm_order.get('id'),
            "order_name": alarm_order.get('name'),
        }
    except Exception as e:
        app_logger.error(f"[DEBUG_ENRICH] Failed to build special alarm detail: {e}", exc_info=True)
        return {"error": "目覚まし時刻の取得中にエラーが発生しました。"}

def _enrich_actions_for_dispatch(order_payload, user_id, app_logger, source="Unknown"):
    app.logger.debug(f"[DEBUG_ENRICH] _enrich_actions_for_dispatch called from '{source}' for user {user_id}")
    app.logger.debug(f"[DEBUG_ENRICH] Payload before enrichment: {json.dumps(order_payload, indent=2, ensure_ascii=False)}")
    
    now_jst = datetime.now(JST)
    if app_logger is None:
        app_logger = app.logger
    steps = order_payload.get('steps') or []
    actions = order_payload.get('actions') or []

    def enrich_action(action):
        if not isinstance(action, dict): return action
        category = action.get('category')
        sub = action.get('sub')
        detail = action.get('detail') or {}
        
        app_logger.debug(f"[DEBUG_ENRICH] Enriching action: Category='{category}', Sub='{sub}'")
        
        try:
            if category == '時間読み上げ':
                hour = now_jst.hour
                minute = now_jst.minute
                time_message = f"現在の時刻は、{hour}時{minute}分です。"
                
                # フロントが理解できる「音声-再生」アクションに変換する
                action['category'] = '音声'
                action['sub'] = '再生'
                action['detail'] = {'message': time_message}
                app_logger.debug(f"[DEBUG_ENRICH] Converted '時間読み上げ' to '音声-再生' with message: {time_message}")
                return action # 変換したのでここで処理を終了

            if category == 'カレンダー' and sub == '読み上げ':
                action['detail'] = _enrich_calendar_read(detail, user_id, now_jst, app_logger)
            elif category == '収支管理' and sub == '読み上げ':
                action['detail'] = _enrich_finance_read(detail, user_id, now_jst, app_logger)
            elif category == 'メモ' and sub == '読み上げ':
                action['detail'] = _enrich_memo_read(detail, user_id, now_jst, app_logger)
            elif category == '天気' and sub == '読み上げ':
                address = detail.get('address', '')
                area_code = resolve_area_code_from_address(address, DEFAULT_AREA_CODE)
                content = detail.get('content', ["天気", "気温"])
                range_type = detail.get('range', "今日")
                granularity = detail.get('granularity', "1日ごと")
                hours = detail.get('hours', [])
                
                app_logger.debug(
                    f"[DEBUG_ENRICH] Weather action details: area={area_code}, address={address}, "
                    f"content={content}, range={range_type}, granularity={granularity}, hours={hours}"
                )
                
                weather_message = get_weather_forecast_message(
                    area_code=area_code,
                    content=content,
                    range_type=range_type,
                    granularity=granularity,
                    hours=hours,
                    now_jst=now_jst,
                )
                
                app_logger.debug(f"[DEBUG_ENRICH] get_weather_forecast_message returned: {weather_message}")
                
                detail['message'] = weather_message
                action['detail'] = detail
            elif category == '特殊命令' and sub == '目覚まし':
                alarm_detail = _build_special_alarm_read_detail(user_id, app_logger)
                detail.update(alarm_detail)
                action['detail'] = detail
            # ... (other enrichments like email can be logged here too)
        except Exception as e:
            app_logger.error(f"!!! [DEBUG_ENRICH] Exception during action enrichment for Category='{category}': {e}", exc_info=True)
            detail['error'] = f"アクション '{category}' の準備中にサーバーエラーが発生しました。"
            action['detail'] = detail
            
        app_logger.debug(f"[DEBUG_ENRICH] Action after enrichment: {json.dumps(action, indent=2, ensure_ascii=False)}")
        return action

    if isinstance(steps, list) and steps:
        for step in steps:
            if not isinstance(step, dict): continue
            action_to_enrich = step.get('action')
            if action_to_enrich:
                step['action'] = enrich_action(action_to_enrich)
            
            # Also handle nested conditions/actions if necessary
            condition = step.get('condition')
            if condition:
                if 'actions' in condition and isinstance(condition['actions'], list):
                    condition['actions'] = [enrich_action(a) for a in condition['actions']]
                if 'nested' in condition and isinstance(condition['nested'], list):
                    # This requires a recursive approach, for now, let's keep it simple
                    pass
        order_payload['steps'] = steps
    else:
        order_payload['actions'] = [enrich_action(a) for a in actions]
        
    app.logger.debug(f"[DEBUG_ENRICH] Payload after enrichment: {json.dumps(order_payload, indent=2, ensure_ascii=False)}")
    return order_payload

@app.route('/api/actions/enrich', methods=['POST'])
@login_required
def enrich_action_api():
    # This endpoint is called by the client to enrich a single action.
    data = request.get_json()
    action = data.get('action')
    user_id = session.get('user', {}).get('id')

    app.logger.debug(f"--- [ENRICH_API] START: /api/actions/enrich for user_id: {user_id} ---")
    app.logger.debug(f"[ENRICH_API] Received action: {json.dumps(action, indent=2, ensure_ascii=False)}")

    if not user_id or not action:
        app.logger.error("[ENRICH_API] Missing user_id or action in request.")
        return jsonify({'error': 'Missing user_id or action'}), 400

    # We need to wrap the single action in a dummy payload to use the existing enrichment logic.
    dummy_payload = {'steps': [{'kind': 'action', 'action': action}]}
    
    try:
        enriched_payload = _enrich_actions_for_dispatch(dummy_payload, user_id, app.logger, source="/api/actions/enrich")
        
        enriched_action = enriched_payload.get('steps', [{}])[0].get('action', {})
        enriched_detail = enriched_action.get('detail', {})
        
        # If the enrichment process itself resulted in an error, pass it to the client
        if 'error' in enriched_detail:
             app.logger.warning(f"[ENRICH_API] Enrichment resulted in an error: {enriched_detail['error']}")

        app.logger.debug(f"[ENRICH_API] Returning enriched_detail: {json.dumps(enriched_detail, indent=2, ensure_ascii=False)}")
        app.logger.debug(f"--- [ENRICH_API] END: /api/actions/enrich for user_id: {user_id} ---")

        return jsonify({'enriched_detail': enriched_detail})

    except Exception as e:
        app.logger.error(f"!!! [ENRICH_API] Unhandled exception in /api/actions/enrich: {e}", exc_info=True)
        return jsonify({'error': 'An unexpected server error occurred during enrichment.'}), 500

def _dispatch_order_payload(user_id, order_payload):
    sid = connected_users.get(user_id)
    if not sid:
        try:
            queued = pending_action_service.add_pending_action(
                user_id=user_id,
                command_id=0,
                action_data={
                    "scheduled_at": datetime.now().isoformat(),
                    "order_payload": order_payload
                }
            )
            if isinstance(queued, dict) and queued.get("error"):
                print(f"[INPUT_TRIGGER] User {user_id} is not connected. Queue failed: {queued.get('error')}")
            else:
                print(f"[INPUT_TRIGGER] User {user_id} is not connected. Queued command for later dispatch.")
        except Exception as e:
            print(f"[INPUT_TRIGGER] User {user_id} is not connected. Queue exception: {e}")
        return
    try:
        steps = order_payload.get("steps") or []
        actions = order_payload.get("actions") or []
        step_summary = [s.get("kind", "action") if isinstance(s, dict) else "unknown" for s in steps]
        action_summary = [
            f"{a.get('category')}:{a.get('sub')}" for a in actions if isinstance(a, dict)
        ]
        print(f"[DISPATCH] user_id={user_id} steps={len(steps)} actions={len(actions)} step_kinds={step_summary} action_list={action_summary}")
    except Exception as e:
        print(f"[DISPATCH] summary log failed: {e}")
    socketio.emit('dispatch_command', order_payload, room=sid)
    print(f"[INPUT_TRIGGER] Dispatched command to user {user_id}.")


def _handle_input_triggers(user_input, response_data, user_id):
    if not user_id: return False
    if response_data.get('status') != 'success': return False
    orders = get_all_orders(user_id)
    if isinstance(orders, dict) and orders.get('error'):
        print(f"[INPUT_TRIGGER] get_all_orders error: {orders.get('error')}")
        return False
    purpose = response_data.get('purpose')
    purpose_category, purpose_action = _map_purpose_to_action(purpose)
    triggered = False
    for order in orders:
        triggers = order.get('triggers') or []
        if not triggers: continue
        trigger = triggers[0]
        category = trigger.get('category')
        sub = trigger.get('sub')
        value = trigger.get('value') or {}
        if category == 'ボイス':
            keywords = _normalize_keyword_list(value.get('keywords') or value.get('keyword') or value.get('value'))
            if _match_keywords(user_input, keywords):
                payload = {k: order.get(k) for k in ['triggers', 'actions', 'conditions', 'steps'] if k in order}
                payload = _enrich_actions_for_dispatch(payload, user_id, app.logger)
                print(f"[INPUT_TRIGGER] Voice matched keywords={{keywords}}")
                _dispatch_order_payload(user_id, payload)
                triggered = True
            continue

        if sub != '入力があったら': continue
        if category != purpose_category: continue
        actions = value.get('actions') or []
        if actions and purpose_action not in actions: continue

        if category in ('カレンダー', 'メモ'):
            filters = value.get('filters') or []
            if not _evaluate_filters(filters, user_input): continue

        if category == '収支管理' and purpose_action == '追加':
            genres = value.get('genres') or []
            if genres and response_data.get('data'):
                matched = any((r.get('category') in genres) for r in response_data.get('data') if isinstance(r, dict))
                if not matched: continue

        payload = {k: order.get(k) for k in ['triggers', 'actions', 'conditions', 'steps'] if k in order}
        payload = _enrich_actions_for_dispatch(payload, user_id, app.logger)
        print(f"[INPUT_TRIGGER] Matched trigger category={{category}} action={{purpose_action}}")
        _dispatch_order_payload(user_id, payload)
        triggered = True
    return triggered


def _handle_voice_triggers(user_input, user_id, app_logger):
    print(f"[VOICE_TRIGGER] Handling voice triggers for user_id: {user_id} with input: '{user_input}'")
    if not user_id or not user_input: return []
    orders = get_all_orders(user_id)
    print(f"[VOICE_TRIGGER] Found {len(orders) if isinstance(orders, list) else 0} orders for user.")

    if isinstance(orders, dict) and orders.get('error'):
        print(f"[VOICE_TRIGGER] Error getting orders: {orders.get('error')}")
        return []

    payloads = []
    for order in orders:
        order_id = order.get('id', 'N/A')
        print(f"[VOICE_TRIGGER] Checking order ID: {order_id}")
        
        triggers = order.get('triggers', [])
        if not triggers: continue

        trigger = triggers[0]
        category = trigger.get('category')
        if str(category).strip().lower() not in ('ボイス', 'voice'): continue

        value = trigger.get('value', {})
        # keywordsは [['a', 'b'], ['c']] のような形式を期待
        or_keyword_groups = value.get('keywords')

        # 従来の文字列/フラットリスト形式にも対応 (後方互換性)
        if not isinstance(or_keyword_groups, list) or not or_keyword_groups or not any(isinstance(i, list) for i in or_keyword_groups):
             legacy_keywords = _normalize_keyword_list(value.get('keywords') or value.get('keyword') or value.get('value'))
             if legacy_keywords:
                 or_keyword_groups = [legacy_keywords] # [[ 'a', 'b', 'c' ]] のようにラップして処理
             else:
                 continue
        
        print(f"[VOICE_TRIGGER] Order {order_id} has voice trigger with keyword groups: {or_keyword_groups}")
        
        match_found = False
        for and_keywords in or_keyword_groups:
            # and_keywords がリストでなければ、リストに変換 (単一キーワードの場合など)
            if not isinstance(and_keywords, list):
                and_keywords = [str(and_keywords)]
            
            if _match_keywords(user_input, and_keywords):
                match_found = True
                break # いずれかのOR条件が一致すればループを抜ける
        
        if match_found:
            print(f"[VOICE_TRIGGER] SUCCESS: Matched keywords for order ID: {order_id}")
            payload = {k: order.get(k) for k in ['triggers', 'actions', 'conditions', 'steps'] if k in order}
            # Enrichment is removed from here
            payloads.append(payload)
        else:
            print(f"[VOICE_TRIGGER] No keyword match for order ID: {order_id}")

    return payloads

@app.route('/web_api/chat', methods=['POST'])
@login_required # セッションベース認証
def chat_api_web():
    data = request.get_json() or {}
    user_input = data.get('inputValue', '')
    youtube_context = data.get('youtubeContext') or {}
    user_id = session.get('user', {}).get('id') # セッションからuser_idを取得
    response_data = {"status": "success", "message": ""}

    if chat_space_model.is_cancelled(user_id):
        print("DEBUG: force-cancel flag active. Rejecting input.")
        response_data = {"status": "success", "message": "", "abort_command": True, "suppress_tts": True, "cancelled": True}
        return jsonify(response_data)

    print(f"[CHAT_API] Received input: '{user_input}'. Starting voice trigger check...")
    voice_payloads = _handle_voice_triggers(user_input, user_id, app.logger)
    print(f"[CHAT_API] Voice trigger check completed. Found {len(voice_payloads)} matching orders.")

    # ▼▼▼ デバッグログ追加 ▼▼▼
    if voice_payloads:
        print(f"--- [DEBUG] Raw voice_payloads: {json.dumps(voice_payloads, indent=2, ensure_ascii=False)} ---")
    # ▲▲▲ デバッグログ追加 ▲▲▲

    if voice_payloads:
        enriched_payloads = []
        for payload in voice_payloads:
            # ボイストリガー経由でもアクション内容を補強してから送信する
            enriched_payload = _enrich_actions_for_dispatch(payload, user_id, app.logger)
            enriched_payloads.append(enriched_payload)
        
        # ▼▼▼ デバッグログ追加 ▼▼▼
        print(f"--- [DEBUG] Enriched payloads: {json.dumps(enriched_payloads, indent=2, ensure_ascii=False)} ---")
        # ▲▲▲ デバッグログ追加 ▲▲▲

        response_data['suppress_tts'] = True
        response_data['message'] = ""
        response_data['triggered_by_voice'] = True
        response_data['triggered_by_voice_count'] = len(voice_payloads)
        response_data['order_payloads'] = enriched_payloads
        
        # ▼▼▼ デバッグログ追加 ▼▼▼
        print(f"--- [DEBUG] Final response_data to be sent: {json.dumps(response_data, indent=2, ensure_ascii=False)} ---")
        # ▲▲▲ デバッグログ追加 ▲▲▲
        
        return jsonify(response_data)

    # ... (rest of the chat_api_web function)
    settings = get_user_settings(user_id) or {}
    tone_response = (settings.get('main') or {}).get('toneResponse', '')
    response_data = chat_space_model.check_chat_space(
        user_input,
        user_id=user_id,
        tone_response=tone_response,
        youtube_context=youtube_context
    )
    return jsonify(response_data)

# ... (all other routes and functions are present)

def _run_job_with_app_context(func):
    with app.app_context():
        app.logger.debug(f"--- [JOB_RUNNER] START: Running job '{func.__name__}' ---")
        dispatch_list = func(app.logger)
        if dispatch_list:
            app.logger.debug(f"[JOB_RUNNER] Job '{func.__name__}' found {len(dispatch_list)} items to dispatch.")
            for user_id, order_data in dispatch_list:
                # NOTE: Enrichment is now handled by the client-side requesting /api/actions/enrich.
                # We send the raw order data.
                sid = connected_users.get(user_id)
                if sid:
                    app.logger.debug(f"[JOB_RUNNER] Dispatching raw order_data for user {user_id} to sid {sid}")
                    socketio.emit('dispatch_command', order_data, room=sid)
                else:
                    queued = pending_action_service.add_pending_action(
                        user_id=user_id,
                        command_id=0,
                        action_data={
                            "scheduled_at": datetime.now().isoformat(),
                            "order_payload": order_data
                        }
                    )
                    if isinstance(queued, dict) and queued.get("error"):
                        app.logger.warning(
                            f"[JOB_RUNNER] User {user_id} is not connected. Queue failed: {queued.get('error')}"
                        )
                    else:
                        app.logger.warning(
                            f"[JOB_RUNNER] User {user_id} is not connected. Command queued for pending delivery."
                        )
        app.logger.debug(f"--- [JOB_RUNNER] END: Job '{func.__name__}' finished. ---")

def _acquire_scheduler_process_lock():
    """
    マルチワーカー時の重複実行を避けるため、1プロセスだけがスケジューラを起動する。
    """
    global _scheduler_lock_handle
    if _scheduler_lock_handle is not None:
        return True

    lock_path = os.path.join(tempfile.gettempdir(), "secretary_app_scheduler.lock")
    fh = open(lock_path, "a+")
    try:
        try:
            import fcntl
            fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except ImportError:
            # Windows開発環境向け（RenderはLinux）
            import msvcrt
            msvcrt.locking(fh.fileno(), msvcrt.LK_NBLCK, 1)
        _scheduler_lock_handle = fh
        return True
    except Exception:
        fh.close()
        return False

def _safe_shutdown_scheduler():
    try:
        if scheduler.running:
            scheduler.shutdown()
    except Exception:
        pass

def _start_background_scheduler_if_needed():
    """
    gunicorn配下でも時間トリガー監視を起動する。
    ENABLE_APP_SCHEDULER=0 で無効化可能。
    """
    enabled = os.getenv("ENABLE_APP_SCHEDULER", "1").lower() not in ("0", "false", "off")
    if not enabled:
        app.logger.info("Scheduler disabled by ENABLE_APP_SCHEDULER.")
        return

    if scheduler.running:
        return

    if not _acquire_scheduler_process_lock():
        app.logger.info("Scheduler lock held by another process; skip scheduler startup in this worker.")
        return

    scheduler.add_job(
        id='time_trigger_evaluator',
        func=_run_job_with_app_context,
        trigger='cron',
        minute='*',
        second=0,
        replace_existing=True,
        args=[evaluate_triggers]
    )
    scheduler.add_job(
        id='switchbot_trigger_evaluator',
        func=_run_job_with_app_context,
        trigger='interval',
        seconds=1,
        replace_existing=True,
        args=[evaluate_switchbot_triggers]
    )
    scheduler.start()
    app.logger.info("APScheduler started in this process.")

# ... (the rest of the file from the last known good state)
with app.app_context():
    db.create_all()
_start_background_scheduler_if_needed()
atexit.register(_safe_shutdown_scheduler)



# ============== Keep-alive ==============
@app.route('/keep-alive')
def keep_alive():
    return '', 204


# ============== 診断用エンドポイント ==============
@app.route('/diagnose_ip')
def diagnose_ip():
    """
    サーバーの外向きIPアドレスと地域情報を確認するための診断用エンドポイント。
    IPv4とIPv6の両方の接続を試みます。
    """
    import requests
    import subprocess
    import json

    results = {}

    # --- IPv4 (or default) connection test ---
    try:
        print("--- [DIAGNOSE] Attempting IPv4/default connection to ipinfo.io... ---")
        response_v4 = requests.get('https://ipinfo.io/json', timeout=10)
        response_v4.raise_for_status()
        data_v4 = response_v4.json()
        print(f"--- [DIAGNOSE] IPv4/default IP Info: {data_v4} ---")
        results['ipv4_or_default'] = data_v4
    except Exception as e:
        error_message = f"IPv4/default connection failed: {str(e)}"
        print(f"--- [DIAGNOSE] {error_message} ---")
        results['ipv4_or_default'] = {'error': error_message}

    # --- IPv6 connection test using curl ---
    try:
        print("--- [DIAGNOSE] Attempting IPv6 connection to ipinfo.io via curl... ---")
        # curlコマンドをサブプロセスとして実行
        process = subprocess.run(
            ['curl', '-6', 'https://ipinfo.io/json', '--connect-timeout', '10'],
            capture_output=True,
            text=True,
            check=False  # check=Trueにすると0以外の終了コードで例外が発生する
        )
        
        if process.returncode == 0:
            data_v6 = json.loads(process.stdout)
            print(f"--- [DIAGNOSE] IPv6 IP Info: {data_v6} ---")
            results['ipv6'] = data_v6
        else:
            # curlが失敗した場合（IPv6で接続できない、タイムアウトなど）
            error_message = f"curl command failed with exit code {process.returncode}. Stderr: {process.stderr.strip()}"
            print(f"--- [DIAGNOSE] {error_message} ---")
            results['ipv6'] = {'error': error_message}
    
    except FileNotFoundError:
        # curlコマンド自体が見つからない場合
        error_message = "curl command not found in the environment."
        print(f"--- [DIAGNOSE] {error_message} ---")
        results['ipv6'] = {'error': error_message}
    except Exception as e:
        error_message = f"IPv6 connection via curl failed with an unexpected exception: {str(e)}"
        print(f"--- [DIAGNOSE] {error_message} ---")
        results['ipv6'] = {'error': error_message}

    return jsonify(results)


if __name__ == '__main__':
    if os.environ.get('WERKZEUG_RUN_MAIN') != 'true':
        _start_background_scheduler_if_needed()
    socketio.run(app, host='0.0.0.0', port=5000, debug=True, ssl_context='adhoc', use_reloader=False)
