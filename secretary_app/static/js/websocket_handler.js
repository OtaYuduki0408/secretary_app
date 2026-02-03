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

function speak(text) {
    return new Promise((resolve, reject) => {
        if (!text || typeof SpeechSynthesisUtterance === 'undefined' || typeof speechSynthesis === 'undefined') {
            return resolve();
        }
        speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        const preferredVoiceName = getPreferredVoiceName();
        const voiceSettings = getVoiceSettings();
        if (preferredVoiceName) {
            const voices = speechSynthesis.getVoices();
            if (voices.length > 0) {
                const selectedVoice = voices.find(voice => voice.name === preferredVoiceName);
                if (selectedVoice) utterance.voice = selectedVoice;
            }
        }
        utterance.rate = voiceSettings.rate;
        utterance.pitch = voiceSettings.pitch;
        utterance.volume = voiceSettings.volume;
        utterance.onstart = () => document.dispatchEvent(new CustomEvent('voice:playstart'));
        utterance.onend = () => {
            document.dispatchEvent(new CustomEvent('voice:playend'));
            resolve();
        };
        utterance.onerror = (event) => {
            console.error(`音声合成エラー: ${event.error}`);
            document.dispatchEvent(new CustomEvent('voice:playend'));
            reject(event.error);
        };
        speechSynthesis.speak(utterance);
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
    if (!userId) {
        console.error("Enrichment failed: User ID is not available.");
        return { ...action.detail, error: "ユーザーIDが取得できませんでした。" };
    }
    try {
        const response = await fetch('/api/actions/enrich', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: action, user_id: userId }),
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data.enriched_detail;
    } catch (error) {
        console.error("Enrichment fetch failed:", error);
        return { ...action.detail, error: `アクションの準備に失敗しました: ${error.message}` };
    }
}

function extractActionFromStep(step) {
    if (!step) return null;
    if (step.kind === 'action') return step.action;
    if (step.category) return step;
    return null;
}

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
        if(actionToExecute) await executeAction(actionToExecute);
    }
}

async function executeAction(action) {
    console.log("アクションを実行します:", action);
    let textToSpeak = "";
    const detail = action.detail || {};

    if (detail.error) {
        textToSpeak = detail.error;
    } else if (action.category === '発声') {
        textToSpeak = detail.text || "";
    } else if (action.category === '時間読み上げ') {
        const nowDate = new Date();
        const year = nowDate.getFullYear(), month = nowDate.getMonth() + 1, day = nowDate.getDate();
        const hours = nowDate.getHours(), minutes = nowDate.getMinutes();
        const weekday = ["日", "月", "火", "水", "木", "金", "土"][nowDate.getDay()];
        switch (action.sub) {
            case "今日の日付": textToSpeak = `今日は${month}月${day}日です。`; break;
            case "今日の曜日": textToSpeak = `今日は${weekday}曜日です。`; break;
            case "今の時間": textToSpeak = `今は${hours}時${minutes}分です。`; break;
            case "今日の年月日": textToSpeak = `今日は${year}年${month}月${day}日です。`; break;
        }
    } else if (action.category === 'アラート') {
        playSound(detail.sound || 'default.mp3');
        textToSpeak = `アラートを再生しました。`;
    } else if (action.category === 'SwitchBot') {
        // This is now handled by the backend, just report the result
        const serverResult = detail.server_result;
        if (serverResult && serverResult.statusCode === 100) {
            textToSpeak = `SwitchBotの操作に成功しました。`;
        } else {
            textToSpeak = `SwitchBotの操作に失敗しました。${serverResult?.message || ''}`;
        }
    } else if (action.category === 'カレンダー' && action.sub === '読み上げ') {
        if (detail.events && detail.events.length > 0) {
            textToSpeak = `カレンダーの予定が${detail.events.length}件あります。` +
                detail.events.map((e, i) => `${i + 1}件目、${e.summary}、${e.start_time}から。`).join(' ');
        } else {
            textToSpeak = detail.summary || '予定はありません。';
        }
    } else if (action.category === 'メモ' && action.sub === '読み上げ') {
        textToSpeak = detail.content || '読み上げるメモがありません。';
    }

    if (textToSpeak) {
        await speak(textToSpeak);
    }
}

function setupWebSocket() {
    const socket = io.connect('https://127.0.0.1:5000');

    socket.on('connect', () => {
        console.log('WebSocketサーバーに接続しました (SID: ' + socket.id + ')');
        const userId = document.body.dataset.userId;
        if (userId) socket.emit('authenticate', { 'user_id': userId });
    });

    socket.on('disconnect', () => console.warn('WebSocketサーバーから切断されました。'));
    socket.on('connect_error', (err) => console.error('WebSocket接続エラー:', err.message));

    socket.on('dispatch_command', async (order_data) => {
        console.log('サーバーからコマンドディスパッチを受け取りました:', order_data);
        
        function flattenActions(stepList) {
            let actions = [];
            for (const step of (stepList || [])) {
                const action = extractActionFromStep(step);
                if (action) {
                    actions.push(action);
                }
                const condition = (step.kind === 'condition') ? step.condition : null;
                if (condition) {
                    actions.push(...flattenActions(condition.actions));
                    actions.push(...flattenActions(condition.nested));
                }
            }
            return actions;
        }

        const actionPlan = flattenActions(order_data.steps || []);
        
        if (actionPlan.length > 0) {
            await executePlan(actionPlan);
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupWebSocket);
} else {
    setupWebSocket();
}
