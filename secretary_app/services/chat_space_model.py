import os
import re
import json
from datetime import datetime, timedelta
import pytz
JST = pytz.timezone('Asia/Tokyo')
import google.generativeai as genai
from services.ScheduleManager import ScheduleManager
# IncomeExpenseManagerとMemoManagerのインポ�Eトを追加 (これら�Eファイルは別途作�Eが忁E��でぁE
from services.finance_service import (
    get_all_finance_records, get_finance_summary, get_current_balance,
    get_monthly_expense, get_daily_expense
)
from services.MemoManager import MemoManager


class ChatSpaceModel:
    

    # 意図判定プロンプト
    PURPOSE_PROMPT_TEMPLATE = """
    以下のリストの目的と照合し、対応する機能を大文字、対応する行動を小文字で返してください。
    命令を確実に実現できる機能がない場合、機能を使わず、最適と思われる解答をしてください。その場合、返答は最大
    30文字以内となるべく少なくしてください。
    -機能-
    C:カレンダー
    I:収支管理 (例: 所持金、残高、今月の使用額、今日の使用額、収支の記録、支出の記録、収入の記録)
    M:メモ帳
    T:時刻、年月日、曜日確認(行動はn)
    R:過去の命令の修正(行動はn)
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
    
    # 予定追加プロンプト
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
    
    # 予定取得プロンプト
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
        
    # 予定削除プロンプト
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
    
    # 予定変更プロンプト
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
    
    #時刻確認プロンプト
    TIME_GET_PROMPT_TEMPLATE = """
    目標：ユーザーが求めているように、以下の時刻情報を編集して返してください。
    例：何年？→20xx年、令和x年です。　何時？：午後xx時xx分xx秒です。　何日？：20xx年xx月xx日です。
    無駄な情報を含めず、的確にユーザーが求めている返答を返してください。返答は最大20文字以内でしてください。
    曜日はツェラーの公式などを使って計算してください。
    現在時刻は{current_time}
    ユーザー入力: {input_value}
    """
        
    # 収支登録プロンプト
    ADD_INCOME_EXPENSE_PROMPT_TEMPLATE = """
    目的: ユーザーが登録したい収支情報を抽出
    抽出項目:
    - type (収入または支出)
    - category (カテゴリ、例: 食費、交通費、給与など)
    - amount (金額)
    - date (日付、未指定時は当日/推測日付 YYYY-MM-DD)
    出力はJSON配列のみ、他テキスト禁止。単独でも複数あっても二次配列で返す。
    現在時刻:{current_time}
    ユーザー入力: {input_value}
    """

    # 収支取得プロンプト
    GET_INCOME_EXPENSE_PROMPT_TEMPLATE = """
    目的: ユーザーが取得したい収支情報の期間とカテゴリを抽出。
    抽出項目:
    - start_date (未指定時は当月1日 YYYY-MM-DD)
    - end_date (未指定時は当月末日 YYYY-MM-DD)
    - category (任意、未指定時は全て)
    出力はJSON配列のみ、他テキスト禁止。一つの辞書で渡して。
    現在時刻:{current_time}
    ユーザー入力: {input_value}
    """
    
    # メモ追加プロンプト
    ADD_MEMO_PROMPT_TEMPLATE = """
    目的: ユーザーが追加したいメモの内容とタイトルを抽出
    抽出項目:
    - title (メモのタイトル)
    - content (メモの内容)
    出力はJSON配列のみ、他テキスト禁止。単独でも複数あっても二次配列で返す。
    現在時刻:{current_time}
    ユーザー入力: {input_value}
    """
    
    # メモ検索/取得プロンプト
    GET_MEMO_PROMPT_TEMPLATE = """
    目的: ユーザーが検索または取得したいメモのキーワードまたはタイトルを抽出
    抽出項目:
    - keyword (検索キーワード、任意)
    - title (メモのタイトル、任意)
    出力はJSON配列のみ、他テキスト禁止。一つの辞書で渡して。
    現在時刻:{current_time}
    ユーザー入力: {input_value}
    """



    def __init__(self, gemini_api_key: str, calendar_manager=None):
        genai.configure(api_key=gemini_api_key)
        print(gemini_api_key[:-5])
        self.model_name = "gemini-2.5-flash"
        self.model = genai.GenerativeModel(model_name=self.model_name)
        self.schedule_manager = ScheduleManager() # ScheduleManagerのインスタンスを作E
        self.memo_manager = MemoManager() # MemoManagerのインスタンスを作E
    
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

    def _format_event_time(self, iso_time: str) -> str:
        """ISO形式の時刻文字列を「〇月〇日〇時〇分」形式に整形する"""
        if not iso_time:
            return ""
        try:
            dt_object = datetime.fromisoformat(iso_time.replace('Z', '+00:00'))
            dt_jst = dt_object.astimezone(JST)
            return dt_jst.strftime('%m月%d日%H時%M分')
        except ValueError:
            return iso_time # パースできない場合はそのまま返す

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
            result["data"], result["message"] = self._get_income_expense(input_value, user_id)
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
            # 読み上げメッセージを生成
            event_details = []
            for i, event in enumerate(added_events_info):
                if i >= 5: # 最大5件に制限
                    break
                start_time_str = self._format_event_time(event.get("start_time"))
                event_details.append(f"{start_time_str}に{event.get('name')}の予定")
            
            message = f"{'、'.join(event_details)}。以上{len(added_events_info)}件の予定を追加しました。"
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
                # 読み上げメッセージを生成 (すべてのイベントを読み上げる)
                event_details = []
                for event in events:
                    start_time_str = self._format_event_time(event.get("start", {}).get("dateTime"))
                    event_details.append(f"{start_time_str}に{event.get('summary')}の予定")
                
                message = f"{'、'.join(event_details)}。以上{len(events)}件の予定が見つかりました。"

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
                    # ScheduleManagerのdelete_eventを呼び出し、返り値を利用
                    delete_result = self.schedule_manager.delete_event(user_id, target_event_id)
                    deleted_events_info.append({
                        "name": delete_result["event"].get("summary"),
                        "start_time": delete_result["event"].get("start", {}).get("dateTime"),
                        "end_time": delete_result["event"].get("end", {}).get("dateTime"),
                        "id": delete_result["event"].get("id")
                    })
                except Exception as e:
                    print(f"予定削除エラー: {e}")
            else:
                print(f"削除対象のイベントIDが見つかりませんでした: {event_to_delete}")
        
        if deleted_events_info:
            # 読み上げメッセージを生成
            event_details = []
            for i, event in enumerate(deleted_events_info):
                if i >= 5: # 最大5件に制限
                    break
                start_time_str = self._format_event_time(event.get("start_time"))
                event_details.append(f"{start_time_str}の{event.get('name')}の予定")
            
            message = f"{'、'.join(event_details)}。以上{len(deleted_events_info)}件の予定を削除しました。"
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
        if not events_to_change:
            return None, "変更対象の予定を特定できませんでした。"

        for event_to_change in events_to_change:
            target_event_id = None
            # LLMが返した変更前の情報と、取得したタスクリストを比較してIDを特定
            for task in task_list:
                task_name = task.get("name")
                task_start = self._normalize_time_for_compare(task.get("start_time"))
                task_end = self._normalize_time_for_compare(task.get("end_time"))
                
                before_name = event_to_change.get("before_name")
                before_start = self._normalize_time_for_compare(event_to_change.get("before_start_time"))
                before_end = self._normalize_time_for_compare(event_to_change.get("before_end_time"))

                if task_name == before_name and task_start == before_start and task_end == before_end:
                    target_event_id = task.get("id")
                    break
            
            if target_event_id:
                try:
                    update_result = self.schedule_manager.update_event(
                        user_id,
                        target_event_id,
                        new_start_iso=event_to_change.get("after_start_time"),
                        new_end_iso=event_to_change.get("after_end_time"),
                        new_summary=event_to_change.get("after_name"),
                        new_description=event_to_change.get("after_description") # descriptionも考慮
                    )
                    changed_events_info.append({
                        "original_event": {
                            "name": update_result["original_event"].get("summary"),
                            "start_time": update_result["original_event"].get("start", {}).get("dateTime"),
                            "end_time": update_result["original_event"].get("end", {}).get("dateTime"),
                        },
                        "updated_event": {
                            "name": update_result["updated_event"].get("summary"),
                            "start_time": update_result["updated_event"].get("start", {}).get("dateTime"),
                            "end_time": update_result["updated_event"].get("end", {}).get("dateTime"),
                        },
                        "id": update_result["updated_event"].get("id")
                    })
                except Exception as e:
                    print(f"イベント変更エラー: {e}")
            else:
                print(f"変更対象のイベントIDが見つかりませんでした: {event_to_change}")

        if changed_events_info:
            # 読み上げメッセージを生成
            event_details = []
            for i, event in enumerate(changed_events_info):
                if i >= 5: # 最大5件に制限
                    break
                original_start_str = self._format_event_time(event["original_event"].get("start_time"))
                updated_start_str = self._format_event_time(event["updated_event"].get("start_time"))
                
                detail_str = f"{original_start_str}の{event['original_event'].get('name')}の予定を"
                if event['original_event'].get('name') != event['updated_event'].get('name'):
                    detail_str += f"{event['updated_event'].get('name')}に、"
                if original_start_str != updated_start_str:
                    detail_str += f"{updated_start_str}に変更"
                else:
                    detail_str += "変更"
                event_details.append(detail_str)
            
            message = f"{'、'.join(event_details)}。以上{len(changed_events_info)}件の予定を変更しました。"
            return changed_events_info, message
        
        return None, "変更対象の予定が見つかりませんでした。"

    def _add_income_expense(self, text: str, user_id: str | None):
        """収支の追加"""
        if not user_id:
            return None, "ユーザー未ログイン"
        current_time = datetime.now(JST).strftime('%Y-%m-%d %H:%M:%S')
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
                # finance_serviceのadd_finance_recordを呼び出す
                # add_finance_recordはapp.pyでインポートされているが、ここでは直接呼び出せないため、
                # finance_serviceにadd_recordのような関数を追加するか、
                # ここで直接supabaseクライアントを呼び出す必要がある。
                # 今回は、add_finance_recordがuser_idを引数に取ることを考慮し、
                # finance_serviceに新しい関数を追加する前提で進める。
                # 仮に、finance_service.add_finance_record(data, user_id) のような関数があると仮定する。
                # dataは辞書形式でtype, category, amount, dateを含む。
                data = {
                    "type": ie['type'],
                    "category": ie['category'],
                    "amount": ie['amount'],
                    "date": ie['date'],
                    "user_id": user_id # user_idを追加
                }
                # finance_serviceにadd_finance_recordを直接呼び出す関数がないため、
                #
                # 実際には、app.pyのadd_finance_record_routeが呼び出すadd_finance_record関数を
                # chat_space_modelから直接呼び出すのは適切ではない。
                # finance_serviceに新しい関数を追加して、それを呼び出すのが良い。
                # 例: created_record = finance_service.add_finance_record_from_chat(data, user_id)
                # しかし、今回は既存のadd_finance_recordを直接呼び出す形にする。
                # そのためには、add_finance_recordをchat_space_model.pyでインポートする必要がある。
                from services.expense_service import add_finance_record
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
        elif "今日の使用額" in text or "今日の支出" in text:
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

            if filtered_records:
                message = f"{len(filtered_records)}件の収支が見つかりました。"
                return filtered_records, message
            else:
                message = "該当する収支は見つかりませんでした。"
                return [], message
        except Exception as e:
            print(f"収支取得エラー: {e}")
            return None, "収支の取得中にエラーが発生しました。"

    def _add_memo(self, text: str):
        """メモ追加"""
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










