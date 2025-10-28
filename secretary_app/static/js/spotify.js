/* ============================
   Spotify page logic
   - Search with history (localStorage)
   - Add track to playlist
   - Realtime playlist count update
   - Toast notification
============================ */
(() => {
  document.addEventListener('DOMContentLoaded', () => {
    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

    // ---------- DOM refs ----------
    const searchForm    = $('#search-form');
    const searchInput   = $('#search-query');
    const resultsList   = $('#search-results');
    const searchMessage = $('#search-message');
    const historyWrap   = $('#search-history');
    const historyClear  = $('#history-clear');
    const toastEl       = $('#toast');               // <div id="toast" class="toast" hidden></div>
    const playlistsEl   = $('#playlists-data');      // <script id="playlists-data" type="application/json">[...]</script>

    // ---------- Toast ----------
    let toastTimer = null;
    function showToast(msg) {
      if (!toastEl) return;
      toastEl.textContent = msg;
      toastEl.hidden = false;
      // 次フレームで .show を付けるとCSSトランジションが効く
      requestAnimationFrame(() => toastEl.classList.add('show'));
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toastEl.classList.remove('show');
        setTimeout(() => {
          toastEl.hidden = true;
          toastEl.textContent = '';
        }, 250); // CSS transition と揃える
      }, 2000);
    }
    // 初期リセット & クリックで即閉じ
    if (toastEl) {
      toastEl.hidden = true;
      toastEl.classList.remove('show');
      toastEl.textContent = '';
      toastEl.addEventListener('click', () => {
        clearTimeout(toastTimer);
        toastEl.classList.remove('show');
        toastEl.hidden = true;
        toastEl.textContent = '';
      });
    }

    // ---------- Playlists for adding ----------
    let userPlaylists = [];
    try {
      userPlaylists = playlistsEl ? JSON.parse(playlistsEl.textContent || '[]') : [];
      userPlaylists = userPlaylists.map(p => ({ id: p.id, name: p.name }));
    } catch {
      userPlaylists = [];
    }


    function loadHistory() {
      try {
        const raw = localStorage.getItem(HISTORY_KEY);
        return raw ? JSON.parse(raw) : [];
      } catch { return []; }
    }
    function saveHistory(list) {
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch {}
    }
    function addToHistory(query) {
      let list = loadHistory();
      list = list.filter(q => q !== query);
      list.unshift(query);
      if (list.length > HISTORY_MAX) list = list.slice(0, HISTORY_MAX);
      saveHistory(list);
      renderHistory();
    }
    function clearHistory() {
      saveHistory([]);
      renderHistory();
    }
    function renderHistory() {
      if (!historyWrap) return;
      // 既存チップ削除（右端のボタンは残す）
      $$('.history-chip', historyWrap).forEach(el => el.remove());
      const list = loadHistory();
      list.forEach(q => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'history-chip';
        chip.textContent = q;
        chip.addEventListener('click', () => {
          searchInput.value = q;
          handleSearchSubmit(q);
        });
        historyWrap.insertBefore(chip, $('.history-actions', historyWrap));
      });
      if (historyClear) historyClear.style.display = list.length ? 'inline-block' : 'none';
    }
    historyClear?.addEventListener('click', clearHistory);

    // ---------- Playlist count realtime update ----------
    function incrementPlaylistCount(playlistId) {
      const span = document.querySelector(`.pl-count[data-plid="${playlistId}"]`);
      if (!span) return;
      const cur = parseInt(span.textContent || '0', 10);
      span.textContent = String(cur + 1);
    }

    // ---------- Search ----------
    searchForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = (searchInput.value || '').trim();
      handleSearchSubmit(q);
    });

    async function handleSearchSubmit(q) {
      if (!resultsList || !searchMessage) return;

      resultsList.innerHTML = '';
      if (!q) {
        searchMessage.textContent = '検索キーワードを入力して下さい。';
        return;
      }
      addToHistory(q);

      searchMessage.textContent = '検索中...';
      try {
        const res  = await fetch(`/api/spotify/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();

        if (!res.ok) {
          searchMessage.textContent = `検索エラー: ${data.error || '不明なエラー'}`;
          return;
        }
        const tracks = data.tracks || [];
        renderResults(tracks);
        searchMessage.textContent = tracks.length ? '' : '該当する曲が見つかりませんでした。';
      } catch (err) {
        console.error(err);
        searchMessage.textContent = 'ネットワークエラーが発生しました。';
      }
    }

    function renderResults(tracks) {
      resultsList.innerHTML = '';
      for (const t of tracks) {
        const li = document.createElement('li');
        li.className = 'search-result-item';

        const img = document.createElement('img');
        img.className = 'track-img';
        img.src = t.image || 'https://placehold.co/44x44/343A40/FFFFFF?text=No';
        img.alt = t.album || '';

        const meta = document.createElement('div');
        meta.className = 'track-info';
        meta.innerHTML = `
          <strong>${t.name}</strong>
          <small>${t.artists}${t.album ? ' — ' + t.album : ''}</small>
        `;

        const actions = document.createElement('div');
        actions.className = 'track-actions';

        if (t.preview_url) {
          const btnPrev = document.createElement('button');
          btnPrev.className = 'play-btn';
          btnPrev.textContent = '試聴';
          btnPrev.addEventListener('click', () => {
            const audio = new Audio(t.preview_url);
            audio.play().catch(()=>{});
          });
          actions.appendChild(btnPrev);
        }

        const openA = document.createElement('a');
        openA.href = t.external_url || '#';
        openA.target = '_blank';
        openA.rel = 'noopener';
        openA.className = 'main-btn';
        openA.textContent = 'Spotifyで開く';
        actions.appendChild(openA);

        const select = document.createElement('select');
        select.className = 'playlist-select';
        select.innerHTML = '<option value="">プレイリストを選択</option>';
        (userPlaylists || []).forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.id;
          opt.textContent = p.name;
          select.appendChild(opt);
        });

        const addButton = document.createElement('button');
        addButton.textContent = '追加';
        addButton.className = 'add-to-playlist-btn';
        addButton.disabled = true;

        select.addEventListener('change', () => {
          addButton.disabled = !select.value;
        });

        addButton.addEventListener('click', () => {
          const playlistId = select.value;
          if (playlistId) {
            handleAddTrack(playlistId, t.uri, addButton);
          }
        });

        li.append(img, meta, select, addButton, actions);
        resultsList.appendChild(li);
      }
    }

    // ---------- Add track ----------
    async function handleAddTrack(playlistId, trackUri, button) {
      const originalText = button.textContent;
      button.textContent = '追加中...';
      button.disabled = true;

      try {
        const res = await fetch('/api/spotify/add-track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playlist_id: playlistId, track_uri: trackUri })
        });
        const data = await res.json();

        if (res.ok) {
          incrementPlaylistCount(playlistId);
          showToast('✅ 追加しました');
          button.textContent = '追加完了!';
          button.style.background = '#06C755';
        } else {
          button.textContent = '失敗';
          button.style.background = '#FF4500';
          alert(`追加に失敗しました: ${data.error || 'unknown'}`);
        }
      } catch (e) {
        button.textContent = 'エラー';
        button.style.background = '#FF4500';
        alert('ネットワークエラーにより追加に失敗しました。');
      } finally {
        setTimeout(() => {
          button.textContent = originalText;
          button.style.background = '#c084fc';
          button.disabled = false;
        }, 1400);
      }
    }

    // 初期表示：履歴描画
    renderHistory();

    // ------- helpers used above -------
    function renderHistory() {
      if (!historyWrap) return;
      $$('.history-chip', historyWrap).forEach(el => el.remove());
      const list = loadHistory();
      list.forEach(q => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'history-chip';
        chip.textContent = q;
        chip.addEventListener('click', () => {
          searchInput.value = q;
          handleSearchSubmit(q);
        });
        historyWrap.insertBefore(chip, $('.history-actions', historyWrap));
      });
      if (historyClear) historyClear.style.display = list.length ? 'inline-block' : 'none';
    }
    function loadHistory() {
      try {
        const raw = localStorage.getItem(HISTORY_KEY);
        return raw ? JSON.parse(raw) : [];
      } catch { return []; }
    }
    function saveHistory(list) {
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch {}
    }
    function addToHistory(query) {
      let list = loadHistory();
      list = list.filter(q => q !== query);
      list.unshift(query);
      if (list.length > HISTORY_MAX) list = list.slice(0, HISTORY_MAX);
      saveHistory(list);
      renderHistory();
    }
    function clearHistory() {
      saveHistory([]);
      renderHistory();
    }

    // constants for history
    const HISTORY_KEY = 'spotify_search_history';
    const HISTORY_MAX = 10;
  });
})();
