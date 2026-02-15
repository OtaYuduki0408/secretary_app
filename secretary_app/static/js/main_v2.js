// main_v2.js

$(document).ready(function() {
    // ============================================================================
    // グローバル変数と定数
    // ============================================================================
    let WAKE_WORDS = ['サイレントメイト', 'ぼいすめいと', 'voicemate'];
    const DEFAULT_END_WORDS = ['命令完了'];
    let END_WORDS = [...DEFAULT_END_WORDS];
    let settingsEndWords = [...DEFAULT_END_WORDS];
    let customTriggerEndWords = [];
    let customTriggerAndWordGroups = [];
    
    let recognition;
    let currentMode = 'waiting';
    let recognitionTimeoutId;
    let isRecognitionActive = false;
    let finalTranscript = '';
    
    let submissionLock = false;
    const DUPLICATE_SUPPRESS_MS = 5000;
    const FINAL_SEGMENT_WAIT_MS = 800;
    const DISPATCH_COOLDOWN_MS = 3000;
    let lastDispatchedVoiceCommandKey = '';
    let lastDispatchedVoiceCommandAt = 0;
    let pendingFinalDispatchTimerId = null;

    let userInteracted = false;
    let currentAudio = null;
    const VOICE_WAKE_SOUND = new Audio("/static/voice/voice_wate.mp3");

    function playSoundEffect(audioElement) {
        try {
            audioElement.currentTime = 0;
            audioElement.play();
        } catch (e) {
            console.error("Sound effect playback failed", e);
        }
    }


    // ============================================================================
    // 初期化
    // ============================================================================

    function loadAppSettings() {
        try {
            const raw = localStorage.getItem('appSettings');
            if (!raw) return;
            const settings = JSON.parse(raw);
            const wakeWordsRaw = settings?.main?.wakeWords || '';
            if (wakeWordsRaw) WAKE_WORDS = wakeWordsRaw.split(',').map(w => w.trim()).filter(Boolean);
            settingsEndWords = parseEndWords(settings?.main?.endWord || '命令完了');
            rebuildEffectiveEndWords();
        } catch (e) {
            console.warn('アプリ設定の読み込みに失敗', e);
        }
    }

    function parseEndWords(raw) {
        if (typeof raw !== 'string') return [...DEFAULT_END_WORDS];
        const parsed = raw.split(',').map(w => w.trim()).filter(Boolean);
        return parsed.length > 0 ? parsed : [...DEFAULT_END_WORDS];
    }
    
    function rebuildEffectiveEndWords() {
        END_WORDS = Array.from(new Set([...DEFAULT_END_WORDS, ...settingsEndWords, ...customTriggerEndWords]));
    }
    
    function extractVoiceTriggerWords(order) {
        const words = new Set();
        const andGroups = [];
        if (!order?.triggers) return { words: [], andGroups: [] };
        const voiceTriggers = order.triggers.filter(t => String(t?.category).trim().toLowerCase() === 'ボイス');
        voiceTriggers.forEach(trigger => {
            const keywords = trigger.value?.keywords;
            if (Array.isArray(keywords)) {
                keywords.forEach(group => {
                    if (Array.isArray(group)) {
                        const andGroup = group.map(v => String(v).trim()).filter(Boolean);
                        if (andGroup.length > 1) andGroups.push(andGroup);
                        else if (andGroup.length === 1) words.add(andGroup[0]);
                    } else if (String(group).trim()) {
                        words.add(String(group).trim());
                    }
                });
            } else if (typeof keywords === 'string' && keywords.trim()) {
                const parts = keywords.split(',').map(p => p.trim()).filter(Boolean);
                if (parts.length > 1) andGroups.push(parts);
                else if (parts.length === 1) words.add(parts[0]);
            }
        });
        return { words: Array.from(words), andGroups };
    }

    async function loadCustomVoiceTriggerEndWords() {
        try {
            const res = await fetch('/api/custom_orders');
            if (!res.ok) throw new Error(`API fetch failed with status ${res.status}`);
            const orders = await res.json();
            if (!Array.isArray(orders)) return;
            let allWords = [], allAndGroups = [];
            orders.forEach(order => {
                const { words, andGroups } = extractVoiceTriggerWords(order);
                allWords.push(...words);
                allAndGroups.push(...andGroups);
            });
            customTriggerEndWords = Array.from(new Set(allWords));
            customTriggerAndWordGroups = allAndGroups;
            rebuildEffectiveEndWords();
        } catch (e) {
            console.warn('カスタム命令の読み込みに失敗', e);
        }
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'ja-JP';
        setupRecognitionHandlers();
    } else {
        setMode('error', '非対応ブラウザ');
    }
    
    function initializeVoiceRecognition() {
        if (!recognition || isRecognitionActive) return;
        if (!userInteracted) {
             setMode('permission_required');
             $(document).one('click', () => { userInteracted = true; initializeVoiceRecognition(); });
             return;
        }
        setMode('waiting');
        try { recognition.start(); } catch(e) {}
    }

    // ============================================================================
    // 音声認識ハンドラ
    // ============================================================================
    function setupRecognitionHandlers() {
        recognition.onstart = () => { isRecognitionActive = true; };
        recognition.onend = () => { isRecognitionActive = false; setTimeout(() => { if(!isRecognitionActive) try { recognition.start(); } catch(e) {} }, 1000); };
        recognition.onerror = (e) => { if (e.error === 'no-speech') setMode('waiting'); };
        recognition.onresult = (event) => {
            let interim_transcript = '';
            let final_transcript = '';

            // event.results全体を走査して最終的なテキストと中間テキストを再構築
            for (let i = 0; i < event.results.length; ++i) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    final_transcript += transcript;
                } else {
                    interim_transcript += transcript;
                }
            }

            const display_transcript = final_transcript + interim_transcript;

            if (currentMode === 'waiting') {
                if (WAKE_WORDS.some(w => display_transcript.toLowerCase().includes(w.toLowerCase()))) {
                    setMode('listening');
                    updateLogDisplay(stripLeadingWakeWords(display_transcript), 'user', true);
                    return;
                }
                if (interim_transcript) {
                    updateLogDisplay(interim_transcript, 'user', true, true);
                }
            } else if (currentMode === 'listening') {
                // ウェイクワードの再発をチェック
                const command_body = stripLeadingWakeWords(display_transcript);
                if (WAKE_WORDS.some(w => command_body.toLowerCase().includes(w.toLowerCase()))) {
                    recognition.stop(); // 認識をリセット
                    return;
                }

                const command_text = stripLeadingWakeWords(display_transcript);
                updateLogDisplay(command_text, 'user', true);
                
                const lastResultIsFinal = event.results[event.results.length - 1].isFinal;

                if (lastResultIsFinal) {
                    const command_to_dispatch = stripLeadingWakeWords(final_transcript);
                    const endWordMatch = findEndWordMatch(command_to_dispatch);
                    
                    clearTimeout(pendingFinalDispatchTimerId);
                    if (endWordMatch) {
                        dispatchVoiceCommand(command_to_dispatch, endWordMatch);
                    } else {
                        pendingFinalDispatchTimerId = setTimeout(() => dispatchVoiceCommand(command_to_dispatch), FINAL_SEGMENT_WAIT_MS);
                    }
                }
            }
        };
    }
    
    // ============================================================================
    // コマンド処理
    // ============================================================================
    function dispatchVoiceCommand(text, endWordMatch = null) {
        let command = sanitizeVoiceCommand(text, endWordMatch);
        setMode('processing');

        // カスタムトリガーが発話のほぼ全てで、結果としてコマンドが空になった場合の特別処理
        if (!command && endWordMatch && endWordMatch.source === 'custom') {
            // トリガーワードそのものをコマンドとして扱う
            command = endWordMatch.word;
        }

        if (!command) {
            stopTTS();
            setMode('cooldown');
            return;
        }
        if (shouldSuppressDuplicate(command)) {
            setMode('cooldown');
            return;
        }
        const repeatText = `${command}ですね。`;
        updateLogDisplay(repeatText, 'assistant');
        playTTS(repeatText, () => sendTextToServer(command));
    }

        function sendTextToServer(text) {

            if (submissionLock) return;

            

            console.log("Final command to server:", text); // DEBUG LOG

    

            submissionLock = true;

            setTimeout(() => {

                submissionLock = false;

                if (currentMode === 'cooldown') setMode('waiting');

            }, DISPATCH_COOLDOWN_MS);

    

            if(!finalTranscript) updateLogDisplay(text, 'user');

            

            $.ajax({

                url: '/web_api/chat', type: 'POST', contentType: 'application/json',

                data: JSON.stringify({ inputValue: text }),

                success: handleServerResponse,

                error: () => { setMode('cooldown'); updateLogDisplay('サーバー通信失敗', 'assistant'); }

            });

        }

    function handleServerResponse(response) {
        if (response.message) {
            updateLogDisplay(response.message, 'assistant');
            if (!response.suppress_tts) {
                playTTS(response.message, () => setMode('waiting'));
            } else {
                setMode('cooldown');
            }
        } else {
            setMode('cooldown');
        }
        if (response.triggered_by_voice && response.order_payloads) response.order_payloads.forEach(handleServerCommand);
    }
    
    function handleServerCommand(payload) {
        const actionsToExecute = (payload.steps && payload.steps.length > 0)
            ? payload.steps.map(step => step.action).filter(Boolean)
            : (payload.actions || []);
    
        actionsToExecute.forEach(action => {
            if (!action) return;
            let overlayContent = '';
            const { category, sub, detail } = action; // 分割代入でコードを少し読みやすくする
    
            switch (`${category}-${sub}`) {
                case '画面-ブラックアウト':
                    detail?.state === 'on' ? showBlackout() : hideBlackout();
                    break;
    
                // 統合された音声読み上げ処理
                case '音声-再生':
                case '発声-実行':
                case '特殊命令-目覚まし':
                    const messageToSpeak = detail?.message || detail?.text;
                    if (messageToSpeak) {
                        updateLogDisplay(messageToSpeak, 'assistant');
                        playTTS(messageToSpeak, () => setMode('waiting'));
                    }
                    break;
    
                case 'youtube-再生':
                    if (detail?.query) window.playYoutubeVideo(detail.query);
                    break;
    
                case 'youtube-操作':
                    if (detail?.intent) window.executeYoutubeIntent(detail);
                    break;
    
                case 'カレンダー-読み上げ':
                     overlayContent = createCalendarOverlayHTML(detail);
                     if(overlayContent) showActionOverlay(overlayContent);
                     if (detail?.summary) playTTS(detail.summary);
                     break;
    
                case '天気-読み上げ':
                    overlayContent = createWeatherOverlayHTML(detail);
                    if(overlayContent) showActionOverlay(overlayContent);
                    if (detail?.message) playTTS(detail.message);
                    break;
                
                case 'SwitchBot-デバイス操作':
                    if (detail?.deviceId && detail?.action) {
                        $.ajax({
                            url: '/api/switchbot/control',
                            type: 'POST',
                            contentType: 'application/json',
                            data: JSON.stringify({ deviceId: detail.deviceId, action: detail.action }),
                            success: (res) => {
                                const successMsg = `デバイス(${detail.deviceId.slice(-4)})の操作をリクエストしました。`;
                                updateLogDisplay(successMsg, 'assistant');
                                setMode('waiting');
                            },
                            error: (err) => {
                                const errorMsg = `デバイス(${detail.deviceId.slice(-4)})の操作に失敗しました。`;
                                updateLogDisplay(errorMsg, 'assistant');
                                setMode('waiting');
                            }
                        });
                    }
                    break;
            }
        });
    }
    
    function createCalendarOverlayHTML(detail) {
        if (!detail || !detail.events) return '';
        let eventHTML = detail.events.map(e => `<li><strong>${e.start_time}</strong>: ${e.summary}</li>`).join('');
        return `<h3>今日の予定</h3><ul>${eventHTML || '<li>予定はありません</li>'}</ul>`;
    }

    function createWeatherOverlayHTML(detail) {
        if (!detail || !detail.message) return '';
        return `<h3>天気予報</h3><p>${detail.message}</p>`;
    }

    // ============================================================================
    // ヘルパー
    // ============================================================================
    function setMode(newMode, text = '') {
        currentMode = newMode;
        const $micStatus = $('#mic-status').removeClass();
        const $micIcon = $micStatus.find('i').removeClass();
        const statusMap = {
            waiting:    { text: '音声待機中',   icon: 'fa-microphone',       class: 'waiting' },
            listening:  { text: '命令中...',      icon: 'fa-microphone',       class: 'listening' },
            processing: { text: '処理待機中',   icon: 'fa-cogs',             class: 'processing' },
            speaking:   { text: '発声中...',      icon: 'fa-volume-up',        class: 'speaking' },
            cooldown:   { text: '命令送信＆CD',   icon: 'fa-history',          class: 'cooldown' },
            permission_required: { text: 'クリックしてマイクを有効化', icon: 'fa-microphone-slash' },
            error:      { text: text || 'エラー', icon: 'fa-exclamation-triangle' }
        };
        const status = statusMap[newMode] || statusMap.error;
        $('#mic-status-text').text(text || status.text);
        $micIcon.addClass(`fas ${status.icon}`);
        if(status.class) $micStatus.addClass(status.class);
        if (newMode !== 'listening') {
            clearTimeout(recognitionTimeoutId);
        } else {
            playSoundEffect(VOICE_WAKE_SOUND);
            finalTranscript = '';
            clearTimeout(recognitionTimeoutId);
            recognitionTimeoutId = setTimeout(() => { if(currentMode === 'listening') dispatchVoiceCommand(finalTranscript); }, 10000);
        }
    }

    function updateLogDisplay(message, sender, isInterim = false, isWaitingLog = false) {
        const $logDisplay = $('#log-display');
        const logClass = isWaitingLog ? 'log-waiting' : (isInterim ? 'log-interim' : '');
        const lastMsg = $logDisplay.children().last();
        let displayMsg = message;
        if (sender === 'user' && (isInterim || isWaitingLog)) {
             displayMsg = highlightWords(highlightWords(message, WAKE_WORDS, 'highlight-wake-word'), END_WORDS, 'highlight-end-word');
        }
        if (isInterim || isWaitingLog) {
            if (lastMsg.hasClass('log-interim') || lastMsg.hasClass('log-waiting')) lastMsg.html(displayMsg);
            else $logDisplay.append(`<div class="log-message ${sender} ${logClass}">${displayMsg}</div>`);
        } else {
            $logDisplay.find('.log-interim, .log-waiting').remove();
            $logDisplay.append(`<div class="log-message ${sender}">${displayMsg}</div>`);
        }
        $logDisplay.scrollTop($logDisplay.prop("scrollHeight"));
    }
    
    const highlightWords = (t, w, c) => { let hT = t; w.forEach(word => { hT = hT.replace(new RegExp(escapeRegExp(word), 'gi'), `<span class="${c}">${word}</span>`); }); return hT; };
    const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const stripLeadingWakeWords = (t) => { let n = (t||'').trim(); WAKE_WORDS.sort((a,b)=>b.length-a.length).forEach(w => { if(n.toLowerCase().startsWith(w.toLowerCase())) n = n.slice(w.length).trim(); }); return n; };
    const shouldSuppressDuplicate = (c) => { const k = c.replace(/[、。！？!?]/g,' ').toLowerCase().replace(/\s+/g,' ').trim(), n=Date.now(); if(k&&k===lastDispatchedVoiceCommandKey&&(n-lastDispatchedVoiceCommandAt)<DUPLICATE_SUPPRESS_MS) return true; lastDispatchedVoiceCommandKey=k; lastDispatchedVoiceCommandAt=n; return false; };

    const findEndWordMatch = (text) => {
        const commandOnly = stripLeadingWakeWords(text);
        for (const group of customTriggerAndWordGroups) {
            if (group.every(word => commandOnly.includes(word))) {
                return { word: group.join(' & '), source: 'custom' };
            }
        }
        for (const word of END_WORDS) {
            if (commandOnly.includes(word)) {
                const isCustom = customTriggerEndWords.includes(word);
                return { word: word, source: isCustom ? 'custom' : 'settings' };
            }
        }
        return null;
    };

    function sanitizeVoiceCommand(text, endWordMatch) {
        let command = stripLeadingWakeWords(text);
        if (endWordMatch && endWordMatch.source === 'settings') {
             command = command.replace(new RegExp(escapeRegExp(endWordMatch.word), 'gi'), '');
        }
        return command.replace(/[、。！？!?\s]+$/g, '').trim();
    }

    // ============================================================================
    // UIイベント
    // ============================================================================
    $('#send-button').on('click', () => { const t = $('#text-input').val(); if(t){ sendTextToServer(t); $('#text-input').val(''); } });
    $('#text-input').on('keypress', (e) => { if(e.which === 13) $('#send-button').click(); });
    let isPlayingMusic = false;
    $('#play-pause-track').on('click', function() { const i=$(this).find('i'); if(window.executeYoutubeIntent({intent: isPlayingMusic ? 'pause':'resume'})){ isPlayingMusic=!isPlayingMusic; }else{ $.get('/api/playlist/playplan',(p)=>{if(p?.tracks?.length){window.playYoutubeTrackList(p.tracks);isPlayingMusic=true;}}); } i.toggleClass('fa-play fa-pause',isPlayingMusic); });
    $('#next-track').on('click', () => window.executeYoutubeIntent({ intent: 'next' }));
    $('#prev-track').on('click', () => window.executeYoutubeIntent({ intent: 'prev' }));
    $('#volume-slider').on('input', function() { window.executeYoutubeIntent({ intent: 'set_volume', amount: $(this).val() }); });

    // ============================================================================
    // TTS
    // ============================================================================
    const playTTS = (text, onEnd) => { stopTTS(); setMode('speaking'); $.ajax({ url: '/api/tts', type: 'POST', contentType:'application/json', data:JSON.stringify({text}), success:(r)=>{ if(r.audioContent){ currentAudio=new Audio(`data:audio/mp3;base64,${r.audioContent}`); currentAudio.play().catch(()=>{setMode('waiting');if(onEnd)onEnd();}); currentAudio.onended=()=>{currentAudio=null;setMode('waiting');if(onEnd)onEnd();}; }else{setMode('waiting');if(onEnd)onEnd();}}, error:()=>{setMode('waiting');if(onEnd)onEnd();}});};
    const stopTTS = () => { if(currentAudio){currentAudio.pause();currentAudio.onended=null;currentAudio=null;} };

    // ============================================================================
    // UI Functions & Data Fetch
    // ============================================================================
    const showBlackout=()=>$('#blackout-overlay').fadeIn(500); const hideBlackout=()=>$('#blackout-overlay').fadeOut(500);
    
    // --- Action Overlay ---
    const $actionOverlay = $('#action-overlay');
    const $actionOverlayBody = $('#action-overlay-body');
    function showActionOverlay(htmlContent) { $actionOverlayBody.html(htmlContent); $actionOverlay.css('display', 'flex'); }
    function hideActionOverlay() { $actionOverlay.hide(); $actionOverlayBody.empty(); }
    $('.action-overlay-close').on('click', hideActionOverlay);

    const fetchWeather = () => $.get('/api/weather', (d) => { if(d.today){ $('#today-weather .data').text(`${d.today.weather} ${d.today.temperature}℃ / ${d.today.pop}%`); $('#today-weather .info-item-body i').removeClass().addClass(`fas ${d.today.icon}`);} if(d.tomorrow){ $('#tomorrow-weather .data').text(`${d.tomorrow.weather} ${d.tomorrow.temperature}℃ / ${d.tomorrow.pop}%`); $('#tomorrow-weather .info-item-body i').removeClass().addClass(`fas ${d.tomorrow.icon}`);} });
    const fetchFinanceData = () => $.get('/api/finance/summary', (d) => { $('#total-balance .data').text(`¥${d.balance?.toLocaleString()||'N/A'}`); $('#monthly-expense .data').text(`¥${d.monthly_expense?.toLocaleString()||'N/A'}`); });
    const fetchCalendarData = () => {const n=new Date(),s=new Date(n.getFullYear(),n.getMonth(),n.getDate(),0,0,0),e=new Date(s.getTime()+7*24*60*60*1000); $.get(`/api/local_calendar/events?start=${s.toISOString()}&end=${e.toISOString()}`,(evts)=>{const $l=$('#schedule-list').empty();if(evts?.length){const uE=evts.map(e=>({...e,startTime:new Date(e.start_time)})).filter(e=>e.startTime>=n).sort((a,b)=>a.startTime-b.startTime).slice(0,4);if(uE.length){uE.forEach(e=>{const sT=e.startTime.toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'});let dL='';if(e.startTime.getDate()===n.getDate())dL='今日';else if(e.startTime.getDate()===n.getDate()+1)dL='明日';else dL=e.startTime.toLocaleDateString('ja-JP',{month:'short',day:'numeric'});const tS=`${dL} ${sT}`;$l.append(`<li><span class="schedule-time">${tS}</span><span class="schedule-title">${e.title}</span></li>`);});}else{$l.append('<li><span class="schedule-title">直近の予定はありません</span></li>');}}else{$l.append('<li><span class="schedule-title">予定はありません</span></li>');}}).fail(()=>{$('#schedule-list').empty().append('<li><span class="schedule-title">予定の取得に失敗</span></li>');});};
    const fetchAlarms = () => $.get('/api/custom_orders',(ords)=>{const $aL=$('#field-time-alarm .alarm-list ul').empty();let c=0;if(ords?.length){ords.forEach(o=>{if(c>=4)return;const t=o.triggers?.[0];if(t?.category==='時間'){$aL.append(`<li><span>${t.value?.time||'N/A'}</span> - ${o.name||'無題'}</li>`);c++;}});if(c===0)$aL.append('<li>アラームはありません</li>');}});
    const updateTime = () => { const n=new Date(); $('#current-time').text(n.toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit',second:'2-digit'})); $('#current-date').text(n.toLocaleDateString('ja-JP',{year:'numeric',month:'long',day:'numeric',weekday:'long'})); };

    // ============================================================================
    // 実行
    // ============================================================================
    function run() {
        loadAppSettings();
        loadCustomVoiceTriggerEndWords();
        updateTime(); setInterval(updateTime, 1000);
        const fetchData = () => { fetchWeather(); fetchFinanceData(); fetchCalendarData(); fetchAlarms(); };
        fetchData(); setInterval(fetchData, 300000);
        initializeVoiceRecognition();
    }
    run();
});
