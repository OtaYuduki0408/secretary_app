let playlistVideoIdSet = new Set();

function extractVideoId(url) {
  if (!url) return "";
  const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^/\n\s]+\/\S+\/|(?:v|e(?:mbed)?|live)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const matches = String(url).match(regex);
  return matches ? matches[1] : "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setMessage(text, isError = false) {
  const el = document.getElementById("playlist-message");
  if (!el) return;
  el.textContent = text || "";
  el.style.color = isError ? "#fca5a5" : "#95b0c5";
}

async function fetchPlaylist() {
  const response = await fetch("/api/playlist", { method: "GET" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
}

function renderPlaylist(tracks) {
  const tbody = document.getElementById("playlist-table-body");
  const empty = document.getElementById("playlist-empty");
  if (!tbody || !empty) return;

  const list = Array.isArray(tracks) ? tracks : [];
  playlistVideoIdSet = new Set(
    list
      .map((t) => String(t?.video_id || "").trim())
      .filter((id) => id.length > 0)
  );

  tbody.innerHTML = "";
  if (list.length === 0) {
    empty.style.display = "block";
    return;
  }

  empty.style.display = "none";
  for (const t of list) {
    const tr = document.createElement("tr");
    const videoId = t?.video_id || "";
    const title = t?.title || "(未設定)";
    const artist = t?.artist || "-";
    const url = t?.url || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : "");
    tr.innerHTML = `
      <td>${escapeHtml(title)}</td>
      <td>${escapeHtml(artist)}</td>
      <td>${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">開く</a>` : "-"}</td>
      <td><button type="button" data-video-id="${escapeHtml(videoId)}">削除</button></td>
    `;
    tbody.appendChild(tr);
  }
}

async function refreshPlaylist() {
  const data = await fetchPlaylist();
  renderPlaylist(data?.tracks || []);
}

async function addTrackByPayload(payload) {
  const response = await fetch("/api/playlist/tracks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    throw new Error(data?.error || `追加失敗 (HTTP ${response.status})`);
  }
  return data;
}

function normalizeSearchResult(video) {
  const id = String(video?.id || "").trim();
  const title = String(video?.title || "").trim();
  const artist = String(video?.artist || "").trim();
  const thumbnailUrl = String(video?.thumbnail_url || "").trim();
  const playbackOk = Boolean(video?.playback_ok);
  const failReason = String(video?.fail_reason || "").trim();
  return {
    id,
    title,
    artist,
    thumbnailUrl,
    playbackOk,
    failReason,
    url: `https://www.youtube.com/watch?v=${id}`,
  };
}

function buildResultCard(video) {
  const v = normalizeSearchResult(video);
  const isRegistered = playlistVideoIdSet.has(v.id);
  const canRegister = v.playbackOk;
  const card = document.createElement("article");
  card.className = `video-card${isRegistered ? " added" : ""}${canRegister ? "" : " unplayable"}`;
  card.dataset.videoId = v.id;
  card.dataset.playbackOk = canRegister ? "1" : "0";

  card.innerHTML = `
    <div class="thumb-wrap">
      <img src="${escapeHtml(v.thumbnailUrl || "")}" alt="${escapeHtml(v.title)}" loading="lazy" />
      <span class="badge ${canRegister ? "" : "bad"}">${canRegister ? "再生OK" : "再生不可"}</span>
    </div>
    <div class="card-body">
      <div class="yt-title">${escapeHtml(v.title || "(無題)")}</div>
      <div class="edit-grid">
        <input type="text" class="editable-title" value="${escapeHtml(v.title)}" placeholder="登録曲名" />
        <input type="text" class="editable-artist" value="${escapeHtml(v.artist)}" placeholder="登録アーティスト名" />
      </div>
      ${canRegister ? "" : `<div class="notice">この動画は埋め込み再生できません。${escapeHtml(v.failReason || "")}</div>`}
      <div class="card-actions">
        <button type="button" class="open-video">動画を開く</button>
        <button type="button" class="primary add-video" ${canRegister ? "" : "disabled"}>${isRegistered ? "登録済み" : "この曲を追加"}</button>
      </div>
    </div>
  `;

  return card;
}

function renderSearchResults(videos) {
  const container = document.getElementById("playlist-search-results");
  if (!container) return;
  container.innerHTML = "";
  const list = Array.isArray(videos) ? videos : [];
  if (list.length === 0) {
    setMessage("検索結果がありません。");
    return;
  }
  for (const video of list) {
    container.appendChild(buildResultCard(video));
  }
}

async function searchYoutubeAndRender() {
  const queryEl = document.getElementById("playlist-search-query");
  const query = String(queryEl?.value || "").trim();
  if (!query) {
    setMessage("検索ワードを入力してください。", true);
    return;
  }
  setMessage("検索中...");
  const response = await fetch(`/api/youtube_search?q=${encodeURIComponent(query)}`, { method: "GET" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    throw new Error(data?.error || `検索失敗 (HTTP ${response.status})`);
  }
  renderSearchResults(data?.videos || []);
  setMessage(`${(data?.videos || []).length}件ヒットしました。カードをクリックすると登録できます。`);
}

async function registerFromCard(card) {
  if (!card) return;
  const videoId = String(card.dataset.videoId || "").trim();
  const playbackOk = card.dataset.playbackOk === "1";
  if (!videoId) return;
  if (!playbackOk) {
    setMessage("再生不可動画は登録できません。必要なら m4a アップロード運用を使ってください。", true);
    return;
  }
  if (playlistVideoIdSet.has(videoId)) {
    card.classList.add("added");
    setMessage("この動画は既に登録済みです。");
    return;
  }

  const titleInput = card.querySelector(".editable-title");
  const artistInput = card.querySelector(".editable-artist");
  const title = String(titleInput?.value || "").trim();
  const artist = String(artistInput?.value || "").trim();

  card.classList.add("pending");
  try {
    const result = await addTrackByPayload({
      video_id: videoId,
      title,
      artist,
      url: `https://www.youtube.com/watch?v=${videoId}`,
    });
    if (result?.status === "exists") {
      playlistVideoIdSet.add(videoId);
      card.classList.add("added");
      setMessage("すでに登録済みです。");
      return;
    }
    playlistVideoIdSet.add(videoId);
    card.classList.add("added");
    const addBtn = card.querySelector(".add-video");
    if (addBtn) {
      addBtn.textContent = "登録済み";
      addBtn.disabled = true;
    }
    setMessage(`追加しました: ${title || videoId}`);
    await refreshPlaylist();
  } catch (error) {
    setMessage(error.message || "追加に失敗しました。", true);
  } finally {
    card.classList.remove("pending");
  }
}

async function addAllVisiblePlayable() {
  const cards = Array.from(document.querySelectorAll(".video-card"));
  const targets = cards.filter((card) => {
    const videoId = String(card.dataset.videoId || "").trim();
    return card.dataset.playbackOk === "1" && videoId && !playlistVideoIdSet.has(videoId);
  });

  if (targets.length === 0) {
    setMessage("追加対象がありません。");
    return;
  }

  setMessage(`一括追加中... (${targets.length}件)`);
  let success = 0;
  for (const card of targets) {
    try {
      await registerFromCard(card);
      success += 1;
    } catch (_) {
      // 個別失敗は registerFromCard 内で通知済み
    }
  }
  setMessage(`一括追加完了: ${success}/${targets.length}件`);
  await refreshPlaylist();
}

async function removeTrack(videoId) {
  if (!videoId) return;
  const response = await fetch(`/api/playlist/tracks/${encodeURIComponent(videoId)}`, {
    method: "DELETE",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    setMessage(data?.error || `削除に失敗しました (HTTP ${response.status})`, true);
    return;
  }
  playlistVideoIdSet.delete(videoId);
  setMessage("削除しました。");
  await refreshPlaylist();
}

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("playlist-search-button")?.addEventListener("click", async () => {
    try {
      await searchYoutubeAndRender();
    } catch (error) {
      setMessage(error.message || "検索に失敗しました。", true);
    }
  });

  document.getElementById("playlist-search-query")?.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    try {
      await searchYoutubeAndRender();
    } catch (error) {
      setMessage(error.message || "検索に失敗しました。", true);
    }
  });

  document.getElementById("playlist-add-all-button")?.addEventListener("click", async () => {
    await addAllVisiblePlayable();
  });

  document.getElementById("playlist-search-results")?.addEventListener("click", async (event) => {
    const openBtn = event.target?.closest(".open-video");
    if (openBtn) {
      event.stopPropagation();
      const card = openBtn.closest(".video-card");
      const videoId = String(card?.dataset.videoId || "").trim();
      if (videoId) {
        window.open(`https://www.youtube.com/watch?v=${videoId}`, "_blank", "noopener,noreferrer");
      }
      return;
    }

    const addBtn = event.target?.closest(".add-video");
    if (addBtn) {
      event.stopPropagation();
      await registerFromCard(addBtn.closest(".video-card"));
      return;
    }

    const clickedInput = event.target?.closest("input");
    if (clickedInput) return;

    const card = event.target?.closest(".video-card");
    if (card) {
      await registerFromCard(card);
    }
  });

  document.getElementById("playlist-table-body")?.addEventListener("click", async (event) => {
    const button = event.target?.closest("button[data-video-id]");
    if (!button) return;
    await removeTrack(String(button.dataset.videoId || ""));
  });

  try {
    await refreshPlaylist();
  } catch (error) {
    setMessage(`プレイリスト取得に失敗: ${error.message}`, true);
  }
});
