import { SCENES, CHARACTERS } from './data.js';
import { CAMPAIGN_STAGES } from './campaign.js';
import { Audio, playSfx, toggleMute, syncMuteButton } from './audio.js';
import { gameState, rand, getUnit } from './state.js';
import { drawStickman } from './stickman.js';
import { applySceneBackground, drawScenePreview, startMenuBackground, stopMenuBackground } from './scene.js';
import { initRender, renderBattle } from './render.js';
import { initBattle, startBattle, getEffectiveAtk, previewDmg, onTargetClick, cancelTargeting, confirmExit, clearLog, toggleLogPause } from './battle.js';
import { runSimulation } from './sim.js';

let _inBattle = false;
export function showScreen(id) {
  document.querySelectorAll('#screen-title,#screen-mode,#screen-difficulty,#screen-scene,#screen-ban,#screen-select,#screen-battle,#screen-result,#screen-campaign,#screen-cutscene,#screen-radar,#screen-test')
    .forEach(el => el.classList.remove('active'));
  const el = document.getElementById(id);
  el.classList.add('active');
  el.style.animation='none'; void el.offsetWidth; el.style.animation='';
  if (id==='screen-battle') { stopMenuBackground(); _inBattle=true; }
  else { startMenuBackground(); if(_inBattle){ Audio.startMenuBgm(); } _inBattle=false; }
  if (id==='screen-mode') initModeScreen();
  if (id==='screen-difficulty') initDifficultyScreen();
  if (id==='screen-scene') initSceneScreen();
  if (id==='screen-ban') initBanScreen();
  if (id==='screen-select') startSelection();
  if (id==='screen-campaign') initCampaignScreen();
}

export function showHelp(){
  const mask=document.createElement('div');
  mask.className='modal-mask';
  mask.innerHTML=`<div class="modal-box" style="max-width:500px;text-align:left;">
    <h3 style="text-align:center;">📖 玩法说明</h3>
    <p style="text-align:left;">
    • 双方各选 2 名角色，<b>轮流行动</b>。<br>
    • <b>HP</b> = 生命值，<b>SP</b> = 灵能值（释放技能消耗）。<br>
    • 每回合自动恢复 SP，<b>SP 越满越容易被眩晕</b>。<br>
    • <b>暴击</b>×1.5 伤害；<b>护盾</b>优先承伤；<b>嘲讽</b>强制集火。<br>
    • <b>键盘1-4</b> 释放技能，<b>ESC</b> 取消选目标/退出。<br>
    • 战场效果会影响伤害或SP回复。
    </p>
    <div class="row"><button class="btn btn-confirm" onclick="this.closest('.modal-mask').remove(); playSfx('click');">明白了</button></div>
  </div>`;
  document.body.appendChild(mask);
}

let shakeIntensity=0, shakeTimer=null;
export function screenShake(intensity=10, duration=300){
  shakeIntensity=Math.max(shakeIntensity,intensity);
  const wrap=document.getElementById('shake-wrap');
  const start=performance.now();
  if(shakeTimer) cancelAnimationFrame(shakeTimer);
  function tick(){
    const t=(performance.now()-start)/duration;
    if(t>=1){ wrap.style.transform=''; shakeIntensity=0; return; }
    const f=(1-t)*shakeIntensity;
    wrap.style.transform=`translate(${(Math.random()-.5)*f}px,${(Math.random()-.5)*f}px)`;
    shakeTimer=requestAnimationFrame(tick);
  }
  tick();
}

let chosenMode=null;
function initModeScreen() {
  chosenMode=null;
  document.getElementById('btn-mode-next').disabled=true;
  document.querySelectorAll('#mode-grid .option-card').forEach(c=>{
    c.classList.remove('selected');
    c.onmouseenter=()=>playSfx('hover');
    c.onclick=()=>{
      playSfx('select');
      document.querySelectorAll('#mode-grid .option-card').forEach(x=>x.classList.remove('selected'));
      c.classList.add('selected'); chosenMode=c.dataset.mode;
      document.getElementById('btn-mode-next').disabled=false;
    };
  });
}
export function confirmMode() {
  if(!chosenMode) return;
  gameState.mode=chosenMode;
  if(chosenMode==='campaign') showScreen('screen-campaign');
  else if(chosenMode==='ai') showScreen('screen-difficulty');
  else if(chosenMode==='test'){ showScreen('screen-test'); initTestScreen(); }
  else showScreen('screen-scene');
}

let chosenDiff=null;
function initDifficultyScreen(){
  chosenDiff=null;
  document.getElementById('btn-diff-next').disabled=true;
  document.querySelectorAll('#diff-grid .option-card').forEach(c=>{
    c.classList.remove('selected');
    c.onmouseenter=()=>playSfx('hover');
    c.onclick=()=>{
      playSfx('select');
      document.querySelectorAll('#diff-grid .option-card').forEach(x=>x.classList.remove('selected'));
      c.classList.add('selected'); chosenDiff=c.dataset.diff;
      document.getElementById('btn-diff-next').disabled=false;
    };
  });
}
export function confirmDifficulty(){
  if(!chosenDiff) return;
  gameState.difficulty=chosenDiff;
  showScreen('screen-scene');
}
export function goBackFromScene(){ showScreen(gameState.mode==='ai'?'screen-difficulty':'screen-mode'); }

let chosenScene=null;
function initSceneScreen() {
  chosenScene=null;
  const grid=document.getElementById('scene-grid');
  grid.innerHTML='';
  SCENES.forEach(s=>{
    const card=document.createElement('div');
    card.className='option-card';
    card.innerHTML=`
      <div class="preview" style="background:${s.bg}"><canvas width="200" height="80" id="prev-scene-${s.id}"></canvas></div>
      <h3>${s.name}</h3>
      <div class="desc">${s.desc}</div>
      <div class="buff">${s.buffText}</div>`;
    card.onmouseenter=()=>playSfx('hover');
    card.onclick=()=>{
      playSfx('select');
      grid.querySelectorAll('.option-card').forEach(x=>x.classList.remove('selected'));
      card.classList.add('selected'); chosenScene=s;
      document.getElementById('btn-scene-next').disabled=false;
    };
    grid.appendChild(card);
    setTimeout(()=>drawScenePreview(document.getElementById('prev-scene-'+s.id),s),20);
  });
  document.getElementById('btn-scene-next').disabled=true;
}
export function confirmScene() {
  if(!chosenScene) return;
  gameState.scene=chosenScene;
  applySceneBackground(chosenScene);
  if(gameState.mode==='pvp') { showScreen('screen-ban'); return; }
  showScreen('screen-select');
}

const tooltipEl = document.getElementById('global-tooltip');
export function showTooltip(html, x, y){
  tooltipEl.innerHTML=html;
  tooltipEl.style.display='block';
  const rect = tooltipEl.getBoundingClientRect();
  let nx = x+18, ny = y+18;
  if(nx+rect.width > window.innerWidth-10) nx = x-rect.width-12;
  if(ny+rect.height > window.innerHeight-10) ny = y-rect.height-12;
  tooltipEl.style.left=nx+'px';
  tooltipEl.style.top=ny+'px';
}
export function hideTooltip(){ tooltipEl.style.display='none'; }
document.addEventListener('mousemove',e=>{
  if(tooltipEl.style.display==='block'){
    const rect=tooltipEl.getBoundingClientRect();
    let nx=e.clientX+18, ny=e.clientY+18;
    if(nx+rect.width>window.innerWidth-10) nx=e.clientX-rect.width-12;
    if(ny+rect.height>window.innerHeight-10) ny=e.clientY-rect.height-12;
    tooltipEl.style.left=nx+'px'; tooltipEl.style.top=ny+'px';
  }
});

// ── Ban阶段（PvP专用）────────────────────────────────────
let banPhase=1, bannedIds=[];
export function initBanScreen(){
  banPhase=1; bannedIds=[];
  renderBanGrid();
}
function renderBanGrid(){
  const grid=document.getElementById('ban-grid');
  grid.innerHTML='';
  document.getElementById('ban-title').textContent='BAN 阶 段';
  document.getElementById('ban-desc').textContent=`玩家${banPhase} 选择禁用 1 名角色`;
  document.getElementById('ban-status').textContent=`已禁用: ${bannedIds.map(id=>CHARACTERS.find(c=>c.id===id).name).join(', ')||'无'}`;
  CHARACTERS.forEach(c=>{
    const banned=bannedIds.includes(c.id);
    const card=document.createElement('div');
    card.className='char-card'+(banned?' disabled':'');
    card.innerHTML=`
      <div class="stick-preview"><canvas width="80" height="90" id="ban-prev-${c.id}"></canvas></div>
      <div class="cname" style="color:${banned?'#555':c.color}">${c.name}</div>
      <div class="crole" style="color:${banned?'#444':'#aaa'}">${banned?'已禁用':c.role}</div>`;
    if(!banned){
      card.onclick=()=>{ playSfx('select'); doBan(c.id); };
      card.onmouseenter=(e)=>{ playSfx('hover'); showTooltip(buildCharTooltip(c),e.clientX,e.clientY); };
      card.onmouseleave=hideTooltip;
    }
    grid.appendChild(card);
    setTimeout(()=>drawStickman(document.getElementById('ban-prev-'+c.id),c,'idle'),10);
  });
}
function doBan(id){
  bannedIds.push(id);
  if(banPhase===1){ banPhase=2; renderBanGrid(); }
  else {
    gameState.bannedIds=bannedIds;
    showScreen('screen-select');
  }
}

let selectPhase=1, tempPicks=[];
function startSelection(){
  selectPhase=1; tempPicks=[];
  gameState.p1Picks=[];
  if(gameState.mode!=='campaign') gameState.p2Picks=[];
  if(gameState.mode!=='pvp') gameState.bannedIds=[];
  renderCharGrid(); updateSelectUI();
}
function buildCharTooltip(c){
  return `<b style="color:${c.color}">${c.name}</b> · ${c.role}<br>
    HP:${c.hp} | SP:${c.sp} | ATK:${c.atk} | DEF:${c.def}<br>
    暴击:${c.crit}% | 闪避:${c.dodge}% | SP/回合:${c.spRegen}<br><br>
    ${c.skills.map(s=>`<span style="color:${s.iconColor}">${s.icon}</span> <b>${s.name}</b>(${s.cost}SP): ${s.desc}`).join('<br>')}`;
}
function renderCharGrid(){
  const grid=document.getElementById('char-grid');
  grid.innerHTML='';
  const banned=gameState.bannedIds||[];
  CHARACTERS.forEach(c=>{
    const taken=selectPhase===2&&gameState.mode==='pvp'?false:gameState.p1Picks.includes(c.id);
    const selected=tempPicks.includes(c.id);
    const isBanned=banned.includes(c.id);
    const card=document.createElement('div');
    card.className='char-card'+(selected?' selected':'')+(taken||isBanned?' disabled':'');
    card.innerHTML=`
      <div class="stick-preview"><canvas width="80" height="90" id="prev-${c.id}"></canvas></div>
      <div class="cname" style="color:${isBanned?'#555':c.color}">${c.name}</div>
      <div class="crole" style="color:${isBanned?'#444':'#aaa'}">${isBanned?'已禁用':c.role}</div>
      <div class="cstats">${isBanned?'':(`HP:${c.hp} SP:${c.sp}<br>ATK:${c.atk} DEF:${c.def}`)}</div>`;
    if(!taken&&!isBanned){
      card.onclick=()=>{ playSfx('select'); togglePick(c.id); };
      card.onmouseenter=(e)=>{ playSfx('hover'); showTooltip(buildCharTooltip(c), e.clientX, e.clientY); };
      card.onmouseleave=hideTooltip;
    }
    grid.appendChild(card);
    setTimeout(()=>drawStickman(document.getElementById('prev-'+c.id),c,'idle'),10);
  });
}
function togglePick(id){
  const i=tempPicks.indexOf(id);
  if(i>=0) tempPicks.splice(i,1);
  else if(tempPicks.length<2) tempPicks.push(id);
  renderCharGrid(); updateSelectUI();
}
function updateSelectUI(){
  const t=document.getElementById('select-title');
  if(gameState.mode==='campaign') t.textContent='选择你的 2 名战士';
  else if(selectPhase===1) t.textContent='玩家 1（黑墨团）选择 2 名角色';
  else t.textContent=gameState.mode==='ai'?'AI（白线派）选择 2 名角色（自动随机）':'玩家 2（白线派）选择 2 名角色';
  document.getElementById('select-count').textContent=`已选: ${tempPicks.length}/2`;
  document.getElementById('btn-confirm-select').disabled=tempPicks.length!==2;
}
export function confirmSelection(){
  if(selectPhase===1){
    gameState.p1Picks=[...tempPicks];
    tempPicks=[]; selectPhase=2;
    if(gameState.mode==='campaign'){
      showRadar(); return;
    }
    if(gameState.mode==='ai'){
      const pool=CHARACTERS.map(c=>c.id);
      const picks=[];
      if(gameState.difficulty==='hard'){
        const priority=['priest','warlock','assassin','mage','guardian'];
        for(const p of priority){
          if(picks.length<2 && pool.includes(p) && Math.random()<0.7) picks.push(p);
        }
      }
      while(picks.length<2){
        const id=pool[rand(0,pool.length-1)];
        if(!picks.includes(id)) picks.push(id);
      }
      gameState.p2Picks=picks; showRadar(); return;
    }
    renderCharGrid(); updateSelectUI();
  } else {
    gameState.p2Picks=[...tempPicks];
    showRadar();
  }
}

// ── 战役模式 ──────────────────────────────────────────────
function getCampaignProgress(){
  return parseInt(localStorage.getItem('inkfight_campaign')||'0');
}
function saveCampaignProgress(n){
  localStorage.setItem('inkfight_campaign', String(n));
}

let _cutsceneCallback = null;
function showCutscene(stageTitle, text, btnLabel, callback){
  document.getElementById('cutscene-stage').textContent = stageTitle;
  document.getElementById('cutscene-text').textContent = text;
  document.getElementById('btn-cutscene').textContent = btnLabel;
  _cutsceneCallback = callback;
  showScreen('screen-cutscene');
}
export function onCutsceneNext(){
  if(_cutsceneCallback){ const cb=_cutsceneCallback; _cutsceneCallback=null; cb(); }
}

function initCampaignScreen(){
  const progress = getCampaignProgress();
  const map = document.getElementById('campaign-map');
  map.innerHTML = '';
  CAMPAIGN_STAGES.forEach((s, i) => {
    const done = i < progress;
    const current = i === progress;
    const locked = i > progress;
    const node = document.createElement('div');
    node.className = 'stage-row';
    node.innerHTML = `
      <div class="stage-node ${done?'completed':current?'current unlocked':'locked'}" id="snode-${s.id}">
        ${done ? '✓' : s.id}
      </div>
      <div class="stage-info">
        <div class="s-title" style="color:${done?'#888':current?'#ffd54f':'#555'}">${s.title}</div>
        <div class="s-desc">${done?'已通关':current?'点击开始':'未解锁'}</div>
      </div>`;
    if(!locked){
      node.querySelector('.stage-node').onclick = () => {
        playSfx('select');
        launchCampaignStage(s);
      };
    }
    map.appendChild(node);
    if(i < CAMPAIGN_STAGES.length - 1){
      const conn = document.createElement('div');
      conn.className = 'stage-connector';
      map.appendChild(conn);
    }
  });
}

function launchCampaignStage(stage){
  showCutscene(stage.title, stage.intro, '出发！', () => {
    const scene = SCENES.find(s => s.id === stage.scene);
    gameState.mode = 'campaign';
    gameState.difficulty = stage.difficulty;
    gameState.scene = scene;
    gameState.campaignStage = stage.id;
    gameState.stageMod = stage.enemyMod || null;   // battle.js 建 p2 单位时读它
    applySceneBackground(scene);
    // 玩家选角
    gameState.p2Picks = stage.enemy;
    showScreen('screen-select');
  });
}

function onCampaignWin(){
  const stage = CAMPAIGN_STAGES.find(s => s.id === gameState.campaignStage);
  const progress = getCampaignProgress();
  const newProgress = Math.max(progress, stage.id);
  saveCampaignProgress(newProgress);
  const isLast = stage.id === CAMPAIGN_STAGES.length;
  showCutscene(
    stage.title,
    stage.outro,
    isLast ? '查看战绩' : '返回地图',
    () => {
      if(isLast){
        showCampaignComplete();
      } else {
        showScreen('screen-campaign');
      }
    }
  );
}

function showCampaignComplete(){
  showScreen('screen-result');
  document.getElementById('result-title').textContent = '战役通关！';
  document.getElementById('result-title').style.color = '#ffd54f';
  document.getElementById('result-desc').textContent = '你击败了墨皇，墨境迎来了自由的曙光。';
  const s = gameState.stats;
  document.getElementById('result-stats').innerHTML = `
    <h3>最终战役统计</h3>
    <div class="row"><span>总伤害</span><span>${s.p1.dmg}</span></div>
    <div class="row"><span>总治疗</span><span>${s.p1.heal}</span></div>
    <div class="row"><span>击杀数</span><span>${s.p1.kills}</span></div>
    <div class="row"><span>总回合数</span><span>${gameState.round}</span></div>`;
}

export function resetCampaign(){
  localStorage.removeItem('inkfight_campaign');
  initCampaignScreen();
}

// ── 测试模式 ──────────────────────────────────────────────
export function initTestScreen(){
  document.getElementById('btn-test-start').disabled = false;
  document.getElementById('test-progress').style.display = 'none';
  document.getElementById('test-results').style.display = 'none';
}

export function startTestRun(){
  const rounds = parseInt(document.getElementById('test-rounds').value);
  document.getElementById('btn-test-start').disabled = true;
  document.getElementById('test-progress').style.display = 'block';
  document.getElementById('test-progress').textContent = `准备中...`;
  document.getElementById('test-results').style.display = 'none';

  runSimulation(rounds,
    (done, total) => {
      document.getElementById('test-progress').textContent = `进行中... ${done} / ${total} 局`;
    },
    (charStats) => {
      document.getElementById('test-progress').textContent = `完成！共 ${rounds} 局`;
      showSimResults(charStats, rounds);
      document.getElementById('btn-test-start').disabled = false;
    }
  );
}

function showSimResults(charStats, rounds){
  const sorted = Object.values(charStats)
    .filter(c=>c.games>0)
    .sort((a,b)=>(b.wins/b.games)-(a.wins/a.games));

  const history = JSON.parse(localStorage.getItem('inkfight_sim')||'[]');
  history.unshift({ date: new Date().toLocaleString(), rounds, chars: sorted.map(c=>({name:c.name,pct:(c.wins/c.games*100).toFixed(1),games:c.games})) });
  if(history.length>10) history.length=10;
  localStorage.setItem('inkfight_sim', JSON.stringify(history));

  const el = document.getElementById('test-results');
  el.style.display = 'block';
  el.innerHTML = `<h3 style="color:#ffd54f;margin-bottom:10px;">角色胜率排行（${rounds}局随机对战）</h3>`
    + sorted.map(c=>{
        const pct = (c.wins/c.games*100).toFixed(1);
        const bar = Math.round(pct/2);
        const color = pct>=55?'#e94560':pct>=45?'#ffd54f':'#16c79a';
        return `<div class="row" style="align-items:center;gap:8px;">
          <span style="width:60px;color:${color}">${c.name}</span>
          <div style="flex:1;height:10px;background:#111;border-radius:5px;overflow:hidden;">
            <div style="width:${bar*2}%;height:100%;background:${color};border-radius:5px;"></div>
          </div>
          <span style="width:80px;text-align:right;color:${color}">${pct}% (${c.games}局)</span>
        </div>`;
      }).join('');
}


document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    if(gameState.waitingForTarget) cancelTargeting();
    else if(document.getElementById('screen-battle').classList.contains('active')) confirmExit();
  }
  if(document.getElementById('screen-battle').classList.contains('active')&&!gameState.waitingForTarget){
    const n=parseInt(e.key);
    if(n>=1&&n<=4){
      const u=getUnit(gameState.activeUnitId);
      // AI 控场的单位不接受键盘输入。战役模式的玩家2 也是 AI，
      // 这里的判断要和 activateUnit() 里决定「是否交给 aiAct」的那个保持一致。
      const aiControlled=(gameState.mode==='ai'||gameState.mode==='campaign')&&u?.player===2;
      if(u&&!aiControlled&&u.skills[n-1]){
        const btns=document.querySelectorAll('#skill-panel .skill-btn');
        if(btns[n-1]&&!btns[n-1].disabled) btns[n-1].click();
      }
    }
  }
});
document.addEventListener('mousemove',e=>{
  if(e.target.classList && e.target.classList.contains('btn')){
    const r=e.target.getBoundingClientRect();
    e.target.style.setProperty('--mx',(e.clientX-r.left)+'px');
    e.target.style.setProperty('--my',(e.clientY-r.top)+'px');
  }
});
document.getElementById('vol-bgm').addEventListener('input',e=>{ Audio.init(); Audio.setBgmVol(e.target.value/100); });
document.getElementById('vol-sfx').addEventListener('input',e=>{ Audio.init(); Audio.setSfxVol(e.target.value/100); });
document.addEventListener('click',()=>{ Audio.init(); Audio.startMenuBgm(); },{once:true});
syncMuteButton();   // 让静音按钮图标反映上次保存的状态

initBattle(showScreen, hideTooltip, showTooltip, screenShake, onCampaignWin);
initRender(getEffectiveAtk, onTargetClick);
startMenuBackground();

// ── 雷达图 ────────────────────────────────────────────────
function getTeamRadar(picks){
  // 5维：攻击、防御、灵能、机动（闪避+暴击）、支撑（治疗技能数）
  const chars = picks.map(id => CHARACTERS.find(c=>c.id===id));
  const sum = (fn) => chars.reduce((a,c)=>a+fn(c),0)/chars.length;
  return [
    Math.min(sum(c=>c.atk)/25*100, 100),
    Math.min(sum(c=>c.def)/15*100, 100),
    Math.min(sum(c=>c.sp)/140*100, 100),
    Math.min(sum(c=>(c.dodge+c.crit)/2)/20*100, 100),
    Math.min(sum(c=>c.skills.filter(s=>s.type==='heal'||s.type==='buff'||s.type==='cleanse').length)/2*100, 100),
  ];
}

function drawRadar(canvas, values, color){
  const ctx = canvas.getContext('2d');
  const cx=100, cy=100, r=75, n=5;
  ctx.clearRect(0,0,200,200);
  // 背景网格
  for(let ring=1;ring<=4;ring++){
    ctx.beginPath();
    for(let i=0;i<n;i++){
      const a=Math.PI*2/n*i-Math.PI/2;
      const x=cx+r*ring/4*Math.cos(a), y=cy+r*ring/4*Math.sin(a);
      i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
    }
    ctx.closePath();
    ctx.strokeStyle='rgba(255,255,255,0.08)'; ctx.stroke();
  }
  // 轴线
  for(let i=0;i<n;i++){
    const a=Math.PI*2/n*i-Math.PI/2;
    ctx.beginPath(); ctx.moveTo(cx,cy);
    ctx.lineTo(cx+r*Math.cos(a), cy+r*Math.sin(a));
    ctx.strokeStyle='rgba(255,255,255,0.12)'; ctx.stroke();
  }
  // 数据多边形
  ctx.beginPath();
  values.forEach((v,i)=>{
    const a=Math.PI*2/n*i-Math.PI/2;
    const x=cx+r*(v/100)*Math.cos(a), y=cy+r*(v/100)*Math.sin(a);
    i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
  });
  ctx.closePath();
  ctx.fillStyle=color+'33'; ctx.fill();
  ctx.strokeStyle=color; ctx.lineWidth=2; ctx.stroke();
  // 顶点圆点
  values.forEach((v,i)=>{
    const a=Math.PI*2/n*i-Math.PI/2;
    ctx.beginPath();
    ctx.arc(cx+r*(v/100)*Math.cos(a), cy+r*(v/100)*Math.sin(a), 3,0,Math.PI*2);
    ctx.fillStyle=color; ctx.fill();
  });
}

const RADAR_AXES=['攻击','防御','灵能','机动','支撑'];

function showRadar(){
  const p1v=getTeamRadar(gameState.p1Picks);
  const p2v=getTeamRadar(gameState.p2Picks);
  const p1names=gameState.p1Picks.map(id=>CHARACTERS.find(c=>c.id===id).name).join(' + ');
  const p2names=gameState.p2Picks.map(id=>CHARACTERS.find(c=>c.id===id).name).join(' + ');
  document.getElementById('radar-title-p1').textContent=`玩家1：${p1names}`;
  document.getElementById('radar-title-p2').textContent=`玩家2：${p2names}`;
  showScreen('screen-radar');
  setTimeout(()=>{
    drawRadar(document.getElementById('radar-canvas-p1'), p1v, '#e94560');
    drawRadar(document.getElementById('radar-canvas-p2'), p2v, '#16c79a');
    document.getElementById('radar-labels-p1').innerHTML=RADAR_AXES.map((a,i)=>`${a}: ${p1v[i].toFixed(0)}`).join('<br>');
    document.getElementById('radar-labels-p2').innerHTML=RADAR_AXES.map((a,i)=>`${a}: ${p2v[i].toFixed(0)}`).join('<br>');
  },50);
}

export function onRadarNext(){ startBattle(); }

Object.assign(window, {
  playSfx, toggleMute, showScreen, showHelp,
  confirmMode, confirmDifficulty, goBackFromScene, confirmScene,
  confirmSelection, clearLog, toggleLogPause, confirmExit,
  onCutsceneNext, resetCampaign, onRadarNext,
  initTestScreen, startTestRun, initBanScreen
});
