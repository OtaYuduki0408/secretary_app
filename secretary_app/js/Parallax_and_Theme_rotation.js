import {check_chat_Space} from './ChatSpace.js'
/* =======================
   Parallax + Theme rotation
   ======================= */
(() => {
  /* Parallax */
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduceMotion) {
    const MAX_SHIFT = Math.min(60, Math.max(24, Math.round(Math.min(innerWidth, innerHeight) * 0.06)));
    let txT = 0, tyT = 0, tx = 0, ty = 0;
    const raf = () => {
      tx += (txT - tx) * 0.12; ty += (tyT - ty) * 0.12;
      document.documentElement.style.setProperty('--mx', tx.toFixed(2)+'px');
      document.documentElement.style.setProperty('--my', ty.toFixed(2)+'px');
      requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
    const onMove = (x,y)=>{ const nx=x/innerWidth-.5, ny=y/innerHeight-.5; txT=nx*MAX_SHIFT; tyT=ny*MAX_SHIFT; };
    addEventListener('pointermove', e=>onMove(e.clientX,e.clientY), {passive:true});
    addEventListener('touchmove', e=>{const t=e.touches[0]; if(t) onMove(t.clientX,t.clientY);}, {passive:true});
    addEventListener('deviceorientation', e=>{
      if(e.gamma==null||e.beta==null) return;
      txT=Math.max(-1,Math.min(1,e.gamma/45))*MAX_SHIFT;
      tyT=Math.max(-1,Math.min(1,e.beta /45))*MAX_SHIFT;
    },{passive:true});
  }

  /* Theme persistence */
  const THEME_KEY = 'vs_theme_idx';
  const THEMES = ['dark','light','purple','blue','orange'];

  function removeAllThemes(){
    document.documentElement.classList.remove('theme-light','theme-purple','theme-blue','theme-orange');
  }
  function applyThemeByIdx(idx){
    const i = ((idx % THEMES.length) + THEMES.length) % THEMES.length;
    const name = THEMES[i];
    removeAllThemes();
    if (name !== 'dark') document.documentElement.classList.add('theme-'+name);
    localStorage.setItem(THEME_KEY, String(i));
    currentIdx = i;
  }

  // 初期反映
  let currentIdx = parseInt(localStorage.getItem(THEME_KEY) || '0', 10);
  if (Number.isNaN(currentIdx)) currentIdx = 0;
  applyThemeByIdx(currentIdx);

  /* Commands */
  const input = document.getElementById('searchbox');
  const BTD_WORDS = ['ヴァイツァダスト','ヴァイツァ・ダスト','バイツァダスト','バイツァ・ダスト','bites the dust','btd'];
  const norm = s => (s||'').toString().trim().replace(/[・\s]/g,'').toLowerCase();
  const isBTD = v => BTD_WORDS.map(norm).includes(norm(v));
  const isORA = v => {
    const s = (v||'').toString().trim().replace(/[・\s]/g,'');
    return /^(?:オラ)+[!！ァぁー〜～]*$/u.test(s) || /^(?:ora)+[!！\-~～]*$/i.test(s);
  };

  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const raw = (input.value||'').trim();
    if (!raw) return;
    const v = raw.toLowerCase();
    input.value = '';

    if (v === 'transform') { startTransform(); return; }
    if (isBTD(raw))        { startReverseTransform(); return; }
    if (isORA(raw))        { startOraOra(); return; }
    check_chat_Space(v) //チャット解析に遷移させる。

  });

  /* ガラス落下：次テーマへ */
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

  /* ガラス逆再生：前テーマへ（Bites the Dust） */
  function startReverseTransform(){
    if (document.body.classList.contains('is-transforming')) return;
    document.body.classList.add('is-transforming');

    const overlay = document.getElementById('btd');
    overlay.classList.add('show');
    setTimeout(()=> overlay.classList.remove('show'), 2000);

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

  /* ======== オラオラ：SVGひび → 前テーマへ ======== */
  function makeCrackSVG(size = 180){
    const S = size, cx = S/2, cy = S/2;
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox', `0 0 ${S} ${S}`);

    // 放射状
    const spokes = 5 + Math.floor(Math.random()*5);
    for(let i=0;i<spokes;i++){
      const a = Math.random()*Math.PI*2;
      const len = (S*0.35) + Math.random()*S*0.45;
      const x2 = cx + Math.cos(a)*len, y2 = cy + Math.sin(a)*len;
      const p = document.createElementNS('http://www.w3.org/2000/svg','path');
      p.setAttribute('d', `M ${cx} ${cy} L ${x2} ${y2}`);
      svg.appendChild(p);
    }

    // 同心弧
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

    // 吹き出し 2秒
    const ora = document.getElementById('ora');
    ora.classList.add('show');
    setTimeout(()=> ora.classList.remove('show'), 2000);

    const cracksHost = document.getElementById('cracks');
    cracksHost.innerHTML = '';

    // 2秒間、高速でひび生成（消さずに保持）
    const period = 60, lifetime = 2000;
    const t0 = performance.now();

    (function spawn(){
      const now = performance.now();
      if (now - t0 > lifetime) return;

      const d = document.createElement('div');
      d.className = 'crack';

      // 位置・サイズ・回転
      const w = 140 + Math.random()*200;
      d.style.setProperty('--w', w+'px');
      d.style.setProperty('--s', (0.85 + Math.random()*0.25).toFixed(2));
      d.style.setProperty('--r', ((Math.random()*360)|0)+'deg');
      d.style.left = (Math.random()*innerWidth) + 'px';
      d.style.top  = (Math.random()*innerHeight) + 'px';

      d.appendChild(makeCrackSVG(w));
      cracksHost.appendChild(d);

      // ← ここで remove しない（保持）
      setTimeout(spawn, period);
    })();

    // テーマを「1つ前」に戻すタイミングで、ひび全体をフェードアウト開始
    const prevIdx = (currentIdx - 1 + THEMES.length) % THEMES.length;
    setTimeout(()=> {
      applyThemeByIdx(prevIdx);
      cracksHost.classList.add('fade');
    }, lifetime - 200);

    // 後片付け（フェード完了後）
    setTimeout(()=> {
      cracksHost.classList.remove('fade');
      cracksHost.innerHTML = '';
      document.body.classList.remove('is-transforming');
    }, lifetime + 500);
  }
})();