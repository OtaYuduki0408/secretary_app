// 予定を追加するメソッド
function addEvent(text, time) {
    try {
        // 実装コード
        console.log(`予定追加: ${text} at ${time}`);
        return true;
    } catch (error) {
        console.error('予定追加エラー:', error);
        return false;
    }
}

// 予定を取得するメソッド
function getEvents(start_time, end_time) {
    try {
        // 実装コード
        console.log(`予定取得: ${start_time} to ${end_time}`);
        return [
            {name: "レジ業務", time: "2024-01-15 10:00:00"},
            {name: "品出し", time: "2024-01-15 14:00:00"}
        ];
    } catch (error) {
        console.error('予定取得エラー:', error);
        return null;
    }
}

// 予定を削除するメソッド
function deleteEvent(text, time) {
    try {
        // 実装コード
        console.log(`予定削除: ${text} at ${time}`);
        return true;
    } catch (error) {
        console.error('予定削除エラー:', error);
        return false;
    }
}

// 予定を変更するメソッド
function updateEvent(text, new_text, time) {
    try {
        // 実装コード
        console.log(`予定変更: ${text} -> ${new_text} at ${time}`);
        return true;
    } catch (error) {
        console.error('予定変更エラー:', error);
        return false;
    }
}

// 日付と時間をYYYY-MM-DD HH:MM:SS形式に変換するヘルパー関数
function formatToDateTime(dateString, timeString) {
    let date;
    
    // 相対日付の処理
    if (dateString === 'today' || dateString === '今日') {
        date = new Date();
    } else if (dateString === 'tomorrow' || dateString === '明日') {
        date = new Date();
        date.setDate(date.getDate() + 1);
    } else {
        date = new Date(dateString);
    }
    
    const [hours, minutes] = timeString.split(':').map(Number);
    date.setHours(hours, minutes || 0, 0, 0);
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const second = String(date.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

// 音声認識テキストを処理するメイン関数
async function processVoiceCommand(voiceText) {
    try {
        // 直接解析文本命令，不使用Speech-to-Text API
        const command = parseVoiceCommand(voiceText);
        
        if (!command) {
            return {
                success: false,
                message: 'コマンドを理解できませんでした',
                data: null
            };
        }

        // 操作タイプに基づいて処理を分岐
        switch (command.operation) {
            case 'add':
                return await addEventFromAPI(command);
            case 'delete':
                return await deleteEventFromAPI(command);
            case 'update':
                return await updateEventFromAPI(command);
            case 'get':
                return await getEventsFromAPI(command);
            default:
                return {
                    success: false,
                    message: 'サポートされていない操作です',
                    data: null
                };
        }
    } catch (error) {
        return {
            success: false,
            message: `エラーが発生しました: ${error.message}`,
            data: null
        };
    }
}

// APIデータからイベントを追加
async function addEventFromAPI(commandData) {
    try {
        const { title, date, startTime } = commandData;
        
        // 日付と時間をYYYY-MM-DD HH:MM:SS形式に変換
        const dateTime = formatToDateTime(date, startTime);
        
        // 基本メソッドを呼び出し
        const success = addEvent(title, dateTime);
        
        if (success) {
            await logOperationToAPI('add', commandData, true, dateTime);
            return {
                success: true,
                message: `✅ 予定を追加しました: ${title}`,
                data: {
                    title: title,
                    time: dateTime
                }
            };
        } else {
            await logOperationToAPI('add', commandData, false, '追加失敗');
            return {
                success: false,
                message: `❌ 予定の追加に失敗しました`,
                data: null
            };
        }
    } catch (error) {
        await logOperationToAPI('add', commandData, false, error.message);
        return {
            success: false,
            message: `❌ 予定の追加に失敗しました: ${error.message}`,
            data: null
        };
    }
}

// APIデータからイベントを取得
async function getEventsFromAPI(commandData) {
    try {
        const { date, period } = commandData;
        
        let start_time, end_time;
        
        // 期間の設定
        if (date) {
            start_time = `${date} 00:00:00`;
            end_time = `${date} 23:59:59`;
        } else if (period === 'today') {
            const today = formatDate(new Date());
            start_time = `${today} 00:00:00`;
            end_time = `${today} 23:59:59`;
        } else if (period === 'week') {
            const startDate = new Date();
            const endDate = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);
            start_time = `${formatDate(startDate)} 00:00:00`;
            end_time = `${formatDate(endDate)} 23:59:59`;
        } else {
            // デフォルトは今日
            const today = formatDate(new Date());
            start_time = `${today} 00:00:00`;
            end_time = `${today} 23:59:59`;
        }

        // 基本メソッドを呼び出し
        const events = getEvents(start_time, end_time);
        
        if (events) {
            // データ形式を変換
            const convertedEvents = events.map(event => ({
                title: event.name,
                startTime: new Date(event.time),
                endTime: new Date(new Date(event.time).getTime() + 60 * 60 * 1000), // 1時間後
                eventId: `event_${event.name}_${event.time}`
            }));

            await logOperationToAPI('get', commandData, true, `検出件数: ${events.length}`);
            return {
                success: true,
                message: `📅 ${events.length}件の予定が見つかりました`,
                data: convertedEvents
            };
        } else {
            await logOperationToAPI('get', commandData, false, '取得失敗');
            return {
                success: false,
                message: `❌ 予定の取得に失敗しました`,
                data: null
            };
        }
    } catch (error) {
        await logOperationToAPI('get', commandData, false, error.message);
        return {
            success: false,
            message: `❌ 予定の取得に失敗しました: ${error.message}`,
            data: null
        };
    }
}

// APIデータからイベントを削除
async function deleteEventFromAPI(commandData) {
    try {
        const { date, title } = commandData;
        
        // 日付をYYYY-MM-DD HH:MM:SS形式に変換（時間は00:00:00を使用）
        const dateTime = `${date} 00:00:00`;
        
        // 基本メソッドを呼び出し
        const success = deleteEvent(title, dateTime);
        
        if (success) {
            await logOperationToAPI('delete', commandData, true, dateTime);
            return {
                success: true,
                message: `🗑️ 予定を削除しました: ${title}`,
                data: {
                    title: title,
                    time: dateTime
                }
            };
        } else {
            await logOperationToAPI('delete', commandData, false, '削除失敗');
            return {
                success: false,
                message: `❌ 予定の削除に失敗しました`,
                data: null
            };
        }
    } catch (error) {
        await logOperationToAPI('delete', commandData, false, error.message);
        return {
            success: false,
            message: `❌ 予定の削除に失敗しました: ${error.message}`,
            data: null
        };
    }
}

// APIデータからイベントを更新
async function updateEventFromAPI(commandData) {
    try {
        const { date, title, newTitle } = commandData;
        
        // 日付をYYYY-MM-DD HH:MM:SS形式に変換（時間は00:00:00を使用）
        const dateTime = `${date} 00:00:00`;
        
        // 基本メソッドを呼び出し
        const success = updateEvent(title, newTitle, dateTime);
        
        if (success) {
            await logOperationToAPI('update', commandData, true, dateTime);
            return {
                success: true,
                message: `✏️ 予定を変更しました: ${title} → ${newTitle}`,
                data: {
                    oldTitle: title,
                    newTitle: newTitle,
                    time: dateTime
                }
            };
        } else {
            await logOperationToAPI('update', commandData, false, '変更失敗');
            return {
                success: false,
                message: `❌ 予定の変更に失敗しました`,
                data: null
            };
        }
    } catch (error) {
        await logOperationToAPI('update', commandData, false, error.message);
        return {
            success: false,
            message: `❌ 予定の変更に失敗しました: ${error.message}`,
            data: null
        };
    }
}

// テキストコマンドを解析する関数
function parseVoiceCommand(text) {
    // シンプルなパターンマッチングでコマンドを解析
    const patterns = [
        {
            regex: /(.+?)に(.+?)から(.+?)まで(.+)を追加/,
            handler: (match) => ({
                operation: 'add',
                date: parseNaturalDate(match[1]),
                startTime: parseTime(match[2]),
                endTime: parseTime(match[3]),
                title: match[4]
            })
        },
        {
            regex: /(.+?)の(.+)を削除/,
            handler: (match) => ({
                operation: 'delete', 
                date: parseNaturalDate(match[1]),
                title: match[2]
            })
        },
        {
            regex: /今日の予定/,
            handler: () => ({
                operation: 'get',
                period: 'today'
            })
        },
        {
            regex: /(.+?)の予定/,
            handler: (match) => ({
                operation: 'get',
                date: parseNaturalDate(match[1])
            })
        }
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern.regex);
        if (match) {
            return pattern.handler(match);
        }
    }
    
    return null;
}

// 自然言語の日付を解析
function parseNaturalDate(dateStr) {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    const dateMap = {
        '今日': formatDate(today),
        '明日': formatDate(tomorrow),
        '明後日': formatDate(new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000)),
        '今天': formatDate(today),
        '明天': formatDate(tomorrow),
        '后天': formatDate(new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000))
    };
    
    return dateMap[dateStr] || dateStr;
}

// 時間を解析
function parseTime(timeStr) {
    return timeStr.replace('時', ':00').replace('半', ':30').replace('点', ':00');
}

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// 操作をAPI経由で記録
async function logOperationToAPI(operation, commandData, success, details) {
    try {
        // 実際の実装ではここでログAPIを呼び出す
        console.log('操作ログ:', {
            operation,
            commandData,
            success,
            details,
            timestamp: new Date().toISOString()
        });
        
        // モック実装
        await fetch('/api/log', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                operation,
                commandData,
                success,
                details,
                timestamp: new Date().toISOString()
            })
        });
    } catch (error) {
        console.error('ログ記録エラー:', error);
    }
}

// HTMLとの連携関数
function processVoiceCommandFromHTML() {
    const voiceText = document.getElementById('voiceCommand').value;
    
    if (!voiceText) {
        showResult('入力エラー', '音声コマンドを入力してください', false);
        return;
    }

    showResult('処理中', '音声コマンドを処理中です...', true);

    // 非同期処理
    processVoiceCommand(voiceText).then(result => {
        showResult(result.success ? '操作成功' : '操作失敗', result.message, result.success);
    }).catch(error => {
        showResult('処理エラー', `コマンド処理中にエラーが発生しました: ${error.message}`, false);
    });
}

// 結果表示関数
function showResult(title, message, isSuccess) {
    const resultArea = document.getElementById('resultArea');
    const resultTitle = document.getElementById('resultTitle');
    const resultContent = document.getElementById('resultContent');
    
    if (resultArea && resultTitle && resultContent) {
        resultTitle.textContent = title;
        resultContent.innerHTML = `<div class="${isSuccess ? 'success-message' : 'error-message'}">${message}</div>`;
        resultArea.style.display = 'block';
    } else {
        // フォールバック: アラート表示
        alert(`${title}: ${message}`);
    }
}

// 今日の予定を取得
async function getTodaysEvents() {
    try {
        const result = await getEventsFromAPI({
            operation: 'get',
            period: 'today',
            title: 'all'
        });

        let content = `<p>${result.message}</p>`;
        if (result.data && result.data.length > 0) {
            result.data.forEach(event => {
                const startTime = event.startTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
                const endTime = event.endTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
                
                content += `<p>⏰ ${startTime}-${endTime}: ${event.title}</p>`;
            });
        }

        showResult('今日の予定', content, true);
    } catch (error) {
        showResult('取得エラー', `予定の取得に失敗しました: ${error.message}`, false);
    }
}

// ページ読み込み時の初期化
document.addEventListener('DOMContentLoaded', function() {
    // Enterキーで音声コマンドを実行
    const voiceInput = document.getElementById('voiceCommand');
    if (voiceInput) {
        voiceInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                processVoiceCommandFromHTML();
            }
        });
    }
    
    console.log('バイト予定管理システムが初期化されました');
});

// 音声認識機能（オプション）
function setupVoiceRecognition() {
    if ('webkitSpeechRecognition' in window) {
        const recognition = new webkitSpeechRecognition();
        recognition.lang = 'ja-JP';
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onresult = function(event) {
            const transcript = event.results[0][0].transcript;
            document.getElementById('voiceCommand').value = transcript;
        };

        recognition.onerror = function(event) {
            console.error('音声認識エラー:', event.error);
        };

        return recognition;
    }
    return null;
}

// 音声認識開始
function startVoiceRecognition() {
    const recognition = setupVoiceRecognition();
    if (recognition) {
        recognition.start();
    } else {
        alert('お使いのブラウザは音声認識をサポートしていません');
    }
}