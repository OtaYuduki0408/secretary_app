document.addEventListener('DOMContentLoaded', () => {
    const micButton = document.querySelector('.mic-btn');
    const searchBox = document.getElementById('searchbox');
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        console.error("Web Speech API はこのブラウザでサポートされていません。");
        micButton.disabled = true;
        searchBox.placeholder = "音声認識非対応";
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.continuous = true;
    recognition.interimResults = true;

    const wakeWords = ['ボイスメイト', 'ぼいすめいと', 'voicemate'];
    let mode = 'waiting'; // 'waiting' or 'listening'
    let recognitionTimeout;

    function setMode(newMode) {
        if (mode === newMode) return;
        console.log(`モード変更: ${mode} -> ${newMode}`);
        mode = newMode;
        clearTimeout(recognitionTimeout);

        if (mode === 'listening') {
            micButton.classList.add('active');
            searchBox.placeholder = "お話しください...";
            searchBox.value = ''; // 入力欄をクリア
            // 10秒後に自動的に待機モードに戻るタイムアウト
            recognitionTimeout = setTimeout(() => {
                if (mode === 'listening') {
                    console.log("コマンド入力タイムアウト。待機モードに戻ります。");
                    setMode('waiting');
                }
            }, 10000);
        } else { // 'waiting'
            micButton.classList.remove('active');
            searchBox.placeholder = "「ボイスメイト」と呼びかけてください";
            searchBox.value = '';
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

        if (mode === 'waiting') {
            const lowerTranscript = (finalTranscript + interimTranscript).toLowerCase();
            if (wakeWords.some(word => lowerTranscript.includes(word))) {
                console.log("ウェイクワードを検出");
                // ウェイクワードを検出したら、次の認識サイクルからコマンドを受け付ける
                // この時点のトランスクリプトはクリアされる
                setMode('listening');
            }
        } else if (mode === 'listening') {
            // listeningモードでは、中間結果をボックスに表示
            searchBox.value = finalTranscript + interimTranscript;

            // 確定したコマンドがあれば処理
            if (finalTranscript.trim()) {
                console.log(`コマンドを確定: ${finalTranscript}`);
                searchBox.value = finalTranscript.trim() + ';';
                searchBox.dispatchEvent(new Event('input', { bubbles: true }));
                setMode('waiting'); // 処理後、待機モードに戻る
            }
        }
    };

    recognition.onend = () => {
        console.log("認識セッション終了。1秒後に再開します。");
        setTimeout(() => {
            try {
                recognition.start();
            } catch(e) {
                // 'start' already called エラーなどを避ける
                console.error("認識の再開に失敗:", e);
            }
        }, 1000); // エラー多発を防ぐため少し間を置く
    };
    
    recognition.onerror = (event) => {
        if (event.error === 'no-speech') {
            // 無音は continuous モードなので無視
            return;
        }
        console.error('音声認識エラー:', event.error);
    };

    micButton.addEventListener('click', () => {
        if (mode === 'listening') {
            setMode('waiting');
        } else {
            setMode('listening');
        }
    });

    // 初期起動
    setMode('waiting');
    try {
        recognition.start();
    } catch(e) {
        console.error("初期認識開始に失敗", e);
    }
});