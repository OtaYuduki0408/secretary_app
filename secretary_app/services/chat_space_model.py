import os
import re
import json
from datetime import datetime, timedelta
import google.generativeai as genai # 変更
from services.ScheduleManager import ScheduleManager


class ChatSpaceModel:
    """
    ユーザー入力に基づいてLLMを介して意図を解析し、
    カレンダー操作を実行するコアモデルクラス。
    """
    
    # 意図判定プロンプト
    PURPOSE_PROMPT_TEMPLATE = """
    以下のテキストの目的を分析し、対応する機能を大文字、対応する行動を小文字で返してください。
    命令を確実に実現できる機能がない場合、機能を使わず、最適と思われる解答をしてください。その場合、返答は最大30文字以内でなるべく少なくしてください。
    -機能-
    C:カレンダー
    I:収支管理
    T:時刻、年月日、曜日確認(行動はn)
    R:過去の命令の修正(行動はn)
    -行動-
    a:追加
    d:削除
    c:変更
    g:取得
    例：カレンダーへの追加がユーザーの目的なら、Caを返す。
    -情報-
    ユーザーの入力:{input_value}
    """
    
    # 予定追加プロンプト
    ADD_CALENDAR_PROMPT_TEMPLATE = """
    目標: ユーザーが追加したい予定の抽出
    抽出必須項目:
    - name（予定名）
    - start_time（未指定時は当日/推測時刻）
    - end_time（未指定時は開始1H後）
    timeはYYYY-MM-DD HH:MM:SS
    出力はJSON配列のみ、他テキスト禁止。単独でも複数あっても2次元リストで返す。
    現在時刻:{current_time}
    ユーザー入力:{input_value}
    """
    
    # 予定取得プロンプト
    GET_CALENDAR_PROMPT_TEMPLATE = """
    目標: ユーザーが取得、操作したい情報が存在するであろう時間の範囲の抽出。複数日の場合もある。
    抽出必須項目:
    - start_time
    - end_time
    timeはYYYY-MM-DD HH:MM:SS
    出力はJSON配列のみ、最小範囲は1日、最大範囲は半年で、一つの辞書で渡して。他テキスト禁止。
    現在時刻は{current_time}
    ユーザー入力:{input_value}
    """
    
    # 予定削除プロンプト
    REMOVE_CALENDAR_PROMPT_TEMPLATE = """
    目標: ユーザーはカレンダーから予定を削除しようとしています。以下の「予定一覧」から、ユーザーが削除しようとしている予定を抽出してください。
    抽出必須項目:
    - name（予定名）
    - start_time（予定一覧から正確なYYYY-MM-DD HH:MM:SS形式の値を引用）
    - end_time（予定一覧から正確なYYYY-MM-DD HH:MM:SS形式の値を引用）
    出力はJSON配列のみ、他テキスト禁止。複数項目があろうが無かろうが2次元リストで返す。
    現在時刻は{current_time}
    予定一覧:{task_list_json}
    ユーザー入力:{input_value}
    """
    
    # 予定変更プロンプト
    CHANGE_CALENDAR_PROMPT_TEMPLATE = """
    目標:ユーザーが変更したい予定の情報の抽出
    抽出必須項目:
    - before_name（変更前の予定名）
    - before_start_time（変更前の正確な時刻を予定一覧から引用 YYYY-MM-DD HH:MM:SS）
    - before_end_time（変更前の正確な時刻を予定一覧から引用 YYYY-MM-DD HH:MM:SS）
    - after_name (変更後の予定名。変更がなければbefore_nameを引用)
    - after_start_time (変更後の開始時刻 YYYY-MM-DD HH:MM:SS)
    - after_end_time (変更後の終了時刻 YYYY-MM-DD HH:MM:SS)
    出力はJSON配列のみ、他テキスト禁止。単独でも複数あっても２次元リストで返す
    現在時刻は{current_time}
    予定一覧:{task_list_json}
    ユーザー入力:{input_value}
    """
    
    #時刻確認プロンプト
    TIME_GET_PROMPT_TEMPLATE = """
    目標：ユーザーが求めているように、以下の時刻情報を編集して返してください。
    例：何年？→20xx年、令和x年です。　何時？：午後xx時xx分xx秒です。　何日？：20xx年xx月xx日です。
    無駄な情報を含めず、的確にユーザーが求めている返答を返してください。返答は最大20文字以内にしてください。
    曜日はツェラーの公式などを使って計算してください。
    現在時刻は{current_time}
    ユーザー入力:{input_value}
    """


    def __init__(self, gemini_api_key: str, calendar_manager=None): # 変更
        genai.configure(api_key=gemini_api_key) # 変更
        print(gemini_api_key[:-5])
        self.model_name = "gemini-2.5-flash" # 変更
        self.model = genai.GenerativeModel(model_name=self.model_name) # 変更
        self.manager = ScheduleManager() # ScheduleManagerのインスタンスを作成
        
    def _gemini_request(self, prompt: str) -> str: # 変更
        print(f"--- [DEBUG] geminiに解析リクエスト\nユーザー入力={prompt}") # 変更
        try:
            response = self.model.generate_content( # 変更
                contents=prompt
            )
            print(f"--- [DEBUG] Geminiの解答: {response.text} ---") # 変更
            return response.text.strip()
        except Exception as e:
            print(f"Geminiリクエストエラー: {e}") # 変更
            return ""

    def _parse_calendar_list(self, text: str) -> list:
        # ... (前回の回答と同じ実装を想定)
        if not text: return []
        match = re.search(r"```json\s*([\s\S]*?)\s*```", text, re.I)
        s = match.group(1) if match else text
        
        data = None
        try:
            data = json.loads(s)
        except json.JSONDecodeError:
            print("JSON解析失敗: LLMが出力したJSON形式が不正です。")
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


    def check_chat_space(self, input_value: str) -> dict:
        """ユーザー入力を解析・処理するメインエントリポイント"""
        print("--- [DEBUG] check_chat_space: Starting ---")
        current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        # 1. 目的判定 (第一解析)
        purpose_prompt = self.PURPOSE_PROMPT_TEMPLATE.format(
            current_time=current_time,
            input_value=input_value
        )
        print("--- [DEBUG] check_chat_space: Calling _gemini_request for purpose ---")
        purpose = self._gemini_request(purpose_prompt)
        print(f"--- [DEBUG] check_chat_space: Received purpose: {purpose} ---")
        
        result = {"status": "success", "purpose": purpose, "data": None, "message": ""}
        
        if purpose == "Ca":
            data, msg = self._add_calendar(input_value)
            print(f"DEBUG: _add_calendar returned data={data}, msg={msg}") # デバッグ用
            result["data"] = data
            result["message"] = msg
        elif purpose == "Cd":
            result["data"], result["message"] = self._remove_calendar(input_value)
        elif purpose == "Cg":
            result["data"], result["message"] = self._get_calender(input_value, is_silent=False)
        elif purpose == "Cc":
            result["data"], result["message"] = self._change_calendar(input_value)
        elif purpose == "Tn":
            time_prompt = self.TIME_GET_PROMPT_TEMPLATE.format(
                current_time=current_time,
                input_value=input_value
            )
            result["message"] = self._gemini_request(time_prompt)
        else:
            result["message"] = purpose
            
        return result

    def _add_calendar(self, text: str):
        """予定追加（Ca）"""
        current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        prompt = self.ADD_CALENDAR_PROMPT_TEMPLATE.format(
            current_time=current_time,
            input_value=text
        )
        raw = self._gemini_request(prompt)
        print(f"--- [DEBUG] _add_calendar: Gemini raw response: {raw} ---")
        list_to_add = self._parse_calendar_list(raw)
        
        added_events_info = []
        if not list_to_add:
            return None, "予定の抽出に必要な情報が不足しているか、AIが予定を特定できませんでした。"

        for event in list_to_add:
            try:
                # ScheduleManagerのadd_eventを呼び出す
                print(f"DEBUG: Calling add_event with name={event['name']}, start={event['start_time']}, end={event['end_time']}") # デバッグ用
                created_event = self.manager.add_event(event['name'], event['start_time'], event['end_time'])
                print(f"DEBUG: add_event returned created_event={created_event}") # デバッグ用
                added_events_info.append({
                    "name": created_event.get("summary"),
                    "start_time": created_event.get("start", {}).get("dateTime"),
                    "end_time": created_event.get("end", {}).get("dateTime"),
                    "id": created_event.get("id")
                })
            except Exception as e:
                import traceback
                print(f"予定追加エラー: {e}")
                traceback.print_exc() # スタックトレースを出力
                # エラーが発生しても処理を続行

        
        print(f"DEBUG: _add_calendar finished. added_events_info={added_events_info}") # デバッグ用
        if added_events_info:
            message = f"{len(added_events_info)}件の予定の追加が完了いたしました。" 
            return added_events_info, message
        
        return None, "予定の追加処理を試みましたが、すべて失敗しました。"


    def _get_calender(self, text: str, is_silent: bool):
        """予定取得（Cg）"""
        current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        prompt = self.GET_CALENDAR_PROMPT_TEMPLATE.format(
            current_time=current_time,
            input_value=text
        )
        raw = self._gemini_request(prompt)
        range_info = self._parse_calendar_list(raw)
        
        start_time_iso = None
        end_time_iso = None

        if range_info and range_info[0].get('start_time') and range_info[0].get('end_time'):
            start_time_iso = range_info[0]['start_time']
            end_time_iso = range_info[0]['end_time']
        else:
            # LLMが有効な時間範囲を返さなかった場合、デフォルトで今日1日を取得
            start = datetime.now()
            end = start + timedelta(days=1)
            start_time_iso = start.isoformat() + "Z"
            end_time_iso = end.isoformat() + "Z"

        try:
            events = self.manager.list_events(time_min=start_time_iso, time_max=end_time_iso)
            
            if events:
                message = f"予定を{len(events)}件見つけました。"
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
                message = "該当する期間に予定は見つかりませんでした。"
                return [], message
        except Exception as e:
            print(f"カレンダー取得エラー: {e}")
            return None, "カレンダーの取得中にエラーが発生しました。"

    def _remove_calendar(self, text: str):
        """予定削除（Cd）"""
        # 削除対象を特定するために、まず予定を取得する
        task_list, _ = self._get_calender(text, is_silent=True) # is_silent=Trueで音声出力抑制
        task_list_json = json.dumps(task_list)

        if not task_list:
            return None, "カレンダーに該当する予定が見つからなかったため、削除処理を中断します。"

        current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
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
            # LLMが出力した情報と、実際に取得したtask_listを比較して、削除対象のevent_idを特定
            target_event_id = None
            for task in task_list:
                # 厳密な比較が必要。name, start_time, end_timeが一致するか
                # ここでは簡易的にnameとstart_timeで比較
                if task.get("name") == event_to_delete.get("name") and \
                   task.get("start_time") == event_to_delete.get("start_time"):
                    target_event_id = task.get("id")
                    break
            
            if target_event_id:
                try:
                    self.manager.delete_event(target_event_id)
                    deleted_events_info.append(event_to_delete)
                except Exception as e:
                    print(f"予定削除エラー: {e}")
            else:
                print(f"削除対象のイベントIDが見つかりませんでした: {event_to_delete}")
        
        if deleted_events_info:
            message = f"{len(deleted_events_info)}件の予定の削除が完了いたしました。"
            return deleted_events_info, message
        
        return None, "削除対象の予定を特定できませんでした。"
        
    def _change_calendar(self, text: str):
        """予定変更（Cc）"""
        # 変更対象を特定するために、まず予定を取得する
        task_list, _ = self._get_calender(text, is_silent=True) # is_silent=Trueで音声出力抑制
        task_list_json = json.dumps(task_list)

        if not task_list:
            return None, "カレンダーに該当する予定が見つからなかったため、変更処理を中断します。"

        current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        prompt = self.CHANGE_CALENDAR_PROMPT_TEMPLATE.format(
            current_time=current_time,
            task_list_json=task_list_json,
            input_value=text
        )
        raw = self._gemini_request(prompt)
        events_to_change = self._parse_calendar_list(raw)
        
        changed_events_info = []
        if not events_to_change:
            return None, "変更対象の予定とその内容を特定できませんでした。"

        for event_to_change in events_to_change:
            # LLMが出力した情報と、実際に取得したtask_listを比較して、変更対象のevent_idを特定
            target_event_id = None
            for task in task_list:
                # 厳密な比較が必要。before_name, before_start_time, before_end_timeが一致するか
                if task.get("name") == event_to_change.get("before_name") and \
                   task.get("start_time") == event_to_change.get("before_start_time"):
                    target_event_id = task.get("id")
                    break
            
            if target_event_id:
                try:
                    updated_event = self.manager.update_event(
                        target_event_id,
                        new_summary=event_to_change.get("after_name"),
                        new_start_iso=event_to_change.get("after_start_time"),
                        new_end_iso=event_to_change.get("after_end_time")
                    )
                    changed_events_info.append({
                        "before_name": event_to_change.get("before_name"),
                        "after_name": updated_event.get("summary"),
                        "before_start_time": event_to_change.get("before_start_time"),
                        "after_start_time": updated_event.get("start", {}).get("dateTime"),
                        "after_end_time": updated_event.get("end", {}).get("dateTime"),
                        "id": updated_event.get("id")
                    })
                except Exception as e:
                    print(f"予定変更エラー: {e}")
            else:
                print(f"変更対象のイベントIDが見つかりませんでした: {event_to_change}")
        
        if changed_events_info:
            message = f"{len(changed_events_info)}件の予定の変更が完了いたしました。"
            return changed_events_info, message
        
        return None, "変更対象の予定とその内容を特定できませんでした。"