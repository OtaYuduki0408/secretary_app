import requests
from datetime import datetime, timedelta
import pytz

JST = pytz.timezone("Asia/Tokyo")

# 気象庁 予報 JSON
JMA_FORECAST_BASE_URL = "https://www.jma.go.jp/bosai/forecast/data/forecast/"

# デフォルト: 群馬（高崎市向け）
DEFAULT_AREA_CODE = "140000"

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

