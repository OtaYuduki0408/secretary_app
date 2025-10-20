from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
from supabase import create_client
import os

# .env の読み込み
load_dotenv()

app = Flask(__name__,
            template_folder='templates',
            static_folder='static')

app.secret_key = os.environ.get("SECRET_KEY", "your-secret-key")

# Supabase初期化
try:
    app.supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))
    print("✅ Supabase接続成功")
except Exception as e:
    print("❌ Supabase接続失敗:", e)

# ---------- ルート ----------
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

# ---------- API例 ----------
@app.route("/api/categories", methods=["GET", "POST"])
def categories_api():
    supabase = app.supabase
    if request.method == "GET":
        res = supabase.table("categories").select("*").execute()
        return jsonify(res.data)
    else:
        data = request.get_json()
        name = data.get("name")
        if not name:
            return jsonify({"error": "nameが必要です"}), 400
        res = supabase.table("categories").insert({"name": name}).execute()
        return jsonify(res.data)

# ---------- Flask起動 ----------
if __name__ == '__main__':
    print("Flaskサーバー起動します...")
    port = int(os.getenv('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
