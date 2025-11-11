from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

# --------------------------
# 命令（全体のまとめ）
# --------------------------
class CustomOrder(db.Model):
    __tablename__ = 'custom_orders'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    repeat_enabled = db.Column(db.Boolean, default=False)
    repeat_interval = db.Column(db.String(50))  # "once", "daily", "weekly"
    repeat_count = db.Column(db.Integer, default=1)
    created_at = db.Column(db.DateTime, default=datetime.now)

    triggers = db.relationship("CustomTrigger", backref="order", cascade="all, delete-orphan")
    conditions = db.relationship("CustomCondition", backref="order", cascade="all, delete-orphan")
    actions = db.relationship("CustomAction", backref="order", cascade="all, delete-orphan")

# --------------------------
# トリガー
# --------------------------
class CustomTrigger(db.Model):
    __tablename__ = 'custom_triggers'

    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey('custom_orders.id'))
    trigger_type = db.Column(db.String(50))  # voice / time / gps
    trigger_value = db.Column(db.Text)       # 例："おはよう" / "07:00" / "35.6895,139.6917,500"

# --------------------------
# 条件
# --------------------------
class CustomCondition(db.Model):
    __tablename__ = 'custom_conditions'

    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey('custom_orders.id'))
    condition_type = db.Column(db.String(50))
    condition_value = db.Column(db.Text)

# --------------------------
# アクション
# --------------------------
class CustomAction(db.Model):
    __tablename__ = 'custom_actions'

    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey('custom_orders.id'))
    action_type = db.Column(db.String(50))   # speak, open_app など
    action_content = db.Column(db.Text)      # 実際の命令内容
    order_index = db.Column(db.Integer)
