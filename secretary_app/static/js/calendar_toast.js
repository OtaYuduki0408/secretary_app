// static/js/calendar_toast.js
(() => {
  // ===== 設定 =====
  const LIFE_SEC = 8;           // 表示寿命（秒）←ご希望で延長
  const Z_INDEX  = 20000;       // 画面最前面に

  // ===== スタック作成（なければ自動生成） =====
  let stack = document.getElementById('toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toast-stack';
    stack.setAttribute('aria-live', 'polite');
    stack.setAttribute('aria-atomic', 'true');
    document.body.appendChild(stack);
  }
  // 強制スタイル（他CSSの上書きを避ける）
  Object.assign(stack.style, {
    position: 'fixed',
    right: '16px',
    bottom: '92px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    zIndex: String(Z_INDEX),
    pointerEvents: 'none'
  });

  // ===== キーフレーム & 見た目（1本バー／大きめ文字） =====
  const inject = (css) => {
    const s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
  };
  inject(`
    .toast{
      min-width: 280px; max-width: min(92vw, 420px);
      background: rgba(15,23,42,.96);
      border: 1px solid rgba(148,163,184,.38);
      border-radius: 16px;
      box-shadow: 0 18px 48px rgba(0,0,0,.48);
      color: #e5e7eb;
      padding: 16px 18px;
      display: grid; grid-template-columns: auto 1fr auto; gap: 12px;
      align-items: center;
      transform: translateY(10px);
      opacity: 0;
      pointer-events: auto;
      animation: toast-in .22s ease forwards, toast-life ${LIFE_SEC}s linear forwards !important;
    }
    .toast .title{ font-weight: 800; letter-spacing: .02em; font-size: 20px; }
    .toast .meta { font-size: 16px; color: #c7d3e6; margin-top: 4px; }

    /* 下線は::after 1本のみ（JSで追加しない） */
    .toast::after{
      content:"";
      grid-column: 1 / -1;
      height: 3px;
      margin-top: 10px;
      background: linear-gradient(90deg, #7aa8ff, #38bdf8);
      border-radius: 999px;
      animation: toast-bar ${LIFE_SEC}s linear forwards !important;
    }

    @keyframes toast-in { to { transform: translateY(0); opacity: 1; } }
    @keyframes toast-out{ to { transform: translateY(6px); opacity: 0; } }
    @keyframes toast-life{ from{opacity:1} to{opacity:1} }
    @keyframes toast-bar { from{width:100%} to{width:0} }
  `);

  // ===== デデュープ（同内容を短時間に重複表示しない） =====
  const recent = new Map();                // key -> timestamp(ms)
  const DUPE_WINDOW_MS = 8000;             // 8秒間は同じ内容を抑制
  const nowMs = () => Date.now();
  const prune = () => {
    const t = nowMs();
    for (const [k, v] of recent) if (t - v > DUPE_WINDOW_MS) recent.delete(k);
  };
  const makeKey = (n) => `${n.title}|${n.start}|${n.end}|${n.location||''}|${n.category||''}`;

  // ===== 表示 =====
  function showToast(item){
    const n = normalize(item);

    // デデュープ
    prune();
    const key = makeKey(n);
    if (recent.has(key)) return;
    recent.set(key, nowMs());

    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `
      <svg class="icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"
           style="width:24px;height:24px;filter:drop-shadow(0 2px 6px rgba(122,168,255,.35))">
        <circle cx="12" cy="12" r="10" fill="#1f2a33" stroke="#7aa8ff" stroke-width="1.4"/>
        <path d="M12 6v6l4 2" stroke="#7aa8ff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <div class="content" style="line-height:1.3">
        <div class="title">${esc(n.title || '予定を追加しました')}</div>
        <div class="meta">
          ${fmtRange(n.start, n.end, !!n.allDay)}${n.location ? ' / ' + esc(n.location) : ''}${n.category ? ' / ' + esc(n.category) : ''}
        </div>
      </div>
      <button class="close" aria-label="閉じる"
              style="border:0;background:transparent;color:#cbd5e1;font-size:22px;line-height:1;cursor:pointer;opacity:.9">×</button>
    `;

    // 閉じる（×）
    el.querySelector('.close').addEventListener('click', () => dismiss(el));

    // 先頭に積む
    stack.prepend(el);

    // 確実に自動消去（8秒）
    let timer = setTimeout(() => dismiss(el), LIFE_SEC * 1000);
    el.addEventListener('mouseenter', () => { clearTimeout(timer); });
    el.addEventListener('mouseleave', () => {
      clearTimeout(timer);
      timer = setTimeout(() => dismiss(el), 1200);
    });
  }

  function dismiss(el){
    if (!el || el._closing) return;
    el._closing = true;
    el.style.animation = `toast-out .22s ease forwards`;
    setTimeout(() => el.remove(), 220);
  }

  // ===== 正規化（name/start_time/end_time を吸収）=====
  function normalize(x = {}){
    const title = pick(x.title, x.name, x.event, '新しい予定');
    const start = pick(x.start, x.start_time, x.begin, x.date);
    const end   = pick(x.end,   x.end_time,   x.finish, start);
    const nowIso= new Date().toISOString();
    return {
      title,
      start: start ? toIso(start) : nowIso,
      end:   end   ? toIso(end)   : (start ? toIso(start) : nowIso),
      location: pick(x.location, x.place, ''),
      category: pick(x.category, x.type, ''),
      allDay: !!(x.allDay || x.all_day || x.fullDay)
    };
  }
  function pick(...vals){ for (const v of vals) if (v !== undefined && v !== null && v !== '') return v; }
  function toIso(s){
    if (typeof s !== 'string') return new Date(s).toISOString();
    if (s.includes('T'))       return new Date(s).toISOString();
    return new Date(s.replace(' ', 'T')).toISOString();
  }
  function fmtRange(s,e,allDay){
    if(!s) return '';
    if(allDay) return `${fmtDT(s)}（終日）`;
    return `${fmtDT(s)} 〜 ${fmtDT(e)}`;
  }
  function fmtDT(iso){
    const d = new Date(iso); if (isNaN(d)) return iso;
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    const hh = String(d.getHours()).padStart(2,'0');
    const mi = String(d.getMinutes()).padStart(2,'0');
    return `${mm}/${dd} ${hh}:${mi}`;
  }
  function esc(s){ return String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  // ===== console.log フック（重複なし・配列OK）=====
  const origLog = console.log;
  console.log = function (...args) {
    try {
      // [CAL], payload 形式（payload は配列/オブジェクト両対応）
      if (args[0] === '[CAL]') {
        const payload = args[1];
        if (Array.isArray(payload)) payload.forEach(showToast);
        else if (payload && typeof payload === 'object') showToast(payload);
      }
      // 文字列の [CAL] ... から JSON 抜き出し
      for (const a of args) {
        if (typeof a === 'string' && a.includes('[CAL]')) {
          const raw = a.slice(a.indexOf('[CAL]') + 5).trim();
          const json = extractJson(raw);
          if (json) Array.isArray(json) ? json.forEach(showToast) : showToast(json);
        }
      }
      // {type:'calendar', item:{…}} 形式
      args.forEach(a => { if (a && typeof a === 'object' && a.type === 'calendar' && a.item) showToast(a.item); });
    } catch {}
    return origLog.apply(console, args);
  };

  // ```json ブロック/配列/オブジェクトをゆるく抽出
  function extractJson(txt){
    if (!txt) return null;
    const block = txt.match(/```json\s*([\s\S]*?)\s*```/i);
    if (block) { try { return JSON.parse(block[1]); } catch{} }
    const arr = txt.match(/\[[\s\S]*\]$/); if (arr) { try { return JSON.parse(arr[0]); } catch{} }
    const obj = txt.match(/\{[\s\S]*\}$/); if (obj) { try { return JSON.parse(obj[0]); } catch{} }
    return null;
  }

  // カスタムイベント（推奨）
  window.addEventListener('calendar:added', (e) => {
    const d = e.detail;
    Array.isArray(d) ? d.forEach(showToast) : showToast(d || {});
  });

  // 外部API（手動発火用）
  window.calendarToast = {
    show: showToast,
    fromParsed: (list) => (Array.isArray(list) ? list : [list]).forEach(showToast)
  };

  console.log('[TOAST] calendar_toast.js ready');
})();
