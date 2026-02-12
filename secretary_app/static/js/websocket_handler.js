// static/js/websocket_handler.js

console.log("websocket_handler.js loaded.");

// =====================================================================
// ヘルパー関数
// =====================================================================

function getPreferredVoiceName() {
    try {
        const raw = localStorage.getItem('appSettings');
        if (!raw) return '';
        const settings = JSON.parse(raw);
        return settings?.main?.voiceName || '';
    } catch (e) { return ''; }
}

function getVoiceSettings() {
    try {
        const raw = localStorage.getItem('appSettings');
        if (!raw) return { rate: 1, pitch: 1, volume: 1 };
        const settings = JSON.parse(raw);
        return {
            rate: settings?.main?.voiceRate ?? 1,
            pitch: settings?.main?.voicePitch ?? 1,
            volume: settings?.main?.voiceVolume ?? 1,
        };
    } catch (e) { return { rate: 1, pitch: 1, volume: 1 }; }
}

function playSound(filename, volume = 1.0) {
    const audio = new Audio(`/static/voice/${filename}`);
    audio.volume = volume;
    audio.play().catch(e => console.error(`音声ファイル ${filename} の再生に失敗しました:`, e));
}

async function speak(text) {
    return new Promise(async (resolve, reject) => {
        if (!text || !text.trim()) {
            console.log("DEBUG: speak関数に空のテキストが渡されたため、処理をスキップします。");
            return resolve();
        }

        // iOSの再生ポリシーを回避するため、再生直前に無音再生を実行
        if (window.playSilentAudio) {
            window.playSilentAudio();
            console.log("DEBUG: Executed silent audio playback trick for server-side TTS.");
        } else {
            console.warn("DEBUG: playSilentAudio function not found.");
        }

        try {
            console.log(`DEBUG: Server-side TTSをリクエストします: "${text}"`);
            const response = await fetch('/api/tts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ text: text }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: "サーバーから不明なエラー応答。" }));
                throw new Error(`TTS API request failed: ${errorData.error || response.statusText}`);
            }

            const data = await response.json();
            const audioContent = data.audioContent;

            if (!audioContent) {
                throw new Error("APIから音声データが返されませんでした。");
            }

            // Base64からArrayBufferにデコード
            const binaryString = window.atob(audioContent);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            const arrayBuffer = bytes.buffer;

            // AudioContextで再生
            if (!window.audioContext) {
                throw new Error("AudioContextが初期化されていません。");
            }
            
            const audioBuffer = await window.audioContext.decodeAudioData(arrayBuffer);
            const source = window.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(window.audioContext.destination);
            
            document.dispatchEvent(new CustomEvent('voice:playstart'));
            
            source.onended = () => {
                console.log("DEBUG: Server-side TTSの再生が完了しました。");
                document.dispatchEvent(new CustomEvent('voice:playend'));
                resolve();
            };
            
            source.start(0);

        } catch (error) {
            console.error("!!! [TTS_ERROR] Server-side TTSの再生に失敗しました:", error);
            document.dispatchEvent(new CustomEvent('voice:playend')); // エラー時もオーバーレイを閉じるためにイベントを発火
            reject(error);
        }
    });
}

// =====================================================================
// 新しい実行パイプライン
// =====================================================================

function needsEnrichment(action) {
    if (!action || !action.category || !action.sub) return false;
    const { category, sub } = action;
    if (category === 'カレンダー' && sub === '読み上げ') return true;
    if (category === '収支管理' && sub === '読み上げ') return true;
    if (category === 'メモ' && sub === '読み上げ') return true;
    return false;
}

async function fetchEnrichedData(action) {
    const userId = document.body.dataset.userId;
    console.log(`[DEBUG_WS] fetchEnrichedData called for action:`, action);
    if (!userId) {
        console.error("[DEBUG_WS] Enrichment failed: User ID is not available.");
        return { ...action.detail, error: "ユーザーIDが取得できませんでした。" };
    }

    const requestBody = { action: action, user_id: userId };
    console.log('[DEBUG_WS] Sending enrichment request to /api/actions/enrich with body:', JSON.stringify(requestBody, null, 2));

    try {
        const response = await fetch('/api/actions/enrich', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });

        const responseText = await response.text();
        console.log(`[DEBUG_WS] Received response from /api/actions/enrich. Status: ${response.status}. Body:`, responseText);

        if (!response.ok) {
            let errorData = { error: `HTTP error! status: ${response.status}` };
            try {
                // Try to parse the text as JSON, it might contain error details
                errorData = JSON.parse(responseText);
            } catch (e) {
                // If parsing fails, the response was likely not JSON (e.g., HTML error page)
                console.error('[DEBUG_WS] Failed to parse error response as JSON.');
            }
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const data = JSON.parse(responseText); // We already have the text, so parse it
        console.log('[DEBUG_WS] Successfully parsed enrichment response:', data);
        return data.enriched_detail;

    } catch (error) {
        console.error("!!! [DEBUG_WS] Enrichment fetch failed:", error);
        return { ...action.detail, error: `アクションの準備に失敗しました: ${error.message}` };
    }
}

function extractActionFromStep(step) {
    if (!step) return null;
    if (step.kind === 'action') return step.action;
    if (step.category) return step;
    return null;
}

function flattenActionsFromSteps(stepList) {
    let actions = [];
    for (const step of (stepList || [])) {
        const action = extractActionFromStep(step);
        if (action) {
            actions.push(action);
        }
        const condition = (step && step.kind === 'condition') ? step.condition : null;
        if (condition) {
            actions = actions.concat(flattenActionsFromSteps(condition.actions));
            actions = actions.concat(flattenActionsFromSteps(condition.nested));
        }
    }
    return actions;
}

async function executeOrderPayload(orderData) {
    if (!orderData || typeof orderData !== 'object') return;
    const steps = orderData.steps || [];
    const actions = orderData.actions || [];
    const actionPlan = steps.length > 0 ? flattenActionsFromSteps(steps) : actions;
    if (actionPlan.length > 0) {
        await executePlan(actionPlan);
    }
}

window.executeOrderPayload = executeOrderPayload;

async function executePlan(plan) {
    const enrichedDataCache = new Map();

    for (let i = 0; i < plan.length; i++) {
        const action = plan[i];
        if (action && needsEnrichment(action)) {
            const enrichPromise = fetchEnrichedData(action);
            enrichedDataCache.set(i, enrichPromise);
        }
    }

    for (let i = 0; i < plan.length; i++) {
        let actionToExecute = plan[i];
        if (actionToExecute && needsEnrichment(actionToExecute)) {
            try {
                const enrichedDetail = await enrichedDataCache.get(i);
                actionToExecute = { ...actionToExecute, detail: enrichedDetail };
            } catch (e) {
                console.error("Enrichment promise failed:", e);
                actionToExecute.detail.error = "アクションの準備中にエラーが発生しました。";
            }
        }
        if (actionToExecute) await executeAction(actionToExecute);
    }
}

async function executeAction(action) {
    console.log("アクションを実行します:", action);
    let textToSpeak = "";
    let overlayTitle = "";
    let overlayCategoryClass = "overlay-speech";

    const overlay = document.getElementById('read-aloud-overlay');
    const messageElement = document.getElementById('overlay-message');
    const timeElement = document.getElementById('overlay-time');

    if (!overlay || !messageElement) {
        console.warn("overlay要素が見つかりません。");
        if (textToSpeak) await speak(textToSpeak);
        return;
    }

    // オーバーレイのリセット
    overlay.classList.remove('overlay-calendar', 'overlay-finance', 'overlay-memo', 'overlay-speech');

    // 時刻表示
    const now = new Date();
    const formattedTime = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (timeElement) {
        timeElement.textContent = formattedTime;
    }

    let messageHtml = "";

    const detail = action.detail || {};

    if (detail.error) {
        textToSpeak = detail.error;
        overlayTitle = "エラー";
    } else if (action.category === '発声') {
        textToSpeak = detail.text || "";
        overlayTitle = "読み上げ";
    } else if (action.category === '時間読み上げ') {
        overlayTitle = "時間読み上げ";
        const nowDate = new Date();
        const year = nowDate.getFullYear();
        const month = nowDate.getMonth() + 1;
        const day = nowDate.getDate();
        const hours = nowDate.getHours();
        const minutes = nowDate.getMinutes();
        const weekday = ["日", "月", "火", "水", "木", "金", "土"][nowDate.getDay()];

        const selections = Array.isArray(detail.content) ? detail.content : (detail.content ? [detail.content] : []);
        const parts = [];

        if (selections.includes("今の時間") || selections.length === 0) {
            parts.push(`${hours}時${minutes}分です。`);
        }
        if (selections.includes("今日の日付") || selections.includes("年月日") || selections.length === 0) {
            parts.push(`今日の日付は${month}月${day}日です。`);
        }
        if (selections.includes("今日の曜日") || selections.length === 0) {
            parts.push(`今日の曜日は${weekday}曜日です。`);
        }
        if (selections.includes("年月日") || selections.length === 0) {
            parts.push(`今日は${year}年${month}月${day}日です。`);
        }

        textToSpeak = parts.join(' ');
    } else if (action.category === 'アラート') {
        overlayTitle = "アラート";
        playSound(detail.sound || 'default.mp3');
        textToSpeak = "アラートを再生しました。";
    } else if (action.category === 'SwitchBot') {
        overlayTitle = "SwitchBot 操作";
        const userId = document.body.dataset.userId;
        try {
            const response = await fetch('/api/actions/execute/switchbot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, detail: action.detail }),
            });
            const serverResult = await response.json();
            if (serverResult && serverResult.statusCode === 100) {
                textToSpeak = "SwitchBotの操作に成功しました。";
            } else {
                textToSpeak = `SwitchBotの操作に失敗しました。${serverResult?.message || ''}`;
            }
        } catch (error) {
            console.error('SwitchBot execution fetch failed:', error);
            textToSpeak = "SwitchBotの操作リクエストに失敗しました。";
        }
    } else if (action.category === 'カレンダー' && action.sub === '読み上げ') {
        overlayTitle = "カレンダー";
        overlayCategoryClass = "overlay-calendar";
        if (detail.events && detail.events.length > 0) {
            textToSpeak = `カレンダーの予定が${detail.events.length}件あります。` +
                detail.events.map((e, i) => `${i + 1}件目、${e.summary}、${e.start_time}から。`).join(' ');
            messageHtml = `
                <h3>${overlayTitle}</h3>
                <div class="calendar-cards">${detail.events.map((e, idx) => `
                    <div class="calendar-card">
                        <div class="calendar-card-title">${idx + 1}. ${e.summary}</div>
                        <div class="calendar-card-meta">
                            <span class="calendar-card-date">${e.start_day}</span>
                            <span class="calendar-card-time">${e.start_time} - ${e.end_time}</span>
                        </div>
                    </div>`).join('')}
                </div>`;
        } else {
            textToSpeak = detail.summary || '予定はありません。';
            messageHtml = `<h3>${overlayTitle}</h3><p>${textToSpeak}</p>`;
        }
    } else if (action.category === '収支管理' && action.sub === '読み上げ') {
        overlayTitle = "収支管理";
        overlayCategoryClass = "overlay-finance";
        const incomeTotal = detail.income_total !== undefined ? detail.income_total : 0;
        const expenseTotal = detail.expense_total !== undefined ? detail.expense_total : 0;
        const balance = detail.balance !== undefined ? detail.balance : 0;

        textToSpeak = `現在の総収入は${incomeTotal}円、総支出は${expenseTotal}円、差し引き残高は${balance}円です。`;
        messageHtml = `
            <h3>${overlayTitle}</h3>
            <div class="finance-summary">
                <p><strong>総収入:</strong> ${incomeTotal} 円</p>
                <p><strong>総支出:</strong> ${expenseTotal} 円</p>
                <p><strong>残高:</strong> ${balance} 円</p>
            </div>`;
    } else if (action.category === 'メモ' && action.sub === '読み上げ') {
        overlayTitle = "メモ";
        overlayCategoryClass = "overlay-memo";
        textToSpeak = detail.content || '読み上げるメモがありません。';
        messageHtml = `<h3>${overlayTitle}</h3><div class="details-section"><p>${textToSpeak}</p></div>`;
    } else if (action.category === '天気' && action.sub === '読み上げ') {
        overlayTitle = "天気予報";
        overlayCategoryClass = "overlay-speech";
        textToSpeak = detail.message || "天気予報の情報を取得できませんでした。";
        messageHtml = `<h3>${overlayTitle}</h3><p>${textToSpeak.replace(/。/g, '。<br>')}</p>`;
    } else if (action.category === 'Youtube' && action.sub === '再生') {
        overlayTitle = "Youtube 再生";
        const { mode, search_query, video_url } = detail;
        const queryOrUrl = mode === 'url' ? video_url : search_query;

        if (queryOrUrl && typeof window.playYoutubeVideo === 'function') {
            textToSpeak = `${mode === 'url' ? 'URLの動画' : search_query}を再生します。`;
            
            await speak(textToSpeak); 
            window.playYoutubeVideo(queryOrUrl);

            return; 

        } else {
            textToSpeak = "Youtubeの再生情報が正しく設定されていません。";
            console.error(textToSpeak, detail);
            messageHtml = `<h3>${overlayTitle}</h3><p>${textToSpeak}</p>`;
        }
    }

    if (textToSpeak) {
        overlay.classList.add(overlayCategoryClass);
        if (messageHtml) {
            messageElement.innerHTML = messageHtml;
        } else {
            messageElement.innerHTML = `<h3>${overlayTitle}</h3><p>${textToSpeak}</p>`;
        }
        overlay.classList.add('visible');

        await speak(textToSpeak);

        overlay.classList.remove('visible');
    }
}

function setupWebSocket() {
    const socket = io(window.location.origin, {
        transports: ['websocket'], // WebSocketのみに限定
        reconnection: true, // 再接続を有効にする
        reconnectionAttempts: 5, // 再接続試行回数
        reconnectionDelay: 2000, // 再接続の遅延時間(ms)
    });

    socket.on('connect', () => {
        console.log('WebSocketサーバーに接続しました (SID: ' + socket.id + ')');
        const userId = document.body.dataset.userId;
        if (userId) socket.emit('authenticate', { 'user_id': userId });
    });

    socket.on('disconnect', () => console.warn('WebSocketサーバーから切断されました。'));
    socket.on('connect_error', (err) => console.error('WebSocket接続エラー:', err.message));

    socket.on('dispatch_command', async (order_data) => {
        console.log('サーバーからコマンドディスパッチを受け取りました:', order_data);
        await executeOrderPayload(order_data);
    });

    // ★★★ デバッグ用に追加 ★★★
    socket.on('debug_message', (data) => {
        console.log('DEBUG_SERVER_MESSAGE:', data);
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupWebSocket);
} else {
    setupWebSocket();
}
