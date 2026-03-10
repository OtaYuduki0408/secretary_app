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
    let lastDispatchedVoiceCommandKey = '';
    let lastDispatchedVoiceCommandAt = 0;
    let pendingFinalDispatchTimerId = null;
    let lastSubmissionTime = 0;
    const SUBMISSION_COOLDOWN_MS = 3000;

    let userInteracted = false;
    let currentAudio = null;
    let ttsFallbackTimerId = null;
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

    document.addEventListener('app-settings:updated', loadAppSettings);

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
        const containsWakeWord = (text) => WAKE_WORDS.some(w => (text || '').toLowerCase().includes(w.toLowerCase()));
        const resetVoiceInputContext = () => {
            finalTranscript = '';
            clearTimeout(pendingFinalDispatchTimerId);
            updateLogDisplay('', 'user', true);
        };

        recognition.onstart = () => { isRecognitionActive = true; };
        recognition.onend = () => { isRecognitionActive = false; setTimeout(() => { if(!isRecognitionActive) try { recognition.start(); } catch(e) {} }, 1000); };
        recognition.onerror = (e) => { if (e.error === 'no-speech') setMode('waiting'); };
        recognition.onresult = (event) => {
            let interim_transcript = '';
            let event_final_transcript = '';

            // 直近イベント差分だけを処理し、過去フレーズの再混入を防ぐ
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    event_final_transcript += transcript;
                } else {
                    interim_transcript += transcript;
                }
            }

            if (event_final_transcript) {
                finalTranscript += event_final_transcript;
            }
            const display_transcript = finalTranscript + interim_transcript;
            console.log("[Voice Debug] Transcript:", display_transcript, "WakeWords:", WAKE_WORDS);

            if (currentMode === 'waiting' || currentMode === 'speaking') {
                if (containsWakeWord(display_transcript)) {
                    stopTTS(); // ★★★ TTSを最優先で停止
                    resetVoiceInputContext();
                    setMode('listening');
                    
                    const tailCommand = stripLeadingWakeWords(display_transcript).trim();
                    if (tailCommand) {
                        finalTranscript = tailCommand;
                        updateLogDisplay(finalTranscript, 'user', true);
                        
                        // タイマーロジックはlisteningモードのonresultに集約
                        // ここでは即時実行可能なエンドワードの場合のみディスパッチを試みる
                        const endWordMatch = findEndWordMatch(finalTranscript);
                        if (endWordMatch) {
                            dispatchVoiceCommand(finalTranscript, endWordMatch);
                        }
                    }
                    return; // listeningモードに遷移したので、この回の処理は終了
                }

                if (currentMode === 'waiting' && interim_transcript) {
                    updateLogDisplay(interim_transcript, 'user', true, true);
                }
            } else if (currentMode === 'listening') {
                const command_body = stripLeadingWakeWords(display_transcript);
                if (containsWakeWord(command_body)) {
                    resetVoiceInputContext();
                    setMode('listening');
                    return;
                }

                updateLogDisplay(command_body, 'user', true);
                
                // 常にタイマーをリセットし、発話が続く限り送信を延長する
                clearTimeout(pendingFinalDispatchTimerId);

                const command_to_dispatch = stripLeadingWakeWords(finalTranscript);
                const endWordMatch = findEndWordMatch(command_to_dispatch);
                
                if (endWordMatch) {
                    // エンドワードがあれば即時実行
                    dispatchVoiceCommand(command_to_dispatch, endWordMatch);
                } else if (finalTranscript) {
                    // 確定したテキストがあれば、タイマーをセット
                    pendingFinalDispatchTimerId = setTimeout(() => {
                        // タイマー発火時の最新のfinalTranscriptでディスパッチ
                        const latest_command = stripLeadingWakeWords(finalTranscript);
                        dispatchVoiceCommand(latest_command);
                    }, FINAL_SEGMENT_WAIT_MS);
                }
            }
        };
    }
    
    // ============================================================================
    // コマンド処理
    // ============================================================================
    function dispatchVoiceCommand(text, endWordMatch = null) {
        const now = Date.now();
        if (now - lastSubmissionTime < SUBMISSION_COOLDOWN_MS) {
            console.log("Submission cooldown active. Ignoring command.");
            return;
        }

        const isEndWordTrigger = !!endWordMatch;
        finalTranscript = '';
        clearTimeout(pendingFinalDispatchTimerId);
    
        let command = sanitizeVoiceCommand(text, endWordMatch);
        if (!command && endWordMatch && endWordMatch.source === 'custom') {
            command = endWordMatch.word;
        }
    
        if (!command) {
            setMode('waiting');
            return;
        }

        // ウェイクワード単体での呼び出しの場合、TTSを抑制し、何もせずに待機モードに戻る
        const isWakeWordOnly = WAKE_WORDS.some(w => command.toLowerCase() === w.toLowerCase());
        if (isWakeWordOnly) {
            console.log("Wake word only detected. Suppressing TTS and returning to waiting mode.");
            setMode('waiting');
            return;
        }
    
        if (!isEndWordTrigger && shouldSuppressDuplicate(command)) {
            setMode('waiting');
            return;
        }
        markDispatchedCommand(command);
        
        lastSubmissionTime = now;
        setMode('processing');
    
        sendTextToServer(command);

        const repeatText = `${command}ですね。`;
        updateLogDisplay(repeatText, 'assistant');
        playTTS(repeatText, null, { preserveMode: true });
    }

    function sendTextToServer(text) {
        if (submissionLock) return;

        console.log("Final command to server:", text);

        submissionLock = true;

        if(!finalTranscript) updateLogDisplay(text, 'user');
        const youtubeContext = (typeof window.getYoutubeContextState === 'function')
            ? window.getYoutubeContextState()
            : { active: false };
        
        $.ajax({
            url: '/web_api/chat',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ inputValue: text, youtubeContext }),
            success: handleServerResponse,
            error: () => {
                setMode('waiting');
                updateLogDisplay('サーバー通信失敗', 'assistant');
                if (typeof updateAllInfo === 'function') updateAllInfo();
            }
        }).always(() => {
            submissionLock = false;
        });
    }

    function handleServerResponse(response) {
        // YouTube検索再生
        if (response?.purpose === 'Yp' && response?.data?.search_query) {
            if (typeof window.playYoutubeVideo === 'function') {
                window.playYoutubeVideo(response.data.search_query);
            } else {
                updateLogDisplay('YouTubeプレーヤーが未初期化です。', 'assistant');
            }
            setMode('waiting');
            if (typeof updateAllInfo === 'function') updateAllInfo();
            return;
        }

        // YouTube操作（停止/次/前/音量等）
        if (response?.action === 'youtube_control' || response?.action === 'youtube_advanced') {
            if (typeof window.executeYoutubeIntent === 'function') {
                const handled = window.executeYoutubeIntent(response.data);
                if (!handled) updateLogDisplay('YouTube操作を実行できませんでした。', 'assistant');
            } else {
                updateLogDisplay('YouTubeプレーヤーが未初期化です。', 'assistant');
            }
            setMode('waiting');
            if (typeof updateAllInfo === 'function') updateAllInfo();
            return;
        }

        // プレイリスト再生要求
        if (response?.action === 'playlist_play_request' && response?.data) {
            $.ajax({
                url: '/api/playlist/playplan',
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify(response.data),
            }).done((plan) => {
                const videos = Array.isArray(plan?.videos) ? plan.videos : (Array.isArray(plan?.tracks) ? plan.tracks : []);
                if (videos.length === 0) {
                    updateLogDisplay('プレイリストに該当する曲がありません。', 'assistant');
                    return;
                }
                if (typeof window.playYoutubeTrackList === 'function') {
                    const started = window.playYoutubeTrackList(videos, { random: response?.data?.order === 'random' });
                    if (!started) updateLogDisplay('プレイリスト再生を開始できませんでした。', 'assistant');
                } else {
                    updateLogDisplay('YouTubeプレーヤーが未初期化です。', 'assistant');
                }
            }).fail(() => {
                updateLogDisplay('プレイリスト再生の準備に失敗しました。', 'assistant');
            }).always(() => {
                setMode('waiting');
                if (typeof updateAllInfo === 'function') updateAllInfo();
            });
            return;
        }

        if (response.triggered_by_voice && response.order_payloads) {
            response.order_payloads.forEach(handleServerCommand);
            setMode('waiting');
            if (typeof updateAllInfo === 'function') updateAllInfo();
        } else if (response.message) {
            updateLogDisplay(response.message, 'assistant');
            if (!response.suppress_tts) {
                // 返答読み上げ中も入力待機を維持
                setMode('waiting');
                playTTS(response.message, null, { preserveMode: true });
            } else {
                setMode('waiting');
            }
            if (typeof updateAllInfo === 'function') updateAllInfo();
        } else {
            setMode('waiting');
            if (typeof updateAllInfo === 'function') updateAllInfo();
        }
    }
    
    const playTTSPromise = (text) => {
        return new Promise(resolve => {
            updateLogDisplay(text, 'assistant');
            playTTS(text, resolve);
        });
    };

    function executeAction(action) {
        console.log("Executing action:", action); // デバッグ用ログ
        return new Promise(resolve => {
            if (!action) {
                resolve();
                return;
            }
            
            const { category, sub, detail } = action;
            const actionKey = `${category}-${sub}`;
    
            switch (actionKey) {
                case '音声-再生':
                case '発声-実行':
                case '特殊命令-目覚まし':
                    const messageToSpeak = detail?.message || detail?.text;
                    if (messageToSpeak) {
                        playTTSPromise(messageToSpeak).then(resolve);
                    } else {
                        resolve();
                    }
                    break;
    
                case 'SwitchBot-デバイス操作':
                    if (detail?.deviceId && detail?.action) {
                        $.ajax({
                            url: '/api/switchbot/control',
                            type: 'POST',
                            contentType: 'application/json',
                            data: JSON.stringify({ deviceId: detail.deviceId, action: detail.action }),
                        }).done((res) => {
                            const successMsg = `デバイス(${detail.deviceId.slice(-4)})の操作をリクエストしました。`;
                            updateLogDisplay(successMsg, 'assistant');
                        }).fail((err) => {
                            const errorMsg = `デバイス(${detail.deviceId.slice(-4)})の操作に失敗しました。`;
                            updateLogDisplay(errorMsg, 'assistant');
                        }).always(() => {
                            resolve();
                        });
                    } else {
                        resolve();
                    }
                    break;
    
                case '画面-ブラックアウト':
                    detail?.state === 'on' ? showBlackout() : hideBlackout();
                    resolve();
                    break;
    
                case 'カレンダー-読み上げ':
                    const calContent = createCalendarOverlayHTML(detail);
                    if (calContent) showActionOverlay(calContent);
                    if (detail?.summary) {
                        playTTSPromise(detail.summary).then(resolve);
                    } else {
                        resolve();
                    }
                    break;
    
                case '天気-読み上げ':
                    const weatherContent = createWeatherOverlayHTML(detail);
                    if (weatherContent) showActionOverlay(weatherContent);
                    if (detail?.message) {
                        playTTSPromise(detail.message).then(resolve);
                    } else {
                        resolve();
                    }
                    break;
    
                case 'youtube-再生':
                case 'Youtube-再生': {
                    const mode = String(detail?.mode || '').toLowerCase();
                    const queryOrUrl =
                        (mode === 'url' ? detail?.video_url : detail?.search_query)
                        || detail?.query
                        || detail?.video_url
                        || detail?.search_query;
                    if (queryOrUrl && typeof window.playYoutubeVideo === 'function') {
                        window.playYoutubeVideo(queryOrUrl);
                    } else {
                        updateLogDisplay('YouTube再生パラメータが不足しています。', 'assistant');
                    }
                    resolve();
                    break;
                }
                case 'youtube-操作':
                    if (detail?.intent && typeof window.executeYoutubeIntent === 'function') {
                        window.executeYoutubeIntent(detail);
                    }
                    resolve();
                    break;
                case 'Youtube-再開':
                    if (typeof window.executeYoutubeIntent === 'function') {
                        window.executeYoutubeIntent({ intent: 'resume', query: '' });
                    }
                    resolve();
                    break;
                case 'Youtube-一時停止':
                    if (typeof window.executeYoutubeIntent === 'function') {
                        window.executeYoutubeIntent({ intent: 'pause', query: '' });
                    }
                    resolve();
                    break;
                case 'Youtube-動画を進める':
                    if (typeof window.executeYoutubeIntent === 'function') {
                        window.executeYoutubeIntent({ intent: 'seek_forward', amount: detail?.seconds || 10 });
                    }
                    resolve();
                    break;
                case 'Youtube-動画を戻す':
                    if (typeof window.executeYoutubeIntent === 'function') {
                        window.executeYoutubeIntent({ intent: 'seek_backward', amount: detail?.seconds || 10 });
                    }
                    resolve();
                    break;
                case 'Youtube-音量を上げる':
                    if (typeof window.executeYoutubeIntent === 'function') {
                        window.executeYoutubeIntent({ intent: 'volume_up', amount: detail?.volume_step || 10 });
                    }
                    resolve();
                    break;
                case 'Youtube-音量を下げる':
                    if (typeof window.executeYoutubeIntent === 'function') {
                        window.executeYoutubeIntent({ intent: 'volume_down', amount: detail?.volume_step || 10 });
                    }
                    resolve();
                    break;
                
                default:
                    resolve();
            }
        });
    }

    async function handleServerCommand(payload) {
        const actionsToExecute = (payload.steps && payload.steps.length > 0)
            ? payload.steps.map(step => step.action).filter(Boolean)
            : (payload.actions || []);
    
        const isSequential = actionsToExecute.length > 1;
    
        if (isSequential) {
            setMode('processing');
            for (const action of actionsToExecute) {
                await executeAction(action);
            }
            setMode('waiting');
        } else {
            actionsToExecute.forEach(action => executeAction(action));
        }
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

    let lastLogDate = null;

    function updateLogDisplay(message, sender, isInterim = false, isWaitingLog = false) {
        const $logDisplay = $('#log-display');
        const $scrollContainer = $('#field-log .content');
        
        const now = new Date();
        const currentDate = now.toLocaleDateString('ja-JP');
    
        // 日付が変わったら区切り線を追加 (isInterimとisWaitingLogの場合は追加しない)
        if (lastLogDate === null) { // 初回ログの場合、現在の日付をセット
            lastLogDate = currentDate;
        } else if (currentDate !== lastLogDate && !isInterim && !isWaitingLog) {
            const dateString = now.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
            $logDisplay.append(`<div class="log-date-separator">------- ${dateString} -------</div>`);
            lastLogDate = currentDate;
        }
        
        // InterimやWaitingログはタイムスタンプ不要で、単純な表示
        if (isInterim || isWaitingLog) {
            const lastMsg = $logDisplay.children().last();
            let displayMsg = highlightWords(highlightWords(message, WAKE_WORDS, 'highlight-wake-word'), END_WORDS, 'highlight-end-word');
            const logClass = isWaitingLog ? 'log-waiting' : 'log-interim';
    
            if (lastMsg.hasClass('log-interim') || lastMsg.hasClass('log-waiting')) {
                lastMsg.html(displayMsg);
            } else {
                $logDisplay.append(`<div class="log-message ${sender} ${logClass}">${displayMsg}</div>`);
            }
        } else {
            // 通常ログにはタイムスタンプを追加
            $logDisplay.find('.log-interim, .log-waiting').remove();
            
            const timeString = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
            // メッセージをcontentとtimestampに分割するHTML構造に変更
            const messageHtml = `
                <div class="log-message ${sender}">
                    <div class="log-content">${message}</div>
                    <div class="log-timestamp">${timeString}</div>
                </div>
            `;
            $logDisplay.append(messageHtml);
        }
        
        // スクロール処理
        if ($scrollContainer.length) {
            $scrollContainer.scrollTop($scrollContainer.prop('scrollHeight'));
        } else {
            $logDisplay.scrollTop($logDisplay.prop("scrollHeight"));
        }
    }
    
    const highlightWords = (t, w, c) => { let hT = t; w.forEach(word => { hT = hT.replace(new RegExp(escapeRegExp(word), 'gi'), `<span class="${c}">${word}</span>`); }); return hT; };
    const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const stripLeadingWakeWords = (t) => { let n = (t||'').trim(); WAKE_WORDS.sort((a,b)=>b.length-a.length).forEach(w => { if(n.toLowerCase().startsWith(w.toLowerCase())) n = n.slice(w.length).trim(); }); return n; };
    const normalizeCommandKey = (c) => (c || '').replace(/[、。！？!?]/g, ' ').toLowerCase().replace(/\s+/g, ' ').trim();
    const shouldSuppressDuplicate = (c) => {
        const key = normalizeCommandKey(c);
        const now = Date.now();
        return !!(key && key === lastDispatchedVoiceCommandKey && (now - lastDispatchedVoiceCommandAt) < DUPLICATE_SUPPRESS_MS);
    };
    const markDispatchedCommand = (c) => {
        const key = normalizeCommandKey(c);
        if (!key) return;
        lastDispatchedVoiceCommandKey = key;
        lastDispatchedVoiceCommandAt = Date.now();
    };

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
        return command.replace(/[、。！？!?\s]+$/g, '').trim();
    }

    // ============================================================================
    // UIイベント
    // ============================================================================
    $('#send-button').on('click', () => { const t = $('#text-input').val(); if(t){ sendTextToServer(t); $('#text-input').val(''); } });
    $('#text-input').on('keypress', (e) => { if(e.which === 13) $('#send-button').click(); });
    const $playPauseBtn = $('#play-pause-track');
    const $playPauseIcon = $playPauseBtn.find('i');
    const syncPlayPauseIcon = () => {
        if (typeof window.getYoutubeContextState !== 'function') {
            $playPauseIcon.removeClass('fa-pause').addClass('fa-play');
            return;
        }
        let state = {};
        try {
            state = window.getYoutubeContextState() || {};
        } catch (e) {
            console.warn('YouTube state read failed:', e);
            $playPauseIcon.removeClass('fa-pause').addClass('fa-play');
            return;
        }
        const isPlaying = !!state.playing;
        $playPauseIcon.toggleClass('fa-play', !isPlaying);
        $playPauseIcon.toggleClass('fa-pause', isPlaying);
    };
    const startPlaybackFromPlaylist = () => {
        $.get('/api/playlist/playplan', (plan) => {
            const tracks = plan?.tracks || [];
            if (tracks.length === 0) {
                updateLogDisplay('プレイリストが空です。', 'assistant');
                syncPlayPauseIcon();
                return;
            }
            if (typeof window.playYoutubeTrackList === 'function') {
                const started = window.playYoutubeTrackList(tracks);
                if (!started) updateLogDisplay('YouTube再生の開始に失敗しました。', 'assistant');
            } else {
                updateLogDisplay('YouTubeプレーヤーが未初期化です。', 'assistant');
            }
            syncPlayPauseIcon();
        }).fail(() => {
            updateLogDisplay('プレイリスト取得に失敗しました。', 'assistant');
            syncPlayPauseIcon();
        });
    };
    $playPauseBtn.on('click', function() {
        if (typeof window.executeYoutubeIntent !== 'function') {
            updateLogDisplay('YouTubeプレーヤーが未初期化です。', 'assistant');
            return;
        }
        const state = (typeof window.getYoutubeContextState === 'function') ? window.getYoutubeContextState() : {};
        if (state.active) {
            window.executeYoutubeIntent({ intent: state.playing ? 'pause' : 'resume' });
            syncPlayPauseIcon();
            return;
        }
        startPlaybackFromPlaylist();
    });
    $('#next-track').on('click', () => {
        if (typeof window.executeYoutubeIntent === 'function') {
            window.executeYoutubeIntent({ intent: 'next' });
            syncPlayPauseIcon();
        }
    });
    $('#prev-track').on('click', () => {
        if (typeof window.executeYoutubeIntent === 'function') {
            window.executeYoutubeIntent({ intent: 'prev' });
            syncPlayPauseIcon();
        }
    });
    $('#volume-slider').on('input', function() {
        if (typeof window.executeYoutubeIntent === 'function') {
            window.executeYoutubeIntent({ intent: 'set_volume', amount: $(this).val() });
        }
    });
    $(document).on('youtube:control', syncPlayPauseIcon);

    // ============================================================================
    // TTS
    // ============================================================================
    const playTTS = (text, onEnd, options = {}) => {
        const preserveMode = !!options.preserveMode;
        const finalizeTTS = () => {
            if (!preserveMode) {
                setMode('waiting');
            }
            if (onEnd) onEnd();
        };
        stopTTS();
        if (!preserveMode) {
            setMode('speaking');
        }
        $.ajax({
            url: '/api/tts',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ text }),
            timeout: 12000,
            success: (r) => {
                if (r.audioContent) {
                    currentAudio = new Audio(`data:audio/mp3;base64,${r.audioContent}`);
                    if (ttsFallbackTimerId) clearTimeout(ttsFallbackTimerId);
                    ttsFallbackTimerId = setTimeout(() => {
                        // まれにonendedが発火しない端末向けの保険
                        finalizeTTS();
                    }, 20000);
                    currentAudio.play().catch(() => {
                        if (ttsFallbackTimerId) clearTimeout(ttsFallbackTimerId);
                        finalizeTTS();
                    });
                    currentAudio.onended = () => {
                        if (ttsFallbackTimerId) clearTimeout(ttsFallbackTimerId);
                        currentAudio = null;
                        finalizeTTS();
                    };
                } else {
                    finalizeTTS();
                }
            },
            error: () => {
                finalizeTTS();
            }
        });
    };
    const stopTTS = () => {
        if (ttsFallbackTimerId) clearTimeout(ttsFallbackTimerId);
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.onended = null;
            currentAudio = null;
        }
    };

    // ============================================================================
    // UI Functions & Data Fetch
    // ============================================================================
    window.showBlackout=()=>$('#blackout-overlay').fadeIn(500); window.hideBlackout=()=>$('#blackout-overlay').fadeOut(500);
    
    // --- Action Overlay ---
    const $actionOverlay = $('#action-overlay');
    const $actionOverlayBody = $('#action-overlay-body');
    function showActionOverlay(htmlContent) { if ($actionOverlayBody.length) { $actionOverlayBody.html(htmlContent); $actionOverlay.css('display', 'flex'); } }
    function hideActionOverlay() { if ($actionOverlay.length) { $actionOverlay.hide(); $actionOverlayBody.empty(); } }
    $('.action-overlay-close').on('click', hideActionOverlay);

    const weatherTextToIcon = (weather) => {
        if (!weather || weather === 'N/A') return '？';
        if (weather.includes('晴')) return '☀';
        if (weather.includes('曇') || weather.includes('くもり')) return '☁';
        if (weather.includes('雨')) return '☔';
        if (weather.includes('雪')) return '❄️';
        return '？';
    };

    const weatherToColor = (weather) => {
        if (!weather) return '#444';
        if (weather.includes('晴')) return '#ffa500'; // オレンジ
        if (weather.includes('雨')) return '#0000ff'; // 青
        if (weather.includes('雪')) return '#ffffff'; // 白
        if (weather.includes('曇') || weather.includes('くもり')) return '#808080'; // グレー
        return '#444';
    };

    let weatherPieChart = null;
    const fetchWeather = () => $.get('/api/weather', (d) => {
        if (!d) return;

        // --- サマリーの更新 ---
        const updateSummary = (id, data) => {
            const $card = $(`#${id}`);
            if (!$card.length) return;
            $card.find('.summary-icon').text(weatherTextToIcon(data.weather));
            $card.find('.max').text(`${data.max_temp}℃`);
            $card.find('.min').text(`${data.min_temp}℃`);
            $card.find('.summary-pop').html(`<i class="fas fa-umbrella"></i> ${data.pop}%`);
        };
        if (d.today) updateSummary('summary-today', d.today);
        if (d.tomorrow) updateSummary('summary-tomorrow', d.tomorrow);

        // --- 円グラフの更新 ---
        const ctx = document.getElementById('weatherPieChart');
        if (!ctx) return;

        // データの補完と整形 (24時間分 = 8スロット)
        const rawData = d.three_hourly || [];
        const processedData = [];
        for (let i = 0; i < 8; i++) {
            let item = rawData[i];
            let isInterpolated = false;
            if (!item || !item.weather) {
                // 補完: 取得できなければその時刻の前の天気を参照
                item = i > 0 ? { ...processedData[i-1], isInterpolated: true } : { weather: 'N/A', isInterpolated: true, time: '--:--' };
            }
            processedData.push(item);
        }

        const backgroundColors = processedData.map(item => weatherToColor(item.weather));
        const dataValues = new Array(8).fill(1); // 均等分割

        if (weatherPieChart) {
            weatherPieChart.data.datasets[0].backgroundColor = backgroundColors;
            weatherPieChart.update();
        } else {
            weatherPieChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    datasets: [{
                        data: dataValues,
                        backgroundColor: backgroundColors,
                        borderWidth: 2,
                        borderColor: '#2b2b2b'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '65%',
                    plugins: {
                        legend: { display: false },
                        tooltip: { enabled: false }
                    },
                    animation: false
                },
                plugins: [{
                    id: 'weatherIcons',
                    afterDraw: (chart) => {
                        const { ctx, chartArea: { top, bottom, left, right } } = chart;
                        const centerX = (left + right) / 2;
                        const centerY = (top + bottom) / 2;
                        const meta = chart.getDatasetMeta(0);
                        const outerRadius = meta.data[0].outerRadius;
                        const innerRadius = meta.data[0].innerRadius;
                        const midRadius = (outerRadius + innerRadius) / 2;

                        ctx.save();
                        processedData.forEach((item, i) => {
                            // 各セグメントの中央角度
                            const angle = (i / 8) * 2 * Math.PI - Math.PI / 2 + Math.PI / 8;
                            const x = centerX + midRadius * Math.cos(angle);
                            const y = centerY + midRadius * Math.sin(angle);
                            
                            // 天気アイコン
                            ctx.font = '24px Arial';
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillStyle = item.weather && item.weather.includes('雪') ? '#000' : '#fff';
                            ctx.fillText(weatherTextToIcon(item.weather), x, y);

                            // 補完警告 ⚠
                            if (item.isInterpolated) {
                                ctx.font = '14px Arial';
                                ctx.fillStyle = 'red';
                                ctx.fillText('⚠', x + 15, y - 10);
                            }

                            // 時刻ラベル
                            const labelRadius = outerRadius + 20;
                            const lx = centerX + labelRadius * Math.cos(angle - Math.PI / 8);
                            const ly = centerY + labelRadius * Math.sin(angle - Math.PI / 8);
                            ctx.font = '10px Arial';
                            ctx.fillStyle = '#aaa';
                            ctx.fillText(item.time, lx, ly);
                        });

                        // 現在時刻の角度計算 (0時を真上= -90度とする)
                        const now = new Date();
                        const hours = now.getHours() + now.getMinutes() / 60;
                        const needleAngle = (hours / 24) * 2 * Math.PI - Math.PI / 2;

                        // 現在時刻の針
                        ctx.beginPath();
                        ctx.lineWidth = 4;
                        ctx.strokeStyle = '#ff3b3b'; // 鮮やかな赤
                        ctx.moveTo(centerX + (innerRadius - 10) * Math.cos(needleAngle), centerY + (innerRadius - 10) * Math.sin(needleAngle));
                        ctx.lineTo(centerX + (outerRadius + 15) * Math.cos(needleAngle), centerY + (outerRadius + 15) * Math.sin(needleAngle));
                        ctx.stroke();

                        // 針の先に矢印
                        const headlen = 10;
                        const tipX = centerX + (outerRadius + 18) * Math.cos(needleAngle);
                        const tipY = centerY + (outerRadius + 18) * Math.sin(needleAngle);
                        ctx.beginPath();
                        ctx.fillStyle = '#ff3b3b';
                        ctx.moveTo(tipX, tipY);
                        ctx.lineTo(tipX - headlen * Math.cos(needleAngle - Math.PI / 6), tipY - headlen * Math.sin(needleAngle - Math.PI / 6));
                        ctx.lineTo(tipX - headlen * Math.cos(needleAngle + Math.PI / 6), tipY - headlen * Math.sin(needleAngle + Math.PI / 6));
                        ctx.fill();

                        ctx.restore();
                    }
                }]
            });
        }
    });

    let financeChart = null;
    const fetchFinanceSummary = () => $.get('/api/finance/summary', (d) => {
        // メトリクスの更新
        $('#stat-total-balance').text(`¥${(d.total_balance || 0).toLocaleString()}`);
        $('#stat-monthly-expense').text(`¥${(d.monthly_expense || 0).toLocaleString()}`);
        $('#stat-monthly-balance').text(`¥${(d.monthly_balance || 0).toLocaleString()}`);
        $('#stat-monthly-income').text(`¥${(d.monthly_income || 0).toLocaleString()}`);
        $('#stat-daily-expense').text(`¥${(d.daily_expense || 0).toLocaleString()}`);
        $('#stat-daily-no-essentials').text(`¥${(d.daily_expense_no_essentials || 0).toLocaleString()}`);

        // グラフの更新
        const ctx = document.getElementById('monthlyExpenseChart');
        if (!ctx) return;

        const labels = d.monthly_chart_data.map(item => item.month);
        const data = d.monthly_chart_data.map(item => item.amount);

        if (financeChart) {
            financeChart.data.labels = labels;
            financeChart.data.datasets[0].data = data;
            financeChart.update();
        } else {
            financeChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: '月別支出',
                        data: data,
                        backgroundColor: 'rgba(0, 123, 255, 0.5)',
                        borderColor: 'rgba(0, 123, 255, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: true, grid: { color: '#444' }, ticks: { color: '#aaa' } },
                        x: { grid: { display: false }, ticks: { color: '#aaa' } }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        }
    });

    let allCalendarEvents = [];
    let activeFilterCreators = []; 

    const getUserColor = (name) => {
        const userPalette = [
            '#d8b4fe', // 紫 (zelcoba用)
            '#fca5a5', // ピンク
            '#86efac', // 緑
            '#fdba74', // オレンジ
            '#67e8f9', // シアン
            '#fde047', // 黄色
            '#fb923c'  // 濃いオレンジ
        ];
        if (!name) return '#f4f7fb';
        const n = name.toLowerCase();
        if (n.includes('zelcoba')) return userPalette[0];
        let hash = 0;
        for (let i = 0; i < n.length; i++) {
            hash = n.charCodeAt(i) + ((hash << 5) - hash);
        }
        const index = Math.abs(hash) % (userPalette.length - 1) + 1;
        return userPalette[index];
    };

    const renderScheduleList = () => {
        const n = new Date();
        const $l = $('#schedule-list').empty();
        
        // フィルタリングロジックを複数選択対応に変更
        const filteredEvents = activeFilterCreators.length === 0 
            ? allCalendarEvents 
            : allCalendarEvents.filter(e => activeFilterCreators.includes(e.creator || '不明'));

        if (filteredEvents.length) {
            const uE = filteredEvents.map(e => ({ ...e, startTime: new Date(e.start_time) }))
                                     .filter(e => new Date(e.start_time) >= n)
                                     .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
                                     .slice(0, 10);
            
            if (uE.length) {
                uE.forEach(e => {
                    const sT = e.startTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
                    let dL = '';
                    if (e.startTime.getDate() === n.getDate()) dL = '今日';
                    else if (e.startTime.getDate() === n.getDate() + 1) dL = '明日';
                    else dL = e.startTime.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
                    const tS = `${dL} ${sT}`;
                    
                    const calendarColorMap = { 
                        'primary': '#3b82f6', 
                        'family07655219284223877417@group.calendar.google.com': '#d8b4fe', // ファミリーカレンダーを紫色に設定
                        'default': '#7aa8ff' 
                    };
                    const dotColor = calendarColorMap[e.calendarId] || calendarColorMap['default'];
                    const creatorName = e.creator || '不明';
                    const titleColor = getUserColor(creatorName);

                    $l.append(`
                        <li style="display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px;">
                            <span style="color: ${dotColor}; font-size: 0.7em; flex-shrink: 0; transform: translateY(-1px);">●</span>
                            <span class="schedule-time" style="white-space: nowrap; font-size: 0.9em;">${tS}</span>
                            <div style="display: flex; flex-direction: column; overflow: hidden;">
                                <span class="schedule-title" style="color: ${titleColor}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500;">
                                    ${e.title}
                                </span>
                                <span style="color: var(--theme-text-2, #cdd6df); font-size: 0.75em; opacity: 0.6; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                    ${creatorName}
                                </span>
                            </div>
                        </li>
                    `);
                });
            } else {
                $l.append('<li><span class="schedule-title">表示対象の予定はありません</span></li>');
            }
        } else {
            $l.append('<li><span class="schedule-title">予定はありません</span></li>');
        }
    };

    const renderFilterButtons = () => {
        const $f = $('#schedule-filters').empty();
        const creators = [...new Set(allCalendarEvents.map(e => e.creator || '不明'))].sort();
        
        if (creators.length <= 1) return; // 1人しかいないならボタン不要

        // 「すべて」ボタン
        const isAllActive = activeFilterCreators.length === 0;
        const allBtn = $(`<button class="filter-btn ${isAllActive ? 'active' : ''}" style="background: ${isAllActive ? '#444' : 'transparent'}; border: 1px solid #555; color: #fff; font-size: 0.7em; padding: 2px 6px; border-radius: 4px; cursor: pointer;">All</button>`);
        allBtn.on('click', () => { 
            activeFilterCreators = []; // 全選択時は空にする
            renderFilterButtons(); 
            renderScheduleList(); 
        });
        $f.append(allBtn);

        creators.forEach(c => {
            const color = getUserColor(c);
            const isActive = activeFilterCreators.includes(c);
            const btn = $(`<button class="filter-btn ${isActive ? 'active' : ''}" style="background: ${isActive ? color + '33' : 'transparent'}; border: 1px solid ${isActive ? color : '#555'}; color: ${isActive ? color : '#999'}; font-size: 0.7em; padding: 2px 6px; border-radius: 4px; cursor: pointer; transition: all 0.2s;">${c}</button>`);
            btn.on('click', () => {
                // 既に選択されていれば削除、そうでなければ追加
                if (isActive) {
                    activeFilterCreators = activeFilterCreators.filter(item => item !== c);
                } else {
                    activeFilterCreators.push(c);
                }
                renderFilterButtons();
                renderScheduleList();
            });
            $f.append(btn);
        });
    };

    const fetchCalendarData = () => {
        $.get(`/api/local_calendar/events`, (evts) => {
            allCalendarEvents = evts || [];
            renderFilterButtons();
            renderScheduleList();
        }).fail(() => {
            $('#schedule-list').empty().append('<li><span class="schedule-title">予定の取得に失敗</span></li>');
        });
    };
    const fetchAlarms = () => $.get('/api/custom_orders',(ords)=>{const $aL=$('#field-time-alarm .alarm-list ul').empty();let c=0;if(ords?.length){ords.forEach(o=>{if(c>=4)return;const t=o.triggers?.[0];if(t?.category==='時間'){$aL.append(`<li><span>${t.value?.time||'N/A'}</span> - ${o.name||'無題'}</li>`);c++;}});if(c===0)$aL.append('<li>有効なアラームはありません</li>');}else{$aL.append('<li>有効なアラームはありません</li>');}});
    const updateTime = () => { const n=new Date(); $('#current-time').text(n.toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit',second:'2-digit'})); $('#current-date').text(n.toLocaleDateString('ja-JP',{year:'numeric',month:'long',day:'numeric',weekday:'long'})); };

    // ============================================================================
    // 実行
    // ============================================================================
    function run() {
        loadAppSettings();
        loadCustomVoiceTriggerEndWords();
        // syncPlayPauseIcon(); // 廃止
        updateTime(); setInterval(updateTime, 1000);
        const updateAllInfo = () => { fetchWeather(); fetchFinanceSummary(); fetchCalendarData(); fetchAlarms(); };
        window.updateAllInfo = updateAllInfo;
        updateAllInfo(); setInterval(updateAllInfo, 30000);
        initializeVoiceRecognition();
    }
    run();
});

