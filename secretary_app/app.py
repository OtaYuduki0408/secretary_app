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

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))  # Cloud Run対応
    app.run(host='0.0.0.0', port=port, debug=True)
