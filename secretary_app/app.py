from flask import Flask, render_template, jsonify, request, redirect, url_for, session
from services.user_service import (
    get_all_users, get_user_by_email, add_user, update_user, delete_user)
from services.category_service import (
    get_all_categories, add_category, delete_category, clear_all_categories)
from services.auth_service import register_user, login_user
from services.expense_service import (add_finance_record,delete_finance_record)
from services.finance_service import get_finance_summary, get_all_finance_records
import os

app = Flask(__name__, template_folder='templates', static_folder='static')
app.secret_key = os.getenv("SECRET_KEY", "devsecret")


# --------------------
# ページルーティング
# --------------------
@app.route('/')
def main():
    return render_template('main.html')

@app.route('/expense')
def expense():
    return render_template('expense.html')

@app.route('/categories')
def categories():
    return render_template('categories.html')

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

@app.route("/finance")
def finance():
    income_stats, expense_stats = get_finance_summary()
    all_records = get_all_finance_records()
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
    result = get_all_categories()
    return jsonify(result)

@app.route("/api/categories", methods=["POST"])
def add_category_route():
    data = request.get_json()
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "カテゴリ名が空です"}), 400
    result = add_category(name)
    return jsonify(result)

@app.route("/api/categories/<string:cat_id>", methods=["DELETE"])
def delete_category_route(cat_id):
    result = delete_category(cat_id) 
    return jsonify(result)

@app.route("/api/categories/clear", methods=["DELETE"])
def clear_categories_route():
    result = clear_all_categories()
    return jsonify(result)


# ✅ 収支関連API
@app.route("/api/finance", methods=["GET"])
def get_finance_records_route():
    result = get_all_finance_records()
    return jsonify(result)

@app.route("/api/finance", methods=["POST"])
def add_finance_record_route():
    data = request.get_json()
    result = add_finance_record(data)
    return jsonify(result)

@app.route("/api/finance/<string:record_id>", methods=["DELETE"])
def delete_finance_record_route(record_id):
    result = delete_finance_record(record_id)
    return jsonify(result)


# ✅ ユーザー関連API
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
