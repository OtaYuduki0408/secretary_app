# services/expense_service.py
from supabase_client import supabase
from datetime import datetime
from postgrest.exceptions import APIError

TABLE_NAME = "finance"

# --------------------------------------------------------------------------
# すべてのレコード取得 (★関数名を get_all_expenses に修正)
# --------------------------------------------------------------------------
def get_all_expenses(user_id: str):
    """
    Supabaseから全収支データを取得する。
    """
    try:
        response = (
            supabase.table(TABLE_NAME)
            .select("*")
            .eq("user_id", user_id)
            .order("date", desc=True)
            .execute()
        )
        return response.data or []
    except (APIError, Exception) as e:
        print(f"[ERROR] get_all_expenses: {e}")
        return []

# --------------------------------------------------------------------------
# データの登録
# --------------------------------------------------------------------------
def add_finance_record(user_id: str, record: dict):
    """
    新しい収支レコードを登録する。
    """
    try:
        # 日付がない場合は自動で今日の日付を設定
        if "date" not in record or not record["date"]:
            record["date"] = datetime.now().strftime("%Y-%m-%d")

        # 紐付け
        record["user_id"] = user_id

        response = supabase.table(TABLE_NAME).insert(record).execute()
        return {"message": "Finance record added", "data": response.data}
    except (APIError, Exception) as e:
        print(f"[ERROR] add_finance_record: {e}")
        return {"error": str(e)}

# --------------------------------------------------------------------------
# レコード削除
# --------------------------------------------------------------------------
def delete_finance_record(user_id: str, record_id: str):
    """
    指定したIDの収支データを削除する。
    """
    try:
        response = (
            supabase.table(TABLE_NAME)
            .delete()
            .eq("id", record_id)
            .eq("user_id", user_id)
            .execute()
        )
        return {"message": "Finance record deleted", "data": response.data}
    except (APIError, Exception) as e:
        print(f"[ERROR] delete_finance_record: {e}")
        return {"error": str(e)}

# --------------------------------------------------------------------------
# 統計情報（グラフなどに利用）
# --------------------------------------------------------------------------
def get_finance_summary(user_id: str):
    """
    月ごとの収入・支出を集計して返す。
    """
    # ★ 修正した関数名を使う
    finance_data = get_all_expenses(user_id)

    if not finance_data:
        return [], []

    incomes = [d for d in finance_data if d.get("type") == "income"]
    expenses = [d for d in finance_data if d.get("type") == "expense"]

    def aggregate_monthly(data):
        monthly = {}
        for item in data:
            try:
                # date = datetime.fromisoformat(item["date"]) # YYYY-MM-DD形式の場合は不要
                date_str = item["date"]
            except (TypeError, ValueError, KeyError):
                continue

            # YYYY-MM形式を抽出
            month_label = date_str[:7]
            monthly[month_label] = monthly.get(month_label, 0) + item.get("amount", 0)

        # YYYY-MM順にソートし、グラフ用形式に変換
        return [{"month": k.split('-')[1], "amount": v} for k, v in sorted(monthly.items())]

    income_stats = aggregate_monthly(incomes)
    expense_stats = aggregate_monthly(expenses)

    return income_stats, expense_stats
