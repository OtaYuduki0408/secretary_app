# server.py
from flask import Flask, request, jsonify, send_from_directory
import os
import json
from command_manager import init_db, register_command, get_all_commands, delete_command, update_command

app = Flask(__name__)

# ---- パス設定 ----
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
HTML_DIR = os.path.join(STATIC_DIR, "html")
CSS_DIR = os.path.join(STATIC_DIR, "css")
JS_DIR = os.path.join(STATIC_DIR, "js")

# ---- DB 初期化 ----
init_db()

# ===============================================
# ルート関連
# ===============================================
@app.route("/")
def index():
    index_path = os.path.join(HTML_DIR, "index.html")
    if os.path.exists(index_path):
        return send_from_directory(HTML_DIR, "index.html")
    return """
    <html><body>
      <h2>Index not found in static/html</h2>
      <p><a href="/custom_order/edit">編集ページへ</a></p>
    </body></html>
    """

@app.route("/custom_order/edit")
def custom_order_edit():
    target = "custom_order_edit.html"
    fp = os.path.join(HTML_DIR, target)
    if os.path.exists(fp):
        return send_from_directory(HTML_DIR, target)
    return f"404 Not Found — {target} が見つかりません: {fp}", 404

# ===============================================
# API関連
# ===============================================
@app.route("/api/custom_orders", methods=["GET"])
def api_get_orders():
    return jsonify(get_all_commands())

@app.route("/api/custom_orders", methods=["POST"])
def api_register_orders():
    data = request.json
    if isinstance(data, dict):
        data = [data]
    for cmd in data:
        _save_command(cmd)
    return jsonify({"message": "命令を保存しました"})

@app.route("/api/custom_orders/<int:command_id>", methods=["PUT"])
def api_update_order(command_id):
    data = request.json
    if not data:
        return jsonify({"message": "データがありません"}), 400
    update_command(command_id, cmd_data=data)
    return jsonify({"message": f"命令(ID={command_id})を更新しました"})

@app.route("/api/custom_orders/<int:command_id>", methods=["DELETE"])
def api_delete_order(command_id):
    delete_command(command_id)
    return jsonify({"message": f"命令(ID={command_id})を削除しました"})

# ===============================================
# 静的ファイル関連
# ===============================================
@app.route("/css/<path:filename>")
def serve_css(filename):
    return send_from_directory(CSS_DIR, filename)

@app.route("/js/<path:filename>")
def serve_js(filename):
    return send_from_directory(JS_DIR, filename)

@app.route("/static/<path:filename>")
def serve_static(filename):
    return send_from_directory(STATIC_DIR, filename)

# ===============================================
# ヘルパー
# ===============================================
def _save_command(cmd):
    name = cmd.get("name", "未設定")
    triggers = cmd.get("triggers", [])
    conditions = cmd.get("conditions", [])
    actions = cmd.get("actions", [])
    loop_count = cmd.get("loop_count", "once")
    advanced_conditions = cmd.get("advanced_conditions", [])
    linked_data = cmd.get("linked_data", {})

    register_command(
        name=name,
        action_type="json",
        content=json.dumps({
            "triggers": triggers,
            "conditions": conditions,
            "actions": actions,
            "advanced_conditions": advanced_conditions,
            "loop_count": loop_count,
            "linked_data": linked_data
        }),
        trigger_type=triggers[0]["type"] if triggers else "manual",
        trigger_value=triggers[0]["value"] if triggers else "",
        repeat_interval=loop_count,
        condition_expr=None,
        break_expr=None,
        loop_count=loop_count,
        calendar_event=linked_data.get("calendar_event"),
        memo_text=linked_data.get("memo_text"),
        tag=",".join(linked_data.get("tag", [])) if isinstance(linked_data.get("tag", []), list) else linked_data.get("tag", "")
    )

# ===============================================
# 起動
# ===============================================
if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
