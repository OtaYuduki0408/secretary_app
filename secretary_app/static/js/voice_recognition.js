document.addEventListener('DOMContentLoaded', () => {
    // ----------------------------------------------------------------------
    // 1. 各要素の取得
    // ----------------------------------------------------------------------
    const micButton = document.querySelector('.mic-btn');
    const searchBox = document.getElementById('searchbox');

    // Web Speech APIの互換性チェック
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        // APIがサポートされていない場合の処理
        console.error("Web Speech API はこのブラウザでサポートされていません。");
        micButton.disabled = true;
        micButton.ariaLabel = "音声入力は非対応です";
        searchBox.placeholder = "入力 (音声認識非対応)";
        return; // サポートされていない場合は以降の処理を中断
    }

    // ----------------------------------------------------------------------
    // 2. 音声認識オブジェクトの初期化
    // ----------------------------------------------------------------------
    const recognition = new SpeechRecognition();

    // 言語設定を日本語に
    recognition.lang = 'ja-JP';
    // 認識結果が出た時点で終了せず、継続的に次の音声を待ち受ける (リアルタイム追記のため)
    recognition.continuous = true;
    // 中間的な結果 (in-flight text) も表示する
    recognition.interimResults = true;

    // 認識中かどうかを管理するフラグ
    let isRecognizing = false;

    // ----------------------------------------------------------------------
    // 3. イベントハンドラの設定
    // ----------------------------------------------------------------------

    /**
     * 音声が認識された時のイベントハンドラ
     * @param {SpeechRecognitionEvent} event
     */
    recognition.onresult = (event) => {
        let interimTranscript = ''; // 中間的な認識結果
        let finalTranscript = '';   // 確定した認識結果

        // イベント結果をループして、中間結果と確定結果を分ける
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                // 確定した結果 (句読点や最終的な単語の修正後)
                finalTranscript += transcript;
            } else {
                // 中間的な結果 (まだ変化する可能性のあるテキスト)
                interimTranscript += transcript;
            }
        }

        // searchboxの内容を更新
        // 確定した部分があれば、それをベースに
        // 確定した部分がなければ、現在のsearchboxの内容に中間結果を追記
        // ※ここではシンプルに、確定結果 + 中間結果を全て表示します。
        searchBox.value = finalTranscript + interimTranscript;
    };

    /**
     * 認識が終了した時 (continuous: true の場合は、一時停止やエラーで停止した時)
     */
    recognition.onend = () => {
        if (isRecognizing) {
            // 連続認識がONの場合、意図せず終了したら再スタートする（安定性向上）
            console.log("認識が終了しました。自動的に再起動します。");
            recognition.start();
        } else {
            console.log("認識処理が停止しました。");
            micButton.classList.remove('active');
        }
    };

    /**
     * エラーが発生した時のイベントハンドラ
     * @param {SpeechRecognitionErrorEvent} event
     */
    recognition.onerror = (event) => {
        console.error('音声認識エラー:', event.error);
        isRecognizing = false; // 認識フラグをリセット
        micButton.classList.remove('active');

        // エラーメッセージをユーザーに通知
        searchBox.placeholder = `エラー: ${event.error}`;
        setTimeout(() => {
            searchBox.placeholder = "入力";
        }, 3000);
    };


    // ----------------------------------------------------------------------
    // 4. マイクボタンのクリック処理
    // ----------------------------------------------------------------------
    micButton.addEventListener('click', () => {
        if (isRecognizing) {
            // 認識中の場合は停止
            isRecognizing = false;
            recognition.stop();
            micButton.classList.remove('active');
            searchBox.placeholder = "入力 (認識停止)";
            console.log("音声認識を停止しました。");
        } else {
            // 停止中の場合は開始
            try {
                // 認識開始前に、入力欄をクリア
                searchBox.value = '';
                searchBox.placeholder = "お話しください...";
                recognition.start();
                isRecognizing = true;
                micButton.classList.add('active'); // ボタンに視覚的な変化を与えるCSSクラス
                console.log("音声認識を開始しました。");

                // ※初回起動時にマイクの許可ダイアログが表示されます。
            } catch (e) {
                console.error("認識開始中にエラーが発生しました:", e);
                isRecognizing = false;
                micButton.classList.remove('active');
            }
        }
    });

    // 初期状態のボタン表示設定
    micButton.classList.remove('active');
});