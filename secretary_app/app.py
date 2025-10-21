from flask import Flask, render_template, Response
import os
from dotenv import load_dotenv

# .env の読み込み（存在すれば）
load_dotenv()

app = Flask(__name__,
            template_folder='templates',
            static_folder='static')

# ルーティング
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

@app.route("/finance")
def finance():
    return render_template("finance.html")

if __name__ == '__main__':
    app.run(
        host='127.0.0.1', # ★ ローカルホストからのアクセスに限定
        port=5000,
        debug=True,       # ★ デバッグモードを有効にして、自動再起動とログ出力を有効にする
        ssl_context='adhoc'
    )