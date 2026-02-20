import os
import re
import json
from datetime import datetime, timedelta
import pytz
import functools
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
JST = pytz.timezone('Asia/Tokyo')
import google.generativeai as genai

# Google calendar service
from services.google_calendar_service import GoogleCalendarService

from services.finance_service import (
    get_all_finance_records, get_finance_summary, get_current_balance,
    get_monthly_expense, get_daily_expense
)
from services.category_service import get_all_categories
from services.memo_service import add_memo as add_memo_record
from services.memo_service import get_all_memos as get_all_memo_records
from services.memo_service import delete_memo as delete_memo_record
from services.memo_service import delete_memos_bulk as delete_memos_bulk_records
from services import switchbot_service
from services import custom_order_service
from services import pending_action_service


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
    I:収支管理
    M:メモ帳
    T:時刻、年月日、曜日確認
    R:過去の命令の修正
    S:SwitchBot iot等
    Y:YouTube再生/操作(検索して再生など)
    Yw:YouTubeウィンドウ展開/チャンネル/履歴/リストの番号選択
    P:プレイリスト操作
    Re:強制終了コマンド
    K:計算
    Ya:肯定的な回答
    Nn:否定的な回答
    Fn:上記以外(雑談、質問)
    -行動-
    a:追加/登録
    d:削除
    c:変更/操作/展開
    g:取得/一覧表示
    s:検索
    p:再生
    n:通常/否定
    -補足-
    「1番を再生」「チャンネル2を開いて」などのリストの番号指定は、再生であってもYwcで返してください。
    -入力-
    ユーザーの入力: {input_value}
    """
    PURPOSE_PROMPT_TEMPLATE_WITH_YT_CONTROL = """
    以下のリストの目的と照合し、対応する機能を大文字、対応する行動を小文字で返してください。
    -機能-
    C:カレンダー
    I:収支管理
    M:メモ帳
    T:時刻、年月日、曜日確認
    R:過去の命令の修正
    S:SwitchBot iot等
    Y:YouTube再生/操作
    Yw:YouTubeウィンドウ展開/チャンネル/履歴
    P:プレイリスト操作
    Re:強制終了コマンド
    K:計算
    Ya:肯定的な回答
    Nn:否定的な回答
    -行動-
    a:追加/登録
    d:削除
    c:変更/操作/展開
    g:取得/一覧表示
    s:検索
    p:再生
    n:通常/否定
    -補足-
    YouTube再生中またはウィンドウ展開中です。
    次/前/再開/スキップ/保存/番号指定などはYc、YouTubeを開く/履歴を表示などはYwgで返してください。
    -入力-
    ユーザーの入力: {input_value}
    """
    YOUTUBE_ADVANCED_CONTROL_PROMPT_TEMPLATE = """
    目的: YouTubeウィンドウの画面切り替えや操作を分類してください。
    JSONのみ出力。
    Keys:
    - intent: string
    - value: string | number
    intent 値:
    - open_window: ウィンドウを展開
    - close_window: ウィンドウを閉じる
    - show_channels: 登録チャンネル一覧を表示
    - open_channel: チャンネルを開く (valueにチャンネル名または番号)
    - play_index: リストの番号で再生 (valueに数値)
    - next: 「次の動画」を再生 (右上の未視聴動画)
    - show_history: 視聴履歴を表示
    - summarize: 動画を要約
    - skip_forward: 10秒スキップ
    - skip_backward: 10秒戻す
    例:
    「チャンネル一覧を開いて」→ {{"intent":"show_channels"}}
    「履歴を見せて」→ {{"intent":"show_history"}}
    「次の動画を流して」→ {{"intent":"next"}}
    ユーザー入力: {input_value}
    """
    CALC_PROMPT_TEMPLATE = """
    以下の命令をpythonのeval関数で計算できるように書き換えてください。
    解答は出力した計算式のみにしてください。
    命令: {input_value}
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
    - color (色指定。紫、赤、青などがあれば抽出)
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
    予定一覧の時刻は日本時間(JST)です。
    現在時刻は{current_time}(JST)
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
    予定一覧の時刻は日本時間(JST)です。
    現在時刻は{current_time}(JST)
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
    - date (日時、未指定時は現在時刻。YYYY-MM-DD HH:MM:SS)
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
    YOUTUBE_CONTROL_PROMPT_TEMPLATE = """
    目的: YouTube再生中の操作意図を分類してください。
    必ずJSONのみで出力してください。
    Keys:
    - intent: string
    - query: string (必要な場合のみ。なければ空文字)
    - reason: string (任意。短く)
    intent 値:
    - next: 次の曲/次の動画
    - prev: 前の曲/前の動画
    - pause: 一時停止
    - resume: 再開
    - seek_forward: 動画を指定秒数進める
    - seek_backward: 動画を指定秒数戻す
    - volume_up: YouTubeプレーヤー音量を上げる
    - volume_down: YouTubeプレーヤー音量を下げる
    - stop: 再生停止
    - close: オーバーレイを閉じる
    - save_current: 今の動画を保存
    - reject_current: 今の動画を除外
    - random: 検索結果キュー内ランダム再生
    - replay: 先頭から再生し直し
    - search_in_results: 現在の検索結果キュー内検索
    - unknown: 判別不能
    例:
    {{"intent":"next","query":"","reason":"次の曲の要求"}}
    {{"intent":"volume_up","query":"","reason":"音量を上げたい"}}
    {{"intent":"seek_forward","query":"","reason":"少し先に進めたい"}}
    {{"intent":"search_in_results","query":"ライブ版","reason":"検索結果内の絞り込み"}}
    ユーザー入力: {input_value}
    """
    YOUTUBE_CONTROL_DETECT_PROMPT_TEMPLATE = """
    目的: ユーザー入力が「YouTube再生中の操作」かを判定し、該当する場合は意図を返してください。
    必ずJSONのみで出力してください。
    Keys:
    - is_youtube_control: boolean
    - intent: string (next/prev/pause/resume/seek_forward/seek_backward/volume_up/volume_down/stop/close/save_current/reject_current/random/replay/search_in_results/unknown)
    - query: string (必要時のみ。なければ空文字)
    - reason: string (短く)
    判定ルール:
    - 現在YouTubeが active=true のとき、音楽再生継続に関する命令は優先してtrue
    - 特に paused=true で「音楽を再生して」「再生して」「流して」は resume
    - カレンダー/メモ/収支など別ドメインが明確なら false
    YouTube状態:
    {youtube_state}
    ユーザー入力: {input_value}
    """
    YOUTUBE_OPERATION_WORD_PROMPT_TEMPLATE = """
    貴方は命令解析のプロです。
    ユーザーはYoutubeでの動画再生や操作を行うのが目的です。
    以下の命令を解析し、ユーザーがどの操作を行いたいかを特定してください。
    解答は、対応する英単語のみを返してください。

    New:新しい曲を流してほしい。(曲名や動画名が取得できる場合はNew)
    Restart:動画を再開して欲しい。(曲名が特定できない”再生して”など)
    Stop:動画を停止して欲しい。
    Next:次の動画を再生して欲しい。
    Previous:前の動画を再生して欲しい。
    Save:動画を保存して欲しい。動画の組み合わせを記録して欲しい
    Rejection:動画の組み合わせがおかしい、この動画を流さないようにしてほしい。

    ユーザー命令:
    {input_value}
    """
    PLAYLIST_PLAY_MODE_PROMPT_TEMPLATE = """
    あなたはプレイリスト再生の命令分類器です。
    ユーザー命令から再生対象と再生順を抽出し、JSONのみで返してください。
    Keys:
    - scope: "artist" | "all" | "recent"
    - artist: string (scopeがartistの時のみ必須。なければ空文字)
    - order: "sequential" | "random"
    ルール:
    - 「アーティスト名で再生」なら scope=artist
    - 「全曲再生」なら scope=all
    - 「直近再生」「最近追加した曲」なら scope=recent
    - 「ランダム」「シャッフル」があれば order=random。なければ sequential
    例:
    {{"scope":"artist","artist":"米津玄師","order":"sequential"}}
    {{"scope":"all","artist":"","order":"random"}}
    {{"scope":"recent","artist":"","order":"sequential"}}
    ユーザー命令: {input_value}
    """
    PLAYLIST_OPERATION_PROMPT_TEMPLATE = """
    あなたはプレイリスト操作の意図分類器です。
    ユーザー命令を解析し、以下のいずれか1語だけを返してください。
    - Add: 現在再生中の曲をプレイリストへ追加
    - Delete: 現在再生中の曲をプレイリストから削除
    - Play: プレイリスト再生方法の指定
    出力ルール:
    - 返答は Add / Delete / Play のどれか1語のみ
    - 句読点や説明は不要
    判定ルール:
    - 「この曲をプレイリストに追加」「今の曲を保存」等は Add
    - 「この曲をプレイリストから削除」「今の曲を消して」等は Delete
    - 「プレイリストを再生」「全曲ランダム」等は Play
    現在再生中の曲:
    - title: {current_title}
    - video_id: {current_video_id}
    - active: {active}
    - paused: {paused}
    ユーザー命令: {input_value}
    """
    ALARM_TRIGGER_CHANGE_PROMPT_TEMPLATE = """
    目的: ユーザー入力が「特殊命令 目覚まし」の時間トリガー変更要求かどうか判定し、変更後時刻を抽出する。
    必ずJSONのみで出力すること。
    Keys:
    - is_alarm_update: boolean
    - time: string (24時間 HH:MM。取得できない場合は空文字)
    - reason: string (任意。簡潔に)
    判定ルール:
    - 「目覚まし」または「アラーム」に関する変更要求であれば is_alarm_update=true
    - 変更/セット/時刻指定の意図がなければ false
    例:
    {{"is_alarm_update": true, "time": "10:00", "reason": "目覚まし時刻の変更要求"}}
    {{"is_alarm_update": false, "time": "", "reason": "目覚まし時刻変更ではない"}}
    現在時刻:{current_time}
    ユーザー入力:{input_value}
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
        self._recent_finance_additions = {}

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

    def _build_youtube_state_text(self, youtube_context: dict | None) -> str:
        ctx = youtube_context or {}
        return (
            f"active={bool(ctx.get('active'))}, "
            f"paused={bool(ctx.get('paused'))}, "
            f"playing={bool(ctx.get('playing'))}, "
            f"overlay_visible={bool(ctx.get('overlay_visible'))}, "
            f"has_queue={bool(ctx.get('has_queue'))}, "
            f"queue_length={int(ctx.get('queue_length') or 0)}, "
            f"current_index={int(ctx.get('current_index') or 0)}, "
            f"current_title={str(ctx.get('current_title') or '')}, "
            f"volume={ctx.get('volume')}"
        )

    def _detect_youtube_control_intent(self, text: str, youtube_context: dict | None = None) -> tuple[str, str] | None:
        """
        YouTube再生中の操作をGeminiで先行判定する。
        返り値: (intent, query)
        """
        cleaned = (text or "").strip()
        if not cleaned:
            return None

        youtube_state = self._build_youtube_state_text(youtube_context)
        detect_prompt = self.YOUTUBE_CONTROL_DETECT_PROMPT_TEMPLATE.format(
            youtube_state=youtube_state,
            input_value=cleaned
        )
        raw = self._gemini_request(detect_prompt)
        data = self._extract_json_payload(raw) or {}
        if not bool(data.get("is_youtube_control")):
            return None
        intent = str(data.get("intent") or "").strip().lower()
        query = str(data.get("query") or "").strip()
        allowed = {
            "next", "prev", "pause", "resume",
            "seek_forward", "seek_backward", "volume_up", "volume_down",
            "stop", "close",
            "save_current", "reject_current", "random", "replay",
            "search_in_results"
        }
        if intent in allowed:
            return (intent, query)
        return None

    def _is_play_or_resume_request(self, text: str) -> bool:
        t = (text or "").strip().lower()
        if not t:
            return False
        return (
            "再生" in text or
            "再開" in text or
            "流して" in text or
            "かけて" in text or
            t in ("流して", "再生して", "再開して")
        )

    def _is_meaningful_youtube_query(self, query: str) -> bool:
        q = (query or "").strip()
        if len(q) < 2:
            return False
        generic = {
            "音楽", "曲", "動画", "youtube", "ユーチューブ", "再生", "再開"
        }
        return q.lower() not in generic

    def _extract_youtube_query_from_input(self, text: str) -> str:
        prompt = self.YOUTUBE_PLAY_PROMPT_TEMPLATE.format(input_value=text)
        raw_json = self._gemini_request(prompt)
        data = self._extract_json_payload(raw_json) or {}
        query = str(data.get("query") or "").strip()
        return query

    def _classify_youtube_operation_word(self, text: str) -> str:
        prompt = self.YOUTUBE_OPERATION_WORD_PROMPT_TEMPLATE.format(input_value=text)
        raw = self._gemini_request(prompt)
        word = (raw or "").strip()
        # 余計な記号・改行を除去して先頭トークンのみ採用
        token = re.split(r"[\s\n\r:：,，。.!?]+", word)[0].strip()
        return token

    def _classify_playlist_play_mode(self, text: str) -> dict:
        prompt = self.PLAYLIST_PLAY_MODE_PROMPT_TEMPLATE.format(input_value=text)
        raw = self._gemini_request(prompt)
        data = self._extract_json_payload(raw) or {}
        scope = str(data.get("scope") or "all").strip().lower()
        order = str(data.get("order") or "sequential").strip().lower()
        artist = str(data.get("artist") or "").strip()

        if scope not in ("artist", "all", "recent"):
            scope = "all"
        if order not in ("sequential", "random"):
            order = "sequential"
        if scope != "artist":
            artist = ""
        return {"scope": scope, "artist": artist, "order": order}

    def _classify_playlist_operation(self, text: str, youtube_context: dict | None = None) -> str:
        ctx = youtube_context or {}
        prompt = self.PLAYLIST_OPERATION_PROMPT_TEMPLATE.format(
            current_title=str(ctx.get("current_title") or ""),
            current_video_id=str(ctx.get("current_video_id") or ""),
            active=bool(ctx.get("active")),
            paused=bool(ctx.get("paused")),
            input_value=text,
        )
        raw = self._gemini_request(prompt)
        token = re.split(r"[\s\n\r:：,，。.!?]+", str(raw or "").strip())[0].strip().lower()
        if token in ("add", "delete", "play"):
            return token
        return "play"

    def _extract_json_payload(self, raw_text: str):
        text = (raw_text or "").strip()
        if not text:
            return None
        try:
            match = re.search(r"```json\s*([\s\S]*?)\s*```", text, re.I)
            body = match.group(1) if match else text
            return json.loads(body)
        except Exception:
            return None

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



    def _format_event_time(self, iso_time: str) -> str:
        if not iso_time: return ""
        try:
            dt_object = datetime.fromisoformat(iso_time.replace('Z', '+00:00'))
            dt_jst = dt_object.astimezone(JST)
            return dt_jst.strftime('%m月%d日%H時%M分')
        except ValueError:
            return iso_time

    def _current_time_for_prompt(self) -> str:
        """プロンプトへ渡す現在時刻（曜日付き）を返す"""
        now = datetime.now(JST)
        weekday_en = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][now.weekday()]
        return f"{now.strftime('%Y-%m-%d %H:%M:%S')} ({weekday_en})"

    def _build_added_calendar_message(self, added_events: list[dict]) -> str:
        if not added_events:
            return "予定を追加できませんでした。"

        details = []
        for event in added_events:
            if not isinstance(event, dict):
                continue
            title = (event.get("title") or "無題").strip()
            start_text = self._format_event_time(event.get("start_time"))
            end_text = self._format_event_time(event.get("end_time"))

            if start_text and end_text:
                details.append(f"{start_text}から{end_text}に「{title}」")
            elif start_text:
                details.append(f"{start_text}に「{title}」")
            else:
                details.append(f"「{title}」")

        if not details:
            return f"{len(added_events)}件の予定をカレンダーに追加しました。"

        return f"{len(added_events)}件の予定をカレンダーに追加しました。追加内容は、" + "、".join(details) + "です。"

    def _build_deleted_calendar_message(self, deleted_events: list[dict]) -> str:
        if not deleted_events:
            return "削除対象の予定が見つかりませんでした。"

        details = []
        for event in deleted_events:
            if not isinstance(event, dict):
                continue
            title = (event.get("title") or event.get("name") or "無題").strip()
            start_text = self._format_event_time(event.get("start_time"))
            end_text = self._format_event_time(event.get("end_time"))
            if start_text and end_text:
                details.append(f"{start_text}から{end_text}の「{title}」")
            elif start_text:
                details.append(f"{start_text}の「{title}」")
            else:
                details.append(f"「{title}」")

        if not details:
            return f"{len(deleted_events)}件の予定を削除しました。"
        return f"{len(deleted_events)}件の予定を削除しました。削除内容は、" + "、".join(details) + "です。"

    def _build_changed_calendar_message(self, changed_events: list[dict]) -> str:
        if not changed_events:
            return "変更対象の予定が見つかりませんでした。"

        details = []
        for item in changed_events:
            if not isinstance(item, dict):
                continue
            before = item.get("before") or {}
            after = item.get("after") or {}

            before_name = (before.get("title") or before.get("name") or "無題").strip()
            before_start = self._format_event_time(before.get("start_time"))
            before_end = self._format_event_time(before.get("end_time"))

            after_name = (after.get("title") or after.get("name") or before_name or "無題").strip()
            after_start = self._format_event_time(after.get("start_time"))
            after_end = self._format_event_time(after.get("end_time"))

            before_text = f"{before_start}から{before_end}の「{before_name}」" if before_start and before_end else f"「{before_name}」"
            after_text = f"{after_start}から{after_end}の「{after_name}」" if after_start and after_end else f"「{after_name}」"
            details.append(f"{before_text}を{after_text}に変更")

        if not details:
            return f"{len(changed_events)}件の予定を変更しました。"
        return f"{len(changed_events)}件の予定を変更しました。変更内容は、" + "、".join(details) + "です。"

    def _build_added_finance_message(self, added_records: list[dict]) -> str:
        if not added_records:
            return "収支の追加は行われませんでした。"

        details = []
        for record in added_records:
            if not isinstance(record, dict):
                continue
            record_type = "収入" if record.get("type") == "income" else "支出"
            category = (record.get("category") or "未分類").strip()
            amount = record.get("amount")
            date = (record.get("date") or "").strip()
            memo = (record.get("memo") or "").strip()

            try:
                amount_text = f"{int(amount):,}円"
            except (TypeError, ValueError):
                amount_text = f"{amount}円" if amount is not None else "金額不明"

            if date:
                base = f"{date}の{record_type}として{category}を{amount_text}"
            else:
                base = f"{record_type}として{category}を{amount_text}"
            if memo:
                base += f"（メモ: {memo}）"
            details.append(base)

        if not details:
            return f"{len(added_records)}件の収支を追加しました。"
        return f"{len(added_records)}件の収支を追加しました。追加内容は、" + "、".join(details) + "です。"

    def _user_input_has_explicit_time(self, user_input: str | None) -> bool:
        if not user_input:
            return False
        text = str(user_input)
        patterns = [
            r"\b([01]?\d|2[0-3]):[0-5]\d\b",
            r"([01]?\d|2[0-3])時([0-5]?\d分?)?",
            r"(午前|午後|AM|PM|am|pm)",
            r"(今朝|正午|昼|夕方|夜|深夜)",
        ]
        return any(re.search(p, text) for p in patterns)

    def _normalize_finance_datetime(self, raw_value: str | None, user_input: str | None = None) -> str:
        """収支記録用の日時文字列を YYYY-MM-DD HH:MM:SS に正規化する"""
        now = datetime.now(JST).replace(second=0, microsecond=0)
        has_explicit_time = self._user_input_has_explicit_time(user_input)
        if not raw_value:
            return now.strftime("%Y-%m-%d %H:%M:%S")

        candidate = str(raw_value).strip()
        if not candidate:
            return now.strftime("%Y-%m-%d %H:%M:%S")

        # 日付のみの場合は現在時刻(分)を補完
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", candidate):
            return f"{candidate} {now.strftime('%H:%M')}:00"

        candidate = candidate.replace("T", " ")
        try:
            parsed = datetime.fromisoformat(candidate)
        except ValueError:
            return now.strftime("%Y-%m-%d %H:%M:%S")

        if parsed.tzinfo is not None:
            parsed = parsed.astimezone(JST).replace(tzinfo=None)

        # ユーザーが時刻を明示していない場合、LLMの00:00固定値は現在時刻(分)に補正
        if not has_explicit_time and parsed.hour == 0 and parsed.minute == 0:
            parsed = parsed.replace(hour=now.hour, minute=now.minute, second=0)
        else:
            parsed = parsed.replace(second=0)

        return parsed.replace(microsecond=0).strftime("%Y-%m-%d %H:%M:%S")

    def _finance_record_signature(self, record: dict) -> str:
        date_text = str(record.get("date") or "").strip()
        # 重複判定は秒単位差分を無視して、分単位で比較する
        date_minute = date_text
        if date_text:
            try:
                parsed = datetime.strptime(date_text, "%Y-%m-%d %H:%M:%S")
                date_minute = parsed.strftime("%Y-%m-%d %H:%M")
            except ValueError:
                date_minute = date_text[:16]
        payload = {
            "type": str(record.get("type") or "").strip(),
            "category": str(record.get("category") or "").strip(),
            "amount": float(record.get("amount") or 0),
            "date_minute": date_minute,
            "memo": str(record.get("memo") or "").strip(),
        }
        return json.dumps(payload, ensure_ascii=False, sort_keys=True)

    def _is_recent_duplicate_finance_request(self, user_id: str, signatures: tuple[str, ...], window_seconds: int = 8) -> bool:
        now = datetime.now()
        last = self._recent_finance_additions.get(user_id)
        if not last:
            self._recent_finance_additions[user_id] = {"signatures": signatures, "at": now}
            return False

        last_signatures = last.get("signatures") or tuple()
        last_at = last.get("at")
        if isinstance(last_at, datetime) and (now - last_at).total_seconds() <= window_seconds and signatures == last_signatures:
            return True

        self._recent_finance_additions[user_id] = {"signatures": signatures, "at": now}
        return False

    def _to_prompt_calendar_task_list(self, task_list: list[dict]) -> list[dict]:
        """Geminiに渡す予定一覧をJST文字列へ正規化する"""
        prompt_list: list[dict] = []
        for task in task_list or []:
            if not isinstance(task, dict):
                continue
            title = (task.get("title") or task.get("name") or "").strip()
            def normalize_for_prompt(raw_value: str | None) -> str:
                if not raw_value:
                    return ""
                candidate = str(raw_value).strip().replace(" ", "T")
                if candidate.endswith("Z"):
                    candidate = candidate[:-1] + "+00:00"
                try:
                    dt = datetime.fromisoformat(candidate)
                except ValueError:
                    return str(raw_value)
                if dt.tzinfo is None:
                    dt = JST.localize(dt)
                return dt.astimezone(JST).strftime("%Y-%m-%d %H:%M:%S")

            prompt_list.append({
                "id": task.get("id"),
                "name": title,
                "start_time": normalize_for_prompt(task.get("start_time")),
                "end_time": normalize_for_prompt(task.get("end_time")),
            })
        return prompt_list

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
                'after_end_time': x.get('after_end_time', ''),
                'color': x.get('color', '')
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

    def _parse_alarm_trigger_change(self, text: str) -> dict:
        if not text:
            return {"is_alarm_update": False, "time": "", "reason": ""}
        match = re.search(r"```json\s*([\s\S]*?)\s*```", text, re.I)
        s = match.group(1) if match else text
        try:
            data = json.loads(s)
        except json.JSONDecodeError:
            return {"is_alarm_update": False, "time": "", "reason": "json_parse_error"}
        if not isinstance(data, dict):
            return {"is_alarm_update": False, "time": "", "reason": "not_dict"}
        return {
            "is_alarm_update": bool(data.get("is_alarm_update")),
            "time": str(data.get("time") or "").strip(),
            "reason": str(data.get("reason") or "").strip(),
        }

    def _normalize_alarm_time(self, raw_time: str | None) -> str | None:
        if not raw_time:
            return None
        text = str(raw_time).strip()
        if not text:
            return None
        text = text.translate(str.maketrans("０１２３４５６７８９：", "0123456789:"))
        text = text.replace("午前", "AM").replace("午後", "PM")
        text = re.sub(r"\s+", "", text)

        ampm = None
        if text.startswith("AM"):
            ampm = "AM"
            text = text[2:]
        elif text.startswith("PM"):
            ampm = "PM"
            text = text[2:]

        m = re.fullmatch(r"(\d{1,2}):(\d{1,2})", text)
        if m:
            hour = int(m.group(1))
            minute = int(m.group(2))
        else:
            m = re.fullmatch(r"(\d{1,2})時(?:(\d{1,2})分?)?", text)
            if m:
                hour = int(m.group(1))
                minute = int(m.group(2) or 0)
            else:
                m = re.fullmatch(r"(\d{3,4})", text)
                if m:
                    digits = m.group(1)
                    if len(digits) == 3:
                        hour = int(digits[0])
                        minute = int(digits[1:])
                    else:
                        hour = int(digits[:2])
                        minute = int(digits[2:])
                else:
                    m = re.fullmatch(r"(\d{1,2})", text)
                    if not m:
                        return None
                    hour = int(m.group(1))
                    minute = 0

        if ampm == "AM" and hour == 12:
            hour = 0
        elif ampm == "PM" and hour < 12:
            hour += 12

        if hour < 0 or hour > 23 or minute < 0 or minute > 59:
            return None
        return f"{hour:02d}:{minute:02d}"

    def _is_alarm_change_candidate(self, text: str) -> bool:
        if not text:
            return False
        has_alarm_word = ("目覚まし" in text) or ("アラーム" in text)
        if not has_alarm_word:
            return False
        intent_words = ("変更", "変えて", "にして", "セット", "直して", "時", "分")
        return any(word in text for word in intent_words)

    def _find_alarm_order(self, orders: list[dict]) -> dict | None:
        if not isinstance(orders, list) or not orders:
            return None
        exact = next((o for o in orders if str(o.get("name", "")).strip() == "目覚まし"), None)
        if exact:
            return exact
        special = next((
            o for o in orders
            if "目覚まし" in str(o.get("name", "")) and "【特殊命令】" in str(o.get("name", ""))
        ), None)
        if special:
            return special
        return next((o for o in orders if "目覚まし" in str(o.get("name", ""))), None)

    def _update_special_alarm_trigger_time(self, text: str, user_id: str | None):
        if not user_id:
            return None, "ユーザーがログインしていません。"

        current_time = self._current_time_for_prompt()
        prompt = self.ALARM_TRIGGER_CHANGE_PROMPT_TEMPLATE.format(
            current_time=current_time,
            input_value=text
        )
        raw = self._gemini_request(prompt)
        parsed = self._parse_alarm_trigger_change(raw)
        if not parsed.get("is_alarm_update"):
            return None, ""

        normalized_time = self._normalize_alarm_time(parsed.get("time"))
        if not normalized_time:
            return None, "目覚ましの変更時刻を特定できませんでした。"

        orders = custom_order_service.get_all_orders(user_id)
        if isinstance(orders, dict) and orders.get("error"):
            return None, "目覚まし命令の取得に失敗しました。"

        alarm_order = self._find_alarm_order(orders if isinstance(orders, list) else [])
        if not alarm_order:
            return None, "特殊命令「目覚まし」が見つかりませんでした。"

        triggers = alarm_order.get("triggers")
        if not isinstance(triggers, list) or not triggers:
            return None, "目覚まし命令のトリガー情報が不正です。"

        trigger0 = triggers[0] if isinstance(triggers[0], dict) else {}
        if str(trigger0.get("category") or "").strip() != "時間":
            return None, "目覚まし命令の先頭トリガーが時間トリガーではありません。"

        trigger_value = trigger0.get("value")
        if not isinstance(trigger_value, dict):
            trigger_value = {}
            trigger0["value"] = trigger_value

        before_time = self._normalize_alarm_time(trigger_value.get("time")) or str(trigger_value.get("time") or "")
        trigger_value["time"] = normalized_time

        updated_triggers = list(triggers)
        updated_triggers[0] = trigger0

        update_payload = {
            "name": alarm_order.get("name", "目覚まし"),
            "triggers": updated_triggers,
            "steps": alarm_order.get("steps") or [],
            "conditions": alarm_order.get("conditions") or [],
            "actions": alarm_order.get("actions") or [],
        }

        updated = custom_order_service.update_order(user_id, alarm_order.get("id"), update_payload)
        if isinstance(updated, dict) and updated.get("error"):
            return None, "目覚まし時刻の更新に失敗しました。"

        result_data = {
            "order_id": alarm_order.get("id"),
            "name": alarm_order.get("name"),
            "before_time": before_time,
            "after_time": normalized_time,
        }
        return result_data, f"目覚ましの時刻を{normalized_time}に変更しました。"


    def check_chat_space(
        self,
        input_value: str,
        user_id: str | None = None,
        tone_response: str = "",
        youtube_context: dict | None = None
    ) -> dict:
        print("--- [DEBUG] check_chat_space: Starting ---")
        cleaned_input = (
            (input_value or "")
            .replace("サイレントメイト", "")
            .replace("ボイスメイト", "")
            .strip()
        )
        current_time = self._current_time_for_prompt()

        if self._is_cancelled(user_id):
            return {
                "status": "success",
                "message": "",
                "abort_command": True,
                "suppress_tts": True,
                "cancelled": True
            }

        # ▼▼▼ 新しいevalロジック ▼▼▼
        try:
            # 記号の置換プリプロセス
            eval_input = (cleaned_input or "").replace("÷", "/").replace("×", "*").replace("は", "=")
            # evalが通るように文末の = を一時的に除去
            eval_target = eval_input.rstrip("=")
            
            # 安全のため、evalで使える関数を制限する
            safe_builtins = {
                'abs', 'divmod', 'float', 'int', 'max', 'min', 'pow', 'round', 'sum'
            }
            # __builtins__を限定的に差し替える
            restricted_globals = {"__builtins__": {k: v for k, v in __builtins__.items() if k in safe_builtins}}
            
            # 式を評価
            value = eval(eval_target, restricted_globals, {})
            
            # 評価結果が数値型の場合のみ計算結果として扱う
            if isinstance(value, (int, float)):
                formatted = self._format_calc_value(value)
                return {
                    "status": "success",
                    "message": f"答えは{formatted}です。",
                    "skip_tone": True
                }
        except Exception:
            # evalが失敗した場合は、通常のチャット処理に進む
            pass
        # ▲▲▲ 新しいevalロジック ▲▲▲

        self._current_user_id = user_id
        try:
            yt_active = bool((youtube_context or {}).get("active"))
            purpose_template = self.PURPOSE_PROMPT_TEMPLATE_WITH_YT_CONTROL if yt_active else self.PURPOSE_PROMPT_TEMPLATE
            purpose_prompt = purpose_template.format(
                current_time=current_time,
                input_value=cleaned_input,
                youtube_state=self._build_youtube_state_text(youtube_context)
            )
            purpose = self._gemini_request(purpose_prompt)
            purpose = (purpose or "").strip()
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

            # 肯定的な回答（はい）の処理
            if purpose == "Ya":
                if not user_id:
                    return {"status": "success", "message": "ユーザーが特定できないため、操作を続行できません。"}
                
                # 保留中のアクションを取得
                pending = pending_action_service.get_pending_actions(user_id)
                if pending and len(pending) > 0:
                    # 最新のアクションを取得 (get_pending_actions内でソート済み)
                    latest_action_row = pending[0]
                    latest_action = latest_action_row.get('action_data')
                    
                    # 実行
                    from services.action_executor_service import execute_action
                    exec_result = execute_action(user_id, latest_action)
                    
                    # 実行後は保留リストから削除
                    pending_action_service.delete_pending_action(user_id, latest_action_row.get('id'))
                    
                    return {
                        "status": "success",
                        "message": exec_result.get("message", "操作を完了しました。"),
                        "skip_tone": True
                    }
                else:
                    return {"status": "success", "message": "実行を待機している操作はありません。"}

            # 否定的な回答（いいえ）の処理
            if purpose == "Nn":
                if user_id:
                    pending_action_service.clear_pending_actions(user_id)
                return {"status": "success", "message": "了解しました。操作をキャンセルしました。", "skip_tone": True}

            # 通常はカスタム命令編集不可だが、特殊命令「目覚まし」の時間トリガー変更のみ許可
            if (purpose.startswith("R") and purpose != "Re") or self._is_alarm_change_candidate(cleaned_input):
                alarm_data, alarm_message = self._update_special_alarm_trigger_time(cleaned_input, user_id)
                if alarm_data is not None:
                    result["purpose"] = "Rn"
                    result["data"] = alarm_data
                    result["message"] = alarm_message
                    result["skip_tone"] = True
                    return result
                if alarm_message:
                    result["purpose"] = "Rn"
                    result["message"] = alarm_message
                    result["skip_tone"] = True
                    return result

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
            elif purpose.startswith("Yw") or (yt_active and (purpose in ("Yc", "Yg", "Yp") and any(c.isdigit() for c in cleaned_input))):
                adv_prompt = self.YOUTUBE_ADVANCED_CONTROL_PROMPT_TEMPLATE.format(input_value=cleaned_input)
                raw_json = self._gemini_request(adv_prompt)
                data = self._extract_json_payload(raw_json) or {}
                intent = data.get("intent")
                
                result["purpose"] = "Yw"
                result["action"] = "youtube_advanced"
                result["data"] = data
                
                if intent == "summarize":
                    # 別途 API で要約メッセージを返す処理
                    pass
                elif intent == "open_channel":
                    result["message"] = f"「{data.get('value')}」のチャンネルを開きます。"
                elif intent == "play_index":
                    result["message"] = f"{data.get('value')}番の動画を再生します。"
                elif intent == "open_window":
                    result["message"] = "YouTubeウィンドウを展開します。"
                elif intent == "close_window":
                    result["message"] = "YouTubeウィンドウを閉じます。"
                    result["action"] = "youtube_control"
                    result["data"] = {"intent": "close"}
                
                result["suppress_tts"] = True
                return result
            elif purpose == "Yp":
                op_word = self._classify_youtube_operation_word(cleaned_input)
                op = (op_word or "").strip().lower()
                print(f"--- [DEBUG] Yp operation word: {op_word} ---")
                if op == "new":
                    extracted_query = self._extract_youtube_query_from_input(cleaned_input)
                    if self._is_meaningful_youtube_query(extracted_query):
                        result["purpose"] = "Yp"
                        result["data"] = {"search_query": extracted_query}
                        result["message"] = f"「{extracted_query}」をYouTubeで検索します。"
                        result["suppress_tts"] = True
                    else:
                        result["purpose"] = "Yc"
                        result["action"] = "youtube_control"
                        result["data"] = {"intent": "resume", "query": ""}
                        result["message"] = ""
                        result["suppress_tts"] = True
                elif op == "restart":
                    result["purpose"] = "Yc"
                    result["action"] = "youtube_control"
                    result["data"] = {"intent": "resume", "query": ""}
                    result["message"] = ""
                    result["suppress_tts"] = True
                elif op == "stop":
                    result["purpose"] = "Yc"
                    result["action"] = "youtube_control"
                    result["data"] = {"intent": "stop", "query": ""}
                    result["message"] = ""
                    result["suppress_tts"] = True
                elif op == "next":
                    result["purpose"] = "Yc"
                    result["action"] = "youtube_control"
                    result["data"] = {"intent": "next", "query": ""}
                    result["message"] = ""
                    result["suppress_tts"] = True
                elif op == "previous":
                    result["purpose"] = "Yc"
                    result["action"] = "youtube_control"
                    result["data"] = {"intent": "prev", "query": ""}
                    result["message"] = ""
                    result["suppress_tts"] = True
                elif op == "save":
                    result["purpose"] = "Yc"
                    result["action"] = "youtube_control"
                    result["data"] = {"intent": "save_current", "query": ""}
                    result["message"] = ""
                    result["suppress_tts"] = True
                elif op == "rejection":
                    result["purpose"] = "Yc"
                    result["action"] = "youtube_control"
                    result["data"] = {"intent": "reject_current", "query": ""}
                    result["message"] = ""
                    result["suppress_tts"] = True
                else:
                    # 判定不能時は従来の検索語抽出へフォールバック
                    extracted_query = self._extract_youtube_query_from_input(cleaned_input)
                    if self._is_meaningful_youtube_query(extracted_query):
                        result["purpose"] = "Yp"
                        result["data"] = {"search_query": extracted_query}
                        result["message"] = f"「{extracted_query}」をYouTubeで検索します。"
                        result["suppress_tts"] = True
                    else:
                        result["message"] = "再生したい曲名を特定できませんでした。"
            elif purpose == "Yc":
                control_prompt = self.YOUTUBE_CONTROL_PROMPT_TEMPLATE.format(input_value=cleaned_input)
                raw_json = self._gemini_request(control_prompt)
                print(f"--- [DEBUG] raw_json from Gemini for Yc: {raw_json} ---")
                data = self._extract_json_payload(raw_json) or {}
                intent = str(data.get("intent") or "").strip().lower()
                query = str(data.get("query") or "").strip()
                allowed = {
                    "next", "prev", "pause", "resume",
                    "seek_forward", "seek_backward", "volume_up", "volume_down",
                    "stop", "close",
                    "save_current", "reject_current", "random", "replay",
                    "search_in_results", "unknown"
                }
                if intent in allowed and intent != "unknown":
                    result["purpose"] = "Yc"
                    result["action"] = "youtube_control"
                    result["data"] = {"intent": intent, "query": query}
                    result["message"] = ""
                    result["suppress_tts"] = True
                else:
                    result["message"] = "YouTube操作の意図を特定できませんでした。"
            elif purpose == "Pp" or purpose.startswith("P"):
                op = self._classify_playlist_operation(cleaned_input, youtube_context)
                result["purpose"] = "Pp"
                if op == "add":
                    current_video_id = str((youtube_context or {}).get("current_video_id") or "").strip()
                    current_title = str((youtube_context or {}).get("current_title") or "").strip()
                    if not current_video_id:
                        result["message"] = "現在再生中の曲が見つかりません。"
                    else:
                        result["action"] = "playlist_add_current"
                        result["data"] = {
                            "video_id": current_video_id,
                            "title": current_title,
                            "artist": ""
                        }
                        result["message"] = ""
                        result["suppress_tts"] = True
                elif op == "delete":
                    current_video_id = str((youtube_context or {}).get("current_video_id") or "").strip()
                    if not current_video_id:
                        result["message"] = "現在再生中の曲が見つかりません。"
                    else:
                        result["action"] = "playlist_delete_current"
                        result["data"] = {"video_id": current_video_id}
                        result["message"] = ""
                        result["suppress_tts"] = True
                else:
                    play_mode = self._classify_playlist_play_mode(cleaned_input)
                    result["action"] = "playlist_play_request"
                    result["data"] = play_mode
                    result["message"] = ""
                    result["suppress_tts"] = True
            elif purpose in ("Kn", "K"):
                # LLMに計算式を作らせる
                calc_prompt = self.CALC_PROMPT_TEMPLATE.format(input_value=cleaned_input)
                calc_expr = self._gemini_request(calc_prompt)
                
                # LLMの回答をeval用にプリプロセス
                eval_target = (calc_expr or "").replace("÷", "/").replace("×", "*").replace("は", "=").rstrip("=")
                
                try:
                    safe_builtins = {'abs', 'divmod', 'float', 'int', 'max', 'min', 'pow', 'round', 'sum'}
                    restricted_globals = {"__builtins__": {k: v for k, v in __builtins__.items() if k in safe_builtins}}
                    value = eval(eval_target, restricted_globals, {})
                    
                    if isinstance(value, (int, float)):
                        formatted = self._format_calc_value(value)
                        result["message"] = f"答えは{formatted}です。"
                    else:
                        result["message"] = calc_expr # 数値以外ならそのまま返す
                except Exception:
                    # eval失敗時はGeminiの元の回答（計算式など）をそのまま出す
                    result["message"] = calc_expr
                
                result["skip_tone"] = True
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
        
        current_time = self._current_time_for_prompt()
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

                # 色指定の処理
                add_kwargs = {
                    "title": event_data['name'],
                    "start_time": event_data['start_time'],
                    "end_time": end_time_str
                }
                user_color = str(event_data.get('color', '')).strip()
                if "紫" in user_color or "グレープ" in user_color:
                    add_kwargs["color_id"] = "3"
                elif "赤" in user_color or "トマト" in user_color:
                    add_kwargs["color_id"] = "11"
                elif "青" in user_color or "ブルー" in user_color:
                    add_kwargs["color_id"] = "9"

                service = GoogleCalendarService(user_id)
                new_event = service.add_event(**add_kwargs)
                added_events.append(new_event)
            except Exception as e:
                print(f"ローカルカレンダーへのイベント追加エラー: {e}")
        
        if added_events:
            message = self._build_added_calendar_message(added_events)
            return added_events, message
        
        return None, "予定を追加できませんでした。もう一度お試しください。"

    def _get_calender(self, text: str, is_silent: bool, user_id: str | None):
        """ローカルDBからカレンダーイベントを取得"""
        if not user_id: 
            if is_silent: return [], ""
            return None, "ユーザーがログインしていません。"

        current_time = self._current_time_for_prompt()
        prompt = self.GET_CALENDAR_PROMPT_TEMPLATE.format(current_time=current_time, input_value=text)
        raw = self._gemini_request(prompt)
        range_info = self._parse_calendar_list(raw)
        
        start_time_iso, end_time_iso = None, None
        if range_info and range_info[0]:
            start_time_iso = range_info[0].get('start_time')
            end_time_iso = range_info[0].get('end_time')

        try:
            # events = local_calendar_service.get_events(user_id, start_time_iso, end_time_iso)
            service = GoogleCalendarService(user_id)
            events = service.list_events(time_min=start_time_iso, time_max=end_time_iso)
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

        prompt_task_list = self._to_prompt_calendar_task_list(task_list)
        task_list_json = json.dumps(prompt_task_list, ensure_ascii=False)
        current_time = self._current_time_for_prompt()
        prompt = self.REMOVE_CALENDAR_PROMPT_TEMPLATE.format(current_time=current_time, task_list_json=task_list_json, input_value=text)
        raw = self._gemini_request(prompt)
        events_to_delete = self._parse_calendar_list(raw)
        
        if not events_to_delete:
            return None, "削除対象の予定を特定できませんでした。"

        deleted_count = 0
        deleted_events: list[dict] = []
        remaining_tasks = list(task_list)
        for event_data in events_to_delete:
            target_name = (event_data.get("name") or event_data.get("title") or "").strip()
            target_start_keys = self._build_time_compare_keys(event_data.get("start_time"))
            target_end_keys = self._build_time_compare_keys(event_data.get("end_time"))

            matched_index = None
            matched_task = None
            for idx, task in enumerate(remaining_tasks):
                # 名前と時間で照合（DB側はtitleキー）
                task_name = ((task.get("title") or task.get("name") or "")).strip()
                task_start_keys = self._build_time_compare_keys(task.get("start_time"))
                task_end_keys = self._build_time_compare_keys(task.get("end_time"))

                name_matches = (task_name == target_name) if target_name else True
                start_matches = bool(task_start_keys & target_start_keys) if target_start_keys else True
                end_matches = bool(task_end_keys & target_end_keys) if target_end_keys else True

                if name_matches and start_matches and end_matches:
                    matched_index = idx
                    matched_task = task
                    break

            if matched_task is None:
                continue

            target_id = matched_task.get("id")
            target_cal_id = matched_task.get("calendarId")
            target_cal_name = matched_task.get("calendarName") or "カレンダー"
            target_creator_name = matched_task.get("creator") or "他の方"
            target_creator_email = matched_task.get("creator_email") or ""

            # 作成者が自分 (zelco054@gmail.com) ではない場合は警告
            if target_creator_email and target_creator_email != "zelco054@gmail.com":
                now_iso = datetime.now(JST).isoformat()
                action_payload = {
                    "category": "カレンダー",
                    "sub": "削除",
                    "detail": { "id": target_id, "calendarId": target_cal_id, "title": target_name },
                    "scheduled_at": now_iso,
                    "triggered_at": now_iso
                }
                pending_action_service.add_pending_action(user_id, 0, action_payload)
                return {
                    "pending_action": action_payload
                }, f"「{target_name}」は、{target_creator_name}さんが作成された予定です。本当に削除してよろしいですか？"

            try:
                # local_calendar_service.delete_event(target_id, user_id)
                service = GoogleCalendarService(user_id)
                service.delete_event(target_id)
                deleted_count += 1
                deleted_events.append(matched_task)
                # 同一データの重複削除を正しく処理するため、マッチ済みタスクを除外
                if matched_index is not None:
                    remaining_tasks.pop(matched_index)
            except Exception as e:
                print(f"ローカルイベント削除エラー: {e}")
        
        if deleted_count > 0:
            return {"deleted_count": deleted_count}, self._build_deleted_calendar_message(deleted_events)
        
        return None, "削除対象の予定が見つかりませんでした。"

    def _change_calendar(self, text: str, user_id: str | None):
        """ローカルDBのカレンダーイベントを変更"""
        if not user_id: return None, "ユーザーがログインしていません。"
        
        task_list, _ = self._get_calender(text, is_silent=True, user_id=user_id)
        if not task_list:
            return None, "カレンダーに該当する予定がありません。変更は実行されません。"

        prompt_task_list = self._to_prompt_calendar_task_list(task_list)
        task_list_json = json.dumps(prompt_task_list, ensure_ascii=False)
        current_time = self._current_time_for_prompt()
        prompt = self.CHANGE_CALENDAR_PROMPT_TEMPLATE.format(current_time=current_time, task_list_json=task_list_json, input_value=text)
        raw = self._gemini_request(prompt)
        events_to_change = self._parse_calendar_list(raw)

        if not events_to_change:
            return None, "変更対象の予定を特定できませんでした。"

        changed_count = 0
        changed_events: list[dict] = []
        remaining_tasks = list(task_list)
        for event_data in events_to_change:
            before_name = (event_data.get("before_name") or "").strip()
            before_start_keys = self._build_time_compare_keys(event_data.get("before_start_time"))
            before_end_keys = self._build_time_compare_keys(event_data.get("before_end_time"))

            matched_index = None
            matched_task = None
            for idx, task in enumerate(remaining_tasks):
                task_name = (task.get("title") or task.get("name") or "").strip()
                task_start_keys = self._build_time_compare_keys(task.get("start_time"))
                task_end_keys = self._build_time_compare_keys(task.get("end_time"))

                name_matches = (task_name == before_name) if before_name else True
                start_matches = bool(task_start_keys & before_start_keys) if before_start_keys else True
                end_matches = bool(task_end_keys & before_end_keys) if before_end_keys else True

                if name_matches and start_matches and end_matches:
                    matched_index = idx
                    matched_task = task
                    break

            if matched_task is None:
                continue

            target_id = matched_task.get("id")
            target_cal_id = matched_task.get("calendarId")
            target_creator_name = matched_task.get("creator") or "他の方"
            target_creator_email = matched_task.get("creator_email") or ""

            # 作成者が自分 (zelco054@gmail.com) ではない場合は警告
            if target_creator_email and target_creator_email != "zelco054@gmail.com":
                after_name = event_data.get("after_name") or matched_task.get("title") or matched_task.get("name")
                now_iso = datetime.now(JST).isoformat()
                action_payload = {
                    "category": "カレンダー",
                    "sub": "変更",
                    "detail": { 
                        "id": target_id, 
                        "calendarId": target_cal_id, 
                        "title": after_name,
                        "start_time": event_data.get("after_start_time"),
                        "end_time": event_data.get("after_end_time")
                    },
                    "scheduled_at": now_iso,
                    "triggered_at": now_iso
                }
                pending_action_service.add_pending_action(user_id, 0, action_payload)
                return {
                    "pending_action": action_payload
                }, f"「{before_name}」は、{target_creator_name}さんが作成された予定です。本当に内容を変更してよろしいですか？"

            try:
                update_payload = {
                    "title": event_data.get("after_name"),
                    "start_time": event_data.get("after_start_time"),
                    "end_time": event_data.get("after_end_time"),
                }
                # Remove None or empty values so we don't overwrite with nulls
                update_payload = {k: v for k, v in update_payload.items() if v}

                if update_payload:
                    before_snapshot = {
                        "title": matched_task.get("title") or matched_task.get("name"),
                        "start_time": matched_task.get("start_time"),
                        "end_time": matched_task.get("end_time"),
                    }
                    # local_calendar_service.update_event(target_id, user_id, **update_payload)
                    service = GoogleCalendarService(user_id)
                    service.update_event(
                        event_id=target_id,
                        title=update_payload.get("title"),
                        start_time=update_payload.get("start_time"),
                        end_time=update_payload.get("end_time")
                    )
                    changed_count += 1
                    changed_events.append({
                        "before": before_snapshot,
                        "after": {
                            "title": update_payload.get("title") or before_snapshot.get("title"),
                            "start_time": update_payload.get("start_time") or before_snapshot.get("start_time"),
                            "end_time": update_payload.get("end_time") or before_snapshot.get("end_time"),
                        }
                    })
                    if matched_index is not None:
                        remaining_tasks.pop(matched_index)
            except Exception as e:
                print(f"ローカルイベント更新エラー: {e}")
        
        if changed_count > 0:
            return {"changed_count": changed_count}, self._build_changed_calendar_message(changed_events)

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

    def _build_time_compare_keys(self, value: str | None) -> set[str]:
        """時刻比較用キーを複数生成（タイムゾーン有無の差分に耐性を持たせる）"""
        if not value:
            return set()
        candidate = value.strip().replace(" ", "T")
        if not candidate:
            return set()
        if candidate.endswith("Z"):
            candidate = candidate[:-1] + "+00:00"

        keys: set[str] = set()
        try:
            dt = datetime.fromisoformat(candidate)
        except ValueError:
            # 最低限、文字列比較用キーだけ残す
            return {candidate.replace("T", " ").split(".")[0]}

        # 文字列表現の差を吸収するベースキー
        keys.add(dt.strftime("%Y-%m-%d %H:%M:%S"))

        if dt.tzinfo is not None:
            keys.add(dt.astimezone(pytz.UTC).strftime("%Y-%m-%d %H:%M:%S"))
            keys.add(dt.astimezone(JST).strftime("%Y-%m-%d %H:%M:%S"))
            return keys

        # tzなしは「JST解釈」と「UTC解釈」の両方をキー化して取りこぼしを防ぐ
        dt_as_jst = JST.localize(dt)
        dt_as_utc = pytz.UTC.localize(dt)
        keys.add(dt_as_jst.astimezone(pytz.UTC).strftime("%Y-%m-%d %H:%M:%S"))
        keys.add(dt_as_utc.astimezone(pytz.UTC).strftime("%Y-%m-%d %H:%M:%S"))
        keys.add(dt_as_utc.astimezone(JST).strftime("%Y-%m-%d %H:%M:%S"))
        return keys
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
        current_time = self._current_time_for_prompt()

        # categoriesマスタからカテゴリ一覧を取得（UIと同一ソース）
        from services.expense_service import add_finance_record, get_unique_categories
        available_categories: list[str] = []
        categories_master = get_all_categories()
        if isinstance(categories_master, list):
            master_names = sorted({
                (item.get("name") or "").strip()
                for item in categories_master
                if isinstance(item, dict) and (item.get("name") or "").strip()
            })
            available_categories.extend(master_names)

        # マスタが空のときは、既存収支から推定
        if not available_categories:
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

        added_info: list[dict] = []
        if not income_expenses_to_add:
            return None, "収支の追加に失敗しました。入力内容を確認してください。"

        normalized_records: list[dict] = []
        seen_signatures = set()
        for ie in income_expenses_to_add:
            try:
                data = {
                    "type": "income" if ie['type'] == "収入" else "expense",
                    "category": ie['category'],
                    "amount": ie['amount'],
                    "date": self._normalize_finance_datetime(ie.get('date'), text),
                    "memo": (ie.get('memo') or "").strip(),
                    "user_id": user_id
                }
                signature = self._finance_record_signature(data)
                if signature in seen_signatures:
                    continue
                seen_signatures.add(signature)
                normalized_records.append(data)
            except Exception as e:
                print(f"収支正規化エラー: {e}")

        request_signatures = tuple(sorted(self._finance_record_signature(item) for item in normalized_records))
        if request_signatures and self._is_recent_duplicate_finance_request(user_id, request_signatures):
            # 音声認識の二重送信による重複記録を無言で防止
            return [], ""

        for data in normalized_records:
            try:
                created_record = add_finance_record(data, user_id)
                created_rows = created_record.get("data") if isinstance(created_record, dict) else None
                if isinstance(created_rows, list) and created_rows:
                    added_info.extend([row for row in created_rows if isinstance(row, dict)])
                elif isinstance(created_record, dict) and not created_record.get("error"):
                    added_info.append(data)
            except Exception as e:
                print(f"収支登録エラー: {e}")

        if added_info:
            message = self._build_added_finance_message(added_info)
            return added_info, message

        return None, "収支の追加は行われませんでした。"

    def _get_income_expense(self, text: str, user_id: str | None):
        """収支の取得"""
        if not user_id:
            return None, "ユーザー未ログイン"
        current_time = self._current_time_for_prompt()

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
        current_time = self._current_time_for_prompt()
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

        current_time = self._current_time_for_prompt()
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
        current_time = self._current_time_for_prompt()
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
                current_time = self._current_time_for_prompt()
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

