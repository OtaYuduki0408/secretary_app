// ============================================================================
// グローバル変数と定数
// ============================================================================
const WAKE_WORDS = ['ボイスメイト', 'ぼいすめいと', 'voicemate', '高速実行', 'クイックコマンド'];
const VOICE_WATE_SOUND_PATH = '/static/voice/voice_wate.mp3';
const RELODE_SOUND_PATH = '/static/voice/relode.mp3';
const ERROR_SOUND_PATH = '/static/voice/error.mp3';
const INPUT_COOLTIME_MS = 500; // 0.5秒の入力クールタイム

let recognition; // SpeechRecognitionインスタンス
let currentMode = 'waiting'; // 'waiting' or 'listening'
let recognitionTimeoutId; // 音声入力タイムアウトのID

// TTS (Text-to-Speech) 設定
const speechSynth = window.speechSynthesis;
const speechUtterance = new SpeechSynthesisUtterance();
speechUtterance.lang = 'ja-JP';
speechUtterance.volume = 1;
speechUtterance.rate = 1;
speechUtterance.pitch = 1;

let userInteracted = false; // ユーザーがページとインタラクトしたかどうかのフラグ

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
        searchBox.placeholder = "「ボイスメイト」または「クイックコマンド」と呼びかけてください";
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







    // --- Audio Unlock ---



    const unlockAudio = () => {



        if (userInteracted) return;



        userInteracted = true;



        const audioContext = new (window.AudioContext || window.webkitAudioContext)();



        if (audioContext.state === 'suspended') {



            audioContext.resume().then(() => console.log('AudioContext resumed successfully.'));



        }



        document.body.removeEventListener('click', unlockAudio);



        document.body.removeEventListener('keydown', unlockAudio);



    };



    document.body.addEventListener('click', unlockAudio, { once: true });



    document.body.addEventListener('keydown', unlockAudio, { once: true });







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



        const transcript = event.results[last][0].transcript;



        const isFinal = event.results[last].isFinal;







        let tempLogEntry = document.getElementById('interim-log');







        // --- Diff-based Logging Logic ---



        if (!tempLogEntry) {



            tempLogEntry = document.createElement('div');



            tempLogEntry.id = 'interim-log';



            tempLogEntry.className = 'voice-log-entry log-interim';



            voiceLogContainer.appendChild(tempLogEntry);



            lastTranscript = ''; // Start new line, reset history

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

        if (currentMode === 'waiting') {
            const wakeIndex = wakeIndexInTranscript;
            if (wakeIndex !== -1) {
                const beforeWake = transcript.slice(0, wakeIndex).trim();
                if (tempLogEntry) {
                    if (beforeWake) {
                        setEntryContent(tempLogEntry, beforeWake);
                        tempLogEntry.classList.remove('log-interim');
                        tempLogEntry.removeAttribute('id');
                    } else {
                        tempLogEntry.remove();
                    }
                }

                tempLogEntry = document.createElement('div');
                tempLogEntry.id = 'interim-log';
                tempLogEntry.className = 'voice-log-entry log-interim';
                voiceLogContainer.appendChild(tempLogEntry);

                displayOffset = wakeIndex;
                displayTranscript = transcript.slice(displayOffset);
                lastTranscript = '';
            }
        }

        if (currentMode === 'listening') {
            if (wakeIndexInTranscript !== -1) {
                displayOffset = wakeIndexInTranscript;
            } else {
                displayOffset = 0;
            }
        }

        if (displayOffset > 0 && transcript.length >= displayOffset) {
            displayTranscript = transcript.slice(displayOffset);
        }

        // Calculate diff and append



        if (displayTranscript.length > lastTranscript.length) {



            const diff = displayTranscript.substring(lastTranscript.length);



            const diffSpan = document.createElement('span');



            diffSpan.textContent = diff;



            



            // Highlight wake words within the diff



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
            finalCommand = displayOffset > 0
                ? transcript.slice(displayOffset).trim()
                : transcript.trim();

            if (currentMode === 'listening' && finalCommand) {
                setEntryContent(tempLogEntry, finalCommand);
            }



            tempLogEntry.classList.remove('log-interim');



            tempLogEntry.removeAttribute('id');



            lastTranscript = ''; // Reset for the next utterance
            displayOffset = 0;



        }



        



        // --- Mode and Command Logic ---



        if (currentMode === 'waiting' && WAKE_WORDS.some(word => transcript.toLowerCase().includes(word.toLowerCase()))) {



            console.log("DEBUG: ウェイクワードを検出");



            playWakeWordSound();



            addTextLogEntry('音声認識ボタン');
            addTextLogEntry('音声認識ボタン');
            setMode('listening');



        } 



        



        if (currentMode === 'listening' && isFinal && finalCommand) {



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



                if(recognition?.dontRestart) return; // for debugging



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



    // 初期起動



    // ------------------------------------------------------------------------



    setMode('waiting');



    try {



        recognition.start();



    } catch(e) {



        console.error("初期認識開始に失敗", e);



    }



});
