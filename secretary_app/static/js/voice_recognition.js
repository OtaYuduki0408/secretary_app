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
let END_WORD = '命令完了'; // 音声入力の強制終了ワード

// モバイル環境のみの制御
const isMobileDevice = (() => {
    const ua = navigator.userAgent || '';
    return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || 'ontouchstart' in window;
})();
let lastFinalCommand = '';
let lastFinalCommandAt = 0;
let lastRestartAt = 0;
const MOBILE_DUPLICATE_SUPPRESS_MS = 2500;
const MOBILE_RESTART_COOLDOWN_MS = 3000;

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
        END_WORD = settings?.main?.endWord || '命令完了'; // エンドワードを読み込む

    } catch (e) {
        console.warn('アプリ設定の読み込みに失敗しました。', e);
        shouldDisplayAllSpeech = false; // エラー時はデフォルトOff
        END_WORD = '命令完了'; // エラー時はデフォルト値を設定
    }
}

loadAppSettings();
document.addEventListener('app-settings:updated', loadAppSettings);

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
            console.log("DEBUG: unlockAudio called. userInteracted:", userInteracted);

            if (userInteracted) return;

            userInteracted = true;

            // グローバルなAudioContextを初期化
            if (!window.audioContext) {
                window.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            // AudioContextがsuspended状態であればresumeする
            if (window.audioContext.state === 'suspended') {
                window.audioContext.resume().then(() => {
                    console.log('DEBUG: Global AudioContext resumed successfully.');
                }).catch(e => console.error('DEBUG: Failed to resume Global AudioContext:', e));
            }
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

        if (shouldSkipOverlay) {
            console.log("DEBUG: shouldSkipOverlayがtrueのため、オーバーレイを非表示にし、音声認識を開始します。");
            if (audioPermissionOverlay) audioPermissionOverlay.classList.add('hidden');
            else console.error("DEBUG: audioPermissionOverlayが見つかりません。オーバーレイを隠せませんでした。");
            unlockAudio();
            initializeVoiceRecognition();
            console.log("DEBUG: initializeVoiceRecognition called via shouldSkipOverlay.");
        } else if (activateAudioButton) { // オーバーレイをスキップしない場合は、アクティベーションボタンの有無で処理を分岐
            console.log("DEBUG: shouldSkipOverlayがfalseまたはactivateAudioButtonが存在するため、アクティベーションボタンイベントリスナーを設定します。");
            activateAudioButton.addEventListener('click', () => {
                console.log("DEBUG: アクティベーションボタンがクリックされました。");
                if (audioPermissionOverlay) audioPermissionOverlay.classList.add('hidden'); // オーバーレイを非表示にする
                else console.error("DEBUG: audioPermissionOverlayが見つかりません。オーバーレイを隠せませんでした。");
                unlockAudio(); // オーディオコンテキストを再開
                initializeVoiceRecognition(); // 音声認識の初期化を開始
                console.log("DEBUG: initializeVoiceRecognition called via button click.");
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



    recognition.onresult = (event) => {
        const last = event.results.length - 1;
        let transcript = event.results[last][0].transcript; // Make transcript mutable
        let isFinal = event.results[last].isFinal; // Make isFinal mutable

        let tempLogEntry = document.getElementById('interim-log');

        // --- エンドワード検出ロジック ---
        let endWordDetected = false;
        let originalFinalCommand = '';
        if (currentMode === 'listening' && END_WORD && transcript.includes(END_WORD)) {
            console.log(`DEBUG: エンドワード "${END_WORD}" を検出しました。`);
            const endWordIndex = transcript.indexOf(END_WORD);
            originalFinalCommand = transcript.substring(0, endWordIndex).trim(); // エンドワード以前をコマンドとする
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
            const wakeWordDetectedInTranscript = WAKE_WORDS.some(word => transcript.toLowerCase().includes(word.toLowerCase()));
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
            span.innerHTML = highlightWakeWords(text);
            entry.appendChild(span);
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
                     diffSpan.innerHTML = highlightWakeWords(diff);
                }
            });

            tempLogEntry.appendChild(diffSpan);
            lastTranscript = displayTranscript;
        }
        
        voiceLogContainer.scrollTop = voiceLogContainer.scrollHeight;

        let finalCommand = '';

        if (isFinal) {
            finalCommand = originalFinalCommand || (shouldDisplayAllSpeech ? transcript.trim() : (displayOffset > 0 ? transcript.slice(displayOffset).trim() : transcript.trim()));

            if (currentMode === 'listening' && finalCommand) {
                setEntryContent(tempLogEntry, finalCommand);
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
                processInput(finalCommand, 'voice'); // 強制的にコマンドを処理
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
            const now = Date.now();
            if (isMobileDevice) {
                const normalized = finalCommand.trim();
                const isDuplicate = normalized === lastFinalCommand && (now - lastFinalCommandAt) < MOBILE_DUPLICATE_SUPPRESS_MS;
                if (isDuplicate) {
                    console.log('DEBUG: モバイルの重複認識を抑制');
                    return;
                }
                lastFinalCommand = normalized;
                lastFinalCommandAt = now;
            }

            console.log(`DEBUG: 音声入力確定: "${transcript.trim()}"`);
            processInput(finalCommand, 'voice');
        }
    };



    



    recognition.onend = () => {



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



            const regex = new RegExp(word, 'gi');



            highlightedText = highlightedText.replace(regex, `<span class="highlight-wake-word">${word}</span>`);



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



    function processInput(input, inputType) {



        if (!input.trim()) {



            console.log("DEBUG: 空の入力のため却下。");



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







        setMode('waiting');







        try {







            recognition.start();







        } catch(e) {







            console.error("初期認識開始に失敗", e);







        }







    }







    







    // オーバーレイが表示されている場合、DOMContentLoadedでは音声認識を開始しない







    // オーバーレイがない場合は通常通り開始







    if (!audioPermissionOverlay || audioPermissionOverlay.classList.contains('hidden')) {







        initializeVoiceRecognition();







    } else {







        console.log("DEBUG: 音声許可オーバーレイが表示中のため、音声認識の自動開始をスキップしました。");







    }







    







    });
