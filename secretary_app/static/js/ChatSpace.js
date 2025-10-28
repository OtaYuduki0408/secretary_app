// ===================================
// ChatSpace.js（統合・整理版 - トースト機能追加済み）
// ===================================

// Google Generative AI SDK（ESM）をインポート
import { GoogleGenerativeAI } from 'https://cdn.jsdelivr.net/npm/@google/generative-ai@0.14.1/dist/index.mjs';
import { TextToSpeechReader } from "/static/js/TextToSpeechReader.js";
import { ScheduleManager } from "/static/js/ScheduleManager.js"; // Googleカレンダー操作クラス
console.log("✅ ChatSpace.js ロード完了 (トースト機能付き)");

// APIキー設定: window.GEMINI_API_KEYを優先
const apiKey = window.GEMINI_API_KEY || "AIzaSyCoyPKhnAhlZrekrnOyljxtl4zpo3hTEtc";
if (!apiKey) console.error("APIキーが未設定");

const genAI = new GoogleGenerativeAI(apiKey);
// ChatSpace_ikuto.jsに合わせてモデルを明示的に指定
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 

const reader = new TextToSpeechReader(); // 音声読み上げ
// window.managerが存在しない場合のフォールバック（ChatSpace.jsのロジックを維持）
const manager = window.manager || new ScheduleManager(); 

// ==============================
// 共通ヘルパー関数
// ==============================

/** YYYY-MM-DD HH:MM:SS 形式の時刻を「午前/午後X時Y分」形式の文字列に変換する */
function formatTimeForSpeech(timeString) {
    if (!timeString) return '';
    try {
        // YYYY-MM-DD HH:MM:SS を ISO 8601 ライクな形式 YYYY-MM-DDT... に変換
        const date = new Date(timeString.replace(' ', 'T'));
        if (isNaN(date.getTime())) return '';
        
        const hour = date.getHours();
        const minute = date.getMinutes();
        
        // 午前/午後の判定
        const ampm = hour < 12 ? '午前' : '午後';
        // 12時間表記に変換 (0時は午前0時, 12時は午後0時/正午)
        const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
        // 分の部分
        const minutePart = minute > 0 ? `${minute}分` : '';
        
        return `${ampm}${displayHour}時${minutePart}`;
    } catch (e) {
        console.error("時刻整形エラー:", e);
        return '';
    }
}

/** LLM応答の JSON 抽出 → 配列化（ChatSpace.jsの堅牢な実装を採用） */
function parseCalendarList(text) {
  if (!text) return [];

  // ```json ... ``` または配列/オブジェクトを抽出しJSONパース
  const block = text.match(/```json\s*([\s\S]*?)\s*```/i);
  let s = block ? block[1] : text;
  let data = null;
  
  try {
    // 配列形式を優先して抽出
    const arr = s.match(/\[[\s\S]*\]/); 
    if (arr) data = JSON.parse(arr[0]);
    // 配列でなければオブジェクト形式を抽出
    else data = JSON.parse(s.match(/\{[\s\S]*\}/)?.[0] || s); 
  } catch (e) {
    console.warn("JSON解析失敗:", e.message);
    return [];
  }

  const list = Array.isArray(data) ? data : [data].filter(x => x); // null/undefinedなどを除外

  return list
    .map(x => ({
      // 追加/削除/取得 系のフィールド
      name: x.name ?? x.title ?? x.event ?? x.summary ?? '',
      start_time: x.start_time ?? x.start ?? x.begin ?? x.date ?? '',
      end_time: x.end_time ?? x.end ?? x.finish ?? x.start_time ?? '',
      // 変更 系のフィールド
      before_name: x.before_name ?? '',
      before_start_time: x.before_start_time ?? '',
      before_end_time: x.before_end_time ?? '',
      after_name: x.after_name ?? '',
      after_start_time: x.after_start_time ?? '',
      after_end_time: x.after_end_time ?? ''
    }))
    .filter(x => x.start_time || x.before_start_time); // 開始時刻か変更前開始時刻のいずれかがあれば有効と判断
}


// ==============================
// LLMコア機能（共通化）
// ==============================

/** Gemini API 呼び出し */
async function gemini_request(text) {
  try {
    console.time("gemini応答時間")
    const result = await model.generateContent(text);
    //トークン数の取得
    try {
      const token_response = await model.countTokens({
        contents: [{ role: "user", parts: [{ text }] }]
      });
      console.log("トークン数:", token_response.totalTokens);
    } catch (e) {
      console.warn("トークン数のカウントに失敗:", e);
    }
    const response_text = result.response.text();
    console.log(response_text);
    console.timeEnd("gemini応答時間")
    return response_text;
  } catch (error) {
    console.error('Geminiリクエストエラー:', error);
    alert('AI応答取得中にエラーが発生しました。');
    return "";
  }
}


// ==============================
// 解析メイン関数（唯一の公開エクスポート）
// ==============================
/**
 * ユーザー入力を受け付け、LLMで解析・処理を分岐するメインエントリポイント。
 * @param {string} inputValue - ユーザーの入力テキスト
 */
export async function check_chat_Space(inputValue) {
  // ChatSpace_ikuto.jsの形式のイベント発火を採用
  fire('analysis:start', { steps: ['目的判定', '詳細抽出', '結果反映'] });
  console.time("チャット解析 総所要時間");
  console.log("入力検知:", inputValue);
  reader.speak(`${inputValue}でございますね。かしこまりました。`);

  // カレンダー操作の場合にログイン確認が必要かどうかを判定する関数
  const isCalendarOperation = (purposeCode) => ['C', 'R', 'G', 'M'].some(p => purposeCode.startsWith(p));
  
  // 目的分類 (第一解析) - ChatSpace.jsのプロンプトを採用
  const purpose_prompt = `以下のテキストの目的を分析し、対応する機能を大文字、対応する行動を小文字で返してください。
                          命令を実現できる機能がない場合、機能を使わず、最適と思われる解答をしてください。その場合、返答は最大50文字以内にしてください。
                          -機能-
                          C:カレンダー
                          I:収支管理
                          R:過去の命令の修正(行動はn)
                          -行動-
                          a:追加
                          d:削除
                          c:変更
                          g:取得
                          例：カレンダーへの追加がユーザーの目的なら、Caを返す。
                          -情報-
                          現在時刻:${new Date()}
                        ユーザーの入力:`;
  
  // 第一解析（目的判定）を実行
  const purpose = await gemini_request(purpose_prompt + inputValue);
  fire('analysis:step', { index: 1, label: '目的判定完了' }); // ikuto形式

  // カレンダー操作の場合にログイン確認
  if (isCalendarOperation(purpose)) {
    // window.managerを優先するChatSpace.jsのロジックを維持
    if (!window.manager || !window.manager.accessToken) { 
      const confirmLogin = confirm("カレンダー操作にはGoogleログインが必要です。ログインしますか？");
      if (confirmLogin) {
        if (window.manager && typeof window.manager.handleAuthClick === 'function') {
           window.manager.handleAuthClick();
        } else {
           alert("ScheduleManagerが初期化されていません。開発者にご確認ください。");
        }
        alert("ログインが完了したら再度操作してください。");
      }
      fire('analysis:end');
      return;
    }
  }
  
  // 分岐処理
  switch (purpose) {
    case "Ca":
      console.log("▶︎ 処理: カレンダー追加");
      await add_calendar(inputValue);
      break;
    case "Cd":
      console.log("▶︎ 処理: カレンダー削除");
      await remove_calendar(inputValue);
      break;
    case "Cg":
      console.log("▶︎ 処理: カレンダー取得");
      await get_calender(inputValue);
      break;
    case "Cc":
      console.log("▶︎ 処理: カレンダー変更");
      await change_calendar(inputValue);
      break;
    case "Ia":
      console.log("▶︎ 処理: 収支管理追加");
      // 収支管理ロジックはChatSpace.jsのまま
      break;
    default:
      console.log("▶︎ 処理: その他 (E/未分類)");
      reader.speak(purpose);
  }

  fire('analysis:step', { index: 3, label: '処理完了' }); // ikuto形式
  console.timeEnd("チャット解析 総所要時間");
  fire('analysis:end'); // ikuto形式
}

// ==============================
// カレンダー操作ロジック
// ==============================

/** 予定追加 (LLM → parse → API直接呼び出し + 音声フィードバック強化 + トースト機能追加) */
async function add_calendar(text) {
  // ChatSpace.jsのプロンプトを採用
  const prompt = `
  目標: ユーザーが追加したい予定の抽出
  抽出必須項目:
  - name（予定名）
  - start_time（未指定時は当日/推測時刻）
  - end_time（未指定時は開始1H後）
  timeはYYYY-MM-DD HH:MM:SS
  出力はJSON配列のみ、他テキスト禁止。単独でも複数あっても2次元リストで返す。
  現在時刻:${new Date()}
  ユーザー入力:
  `;
  const raw = await gemini_request(prompt + text);
  const list = parseCalendarList(raw); // 既にikuto.jsのフィールド名name/start_time/end_timeを持っている

  if (list.length) {
    let addSuccessCount = 0;
    let addedEventsInfo = []; // 追加成功した予定の情報を格納
    
    for (const event of list) {
        const { name, start_time, end_time } = event;
        try {
            // ScheduleManagerのaddEventを直接呼び出す
            await manager.addEvent(
                name,
                "自動追加された予定です",
                start_time,
                end_time,
                msg => console.log(msg)
            );
            addSuccessCount++;
            addedEventsInfo.push({ name, start_time, end_time }); // 成功した情報を保存
        } catch (error) {
            console.error("予定追加エラー:", error);
            reader.speak(`申し訳ございません。「${name}」の予定追加に失敗しました。`);
        }
    }

    if (addSuccessCount > 0) {
        let speechMessage = `${addSuccessCount}件の予定の追加が完了いたしました。`;

        if (addSuccessCount === 1) {
            const firstAdded = addedEventsInfo[0];
            const startSpeechTime = formatTimeForSpeech(firstAdded.start_time);
            const endSpeechTime = formatTimeForSpeech(firstAdded.end_time);

            // 予定追加時の音声フィードバックを具体化
            speechMessage = `${startSpeechTime}から${endSpeechTime}の${firstAdded.name}の予定を追加しました。`;
        } else if (addSuccessCount > 1) {
            const firstAdded = addedEventsInfo[0];
            const startSpeechTime = formatTimeForSpeech(firstAdded.start_time);

            speechMessage = `${startSpeechTime}からの${firstAdded.name}の予定など、合計${addSuccessCount}件の予定を追加しました。`;
        }
        
        reader.speak(speechMessage);
        console.log(`[CAL/C] ${addSuccessCount}件の予定を追加しました。`);
        
        // ==============================
        // ✅ ChatSpace_ikuto.js からの統合: トースト発火
        // ==============================
        window.dispatchEvent(new CustomEvent('calendar:added', { detail: addedEventsInfo }));
        
    } else {
        reader.speak("予定の追加処理を試みましたが、すべて失敗しました。");
    }

  } else {
    reader.speak("申し訳ございません。予定の抽出に必要な情報が不足しているか、AIが予定を特定できませんでした。");
    console.warn("[CAL/C] 予定が抽出できませんでした。");
  }
}

/** 予定取得 (LLMで期間抽出 → API呼び出し) */
async function get_calender(text, isSilent = false) {
  // ChatSpace.jsの堅牢な実装を採用
  console.time("チャット解析処理 第二解析時間：カレンダー取得");
  const now = new Date();
  
  // 1️⃣ LLMで時間範囲を特定
  const prompt = `
  目標: ユーザーが取得、操作したい情報が存在するであろう時間の範囲の抽出。複数日の場合もある。
  抽出必須項目:
  - start_time
  - end_time
  timeはYYYY-MM-DD HH:MM:SS
  出力はJSON配列のみ、最小範囲は1日、最大範囲は半年で、一つの辞書で渡して。他テキスト禁止。
  現在時刻は${now}
  ユーザー入力:
  `;
  const raw = await gemini_request(prompt + text);
  const range = parseCalendarList(raw)[0];
  
  // 2️⃣ 範囲の確認とデフォルト値設定
  let start_time_iso, end_time_iso;
  if (!range || !range.start_time || !range.end_time) {
    console.warn("[CAL/G] AIが有効な時間範囲を返しませんでした。デフォルトで今日1日を取得します。");
    const start = new Date();
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    start_time_iso = start.toISOString();
    end_time_iso = end.toISOString();
  } else {
    start_time_iso = range.start_time;
    end_time_iso = range.end_time;
  }
  
  console.log(`[CAL/G] 取得範囲: ${start_time_iso} から ${end_time_iso}`);

  // 3️⃣ Google Calendar APIを呼び出してイベントを取得
  try {
    const events = await manager.listEvents(start_time_iso, end_time_iso, msg => console.log(msg));
    
    const eventList = events.items || events;
    let logOutput = "";
    let speechOutput = "";
    
    if (Array.isArray(eventList) && eventList.length > 0) {
      speechOutput = `予定を${eventList.length}件見つけました。`;
      logOutput = "--- 予定一覧 ---\n";
      eventList.forEach((event, index) => {
        const title = event.summary || "タイトルなし";
        const startTime = event.start && (event.start.dateTime || event.start.date) || "開始時刻不明";
        const endTime = event.end && (event.end.dateTime || event.end.date) || "終了時刻不明";
        
        const eventDetail = `  ${index + 1}. タイトル: ${title}, 開始: ${startTime}, 終了: ${endTime}\n`;
        logOutput += eventDetail;
        
        if (index < 3) { 
          speechOutput += `${index + 1}件目、${title}は${new Date(startTime).toLocaleTimeString()}から${new Date(endTime).toLocaleTimeString()}までです。`;
        }
      });
      if (eventList.length > 3) {
          speechOutput += `その他${eventList.length - 3}件の予定がございます。詳細はコンソールまたは画面をご確認ください。`;
      }
    } else {
      speechOutput = "該当する期間に予定は見つかりませんでした。";
      logOutput = "該当する期間に予定は見つかりませんでした。";
    }

    console.log(logOutput);

    // isSilentがfalseの場合のみ音声応答
    if (!isSilent) {
        reader.speak(speechOutput);
    }
    
    console.timeEnd("チャット解析処理 第二解析時間：カレンダー取得");
    // APIから返ってきたJSON文字列をそのまま返す
    return JSON.stringify(eventList); 
  } catch (error) {
    console.error("Googleカレンダー取得中にエラー:", error);
    reader.speak("申し訳ございません。カレンダーの取得中にエラーが発生しました。");
    console.timeEnd("チャット解析処理 第二解析時間：カレンダー取得");
    return JSON.stringify([]);
  }
}

/** 予定削除 (LLMで削除対象抽出 → API呼び出し) */
async function remove_calendar(text) {
  // 1️⃣ 削除対象となりうる予定一覧を取得 (isSilent=trueで呼び出し、取得時の発話は抑制)
  let task_list_json = await get_calender(text, true); 
  
  if (task_list_json === JSON.stringify([])) {
      reader.speak("カレンダーに該当する予定が見つからなかったため、削除処理を中断します。");
      return;
  }

  console.time("チャット解析処理 第三解析時間：カレンダー削除");
  const now = new Date();
  let prompt = `
  目標: ユーザーはカレンダーから予定を削除しようとしています。以下の「予定一覧」から、ユーザーが削除しようとしている予定を抽出してください。
  抽出必須項目:
  - name（予定名）
  - start_time（予定一覧から正確なYYYY-MM-DD HH:MM:SS形式の値を引用）
  - end_time（予定一覧から正確なYYYY-MM-DD HH:MM:SS形式の値を引用）
  出力はJSON配列のみ、他テキスト禁止。複数項目があろうが無かろうが2次元リストで返す。
  現在時刻は${now}
  予定一覧:${task_list_json}
  ユーザー入力:
  `;
  const raw = await gemini_request(prompt + text);

  // 2️⃣ LLMの応答を解析
  const eventsToDelete = parseCalendarList(raw);
  
  if (eventsToDelete.length === 0) {
    reader.speak("申し訳ございません。削除対象の予定を特定できませんでした。");
    console.warn("[CAL/D] 削除対象予定が抽出できませんでした。");
    console.timeEnd("チャット解析処理 第三解析時間：カレンダー削除");
    return;
  }

  // 3️⃣ 対象イベントをGoogleカレンダーから削除
  let deleteSuccessCount = 0;
  const eventList = JSON.parse(task_list_json); 
  let deletedEventsInfo = []; // 削除成功した予定の情報を格納

  for (const event of eventsToDelete) {
    const { name, start_time, end_time } = event; 
    
    // LLMが出力した時間形式(YYYY-MM-DD HH:MM:SS)をAPIのISO形式のベース(YYYY-MM-DDT...:SS)に変換
    const llm_time_iso_like = start_time.replace(' ', 'T'); 

    try {
      // 予定一覧から削除対象を検索。GoogleカレンダーイベントIDが必要です。
      const target = eventList.find(ev => 
        ev.summary === name && 
        (
          // 1. 特定時刻の予定の場合 (API: "YYYY-MM-DDT...:SS+ZZZ")
          (ev.start.dateTime && ev.start.dateTime.startsWith(llm_time_iso_like)) ||
          // 2. 終日予定の場合 (API: "YYYY-MM-DD")
          (ev.start.date === llm_time_iso_like.split('T')[0])
        )
      );
      
      if (target && target.id) {
        await manager.deleteEvent(target.id, msg => console.log(msg));
        deleteSuccessCount++;
        deletedEventsInfo.push({ name, start_time, end_time }); // 成功した情報を保存
      } else {
        console.warn(`削除対象が見つかりません: ${name} @ ${start_time}`);
      }
    } catch (error) {
      console.error("削除処理中にエラー:", error);
    }
  }

  if (deleteSuccessCount > 0) {
      let speechMessage = `${deleteSuccessCount}件の予定の削除が完了いたしました。`;

      if (deleteSuccessCount === 1) {
          const firstDeleted = deletedEventsInfo[0];
          const startSpeechTime = formatTimeForSpeech(firstDeleted.start_time);
          const endSpeechTime = formatTimeForSpeech(firstDeleted.end_time);

          speechMessage = `${startSpeechTime}から${endSpeechTime}の${firstDeleted.name}の予定を削除しました。`;
      } else if (deleteSuccessCount > 1) {
          const firstDeleted = deletedEventsInfo[0];
          const startSpeechTime = formatTimeForSpeech(firstDeleted.start_time);
          
          speechMessage = `${startSpeechTime}からの${firstDeleted.name}の予定など、合計${deleteSuccessCount}件の予定を削除しました。`;
      }
      
      reader.speak(speechMessage);
      console.log(`[CAL/D] ${deleteSuccessCount}件の予定を削除しました。`);
  } else {
      reader.speak("予定の削除に失敗したか、対象が見つかりませんでした。");
  }

  console.timeEnd("チャット解析処理 第三解析時間：カレンダー削除");
}

/** 予定変更 (LLMで変更前後を抽出 → API呼び出し) */
async function change_calendar(text) {
  // 1️⃣ 変更対象となりうる予定一覧を取得 (isSilent=trueで呼び出し、取得時の発話は抑制)
  let task_list_json = await get_calender(text, true); 
  
  if (task_list_json === JSON.stringify([])) {
      reader.speak("カレンダーに該当する予定が見つからなかったため、変更処理を中断します。");
      return;
  }

  console.time("チャット解析処理 第三解析時間：カレンダー変更");
  const now = new Date();
  let prompt = `
  目標:ユーザーが変更したい予定の情報の抽出
  抽出必須項目:
  - before_name（変更前の予定名）
  - before_start_time（変更前の正確な時刻を予定一覧から引用 YYYY-MM-DD HH:MM:SS）
  - before_end_time（変更前の正確な時刻を予定一覧から引用 YYYY-MM-DD HH:MM:SS）
  - after_name (変更後の予定名。変更がなければbefore_nameを引用)
  - after_start_time (変更後の開始時刻 YYYY-MM-DD HH:MM:SS)
  - after_end_time (変更後の終了時刻 YYYY-MM-DD HH:MM:SS)
  出力はJSON配列のみ、他テキスト禁止。単独でも複数あっても２次元リストで返す
  現在時刻は${now}
  予定一覧:${task_list_json}
  ユーザー入力:
  `;
  const raw = await gemini_request(prompt + text);
  
  // 2️⃣ LLMの応答を解析
  const eventsToChange = parseCalendarList(raw);

  if (eventsToChange.length === 0) {
    reader.speak("申し訳ございません。変更対象の予定とその内容を特定できませんでした。");
    console.warn("[CAL/M] 変更対象予定が抽出できませんでした。");
    console.timeEnd("チャット解析処理 第三解析時間：カレンダー変更");
    return;
  }
  
  // 3️⃣ 対象イベントをGoogleカレンダーで変更（削除＆追加で実現）
  let changeSuccessCount = 0;
  const eventList = JSON.parse(task_list_json); 
  let changedEventsInfo = []; // 変更成功した予定の情報を格納

  for (const event of eventsToChange) {
    const { before_name, before_start_time, after_name, after_start_time, after_end_time } = event;
    
    // 変更後の情報が不足している場合はスキップ
    if (!after_start_time || !after_end_time) {
        console.warn("変更後の時刻情報が不足しています。スキップします。", event);
        continue;
    }
    
    // 変更前も同様に時間形式を変換
    const llm_time_iso_like = before_start_time.replace(' ', 'T'); 

    try {
      // 変更前の情報で検索し、IDを取得
      const target = eventList.find(ev => 
        ev.summary === before_name && 
        (
          // 1. 特定時刻の予定の場合
          (ev.start.dateTime && ev.start.dateTime.startsWith(llm_time_iso_like)) ||
          // 2. 終日予定の場合
          (ev.start.date === llm_time_iso_like.split('T')[0])
        )
      );
      
      if (target && target.id) {
        // 既存イベントを削除
        await manager.deleteEvent(target.id, msg => console.log(msg));
        
        // 新しいイベントを追加
        await manager.addEvent(
          after_name,
          "AIにより変更された予定です",
          after_start_time,
          after_end_time,
          msg => console.log(msg)
        );
        changeSuccessCount++;
        changedEventsInfo.push(event); // 成功した情報を保存
      } else {
        console.warn(`変更対象が見つかりません: ${before_name} @ ${before_start_time}`);
      }
    } catch (error) {
      console.error("変更処理中にエラー:", error);
    }
  }

  if (changeSuccessCount > 0) {
      let speechMessage = `${changeSuccessCount}件の予定の変更が完了いたしました。`;

      if (changeSuccessCount === 1) {
          const firstChanged = changedEventsInfo[0];
          
          const beforeStart = formatTimeForSpeech(firstChanged.before_start_time);
          const beforeEnd = formatTimeForSpeech(firstChanged.before_end_time);
          const afterStart = formatTimeForSpeech(firstChanged.after_start_time);
          const afterEnd = formatTimeForSpeech(firstChanged.after_end_time);

          if (firstChanged.before_name === firstChanged.after_name) {
              // 予定名が変わっていない場合
              speechMessage = `${firstChanged.before_name}の予定を、${beforeStart}から${beforeEnd}から${afterStart}から${afterEnd}に時刻変更しました。`;
          } else {
              // 予定名が変わっている場合
              speechMessage = `${beforeStart}から${beforeEnd}の${firstChanged.before_name}の予定を、「${firstChanged.after_name}、${afterStart}から${afterEnd}」に変更しました。`;
          }
      } else if (changeSuccessCount > 1) {
          const firstChanged = changedEventsInfo[0];
          const beforeStart = formatTimeForSpeech(firstChanged.before_start_time);
          
          speechMessage = `${beforeStart}からの${firstChanged.before_name}の予定など、合計${changeSuccessCount}件の予定を変更しました。`;
      }
      
      reader.speak(speechMessage);
      console.log(`[CAL/M] ${changeSuccessCount}件の予定を変更しました。`);
  } else {
      reader.speak("予定の変更に失敗したか、対象が見つかりませんでした。");
  }

  console.timeEnd("チャット解析処理 第三解析時間：カレンダー変更");
}


// ==============================
// インジケーターイベント
// ==============================

/** AIインジケータ更新イベントを発火 */
function fire(name, detail) {
  document.dispatchEvent(new CustomEvent(name, { detail }));
}