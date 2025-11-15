// ============================================================================
// グローバル変数と定数
// ============================================================================
const WAKE_WORDS = ['ボイスメイト', 'ぼいすめいと', 'voicemate', 'シーシー', 'クイックコマンド'];
const VOICE_WATE_SOUND_PATH = '/static/voice/voice_wate.mp3';
const RELODE_SOUND_PATH = '/static/voice/relode.mp3';
const ERROR_SOUND_PATH = '/static/voice/error.mp3';
const INPUT_COOLTIME_MS = 1000; // 1秒の入力クールタイム

let recognition; // SpeechRecognitionインスタンス
let currentMode = 'waiting'; // 'waiting' or 'listening'
let recognitionTimeoutId; // 音声入力タイムアウトのID

let commandQueue = null; // 完全確定前のコマンドを一時的に保持
let inputCooltimeTimerId = null; // 入力クールタイムのタイマーID
let isBackendProcessing = false; // バックエンド処理中フラグ

// TTS (Text-to-Speech) 設定
const speechSynth = window.speechSynthesis;
const speechUtterance = new SpeechSynthesisUtterance();
speechUtterance.lang = 'ja-JP';
speechUtterance.volume = 1;
speechUtterance.rate = 1;
speechUtterance.pitch = 1;

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 音声ファイルを再生する
 * @param {string} filename - 再生する音声ファイルのパス
 */
function playSound(filename) {
    const audio = new Audio(filename);
    audio.play().catch(e => console.error("音声再生エラー:", e));
}

/**
 * TTSでテキストを読み上げる
 * @param {string} text - 読み上げるテキスト
 */
function speakText(text) {
    if (speechSynth && speechUtterance) {
        speechSynth.cancel(); // 以前の発話を中断
        speechUtterance.text = text;
        speechSynth.speak(speechUtterance);
    } else {
        console.warn("TTS機能が利用できません。");
    }
}

/**
 * アラート音を鳴らす (ウェイクワード検出時)
 */
function playWakeWordSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
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
    if (currentMode === newMode) return; // 同じモードなら何もしない

    console.log(`DEBUG: モード変更: ${currentMode} -> ${newMode}`);
    currentMode = newMode;
    clearTimeout(recognitionTimeoutId); // 既存のタイムアウトをクリア

    const micButton = document.querySelector('.mic-btn');
    const searchBox = document.getElementById('searchbox');

    if (currentMode === 'listening') {
        micButton.classList.add('active');
        searchBox.placeholder = "お話しください...";
        searchBox.value = ''; // 入力欄をクリア
        playSound(VOICE_WATE_SOUND_PATH); // 音声入力開始時のサウンド
        
        // 10秒後に自動でwaitingモードに戻るタイムアウトを設定
        recognitionTimeoutId = setTimeout(() => {
            if (currentMode === 'listening') {
                console.log("コマンド入力タイムアウト。待機モードに戻ります。");
                setMode('waiting');
            }
        }, 10000);
    } else { // 'waiting'
        micButton.classList.remove('active');
        searchBox.placeholder = "「ボイスメイト」または「シーシー」と呼びかけてください";
        searchBox.value = '';
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
    searchBox.value = command + ';'; // searchBoxに最終的なコマンドを表示

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

    const micButton = document.querySelector('.mic-btn');
    const searchBox = document.getElementById('searchbox');
    const searchForm = document.getElementById('search-form'); // main.htmlでidをsearch-formに変更

    // Web Speech APIのサポートチェック
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        console.error("Web Speech API はこのブラウザでサポートされていません。");
        micButton.disabled = true;
        searchBox.placeholder = "音声認識非対応";
        return;
    }

    // SpeechRecognitionの初期化
    recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.continuous = true; // 継続的な認識
    recognition.interimResults = true; // 暫定結果を返す

    // ------------------------------------------------------------------------
    // 音声認識イベント
    // ------------------------------------------------------------------------
    recognition.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript;
            } else {
                interimTranscript += transcript;
            }
        }
        // searchBoxに暫定結果を表示
        searchBox.value = finalTranscript + interimTranscript;

        // 1. ユーザーによる入力 (音声) - ウェイクワード検出
        if (currentMode === 'waiting') {
            const lowerTranscript = (finalTranscript + interimTranscript).toLowerCase();
            if (WAKE_WORDS.some(word => lowerTranscript.includes(word))) {
                console.log("DEBUG: ウェイクワードを検出");
                playWakeWordSound(); // アラート音を鳴らす
                setMode('listening'); // listeningモードに切り替え
                // ウェイクワード検出時は、searchBoxはクリアされるので、ここでfinalTranscriptを処理しない
                return; 
            }
        } 
        
        // 1. ユーザーによる入力 (音声) - 入力確定
        if (currentMode === 'listening' && finalTranscript.trim()) {
            console.log(`DEBUG: 音声入力確定: "${finalTranscript.trim()}"`);
            processInput(finalTranscript.trim(), 'voice');
        }
    };

    recognition.onend = () => {
        console.log("DEBUG: recognition.onend fired.");
        console.log("認識セッション終了。1秒後に再開します。");
        setTimeout(() => {
            if (!recognition.recognizing) {
                try {
                    recognition.start();
                } catch(e) {
                    console.error("認識の再開に失敗:", e);
                }
            }
        }, 1000);
    };
    
    recognition.onerror = (event) => {
        console.error('DEBUG: 音声認識エラー:', event.error);
        // 'no-speech'エラーは無視することが多いが、必要に応じて処理
        if (event.error === 'no-speech') {
            // 音声が検出されなかった場合、listeningモードからwaitingモードに戻す
            if (currentMode === 'listening') {
                setMode('waiting');
            }
            return;
        }
    };

    // ------------------------------------------------------------------------
    // UIイベント
    // ------------------------------------------------------------------------

    // 音声入力ボタンクリック
    micButton.addEventListener('click', () => {
        console.log("DEBUG: micButton clicked.");
        if (currentMode === 'listening') {
            setMode('waiting');
        } else {
            setMode('listening');
        }
    });

    // テキストフォーム送信 (Enterキー)
    searchForm.addEventListener('submit', (event) => {
        event.preventDefault(); // フォームのデフォルト送信を防止
        const inputText = searchBox.value.trim();
        if (inputText) {
            console.log(`DEBUG: テキスト入力確定: "${inputText}"`);
            processInput(inputText, 'text');
        }
        searchBox.value = ''; // 送信後、入力欄をクリア
    });

    // ------------------------------------------------------------------------
    // 入力処理のメインロジック
    // ------------------------------------------------------------------------

    /**
     * ユーザーからの入力を処理する
     * @param {string} input - ユーザーの入力テキスト
     * @param {'voice'|'text'} inputType - 入力の種類 ('voice' または 'text')
     */
    function processInput(input, inputType) {
        // 2. 入力却下 - ウェイクワードのみの場合
        const lowerInput = input.toLowerCase();
        if (WAKE_WORDS.includes(lowerInput)) {
            console.log("DEBUG: ウェイクワードのみの入力のため却下。");
            if (inputType === 'voice') {
                // 音声入力の場合、即座に待機モードに戻る
                // voice_wate.mp3の再生が完了するまで待ってからwaitingモードに戻る
                setTimeout(() => {
                    setMode('waiting');
                }, 500); // voice_wate.mp3の再生時間に合わせて調整
            } else {
                // テキスト入力の場合、単に待機モードに戻る
                setMode('waiting');
            }
            return;
        }

        // 6. バックエンド中の新規入力
        if (isBackendProcessing) {
            console.log("DEBUG: バックエンド処理中のため、新しい入力を却下します。");
            playSound(ERROR_SOUND_PATH); // エラー音を再生
            setMode('waiting'); // 待機モードに戻る
            return;
        }

        // 3. 入力クールタイム (音声入力のみに適用)
        if (inputType === 'voice') {
            // クールタイム中の新しい音声入力があった場合、前のクールタイムをクリア
            if (inputCooltimeTimerId) {
                clearTimeout(inputCooltimeTimerId);
                console.log("DEBUG: 既存の入力クールタイムをクリアしました。");
            }

            commandQueue = input; // コマンドをキューに格納
            console.log(`DEBUG: コマンドをキューに格納 (クールタイム開始): "${commandQueue}"`);

            inputCooltimeTimerId = setTimeout(() => {
                // クールタイム終了後、完全確定したコマンドを処理
                if (commandQueue) {
                    console.log(`DEBUG: クールタイム終了。コマンドを完全確定: "${commandQueue}"`);
                    handleFinalCommand(commandQueue);
                    commandQueue = null; // 処理後キューをクリア
                } else {
                    console.log("DEBUG: クールタイム終了時、コマンドキューが空でした。");
                    setMode('waiting');
                }
            }, INPUT_COOLTIME_MS);
        } else { // テキスト入力はクールタイムなしで即時処理
            handleFinalCommand(input);
        }
    }

    /**
     * 完全確定したコマンドを処理する
     * @param {string} finalCommand - 完全確定したコマンド
     */
    function handleFinalCommand(finalCommand) {
        playSound(RELODE_SOUND_PATH); // 音声確定時のアナウンス

        // 4. ユーザーフィードバック
        let feedbackMessage;
        const lowerFinalCommand = finalCommand.toLowerCase();
        // WAKE_WORDSに"クイックコマンド"が含まれているか、かつ入力が"クイックコマンド"で始まるか
        if (WAKE_WORDS.includes('クイックコマンド') && lowerFinalCommand.startsWith('クイックコマンド')) {
            feedbackMessage = `シーシーで${finalCommand}を実行します`;
        } else {
            feedbackMessage = `${finalCommand}でございますね。かしこまりました`;
        }
        speakText(feedbackMessage);

        // 5. バックエンド送信
        sendCommandToBackend(finalCommand);
    }

    // ------------------------------------------------------------------------
    // 初期起動
    // ------------------------------------------------------------------------
    setMode('waiting'); // 初期モード設定
    try {
        recognition.start(); // 音声認識開始
    } catch(e) {
        console.error("初期認識開始に失敗", e);
    }
});
