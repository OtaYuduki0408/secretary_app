from flask import Flask, render_template, jsonify, request
from services.user_service import (
    get_all_users, get_user_by_email, add_user, update_user, delete_user
)
from services.category_service import (
    get_all_categories, add_category, delete_category, clear_all_categories
)

app = Flask(__name__,
            template_folder='templates',
            static_folder='static')

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

@app.route('/index')
def xin():
    return render_template('index2.html')

@app.route('/oauth-callback2')
def gen():
    return render_template('oauth-callback2.html')

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
