// ============================================================================
// グローバル変数と定数
// ============================================================================
let WAKE_WORDS = ['サイレントメイト', 'ぼいすめいと', 'voicemate', '高速実行', 'クイックコマンド'];
const VOICE_WATE_SOUND_PATH = '/static/voice/voice_wate.mp3';
const RELODE_SOUND_PATH = '/static/voice/relode.mp3';
const ERROR_SOUND_PATH = '/static/voice/error.mp3';
const INPUT_COOLTIME_MS = 500; // 0.5秒の入力クールタイム

let recognition; // SpeechRecognitionインスタンス
let currentMode = 'waiting'; // 'waiting' or 'listening'
let recognitionTimeoutId; // 音声入力タイムアウトのID
let shouldDisplayAllSpeech = false; // 全ての音声をログに表示するかどうかの設定
const DEFAULT_END_WORDS = ['命令完了'];
let END_WORDS = [...DEFAULT_END_WORDS]; // 音声入力の強制終了ワード（カンマ区切りOR）
let settingsEndWords = [...DEFAULT_END_WORDS];
let customTriggerEndWords = [];

// モバイル環境のみの制御
const isMobileDevice = (() => {
    const ua = navigator.userAgent || '';
    return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || 'ontouchstart' in window;
})();
let lastRestartAt = 0;
const MOBILE_RESTART_COOLDOWN_MS = 3000;
const DUPLICATE_SUPPRESS_MS = 5000;
// エンドワード未検出の最終認識は、誤確定を避けるため長めに待って送信する。
const FINAL_COMMAND_DEBOUNCE_MS = 5000;
const ENDWORD_DETECTION_SUPPRESS_MS = 3000;
const ENDWORD_INPUT_BLOCK_MS = 3000;
let lastDispatchedVoiceCommandKey = '';
let lastDispatchedVoiceCommandAt = 0;
let isRecognitionActive = false;
let pendingFinalCommand = '';
let pendingFinalDispatchTimerId = null;
let lastDetectedEndWordKey = '';
let lastDetectedEndWordAt = 0;
let endWordInputBlockedUntil = 0;

// TTS (Text-to-Speech) 設定
const speechSynth = window.speechSynthesis;
const speechUtterance = new SpeechSynthesisUtterance();
speechUtterance.lang = 'ja-JP';
speechUtterance.volume = 1;
speechUtterance.rate = 1;
speechUtterance.pitch = 1;

let userInteracted = false; // ユーザーがページとインタラクトしたかどうかのフラグ
window.audioContext = null; // ★ グローバルなAudioContextを追加

// 設定からアプリ関連の値を読み込む (呼びかけワード、ログ表示設定など)
function loadAppSettings() {
    try {
        const raw = localStorage.getItem('appSettings');
        if (!raw) {
            shouldDisplayAllSpeech = false; // デフォルトはOff
            settingsEndWords = [...DEFAULT_END_WORDS];
            rebuildEffectiveEndWords();
            return;
        }
        const settings = JSON.parse(raw);
        
        // 呼びかけワードを読み込む
        const wakeWordsRaw = settings?.main?.wakeWords || '';
        if (wakeWordsRaw) {
            const words = wakeWordsRaw
                .split(',')
                .map(word => word.trim())
                .filter(Boolean);
            if (words.length > 0) {
                WAKE_WORDS = words;
            }
        } else {
            WAKE_WORDS = ['サイレントメイト', 'ぼいすめいと', 'voicemate', '高速実行', 'クイックコマンド']; // デフォルト値
        }

        // ログ表示設定を読み込む
        shouldDisplayAllSpeech = settings?.main?.displayAllSpeech ?? false;
        settingsEndWords = parseEndWords(settings?.main?.endWord || '命令完了'); // エンドワードを読み込む
        rebuildEffectiveEndWords();

    } catch (e) {
        console.warn('アプリ設定の読み込みに失敗しました。', e);
        shouldDisplayAllSpeech = false; // エラー時はデフォルトOff
        settingsEndWords = [...DEFAULT_END_WORDS]; // エラー時はデフォルト値を設定
        rebuildEffectiveEndWords();
    }
}

loadAppSettings();
loadCustomVoiceTriggerEndWords();
document.addEventListener('app-settings:updated', loadAppSettings);

function parseEndWords(rawEndWords) {
    if (typeof rawEndWords !== 'string') {
        return [...DEFAULT_END_WORDS];
    }
    const parsed = rawEndWords
        .split(',')
        .map(word => word.trim())
        .filter(Boolean);
    return parsed.length > 0 ? parsed : [...DEFAULT_END_WORDS];
}

function uniqueNormalizedWords(words) {
    const seen = new Set();
    const result = [];
    (Array.isArray(words) ? words : []).forEach((raw) => {
        const word = String(raw || '').trim();
        if (!word) return;
        const key = word.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        result.push(word);
    });
    return result;
}

function rebuildEffectiveEndWords() {
    END_WORDS = uniqueNormalizedWords([
        ...DEFAULT_END_WORDS,
        ...settingsEndWords,
        ...customTriggerEndWords,
    ]);
}

function extractVoiceTriggerEndWordsFromOrder(order) {
    const words = [];
    if (!order || typeof order !== 'object') return words;

    const triggers = Array.isArray(order.triggers) ? order.triggers : [];
    const voiceTriggers = triggers.filter((trigger) => {
        const category = String(trigger?.category || '').trim().toLowerCase();
        return category === 'ボイス' || category === 'voice';
    });

    voiceTriggers.forEach((trigger) => {
        const value = trigger?.value || {};
        const keywords = value.keywords;
        if (Array.isArray(keywords)) {
            keywords.forEach((group) => {
                if (Array.isArray(group)) {
                    const normalizedGroup = group
                        .map((v) => String(v || '').trim())
                        .filter(Boolean);
                    words.push(...normalizedGroup);
                    return;
                }

                const single = String(group || '').trim();
                if (single) {
                    words.push(single);
                }
            });
        }

        const legacyKeyword = value.keyword;
        if (typeof legacyKeyword === 'string') {
            const normalized = legacyKeyword.trim();
            if (normalized) words.push(normalized);
        }

        const legacyValue = value.value;
        if (typeof legacyValue === 'string') {
            const normalized = legacyValue.trim();
            if (normalized) words.push(normalized);
        }
    });

    return uniqueNormalizedWords(words);
}

async function loadCustomVoiceTriggerEndWords() {
    try {
        const response = await fetch('/api/custom_orders', {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' },
        });
        if (!response.ok) {
            console.warn(`カスタム命令の取得に失敗しました: HTTP ${response.status}`);
            return;
        }

        const orders = await response.json();
        if (!Array.isArray(orders)) return;

        const collected = [];
        orders.forEach((order) => {
            collected.push(...extractVoiceTriggerEndWordsFromOrder(order));
        });

        customTriggerEndWords = uniqueNormalizedWords(collected);
        rebuildEffectiveEndWords();
        console.log('[VOICE] カスタム命令ボイストリガーをエンドワードへ反映しました:', customTriggerEndWords);
    } catch (error) {
        console.warn('カスタム命令ボイストリガーの反映に失敗しました:', error);
    }
}

function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findEndWordMatch(text) {
    if (!text || !Array.isArray(END_WORDS) || END_WORDS.length === 0) {
        return null;
    }
    const originalText = String(text || '').trim();
    if (!originalText) return null;

    const commandOnly = stripLeadingWakeWords(originalText).trim();
    if (!commandOnly) return null;

    for (const rawWord of END_WORDS) {
        const word = String(rawWord || '').trim();
        if (!word) continue;
        if (commandOnly === word) {
            const index = originalText.lastIndexOf(word);
            return {
                word,
                index: index >= 0 ? index : 0,
                endIndex: index >= 0 ? index + word.length : word.length,
            };
        }
    }
    return null;
}

function stripLeadingWakeWords(text) {
    let normalized = (text || '').trim();
    if (!normalized) return normalized;
    const wakeWordsByLength = [...WAKE_WORDS].sort((a, b) => b.length - a.length);
    let changed = true;
    while (changed) {
        changed = false;
        const lowered = normalized.toLowerCase();
        for (const wakeWord of wakeWordsByLength) {
            const loweredWakeWord = wakeWord.toLowerCase();
            if (lowered.startsWith(loweredWakeWord)) {
                normalized = normalized.slice(wakeWord.length).trim();
                changed = true;
                break;
            }
        }
    }
    return normalized;
}

function normalizeCommandForDuplicateCheck(text) {
    let normalized = stripLeadingWakeWords(text || '');
    END_WORDS.forEach(word => {
        if (!word) return;
        const regex = new RegExp(escapeRegExp(word), 'gi');
        normalized = normalized.replace(regex, ' ');
    });
    // 句読点差異での重複判定漏れを減らす
    normalized = normalized.replace(/[。、！？!?]/g, ' ');
    return normalized.toLowerCase().replace(/\s+/g, ' ').trim();
}

function shouldSuppressDuplicateVoiceCommand(commandText) {
    const key = normalizeCommandForDuplicateCheck(commandText);
    if (!key) {
        return false;
    }
    const now = Date.now();
    const isDuplicate = key === lastDispatchedVoiceCommandKey && (now - lastDispatchedVoiceCommandAt) < DUPLICATE_SUPPRESS_MS;
    if (!isDuplicate) {
        lastDispatchedVoiceCommandKey = key;
        lastDispatchedVoiceCommandAt = now;
    }
    return isDuplicate;
}

function mergeRecognizedCommandSegments(previousText, newText) {
    const prev = String(previousText || '').trim();
    const next = String(newText || '').trim();
    if (!prev) return next;
    if (!next) return prev;
    if (next.includes(prev)) return next;
    if (prev.includes(next)) return prev;
    return `${prev} ${next}`.replace(/\s+/g, ' ').trim();
}

function clearPendingFinalDispatch() {
    if (pendingFinalDispatchTimerId) {
        clearTimeout(pendingFinalDispatchTimerId);
        pendingFinalDispatchTimerId = null;
    }
    pendingFinalCommand = '';
}

function queuePendingFinalDispatch(commandText) {
    pendingFinalCommand = mergeRecognizedCommandSegments(pendingFinalCommand, commandText);

    if (pendingFinalDispatchTimerId) {
        clearTimeout(pendingFinalDispatchTimerId);
    }

    pendingFinalDispatchTimerId = setTimeout(() => {
        const commandToProcess = String(pendingFinalCommand || '').trim();
        pendingFinalDispatchTimerId = null;
        pendingFinalCommand = '';
        if (!commandToProcess) return;

        if (shouldSuppressDuplicateVoiceCommand(commandToProcess)) {
            console.log('DEBUG: 重複音声コマンドを抑止');
            return;
        }

        console.log(`DEBUG: 音声入力確定(非エンドワード・遅延送信): "${commandToProcess}"`);
        processInput(commandToProcess, 'voice');
    }, FINAL_COMMAND_DEBOUNCE_MS);
}

function ensureWakeWordInDisplay(commandText, transcriptText) {
    const text = String(commandText || '').trim();
    if (!text) return text;
    const hasWakeWord = WAKE_WORDS.some((word) => text.includes(word));
    if (hasWakeWord) return text;

    const transcript = String(transcriptText || '');
    const detectedWakeWord = WAKE_WORDS.find((word) => transcript.toLowerCase().includes(String(word).toLowerCase()));
    const wakeWord = (detectedWakeWord || WAKE_WORDS[0] || '').trim();
    if (!wakeWord) return text;
    return `${wakeWord} ${text}`.trim();
}

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * カレンダーUIを生成するヘルパー関数
 * @param {object} data - バックエンドから受け取ったdisplay_data
 * @returns {HTMLElement} 生成されたDOM要素
 */
function createCalendarUI(data) {
    const container = document.createElement('div');
    container.className = 'overlay-calendar-content';

    const title = document.createElement('h2');
    title.className = 'overlay-category-title';
    title.textContent = 'カレンダーの予定';
    container.appendChild(title);

    const dateRange = document.createElement('p');
    dateRange.className = 'overlay-date-range';
    const startDt = new Date(data.start_datetime);
    const endDt = new Date(data.end_datetime);
    dateRange.textContent = `${startDt.toLocaleDateString('ja-JP', {year: 'numeric', month: 'long', day: 'numeric'})} - ${endDt.toLocaleDateString('ja-JP', {year: 'numeric', month: 'long', day: 'numeric'})}`;
    container.appendChild(dateRange);

    if (data.events && data.events.length > 0) {
        const ul = document.createElement('ul');
        ul.className = 'overlay-event-list';
        data.events.forEach(event => {
            const li = document.createElement('li');
            li.className = 'overlay-event-item';
            const timeSpan = document.createElement('span');
            timeSpan.className = 'event-time';
            timeSpan.textContent = `${event.formatted_start_time || ''} - ${event.formatted_end_time || ''}`;
            const summarySpan = document.createElement('span');
            summarySpan.className = 'event-summary';
            summarySpan.textContent = event.summary;
            li.appendChild(timeSpan);
            li.appendChild(summarySpan);
            ul.appendChild(li);
        });
        container.appendChild(ul);
    } else {
        const noEvents = document.createElement('p');
        noEvents.className = 'overlay-no-data';
        noEvents.textContent = '予定は見つかりませんでした。';
        container.appendChild(noEvents);
    }
    return container;
}

/**
 * 収支管理UIを生成するヘルパー関数
 * @param {object} data - バックエンドから受け取ったdisplay_data
 * @returns {HTMLElement} 生成されたDOM要素
 */
function createFinanceUI(data) {
    const container = document.createElement('div');
    container.className = 'overlay-finance-content';

    const title = document.createElement('h2');
    title.className = 'overlay-category-title';
    title.textContent = '収支管理';
    container.appendChild(title);

    const dateRange = document.createElement('p');
    dateRange.className = 'overlay-date-range';
    dateRange.textContent = data.date_range || '期間指定なし';
    container.appendChild(dateRange);

    const details = data.details;
    if (details.item === 'total_balance' || details.item === 'monthly_expense' || details.item === 'daily_expense' || details.item === 'monthly_income') {
        const itemValue = document.createElement('p');
        itemValue.className = 'finance-value';
        itemValue.textContent = `${details.value.toLocaleString()} ${details.unit}`;
        container.appendChild(itemValue);
        const itemLabel = document.createElement('p');
        itemLabel.className = 'finance-label';
        itemLabel.textContent = details.item === 'total_balance' ? '現在の所持金' :
                                details.item === 'monthly_expense' ? '今月の支出' :
                                details.item === 'daily_expense' ? '今日の支出' :
                                '今月の収入';
        container.appendChild(itemLabel);
    } else if (details.item === 'remaining_to_target') {
        if (details.goal_amount) {
            const goalP = document.createElement('p');
            goalP.className = 'finance-label';
            goalP.textContent = `今月の目標: ${details.goal_amount.toLocaleString()} ${details.unit}`;
            container.appendChild(goalP);
            const remainingP = document.createElement('p');
            remainingP.className = 'finance-value';
            remainingP.textContent = `残り: ${details.remaining.toLocaleString()} ${details.unit}`;
            container.appendChild(remainingP);
        } else {
            const messageP = document.createElement('p');
            messageP.className = 'overlay-no-data';
            messageP.textContent = details.message || '目標額が設定されていません。';
            container.appendChild(messageP);
        }
    } else if (details.item === 'period_summary') {
        const summary = details.summary;
        const incomeP = document.createElement('p');
        incomeP.className = 'finance-summary-item income';
        incomeP.textContent = `収入: ${summary.total_income.toLocaleString()} ${summary.unit}`;
        container.appendChild(incomeP);
        const expenseP = document.createElement('p');
        expenseP.className = 'finance-summary-item expense';
        expenseP.textContent = `支出: ${summary.total_expense.toLocaleString()} ${summary.unit}`;
        container.appendChild(expenseP);
        const balanceP = document.createElement('p');
        balanceP.className = 'finance-summary-item balance';
        balanceP.textContent = `収支: ${summary.net_balance.toLocaleString()} ${summary.unit}`;
        container.appendChild(balanceP);
    } else {
        const messageP = document.createElement('p');
        messageP.className = 'overlay-no-data';
        messageP.textContent = details.message || 'データが見つかりませんでした。';
        container.appendChild(messageP);
    }
    return container;
}

/**
 * メモUIを生成するヘルパー関数
 * @param {object} data - バックエンドから受け取ったdisplay_data
 * @returns {HTMLElement} 生成されたDOM要素
 */
function createMemoUI(data) {
    const container = document.createElement('div');
    container.className = 'overlay-memo-content';

    const title = document.createElement('h2');
    title.className = 'overlay-category-title';
    title.textContent = 'メモ';
    container.appendChild(title);

    if (data.memos && data.memos.length > 0) {
        const ul = document.createElement('ul');
        ul.className = 'overlay-memo-list';
        data.memos.forEach(memo => {
            const li = document.createElement('li');
            li.className = 'overlay-memo-item';
            const memoTitle = document.createElement('h3');
            memoTitle.className = 'memo-title';
            memoTitle.textContent = memo.title || '無題';
            const memoContent = document.createElement('p');
            memoContent.className = 'memo-content';
            memoContent.textContent = memo.content;
            li.appendChild(memoTitle);
            li.appendChild(memoContent);
            ul.appendChild(li);
        });
        container.appendChild(ul);
    } else {
        const noMemos = document.createElement('p');
        noMemos.className = 'overlay-no-data';
        noMemos.textContent = 'メモは見つかりませんでした。';
        container.appendChild(noMemos);
    }
    return container;
}

/**
 * 音声ファイルを再生する
 * @param {string} filename - 再生する音声ファイルのパス
 */
function playSound(filename) {
    const audio = new Audio(filename);
    audio.play().catch(e => console.error("音声再生エラー:", e));
}

/**
 * TTSでテキストを読み上げる (Promiseを返すように変更)
 * @param {string} text - 読み上げるテキスト
 * @returns {Promise<void>} 発話が完了したら解決するPromise
 */
function speakText(text) {
    return new Promise((resolve, reject) => {
        if (speechSynth && speechUtterance) {
            const cleanedText = text.replace(/'/g, ''); 
            speechSynth.cancel(); // 以前の発話を中断
            speechUtterance.text = cleanedText; // 修正後のテキストを設定
            
            speechUtterance.onend = () => {
                resolve();
            };
            speechUtterance.onerror = (event) => {
                console.error('TTSエラー:', event.error);
                reject(event.error);
            };

            speechSynth.speak(speechUtterance);
        } else {
            console.warn("TTS機能が利用できません。");
            resolve();
        }
    });
}

/**
 * アラート音を鳴らす (ウェイクワード検出時)
 */
function playWakeWordSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        // AudioContextがsuspended状態であればresumeする
        if (audioContext.state === 'suspended') {
            audioContext.resume().then(() => {
                console.log('AudioContext resumed successfully');
            }).catch(e => console.error('Failed to resume AudioContext:', e));
        }

        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.type = 'sine'; // サイン波
        oscillator.frequency.value = 440; // 440Hz (A4)
        gainNode.gain.value = 0.1; // 音量

        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.1); // 0.1秒後に停止
    } catch (e) {
        console.warn("アラート音の再生に失敗しました:", e);
    }
}

/**
 * モードを切り替える ('waiting' または 'listening')
 * @param {string} newMode - 新しいモード
 */
function setMode(newMode) {
    if (currentMode === newMode) return;

    console.log(`DEBUG: モード変更: ${currentMode} -> ${newMode}`);
    currentMode = newMode;
    clearTimeout(recognitionTimeoutId);

    const micButton = document.querySelector('.mic-btn');
    const searchBox = document.getElementById('searchbox');

    if (currentMode === 'listening') {
        micButton.classList.add('active');
        searchBox.placeholder = "お話しください...";
        playSound(VOICE_WATE_SOUND_PATH);
        
        recognitionTimeoutId = setTimeout(() => {
            if (currentMode === 'listening') {
                console.log("コマンド入力タイムアウト。待機モードに戻ります。");
                setMode('waiting');
            }
        }, 10000);
    } else { // 'waiting'
        micButton.classList.remove('active');
        const primaryWakeWord = WAKE_WORDS[0] || 'サイレントメイト';
        const secondaryWakeWord = WAKE_WORDS[1] || 'クイックコマンド';
        searchBox.placeholder = `「${primaryWakeWord}」または「${secondaryWakeWord}」と呼びかけてください`;
    }
}

/**
 * コマンドをバックエンドに送信し、応答を処理する
 * @param {string} command - 送信するコマンド
 */
async function sendCommandToBackend(command) {
    if (isBackendProcessing) {
        console.log("DEBUG: バックエンド処理中のため、新しいコマンドを却下します。");
        playSound(ERROR_SOUND_PATH); // エラー音を再生
        return;
    }

    isBackendProcessing = true; // バックエンド処理中フラグを立てる
    const searchBox = document.getElementById('searchbox');
    // searchBox.value = command + ';'; // この行を削除またはコメントアウト

    try {
        const response = await fetch('/web_api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ inputValue: command }),
        });
        const data = await response.json();
        console.log('DEBUG: バックエンドからの応答:', data);

        // 7. 処理終了後のユーザーフィードバック
        if (data.message) {
            speakText(data.message);
        }
        // ここで必要に応じてUIを更新する処理を追加
    } catch (error) {
        console.error('DEBUG: コマンド送信エラー:', error);
        playSound(ERROR_SOUND_PATH); // ★追加: コマンド送信エラー時にもエラー音を再生
        // エラー処理
    } finally {
        isBackendProcessing = false; // バックエンド処理終了
        setMode('waiting'); // 待機モードに戻る
    }
}

// ============================================================================

// イベントハンドラ

// ============================================================================



document.addEventListener('DOMContentLoaded', () => {
        console.log("DEBUG: DOMContentLoaded fired.");
        console.log("DEBUG: URL:", window.location.href);

        const audioPermissionOverlay = document.getElementById('audio-permission-overlay');
        const activateAudioButton = document.getElementById('activate-audio-button');

        console.log("DEBUG: audioPermissionOverlay element:", audioPermissionOverlay ? "Found" : "Not Found");
        console.log("DEBUG: activateAudioButton element:", activateAudioButton ? "Found" : "Not Found");

        // --- Audio Unlock ---
        const unlockAudio = () => {
            if (userInteracted) {
                // 2回目以降のインタラクションでも resume を試みる
                if (window.audioContext && window.audioContext.state === 'suspended') {
                    window.audioContext.resume();
                }
                return;
            }
            userInteracted = true;
            console.log("DEBUG: First user interaction. Initializing audio context.");

            if (!window.audioContext) {
                window.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            const setupSilentAudio = () => {
                const buffer = window.audioContext.createBuffer(1, 1, 22050);
                const source = window.audioContext.createBufferSource();
                source.buffer = buffer;
                source.connect(window.audioContext.destination);
                source.start(0);
                console.log("DEBUG: Silent audio played to unlock/resume context.");
            };

            if (window.audioContext.state === 'suspended') {
                window.audioContext.resume().then(() => {
                    console.log('DEBUG: Global AudioContext resumed successfully.');
                    setupSilentAudio();
                }).catch(e => console.error('DEBUG: Failed to resume Global AudioContext:', e));
            } else {
                setupSilentAudio();
            }

            // グローバルで呼び出せるように関数を登録
            window.playSilentAudio = () => {
                if (!window.audioContext || window.audioContext.state !== 'running') return;
                const source = window.audioContext.createBufferSource();
                source.buffer = window.audioContext.createBuffer(1, 1, 22050);
                source.connect(window.audioContext.destination);
                source.start(0);
            };
        };
        
        const urlParams = new URLSearchParams(window.location.search);
        const isInternalNavParam = urlParams.get('internal_nav')?.toLowerCase() === 'true';

        // ページのナビゲーションタイプを取得 (navigate, reload, back_forward)
        const navigationType = window.performance.getEntriesByType("navigation")[0]?.type;

        console.log("DEBUG: URLSearchParams:", window.location.search);
        console.log("DEBUG: isInternalNavParam:", isInternalNavParam);
        console.log("DEBUG: navigationType:", navigationType);

        let shouldSkipOverlay = false;

        if (isInternalNavParam) {
            // internal_nav=True がある場合
            if (navigationType === "reload") {
                // リロードの場合はオーバーレイをスキップしない (表示する)
                console.log("DEBUG: internal_nav=Trueだがリロードのためオーバーレイを表示します。");
                shouldSkipOverlay = false;
            } else {
                // リロード以外 (例: 別の内部ページからのnavigate) の場合はオーバーレイをスキップする
                console.log("DEBUG: internal_nav=Trueかつリロードではないためオーバーレイをスキップします。");
                shouldSkipOverlay = true;
            }
        } else if (navigationType === "back_forward") {
            // internal_navパラメータがないが、戻る/進むでナビゲートされた場合はオーバーレイをスキップする
            console.log("DEBUG: back_forwardナビゲーションのためオーバーレイをスキップします。");
            shouldSkipOverlay = true;
        } else {
            // 上記以外 (初回 navigate, リロード (internal_navなし)) はオーバーレイを表示
            console.log("DEBUG: 初回アクセスまたはリロードのためオーバーレイを表示します。");
            shouldSkipOverlay = false;
        }

        let pendingRecognitionStart = false;

        if (shouldSkipOverlay) {
            console.log("DEBUG: shouldSkipOverlayがtrueのため、オーバーレイを非表示にし、音声認識を開始します。");
            if (audioPermissionOverlay) audioPermissionOverlay.classList.add('hidden');
            else console.error("DEBUG: audioPermissionOverlayが見つかりません。オーバーレイを隠せませんでした。");
            unlockAudio();
            pendingRecognitionStart = true;
            console.log("DEBUG: 音声認識の自動開始を予約しました。");
        } else if (activateAudioButton) { // オーバーレイをスキップしない場合は、アクティベーションボタンの有無で処理を分岐
            console.log("DEBUG: shouldSkipOverlayがfalseまたはactivateAudioButtonが存在するため、アクティベーションボタンイベントリスナーを設定します。");
            activateAudioButton.addEventListener('click', () => {
                console.log("DEBUG: アクティベーションボタンがクリックされました。");
                if (audioPermissionOverlay) audioPermissionOverlay.classList.add('hidden'); // オーバーレイを非表示にする
                else console.error("DEBUG: audioPermissionOverlayが見つかりません。オーバーレイを隠せませんでした。");
                unlockAudio(); // オーディオコンテキストを再開
                if (recognition) {
                    initializeVoiceRecognition(); // 音声認識の初期化を開始
                    console.log("DEBUG: initializeVoiceRecognition called via button click.");
                } else {
                    pendingRecognitionStart = true;
                    console.log("DEBUG: recognition未初期化のため、音声認識開始を予約しました。");
                }
            });
        } else { // ボタンがない場合や、その他の状況で音声認識を自動開始しない
            console.log("DEBUG: オーバーレイが表示中のため、音声認識の自動開始をスキップしました。ユーザーのアクションを待ちます。");
            // オーバーレイが表示されたままになるか、自動開始しない場合はここを調整
            // 例えば、オーバーレイが表示されていれば、ユーザーが手動でクリックするのを待つ
        }

        const micButton = document.querySelector('.mic-btn');

        const searchBox = document.getElementById('searchbox');

        const voiceLogContainer = document.getElementById('voice-log-container');

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {

        console.error("Web Speech API はこのブラウザでサポートされていません。");

        micButton.disabled = true;

        searchBox.placeholder = "音声認識非対応";

        return;

    }

    recognition = new SpeechRecognition();

    recognition.lang = 'ja-JP';

    recognition.continuous = true;

    recognition.interimResults = true;

    let lastTranscript = ''; // diff-based logging用
    let displayOffset = 0; // ウェイクワード以降を表示するための開始位置

    // ------------------------------------------------------------------------

    // 音声認識イベント

    // ------------------------------------------------------------------------



    recognition.onstart = () => {
        isRecognitionActive = true;
    };

    recognition.onresult = (event) => {
        const nowAtResult = Date.now();
        if (nowAtResult < endWordInputBlockedUntil) {
            console.log("DEBUG: エンドワード確定後の入力ブロック中のため、認識結果を破棄しました。");
            return;
        }

        const last = event.results.length - 1;
        let transcript = event.results[last][0].transcript; // Make transcript mutable
        let isFinal = event.results[last].isFinal; // Make isFinal mutable

        let tempLogEntry = document.getElementById('interim-log');

        const wakeWordDetectedInTranscript = WAKE_WORDS.some(word => transcript.toLowerCase().includes(word.toLowerCase()));

        // --- エンドワード検出ロジック ---
        let endWordDetected = false;
        let originalFinalCommand = '';
        let detectedEndWord = '';
        const canDetectEndWord = currentMode === 'listening' || (currentMode === 'waiting' && wakeWordDetectedInTranscript);
        const endWordMatch = canDetectEndWord ? findEndWordMatch(transcript) : null;
        if (endWordMatch) {
            const now = Date.now();
            const detectedKey = String(endWordMatch.word || '').trim().toLowerCase();
            if (
                detectedKey &&
                detectedKey === lastDetectedEndWordKey &&
                (now - lastDetectedEndWordAt) < ENDWORD_DETECTION_SUPPRESS_MS
            ) {
                console.log(`DEBUG: エンドワード重複検知を抑止しました: "${endWordMatch.word}"`);
                return;
            }
            lastDetectedEndWordKey = detectedKey;
            lastDetectedEndWordAt = now;

            detectedEndWord = endWordMatch.word;
            console.log(`DEBUG: エンドワード "${detectedEndWord}" を検出しました。`);
            // エンドワードを含めて確定し、それ以降のみ切り捨てる
            originalFinalCommand = transcript.substring(0, endWordMatch.endIndex).trim();
            endWordDetected = true;
            isFinal = true; // 強制的に最終結果とする
            // 以降の処理のためにtranscriptを切り詰める
            transcript = originalFinalCommand;
        }

        // --- ログ表示の制御ロジック ---
        let shouldProcessDisplay = false;
        if (shouldDisplayAllSpeech) {
            shouldProcessDisplay = true; // 設定がtrueなら常に表示
        } else {
            // ウェイクワードが検出された場合、またはlisteningモードの場合のみ表示
            if (wakeWordDetectedInTranscript || currentMode === 'listening') {
                shouldProcessDisplay = true;
            }
        }

        if (!shouldProcessDisplay) {
            if (tempLogEntry) {
                tempLogEntry.remove(); // 表示対象外なら中間ログを削除
            }
            lastTranscript = ''; // リセット
            displayOffset = 0; // リセット
            return; // 処理を終了
        }

        if (!tempLogEntry) {
            tempLogEntry = document.createElement('div');
            tempLogEntry.id = 'interim-log';
            tempLogEntry.className = 'voice-log-entry log-interim';
            voiceLogContainer.appendChild(tempLogEntry);
            lastTranscript = ''; // 新しい行の開始、履歴をリセット
            displayOffset = 0;
        }

        let displayTranscript = transcript;
        const findWakeWordIndex = (text) => {
            let earliestIndex = -1;
            WAKE_WORDS.forEach(word => {
                const idx = text.toLowerCase().indexOf(word.toLowerCase());
                if (idx !== -1 && (earliestIndex === -1 || idx < earliestIndex)) {
                    earliestIndex = idx;
                }
            });
            return earliestIndex;
        };

        const setEntryContent = (entry, text) => {
            entry.innerHTML = '';
            if (!text) return;
            const span = document.createElement('span');
            span.innerHTML = highlightEndWords(highlightWakeWords(text));
            entry.appendChild(span);
            if (endWordDetected && detectedEndWord) {
                const badge = document.createElement('span');
                badge.className = 'highlight-end-word-badge';
                badge.textContent = ` [エンドワード確定: ${detectedEndWord}]`;
                entry.appendChild(badge);
            }
        };

        const wakeIndexInTranscript = findWakeWordIndex(transcript);

        if (!shouldDisplayAllSpeech) { // 全ての音声をデフォルトで表示しない場合
            if (currentMode === 'waiting') {
                const wakeIndex = wakeIndexInTranscript;
                if (wakeIndex !== -1) {
                    // ウェイクワードが検出された場合のみ、その時点から表示
                    // 以前の中間ログがあればクリア
                    if (tempLogEntry && tempLogEntry.id === 'interim-log' && lastTranscript.length > 0) {
                        tempLogEntry.innerHTML = '';
                    }
                    displayOffset = wakeIndex;
                    displayTranscript = transcript.slice(displayOffset);
                    lastTranscript = ''; // 新しいセグメントのためにリセット
                } else {
                    // ウェイクワードが検出されず、waitingモードの場合は表示しない（shouldProcessDisplayで処理済みだが念のため）
                    if (tempLogEntry) {
                        tempLogEntry.remove();
                    }
                    lastTranscript = '';
                    displayOffset = 0;
                    return;
                }
            } else if (currentMode === 'listening') {
                // listeningモードでは、ウェイクワード検出位置（もしあれば）から全て表示
                if (wakeIndexInTranscript !== -1) {
                    displayOffset = wakeIndexInTranscript;
                } else if (displayOffset === 0 && lastTranscript === '') {
                    // ウェイクワードなしでlisteningモードが開始された場合（例：手動切り替え）は、最初から表示
                    displayOffset = 0;
                }
                displayTranscript = transcript.slice(displayOffset);
            }
        } else { // shouldDisplayAllSpeechがtrueの場合、全て表示
            displayOffset = 0;
            displayTranscript = transcript;
        }

        // 差分を計算して追加
        if (displayTranscript.length > lastTranscript.length) {
            const diff = displayTranscript.substring(lastTranscript.length);
            const diffSpan = document.createElement('span');
            diffSpan.textContent = diff;
            
            // 差分内のウェイクワードをハイライト
            WAKE_WORDS.forEach(word => {
                if (diff.toLowerCase().includes(word.toLowerCase())) {
                     diffSpan.innerHTML = highlightEndWords(highlightWakeWords(diff));
                }
            });
            END_WORDS.forEach(word => {
                if (diff.toLowerCase().includes(word.toLowerCase())) {
                    diffSpan.innerHTML = highlightEndWords(highlightWakeWords(diff));
                }
            });

            tempLogEntry.appendChild(diffSpan);
            lastTranscript = displayTranscript;
        }
        
        voiceLogContainer.scrollTop = voiceLogContainer.scrollHeight;

        let finalCommand = '';

        if (isFinal) {
            finalCommand = originalFinalCommand || (shouldDisplayAllSpeech ? transcript.trim() : (displayOffset > 0 ? transcript.slice(displayOffset).trim() : transcript.trim()));
            let displayCommand = finalCommand;
            if (endWordDetected && detectedEndWord) {
                // エンドワード確定時は、音声認識の揺れではなく検出した語を優先して送信する。
                finalCommand = detectedEndWord.trim();
                // 表示はユーザー発話に寄せ、ウェイクワードを含んだ確定文を維持する。
                displayCommand = ensureWakeWordInDisplay(originalFinalCommand || transcript.trim(), transcript);
            }

            if (displayCommand && (currentMode === 'listening' || endWordDetected)) {
                setEntryContent(tempLogEntry, displayCommand);
            }

            tempLogEntry.classList.remove('log-interim');
            tempLogEntry.removeAttribute('id');
            lastTranscript = ''; // 次の発話のためにリセット
            displayOffset = 0; // 次の発話のためにリセット
            
            // エンドワードが検出された場合、ここで認識を停止する
            if (endWordDetected) {
                console.log("DEBUG: エンドワード検出により音声認識を停止します。");
                recognition.stop();
                setMode('waiting'); // 待機モードに戻す
                endWordInputBlockedUntil = Date.now() + ENDWORD_INPUT_BLOCK_MS;
                clearPendingFinalDispatch();
                if (shouldSuppressDuplicateVoiceCommand(finalCommand)) {
                    console.log('DEBUG: 重複音声コマンドを抑制');
                    return;
                }
                processInput(finalCommand, 'voice', { forceDispatch: true }); // エンドワード確定時は強制送信
                return; // 以降の処理をスキップ
            }
        }
        
        // --- モードとコマンドロジック ---
        if (currentMode === 'waiting' && WAKE_WORDS.some(word => transcript.toLowerCase().includes(word.toLowerCase()))) {
            console.log("DEBUG: ウェイクワードを検出");
            playWakeWordSound();
            setMode('listening');
        } 
        
        if (currentMode === 'listening' && isFinal && finalCommand) {
            queuePendingFinalDispatch(finalCommand);
        }
    };



    



    recognition.onend = () => {



        isRecognitionActive = false;
        console.log("DEBUG: recognition.onend fired.");



        const tempLogEntry = document.getElementById('interim-log');



        if (tempLogEntry) {



            tempLogEntry.classList.remove('log-interim');



            tempLogEntry.removeAttribute('id');



        }



        lastTranscript = ''; // Reset on session end
        displayOffset = 0;







        setTimeout(() => {
            try {
                if (recognition?.dontRestart) return; // for debugging
                if (isMobileDevice) {
                    const now = Date.now();
                    if (document.visibilityState !== 'visible') return;
                    if (now - lastRestartAt < MOBILE_RESTART_COOLDOWN_MS) return;
                    lastRestartAt = now;
                }
                recognition.start();
            } catch(e) {}
        }, 1000);



    };



    



    recognition.onerror = (event) => {



        isRecognitionActive = false;
        console.error('DEBUG: 音声認識エラー:', event.error);



        if (event.error === 'no-speech' && currentMode === 'listening') {



            setMode('waiting');



        }



        lastTranscript = ''; // Reset on error
        displayOffset = 0;



    };







    /**



     * テキスト内のウェイクワードをハイライトするHTMLを生成する



     */



    function highlightWakeWords(text) {



        let highlightedText = text;



        WAKE_WORDS.forEach(word => {



            const regex = new RegExp(escapeRegExp(word), 'gi');



            highlightedText = highlightedText.replace(regex, `<span class="highlight-wake-word">${word}</span>`);



        });



        return highlightedText;



    }







    /**
     * テキスト内のエンドワードをハイライトするHTMLを生成する
     */
    function highlightEndWords(text) {
        let highlightedText = text;

        END_WORDS.forEach(word => {
            const regex = new RegExp(escapeRegExp(word), 'gi');
            highlightedText = highlightedText.replace(regex, `<span class="highlight-end-word">${word}</span>`);
        });

        return highlightedText;
    }

    /**
     * テキスト入力をログパネルに追加する
     */



    function addTextLogEntry(text) {



        const textLogEntry = document.createElement('div');



        textLogEntry.className = 'voice-log-entry';



        const prefixSpan = document.createElement('span');



        prefixSpan.textContent = 'テキスト>> ';



        prefixSpan.style.color = '#64748b';



        prefixSpan.style.marginRight = '8px';



        const contentSpan = document.createElement('span');



        contentSpan.textContent = text;



        textLogEntry.appendChild(prefixSpan);



        textLogEntry.appendChild(contentSpan);



        voiceLogContainer.appendChild(textLogEntry);



        voiceLogContainer.scrollTop = voiceLogContainer.scrollHeight;



    }



    window.addTextLogEntry = addTextLogEntry;







    /**



     * AIからの応答をログパネルに追加する



     */



    function addResponseLogEntry(text) {



        const responseLogEntry = document.createElement('div');



        responseLogEntry.className = 'voice-log-entry response-log';



        const prefixSpan = document.createElement('span');



        prefixSpan.textContent = '🤖 AI>> ';



        prefixSpan.style.color = '#1d4ed8';



        prefixSpan.style.fontWeight = 'bold';



        prefixSpan.style.marginRight = '8px';



        const contentSpan = document.createElement('span');



        contentSpan.textContent = text;



        responseLogEntry.appendChild(prefixSpan);



        responseLogEntry.appendChild(contentSpan);



        voiceLogContainer.appendChild(responseLogEntry);



        voiceLogContainer.scrollTop = voiceLogContainer.scrollHeight;



    }



    window.addResponseLogEntry = addResponseLogEntry;







    // ------------------------------------------------------------------------



    // UIイベント



    // ------------------------------------------------------------------------



    micButton.addEventListener('click', () => {



        unlockAudio();



        if (currentMode === 'listening') {



            setMode('waiting');



        } else {



            setMode('listening');



        }



    });







    // ------------------------------------------------------------------------



    // 入力処理のメインロジック



    // ------------------------------------------------------------------------



    function processInput(input, inputType, options = {}) {
        const trimmedInput = input.trim();
        const forceDispatch = options?.forceDispatch === true;

        // ウェイクワードのみ、またはそれに非常に近い入力かを判定
        const isWakeWordOnly = WAKE_WORDS.some(word => trimmedInput === word);
        const isEndWordOnly = END_WORDS.some(word => trimmedInput === word);

        if ((!forceDispatch && (isWakeWordOnly || isEndWordOnly)) || !trimmedInput) {
            console.log("DEBUG: 空入力/ウェイクワードのみ/エンドワードのみの入力を検知。音声再生を停止します。");
            if (window.stopAllAudio) {
                window.stopAllAudio();
            }
            if (inputType === 'voice') {
                setMode('waiting');
            }
            return;
        }

        if (window.check_chat_Space) {
            window.check_chat_Space(input);
        } else {
            console.error("check_chat_Space is not available on window.");
        }

        if (inputType === 'voice') {
            setMode('waiting');
        }
    }







    // ------------------------------------------------------------------------







    // 初期起動関数







    // ------------------------------------------------------------------------







    function initializeVoiceRecognition() {
        if (!recognition) {
            console.warn("DEBUG: recognitionが未初期化のため開始をスキップしました。");
            return;
        }
        if (isRecognitionActive) {
            return;
        }
        setMode('waiting');
        try {
            recognition.start();
        } catch(e) {
            console.error("初期認識開始に失敗", e);







        }







    }







    







    // オーバーレイが表示されている場合、DOMContentLoadedでは音声認識を開始しない







        // オーバーレイがない場合は通常通り開始







        if (pendingRecognitionStart || !audioPermissionOverlay || audioPermissionOverlay.classList.contains('hidden')) {







            initializeVoiceRecognition();







        } else {







            console.log("DEBUG: 音声許可オーバーレイが表示中のため、音声認識の自動開始をスキップしました。");







        }







    







        // --- オーバーレイの閉じるボタンの処理 ---







        const readAloudOverlay = document.getElementById('read-aloud-overlay');







    







        const audioCloseBtn = audioPermissionOverlay ? audioPermissionOverlay.querySelector('.close-overlay-btn') : null;







                const readAloudCloseBtn = readAloudOverlay ? readAloudOverlay.querySelector('.close-overlay-btn') : null;







                const imageDisplayOverlay = document.getElementById('image-display-overlay');







                const imageDisplayCloseBtn = imageDisplayOverlay ? imageDisplayOverlay.querySelector('.close-overlay-btn') : null;







            







                if (audioCloseBtn && audioPermissionOverlay) {







                    audioCloseBtn.addEventListener('click', () => {







                        audioPermissionOverlay.classList.add('hidden');







                    });







                }







            







                if (readAloudCloseBtn && readAloudOverlay) {







                    readAloudCloseBtn.addEventListener('click', () => {







                        readAloudOverlay.classList.remove('visible');







                        if (window.stopAllAudio) {







                            window.stopAllAudio();







                        }







                    });







                }







        







                if (imageDisplayCloseBtn && imageDisplayOverlay) {







                    imageDisplayCloseBtn.addEventListener('click', () => {







                        imageDisplayOverlay.classList.remove('visible');







                        if (window.stopAllAudio) {







                            window.stopAllAudio();







                        }







                    });







                }







        







        });

