/**
 * 指定されたアクションを実行する
 * @param {object} action - 実行するアクション
 * @returns {Promise<void>} アクションの完了を示すPromise
 */
function executeAction(action) {
    return new Promise(resolve => {
        console.log("アクションを実行します:", action);
        let textToSpeak = "";
        let overlayTitle = "";
        let overlayCategoryClass = "overlay-speech"; // デフォルトは汎用読み上げ

        // UI表示要素の取得
        const overlay = document.getElementById('read-aloud-overlay');
        const timeElement = document.getElementById('overlay-time');
        const messageElement = document.getElementById('overlay-message');

        // 既存のカテゴリクラスをすべて削除
        overlay.classList.remove('overlay-calendar', 'overlay-finance', 'overlay-memo', 'overlay-speech');

        // 現在時刻の表示
        const now = new Date();
        const formattedTime = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        if (timeElement) {
            timeElement.textContent = formattedTime;
        }
        
        let messageHtml = ""; // overlay-messageに挿入するHTML

        if (action.category === '発声') {
            textToSpeak = action.detail.text;
            overlayTitle = "読み上げ";
            overlayCategoryClass = "overlay-speech";
            messageHtml = `
                <h3>${overlayTitle}</h3>
                <p>${textToSpeak}</p>
            `;
        } else if (action.category === 'カレンダー' && action.sub === '読み上げ') {
            const itemName = action.detail.summary || '今日の予定はありません';
            const startTime = action.detail.start_time;
            const endTime = action.detail.end_time;
            const startDate = action.detail.start_day;
            const endDate = action.detail.end_day;
            const eventLink = action.detail.event_link;

            overlayTitle = "カレンダー";
            overlayCategoryClass = "overlay-calendar";
            
            if (itemName === '今日の予定はありません') {
                textToSpeak = '今日の予定はありません。';
                messageHtml = `
                    <h3>${overlayTitle}</h3>
                    <p>${textToSpeak}</p>
                `;
            } else {
                let datePart = "";
                if (startDate && endDate && startDate !== "実行された日" && startDate !== "不明") {
                    if (startDate === endDate) {
                        datePart = `${startDate}日の`;
                    } else {
                        datePart = `${startDate}日から${endDate}日までの`;
                    }
                } else if (startDate === "実行された日") {
                    datePart = "今日の";
                } else if (startDate && startDate !== "不明") {
                    datePart = `${startDate}日の`;
                }

                textToSpeak = `${datePart}${itemName}が、${startTime}から${endTime}までです。`;
                messageHtml = `
                    <h3>${overlayTitle}</h3>
                    <div class="details-section">
                        <p><strong>イベント:</strong> ${itemName}</p>
                        <p><strong>期間:</strong> ${datePart}${startTime || '不明'} - ${endTime || '不明'}</p>
                        ${eventLink ? `<p><a href="${eventLink}" target="_blank">詳細を見る</a></p>` : ''}
                    </div>
                `;
            }
        } else if (action.category === '収支管理' && action.sub === '読み上げ') {
            const recordType = action.detail.record_type || '記録';
            const amount = action.detail.amount;
            const description = action.detail.description;
            const category = action.detail.category;

            overlayTitle = "収支管理";
            overlayCategoryClass = "overlay-finance";

            let recordText = `${recordType}の記録です。`;
            if (amount) {
                recordText += `金額は${amount}円。`;
            }
            if (category) {
                recordText += `カテゴリは${category}。`;
            }
            if (description) {
                recordText += `内容は${description}。`;
            }
            textToSpeak = recordText;
            messageHtml = `
                <h3>${overlayTitle}</h3>
                <div class="details-section">
                    <p><strong>種類:</strong> ${recordType}</p>
                    <p><strong>金額:</strong> ${amount ? `${amount}円` : '不明'}</p>
                    <p><strong>カテゴリ:</strong> ${category || '不明'}</p>
                    ${description ? `<p><strong>内容:</strong> ${description}</p>` : ''}
                </div>
            `;
        } else if (action.category === 'メモ' && action.sub === '読み上げ') {
            const memoContent = action.detail.content || 'メモの内容がありません。';

            overlayTitle = "メモ";
            overlayCategoryClass = "overlay-memo";
            textToSpeak = `メモの読み上げです。内容は「${memoContent}」です。`;
            messageHtml = `
                <h3>${overlayTitle}</h3>
                <div class="details-section">
                    <p>${memoContent}</p>
                </div>
            `;
        }
        // TODO: 他のカテゴリの読み上げもここに追加

        if (textToSpeak && overlay && messageElement) {
            // オーバーレイにカテゴリクラスを追加
            overlay.classList.add(overlayCategoryClass);
            messageElement.innerHTML = messageHtml; // HTMLを挿入

            // オーバーレイを表示
            overlay.classList.add('visible');

            let speechPromise;
            if (typeof SpeechSynthesisUtterance !== 'undefined' && typeof speechSynthesis !== 'undefined') {
                const utterance = new SpeechSynthesisUtterance(textToSpeak);
                
                speechPromise = new Promise(resolveSpeech => {
                    utterance.onend = () => {
                        console.log(`発声終了: "${textToSpeak}"`);
                        resolveSpeech();
                    };
                    utterance.onerror = (event) => {
                        console.error(`音声合成エラー: ${event.error}`);
                        resolveSpeech(); // エラーでも次のアクションに進む
                    };
                    speechSynthesis.speak(utterance);
                });
                console.log(`発声開始: "${textToSpeak}"`);
            } else {
                console.error("音声合成がこのブラウザでサポートされていません。");
                speechPromise = Promise.resolve(); // 音声合成がない場合は即座に解決
            }

            // 最小表示時間を保証するためのPromise (例: 2秒)
            const minDisplayPromise = new Promise(resolveDisplay => setTimeout(resolveDisplay, 2000)); 

            Promise.all([speechPromise, minDisplayPromise]).then(() => {
                overlay.classList.remove('visible'); // オーバーレイを非表示
                resolve(); // executeActionのPromiseを解決
            });
        } else {
            resolve(); // 実行するテキストがなければ即座に解決
        }
    });
}

// WebSocketサーバーに接続し、イベントを待機
function setupWebSocket() {
    // 'https'で提供されるページからは'wss://'に接続する必要がある
    const socket = io.connect('https://127.0.0.1:5000');

    socket.on('connect', () => {
        console.log('WebSocketサーバーに接続しました (SID: ' + socket.id + ')');
        // 接続後、bodyタグからuser_idを取得して認証イベントを送信
        const userId = document.body.dataset.userId;
        if (userId) {
            socket.emit('authenticate', { 'user_id': userId });
            console.log(`認証要求を送信しました: user_id=${userId}`);
        } else {
            console.warn('user_idが見つからないため、認証要求を送信できませんでした。');
        }
    });

    socket.on('disconnect', () => {
        console.warn('WebSocketサーバーから切断されました。');
    });

    socket.on('connect_error', (err) => {
        console.error('WebSocket接続エラー:', err.message);
    });

    // サーバーからコマンド実行の指示を受け取るリスナー
    socket.on('dispatch_command', async (order_data) => {
        console.log('サーバーからコマンドディスパッチを受け取りました:', order_data);
        const conditions = order_data.conditions || [];
        const top_level_actions = order_data.actions || [];

        let actionsToExecute = [];
        if (conditions.length > 0) {
            // 条件を評価して実行すべきアクションを取得
            actionsToExecute = await getActionsToExecute(conditions);
        } else {
            // 条件がなければトップレベルのアクションを実行
            actionsToExecute = top_level_actions;
        }

        if (actionsToExecute && actionsToExecute.length > 0) {
            console.log("条件を満たしました。アクションを実行します。");
            for (const action of actionsToExecute) {
                await executeAction(action);
            }
        } else {
            console.log("実行すべきアクションはありませんでした。");
        }
    });
}

// DOM読み込み完了時にWebSocketのセットアップを開始
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupWebSocket);
} else {
    setupWebSocket();
}
