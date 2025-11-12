from flask import Flask, render_template, jsonify, request, redirect, url_for, session
from services.user_service import (
    get_all_users, get_user_by_id, add_user, update_user, delete_user)
from services.category_service import (
    get_user_categories, add_category, delete_category, clear_all_categories)
from services.auth_service import register_user, login_user
from services.expense_service import (add_finance_record, delete_finance_record, get_all_expenses)
from services.finance_service import get_finance_summary, get_all_finance_records
from models.finance_model import FinanceModel
import os

app = Flask(__name__, template_folder='templates', static_folder='static')
app.secret_key = os.getenv("SECRET_KEY", "devsecret")

# Model instances
finance_model = FinanceModel()


# --------------------
# ユーザー情報ヘルパー
# --------------------
def current_user_id():
    user = session.get('user')
    return user.get('id') if user else None


def resolve_request_user_id():
    """Resolve user_id for API access.
    Priority: session -> X-User-Id header -> query param -> JSON body.
    """
    uid = current_user_id()
    if uid:
        return uid
    uid = request.headers.get('X-User-Id') or request.args.get('user_id')
    if uid:
        return uid
    try:
        if request.is_json:
            body = request.get_json(silent=True) or {}
            uid = body.get('user_id')
            if uid:
                return uid
    except Exception:
        pass
    return None


# --------------------
# CORS (for Android/Windows/Web)
# --------------------
ALLOWED_ORIGINS = os.getenv('ALLOW_ORIGINS', '*')


@app.after_request
def add_cors_headers(resp):
    origin = request.headers.get('Origin')
    allow_origin = ALLOWED_ORIGINS
    # Reflect specific origin when configured as comma-separated list
    if ALLOWED_ORIGINS != '*':
        allowed = [o.strip() for o in ALLOWED_ORIGINS.split(',') if o.strip()]
        if origin and origin in allowed:
            allow_origin = origin
        else:
            allow_origin = allowed[0] if allowed else 'null'
    resp.headers['Access-Control-Allow-Origin'] = allow_origin
    resp.headers['Access-Control-Allow-Methods'] = 'GET,POST,DELETE,OPTIONS'
    resp.headers['Access-Control-Allow-Headers'] = 'Content-Type, X-User-Id'
    resp.headers['Access-Control-Max-Age'] = '600'
    return resp


@app.route('/api/finance', methods=['OPTIONS'])
@app.route('/api/categories', methods=['OPTIONS'])
@app.route('/api/categories/<path:_any>', methods=['OPTIONS'])
def cors_preflight(_any=None):
    return ('', 204)


# --------------------
# ページルーティング
# --------------------
@app.route('/')
def main():
    return render_template('main.html')

@app.route('/expense', methods=['GET', 'POST'])
def expense():
    uid = current_user_id()
    if not uid:
        return redirect(url_for('login'))

    if request.method == 'POST':
        form = request.form
        rec = {
            'type': form.get('type', 'expense'),
            'amount': int(form.get('amount', 0) or 0),
            'category': form.get('category', ''),
            'memo': form.get('memo', '')
        }
        add_finance_record(uid, rec)
        return redirect(url_for('expense'))

    # GET: 種類と直近レコードを表示
    categories_data = get_user_categories(uid) or []
    categories_list = [dict(cat) for cat in categories_data]

    records = get_all_expenses(uid) or []
    # 任意: 最新20件に絞る
    recent_records = records[:20]

    # 簡易ステータス計算
    balance = 0
    monthly = 0
    daily = 0
    try:
        from datetime import datetime
        today_str = datetime.now().strftime('%Y-%m-%d')
        month_prefix = today_str[:7]
        for r in records:
            amt = r.get('amount', 0) or 0
            if r.get('type') == 'income':
                balance += amt
            elif r.get('type') == 'expense':
                balance -= amt
                if isinstance(r.get('date'), str):
                    if r['date'] == today_str:
                        daily += amt
                    if r['date'].startswith(month_prefix):
                        monthly += amt
    except Exception:
        pass

    return render_template(
        'expense.html',
        categories=categories_list,
        records=recent_records,
        balance=balance,
        monthly=monthly,
        daily=daily
    )

@app.route('/slot')
def slot():
    return render_template('slot.html')

@app.route('/index')
def index_page():
    return render_template('index2.html')

@app.route('/oauth-callback2')
def oauth_callback2():
    return render_template('oauth-callback2.html')

@app.route('/calender')
def calender_page():
    return render_template('calender.html')

@app.route('/oauth-callback')
def oauth_callback():
    return render_template('oauth-callback.html')

@app.route("/categories")
def categories():
    uid = current_user_id()
    if not uid:
        return redirect(url_for('login'))
    categories_data = get_user_categories(uid) or []
    categories_list = [dict(cat) for cat in categories_data]
    return render_template('categories.html', categories=categories_list)

@app.route("/finance")
def finance():
    uid = current_user_id()
    if not uid:
        return redirect(url_for('login'))
    income_stats, expense_stats = get_finance_summary(uid)
    all_records = get_all_finance_records(uid)
    return render_template(
        "finance.html",
        income_stats=income_stats,
        expense_stats=expense_stats,
        all_records=all_records
    )


# --------------------
# 認証関係
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
    return redirect(url_for('login'))


# --------------------
# APIルーティング
# --------------------

# ✅ カテゴリー関連API
@app.route("/api/categories", methods=["GET"])
def get_categories_route():
    uid = resolve_request_user_id()
    if not uid:
        return jsonify({"error": "Unauthorized"}), 401
    result = get_user_categories(uid)
    return jsonify(result)

@app.route("/api/categories", methods=["POST"])
def add_category_route():
    uid = resolve_request_user_id()
    if not uid:
        return jsonify({"error": "Unauthorized"}), 401
    data = request.get_json()
    name = data.get("name", "").strip()
    cat_type = data.get("type", "").strip() or "expense"
    if not name:
        return jsonify({"error": "カテゴリ名が空です"}), 400
    result = add_category(uid, name, cat_type)
    # 前方互換: dataを配列で返す期待に合わせる
    try:
        if isinstance(result.get("data"), dict):
            result["data"] = [result["data"]]
    except Exception:
        pass
    return jsonify(result)

@app.route("/api/categories/<string:cat_id>", methods=["DELETE"])
def delete_category_route(cat_id):
    uid = resolve_request_user_id()
    if not uid:
        return jsonify({"error": "Unauthorized"}), 401
    result = delete_category(uid, cat_id)
    return jsonify(result)

@app.route("/api/categories/clear", methods=["DELETE"])
def clear_categories_route():
    uid = resolve_request_user_id()
    if not uid:
        return jsonify({"error": "Unauthorized"}), 401
    result = clear_all_categories(uid)
    return jsonify(result)


# ✅ 収支関連API
@app.route("/api/finance", methods=["GET"])
def get_finance_records_route():
    uid = resolve_request_user_id()
    if not uid:
        return jsonify({"error": "Unauthorized"}), 401
    # Support filters: type, category, date_from, date_to, limit, offset, order, q
    qargs = request.args
    result = finance_model.list_records(
        uid,
        limit=int(qargs.get('limit', 100) or 100),
        offset=int(qargs.get('offset', 0) or 0),
        order=qargs.get('order', 'desc'),
        type=qargs.get('type'),
        category=qargs.get('category'),
        date_from=qargs.get('date_from'),
        date_to=qargs.get('date_to'),
        memo_query=qargs.get('q'),
    )
    return jsonify(result)

@app.route("/api/finance", methods=["POST"])
def add_finance_record_route():
    uid = resolve_request_user_id()
    if not uid:
        return jsonify({"error": "Unauthorized"}), 401
    data = request.get_json()
    result = finance_model.create_record(uid, data)
    return jsonify(result)

@app.route("/api/finance/<string:record_id>", methods=["DELETE"])
def delete_finance_record_route(record_id):
    uid = resolve_request_user_id()
    if not uid:
        return jsonify({"error": "Unauthorized"}), 401
    result = finance_model.delete_record(uid, record_id)
    return jsonify(result)


# ✅ ユーザー関連API
@app.route("/users", methods=["GET"])
def get_users_route():
    return jsonify(get_all_users())

@app.route("/user/<email>", methods=["GET"])
def get_user_route(email):
    return jsonify(get_user_by_id(email))

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


# --------------------
# 実行
# --------------------
if __name__ == '__main__':
    app.run(
        host='127.0.0.1',
        port=5000,
        debug=True,
        ssl_context='adhoc'
    )
