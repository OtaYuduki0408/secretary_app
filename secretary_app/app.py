from flask import Flask, render_template
import os
from routes.memo_routes import memo_bp  # ← ここを修正
from supabase_client import supabase
from dotenv import load_dotenv

# 環境変数の読み込み
load_dotenv()

app = Flask(__name__)

# SECRET_KEYは環境変数から取得
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'default-secret-key-for-development')

# メモAPIのブループリントを登録
app.register_blueprint(memo_bp, url_prefix='/api/memos')

# memo.html を表示するルート
@app.route('/')
def memo_page():
    return render_template('memo.html')

if __name__ == '__main__':
    app.run(debug=True)
