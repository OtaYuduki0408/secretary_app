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

const CELL_H = 86;          // CSS --cell と一致
const PAY_LINES = 5;        // 1 / 3 / 5
const SNAP_EPS = 0.0001;
//変数宣言
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
updateMeters(); //メータを更新する
function setLamp(el, on){ el.style.background = on ? "var(--dot-on)" : "var(--dot-off)" }
setLamp(lampWait, true);

// 画像プリロード
const preload = SYMBOLS.map(name => new Promise(res=>{
  const img = new Image(); img.onload=res; img.onerror=res; img.src=IMG_PATH+name;
}));

class Reel {
  //初期化
  constructor(root, strip, idx){
    this.root = root;
    this.strip = strip;
    this.idx = idx;

    this.y = 0;
    this.speed = 0;
    this.spinning = false;

    this.snapping = false;
    this.snapFrom = 0;
    this.snapTo   = 0;
    this.snapT    = 0;
    this.snapDur  = 0.12;

    this.track = document.createElement("div");
    Object.assign(this.track.style,{position:"absolute",left:0,right:0,top:0,willChange:"transform"});
    this.root.appendChild(this.track);

    this.cells = [];
    const repeat = 3;

    const Y_TWEAK = { "cherry.png":4, "bell.png":1, "lemon.png":1, "bar.png":0, "seven.png":0, "sai.png":0 };
    const OVERFILL = 12;
    const IMG_H = CELL_H + OVERFILL;
    const BASE_TOP = -Math.floor(OVERFILL/2);

    for(let r=0; r<repeat; r++){
      for(const s of this.strip){
        const cell = document.createElement("div");
        cell.className = "symbol";
        const img = document.createElement("img");
        img.className = "sym";
        img.src = IMG_PATH + s;
        img.alt = s;
        img.style.height = IMG_H + "px";
        img.style.top    = (BASE_TOP + (Y_TWEAK[s]||0)) + "px";
        cell.appendChild(img);
        this.track.appendChild(cell);
        this.cells.push(cell);
      }
    }

    this.total  = this.strip.length * repeat;
    this.height = this.total * CELL_H;

    this.y = Math.round(Math.random()*this.height/CELL_H)*CELL_H % this.height;
    this.applyTransform();
  }

  start(speed){
    this.spinning = true;
    this.snapping = false;
    this.speed = speed;
  }

  requestStop(){
    if(!this.spinning) return;
    const nearest = Math.round(this.y / CELL_H) * CELL_H;
    const norm = v => ((v % this.height) + this.height) % this.height;
    this.snapFrom = this.y;
    this.snapTo   = norm(nearest);
    this.snapT    = 0;
    this.snapping = true;
    this.speed    = 0;
  }

  update(dt){
    if(this.snapping){
      this.snapT = Math.min(1, this.snapT + dt/this.snapDur);
      const t = 1 - Math.pow(1 - this.snapT, 3);

      let delta = this.snapTo - this.snapFrom;
      if(delta >  this.height/2) delta -= this.height;
      if(delta < -this.height/2) delta += this.height;

      this.y = ((this.snapFrom + delta * t) % this.height + this.height) % this.height;

      if(this.snapT >= 1){
        this.y = Math.round(this.y / CELL_H) * CELL_H;
        this.y = ((this.y % this.height) + this.height) % this.height;
        this.snapping = false;
        this.spinning = false;
      }
      this.applyTransform();
      return;
    }

    if(!this.spinning) return;
    this.y += this.speed * dt;
    if(this.y >= this.height) this.y -= this.height;
    this.applyTransform();
  }

  applyTransform(){
    this.track.style.transform = `translateY(${-Math.round(this.y)}px) translateZ(0)`;
  }

  /** 可視 [top, mid, bottom]（中央段＝base+1 を絶対基準） */
  getVisible3(){
    const L = this.strip.length;
    const offset = Math.round(this.y / CELL_H);
    const base   = (offset % L + L) % L;
    return [
      this.strip[(base + 0) % L],  // top
      this.strip[(base + 1) % L],  // mid
      this.strip[(base + 2) % L],  // bottom
    ];
  }

  isIdle(){ return !this.spinning && !this.snapping; }
}

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

  async function waitUntilAllIdle(timeoutMs=1200){
    const startT = performance.now();
    while(performance.now()-startT < timeoutMs){
      if(allIdle()) return true;
      await new Promise(r=>setTimeout(r, 30));
    }
    return allIdle();
  }

  async function tryStop(which){
    const r = reels[which]; if(!r) return;
    r.requestStop();

    // ★ 全リール停止を厳密に待つ
    const ok = await waitUntilAllIdle();
    if(!ok) return;

    setLamp(lampStart,false); setLamp(lampWait,true);

    const vis = reels.map(r => r.getVisible3()); // [[T,M,B], ...]
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

  // UI
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
