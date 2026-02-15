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
            if (wakeWordsRaw) {
                WAKE_WORDS = wakeWordsRaw.split(',').map(w => w.trim()).filter(Boolean);
            }
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
    
    async function loadCustomVoiceTriggerEndWords() {
        try {
            const res = await fetch('/api/custom_orders');
            if (!res.ok) return;
            const orders = await res.json();
            if (!Array.isArray(orders)) return;
            // Simplified logic to extract end words
            const words = orders.flatMap(o => o.triggers?.filter(t => t.category === 'ボイス').flatMap(t => (t.value?.keywords || []).flat()) || []);
            customTriggerEndWords = Array.from(new Set(words.map(w => String(w).trim()).filter(Boolean)));
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
             setMode('permission_required', 'クリックしてマイクを有効化');
             $(document).one('click', function() {
                 userInteracted = true;
                 setMode('waiting');
                 try { recognition.start(); } catch(e) { console.error("Recognition start failed:", e); }
             });
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
        recognition.onend = () => {
            isRecognitionActive = false;
            setTimeout(() => { if(!isRecognitionActive) try { recognition.start(); } catch(e) {} }, 1000);
        };
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
                    // モードを切り替えたら、このイベントでの処理は終了する
                    return; 
                } else if (interim) {
                    updateLogDisplay(interim, 'user', true, true);
                }
            } else if (currentMode === 'listening') {
                finalTranscript = mergeRecognizedCommandSegments(finalTranscript, final || interim);
                updateLogDisplay(finalTranscript, 'user', true);
                if (final) {
                    const endWordMatch = findEndWordMatch(finalTranscript);
                    if (endWordMatch) {
                        clearTimeout(pendingFinalDispatchTimerId);
                        dispatchVoiceCommand(finalTranscript, endWordMatch.word);
                        return;
                    }
                    clearTimeout(pendingFinalDispatchTimerId);
                    pendingFinalDispatchTimerId = setTimeout(() => dispatchVoiceCommand(finalTranscript), FINAL_SEGMENT_WAIT_MS);
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
        
        // 復唱
        const repeatText = `${command}ですね。`;
        updateLogDisplay(repeatText, 'assistant');
        playTTS(repeatText, () => {
            // 復唱が終わってからサーバーに送信
            sendTextToServer(command);
        });
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
            url: '/web_api/chat',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ inputValue: text }),
            success: handleServerResponse,
            error: () => { setMode('cooldown'); updateLogDisplay('サーバー通信失敗', 'assistant'); }
        });
    }

    function handleServerResponse(response) {
        setMode('cooldown');
        if (response.message) {
            updateLogDisplay(response.message, 'assistant');
            if (!response.suppress_tts) playTTS(response.message);
        }
        if (response.triggered_by_voice && response.order_payloads) {
            response.order_payloads.forEach(handleServerCommand);
        }
    }
    
    function handleServerCommand(payload) {
        (payload.actions || []).forEach(action => {
            switch (`${action.category}-${action.sub}`) {
                case '画面-ブラックアウト': action.detail?.state === 'on' ? showBlackout() : hideBlackout(); break;
                case '音声-再生': if (action.detail?.message) playTTS(action.detail.message); break;
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
        const $micStatus = $('#mic-status').removeClass('listening processing cooldown');
        const $micIcon = $micStatus.find('i').removeClass();
        const statusMap = {
            listening: { text: '命令中...', icon: 'fa-microphone', class: 'listening' },
            processing: { text: '処理中...', icon: 'fa-cogs', class: 'processing' },
            cooldown: { text: 'クールダウン中', icon: 'fa-history', class: 'cooldown' },
            waiting: { text: '音声読み取り中', icon: 'fa-microphone-slash' },
            permission_required: { text: 'クリックしてマイクを有効化', icon: 'fa-microphone-slash' },
            error: { text: text || 'エラー', icon: 'fa-exclamation-triangle' }
        };
        const status = statusMap[newMode] || statusMap.error;
        $('#mic-status-text').text(text || status.text);
        $micIcon.addClass(`fas ${status.icon}`);
        if(status.class) $micStatus.addClass(status.class);

        if (newMode !== 'listening') clearTimeout(recognitionTimeoutId);
    }

    function updateLogDisplay(message, sender, isInterim = false, isWaitingLog = false) {
        const $logDisplay = $('#log-display');
        const logClass = isWaitingLog ? 'log-waiting' : (isInterim ? 'log-interim' : '');
        const lastMsg = $logDisplay.children().last();
        
        // ハイライト処理
        let displayMsg = message;
        if(sender === 'user' && (isInterim || isWaitingLog)) {
             displayMsg = highlightWords(message, WAKE_WORDS, 'highlight-wake-word');
             displayMsg = highlightWords(displayMsg, END_WORDS, 'highlight-end-word');
        }

        if (isInterim || isWaitingLog) {
            if (lastMsg.hasClass('log-interim') || lastMsg.hasClass('log-waiting')) {
                 lastMsg.html(displayMsg);
            } else {
                 $logDisplay.append(`<div class="log-message ${sender} ${logClass}">${displayMsg}</div>`);
            }
        } else {
            $logDisplay.find('.log-interim, .log-waiting').remove();
            $logDisplay.append(`<div class="log-message ${sender}">${displayMsg}</div>`);
        }
        $logDisplay.scrollTop($logDisplay.prop("scrollHeight"));
    }
    
    function highlightWords(text, words, className) {
        let highlightedText = text;
        words.forEach(word => {
            highlightedText = highlightedText.replace(new RegExp(escapeRegExp(word), 'gi'), `<span class="${className}">${word}</span>`);
        });
        return highlightedText;
    }

    function sanitizeVoiceCommand(text, endWord) {
        let command = stripLeadingWakeWords(text);
        if (endWord) { // エンドワードが指定されていればそれだけ除く
             command = command.replace(new RegExp(escapeRegExp(endWord), 'gi'), '');
        }
        return command.replace(/[、。！？!?\s]+$/g, '').trim();
    }
    
    const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const stripLeadingWakeWords = (t) => { let n = t.trim(); WAKE_WORDS.sort((a,b)=>b.length-a.length).forEach(w => { if(n.toLowerCase().startsWith(w.toLowerCase())) n = n.slice(w.length).trim(); }); return n; };
    const mergeRecognizedCommandSegments = (p, n) => !p ? n : (!n ? p : (n.includes(p) ? n : (p.includes(n) ? p : `${p} ${n}`.trim())));
    const findEndWordMatch = (t) => { const c = stripLeadingWakeWords(t); for (const w of END_WORDS) { if (c.includes(w)) return {word: w}; } return null; };
    const shouldSuppressDuplicate = (c) => { const k = c.replace(/[、。！？!?]/g,' ').toLowerCase().replace(/\s+/g,' ').trim(), n = Date.now(); if(k === lastDispatchedVoiceCommandKey && (n-lastDispatchedVoiceCommandAt)<DUPLICATE_SUPPRESS_MS) return true; lastDispatchedVoiceCommandKey=k; lastDispatchedVoiceCommandAt=n; return false; };

    // ============================================================================
    // UIイベント
    // ============================================================================
    $('#send-button').on('click', () => { const t = $('#text-input').val(); if (t) { sendTextToServer(t); $('#text-input').val(''); } });
    $('#text-input').on('keypress', (e) => { if (e.which === 13) $('#send-button').click(); });
    
    let isPlayingMusic = false;
    $('#play-pause-track').on('click', function() {
        const $icon = $(this).find('i');
        if (window.executeYoutubeIntent({ intent: isPlayingMusic ? 'pause' : 'resume' })) {
            isPlayingMusic = !isPlayingMusic;
        } else {
             $.get('/api/playlist/playplan', (plan) => { if(plan?.tracks?.length) { window.playYoutubeTrackList(plan.tracks); isPlayingMusic = true; }});
        }
        $icon.toggleClass('fa-play fa-pause', isPlayingMusic);
    });
    $('#next-track').on('click', () => window.executeYoutubeIntent({ intent: 'next' }));
    $('#prev-track').on('click', () => window.executeYoutubeIntent({ intent: 'prev' }));
    $('#volume-slider').on('input', function() { window.executeYoutubeIntent({ intent: 'set_volume', amount: $(this).val() }); });

    // ============================================================================
    // TTS
    // ============================================================================
    const playTTS = (text, onEndCallback = null) => {
        stopTTS();
        $.ajax({
            url: '/api/tts',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ text }),
            success: (r) => {
                if (r.audioContent) {
                    currentAudio = new Audio(`data:audio/mp3;base64,${r.audioContent}`);
                    currentAudio.play().catch(() => {
                        if(onEndCallback) onEndCallback();
                    });
                    currentAudio.onended = () => {
                        currentAudio = null;
                        if(onEndCallback) onEndCallback();
                    };
                } else {
                     if(onEndCallback) onEndCallback();
                }
            },
            error: (e) => {
                console.error(e);
                if(onEndCallback) onEndCallback();
            }
        });
    };
    const stopTTS = () => { if (currentAudio) { currentAudio.pause(); currentAudio = null; } };

    // ============================================================================
    // UI Functions & Data Fetch
    // ============================================================================
    const showBlackout = () => $('#blackout-overlay').fadeIn(500);
    const hideBlackout = () => $('#blackout-overlay').fadeOut(500);
    const fetchWeather = () => $.get('/api/weather', (d) => { if(d.today){ $('#today-weather .data').text(`${d.today.weather} ${d.today.temperature}℃ / ${d.today.pop}%`); $('#today-weather .info-item-body i').removeClass().addClass(`fas ${d.today.icon}`);} if(d.tomorrow){ $('#tomorrow-weather .data').text(`${d.tomorrow.weather} ${d.tomorrow.temperature}℃ / ${d.tomorrow.pop}%`); $('#tomorrow-weather .info-item-body i').removeClass().addClass(`fas ${d.tomorrow.icon}`);} });
    const fetchFinanceData = () => $.get('/api/finance/summary', (d) => { $('#total-balance .data').text(`¥${d.balance?.toLocaleString()||'N/A'}`); $('#monthly-expense .data').text(`¥${d.monthly_expense?.toLocaleString()||'N/A'}`); });
    const fetchCalendarData = () => {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days later

        $.get(`/api/local_calendar/events?start=${start.toISOString()}&end=${end.toISOString()}`, (events) => {
            const $list = $('#schedule-list').empty();
            if (events && events.length > 0) {
                const upcomingEvents = events
                    .map(e => ({ ...e, startTime: new Date(e.start_time) }))
                    .filter(e => e.startTime >= now) // Keep only future events
                    .sort((a, b) => a.startTime - b.startTime)
                    .slice(0, 4); // Get the next 4

                if (upcomingEvents.length > 0) {
                    upcomingEvents.forEach(event => {
                        const sT = event.startTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
                        let dateLabel = '';
                        if (event.startTime.getDate() === now.getDate()) {
                            dateLabel = '今日';
                        } else if (event.startTime.getDate() === now.getDate() + 1) {
                            dateLabel = '明日';
                        } else {
                            dateLabel = event.startTime.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
                        }

                        const timeString = `${dateLabel} ${sT}`;
                        $list.append(`<li><span class="schedule-time">${timeString}</span><span class="schedule-title">${event.title}</span></li>`);
                    });
                } else {
                    $list.append('<li><span class="schedule-title">直近の予定はありません</span></li>');
                }
            } else {
                $list.append('<li><span class="schedule-title">予定はありません</span></li>');
            }
        }).fail(() => {
            $('#schedule-list').empty().append('<li><span class="schedule-title">予定の取得に失敗</span></li>');
        });
    };
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
