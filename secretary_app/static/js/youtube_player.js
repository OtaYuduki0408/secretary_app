let player;
let currentPlaylist = [];
let currentVideoIndex = 0;
let youtubeApiReady = false;
let pendingVideoId = null;

const overlay = document.getElementById('youtube-overlay');
const playerWrapper = document.getElementById('youtube-player-wrapper');
const videoTitle = document.getElementById('youtube-video-title');
const closeBtn = document.getElementById('youtube-close-btn');
const prevBtn = document.getElementById('youtube-prev-btn');
const nextBtn = document.getElementById('youtube-next-btn');

// main.html から呼び出されるための関数
window.setYoutubeApiReady = function(isReady) {
    if (isReady) {
        youtubeApiReady = true;
        console.log("DEBUG: setYoutubeApiReadyが呼ばれ、APIが準備完了になりました。");
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


function initializePlayer(videoId) {
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
                'autoplay': 1 // 自動再生を試みる
            },
            events: {
                'onReady': onPlayerReady,
                'onStateChange': onPlayerStateChange,
                'onError': onPlayerError // エラーハンドリングを追加
            }
        });
    }
}

function onPlayerReady(event) {
    console.log("DEBUG: YouTubeプレーヤーの準備ができました。");
    event.target.playVideo(); // 再生を開始
}

function onPlayerStateChange(event) {
    console.log("DEBUG: プレーヤーの状態が変更されました:", event.data);
    if (event.data === YT.PlayerState.ENDED) {
        playNextVideo();
    }
}

function onPlayerError(event) {
    console.error("DEBUG: YouTubeプレーヤーでエラーが発生しました:", event.data);
    playNextVideo(); // エラー発生時も次の動画へ進む
}

function showOverlay() {
    overlay.classList.remove('youtube-overlay-hidden');
}

function hideOverlay() {
    if (player) {
        player.stopVideo();
    }
    overlay.classList.add('youtube-overlay-hidden');
}

function updateControls() {
    prevBtn.disabled = currentVideoIndex === 0;
    nextBtn.disabled = currentVideoIndex >= currentPlaylist.length - 1;
    if (currentPlaylist[currentVideoIndex]) {
        videoTitle.textContent = currentPlaylist[currentVideoIndex].title;
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

export function playYoutubeVideo(searchQuery) {
    if (!searchQuery) return;

    fetch(`/api/youtube_search?q=${encodeURIComponent(searchQuery)}`)
        .then(response => response.json())
        .then(data => {
            if (data.videos && data.videos.length > 0) {
                currentPlaylist = data.videos;
                currentVideoIndex = 0;
                
                showOverlay();
                updateControls(); 

                console.log("DEBUG: YouTube動画を検索しました:", currentPlaylist);
                const videoId = currentPlaylist[currentVideoIndex].id;
                console.log("DEBUG: 再生を試みます (videoId:", videoId, ")");

                if (youtubeApiReady) {
                    console.log("DEBUG: YouTube IFrame APIは既にロード済みです。initializePlayerを呼び出します。");
                    initializePlayer(videoId);
                } else {
                    console.log("DEBUG: YouTube IFrame APIはまだロードされていません。APIロード後に初期化を試みます。");
                    pendingVideoId = videoId;
                }
            } else {
                console.warn("No YouTube videos found for query:", searchQuery);
            }
        })
        .catch(error => {
            console.error('There has been a problem with your fetch operation:', error);
        });
}

// Event Listeners
closeBtn.addEventListener('click', hideOverlay);
prevBtn.addEventListener('click', playPrevVideo);
nextBtn.addEventListener('click', playNextVideo);

// Make the function globally accessible to be called from non-module scripts
window.playYoutubeVideo = playYoutubeVideo;