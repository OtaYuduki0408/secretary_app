/* ===========================
   JUGGLER-like Slot (no photo)
   Space: start, Z/X/C: stop
   =========================== */

const IMG_PATH = "../img/reel/";
const SYMBOLS = ["bar.png","bell.png","cherry.png","lemon.png","sai.png","seven.png"];

const REEL_STRIP = [
  "bar.png","cherry.png","lemon.png","bell.png","seven.png","lemon.png",
  "cherry.png","sai.png","lemon.png","bell.png","bar.png","lemon.png",
  "cherry.png","bell.png","seven.png","lemon.png","sai.png","cherry.png",
];

const CELL_H   = 86;          // CSS --cell と一致
const PAY_LINES= 5;           // 1 / 3 / 5
const SNAP_EPS = 0.0001;
const DEBUG_HUD = false;      // ← true にすると各リールの [top/mid/bot] を表示

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

// meters
let credit = 30, count = 0, payout = 0;
updateMeters();
function setLamp(el, on){ el.style.background = on ? "var(--dot-on)" : "var(--dot-off)" }
setLamp(lampWait, true);

// preload
const preload = SYMBOLS.map(name => new Promise(res=>{
  const img = new Image(); img.onload=res; img.onerror=res; img.src=IMG_PATH+name;
}));

/* =========================================================
   Reel（リサイクル式スクロール）
   - 配列(REEL_STRIP)は不変、topIndex と DOMセル再利用で循環
   - 下へ流し、1セルぶん進んだら先頭セルを末尾へ回す
   - 停止は offsetPx を最近傍セルへスナップ（easeOut）
   ========================================================= */
class Reel {
  constructor(root, strip, idx){
    this.root  = root;
    this.strip = strip;
    this.idx   = idx;

    this.speed     = 0;        // px/sec
    this.spinning  = false;

    // スナップ
    this.snapping = false;
    this.snapFrom = 0;
    this.snapTo   = 0;
    this.snapT    = 0;
    this.snapDur  = 0.12;

    // ビュー
    this.track = document.createElement("div");
    Object.assign(this.track.style,{ position:"absolute", left:0, right:0, top:0, willChange:"transform" });
    this.root.appendChild(this.track);

    // セル群（strip長 + 可視3 + バッファ）
    this.cells = [];
    const VISIBLE = 3;
    const BUF = 2;
    this.cellCount = strip.length + VISIBLE + BUF;
    this.topIndex  = 0;      // strip の先頭を指す index
    this.offsetPx  = 0;      // 先頭セルの上端からのスクロール量（0..CELL_H）

    // 見た目微調整
    const Y_TWEAK = { "cherry.png":4, "bell.png":1, "lemon.png":1, "bar.png":0, "seven.png":0, "sai.png":0 };
    const OVERFILL = 8;                                  // ← 少なめ推奨（はみ出し誤認防止）
    const IMG_H = CELL_H + OVERFILL;
    const BASE_TOP = -Math.floor(OVERFILL/2);

    for(let i=0;i<this.cellCount;i++){
      const cell = document.createElement("div");
      cell.className = "symbol";
      cell.style.position = "absolute";
      cell.style.left = "0"; cell.style.right = "0";
      cell.style.top  = (i * CELL_H) + "px";

      const img = document.createElement("img");
      img.className = "sym";
      img.style.height = IMG_H + "px";
      img.style.top    = BASE_TOP + "px";
      img.alt = "";
      cell.appendChild(img);

      this.track.appendChild(cell);
      this.cells.push(cell);
    }

    // 初期位置：ランダムな topIndex に完全境界で合わせる
    this.topIndex = (Math.random() * strip.length)|0;
    this.offsetPx = 0;
    this.refreshAllCells();
    this.applyTransform();
  }

  // 現在の topIndex 基準で全セルに画像を張る
  refreshAllCells(){
    const L = this.strip.length;
    for(let i=0;i<this.cellCount;i++){
      const sym = this.strip[(this.topIndex + i) % L];
      this.setCellImage(this.cells[i], sym);
    }
  }
  setCellImage(cell, sym){
    const img = cell.firstChild;
    img.src = IMG_PATH + sym;
    img.alt = sym;
  }

  start(speed){
    this.spinning = true;
    this.snapping = false;
    this.speed = speed;
  }

  requestStop(){
    if(!this.spinning) return;
    // 先頭セルの上端基準 offsetPx を最近傍セルに吸着
    const nearest = Math.round(this.offsetPx / CELL_H) * CELL_H;
    this.snapFrom = this.offsetPx;
    this.snapTo   = nearest;
    this.snapT    = 0;
    this.snapping = true;
    this.spinning = false;
  }

  update(dt){
    if(this.spinning){
      this.offsetPx += this.speed * dt;
      this.recycleDownward();
      this.applyTransform();
      if (DEBUG_HUD) this.hud();
      return;
    }
    if(this.snapping){
      this.snapT = Math.min(1, this.snapT + dt / this.snapDur);
      const t = 1 - Math.pow(1 - this.snapT, 3);
      this.offsetPx = this.snapFrom + (this.snapTo - this.snapFrom) * t;
      this.recycleDownward();
      this.applyTransform();
      if (this.snapT >= 1){
        this.offsetPx = Math.round(this.offsetPx / CELL_H) * CELL_H;
        this.recycleDownward();
        this.applyTransform();
        this.snapping = false;
      }
      if (DEBUG_HUD) this.hud();
    }
  }

  // 1セル以上進んだら：offset を戻し、先頭セルを末尾へ、画像を次に
  recycleDownward(){
    const L = this.strip.length;
    while(this.offsetPx >= CELL_H){
      this.offsetPx -= CELL_H;

      // 先頭セルを末尾へ
      const first = this.cells.shift();
      this.cells.push(first);

      // 末尾の表示位置へ移動
      const lastIdx = this.cells.length - 1;
      first.style.top = (lastIdx * CELL_H) + "px";

      // 次の先頭へ
      this.topIndex = (this.topIndex + 1) % L;

      // 末尾セルに貼るべき絵柄（topIndex から lastIdx 先）
      const sym = this.strip[(this.topIndex + lastIdx) % L];
      this.setCellImage(first, sym);
    }
  }

  applyTransform(){
    this.track.style.transform = `translateY(${-Math.round(this.offsetPx)}px) translateZ(0)`;
  }

  /** 可視 [top, mid, bottom] を返す（topIndex 基準で連続） */
  getVisible3(){
    const L = this.strip.length;
    return [
      this.strip[(this.topIndex + 0) % L],
      this.strip[(this.topIndex + 1) % L],
      this.strip[(this.topIndex + 2) % L],
    ];
  }

  isIdle(){ return !this.spinning && !this.snapping; }

  // デバッグHUD（現在見えている3段を data-* に出す）
  hud(){
    const v = this.getVisible3();
    this.root.dataset.top = v[0];
    this.root.dataset.mid = v[1];
    this.root.dataset.bot = v[2];
  }
}

/* ========== 起動 ========== */
Promise.all(preload).then(()=>{
  const reelNodes = Array.from(document.querySelectorAll(".reel"));
  window.reels = reelNodes.map((el,i)=> new Reel(el, REEL_STRIP, i));
  setupLoopAndUI();
});

function setupLoopAndUI(){
  const speeds = [1800,2000,2200];
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
    reels.forEach((r,i)=> r.start(speeds[i]));
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

/* === “３つ揃いのみ”を払出し === */
function judge3only(line){
  const v = line[0];
  if (line[1]!==v || line[2]!==v) return 0;

  if (v==="seven.png") return 50;
  if (v==="bar.png")   return 20;
  if (v==="bell.png")  return 10;
  if (v==="sai.png")   return 5;
  if (v==="cherry.png" || v==="lemon.png") return 3; // ぶどう=lemon.png
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

/* === メータ更新 === */
function updateMeters(){
  creditEl.textContent = pad(credit,3);
  countEl.textContent  = pad(count,3);
  payoutEl.textContent = pad(payout,3);
}
function pad(n,len){const s=String(n);return s.length>=len?s:"0".repeat(len-s.length)+s}
