import requests
from datetime import datetime, timedelta
import pytz

JST = pytz.timezone("Asia/Tokyo")

# 気象庁 予報 JSON
JMA_FORECAST_BASE_URL = "https://www.jma.go.jp/bosai/forecast/data/forecast/"

# デフォルト: 群馬（高崎市向け）
DEFAULT_AREA_CODE = "100000"

# 都道府県 -> 気象庁予報区コード（府県予報区）
PREF_TO_AREA_CODE = {
    "北海道": "016000",
    "青森県": "020000",
    "岩手県": "030000",
    "宮城県": "040000",
    "秋田県": "050000",
    "山形県": "060000",
    "福島県": "070000",
    "茨城県": "080000",
    "栃木県": "090000",
    "群馬県": "100000",
    "埼玉県": "110000",
    "千葉県": "120000",
    "東京都": "130000",
    "神奈川県": "140000",
    "新潟県": "150000",
    "富山県": "160000",
    "石川県": "170000",
    "福井県": "180000",
    "山梨県": "190000",
    "長野県": "200000",
    "岐阜県": "210000",
    "静岡県": "220000",
    "愛知県": "230000",
    "三重県": "240000",
    "滋賀県": "250000",
    "京都府": "260000",
    "大阪府": "270000",
    "兵庫県": "280000",
    "奈良県": "290000",
    "和歌山県": "300000",
    "鳥取県": "310000",
    "島根県": "320000",
    "岡山県": "330000",
    "広島県": "340000",
    "山口県": "350000",
    "徳島県": "360000",
    "香川県": "370000",
    "愛媛県": "380000",
    "高知県": "390000",
    "福岡県": "400000",
    "佐賀県": "410000",
    "長崎県": "420000",
    "熊本県": "430000",
    "大分県": "440000",
    "宮崎県": "450000",
    "鹿児島県": "460100",
    "沖縄県": "471000",
}


def resolve_area_code_from_address(address: str, default_code: str = DEFAULT_AREA_CODE) -> str:
    """住所文字列から都道府県を推定して予報区コードを返す。"""
    text = str(address or "").strip()
    if not text:
        return default_code
    for pref, code in PREF_TO_AREA_CODE.items():
        if pref in text:
            return code
    return default_code


def _get_jma_forecast_data(area_code: str):
    url = f"{JMA_FORECAST_BASE_URL}{area_code}.json"
    try:
        response = requests.get(url, timeout=8)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"[WEATHER] fetch error: {e}")
        return None


def _to_jst(dt_text: str):
    try:
        return datetime.fromisoformat(dt_text).astimezone(JST)
    except Exception:
        return None


def _extract_daily_series(forecast_data):
    if not isinstance(forecast_data, list) or not forecast_data:
        return None, [], [], [], [], []

    daily = forecast_data[0]
    ts_list = daily.get("timeSeries", [])
    if not ts_list:
        return None, [], [], [], [], []

    ts0 = ts_list[0]
    area0 = (ts0.get("areas") or [{}])[0]

    area_name = ((area0.get("area") or {}).get("name")) or "地域"
    time_defines = [_to_jst(t) for t in (ts0.get("timeDefines") or [])]
    weathers = area0.get("weathers") or []
    pops = area0.get("pops") or []

    temps_time = []
    temps_values = []
    if len(ts_list) > 2:
        ts2 = ts_list[2]
        temps_time = [_to_jst(t) for t in (ts2.get("timeDefines") or [])]
        temps_values = ((ts2.get("areas") or [{}])[0].get("temps") or [])

    return area_name, time_defines, weathers, pops, temps_time, temps_values


def _extract_temp_by_datetime(temps_time, temps_values):
    result = {}
    for idx, tdt in enumerate(temps_time):
        if tdt is None:
            continue
        if idx >= len(temps_values):
            continue
        val = temps_values[idx]
        if val in (None, ""):
            continue
        try:
            result[tdt] = float(val)
        except Exception:
            continue
    return result


def _normalize_contents(content):
    raw_items = [str(x).strip() for x in (content or []) if str(x).strip()]
    if not raw_items:
        return ["天気", "気温"]

    mapping = {
        "weather": "天気",
        "temp": "気温",
        "pop": "降水確率",
        "天気": "天気",
        "気温": "気温",
        "降水確率": "降水確率",
    }
    normalized = []
    for item in raw_items:
        normalized.append(mapping.get(item, item))
    # 順序保持ユニーク
    return list(dict.fromkeys(normalized))


def _normalize_range(range_type):
    value = str(range_type or "").strip()
    mapping = {
        "today": "今日",
        "tomorrow": "明日",
        "weekly": "週間",
        "今日": "今日",
        "明日": "明日",
        "週間": "週間",
    }
    if value in mapping:
        return mapping[value]
    return "今日"


def _normalize_hours(hours):
    normalized = []
    for h in (hours or []):
        try:
            hv = int(h)
        except Exception:
            continue
        if hv in (0, 3, 6, 9, 12, 15, 18, 21):
            normalized.append(hv)
    # 順序保持ユニーク化
    return list(dict.fromkeys(normalized))


def _valid_pop_hours(hours):
    return [h for h in hours if h in (0, 6, 12, 18)]


def _collect_slots(
    time_defines,
    weathers,
    pops,
    temp_by_dt,
    target_date,
    selected_hours,
    include_pop,
    now_jst,
):
    slots = []
    hours_to_use = selected_hours
    if include_pop and selected_hours:
        hours_to_use = _valid_pop_hours(selected_hours)

    for idx, dt_jst in enumerate(time_defines):
        if dt_jst is None:
            continue
        if dt_jst.date() != target_date.date():
            continue
        if hours_to_use and dt_jst.hour not in hours_to_use:
            continue
        # 注釈仕様: 実行時刻より前の時刻は読み上げない
        if now_jst and dt_jst <= now_jst:
            continue

        weather_text = weathers[idx] if idx < len(weathers) else "不明"
        pop_text = pops[idx] if idx < len(pops) else ""
        temp_val = temp_by_dt.get(dt_jst)
        slots.append(
            {
                "hour": dt_jst.hour,
                "weather": weather_text,
                "pop": pop_text,
                "temp": temp_val,
            }
        )
    return slots


def _build_slots_from_selected_hours(
    forecast_data,
    target_date,
    selected_hours,
    include_pop,
    now_jst,
):
    """APIの粒度不足を補完して、選択時刻ベースのスロットを生成する。"""
    if not selected_hours:
        return []
    if not isinstance(forecast_data, list) or not forecast_data:
        return []

    daily = forecast_data[0]
    ts_list = daily.get("timeSeries", [])
    if not ts_list:
        return []

    ts0 = ts_list[0] if len(ts_list) > 0 else {}
    ts1 = ts_list[1] if len(ts_list) > 1 else {}
    ts2 = ts_list[2] if len(ts_list) > 2 else {}

    # 天気（取得可能な全ポイントから近傍選択）
    weather_points = []
    ts0_times = [_to_jst(t) for t in (ts0.get("timeDefines") or [])]
    ts0_area = (ts0.get("areas") or [{}])[0]
    ts0_weathers = ts0_area.get("weathers") or []
    ts0_codes = ts0_area.get("weatherCodes") or []
    for i, dt_jst in enumerate(ts0_times):
        if dt_jst is None:
            continue
        w = ts0_weathers[i] if i < len(ts0_weathers) else ""
        c = ts0_codes[i] if i < len(ts0_codes) else ""
        weather_text = w or (f"天気コード{c}" if c else "不明")
        weather_points.append((dt_jst, weather_text))

    # 降水確率（概ね 6 時間単位）
    pop_by_hour = {}
    ts1_times = [_to_jst(t) for t in (ts1.get("timeDefines") or [])]
    ts1_area = (ts1.get("areas") or [{}])[0]
    ts1_pops = ts1_area.get("pops") or []
    for i, dt_jst in enumerate(ts1_times):
        if dt_jst is None or dt_jst.date() != target_date.date():
            continue
        if i < len(ts1_pops) and str(ts1_pops[i]).strip():
            pop_by_hour[dt_jst.hour] = str(ts1_pops[i]).strip()

    # 気温（地点によって 0/9 時など）
    temp_by_hour = {}
    ts2_times = [_to_jst(t) for t in (ts2.get("timeDefines") or [])]
    ts2_area = (ts2.get("areas") or [{}])[0]
    ts2_temps = ts2_area.get("temps") or []
    for i, dt_jst in enumerate(ts2_times):
        if dt_jst is None or dt_jst.date() != target_date.date():
            continue
        if i < len(ts2_temps):
            val = ts2_temps[i]
            if val in (None, ""):
                continue
            try:
                temp_by_hour[dt_jst.hour] = float(val)
            except Exception:
                pass

    available_temp_hours = sorted(temp_by_hour.keys())
    available_pop_hours = sorted(pop_by_hour.keys())

    slots = []
    for hour in sorted(selected_hours):
        slot_dt = target_date.replace(hour=hour, minute=0, second=0, microsecond=0)
        if now_jst and slot_dt <= now_jst:
            continue

        # 天気は「同日」を優先し、なければ全体から最寄り
        weather_text = "不明"
        same_day_weather = [p for p in weather_points if p[0].date() == target_date.date()]
        candidate_weather = same_day_weather if same_day_weather else weather_points
        if candidate_weather:
            nearest_weather = min(candidate_weather, key=lambda p: abs((p[0] - slot_dt).total_seconds()))
            weather_text = nearest_weather[1]

        # 気温は最寄り時刻を採用
        temp_val = None
        if available_temp_hours:
            nearest_temp_hour = min(available_temp_hours, key=lambda h: abs(h - hour))
            temp_val = temp_by_hour.get(nearest_temp_hour)

        # 降水確率は最寄り6時間スロットを採用
        pop_val = ""
        if include_pop and available_pop_hours:
            nearest_pop_hour = min(available_pop_hours, key=lambda h: abs(h - hour))
            pop_val = pop_by_hour.get(nearest_pop_hour, "")

        slots.append(
            {
                "hour": hour,
                "weather": weather_text,
                "pop": pop_val,
                "temp": temp_val,
            }
        )

    return slots


def _slot_to_text(slot, contents):
    parts = [f"{slot['hour']}時"]
    if "天気" in contents:
        parts.append(f"天気は{slot['weather']}")
    if "気温" in contents:
        if slot["temp"] is None:
            parts.append("気温は不明")
        else:
            parts.append(f"気温は{int(slot['temp'])}度")
    if "降水確率" in contents:
        pop = slot["pop"] if str(slot["pop"]).strip() else "不明"
        parts.append(f"降水確率は{pop}%")
    return "、".join(parts)


def _build_today_tomorrow_message(area_name, target_label, slots, contents):
    if not slots:
        return "すでに設定された時間を過ぎているため、読み上げをスキップします。"

    # 気象庁の当日天気は日単位表現になることがあるため、
    # 複数時刻指定時は天気文を1回だけ読み上げ、各時刻は気温/降水確率中心にする。
    if len(slots) > 1 and "天気" in contents:
        day_weather = slots[0].get("weather") or "不明"
        slot_contents = [c for c in contents if c != "天気"]
        if not slot_contents:
            body = "。".join(f"{slot['hour']}時" for slot in slots)
        else:
            body = "。".join(_slot_to_text(slot, slot_contents) for slot in slots)
        return f"{area_name}の{target_label}の天気は{day_weather}です。{body}。"

    body = "。".join(_slot_to_text(slot, contents) for slot in slots)
    return f"{area_name}の{target_label}の天気です。{body}。"


def _build_weekly_message(forecast_data, contents, now_jst):
    if not isinstance(forecast_data, list) or len(forecast_data) < 2:
        return "今週の天気予報は取得できませんでした。"

    weekly = forecast_data[1]
    ts_list = weekly.get("timeSeries", [])
    if not ts_list:
        return "今週の天気予報は取得できませんでした。"

    ts0 = ts_list[0]
    area0 = (ts0.get("areas") or [{}])[0]
    area_name = (area0.get("area") or {}).get("name") or "地域"
    time_defines = [_to_jst(t) for t in (ts0.get("timeDefines") or [])]
    weathers = area0.get("weathers") or []
    weather_codes = area0.get("weatherCodes") or []

    # 週間の気温は timeSeries[1]
    temps_min = []
    temps_max = []
    if len(ts_list) > 1:
        area1 = (ts_list[1].get("areas") or [{}])[0]
        temps_min = area1.get("tempsMin") or []
        temps_max = area1.get("tempsMax") or []

    today = (now_jst or datetime.now(JST)).date()
    rows = []
    for i, td in enumerate(time_defines):
        if td is None or td.date() < today:
            continue
        parts = [td.strftime("%m月%d日")]
        if "天気" in contents:
            weather_text = weathers[i] if i < len(weathers) and weathers[i] else ""
            if not weather_text and i < len(weather_codes):
                weather_text = f"天気コード{weather_codes[i]}"
            parts.append(f"天気は{weather_text or '不明'}")
        if "気温" in contents:
            tmin = temps_min[i] if i < len(temps_min) else ""
            tmax = temps_max[i] if i < len(temps_max) else ""
            if tmin != "" or tmax != "":
                parts.append(f"最低{tmin}度、最高{tmax}度")
        rows.append("、".join(parts))

    if not rows:
        return "今週の天気予報は取得できませんでした。"
    return f"{area_name}の今週の天気予報です。{'。'.join(rows)}。"


def get_weather_forecast_message(
    area_code: str,
    content: list,
    range_type: str,
    granularity: str = "",
    hours: list | None = None,
    now_jst: datetime | None = None,
):
    """
    天気メッセージを生成する。
    granularity は旧互換で受け取るが、新仕様では使用しない。
    """
    forecast_data = _get_jma_forecast_data(area_code)
    if not forecast_data:
        return "天気予報データの取得に失敗しました。"

    now_jst = now_jst or datetime.now(JST)
    contents = _normalize_contents(content)
    normalized_range = _normalize_range(range_type)
    selected_hours = _normalize_hours(hours)

    if normalized_range == "週間":
        return _build_weekly_message(forecast_data, contents, now_jst)

    area_name, time_defines, weathers, pops, temps_time, temps_values = _extract_daily_series(forecast_data)
    if not area_name:
        return "天気予報データの解析に失敗しました。"

    temp_by_dt = _extract_temp_by_datetime(temps_time, temps_values)
    day_offset = 0 if normalized_range == "今日" else 1
    target_date = now_jst + timedelta(days=day_offset)
    target_label = "今日" if day_offset == 0 else "明日"

    include_pop = "降水確率" in contents
    slots = _collect_slots(
        time_defines,
        weathers,
        pops,
        temp_by_dt,
        target_date,
        selected_hours,
        include_pop,
        now_jst,
    )
    if not slots and selected_hours:
        slots = _build_slots_from_selected_hours(
            forecast_data=forecast_data,
            target_date=target_date,
            selected_hours=selected_hours,
            include_pop=include_pop,
            now_jst=now_jst,
        )
    return _build_today_tomorrow_message(area_name, target_label, slots, contents)
