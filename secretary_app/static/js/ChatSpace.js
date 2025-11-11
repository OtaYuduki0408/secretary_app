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

// ==============================
// LLMコア機能（共通化）
// ==============================
/**
 * ユーザー入力を受け付け、LLMで解析・処理を分岐するメインエントリポイント。
 * @param {string} inputValue - ユーザーの入力テキスト
 */
export async function check_chat_Space(inputValue) {
  fire('analysis:start', { steps: ['処理開始'] });
  console.time("チャット解析 総所要時間");
  console.log("入力検知:", inputValue);
  reader.speak(`${inputValue}でございますね。かしこまりました。`);

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputValue: inputValue }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    console.log("APIからの応答:", result);
    fire('analysis:step', { index: 1, label: '処理完了' });

    if (result.message) {
      reader.speak(result.message);
    }

    // 必要に応じて、result.purpose や result.data を使ってトースト通知やUI更新を行う
    if (result.purpose === "Ca" && result.data) {
      window.dispatchEvent(new CustomEvent('calendar:added', { detail: result.data }));
    } else if (result.purpose === "Cd" && result.data) {
      window.dispatchEvent(new CustomEvent('calendar:deleted', { detail: result.data }));
    } else if (result.purpose === "Cc" && result.data) {
      window.dispatchEvent(new CustomEvent('calendar:changed', { detail: result.data }));
    }
    // Cg (取得) の場合は、メッセージを読み上げるだけで良いことが多いが、
    // 必要であれば別途イベントを発火してUIに表示することも可能

  } catch (error) {
    console.error("ChatSpace API呼び出しエラー:", error);
    reader.speak("申し訳ございません。処理中にエラーが発生しました。");
  } finally {
    console.timeEnd("チャット解析 総所要時間");
    fire('analysis:end');
  }
}

// ==============================
// インジケーターイベント
// ==============================

// ==============================
// インジケーターイベント
// ==============================

/** AIインジケータ更新イベントを発火 */
function fire(name, detail) {
  document.dispatchEvent(new CustomEvent(name, { detail }));
}
// ==========================
// Flaskコマンドポーリング
// ==========================

async function pollChatSpaceCommand() {
  try {
    const resp = await fetch("/api/chatspace/state");
    const data = await resp.json();
    if (data.command === "start_voice") {
      console.log("🎤 Flaskから音声起動指令を受信");
      // ✅ 自動音声起動
      if (typeof startVoice === "function") {
        startVoice();
      } else {
        const btn = document.querySelector("#voiceButton");
        if (btn) {
          console.log("🎤 音声ボタンを自動クリック");
          btn.click();
        } else {
          console.log("⚠️ 音声起動関数もボタンも見つかりません。");
        }
      }
      await fetch("/api/chatspace/clear");
    }
  } catch (err) {
    console.warn("状態取得エラー:", err);
  }
}
setInterval(pollChatSpaceCommand, 2000);


// ==========================
// 音声起動関数（予備）
// ==========================
function startVoice() {
  try {
    const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.lang = 'ja-JP';
    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript;
      console.log("🎙️ 音声入力:", text);
      check_chat_Space(text);
    };
    recognition.start();
    console.log("🎤 音声認識を開始しました");
  } catch (err) {
    console.error("音声起動エラー:", err);
  }
}

