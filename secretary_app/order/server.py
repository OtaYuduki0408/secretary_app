from flask import Flask, request, jsonify, send_from_directory, redirect, url_for
from command_manager import init_db, register_command, get_all_commands, delete_command
import os

app = Flask(__name__)

# -------------------------------
# パス設定
# -------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
HTML_DIR = os.path.join(STATIC_DIR, "html")
CSS_DIR = os.path.join(STATIC_DIR, "css")
JS_DIR = os.path.join(STATIC_DIR, "js")

# -------------------------------
# DB初期化
# -------------------------------
init_db()

# -------------------------------
# トップページ → 編集ページにリダイレクト
# -------------------------------
@app.route("/")
def index():
    # /custom_order/edit にリダイレクト
    return redirect(url_for("custom_order_edit"))

# -------------------------------
# 編集ページ (/custom_order/edit)
# -------------------------------
@app.route("/custom_order/edit")
def custom_order_edit():
    file_path = os.path.join(HTML_DIR, "edit_command.html")
    if os.path.exists(file_path):
        return send_from_directory(HTML_DIR, "edit_command.html")
    else:
        return f"❌ edit_command.html が見つかりません: {file_path}", 404

# -------------------------------
# API: 命令一覧取得
# -------------------------------
@app.route("/api/custom_orders", methods=["GET"])
def api_get_orders():
    return jsonify(get_all_commands())

# -------------------------------
# API: 命令削除
# -------------------------------
@app.route("/api/custom_orders/<int:command_id>", methods=["DELETE"])
def api_delete_order(command_id):
    delete_command(command_id)
    return jsonify({"message": f"命令(ID={command_id})を削除しました"})

# -------------------------------
# API: 命令登録
# -------------------------------
@app.route("/api/custom_orders", methods=["POST"])
def api_register_orders():
    data = request.json
    if isinstance(data, dict):
        data = [data]

    for cmd in data:
        name = cmd.get("name", "未設定")
        triggers = cmd.get("triggers", [])
        conditions = cmd.get("conditions", [])
        break_conditions = cmd.get("break_conditions", [])
        actions = cmd.get("actions", [])
        loop_count = cmd.get("loop_count", "once")

        # アクションがある場合
        if actions:
            for action in actions:
                for trigger in triggers or [{"type": "manual", "value": ""}]:
                    for condition in conditions or [None]:
                        for break_cond in break_conditions or [None]:
                            register_command(
                                name=name,
                                action_type=action.get("type", "speak"),
                                content=action.get("value", ""),
                                trigger_type=trigger.get("type", "manual"),
                                trigger_value=trigger.get("value", ""),
                                repeat_interval="once",
                                condition_expr=condition.get("expr") if condition else None,
                                break_expr=break_cond.get("expr") if break_cond else None,
                                loop_count=loop_count
                            )
        else:
            # アクションなしでも登録
            register_command(
                name=name,
                action_type="speak",
                content="",
                trigger_type="manual",
                trigger_value="",
                repeat_interval="once",
                condition_expr=None,
                break_expr=None,
                loop_count=loop_count
            )

    return jsonify({"message": "✅ 命令を保存しました"})

# -------------------------------
# 静的ファイル (CSS/JS/画像など)
# -------------------------------
@app.route("/css/<path:filename>")
def serve_css(filename):
    return send_from_directory(CSS_DIR, filename)

@app.route("/js/<path:filename>")
def serve_js(filename):
    return send_from_directory(JS_DIR, filename)

@app.route("/static/<path:filename>")
def serve_static(filename):
    return send_from_directory(STATIC_DIR, filename)

# -------------------------------
# メイン起動
# -------------------------------
if __name__ == "__main__":
    print("🚀 サーバー起動中: http://127.0.0.1:5000/")
    app.run(host="127.0.0.1", port=5000, debug=True)
