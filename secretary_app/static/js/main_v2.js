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
            let interim = '', final = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) final += event.results[i][0].transcript;
                else interim += event.results[i][0].transcript;
            }

            if (currentMode === 'waiting') {
                const transcript = interim || final;
                if (WAKE_WORDS.some(w => transcript.toLowerCase().includes(w.toLowerCase()))) {
                    finalTranscript = transcript;
                    setMode('listening');
                    return;
                }
                if (interim) updateLogDisplay(interim, 'user', true, true);
            } else if (currentMode === 'listening') {
                finalTranscript = mergeRecognizedCommandSegments(finalTranscript, final || interim);
                updateLogDisplay(finalTranscript, 'user', true);
                if (final) {
                    const endWordMatch = findEndWordMatch(finalTranscript);
                    clearTimeout(pendingFinalDispatchTimerId);
                    if (endWordMatch) {
                        dispatchVoiceCommand(finalTranscript, endWordMatch.word);
                    } else {
                        pendingFinalDispatchTimerId = setTimeout(() => dispatchVoiceCommand(finalTranscript), FINAL_SEGMENT_WAIT_MS);
                    }
                }
            }
        };
    }
    
    // ============================================================================
    // コマンド処理
    // ============================================================================
    function dispatchVoiceCommand(text, endWord = null) {
        const command = sanitizeVoiceCommand(text, endWord);
        setMode('processing');
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
        (payload.actions || []).forEach(action => {
            switch (`${action.category}-${action.sub}`) {
                case '画面-ブラックアウト': action.detail?.state === 'on' ? showBlackout() : hideBlackout(); break;
                case '音声-再生': if (action.detail?.message) playTTS(action.detail.message, () => setMode('waiting')); break;
                case 'youtube-再生': if (action.detail?.query) window.playYoutubeVideo(action.detail.query); break;
                case 'youtube-操作': if (action.detail?.intent) window.executeYoutubeIntent(action.detail); break;
            }
        });
    }

    // ============================================================================
    // ヘルパー
    // ============================================================================
    function setMode(newMode, text = '') {
        currentMode = newMode;
        const $micStatus = $('#mic-status').removeClass();
        const $micIcon = $micStatus.find('i').removeClass();
        const statusMap = {
            waiting:    { text: '音声待機中',   icon: 'fa-microphone-slash', class: 'waiting' },
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
        if (newMode !== 'listening') clearTimeout(recognitionTimeoutId);
        else {
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
    const sanitizeVoiceCommand = (t, eW) => { let c = stripLeadingWakeWords(t); if(eW) c = c.replace(new RegExp(escapeRegExp(eW),'gi'), ''); return c.replace(/[、。！？!?\s]+$/g,'').trim(); };
    const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const stripLeadingWakeWords = (t) => { let n = (t||'').trim(); WAKE_WORDS.sort((a,b)=>b.length-a.length).forEach(w => { if(n.toLowerCase().startsWith(w.toLowerCase())) n = n.slice(w.length).trim(); }); return n; };
    const mergeRecognizedCommandSegments = (p, n) => !p ? n : (!n ? p : (n.includes(p) ? n : (p.includes(n) ? p : `${p} ${n}`.trim())));
    const findEndWordMatch = (t) => { const c = stripLeadingWakeWords(t); for(const g of customTriggerAndWordGroups) if(g.every(w => c.includes(w))) return {word: g.join(' & ')}; for(const w of END_WORDS) if(c.includes(w)) return {word: w}; return null; };
    const shouldSuppressDuplicate = (c) => { const k = c.replace(/[、。！？!?]/g,' ').toLowerCase().replace(/\s+/g,' ').trim(), n=Date.now(); if(k&&k===lastDispatchedVoiceCommandKey&&(n-lastDispatchedVoiceCommandAt)<DUPLICATE_SUPPRESS_MS) return true; lastDispatchedVoiceCommandKey=k; lastDispatchedVoiceCommandAt=n; return false; };

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
    const playTTS = (text, onEnd) => { stopTTS(); setMode('speaking'); $.ajax({ url: '/api/tts', type: 'POST', contentType:'application/json', data:JSON.stringify({text}), success:(r)=>{ if(r.audioContent){ currentAudio=new Audio(`data:audio/mp3;base64,${r.audioContent}`); currentAudio.play().catch(()=>{if(onEnd)onEnd();}); currentAudio.onended=()=>{currentAudio=null;if(onEnd)onEnd();}; }else{if(onEnd)onEnd();}}, error:()=>{if(onEnd)onEnd();}});};
    const stopTTS = () => { if(currentAudio){currentAudio.pause();currentAudio.onended=null;currentAudio=null;} };

    // ============================================================================
    // UI Functions & Data Fetch
    // ============================================================================
    const showBlackout=()=>$('#blackout-overlay').fadeIn(500); const hideBlackout=()=>$('#blackout-overlay').fadeOut(500);
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
