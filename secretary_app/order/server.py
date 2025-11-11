from flask import Flask, request, jsonify, send_from_directory
from command_manager import init_db, register_command, get_all_commands, delete_command

app = Flask(__name__)
init_db()  # DB初期化

# -------------------------------
# HTML 配信
# -------------------------------
@app.route("/")
def index():
    return send_from_directory("static/html", "index.html")

@app.route("/edit_command.html")
def edit_command():
    return send_from_directory("static/html", "edit_command.html")

# -------------------------------
# 命令一覧取得
# -------------------------------
@app.route("/api/custom_orders", methods=["GET"])
def api_get_orders():
    return jsonify(get_all_commands())

# -------------------------------
# 命令削除
# -------------------------------
@app.route("/api/custom_orders/<int:command_id>", methods=["DELETE"])
def api_delete_order(command_id):
    delete_command(command_id)
    return jsonify({"message": f"命令(ID={command_id})を削除しました"})

# -------------------------------
# 命令登録 (単一 or 複数) + ループ/破壊条件対応
# -------------------------------
@app.route("/api/custom_orders", methods=["POST"])
def api_register_orders():
    data = request.json

    if isinstance(data, dict):
        data = [data]

    for cmd in data:
        name = cmd.get("name")
        triggers = cmd.get("triggers", [])
        conditions = cmd.get("conditions", [])
        break_conditions = cmd.get("break_conditions", [])
        actions = cmd.get("actions", [])
        loop_count = cmd.get("loop_count", "once")  # ループ回数

        if actions:
            for action in actions:
                if triggers:
                    for trigger in triggers:
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
                    for condition in conditions or [None]:
                        for break_cond in break_conditions or [None]:
                            register_command(
                                name=name,
                                action_type=action.get("type", "speak"),
                                content=action.get("value", ""),
                                trigger_type="manual",
                                trigger_value="",
                                repeat_interval="once",
                                condition_expr=condition.get("expr") if condition else None,
                                break_expr=break_cond.get("expr") if break_cond else None,
                                loop_count=loop_count
                            )
        else:
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

    return jsonify({"message": "命令を保存しました"})

# -------------------------------
# static 配信
# -------------------------------
@app.route("/static/<path:path>")
def send_static(path):
    return send_from_directory("static", path)

# -------------------------------
# 起動
# -------------------------------
if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
