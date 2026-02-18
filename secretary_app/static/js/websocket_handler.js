// static/js/websocket_handler.js

console.log("websocket_handler.js loaded.");
let currentAudioSource = null; // 現在再生中のオーディオソースを追跡
let lastPayloadSignature = '';
let lastPayloadExecutedAt = 0;
const DUPLICATE_PAYLOAD_SUPPRESS_MS = 8000;
let isWebSocketConnected = false;
let fallbackBootstrapTimer = null;
let missingOverlayWarned = false;

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

        // 既存の音声が再生中であれば停止する
        if (currentAudioSource) {
            console.log("DEBUG: 既存の音声を中断して、新しい音声を再生します。");
            currentAudioSource.onended = null; // 古いonendedイベントをクリア
            currentAudioSource.stop();
            currentAudioSource = null;
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

            const binaryString = window.atob(audioContent);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            const arrayBuffer = bytes.buffer;

            if (!window.audioContext) {
                throw new Error("AudioContextが初期化されていません。");
            }
            
            const audioBuffer = await window.audioContext.decodeAudioData(arrayBuffer);
            const source = window.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(window.audioContext.destination);
            
            currentAudioSource = source; // 現在の再生ソースとして設定
            
            document.dispatchEvent(new CustomEvent('voice:playstart'));
            
            source.onended = () => {
                console.log("DEBUG: Server-side TTSの再生が完了しました。");
                currentAudioSource = null; // 再生完了時にクリア
                document.dispatchEvent(new CustomEvent('voice:playend'));
                resolve();
            };
            
            source.start(0);

        } catch (error) {
            console.error("!!! [TTS_ERROR] Server-side TTSの再生に失敗しました:", error);
            currentAudioSource = null; // エラー時もクリア
            document.dispatchEvent(new CustomEvent('voice:playend'));
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
    if (category === '特殊命令' && sub === '目覚まし') return true;
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
    const signature = JSON.stringify({
        triggers: (orderData.triggers || []).map((t) => ({
            category: t?.category || '',
            sub: t?.sub || '',
            value: t?.value || {},
        })),
        actions: (actionPlan || []).map((a) => ({
            category: a?.category || '',
            sub: a?.sub || '',
        })),
    });
    const now = Date.now();
    if (signature === lastPayloadSignature && (now - lastPayloadExecutedAt) < DUPLICATE_PAYLOAD_SUPPRESS_MS) {
        console.log('[DEBUG_WS] 重複ペイロードを抑止しました。');
        return;
    }
    lastPayloadSignature = signature;
    lastPayloadExecutedAt = now;

    if (actionPlan.length > 0) {
        await executePlan(actionPlan);
    }
}

window.executeOrderPayload = executeOrderPayload;
window.speak = speak; // speak関数をグローバルに公開

function stopAllAudio() {
    if (currentAudioSource) {
        console.log("DEBUG: グローバルな停止要求により、音声再生を停止します。");
        currentAudioSource.onended = null;
        currentAudioSource.stop();
        currentAudioSource = null;
        document.dispatchEvent(new CustomEvent('voice:playend')); // キャラクターのアニメーションなども止める
    }
    // ブラウザのspeechSynthesisも念のため停止
    if (window.speechSynthesis && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
    }
}
window.stopAllAudio = stopAllAudio;

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

    if (window.updateAllInfo) {
        console.log("[DEBUG_WS] すべてのアクション実行後に情報を更新します。");
        window.updateAllInfo();
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
    const hasReadAloudOverlay = !!(overlay && messageElement);
    const logDisplay = document.getElementById('log-display');
    const appendAssistantLog = (message) => {
        if (!message || !logDisplay) return;
        const el = document.createElement('div');
        el.className = 'log-message assistant';
        el.textContent = String(message);
        logDisplay.appendChild(el);
        const scrollContainer = document.querySelector('#field-log .content');
        if (scrollContainer) {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
        } else {
            logDisplay.scrollTop = logDisplay.scrollHeight;
        }
    };

    if (!hasReadAloudOverlay) {
        if (!missingOverlayWarned) {
            console.warn("overlay要素が見つかりません。");
            missingOverlayWarned = true;
        }
    }

    // オーバーレイのリセット（要素がある場合のみ）
    if (hasReadAloudOverlay) {
        overlay.classList.remove('overlay-calendar', 'overlay-finance', 'overlay-memo', 'overlay-speech', 'overlay-image-display');
    }

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

        const rawSelections = Array.isArray(detail.content) ? detail.content : (detail.content ? [detail.content] : []);
        const normalizedSelections = rawSelections.map((item) => {
            if (item === "年月日") return "年";
            if (item === "今日の日付") return "月日";
            if (item === "今日の曜日") return "曜日";
            if (item === "今の時間") return "時間";
            return item;
        });
        const selections = normalizedSelections.length > 0 ? normalizedSelections : ["年", "月日", "曜日", "時間"];
        const parts = [];

        if (selections.includes("年")) parts.push(`${year}年`);
        if (selections.includes("月日")) parts.push(`${month}月${day}日`);
        if (selections.includes("曜日")) parts.push(`${weekday}曜日`);
        if (selections.includes("時間")) parts.push(`${hours}時${minutes}分`);

        textToSpeak = parts.length > 0 ? `${parts.join('、')}です。` : `${year}年、${month}月${day}日、${weekday}曜日、${hours}時${minutes}分です。`;
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
            appendAssistantLog(textToSpeak);
        } catch (error) {
            console.error('SwitchBot execution fetch failed:', error);
            textToSpeak = "SwitchBotの操作リクエストに失敗しました。";
            appendAssistantLog(textToSpeak);
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
    } else if (action.category === '特殊命令' && action.sub === '目覚まし') {
        overlayTitle = "特殊命令";
        overlayCategoryClass = "overlay-speech";
        textToSpeak = detail.message || "明日の目覚まし時刻を取得できませんでした。";
        messageHtml = `<h3>${overlayTitle}</h3><p>${textToSpeak}</p>`;
    } else if (action.category === 'Youtube') {
        overlayTitle = "Youtube 操作";

        if (action.sub === '再生') {
            const { mode, search_query, video_url } = detail;
            const queryOrUrl = mode === 'url' ? video_url : search_query;

            if (queryOrUrl && typeof window.playYoutubeVideo === 'function') {
                textToSpeak = `${mode === 'url' ? 'URLの動画' : search_query}を再生します。`;
                window.playYoutubeVideo(queryOrUrl);
                appendAssistantLog(textToSpeak);
                try { await speak(textToSpeak); } catch (e) { console.warn("speak failed:", e); }
                return;
            }

            if (typeof window.executeYoutubeIntent === 'function') {
                const resumed = window.executeYoutubeIntent({ intent: 'resume', query: '' });
                if (resumed) {
                    textToSpeak = "YouTubeを再生します。";
                    appendAssistantLog(textToSpeak);
                    try { await speak(textToSpeak); } catch (e) { console.warn("speak failed:", e); }
                    return;
                }
            }

            textToSpeak = "Youtubeの再生情報が正しく設定されていません。";
            console.error(textToSpeak, detail);
            messageHtml = `<h3>${overlayTitle}</h3><p>${textToSpeak}</p>`;
        } else {
            if (typeof window.executeYoutubeIntent !== 'function') {
                textToSpeak = "YouTube操作機能を読み込めませんでした。";
                messageHtml = `<h3>${overlayTitle}</h3><p>${textToSpeak}</p>`;
            } else {
                const secondsRaw = Number(detail.seconds);
                const volumeStepRaw = Number(detail.volume_step);
                const seconds = Number.isFinite(secondsRaw) ? Math.max(1, Math.min(600, Math.round(secondsRaw))) : 10;
                const volumeStep = Number.isFinite(volumeStepRaw) ? Math.max(1, Math.min(100, Math.round(volumeStepRaw))) : 10;

                let intentPayload = null;
                let successMessage = "";
                switch (action.sub) {
                    case '再開':
                        intentPayload = { intent: 'resume', query: '' };
                        successMessage = "YouTubeを再開します。";
                        break;
                    case '一時停止':
                        intentPayload = { intent: 'pause', query: '' };
                        successMessage = "YouTubeを一時停止します。";
                        break;
                    case '動画を進める':
                        intentPayload = { intent: 'seek_forward', query: '', amount: seconds };
                        successMessage = `${seconds}秒進めます。`;
                        break;
                    case '動画を戻す':
                        intentPayload = { intent: 'seek_backward', query: '', amount: seconds };
                        successMessage = `${seconds}秒戻します。`;
                        break;
                    case '音量を上げる':
                        intentPayload = { intent: 'volume_up', query: '', amount: volumeStep };
                        successMessage = `音量を${volumeStep}上げます。`;
                        break;
                    case '音量を下げる':
                        intentPayload = { intent: 'volume_down', query: '', amount: volumeStep };
                        successMessage = `音量を${volumeStep}下げます。`;
                        break;
                    default:
                        break;
                }

                if (!intentPayload) {
                    textToSpeak = `未対応のYouTube操作です: ${action.sub}`;
                    messageHtml = `<h3>${overlayTitle}</h3><p>${textToSpeak}</p>`;
                } else {
                    const handled = window.executeYoutubeIntent(intentPayload);
                    if (handled) {
                        textToSpeak = successMessage;
                    } else {
                        textToSpeak = "YouTube操作を実行できませんでした。";
                    }
                    appendAssistantLog(textToSpeak);
                }
            }
        }
    } else if (action.category === '画像提示' && action.sub === '発声') {
        const imageOverlay = document.getElementById('image-display-overlay');
        const displayedImage = document.getElementById('displayed-image');
        
        if (imageOverlay && displayedImage && detail.imageBase64) {
            displayedImage.src = detail.imageBase64;
            imageOverlay.classList.add('visible');

            // テキストがあれば再生し、再生が終わるまで待つ
            if (detail.text) {
                await speak(detail.text);
            } else {
                // テキストがない場合は、最低でも少し待つか、クリックで閉じられるようにする
                // ここでは、テキストがない場合は即座に閉じないように何もしない
                // ユーザーが手動で閉じるのを待つ
            }

            imageOverlay.classList.remove('visible');
            displayedImage.src = ''; // メモリ解放のためにクリア
        } else {
            console.error("画像表示に必要な要素、または画像データが不足しています。");
            textToSpeak = "画像を表示できませんでした。";
        }
    } else if (action.category === '画面制御') {
        overlayTitle = "画面制御";
        if (detail.state === 'on') {
            if(window.showBlackout) window.showBlackout();
            textToSpeak = "画面をオフにします";
        } else if (detail.state === 'off') {
            if(window.hideBlackout) window.hideBlackout();
            textToSpeak = "画面をオンにします";
        }
    }

    if (textToSpeak) {
        if (hasReadAloudOverlay) {
            overlay.classList.add(overlayCategoryClass);
            if (messageHtml) {
                messageElement.innerHTML = messageHtml;
            } else {
                messageElement.innerHTML = `<h3>${overlayTitle}</h3><p>${textToSpeak}</p>`;
            }
            overlay.classList.add('visible');
            try { await speak(textToSpeak); } catch (e) { console.warn("speak failed:", e); }
            overlay.classList.remove('visible');
        } else {
            // オーバーレイが無くても音声実行は継続する
            try { await speak(textToSpeak); } catch (e) { console.warn("speak failed:", e); }
        }
    }
}

function setupWebSocket() {
    const socket = io(window.location.origin, {
        transports: ['websocket', 'polling'], // Render等でWebSocket不可時はpollingへフォールバック
        reconnection: true, // 再接続を有効にする
        reconnectionAttempts: 5, // 再接続試行回数
        reconnectionDelay: 2000, // 再接続の遅延時間(ms)
        timeout: 20000,
    });

    socket.on('connect', () => {
        console.log('WebSocketサーバーに接続しました (SID: ' + socket.id + ')');
        isWebSocketConnected = true;
        stopPendingActionPolling();
        if (fallbackBootstrapTimer) {
            clearTimeout(fallbackBootstrapTimer);
            fallbackBootstrapTimer = null;
        }
        const userId = document.body.dataset.userId;
        if (userId) socket.emit('authenticate', { 'user_id': userId });
    });

    socket.on('disconnect', () => {
        isWebSocketConnected = false;
        console.warn('WebSocketサーバーから切断されました。フォールバックのpending_actionsポーリングを開始します。');
        startPendingActionPolling();
    });
    socket.on('connect_error', (err) => {
        isWebSocketConnected = false;
        console.error('WebSocket接続エラー:', err.message);
        startPendingActionPolling();
    });

    socket.on('dispatch_command', async (order_data) => {
        console.log('サーバーからコマンドディスパッチを受け取りました:', order_data);
        await executeOrderPayload(order_data);
    });

    // ★★★ デバッグ用に追加 ★★★
    socket.on('debug_message', (data) => {
        console.log('DEBUG_SERVER_MESSAGE:', data);
    });
}

let pendingActionPollTimer = null;
let pendingActionPollBusy = false;

async function pollPendingActions() {
    if (pendingActionPollBusy) return;
    const userId = document.body?.dataset?.userId;
    if (!userId) return;

    pendingActionPollBusy = true;
    try {
        const response = await fetch(`/order/api/pending_actions/${encodeURIComponent(userId)}`, {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' },
        });

        if (response.status === 204) return;
        if (!response.ok) {
            console.warn(`pending_actions poll failed: HTTP ${response.status}`);
            return;
        }

        const actions = await response.json();
        if (!Array.isArray(actions) || actions.length === 0) return;

        for (const action of actions) {
            const payload = action?.action_data?.order_payload;
            if (!payload) continue;
            await executeOrderPayload(payload);
        }
    } catch (error) {
        console.warn('pending_actions poll error:', error?.message || error);
    } finally {
        pendingActionPollBusy = false;
    }
}

function startPendingActionPolling() {
    if (pendingActionPollTimer) return;
    console.log('[DEBUG_WS] pending_actionsポーリングを開始します。');
    pollPendingActions();
    pendingActionPollTimer = setInterval(pollPendingActions, 3000);
}

function stopPendingActionPolling() {
    if (!pendingActionPollTimer) return;
    clearInterval(pendingActionPollTimer);
    pendingActionPollTimer = null;
    console.log('[DEBUG_WS] pending_actionsポーリングを停止しました。');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupWebSocket);
} else {
    setupWebSocket();
}

function bootstrapPendingPollingFallback() {
    // WebSocketが一定時間で確立しない場合のみフォールバックを起動する。
    if (fallbackBootstrapTimer) return;
    fallbackBootstrapTimer = setTimeout(() => {
        if (!isWebSocketConnected) {
            console.warn('[DEBUG_WS] WebSocket未接続のため、pending_actionsポーリングをフォールバック起動します。');
            startPendingActionPolling();
        }
        fallbackBootstrapTimer = null;
    }, 5000);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapPendingPollingFallback);
} else {
    bootstrapPendingPollingFallback();
}

// Keep-alive for Render
setInterval(function() {
    fetch('/keep-alive', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
    })
    .then(response => {
        if (response.ok) {
            console.log('Keep-alive request sent successfully.');
        } else {
            console.error('Failed to send keep-alive request.');
        }
    })
    .catch(error => {
        console.error('Error sending keep-alive request:', error);
    });
}, 300000); // 5分ごと
