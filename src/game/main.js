import { SCENES, CHARACTERS } from '../data/data.js';
import { CAMPAIGN_STAGES, enemyIds, CAMPAIGN_HERO, CAMPAIGN_ALLIES,
         availableAllies, unlockedAfter } from '../data/campaign.js';
import { Audio, playSfx, toggleMute, syncMuteButton } from '../view/audio.js';
import { gameState, rand, getUnit, teamSizeFor, isAiSide } from '../core/state.js';
import { DEFAULT_INTERRUPT_SP, INTERRUPT_OUTPUT_MULTIPLIER,
  CRIT_METER_FULL, CRIT_MULTIPLIER } from '../core/combat.js';
import { drawStickman } from '../view/stickman.js';
import { applySceneBackground, drawScenePreview, startMenuBackground, stopMenuBackground } from '../view/scene.js';
import { initRender, renderBattle } from '../view/render.js';
import { initCharacterGallery } from '../view/character-gallery.js';
import { openCodex, isModalOpen, closeTop } from '../view/codex.js';
import { initRecordsScreen } from '../view/records.js';
import { isDebug, setDebug } from './save.js';
import { initBattle, startBattle, getEffectiveAtk, previewDmg, onTargetClick, cancelTargeting, confirmExit, clearLog, toggleLogPause, onPreviewUnit, toggleSpectatePause, stepSpectate, cycleSpectateSpeed } from './battle.js';
import { runSimulation } from '../../tools/sim.js';
import { initTeamStudy } from '../view/team-study.js';
import { initPresentation, featuredCharacter, clearSkillCue } from '../view/presentation.js';
import { portraitFor } from '../data/character-portraits.js';
import { stopBattle3D } from '../view/battle3d.js';
import { shuffle } from '../../tools/sim.js';
import { initExpedition, openExpedition, finishExpeditionBattle } from './expedition.js';

let _inBattle = false;
export function showScreen(id) {
  if(id!=='screen-battle')stopBattle3D();
  clearSkillCue();
  // 按前缀选，**不要写死屏幕列表**。原来这里手抄了 12 个 id，
  // 而 inkfight.html 的 CSS 里还有同样一份——加「观战」屏时只改了 CSS
  // 忘了这里，结果两个屏幕同时显示。同一份知识两份实现，又一次。
  document.querySelectorAll('[id^="screen-"]').forEach(el => el.classList.remove('active'));
  const el = document.getElementById(id);
  el.classList.add('active');
  window.scrollTo(0,0);
  el.style.animation='none'; void el.offsetWidth; el.style.animation='';
  if (id==='screen-battle') {
    stopMenuBackground();
    if (gameState.scene) applySceneBackground(gameState.scene);
    _inBattle=true;
  }
  else { startMenuBackground(); if(_inBattle){ Audio.startMenuBgm(); } _inBattle=false; }
  if (id==='screen-mode') initModeScreen();
  if (id==='screen-difficulty') initDifficultyScreen();
  if (id==='screen-scene') initSceneScreen();
  if (id==='screen-ban') initBanScreen();
  if (id==='screen-select') startSelection();
  if (id==='screen-campaign') initCampaignScreen();
  if (id==='screen-spectate') initSpectateScreen();
  if (id==='screen-archive') initCharacterGallery();
  if (id==='screen-records') initRecordsScreen();
}

// 从首页挑一位角色即可开局；人数、角色池与战斗入口仍走正式规则。
export function quickBattle(){
  const hero = featuredCharacter();
  const n = teamSizeFor('ai');
  Object.assign(gameState, {
    mode:'ai', difficulty:'normal', aiLevels:{1:null, 2:'normal'},
    scene:SCENES.find(s=>s.id==='spring') || SCENES[0],
    p1Picks:[hero, ...shuffle(CHARACTERS.filter(c=>c.id!==hero).map(c=>c.id)).slice(0,n-1)],
    p2Picks:shuffle(CHARACTERS.map(c=>c.id)).slice(0,n), bannedIds:[],
    waitingForTarget:false, pendingSkill:null, pendingActor:null, pendingSkillFriendly:false,
  });
  startBattle();
}

function showModal(inner){
  const mask=document.createElement('div');
  mask.className='modal-mask';
  mask.innerHTML=`<div class="modal-box" style="max-width:500px;text-align:left;">
    ${inner}
    <div class="row"><button class="btn btn-confirm" onclick="this.closest('.modal-mask').remove(); playSfx('click');">明白了</button></div>
  </div>`;
  document.body.appendChild(mask);
}

export function showHelp(){
  showModal(`<h3 style="text-align:center;">📖 玩法说明</h3>
    <p style="text-align:left;">
    • 双方各选 ${teamSizeFor('pvp')} 名角色（战役 ${teamSizeFor('campaign')} 名），<b>每回合各出手一人，你自己挑派谁上</b>。<br>
    • <b>HP</b> = 生命值，<b>SP</b> = 灵能值（释放技能消耗）。<br>
    • 每回合自动恢复 SP，<b>SP 超过 ${Math.round(DEFAULT_INTERRUPT_SP*100)}% 就一定会被「灵能扰乱」</b>
      （下一次行动的伤害和治疗降到 ${Math.round(INTERRUPT_OUTPUT_MULTIPLIER*100)}%，护盾和净化不受影响）。<br>
    • <b>锋芒</b>攒满 ${CRIT_METER_FULL} 触发<b>重击</b>（伤害 ×${CRIT_MULTIPLIER}）然后清零重攒——<b>这是确定的，不是概率</b>，每击攒多少写在角色的锋芒条上。多段技能每一段都单独攒，所以充得特别快。<br>
    • <b>护盾</b>优先承伤。<br>
    • <b>嘲讽</b>：让敌人<b>之后的决策</b>优先打你——但敌人<b>已经预告出来的那一击不会改道</b>，拿嘲讽去接已预告的一刀是接不住的。<br>
    • <b>键盘1-4</b> 释放技能，<b>ESC</b> 取消选目标/退出。<br>
    • 战场效果会影响伤害或SP回复。
    </p>
    <p style="text-align:center;margin-bottom:0;">
      想看每个机制的完整因果（锋芒、扰乱、墨蚀、轮空回蓝…）：
      <button class="btn btn-sm" onclick="openCodex()">📚 机制词典</button><br>
      <span style="font-size:11px;color:#888;">战斗界面右下角的 ❓ 也能随时打开它。</span>
    </p>`);
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
  document.getElementById('pvp-mode-desc').textContent=`两位玩家轮流指挥各自的 ${teamSizeFor('pvp')} 名战士，每回合各派一人出手。`;
  chosenMode=null;
  document.getElementById('btn-mode-next').disabled=true;
  syncDebugOnlyCards();
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
  gameState.aiLevels = {1:null, 2:null};   // 每次重选模式都清干净
  if(chosenMode==='campaign') showScreen('screen-campaign');
  else if(chosenMode==='ai') showScreen('screen-difficulty');
  else if(chosenMode==='spectate'){ showScreen('screen-spectate'); initSpectateScreen(); }
  else if(chosenMode==='test'){ showScreen('screen-test'); initTestScreen(); }
  else showScreen('screen-scene');
}

let chosenDiff=null;
function initDifficultyScreen(){
  chosenDiff=null;
  document.getElementById('btn-diff-next').disabled=true;
  // 隐藏档「墨皇」：只在调试模式下出现（不是灰掉——被剧透就不叫隐藏了）。
  // 它原本的门槛是「通关战役」，但战役已暂弃并藏起，没人能再合法通关。
  // **必须显式改成 isDebug()，不能指望它自然消失**——旧存档里
  // inkfight_campaign 已经是 8 的玩家，按老条件照样看得到墨皇。
  document.getElementById('diff-card-nightmare').style.display = isDebug() ? '' : 'none';
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
  gameState.aiLevels={1:null, 2:chosenDiff};   // 人机：只有 p2 是 AI
  showScreen('screen-scene');
}
export function goBackFromScene(){
  showScreen(gameState.mode==='ai' ? 'screen-difficulty'
    : gameState.mode==='spectate' ? 'screen-spectate' : 'screen-mode');
}

// ── 观战模式 ──────────────────────────────────────────────
// 两边都交给 AI，各选一档。**A 方坐在「玩家」的位置上**——它拿得到 B 方的
// 行动预告，而 B 方被自己的承诺锁住（见 intent.js）。所以这里看到的是
// 「一个 A 档水平的玩家去打 B 档 AI」，正是 difficulty-check.mjs 量的那件事，
// 只是变成了看得见的一整局。UI 上把这点说清楚了，别让人误以为是对等较量。
const SPEC_DIFFS = [
  { id:'easy',      name:'🟢 简单',  note:'常选错目标、偶尔白抡普攻、不会配合' },
  { id:'normal',    name:'🟡 普通',  note:'按评分选，会集火但配合意识只有一半' },
  { id:'hard',      name:'🔴 困难',  note:'整队集火、不浪费回合、会前瞻攒蓝' },
  { id:'nightmare', name:'👑 墨皇',  note:'决策同困难，另有属性加成' },
];
let specA=null, specB=null, specRoster=null;

function initSpectateScreen(){
  specA=null; specB=null; specRoster=null;
  const unlocked = isDebug();   // 墨皇档：和难度选择界面同一条规矩，两处必须一致
  [['spec-a','A'],['spec-b','B']].forEach(([elId, side])=>{
    const box=document.getElementById(elId);
    box.innerHTML='';
    SPEC_DIFFS.forEach(d=>{
      if(d.id==='nightmare' && !unlocked) return;
      const card=document.createElement('div');
      card.className='spec-diff';
      card.innerHTML=`<div class="sd-name">${d.name}</div><div class="sd-note">${d.note}</div>`;
      card.onmouseenter=()=>playSfx('hover');
      card.onclick=()=>{
        playSfx('select');
        [...box.children].forEach(x=>x.classList.remove('selected'));
        card.classList.add('selected');
        if(side==='A') specA=d.id; else specB=d.id;
        updateSpectateUI();
      };
      box.appendChild(card);
    });
  });
  // 人数和「两边能不能撞人」都从规则里取，**别写死在 HTML 里**——
  // 3v3 改 4v4 时这两句话就地过期了，玩家看到的还是「各抽 3 名不重复的角色」。
  const n=teamSizeFor(gameState.mode);
  const rosterDesc={
    random:`双方各随机抽 ${n} 名角色，两边可能撞到同一个人。`,
    manual:`先给 A 方挑 ${n} 名，再给 B 方挑 ${n} 名；两边允许选同样的角色。`
  };
  document.querySelectorAll('#spec-roster .option-card').forEach(c=>{
    const desc=c.querySelector('.desc');
    if(desc && rosterDesc[c.dataset.roster]) desc.textContent=rosterDesc[c.dataset.roster];
    c.classList.remove('selected');
    c.onmouseenter=()=>playSfx('hover');
    c.onclick=()=>{
      playSfx('select');
      document.querySelectorAll('#spec-roster .option-card').forEach(x=>x.classList.remove('selected'));
      c.classList.add('selected'); specRoster=c.dataset.roster;
      updateSpectateUI();
    };
  });
  updateSpectateUI();
}

function updateSpectateUI(){
  document.getElementById('btn-spec-next').disabled = !(specA && specB && specRoster);
}

export function confirmSpectate(){
  if(!(specA && specB && specRoster)) return;
  gameState.aiLevels = {1:specA, 2:specB};
  gameState.difficulty = specB;          // 结算面板等处仍读它
  if(specRoster==='random'){
    const n=teamSizeFor(gameState.mode);
    // 两边**各自独立**抽，允许撞人（理由同 renderCharGrid 里那段注释）
    gameState.p1Picks=shuffleIds(CHARACTERS.map(c=>c.id)).slice(0,n);
    gameState.p2Picks=shuffleIds(CHARACTERS.map(c=>c.id)).slice(0,n);
    showScreen('screen-scene');
  } else {
    showScreen('screen-scene');           // 场景选完再进选角
  }
}

// Fisher-Yates。不要用 sort(()=>Math.random()-0.5)，理由见 sim.js 的 shuffle。
function shuffleIds(arr){
  const r=arr.slice();
  for(let i=r.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [r[i],r[j]]=[r[j],r[i]]; }
  return r;
}

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
  // 观战 + 随机分配：角色在 confirmSpectate 里已经抽好，直接进阵容对比
  if(gameState.mode==='spectate' && gameState.p1Picks.length){ showRadar(); return; }
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
      <div class="stick-preview">${portraitFor(c.id)?`<img class="draft-portrait" src="${portraitFor(c.id)}" alt="${c.name}" loading="lazy">`:`<canvas width="80" height="90" id="ban-prev-${c.id}"></canvas>`}</div>
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
  // 战役有固定主角（墨白），预选好且不可取消，玩家只挑 1 名同伴
  if(gameState.mode==='campaign') tempPicks=[CAMPAIGN_HERO.id];
  gameState.p1Picks=[];
  if(gameState.mode!=='campaign') gameState.p2Picks=[];
  if(gameState.mode!=='pvp') gameState.bannedIds=[];
  renderCharGrid(); updateSelectUI();
}
function buildCharTooltip(c){
  return `<b style="color:${c.color}">${c.name}</b> · ${c.role}<br>
    HP:${c.hp} | SP:${c.sp} | ATK:${c.atk} | DEF:${c.def}<br>
    锋芒:+${c.crit}/击 | 闪避:${c.dodge}% | SP/回合:${c.spRegen}<br><br>
    ${c.skills.map(s=>`<span style="color:${s.iconColor}">${s.icon}</span> <b>${s.name}</b>(${s.cost}SP): ${s.desc}`).join('<br>')}`;
}
// 战役模式下每个角色的状态：主角锁定出战、未解锁的锁着、本关敌方不能选。
// 「能选到和敌人一模一样的角色」以前是战役最出戏的一点。
function campaignSlot(c){
  const stage = CAMPAIGN_STAGES.find(s => s.id === gameState.campaignStage);
  if(!stage) return null;
  if(c.id === CAMPAIGN_HERO.id) return { kind:'hero', label:CAMPAIGN_HERO.name, note:'主角 · 固定出战' };
  const ally = CAMPAIGN_ALLIES.find(a => a.id === c.id);
  if(!ally) return { kind:'blocked', label:c.name, note:'不可用' };
  if(enemyIds(stage).includes(c.id)) return { kind:'foe', label:ally.name, note:'本关敌方' };
  if(availableAllies(stage, getCampaignProgress()).some(a => a.id === c.id))
    return { kind:'ready', label:ally.name, note:c.role };
  return { kind:'locked', label:'？？？', note:'未解锁' };
}

function renderCharGrid(){
  const grid=document.getElementById('char-grid');
  grid.innerHTML='';
  const banned=gameState.bannedIds||[];
  const campaign=gameState.mode==='campaign';
  CHARACTERS.forEach(c=>{
    const slot=campaign?campaignSlot(c):null;
    // **两边可以选到同样的角色。** 实测（dup-check.mjs，700 局/格）：
    //   不许重复  策略价值 47.6，「完美 vs 一般」的落差只有 0.1
    //   允许重复  策略价值 52.0，落差 7.4
    // 不许重复时一方拿走 3 个，另一方只能从剩下 5 个里挑，阵容差异大到
    // 把打法好坏完全淹掉；允许重复之后对局更常势均力敌，技术才显得出来。
    // 对局种类也从 560 涨到 3136（8C3 的平方），「打过一次就记住了」缓解很多。
    // BAN 掉的角色仍然两边都不能选（isBanned 另外判）。
    const taken=false;
    const selected=tempPicks.includes(c.id);
    const isBanned=banned.includes(c.id);
    const isHero=!!slot&&slot.kind==='hero';
    const frozen=slot?(slot.kind!=='ready'):(taken||isBanned);
    const dim=isBanned||(!!slot&&slot.kind!=='ready'&&!isHero);
    const title=slot?slot.label:c.name;
    const sub=isBanned?'已禁用':(slot?slot.note:c.role);
    const showStats=!isBanned&&!(slot&&slot.kind==='locked');
    const card=document.createElement('div');
    card.className='char-card'
      +(selected?' selected':'')
      +(isHero?' hero-locked':'')
      +(((frozen&&!isHero)||isBanned)?' disabled':'');
    card.innerHTML=
      '<div class="stick-preview">'+(portraitFor(c.id)&&!(slot&&slot.kind==='locked')?`<img class="draft-portrait" src="${portraitFor(c.id)}" alt="${c.name}" loading="lazy">`:'<canvas width="80" height="90" id="prev-'+c.id+'"></canvas>')+'</div>'
      +'<div class="cname" style="color:'+(dim?'#555':c.color)+'">'+title+'</div>'
      +'<div class="crole" style="color:'+(dim?'#444':'#aaa')+'">'+sub+'</div>'
      +'<div class="cstats">'+(showStats?('HP:'+c.hp+' SP:'+c.sp+'<br>ATK:'+c.atk+' DEF:'+c.def):'')+'</div>';
    if(!frozen&&!isBanned){
      card.onclick=()=>{ playSfx('select'); togglePick(c.id); };
      card.onmouseenter=(e)=>{ playSfx('hover'); showTooltip(buildCharTooltip(c), e.clientX, e.clientY); };
      card.onmouseleave=hideTooltip;
    }
    grid.appendChild(card);
    if(!(slot&&slot.kind==='locked'))
      setTimeout(()=>drawStickman(document.getElementById('prev-'+c.id),c,'idle'),10);
  });
}
function togglePick(id){
  if(gameState.mode==='campaign'&&id===CAMPAIGN_HERO.id) return;   // 主角固定出战
  const i=tempPicks.indexOf(id);
  if(i>=0) tempPicks.splice(i,1);
  else if(tempPicks.length<teamSizeFor(gameState.mode)) tempPicks.push(id);
  renderCharGrid(); updateSelectUI();
}
function updateSelectUI(){
  const t=document.getElementById('select-title');
  const n=teamSizeFor(gameState.mode);
  if(gameState.mode==='campaign') t.textContent=CAMPAIGN_HERO.name+` 固定出战 — 再挑 ${n-1} 名同伴`;
  else if(gameState.mode==='spectate')
    t.textContent = selectPhase===1 ? `A 方（黑墨团）出战 ${n} 名角色` : `B 方（白线派）出战 ${n} 名角色`;
  else if(selectPhase===1) t.textContent=`玩家 1（黑墨团）选择 ${n} 名角色`;
  else t.textContent=gameState.mode==='ai'?`AI（白线派）选择 ${n} 名角色（自动随机）`:`玩家 2（白线派）选择 ${n} 名角色`;
  document.getElementById('select-count').textContent=`已选: ${tempPicks.length}/${n}`;
  document.getElementById('btn-confirm-select').disabled=tempPicks.length!==n;
}
export function confirmSelection(){
  if(selectPhase===1){
    gameState.p1Picks=[...tempPicks];
    if(gameState.mode==='campaign'){
      // 带剧情名的原始条目，battle.js 建 p1 单位时用（和 p2Roster 同一套机制）
      gameState.p1Roster=gameState.p1Picks.map(id =>
        id===CAMPAIGN_HERO.id ? CAMPAIGN_HERO : (CAMPAIGN_ALLIES.find(a=>a.id===id) || id));
    }
    tempPicks=[]; selectPhase=2;
    if(gameState.mode==='campaign'){
      showRadar(); return;
    }
    if(gameState.mode==='ai'){
      const pool=CHARACTERS.map(c=>c.id);
      const n=teamSizeFor(gameState.mode);
      const picks=[];
      if(gameState.difficulty==='hard'){
        const priority=['priest','warlock','assassin','mage','guardian'];
        for(const p of priority){
          if(picks.length<n && pool.includes(p) && Math.random()<0.7) picks.push(p);
        }
      }
      while(picks.length<n){
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

// ── 调试模式 ──────────────────────────────────────────────
// 顶栏 🔊 连点 5 次开关（1.5 秒内）。
//
// **整个功能只有下面那一句 `isDebug() ? ... : ...`。** 之所以一句就够，
// 是因为这个游戏所有的解锁门槛——墨皇难度、战役可选关卡、队友——
// 全都从 getCampaignProgress() 推出来（当初刻意不给它们各存一份进度）。
// 在这一处撒谎，就等于全部解锁。
// isDebug / setDebug 在 save.js。character-gallery.js 也要读它，
// 而 main.js 又 import 那个文件，定义留在这里会形成循环依赖。

// ── 战役模式 ──────────────────────────────────────────────
// rawCampaignProgress = 真实存档；getCampaignProgress = 各处判断解锁时看到的值。
// **写进度必须用 raw**，否则开着调试模式打赢一关会把 8 写进真实存档，
// 关掉调试之后进度就被冲了。
function rawCampaignProgress(){
  return parseInt(localStorage.getItem('inkfight_campaign')||'0');
}
function getCampaignProgress(){
  return isDebug() ? CAMPAIGN_STAGES.length : rawCampaignProgress();
}
function saveCampaignProgress(n){
  localStorage.setItem('inkfight_campaign', String(n));
}

// 图标本身就是状态指示：🔊 正常 / 🛠 调试中
function syncDebugBadge(){
  const el = document.getElementById('debug-tap');
  el.textContent = isDebug() ? '🛠' : '🔊';
  el.title = isDebug() ? '调试模式开启中 — 连点 5 次关闭' : '音量';
  syncDebugOnlyCards();
}

// 未完工的功能在 HTML 里标 data-debug-only，默认 display:none。
// 用属性选择器统一切换，不要在 JS 里另抄一份 id 列表。
// 难度屏 / 观战屏的墨皇档不走这里：它们是进屏时动态生成的。
function syncDebugOnlyCards(){
  const dbg = isDebug();
  document.querySelectorAll('[data-debug-only]').forEach(c=>{
    c.style.display = dbg ? '' : 'none';
    if(!dbg) c.classList.remove('selected');
  });
}

function initDebugTap(){
  let hits = 0, timer = null;
  document.getElementById('debug-tap').addEventListener('click', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { hits = 0; }, 1500);
    if(++hits < 5) return;
    hits = 0;
    const on = !isDebug();
    setDebug(on);
    syncDebugBadge();
    // 关掉调试后，卡片藏起来了但 chosenMode 仍指向它，
    // 「下一步」会进入本不该进入的屏。重置选择。
    if(!on && (chosenMode==='campaign' || chosenMode==='test') && document.getElementById('screen-mode').classList.contains('active')) initModeScreen();
    playSfx(on ? 'confirm' : 'click');
    const real = rawCampaignProgress();
    showModal(on
      ? `<h3 style="text-align:center;">🛠 调试模式已开启</h3>
         <p style="color:#ffb74d;text-align:center;"><b>以下是未完成的测试中功能，随时可能不可用或不平衡。</b></p>
         <p>• 模式选择里多出「战役（暂弃）」和「平衡测试」两张卡。<br>
         • 人机 / 观战里多出「墨皇」难度档。<br>
         • 全部 ${CAMPAIGN_STAGES.length} 关战役与全部队友立即可用。<br>
         • <b>真实存档没有被改动</b>（你实际通关到第 ${real} 关），关掉调试就恢复原样。<br>
         • 再连点 5 次左上角的 🛠 即可关闭。</p>`
      : `<h3 style="text-align:center;">🔊 调试模式已关闭</h3>
         <p>测试中功能已重新藏起。解锁进度回到真实存档：已通关 ${real} / ${CAMPAIGN_STAGES.length} 关。</p>`);
  });
}

// 战役累计统计。以前「最终战役统计」显示的其实是**最后一关单场**的数据，
// 名不副实。这里按关卡 id 存每关一份，展示时求和——
// 按 id 存（而不是直接累加）是因为已通关的关卡可以重打，
// 重打只该覆盖那一关的数据，不该把总数越刷越高。
const TOTALS_KEY = 'inkfight_campaign_totals';

function getCampaignTotals(){
  try { return JSON.parse(localStorage.getItem(TOTALS_KEY)) || {}; }
  catch { return {}; }
}

function recordStageStats(stageId, stats, rounds){
  const all = getCampaignTotals();
  const mine = {};   // 只记玩家这边的单位
  Object.values(stats.units).filter(u => u.player === 1).forEach(u => {
    mine[u.name] = { dmg:u.dmg, heal:u.heal, kills:u.kills };
  });
  all[stageId] = {
    dmg: stats.p1.dmg, heal: stats.p1.heal, kills: stats.p1.kills,
    rounds, maxHit: { ...stats.maxHit }, units: mine,
  };
  localStorage.setItem(TOTALS_KEY, JSON.stringify(all));
}

// 把每关一份的记录汇总成一份战役总账
function sumCampaignTotals(){
  const all = getCampaignTotals();
  const sum = { dmg:0, heal:0, kills:0, rounds:0, stages:0, maxHit:{dmg:0,name:''}, units:{} };
  for(const rec of Object.values(all)){
    sum.dmg += rec.dmg; sum.heal += rec.heal; sum.kills += rec.kills;
    sum.rounds += rec.rounds; sum.stages += 1;
    if(rec.maxHit && rec.maxHit.dmg > sum.maxHit.dmg) sum.maxHit = { ...rec.maxHit };
    for(const [name, u] of Object.entries(rec.units || {})){
      const t = sum.units[name] || (sum.units[name] = { dmg:0, heal:0, kills:0 });
      t.dmg += u.dmg; t.heal += u.heal; t.kills += u.kills;
    }
  }
  return sum;
}

// 过场支持**多段文本**：传数组就逐段推进，最后一段才触发 callback。
// 以前是一次性 textContent = 整段，8 关的剧情全糊在一屏里，没有节奏可言。
// 传字符串仍然可以（自动包成单元素数组），向后兼容。
let _cutsceneCallback = null;
let _cutsceneParts = [];
let _cutsceneIdx = 0;
let _cutsceneBtnLabel = '继续';

function showCutscene(stageTitle, text, btnLabel, callback){
  _cutsceneParts = (Array.isArray(text) ? text.slice() : [text]).filter(t => t != null && t !== '');
  if(!_cutsceneParts.length) _cutsceneParts = [''];
  _cutsceneIdx = 0;
  _cutsceneBtnLabel = btnLabel;
  _cutsceneCallback = callback;
  document.getElementById('cutscene-stage').textContent = stageTitle;
  renderCutscenePart();
  showScreen('screen-cutscene');
}

function renderCutscenePart(){
  const isLast = _cutsceneIdx === _cutsceneParts.length - 1;
  document.getElementById('cutscene-text').textContent = _cutsceneParts[_cutsceneIdx];
  document.getElementById('btn-cutscene').textContent = isLast ? _cutsceneBtnLabel : '继续 ▾';
  document.getElementById('cutscene-dots').textContent =
    _cutsceneParts.length > 1 ? `${_cutsceneIdx + 1} / ${_cutsceneParts.length}` : '';
}

export function onCutsceneNext(){
  if(_cutsceneIdx < _cutsceneParts.length - 1){
    _cutsceneIdx++;
    renderCutscenePart();
    return;
  }
  if(_cutsceneCallback){ const cb = _cutsceneCallback; _cutsceneCallback = null; cb(); }
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
    gameState.p2Picks = enemyIds(stage);      // 纯 id，给雷达图等按 id 读的地方
    gameState.p2Roster = stage.enemy;         // 带身份的原始条目，battle.js 建单位时用
    showScreen('screen-select');
  });
}

// 分两个阶段：battle.js 赢下来的当场调 'record' 记进度和统计
// （中途关掉页面不该丢），玩家在结算界面点「继续剧情」才调 'continue'。
function onCampaignWin(phase){
  const stage = CAMPAIGN_STAGES.find(s => s.id === gameState.campaignStage);
  if(phase === 'record'){
    saveCampaignProgress(Math.max(rawCampaignProgress(), stage.id));
    recordStageStats(stage.id, gameState.stats, gameState.round);
    return;
  }
  const isLast = stage.id === CAMPAIGN_STAGES.length;
  // 解锁事件直接接在 outro 后面，玩家看完剧情就知道多了谁
  const unlocked = isLast ? null : unlockedAfter(stage.id);
  const outro = Array.isArray(stage.outro) ? stage.outro.slice() : [stage.outro];
  if(unlocked) outro.push(['「'+unlocked.name+'」决定与你同行。', '下一关起，可以带上它。'].join(String.fromCharCode(10)));
  showCutscene(
    stage.title,
    outro,
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
  // 这里过去读的是 gameState.stats，那只是**最后一关单场**的数据。
  // 现在读跨关累计。
  const t = sumCampaignTotals();
  const roster = Object.entries(t.units).sort((a,b) =>
    (b[1].dmg + b[1].heal * 1.5 + b[1].kills * 80) - (a[1].dmg + a[1].heal * 1.5 + a[1].kills * 80));
  const rows = [
    ['通关关卡数', `${t.stages} / ${CAMPAIGN_STAGES.length}`],
    ['累计伤害', t.dmg],
    ['累计治疗', t.heal],
    ['累计击杀', t.kills],
    ['累计回合', t.rounds],
    ['全程最高单次伤害', `${t.maxHit.dmg}（${t.maxHit.name}）`],
    ['─────────────', '─────────────'],
    ...roster.map(([name, u]) => [name, `伤害 ${u.dmg} / 治疗 ${u.heal} / 击杀 ${u.kills}`]),
  ];
  document.getElementById('result-stats').innerHTML =
    `<h3>战役总战绩</h3>` +
    rows.map(([k, v]) => `<div class="row"><span>${k}</span><span>${v}</span></div>`).join('');
}

export function resetCampaign(){
  localStorage.removeItem('inkfight_campaign');
  localStorage.removeItem(TOTALS_KEY);   // 进度和战绩要一起清，否则重开一遍战绩还是旧的
  initCampaignScreen();
}

// ── 测试模式 ──────────────────────────────────────────────
export function initTestScreen(){
  document.getElementById('btn-test-start').disabled = false;
  document.getElementById('test-progress').style.display = 'none';
  document.getElementById('test-results').style.display = 'none';
  initTeamStudy();
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
  // 有弹窗时游戏快捷键一律不响应：遮罩挡得住鼠标，挡不住键盘。
  // 没有这一条，打开词典时按 1 仍会出招。
  if(isModalOpen()){
    if(e.key==='Escape'){ e.preventDefault(); closeTop(); }
    return;
  }
  if(e.key==='Escape'){
    if(gameState.waitingForTarget) cancelTargeting();
    else if(document.getElementById('screen-battle').classList.contains('active')) confirmExit();
  }
  // 观战快捷键：空格暂停 / 继续，→ 单步
  if(gameState.mode==='spectate'&&document.getElementById('screen-battle').classList.contains('active')){
    if(e.key===' '){ e.preventDefault(); playSfx('click'); toggleSpectatePause(); return; }
    if(e.key==='ArrowRight'){ e.preventDefault(); playSfx('click'); stepSpectate(); return; }
  }
  if(document.getElementById('screen-battle').classList.contains('active')&&!gameState.waitingForTarget){
    const n=parseInt(e.key);
    if(n>=1&&n<=4){
      const u=getUnit(gameState.pickingActor?gameState.previewUnitId:gameState.activeUnitId);
      // AI 控场的单位不接受键盘输入。判断走 state.js 的 isAiSide——
      // 和 battle.js 决定「是否交给 aiAct」的是同一份，不再各写一套。
      if(u&&!isAiSide(u.player)&&u.skills[n-1]){
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
document.addEventListener('click',()=>{
  Audio.init();
  if(document.getElementById('screen-battle').classList.contains('active')) Audio.startBgm(gameState.scene);
  else Audio.startMenuBgm();
},{once:true});

// 标签页切走就停 BGM，切回来续上。**只有音频需要这一条**——
// 画面那边（场景层、idle 呼吸、特效、震动）全是 requestAnimationFrame，
// 浏览器在标签页隐藏时会自动暂停它们；BGM 走的是 setInterval，不会。
document.addEventListener('visibilitychange',()=>{
  if(document.hidden) Audio.pauseForHidden(); else Audio.resumeFromHidden();
});
syncMuteButton();   // 让静音按钮图标反映上次保存的状态
syncDebugBadge();   // 🔊 / 🛠 反映调试模式状态
initDebugTap();

initBattle(showScreen, hideTooltip, showTooltip, screenShake, onCampaignWin, finishExpeditionBattle, ()=>openExpedition());
initExpedition({showScreen,startBattle});
initRender(getEffectiveAtk, onTargetClick, onPreviewUnit);
initPresentation();
startMenuBackground();

// ── 雷达图 ────────────────────────────────────────────────
function getTeamRadar(picks){
  // 5维：攻击、防御、灵能、机动（闪避+锋芒）、支撑（治疗技能数）
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
  quickBattle,
  playSfx, toggleMute, showScreen, showHelp,
  confirmMode, confirmDifficulty, confirmSpectate, goBackFromScene, confirmScene,
  confirmSelection, clearLog, toggleLogPause, confirmExit,
  onCutsceneNext, resetCampaign, onRadarNext,
  initTestScreen, startTestRun, initBanScreen,
  toggleSpectatePause, stepSpectate, cycleSpectateSpeed,
  openCodex
});
