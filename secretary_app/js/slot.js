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

const CELL_H    = 86;
const PAY_LINES = 5;        // 上・中・下・斜め・逆斜め
const DEBUG_HUD = false;
const DIR_SIGN  = 1;

/* ====== audio ====== */
const VOICE_PATH = "../voice/";
const se = {
  spin:  new Audio(VOICE_PATH + "spin.mp3"),
  botan: new Audio(VOICE_PATH + "botan.mp3"),
  bet:   new Audio(VOICE_PATH + "bet.mp3"),
  gako:  new Audio(VOICE_PATH + "gako.mp3"),
  big:   new Audio(VOICE_PATH + "big.m4a"),
  rr:    new Audio(VOICE_PATH + "rr.m4a"),
};
function playSE(a){ try{ a.pause(); a.currentTime = 0; a.play(); }catch(_){} }

/* ====== DOM ====== */
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
const lampGogo   = document.getElementById("lamp-gogo");

/* ====== meters ====== */
let credit = 30, count = 0, payout = 0;
function setLamp(el, on){ if(el) el.style.background = on ? "var(--dot-on)" : "var(--dot-off)"; }
function updateMeters(){
  creditEl.textContent = pad(credit,3);
  countEl.textContent  = pad(count,3);
  payoutEl.textContent = pad(payout,3);
}
function pad(n,len){const s=String(n);return s.length>=len?s:"0".repeat(len-s.length)+s}
setLamp(lampWait, true); updateMeters();

/* ====== GOGO & ボーナス状態 ====== */
// GOGO点灯時に“チャンス中”。この間に BIG/REG を揃えた場合だけ m4a 再生＆確定当たり（保証）開始。
const GOGO_PROB = 1/50;
let gogoChance = false;          // ランプ点灯が継続する“チャンス中”か
let currentSpinHadGogo = false;  // このスピン開始時にGOGOが点灯していたか

// BIG/REG 後の「特定クレジット到達まで必ず当たる」モード
let bonusMode  = null;           // null | "big" | "reg"
let bonusTarget = 0;             // big: 280 / reg: 96

// 非点灯時の“目押し不可”遅延
const NO_GOGO_DELAY_MIN = 180;
const NO_GOGO_DELAY_MAX = 360;
function randDelay(){
  return NO_GOGO_DELAY_MIN + Math.random()*(NO_GOGO_DELAY_MAX - NO_GOGO_DELAY_MIN);
}

// 放置フェイルセーフ
const FALLBACK_MS = 5000;
let fallbackTimer = null;

// preload
const preload = SYMBOLS.map(name => new Promise(res=>{
  const img = new Image(); img.onload=res; img.onerror=res; img.src=IMG_PATH+name;
}));

/* =========================================================
   Reel
   ========================================================= */
class Reel {
  constructor(root, strip, idx){
    this.root = root; this.strip = strip; this.idx = idx;
    this.speed = 0; this.spinning = false;

    this.snapping=false; this.snapFrom=0; this.snapTo=0; this.snapT=0; this.snapDur=0.12;

    this.track = document.createElement("div");
    Object.assign(this.track.style,{position:"absolute",left:0,right:0,top:0,willChange:"transform"});
    this.root.appendChild(this.track);

    const VISIBLE=3, BUF=2;
    this.cells=[]; this.cellCount = strip.length + VISIBLE + BUF;

    this.topIndex=0;
    this.offsetPx=0;

    const OVERFILL=8, IMG_H=CELL_H+OVERFILL, BASE_TOP=-Math.floor(OVERFILL/2);
    for(let i=0;i<this.cellCount;i++){
      const cell=document.createElement("div");
      cell.className="symbol"; cell.style.top=(i*CELL_H)+"px";
      const img=document.createElement("img");
      img.className="sym"; img.style.height=IMG_H+"px"; img.style.top=BASE_TOP+"px"; img.alt="";
      cell.appendChild(img); this.track.appendChild(cell); this.cells.push(cell);
    }

    this.topIndex=(Math.random()*strip.length)|0;
    this.offsetPx=0; this.refreshAllCells(); this.applyTransform();
  }
  setCellImage(cell,sym){ const img=cell.firstChild; img.src=IMG_PATH+sym; img.alt=sym; }
  refreshAllCells(){
    const L=this.strip.length;
    for(let i=0;i<this.cellCount;i++){
      const sym=this.strip[(this.topIndex+i)%L];
      this.setCellImage(this.cells[i],sym);
      this.cells[i].style.left="0"; this.cells[i].style.right="0";
      this.cells[i].style.position="absolute"; this.cells[i].style.top=(i*CELL_H)+"px";
    }
  }
  start(speed){ this.spinning=true; this.snapping=false; this.speed=speed; }
  requestStop(){
    if(!this.spinning) return;
    const nearest = Math.round(this.offsetPx / CELL_H) * CELL_H;
    this.snapFrom=this.offsetPx; this.snapTo=nearest; this.snapT=0;
    this.snapping=true; this.spinning=false;
  }
  update(dt){
    if(this.spinning){
      this.offsetPx += DIR_SIGN * this.speed * dt;
      this.recycle(); this.applyTransform(); if(DEBUG_HUD) this.hud(); return;
    }
    if(this.snapping){
      this.snapT=Math.min(1,this.snapT+dt/this.snapDur);
      const t=1-Math.pow(1-this.snapT,3);
      this.offsetPx=this.snapFrom+(this.snapTo-this.snapFrom)*t;
      this.recycle(); this.applyTransform();
      if(this.snapT>=1){
        this.offsetPx=Math.round(this.offsetPx/CELL_H)*CELL_H;
        this.recycle(); this.applyTransform(); this.snapping=false;
      }
      if(DEBUG_HUD) this.hud();
    }
  }
  recycle(){
    const L=this.strip.length;
    if(DIR_SIGN===+1){
      while(this.offsetPx>=CELL_H){
        this.offsetPx-=CELL_H;
        const first=this.cells.shift(); this.cells.push(first);
        this.topIndex=(this.topIndex+1)%L;
        const lastIdx=this.cells.length-1;
        const sym=this.strip[(this.topIndex+lastIdx)%L];
        this.setCellImage(first,sym); this.relayout();
      }
    }else{
      while(this.offsetPx<=-CELL_H){
        this.offsetPx+=CELL_H;
        const last=this.cells.pop(); this.cells.unshift(last);
        this.topIndex=(this.topIndex-1+L)%L;
        const sym=this.strip[this.topIndex];
        this.setCellImage(last,sym); this.relayout();
      }
    }
  }
  relayout(){ for(let i=0;i<this.cells.length;i++){ this.cells[i].style.top=(i*CELL_H)+"px"; } }
  applyTransform(){ this.track.style.transform=`translateY(${-Math.round(this.offsetPx)}px) translateZ(0)`; }
  getVisible3(){
    const L=this.strip.length;
    return [ this.strip[(this.topIndex+0)%L], this.strip[(this.topIndex+1)%L], this.strip[(this.topIndex+2)%L] ];
  }
  isIdle(){ return !this.spinning && !this.snapping; }
  hud(){
    const v=this.getVisible3();
    this.root.dataset.top=v[0]; this.root.dataset.mid=v[1]; this.root.dataset.bot=v[2];
  }
}

/* ========= 起動・UI ========= */
Promise.all(preload).then(()=>{
  const reelNodes = Array.from(document.querySelectorAll(".reel"));
  window.reels = reelNodes.map((el,i)=> new Reel(el, REEL_STRIP, i));
  setupLoopAndUI();
});

function setupLoopAndUI(){
  const SPEED = 2000;
  let last = 0;

  function loop(t){
    if(!last) last=t;
    const dt = Math.min(0.03,(t-last)/1000); last=t;
    for(const r of reels) r.update(dt);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  const allIdle = () => reels.every(r=>r.isIdle());

  // ---- GOGO on/off（チャンスモード）----
  function lightGogo(){ gogoChance = true; lampGogo?.classList.add("on"); playSE(se.gako); }
  function offGogo(){   gogoChance = false; lampGogo?.classList.remove("on"); }

  // ---- フェイルセーフ ----
  function clearFallback(){ if(fallbackTimer){ clearTimeout(fallbackTimer); fallbackTimer=null; } }
  function scheduleFallback(){
    clearFallback();
    fallbackTimer = setTimeout(()=>{
      [0,1,2].forEach((i,idx)=>{
        if(!reels[i].isIdle()) setTimeout(()=> internalStop(i,true), idx*250);
      });
    }, FALLBACK_MS);
  }

  // ---- 全停止を監視して精算 ----
  let finishingWatcher = null;
  function armFinishWatcher(){
    if (finishingWatcher) return;
    const tick = () => {
      if (reels.every(r=>r.isIdle())) {
        finishingWatcher = null;
        maybeFinish();
      } else {
        finishingWatcher = requestAnimationFrame(tick);
      }
    };
    finishingWatcher = requestAnimationFrame(tick);
  }

  // ---- スタート ----
  function start(){
    if(!allIdle() || credit<=0) return;
    credit--; count++; payout=0; updateMeters();
    setLamp(lampStart,true); setLamp(lampWait,false); setLamp(lampReplay,false);
    if (yakuEl) yakuEl.textContent = "役：---";
    reels.forEach(r => r.start(SPEED));
    playSE(se.spin);

    // 既にチャンス中なら継続。そうでない時だけランダム点灯
    if(!gogoChance && !bonusMode && Math.random() < GOGO_PROB) lightGogo();

    // ★ このスピン開始時点のGOGO状態を記録（BIG/REG を引いた時のトリガー判定に使用）
    currentSpinHadGogo = gogoChance;

    scheduleFallback();
  }

  // ---- 押されたリールだけ止める（force=true は強制即停止）----
  function internalStop(which, force=false){
    const r = reels[which]; if(!r || r.isIdle()) return;

    if(!force && !gogoChance){
      // 非点灯時の手動：少し遅らせて強制停止（目押し無効）
      setTimeout(()=> internalStop(which, true), randDelay());
      armFinishWatcher();
      return;
    }

    // GOGO中の手動 or 強制：即停止
    r.requestStop();
    armFinishWatcher();
  }

  // ---- 配当判定の補助 ----
  const isBigLine = line =>
    line[0]==="seven.png" && line[1]==="seven.png" && line[2]==="seven.png";

  // 順不同の 7・7・BAR（上/中/下/斜め/逆斜め いずれの1ラインでもOK）
  const isRegLine = line => {
    const a = [line[0], line[1], line[2]];
    const count7  = a.filter(v => v==="seven.png").length;
    const countBar= a.filter(v => v==="bar.png").length;
    return count7===2 && countBar===1;
  };

  /* === “キレイな役”一覧（保証に使用・judge配当を踏襲） === */
  const CLEAN_SET = [
    { sym:"seven.png",  name:"７・７・７",        payout:50 },
    { sym:"bar.png",    name:"BAR・BAR・BAR",    payout:20 },
    { sym:"bell.png",   name:"ベル３",            payout:10 },
    { sym:"sai.png",    name:"サイ３",            payout:5  },
    { sym:"cherry.png", name:"チェリー３",        payout:3  },
    { sym:"lemon.png",  name:"ぶどう３",          payout:3  },
  ];

  /**
   * 画面の絵柄を、本当に“揃っている”状態へ作り替える
   * lineKind: "top"|"mid"|"bot"|"diag"|"rdiag"
   */
  function forceDisplayCleanWin(sym, lineKind){
    const rowsByCol = (() => {
      switch(lineKind){
        case "top":  return [0,0,0];
        case "mid":  return [1,1,1];
        case "bot":  return [2,2,2];
        case "diag": return [0,1,2];
        case "rdiag":return [2,1,0];
        default:     return [1,1,1];
      }
    })();

    reels.forEach((r, col)=>{
      const L = r.strip.length;
      const row = rowsByCol[col];
      // strip[(t + row) % L] === sym となる t を探す
      let t = 0;
      for(let k=0;k<L;k++){
        if(r.strip[(k + row) % L] === sym){ t = k; break; }
      }
      r.topIndex = t;
      r.offsetPx = 0;
      r.refreshAllCells();
      r.applyTransform();
    });
  }

  // ---- 全停止後に精算 ----
  function maybeFinish(){
    if(!reels.every(r=>r.isIdle())) return;

    clearFallback();
    setLamp(lampStart,false); setLamp(lampWait,true);

    const vis = reels.map(r => r.getVisible3());
    const lines = [];
    if (PAY_LINES === 1) {
      lines.push( ["中", [vis[0][1], vis[1][1], vis[2][1]]] );
    } else {
      lines.push( ["上", [vis[0][0], vis[1][0], vis[2][0]]] );
      lines.push( ["中", [vis[0][1], vis[1][1], vis[2][1]]] );
      lines.push( ["下", [vis[0][2], vis[1][2], vis[2][2]]] );
      lines.push( ["斜", [vis[0][0], vis[1][1], vis[2][2]]] );
      lines.push( ["逆", [vis[0][2], vis[1][1], vis[2][0]]] );
    }

    // 通常の配当集計（全ライン対象）
    let total = 0;
    const hitNames = [];
    let bigHit = false, regHit = false;

    for(const [label, line] of lines){
      const w = judge3only(line);
      if(w>0){
        total += w;
        hitNames.push(`${label}: ${handName3only(line)}（${w}枚）`);
      }
      if(isBigLine(line)) bigHit = true;
      if(isRegLine(line)) regHit = true;
    }

    // --- ボーナストリガー ---
    // ★ GOGOが光っていたスピンで BIG/REG を揃えたときだけ m4a＆確定当たり開始
    if(currentSpinHadGogo){
      if(bigHit){
        playSE(se.big);
        bonusMode = "big"; bonusTarget = 280;
        offGogo();
      } else if(regHit){
        playSE(se.rr);
        bonusMode = "reg"; bonusTarget = 96;
        offGogo();
      }
    }
    // ※ GOGO無しで 777 / 7・7・BAR が出ても通常当たりのみ（m4aも保証も開始しない）

    // --- 確定当たり（保証） ---
    // BIG/REG 後で、目標CREDITに未達 & 今回ノーヒットなら“キレイな役”を揃えて見せる
    if(bonusMode && credit < bonusTarget && total === 0){
      const pick = CLEAN_SET[(Math.random()*CLEAN_SET.length)|0];
      const kinds = ["top","mid","bot","diag","rdiag"];
      const lineKind = kinds[(Math.random()*kinds.length)|0];

      // 実際に画面を揃った状態へ変更
      forceDisplayCleanWin(pick.sym, lineKind);

      // 配当と表示
      total += pick.payout;
      hitNames.push(`${pick.name}（${pick.payout}枚）`);
    }

    // 精算
    if(total>0){
      payout += total; credit += total; setLamp(lampReplay,true); playSE(se.bet);
    }
    updateMeters();
    if(yakuEl) yakuEl.textContent = "役：" + (hitNames.length ? hitNames.join(" / ") : "なし");

    // 目標到達で確定当たりを終了
    if(bonusMode && credit >= bonusTarget){
      bonusMode = null; bonusTarget = 0;
    }

    // 次スピン用にフラグをクリア
    currentSpinHadGogo = false;
  }

  // ---- ボタン/キー（必ずボタン音 → 停止要求）----
  const pressStop = (which)=>{ playSE(se.botan); internalStop(which,false); };

  spinBtn.addEventListener("click", start);
  btnL.addEventListener("click", ()=>pressStop(0));
  btnM.addEventListener("click", ()=>pressStop(1));
  btnR.addEventListener("click", ()=>pressStop(2));
  window.addEventListener("keydown",(e)=>{
    const k=e.key.toLowerCase();
    if(k===" "){ e.preventDefault(); if(reels.every(r=>r.isIdle())) start(); }
    if(k==="z") pressStop(0);
    if(k==="x") pressStop(1);
    if(k==="c") pressStop(2);
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
