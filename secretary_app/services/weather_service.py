import requests
from datetime import datetime
import pytz

JST = pytz.timezone('Asia/Tokyo')

# 気象庁 予報JSON
JMA_FORECAST_BASE_URL = "https://www.jma.go.jp/bosai/forecast/data/forecast/"

# 群馬県（前橋地方気象台）: areas は通常「南部」「北部」
# 高崎市は南部予報区に含まれるため、固定値として 100000 を採用
DEFAULT_AREA_CODE = "100000"


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
        return None, None, [], [], [], []

    daily = forecast_data[0]
    ts_list = daily.get("timeSeries", [])
    if not ts_list:
        return None, None, [], [], [], []

    ts0 = ts_list[0]
    area0 = (ts0.get("areas") or [{}])[0]
    area_name = ((area0.get("area") or {}).get("name")) or "地域"

    time_defines = [_to_jst(t) for t in (ts0.get("timeDefines") or [])]
    weathers = area0.get("weathers") or []
    pops = area0.get("pops") or []

    # 気温系列は無い場合もある
    temps_time = []
    temps_values = []
    if len(ts_list) > 2:
        ts2 = ts_list[2]
        temps_time = [_to_jst(t) for t in (ts2.get("timeDefines") or [])]
        temps_values = ((ts2.get("areas") or [{}])[0].get("temps") or [])

    return daily, area_name, time_defines, weathers, pops, list(zip(temps_time, temps_values))


def _daily_summary(area_name: str, target_date: datetime, time_defines, weathers, pops, temp_pairs, content):
    weather_text = None
    pop_text = None

    for i, td in enumerate(time_defines):
        if td is None:
            continue
        if td.date() == target_date.date():
            weather_text = weathers[i] if i < len(weathers) else None
            pop_text = pops[i] if i < len(pops) else None
            break

    temp_values = []
    for tdt, tval in temp_pairs:
        if tdt is None or tval in (None, ""):
            continue
        if tdt.date() == target_date.date():
            try:
                temp_values.append(float(tval))
            except Exception:
                pass

    parts = []
    if "天気" in content:
        parts.append(weather_text or "不明")
    if "気温" in content:
        if temp_values:
            parts.append(f"最高{int(max(temp_values))}度、最低{int(min(temp_values))}度")
        else:
            parts.append("気温情報なし")

    if not parts:
        parts.append(weather_text or "不明")

    rain = f"降水確率{pop_text}%" if pop_text not in (None, "") else ""
    rain_suffix = f"、{rain}" if rain else ""
    return f"{area_name}の{target_date.strftime('%Y年%m月%d日')}の天気は{ '、'.join(parts) }です{rain_suffix}。"


def _am_pm_summary(area_name: str, target_date: datetime, time_defines, weathers, temp_pairs, content, target_period: str):
    # 予報配列の先頭一致を使う簡易実装
    weather_text = None
    for i, td in enumerate(time_defines):
        if td is None:
            continue
        if td.date() != target_date.date():
            continue
        if target_period == "午前" and td.hour < 12:
            weather_text = weathers[i] if i < len(weathers) else None
            break
        if target_period == "午後" and td.hour >= 12:
            weather_text = weathers[i] if i < len(weathers) else None
            break

    temps = []
    for tdt, tval in temp_pairs:
        if tdt is None or tval in (None, ""):
            continue
        if tdt.date() != target_date.date():
            continue
        if target_period == "午前" and not (0 <= tdt.hour < 12):
            continue
        if target_period == "午後" and not (12 <= tdt.hour <= 23):
            continue
        try:
            temps.append(float(tval))
        except Exception:
            pass

    parts = []
    if "天気" in content:
        parts.append(weather_text or "不明")
    if "気温" in content:
        if temps:
            parts.append(f"気温は{int(temps[0])}度")
        else:
            parts.append("気温情報なし")

    if not parts:
        parts.append(weather_text or "不明")

    return f"{area_name}の{target_date.strftime('%Y年%m月%d日')}の{target_period}の天気は{ '、'.join(parts) }です。"


def _weekly_summary(forecast_data, content):
    if not isinstance(forecast_data, list) or len(forecast_data) < 2:
        return "今週の天気予報は取得できませんでした。"

    weekly = forecast_data[1]
    ts_list = weekly.get("timeSeries", [])
    if not ts_list:
        return "今週の天気予報は取得できませんでした。"

    ts0 = ts_list[0]
    area0 = (ts0.get("areas") or [{}])[0]
    area_name = ((weekly.get("areas") or [{}])[0].get("area") or {}).get("name") or "地域"

    time_defines = [_to_jst(t) for t in (ts0.get("timeDefines") or [])]
    weathers = area0.get("weathers") or []
    temps_min = area0.get("tempsMin") or []
    temps_max = area0.get("tempsMax") or []

    today = datetime.now(JST).date()
    rows = []
    for i, td in enumerate(time_defines):
        if td is None or td.date() < today:
            continue

        parts = []
        if "天気" in content:
            parts.append(weathers[i] if i < len(weathers) else "不明")
        if "気温" in content:
            tmin = temps_min[i] if i < len(temps_min) else ""
            tmax = temps_max[i] if i < len(temps_max) else ""
            if tmin != "" or tmax != "":
                parts.append(f"最低{tmin}度、最高{tmax}度")

        if not parts:
            parts.append(weathers[i] if i < len(weathers) else "不明")

        rows.append(f"{td.strftime('%m月%d日')}は{ '、'.join(parts) }")

    if not rows:
        return "今週の天気予報は取得できませんでした。"
    return f"{area_name}の今週の天気予報です。{'。'.join(rows)}。"


def get_weather_forecast_message(area_code: str, content: list, range_type: str, granularity: str):
    forecast_data = _get_jma_forecast_data(area_code)
    if not forecast_data:
        return "天気予報データの取得に失敗しました。"

    now = datetime.now(JST)
    _, area_name, time_defines, weathers, pops, temp_pairs = _extract_daily_series(forecast_data)

    if range_type == "今週":
        return _weekly_summary(forecast_data, content)

    if range_type == "午前":
        return _am_pm_summary(area_name, now, time_defines, weathers, temp_pairs, content, "午前")

    if range_type == "午後":
        return _am_pm_summary(area_name, now, time_defines, weathers, temp_pairs, content, "午後")

    # デフォルト: 今日
    # granularity が「午前午後ごと」の場合でも、既存UI互換のため1文で返す
    return _daily_summary(area_name, now, time_defines, weathers, pops, temp_pairs, content)
