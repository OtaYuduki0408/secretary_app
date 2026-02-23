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

// 要素の取得
const getEl = (id) => document.getElementById(id);

// 公開する関数
window.playYoutubeVideo = playYoutubeVideo;
window.executeYoutubeIntent = executeYoutubeIntent;
window.getYoutubeContextState = getYoutubeContextState;
window.playYoutubeTrackList = playYoutubeTrackList;

let currentChannelId = null;
let currentVideoId = null;

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
    if (isNaN(seconds)) return "0:00";
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

// --- List & Navigation ---

async function fetchRegisteredChannels() {
    const backBtn = getEl('yt-back-to-channels');
    if (backBtn) backBtn.style.display = 'none';
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
        ytListContent.innerHTML = '<div class="yt-empty-msg">登録されているチャンネルがありません。「YouTube全体を検索」してお気に入りのチャンネルを登録しましょう。</div>';
        return;
    }
    // 最大9件
    channels.slice(0, 9).forEach((c, i) => {
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
    const backBtn = getEl('yt-back-to-channels');
    
    if (ytListTitle) ytListTitle.textContent = `${title} の動画`;
    if (backBtn) {
        backBtn.style.display = 'block';
        backBtn.onclick = fetchRegisteredChannels;
    }
    if (ytListContent) ytListContent.innerHTML = '<div class="yt-loading-spinner">動画を取得中...</div>';
    
    try {
        const res = await fetch(`/api/youtube/channels/${channelId}/videos`);
        const videos = await res.json();
        currentPlaylist = videos.map(v => ({ 
            id: v.video_id, 
            title: v.title, 
            thumbnail_url: v.thumbnail_url,
            channel_id: channelId,
            channel_title: title
        }));
        // 最大9件表示
        renderVideoList(currentPlaylist.slice(0, 9));
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
        if (v.id === currentVideoId) item.classList.add('active');
        item.innerHTML = `
            <span class="yt-item-num">${i + 1}</span>
            <img class="yt-item-thumb" src="${v.thumbnail_url}">
            <div class="yt-item-info">
                <div class="yt-item-title">${v.title}</div>
                <div class="yt-item-meta">YouTube</div>
            </div>
        `;
        item.onclick = () => {
            currentVideoIndex = i;
            playYoutubeVideo(v.id, v);
        };
        ytListContent.appendChild(item);
    });
}

// --- Video Features ---

async function summarizeVideo() {
    if (!currentVideoId) return;
    const ytSummaryText = getEl('yt-summary-text');
    if (ytSummaryText) ytSummaryText.textContent = "要約を生成中...";
    try {
        const res = await fetch('/api/youtube/summarize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ video_id: currentVideoId })
        });
        const data = await res.json();
        if (ytSummaryText) ytSummaryText.textContent = data.summary;
        if (typeof window.speak === 'function') window.speak(data.summary);
    } catch (e) {
        if (ytSummaryText) ytSummaryText.textContent = "要約の生成に失敗しました。";
    }
}

async function fetchRecommendations(videoId, title, channelTitle) {
    const recommendationsList = getEl('yt-recommendations-list');
    const nextUnwatchedEl = getEl('yt-next-unwatched');
    if (!recommendationsList) return;

    recommendationsList.innerHTML = '<p class="yt-side-empty">取得中...</p>';
    if (nextUnwatchedEl) nextUnwatchedEl.innerHTML = '<p class="yt-side-empty">選定中...</p>';

    try {
        // サーバー側の新しいスマート検索を使用
        const res = await fetch(`/api/youtube/recommendations?video_id=${videoId}&q=${encodeURIComponent(channelTitle)}`);
        const data = await res.json();
        const videos = data.videos || [];
        
        recommendationsList.innerHTML = '';
        
        if (videos.length === 0) {
            recommendationsList.innerHTML = '<p class="yt-side-empty">関連動画が見つかりませんでした</p>';
            if (nextUnwatchedEl) nextUnwatchedEl.innerHTML = '<p class="yt-side-empty">なし</p>';
            return;
        }

        // 11-19番として最大9件表示
        videos.slice(0, 9).forEach((v, i) => {
            const card = document.createElement('div');
            card.className = 'yt-recommendation-card';
            card.innerHTML = `
                <span class="yt-recom-num">${i + 11}</span>
                <img class="yt-recom-thumb" src="${v.thumbnail_url}">
                <div class="yt-recom-title">${v.title}</div>
            `;
            card.onclick = () => playYoutubeVideo(v.id, v);
            recommendationsList.appendChild(card);
        });

        // 「次の動画」をランダムに選定 (21番)
        if (nextUnwatchedEl) {
            const randomIndex = Math.floor(Math.random() * Math.min(videos.length, 10));
            const next = videos[randomIndex];
            nextUnwatchedEl.innerHTML = `
                <div class="yt-recommendation-card">
                    <span class="yt-recom-num">21</span>
                    <img class="yt-recom-thumb" src="${next.thumbnail_url}">
                    <div class="yt-recom-title">${next.title}</div>
                </div>
            `;
            nextUnwatchedEl.onclick = () => playYoutubeVideo(next.id, next);
        }
    } catch (e) {
        console.error("Failed to fetch recommendations:", e);
        recommendationsList.innerHTML = '<p class="yt-side-empty">取得失敗</p>';
    }
}

function updateVideoDetails(video) {
    console.log("DEBUG: updateVideoDetails called with video:", video);
    const videoTitleEl = getEl('youtube-video-title');
    const ytChannelNameEl = getEl('yt-channel-name');
    const ytChannelThumbEl = getEl('yt-channel-thumb');
    const registerBtn = getEl('yt-register-btn');
    const nextUnwatchedEl = getEl('yt-next-unwatched');

    const title = video.title || '動画を再生中';
    const channelTitle = video.channel_title || video.artist || '--';

    if (videoTitleEl) videoTitleEl.textContent = title;
    if (ytChannelNameEl) ytChannelNameEl.textContent = channelTitle;
    
    // ループ防止のため、新しい動画の情報を取得する前に「次」をクリア
    if (nextUnwatchedEl) nextUnwatchedEl.innerHTML = '<p class="yt-side-empty">更新中...</p>';

    currentVideoId = video.id || video.video_id;
    currentChannelId = video.channel_id;
    console.log("DEBUG: currentChannelId set to:", currentChannelId);

    // 正しいチャンネルアイコンを取得
    if (currentChannelId && ytChannelThumbEl) {
        fetch(`/api/youtube/channel_details?id=${currentChannelId}`)
            .then(r => r.json())
            .then(info => {
                if (info.thumbnail_url) ytChannelThumbEl.src = info.thumbnail_url;
            })
            .catch(e => console.error("Icon fetch failed:", e));
    }

    if (registerBtn) {
        registerBtn.textContent = "チャンネル登録";
        registerBtn.classList.remove('registered');
        registerBtn.onclick = registerCurrentChannel;
    }

    // スマートなおすすめ取得と次の動画選定
    fetchRecommendations(currentVideoId, title, channelTitle);
}

async function registerCurrentChannel() {
    console.log("DEBUG: registerCurrentChannel called. currentChannelId:", currentChannelId);
    if (!currentChannelId) {
        alert("チャンネルIDが取得できていないため登録できません。一度検索し直してください。");
        return;
    }
    const registerBtn = getEl('yt-register-btn');
    try {
        const res = await fetch('/api/youtube/channels', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel_id: currentChannelId })
        });
        const data = await res.json();
        console.log("DEBUG: Server response for registration:", data);
        
        if (data.id || !data.error) {
            alert("チャンネルを登録しました！");
            if (registerBtn) {
                registerBtn.textContent = "登録済み";
                registerBtn.classList.add('registered');
            }
            fetchRegisteredChannels();
        } else {
            alert("登録に失敗しました: " + (data.error || "不明なエラー"));
        }
    } catch (e) {
        console.error("Registration failed:", e);
        alert("通信エラーが発生しました。");
    }
}

// --- Player Core ---

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
                'onReady': (e) => { 
                    e.target.playVideo(); 
                    updateFooterIcons();
                },
                'onStateChange': onPlayerStateChange,
                'onError': (e) => { errorCount++; if (errorCount < MAX_ERRORS) playNextVideo(); }
            }
        });
    }
}

function onPlayerStateChange(event) {
    lastPlayerState = event.data;
    updateFooterIcons();
    if (event.data === YT.PlayerState.PLAYING) {
        errorCount = 0;
    }
    if (event.data === YT.PlayerState.ENDED) {
        // 視聴履歴をサーバーに保存
        if (currentVideoId) {
            fetch('/api/youtube/history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    video_id: currentVideoId, 
                    title: getEl('youtube-video-title')?.textContent || '',
                    is_completed: true 
                })
            }).catch(err => console.error("Failed to save history:", err));
        }
        playNextUnwatched();
    }
}

function playNextUnwatched() {
    console.log("DEBUG: playNextUnwatched called.");
    const nextCard = getEl('yt-next-unwatched')?.querySelector('.yt-recommendation-card');
    if (nextCard) {
        nextCard.click();
        return true;
    }
    // カードがない場合は通常の次の動画
    return playNextPlaylistVideo();
}

function playNextPlaylistVideo() {
    if (currentVideoIndex < currentPlaylist.length - 1) {
        currentVideoIndex++;
        const nextVideo = currentPlaylist[currentVideoIndex];
        playYoutubeVideo(nextVideo.id, nextVideo);
        return true;
    }
    return false;
}

function playPrevVideo() {
    if (currentVideoIndex > 0) {
        currentVideoIndex--;
        const prevVideo = currentPlaylist[currentVideoIndex];
        playYoutubeVideo(prevVideo.id, prevVideo);
    }
}

function playYoutubeVideo(queryOrUrl, videoHint = null) {
    if (!queryOrUrl) return;
    errorCount = 0;
    showOverlay();

    // 検索やURL再生時は「戻る」ボタンを表示してチャンネル一覧に戻れるようにする
    const backBtn = getEl('yt-back-to-channels');
    if (backBtn) {
        backBtn.style.display = 'block';
        backBtn.onclick = fetchRegisteredChannels;
    }

    const videoId = (typeof queryOrUrl === 'string' && queryOrUrl.length === 11) ? queryOrUrl : extractVideoId(queryOrUrl);

    if (videoId) {
        if (videoHint) {
            updateVideoDetails(videoHint);
        } else {
            // ヒントがない場合は詳細をAPIで取得
            fetch(`/api/youtube/recommendations?video_id=${videoId}&title=detail_fetch`)
                .then(r => r.json()).then(d => {
                    const v = d.videos?.find(x => x.id === videoId);
                    if (v) updateVideoDetails(v);
                });
        }
        initializePlayer(videoId);
    } else {
        // 検索
        fetch(`/api/youtube_search?q=${encodeURIComponent(queryOrUrl)}`)
            .then(r => r.json())
            .then(data => {
                if (data.videos && data.videos.length > 0) {
                    currentPlaylist = data.videos;
                    currentVideoIndex = 0;
                    const v = currentPlaylist[0];
                    updateVideoDetails(v);
                    initializePlayer(v.id);
                    renderVideoList(currentPlaylist);
                }
            });
    }
}

function extractVideoId(url) {
    if (!url) return null;
    const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?|live)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const matches = String(url).match(regex);
    return matches ? matches[1] : null;
}

// --- Controls ---

function updateFooterIcons() {
    const btn = getEl('youtube-play-pause-btn');
    if (!btn) return;
    const isPlaying = lastPlayerState === YT.PlayerState.PLAYING;
    btn.innerHTML = isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
}

function togglePlayPause() {
    if (!player) return;
    if (lastPlayerState === YT.PlayerState.PLAYING) {
        player.pauseVideo();
    } else {
        player.playVideo();
    }
}

function seekBy(seconds) {
    if (!player) return;
    const current = player.getCurrentTime();
    player.seekTo(current + seconds, true);
}

function showOverlay() {
    const overlay = getEl('youtube-overlay');
    if (!overlay) return;
    overlay.classList.remove('youtube-overlay-hidden');
    if (currentPlaylist.length === 0) fetchRegisteredChannels();
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

function executeYoutubeIntent(payload = {}) {
    const intent = String(payload.intent || '').trim().toLowerCase();
    const value = payload.value;

    console.log("DEBUG: executeYoutubeIntent:", intent, value);

    if (intent === 'open_window') { showOverlay(); return true; }
    if (intent === 'close' || intent === 'close_window') { hideOverlay(); return true; }
    
    // UI 切り替え
    if (intent === 'show_channels') { fetchRegisteredChannels(); return true; }
    if (intent === 'show_history') { 
        // 履歴表示ロジック
        return true; 
    }

    if (intent === 'next') { return playNextUnwatched(); }

    if (intent === 'play_index' || intent === 'open_channel') {
        const num = parseInt(value);
        
        // 1~9: 中央リスト
        if (num >= 1 && num <= 9) {
            const items = getEl('yt-list-content')?.querySelectorAll('.yt-list-item');
            if (items && items[num - 1]) {
                items[num - 1].click();
                return true;
            }
        }
        // 10: 次の未視聴動画
        if (num === 10) {
            return playNextUnwatched();
        }
        // 11~19: おススメ動画
        if (num >= 11 && num <= 19) {
            const cards = getEl('yt-recommendations-list')?.querySelectorAll('.yt-recommendation-card');
            if (cards && cards[num - 11]) {
                cards[num - 11].click();
                return true;
            }
        }
    }
    
    if (intent === 'skip_forward') { seekBy(10); return true; }
    if (intent === 'skip_backward') { seekBy(-10); return true; }
    if (intent === 'summarize') { summarizeVideo(); return true; }
    
    // 基本操作
    if (intent === 'pause') { player?.pauseVideo(); return true; }
    if (intent === 'resume') { player?.playVideo(); return true; }

    return false;
}

function getYoutubeContextState() {
    return {
        active: !!(player || pendingVideoId),
        overlay_visible: isOverlayVisible(),
        playing: lastPlayerState === YT.PlayerState.PLAYING,
        current_title: currentPlaylist[currentVideoIndex]?.title || '',
        current_video_id: currentVideoId
    };
}

function playYoutubeTrackList(trackList, options = {}) {
    if (!trackList || trackList.length === 0) return false;
    currentPlaylist = trackList.map(v => ({ id: v.id || v.video_id, title: v.title }));
    currentVideoIndex = 0;
    playYoutubeVideo(currentPlaylist[0].id, currentPlaylist[0]);
    renderVideoList(currentPlaylist);
    return true;
}

// --- Event Listeners ---

document.addEventListener('DOMContentLoaded', () => {
    const closeBtn = getEl('youtube-close-btn');
    if (closeBtn) closeBtn.onclick = hideOverlay;

    const pBtn = getEl('youtube-play-pause-btn');
    if (pBtn) pBtn.onclick = togglePlayPause;

    const nextBtn = getEl('youtube-next-btn');
    if (nextBtn) nextBtn.onclick = playNextVideo;

    const prevBtn = getEl('youtube-prev-btn');
    if (prevBtn) prevBtn.onclick = playPrevVideo;

    const fwdBtn = getEl('youtube-skip-forward-btn');
    if (fwdBtn) fwdBtn.onclick = () => seekBy(10);

    const backBtn = getEl('youtube-skip-back-btn');
    if (backBtn) backBtn.onclick = () => seekBy(-10);

    const progBar = getEl('yt-progress-bar');
    if (progBar) {
        progBar.oninput = (e) => {
            if (!player) return;
            const duration = player.getDuration();
            player.seekTo(duration * (e.target.value / 100), true);
        };
    }

    const searchInput = getEl('yt-global-search');
    const searchBtn = getEl('yt-search-btn');
    const performSearch = () => {
        const q = searchInput.value.trim();
        if (q) playYoutubeVideo(q);
    };
    if (searchBtn) searchBtn.onclick = performSearch;
    if (searchInput) searchInput.onkeypress = (e) => { if (e.key === 'Enter') performSearch(); };
});
