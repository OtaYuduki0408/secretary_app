import sqlite3

DB_PATH = "custom_orders.db"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS custom_orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            triggerType TEXT,
            trigger TEXT,
            triggerTime TEXT,
            commandName TEXT,
            condition TEXT,
            repeat TEXT
        )
    """)
    conn.commit()
    conn.close()

def add_order(data):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        INSERT INTO custom_orders (triggerType, trigger, triggerTime, commandName, condition, repeat)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (
        data.get("triggerType"),
        data.get("trigger"),
        data.get("triggerTime"),
        data.get("commandName"),
        data.get("condition"),
        data.get("repeat")
    ))
    conn.commit()
    conn.close()

def get_orders():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT * FROM custom_orders")
    result = [
        dict(id=row[0], triggerType=row[1], trigger=row[2], triggerTime=row[3],
             commandName=row[4], condition=row[5], repeat=row[6])
        for row in c.fetchall()
    ]
    conn.close()
    return result
