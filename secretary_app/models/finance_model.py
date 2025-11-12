from datetime import datetime
from typing import Any, Dict, List, Optional

from supabase_client import supabase


class FinanceModel:
    """
    Finance data access model for CRUD/search operations.
    Designed for external API access from Android, Windows, and Web (JS).
    """

    TABLE = "finance"

    def list_records(
        self,
        user_id: str,
        *,
        limit: int = 100,
        offset: int = 0,
        order: str = "desc",
        type: Optional[str] = None,
        category: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        memo_query: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        try:
            q = supabase.table(self.TABLE).select("*").eq("user_id", user_id)

            if type in ("income", "expense"):
                q = q.eq("type", type)
            if category:
                q = q.eq("category", category)
            if date_from:
                q = q.gte("date", date_from)
            if date_to:
                q = q.lte("date", date_to)
            if memo_query:
                # case-insensitive like search on memo
                q = q.ilike("memo", f"%{memo_query}%")

            # order by date
            q = q.order("date", desc=(order != "asc"))

            if offset:
                q = q.range(offset, offset + max(0, limit) - 1)
            elif limit:
                q = q.limit(limit)

            return q.execute().data or []
        except Exception as e:
            print(f"[FinanceModel] list_records error: {e}")
            return []

    def get_record(self, user_id: str, record_id: str) -> Optional[Dict[str, Any]]:
        try:
            res = (
                supabase.table(self.TABLE)
                .select("*")
                .eq("user_id", user_id)
                .eq("id", record_id)
                .single()
                .execute()
            )
            return res.data
        except Exception as e:
            print(f"[FinanceModel] get_record error: {e}")
            return None

    def create_record(self, user_id: str, record: Dict[str, Any]) -> Dict[str, Any]:
        try:
            data = dict(record)
            data["user_id"] = user_id
            if not data.get("date"):
                data["date"] = datetime.now().strftime("%Y-%m-%d")
            res = supabase.table(self.TABLE).insert(data).execute()
            inserted = res.data[0] if res.data else None
            return {"success": True, "data": inserted}
        except Exception as e:
            print(f"[FinanceModel] create_record error: {e}")
            return {"success": False, "error": str(e)}

    def delete_record(self, user_id: str, record_id: str) -> Dict[str, Any]:
        try:
            res = (
                supabase.table(self.TABLE)
                .delete()
                .eq("user_id", user_id)
                .eq("id", record_id)
                .execute()
            )
            return {"success": True, "data": res.data}
        except Exception as e:
            print(f"[FinanceModel] delete_record error: {e}")
            return {"success": False, "error": str(e)}

