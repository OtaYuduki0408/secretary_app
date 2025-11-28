// C:\Users\y_oota\Documents\secretary_app\secretary_app\static\js\websocket_handler.js

console.log("websocket_handler.js loaded.");

// =====================================================================
// WebSocket通信とクライアントサイド評価ロジック
// =====================================================================

/**
 * 2点間の緯度経度から距離を計算する (Haversine公式)
 * @param {number} lat1 - 地点1の緯度
 * @param {number} lon1 - 地点1の経度
 * @param {number} lat2 - 地点2の緯度
 * @param {number} lon2 - 地点2の経度
 * @returns {number} 2点間の距離 (メートル)
 */
function haversine_distance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // 地球の半径 (メートル)
    const rad = (deg) => deg * (Math.PI / 180);

    const rlat1 = rad(lat1);
    const rlat2 = rad(lat2);
    const dlat = rad(lat2 - lat1);
    const dlon = rad(lon2 - lon1);

    const a = Math.sin(dlat / 2) ** 2 + Math.cos(rlat1) * Math.cos(rlat2) * Math.sin(dlon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

/**
 * 条件式(expr)を評価する非同期関数
 * @param {object} expr - 評価する条件の式
 * @returns {Promise<boolean>} 評価結果
 */
async function evaluateConditionExpr(expr) {
    if (!expr || !expr.category) {
        return false;
    }

    if (expr.category === '場所') {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                console.error("このブラウザはGeolocationをサポートしていません。");
                return resolve(false);
            }
            // 位置情報を取得
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const { latitude: current_lat, longitude: current_lon } = position.coords;
                    console.log(`現在の位置情報: 緯度=${current_lat}, 経度=${current_lon}`);
                    
                    try {
                        const target_lat = parseFloat(expr.value.latitude);
                        const target_lon = parseFloat(expr.value.longitude);
                        const allowed_range = parseFloat(expr.value.range || 1000);

                        const distance = haversine_distance(current_lat, current_lon, target_lat, target_lon);

                        console.log(`場所条件評価: 距離=${distance.toFixed(2)}m, 範囲=${allowed_range}m`);
                        
                        // 距離が範囲内ならtrue
                        resolve(distance <= allowed_range);
                    } catch (e) {
                        console.error("場所条件の評価中にエラー:", e);
                        resolve(false);
                    }
                },
                (error) => {
                    console.error("位置情報の取得に失敗:", error.message);
                    resolve(false); // 位置情報を取得できない場合はfalse
                },
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
            );
        });
    }
    // TODO: 他のカテゴリ（時間、カレンダーなど）のクライアントサイド評価が必要な場合はここに追加
    console.warn(`未実装の条件カテゴリです: ${expr.category}`);
    return false;
}

/**
 * 条件(if/else)のリストを評価し、実行すべきアクションのリストを返す
 * @param {Array} conditions - 条件のリスト
 * @returns {Promise<Array|null>} 実行すべきアクションの配列、またはnull
 */
async function getActionsToExecute(conditions) {
    if (!conditions || conditions.length === 0) {
        return []; // 条件がなければ、トップレベルのアクションを実行する
    }

    for (const condition of conditions) {
        if (condition.type === 'if') {
            const isMet = await evaluateConditionExpr(condition.expr);
            if (isMet) {
                return condition.actions || []; // if条件がtrueなら、そのアクションを返す
            }
        }
    }
    
    // どのif条件も満たされなかった場合、elseブロックのアクションを探す
    const elseBlock = conditions.find(c => c.type === 'else');
    if (elseBlock) {
        return elseBlock.actions || [];
    }

    return null; // どの条件にも合致しなかった
}


/**
 * 指定されたアクションを実行する
 * @param {object} action - 実行するアクション
 */
function executeAction(action) {
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
        messageHtml = `<p>${textToSpeak}</p>`;
    } else if (action.category === 'カレンダー' && action.sub === '読み上げ') {
        const itemName = action.detail.item_name || 'カレンダーイベント';
        const startTime = action.detail.start_time;
        const endTime = action.detail.end_time;
        const startDate = action.detail.start_day;
        const endDate = action.detail.end_day;
        const eventLink = action.detail.event_link; // イベントリンクを追加

        overlayTitle = "カレンダー";
        overlayCategoryClass = "overlay-calendar";
        
        let datePart = "";
        if (startDate && endDate && startDate !== "実行された日") {
            if (startDate === endDate) {
                datePart = `${startDate}日の`;
            } else {
                datePart = `${startDate}日から${endDate}日までの`;
            }
        } else if (startDate === "実行された日") {
             datePart = "今日の";
        }

        textToSpeak = `${datePart}${itemName}が、${startTime}から${endTime}までです。`;
        messageHtml = `
            <h3>${overlayTitle}</h3>
            <div class="event-details">
                <p><strong>イベント:</strong> ${itemName}</p>
                <p><strong>期間:</strong> ${datePart}${startTime} - ${endTime}</p>
                ${eventLink ? `<p><a href="${eventLink}" target="_blank" style="color: #60a5fa;">イベントを見る</a></p>` : ''}
            </div>
        `;
    } else if (action.category === '収支' && action.sub === '読み上げ') {
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
            <div class="finance-details">
                <p><strong>種類:</strong> ${recordType}</p>
                <p><strong>金額:</strong> ${amount ? `${amount}円` : '不明'}</p>
                <p><strong>カテゴリ:</strong> ${category || '不明'}</p>
                ${description ? `<p><strong>内容:</strong> ${description}</p>` : ''}
            </div>
        `;
    } else if (action.category === 'メモ' && action.sub === '読み上げ') {
        const memoContent = action.detail.content || 'メモの内容がありません。'; // メモの詳細情報を取得

        overlayTitle = "メモ";
        overlayCategoryClass = "overlay-memo";
        textToSpeak = `メモの読み上げです。内容は「${memoContent}」です。`;
        messageHtml = `
            <h3>${overlayTitle}</h3>
            <div class="memo-details">
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

        // テキストの長さに応じて表示時間を調整（最小5秒、1文字あたり0.1秒）
        const displayDuration = Math.max(5000, textToSpeak.length * 100);
        setTimeout(() => {
            overlay.classList.remove('visible'); // オーバーレイを非表示
        }, displayDuration);

        // 音声読み上げの処理
        if (typeof SpeechSynthesisUtterance !== 'undefined' && typeof speechSynthesis !== 'undefined') {
            const utterance = new SpeechSynthesisUtterance(textToSpeak);
            // TextToSpeechReader.js があればそれを使うことを検討
            if (window.TextToSpeechReader && typeof window.TextToSpeechReader.read === 'function') {
                window.TextToSpeechReader.read(textToSpeak);
            } else {
                speechSynthesis.speak(utterance);
            }
            console.log(`発声しました: "${textToSpeak}"`);
        } else {
            console.error("音声合成がこのブラウザでサポートされていません。");
        }
    }
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
            actionsToExecute.forEach(executeAction);
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
