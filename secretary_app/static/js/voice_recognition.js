document.addEventListener('DOMContentLoaded', () => {
    console.log("DEBUG: DOMContentLoaded fired.");
    const micButton = document.querySelector('.mic-btn');
    const searchBox = document.getElementById('searchbox');
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        console.error("Web Speech API はこのブラウザでサポートされていません。");
        micButton.disabled = true;
        searchBox.placeholder = "音声認識非対応";
        console.log("DEBUG: SpeechRecognition not supported.");
        return;
    }
    console.log("DEBUG: SpeechRecognition supported.");

    const recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.continuous = true;
    recognition.interimResults = true;
    console.log("DEBUG: SpeechRecognition instance created.");

    const wakeWords = ['ボイスメイト', 'ぼいすめいと', 'voicemate', 'クイックコマンド'];
    let mode = 'waiting'; // 'waiting' or 'listening'
    let recognitionTimeout;

    function setMode(newMode) {
        console.log(`DEBUG: setMode called with: ${newMode}, current mode: ${mode}`);
        if (mode === newMode) return;
        console.log(`モード変更: ${mode} -> ${newMode}`);
        mode = newMode;
        clearTimeout(recognitionTimeout);

        if (mode === 'listening') {
            micButton.classList.add('active');
            searchBox.placeholder = "お話しください...";
            searchBox.value = ''; // 入力欄をクリア
            recognitionTimeout = setTimeout(() => {
                if (mode === 'listening') {
                    console.log("コマンド入力タイムアウト。待機モードに戻ります。");
                    setMode('waiting');
                }
            }, 10000);
            console.log("DEBUG: recognitionTimeout set for listening mode.");
        } else { // 'waiting'
            micButton.classList.remove('active');
            searchBox.placeholder = "「ボイスメイト」または「クイックコマンド」と呼びかけてください";
            searchBox.value = '';
            console.log("DEBUG: Switched to waiting mode.");
        }
    }

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
        console.log(`DEBUG: onresult - final: "${finalTranscript}", interim: "${interimTranscript}"`);

        if (mode === 'waiting') {
            const lowerTranscript = (finalTranscript + interimTranscript).toLowerCase();
            if (wakeWords.some(word => lowerTranscript.includes(word))) {
                console.log("DEBUG: ウェイクワードを検出");
                setMode('listening');
            }
        } else if (mode === 'listening') {
            searchBox.value = finalTranscript + interimTranscript;
            if (finalTranscript.trim()) {
                console.log(`DEBUG: コマンドを確定: "${finalTranscript}"`);
                searchBox.value = finalTranscript.trim() + ';';
                searchBox.dispatchEvent(new Event('input', { bubbles: true }));
                setMode('waiting');
            }
        }
    };

    recognition.onend = () => {
        console.log("DEBUG: recognition.onend fired.");
        console.log("認識セッション終了。1秒後に再開します。");
        setTimeout(() => {
            if (!recognition.recognizing) {
                console.log("DEBUG: recognition.start() called from onend.");
                try {
                    recognition.start();
                } catch(e) {
                    console.error("認識の再開に失敗:", e);
                }
            } else {
                console.log("DEBUG: recognition already recognizing, not calling start from onend.");
            }
        }, 1000);
    };
    
    recognition.onerror = (event) => {
        console.error('DEBUG: 音声認識エラー:', event.error);
        if (event.error === 'no-speech') {
            return;
        }
    };

    micButton.addEventListener('click', () => {
        console.log("DEBUG: micButton clicked.");
        if (mode === 'listening') {
            setMode('waiting');
        } else {
            setMode('listening');
        }
    });
    console.log("DEBUG: micButton event listener added.");

    // 初期起動
    setMode('waiting');
    console.log("DEBUG: Initial recognition start attempt.");
    try {
        recognition.start();
    } catch(e) {
        console.error("初期認識開始に失敗", e);
    }
});