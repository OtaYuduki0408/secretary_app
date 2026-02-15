let player;
let currentPlaylist = [];
let currentVideoIndex = 0;
let youtubeApiReady = false;
let pendingVideoId = null;
let apiReadyWatcherId = null;
let lastSearchQuery = '';
let lastPlaySource = '';
let hasPlayableInCurrentSearch = false;
let lastPlayerState = -1;
let resumeCheckpointSec = 0;
let errorCount = 0;
const MAX_ERRORS = 5; // 連続エラーの最大許容回数

const overlay = document.getElementById('youtube-overlay');
const playerWrapper = document.getElementById('youtube-player-wrapper');
const videoTitle = document.getElementById('youtube-video-title');
const closeBtn = document.getElementById('youtube-close-btn');
const prevBtn = document.getElementById('youtube-prev-btn');
const nextBtn = document.getElementById('youtube-next-btn');

function isOverlayVisible() {
    return overlay && !overlay.classList.contains('youtube-overlay-hidden');
}

function hasSearchQueue() {
    return Array.isArray(currentPlaylist) && currentPlaylist.length > 1;
}

function canUseYoutubePlayer() {
    return !!(window.YT && typeof window.YT.Player === 'function');
}

function syncYoutubeApiReady() {
    if (youtubeApiReady) return true;
    if (canUseYoutubePlayer()) {
        if (typeof window.setYoutubeApiReady === 'function') {
            window.setYoutubeApiReady(true);
        } else {
            youtubeApiReady = true;
        }
        return true;
    }
    return false;
}

function startApiReadyWatcher() {
    if (apiReadyWatcherId) return;
    apiReadyWatcherId = window.setInterval(() => {
        if (syncYoutubeApiReady()) {
            clearInterval(apiReadyWatcherId);
            apiReadyWatcherId = null;
        }
    }, 200);
}

function extractVideoId(url) {
    if (!url) return null;
    const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?|live)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const matches = url.match(regex);
    return matches ? matches[1] : null;
}

// main.html から呼び出されるための関数
window.setYoutubeApiReady = function(isReady) {
    if (isReady) {
        youtubeApiReady = true;
        console.log("DEBUG: setYoutubeApiReadyが呼ばれ、APIが準備完了になりました。");
        if (apiReadyWatcherId) {
            clearInterval(apiReadyWatcherId);
            apiReadyWatcherId = null;
        }
        if (pendingVideoId) {
            initializePlayer(pendingVideoId);
            pendingVideoId = null;
        }
    }
};

// playYoutubeVideoが呼ばれる前に、main.htmlで先にフラグが立っていた場合を考慮
if (window._youtubeApiReadyGlobal) {
    if (typeof window.setYoutubeApiReady === 'function') {
        window.setYoutubeApiReady(true);
    }
}
startApiReadyWatcher();


function initializePlayer(videoId) {
    if (!canUseYoutubePlayer()) {
        pendingVideoId = videoId;
        startApiReadyWatcher();
        console.warn("DEBUG: YouTube APIの準備待ちです。player初期化を保留します。");
        return;
    }

    if (player) {
        player.loadVideoById(videoId);
        console.log("DEBUG: 既存のプレーヤーに動画をロードしました:", videoId);
    } else {
        console.log("DEBUG: 新しいYouTubeプレーヤーを初期化します (videoId:", videoId, ")");
        player = new YT.Player('youtube-player', {
            height: '360',
            width: '640',
            videoId: videoId,
            playerVars: {
                'playsinline': 1,
                'autoplay': 1, // 自動再生を試みる
                'origin': window.location.origin // ★修正点: オリジンを明示
            },
            events: {
                'onReady': onPlayerReady,
                'onStateChange': onPlayerStateChange,
                'onError': onPlayerError // エラーハンドリングを改善
            }
        });
    }
}

function onPlayerReady(event) {
    console.log("DEBUG: YouTubeプレーヤーの準備ができました。");
    errorCount = 0; // 準備ができたらエラーカウントをリセット
    if (resumeCheckpointSec > 0 && typeof event.target.seekTo === 'function') {
        try {
            event.target.seekTo(resumeCheckpointSec, true);
        } catch (e) {
            console.warn("DEBUG: resume checkpoint seek failed:", e);
        }
    }
    event.target.playVideo(); // 再生を開始
}

function onPlayerStateChange(event) {
    console.log("DEBUG: プレーヤーの状態が変更されました:", event.data);
    lastPlayerState = event.data;
    if (event.data === YT.PlayerState.PLAYING) {
        if (lastPlaySource === 'search') {
            hasPlayableInCurrentSearch = true;
        }
        errorCount = 0; // 再生に成功したらエラーカウントをリセット
    }
    if (event.data === YT.PlayerState.ENDED) {
        playNextVideo();
    }
}

function showSearchUnplayableNotice() {
    showOverlay();
    updateControls();
    const errorMessageEl = document.getElementById('youtube-error-message');
    if (errorMessageEl) {
        errorMessageEl.textContent = "この検索結果は再生できませんでした";
        errorMessageEl.style.display = 'block';
    }
    if (typeof window.speak === 'function') {
        window.speak("この検索結果は再生できませんでした。");
    }
}

function onPlayerError(event) {
    console.error("DEBUG: YouTubeプレーヤーでエラーが発生しました:", event.data);
    // 埋め込み不可(150/101)は無言で次の候補へ進む
    if (event.data === 150 || event.data === 101) {
        if (currentVideoIndex < currentPlaylist.length - 1) {
            playNextVideo();
            return;
        }

        // 検索結果が全滅したときのみ通知する
        if (lastPlaySource === 'search' && !hasPlayableInCurrentSearch && currentPlaylist.length > 0) {
            currentVideoIndex = 0;
            showSearchUnplayableNotice();
            return;
        }

        hideOverlay();
        return;
    }

    errorCount++;
    if (errorCount >= MAX_ERRORS) {
        console.error("DEBUG: エラーが多発したため、再生を停止します。");
        hideOverlay();
    } else {
        playNextVideo(); // エラー発生時も次の動画へ進む
    }
}

function showOverlay() {
    overlay.classList.remove('youtube-overlay-hidden');
    // オーバーレイ表示時に以前のエラーメッセージをクリア
    const errorMessageEl = document.getElementById('youtube-error-message');
    if (errorMessageEl) {
        errorMessageEl.textContent = '';
        errorMessageEl.style.display = 'none';
    }
}

function hideOverlay() {
    if (player) {
        player.stopVideo();
        // プレーヤーを破棄してDOMから削除（新しい動画をロードする際に初期化し直すため）
        player.destroy();
        player = null; // player オブジェクトをnullにする
    }
    resumeCheckpointSec = 0;
    overlay.classList.add('youtube-overlay-hidden');
    // オーバーレイ非表示時にエラーメッセージもクリア
    const errorMessageEl = document.getElementById('youtube-error-message');
    if (errorMessageEl) {
        errorMessageEl.textContent = '';
        errorMessageEl.style.display = 'none';
    }
}

function hideOverlayOnly() {
    overlay.classList.add('youtube-overlay-hidden');
}

function updateControls() {
    const isPlaylist = currentPlaylist.length > 1;
    prevBtn.style.display = isPlaylist ? 'inline-block' : 'none';
    nextBtn.style.display = isPlaylist ? 'inline-block' : 'none';

    if (isPlaylist) {
        prevBtn.disabled = currentVideoIndex === 0;
        nextBtn.disabled = currentVideoIndex >= currentPlaylist.length - 1;
    }
    if (currentPlaylist[currentVideoIndex]) {
        videoTitle.textContent = currentPlaylist[currentVideoIndex].title || '動画を再生中';
    }
}

function playNextVideo() {
    if (currentVideoIndex < currentPlaylist.length - 1) {
        currentVideoIndex++;
        if (youtubeApiReady) {
            initializePlayer(currentPlaylist[currentVideoIndex].id);
        } else {
            pendingVideoId = currentPlaylist[currentVideoIndex].id;
        }
        updateControls();
    } else {
        console.log("DEBUG: プレイリストの最後に到達しました。");
        hideOverlay();
    }
}

function playPrevVideo() {
    if (currentVideoIndex > 0) {
        currentVideoIndex--;
        if (youtubeApiReady) {
            initializePlayer(currentPlaylist[currentVideoIndex].id);
        } else {
            pendingVideoId = currentPlaylist[currentVideoIndex].id;
        }
        updateControls();
    }
}

function pauseCurrentVideo() {
    if (player && typeof player.pauseVideo === 'function') {
        if (typeof player.getCurrentTime === 'function') {
            const t = player.getCurrentTime();
            if (typeof t === 'number' && !Number.isNaN(t) && t >= 0) {
                resumeCheckpointSec = t;
            }
        }
        player.pauseVideo();
        return true;
    }
    return false;
}

function resumeCurrentVideo() {
    if (player && typeof player.playVideo === 'function') {
        if (resumeCheckpointSec > 0 && typeof player.seekTo === 'function') {
            try {
                player.seekTo(resumeCheckpointSec, true);
            } catch (e) {
                console.warn("DEBUG: resume seek failed:", e);
            }
        }
        player.playVideo();
        return true;
    }
    const current = currentPlaylist[currentVideoIndex];
    if (current && current.id) {
        if (youtubeApiReady) {
            initializePlayer(current.id);
        } else {
            pendingVideoId = current.id;
            startApiReadyWatcher();
        }
        return true;
    }
    return false;
}

function replayCurrentVideo() {
    if (player && typeof player.seekTo === 'function' && typeof player.playVideo === 'function') {
        player.seekTo(0, true);
        player.playVideo();
        return true;
    }
    return false;
}

function seekCurrentVideoBy(deltaSec) {
    if (!player || typeof player.seekTo !== 'function' || typeof player.getCurrentTime !== 'function') {
        return false;
    }
    const delta = Number(deltaSec);
    if (!Number.isFinite(delta) || delta === 0) return false;
    const current = Number(player.getCurrentTime());
    if (!Number.isFinite(current)) return false;

    let target = current + delta;
    if (typeof player.getDuration === 'function') {
        const duration = Number(player.getDuration());
        if (Number.isFinite(duration) && duration > 0) {
            target = Math.min(Math.max(0, target), duration);
        } else {
            target = Math.max(0, target);
        }
    } else {
        target = Math.max(0, target);
    }
    player.seekTo(target, true);
    return true;
}

function adjustCurrentVideoVolume(deltaAmount, isAbsolute = false) {
    if (!player || typeof player.getVolume !== 'function' || typeof player.setVolume !== 'function') {
        return false;
    }
    const amount = Number(deltaAmount);
    if (!Number.isFinite(amount)) return false;

    let nextVolume;
    if (isAbsolute) {
        nextVolume = amount;
    } else {
        const currentVolume = Number(player.getVolume());
        if (!Number.isFinite(currentVolume)) return false;
        nextVolume = currentVolume + amount;
    }
    
    const finalVolume = Math.min(100, Math.max(0, Math.round(nextVolume)));
    player.setVolume(finalVolume);
    return true;
}

function playRandomFromCurrentQueue() {
    if (!Array.isArray(currentPlaylist) || currentPlaylist.length === 0) return false;
    if (currentPlaylist.length === 1) {
        return resumeCurrentVideo() || replayCurrentVideo();
    }
    let randomIndex = currentVideoIndex;
    while (randomIndex === currentVideoIndex && currentPlaylist.length > 1) {
        randomIndex = Math.floor(Math.random() * currentPlaylist.length);
    }
    currentVideoIndex = randomIndex;
    showOverlay();
    updateControls();
    initializePlayer(currentPlaylist[currentVideoIndex].id);
    return true;
}

function searchInCurrentQueue(query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q || !Array.isArray(currentPlaylist) || currentPlaylist.length === 0) return false;
    const idx = currentPlaylist.findIndex((v) => String(v?.title || '').toLowerCase().includes(q));
    if (idx < 0) return false;
    currentVideoIndex = idx;
    showOverlay();
    updateControls();
    initializePlayer(currentPlaylist[currentVideoIndex].id);
    return true;
}

function emitYoutubeControlEvent(type, detail = {}) {
    document.dispatchEvent(new CustomEvent('youtube:control', { detail: { type, ...detail } }));
}

async function persistYoutubePreference(action, payload = {}) {
    const current = payload.current || {};
    if (!current || !current.id) return;
    try {
        const response = await fetch('/api/youtube/preferences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action,
                video: {
                    id: current.id,
                    title: current.title || ''
                },
                query: payload.query || '',
                reason: payload.reason || ''
            })
        });
        if (!response.ok) {
            const text = await response.text();
            console.warn('YouTube preference save failed:', response.status, text);
            return;
        }
        const saved = await response.json();
        console.log('YouTube preference saved:', saved);

        if (action === 'save_current') {
            const titleGuess = String(current.title || '').trim();
            let artistGuess = '';
            if (titleGuess.includes(' - ')) {
                artistGuess = titleGuess.split(' - ')[0].trim();
            }
            await fetch('/api/playlist/tracks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    video_id: current.id,
                    title: titleGuess,
                    artist: artistGuess,
                    url: `https://www.youtube.com/watch?v=${current.id}`,
                })
            });
        }
    } catch (error) {
        console.warn('YouTube preference save error:', error);
    }
}

function executeYoutubeIntent(payload = {}) {
    const intent = String(payload.intent || '').trim().toLowerCase();
    const query = String(payload.query || '').trim();
    const amountRaw = Number(payload.amount);
    const amount = Number.isFinite(amountRaw) ? amountRaw : 0;
    switch (intent) {
        case 'next':
            playNextVideo();
            return true;
        case 'prev':
            playPrevVideo();
            return true;
        case 'pause':
            {
                const wasVisible = isOverlayVisible();
                const paused = pauseCurrentVideo();
                hideOverlayOnly();
                return paused || wasVisible;
            }
        case 'resume':
            showOverlay();
            updateControls();
            return resumeCurrentVideo();
        case 'stop':
            hideOverlayOnly();
            return pauseCurrentVideo();
        case 'close':
            hideOverlayOnly();
            return true;
        case 'replay':
            showOverlay();
            return replayCurrentVideo();
        case 'random':
            return playRandomFromCurrentQueue();
        case 'search_in_results':
            return searchInCurrentQueue(query);
        case 'seek_forward':
            return seekCurrentVideoBy(Math.max(1, Math.abs(amount || 10)));
        case 'seek_backward':
            return seekCurrentVideoBy(-Math.max(1, Math.abs(amount || 10)));
        case 'volume_up':
            return adjustCurrentVideoVolume(Math.max(1, Math.abs(amount || 10)), false);
        case 'volume_down':
            return adjustCurrentVideoVolume(-Math.max(1, Math.abs(amount || 10)), false);
        case 'set_volume':
            return adjustCurrentVideoVolume(amount, true);
        case 'save_current':
            emitYoutubeControlEvent('save_current', {
                current: currentPlaylist[currentVideoIndex] || null,
                index: currentVideoIndex,
                query: lastPlaySource === 'search' ? lastSearchQuery : ''
            });
            return true;
        case 'reject_current':
            emitYoutubeControlEvent('reject_current', {
                current: currentPlaylist[currentVideoIndex] || null,
                index: currentVideoIndex,
                query: lastPlaySource === 'search' ? lastSearchQuery : ''
            });
            playNextVideo();
            return true;
        default:
            return false;
    }
}

function getYoutubeContextState() {
    const isPaused = !!(window.YT && lastPlayerState === YT.PlayerState.PAUSED);
    const isPlaying = !!(window.YT && lastPlayerState === YT.PlayerState.PLAYING);
    const currentVolume = (player && typeof player.getVolume === 'function') ? Number(player.getVolume()) : null;
    return {
        active: Boolean((player && typeof player.playVideo === 'function') || pendingVideoId || (currentPlaylist && currentPlaylist.length > 0)),
        overlay_visible: isOverlayVisible(),
        paused: isPaused,
        playing: isPlaying,
        has_queue: hasSearchQueue(),
        queue_length: Array.isArray(currentPlaylist) ? currentPlaylist.length : 0,
        current_index: currentVideoIndex,
        current_title: currentPlaylist[currentVideoIndex]?.title || '',
        current_video_id: currentPlaylist[currentVideoIndex]?.id || '',
        volume: Number.isFinite(currentVolume) ? currentVolume : null
    };
}

function playYoutubeTrackList(trackList, options = {}) {
    const list = Array.isArray(trackList) ? trackList : [];
    if (list.length === 0) return false;

    const normalized = list
        .map((v) => ({
            id: String(v?.id || "").trim(),
            title: String(v?.title || "プレイリストの曲").trim()
        }))
        .filter((v) => v.id.length > 0);

    if (normalized.length === 0) return false;

    const useRandom = !!options.random;
    if (useRandom) {
        for (let i = normalized.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = normalized[i];
            normalized[i] = normalized[j];
            normalized[j] = tmp;
        }
    }

    lastPlaySource = 'playlist';
    lastSearchQuery = '';
    hasPlayableInCurrentSearch = false;
    currentPlaylist = normalized;
    currentVideoIndex = 0;
    resumeCheckpointSec = 0;

    showOverlay();
    updateControls();

    const firstId = currentPlaylist[0].id;
    if (youtubeApiReady) {
        initializePlayer(firstId);
    } else {
        pendingVideoId = firstId;
        startApiReadyWatcher();
    }
    return true;
}

export function playYoutubeVideo(queryOrUrl) {
    if (!queryOrUrl) return;
    
    errorCount = 0;
    syncYoutubeApiReady();

    const videoId = extractVideoId(queryOrUrl);

    if (videoId) {
        lastPlaySource = 'url';
        lastSearchQuery = '';
        hasPlayableInCurrentSearch = false;
        // URLから直接再生
        console.log("DEBUG: URLから動画IDを抽出しました:", videoId);
        currentPlaylist = [{ id: videoId, title: '指定されたURLの動画' }];
        currentVideoIndex = 0;
        
        showOverlay();
        updateControls();

        if (youtubeApiReady) {
            initializePlayer(videoId);
        } else {
            pendingVideoId = videoId;
        }
    } else {
        lastPlaySource = 'search';
        lastSearchQuery = String(queryOrUrl || '').trim();
        hasPlayableInCurrentSearch = false;
        // キーワードで検索
        fetch(`/api/youtube_search?q=${encodeURIComponent(queryOrUrl)}`)
            .then(response => response.json())
            .then(data => {
                if (data.videos && data.videos.length > 0) {
                    currentPlaylist = data.videos;
                    currentVideoIndex = 0;
                    
                    showOverlay();
                    updateControls(); 

                    console.log("DEBUG: YouTube動画を検索しました:", currentPlaylist);
                    const firstVideoId = currentPlaylist[currentVideoIndex].id;
                    console.log("DEBUG: 再生を試みます (videoId:", firstVideoId, ")");

                    if (youtubeApiReady) {
                        initializePlayer(firstVideoId);
                    } else {
                        pendingVideoId = firstVideoId;
                    }
                } else {
                    console.warn("No YouTube videos found for query:", queryOrUrl);
                }
            })
            .catch(error => {
                console.error('There has been a problem with your fetch operation:', error);
            });
    }
}

// Event Listeners
closeBtn.addEventListener('click', hideOverlay);
prevBtn.addEventListener('click', playPrevVideo);
nextBtn.addEventListener('click', playNextVideo);

// Make the function globally accessible to be called from non-module scripts
window.playYoutubeVideo = playYoutubeVideo;
window.executeYoutubeIntent = executeYoutubeIntent;
window.getYoutubeContextState = getYoutubeContextState;
window.playYoutubeTrackList = playYoutubeTrackList;

document.addEventListener('youtube:control', (event) => {
    const detail = event?.detail || {};
    if (detail.type === 'save_current') {
        persistYoutubePreference('save_current', detail);
    } else if (detail.type === 'reject_current') {
        persistYoutubePreference('reject_current', detail);
    }
});
