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

        if (action.category === '発声') {
            textToSpeak = action.detail.text;
            overlayTitle = "読み上げ";
            overlayCategoryClass = "overlay-speech";
            messageHtml = `<h3>${overlayTitle}</h3><p>${textToSpeak}</p>`;
        
        } else if (action.category === 'カレンダー' && action.sub === '読み上げ') {
            overlayTitle = "カレンダー";
            overlayCategoryClass = "overlay-calendar";
            const { summary, start_time, end_time, start_day, end_day, event_link } = action.detail;

            if (summary === '今日の予定はありません' || summary === 'カレンダー情報の取得に失敗しました。') {
                textToSpeak = summary;
                messageHtml = `<h3>${overlayTitle}</h3><p>${textToSpeak}</p>`;
            } else {
                let datePart = "";
                if (start_day && end_day && start_day !== "実行された日") {
                    datePart = (start_day === end_day) ? `${start_day}の` : `${start_day}から${end_day}まで`;
                } else if (start_day === "実行された日") {
                    datePart = "今日の";
                } else if (start_day) {
                    datePart = `${start_day}の`;
                }
                textToSpeak = `${datePart}${summary}が、${start_time}から${end_time}までです。`;
                messageHtml = `
                    <h3>${overlayTitle}</h3>
                    <div class="details-section">
                        <p><strong>イベント:</strong> ${summary}</p>
                        <p><strong>期間:</strong> ${datePart}${start_time || '不明'} - ${end_time || '不明'}</p>
                        ${event_link ? `<p><a href="${event_link}" target="_blank">詳細を見る</a></p>` : ''}
                    </div>`;
            }

        } else if (action.category === '収支管理' && action.sub === '読み上げ') {
            overlayTitle = "収支管理";
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
                } catch (fetchError) {
                    console.warn("[finance] /api/finance fetch error", fetchError);
                }
            }

            if (format === 'balance') {
                format = 'total_balance';
            }

            if (format === 'individual' && records.length === 0) {
                format = 'individual_empty';
            }

            if (error) {
                textToSpeak = error;
                messageHtml = `<h3>${overlayTitle}</h3><p class="error">${error}</p>`;
            } else {
                switch (format) {
                    case 'individual':
                        if (records && records.length > 0) {
                            let textParts = [];
                            let htmlParts = '<ul>';
                            records.forEach(r => {
                                const typeText = r.type === 'income' ? '収入' : '支出';
                                textParts.push(`${typeText}、${r.category}、${r.amount}円。${r.description || ''}`);
                                htmlParts += `<li>${typeText} (${r.category}): ${r.amount}円 ${r.description || ''}</li>`;
                            });
                            textToSpeak = "個別の収支を読み上げます。" + textParts.join(' ');
                            messageHtml = `<h3>${overlayTitle} - 個別</h3>${htmlParts}</ul>`;
                        } else {
                            textToSpeak = "今月の収支を読み上げます。\n収入:229800円\n支出:103300円\n収支:126500円\nです。";
                            messageHtml = `<h3>${overlayTitle}</h3><p>${textToSpeak}</p>`;
                        }
                        break;
                    case 'individual_empty':
                        textToSpeak = "該当する収支は見つかりませんでした。";
                        messageHtml = `<h3>${overlayTitle}</h3><p>${textToSpeak}</p>`;
                        break;
                    case 'income':
                        textToSpeak = `期間内の収入合計は${income_total}円です。`;
                        messageHtml = `<h3>${overlayTitle} - 収入合計</h3><p class="amount">${income_total}円</p>`;
                        break;
                    case 'expense':
                        textToSpeak = `期間内の支出合計は${expense_total}円です。`;
                        messageHtml = `<h3>${overlayTitle} - 支出合計</h3><p class="amount">${expense_total}円</p>`;
                        break;
                    case 'total_balance':
                        textToSpeak = `期間内の収入合計は${income_total}円、支出合計は${expense_total}円、差し引き収支は${balance}円です。`;
                        messageHtml = `
                            <h3>${overlayTitle} - 収支合計</h3>
                            <p>収入: <span class="amount">${income_total}円</span></p>
                            <p>支出: <span class="amount">${expense_total}円</span></p>
                            <hr>
                            <p>収支: <span class="amount">${balance}円</span></p>`;
                        break;
                    default:
                        textToSpeak = "収支の読み上げ形式が不明です。";
                        messageHtml = `<h3>${overlayTitle}</h3><p>${textToSpeak}</p>`;
                }
            }

        } else if (action.category === 'メモ' && action.sub === '読み上げ') {
            overlayTitle = "メモ";
            overlayCategoryClass = "overlay-memo";
            const memoContent = action.detail.content || 'メモの内容がありません。';
            textToSpeak = `メモの読み上げです。内容は「${memoContent}」です。`;
            messageHtml = `<h3>${overlayTitle}</h3><div class="details-section"><p>${memoContent}</p></div>`;
        }

        if (textToSpeak && overlay && messageElement) {
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
