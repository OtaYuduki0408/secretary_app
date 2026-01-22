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
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const { latitude: current_lat, longitude: current_lon } = position.coords;
                    try {
                        const target_lat = parseFloat(expr.value.latitude);
                        const target_lon = parseFloat(expr.value.longitude);
                        const allowed_range = parseFloat(expr.value.range || 1000);
                        const distance = haversine_distance(current_lat, current_lon, target_lat, target_lon);
                        console.log(`場所条件評価: 距離=${distance.toFixed(2)}m, 範囲=${allowed_range}m`);
                        resolve(distance <= allowed_range);
                    } catch (e) {
                        console.error("場所条件の評価中にエラー:", e);
                        resolve(false);
                    }
                },
                (error) => {
                    console.error("位置情報の取得に失敗:", error.message);
                    resolve(false);
                },
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
            );
        });
    }
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
        return [];
    }
    for (const condition of conditions) {
        if (condition.type === 'if') {
            const isMet = await evaluateConditionExpr(condition.expr);
            if (isMet) {
                return condition.actions || [];
            }
        }
    }
    const elseBlock = conditions.find(c => c.type === 'else');
    if (elseBlock) {
        return elseBlock.actions || [];
    }
    return null;
}

/**
 * 指定されたアクションを実行する
 * @param {object} action - 実行するアクション
 * @returns {Promise<void>} アクションの完了を示すPromise
 */
function executeAction(action) {
    return new Promise(async resolve => {
        console.log("アクションを実行します:", action);
        let textToSpeak = "";
        let overlayTitle = "";
        let overlayCategoryClass = "overlay-speech";

        const overlay = document.getElementById('read-aloud-overlay');
        const timeElement = document.getElementById('overlay-time');
        const messageElement = document.getElementById('overlay-message');

        overlay.classList.remove('overlay-calendar', 'overlay-finance', 'overlay-memo', 'overlay-speech');
        
        const now = new Date();
        const formattedTime = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        if (timeElement) {
            timeElement.textContent = formattedTime;
        }
        
        let messageHtml = "";


        if (action.category === '\u767a\u58f0') {
            textToSpeak = action.detail.text;
            overlayTitle = "\u8aad\u307f\u4e0a\u3052";
            overlayCategoryClass = "overlay-speech";
            messageHtml = `<h3>${overlayTitle}</h3><p>${textToSpeak}</p>`;

        } else if (action.category === '\u30ab\u30ec\u30f3\u30c0\u30fc' && action.sub === '\u8aad\u307f\u4e0a\u3052') {
            overlayTitle = "\u30ab\u30ec\u30f3\u30c0\u30fc";
            overlayCategoryClass = "overlay-calendar";
            const detail = action.detail || {};
            const events = Array.isArray(detail.events) ? detail.events : [];
            const summary = detail.summary;
            const start_time = detail.start_time;
            const end_time = detail.end_time;
            const start_day = detail.start_day;
            const end_day = detail.end_day;
            const event_link = detail.event_link;

            if (events.length === 0 && (summary === '\u4eca\u65e5\u306e\u4e88\u5b9a\u306f\u3042\u308a\u307e\u305b\u3093' || summary === '\u30ab\u30ec\u30f3\u30c0\u30fc\u60c5\u5831\u306e\u53d6\u5f97\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002')) {
                textToSpeak = summary;
                messageHtml = `<h3>${overlayTitle}</h3><p>${textToSpeak}</p>`;
            } else if (events.length > 0) {
                const cardsHtml = events.map((e, idx) => {
                    const title = e.summary || e.title || '\u540d\u79f0\u672a\u8a2d\u5b9a\u30a4\u30d9\u30f3\u30c8';
                    const day = e.start_day || '';
                    const time = `${e.start_time || '\u672a\u5b9a'} - ${e.end_time || '\u672a\u5b9a'}`;
                    return `
                        <div class="calendar-card">
                            <div class="calendar-card-title">${idx + 1}. ${title}</div>
                            <div class="calendar-card-meta">
                                <span class="calendar-card-date">${day}</span>
                                <span class="calendar-card-time">${time}</span>
                            </div>
                        </div>`;
                }).join('');
                textToSpeak = `???????????????${events.length}??????????` +
                    events.map((e, idx) => `${idx + 1}???${e.start_day || ''} ${e.summary || e.title || '\u540d\u79f0\u672a\u8a2d\u5b9a\u30a4\u30d9\u30f3\u30c8'}?${e.start_time || '\u672a\u5b9a'}??${e.end_time || '\u672a\u5b9a'}??`).join('?');
                messageHtml = `
                    <h3>${overlayTitle}</h3>
                    <div class="calendar-cards">${cardsHtml}</div>`;
            } else {
                let datePart = "";
                if (start_day && end_day && start_day !== "??") {
                    datePart = (start_day === end_day) ? `${start_day}?` : `${start_day}??${end_day}??`;
                } else if (start_day === "??") {
                    datePart = "???";
                } else if (start_day) {
                    datePart = `${start_day}?`;
                }
                textToSpeak = `${datePart}${summary}??${start_time}??${end_time}?????`;
                messageHtml = `
                    <h3>${overlayTitle}</h3>
                    <div class="details-section">
                        <p><strong>\u30a4\u30d9\u30f3\u30c8</strong> ${summary}</p>
                        <p><strong>\u65e5\u6642:</strong> ${datePart}${start_time || '\u672a\u5b9a'} - ${end_time || '\u672a\u5b9a'}</p>
                        ${event_link ? `<p><a href="${event_link}" target="_blank">\u8a73\u7d30\u3092\u898b\u308b</a></p>` : ''}
                    </div>`;
            }

        } else if (action.category === '\u53ce\u652f\u7ba1\u7406' && action.sub === '\u8aad\u307f\u4e0a\u3052') {
            overlayTitle = "\u53ce\u652f\u7ba1\u7406";
            overlayCategoryClass = "overlay-finance";
            let { format, records, income_total, expense_total, balance, error } = action.detail || {};
            records = Array.isArray(records) ? records : [];

            if (!error && (records.length === 0 || income_total == null || expense_total == null || balance == null)) {
                try {
                    const res = await fetch("/api/finance");
                    if (res.ok) {
                        const allRecords = await res.json();
                        records = Array.isArray(allRecords) ? allRecords : [];
                        const incomeSum = records
                            .filter(r => r.type === 'income')
                            .reduce((sum, r) => sum + (r.amount || 0), 0);
                        const expenseSum = records
                            .filter(r => r.type === 'expense')
                            .reduce((sum, r) => sum + (r.amount || 0), 0);
                        if (income_total == null) income_total = incomeSum;
                        if (expense_total == null) expense_total = expenseSum;
                        if (balance == null) balance = incomeSum - expenseSum;
                    } else {
                        console.warn("[finance] /api/finance fetch failed", res.status);
                    }
                } catch (e) {
                    console.warn("[finance] /api/finance fetch error", e);
                }
            }

            // (??????????????????)

        } else if (action.category === '\u30e1\u30e2' && action.sub === '\u8aad\u307f\u4e0a\u3052') {
            overlayTitle = "\u30e1\u30e2";
            overlayCategoryClass = "overlay-memo";
            const memoContent = action.detail && action.detail.content ? action.detail.content : "";
            textToSpeak = `??????????????${memoContent}????`;
            messageHtml = `<h3>${overlayTitle}</h3><p>${memoContent}</p>`;
        }

            overlay.classList.add(overlayCategoryClass);
            messageElement.innerHTML = messageHtml;
            overlay.classList.add('visible');

            let speechPromise;
            if (typeof SpeechSynthesisUtterance !== 'undefined' && typeof speechSynthesis !== 'undefined') {
                const utterance = new SpeechSynthesisUtterance(textToSpeak);
                speechPromise = new Promise(resolveSpeech => {
                    utterance.onend = () => {
                        console.log(`発声終了: "${textToSpeak.substring(0, 50)}..."`);
                        resolveSpeech();
                    };
                    utterance.onerror = (event) => {
                        console.error(`音声合成エラー: ${event.error}`);
                        resolveSpeech();
                    };
                    speechSynthesis.speak(utterance);
                });
                console.log(`発声開始: "${textToSpeak.substring(0, 50)}..."`);
            } else {
                console.error("音声合成がこのブラウザでサポートされていません。");
                speechPromise = Promise.resolve();
            }

            const minDisplayPromise = new Promise(resolveDisplay => setTimeout(resolveDisplay, 2000)); 

            Promise.all([speechPromise, minDisplayPromise]).then(() => {
                overlay.classList.remove('visible');
                resolve();
            });
        } else {
            resolve();
        }
    });
}

function setupWebSocket() {
    const SOCKET_URL =
        location.hostname === "localhost"
            ? "http://127.0.0.1:5000"
            : location.origin;

    const socket = io.connect(SOCKET_URL, {
        path: "/socket.io",
        transports: ["websocket"],
    });

    socket.on('connect', () => {
        console.log('WebSocketサーバーに接続しました (SID: ' + socket.id + ')');
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

    socket.on('dispatch_command', async (order_data) => {
        console.log('サーバーからコマンドディスパッチを受け取りました:', order_data);
        const conditions = order_data.conditions || [];
        const top_level_actions = order_data.actions || [];

        let actionsToExecute = [];
        if (conditions.length > 0) {
            actionsToExecute = await getActionsToExecute(conditions);
        } else {
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

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupWebSocket);
} else {
    setupWebSocket();
}
