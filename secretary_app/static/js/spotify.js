/* ============================
   Spotify page logic + Web Playback
   - Search/History/Playlist add
   - Inline play: track URI / playlist context
   - Fixed player bar
   - Repeat() / Shuffle()
============================ */

/* =====  ===== */
const HISTORY_KEY = 'spotify_search_history';
const HISTORY_MAX = 10;

/* ===== Web Playback SDK ===== */
let _player = null;
let _deviceId = null;
let _lastState = null;

// Repeat / Shuffle I
let _repeatMode = 'off';   // 'off' | 'context' | 'track'
let _shuffleOn  = false;

async function fetchAccessToken() {
  const r = await fetch('/api/spotify/token');
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error(j.error || 'token fetch failed');
  return j.access_token;
}

async function ensurePlayer() {
  if (_player && _deviceId) return { player: _player, deviceId: _deviceId };

  // SDK
  await new Promise((resolve) => {
    if (window.Spotify) return resolve();
    const iv = setInterval(() => { if (window.Spotify) { clearInterval(iv); resolve(); } }, 30);
  });

  _player = new Spotify.Player({
    name: 'Voice Secretary Player',
    getOAuthToken: async (cb) => { try { cb(await fetchAccessToken()); } catch {} },
    volume: 0.8
  });

  // state 
// state 
_player.addListener('player_state_changed', (state) => {
  _lastState = state;
  updateBarFromState(state);

  // ONFF
  if (state && !state.paused) {
    startProgressTimer();
  } else {
    stopProgressTimer();
  }

  //  /  DK
  try {
    // repeat_mode: 0=off, 1=track(1), 2=context(
    const rm = state?.repeat_mode;
    _repeatMode = (rm === 1) ? 'track' : (rm === 2 ? 'context' : 'off');
    if (bar?.loop) {
      bar.loop.title = _repeatMode === 'off' ? 'Repeat: Off' : (_repeatMode === 'context' ? 'Repeat: Playlist' : 'Repeat: Track');
      bar.loop.style.opacity = (_repeatMode === 'off') ? .6 : 1;
    }

    // shuffle
    _shuffleOn = !!state?.shuffle;
    if (bar?.shuffle) {
      bar.shuffle.title = _shuffleOn ? 'Shuffle: ON' : 'Shuffle: OFF';
      bar.shuffle.style.opacity = _shuffleOn ? 1 : .6;
    }
  } catch {}
});


  // ready 
  _player.addListener('ready', async ({ device_id }) => {
    _deviceId = device_id;
    try {
      const token = await fetchAccessToken();
      await fetch('https://api.spotify.com/v1/me/player', {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_ids: [device_id], play: false })
      });
    } catch (e) {
      console.warn('transfer playback failed', e);
    }
  });

  _player.addListener('initialization_error', ({ message }) => console.error('init_error:', message));
  _player.addListener('authentication_error', ({ message }) => console.error('auth_error:', message));
  _player.addListener('account_error', ({ message }) => {
    alert('Spotify Premium account required.');
    console.error('account_error:', message);
  });
  _player.addListener('playback_error', ({ message }) => console.error('playback_error:', message));

  const ok = await _player.connect();
  if (!ok) throw new Error('player.connect() failed');

  // deviceId 
  await new Promise((resolve) => {
    const iv = setInterval(() => { if (_deviceId) { clearInterval(iv); resolve(); } }, 30);
  });
  return { player: _player, deviceId: _deviceId };
}

/* ===== Web API helpers ===== */
async function ensureActiveAnd(fnRetryOnce) {
  const token = await fetchAccessToken();
  const { deviceId } = await ensurePlayer();
  await fetch('https://api.spotify.com/v1/me/player', {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_ids: [deviceId], play: false })
  });
  if (typeof fnRetryOnce === 'function') return fnRetryOnce();
}

async function apiPlayUris(uris) {
  const { deviceId } = await ensurePlayer();
  const token = await fetchAccessToken();
  const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ uris })
  });
  if (!res.ok) throw await readErr(res);
  showBar();
}

async function apiPlayContext(contextUri, offset = 0) {
  const { deviceId } = await ensurePlayer();
  const token = await fetchAccessToken();
  const body = { context_uri: contextUri };
  if (offset) body.offset = { position: offset };
  const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw await readErr(res);
  showBar();
}

async function apiPause(){
  const t = await fetchAccessToken();
  const res = await fetch('https://api.spotify.com/v1/me/player/pause', {
    method:'PUT', headers:{ 'Authorization': `Bearer ${t}` }
  });
  if (res.status === 404) await ensureActiveAnd(() => apiPause());
}

async function apiResume(){
  const t = await fetchAccessToken();
  const { deviceId } = await ensurePlayer();
  const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
    method:'PUT',
    headers:{ 'Authorization': `Bearer ${t}`, 'Content-Type':'application/json' },
    body: JSON.stringify({})
  });
  if (res.status === 404) await ensureActiveAnd(() => apiResume());
}

async function apiNext(){
  const t = await fetchAccessToken();
  const res = await fetch('https://api.spotify.com/v1/me/player/next', {
    method:'POST', headers:{ 'Authorization': `Bearer ${t}` }
  });
  if (res.status === 404) await ensureActiveAnd(() => apiNext());
}

async function apiPrev(){
  const t = await fetchAccessToken();
  const res = await fetch('https://api.spotify.com/v1/me/player/previous', {
    method:'POST', headers:{ 'Authorization': `Bearer ${t}` }
  });
  if (res.status === 404) await ensureActiveAnd(() => apiPrev());
}


async function apiSetShuffle(on) {
  const t = await fetchAccessToken();
  const { deviceId } = await ensurePlayer();
  await fetch(`https://api.spotify.com/v1/me/player/shuffle?state=${on}&device_id=${encodeURIComponent(deviceId)}`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${t}` }
  });
}

async function apiSetRepeat(mode /* 'off' | 'context' | 'track' */) {
  const t = await fetchAccessToken();
  const { deviceId } = await ensurePlayer();
  await fetch(`https://api.spotify.com/v1/me/player/repeat?state=${mode}&device_id=${encodeURIComponent(deviceId)}`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${t}` }
  });
}


async function readErr(res){
  let msg = `HTTP ${res.status}`;
  try{ const j = await res.json(); msg = j?.error?.message || msg; }catch{}
  return new Error(msg);
}

function ensurePlayerBarElements(){
  if(!document.body) return;
  if(!document.getElementById('vs-playerbar')){
    const barNode = document.createElement('div');
    barNode.id = 'vs-playerbar';
    barNode.hidden = true;
    barNode.innerHTML = [
      '<div class="vs-section vs-main-controls">',
        '<button id="vs-prev" class="vs-button" title="Prev">&#9198;</button>',
        '<button id="vs-play" class="vs-button" title="Play/Pause">&#9654;</button>',
        '<button id="vs-next" class="vs-button" title="Next">&#9197;</button>',
      '</div>',
      '<div class="vs-section vs-timeline">',
        '<span id="vs-time">0:00</span>',
        '<input id="vs-seek" type="range" min="0" max="1000" value="0" />',
        '<span id="vs-dur">0:00</span>',
      '</div>',
      '<div class="vs-section vs-options">',
        '<button id="vs-loop" class="vs-button" title="Repeat">&#128257;</button>',
        '<button id="vs-shuffle" class="vs-button" title="Shuffle">&#128256;</button>',
        '<input id="vs-vol" type="range" min="0" max="100" value="80" title="Volume" />',
      '</div>'
    ].join('');
    document.body.appendChild(barNode);
  }
  if(!document.getElementById('toast')){
    const toastNode = document.createElement('div');
    toastNode.id = 'toast';
    toastNode.hidden = true;
    toastNode.setAttribute('aria-live', 'polite');
    toastNode.setAttribute('aria-atomic', 'true');
    document.body.appendChild(toastNode);
  }
}

ensurePlayerBarElements();

/* ===== Fixed player bar ===== */
const bar = {
  root: document.getElementById('vs-playerbar'),
  prev: document.getElementById('vs-prev'),
  play: document.getElementById('vs-play'),
  next: document.getElementById('vs-next'),
  time: document.getElementById('vs-time'),
  dur:  document.getElementById('vs-dur'),
  seek: document.getElementById('vs-seek'),
  vol:  document.getElementById('vs-vol'),
  loop: document.getElementById('vs-loop'),
  shuffle: document.getElementById('vs-shuffle'),   // 
};
function showBar(){ if(bar.root) bar.root.hidden = false; }
function fmt(ms){ if(!ms&&ms!==0) return '0:00'; const s=Math.floor(ms/1000); const m=Math.floor(s/60); const ss=String(s%60).padStart(2,'0'); return `${m}:${ss}`; }

function updateBarFromState(state){
  if(!bar.root){
    return;
  }
  if(!state){
    updateInlinePlayState(null, false);
    return;
  }
  showBar();
  const pos = state.position || 0;
  const dur = state.duration || 0;
  bar.time.textContent = fmt(pos);
  bar.dur.textContent  = fmt(dur);
  bar.seek.max = dur ? dur : 1000;
  bar.seek.value = pos;

  const paused = state.paused;
  if (paused) {
    bar.play.textContent = '\u25B6'; // play icon
    if (bar.play) bar.play.title = 'Play';
  } else {
    bar.play.textContent = '\u23F8'; // pause icon
    if (bar.play) bar.play.title = 'Pause';
  }
  bar.prev.disabled = !state.track_window?.previous_tracks?.length;
  bar.next.disabled = !state.track_window?.next_tracks?.length;
  updateInlinePlayState(state?.track_window?.current_track?.uri, !paused);
}

function getInlineButtonLabel(button, key, fallback){
  const value = button?.dataset?.[key];
  if (value && value.trim().length) return value.trim();
  return fallback;
}

function updateInlinePlayState(activeUri, isPlaying){
  const playingUri = isPlaying ? activeUri : null;
  document.querySelectorAll('.js-track-play[data-uri]').forEach((button)=>{
    const defaultLabel = getInlineButtonLabel(
      button,
      'label',
      (button.textContent || 'Play').trim() || 'Play'
    );
    const playingLabel = getInlineButtonLabel(button, 'playingLabel', 'Playing');
    const isActive = !!playingUri && button.dataset.uri === playingUri;
    button.classList.toggle('is-playing', isActive);
    button.textContent = isActive ? playingLabel : defaultLabel;
    button.disabled = false;
  });
}

function wireInlinePlayButton(btn){
  if(!btn || btn.dataset.wired === '1') return;
  const uri = btn.dataset.uri || btn.getAttribute('data-uri');
  if(!uri) return;
  btn.dataset.uri = uri;
  const baseLabel = getInlineButtonLabel(
    btn,
    'label',
    (btn.textContent || 'Play').trim() || 'Play'
  );
  btn.dataset.label = baseLabel;
  if (!btn.dataset.playingLabel) {
    btn.dataset.playingLabel = 'Playing';
  }
  if (!btn.dataset.loadingLabel) {
    btn.dataset.loadingLabel = 'Loading...';
  }
  if (!btn.classList.contains('is-playing')) {
    btn.textContent = btn.dataset.label;
  }
  btn.dataset.wired = '1';
  btn.addEventListener('click', async (e)=>{
    e.preventDefault();
    const trackUri = btn.dataset.uri || btn.getAttribute('data-uri');
    const contextUri = btn.dataset.context || btn.getAttribute('data-context') || '';
    const offsetValueRaw = Number(btn.dataset.offset || btn.getAttribute('data-offset') || '0');
    const offsetValue = Number.isFinite(offsetValueRaw) ? offsetValueRaw : 0;
    if(!trackUri) return;
    btn.disabled = true;
    btn.classList.remove('is-playing');
    btn.textContent = btn.dataset.loadingLabel;
    try{
      if (contextUri) {
        await apiPlayContext(contextUri, offsetValue);
      } else {
        await apiPlayUris([trackUri]);
      }
      updateInlinePlayState(trackUri, true);
    }catch(err){
      console.error(err);
      alert('Playback failed. Please check Spotify app state, HTTPS, and Premium.');
      updateInlinePlayState(null, false);
    }finally{
      btn.disabled = false;
    }
  });
}

/* =======================
   
======================= */
let _progressTimer = null;

function startProgressTimer() {
  stopProgressTimer(); // 
  _progressTimer = setInterval(() => {
    if (!_lastState || _lastState.paused) return;
    const pos = _lastState.position + 1000;
    if (pos <= _lastState.duration) {
      _lastState.position = pos;
      updateBarFromState(_lastState);
    }
  }, 1000);
}

function stopProgressTimer() {
  if (_progressTimer) clearInterval(_progressTimer);
  _progressTimer = null;
}

// seek bar drag
bar?.seek?.addEventListener('input', async () => {
  if(!_player) return;
  try{ await _player.seek(Number(bar.seek.value)); }catch{}
});
// volume
bar?.vol?.addEventListener('input', async () => {
  if(!_player) return;
  try{ await _player.setVolume(Number(bar.vol.value)/100); }catch{}
});
// play/pause/prev/next
bar?.play?.addEventListener('click', async () => {
  if(!_player) return;
  bar.play.disabled = true;
  try{
    const st = _lastState;
    if (st && !st.paused) await apiPause();
    else await apiResume();
  }catch(e){
    console.error(e);
  }finally{
    bar.play.disabled = false;
  }
});

bar?.prev?.addEventListener('click', () => apiPrev().catch(console.error));
bar?.next?.addEventListener('click', () => apiNext().catch(console.error));

// : I: 
bar?.loop?.addEventListener('click', async () => {
  // off -> context ( -> track (1) -> off ...
  _repeatMode = (_repeatMode === 'off') ? 'context' : (_repeatMode === 'context' ? 'track' : 'off');
  bar.loop.title = _repeatMode === 'off' ? 'Repeat: Off' : (_repeatMode === 'context' ? 'Repeat: Playlist' : 'Repeat: Track');
  bar.loop.style.opacity = (_repeatMode === 'off') ? .6 : 1;
  try { await apiSetRepeat(_repeatMode); } catch(e){ console.error(e); }
});

// : I: 
bar?.shuffle?.addEventListener('click', async () => {
  _shuffleOn = !_shuffleOn;
  bar.shuffle.title = _shuffleOn ? 'Shuffle: ON' : 'Shuffle: OFF';
  bar.shuffle.style.opacity = _shuffleOn ? 1 : .6;
  try { await apiSetShuffle(_shuffleOn); } catch(e){ console.error(e); }
});


/* ===== ===== */
(() => {
  document.addEventListener('DOMContentLoaded', () => {
    const $  = (s, r=document)=>r.querySelector(s);
    const $$ = (s, r=document)=>[...r.querySelectorAll(s)];

    const searchForm    = $('#search-form');
    const searchInput   = $('#search-query');
    const resultsList   = $('#search-results');
    const searchMessage = $('#search-message');
    const historyWrap   = $('#search-history');
    const historyClear  = $('#history-clear');
    const toastEl       = $('#toast');
    const playlistsEl   = $('#playlists-data');
    const playlistSection = document.getElementById('my-playlists');

    const ensurePlaylistsUrlState = () => {
      try{
        const current = new URL(window.location.href);
        current.searchParams.set('section', 'playlists');
        current.hash = '#my-playlists';
        window.history.replaceState(null, '', current.toString());
      }catch(err){
        console.error('ensurePlaylistsUrlState failed', err);
      }
    };

    const scrollToPlaylists = (behavior='smooth') => {
      if (!playlistSection) return;
      const offset = 140;
      const targetTop = playlistSection.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top: Math.max(targetTop, 0), behavior });
    };

    document.querySelectorAll('a[href*="#my-playlists"]').forEach((link)=>{
      link.addEventListener('click', (event)=>{
        try{
          const href = link.getAttribute('href') || '';
          const targetUrl = new URL(href, window.location.href);
          if (targetUrl.pathname === window.location.pathname && targetUrl.hash === '#my-playlists') {
            if (playlistSection) {
              event.preventDefault();
              ensurePlaylistsUrlState();
              scrollToPlaylists('smooth');
            }
          }
        }catch(err){
          console.error('scroll-to-playlists failed', err);
        }
      });
    });

    const shouldFocusPlaylists =
      document.body.classList.contains('playlist-focus') ||
      window.location.hash === '#my-playlists';
    if (shouldFocusPlaylists && playlistSection) {
      ensurePlaylistsUrlState();
      window.requestAnimationFrame(() => {
        scrollToPlaylists('auto');
      });
    }

    // Toast
    let toastTimer=null;
    function showToast(msg){
      if(!toastEl) return;
      toastEl.textContent=msg; toastEl.hidden=false;
      requestAnimationFrame(()=>toastEl.classList.add('show'));
      clearTimeout(toastTimer);
      toastTimer=setTimeout(()=>{ toastEl.classList.remove('show'); setTimeout(()=>{toastEl.hidden=true;toastEl.textContent='';},250); },2000);
    }
    toastEl?.addEventListener('click', ()=>{ clearTimeout(toastTimer); toastEl.classList.remove('show'); toastEl.hidden=true; toastEl.textContent=''; });

    // 
    let userPlaylists=[];
    try{ userPlaylists = playlistsEl ? JSON.parse(playlistsEl.textContent||'[]').map(p=>({id:p.id,name:p.name})) : []; }catch{}

    // 
    function loadHistory(){ try{ const raw=localStorage.getItem(HISTORY_KEY); return raw?JSON.parse(raw):[] }catch{ return [] } }
    function saveHistory(list){ try{ localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); }catch{} }
      function renderHistory(){
        if(!historyWrap || !searchInput) return;
        $$('.history-chip',historyWrap).forEach(el=>el.remove());
        const list=loadHistory();
        list.forEach(q=>{
          const chip=document.createElement('button'); chip.type='button'; chip.className='history-chip'; chip.textContent=q;
          chip.addEventListener('click',()=>{
            if(searchInput) searchInput.value=q;
            handleSearchSubmit(q);
          });
          const actionsRow = $('.history-actions',historyWrap);
          if(actionsRow){
            historyWrap.insertBefore(chip, actionsRow);
          }else{
            historyWrap.appendChild(chip);
          }
        });
        if(historyClear) historyClear.style.display=list.length?'inline-block':'none';
      }
      function addToHistory(q){
        if(!historyWrap) return;
        let list=loadHistory().filter(x=>x!==q);
        list.unshift(q);
        if(list.length>HISTORY_MAX) list=list.slice(0,HISTORY_MAX);
        saveHistory(list);
        renderHistory();
      }
    historyClear?.addEventListener('click', ()=>{ saveHistory([]); renderHistory(); });

    // Search
    searchForm?.addEventListener('submit', (e)=>{ e.preventDefault(); handleSearchSubmit((searchInput.value||'').trim()); });
    async function handleSearchSubmit(q){
      if(!resultsList || !searchMessage) return;
      resultsList.innerHTML='';
      if(!q){
        searchMessage.textContent='Enter a keyword to search.';
        return;
      }
      addToHistory(q);
      searchMessage.textContent='Searching...';
      try{
        const res=await fetch(`/api/spotify/search?q=${encodeURIComponent(q)}`);
        const data=await res.json();
        if(!res.ok){
          searchMessage.textContent=`Search failed: ${data.error||'unknown error'}`;
          return;
        }
        const tracks=data.tracks||[];
        renderResults(tracks);
        searchMessage.textContent = tracks.length ? '' : 'No tracks found.';
      }catch{
        searchMessage.textContent='Network error during search.';
      }
    }
function renderResults(tracks){
  if(!resultsList) return;
  resultsList.innerHTML='';
  for(const t of tracks){
    const li=document.createElement('li'); li.className='search-result-item';
        const img=document.createElement('img'); img.className='track-img'; img.src=t.image||'https://placehold.co/44x44/343A40/FFFFFF?text=No'; img.alt=t.album||'';
        const meta=document.createElement('div'); meta.className='track-info';
        const title=document.createElement('div'); title.className='track-name'; title.textContent=t.name;
        const subtitle=document.createElement('div'); subtitle.className='track-meta';
        const metaParts=[t.artists || ''];
        if(t.album) metaParts.push(t.album);
        subtitle.textContent=metaParts.filter(Boolean).join(' ・ ');
        meta.append(title, subtitle);

        const actions=document.createElement('div'); actions.className='track-actions';

        // Play inline on this page
        const inlineBtn = document.createElement('button');
        inlineBtn.classList.add('play-btn', 'js-track-play');
        inlineBtn.dataset.uri = t.uri;
        inlineBtn.dataset.label = 'Play';
        inlineBtn.dataset.playingLabel = 'Playing';
        inlineBtn.dataset.loadingLabel = 'Loading...';
        inlineBtn.textContent = inlineBtn.dataset.label;
        actions.appendChild(inlineBtn);
        wireInlinePlayButton(inlineBtn);

        // Preview if available
        if(t.preview_url){
          const prev=document.createElement('button'); prev.className='play-btn'; prev.textContent='Preview';
          prev.addEventListener('click',()=>new Audio(t.preview_url).play().catch(()=>{}));
          actions.appendChild(prev);
        }

        // Open in Spotify
        const openA=document.createElement('a'); openA.href=t.external_url||'#'; openA.target='_blank'; openA.rel='noopener'; openA.className='main-btn'; openA.textContent='Open Spotify';
        actions.appendChild(openA);

        // Add to playlist
        const select=document.createElement('select'); select.className='playlist-select'; select.innerHTML='<option value=\"\">Select playlist</option>';
        (userPlaylists||[]).forEach(p=>{ const opt=document.createElement('option'); opt.value=p.id; opt.textContent=p.name; select.appendChild(opt); });
        const addBtn=document.createElement('button'); addBtn.textContent='Add'; addBtn.className='add-to-playlist-btn'; addBtn.disabled=true;
        select.addEventListener('change',()=>addBtn.disabled=!select.value);
        addBtn.addEventListener('click', async ()=>{
          const pid=select.value; if(!pid) return;
          const original=addBtn.textContent; addBtn.textContent='Adding...'; addBtn.disabled=true;
          try{
            const res=await fetch('/api/spotify/add-track',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({playlist_id:pid,track_uri:t.uri})});
            const data=await res.json(); if(res.ok){ const span=document.querySelector(`.pl-count[data-plid=\"${pid}\"]`); if(span){ span.textContent=String(parseInt(span.textContent||'0',10)+1); } showToast('Track added to playlist.'); addBtn.textContent='Added'; addBtn.style.background='#06C755'; }
            else{ addBtn.textContent='Error'; addBtn.style.background='#FF4500'; alert(`Failed to add track: ${data.error||'unknown'}`); }
          }catch{ addBtn.textContent='Error'; addBtn.style.background='#FF4500'; alert('Network error'); }
          finally{ setTimeout(()=>{ addBtn.textContent=original; addBtn.style.background='#c084fc'; addBtn.disabled=false; },1200); }
        });

        li.append(img, meta, select, addBtn, actions);
        resultsList.appendChild(li);
      }
  if (_lastState) {
    updateInlinePlayState(_lastState.track_window?.current_track?.uri, !_lastState.paused);
  } else {
    updateInlinePlayState(null, false);
  }
}

    // Render initial history
    renderHistory();

    // Inline play buttons (common across pages)
    document.querySelectorAll('.js-track-play[data-uri]').forEach(wireInlinePlayButton);

    // Playlist context play buttons
    document.querySelectorAll('.play-context[data-context]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const ctx=btn.getAttribute('data-context');
        btn.disabled=true; const old=btn.textContent; btn.textContent='Loading...';
        try{ await apiPlayContext(ctx); }catch(err){ alert('Playlist playback failed.'); console.error(err); }
        finally{ btn.textContent=old; btn.disabled=false; }
      });
    });

    // Shuffle context play

document.querySelectorAll('.play-context-shuffle[data-context]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const ctx = btn.getAttribute('data-context');
    btn.disabled = true; const old = btn.textContent; btn.textContent = 'Loading...';
    try {
      // 1) Enable shuffle
      await apiSetShuffle(true);
      // 2) Start playback
      await apiPlayContext(ctx);
      // Optionally disable shuffle afterwards
    } catch (err) {
      alert('Shuffle playback failed.');
      console.error(err);
    } finally {
      btn.textContent = old; btn.disabled = false;
    }
  });
});


    // SDK
    window.onSpotifyWebPlaybackSDKReady = () => { ensurePlayer().catch(console.error); };
    // 
    if(window.Spotify) ensurePlayer().catch(console.error);
  });
})();

