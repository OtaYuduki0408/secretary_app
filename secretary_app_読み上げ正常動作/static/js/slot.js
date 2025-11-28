/* =============================
   実機風 3リール／ボーナス制御／リプレイ実装
   - GOGO中は目押し可（ヒット→ピン止め／ミス→早めハズレ）
   - 内部BIG中は BAR77 を画面に出さないガード
   - 揃いライン（上/中/下/斜め/逆斜め）を毎ゲーム抽選
============================= */

const IMG_PATH = "static/img/reel/";
const SYMBOLS  = ["bar.png","bell.png","cherry.png","lemon.png","sai.png","seven.png"];

// 3リール個別ストリップ（左のみ 7↔BAR 隣接ありでもOK）
const REEL_STRIPS = [
  // L
  [
    "bar.png","cherry.png","lemon.png","bell.png",
    "seven.png","bar.png",
    "lemon.png","sai.png","lemon.png","bell.png",
    "bar.png","lemon.png","cherry.png","bell.png",
    "seven.png","lemon.png","sai.png","cherry.png"
  ],
  // M
  [
    "lemon.png","cherry.png","bell.png","bar.png",
    "sai.png","lemon.png","cherry.png","bell.png",
    "seven.png","lemon.png","sai.png","cherry.png",
    "bell.png","bar.png","lemon.png","cherry.png",
    "bell.png","seven.png"
  ],
  // R
  [
    "cherry.png","bell.png","lemon.png","sai.png",
    "cherry.png","seven.png","lemon.png","bell.png",
    "cherry.png","bar.png","lemon.png","sai.png",
    "bell.png","cherry.png","lemon.png","seven.png",
    "bell.png","cherry.png"
  ],
];

const CELL_H    = 86;
const PAY_LINES = 5;        // 上・中・下・斜め・逆斜め
const DEBUG_HUD = false;
const DIR_SIGN  = 1;

/* ====== audio ====== */
const VOICE_PATH = "static/voice/";
const se = {
  spin:  new Audio(VOICE_PATH + "spin.mp3"),
  botan: new Audio(VOICE_PATH + "botan.m4a"),
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
function updateMeters(){ creditEl.textContent = pad(credit,3); countEl.textContent = pad(count,3); payoutEl.textContent = pad(payout,3); }
function pad(n,len){const s=String(n);return s.length>=len?s:"0".repeat(len-s.length)+s}
setLamp(lampWait, true); updateMeters();

/* ====== 内部当選・告知 ====== */
const BONUS_PROB = 1/10;
const BIG_RATIO  = 0.5;

let internalBonus = null;   // "big" | "reg" | null
let notifyAt = 3;           // 何本目停止で告知
let stoppedThisSpin = 0;
let gogoChance = false;

/* ====== 告知・ボーナス ====== */
let pendingBonus = null;    // "big" | "reg" | null（点灯中の当たり）
let bonusTime   = null;     // "big" | "reg" | null（入賞後）
let bonusEarned = 0;
const BONUS_GOAL = { big:240, reg:100 };

/* ====== リプレイ在庫 ====== */
let replayStock = 0;

/* ====== 目押しパラメータ ====== */
const NO_GOGO_DELAY_MIN = 180;       // GOGO消灯時の“遅いハズレ止め”
const NO_GOGO_DELAY_MAX = 360;

const SKILL_WINDOW_MS        = 160;  // 通常時のヒット許容
const SKILL_WINDOW_MS_GOGO   = 220;  // GOGO中のヒット許容（少し甘め）
const BASE_LAG_MS_MIN = 55, BASE_LAG_MS_MAX = 110;

const SPIN_SPEED = 1500;             // px/s とみなす
const SPEED_PX_PER_S = SPIN_SPEED;

/* ====== 出目プラン ====== */
let currentPlan = null;

/* ====== ライン定義（row=0:上,1:中,2:下） ====== */
const PAYLINE_ROWS = {
  top:  [0,0,0],
  mid:  [1,1,1],
  bot:  [2,2,2],
  diag: [0,1,2],
  rdiag:[2,1,0],
};
const PAYLINE_KEYS = ["top","mid","bot","diag","rdiag"];

/* ====== 停止アーム（index一致で止める） ====== */
const indexArm = [
  {active:false, col:0, targetIdx:0, row:1},
  {active:false, col:1, targetIdx:0, row:1},
  {active:false, col:2, targetIdx:0, row:1},
];

/* ====== ヘルパー ====== */
function nextIndexFor(r, sym){
  const L=r.strip.length, nowTop=r.topIndex;
  let n=0; while(n<L && r.strip[(nowTop+n+1)%L]!==sym) n++;
  return (nowTop+n+1)%L;
}
function safeBarIndexFor(r){
  // 7に隣接しない BAR（REG左の“BIG封殺”用）
  const L=r.strip.length, nowTop=r.topIndex;
  for(let k=0;k<L;k++){
    const idx=(nowTop+k+1)%L;
    if(r.strip[idx]!=="bar.png") continue;
    const up=r.strip[(idx-1+L)%L], dn=r.strip[(idx+1)%L];
    if(up!=="seven.png" && dn!=="seven.png") return idx;
  }
  return nextIndexFor(r,"bar.png");
}
const randDelay = () => NO_GOGO_DELAY_MIN + Math.random()*(NO_GOGO_DELAY_MAX-NO_GOGO_DELAY_MIN);

/* ====== プラン作成 ====== */
function makePlanForThisSpin(){
  // 入賞中の消化（BIG/REGの子役固定揃え）
  if(bonusTime==="big" || bonusTime==="reg"){
    const isReg = bonusTime==="reg";
    const REG_REPLAY_RATE = 0.33;

    // ★ BIG中は ときどき ぶどう（lemon）を混ぜる
    const BIG_GRAPE_RATE = 0.15; // 調整可

    const sym = isReg
      ? (Math.random() < REG_REPLAY_RATE
          ? "sai.png"
          : (Math.random() < 0.5 ? "bell.png" : "cherry.png"))
      : (() => {
          const r = Math.random();
          if (r < BIG_GRAPE_RATE) return "lemon.png";              // ぶどう
          return (r < BIG_GRAPE_RATE + 0.5) ? "bell.png" : "cherry.png";
        })();

    const line = PAYLINE_KEYS[(Math.random()*PAYLINE_KEYS.length)|0];
    const rows = PAYLINE_ROWS[line];
    return { type:"bonus-time", targets:[sym,sym,sym], rows, skill:false };
  }

  // GOGO点灯中：BIG/REGの正解目をその回のラインに合わせる
  if(pendingBonus==="big" || pendingBonus==="reg"){
    const line = PAYLINE_KEYS[(Math.random()*PAYLINE_KEYS.length)|0];
    const rows = PAYLINE_ROWS[line];
    if(pendingBonus==="big"){
      return { type:"bonus-big", targets:["seven.png","seven.png","seven.png"], rows, skill:true };
    }else{
      return { type:"bonus-reg", targets:["bar.png","seven.png","seven.png"], rows, skill:true };
    }
  }

  // 通常時
  return null;
}

/* ====== スケジュール停止 ====== */
const scheduledTimer=[null,null,null];

function scheduleStopToTarget(col, targetSym, row=1, skill=false){
  const r = reels[col]; if(!r || r.isIdle()) return;
  if(scheduledTimer[col]){ clearTimeout(scheduledTimer[col]); scheduledTimer[col]=null; }

  // 消灯中は7狙いをBARに置換（誤入賞防止）
  if (!gogoChance && !bonusTime && targetSym === "seven.png") {
    targetSym = "bar.png";
  }
  // REG点灯中は左列は必ず“安全なBAR”
  if (pendingBonus === "reg" && col === 0) {
    targetSym = "bar.png";
  }

  const L=r.strip.length, nowTop=r.topIndex;
  const idxForSym = (sym)=> (sym==="bar.png" && pendingBonus==="reg" && col===0)
    ? safeBarIndexFor(r)
    : nextIndexFor(r, sym);

  let targetIndex = idxForSym(targetSym);

  const stepsTo = (destIdx)=> (destIdx - ((nowTop+row)%L) + L) % L;
  const computeMsToIndex = (destIdx)=>{
    const nSteps = stepsTo(destIdx);
    const off    = (r.offsetPx % CELL_H + CELL_H) % CELL_H;
    const tNext  = (CELL_H - off) / SPEED_PX_PER_S;
    const tStep  = CELL_H / SPEED_PX_PER_S;
    return (nSteps === 0 ? 0 : (tNext + (nSteps - 1) * tStep)) * 1000;
  };

  // --------------- GOGO中：目押しOK ---------------
  if (pendingBonus && (pendingBonus==="big" || pendingBonus==="reg")){
    const effWindow = SKILL_WINDOW_MS_GOGO;
    const msToHit   = computeMsToIndex(targetIndex);

    if (msToHit <= effWindow) {
      // ★ヒット：狙い図柄でピン止め
      const total = Math.max(0, msToHit + BASE_LAG_MS_MIN);
      scheduledTimer[col]=setTimeout(()=>{ scheduledTimer[col]=null; r.requestStop(); }, total);
    } else {
      // ★ミス：近場で“早めハズレ”停止
      // 内部BIG中は BAR77が見えないように、ミス先を BAR 以外に回避
      let missIdx = ( (nowTop + row + 1) % L );                 // 次の1コマで止めるイメージ
      if (pendingBonus === "big"){
        let guard=0;
        while (r.strip[missIdx]==="bar.png" && guard<L){ missIdx=(missIdx+1)%L; guard++; }
      }
      // アームで index をロックして近場停止
      indexArm[col].active   = true;
      indexArm[col].targetIdx= missIdx;
      indexArm[col].row      = row;
    }
    return;
  }

  // --------------- 通常時 ---------------
  if (skill){
    const effWindow = SKILL_WINDOW_MS;
    const msToOriginal = computeMsToIndex(targetIndex);
    if (msToOriginal > effWindow){
      // 窓外 → ハズレ寄りのディレイ停止
      const add = BASE_LAG_MS_MIN + Math.random()*(BASE_LAG_MS_MAX-BASE_LAG_MS_MIN);
      scheduledTimer[col]=setTimeout(()=>{ scheduledTimer[col]=null; r.requestStop(); }, add);
      return;
    }
    const total = Math.max(0, msToOriginal + BASE_LAG_MS_MIN);
    scheduledTimer[col]=setTimeout(()=>{ scheduledTimer[col]=null; r.requestStop(); }, total);
    return;
  }

  // アームで“ミス寄り”の自然停止
  indexArm[col].active   = true;
  indexArm[col].targetIdx= targetIndex;
  indexArm[col].row      = row;
}

/* =========================================================
   Reel
========================================================= */
class Reel {
  constructor(root, strip, idx){
    this.root=root; this.strip=strip; this.idx=idx;
    this.speed=0; this.spinning=false;
    this.snapping=false; this.snapFrom=0; this.snapTo=0; this.snapT=0; this.snapDur=0.12;

    this.track=document.createElement("div");
    Object.assign(this.track.style,{position:"absolute",left:0,right:0,top:0,willChange:"transform"});
    this.root.appendChild(this.track);

    const VISIBLE=3, BUF=2;
    this.cells=[]; this.cellCount=strip.length+VISIBLE+BUF;

    this.topIndex=0; this.offsetPx=0;

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
  start(speed){
    this.spinning=true; this.snapping=false; this.speed=speed;
    indexArm[this.idx].active=false;
  }
  requestStop(){
    if(!this.spinning) return;
    const nearest = Math.round(this.offsetPx / CELL_H) * CELL_H;
    this.snapFrom=this.offsetPx; this.snapTo=nearest; this.snapT=0;
    this.snapping=true; this.spinning=false;
  }
  update(dt){
    if(this.spinning){
      this.offsetPx += DIR_SIGN * this.speed * dt;
      this.recycle(); this.applyTransform();

      // アーム監視（row位置で一致した瞬間に停止）
      const arm = indexArm[this.idx];
      if(arm.active){
        const L=this.strip.length;
        const curIndex=(this.topIndex + arm.row) % L;
        if(curIndex === arm.targetIdx){
          arm.active=false;
          this.requestStop();
        }
      }
      if(DEBUG_HUD) this.hud(); return;
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
  hud(){ const v=this.getVisible3(); this.root.dataset.top=v[0]; this.root.dataset.mid=v[1]; this.root.dataset.bot=v[2]; }
}

/* ========= 起動・UI ========= */
let reels=[];
const preload=[
  ...SYMBOLS.map(name=>new Promise(res=>{ const img=new Image(); img.onload=res; img.onerror=res; img.src=IMG_PATH+name; })),
  new Promise(res=>{ const img=new Image(); img.onload=res; img.onerror=res; img.src="static/img/gogo.png"; })
];
Promise.all(preload).then(()=>{
  const reelNodes=Array.from(document.querySelectorAll(".reel"));
  reels=reelNodes.map((el,i)=>new Reel(el,REEL_STRIPS[i],i));
  setupLoopAndUI();
});

function setupLoopAndUI(){
  let last=0;
  function loop(t){
    if(!last) last=t;
    const dt=Math.min(0.03,(t-last)/1000); last=t;
    for(const r of reels) r.update(dt);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  const allIdle=()=>reels.every(r=>r.isIdle());

  function lightGogo(){ if(gogoChance) return; gogoChance=true; lampGogo?.classList.add("on"); try{ playSE(se.gako); }catch(_){ } }
  function offGogo(){ if(!gogoChance) return; gogoChance=false; lampGogo?.classList.remove("on"); }

  function maybeNotify(){
    if(internalBonus && stoppedThisSpin>=notifyAt){
      lightGogo(); if(!pendingBonus) pendingBonus=internalBonus;
    }
  }

  function start(){
    if(!allIdle() || (credit<=0 && replayStock<=0)) return;

    for(let i=0;i<3;i++){
      if(scheduledTimer[i]){ clearTimeout(scheduledTimer[i]); scheduledTimer[i]=null; }
      indexArm[i].active=false;
    }

    if(replayStock>0) replayStock--; else credit--;
    count++; payout=0; updateMeters();
    setLamp(lampStart,true); setLamp(lampWait,false); setLamp(lampReplay,false);
    if(yakuEl) yakuEl.textContent="役：---";

    reels.forEach(r=>r.start(SPIN_SPEED));
    playSE(se.spin);

    if(!bonusTime && Math.random()<BONUS_PROB){
      internalBonus=(Math.random()<BIG_RATIO)?"big":"reg";
      const table=[0,1,1,2,2,3,3,3,1,2];
      notifyAt=table[(Math.random()*table.length)|0];
    }else{
      internalBonus=null; notifyAt=3;
    }

    stoppedThisSpin=0;
    currentPlan=makePlanForThisSpin();
  }

  function internalStop(which, force=false){
    const r=reels[which]; if(!r || r.isIdle()) return;

    if(!force) playSE(se.botan);

    // ボーナス中は毎回プランを再作成
    if (bonusTime && (!currentPlan || currentPlan.type!=="bonus-time")) {
      currentPlan = makePlanForThisSpin();
    }
    if(!currentPlan) currentPlan=makePlanForThisSpin();

    // 消灯中かつプランなし → ランダム遅延停止
    if(!force && !gogoChance && !currentPlan){
      setTimeout(()=>internalStop(which,true), randDelay());
      armFinishWatcher(); return;
    }

    if(currentPlan){
      const tSym=currentPlan.targets[which];
      const row=currentPlan.rows ? currentPlan.rows[which] : 1;
      const skill=!!currentPlan.skill;
      scheduleStopToTarget(which, tSym, row, skill);
      armFinishWatcher(); return;
    }

    // ここに来るのは force=true のとき（ランダム停止）
    r.requestStop();
    armFinishWatcher();
  }

  let finishingWatcher=null;
  function armFinishWatcher(){
    if(finishingWatcher) return;
    const tick=()=>{
      let cnt=0; for(const r of reels) if(r.isIdle()) cnt++;
      if(cnt>stoppedThisSpin){ stoppedThisSpin=cnt; maybeNotify(); }
      if(reels.every(r=>r.isIdle())){ finishingWatcher=null; maybeFinish(); }
      else finishingWatcher=requestAnimationFrame(tick);
    };
    finishingWatcher=requestAnimationFrame(tick);
  }

  const isBigLine = l => l[0]==="seven.png" && l[1]==="seven.png" && l[2]==="seven.png";
  const isRegLine = l => {
    const c7=l.filter(v=>v==="seven.png").length;
    const cb=l.filter(v=>v==="bar.png").length;
    return c7===2 && cb===1;
  };
  const isReplayLine = l => l[0]==="sai.png" && l[1]==="sai.png" && l[2]==="sai.png";

  function maybeFinish(){
    if(!reels.every(r=>r.isIdle())) return;

    setLamp(lampStart,false); setLamp(lampWait,true);

    const vis = reels.map(r=>r.getVisible3());
    const lines = (PAY_LINES===1)
      ? [["中",[vis[0][1],vis[1][1],vis[2][1]]]]
      : [
          ["上",[vis[0][0],vis[1][0],vis[2][0]]],
          ["中",[vis[0][1],vis[1][1],vis[2][1]]],
          ["下",[vis[0][2],vis[1][2],vis[2][2]]],
          ["斜",[vis[0][0],vis[1][1],vis[2][2]]],
          ["逆",[vis[0][2],vis[1][1],vis[2][0]]],
        ];

    let total=0; const hitNames=[];
    let bigHit=false, regHit=false, replayHit=false;

    const canJudgeBonusIn = !!pendingBonus && !bonusTime;

    for(const [label,line] of lines){
      if(isReplayLine(line)){ replayHit=true; hitNames.push(`${label}: リプレイ`); continue; }
      const w=judge3only(line); // 消灯中の7×3は0点
      if(w>0){ total+=w; hitNames.push(`${label}: ${handName3only(line)}（${w}枚）`); }
      if(canJudgeBonusIn && isBigLine(line)) bigHit=true;
      if(canJudgeBonusIn && isRegLine(line)) regHit=true;
    }

    // 入賞処理（GOGO点灯時のみ可）
    if(pendingBonus==="big" && bigHit){
      playSE(se.big); bonusTime="big"; bonusEarned=0; pendingBonus=null; offGogo();
      currentPlan=makePlanForThisSpin();
    }else if(pendingBonus==="reg" && regHit){
      playSE(se.rr); bonusTime="reg"; bonusEarned=0; pendingBonus=null; offGogo();
      currentPlan=makePlanForThisSpin();
    }

    if(replayHit){ replayStock++; setLamp(lampReplay,true); }

    if(total>0){ payout+=total; credit+=total; playSE(se.bet); }
    updateMeters();
    if(yakuEl) yakuEl.textContent = "役：" + (hitNames.length ? hitNames.join(" / ") : "なし");

    if(bonusTime){
      bonusEarned += total;
      if(bonusEarned >= BONUS_GOAL[bonusTime]){
        bonusTime=null; bonusEarned=0; currentPlan=null;
      }
    }

    internalBonus=null; notifyAt=3; stoppedThisSpin=0;
  }

  const pressStop = (w)=>internalStop(w,false);
  spinBtn.addEventListener("click", start);
  btnL.addEventListener("click", ()=>pressStop(0));
  btnM.addEventListener("click", ()=>pressStop(1));
  btnR.addEventListener("click", ()=>pressStop(2));

  window.addEventListener("keydown",(e)=>{
    if(e.repeat) return;
    const k=e.key.toLowerCase();
    if(k===" "){ e.preventDefault(); if(reels.every(r=>r.isIdle())) start(); }
    if(k==="z") pressStop(0);
    if(k==="x") pressStop(1);
    if(k==="c") pressStop(2);
  });
}

/* === “３つ揃いのみ”の配当 === */
function judge3only(line){
  const v=line[0];
  if(line[1]!==v || line[2]!==v) return 0;

  // 消灯中は 7×3 を常に無効
  if(v==="seven.png" && !gogoChance && !bonusTime) return 0;

  // 告知中は 7/BAR の配当を無効化（再入賞防止）
  if(pendingBonus && (v==="seven.png" || v==="bar.png")) return 0;

  // ボーナス中
  if(bonusTime){
    if(v==="bell.png" || v==="cherry.png" || v==="lemon.png") return 15; // ぶどうも15枚
    if(v==="sai.png") return 0;                                          // リプレイ
    return 0;
  }

  // 通常時
  if(v==="sai.png") return 0;
  if(v==="seven.png") return 50;
  if(v==="bar.png")   return 20;
  if(v==="bell.png")  return 10;
  if(v==="cherry.png" || v==="lemon.png") return 3;
  return 0;
}
function handName3only(line){
  const v=line[0];
  if(line[1]!==v || line[2]!==v) return "なし";
  if(v==="seven.png") return "７・７・７";
  if(v==="bar.png")   return "BAR・BAR・BAR";
  if(v==="bell.png")  return "ベル３";
  if(v==="sai.png")   return "リプレイ（サイ３）";
  if(v==="cherry.png")return "チェリー３";
  if(v==="lemon.png") return "ぶどう３";
  return "なし";
}
