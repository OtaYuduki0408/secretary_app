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
    print(f"DEBUG: Fetching JMA data from {url}")
    try:
        response = requests.get(url, timeout=5) # タイムアウトを設定
        response.raise_for_status()
        print(f"DEBUG: JMA API request successful.")
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"ERROR: Error fetching JMA forecast data: {e}") # error レベルで出力
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
    weathers = forecast_daily['timeSeries'][0]['areas'][0]['weathers']
    pops = forecast_daily['timeSeries'][0]['areas'][0]['pops']

    # timeSeries[2] の temps を利用 (時間帯別の気温)
    temps_data_time_series = data[0]['timeSeries'][2]
    temps_time_defines = [datetime.fromisoformat(t).astimezone(JST) for t in temps_data_time_series['timeDefines']]
    temps_values = temps_data_time_series['areas'][0]['temps']


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
    print(f"DEBUG: get_weather_forecast_message called with area={area_code}, content={content}, range={range_type}, granularity={granularity}")
    forecast_data = _get_jma_forecast_data(area_code)
    if not forecast_data:
        print("DEBUG: Failed to get forecast_data.")
        return "天気予報データの取得に失敗しました。"

    now = datetime.now(JST)
    target_date = now

    message = ""

    if range_type == "今日":
        message = _parse_weather_forecast(forecast_data, now, granularity, content)
    elif range_type == "午前":
        # 今日の午前中の予報
        # _parse_weather_forecast内で午前午後ごとを処理しているため、そちらに任せる
        parsed_today = _parse_weather_forecast(forecast_data, now, "午前午後ごと", content)
        if "午前は" in parsed_today:
             # "午前はXX度" の部分だけを抽出するシンプルなロジック
             # もし天気も含まれていれば、「今日の午前中は晴れ、気温は午前はXX度」となる
            message_parts = []
            if "天気" in content:
                weather_for_today = _parse_weather_forecast(forecast_data, now, "1日ごと", ["天気"]).split("の天気は")[1].split("です")[0].strip()
                message_parts.append(f"今日の午前中は{weather_for_today}")
            
            temp_part = ""
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

    elif range_type == "午後":
        # 今日の午後の予報
        parsed_today = _parse_weather_forecast(forecast_data, now, "午前午後ごと", content)
        if "午後は" in parsed_today:
            message_parts = []
            if "天気" in content:
                weather_for_today = _parse_weather_forecast(forecast_data, now, "1日ごと", ["天気"]).split("の天気は")[1].split("です")[0].strip()
                message_parts.append(f"今日の午後は{weather_for_today}")
            
            temp_part = ""
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

    elif range_type == "今週":
        # 週間予報の処理
        # timeSeries[1] を利用
        forecast_weekly = forecast_data[1]
        
        time_defines = [datetime.fromisoformat(t).astimezone(JST) for t in forecast_weekly['timeSeries'][0]['timeDefines']]
        weathers = forecast_weekly['timeSeries'][0]['areas'][0]['weathers']
        temps_min = forecast_weekly['timeSeries'][0]['areas'][0]['tempsMin']
        temps_max = forecast_weekly['timeSeries'][0]['areas'][0]['tempsMax']

        weekly_forecasts = []
        for i, td in enumerate(time_defines):
            # 発表日以降の予報のみ取得
            if td.date() >= now.date():
                day_weather = weathers[i] if i < len(weathers) else "不明"
                day_temp_min = temps_min[i] if i < len(temps_min) and temps_min[i] is not None else "不明"
                day_temp_max = temps_max[i] if i < len(temps_max) and temps_max[i] is not None else "不明"
                
                parts = []
                if "天気" in content:
                    parts.append(day_weather)
                if "気温" in content:
                    if day_temp_min != "不明" and day_temp_max != "不明":
                        parts.append(f"最低気温{day_temp_min}度、最高気温{day_temp_max}度")
                    elif day_temp_min != "不明":
                        parts.append(f"最低気温{day_temp_min}度")
                    elif day_temp_max != "不明":
                        parts.append(f"最高気温{day_temp_max}度")
                
                if parts:
                    weekly_forecasts.append(f"{td.strftime('%m月%d日')}は{'、'.join(parts)}")
        
        message = f"{forecast_daily['areas'][0]['area']['name']}の今週の天気予報です。{' '.join(weekly_forecasts)}"
        if not weekly_forecasts:
            message = "今週の天気予報は見つかりませんでした。"
    
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
