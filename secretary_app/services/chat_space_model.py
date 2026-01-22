import os
import re
import json
from datetime import datetime, timedelta
import pytz
import functools
import csv
JST = pytz.timezone('Asia/Tokyo')
import google.generativeai as genai

# Local calendar service
from services import local_calendar_service

from services.finance_service import (
    get_all_finance_records, get_finance_summary, get_current_balance,
    get_monthly_expense, get_daily_expense
)
from services.MemoManager import MemoManager
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
    目的: ユーザーが追加したいメモの内容とタイトルを抽出
    抽出項目:
    - title (メモのタイトル)
    - content (メモの内容)
    出力はJSON配列のみ、他テキスト禁止。単独でも複数あっても二次配列で返す。
    現在時刻:{current_time}
    ユーザー入力: {input_value}
    """
    GET_MEMO_PROMPT_TEMPLATE = """
    目的: ユーザーが検索または取得したいメモのキーワードまたはタイトルを抽出
    抽出項目:
    - keyword (検索キーワード、任意)
    - title (メモのタイトル、任意)
    出力はJSON配列のみ、他テキスト禁止。一つの辞書で渡して。
    現在時刻:{current_time}
    ユーザー入力: {input_value}
    """
    SWITCHBOT_OPERATION_PROMPT_TEMPLATE = """
    目的: ユーザーが操作したいSwitchBotデバイスと、そのデバイスに対して実行したいコマンドを抽出。
    利用可能なデバイスと機能のリスト: {available_devices_json}
    抽出項目:
    - device_id (操作対象のデバイスID)
    - command_type (コマンドタイプ。例: "command", "customize")
    - command (実行するコマンド。例: "turnOn", "turnOff", "press")
    - parameter (コマンドのパラメータ。例: "default", "25", "on")
    出力はJSON配列のみ、他テキスト禁止。単独でも複数あっても二次配列で返す。
    現在時刻:{current_time}
    ユーザー入力: {input_value}
    """

    def __init__(self, gemini_api_key: str, calendar_manager=None):
        genai.configure(api_key=gemini_api_key)
        self.model_name = "gemini-2.5-flash"
        self.model = genai.GenerativeModel(model_name=self.model_name)
        self.memo_manager = MemoManager()

    def _log_gemini_request(self, timestamp: str, input_content: str, process_type: str, output_content: str):
        log_file_path = os.getenv("GEMINI_LOG_FILE", "gemini_requests.csv")
        file_exists = os.path.exists(log_file_path)
        with open(log_file_path, 'a', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            if not file_exists:
                writer.writerow(["Timestamp", "Input Content", "Process Type", "Output Content"])
            writer.writerow([timestamp, input_content, process_type, output_content])
        print(f"--- [DEBUG] Geminiリクエストログを記録: {process_type} ---")
    
    def _gemini_request(self, prompt: str) -> str:
        print(f"--- [DEBUG] geminiに解析リクエスト (ユーザー入力: {prompt}) ---")
        timestamp = datetime.now(JST).isoformat()
        initial_hits = _cached_gemini_request_impl.cache_info().hits
        response_text = _cached_gemini_request_impl(self.model, prompt)
        final_hits = _cached_gemini_request_impl.cache_info().hits
        process_type = "CACHE_HIT" if final_hits > initial_hits else "API_CALL"
        self._log_gemini_request(timestamp, prompt, process_type, response_text)
        return response_text

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
            item = {
                'title': x.get('title') or '',
                'content': x.get('content') or '',
                'keyword': x.get('keyword') or ''
            }
            if item['title'] or item['content'] or item['keyword']:
                 parsed_list.append(item)
                 
        return parsed_list

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


    def check_chat_space(self, input_value: str, user_id: str | None = None) -> dict:
        print("--- [DEBUG] check_chat_space: Starting ---")
        current_time = datetime.now(JST).strftime('%Y-%m-%d %H:%M:%S')
        purpose_prompt = self.PURPOSE_PROMPT_TEMPLATE.format(current_time=current_time, input_value=input_value)
        purpose = self._gemini_request(purpose_prompt)
        print(f"--- [DEBUG] check_chat_space: Received purpose: {purpose} ---")
        result = {"status": "success", "purpose": purpose, "data": None, "message": ""}
        
        if purpose == "Ca":
            data, msg = self._add_calendar(input_value, user_id)
            result["data"] = data
            result["message"] = msg
        elif purpose == "Cd":
            result["data"], result["message"] = self._remove_calendar(input_value, user_id)
        elif purpose == "Cg":
            result["data"], result["message"] = self._get_calender(input_value, is_silent=False, user_id=user_id)
        elif purpose == "Cc":
            result["data"], result["message"] = self._change_calendar(input_value, user_id)
        # ... (other purpose handling remains the same) ...
        elif purpose == "Ia":
            result["data"], result["message"] = self._add_income_expense(input_value, user_id)
        elif purpose == "Ig":
            result["data"], result["message"] = self._get_income_expense(input_value, user_id)
        elif purpose == "Ma":
            result["data"], result["message"] = self._add_memo(input_value)
        elif purpose == "Mg":
            result["data"], result["message"] = self._get_memo(input_value)
        elif purpose == "Tn":
            time_prompt = self.TIME_GET_PROMPT_TEMPLATE.format(current_time=current_time, input_value=input_value)
            result["message"] = self._gemini_request(time_prompt)
        elif purpose == "Sn":
            result["data"], result["message"] = self._get_switchbot_devices(input_value, user_id)
        else:
            result["message"] = "申し訳ございません。お客様の意図を特定できませんでした。"
            print(f"DEBUG: 意図不明なpurpose: {purpose}")
            
        return result

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
                start_time = self._parse_datetime(event_data.get('start_time'))
                end_time = self._parse_datetime(event_data.get('end_time'))
                if not start_time: continue

                if not end_time:
                    end_time = start_time + timedelta(hours=1)
                
                new_event = local_calendar_service.add_event(
                    user_id=user_id,
                    title=event_data['name'],
                    start_time=start_time,
                    end_time=end_time
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
            start_time_iso = self._to_rfc3339(range_info[0].get('start_time'))
            end_time_iso = self._to_rfc3339(range_info[0].get('end_time'))

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
                 # A simple match by name and time for now. Could be improved.
                if task.get("name") == event_data.get("name"):
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
                        "start_time": self._parse_datetime(event_data.get("after_start_time")),
                        "end_time": self._parse_datetime(event_data.get("after_end_time")),
                    }
                    # Remove None values so we don't overwrite with nulls
                    update_payload = {k: v for k, v in update_payload.items() if v is not None}
                    
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

    def _add_memo(self, text: str):
        """メFモ追加"""
        current_time = datetime.now(JST).strftime('%Y-%m-%d %H:%M:%S')
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
        print(f"--- [DEBUG] _get_memo: Prompt for Gemini: {prompt} ---")
        raw = self._gemini_request(prompt)
        print(f"--- [DEBUG] _get_memo: Gemini raw response: {raw} ---")
        search_info = self._parse_memo_list(raw)
        print(f"--- [DEBUG] _get_memo: Parsed memo search info: {search_info} ---")

        keyword = None
        title = None

        if search_info and search_info[0]:
            keyword = search_info[0].get('keyword')
            title = search_info[0].get('title')
        
        if not keyword and not title:
            return None, "メモの検索に必要なキーワードまたはタイトルが指定されていません。"

        try:
            print(f"--- [DEBUG] _get_memo: Calling MemoManager.search_memos with keyword='{keyword}', title='{title}' ---")
            memos = self.memo_manager.search_memos(keyword=keyword, title=title)
            print(f"--- [DEBUG] _get_memo: MemoManager.search_memos returned: {memos} ---")
            
            if memos:
                message = f"{len(memos)}件のメモが見つかりました。"
                return memos, message
            else:
                message = "該当するメモは見つかりませんでした。"
                return [], message
        except Exception as e:
            print(f"--- [ERROR] _get_memo: メモ検索/取得エラー: {e} ---")
            return None, "メモの取得中にエラーが発生しました。"
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