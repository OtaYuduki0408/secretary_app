import re
from datetime import datetime, timedelta
from typing import Any


def safe_int(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        raw = value.strip()
        if not raw or "実行された" in raw:
            return None
        if raw.isdigit():
            return int(raw)
    return None


def _get_sleep_base_date(current_dt: datetime):
    """
    04:00を1日の区切りとして扱う基準日を返す。
    """
    if current_dt.hour < 4:
        return (current_dt - timedelta(days=1)).date()
    return current_dt.date()


def _resolve_relative_date(field_name: str, day_offset: int, current_dt: datetime):
    target = (current_dt + timedelta(days=day_offset)).date()
    if field_name == "year":
        return target.year
    if field_name == "month":
        return target.month
    if field_name == "day":
        return target.day
    return None


def _resolve_sleep_relative_date(field_name: str, day_offset: int, current_dt: datetime):
    base_date = _get_sleep_base_date(current_dt)
    target = base_date + timedelta(days=day_offset)
    if field_name == "year":
        return target.year
    if field_name == "month":
        return target.month
    if field_name == "day":
        return target.day
    return None


def parse_time_param(param_value: Any, current_dt: datetime, field_name: str | None = None):
    """
    「実行された年/月/日/時刻」トークンを実値へ解決する。
    該当しない値はそのまま返す。
    """
    if param_value == "実行された年":
        return current_dt.year
    if param_value == "実行された月":
        return current_dt.month
    if param_value == "実行された日":
        return current_dt.day
    if param_value == "実行された時刻":
        return f"{current_dt.hour:02d}:{current_dt.minute:02d}"

    if not isinstance(param_value, str):
        return param_value

    raw = param_value.strip()
    if not raw:
        return param_value

    # +1 / -1 : 実行日時基準
    rel_match = re.fullmatch(r"([+-]\d+)", raw)
    if rel_match and field_name in ("year", "month", "day"):
        day_offset = int(rel_match.group(1))
        resolved = _resolve_relative_date(field_name, day_offset, current_dt)
        if resolved is not None:
            return resolved

    # sleep+1 / sleep-1 : 04:00区切り基準
    sleep_match = re.fullmatch(r"sleep([+-]\d+)", raw, flags=re.I)
    if sleep_match and field_name in ("year", "month", "day"):
        day_offset = int(sleep_match.group(1))
        resolved = _resolve_sleep_relative_date(field_name, day_offset, current_dt)
        if resolved is not None:
            return resolved

    # 時刻フィールド向けの相対記法（+1, -1 を時間オフセットとして扱う）
    if rel_match and field_name == "time":
        hour_offset = int(rel_match.group(1))
        target_dt = current_dt + timedelta(hours=hour_offset)
        return f"{target_dt.hour:02d}:{target_dt.minute:02d}"

    # sleep+N を時刻フィールドで使った場合は 04:00 固定として解釈
    if sleep_match and field_name == "time":
        return "04:00"

    return param_value


def build_range_from_detail(detail: dict | None, now_jst: datetime, tz) -> tuple[datetime | None, datetime | None]:
    """
    期間指定UIの detail から開始/終了 datetime(JST) を組み立てる。
    失敗時は (None, None) を返す。
    """
    detail = detail or {}

    start_year = safe_int(parse_time_param(detail.get("start_year"), now_jst, "year")) or now_jst.year
    start_month = safe_int(parse_time_param(detail.get("start_month"), now_jst, "month")) or now_jst.month
    start_day = safe_int(parse_time_param(detail.get("start_day"), now_jst, "day")) or now_jst.day
    end_year = safe_int(parse_time_param(detail.get("end_year"), now_jst, "year")) or now_jst.year
    end_month = safe_int(parse_time_param(detail.get("end_month"), now_jst, "month")) or now_jst.month
    end_day = safe_int(parse_time_param(detail.get("end_day"), now_jst, "day")) or now_jst.day

    start_time_raw = parse_time_param(detail.get("start_time", "00:00") or "00:00", now_jst, "time")
    end_time_raw = parse_time_param(detail.get("end_time", "23:59") or "23:59", now_jst, "time")
    start_time_str = str(start_time_raw)
    end_time_str = str(end_time_raw)

    try:
        start_hour, start_minute = map(int, start_time_str.split(":"))
        end_hour, end_minute = map(int, end_time_str.split(":"))
        start_dt = tz.localize(datetime(start_year, start_month, start_day, start_hour, start_minute))
        end_dt = tz.localize(datetime(end_year, end_month, end_day, end_hour, end_minute, 59))
        return start_dt, end_dt
    except (ValueError, TypeError):
        return None, None
