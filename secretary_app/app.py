from flask import Flask, render_template, jsonify, request, redirect, url_for, session
from services.user_service import (
    get_all_users, get_user_by_email, add_user, update_user, delete_user)
from services.category_service import (
    get_all_categories, add_category, delete_category, clear_all_categories)
from services.auth_service import register_user, login_user
import os


app = Flask(__name__,
            template_folder='templates',
            static_folder='static')

app.secret_key = os.getenv("SECRET_KEY", "devsecret")  # セッション用

# --------------------
# ページルーティング
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

# **修正済み**：xin の重複解消
@app.route('/index')
def index_page():
    return render_template('index2.html')

# **修正済み**：xin の重複解消
@app.route('/calender')
def calender_page():
    return render_template('calender.html')

# **修正済み**：gen の重複解消
@app.route('/oauth-callback')
def oauth_callback():
    return render_template('oauth-callback.html')

@app.route("/finance")
def finance():
    return render_template("finance.html")

@app.route("/nm")
def nm():
    return render_template("notification_test.html")


# 登録ページ
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


# ログインページ
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


# ログアウト
@app.route('/logout')
def logout():
    session.pop('user', None)
    return redirect(url_for('login'))

# --------------------
# APIルーティング
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


if __name__ == '__main__':
    app.run(
        host='127.0.0.1',
        port=5000,
        debug=True,
        ssl_context='adhoc'
    )