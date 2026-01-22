// ===================================
// ChatSpace.js（統合・整理版 - トースト機能追加済み）
// ===================================

// 必要なモジュールをインポート
import { TextToSpeechReader } from "/static/js/TextToSpeechReader.js";
import { ScheduleManager } from "/static/js/ScheduleManager.js"; // Googleカレンダー操作クラス
console.log("✅ ChatSpace.js ロード完了 (トースト機能付き)");

const reader = new TextToSpeechReader(); // 音声読み上げ
console.log(`DEBUG: TextToSpeechReader初期化。利用可能な音声数: ${reader.voices.length}`);
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
// ログ出力用のヘルパー関数を定義
function log(message) {
  console.log("[ScheduleManager Log]:", message);
  // 必要であれば、ここでUIにメッセージを表示するなどの処理を追加
  // 例: showToast(message);
}

/**
 * ユーザー入力を受け付け、LLMで解析・処理を分岐するメインエントリポイント。
 * @param {string} inputValue - ユーザーの入力テキスト
 */
export async function check_chat_Space(inputValue) {
  fire('analysis:start', { steps: ['処理開始'] });
  console.time("チャット解析 総所要時間");
  console.log("入力検知:", inputValue);
  // console.log(`DEBUG: ユーザー入力読み上げ: "${inputValue}でございますね。かしこまりました。"`); // デバッグログ削除
  reader.speak(`${inputValue}ですね。`);

  try {
    const response = await fetch('/web_api/chat', {
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
    console.log("DEBUG: APIからの最終応答:", result); // ここにresultオブジェクト全体をログ出力
    fire('analysis:step', { index: 1, label: '処理完了' });

    async function applyToneSetting(message) {
      try {
        const raw = localStorage.getItem('appSettings');
        if (!raw) return message;
        const settings = JSON.parse(raw);
        const tone = settings?.main?.tone || '';
        if (!tone.trim()) return message;
        const response = await fetch('/web_api/transform_tone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: message, tone }),
        });
        if (!response.ok) {
          return message;
        }
        const data = await response.json();
        return data?.message || message;
      } catch (e) {
        console.warn("口調の適用に失敗しました。", e);
        return message;
      }
    }

    if (result.message) {
      const finalMessage = await applyToneSetting(result.message);
      console.log(`DEBUG: API応答メッセージ読み上げ: "${finalMessage}"`);
      if (window.addResponseLogEntry) {
        window.addResponseLogEntry(finalMessage);
      }
      reader.speak(finalMessage);
    }

    // 高速実行へのフォールバック処理
    if (result.fallback_to_voicemate) {
      console.log("DEBUG: 高速実行トにフォールバックします。");
      // アナウンスを読み上げた後、少し待機
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2秒待機

      // 元のinputValueから「高速実行て、再度check_chat_Spaceを呼び出す
      const originalCommand = inputValue.replace(高速実行);
      console.log(`DEBUG: フォールバック後の入力: "${originalCommand}"`);
      await check_chat_Space(originalCommand);
      return; // フォールバック処理が完了したら、以降の処理はスキップ
    }

    // Python側から返された action に応じてカレンダー操作を実行
    if (result.action === "add_calendar_event" && result.data) {
      console.log("--- [DEBUG] ChatSpace.js: add_calendar_event action detected ---"); // 追加
      // 複数のイベントが返される可能性があるので、ループで処理
      for (const eventData of result.data) {
        console.log("--- [DEBUG] ChatSpace.js: Calling manager.addEvent with:", eventData); // 追加
        await manager.addEvent(
          eventData.name,
          eventData.description || "", // description がない場合を考慮
          eventData.start_time,
          eventData.end_time,
          log // log 関数を渡す
        );
        console.log("--- [DEBUG] ChatSpace.js: manager.addEvent call completed ---"); // 追加
      }
      // トースト通知は ScheduleManager.js の addEvent 内で処理されるか、別途ここで発火
      window.dispatchEvent(new CustomEvent('calendar:added', { detail: result.data }));
      console.log("--- [DEBUG] ChatSpace.js: calendar:added event dispatched ---"); // 追加
    } else if (result.action === "remove_calendar_event" && result.data) {
      for (const eventData of result.data) {
        // 削除には eventId が必要。Python側から返されるデータに id が含まれているか確認
        if (eventData.id) {
          await manager.deleteEvent(eventData.id, log);
        } else {
          console.warn("削除対象のイベントIDが見つかりません:", eventData);
        }
      }
      window.dispatchEvent(new CustomEvent('calendar:deleted', { detail: result.data }));
    } else if (result.action === "get_calendar_events" && result.data) {
      // 取得の場合、result.data には期間情報が含まれる
      const events = await manager.listEvents(result.data.start_time, result.data.end_time, log);
      // 取得したイベントをUIに表示するなどの処理が必要であればここに追加
      // 現状は log 関数で出力されるのみ
      window.dispatchEvent(new CustomEvent('calendar:listed', { detail: events })); // 新しいイベントを発火
    } else if (result.action === "change_calendar_event" && result.data) {
      for (const eventData of result.data) {
        // 変更には eventId が必要。Python側から返されるデータに id が含まれているか確認
        if (eventData.id) {
          await manager.updateEvent(
            eventData.id,
            eventData.after_start_time,
            eventData.after_end_time,
            eventData.after_name,
            eventData.after_description || "", // description がない場合を考慮
            log
          );
        } else {
          console.warn("変更対象のイベントIDが見つかりません:", eventData);
        }
      }
      window.dispatchEvent(new CustomEvent('calendar:changed', { detail: result.data }));
    }

  } catch (error) {
    console.error("ChatSpace API呼び出しエラー:", error);
    reader.speak("申し訳ございません。処理中にエラーが発生しました。");
  } finally {
    console.timeEnd("チャット解析 総所要時間");
    fire('analysis:end');
  }
}
window.check_chat_Space = check_chat_Space;

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
