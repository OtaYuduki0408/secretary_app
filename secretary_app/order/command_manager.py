import sqlite3
import datetime

def init_db():
    conn = sqlite3.connect("commands.db")
    cur = conn.cursor()

    # --- commands テーブル ---
    cur.execute("""
    CREATE TABLE IF NOT EXISTS commands (
        command_id INTEGER PRIMARY KEY AUTOINCREMENT,
        command_name TEXT NOT NULL,
        action_type TEXT NOT NULL,
        action_content TEXT,
        loop_count TEXT DEFAULT 'once',  -- 🌀 ループ回数を追加
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )""")

    # --- triggers テーブル ---
    cur.execute("""
    CREATE TABLE IF NOT EXISTS triggers (
        trigger_id INTEGER PRIMARY KEY AUTOINCREMENT,
        command_id INTEGER NOT NULL,
        trigger_type TEXT NOT NULL,
        trigger_value TEXT,
        repeat_interval TEXT,
        FOREIGN KEY (command_id) REFERENCES commands (command_id) ON DELETE CASCADE
    )""")

    # --- 条件テーブル ---
    cur.execute("""
    CREATE TABLE IF NOT EXISTS conditions (
        condition_id INTEGER PRIMARY KEY AUTOINCREMENT,
        command_id INTEGER NOT NULL,
        condition_expression TEXT,
        FOREIGN KEY (command_id) REFERENCES commands (command_id) ON DELETE CASCADE
    )""")

    # --- 破壊条件テーブル ---
    cur.execute("""
    CREATE TABLE IF NOT EXISTS break_conditions (
        break_id INTEGER PRIMARY KEY AUTOINCREMENT,
        command_id INTEGER NOT NULL,
        break_expression TEXT,
        FOREIGN KEY (command_id) REFERENCES commands (command_id) ON DELETE CASCADE
    )""")

    conn.commit()
    conn.close()

def register_command(name, action_type, content, trigger_type, trigger_value,
                     repeat_interval="once", condition_expr=None,
                     break_expr=None, loop_count="once"):
    conn = sqlite3.connect("commands.db")
    cur = conn.cursor()

    # --- commands 登録 ---
    cur.execute(
        "INSERT INTO commands (command_name, action_type, action_content, loop_count) VALUES (?, ?, ?, ?)",
        (name, action_type, content, loop_count)
    )
    command_id = cur.lastrowid

    # --- triggers 登録 ---
    cur.execute(
        "INSERT INTO triggers (command_id, trigger_type, trigger_value, repeat_interval) VALUES (?, ?, ?, ?)",
        (command_id, trigger_type, trigger_value, repeat_interval)
    )

    # --- 条件登録 ---
    if condition_expr:
        cur.execute(
            "INSERT INTO conditions (command_id, condition_expression) VALUES (?, ?)",
            (command_id, condition_expr)
        )

    # --- 破壊条件登録 ---
    if break_expr:
        cur.execute(
            "INSERT INTO break_conditions (command_id, break_expression) VALUES (?, ?)",
            (command_id, break_expr)
        )

    conn.commit()
    conn.close()
    print(f"✅ 命令 '{name}' を登録しました(ID: {command_id}, loop={loop_count})")

def get_all_commands():
    conn = sqlite3.connect("commands.db")
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute("SELECT * FROM commands ORDER BY created_at DESC")
    commands = []

    for row in cur.fetchall():
        command_id = row["command_id"]

        cur.execute("SELECT * FROM triggers WHERE command_id=?", (command_id,))
        triggers = [dict(t) for t in cur.fetchall()]

        cur.execute("SELECT * FROM conditions WHERE command_id=?", (command_id,))
        conditions = [dict(c) for c in cur.fetchall()]

        cur.execute("SELECT * FROM break_conditions WHERE command_id=?", (command_id,))
        breaks = [dict(b) for b in cur.fetchall()]

        commands.append({
            "id": command_id,
            "name": row["command_name"],
            "action_type": row["action_type"],
            "content": row["action_content"],
            "loop_count": row["loop_count"],
            "created_at": row["created_at"],
            "triggers": triggers,
            "conditions": conditions,
            "break_conditions": breaks
        })
    conn.close()
    return commands

def delete_command(command_id):
    conn = sqlite3.connect("commands.db")
    cur = conn.cursor()
    cur.execute("DELETE FROM commands WHERE command_id=?", (command_id,))
    conn.commit()
    conn.close()
    print(f"🗑 命令 ID={command_id} を削除しました")
