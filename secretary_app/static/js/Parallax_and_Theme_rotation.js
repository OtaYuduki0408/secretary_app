import { check_chat_Space } from '/static/js/ChatSpace.js';

/* =======================
   Parallax + Theme rotation + ORA jackpot
   + BTD background chroma key (autoplay with sound on "ヴァイツァダスト")
======================= */
(() => {
  /* ===== Parallax ===== */
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduceMotion) {
    const MAX_SHIFT = Math.min(60, Math.max(24, Math.round(Math.min(innerWidth, innerHeight) * 0.06)));
    let txT = 0, tyT = 0, tx = 0, ty = 0;
    const raf = () => {
      tx += (txT - tx) * 0.12; ty += (tyT - ty) * 0.12;
      document.documentElement.style.setProperty('--mx', tx.toFixed(2) + 'px');
      document.documentElement.style.setProperty('--my', ty.toFixed(2) + 'px');
      requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
    const onMove = (x, y) => { const nx = x / innerWidth - .5, ny = y / innerHeight - .5; txT = nx * MAX_SHIFT; tyT = ny * MAX_SHIFT; };
    addEventListener('pointermove', e => onMove(e.clientX, e.clientY), { passive: true });
    addEventListener('touchmove', e => { const t = e.touches[0]; if (t) onMove(t.clientX, t.clientY); }, { passive: true });
    addEventListener('deviceorientation', e => {
      if (e.gamma == null || e.beta == null) return;
      txT = Math.max(-1, Math.min(1, e.gamma / 45)) * MAX_SHIFT;
      tyT = Math.max(-1, Math.min(1, e.beta / 45)) * MAX_SHIFT;
    }, { passive: true });
  }

  /* ===== Theme persistence ===== */
  const THEME_KEY = 'vs_theme_idx';
  const THEMES = ['dark', 'light', 'purple', 'blue', 'orange'];
  function removeAllThemes(){ document.documentElement.classList.remove('theme-light','theme-purple','theme-blue','theme-orange'); }
  function applyThemeByIdx(idx){
    const i = ((idx % THEMES.length) + THEMES.length) % THEMES.length;
    const name = THEMES[i];
    removeAllThemes();
    if (name !== 'dark') document.documentElement.classList.add('theme-'+name);
    localStorage.setItem(THEME_KEY, String(i));
    currentIdx = i;
  }
  let currentIdx = parseInt(localStorage.getItem(THEME_KEY) || '0', 10);
  if (Number.isNaN(currentIdx)) currentIdx = 0;
  applyThemeByIdx(currentIdx);

/* ===== Commands (Input / Voice Command) ===== */
const input = document.getElementById('searchbox');

// 【定義部分】
const BTD_WORDS = ['ヴァイツァダスト','ヴァイツァ・ダスト','バイツァダスト','バイツァ・ダスト','bites the dust','btd'];
const norm  = s => (s||'').toString().trim().replace(/[・\s]/g,'').toLowerCase();
const isBTD = v => BTD_WORDS.map(norm).includes(norm(v));
const isORA = v => {
  const s = (v||'').toString().trim().replace(/[・\s]/g,'');
  return /^(?:オラ)+[!！ァぁー〜～]*$/u.test(s) || /^(?:ora)+[!！\-~～]*$/i.test(s);
};
function startBTDSequence(e) { console.log('BTDシーケンスを開始', e); }
function startTransform() { console.log('Transformを開始'); }
function startOraOra() { console.log('オラオラを開始'); }

if (input) {
  // ----------------------------------------------------
  // inputイベントを監視 (値の変更を検出)
  // ----------------------------------------------------
  input.addEventListener('input', (e) => {
    console.log("値変更イベント e=", e); 
    // 入力値を取得し、前後の空白を削除
    let raw = (input.value||'').trim();
    if (!raw) return;
    const isConfirmed = raw.endsWith(';');
    // 確定フラグがない場合（入力途中）は、一旦処理を中断
    if (!isConfirmed) return; 
    // 確定フラグがある場合、末尾の ; を取り除く
    raw = raw.slice(0, -1).trim(); 
    if (!raw) {
        // もし ; だけが入力された場合は、ここで入力欄をクリアして終了
        input.value = '';
        return;
    }
    const v = raw.toLowerCase();
    input.value = ''; // 入力欄をクリア（確定処理後）
    console.log("入力確定を検知")
    if (isBTD(raw))        { startBTDSequence(e); console.log("isBTDを実行"); return; }
    if (v === 'transform') { startTransform(); console.log("transformを実行"); return; }
    if (isORA(raw))        { startOraOra(); console.log("isORAを実行"); return; }
    console.log("チャットスペースへ渡す")
    check_chat_Space(v);
  });


  input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      
      let raw = (input.value || '').trim();
      if (!raw) return;
      input.value = '';
      
      const v = raw.toLowerCase();
      // ... コマンド実行ロジック ...
      if (isBTD(raw)) { startBTDSequence(e); return; } 
       if (v === 'transform') { startTransform(); return; }
      if (isORA(raw))        { startOraOra(); return; }
      
      // 上記の特殊コマンドに該当しない場合、通常処理へ
      check_chat_Space(v);
  });
}

  /* =========================================
     背景BTD（Canvasクロマキー：メイン画面背面→前面表示）
     - ユーザー操作イベント内で unmute 再生（音あり）
     - 終了時に "btd:end" を dispatch
  ========================================= */
  const BTD_BG = (() => {
    const VIDEO_SRC = '/static/video/btd.mp4'; // 同一オリジンに配置
    const KEY = { gMin: 80, diffRG: 35, diffBG: 35, softness: 30 };
    const INTERNAL_SIZE = { w: 1280, h: 720 }; // 重ければ 960x540

    let wrap, canvas, ctx, video, running = false, rafId = 0;

    function ensureHost() {
      if (wrap) return;
      const backdrop = document.querySelector('.ui-backdrop');
      wrap = document.createElement('div');
      wrap.id = 'btd-bg';
      wrap.setAttribute('aria-hidden', 'true');
      // 検索UIより前面に（ただし操作は妨げない）
      wrap.style.cssText = `
        position: fixed; inset: 0;
        display: grid; place-items: center;
        pointer-events: none; overflow: hidden;
        z-index: 1001; /* 前面に出す */
      `;
      if (backdrop) backdrop.parentNode.insertBefore(wrap, backdrop);
      else document.body.prepend(wrap);

      canvas = document.createElement('canvas');
      canvas.id = 'btd-bg-canvas';
      canvas.style.cssText = 'width:100vw;height:100vh;object-fit:cover;display:block;';
      wrap.appendChild(canvas);
      ctx = canvas.getContext('2d', { willReadFrequently: true });

      function resize(){ canvas.width = INTERNAL_SIZE.w; canvas.height = INTERNAL_SIZE.h; }
      addEventListener('resize', resize, { passive: true });
      resize();
    }

    function makeVideo() {
      const v = document.createElement('video');
      v.src = encodeURI(VIDEO_SRC);
      v.crossOrigin = 'anonymous'; // 別ドメインだとcanvas汚染→透過不可
      v.muted = true;              // 初期はtrue。ユーザー操作内でfalseにする
      v.volume = 1.0;
      v.playsInline = true;
      v.preload = 'auto';
      return v;
    }

    function chroma(img) {
      const d = img.data, { gMin, diffRG, diffBG, softness } = KEY;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const isGreen = (g > gMin) && (g - r > diffRG) && (g - b > diffBG);
        if (isGreen) {
          const strength = Math.min(255, Math.max(0, g - Math.max(r, b)));
          d[i + 3] = Math.max(0, 255 - (strength + softness)); // 透明化
        }
      }
    }

    function loop() {
      if (!running) return;
      if (video && video.readyState >= 2) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        chroma(img);
        ctx.putImageData(img, 0, 0);
      }
      rafId = requestAnimationFrame(loop);
    }

    // 重要：ユーザー操作イベントの中から呼び出すこと
    async function playOnceWithGesture() {
      if (running) return;
      ensureHost();
      video = makeVideo();
      running = true;

      video.onended = () => { stop(); document.dispatchEvent(new CustomEvent('btd:end')); };

      // “この関数がユーザー操作内で呼ばれている”前提でミュート解除→即play
      try {
        video.muted = false;
        video.volume = 1.0;
        // まだデータがなくても、promiseはpendingでOK。失敗したら canplay 後に再試行
        await video.play();
      } catch (_) {
        await waitCanPlay(video, 800);
        try {
          video.muted = false;
          video.volume = 1.0;
          await video.play();
        } catch (e2) {
          // それでもNGな場合は最後の手段として無音再生（環境依存で音出しが不可のとき）
          console.warn('[BTD_BG] autoplay with sound failed, fallback to muted.', e2);
          video.muted = true;
          await video.play().catch(()=>{});
        }
      }
      loop();
    }

    function stop() {
      running = false;
      cancelAnimationFrame(rafId);
      try { video?.pause(); } catch {}
      video = null;
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
      wrap = canvas = ctx = null;
    }

    function waitCanPlay(v, timeoutMs){
      return new Promise(res=>{
        let done=false;
        const t = setTimeout(()=>{ if(!done){ done=true; res(); } }, timeoutMs||0);
        const ok = ()=>{ if(!done){ done=true; clearTimeout(t); v.removeEventListener('canplay', ok); res(); } };
        v.addEventListener('canplay', ok, { once:true });
      });
    }

    return { playOnceWithGesture, stop };
  })();

  // ===== ヴァイツァダスト全体の流れ =====
  function startBTDSequence(userEvent){
    if (document.body.classList.contains('is-transforming')) return;
    document.body.classList.add('is-transforming');

    const onEnd = () => {
      document.removeEventListener('btd:end', onEnd);
      reverseTransformToPrevTheme();
    };
    document.addEventListener('btd:end', onEnd, { once:true });

    // ★ ここが肝：Enter キー（ユーザー操作）の同期中に呼ぶ
    BTD_BG.playOnceWithGesture();
  }

  // ===== 逆変身アニメ（下→上にガラスが戻る）＋テーマ巻き戻し =====
  function reverseTransformToPrevTheme(){
    const host = document.getElementById('shatter');
    host.innerHTML = '';
    const cols = 10, rows = 6;
    for (let y=0; y<rows; y++){
      for (let x=0; x<cols; x++){
        const x0=x/cols*100, x1=(x+1)/cols*100, y0=y/rows*100, y1=(y+1)/rows*100;
        const flip = (x+y)%2===0;
        const tris = [
          [[x0,y0],[x1,y0],[flip?x0:x1,y1]],
          [[x1,y1],[x0,y1],[flip?x1:x0,y0]]
        ];
        tris.forEach((pts)=>{
          const d = document.createElement('div');
          d.className = 'shard rise';
          d.style.clipPath = `polygon(${pts.map(p=>p[0]+'% '+p[1]+'%').join(',')})`;
          d.style.setProperty('--dx', ((Math.random()-0.5)*160)+'px');
          d.style.setProperty('--dy', (260+Math.random()*420)+'px');
          d.style.setProperty('--rot', ((Math.random()-0.5)*120)+'deg');
          d.style.animationDelay = (Math.random()*220)+'ms';
          d.style.animationDuration = (900+Math.random()*700)+'ms';
          host.appendChild(d);
        });
      }
    }
    const prevIdx = (currentIdx - 1 + THEMES.length) % THEMES.length;
    setTimeout(()=> applyThemeByIdx(prevIdx), 300);
    setTimeout(()=>{ host.innerHTML = ''; document.body.classList.remove('is-transforming'); }, 2600);
  }

  /* ===== ガラス落下：次テーマへ ===== */
  function startTransform(){
    if (document.body.classList.contains('is-transforming')) return;
    document.body.classList.add('is-transforming');
    const host = document.getElementById('shatter');
    host.innerHTML = '';
    const cols = 10, rows = 6;
    for (let y=0; y<rows; y++){
      for (let x=0; x<cols; x++){
        const x0=x/cols*100, x1=(x+1)/cols*100, y0=y/rows*100, y1=(y+1)/rows*100;
        const flip = (x+y)%2===0;
        const tris = [
          [[x0,y0],[x1,y0],[flip?x0:x1,y1]],
          [[x1,y1],[x0,y1],[flip?x1:x0,y0]]
        ];
        tris.forEach((pts)=>{
          const d = document.createElement('div');
          d.className = 'shard';
          d.style.clipPath = `polygon(${pts.map(p=>p[0]+'% '+p[1]+'%').join(',')})`;
          d.style.setProperty('--dx', ((Math.random()-0.5)*220)+'px');
          d.style.setProperty('--dy', (240+Math.random()*420)+'px');
          d.style.setProperty('--rot', ((Math.random()-0.5)*140)+'deg');
          d.style.animationDelay = (Math.random()*200)+'ms';
          d.style.animationDuration = (900+Math.random()*700)+'ms';
          host.appendChild(d);
        });
      }
    }
    const nextIdx = (currentIdx + 1) % THEMES.length;
    setTimeout(()=> applyThemeByIdx(nextIdx), 250);
    setTimeout(()=>{ host.innerHTML = ''; document.body.classList.remove('is-transforming'); }, 2600);
  }

  /* ======= ORA（既存のまま） ======= */
  const JACKPOT_RATE = 1;
  const CAMEO_IMAGES = ['static/img/videoframe_79969.png','static/img/videoframe_86269.png'];
  const CAMEO_AUD_SRC = ['static/voice/まずい.m4a','static/voice/神避.m4a'];

  CAMEO_IMAGES.forEach(src => { const im = new Image(); im.src = src; });

  const audio1 = new Audio(encodeURI(CAMEO_AUD_SRC[0]));
  const audio2 = new Audio(encodeURI(CAMEO_AUD_SRC[1]));
  [audio1, audio2].forEach(a => { a.preload = 'auto'; a.crossOrigin = 'anonymous'; });

  async function primeAudio() {
    if (primeAudio._done) return;
    try {
      for (const a of [audio1, audio2]) {
        a.muted = true; a.volume = 0; await a.play().catch(()=>{});
        a.pause(); a.currentTime = 0; a.muted = false; a.volume = 1;
      }
    } finally { primeAudio._done = true; }
  }

  function showUnblockButton() {
    return new Promise((resolve) => {
      let btn = document.getElementById('audio-unblock-btn');
      if (!btn) {
        btn = document.createElement('button');
        btn.id = 'audio-unblock-btn';
        btn.textContent = '音声を再生';
        btn.style.cssText =
          'position:fixed;inset:auto 0 8vh 0;margin:auto;display:block;width:200px;height:56px;'+
          'z-index:14000;border-radius:12px;border:0;background:#6c63ff;color:#fff;font-weight:800;'+
          'box-shadow:0 12px 28px rgba(0,0,0,.45);cursor:pointer;';
        document.body.appendChild(btn);
      }
      const onClick = () => { btn.removeEventListener('click', onClick); btn.remove(); resolve(); };
      btn.addEventListener('click', onClick);
    });
  }

  async function flashFramesWithAudioThenGoSlot() {
    let wrap = document.getElementById('jackpot-flash');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'jackpot-flash';
      wrap.style.cssText = 'position:fixed;inset:0;z-index:12000;background:#000;display:grid;place-items:center;';
      const img = document.createElement('img');
      img.id = 'jackpot-flash-img';
      img.alt = 'cameo';
      img.style.cssText = 'width:100vw;height:100vh;object-fit:contain;user-select:none;pointer-events:none;';
      wrap.appendChild(img);
      document.body.appendChild(wrap);
    }
    const img = document.getElementById('jackpot-flash-img');

    img.src = CAMEO_IMAGES[0];
    let p = audio1.play();
    if (p && typeof p.then === 'function') {
      await p.catch(async () => { await showUnblockButton(); try { await audio1.play(); } catch {} });
    }
    await new Promise(res => { audio1.onended = res; audio1.onerror = res; });

    img.src = CAMEO_IMAGES[1];
    p = audio2.play();
    if (p && typeof p.then === 'function') {
      await p.catch(async () => { await showUnblockButton(); try { await audio2.play(); } catch {} });
    }
    await new Promise(res => { audio2.onended = res; audio2.onerror = res; });

    location.href = '/slot';
  }

  function makeCrackSVG(size = 180){
    const S = size, cx = S/2, cy = S/2;
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox', `0 0 ${S} ${S}`);
    const spokes = 5 + Math.floor(Math.random()*5);
    for(let i=0;i<spokes;i++){
      const a = Math.random()*Math.PI*2;
      const len = (S*0.35) + Math.random()*S*0.45;
      const x2 = cx + Math.cos(a)*len, y2 = cy + Math.sin(a)*len;
      const p = document.createElementNS('http://www.w3.org/2000/svg','path');
      p.setAttribute('d', `M ${cx} ${cy} L ${x2} ${y2}`);
      svg.appendChild(p);
    }
    const rings = 2 + Math.floor(Math.random()*3);
    for(let r=0;r<rings;r++){
      const radius = S*0.18 + r*S*0.10 + Math.random()*S*0.08;
      const arcNum = 3 + Math.floor(Math.random()*3);
      for(let k=0;k<arcNum;k++){
        const a1 = Math.random()*Math.PI*2;
        const span = (Math.PI/6) + Math.random()*(Math.PI/5);
        const a2 = a1 + span;
        const x1 = cx + Math.cos(a1)*radius, y1 = cy + Math.sin(a1)*radius;
        const xm = cx + Math.cos((a1+a2)/2)*radius*(0.98+Math.random()*0.04);
        const ym = cy + Math.sin((a1+a2)/2)*radius*(0.98+Math.random()*0.04);
        const x2 = cx + Math.cos(a2)*radius, y2 = cy + Math.sin(a2)*radius;
        const p = document.createElementNS('http://www.w3.org/2000/svg','path');
        p.setAttribute('d', `M ${x1} ${y1} Q ${xm} ${ym} ${x2} ${y2}`);
        svg.appendChild(p);
      }
    }
    svg.querySelectorAll('path').forEach((path, i)=>{
      const L = path.getTotalLength();
      path.style.strokeDasharray = L;
      path.style.strokeDashoffset = L;
      path.style.setProperty('--len', L);
      path.style.setProperty('--sw', (1.8 + Math.random()*1.3).toFixed(2));
      path.style.animationDelay = (i*22 + Math.random()*40) + 'ms';
      requestAnimationFrame(()=> path.classList.add('draw'));
    });
    return svg;
  }

  function startOraOra(){
    if (document.body.classList.contains('is-transforming')) return;
    document.body.classList.add('is-transforming');

    const ora = document.getElementById('ora');
    if (ora) { ora.classList.add('show'); setTimeout(()=> ora.classList.remove('show'), 2000); }

    const cracksHost = document.getElementById('cracks');
    cracksHost.innerHTML = '';

    const period = 60, lifetime = 2000;
    const t0 = performance.now();

    const goSlot = Math.random() < JACKPOT_RATE;
    if (goSlot) { primeAudio(); }

    (function spawn(){
      const now = performance.now();
      if (now - t0 > lifetime) return;
      const d = document.createElement('div');
      d.className = 'crack';
      const w = 140 + Math.random()*200;
      d.style.setProperty('--w', w+'px');
      d.style.setProperty('--s', (0.85 + Math.random()*0.25).toFixed(2));
      d.style.setProperty('--r', ((Math.random()*360)|0)+'deg');
      d.style.left = (Math.random()*innerWidth) + 'px';
      d.style.top  = (Math.random()*innerHeight) + 'px';
      d.appendChild(makeCrackSVG(w));
      cracksHost.appendChild(d);
      setTimeout(spawn, period);
    })();

    setTimeout(async () => {
      if (goSlot) { await flashFramesWithAudioThenGoSlot(); return; }
      const prevIdx = (currentIdx - 1 + THEMES.length) % THEMES.length;
      applyThemeByIdx(prevIdx);
      setTimeout(()=> {
        cracksHost.innerHTML = '';
        document.body.classList.remove('is-transforming');
      }, 300);
    }, lifetime - 200);
  }

  // expose (デバッグ用)
  window.startBTDBackground = () => BTD_BG.playOnceWithGesture();
  window.stopBTDBackground  = () => BTD_BG.stop();
  window.startTransform = startTransform;
})();
