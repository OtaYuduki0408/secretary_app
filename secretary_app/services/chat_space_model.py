import os
import re
import json
from datetime import datetime, timedelta
import pytz
JST = pytz.timezone('Asia/Tokyo')
import google.generativeai as genai
from services.ScheduleManager import ScheduleManager
# IncomeExpenseManagerとMemoManagerのインポ�Eトを追加 (これら�Eファイルは別途作�Eが忁E��でぁE
from services.IncomeExpenseManager import IncomeExpenseManager
from services.MemoManager import MemoManager


class ChatSpaceModel:
    """
    ユーザー入力に基づぁE��LLMを介して意図を解析し、E
    カレンダー操作を実行するコアモチE��クラス、E
    """
    
    # 意図判定�Eロンプト
    PURPOSE_PROMPT_TEMPLATE = """
    以下�EチE��スト�E目皁E��刁E��し、対応する機�Eを大斁E��、対応する行動を小文字で返してください、E
    命令を確実に実現できる機�EがなぁE��合、機�Eを使わず、最適と思われる解答をしてください。その場合、返答�E最大30斁E��以冁E��なるべく少なくしてください、E
    -機�E-
    C:カレンダー
    I:収支管琁E
    M:メモ帳
    T:時刻、年月日、曜日確誁E行動はn)
    R:過去の命令の修正(行動はn)
    -行動-
    a:追加
    d:削除
    c:変更
    g:取征E
    s:検索
    例：カレンダーへの追加がユーザーの目皁E��ら、Caを返す、E
    -惁E��-
    ユーザーの入劁E{input_value}
    """
    
    # 予定追加プロンプト
    ADD_CALENDAR_PROMPT_TEMPLATE = """
    目樁E ユーザーが追加したぁE��定�E抽出
    抽出忁E��頁E��:
    - name�E�予定名�E�E
    - start_time�E�未持E��時は当日/推測時刻�E�E
    - end_time�E�未持E��時は開姁EH後！E
    timeはYYYY-MM-DD HH:MM:SS
    出力�EJSON配�Eのみ、他テキスト禁止。単独でも褁E��あってめE次允E��ストで返す、E
    現在時刻:{current_time}
    ユーザー入劁E{input_value}
    """
    
    # 予定取得�Eロンプト
    GET_CALENDAR_PROMPT_TEMPLATE = """
    目樁E ユーザーが取得、操作したい惁E��が存在するであろぁE��間�E篁E��の抽出。褁E��日の場合もある、E
    抽出忁E��頁E��:
    - start_time
    - end_time
    timeはYYYY-MM-DD HH:MM:SS
    出力�EJSON配�Eのみ、最小篁E��は1日、最大篁E��は半年で、一つの辞書で渡して。他テキスト禁止、E
    現在時刻は{current_time}
    ユーザー入劁E{input_value}
    """
    
    # 予定削除プロンプト
    REMOVE_CALENDAR_PROMPT_TEMPLATE = """
    目樁E ユーザーはカレンダーから予定を削除しよぁE��してぁE��す。以下�E「予定一覧」から、ユーザーが削除しよぁE��してぁE��予定を抽出してください、E
    抽出忁E��頁E��:
    - name�E�予定名�E�E
    - start_time�E�予定一覧から正確なYYYY-MM-DD HH:MM:SS形式�E値を引用�E�E
    - end_time�E�予定一覧から正確なYYYY-MM-DD HH:MM:SS形式�E値を引用�E�E
    出力�EJSON配�Eのみ、他テキスト禁止。褁E��頁E��があろうが無かろぁE��2次允E��ストで返す、E
    現在時刻は{current_time}
    予定一覧:{task_list_json}
    ユーザー入劁E{input_value}
    """
    
    # 予定変更プロンプト
    CHANGE_CALENDAR_PROMPT_TEMPLATE = """
    目樁Eユーザーが変更したぁE��定�E惁E��の抽出
    抽出忁E��頁E��:
    - before_name�E�変更前�E予定名�E�E
    - before_start_time�E�変更前�E正確な時刻を予定一覧から引用 YYYY-MM-DD HH:MM:SS�E�E
    - before_end_time�E�変更前�E正確な時刻を予定一覧から引用 YYYY-MM-DD HH:MM:SS�E�E
    - after_name (変更後�E予定名。変更がなければbefore_nameを引用)
    - after_start_time (変更後�E開始時刻 YYYY-MM-DD HH:MM:SS)
    - after_end_time (変更後�E終亁E��刻 YYYY-MM-DD HH:MM:SS)
    出力�EJSON配�Eのみ、他テキスト禁止。単独でも褁E��あっても２次允E��ストで返す
    現在時刻は{current_time}
    予定一覧:{task_list_json}
    ユーザー入劁E{input_value}
    """
    
    #時刻確認�Eロンプト
    TIME_GET_PROMPT_TEMPLATE = """
    目標：ユーザーが求めてぁE��ように、以下�E時刻惁E��を編雁E��て返してください、E
    例：何年�E��E20xx年、令和x年です。　何時�E�：午後xx時xx刁Ex秒です。　何日�E�！E0xx年xx朁Ex日です、E
    無駁E��惁E��を含めず、的確にユーザーが求めてぁE��返答を返してください。返答�E最大20斁E��以冁E��してください、E
    曜日はチE��ラーの公式などを使って計算してください、E
    現在時刻は{current_time}
    ユーザー入劁E{input_value}
    """

    # 収支登録プロンプト
    ADD_INCOME_EXPENSE_PROMPT_TEMPLATE = """
    目樁E ユーザーが登録したぁE��支惁E��を抽出
    抽出忁E��頁E��:
    - type�E�収入また�E支出�E�E
    - category�E�カチE��リ、侁E 食費、交通費、給与など�E�E
    - amount�E���額！E
    - date�E�日付、未持E��時は当日/推測日仁EYYYY-MM-DD�E�E
    出力�EJSON配�Eのみ、他テキスト禁止。単独でも褁E��あってめE次允E��ストで返す、E
    現在時刻:{current_time}
    ユーザー入劁E{input_value}
    """

    # 収支取得�Eロンプト
    GET_INCOME_EXPENSE_PROMPT_TEMPLATE = """
    目樁E ユーザーが取得したい収支惁E��の期間とカチE��リを抽出、E
    抽出忁E��頁E��:
    - start_date�E�未持E��時は当月1日 YYYY-MM-DD�E�E
    - end_date�E�未持E��時は当月末日 YYYY-MM-DD�E�E
    - category�E�任意、未持E��時は全て�E�E
    出力�EJSON配�Eのみ、他テキスト禁止。一つの辞書で渡して、E
    現在時刻:{current_time}
    ユーザー入劁E{input_value}
    """

    # メモ追加プロンプト
    ADD_MEMO_PROMPT_TEMPLATE = """
    目樁E ユーザーが追加したぁE��モの冁E��とタイトルを抽出
    抽出忁E��頁E��:
    - title�E�メモのタイトル�E�E
    - content�E�メモの冁E���E�E
    出力�EJSON配�Eのみ、他テキスト禁止。単独でも褁E��あってめE次允E��ストで返す、E
    現在時刻:{current_time}
    ユーザー入劁E{input_value}
    """

    # メモ検索/取得�Eロンプト
    GET_MEMO_PROMPT_TEMPLATE = """
    目樁E ユーザーが検索また�E取得したいメモのキーワードまた�Eタイトルを抽出
    抽出忁E��頁E��:
    - keyword�E�検索キーワード、任意！E
    - title�E�メモのタイトル、任意！E
    出力�EJSON配�Eのみ、他テキスト禁止。一つの辞書で渡して、E
    現在時刻:{current_time}
    ユーザー入劁E{input_value}
    """


    def __init__(self, gemini_api_key: str, calendar_manager=None):
        genai.configure(api_key=gemini_api_key)
        print(gemini_api_key[:-5])
        self.model_name = "gemini-2.5-flash"
        self.model = genai.GenerativeModel(model_name=self.model_name)
        self.schedule_manager = ScheduleManager() # ScheduleManagerのインスタンスを作�E
        self.income_expense_manager = IncomeExpenseManager() # IncomeExpenseManagerのインスタンスを作�E
        self.memo_manager = MemoManager() # MemoManagerのインスタンスを作�E
        
    def _gemini_request(self, prompt: str) -> str:
        print(f"--- [DEBUG] geminiに解析リクエスチEnユーザー入劁E{prompt}")
        try:
            response = self.model.generate_content(
                contents=prompt
            )
            print(f"--- [DEBUG] Geminiの解筁E {response.text} ---")
            return response.text.strip()
        except Exception as e:
            print(f"Geminiリクエストエラー: {e}")
            return ""

    def _parse_calendar_list(self, text: str) -> list:
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
                'date': x.get('date') or ''
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
            item = {
                'title': x.get('title') or '',
                'content': x.get('content') or '',
                'keyword': x.get('keyword') or ''
            }
            if item['title'] or item['content'] or item['keyword']:
                 parsed_list.append(item)
                 
        return parsed_list


    def check_chat_space(self, input_value: str, user_id: str | None = None) -> dict:
        # (docstring removed due to mojibake)
        print("--- [DEBUG] check_chat_space: Starting ---")
        current_time = datetime.now(JST).strftime('%Y-%m-%d %H:%M:%S')
        
        # 1. 目皁E��宁E(第一解极E
        purpose_prompt = self.PURPOSE_PROMPT_TEMPLATE.format(
            current_time=current_time,
            input_value=input_value
        )
        print("--- [DEBUG] check_chat_space: Calling _gemini_request for purpose ---")
        purpose = self._gemini_request(purpose_prompt)
        print(f"--- [DEBUG] check_chat_space: Received purpose: {purpose} ---")
        
        result = {"status": "success", "purpose": purpose, "data": None, "message": ""}
        
        if purpose == "Ca":
            data, msg = self._add_calendar(input_value, user_id)
            print(f"DEBUG: _add_calendar returned data={data}, msg={msg}")
            result["data"] = data
            result["message"] = msg
        elif purpose == "Cd":
            result["data"], result["message"] = self._remove_calendar(input_value, user_id)
        elif purpose == "Cg":
            result["data"], result["message"] = self._get_calender(input_value, is_silent=False, user_id=user_id)
        elif purpose == "Cc":
            result["data"], result["message"] = self._change_calendar(input_value, user_id)
        elif purpose == "Ia": # 収支管琁E�E登録
            result["data"], result["message"] = self._add_income_expense(input_value)
        elif purpose == "Ig": # 収支管琁E�E取征E
            result["data"], result["message"] = self._get_income_expense(input_value)
        elif purpose == "Ma": # メモ帳の追加
            result["data"], result["message"] = self._add_memo(input_value)
        elif purpose == "Mg": # メモ帳の検索/取征E
            result["data"], result["message"] = self._get_memo(input_value)
        elif purpose == "Tn":
            time_prompt = self.TIME_GET_PROMPT_TEMPLATE.format(
                current_time=current_time,
                input_value=input_value
            )
            result["message"] = self._gemini_request(time_prompt)
        else:
            result["message"] = purpose
            
        return result

    def _add_calendar(self, text: str, user_id: str | None):
        """カレンダーを追加"""
        current_time = datetime.now(JST).strftime('%Y-%m-%d %H:%M:%S')
        if not user_id:
            return None, "ユーザー未ログイン"
        prompt = self.ADD_CALENDAR_PROMPT_TEMPLATE.format(
            current_time=current_time,
            input_value=text
        )
        raw = self._gemini_request(prompt)
        print(f"--- [DEBUG] _add_calendar: Gemini raw response: {raw} ---")
        list_to_add = self._parse_calendar_list(raw)
        added_events_info = []
        if not list_to_add:
            return None, "予定の追加に失敗しました。入力内容を確認してください。"

        for event in list_to_add:
            try:
                # ScheduleManagerのadd_eventを呼び出ぁE
                print(f"DEBUG: Calling add_event with name={event['name']}, start={event['start_time']}, end={event['end_time']}")
                created_event = self.schedule_manager.add_event(user_id, event['name'], event['start_time'], event['end_time'])
                print(f"DEBUG: add_event returned created_event={created_event}")
                added_events_info.append({
                    "name": created_event.get("summary"),
                    "start_time": created_event.get("start", {}).get("dateTime"),
                    "end_time": created_event.get("end", {}).get("dateTime"),
                    "id": created_event.get("id")
                })
            except Exception as e:
                import traceback
                print(f"カレンダー追加エラー: {e}")
                traceback.print_exc()
                # エラーが発生しても�E琁E��続衁E

        
        print(f"DEBUG: _add_calendar finished. added_events_info={added_events_info}")
        if added_events_info:
            message = f"{len(added_events_info)}件の予定を追加しました。"
            return added_events_info, message
        
        return None, "予定を追加できませんでした。もう一度お試しください。"


    def _to_rfc3339(self, value: str | None) -> str | None:
        """LLMの出力や内部日時をRFC3339に正規化"""
        if not value:
            return value
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
        if not value:
            return value
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


    def _get_calender(self, text: str, is_silent: bool, user_id: str | None):
        """カレンダー取得"""
        """カレンダー取得"""
        if not is_silent and not user_id: return None, "ユーザー未ログイン"
        current_time = datetime.now(JST).strftime('%Y-%m-%d %H:%M:%S')
        prompt = self.GET_CALENDAR_PROMPT_TEMPLATE.format(
            current_time=current_time,
            input_value=text
        )
        raw = self._gemini_request(prompt)
        range_info = self._parse_calendar_list(raw)
        
        start_time_iso = None
        end_time_iso = None

        if range_info and range_info[0].get('start_time') and range_info[0].get('end_time'):
            start_time_iso = self._to_rfc3339(range_info[0]['start_time'])
            end_time_iso = self._to_rfc3339(range_info[0]['end_time'])
        else:
            # LLMが有効な時間篁E��を返さなかった場合、デフォルトで今日1日を取征E
            start = datetime.now(JST)
            end = start + timedelta(days=1)
            start_time_iso = self._to_rfc3339(start.isoformat())
            end_time_iso = self._to_rfc3339(end.isoformat())

        try:
            events = self.schedule_manager.list_events(user_id, time_min=start_time_iso, time_max=end_time_iso)
            
            if events:
                message = f"{len(events)}件の予定が見つかりました。"
                # イベント情報を整形して返す
                formatted_events = []
                for event in events:
                    formatted_events.append({
                        "name": event.get("summary"),
                        "start_time": event.get("start", {}).get("dateTime"),
                        "end_time": event.get("end", {}).get("dateTime"),
                        "id": event.get("id")
                    })
                return formatted_events, message
            else:
                message = "該当の予定は見つかりませんでした。"
                return [], message
        except Exception as e:
            print(f"カレンダー取得エラー: {e}")
            return None, "カレンダーの取得中にエラーが発生しました。"

    def _remove_calendar(self, text: str, user_id: str | None):
        """カレンダー削除"""
        """カレンダー削除"""
        if not user_id: return None, "ユーザー未ログイン"
        task_list, _ = self._get_calender(text, is_silent=True, user_id=user_id) # is_silent=Trueで音声出力抑制
        task_list_json = json.dumps(task_list)

        if not task_list:
            return None, "カレンダーに該当する予定がありません。削除は実行されません。"

        current_time = datetime.now(JST).strftime('%Y-%m-%d %H:%M:%S')
        prompt = self.REMOVE_CALENDAR_PROMPT_TEMPLATE.format(
            current_time=current_time,
            task_list_json=task_list_json,
            input_value=text
        )
        raw = self._gemini_request(prompt)
        events_to_delete = self._parse_calendar_list(raw)
        
        deleted_events_info = []
        if not events_to_delete:
            return None, "削除対象の予定を特定できませんでした。"

        for event_to_delete in events_to_delete:
            # LLM????????????????task_list???????????event_id???
            target_event_id = None
            for task in task_list:
                task_name = task.get("name")
                task_start = self._normalize_time_for_compare(task.get("start_time"))
                task_end = self._normalize_time_for_compare(task.get("end_time"))
                delete_name = event_to_delete.get("name")
                delete_start = self._normalize_time_for_compare(event_to_delete.get("start_time"))
                delete_end = self._normalize_time_for_compare(event_to_delete.get("end_time"))

                if task_name == delete_name and task_start == delete_start and task_end == delete_end:
                    target_event_id = task.get("id")
                    break
            if target_event_id:
                try:
                    self.schedule_manager.delete_event(user_id, target_event_id)
                    deleted_events_info.append(event_to_delete)
                except Exception as e:
                    print(f"予定削除エラー: {e}")
            else:
                print(f"削除対象のイベンチEDが見つかりませんでした: {event_to_delete}")
        
        if deleted_events_info:
            message = f"{len(deleted_events_info)}件の予定を削除しました。"
            return deleted_events_info, message
        
        return None, "削除対象の予定が見つかりませんでした。"
        
    def _change_calendar(self, text: str, user_id: str | None):
        """カレンダー変更"""
        if not user_id:
            return None, "ユーザー未ログイン"
        task_list, _ = self._get_calender(text, is_silent=True, user_id=user_id)
        task_list_json = json.dumps(task_list)
        if not task_list:
            return None, "カレンダーに該当する予定がありません。変更は実行されません。"
        current_time = datetime.now(JST).strftime('%Y-%m-%d %H:%M:%S')
        prompt = self.CHANGE_CALENDAR_PROMPT_TEMPLATE.format(
            current_time=current_time,
            task_list_json=task_list_json,
            input_value=text
        )
        raw = self._gemini_request(prompt)
        events_to_change = self._parse_calendar_list(raw)
        changed_events_info = []
        for event_to_change in events_to_change:
            try:
                target_event_id = event_to_change.get("id")
                if not target_event_id:
                    continue
                updated_event = self.schedule_manager.update_event(
                    user_id,
                    target_event_id,
                    new_start_iso=event_to_change.get("after_start_time"),
                    new_end_iso=event_to_change.get("after_end_time"),
                    new_summary=event_to_change.get("after_name")
                )
                changed_events_info.append({
                    "before_name": event_to_change.get("before_name"),
                    "after_name": (updated_event or {}).get("summary"),
                    "before_start_time": event_to_change.get("before_start_time"),
                    "after_start_time": (updated_event or {}).get("start", {}).get("dateTime"),
                    "after_end_time": (updated_event or {}).get("end", {}).get("dateTime"),
                    "id": (updated_event or {}).get("id")
                })
            except Exception as e:
                print(f"イベント変更エラー: {e}")
        if changed_events_info:
            message = f"{len(changed_events_info)}件の予定を変更しました。"
            return changed_events_info, message
        return None, "変更対象の予定が見つかりませんでした。"

    def _add_income_expense(self, text: str):
        """収支の追加"""
        """収支の追加"""
        prompt = self.ADD_INCOME_EXPENSE_PROMPT_TEMPLATE.format(
            current_time=current_time,
            input_value=text
        )
        raw = self._gemini_request(prompt)
        income_expenses_to_add = self._parse_income_expense_list(raw)

        added_info = []
        if not income_expenses_to_add:
            return None, "収支の追加に失敗しました。入力内容を確認してください。"

        for ie in income_expenses_to_add:
            try:
                created_record = self.income_expense_manager.add_record(ie['type'], ie['category'], ie['amount'], ie['date'])
                added_info.append(created_record)
            except Exception as e:
                print(f"収支登録エラー: {e}")
        
        if added_info:
            message = f"{len(added_info)}件の収支を追加しました。"
            return added_info, message
        
        return None, "収支の追加は行われませんでした。"

    def _get_income_expense(self, text: str):
        """収支の取得"""
        """収支の取得"""
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
        
        # チE��ォルト値の設宁E
        if not start_date:
            start_date = datetime.now(JST).replace(day=1).strftime('%Y-%m-%d')
        if not end_date:
            today = datetime.now(JST)
            next_month = today.replace(day=28) + timedelta(days=4)
            end_date = (next_month - timedelta(days=next_month.day)).strftime('%Y-%m-%d')

        try:
            records = self.income_expense_manager.list_records(start_date=start_date, end_date=end_date, category=category)
            
            if records:
                message = f"{len(records)}件の収支が見つかりました。"
                return records, message
            else:
                message = "該当する収支は見つかりませんでした。"
                return [], message
        except Exception as e:
            print(f"収支取得エラー: {e}")
            return None, "収支の取得中にエラーが発生しました。"

    def _add_memo(self, text: str):
        """メモ追加"""
        """メモ追加"""
        prompt = self.ADD_MEMO_PROMPT_TEMPLATE.format(
            current_time=current_time,
            input_value=text
        )
        raw = self._gemini_request(prompt)
        memos_to_add = self._parse_memo_list(raw)

        added_info = []
        if not memos_to_add:
            return None, "メモの追加に失敗しました。入力内容を確認してください。"

        for memo in memos_to_add:
            try:
                created_memo = self.memo_manager.add_memo(memo['title'], memo['content'])
                added_info.append(created_memo)
            except Exception as e:
                print(f"メモ追加エラー: {e}")
        
        if added_info:
            message = f"{len(added_info)}件のメモを追加しました。"
            return added_info, message
        
        return None, "メモの追加は行われませんでした。"

    def _get_memo(self, text: str):
        """メモ検索/取得"""
        current_time = datetime.now(JST).strftime('%Y-%m-%d %H:%M:%S')
        prompt = self.GET_MEMO_PROMPT_TEMPLATE.format(
            current_time=current_time,
            input_value=text
        )
        raw = self._gemini_request(prompt)
        search_info = self._parse_memo_list(raw)

        keyword = None
        title = None

        if search_info and search_info[0]:
            keyword = search_info[0].get('keyword')
            title = search_info[0].get('title')
        
        if not keyword and not title:
            return None, "メモの検索に必要なキーワードまたはタイトルが指定されていません。"

        try:
            memos = self.memo_manager.search_memos(keyword=keyword, title=title)
            
            if memos:
                message = f"{len(memos)}件のメモが見つかりました。"
                return memos, message
            else:
                message = "該当するメモは見つかりませんでした。"
                return [], message
        except Exception as e:
            print(f"メモ検索/取得エラー: {e}")
            return None, "メモの取得中にエラーが発生しました。"










