// youtube_player.js

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
const MAX_ERRORS = 5;

// 要素の取得 (存在チェックを容易にするため冒頭で)
const getEl = (id) => document.getElementById(id);

// 公開する関数を即座にwindowに登録 (タイミング問題を解消)
window.playYoutubeVideo = playYoutubeVideo;
window.executeYoutubeIntent = executeYoutubeIntent;
window.getYoutubeContextState = getYoutubeContextState;
window.playYoutubeTrackList = playYoutubeTrackList;

let currentChannelId = null;

function isOverlayVisible() {
    const overlay = getEl('youtube-overlay');
    return overlay && !overlay.classList.contains('youtube-overlay-hidden');
}

function updateYoutubeWindowTime() {
    if (!isOverlayVisible()) return;
    const now = new Date();
    const ytTimeEl = getEl('yt-display-time');
    const ytDateEl = getEl('yt-display-date');
    if (ytTimeEl) ytTimeEl.textContent = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (ytDateEl) ytDateEl.textContent = now.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });
}
setInterval(updateYoutubeWindowTime, 1000);

function formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
}

function updateProgress() {
    if (player && typeof player.getCurrentTime === 'function' && typeof player.getDuration === 'function') {
        const current = player.getCurrentTime();
        const duration = player.getDuration();
        const progressBar = getEl('yt-progress-bar');
        const currentPosEl = getEl('yt-current-pos');
        const durationEl = getEl('yt-duration');
        if (duration > 0 && progressBar) {
            progressBar.value = (current / duration) * 100;
            if (currentPosEl) currentPosEl.textContent = formatTime(current);
            if (durationEl) durationEl.textContent = formatTime(duration);
        }
    }
}
setInterval(updateProgress, 1000);

async function fetchRegisteredChannels() {
    try {
        const res = await fetch('/api/youtube/channels');
        const channels = await res.json();
        renderChannelList(channels);
    } catch (e) {
        console.error("Failed to fetch channels:", e);
    }
}

function renderChannelList(channels) {
    const ytListTitle = getEl('yt-list-title');
    const ytListContent = getEl('yt-list-content');
    if (ytListTitle) ytListTitle.textContent = "登録チャンネル";
    if (!ytListContent) return;
    ytListContent.innerHTML = '';
    if (!channels || channels.length === 0) {
        ytListContent.innerHTML = '<div class="yt-empty-msg">登録されているチャンネルがありません。「動画を検索して」お気に入りのチャンネルを登録しましょう。</div>';
        return;
    }
    channels.forEach((c, i) => {
        const item = document.createElement('div');
        item.className = 'yt-list-item';
        item.innerHTML = `
            <span class="yt-item-num">${i + 1}</span>
            <img class="yt-item-thumb" src="${c.thumbnail_url}" style="border-radius: 50%; width: 50px;">
            <div class="yt-item-info">
                <div class="yt-item-title">${c.channel_title}</div>
                <div class="yt-item-meta">${c.category}</div>
            </div>
        `;
        item.onclick = () => openChannel(c.channel_id, c.channel_title);
        ytListContent.appendChild(item);
    });
}

async function openChannel(channelId, title) {
    const ytListTitle = getEl('yt-list-title');
    const ytListContent = getEl('yt-list-content');
    if (ytListTitle) ytListTitle.textContent = `${title} の動画`;
    if (ytListContent) ytListContent.innerHTML = '<div class="yt-loading-spinner">動画を取得中...</div>';
    try {
        const res = await fetch(`/api/youtube/channels/${channelId}/videos`);
        const videos = await res.json();
        currentPlaylist = videos.map(v => ({ id: v.video_id, title: v.title, thumbnail: v.thumbnail_url }));
        renderVideoList(currentPlaylist);
    } catch (e) {
        console.error("Failed to fetch channel videos:", e);
        if (ytListContent) ytListContent.innerHTML = '<div>動画の取得に失敗しました</div>';
    }
}

function renderVideoList(videos) {
    const ytListContent = getEl('yt-list-content');
    if (!ytListContent) return;
    ytListContent.innerHTML = '';
    videos.forEach((v, i) => {
        const item = document.createElement('div');
        item.className = 'yt-list-item';
        item.innerHTML = `
            <span class="yt-item-num">${i + 1}</span>
            <img class="yt-item-thumb" src="${v.thumbnail || v.thumbnail_url}">
            <div class="yt-item-info">
                <div class="yt-item-title">${v.title}</div>
                <div class="yt-item-meta">未視聴</div>
            </div>
        `;
        item.onclick = () => {
            currentVideoIndex = i;
            initializePlayer(v.id);
            showOverlay();
            updateControls();
        };
        ytListContent.appendChild(item);
    });
}

async function summarizeVideo() {
    if (!currentPlaylist[currentVideoIndex]) return;
    const ytSummaryText = getEl('yt-summary-text');
    if (ytSummaryText) ytSummaryText.textContent = "要約を生成中...";
    try {
        const res = await fetch('/api/youtube/summarize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ video_id: currentPlaylist[currentVideoIndex].id })
        });
        const data = await res.json();
        if (ytSummaryText) ytSummaryText.textContent = data.summary;
        if (typeof window.speak === 'function') window.speak(data.summary);
    } catch (e) {
        if (ytSummaryText) ytSummaryText.textContent = "要約の生成に失敗しました。";
    }
}

function setPlaybackSpeed(speed) {
    if (player && typeof player.setPlaybackRate === 'function') {
        player.setPlaybackRate(speed);
        const speedEl = getEl('yt-status-speed');
        if (speedEl) speedEl.textContent = speed.toFixed(1);
    }
}

async function registerCurrentChannel() {
    if (!currentChannelId) return;
    const registerBtn = getEl('yt-register-btn');
    try {
        const res = await fetch('/api/youtube/channels', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel_id: currentChannelId })
        });
        const data = await res.json();
        if (data.id && registerBtn) {
            registerBtn.textContent = "登録済み";
            registerBtn.classList.add('registered');
            fetchRegisteredChannels();
        }
    } catch (e) {
        console.error("Registration failed:", e);
    }
}

async function fetchRecommendations(title) {
    const recommendationsList = getEl('yt-recommendations-list');
    if (!recommendationsList) return;
    recommendationsList.innerHTML = '<p class="yt-side-empty">取得中...</p>';
    try {
        const res = await fetch(`/api/youtube/recommendations?q=${encodeURIComponent(title)}&title=${encodeURIComponent(title)}`);
        const data = await res.json();
        const videos = data.videos || [];
        recommendationsList.innerHTML = '';
        videos.slice(0, 5).forEach((v, i) => {
            const card = document.createElement('div');
            card.className = 'yt-recommendation-card';
            card.innerHTML = `
                <span class="yt-recom-num">${i + 1}</span>
                <img class="yt-recom-thumb" src="${v.thumbnail_url}">
                <div class="yt-recom-title">${v.title}</div>
            `;
            card.onclick = () => playYoutubeVideo(v.id);
            recommendationsList.appendChild(card);
        });
    } catch (e) {
        recommendationsList.innerHTML = '<p class="yt-side-empty">取得失敗</p>';
    }
}

async function fetchNextUnwatched(channelId) {
    const nextUnwatchedEl = getEl('yt-next-unwatched');
    if (!nextUnwatchedEl) return;
    try {
        const res = await fetch(`/api/youtube/channels/${channelId}/videos`);
        const videos = await res.json();
        const next = videos[0]; 
        if (next) {
            nextUnwatchedEl.innerHTML = `
                <div class="yt-recommendation-card">
                    <img class="yt-recom-thumb" src="${next.thumbnail_url}">
                    <div class="yt-recom-title">${next.title}</div>
                </div>
            `;
            nextUnwatchedEl.onclick = () => playYoutubeVideo(next.video_id);
        }
    } catch (e) {
        nextUnwatchedEl.innerHTML = '<p class="yt-side-empty">なし</p>';
    }
}

function updateVideoDetails(video) {
    const videoTitle = getEl('youtube-video-title');
    const ytChannelNameEl = getEl('yt-channel-name');
    const ytChannelThumbEl = getEl('yt-channel-thumb');
    const registerBtn = getEl('yt-register-btn');

    if (videoTitle) videoTitle.textContent = video.title;
    if (ytChannelNameEl) ytChannelNameEl.textContent = video.channel_title || video.artist || '--';
    if (ytChannelThumbEl) ytChannelThumbEl.src = video.thumbnail_url || '';
    
    currentChannelId = video.channel_id;
    if (registerBtn) {
        registerBtn.textContent = "チャンネル登録";
        registerBtn.classList.remove('registered');
        registerBtn.onclick = registerCurrentChannel;
    }

    fetchRecommendations(video.title);
    if (currentChannelId) fetchNextUnwatched(currentChannelId);
}

function syncYoutubeApiReady() {
    if (youtubeApiReady) return true;
    if (!!(window.YT && typeof window.YT.Player === 'function')) {
        youtubeApiReady = true;
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
            if (pendingVideoId) {
                initializePlayer(pendingVideoId);
                pendingVideoId = null;
            }
        }
    }, 200);
}

function extractVideoId(url) {
    if (!url) return null;
    const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?|live)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const matches = url.match(regex);
    return matches ? matches[1] : null;
}

function initializePlayer(videoId) {
    if (!syncYoutubeApiReady()) {
        pendingVideoId = videoId;
        startApiReadyWatcher();
        return;
    }

    if (player) {
        player.loadVideoById(videoId);
    } else {
        player = new YT.Player('youtube-player', {
            videoId: videoId,
            playerVars: { 'playsinline': 1, 'autoplay': 1, 'origin': window.location.origin },
            events: {
                'onReady': (e) => { e.target.playVideo(); },
                'onStateChange': onPlayerStateChange,
                'onError': onPlayerError
            }
        });
    }
}

function onPlayerStateChange(event) {
    lastPlayerState = event.data;
    if (event.data === YT.PlayerState.PLAYING) {
        errorCount = 0;
    }
    if (event.data === YT.PlayerState.ENDED) {
        playNextVideo();
    }
}

function onPlayerError(event) {
    errorCount++;
    if (errorCount < MAX_ERRORS) playNextVideo();
}

function showOverlay() {
    const overlay = getEl('youtube-overlay');
    if (!overlay) return;
    overlay.classList.remove('youtube-overlay-hidden');
    fetchRegisteredChannels();
    updateYoutubeWindowTime();
}

function hideOverlay() {
    if (player) {
        player.stopVideo();
        player.destroy();
        player = null;
    }
    const overlay = getEl('youtube-overlay');
    if (overlay) overlay.classList.add('youtube-overlay-hidden');
}

function hideOverlayOnly() {
    const overlay = getEl('youtube-overlay');
    if (overlay) overlay.classList.add('youtube-overlay-hidden');
}

function updateControls() {
    const videoTitle = getEl('youtube-video-title');
    if (currentPlaylist[currentVideoIndex] && videoTitle) {
        videoTitle.textContent = currentPlaylist[currentVideoIndex].title || '動画を再生中';
    }
}

function playNextVideo() {
    if (currentVideoIndex < currentPlaylist.length - 1) {
        currentVideoIndex++;
        const nextVideo = currentPlaylist[currentVideoIndex];
        initializePlayer(nextVideo.id);
        updateVideoDetails(nextVideo);
        updateControls();
    } else {
        hideOverlay();
    }
}

function playPrevVideo() {
    if (currentVideoIndex > 0) {
        currentVideoIndex--;
        const prevVideo = currentPlaylist[currentVideoIndex];
        initializePlayer(prevVideo.id);
        updateVideoDetails(prevVideo);
        updateControls();
    }
}

function executeYoutubeIntent(payload = {}) {
    const intent = String(payload.intent || '').trim().toLowerCase();
    const value = payload.value;

    if (intent === 'open_window') {
        showOverlay();
        return true;
    }
    if (intent === 'close') {
        hideOverlay();
        return true;
    }
    if (intent === 'play_index') {
        const idx = parseInt(value) - 1;
        if (currentPlaylist[idx]) {
            currentVideoIndex = idx;
            initializePlayer(currentPlaylist[idx].id);
            updateVideoDetails(currentPlaylist[idx]);
            updateControls();
            return true;
        }
    }
    // ... 他のインテントも同様に実装
    return false;
}

function getYoutubeContextState() {
    return {
        active: !!(player || pendingVideoId),
        overlay_visible: isOverlayVisible(),
        current_title: currentPlaylist[currentVideoIndex]?.title || '',
        current_video_id: currentPlaylist[currentVideoIndex]?.id || ''
    };
}

function playYoutubeTrackList(trackList, options = {}) {
    if (!trackList || trackList.length === 0) return false;
    currentPlaylist = trackList.map(v => ({ id: v.id, title: v.title }));
    currentVideoIndex = 0;
    showOverlay();
    initializePlayer(currentPlaylist[0].id);
    updateVideoDetails(currentPlaylist[0]);
    return true;
}

function playYoutubeVideo(queryOrUrl) {
    if (!queryOrUrl) return;
    const videoId = extractVideoId(queryOrUrl);
    if (videoId) {
        currentPlaylist = [{ id: videoId, title: '指定された動画', channel_id: null }];
        currentVideoIndex = 0;
        showOverlay();
        initializePlayer(videoId);
        updateVideoDetails(currentPlaylist[0]);
    } else {
        fetch(`/api/youtube_search?q=${encodeURIComponent(queryOrUrl)}`)
            .then(r => r.json())
            .then(data => {
                if (data.videos && data.videos.length > 0) {
                    currentPlaylist = data.videos;
                    currentVideoIndex = 0;
                    showOverlay();
                    initializePlayer(currentPlaylist[0].id);
                    updateVideoDetails(currentPlaylist[0]);
                }
            });
    }
}

// 既存のリスナー
const closeBtn = getEl('youtube-close-btn');
if (closeBtn) closeBtn.onclick = hideOverlay;
const prevBtn = getEl('youtube-prev-btn');
if (prevBtn) prevBtn.onclick = playPrevVideo;
const nextBtn = getEl('youtube-next-btn');
if (nextBtn) nextBtn.onclick = playNextVideo;
