from models import db, CustomOrder, CustomTrigger, CustomCondition, CustomAction
from command_manager import init_db
from datetime import datetime

# 初回のみDB作成
init_db()

print("=== カスタム命令 登録ツール ===")

# --------------------------
# 命令の基本情報
# --------------------------
name = input("命令名を入力してください: ")  # 例：「朝のルーチン」
repeat_enabled = input("繰り返し実行しますか？(y/n): ").lower() == "y"
repeat_interval = None
repeat_count = 1

if repeat_enabled:
    repeat_interval = input("繰り返し間隔を入力 (once/daily/weekly/hourly): ")
    repeat_count = int(input("繰り返し回数 (例: 1, 5, 無限なら9999): "))

# --------------------------
# 命令オブジェクト作成
# --------------------------
order = CustomOrder(
    name=name,
    repeat_enabled=repeat_enabled,
    repeat_interval=repeat_interval,
    repeat_count=repeat_count,
    created_at=datetime.now()
)

# --------------------------
# 複数トリガー登録
# --------------------------
print("\n=== トリガー登録 ===")
while True:
    trigger_type = input("トリガータイプを入力 (voice/time/gps): ")
    trigger_value = input("トリガー値を入力（例: 'おはよう', '07:00', '35.6895,139.6917,500'）: ")

    order.triggers.append(CustomTrigger(
        trigger_type=trigger_type,
        trigger_value=trigger_value
    ))

    more = input("別のトリガーを追加しますか？(y/n): ").lower()
    if more != "y":
        break

# --------------------------
# 条件登録
# --------------------------
print("\n=== 条件設定 ===")
add_conditions = input("条件を追加しますか？(y/n): ").lower()
if add_conditions == "y":
    while True:
        condition_type = input("条件タイプ（例: weather / battery / location）: ")
        condition_value = input("条件値（例: 晴れ / >50 / 東京）: ")

        order.conditions.append(CustomCondition(
            condition_type=condition_type,
            condition_value=condition_value
        ))

        more = input("別の条件を追加しますか？(y/n): ").lower()
        if more != "y":
            break

# --------------------------
# アクション登録
# --------------------------
print("\n=== アクション登録 ===")
index = 1
while True:
    action_type = input(f"[{index}] アクションタイプを入力 (speak/notify/open_app など): ")
    action_content = input("アクション内容を入力: ")

    order.actions.append(CustomAction(
        action_type=action_type,
        action_content=action_content,
        order_index=index
    ))

    index += 1
    more = input("別のアクションを追加しますか？(y/n): ").lower()
    if more != "y":
        break

# --------------------------
# 登録処理
# --------------------------
db.session.add(order)
db.session.commit()

print("\n✅ 命令が登録されました！")
print(f"命令名: {order.name}")
print(f"トリガー数: {len(order.triggers)}")
print(f"条件数: {len(order.conditions)}")
print(f"アクション数: {len(order.actions)}")
print("======================================")
