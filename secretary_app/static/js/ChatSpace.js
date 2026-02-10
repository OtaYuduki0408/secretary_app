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

let abortRequested = false;
let abortUntil = 0;

// --- ここから高速応答用の修正 ---
let localTriggers = [];
let isLocalTriggersLoaded = false;

async function loadLocalTriggers() {
    if (window.AndroidSync && typeof window.AndroidSync.request === 'function') {
        try {
            // ネイティブ側にトリガーリストを要求
            const resultJson = window.AndroidSync.request("GET", "/custom_commands/triggers", null);
            const result = JSON.parse(resultJson);
            if (result.status === 200 && Array.isArray(result.body.triggers)) {
                localTriggers = result.body.triggers;
                isLocalTriggersLoaded = true;
                console.log('ローカルの高速応答トリガーをロードしました:', localTriggers);
            } else {
                console.error('ローカルの高速応答トリガーのロードに失敗しました:', result.body);
            }
        } catch (e) {
            console.error('ローカルの高速応答トリガーのロード中にエラーが発生しました:', e);
        }
    } else {
        console.log('AndroidSyncが利用できないため、ローカルの高速応答トリガーは無効です。');
    }
}
// アプリ起動時にトリガーを読み込む
loadLocalTriggers();
// --- ここまで高速応答用の修正 ---


function setAbortCooldown(ms = 10000) {
  abortUntil = Date.now() + ms;
}

function isAbortCooldownActive() {
  return Date.now() < abortUntil;
}

function stopStandardTts() {
  abortRequested = true;
  try {
    if (reader) reader.stop();
  } catch (e) {
    console.warn("読み上げ停止に失敗しました。", e);
  }
  if (typeof speechSynthesis !== 'undefined') {
    speechSynthesis.cancel();
  }
  document.dispatchEvent(new CustomEvent('voice:playend'));
  if (typeof window.__chatLoadingIndicatorStop === 'function') {
    window.__chatLoadingIndicatorStop();
    window.__chatLoadingIndicatorStop = null;
  }
}

async function requestAbortToServer(source = 'button') {
  setAbortCooldown();
  stopStandardTts();
  try {
    const response = await fetch('/web_api/abort', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source })
    });
    const data = await response.json();
    if (window.addResponseLogEntry) {
      window.addResponseLogEntry("強制終了しました。");
      if (data?.cancelled === true) {
        window.addResponseLogEntry("処理を正常に終了させました。");
      } else if (data?.cancelled === false) {
        window.addResponseLogEntry("処理は実行されてしまいました。");
      }
    }
  } catch (e) {
    console.warn("強制終了の通知に失敗しました。", e);
    if (window.addResponseLogEntry) {
      window.addResponseLogEntry("強制終了の通知に失敗しました。");
    }
  }
}

function setAbortButtonVisible(visible) {
  const btn = document.getElementById('force-abort-btn');
  if (!btn) return;
  btn.disabled = !visible;
  btn.setAttribute('aria-hidden', visible ? 'false' : 'true');
  btn.setAttribute('aria-disabled', visible ? 'false' : 'true');
  btn.style.opacity = visible ? '1' : '0.45';
  btn.style.pointerEvents = visible ? 'auto' : 'none';
  if (visible) {
    btn.classList.add('is-active');
  } else {
    btn.classList.remove('is-active');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('force-abort-btn');
  if (btn) {
    btn.addEventListener('click', () => requestAbortToServer('button'));
    setAbortButtonVisible(false);
  }
});

document.addEventListener('analysis:start', () => setAbortButtonVisible(true));
document.addEventListener('analysis:end', () => setAbortButtonVisible(false));

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

// ??????????????????
function stripWakeWords(text) {
  if (!text) return text;
  try {
    const raw = localStorage.getItem('appSettings');
    if (!raw) return text;
    const settings = JSON.parse(raw);
    const wakeWordsRaw = settings?.main?.wakeWords || '';
    if (!wakeWordsRaw) return text;
    const words = wakeWordsRaw
      .split(',')
      .map(word => word.trim())
      .filter(Boolean);
    if (words.length === 0) return text;
    let cleaned = text;
    words.forEach((word) => {
      cleaned = cleaned.replaceAll(word, '');
    });
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    return cleaned || text;
  } catch (e) {
    console.warn('?????????????????', e);
    return text;
  }
}


/**
 * ユーザー入力を受け付け、LLMで解析・処理を分岐するメインエントリポイント。
 * @param {string} inputValue - ユーザーの入力テキスト
 */
export async function check_chat_Space(inputValue) {
  if (isAbortCooldownActive()) {
    if (window.addResponseLogEntry) {
      window.addResponseLogEntry("???????????????????");
    }
    return;
  }

  const cleanedInput = stripWakeWords(inputValue);

  // --- 高速応答ロジック ---
  if (isLocalTriggersLoaded) {
    const matchedTrigger = localTriggers.find(trigger => cleanedInput.includes(trigger));
    if (matchedTrigger) {
        console.log(`ローカルの高速応答トリガーに一致: ${matchedTrigger}`);
        fire('analysis:start', { steps: ['ローカル処理'] });
        try {
            // ローカルDBにアクションを問い合わせる
            const resultJson = window.AndroidSync.request("GET", `/custom_commands?trigger=${encodeURIComponent(matchedTrigger)}`, null);
            const result = JSON.parse(resultJson);

            if (result.status === 200 && Array.isArray(result.body.payloads)) {
                if (typeof window.executeOrderPayload === "function") {
                    for (const payload of result.body.payloads) {
                        await window.executeOrderPayload(payload);
                    }
                } else {
                    console.warn("executeOrderPayload is not available on window.");
                }
            } else {
                 throw new Error(result.body.error || 'ローカルコマンドの実行に失敗しました。');
            }
        } catch (e) {
            console.error(e);
            const errorMessage = await applyToneSetting("申し訳ございません。ローカルコマンドの実行に失敗しました。", 'error');
            reader.speak(errorMessage);
        } finally {
            fire('analysis:end');
        }
        return; // サーバーには問い合わせない
    }
  }
  // --- 高速応答ロジックここまで ---

  fire('analysis:start', { steps: ['処理開始'] });
  console.time("チャット解析 総所要時間");
  console.log("入力検知:", inputValue);

  async function applyToneSetting(message, applyTarget) {
    try {
      const raw = localStorage.getItem('appSettings');
      if (!raw) return message;
      const settings = JSON.parse(raw);
      const toneByTarget = {
        response: settings?.main?.toneResponse || '',
        error: settings?.main?.toneError || '',
      };
      const tone = applyTarget ? toneByTarget[applyTarget] : '';
      if (!tone || !tone.trim()) {
        return message;
      }
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

  let inputConfirmText = null;
  try {
    const raw = localStorage.getItem('appSettings');
    if (raw) {
      const settings = JSON.parse(raw);
      const enabled = settings?.main?.inputConfirmEnabled !== false;
      const template = settings?.main?.inputConfirmTemplate || 'でございますね。かしこまりました。';
      if (enabled) {
        inputConfirmText = `${inputValue}${template}`;
      }
    }
  } catch (e) {
    console.warn("入力確認設定の読み込みに失敗しました。", e);
  }
  if (inputConfirmText) {
    reader.speak(inputConfirmText);
  }

  // 読み込み中の動的表示を追加
  const loadingIndicator = (() => {
    const container = document.getElementById('voice-log-container');
    if (!container) return null;
    let dots = 0;
    let timerId = null;
    const entry = document.createElement('div');
    entry.className = 'voice-log-entry log-interim';
    entry.textContent = '読み込み中';
    container.appendChild(entry);
    container.scrollTop = container.scrollHeight;
    timerId = setInterval(() => {
      dots = (dots + 1) % 4;
      entry.textContent = `読み込み中${'.'.repeat(dots)}`;
    }, 450);
    const stopper = {
      stop: () => {
        if (timerId) clearInterval(timerId);
        if (entry.parentNode) entry.remove();
      }
    };
    window.__chatLoadingIndicatorStop = stopper.stop;
    return stopper;
  })();

  try {
    const response = await fetch('/web_api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputValue: cleanedInput }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    console.log("DEBUG: APIからの最終応答:", result); // ここにresultオブジェクト全体をログ出力
    fire('analysis:step', { index: 1, label: '処理完了' });

    // YouTube再生リクエストをハンドル
    if (result.purpose === 'Yp' && result.data && result.data.search_query) {
        if (typeof window.playYoutubeVideo === 'function') {
            window.playYoutubeVideo(result.data.search_query);
        } else {
            console.error("YouTube player function (playYoutubeVideo) is not available.");
            // フォールバックとしてメッセージを読み上げる
            reader.speak("YouTubeプレーヤーを読み込めませんでした。");
        }
        // YouTube再生がトリガーされた場合、以降のメッセージ読み上げなどはスキップ
        return;
    }

    if (result.abort_command) {
      setAbortCooldown();
      stopStandardTts();
      if (window.addResponseLogEntry) {
        window.addResponseLogEntry("強制終了しました。");
        if (result.cancelled === true) {
          window.addResponseLogEntry("処理を正常に終了させました。");
        } else if (result.cancelled === false) {
          window.addResponseLogEntry("処理は実行されてしまいました。");
        }
      }
      return;
    }

    if (Array.isArray(result.order_payloads) && result.order_payloads.length > 0) {
      console.log("DEBUG: Voice trigger payloads received:", result.order_payloads);
      if (typeof window.executeOrderPayload === "function") {
        for (const payload of result.order_payloads) {
          await window.executeOrderPayload(payload);
        }
      } else {
        console.warn("executeOrderPayload is not available on window. Queueing payloads.");
        window.__pendingOrderPayloads = (window.__pendingOrderPayloads || []).concat(result.order_payloads);
        let attempts = 0;
        const maxAttempts = 40; // 2s (50ms * 40)
        const intervalId = setInterval(async () => {
          attempts += 1;
          if (typeof window.executeOrderPayload === "function") {
            clearInterval(intervalId);
            const queued = window.__pendingOrderPayloads || [];
            window.__pendingOrderPayloads = [];
            console.log("DEBUG: executeOrderPayload is now available. Flushing queued payloads.", queued.length);
            for (const payload of queued) {
              await window.executeOrderPayload(payload);
            }
          } else if (attempts >= maxAttempts) {
            clearInterval(intervalId);
            console.warn("executeOrderPayload is still unavailable after waiting.");
          }
        }, 50);
      }
      return;
    }
    if (result.triggered_by_voice) {
      console.warn("Voice trigger matched but no order_payloads were returned.", result);
    }

    if (result.message && !result.suppress_tts) {
      const finalMessage = result.skip_tone
        ? result.message
        : await applyToneSetting(result.message, 'response');
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
      const originalCommand = cleanedInput.replace(高速実行);
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
    const errorMessage = await applyToneSetting("申し訳ございません。処理中にエラーが発生しました。", 'error');
    reader.speak(errorMessage);
  } finally {
    if (loadingIndicator) {
      loadingIndicator.stop();
    }
    abortRequested = false;
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