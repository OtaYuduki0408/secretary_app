# services/finance_service.py
from supabase_client import supabase
from datetime import datetime

def get_finance_summary():
    """
    Supabaseから収入・支出データを取得して月ごとに集計する
    """
    finance_data = supabase.table("finance").select("*").execute().data

    incomes = [d for d in finance_data if d.get("type") == "income"]
    expenses = [d for d in finance_data if d.get("type") == "expense"]

    def aggregate_monthly(data):
        monthly = {}
        for item in data:
            date = datetime.fromisoformat(item["date"])
            month_label = date.strftime("%Y-%m")
            monthly[month_label] = monthly.get(month_label, 0) + item["amount"]
        return [{"month": k, "amount": v} for k, v in sorted(monthly.items())]

    income_stats = aggregate_monthly(incomes)
    expense_stats = aggregate_monthly(expenses)

    return income_stats, expense_stats
