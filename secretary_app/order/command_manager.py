# command_manager.py
import sqlite3
import json
from typing import List, Dict

DB_PATH = "commands.db"

# ---------------------------
# DB初期化
# ---------------------------
def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    # commands テーブル作成
    c.execute("""
    CREATE TABLE IF NOT EXISTS commands (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        action_type TEXT,
        content TEXT,
        trigger_type TEXT,
        trigger_value TEXT,
        repeat_interval TEXT,
        condition_expr TEXT,
        break_expr TEXT,
        loop_count TEXT,
        calendar_event TEXT,
        memo_text TEXT,
        tag TEXT
    )
    """)
    conn.commit()
    conn.close()

# ---------------------------
# コマンド登録
# ---------------------------
def register_command(**kwargs):
    """
    任意のフィールドを指定してコマンド登録
    """
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    columns = ", ".join(kwargs.keys())
    placeholders = ", ".join(["?"] * len(kwargs))
    values = list(kwargs.values())
    c.execute(f"INSERT INTO commands ({columns}) VALUES ({placeholders})", values)
    conn.commit()
    conn.close()

# ---------------------------
# コマンド更新
# ---------------------------
def update_command(command_id: int, cmd_data: Dict):
    """
    cmd_data を JSON に変換して content に上書き
    """
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    content_json = json.dumps(cmd_data)
    c.execute("UPDATE commands SET content=?, action_type='json' WHERE id=?", (content_json, command_id))
    conn.commit()
    conn.close()

# ---------------------------
# コマンド削除
# ---------------------------
def delete_command(command_id: int):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("DELETE FROM commands WHERE id=?", (command_id,))
    conn.commit()
    conn.close()

# ---------------------------
# 全コマンド取得
# ---------------------------
def get_all_commands() -> List[Dict]:
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT * FROM commands ORDER BY id")
    rows = c.fetchall()
    conn.close()

    commands = []
    for r in rows:
        content_json = {}
        try:
            if r[2] == "json":
                content_json = json.loads(r[3])
        except Exception as e:
            print(f"JSON parse error: {e}")

        commands.append({
            "id": r[0],
            "name": r[1],
            "action_type": r[2],
            "content": r[3],
            "triggers": content_json.get("triggers", []),
            "conditions": content_json.get("conditions", []),
            "actions": content_json.get("actions", []),
            "loop_count": content_json.get("loop_count", "once"),
            "linked_data": content_json.get("linked_data", {}),
            "trigger_type": r[4],
            "trigger_value": r[5],
            "calendar_event": r[10],
            "memo_text": r[11],
            "tag": r[12]
        })
    return commands

# ---------------------------
# DB初期化を実行
# ---------------------------
if __name__ == "__main__":
    init_db()
    print("DB初期化完了")
