# services/finance_service.py
from supabase_client import supabase # 外部で定義されたsupabaseクライアントをインポート
from datetime import datetime
from postgrest.exceptions import APIError 

TABLE_FINANCE = "finance"
TABLE_FINANCE_GOALS = "finance_goals"
_LAST_FINANCE_ERROR = None


def _is_dns_error(error: Exception) -> bool:
    message = str(error)
    return "getaddrinfo failed" in message or "Errno 11001" in message


def _format_finance_error(error: Exception) -> str:
    if _is_dns_error(error):
        return "DNSエラーのため収支データに接続できませんでした。ネットワーク/DNS設定を確認してください。"
    return f"収支データの取得に失敗しました: {str(error)}"


def get_last_finance_error() -> str | None:
    return _LAST_FINANCE_ERROR

def get_all_finance_records(user_id: str | None = None):
    """
    Supabaseから全レコードを取得する。
    DB接続失敗時は空のリストを返すことで、Flask/Jinja2でのTypeErrorを防ぐ。
    """
    global _LAST_FINANCE_ERROR
    try:
        # DBから全データを取得
        q = supabase.table(TABLE_FINANCE).select("*").order("date", desc=True)
        if user_id:
            q = q.eq("user_id", user_id)
        all_records = q.execute().data
        _LAST_FINANCE_ERROR = None
        return all_records
    except (APIError, Exception) as e:
        # 接続エラーやその他のエラーを捕捉
        print(f"ERROR: Failed to fetch all finance records from DB: {e}")
        _LAST_FINANCE_ERROR = _format_finance_error(e)
        # 安全策として空のリストを返す
        return []

def get_finance_summary(user_id: str | None = None):
    """
    Supabaseから取得したデータを使用して月ごとの統計を集計する。
    """
    finance_data = get_all_finance_records(user_id)
    
    if not finance_data:
        return [], []
        
    incomes = [d for d in finance_data if d.get("type") == "income"]
    expenses = [d for d in finance_data if d.get("type") == "expense"]

    def aggregate_monthly(data):
        monthly = {}
        for item in data:
            try:
                date = datetime.fromisoformat(item["date"])
            except (TypeError, ValueError):
                continue 
                
            month_label = date.strftime("%Y-%m")
            # amountが存在しない可能性に備えて.get(..., 0)を使用
            monthly[month_label] = monthly.get(month_label, 0) + item.get("amount", 0)
            
        # 月（YYYY-MM）順にソートし、グラフ用の形式に変換（月のみ表示）
        return [{"month": k.split('-')[1], "amount": v} for k, v in sorted(monthly.items())]

    income_stats = aggregate_monthly(incomes)
    expense_stats = aggregate_monthly(expenses)

    return income_stats, expense_stats

def get_current_balance(user_id: str | None = None):
    """
    現在の所持金を計算して返す。
    """
    finance_data = get_all_finance_records(user_id)
    
    if not finance_data:
        return 0.0
    
    total_income = sum(item.get("amount", 0) for item in finance_data if item.get("type") == "income")
    total_expense = sum(item.get("amount", 0) for item in finance_data if item.get("type") == "expense")
    
    return total_income - total_expense

def get_monthly_expense(user_id: str | None = None):
    """
    今月の合計支出額を計算して返す。
    """
    finance_data = get_all_finance_records(user_id)
    
    if not finance_data:
        return 0.0
    
    current_month = datetime.now().strftime("%Y-%m")
    monthly_expense = sum(
        item.get("amount", 0) for item in finance_data 
        if item.get("type") == "expense" and datetime.fromisoformat(item["date"]).strftime("%Y-%m") == current_month
    )
    
    return monthly_expense

def get_daily_expense(user_id: str | None = None):
    """
    今日の合計支出額を計算して返す。
    """
    finance_data = get_all_finance_records(user_id)
    
    if not finance_data:
        return 0.0
    
    today = datetime.now().strftime("%Y-%m-%d")
    daily_expense = sum(
        item.get("amount", 0) for item in finance_data 
        if item.get("type") == "expense" and datetime.fromisoformat(item["date"]).strftime("%Y-%m-%d") == today
    )
    
    return daily_expense

def get_detailed_finance_summary(user_id: str | None = None):
    """
    メイン画面向けの詳細な収支サマリーを取得する。
    1. 総所持金
    2. 今月の支出
    3. 今月の収支
    4. 今月の収入
    5. 今日の支出
    6. 今日の支出 (必需品抜き)
    7. 月別支出グラフ用データ
    """
    finance_data = get_all_finance_records(user_id)
    if not finance_data:
        return {
            "total_balance": 0, "monthly_expense": 0, "monthly_balance": 0,
            "monthly_income": 0, "daily_expense": 0, "daily_expense_no_essentials": 0,
            "monthly_chart_data": []
        }

    now = datetime.now()
    current_month = now.strftime("%Y-%m")
    today = now.strftime("%Y-%m-%d")

    total_income = 0
    total_expense = 0
    m_income = 0
    m_expense = 0
    d_expense = 0
    d_expense_no_essentials = 0

    # 必需品とみなすカテゴリのキーワード
    ESSENTIAL_KEYWORDS = ["食", "住", "家賃", "光熱", "水道", "電気", "ガス", "通信", "携帯", "ネット", "交通", "保険", "医療", "固定"]

    monthly_map = {}

    for item in finance_data:
        amount = item.get("amount", 0)
        t = item.get("type")
        date_str = item.get("date", "")
        category = item.get("category", "")
        
        try:
            dt = datetime.fromisoformat(date_str)
            ym = dt.strftime("%Y-%m")
            y_md = dt.strftime("%Y-%m-%d")
        except:
            continue

        # 総計
        if t == "income":
            total_income += amount
        else:
            total_expense += amount
            # グラフ用集計
            monthly_map[ym] = monthly_map.get(ym, 0) + amount

        # 今月
        if ym == current_month:
            if t == "income":
                m_income += amount
            else:
                m_expense += amount

        # 今日
        if y_md == today and t == "expense":
            d_expense += amount
            # 必需品抜き判定 (簡易的にカテゴリ名で判定)
            is_essential = any(k in category for k in ESSENTIAL_KEYWORDS)
            if not is_essential:
                d_expense_no_essentials += amount

    # グラフ用データの整形 (直近6ヶ月分)
    sorted_months = sorted(monthly_map.keys(), reverse=True)[:6]
    chart_data = [{"month": m.split("-")[1] + "月", "amount": monthly_map[m]} for m in reversed(sorted_months)]

    return {
        "total_balance": total_income - total_expense,
        "monthly_expense": m_expense,
        "monthly_balance": m_income - m_expense,
        "monthly_income": m_income,
        "daily_expense": d_expense,
        "daily_expense_no_essentials": d_expense_no_essentials,
        "monthly_chart_data": chart_data
    }

def get_monthly_goal(user_id: str | None = None, year_month: str | None = None):
    """
    指定したユーザーと年月の目標額レコードを取得する。
    """
    if not user_id:
        return None
    target_month = year_month or datetime.now().strftime("%Y-%m")
    try:
        resp = (
            supabase.table(TABLE_FINANCE_GOALS)
            .select("*")
            .eq("user_id", user_id)
            .eq("year_month", target_month)
            .limit(1)
            .execute()
        )
        data = resp.data or []
        return data[0] if data else None
    except (APIError, Exception) as e:
        print(f"ERROR: Failed to fetch finance goal: {e}")
        return None


def upsert_monthly_goal(user_id: str, goal_amount: float, year_month: str | None = None):
    """
    月次目標額を保存（存在すれば更新）する。
    """
    if not user_id:
        return {"error": "user_id is required"}
    target_month = year_month or datetime.now().strftime("%Y-%m")
    try:
        payload = {
            "user_id": user_id,
            "year_month": target_month,
            "goal_amount": goal_amount,
            "updated_at": datetime.utcnow().isoformat()
        }
        resp = (
            supabase.table(TABLE_FINANCE_GOALS)
            .upsert(payload, on_conflict="user_id,year_month")
            .execute()
        )
        data = resp.data or [payload]
        record = data[0]
        return {
            "goal_amount": record.get("goal_amount"),
            "year_month": record.get("year_month", target_month),
        }
    except (APIError, Exception) as e:
        print(f"ERROR: Failed to upsert finance goal: {e}")
        return {"error": str(e)}

# --------------------------------------------------------------------------
# 補足: Flaskのビュー関数 (app.py) のコード例
# --------------------------------------------------------------------------
# import Flask, render_template, get_finance_summary, get_all_finance_records
#
# @app.route("/finance")
# def finance():
#     # 統計データと全レコードを取得
#     income_stats, expense_stats = get_finance_summary()
#     all_records = get_all_finance_records()
#
#     # テンプレートに渡す
#     return render_template(
#         "finance.html",
#         income_stats=income_stats,
#         expense_stats=expense_stats,
#         all_records=all_records # ★ これが必須
#     )
