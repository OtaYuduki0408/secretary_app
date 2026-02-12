# services/expense_service.py
from supabase_client import supabase
from datetime import datetime
from postgrest.exceptions import APIError

TABLE_NAME = "finance"

# --------------------------------------------------------------------------
# すべてのレコード取得 (★関数名を get_all_expenses に修正)
# --------------------------------------------------------------------------
def get_all_expenses(user_id: str | None = None):
    """
    Supabaseから全収支データを取得する。
    """
    try:
        q = supabase.table(TABLE_NAME).select("*").order("date", desc=True)
        if user_id:
            q = q.eq("user_id", user_id)
        response = q.execute()
        return response.data or []
    except (APIError, Exception) as e:
        print(f"[ERROR] get_all_expenses: {e}")
        return []

# --------------------------------------------------------------------------
# データの登録
# --------------------------------------------------------------------------
def add_finance_record(record: dict, user_id: str):
    """
    新しい収支レコードを登録する。
    """
    try:
        # 日時がない場合は自動で現在時刻(分)を設定
        if "date" not in record or not record["date"]:
            record["date"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        record["user_id"] = user_id

        response = supabase.table(TABLE_NAME).insert(record).execute()
        return {"message": "Finance record added", "data": response.data}
    except (APIError, Exception) as e:
        print(f"[ERROR] add_finance_record: {e}")
        return {"error": str(e)}


def update_finance_record(record_id: str, record: dict, user_id: str):
    """
    指定したIDの収支データを更新する。
    """
    try:
        payload = {}
        for key in ("date", "type", "category", "amount", "memo"):
            if key in record:
                payload[key] = record.get(key)

        if not payload:
            return {"error": "更新データがありません"}

        response = (
            supabase.table(TABLE_NAME)
            .update(payload)
            .eq("id", record_id)
            .eq("user_id", user_id)
            .execute()
        )
        return {"message": "Finance record updated", "data": response.data}
    except (APIError, Exception) as e:
        print(f"[ERROR] update_finance_record: {e}")
        return {"error": str(e)}

# --------------------------------------------------------------------------
# レコード削除
# --------------------------------------------------------------------------
def delete_finance_record(record_id: str, user_id: str):
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


def delete_finance_records(record_ids: list[str], user_id: str):
    """
    指定したIDリストの収支データを一括で削除する。
    """
    if not record_ids:
        return {"message": "No records to delete", "data": []}
    try:
        response = (
            supabase.table(TABLE_NAME)
            .delete()
            .in_("id", record_ids)
            .eq("user_id", user_id)
            .execute()
        )
        return {"message": f"{len(response.data)} finance records deleted", "data": response.data}
    except (APIError, Exception) as e:
        print(f"[ERROR] delete_finance_records: {e}")
        return {"error": str(e)}

# --------------------------------------------------------------------------
# 統計情報（グラフなどに利用）
# --------------------------------------------------------------------------
def get_finance_summary():
    """
    月ごとの収入・支出を集計して返す。
    """
    # ★ 修正した関数名を使う
    finance_data = get_all_expenses()

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

def get_unique_categories(user_id: str | None = None):
    """
    Supabaseからユニークなカテゴリのリストを取得する。
    """
    try:
        q = supabase.table(TABLE_NAME).select("category").eq("user_id", user_id)
        response = q.execute()
        categories = sorted(list(set([item["category"] for item in response.data if "category" in item])))
        return categories
    except (APIError, Exception) as e:
        print(f"[ERROR] get_unique_categories: {e}")
        return []
