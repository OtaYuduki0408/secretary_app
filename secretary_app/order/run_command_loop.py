import sqlite3
import time
import datetime
from command_manager import get_all_commands

# =====================================================
# 条件判定（破壊条件など）を評価する関数
# =====================================================
def evaluate_condition(expr: str) -> bool:
    """
    破壊条件・実行条件などを評価する関数（暫定）
    実際にはAIや外部データ連携などに置き換え可能。
    """
    if not expr:
        return False

    # 🔧 デモ用ロジック：指定文字を含んだらTrue
    if "停止" in expr or "中止" in expr:
        return True
    return False


# =====================================================
# アクションを実行（擬似実行）
# =====================================================
def execute_action(cmd):
    """
    コマンドの内容を擬似的に実行。
    実際にはIoT制御や音声出力APIに置き換え可能。
    """
    print(f"⚙️ 実行中: {cmd['name']} ({cmd['action_type']}) -> {cmd['content']}")


# =====================================================
# ループ・破壊条件を考慮して命令を実行
# =====================================================
def run_command(cmd):
    loop_type = cmd.get("loop_type", "once")
    loop_count = cmd.get("loop_count", 1)
    break_condition = cmd.get("break_condition")

    print(f"\n▶️ 命令開始: {cmd['name']}")
    print(f"   ├ ループタイプ: {loop_type}")
    print(f"   ├ ループ回数: {loop_count}")
    print(f"   └ 破壊条件: {break_condition or 'なし'}")

    count = 0

    while True:
        # 実行
        execute_action(cmd)
        count += 1

        # 破壊条件チェック
        if break_condition and evaluate_condition(break_condition):
            print(f"💥 破壊条件 '{break_condition}' を検知。ループ終了。")
            break

        # ループタイプに応じた制御
        if loop_type == "once":
            break
        elif loop_type == "count":
            if count >= loop_count:
                print(f"🔁 指定回数({loop_count})を達成。ループ終了。")
                break
        elif loop_type == "infinite":
            time.sleep(1)
            continue
        elif loop_type == "until_condition":
            if evaluate_condition(break_condition):
                print(f"🛑 条件を満たしたため停止。")
                break
        else:
            print(f"❓ 未知のループタイプ '{loop_type}'。強制停止。")
            break

        # 次のループまで待機
        time.sleep(1)

    print(f"✅ 命令終了: {cmd['name']}\n")


# =====================================================
# 全命令を実行
# =====================================================
def run_all_commands():
    commands = get_all_commands()
    if not commands:
        print("⚠️ 実行可能な命令がありません。")
        return

    print(f"📋 {len(commands)}件の命令を読み込みました。")
    for cmd in commands:
        run_command(cmd)


# =====================================================
# メイン処理
# =====================================================
if __name__ == "__main__":
    print("🚀 命令実行エンジンを起動中...")
    run_all_commands()
