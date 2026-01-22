# -*- coding: utf-8 -*-
import os
import sys
import re
from datetime import datetime, timedelta
from functools import wraps

# プロジェクトルートをsys.pathに追加
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import (
    Flask, render_template, jsonify, request, redirect, url_for, session, abort, g,
    send_from_directory,
)
from flask_socketio import SocketIO

from services.google_oauth import build_web_flow, get_google_redirect_uri
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
import atexit

import json
from services.user_service import (
    get_all_users, get_user_by_email, add_user, update_user, delete_user
)
from services.category_service import (
    get_all_categories, add_category, delete_category, clear_all_categories
)
from services.auth_service import register_user, login_user
from services.expense_service import add_finance_record, delete_finance_record, delete_finance_records
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
from order.models import db
from models.event import Event
from order.custom_order_routes import custom_order_bp
from order.command_routes import command_bp
from routes.order_routes import order_bp
from routes.calendar_routes import calendar_bp
from order.evaluator import evaluate_triggers # 関数名を修正



# ============== 基本設定 ==============
app = Flask(__name__, template_folder='templates', static_folder='static')
socketio = SocketIO(app, async_mode='threading', cors_allowed_origins="*")
app.config['VERSION_TIMESTAMP'] = int(datetime.now().timestamp()) # キャッシュバスター用

# 接続中のユーザーを管理するための辞書 {user_id: sid}
connected_users = {}

# DBファイルのパス設定
instance_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'instance')
os.makedirs(instance_path, exist_ok=True)
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{os.path.join(instance_path, "orders.db")}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db.init_app(app) # db.init_appはschedulerの前に実行

# APSchedulerの初期化
jobstores = {
    'default': SQLAlchemyJobStore(url=app.config['SQLALCHEMY_DATABASE_URI'])
}
executors = {
    'default': {'type': 'threadpool', 'max_workers': 20}
}
job_defaults = {
    'coalesce': True,
    'max_instances': 3
}
scheduler = BackgroundScheduler(jobstores=jobstores, executors=executors, job_defaults=job_defaults)

# Blueprint登録
app.register_blueprint(custom_order_bp, url_prefix='/api')
app.register_blueprint(command_bp, url_prefix='/api')
app.register_blueprint(order_bp, url_prefix='/order')
app.register_blueprint(calendar_bp)

from flask import Blueprint
custom_order_pages_bp = Blueprint(
    'custom_order_pages', __name__,
    template_folder='order/static/html', static_folder='order/static'
)
order_html_dir = os.path.join(os.path.dirname(__file__), 'order', 'static', 'html')

@custom_order_pages_bp.route('/')
def custom_order_index():
    gcp_api_key = os.getenv('GCP_API_KEY')
    user_id = session.get('user', {}).get('id') if session.get('user') else None
    app.logger.debug(f"DEBUG: GCP_API_KEY from environment: {{gcp_api_key}}")
    return render_template('index.html', gcp_api_key=gcp_api_key, user_id=user_id)

@custom_order_pages_bp.route('/edit')
@custom_order_pages_bp.route('/edit/<int:order_id>')
def edit_command_page(order_id=None):
    return send_from_directory(order_html_dir, 'custom_order_edit.html')

app.register_blueprint(custom_order_pages_bp, url_prefix='/custom_order')


# ============== WebSocket 接続管理 ==============
@socketio.on('connect')
def handle_connect():
    app.logger.debug(f"Client attempting to connect: sid={request.sid}")

@socketio.on('authenticate')
def handle_authenticate(data):
    user_id = data.get('user_id')
    if user_id:
        connected_users[user_id] = request.sid
        app.logger.debug(f"Client authenticated and connected: user_id={user_id}, sid={request.sid}")
    else:
        app.logger.debug(f"Authentication failed for sid={request.sid}")

@socketio.on('disconnect')
def handle_disconnect():
    # 切断したクライアントをconnected_usersから削除
    disconnected_sid = request.sid
    user_id_to_remove = None
    for user_id, sid in connected_users.items():
        if sid == disconnected_sid:
            user_id_to_remove = user_id
            break
    if user_id_to_remove:
        del connected_users[user_id_to_remove]
        app.logger.debug(f"Client disconnected: user_id={user_id_to_remove}, sid={disconnected_sid}")
    else:
        app.logger.debug(f"Unauthenticated client disconnected: sid={disconnected_sid}")

# ============== APIキー認証（api/* のみ）==============
ALLOWED_API_KEYS = set(os.environ.get('ALLOWED_API_KEYS', '').split(','))

@app.before_request
def require_api_key():
    if not request.path.startswith('/api/'):
        return None # APIパス以外は続行
    if not ALLOWED_API_KEYS or ALLOWED_API_KEYS == {''}:
        return None # APIキーが設定されていない場合は認証をスキップ
    provided_key = request.headers.get('X-API-KEY')
    if provided_key not in ALLOWED_API_KEYS:
        return jsonify({'message': 'Error: Invalid or missing API Key.'}), 403
    return None # 認証成功、続行


# ============== 環境変数とモジュール初期化 ==============
SECRET_KEY = os.getenv('SECRET_KEY')
if not SECRET_KEY:
    raise RuntimeError('SECRET_KEY 環境変数を設定してください。')
app.secret_key = SECRET_KEY
app.permanent_session_lifetime = timedelta(days=30)  # ԑ˃ZbV炩gpԊm点

GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
if not GEMINI_API_KEY:
    app.logger.warning('Warning: GEMINI_API_KEY not set. ChatSpaceModel may not work.')
chat_space_model = ChatSpaceModel(gemini_api_key=GEMINI_API_KEY)
calendar_manager = ScheduleManager()
app.calendar_manager = calendar_manager # ScheduleManagerインスタンスをアプリにアタッチ

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
@login_required
def calender_page():
    gcp_api_key = os.getenv('GCP_API_KEY')
    return render_template('calender.html', gcp_api_key=gcp_api_key)


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
        # --- START: Supabase Key Check ---
        import os
        SUPABASE_KEY = os.getenv("SUPABASE_KEY")
        app.logger.debug("--- [DEBUG] Checking SUPABASE_KEY in /register route ---")
        if SUPABASE_KEY:
            app.logger.debug(f"SUPABASE_KEY (partial): {SUPABASE_KEY[:5]}...{SUPABASE_KEY[-5:]}")
        else:
            app.logger.debug("SUPABASE_KEY: NOT SET")
        app.logger.debug("------------------------------------------")
        # --- END: Supabase Key Check ---
        name = request.form['name']
        email = request.form['email']
        password = request.form['password']
        
        app.logger.debug("--- [DEBUG] Calling register_user ---")
        result = register_user(name, email, password)
        app.logger.debug(f"--- [DEBUG] Result from register_user: {result} ---")
        app.logger.debug(f"--- [DEBUG] Type of result: {type(result)} ---")

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
    all_records = get_all_finance_records(user_id)
    app.logger.debug(f"Fetched finance records: {all_records}")
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

import re
from services import local_calendar_service

@app.route('/web_api/chat', methods=['POST'])
@login_required # セッションベース認証
def chat_api_web():
    data = request.get_json() or {}
    user_input = data.get('inputValue', '')
    user_id = session.get('user', {}).get('id') # セッションからuser_idを取得
    response_data = {"status": "success", "message": ""}

    # 高速実行のチェック
    if user_input.startswith("クイックコマンド"):
        app.logger.debug(f"DEBUG: 高速実行検出: {user_input}")
        # "クイックコマンド " の部分を除去
        command_body = user_input.replace("クイックコマンド ", "", 1)
        for qc in quick_commands:
            match = re.match(qc["pattern"], command_body)
            if match:
                app.logger.debug(f"DEBUG: クイックコマンドパターン一致: {qc['pattern']}")
                action = qc["action"]
                if action["type"] == "switchbot_command":
                    pass # (Switchbot logic remains the same)
                elif action["type"] == "calendar_event":
                    time_str = match.group(1)
                    title = match.group(2)
                    
                    try:
                        # 時間文字列を解釈 (例: "10時", "10:30")
                        hour, minute = 0, 0
                        if "時" in time_str:
                            parts = time_str.split("時")
                            hour = int(parts[0])
                            if parts[1] and "分" in parts[1]:
                                minute = int(parts[1].replace("分", ""))
                        elif ":" in time_str:
                            parts = time_str.split(":")
                            hour = int(parts[0])
                            minute = int(parts[1])

                        today = datetime.now()
                        start_time = today.replace(hour=hour, minute=minute, second=0, microsecond=0)
                        end_time = start_time + timedelta(hours=1) # デフォルト1時間

                        local_calendar_service.add_event(
                            user_id=user_id,
                            title=title,
                            start_time=start_time,
                            end_time=end_time,
                            description="クイックコマンドによる追加"
                        )
                        response_data['message'] = f"'{title}'の予定を{time_str}に追加しました。"
                        response_data['status'] = 'success'
                    except Exception as e:
                        app.logger.error(f"ERROR: カレンダーイベントの追加に失敗: {e}")
                        response_data['message'] = "予定の追加に失敗しました。時間の形式が正しくない可能性があります。"
                        response_data['status'] = 'error'
                    
                    return jsonify(response_data)

        # 高速実行パターンに一致しなかった場合
        app.logger.debug(f"DEBUG: 高速実行パターン不一致: {user_input}")
    
    # 高速実行に一致しない場合、通常のchat_space_model処理
    response_data = chat_space_model.check_chat_space(user_input, user_id=user_id)
    # (The rest of the function remains the same)

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
                app.logger.debug(f"DEBUG: APIトークンまたはシークレットが設定されていません。response_data: {response_data}")
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
                app.logger.debug(f"DEBUG: SwitchBot操作成功。response_data: {response_data}")
            else:
                response_data['message'] = 'SwitchBotの操作に失敗しました。' # メッセージを修正
                response_data['status'] = 'error'
                app.logger.debug(f"DEBUG: SwitchBot操作失敗。response_data: {response_data}")

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
                app.logger.debug(f"DEBUG: Googleアカウントがリンクされていません。response_data: {response_data}")
                return jsonify(response_data), 401
            response_data['status'] = 'error'
    app.logger.debug(f"DEBUG: chat_api_webからの最終レスポンス: {response_data}")
    return jsonify(response_data)# メモAPIのBlueprint
app.register_blueprint(memo_bp, url_prefix='/api/memos')

@app.route('/api/execute_action', methods=['POST'])
@login_required # ユーザーはアクションを実行するためにログインしている必要がある
def api_execute_action():
    data = request.get_json()
    action_entry = data.get('action_entry')
    user_id = session.get('user', {}).get('id')

    if not action_entry or not user_id:
        return jsonify({"error": "Invalid request or user not logged in"}), 400

    # action_entry['action_data']内の'triggered_at'はISOフォーマット文字列なのでdatetimeオブジェクトに変換
    triggered_at_dt = datetime.fromisoformat(action_entry['action_data']['triggered_at'])

    # action_executor_serviceからexecute_actionを呼び出す
    from services.action_executor_service import execute_action
    result = execute_action(user_id=user_id, action_data=action_entry['action_data'])

    return jsonify(result)


# ============== DB初期化と起動 ==============
with app.app_context():
    db.create_all()

# APSchedulerのジョブをラップする関数
def _run_job_with_app_context(func):
    with app.app_context():
        # evaluate_triggersからディスパッチリストを取得
        dispatch_list = func(app.logger) # app.loggerを引数として渡す
        if dispatch_list:
            app.logger.debug(f"Dispatching {len(dispatch_list)} commands to clients...")
            for user_id, order_data in dispatch_list:
                # ユーザーが接続中か確認
                sid = connected_users.get(user_id)
                if sid:
                    app.logger.debug(f"Dispatching command for user {user_id} to sid {sid}")
                    socketio.emit('dispatch_command', order_data, room=sid)
                else:
                    app.logger.debug(f"User {user_id} is not connected. Command not dispatched.")

# アプリケーション終了時にスケジューラをシャットダウン
atexit.register(lambda: scheduler.shutdown())

if __name__ == '__main__':
    # Werkzeugのリローダーによる重複起動を防ぐため、メインプロセスでのみスケジューラを起動
    if os.environ.get('WERKZEUG_RUN_MAIN') != 'true':
        # APSchedulerジョブの登録
        scheduler.add_job(
            id='time_trigger_evaluator',
            func=_run_job_with_app_context,
            trigger='cron',
            minute='*', # 毎分実行
            second=0, # 毎分00秒に実行
            replace_existing=True,
            args=[evaluate_triggers] # 引数はevaluate_triggers関数オブジェクトのみ
        )
        scheduler.start()
        
    socketio.run(app, host='0.0.0.0', port=5000, debug=True, ssl_context='adhoc', use_reloader=False)