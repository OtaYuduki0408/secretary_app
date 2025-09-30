/* ==========================================
   JUGGLER-like Slot (seamless reel / same speed)
   Space: start, Z/X/C: stop L/M/R
   ========================================== */

const IMG_PATH = "../img/reel/";
const SYMBOLS  = ["bar.png","bell.png","cherry.png","lemon.png","sai.png","seven.png"];
const REEL_STRIP = [
  "bar.png","cherry.png","lemon.png","bell.png","seven.png","lemon.png",
  "cherry.png","sai.png","lemon.png","bell.png","bar.png","lemon.png",
  "cherry.png","bell.png","seven.png","lemon.png","sai.png","cherry.png",
];

const CELL_H    = 86;      // CSS --cell と一致
const PAY_LINES = 5;       // 1/3/5
const DEBUG_HUD = false;

const DIR_SIGN  = 1;

// DOM
const creditEl = document.getElementById("credit");
const countEl  = document.getElementById("count");
const payoutEl = document.getElementById("payout");
const spinBtn  = document.getElementById("spin");
const btnL = document.getElementById("goL");
const btnM = document.getElementById("goM");
const btnR = document.getElementById("goR");
const lampStart  = document.getElementById("lamp-start");
const lampReplay = document.getElementById("lamp-replay");
const lampWait   = document.getElementById("lamp-wait");
const yakuEl     = document.getElementById("yaku");

let credit = 30, count = 0, payout = 0;
function setLamp(el, on){ if(el) el.style.background = on ? "var(--dot-on)" : "var(--dot-off)"; }
function updateMeters(){
  creditEl.textContent = pad(credit,3);
  countEl.textContent  = pad(count,3);
  payoutEl.textContent = pad(payout,3);
}
function pad(n,len){const s=String(n);return s.length>=len?s:"0".repeat(len-s.length)+s}
setLamp(lampWait, true); updateMeters();

// preload
const preload = SYMBOLS.map(name => new Promise(res=>{
  const img = new Image(); img.onload=res; img.onerror=res; img.src=IMG_PATH+name;
}));

/* =========================================================
   Reel（index循環＋DOMリサイクル）
   - 配列は不変。topIndex とセルの再配置で循環
   - DIRECTION により上/下どちらにも対応
   - 全列同速（高さラインが揃う）
   ========================================================= */
class Reel {
  constructor(root, strip, idx){
    this.root  = root;
    this.strip = strip;
    this.idx   = idx;

    this.speed     = 0;       // px/sec（正値）→ 実際の増分は DIR_SIGN * speed
    this.spinning  = false;

    // 停止スナップ
    this.snapping = false;
    this.snapFrom = 0;
    this.snapTo   = 0;
    this.snapT    = 0;
    this.snapDur  = 0.12;

    // ビュー
    this.track = document.createElement("div");
    Object.assign(this.track.style,{position:"absolute",left:0,right:0,top:0,willChange:"transform"});
    this.root.appendChild(this.track);

    // セル（strip長 + 可視3 + バッファ2）
    const VISIBLE = 3, BUF = 2;
    this.cells = [];
    this.cellCount = strip.length + VISIBLE + BUF;

    // 先頭インデックスとオフセット
    this.topIndex = 0;    // cells[0] に貼る strip の index
    this.offsetPx = 0;    // cells[0] の上端からのスクロール量（0..CELL_H or 0..-CELL_H）

    // 見た目調整：回転中ズレの原因になるので全て0
    const OVERFILL = 8;
    const IMG_H = CELL_H + OVERFILL;
    const BASE_TOP = -Math.floor(OVERFILL/2);

    for(let i=0; i<this.cellCount; i++){
      const cell = document.createElement("div");
      cell.className = "symbol";
      cell.style.top = (i * CELL_H) + "px";

      const img = document.createElement("img");
      img.className = "sym";
      img.style.height = IMG_H + "px";
      img.style.top    = BASE_TOP + "px";
      img.alt = "";

      cell.appendChild(img);
      this.track.appendChild(cell);
      this.cells.push(cell);
    }

    // 初期：ランダム開始位置（完全境界）
    this.topIndex = (Math.random() * strip.length)|0;
    this.offsetPx = 0;
    this.refreshAllCells();
    this.applyTransform();
  }

  setCellImage(cell, sym){
    const img = cell.firstChild;
    img.src = IMG_PATH + sym;
    img.alt = sym;
  }
  refreshAllCells(){
    const L = this.strip.length;
    for(let i=0;i<this.cellCount;i++){
      const sym = this.strip[(this.topIndex + i) % L];
      this.setCellImage(this.cells[i], sym);
      // 各セルの絶対位置を index から再計算（方向に依らず 0..N-1）
      this.cells[i].style.left = "0";
      this.cells[i].style.right= "0";
      this.cells[i].style.position = "absolute";
      this.cells[i].style.top  = (i * CELL_H) + "px";
    }
  }

  start(speed){
    this.spinning = true;
    this.snapping = false;
    this.speed = speed;
  }

  requestStop(){
    if(!this.spinning) return;
    // 現在の offsetPx を最近傍のセル境界にスナップ
    const nearest = Math.round(this.offsetPx / CELL_H) * CELL_H;
    this.snapFrom = this.offsetPx;
    this.snapTo   = nearest;
    this.snapT    = 0;
    this.snapping = true;
    this.spinning = false;
  }

  update(dt){
    if(this.spinning){
      this.offsetPx += DIR_SIGN * this.speed * dt;
      this.recycle();
      this.applyTransform();
      if (DEBUG_HUD) this.hud();
      return;
    }
    if(this.snapping){
      this.snapT = Math.min(1, this.snapT + dt/this.snapDur);
      const t = 1 - Math.pow(1 - this.snapT, 3);
      this.offsetPx = this.snapFrom + (this.snapTo - this.snapFrom) * t;

      this.recycle();
      this.applyTransform();

      if(this.snapT >= 1){
        // 端数完全0化
        this.offsetPx = Math.round(this.offsetPx / CELL_H) * CELL_H;
        this.recycle();
        this.applyTransform();
        this.snapping = false;
      }
      if (DEBUG_HUD) this.hud();
    }
  }

  // 方向に応じて上下どちらでも循環させる
  recycle(){
    const L = this.strip.length;

    if (DIR_SIGN === +1){           // DOWN（上→下へ流れる）
      while(this.offsetPx >= CELL_H){
        this.offsetPx -= CELL_H;

        // 先頭セルを末尾へ
        const first = this.cells.shift();
        this.cells.push(first);

        // 先頭が1つ進む
        this.topIndex = (this.topIndex + 1) % L;

        // 末尾セルに貼る絵柄（topIndex から末尾まで）
        const lastIdx = this.cells.length - 1;
        const sym = this.strip[(this.topIndex + lastIdx) % L];
        this.setCellImage(first, sym);
        // レイアウト更新（安全に全再配置）
        this.relayout();
      }
    } else {                         // UP（下→上へ流れる）★今回の期待動作
      while(this.offsetPx <= -CELL_H){
        this.offsetPx += CELL_H;

        // 末尾セルを先頭へ
        const last = this.cells.pop();
        this.cells.unshift(last);

        // 先頭が1つ戻る（-1）
        this.topIndex = (this.topIndex - 1 + L) % L;

        // 先頭セルに貼る絵柄（topIndex を指す）
        const sym = this.strip[this.topIndex];
        this.setCellImage(last, sym);
        // レイアウト更新（安全に全再配置）
        this.relayout();
      }
    }
  }

  // 現在の cells の順序に合わせて top を並び直す
  relayout(){
    for(let i=0;i<this.cells.length;i++){
      this.cells[i].style.top = (i * CELL_H) + "px";
    }
  }

  applyTransform(){
    // 先頭セルの上端から offsetPx だけズラす。
    // UP（DIR_SIGN=-1）のとき offsetPx は負方向に増えるので、translateY(-offsetPx)で「上へ」動く見た目になる
    this.track.style.transform = `translateY(${-Math.round(this.offsetPx)}px) translateZ(0)`;
  }

  // 可視3段（top/mid/bot）は topIndex 基準で連続
  getVisible3(){
    const L = this.strip.length;
    return [
      this.strip[(this.topIndex + 0) % L],
      this.strip[(this.topIndex + 1) % L],
      this.strip[(this.topIndex + 2) % L],
    ];
  }

  isIdle(){ return !this.spinning && !this.snapping; }

  hud(){
    const v = this.getVisible3();
    this.root.dataset.top = v[0];
    this.root.dataset.mid = v[1];
    this.root.dataset.bot = v[2];
  }
}

/* ========= 起動・UI ========= */
Promise.all(preload).then(()=>{
  const reelNodes = Array.from(document.querySelectorAll(".reel"));
  window.reels = reelNodes.map((el,i)=> new Reel(el, REEL_STRIP, i));
  setupLoopAndUI();
});

function setupLoopAndUI(){
  const SPEED = 2000;      // ★ 全列同速に統一（高さラインが揃う）
  let last = 0;

  function loop(t){
    if(!last) last = t;
    const dt = Math.min(0.03, (t-last)/1000);
    last = t;
    for(const r of reels) r.update(dt);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  const allIdle = () => reels.every(r=>r.isIdle());

  function start(){
    if(!allIdle() || credit<=0) return;
    credit--; count++; payout=0; updateMeters();
    setLamp(lampStart,true); setLamp(lampWait,false); setLamp(lampReplay,false);
    if (yakuEl) yakuEl.textContent = "役：---";
    reels.forEach(r => r.start(SPEED));  // ★ 同速
  }

  async function waitUntilAllIdle(timeoutMs=1500){
    const t0 = performance.now();
    while(performance.now()-t0 < timeoutMs){
      if(allIdle()) return true;
      await new Promise(r=>setTimeout(r, 30));
    }
    return allIdle();
  }

  async function tryStop(which){
    const r = reels[which]; if(!r) return;
    r.requestStop();

    const ok = await waitUntilAllIdle();
    if(!ok) return;

    setLamp(lampStart,false); setLamp(lampWait,true);

    const vis = reels.map(r => r.getVisible3()); // [[T,M,B], ... 3列]
    const lines = [];

    if (PAY_LINES === 1) {
      lines.push( ["中", [vis[0][1], vis[1][1], vis[2][1]]] );
    } else {
      lines.push( ["上", [vis[0][0], vis[1][0], vis[2][0]]] );
      lines.push( ["中", [vis[0][1], vis[1][1], vis[2][1]]] );
      lines.push( ["下", [vis[0][2], vis[1][2], vis[2][2]]] );
      if (PAY_LINES >= 5) {
        lines.push( ["斜", [vis[0][0], vis[1][1], vis[2][2]]] );
        lines.push( ["逆", [vis[0][2], vis[1][1], vis[2][0]]] );
      }
    }

    // “３つ揃いのみ”配当（必要に応じて調整可）
    let total = 0;
    const hitNames = [];
    for(const [label, line] of lines){
      const w = judge3only(line);
      if(w>0){
        total += w;
        hitNames.push(`${label}: ${handName3only(line)}（${w}枚）`);
      }
    }

    if(total>0){
      payout += total;
      credit += total;
      setLamp(lampReplay,true);
    }
    updateMeters();
    if(yakuEl) yakuEl.textContent = "役：" + (hitNames.length ? hitNames.join(" / ") : "なし");
  }

  // UI/Key
  spinBtn.addEventListener("click", start);
  btnL.addEventListener("click", ()=>tryStop(0));
  btnM.addEventListener("click", ()=>tryStop(1));
  btnR.addEventListener("click", ()=>tryStop(2));
  window.addEventListener("keydown",(e)=>{
    const k=e.key.toLowerCase();
    if(k===" "){ e.preventDefault(); if(allIdle()) start(); }
    if(k==="z") tryStop(0);
    if(k==="x") tryStop(1);
    if(k==="c") tryStop(2);
  });
}

/* === “３つ揃いのみ” === */
function judge3only(line){
  const v = line[0];
  if (line[1]!==v || line[2]!==v) return 0;
  if (v==="seven.png") return 50;
  if (v==="bar.png")   return 20;
  if (v==="bell.png")  return 10;
  if (v==="sai.png")   return 5;
  if (v==="cherry.png" || v==="lemon.png") return 3;
  return 0;
}
function handName3only(line){
  const v = line[0];
  if (line[1]!==v || line[2]!==v) return "なし";
  if (v==="seven.png") return "７・７・７";
  if (v==="bar.png")   return "BAR・BAR・BAR";
  if (v==="bell.png")  return "ベル３";
  if (v==="sai.png")   return "サイ３";
  if (v==="cherry.png")return "チェリー３";
  if (v==="lemon.png") return "ぶどう３";
  return "なし";
}
