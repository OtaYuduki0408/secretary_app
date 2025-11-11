import sqlite3
import json
import os

DB_PATH = "commands.db"

# -------------------------------
# DB初期化
# -------------------------------
def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
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
        advanced_conditions TEXT
    )
    """)
    conn.commit()
    conn.close()


# -------------------------------
# 命令登録
# -------------------------------
def register_command(
    name,
    action_type="speak",
    content="",
    trigger_type="manual",
    trigger_value="",
    repeat_interval="once",
    condition_expr=None,
    break_expr=None,
    loop_count="once",
    advanced_conditions=None
):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    # advanced_conditions を JSON 文字列として保存
    adv_cond_json = json.dumps(advanced_conditions, ensure_ascii=False) if advanced_conditions else None
    c.execute("""
    INSERT INTO commands (
        name, action_type, content, trigger_type, trigger_value,
        repeat_interval, condition_expr, break_expr, loop_count, advanced_conditions
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        name, action_type, content, trigger_type, trigger_value,
        repeat_interval, condition_expr, break_expr, loop_count, adv_cond_json
    ))
    conn.commit()
    conn.close()


# -------------------------------
# 全命令取得
# -------------------------------
def get_all_commands():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT * FROM commands ORDER BY id ASC")
    rows = c.fetchall()
    conn.close()

    result = []
    for row in rows:
        result.append({
            "id": row[0],
            "name": row[1],
            "action_type": row[2],
            "content": row[3],
            "trigger_type": row[4],
            "trigger_value": row[5],
            "repeat_interval": row[6],
            "condition_expr": row[7],
            "break_expr": row[8],
            "loop_count": row[9],
            "advanced_conditions": json.loads(row[10]) if row[10] else []
        })
    return result


# -------------------------------
# 命令削除
# -------------------------------
def delete_command(command_id):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("DELETE FROM commands WHERE id=?", (command_id,))
    conn.commit()
    conn.close()
