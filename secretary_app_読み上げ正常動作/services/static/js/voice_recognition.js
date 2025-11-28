document.addEventListener('DOMContentLoaded', () => {
    const micButton = document.querySelector('.mic-btn');
    const searchBox = document.getElementById('searchbox');
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        console.error("Web Speech API はこのブラウザでサポートされていません。");
        micButton.disabled = true;
        micButton.ariaLabel = "音声入力は非対応です";
        searchBox.placeholder = "入力 (音声認識非対応)";
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.continuous = true; // 常時認識を有効に
    recognition.interimResults = true;

    let isRecognizing = false; // 認識がアクティブかどうかの全体的な状態
    let isWaitingForWakeWord = true; // ウェイクワードを待っている状態か
    const wakeWords = ["ボイスメイト", "ぼいすめいと", "voicemate"];
    const activationSound = new Audio('/static/voice/botan.m4a'); // 起動音

    // --- UI更新関数 ---
    const updateUIMode = (mode) => {
        if (mode === 'listening') {
            activationSound.play(); // 起動音を再生
            micButton.classList.add('active');
            searchBox.placeholder = "お話しください...";
            isWaitingForWakeWord = false;
        } else { // 'waiting' or 'idle'
            micButton.classList.remove('active');
            searchBox.placeholder = "「ボイスメイト」と話しかけてください";
            isWaitingForWakeWord = true;
        }
    };

    // --- イベントハンドラ ---
    recognition.onstart = () => {
        isRecognizing = true;
        console.log("音声認識が開始されました。");
        updateUIMode('waiting'); // 初期状態はウェイクワード待機
    };

    recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
        }

        if (isWaitingForWakeWord) {
            const lowerTranscript = transcript.toLowerCase();
            // ウェイクワードを検出
            if (wakeWords.some(word => lowerTranscript.includes(word))) {
                console.log("ウェイクワードを検出しました！");
                searchBox.value = ''; // 入力欄をクリア
                updateUIMode('listening'); // コマンド受付モードへ
            }
        } else {
            // コマンド受付モード
            searchBox.value = transcript;
            if (event.results[event.results.length - 1].isFinal) {
                // ウェイクワードを削除する処理
                let commandText = transcript;
                // 大文字小文字を区別しない正規表現でウェイクワードを検索し、削除
                const wakeWordPattern = new RegExp(wakeWords.join('|'), 'gi');
                commandText = commandText.replace(wakeWordPattern, '').trim();

                // ウェイクワードが除去されて何かテキストが残っている場合のみ処理
                if (commandText) {
                    const finalTranscript = commandText + ';';
                    console.log("コマンド確定:", finalTranscript);
                    searchBox.value = finalTranscript; // ウェイクワード除去後の最終結果をセット
                    searchBox.dispatchEvent(new Event('input', { bubbles: true }));
                } else {
                    console.log("ウェイクワードのみの発話だったため、コマンドは送信しません。");
                }
                
                recognition.stop(); // 一旦停止して、onendから再開させる
            }
        }
    };

    recognition.onend = () => {
        console.log("認識セッションが一旦終了しました。");
        if (isRecognizing) {
            // ユーザーが明示的に停止していなければ、再開する
            setTimeout(() => recognition.start(), 100);
        } else {
            console.log("音声認識は完全に停止しました。");
            micButton.classList.remove('active');
            searchBox.placeholder = "入力";
        }
    };

    recognition.onerror = (event) => {
        console.error('音声認識エラー:', event.error);
        if (event.error === 'no-speech' || event.error === 'network') {
            // これらは継続的な認識で発生しうるので、無視して継続
            console.log("無視できるエラー、認識を継続します。");
        } else {
            isRecognizing = false;
            updateUIMode('idle');
        }
    };

    // --- マイクボタンのクリック処理 ---
    micButton.addEventListener('click', () => {
        if (isRecognizing) {
            // 認識中の場合
            if (isWaitingForWakeWord) {
                // ウェイクワード待機中 -> 手動でコマンド入力モードへ
                console.log("手動でコマンド入力モードへ移行します。");
                updateUIMode('listening');
            } else {
                // コマンド入力中 -> 待機モードへ戻る
                console.log("コマンド入力をキャンセルし、待機モードへ戻ります。");
                updateUIMode('waiting');
            }
        } else {
            // 完全に停止している場合 -> 認識を開始
            try {
                recognition.start();
            } catch (e) {
                console.error("認識開始中にエラーが発生しました:", e);
            }
        }
    });

    // --- 初期化 ---
    try {
        // ページ読み込み時に自動で認識を開始
        recognition.start();
    } catch (e) {
        console.error("初期認識開始に失敗しました。ユーザー操作が必要かもしれません。", e);
        searchBox.placeholder = "マイクボタンを押して開始";
    }
});