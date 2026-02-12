import os
import re
import json
from datetime import datetime, timedelta
import pytz
import functools
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
JST = pytz.timezone('Asia/Tokyo')
import google.generativeai as genai

# Local calendar service
from services import local_calendar_service

from services.finance_service import (
    get_all_finance_records, get_finance_summary, get_current_balance,
    get_monthly_expense, get_daily_expense
)
from services.memo_service import add_memo as add_memo_record
from services.memo_service import get_all_memos as get_all_memo_records
from services.memo_service import delete_memo as delete_memo_record
from services.memo_service import delete_memos_bulk as delete_memos_bulk_records
from services import switchbot_service


# キャッシュを適用する関数をクラスの外に定義
@functools.lru_cache(maxsize=128)
def _cached_gemini_request_impl(model_instance, prompt: str) -> str:
    print(f"--- [DEBUG] geminiに解析リクエスト (キャッシュなし) ---")
    try:
        response = model_instance.generate_content(
            contents=prompt
        )
        print(f"--- [DEBUG] Geminiの回答: {response.text} ---")
        return response.text.strip()
    except Exception as e:
        print(f"Geminiリクエストエラー: {e}")
        return "Gemini AIとの通信中にエラーが発生しました。"


class ChatSpaceModel:
    
    # (PROMPT TEMPLATES - no changes)
    PURPOSE_PROMPT_TEMPLATE = """
    以下のリストの目的と照合し、対応する機能を大文字、対応する行動を小文字で返してください。
    命令を確実に実現できる機能がない場合、Fnを返す。
    30文字以内となるべく少なくしてください。
    -機能-
    C:カレンダー
    I:収支管理 (例: 所持金、残高、今月の使用額、今日の使用額、収支の記録、支出の記録、収入の記録)
    M:メモ帳
    T:時刻、年月日、曜日確認(行動はn)
    R:過去の命令の修正(行動はn)
    S:SwitchBot iot等。例:電気を消す、エアコンを付ける、鍵を掛ける)(行動はn)
    Y:YouTubeの音楽を再生する(行動はp)
    Re:強制終了コマンド(処理を停止して等)
    K:計算(行動はn)
    -行動-
    a:追加
    d:削除
    c:変更
    g:取得
    s:検索
    例：カレンダーへの追加がユーザーの目的から、Caを返す。
    -入力-
    ユーザーの入力: {input_value}
    """
    CALC_PROMPT_TEMPLATE = """
    以下の質問は計算に関する質問です。pythonのeval関数で計算できるように計算式を作成してください。
    出力は計算式のみ。余計な説明は禁止。
    質問: {input_value}
    """
    FN_FALLBACK_PROMPT_TEMPLATE = """
    300文字以内で{tone}風に次の質問に回答してください:
    {input_value}
    """
    ADD_CALENDAR_PROMPT_TEMPLATE = """
    目的: ユーザーが追加したい予定の抽出
    抽出項目:
    - name (予定名)
    - start_time (未指定時は当日/推測時刻)
    - end_time (未指定時は開始1時間後)
    timeはYYYY-MM-DD HH:MM:SS
    出力はJSON配列のみ、他テキスト禁止。単独でも複数あっても二次配列で返す。
    現在時刻:{current_time}
    ユーザー入力: {input_value}
    """
    GET_CALENDAR_PROMPT_TEMPLATE = """
    目的: ユーザーが取得、操作したい情報が存在するであろう期間(日付)の抽出。単日の場合もある。
    抽出項目:
    - start_time
    - end_time
    timeはYYYY-MM-DD HH:MM:SS
    出力はJSON配列のみ、最小期間は1日、最大期間は半年で、一つの辞書で渡して。他テキスト禁止。
    現在時刻は{current_time}
    ユーザー入力: {input_value}
    """
    REMOVE_CALENDAR_PROMPT_TEMPLATE = """
    目的: ユーザーはカレンダーから予定を削除しようとしています。以下の「予定一覧」から、ユーザーが削除しようとしている予定を抽出してください。
    抽出項目:
    - name (予定名)
    - start_time (予定一覧から正確なYYYY-MM-DD HH:MM:SS形式の値を引用)
    - end_time (予定一覧から正確なYYYY-MM-DD HH:MM:SS形式の値を引用)
    出力はJSON配列のみ、他テキスト禁止。単一項目があろうが無かろうと二次配列で返す。
    現在時刻は{current_time}
    予定一覧:{task_list_json}
    ユーザー入力: {input_value}
    """
    CHANGE_CALENDAR_PROMPT_TEMPLATE = """
    目的: ユーザーが変更したい予定の情報の抽出
    抽出項目:
    - before_name (変更前の予定名)
    - before_start_time (変更前の正確な時刻を予定一覧から引用 YYYY-MM-DD HH:MM:SS)
    - before_end_time (変更前の正確な時刻を予定一覧から引用 YYYY-MM-DD HH:MM:SS)
    - after_name (変更後の予定名。変更がなければbefore_nameを引用)
    - after_start_time (変更後の開始時刻 YYYY-MM-DD HH:MM:SS)
    - after_end_time (変更後の終了時刻 YYYY-MM-DD HH:MM:SS)
    出力はJSON配列のみ、他テキスト禁止。単独でも複数あっても２次配列で返す
    現在時刻は{current_time}
    予定一覧:{task_list_json}
    ユーザー入力: {input_value}
    """
    TIME_GET_PROMPT_TEMPLATE = """
    目標：ユーザーが求めているように、以下の時刻情報を編集して返してください。
    例：何年？→20xx年、令和x年です。　何時？：午後xx時xx分xx秒です。　何日？：20xx年xx月xx日です。
    無駄な情報を含めず、的確にユーザーが求めている返答を返してください。返答は最大20文字以内でしてください。
    曜日はツェラーの公式などを使って計算してください。
    現在時刻は{current_time}
    ユーザー入力: {input_value}
    """
    ADD_INCOME_EXPENSE_PROMPT_TEMPLATE = """
    目的: ユーザーが登録したい収支情報を抽出
    抽出項目:
    - type (収入または支出)
    - category (カテゴリ、例: 食費、交通費、給与など。以下の利用可能なカテゴリから選択してください。もし適切なカテゴリがない場合は「その他支出」または「その他収入」を選択してください。)
    - amount (金額)
    - date (日付、未指定時は当日/推測日付 YYYY-MM-DD)
    - memo (使った内容)
    利用可能なカテゴリ: {available_categories}
    出力はJSON配列のみ、他テキスト禁止。単独でも複数あっても二次配列で返す。
    現在時刻:{current_time}
    ユーザー入力: {input_value}
    """
    GET_INCOME_EXPENSE_PROMPT_TEMPLATE = """
    目的: ユーザーが取得したい収支情報の期間とカテゴリを抽出。
    抽出項目:
    - start_date (未指定時は当月1日 YYYY-MM-DD)
    - end_date (未指定時は当月末日 YYYY-MM-DD)
    - category (任意、未指定時は全て)
    - memo (任意、メモの内容、未指定時は全て)
    出力はJSON配列のみ、他テキスト禁止。一つの辞書で渡して。
    現在時刻:{current_time}
    ユーザー入力: {input_value}
    """
    ADD_MEMO_PROMPT_TEMPLATE = """
    Purpose: Add memo. Extract fields and return JSON array only.
    Fields:
    - title (string)
    - content (string)
    - priority (integer 1-5, empty if not specified)
    Output: JSON array only.
    Current time:{current_time}
    User input: {input_value}
    """
    GET_MEMO_PROMPT_TEMPLATE = """
    Purpose: Search memos. Extract fields and return JSON array only.
    Fields:
    - keyword (string, partial match)
    - title (string, partial match)
    - content (string, partial match)
    - priority (integer 1-5, empty if not specified)
    - start_date (YYYY-MM-DD, optional)
    - end_date (YYYY-MM-DD, optional)
    Output: JSON array only.
    Current time:{current_time}
    User input: {input_value}
    """
    MEMO_SEARCH_KIND_PROMPT_TEMPLATE = """
    Purpose: Decide which fields should be used to search memos.
    Output: JSON only with keys among [time,title,priority,content,keyword].
    Example: {{"time": true, "title": true, "priority": false, "content": false, "keyword": false}}
    Current time:{current_time}
    User input: {input_value}
    """
    DELETE_MEMO_PROMPT_TEMPLATE = """
    Purpose: Delete memos. Extract fields and return JSON array only.
    Fields:
    - keyword (string, partial match)
    - title (string, partial match)
    - content (string, partial match)
    - priority (integer 1-5, empty if not specified)
    - start_date (YYYY-MM-DD, optional)
    - end_date (YYYY-MM-DD, optional)
    Output: JSON array only.
    Current time:{current_time}
    User input: {input_value}
    """

    SWITCHBOT_OPERATION_PROMPT_TEMPLATE = """
    Purpose: Identify SwitchBot device and command to execute.
    Fields:
    - device_id
    - command_type (command/customize)
    - command (turnOn/turnOff/press)
    - parameter (default/number/on)
    Output: JSON array only.
    Current time:{current_time}
    User input: {input_value}
    Available devices: {available_devices_json}
    """

    YOUTUBE_PLAY_PROMPT_TEMPLATE = """
    目的: ユーザーが再生したい曲名やアーティスト名、または動画のキーワードを抽出してください。
    抽出項目:
    - query (検索キーワード)
    出力はJSON形式で、'query'キーに文字列を入れてください。
    例: {{ "query": "米津玄師 Lemon" }}
    ユーザー入力: {input_value}
    """

    def __init__(self, gemini_api_key: str, calendar_manager=None):
        genai.configure(api_key=gemini_api_key)
        self.model_name = "gemini-2.5-flash"
        self.model = genai.GenerativeModel(model_name=self.model_name)
        # メモはSupabaseに保存するため、ここでは初期化不要
        self.memo_manager = None
        self._cancel_flags = {}
        self._current_user_id = None
        self._logger = None

    class CancelledError(Exception):
        pass

    def set_logger(self, logger):
        self._logger = logger

    def request_cancel(self, user_id: str | None, duration_seconds: int = 10, logger=None):
        if not user_id:
            return
        until = datetime.now() + timedelta(seconds=duration_seconds)
        self._cancel_flags[user_id] = until
        message = f"--- [DEBUG] force-cancel flag set: user_id={user_id}, until={until.isoformat()} ---"
        print(message)
        log_target = logger or self._logger
        if log_target:
            log_target.debug(message)

    def _consume_cancel(self, user_id: str | None) -> bool:
        if not user_id:
            return False
        current = self._cancel_flags.pop(user_id, None)
        return current is not None

    def _is_cancelled(self, user_id: str | None) -> bool:
        if not user_id:
            return False
        until = self._cancel_flags.get(user_id)
        if not until:
            return False
        if isinstance(until, datetime) and until < datetime.now():
            self._cancel_flags.pop(user_id, None)
            return False
        return True

    def is_cancelled(self, user_id: str | None) -> bool:
        return self._is_cancelled(user_id)

    def _gemini_request(self, prompt: str) -> str:
        if self._is_cancelled(self._current_user_id):
            raise ChatSpaceModel.CancelledError("cancelled")
        print(f"--- [DEBUG] geminiに解析リクエスト (ユーザー入力: {prompt}) ---")
        response_text = _cached_gemini_request_impl(self.model, prompt)
        return response_text

    def transform_tone(self, text: str, tone: str) -> str:
        if not text or not tone:
            return text
        prompt = (
            f"以下のテキストを{tone}にして。意味は変えず、自然な会話口調にして。"
            f"変換した文章のみを出力してください。\\n"
            f"---\\n{text}"
        )
        return self._gemini_request(prompt)

    def _fallback_with_gemini(self, text: str, tone_response: str) -> str:
        tone = (tone_response or "").strip() or "標準"
        prompt = self.FN_FALLBACK_PROMPT_TEMPLATE.format(tone=tone, input_value=text)
        return self._gemini_request(prompt)

    def _extract_calc_expression(self, raw: str) -> str:
        if not raw:
            return ""
        text = raw.strip()
        text = re.sub(r"^```[a-zA-Z]*\\n|```$", "", text, flags=re.MULTILINE).strip()
        if text.startswith("{") or text.startswith("["):
            try:
                obj = json.loads(text)
                if isinstance(obj, dict):
                    for key in ("expr", "expression", "calc", "formula"):
                        if isinstance(obj.get(key), str):
                            return obj[key].strip()
                if isinstance(obj, list) and obj:
                    first = obj[0]
                    if isinstance(first, str):
                        return first.strip()
                    if isinstance(first, dict):
                        for key in ("expr", "expression", "calc", "formula"):
                            if isinstance(first.get(key), str):
                                return first[key].strip()
            except Exception:
                pass
        return text.splitlines()[0].strip()

    def _try_eval_expression(self, text: str) -> str | None:
        if not text:
            return None
        normalized = text.strip()
        normalized = normalized.replace("×", "*").replace("÷", "/")
        normalized = normalized.replace("＋", "+").replace("－", "-").replace("−", "-")
        normalized = normalized.replace("＝", "=")
        if not re.fullmatch(r"[0-9eE+*/().%\\s=-]+", normalized):
            return None
        expr = normalized.replace("=", "").strip()
        if not expr or not re.search(r"[0-9]", expr):
            return None
        if not re.search(r"[+*/%()\\-]", expr):
            return None
        try:
            value = eval(expr, {"__builtins__": {}}, {})
        except Exception:
            return None
        formatted = self._format_calc_value(value)
        return f"答えは{formatted}です。計算式は{expr}です。"

    def _format_calc_value(self, value) -> str:
        try:
            dec = Decimal(str(value))
        except (InvalidOperation, ValueError):
            return str(value)
        sign = "-" if dec < 0 else ""
        abs_dec = abs(dec)
        int_part = int(abs_dec)
        int_digits = len(str(int_part))
        if int_digits >= 5:
            frac_digits = 2
        else:
            frac_digits = max(2, 5 - int_digits)
        quant = Decimal(1).scaleb(-frac_digits)
        rounded = abs_dec.quantize(quant, rounding=ROUND_HALF_UP)
        return f"{sign}{rounded:,.{frac_digits}f}"

    def _calculate_expression(self, text: str) -> str:
        prompt = self.CALC_PROMPT_TEMPLATE.format(input_value=text)
        raw = self._gemini_request(prompt)
        expr = self._extract_calc_expression(raw)
        if not expr:
            return "計算式を取得できませんでした。"
        if not re.fullmatch(r"[0-9eE+*/().%\\s-]+", expr):
            return "計算式に許可されていない文字が含まれていました。"
        try:
            value = eval(expr, {"__builtins__": {}}, {})
        except Exception:
            return "計算に失敗しました。"
        formatted = self._format_calc_value(value)
        return f"答えは{formatted}です。計算式は{expr}です。"

    def _format_event_time(self, iso_time: str) -> str:
        if not iso_time: return ""
        try:
            dt_object = datetime.fromisoformat(iso_time.replace('Z', '+00:00'))
            dt_jst = dt_object.astimezone(JST)
            return dt_jst.strftime('%m月%d日%H時%M分')
        except ValueError:
            return iso_time

    def _parse_datetime(self, time_str: str) -> datetime | None:
        if not time_str: return None
        try:
            return datetime.fromisoformat(time_str)
        except (ValueError, TypeError):
            print(f"[WARN] Could not parse datetime string: {time_str}")
            return None

    def _parse_calendar_list(self, text: str) -> list:
        if not text: return []
        match = re.search(r"```json\s*([\s\S]*?)\s*```", text, re.I)
        s = match.group(1) if match else text
        try:
            data = json.loads(s)
        except json.JSONDecodeError:
            print("JSON解析失敗: LLMが出力したJSON形式が不正です")
            return []
        list_data = data if isinstance(data, list) else [data] if data else []
        flattened = []
        for item in list_data:
            if isinstance(item, list):
                flattened.extend(item)
            else:
                flattened.append(item)
        parsed_list = []
        for x in flattened:
            if not isinstance(x, dict): continue
            item = {
                'name': x.get('name') or x.get('title') or x.get('event') or x.get('summary') or '',
                'start_time': x.get('start_time') or x.get('start') or x.get('begin') or x.get('date') or '',
                'end_time': x.get('end_time') or x.get('end') or x.get('finish') or x.get('start_time') or '',
                'before_name': x.get('before_name', ''),
                'before_start_time': x.get('before_start_time', ''),
                'before_end_time': x.get('before_end_time', ''),
                'after_name': x.get('after_name', ''),
                'after_start_time': x.get('after_start_time', ''),
                'after_end_time': x.get('after_end_time', '')
            }
            if item['start_time'] or item['before_start_time']:
                 parsed_list.append(item)
        return parsed_list
    
    # ... (other parsing functions remain the same) ...
    def _parse_income_expense_list(self, text: str) -> list:
        if not text: return []
        match = re.search(r"```json\s*([\s\S]*?)\s*```", text, re.I)
        s = match.group(1) if match else text
        
        data = None
        try:
            data = json.loads(s)
        except json.JSONDecodeError:
            print("JSON解析失敗: LLMが出力したJSON形式が不正です")
            return []

        list_data = data if isinstance(data, list) else [data] if data else []
        
        parsed_list = []
        for x in list_data:
            if not isinstance(x, dict): continue
            item = {
                'type': x.get('type') or '',
                'category': x.get('category') or '',
                'amount': x.get('amount') or 0,
                'date': x.get('date') or '',
                'memo': x.get('memo') or ''
            }
            if item['type'] and item['category'] and item['amount']:
                 parsed_list.append(item)
                 
        return parsed_list

    def _parse_memo_list(self, text: str) -> list:
        if not text: return []
        match = re.search(r"```json\s*([\s\S]*?)\s*```", text, re.I)
        s = match.group(1) if match else text
        
        data = None
        try:
            data = json.loads(s)
        except json.JSONDecodeError:
            print("JSON解析失敗: LLMが出力したJSON形式が不正です")
            return []

        list_data = data if isinstance(data, list) else [data] if data else []
        
        parsed_list = []
        for x in list_data:
            if not isinstance(x, dict): continue
            priority_value = x.get('priority')
            priority = None
            if isinstance(priority_value, (int, float)):
                priority = int(priority_value)
            elif isinstance(priority_value, str):
                stripped = priority_value.strip()
                if stripped.isdigit():
                    priority = int(stripped)
            item = {
                'title': x.get('title') or '',
                'content': x.get('content') or '',
                'keyword': x.get('keyword') or '',
                'priority': priority,
                'start_date': x.get('start_date') or x.get('start') or '',
                'end_date': x.get('end_date') or x.get('end') or ''
            }
            if item['title'] or item['content'] or item['keyword'] or item['priority'] is not None or item['start_date'] or item['end_date']:
                 parsed_list.append(item)
                 
        return parsed_list

    def _parse_memo_search_kind(self, text: str) -> dict:
        if not text:
            return {}
        match = re.search(r"```json\s*([\s\S]*?)\s*```", text, re.I)
        s = match.group(1) if match else text
        try:
            data = json.loads(s)
        except json.JSONDecodeError:
            return {}
        if not isinstance(data, dict):
            return {}
        return {
            "time": bool(data.get("time")),
            "title": bool(data.get("title")),
            "priority": bool(data.get("priority")),
            "content": bool(data.get("content")),
            "keyword": bool(data.get("keyword")),
        }

    def _parse_switchbot_operation_list(self, text: str) -> list:
        if not text: return []
        match = re.search(r"```json\s*([\s\S]*?)\s*```", text, re.I)
        s = match.group(1) if match else text
        
        data = None
        try:
            data = json.loads(s)
        except json.JSONDecodeError:
            print("JSON解析失敗: LLMが出力したJSON形式が不正です")
            return []

        list_data = data if isinstance(data, list) else [data] if data else []
        
        parsed_list = []
        for x in list_data:
            if not isinstance(x, dict): continue
            item = {
                'device_id': x.get('device_id') or '',
                'command_type': x.get('command_type') or '',
                'command': x.get('command') or '',
                'parameter': x.get('parameter') or 'default'
            }
            if item['device_id'] and item['command'] and item['command_type']:
                 parsed_list.append(item)
                 
        return parsed_list


    def check_chat_space(self, input_value: str, user_id: str | None = None, tone_response: str = "") -> dict:
        print("--- [DEBUG] check_chat_space: Starting ---")
        # 起動コマンドを除外してGeminiへ渡す
        cleaned_input = (input_value or "").replace("サイレントメイト", "").strip()
        current_time = datetime.now(JST).strftime('%Y-%m-%d %H:%M:%S')
        if self._is_cancelled(user_id):
            return {
                "status": "success",
                "message": "",
                "abort_command": True,
                "suppress_tts": True,
                "cancelled": True
            }
        calc_message = self._try_eval_expression(cleaned_input)
        if calc_message:
            return {
                "status": "success",
                "message": calc_message,
                "skip_tone": True
            }
        self._current_user_id = user_id
        try:
            purpose_prompt = self.PURPOSE_PROMPT_TEMPLATE.format(current_time=current_time, input_value=cleaned_input)
            purpose = self._gemini_request(purpose_prompt)
            print(f"--- [DEBUG] check_chat_space: Received purpose: {purpose} ---")
            result = {"status": "success", "purpose": purpose, "data": None, "message": ""}

            if purpose == "Re":
                self.request_cancel(user_id)
                return {
                    "status": "success",
                    "purpose": "Re",
                    "message": "",
                    "abort_command": True,
                    "suppress_tts": True,
                    "cancelled": True
                }
            if purpose == "Fn":
                result["message"] = self._fallback_with_gemini(cleaned_input, tone_response)
                result["skip_tone"] = True
                return result

            if purpose == "Ca":
                data, msg = self._add_calendar(cleaned_input, user_id)
                result["data"] = data
                result["message"] = msg
            elif purpose == "Cd":
                result["data"], result["message"] = self._remove_calendar(cleaned_input, user_id)
            elif purpose == "Cg":
                result["data"], result["message"] = self._get_calender(cleaned_input, is_silent=False, user_id=user_id)
            elif purpose == "Cc":
                result["data"], result["message"] = self._change_calendar(cleaned_input, user_id)
            # ... (other purpose handling remains the same) ...
            elif purpose == "Ia":
                result["data"], result["message"] = self._add_income_expense(cleaned_input, user_id)
            elif purpose == "Ig":
                result["data"], result["message"] = self._get_income_expense(cleaned_input, user_id)
            elif purpose == "Ma":
                result["data"], result["message"] = self._add_memo(cleaned_input, user_id)
            elif purpose == "Mg":
                result["data"], result["message"] = self._get_memo(cleaned_input, user_id)
            elif purpose == "Md":
                result["data"], result["message"] = self._delete_memo(cleaned_input, user_id)
            elif purpose == "Tn":
                time_prompt = self.TIME_GET_PROMPT_TEMPLATE.format(current_time=current_time, input_value=cleaned_input)
                result["message"] = self._gemini_request(time_prompt)
            elif purpose == "Sn":
                result["data"], result["message"] = self._get_switchbot_devices(cleaned_input, user_id)
            elif purpose == "Yp":
                prompt = self.YOUTUBE_PLAY_PROMPT_TEMPLATE.format(input_value=cleaned_input)
                raw_json = self._gemini_request(prompt)
                print(f"--- [DEBUG] raw_json from Gemini for Yp: {raw_json} ---") # ★追加
                try:
                    # '```json' と '```' で囲まれた部分を抽出
                    match = re.search(r"```json\s*([\s\S]*?)\s*```", raw_json, re.I)
                    s = match.group(1) if match else raw_json
                    data = json.loads(s)
                    print(f"--- [DEBUG] Parsed data for Yp: {data} (type: {type(data)}) ---") # ★追加
                    extracted_query = data.get("query")
                    if extracted_query:
                        result["purpose"] = "Yp" # 目的を明示的に設定
                        result["data"] = {"search_query": extracted_query}
                        result["message"] = f"「{extracted_query}」をYouTubeで検索します。"
                    else:
                        result["message"] = "再生したい曲名を特定できませんでした。"
                except (json.JSONDecodeError, AttributeError):
                    result["message"] = "キーワードの抽出に失敗しました。"
            elif purpose in ("Kn", "K"):
                result["message"] = self._calculate_expression(cleaned_input)
            else:
                result["message"] = "申し訳ございません。お客様の意図を特定できませんでした。"
                print(f"DEBUG: 意図不明なpurpose: {purpose}")

            return result
        except ChatSpaceModel.CancelledError:
            return {
                "status": "success",
                "message": "",
                "abort_command": True,
                "suppress_tts": True,
                "cancelled": True
            }
        finally:
            self._current_user_id = None

    def _add_calendar(self, text: str, user_id: str | None):
        """カレンダーにローカルDBを使ってイベントを追加"""
        if not user_id:
            return None, "ユーザーがログインしていません。"
        
        current_time = datetime.now(JST).strftime('%Y-%m-%d %H:%M:%S')
        prompt = self.ADD_CALENDAR_PROMPT_TEMPLATE.format(current_time=current_time, input_value=text)
        raw = self._gemini_request(prompt)
        list_to_add = self._parse_calendar_list(raw)
        
        if not list_to_add:
            return None, "予定の追加に失敗しました。入力内容を確認してください。"

        added_events = []
        for event_data in list_to_add:
            try:
                if not event_data.get('start_time'): continue

                # If end_time is not specified, use start_time + 1 hour.
                # The service layer will handle the conversion.
                end_time_str = event_data.get('end_time')
                if not end_time_str:
                    try:
                        start_dt = datetime.fromisoformat(event_data['start_time'])
                        end_time_str = (start_dt + timedelta(hours=1)).isoformat()
                    except ValueError:
                        end_time_str = event_data['start_time']

                new_event = local_calendar_service.add_event(
                    user_id=user_id,
                    title=event_data['name'],
                    start_time=event_data['start_time'], # Pass as string
                    end_time=end_time_str               # Pass as string
                )
                added_events.append(new_event)
            except Exception as e:
                print(f"ローカルカレンダーへのイベント追加エラー: {e}")
        
        if added_events:
            message = f"{len(added_events)}件の予定をカレンダーに追加しました。"
            return added_events, message
        
        return None, "予定を追加できませんでした。もう一度お試しください。"

    def _get_calender(self, text: str, is_silent: bool, user_id: str | None):
        """ローカルDBからカレンダーイベントを取得"""
        if not user_id: 
            if is_silent: return [], ""
            return None, "ユーザーがログインしていません。"

        current_time = datetime.now(JST).strftime('%Y-%m-%d %H:%M:%S')
        prompt = self.GET_CALENDAR_PROMPT_TEMPLATE.format(current_time=current_time, input_value=text)
        raw = self._gemini_request(prompt)
        range_info = self._parse_calendar_list(raw)
        
        start_time_iso, end_time_iso = None, None
        if range_info and range_info[0]:
            start_time_iso = range_info[0].get('start_time')
            end_time_iso = range_info[0].get('end_time')

        try:
            events = local_calendar_service.get_events(user_id, start_time_iso, end_time_iso)
            if events:
                event_details = [f"{self._format_event_time(e['start_time'])}に{e['title']}の予定" for e in events]
                message = f"{', '.join(event_details)}。以上{len(events)}件の予定が見つかりました。"
                return events, message
            else:
                return [], "該当の予定は見つかりませんでした。"
        except Exception as e:
            print(f"ローカルカレンダー取得エラー: {e}")
            return None, "カレンダーの取得中にエラーが発生しました。"

    def _remove_calendar(self, text: str, user_id: str | None):
        """ローカルDBからカレンダーイベントを削除"""
        if not user_id: return None, "ユーザーがログインしていません。"
        
        task_list, _ = self._get_calender(text, is_silent=True, user_id=user_id)
        if not task_list:
            return None, "カレンダーに該当する予定がありません。削除は実行されません。"

        task_list_json = json.dumps(task_list)
        current_time = datetime.now(JST).strftime('%Y-%m-%d %H:%M:%S')
        prompt = self.REMOVE_CALENDAR_PROMPT_TEMPLATE.format(current_time=current_time, task_list_json=task_list_json, input_value=text)
        raw = self._gemini_request(prompt)
        events_to_delete = self._parse_calendar_list(raw)
        
        if not events_to_delete:
            return None, "削除対象の予定を特定できませんでした。"

        deleted_count = 0
        for event_data in events_to_delete:
            target_id = None
            for task in task_list:
                # 名前と時間で照合（DB側はtitleキー）
                task_name = task.get("title") or task.get("name")
                task_start = (task.get("start_time") or "").replace("T", " ").split(".")[0]
                task_end = (task.get("end_time") or "").replace("T", " ").split(".")[0]
                target_name = (event_data.get("name") or "").strip()
                target_start = (event_data.get("start_time") or "").replace("T", " ").split(".")[0]
                target_end = (event_data.get("end_time") or "").replace("T", " ").split(".")[0]

                if task_name == target_name and task_start == target_start and task_end == target_end:
                    target_id = task.get("id")
                    break
            
            if target_id:
                try:
                    local_calendar_service.delete_event(target_id, user_id)
                    deleted_count += 1
                except Exception as e:
                    print(f"ローカルイベント削除エラー: {e}")
        
        if deleted_count > 0:
            return {"deleted_count": deleted_count}, f"{deleted_count}件の予定を削除しました。"
        
        return None, "削除対象の予定が見つかりませんでした。"

    def _change_calendar(self, text: str, user_id: str | None):
        """ローカルDBのカレンダーイベントを変更"""
        if not user_id: return None, "ユーザーがログインしていません。"
        
        task_list, _ = self._get_calender(text, is_silent=True, user_id=user_id)
        if not task_list:
            return None, "カレンダーに該当する予定がありません。変更は実行されません。"

        task_list_json = json.dumps(task_list)
        current_time = datetime.now(JST).strftime('%Y-%m-%d %H:%M:%S')
        prompt = self.CHANGE_CALENDAR_PROMPT_TEMPLATE.format(current_time=current_time, task_list_json=task_list_json, input_value=text)
        raw = self._gemini_request(prompt)
        events_to_change = self._parse_calendar_list(raw)

        if not events_to_change:
            return None, "変更対象の予定を特定できませんでした。"

        changed_count = 0
        for event_data in events_to_change:
            target_id = None
            for task in task_list:
                 # A simple match by name and time for now.
                if task.get("name") == event_data.get("before_name"):
                    target_id = task.get("id")
                    break

            if target_id:
                try:
                    update_payload = {
                        "title": event_data.get("after_name"),
                        "start_time": event_data.get("after_start_time"),
                        "end_time": event_data.get("after_end_time"),
                    }
                    # Remove None or empty values so we don't overwrite with nulls
                    update_payload = {k: v for k, v in update_payload.items() if v}
                    
                    if update_payload:
                        local_calendar_service.update_event(target_id, user_id, **update_payload)
                        changed_count += 1
                except Exception as e:
                    print(f"ローカルイベント更新エラー: {e}")
        
        if changed_count > 0:
            return {"changed_count": changed_count}, f"{changed_count}件の予定を変更しました。"

        return None, "変更対象の予定が見つかりませんでした。"

    # ... (other methods remain the same) ...
    def _to_rfc3339(self, value: str | None) -> str | None:
        """LLMの出力や内部日時をRFC3339に正規化"""
        if not value: return value
        candidate = value.strip().replace(" ", "T")
        try:
            dt = datetime.fromisoformat(candidate)
        except ValueError:
            return value
        if dt.tzinfo is None:
            dt = JST.localize(dt)
        dt_utc = dt.astimezone(pytz.UTC)
        return dt_utc.isoformat().replace("+00:00", "Z")

    def _normalize_time_for_compare(self, value: str | None) -> str | None:
        """比較用にUTC基準のISO文字列へ正規化"""
        if not value: return value
        candidate = value.strip().replace(" ", "T")
        if candidate.endswith("Z"):
            candidate = candidate[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(candidate)
        except ValueError:
            return value
        if dt.tzinfo is None:
            dt = JST.localize(dt)
        return dt.astimezone(pytz.UTC).isoformat(timespec="seconds")
    def _date_range_to_utc_iso(self, start_date: str, end_date: str) -> tuple[str, str]:
        """JST??????UTC?ISO??????"""
        start_dt = datetime.strptime(start_date, "%Y-%m-%d")
        end_dt = datetime.strptime(end_date, "%Y-%m-%d")
        start_jst = JST.localize(start_dt.replace(hour=0, minute=0, second=0, microsecond=0))
        end_jst = JST.localize(end_dt.replace(hour=23, minute=59, second=59, microsecond=999999))
        start_utc = start_jst.astimezone(pytz.UTC).isoformat()
        end_utc = end_jst.astimezone(pytz.UTC).isoformat()
        return start_utc, end_utc


    def _add_income_expense(self, text: str, user_id: str | None):
        """収支の追加"""
        if not user_id:
            return None, "ユーザー未ログイン"
        current_time = datetime.now(JST).strftime('%Y-%m-%d %H:%M:%S')

        # expense_serviceからカテゴリ一覧を取得
        from services.expense_service import add_finance_record, get_unique_categories
        available_categories = get_unique_categories(user_id)
        
        # デフォルトカテゴリ
        if not available_categories:
            available_categories = [
                "食費", "交通費", "娯楽費", "日用品", "家賃", "水道光熱費", "通信費",
                "給与", "副業収入", "臨時収入", "その他支出", "その他収入"
            ]

        prompt = self.ADD_INCOME_EXPENSE_PROMPT_TEMPLATE.format(
            current_time=current_time,
            input_value=text,
            available_categories=", ".join(available_categories)
        )
        raw = self._gemini_request(prompt)
        income_expenses_to_add = self._parse_income_expense_list(raw)

        added_info = []
        if not income_expenses_to_add:
            return None, "収支の追加に失敗しました。入力内容を確認してください。"

        for ie in income_expenses_to_add:
            try:
                data = {
                    "type": "income" if ie['type'] == "収入" else "expense",
                    "category": ie['category'],
                    "amount": ie['amount'],
                    "date": ie['date'],
                    "user_id": user_id
                }
                created_record = add_finance_record(data, user_id)
                added_info.append(created_record)
            except Exception as e:
                print(f"収支登録エラー: {e}")

        if added_info:
            message = f"{len(added_info)}件の収支を追加しました。"
            return added_info, message

        return None, "収支の追加は行われませんでした。"

    def _get_income_expense(self, text: str, user_id: str | None):
        """収支の取得"""
        if not user_id:
            return None, "ユーザー未ログイン"
        current_time = datetime.now(JST).strftime('%Y-%m-%d %H:%M:%S')

        # ユーザーの入力から特定の情報を取得する意図を判定
        if "所持金" in text or "残高" in text:
            balance = get_current_balance(user_id)
            message = f"現在の所持金は{balance}円です。"
            return {"balance": balance}, message
        elif "今月の使用額" in text or "今月の支出" in text:
            monthly_expense = get_monthly_expense(user_id)
            message = f"今月の合計支出額は{monthly_expense}円です。"
            return {"monthly_expense": monthly_expense}, message
        elif "今日の使用額" in text or "今日の支出" in text or "今日いくら使った" in text:
            daily_expense = get_daily_expense(user_id)
            message = f"今日の合計支出額は{daily_expense}円です。"
            return {"daily_expense": daily_expense}, message

        # 既存の期間とカテゴリによる収支取得ロジック
        prompt = self.GET_INCOME_EXPENSE_PROMPT_TEMPLATE.format(
            current_time=current_time,
            input_value=text
        )
        raw = self._gemini_request(prompt)
        range_info = self._parse_income_expense_list(raw)

        start_date = None
        end_date = None
        category = None

        if range_info and range_info[0]:
            start_date = range_info[0].get('start_date')
            end_date = range_info[0].get('end_date')
            category = range_info[0].get('category')

        # デフォルト値の設定
        if not start_date:
            start_date = datetime.now(JST).replace(day=1).strftime('%Y-%m-%d')
        if not end_date:
            today = datetime.now(JST)
            next_month = today.replace(day=28) + timedelta(days=4)
            end_date = (next_month - timedelta(days=next_month.day)).strftime('%Y-%m-%d')

        try:
            # finance_serviceのget_all_finance_recordsを呼び出し、フィルタリング
            all_records = get_all_finance_records(user_id)

            filtered_records = []
            for record in all_records:
                record_date = datetime.fromisoformat(record["date"]).strftime('%Y-%m-%d')
                if start_date <= record_date <= end_date:
                    if not category or record.get("category") == category:
                        filtered_records.append(record)

            print(f"--- [DEBUG] _get_income_expense: Filtered records: {filtered_records} ---")
            if filtered_records:
                total_income = sum(r.get("amount", 0) for r in filtered_records if r.get("type") == "income")
                total_expense = sum(r.get("amount", 0) for r in filtered_records if r.get("type") == "expense")
                net_balance = total_income - total_expense

                message = (
                    f"期間内の収支が見つかりました。\n"
                    f"収入: {total_income}円\n"
                    f"支出: {total_expense}円\n"
                    f"収支: {net_balance}円"
                )
                return {"filtered_records": filtered_records, "summary": {"income": total_income, "expense": total_expense, "balance": net_balance}}, message
            else:
                message = "該当する収支は見つかりませんでした。"
                return [], message
        except Exception as e:
            print(f"収支取得エラー: {e}")
            return None, "収支の取得中にエラーが発生しました。"

    def _add_memo(self, text: str, user_id: str | None):
        """Add memo"""
        if not user_id:
            return None, "User is not logged in."
        current_time = datetime.now(JST).strftime('%Y-%m-%d %H:%M:%S')
        prompt = self.ADD_MEMO_PROMPT_TEMPLATE.format(
            current_time=current_time,
            input_value=text
        )
        raw = self._gemini_request(prompt)
        memos_to_add = self._parse_memo_list(raw)

        added_info = []
        if not memos_to_add:
            return None, "Missing fields for memo. Please specify title/content/priority."

        for memo in memos_to_add:
            try:
                created_memo = add_memo_record(
                    user_id=user_id,
                    title=memo.get('title') or '',
                    content=memo.get('content') or '',
                    is_pinned=False,
                    priority=memo.get('priority')
                )
                if isinstance(created_memo, dict) and created_memo.get('error'):
                    continue
                added_info.append(created_memo)
            except Exception as e:
                print(f"memo add error: {e}")

        if added_info:
            message = f"Added {len(added_info)} memo(s)."
            return added_info, message

        return None, "Failed to add memo."

    def _get_memo(self, text: str, user_id: str | None):
        """Search memos"""
        if not user_id:
            return None, "User is not logged in."

        current_time = datetime.now(JST).strftime('%Y-%m-%d %H:%M:%S')
        kind_prompt = self.MEMO_SEARCH_KIND_PROMPT_TEMPLATE.format(
            current_time=current_time,
            input_value=text
        )
        kind_raw = self._gemini_request(kind_prompt)
        kind = self._parse_memo_search_kind(kind_raw)

        # time range first (default to last month)
        prompt = self.GET_MEMO_PROMPT_TEMPLATE.format(
            current_time=current_time,
            input_value=text
        )
        raw = self._gemini_request(prompt)
        search_info = self._parse_memo_list(raw)

        keyword = None
        title = None
        content = None
        priority = None
        start_date = None
        end_date = None

        if search_info and search_info[0]:
            keyword = search_info[0].get('keyword')
            title = search_info[0].get('title')
            content = search_info[0].get('content')
            priority = search_info[0].get('priority')
            start_date = search_info[0].get('start_date')
            end_date = search_info[0].get('end_date')

        if not start_date or not end_date:
            today = datetime.now(JST)
            start_date = (today - timedelta(days=30)).strftime('%Y-%m-%d')
            end_date = today.strftime('%Y-%m-%d')

        # Decide which fields to use based on kind
        # Convert date range to UTC ISO for DB filtering
        start_date_utc, end_date_utc = self._date_range_to_utc_iso(start_date, end_date)

        use_title = bool(kind.get('title'))
        use_priority = bool(kind.get('priority'))
        use_content = bool(kind.get('content'))
        use_keyword = bool(kind.get('keyword'))

        search_type = "all"
        search_keyword = ""
        if use_keyword and keyword:
            search_keyword = keyword
            search_type = "all"
        elif use_title and title:
            search_keyword = title
            search_type = "title"
        elif use_content and content:
            search_keyword = content
            search_type = "content"

        memos = get_all_memo_records(
            user_id=user_id,
            keyword=search_keyword,
            search_type=search_type,
            start_date=start_date_utc,
            end_date=end_date_utc,
            title=title or "",
            content=content or "",
            priority=priority if use_priority else None
        )

        if isinstance(memos, dict) and memos.get('error'):
            return None, "Memo search error."

        if memos:
            speak_parts = []
            for memo in memos[:5]:
                title_part = memo.get("title") or "無題"
                content_part = memo.get("content") or "内容なし"
                speak_parts.append(f"タイトルは{title_part}。内容は{content_part}。")
            message = "メモの読み上げです。" + " ".join(speak_parts)
            if len(memos) > 5:
                message += f"ほか{len(memos) - 5}件あります。"
            return memos, message

        return [], "No matching memos found."

    def _delete_memo(self, text: str, user_id: str | None):
        """Delete memos"""
        if not user_id:
            return None, "User is not logged in."
        current_time = datetime.now(JST).strftime('%Y-%m-%d %H:%M:%S')
        prompt = self.DELETE_MEMO_PROMPT_TEMPLATE.format(
            current_time=current_time,
            input_value=text
        )
        raw = self._gemini_request(prompt)
        delete_info = self._parse_memo_list(raw)

        keyword = None
        title = None
        content = None
        priority = None
        start_date = None
        end_date = None

        if delete_info and delete_info[0]:
            keyword = delete_info[0].get('keyword')
            title = delete_info[0].get('title')
            content = delete_info[0].get('content')
            priority = delete_info[0].get('priority')
            start_date = delete_info[0].get('start_date')
            end_date = delete_info[0].get('end_date')

        if not keyword and not title and not content and priority is None and not start_date and not end_date:
            return None, "Missing delete conditions. Provide title/content/keyword/priority/date range."

        search_type = "all"
        search_keyword = ""
        if keyword:
            search_keyword = keyword
            search_type = "all"
        elif title:
            search_keyword = title
            search_type = "title"
        elif content:
            search_keyword = content
            search_type = "content"

        if start_date and end_date:
            start_date_utc, end_date_utc = self._date_range_to_utc_iso(start_date, end_date)
        else:
            start_date_utc, end_date_utc = "", ""

        memos = get_all_memo_records(
            user_id=user_id,
            keyword=search_keyword,
            search_type=search_type,
            start_date=start_date_utc,
            end_date=end_date_utc,
            title=title or "",
            content=content or "",
            priority=priority
        )

        if isinstance(memos, dict) and memos.get('error'):
            return None, "Failed to fetch delete targets."

        if not memos:
            return [], "No matching memos to delete."

        memo_ids = [m.get('id') for m in memos if m.get('id')]
        if not memo_ids:
            return [], "No memo IDs found to delete."

        if len(memo_ids) == 1:
            result = delete_memo_record(user_id=user_id, memo_id=memo_ids[0])
            if isinstance(result, dict) and result.get('error'):
                return None, "Delete failed."
            return {"deleted_count": 1}, "Deleted 1 memo."

        result = delete_memos_bulk_records(user_id=user_id, memo_ids=memo_ids)
        if isinstance(result, dict) and result.get('error'):
            return None, "Bulk delete failed."

        return {"deleted_count": len(memo_ids)}, f"Deleted {len(memo_ids)} memos."

    def _get_switchbot_devices(self, text: str, user_id: str | None):
        """SwitchBotデバイス情報を取得し、ユーザーの操作意図を特定する"""
        switchbot_api_token = os.getenv("SWITCHBOT_TOKEN")
        switchbot_api_secret = os.getenv("SWITCHBOT_SECRET")

        if switchbot_api_token:
            print(f"DEBUG: SWITCHBOT_TOKEN: {switchbot_api_token[:5]}...{switchbot_api_token[-5:]}")
        else:
            print("DEBUG: SWITCHBOT_TOKEN is not set.")
        if switchbot_api_secret:
            print(f"DEBUG: SWITCHBOT_SECRET: {switchbot_api_secret[:5]}...{switchbot_api_secret[-5:]}")
        else:
            print("DEBUG: SWITCHBOT_SECRET is not set.")

        if not switchbot_api_token or not switchbot_api_secret:
            return None, "SwitchBot APIトークンまたはシークレットが設定されていません。"

        try:
            devices_data = switchbot_service.get_switchbot_devices(switchbot_api_token, switchbot_api_secret) # SECRETを渡す
            if devices_data and devices_data.get("statusCode") == 100:
                device_list = devices_data["body"].get("deviceList", [])
                infrared_remote_list = devices_data["body"].get("infraredRemoteList", [])

                # LLMに渡すための情報を整形
                formatted_devices = []
                for device in device_list:
                    formatted_devices.append({
                        "name": device.get("deviceName"),
                        "type": device.get("deviceType"),
                        "id": device.get("deviceId")
                    })
                for remote in infrared_remote_list:
                    formatted_devices.append({
                        "name": remote.get("deviceName"),
                        "type": remote.get("remoteType"), # IR_Remoteの場合はremoteTypeを使う
                        "id": remote.get("deviceId")
                    })
                
                # デバイスリストをJSON文字列に変換
                available_devices_json = json.dumps(formatted_devices, ensure_ascii=False)

                # LLMに操作意図を特定させるプロンプトを生成
                current_time = datetime.now(JST).strftime('%Y-%m-%d %H:%M:%S')
                operation_prompt = self.SWITCHBOT_OPERATION_PROMPT_TEMPLATE.format(
                    available_devices_json=available_devices_json,
                    current_time=current_time,
                    input_value=text
                )
                raw_operation = self._gemini_request(operation_prompt)
                operations_to_perform = self._parse_switchbot_operation_list(raw_operation)

                if operations_to_perform:
                    # ユーザーの意図が特定できた場合、操作を実行
                    results = []
                    for op in operations_to_perform:
                        op_result, op_message = self._operate_switchbot(
                            switchbot_api_token,
                            switchbot_api_secret, # SECRETを渡す
                            op['device_id'],
                            op['command_type'],
                            op['command'],
                            op['parameter']
                        )
                        results.append({"operation": op, "result": op_result, "message": op_message})
                    
                    # ユーザーへのフィードバックメッセージを生成
                    feedback_messages = []
                    for res in results:
                        device_name = next((d['name'] for d in formatted_devices if d['id'] == res['operation']['device_id']), "不明なデバイス")
                        feedback_messages.append(f"{device_name}に対して'{res['operation']['command']}'を実行しました。")
                    return results, "、".join(feedback_messages)
                else:
                    # 操作意図が特定できなかった場合
                    message = f"{len(formatted_devices)}件のSwitchBotデバイスが見つかりました。が、命令を読み解けませんでした。"
                    return formatted_devices, message
            else:
                return None, "SwitchBotデバイスの取得に失敗しました。"
        except Exception as e:
            print(f"SwitchBotデバイス取得エラー: {e}")
            return None, "SwitchBotデバイスの取得中にエラーが発生しました。"

    def _operate_switchbot(self, api_token: str, api_secret: str, device_id: str, command_type: str, command: str, parameter: str = "default"):
        """
        SwitchBotデバイスを操作する。
        """
        try:
            response = switchbot_service.send_device_command(api_token, api_secret, device_id, command_type, command, parameter) # SECRETを渡す
            if response and response.get("statusCode") == 100:
                return response, "操作に成功しました。"
            else:
                return response, f"操作に失敗しました: {response.get('message', '不明なエラー')}"
        except Exception as e:
            print(f"SwitchBot操作エラー: {e}")
            return None, "SwitchBotの操作中にエラーが発生しました。"
