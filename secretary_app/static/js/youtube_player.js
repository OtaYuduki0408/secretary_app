let player;
let currentPlaylist = [];
let currentVideoIndex = 0;

const overlay = document.getElementById('youtube-overlay');
const playerWrapper = document.getElementById('youtube-player-wrapper');
const videoTitle = document.getElementById('youtube-video-title');
const closeBtn = document.getElementById('youtube-close-btn');
const prevBtn = document.getElementById('youtube-prev-btn');
const nextBtn = document.getElementById('youtube-next-btn');

// This function creates an <iframe> (and YouTube player)
// after the API code downloads. It's called automatically.
// We are declaring it on window because this is a module.
window.onYouTubeIframeAPIReady = function() {
  // Player will be initialized on demand.
}

function initializePlayer(videoId) {
    if (player) {
        player.loadVideoById(videoId);
    } else {
        player = new YT.Player('youtube-player', {
            height: '360',
            width: '640',
            videoId: videoId,
            playerVars: {
                'playsinline': 1,
                'autoplay': 1
            },
            events: {
                'onReady': onPlayerReady,
                'onStateChange': onPlayerStateChange
            }
        });
    }
}

function onPlayerReady(event) {
    event.target.playVideo();
}

function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.ENDED) {
        playNextVideo();
    }
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
        player.loadVideoById(currentPlaylist[currentVideoIndex].id);
        updateControls();
    } else {
        hideOverlay();
    }
}

function playPrevVideo() {
    if (currentVideoIndex > 0) {
        currentVideoIndex--;
        player.loadVideoById(currentPlaylist[currentVideoIndex].id);
        updateControls();
    }
}

// Public function to be called from other scripts
export function playYoutubeVideo(searchQuery) {
    if (!searchQuery) return;

    fetch(`/api/youtube_search?q=${encodeURIComponent(searchQuery)}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            if (data.videos && data.videos.length > 0) {
                currentPlaylist = data.videos;
                currentVideoIndex = 0;
                
                showOverlay();
                
                console.log("DEBUG: YouTube動画を検索しました:", currentPlaylist); // ★追加
                console.log("DEBUG: 再生を試みます (videoId:", currentPlaylist[currentVideoIndex].id, ")"); // ★追加

                if (typeof YT === 'undefined' || typeof YT.Player === 'undefined') {
                     console.log("DEBUG: YouTube IFrame APIがまだロードされていません。onYouTubeIframeAPIReadyを再定義します。"); // ★追加
                     window.onYouTubeIframeAPIReady = function() {
                         initializePlayer(currentPlaylist[currentVideoIndex].id);
                         console.log("DEBUG: onYouTubeIframeAPIReadyからinitializePlayerを呼び出しました。"); // ★追加
                     };
                } else {
                    console.log("DEBUG: YouTube IFrame APIは既にロードされています。initializePlayerを直接呼び出します。"); // ★追加
                    initializePlayer(currentPlaylist[currentVideoIndex].id);
                }
                updateControls();
            } else {
                console.warn("No YouTube videos found for query:", searchQuery);
                // Here you could dispatch a notification to the user
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
