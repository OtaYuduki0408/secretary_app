from flask import Blueprint, request, jsonify
from datetime import datetime
from models import db, CustomOrder, CustomTrigger, CustomCondition, CustomAction

# Blueprint 登録
custom_order_bp = Blueprint("custom_order", __name__)

# ======================================================
# 📌 カスタムオーダー登録API（複数トリガー対応）
# ======================================================
@custom_order_bp.route("/api/custom_orders", methods=["POST"])
def register_order():
    data = request.json

    try:
        # --- 基本情報を登録 ---
        order = CustomOrder(
            name=data.get("name"),
            repeat_enabled=False,
            created_at=datetime.now()
        )
        db.session.add(order)
        db.session.flush()  # order.idを確定させる

        # --- トリガー登録 ---
        triggers = data.get("triggers", [])
        for t in triggers:
            trigger = CustomTrigger(
                order_id=order.id,
                trigger_type=t.get("trigger_type"),
                trigger_value=t.get("trigger_value")
            )
            db.session.add(trigger)

        # --- 条件登録 ---
        conditions = data.get("conditions", [])
        for c in conditions:
            condition = CustomCondition(
                order_id=order.id,
                condition_type=c.get("condition_type"),
                condition_value=c.get("condition_value")
            )
            db.session.add(condition)

        # --- アクション登録 ---
        actions = data.get("actions", [])
        for a in actions:
            action = CustomAction(
                order_id=order.id,
                action_type=a.get("action_type"),
                action_content=a.get("action_content"),
                order_index=a.get("order_index", 1)
            )
            db.session.add(action)

        db.session.commit()
        return jsonify({"message": "✅ カスタムオーダー登録完了", "order_id": order.id}), 201

    except Exception as e:
        db.session.rollback()
        print("登録エラー:", e)
        return jsonify({"error": str(e)}), 500


# ======================================================
# 📋 登録済みオーダー一覧取得
# ======================================================
@custom_order_bp.route("/api/custom_orders", methods=["GET"])
def list_orders():
    orders = CustomOrder.query.all()
    result = []
    for o in orders:
        result.append({
            "id": o.id,
            "name": o.name,
            "created_at": o.created_at.strftime("%Y-%m-%d %H:%M:%S") if o.created_at else None
        })
    return jsonify(result)


# ======================================================
# 🧩 オーダー詳細取得（トリガー・条件・アクション含む）
# ======================================================
@custom_order_bp.route("/api/custom_orders/<int:order_id>", methods=["GET"])
def get_order(order_id):
    order = CustomOrder.query.get(order_id)
    if not order:
        return jsonify({"error": "指定されたIDのオーダーが存在しません"}), 404

    triggers = CustomTrigger.query.filter_by(order_id=order_id).all()
    conditions = CustomCondition.query.filter_by(order_id=order_id).all()
    actions = CustomAction.query.filter_by(order_id=order_id).order_by(CustomAction.order_index).all()

    return jsonify({
        "id": order.id,
        "name": order.name,
        "repeat_enabled": order.repeat_enabled,
        "created_at": order.created_at.strftime("%Y-%m-%d %H:%M:%S"),
        "triggers": [
            {"id": t.id, "type": t.trigger_type, "value": t.trigger_value}
            for t in triggers
        ],
        "conditions": [
            {"id": c.id, "type": c.condition_type, "value": c.condition_value}
            for c in conditions
        ],
        "actions": [
            {"id": a.id, "type": a.action_type, "content": a.action_content, "index": a.order_index}
            for a in actions
        ]
    })


# ======================================================
# 🗑 オーダー削除
# ======================================================
@custom_order_bp.route("/api/custom_orders/<int:order_id>", methods=["DELETE"])
def delete_order(order_id):
    order = CustomOrder.query.get(order_id)
    if not order:
        return jsonify({"error": "指定されたIDのオーダーが存在しません"}), 404

    # 子テーブル（トリガー・条件・アクション）も削除
    CustomTrigger.query.filter_by(order_id=order_id).delete()
    CustomCondition.query.filter_by(order_id=order_id).delete()
    CustomAction.query.filter_by(order_id=order_id).delete()
    db.session.delete(order)
    db.session.commit()

    return jsonify({"message": f"🗑 オーダー（ID: {order_id}）を削除しました"})


# ======================================================
# 🧠 トリガー判定API（将来拡張用）
# ======================================================
@custom_order_bp.route("/api/custom_orders/check_trigger", methods=["POST"])
def check_trigger():
    """
    発話や時間などのイベントから、対応する命令を取得する（将来用）
    """
    data = request.json
    trigger_type = data.get("type")
    trigger_value = data.get("value")

    matched_triggers = CustomTrigger.query.filter_by(trigger_type=trigger_type, trigger_value=trigger_value).all()
    matched_orders = list({t.order_id for t in matched_triggers})

    return jsonify({"matched_order_ids": matched_orders})
