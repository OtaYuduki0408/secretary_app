// main_v2.js

$(document).ready(function() {
    // ============================================================================
    // グローバル変数と定数 (from voice_recognition.js)
    // ============================================================================
    let WAKE_WORDS = ['サイレントメイト', 'ぼいすめいと', 'voicemate'];
    const DEFAULT_END_WORDS = ['命令完了'];
    let END_WORDS = [...DEFAULT_END_WORDS];
    let settingsEndWords = [...DEFAULT_END_WORDS];
    let customTriggerEndWords = [];
    let customTriggerAndWordGroups = [];

    let recognition; // SpeechRecognitionインスタンス
    let currentMode = 'waiting'; // 'waiting' or 'listening'
    let recognitionTimeoutId; // 音声入力タイムアウトのID
    let isRecognitionActive = false;
    let finalTranscript = ''; // 最終的な音声認識結果
    
    // 重複送信防止・ノイズ対策
    let submissionLock = false;
    const DUPLICATE_SUPPRESS_MS = 5000;
    const FINAL_SEGMENT_WAIT_MS = 800; // isFinal後の待機時間
    const DISPATCH_COOLDOWN_MS = 2000;
    let lastDispatchedVoiceCommandKey = '';
    let lastDispatchedVoiceCommandAt = 0;
    let pendingFinalDispatchTimerId = null;

    let userInteracted = false;
    
    // TTS
    let currentAudio = null;

    // ============================================================================
    // 初期化処理
    // ============================================================================

    // --- 設定読み込み ---
    function loadAppSettings() {
        try {
            const raw = localStorage.getItem('appSettings');
            if (!raw) return;
            const settings = JSON.parse(raw);
            const wakeWordsRaw = settings?.main?.wakeWords || '';
            if (wakeWordsRaw) {
                const words = wakeWordsRaw.split(',').map(word => word.trim()).filter(Boolean);
                if (words.length > 0) WAKE_WORDS = words;
            }
            settingsEndWords = parseEndWords(settings?.main?.endWord || '命令完了');
            rebuildEffectiveEndWords();
        } catch (e) {
            console.warn('アプリ設定の読み込みに失敗', e);
        }
    }

    function parseEndWords(rawEndWords) {
        if (typeof rawEndWords !== 'string') return [...DEFAULT_END_WORDS];
        const parsed = rawEndWords.split(',').map(word => word.trim()).filter(Boolean);
        return parsed.length > 0 ? parsed : [...DEFAULT_END_WORDS];
    }
    
    function rebuildEffectiveEndWords() {
        const uniqueWords = new Set([...DEFAULT_END_WORDS, ...settingsEndWords, ...customTriggerEndWords]);
        END_WORDS = Array.from(uniqueWords);
    }
    
    async function loadCustomVoiceTriggerEndWords() {
        try {
            const response = await fetch('/api/custom_orders');
            if (!response.ok) return;
            const orders = await response.json();
            if (!Array.isArray(orders)) return;

            const collectedWords = [];
            const collectedAndGroups = [];
            orders.forEach(order => {
                const { words, andGroups } = extractVoiceTriggerEndWordsFromOrder(order);
                collectedWords.push(...words);
                collectedAndGroups.push(...andGroups);
            });

            customTriggerEndWords = Array.from(new Set(collectedWords));
            customTriggerAndWordGroups = collectedAndGroups; // Assuming structure is already unique
            rebuildEffectiveEndWords();
        } catch (error) {
            console.warn('カスタム命令の読み込みに失敗', error);
        }
    }

    // --- 音声認識の初期化 ---
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'ja-JP';
        setupRecognitionHandlers();
    } else {
        console.error("Web Speech API はこのブラウザでサポートされていません。");
        $('#mic-status-text').text('非対応ブラウザ');
    }
    
    function initializeVoiceRecognition() {
        if (!recognition) return;
        if (isRecognitionActive) return;
        
        // ユーザーインタラクションを待つ
        if (!userInteracted) {
             $('#mic-status-text').text('クリックして開始');
             $('#mic-status').one('click', function() {
                 userInteracted = true;
                 $(this).off('click');
                 initializeVoiceRecognition();
             });
             return;
        }

        console.log("音声認識を開始します。");
        setMode('waiting');
        try {
            recognition.start();
        } catch (e) {
            console.error("認識開始に失敗", e);
        }
    }

    // ============================================================================
    // 音声認識イベントハンドラ
    // ============================================================================
    function setupRecognitionHandlers() {
        recognition.onstart = () => {
            isRecognitionActive = true;
            console.log("Recognition started.");
        };

        recognition.onend = () => {
            isRecognitionActive = false;
            console.log("Recognition ended. Restarting in 1s...");
            // 意図しない停止後、1秒後に再起動
            setTimeout(() => {
                if(!isRecognitionActive) {
                    try { recognition.start(); } catch(e) {}
                }
            }, 1000);
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
             if (event.error === 'no-speech') {
                setMode('waiting');
            }
        };

        recognition.onresult = (event) => {
            let interimTranscript = '';
            let latestFinalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    latestFinalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }

            // モードに応じた処理
            if (currentMode === 'waiting') {
                const transcript = interimTranscript || latestFinalTranscript;
                const wakeWordFound = WAKE_WORDS.some(word => transcript.toLowerCase().includes(word.toLowerCase()));
                if (wakeWordFound) {
                    console.log("ウェイクワードを検知！");
                    finalTranscript = transcript;
                    setMode('listening');
                }
                 // 待機中もログ表示
                if(interimTranscript){
                    updateLogDisplay(interimTranscript, 'user', true, true);
                }

            } else if (currentMode === 'listening') {
                finalTranscript = mergeRecognizedCommandSegments(finalTranscript, latestFinalTranscript || interimTranscript);
                updateLogDisplay(finalTranscript, 'user', true);

                if (latestFinalTranscript) {
                     // エンドワードをチェック
                    const endWordMatch = findEndWordMatch(finalTranscript);
                    if(endWordMatch){
                        console.log(`エンドワード「${endWordMatch.word}」を検知。`);
                        clearTimeout(pendingFinalDispatchTimerId);
                        dispatchVoiceCommand(finalTranscript);
                        return;
                    }
                    
                    // isFinalの後の追記を待つタイマー
                    clearTimeout(pendingFinalDispatchTimerId);
                    pendingFinalDispatchTimerId = setTimeout(() => {
                        dispatchVoiceCommand(finalTranscript);
                    }, FINAL_SEGMENT_WAIT_MS);
                }
            }
        };
    }
    
    // ============================================================================
    // コマンド処理・送信
    // ============================================================================

    function dispatchVoiceCommand(text) {
        const command = sanitizeVoiceCommand(text);
        if (!command) {
            console.log("空のコマンドのため送信を中止");
            setMode('waiting');
            return;
        }

        if(shouldSuppressDuplicate(command)){
            console.log("重複コマンドのため送信を抑制");
            setMode('waiting');
            return;
        }

        sendTextToServer(command);
        setMode('waiting');
    }

    function sendTextToServer(text) {
        if (!text || submissionLock) return;
        
        submissionLock = true;
        setTimeout(() => { submissionLock = false; }, DISPATCH_COOLDOWN_MS);

        updateLogDisplay(text, 'user', false);
        
        // ウェイクワードのみの入力はTTS停止
        if (WAKE_WORDS.includes(text.trim())) {
            stopTTS();
            return;
        }

        $.ajax({
            url: '/web_api/chat',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ inputValue: text }),
            success: handleServerResponse,
            error: (xhr) => {
                console.error('サーバー通信エラー:', xhr.responseText);
                updateLogDisplay('サーバーとの通信に失敗しました。', 'assistant');
            }
        });
    }

    function handleServerResponse(response) {
        console.log('Server response:', response);
        if (response.triggered_by_voice && response.order_payloads) {
            response.order_payloads.forEach(handleServerCommand);
            return;
        }
        if (response.message) {
            updateLogDisplay(response.message, 'assistant');
            if (!response.suppress_tts) {
                playTTS(response.message);
            }
        }
    }
    
    function handleServerCommand(payload) {
        const actions = payload.actions || (payload.steps ? payload.steps.map(s => s.action).filter(Boolean) : []);
        actions.forEach(action => {
            if (action.category === '画面' && action.sub === 'ブラックアウト') {
                action.detail?.state === 'on' ? showBlackout() : hideBlackout();
            } else if (action.category === '音声' && action.sub === '再生') {
                if (action.detail?.message) playTTS(action.detail.message);
            } else if (action.category === 'youtube' && action.sub === '再生') {
                if (action.detail?.query) window.playYoutubeVideo(action.detail.query);
            } else if (action.category === 'youtube' && action.sub === '操作') {
                if (action.detail?.intent) window.executeYoutubeIntent(action.detail);
            }
        });
    }


    // ============================================================================
    // ヘルパー関数 (from voice_recognition.js)
    // ============================================================================
    
    function setMode(newMode) {
        if (currentMode === newMode) return;
        console.log(`モード変更: ${currentMode} -> ${newMode}`);
        currentMode = newMode;
        
        const $micStatus = $('#mic-status');
        const $micIcon = $micStatus.find('i');
        const $micText = $('#mic-status-text');

        if (newMode === 'listening') {
            finalTranscript = ''; // リスニング開始時にリセット
            $micStatus.addClass('listening');
            $micIcon.removeClass('fa-microphone-slash').addClass('fa-microphone');
            $micText.text('認識中...');
            
            // 10秒後にタイムアウト
            clearTimeout(recognitionTimeoutId);
            recognitionTimeoutId = setTimeout(() => {
                if(currentMode === 'listening'){
                    console.log("入力タイムアウト。待機モードに戻ります。");
                    dispatchVoiceCommand(finalTranscript); // タイムアウト時点の内容で送信
                }
            }, 10000);

        } else { // waiting
            finalTranscript = '';
            $micStatus.removeClass('listening');
            $micIcon.removeClass('fa-microphone').addClass('fa-microphone-slash');
            $micText.text('待機中...');
            clearTimeout(recognitionTimeoutId);
        }
    }

    function updateLogDisplay(message, sender, isInterim = false, isWaitingLog = false) {
        const $logDisplay = $('#log-display');
        
        if (isInterim) {
            let $lastMsg = $logDisplay.children().last();
            const logClass = isWaitingLog ? 'log-waiting' : 'log-interim';

            if ($lastMsg.hasClass(logClass) || $lastMsg.hasClass('log-interim')) {
                 $lastMsg.html(highlightWakeWords(message)); // ハイライト処理を追加
            } else {
                 $logDisplay.append(`<div class="log-message ${sender} ${logClass}">${highlightWakeWords(message)}</div>`);
            }
        } else {
            $logDisplay.find('.log-interim, .log-waiting').remove();
            $logDisplay.append(`<div class="log-message ${sender}">${message}</div>`);
        }
        $logDisplay.scrollTop($logDisplay.prop("scrollHeight"));
    }
    
    function escapeRegExp(text) {
        return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function stripLeadingWakeWords(text) {
        let normalized = (text || '').trim();
        const wakeWordsByLength = [...WAKE_WORDS].sort((a, b) => b.length - a.length);
        wakeWordsByLength.forEach(word => {
            if (normalized.toLowerCase().startsWith(word.toLowerCase())) {
                normalized = normalized.slice(word.length).trim();
            }
        });
        return normalized;
    }
    
    function sanitizeVoiceCommand(text) {
        let command = stripLeadingWakeWords(text);
        END_WORDS.forEach(word => {
            command = command.replace(new RegExp(escapeRegExp(word), 'gi'), '');
        });
        return command.replace(/[、。！？!?\s]+$/g, '').trim();
    }
    
    function shouldSuppressDuplicate(commandText) {
        const key = commandText.replace(/[、。！？!?]/g, ' ').toLowerCase().replace(/\s+/g, ' ').trim();
        const now = Date.now();
        if (key === lastDispatchedVoiceCommandKey && (now - lastDispatchedVoiceCommandAt) < DUPLICATE_SUPPRESS_MS) {
            return true;
        }
        lastDispatchedVoiceCommandKey = key;
        lastDispatchedVoiceCommandAt = now;
        return false;
    }

    function mergeRecognizedCommandSegments(prev, next) {
        if (!prev) return next;
        if (!next) return prev;
        if (next.includes(prev)) return next;
        if (prev.includes(next)) return prev;
        return `${prev} ${next}`.trim();
    }
    
    function findEndWordMatch(text) {
        const commandOnly = stripLeadingWakeWords(text);
        return END_WORDS.find(word => commandOnly.includes(word));
    }
    
    // (Other helper functions from voice_recognition.js can be pasted here if needed)
    
    // ============================================================================
    // UIイベントハンドラ
    // ============================================================================
    $('#send-button').on('click', function() {
        const text = $('#text-input').val();
        if (text) {
            sendTextToServer(text);
            $('#text-input').val('');
        }
    });

    $('#text-input').on('keypress', function(e) {
        if (e.which === 13) $('#send-button').click();
    });

    // --- Music Player Handlers ---
    let isPlayingMusic = false;
    const $playPauseBtn = $('#play-pause-track');
    const $playPauseIcon = $playPauseBtn.find('i');

    $playPauseBtn.on('click', function() {
        if (isPlayingMusic) {
            window.executeYoutubeIntent({ intent: 'pause' });
            $playPauseIcon.removeClass('fa-pause').addClass('fa-play');
            isPlayingMusic = false;
        } else {
            // Try to resume first
            if(window.executeYoutubeIntent({ intent: 'resume' })){
                $playPauseIcon.removeClass('fa-play').addClass('fa-pause');
                isPlayingMusic = true;
                return;
            }
            // Fetch playlist and play
            $.get('/api/playlist/playplan', function(plan) {
                if (plan && plan.tracks && plan.tracks.length > 0) {
                    window.playYoutubeTrackList(plan.tracks, { random: plan.order === 'random' });
                    $playPauseIcon.removeClass('fa-play').addClass('fa-pause');
                    isPlayingMusic = true;
                } else {
                    console.warn("プレイリストが空か、取得に失敗しました。");
                }
            });
        }
    });
    
    $('#next-track').on('click', () => window.executeYoutubeIntent({ intent: 'next' }));
    $('#prev-track').on('click', () => window.executeYoutubeIntent({ intent: 'prev' }));
    
    $('#volume-slider').on('input', function() {
        const volume = $(this).val();
        window.executeYoutubeIntent({ intent: 'set_volume', amount: volume });
    });


    // ============================================================================
    // TTS (Text-to-Speech)
    // ============================================================================
    function playTTS(text) {
        stopTTS();
        $.ajax({
            url: '/api/tts',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ text: text }),
            success: (response) => {
                if (response.audioContent) {
                    currentAudio = new Audio(`data:audio/mp3;base64,${response.audioContent}`);
                    currentAudio.play();
                    currentAudio.onended = () => { currentAudio = null; };
                }
            },
            error: (xhr) => console.error('TTS生成失敗:', xhr.responseText)
        });
    }

    function stopTTS() {
        if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
        }
    }

    // ============================================================================
    // UI Functions
    // ============================================================================
    function showBlackout() { $('#blackout-overlay').fadeIn(500); }
    function hideBlackout() { $('#blackout-overlay').fadeOut(500); }
    
    // ============================================================================
    // データ取得関数
    // ============================================================================
    function fetchWeather() {
        $.get('/api/weather', function(data) {
            if (data.today) {
                $('#today-weather .info-item-body i').removeClass().addClass(`fas ${data.today.icon}`);
                const tempToday = data.today.temperature !== 'N/A' ? `${data.today.temperature}℃` : '';
                $('#today-weather .data').text(`${data.today.weather} ${tempToday}`);
            }
            if (data.tomorrow) {
                $('#tomorrow-weather .info-item-body i').removeClass().addClass(`fas ${data.tomorrow.icon}`);
                const tempTomorrow = data.tomorrow.temperature !== 'N/A' ? `${data.tomorrow.temperature}℃` : '';
                $('#tomorrow-weather .data').text(`${data.tomorrow.weather} ${tempTomorrow}`);
            }
        }).fail(() => console.error("天気の取得に失敗"));
    }

    function fetchFinanceData() {
        $.get('/api/finance/summary', function(data) {
            $('#total-balance .data').text(`¥${data.balance?.toLocaleString() || 'N/A'}`);
            $('#monthly-expense .data').text(`¥${data.monthly_expense?.toLocaleString() || 'N/A'}`);
        }).fail(() => console.error("収支の取得に失敗"));
    }

    function fetchCalendarData() {
        const today = new Date();
        const startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0).toISOString();
        const endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999).toISOString();
        $.get(`/api/local_calendar/events?start=${startDate}&end=${endDate}`, function(events) {
            const $scheduleList = $('#schedule-list').empty();
            if (events && events.length > 0) {
                events.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
                events.forEach(event => {
                    const startTime = new Date(event.start_time).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
                    const endTime = event.end_time ? new Date(event.end_time).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : null;
                    const timeString = endTime && startTime !== endTime ? `${startTime} - ${endTime}` : startTime;
                    $scheduleList.append(`<li><span class="schedule-time">${timeString}</span><span class="schedule-title">${event.title}</span></li>`);
                });
            } else {
                $scheduleList.append('<li><span class="schedule-title">今日の予定はありません</span></li>');
            }
        }).fail(() => $('#schedule-list').empty().append('<li><span class="schedule-title">予定の取得に失敗</span></li>'));
    }
    
    function fetchAlarms() {
        $.get('/api/custom_orders', function(orders) {
            const $alarmList = $('#field-time-alarm .alarm-list ul').empty();
            let alarmCount = 0;
            if (orders && orders.length > 0) {
                orders.forEach(order => {
                    if (alarmCount >= 4) return;
                    const trigger = order.triggers && order.triggers[0];
                    if (trigger && trigger.category === '時間') {
                        $alarmList.append(`<li><span>${trigger.value?.time || 'N/A'}</span> - ${order.name || '無題'}</li>`);
                        alarmCount++;
                    }
                });
            }
            if (alarmCount === 0) $alarmList.append('<li>アラームはありません</li>');
        }).fail(() => $('#field-time-alarm .alarm-list ul').empty().append('<li>アラーム取得失敗</li>'));
    }

    function updateTime() {
        const now = new Date();
        $('#current-time').text(now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        $('#current-date').text(now.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }));
    }

    // ============================================================================
    // 実行
    // ============================================================================
    function run() {
        loadAppSettings();
        loadCustomVoiceTriggerEndWords();
        
        updateTime();
        setInterval(updateTime, 1000);
        
        fetchWeather();
        fetchFinanceData();
        fetchCalendarData();
        fetchAlarms();
        
        setInterval(() => {
            fetchWeather();
            fetchFinanceData();
            fetchCalendarData();
            fetchAlarms();
        }, 300000); // 5 minutes
        
        initializeVoiceRecognition();
    }
    
    run();
});
