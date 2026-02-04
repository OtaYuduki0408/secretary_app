import requests
import json
from datetime import datetime, timedelta
import pytz

JST = pytz.timezone('Asia/Tokyo')

# 気象庁APIのベースURL
JMA_FORECAST_BASE_URL = "https://www.jma.go.jp/bosai/forecast/data/forecast/"

# エリアコード（例: 東京都）
# 将来的にはユーザー設定で変更できるようにする可能性あり
DEFAULT_AREA_CODE = "130000" # 東京都

def _get_jma_forecast_data(area_code: str):
    """
    気象庁APIから天気予報データを取得する
    """
    url = f"{JMA_FORECAST_BASE_URL}{area_code}.json"
    print(f"--- [DEBUG_SERVICE_WEATHER] Fetching JMA data from {url} ---")
    try:
        response = requests.get(url, timeout=5)
        response.raise_for_status()
        print(f"[DEBUG_SERVICE_WEATHER] JMA API request successful (Status: {response.status_code}).")
        return response.json()
    except requests.exceptions.HTTPError as http_err:
        print(f"!!! [DEBUG_SERVICE_WEATHER] HTTP ERROR fetching JMA forecast data: {http_err}")
        return None
    except requests.exceptions.RequestException as e:
        print(f"!!! [DEBUG_SERVICE_WEATHER] REQUEST ERROR fetching JMA forecast data: {e}")
        return None

def _parse_weather_forecast(data, target_date: datetime, granularity: str, content: list):
    """
    取得したデータから天気予報をパースする
    """
    if not data:
        return "天気予報の取得に失敗しました。"

    # timeSeries[0] が今日・明日・明後日の予報を含む
    forecast_daily = data[0]
    # timeSeries[1] が週間予報を含む (今回は使わない)
    # forecast_weekly = data[1]

    parsed_forecast = []

    # 'timeSeries[0].areas[0].area.name' で地域名を取得できる
    area_name = forecast_daily['timeSeries'][0]['areas'][0]['area']['name']

    # timeSeries[0] の timeDefines と weathers, pops を利用
    time_defines = [datetime.fromisoformat(t).astimezone(JST) for t in forecast_daily['timeSeries'][0]['timeDefines']]
    areas0 = forecast_daily['timeSeries'][0]['areas'][0]
    weathers = areas0.get('weathers', [])
    # 気象庁APIの地点によっては pops が無い場合があるため安全に取得する
    pops = areas0.get('pops', [])

    # timeSeries[2] の temps を利用 (時間帯別の気温)
    temps_time_defines = []
    temps_values = []
    if len(data[0].get('timeSeries', [])) > 2:
        temps_data_time_series = data[0]['timeSeries'][2]
        temps_time_defines = [datetime.fromisoformat(t).astimezone(JST) for t in temps_data_time_series.get('timeDefines', [])]
        temps_values = temps_data_time_series.get('areas', [{}])[0].get('temps', [])


    for i, td in enumerate(time_defines):
        if td.date() == target_date.date():
            # 今日の予報を処理
            weather_text = weathers[i] if i < len(weathers) else "不明"
            pop_text = f"降水確率{pops[i]}%" if i < len(pops) else ""

            # 気温の抽出（午前/午後ごと、または一日ごと）
            temp_info = []
            if "気温" in content:
                if granularity == "午前午後ごと":
                    # 午前と午後の時間帯に該当する気温データを抽出
                    temps_am = [temps_values[j] for j, ttd in enumerate(temps_time_defines) if ttd.date() == td.date() and 6 <= ttd.hour < 12 and temps_values[j] is not None]
                    temps_pm = [temps_values[j] for j, ttd in enumerate(temps_time_defines) if ttd.date() == td.date() and 12 <= ttd.hour < 18 and temps_values[j] is not None]
                    
                    if temps_am:
                        temp_info.append(f"午前は{temps_am[0]}度") # 最初のデータを代表値とする
                    if temps_pm:
                        temp_info.append(f"午後は{temps_pm[0]}度") # 最初のデータを代表値とする
                    if not temps_am and not temps_pm:
                        temp_info.append("気温情報なし")
                elif granularity == "1日ごと":
                    # 1日ごとの気温は、最高/最低気温を取得 (今回は timeSeries[0] の temps を使う)
                    # JMA APIのtimeSeries[0].tempsは、日ごとの最低/最高気温が含まれることが多い
                    # ここでは timeSeries[2] の tempsから日中の最高気温を取得
                    daily_temps = [temps_values[j] for j, ttd in enumerate(temps_time_defines) if ttd.date() == td.date() and temps_values[j] is not None]
                    if daily_temps:
                        temp_info.append(f"日中の最高気温は{max(daily_temps)}度、最低気温は{min(daily_temps)}度")
                    else:
                        temp_info.append("気温情報なし")
                else: # デフォルトとして1日ごと
                    daily_temps = [temps_values[j] for j, ttd in enumerate(temps_time_defines) if ttd.date() == td.date() and temps_values[j] is not None]
                    if daily_temps:
                        temp_info.append(f"日中の最高気温は{max(daily_temps)}度、最低気温は{min(daily_temps)}度")
                    else:
                        temp_info.append("気温情報なし")

            parts = []
            if "天気" in content:
                parts.append(weather_text)
            if "気温" in content:
                parts.extend(temp_info)
            
            if parts:
                parsed_forecast.append(f"{area_name}の{td.strftime('%Y年%m月%d日')}の天気は{'、'.join(parts)}です。{pop_text}")

    return " ".join(parsed_forecast) if parsed_forecast else "指定された条件の天気予報は見つかりませんでした。"


def get_weather_forecast_message(area_code: str, content: list, range_type: str, granularity: str):
    """
    ユーザーの設定に基づいて天気予報メッセージを生成する
    """
    print(f"--- [DEBUG_SERVICE_WEATHER] get_weather_forecast_message called with area='{area_code}', content={content}, range='{range_type}', granularity='{granularity}' ---")
    forecast_data = _get_jma_forecast_data(area_code)
    if not forecast_data:
        print("!!! [DEBUG_SERVICE_WEATHER] Failed to get forecast_data. Returning error message.")
        return "天気予報データの取得に失敗しました。"

    now = datetime.now(JST)
    message = ""

    # The logic for range_type is complex, let's log the final message at the end.
    if range_type == "今日":
        message = _parse_weather_forecast(forecast_data, now, granularity, content)
    # ... (rest of the logic is complex, we assume it works or will be debugged separately)
    # ... The original code for "午前", "午後", "今週" follows ...
    elif range_type == "午前":
        parsed_today = _parse_weather_forecast(forecast_data, now, "午前午後ごと", content)
        if "午前は" in parsed_today:
            message_parts = []
            if "天気" in content:
                weather_for_today = _parse_weather_forecast(forecast_data, now, "1日ごと", ["天気"]).split("の天気は")[1].split("です")[0].strip()
                message_parts.append(f"今日の午前中は{weather_for_today}")
            if "気温" in content:
                if "午前は" in parsed_today:
                    temp_part = parsed_today.split("午前は")[1].split("度")[0]
                    message_parts.append(f"気温は午前は{temp_part}度")
                else:
                    message_parts.append("午前中の気温情報はありません")
            if message_parts:
                message = "、".join(message_parts) + "でしょう。"
            else:
                message = "午前中の天気予報は見つかりませんでした。"
        else:
             message = "午前中の天気予報は見つかりませんでした。"

    elif range_type == "午後":
        parsed_today = _parse_weather_forecast(forecast_data, now, "午前午後ごと", content)
        if "午後は" in parsed_today:
            message_parts = []
            if "天気" in content:
                weather_for_today = _parse_weather_forecast(forecast_data, now, "1日ごと", ["天気"]).split("の天気は")[1].split("です")[0].strip()
                message_parts.append(f"今日の午後は{weather_for_today}")
            if "気温" in content:
                if "午後は" in parsed_today:
                    temp_part = parsed_today.split("午後は")[1].split("度")[0]
                    message_parts.append(f"気温は午後は{temp_part}度")
                else:
                    message_parts.append("午後の気温情報はありません")
            if message_parts:
                message = "、".join(message_parts) + "でしょう。"
            else:
                message = "午後の天気予報は見つかりませんでした。"
        else:
            message = "午後の天気予報は見つかりませんでした。"
            
    elif range_type == "今週":
        forecast_weekly = forecast_data[1] if len(forecast_data) > 1 else None
        if forecast_weekly:
            time_defines = [datetime.fromisoformat(t).astimezone(JST) for t in forecast_weekly['timeSeries'][0]['timeDefines']]
            weathers = forecast_weekly['timeSeries'][0]['areas'][0]['weathers']
            temps_min = forecast_weekly['timeSeries'][0]['areas'][0].get('tempsMin', [])
            temps_max = forecast_weekly['timeSeries'][0]['areas'][0].get('tempsMax', [])
            area_name = forecast_weekly['areas'][0]['area']['name']
            
            weekly_forecasts = []
            for i, td in enumerate(time_defines):
                if td.date() >= now.date():
                    parts = []
                    if "天気" in content and i < len(weathers):
                        parts.append(weathers[i])
                    if "気温" in content:
                        min_t = temps_min[i] if i < len(temps_min) and temps_min[i] is not None else "N/A"
                        max_t = temps_max[i] if i < len(temps_max) and temps_max[i] is not None else "N/A"
                        if min_t != "N/A" or max_t != "N/A":
                           parts.append(f"最低{min_t}度/最高{max_t}度")
                    if parts:
                        weekly_forecasts.append(f"{td.strftime('%m月%d日')}は{'、'.join(parts)}")
            
            if weekly_forecasts:
                message = f"{area_name}の今週の天気予報です。{' '.join(weekly_forecasts)}"
            else:
                message = "今週の天気予報は見つかりませんでした。"
        else:
            message = "今週の天気予報は見つかりませんでした。"

    print(f"[DEBUG_SERVICE_WEATHER] Final message for range '{range_type}': '{message}'")
    return message

# テスト用
if __name__ == "__main__":
    # 東京都の天気予報を取得
    print("--- 東京都の今日の天気 (天気と気温、1日ごと) ---")
    msg = get_weather_forecast_message(
        area_code="130000",
        content=["天気", "気温"],
        range_type="今日",
        granularity="1日ごと"
    )
    print(msg)

    print("\n--- 東京都の今日の天気 (天気と気温、午前午後ごと) ---")
    msg = get_weather_forecast_message(
        area_code="130000",
        content=["天気", "気温"],
        range_type="今日",
        granularity="午前午後ごと"
    )
    print(msg)

    print("\n--- 東京都の午前の天気 (天気と気温) ---")
    msg = get_weather_forecast_message(
        area_code="130000",
        content=["天気", "気温"],
        range_type="午前",
        granularity="午前午後ごと" # ここは内部で固定される
    )
    print(msg)

    print("\n--- 東京都の午後の天気 (天気と気温) ---")
    msg = get_weather_forecast_message(
        area_code="130000",
        content=["天気", "気温"],
        range_type="午後",
        granularity="午前午後ごと" # ここは内部で固定される
    )
    print(msg)

    print("\n--- 東京都の今週の天気 (天気と気温) ---")
    msg = get_weather_forecast_message(
        area_code="130000",
        content=["天気", "気温"],
        range_type="今週",
        granularity="1日ごと" # ここは内部で固定される
    )
    print(msg)

    print("\n--- 大阪府の今日の天気 (天気のみ、1日ごと) ---")
    msg = get_weather_forecast_message(
        area_code="270000", # 大阪府
        content=["天気"],
        range_type="今日",
        granularity="1日ごと"
    )
    print(msg)
