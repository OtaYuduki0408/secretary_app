/**
 * Web Speech API (SpeechSynthesis) を使用して、テキストの読み上げ機能を提供するクラス。
 */
export class TextToSpeechReader { // ★ここに 'export' を追加しました
    constructor() {
        /**
         * ブラウザの音声合成オブジェクトを取得
         * @private
         * @type {SpeechSynthesis}
         */
        this.synth = window.speechSynthesis;

        /**
         * 利用可能な音声のリスト
         * @private
         * @type {SpeechSynthesisVoice[]}
         */
        this.voices = [];

        // 音声リストのロードを待機
        this.synth.onvoiceschanged = () => {
            this.voices = this.synth.getVoices();
        };

        // ブラウザによっては onvoiceschanged が発火しないため、即座に取得を試みる
        if (this.voices.length === 0) {
            this.voices = this.synth.getVoices();
        }

        console.log("TextToSpeechReader: 初期化完了。");
    }

    /**
     * 指定されたテキストを読み上げます。
     * @param {string} text - 読み上げたいテキスト
     * @param {string} lang - 読み上げに使用する言語コード（例: 'ja-JP'、'en-US'）。未指定の場合はOSのデフォルト言語を使用。
     */
    speak(text, lang = 'ja-JP') {
        if (!text) {
            console.warn("読み上げるテキストが指定されていません。");
            return;
        }

        if (this.synth.speaking) {
            console.log("現在、別の読み上げ中です。一旦停止します。");
            this.synth.cancel(); // 既に読み上げ中のものがあればキャンセル
        }

        // 読み上げ内容を設定する Utterance オブジェクトを作成
        const utterance = new SpeechSynthesisUtterance(text);

        // 言語に対応した音声を選択
        const selectedVoice = this.voices.find(voice => voice.lang === lang);
        if (selectedVoice) {
            utterance.voice = selectedVoice;
        } else {
            // 指定言語の音声が見つからない場合、デフォルトの音声を使用
            console.warn(`指定された言語 (${lang}) の音声が見つかりませんでした。デフォルト音声を使用します。`);
        }

        // 読み上げ開始
        this.synth.speak(utterance);
    }

    /**
     * 現在の読み上げを停止します。
     */
    stop() {
        if (this.synth.speaking) {
            this.synth.cancel();
            console.log("読み上げを停止しました。");
        }
    }
}