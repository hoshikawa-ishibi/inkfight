import { Audio, playSfx } from './audio.js';
import { gameState, clamp, getUnit, getEnemies, getAllies } from './state.js';
import { renderBattle, redrawUnit, animateUnit, lungeActor } from './render.js';
import { playSkillVfx, spawnFloatText, spawnHitBurst, spawnCritBurst, spawnHealColumn, spawnHexShield, spawnAura, spawnSmoke, spawnCurse, spawnDrainBeam } from './vfx.js';
import { AI_BY_LEVEL, aiNormal } from './ai.js';
import { makeTeamContext } from './ai-scoring.js';
import { nextActor, makeIntent, resolveIntent } from './intent.js';
import {
  createUnit, getEffectiveAtk, previewDmg as calcPreviewDmg, applyTurnRegen,
  processStartOfTurn as resolveStartOfTurn, calcDamage, resolveStun,
  applyCorrupt as applyCorruptCore, applyCorruptBurst,
  resolveSelfBuff, makeAllyBuff, makeSpBuff, needsEnemyTarget,
  applyDifficulty, applyStageMod, unitSpec, willCrit, canUseSkill, payCosts, resolveTaunt, applyCleanse
} from './combat.js';

export { createUnit, getEffectiveAtk };

// 每支队伍一份战术上下文，让同队的两个单位集火同一个目标。
// 每局开始时重建（里面存着上一局单位的引用，留着会认错人）。
let teamCtx = { 1: makeTeamContext(), 2: makeTeamContext() };

// ── 被动技能事件呈现（规则本身在 combat.js，这里只管日志/特效） ──────────
function renderPassiveEvent(unit, event){
  if(!event) return;
  switch(event.effect){
    case 'spGain':
      addLog(`【${event.name}】${unit.name} 回复 ${event.value} SP`, 'sp');
      spawnFloatText(unit, `+${event.value} SP`, '#4fc3f7', 14);
      break;
    case 'overchargeBuff':
      addLog(`【${event.name}】${unit.name} 灵能充盈，下次技能伤害+20%`, 'buff');
      spawnFloatText(unit, '法力涌动!', '#4fc3f7', 14);
      break;
    case 'allyHeal':
      event.targets.forEach(a => {
        addLog(`【${event.name}】${unit.name} 圣光治疗 ${a.name} ${event.value} HP`, 'heal');
        spawnFloatText(a, `+${event.value}`, '#66bb6a', 14);
        spawnHealColumn(a);
      });
      break;
    case 'critStack':
      addLog(`【${event.name}】${unit.name} 暴击率+${event.value}%（${event.stacks}层）`, 'buff');
      spawnFloatText(unit, `鹰眼${event.stacks}层`, '#ffd54f', 13);
      break;
    case 'reflect':
      addLog(`【${event.name}】${unit.name} 反弹 ${event.amount} 伤害给 ${event.attacker.name}`, 'dmg');
      spawnFloatText(event.attacker, `-${event.amount}`, '#90caf9', 14);
      presentDeath(event.attacker, null, event.died, event.undying);
      break;
    case 'bloodRage':
      addLog(`【${event.name}】${unit.name} 血怒觉醒！攻击+${event.value*100}%（${event.stacks}层）`, 'buff');
      spawnFloatText(unit, '血怒!', '#ff7043', 16);
      spawnAura(unit, '#ff5722');
      break;
    case 'corruptBonus':
      addLog(`【${event.name}】腐化侵蚀 ${event.target.name} 额外 ${event.amount} 伤害（${event.stacks}层）`, 'dmg');
      spawnFloatText(event.target, `-${event.amount}`, '#ce93d8', 16);
      presentDeath(event.target, event.killer, event.died, event.undying);
      break;
  }
}

function presentDeath(u, killer, died, undying){
  if(undying){
    addLog(`${u.name} 触发不屈，保留 ${u.hp} HP！`,'heal');
    spawnFloatText(u,'不屈!','#ffd54f',20); spawnAura(u,'#ffd54f');
    return;
  }
  if(!died) return;
  addLog(`☠ ${u.name} 阵亡！`,'death'); playSfx('death'); _screenShake(12,400);
  // 玩家抢在预告兑现之前把它打死了——这是「看得见下一击」最直接的回报，
  // 要说出来。（意图属于别的单位时 cancelIntentOf 会自己跳过。）
  cancelIntentOf(u,'随其阵亡');
  if(killer){
    gameState.stats['p'+killer.player].kills++;
    if(gameState.stats.units[killer.id]) gameState.stats.units[killer.id].kills++;
  }
}

let _showScreen, _hideTooltip, _showTooltip, _screenShake, _onCampaignWin;
export function initBattle(showScreen, hideTooltip, showTooltip, screenShake, onCampaignWin){
  _showScreen=showScreen; _hideTooltip=hideTooltip;
  _showTooltip=showTooltip; _screenShake=screenShake;
  _onCampaignWin=onCampaignWin;
}

export function startBattle(){
  _showScreen('screen-battle');
  _hideTooltip();
  const fx=document.getElementById('fx-canvas');
  fx.width=window.innerWidth; fx.height=window.innerHeight;
  // 战役里玩家这边也有剧情名（主角墨白 + 同伴），存在 p1Roster
  const p1Roster = (gameState.mode==='campaign' && gameState.p1Roster) || gameState.p1Picks;
  gameState.p1Units=p1Roster.map((e,i)=>{ const [id,ov] = unitSpec(e); return createUnit(id,1,i,ov); });
  // 战役的敌人带剧情身份（名字，墨皇还带属性和被动），存在 p2Roster；
  // p2Picks 仍然是纯 id 数组，选角雷达图那边还在按 id 读它。
  const p2Roster = (gameState.mode==='campaign' && gameState.p2Roster) || gameState.p2Picks;
  gameState.p2Units=p2Roster.map((e,i)=>{ const [id,ov] = unitSpec(e); return createUnit(id,2,i,ov); });
  // 难度加成的具体数值在 combat.js 的 DIFFICULTY_MODS，
  // 与 difficulty-check.mjs 共用同一份，避免调了一处量的却是另一套数
  if(gameState.mode==='ai'){
    gameState.p2Units.forEach(u=>applyDifficulty(u, gameState.difficulty));
  }
  // 战役是另一条路径：stage.difficulty 只决定 AI 决策档位，属性加成来自关卡
  // 自己的 enemyMod（campaign.js），由 campaign-check.mjs 逐关校准过。
  // **不要**把上面那个 mode==='ai' 改成包含 campaign——两套加成叠在一起
  // 会让校准好的 8 关曲线整体跳变。
  if(gameState.mode==='campaign'){
    gameState.p2Units.forEach(u=>applyStageMod(u, gameState.stageMod));
  }
  teamCtx = { 1: makeTeamContext(), 2: makeTeamContext() };
  gameState.round=1; gameState.activeUnitId=null;
  gameState.resultShown=false; gameState.enemyIntent=null;
  gameState.stats={
    p1:{dmg:0,heal:0,kills:0}, p2:{dmg:0,heal:0,kills:0},
    maxHit:{dmg:0,name:''}, units:{}
  };
  [...gameState.p1Units,...gameState.p2Units].forEach(u=>{
    gameState.stats.units[u.id]={name:u.name,player:u.player,dmg:0,heal:0,kills:0};
  });
  buildTurnOrder();
  document.getElementById('battle-log').innerHTML='';
  const modeLabel=gameState.mode==='campaign'?`战役·第${gameState.campaignStage}关`:gameState.mode==='ai'?('人机·'+({easy:'简单',normal:'普通',hard:'困难',nightmare:'墨皇'}[gameState.difficulty])):'双人';
  document.getElementById('scene-banner').textContent=
    `战场：${gameState.scene.name} ｜ ${gameState.scene.buffText} ｜ 模式：${modeLabel}`;
  addLog('═══ 墨境之战 开始 ═══','divider');
  addLog(`战场：${gameState.scene.name}（${gameState.scene.buffText}）`,'buff');
  addLog(`玩家1: ${gameState.p1Units.map(u=>u.name).join(', ')}  VS  玩家2: ${gameState.p2Units.map(u=>u.name).join(', ')}`,'info');
  Audio.startBgm(gameState.scene);
  renderBattle();
  startTurn();
}

function buildTurnOrder(){
  gameState.currentPlayer=1;
  gameState.p1LastActed=null;
  gameState.p2LastActed=null;
}

function startTurn(){
  const p=gameState.currentPlayer;
  const units=(p===1?gameState.p1Units:gameState.p2Units).filter(u=>u.alive);
  if(!units.length){ nextTurn(); return; }
  const lastId=p===1?gameState.p1LastActed:gameState.p2LastActed;
  // PvP 首次出手让玩家自己挑；其余情况一律走 intent.js 的 nextActor——
  // 意图预测必须和真实流程读同一份规则，否则会「预告的是 A、实际动的是 B」。
  if(units.length===2&&!lastId&&gameState.mode==='pvp'){
    showUnitPicker(p,units,activateUnit);
    return;
  }
  activateUnit(nextActor(units,lastId));
}

// 玩家回合开始时，把敌方下一个行动单位的打算算出来、公开、并**锁定**。
// 这是本作战斗的地基：玩家看得见下一击，才谈得上布防 / 抢杀 / 改道 / 打断。
//
// 注意只在玩家回合重算。AI 自己的回合要**兑现**已有的承诺，
// 在那时重算等于承诺作废，玩家针对预告做的布置就全白费了。
function updateEnemyIntent(current){
  if(gameState.mode!=='ai'&&gameState.mode!=='campaign'){ gameState.enemyIntent=null; return; }
  if(current.player!==1) return;
  const foe=nextActor(gameState.p2Units,gameState.p2LastActed);
  const foeEnemies=getEnemies(2).filter(e=>e.alive);
  const foeAllies=getAllies(2).filter(a=>a.alive);
  if(!foe||!foeEnemies.length){ gameState.enemyIntent=null; return; }
  const ai=AI_BY_LEVEL[gameState.difficulty]||aiNormal;
  const chosen=ai(foe,foeEnemies,foeAllies,gameState.scene,teamCtx[2]);
  gameState.enemyIntent=makeIntent(foe,chosen,gameState.scene);
}

// 预告的行动没能打出来（被眩晕 / 被中毒带走）。
// **这一行日志就是玩家操作的回报**，必须写出来——否则玩家只会觉得
// 「敌人怎么突然不动了」，而不是「我打断了它」。
function cancelIntentOf(u,reason){
  const it=gameState.enemyIntent;
  if(!it||it.unitId!==u.id) return;
  addLog(`💥 ${u.name} 的「${it.skill.name}」${reason}，没能打出来！`,'crit');
  gameState.enemyIntent=null;
}

function showUnitPicker(player,units,cb){
  document.getElementById('turn-text').textContent=`玩家${player} 选择出战角色`;
  document.getElementById('round-badge').textContent=`回合 ${gameState.round}`;
  renderBattle();
  const panel=document.getElementById('skill-panel');
  panel.innerHTML=`<div style="color:#aaa;margin-bottom:8px;">选择出战角色：</div>`;
  units.forEach(u=>{
    const btn=document.createElement('button');
    btn.className='skill-btn';
    btn.innerHTML=`<b style="color:${u.color}">${u.name}</b> <span style="color:#aaa">HP:${u.hp}/${u.maxHp} SP:${u.sp}</span>`;
    btn.onclick=()=>{ playSfx('select'); cb(u); };
    panel.appendChild(btn);
  });
}

function activateUnit(u){
  // 谁在行动的唯一真相来源：行动高亮、数字键快捷键、取消选目标后
  // 恢复技能面板，三处都读它。被眩晕/中毒倒下的单位也算「轮到它了」，
  // 所以这一行要在下面的提前 return 之前。
  gameState.activeUnitId=u.id;
  if(u.player===1) gameState.p1LastActed=u.id;
  else gameState.p2LastActed=u.id;
  // 回合开始流程必须先跑，再判打断：中毒照样掉血、buff 照样递减、
  // 打断免疫照样倒计时。以前被眩晕的单位直接 return，这三件事一件都不发生
  // ——等于「被控住」还附赠中毒免疫和 buff 保鲜。而 sim.js 那边是先跑再判，
  // 两份实现对不上（和任务 0 那个行动经济 bug 是同一类病）。
  processStartOfTurn(u);
  if(!u.alive){ cancelIntentOf(u,'已阵亡'); setTimeout(()=>{ if(!checkVictory()) nextTurn(); },600); return; }
  if(u.stunned){
    addLog(`${u.name} 被打断，跳过本次行动！`,'stun');
    cancelIntentOf(u,'被打断');
    playSfx('stun'); u.stunned=false;
    setTimeout(nextTurn,700); return;
  }
  applyTurnRegen(u, gameState.scene);
  document.getElementById('round-badge').textContent=`回合 ${gameState.round}`;
  document.getElementById('turn-text').textContent=
    `玩家${u.player} - ${u.name}（ATK:${getEffectiveAtk(u).toFixed(0)}）行动`;
  updateEnemyIntent(u);
  renderBattle();
  if((gameState.mode==='ai'||gameState.mode==='campaign')&&u.player===2){
    document.getElementById('skill-panel').innerHTML=`<span style="color:#888;">🤖 AI 思考中...</span>`;
    setTimeout(()=>aiAct(u),700+Math.random()*400);
  } else {
    renderSkillPanel(u);
  }
}

function processStartOfTurn(u){
  const r = resolveStartOfTurn(u, {allies:getAllies(u.player)});
  renderPassiveEvent(u, r.passiveEvent);
  if(r.poison){
    addLog(`${u.name} 受到中毒伤害 ${r.poison.dmg}`,'dmg');
    spawnFloatText(u,`-${r.poison.dmg}`,'#9ccc65',14);
    presentDeath(u, null, r.poison.died, r.poison.undying);
  }
  if(r.berserk){
    addLog(`${u.name} 因狂暴失去 8 HP`,'dmg');
    spawnFloatText(u,'-8','#ff7043',14);
    presentDeath(u, null, r.berserk.died, r.berserk.undying);
  }
}

function nextTurn(){
  if(checkVictory()) return;
  if(gameState.currentPlayer===2){
    gameState.round++;
    addLog(`═══ 回合 ${gameState.round} 开始 ═══`,'divider');
  }
  gameState.currentPlayer=gameState.currentPlayer===1?2:1;
  startTurn();
}

function checkVictory(){
  const p1=gameState.p1Units.some(u=>u.alive);
  const p2=gameState.p2Units.some(u=>u.alive);
  if(!p1||!p2){ setTimeout(()=>showResult(p1?1:2),700); return true; }
  return false;
}

// 结算表格 + 数字滚动动画。战役和人机/PVP 共用这一份——
// 以前战役赢了直接跳过场，打完一关看不到任何伤害/MVP 统计。
function renderStatsPanel(extraRows, actionsHtml){
  const s=gameState.stats;
  const allUnits=Object.values(s.units);
  // MVP：综合评分 = 伤害 + 治疗×1.5 + 击杀×80
  const mvp=allUnits.reduce((best,u)=>{
    const score=u.dmg+u.heal*1.5+u.kills*80;
    return score>(best.score||0)?{...u,score}:best;
  },{score:0});
  const rows=[
    ['最高单次伤害', `${s.maxHit.dmg}（${s.maxHit.name}）`],
    ['MVP', `${mvp.name} ⭐（伤害${mvp.dmg} 治疗${mvp.heal} 击杀${mvp.kills}）`],
    ['─────────────','─────────────'],
    ...allUnits.map(u=>[u.name, `伤害 ${u.dmg} / 治疗 ${u.heal} / 击杀 ${u.kills}`]),
    ['─────────────','─────────────'],
    ...(extraRows||[]),
    ['总回合数', gameState.round],
  ];
  const statsEl=document.getElementById('result-stats');
  statsEl.innerHTML=`<h3>战斗统计</h3>`+rows.map(([k,v])=>
    `<div class="row"><span>${k}</span><span class="stat-val" data-val="${v}">${typeof v==='number'?0:v}</span></div>`
  ).join('')+(actionsHtml||'');
  statsEl.querySelectorAll('.stat-val[data-val]').forEach(el=>{
    // 只滚**纯数字**的行。以前用 parseInt(...) 是否 NaN 来判断，
    // 于是「22（守卫）」这种也被当成数字滚了一遍，滚完括号里的名字就没了
    // ——「最高单次伤害」那一行一直显示不出是谁打的。
    if(!/^[0-9]+$/.test(el.dataset.val)) return;
    const target=parseInt(el.dataset.val);
    let cur=0; const step=Math.max(1,Math.floor(target/30));
    const t=setInterval(()=>{ cur=Math.min(cur+step,target); el.textContent=cur; if(cur>=target) clearInterval(t); },30);
  });
}

function showResult(w){
  // 一局只结算一次。checkVictory() 有两个调用点（nextTurn 和「行动单位已阵亡」
  // 那条分支），胜负已定时**两边都会各排一个 setTimeout(showResult, 700)**。
  // 正常速度下第二次在玩家还没点按钮时就跑完了，看不出来；但玩家只要在 700ms 内
  // 点掉「继续剧情」，延迟的第二次就会把他从过场/通关界面拽回战斗结算界面。
  if(gameState.resultShown) return;
  gameState.resultShown=true;
  Audio.stopBgm();
  _showScreen('screen-result');
  const actions=document.getElementById('result-actions');

  if(gameState.mode==='campaign'){
    if(actions) actions.style.display='none';       // 战役自己出按钮
    const won=w===1;
    playSfx(won?'victory':'defeat');
    const title=document.getElementById('result-title');
    title.textContent=won?'关卡通过！':'战败...';
    title.style.color=won?'#ffd54f':'#888';
    document.getElementById('result-desc').textContent=
      won?'看完战绩，继续剧情。':'墨境的黑暗尚未散去，再试一次吧。';
    // 通关立刻记进度和累计统计，别等玩家点按钮——中途关掉页面不该丢进度
    if(won&&_onCampaignWin) _onCampaignWin('record');
    renderStatsPanel(
      [['敌方总伤害', gameState.stats.p2.dmg]],
      won
        ? `<div style="margin-top:12px;display:flex;gap:10px;justify-content:center;">
             <button class="btn btn-confirm" id="btn-stage-continue">继续剧情 →</button>
           </div>`
        : `<div style="margin-top:12px;display:flex;gap:10px;justify-content:center;">
             <button class="btn btn-confirm" onclick="playSfx('click'); showScreen('screen-campaign')">返回地图</button>
             <button class="btn" onclick="playSfx('click'); location.reload()">重新开始</button>
           </div>`
    );
    const cont=document.getElementById('btn-stage-continue');
    if(cont) cont.onclick=()=>{ playSfx('click'); if(_onCampaignWin) _onCampaignWin('continue'); };
    return;
  }

  if(actions) actions.style.display='flex';
  document.getElementById('result-title').textContent=`玩家 ${w} 胜利！`;
  document.getElementById('result-title').style.color=w===1?'#e94560':'#16c79a';
  document.getElementById('result-desc').textContent=
    w===1?'黑墨团赢得了墨境的统治权！':'白线派守护了墨境的秩序！';
  const isPlayerWin=(gameState.mode==='ai'&&w===1)||gameState.mode==='pvp';
  playSfx(isPlayerWin?'victory':'defeat');
  renderStatsPanel([
    ['玩家1 总伤害', gameState.stats.p1.dmg],
    ['玩家2 总伤害', gameState.stats.p2.dmg],
  ]);
}

export function confirmExit(){
  const mask=document.createElement('div');
  mask.className='modal-mask';
  mask.innerHTML=`<div class="modal-box">
    <h3>退出战斗？</h3><p>当前战斗进度将丢失。</p>
    <div class="row">
      <button class="btn btn-sm" id="cancel-exit">取消</button>
      <button class="btn btn-sm btn-danger" id="ok-exit">确认退出</button>
    </div></div>`;
  document.body.appendChild(mask);
  mask.querySelector('#cancel-exit').onclick=()=>{ playSfx('click'); mask.remove(); };
  mask.querySelector('#ok-exit').onclick=()=>{ playSfx('click'); mask.remove(); location.reload(); };
}

export function previewDmg(u,s){
  return calcPreviewDmg(u,s,gameState.scene);
}

export function renderSkillPanel(u){
  const p=document.getElementById('skill-panel');
  p.innerHTML='';
  u.skills.forEach((s,i)=>{
    const btn=document.createElement('button');
    btn.className='skill-btn';
    btn.disabled=!canUseSkill(u,s);
    const cdLeft=(u.cooldowns&&u.cooldowns[s.name])||0;
    const dmg=previewDmg(u,s);
    btn.innerHTML=`
      <span class="skill-icon" style="background:${s.iconColor}33;color:${s.iconColor};border:1px solid ${s.iconColor}">${s.icon}</span>
      <span class="key-hint">[${i+1}]</span>
      ${s.name}
      <span class="sp-cost">${cdLeft>0?`⏳${cdLeft}回合`:(s.cost>0?s.cost+'SP':'免费')}${s.hpCost?` -${s.hpCost}HP`:''}</span>
      ${dmg!==null?`<span class="dmg-preview${willCrit(u,s)?' will-crit':''}">${willCrit(u,s)?'💥':'≈'}${dmg}伤害</span>`:''}`;
    btn.onmouseenter=(e)=>{ if(!btn.disabled) playSfx('hover');
      _showTooltip(`<b style="color:${s.iconColor}">${s.icon} ${s.name}</b><br>${s.desc}<br><span style="color:#16c79a">消耗:${s.cost} SP${s.hpCost?` / ${s.hpCost} HP`:''}</span>`
        +(s.cd?`<br><span style="color:#f5a623">冷却 ${s.cd} 回合${cdLeft>0?`（还剩 ${cdLeft}）`:''}</span>`:''),e.clientX,e.clientY);
    };
    btn.onmouseleave=_hideTooltip;
    btn.onclick=()=>{ playSfx('click'); _hideTooltip(); onSkillClick(u,s); };
    p.appendChild(btn);
  });
  if(u.passive){
    const tag=document.createElement('div');
    const stacks=u.passiveStacks>0?` (${u.passiveStacks}层)`:'';
    tag.style.cssText='font-size:11px;color:#ce93d8;padding:4px 8px;align-self:center;max-width:200px;line-height:1.5;';
    tag.innerHTML=`<span style="color:#7e57c2">⬡ 被动</span> <b>${u.passive.name}</b>${stacks}<br><span style="color:#888">${u.passive.desc}</span>`;
    p.appendChild(tag);
  }
}

function onSkillClick(u,s){
  if(!canUseSkill(u,s)) return;
  const needsEnemy=needsEnemyTarget(s);
  const needsAlly=['heal','cleanse','buff'].includes(s.type);
  const noTarget=!needsEnemy &&
    ['healSp','shield','taunt','dodge','selfBuff','revive','damageAll','corruptBurst','plague'].includes(s.type);
  if(noTarget){ executeSkill(u,s,null); return; }
  if(needsEnemy){
    const taunter=getEnemies(u.player).find(e=>e.alive&&e.buffs.some(b=>b.type==='taunt'));
    if(taunter){ addLog(`${taunter.name} 的嘲讽生效，必须攻击它`,'info'); executeSkill(u,s,taunter); return; }
  }
  gameState.waitingForTarget=true; gameState.pendingSkill=s;
  gameState.pendingSkillFriendly=needsAlly; gameState.pendingActor=u;
  document.getElementById('skill-panel').innerHTML=
    `<span style="color:#16c79a;">▶ 请选择${needsAlly?'友方':'敌方'}目标（点击战场上的角色，按 ESC 取消）</span>`;
  renderBattle();
}

export function onTargetClick(t){
  if(!gameState.waitingForTarget) return;
  const valid=gameState.pendingSkillFriendly
    ?t.player===gameState.pendingActor.player
    :t.player!==gameState.pendingActor.player;
  if(!valid||!t.alive) return;
  gameState.waitingForTarget=false;
  const s=gameState.pendingSkill,a=gameState.pendingActor;
  gameState.pendingSkill=null; gameState.pendingActor=null;
  executeSkill(a,s,t);
}

export function cancelTargeting(){
  if(!gameState.waitingForTarget) return;
  // 要把技能面板还给「正在选目标的那个人」——pendingActor 就是他，
  // 所以得在清空之前先抓住。清了之后再去别处找，正是之前卡死的原因：
  // waitingForTarget 已经置 false（点角色不再有反应），面板却没重绘，
  // 玩家这一回合既点不了角色也点不了技能。
  const actor=gameState.pendingActor||getUnit(gameState.activeUnitId);
  gameState.waitingForTarget=false;
  gameState.pendingSkill=null; gameState.pendingActor=null;
  if(actor) renderSkillPanel(actor);
  renderBattle();
}

function aiAct(u){
  const enemies=getEnemies(u.player).filter(e=>e.alive);
  const allies=getAllies(u.player).filter(e=>e.alive);
  if(enemies.length===0){ setTimeout(nextTurn,400); return; }
  const ctx=teamCtx[u.player];
  // 兑现承诺：玩家回合看到的那条预告，就是这里要执行的行动。
  // **不重新决策**——哪怕玩家的操作已经让这步棋变臭。这正是玩家的操作空间。
  let chosen=resolveIntent(u,gameState.enemyIntent,enemies,allies,{teamwork:1,ctx});
  let note='';
  if(chosen){
    gameState.enemyIntent=null;
    if(chosen.fellBack) note='（血量不足，改为普攻）';
    else if(chosen.retargeted) note='（原目标已阵亡，转打他人）';
  }else{
    // PvP，或玩家回合没来得及公开意图（例如首回合敌方先手）时照旧现算
    const d=gameState.difficulty;
    chosen=(AI_BY_LEVEL[d]||aiNormal)(u,enemies,allies,gameState.scene,ctx);
  }
  if(!chosen||!chosen.skill){ setTimeout(nextTurn,400); return; }
  addLog(`🤖 ${u.name} 使用 ${chosen.skill.name}${chosen.target?` → ${chosen.target.name}`:''}`+
         `${chosen.hesitated?'（似乎有些犹豫）':''}${note}`,'info');
  executeSkill(u,chosen.skill,chosen.target);
}

function executeSkill(actor,skill,target){
  payCosts(actor, skill);
  if(skill.sfx) playSfx(skill.sfx);
  lungeActor(actor); actor.pose='attack';
  setTimeout(()=>{ actor.pose='idle'; redrawUnit(actor); },500);
  switch(skill.type){
    case 'damage': playSkillVfx(actor,target,skill,()=>{
      doDamage(actor,target,skill);
      if(skill.corrupt&&target.alive) applyCorrupt(target,skill.corrupt,actor);
    }); break;
    case 'damageAll': {
      const targets=getEnemies(actor.player).filter(e=>e.alive);
      targets.forEach((t,i)=>setTimeout(()=>playSkillVfx(actor,t,skill,()=>doDamage(actor,t,skill)),i*120));
      break;
    }
    case 'stun': playSkillVfx(actor,target,skill,()=>doStun(actor,target,skill)); break;
    case 'heal': {
      const h=skill.healAmt;
      target.hp=clamp(target.hp+h,0,target.maxHp);
      gameState.stats['p'+actor.player].heal+=h;
      if(gameState.stats.units[actor.id]) gameState.stats.units[actor.id].heal+=h;
      animateUnit(target.id,'anim-heal'); spawnHealColumn(target); spawnFloatText(target,`+${h}`,'#16c79a',18);
      break;
    }
    case 'healSp':
      actor.sp=clamp(actor.sp+skill.spGain,0,actor.maxSp);
      addLog(`${actor.name} 恢复 ${skill.spGain} SP`,'sp');
      spawnFloatText(actor,`+${skill.spGain} SP`,'#4fc3f7',16); spawnAura(actor,'#4fc3f7');
      if(skill.buffType) actor.buffs.push(makeSpBuff(skill));
      break;
    case 'shield':
      actor.shield+=skill.shieldAmt;
      addLog(`${actor.name} 获得 ${skill.shieldAmt} 点护盾`,'info');
      spawnFloatText(actor,`🛡+${skill.shieldAmt}`,'#90caf9',16); spawnHexShield(actor);
      break;
    case 'taunt': {
      const t = resolveTaunt(actor, target, skill, gameState.scene);
      if(t.damage) presentDamage(actor, target, t.damage);
      addLog(`${actor.name} 发动嘲讽`,'info');
      spawnFloatText(actor,'嘲讽','#f5a623',16); spawnAura(actor,'#f5a623');
      break;
    }
    case 'dodge':
      actor.dodging=true;
      addLog(`${actor.name} 进入闪避状态`,'info');
      spawnFloatText(actor,'💨','#fff',20); spawnSmoke(actor);
      break;
    case 'selfBuff': {
      const sb = resolveSelfBuff(actor, target, skill, gameState.scene);
      if(sb.damage) presentDamage(actor, target, sb.damage);
      addLog(`${actor.name} 进入${skill.buffType==='berserk'?'狂暴':'强化'}状态`,'buff');
      spawnFloatText(actor,'狂暴!','#ff7043',18); spawnAura(actor,'#ff5722');
      break;
    }
    case 'cleanse': {
      const c = applyCleanse(target, skill);
      addLog(`${actor.name} 净化了 ${target.name}`+
             `${c.removed?`（清除 ${c.removed} 个负面）`:''}${c.healed?`，回复 ${c.healed} HP`:''}`,'heal');
      if(c.healed){
        gameState.stats['p'+actor.player].heal += c.healed;
        if(gameState.stats.units[actor.id]) gameState.stats.units[actor.id].heal += c.healed;
        spawnFloatText(target,`+${c.healed}`,'#66bb6a',16);
      }
      spawnHealColumn(target,'#fff');
      break;
    }
    case 'buff':
      target.buffs.push(makeAllyBuff(skill));
      addLog(`${actor.name} 给予 ${target.name} 攻击祝福`,'buff');
      spawnFloatText(target,'ATK↑','#ce93d8',16); spawnAura(target,'#ffd54f');
      break;
    case 'drain':
      playSkillVfx(actor,target,skill,()=>{
        const dmg=doDamage(actor,target,skill);
        const drain=Math.floor(dmg*skill.drainPct/100);
        actor.hp=clamp(actor.hp+drain,0,actor.maxHp);
        gameState.stats['p'+actor.player].heal+=drain;
        if(gameState.stats.units[actor.id]) gameState.stats.units[actor.id].heal+=drain;
        spawnFloatText(actor,`+${drain}`,'#16c79a',16); spawnDrainBeam(target,actor);
        if(skill.corrupt&&target.alive) applyCorrupt(target,skill.corrupt,actor);
      });
      break;
    case 'plague': {
      const enemies=getEnemies(actor.player).filter(e=>e.alive);
      enemies.forEach((t,i)=>setTimeout(()=>{
        applyCorrupt(t,skill.corrupt,actor);
        t.debuffs.push({type:'poison',dur:skill.dotDur,value:skill.dot});
        addLog(`${t.name} 感染瘟疫，中毒${skill.dotDur}回合`,'buff');
        spawnFloatText(t,'瘟疫!','#9ccc65',16); spawnCurse(t);
      },i*150));
      break;
    }
    case 'corruptBurst': {
      const enemies=getEnemies(actor.player).filter(e=>e.alive);
      const { hits, totalDmg } = applyCorruptBurst(actor, enemies, skill);
      hits.forEach(({target:t,dmg,stacks,died,undying})=>{
        gameState.stats['p'+actor.player].dmg+=dmg;
        if(gameState.stats.units[actor.id]) gameState.stats.units[actor.id].dmg+=dmg;
        if(dmg>gameState.stats.maxHit.dmg) gameState.stats.maxHit={dmg,name:actor.name};
        addLog(`腐化爆发！${t.name} 受到 ${dmg} 伤害（${stacks}层）`,'crit');
        spawnFloatText(t,`-${dmg}`,'#ce93d8',24); spawnHitBurst(t,'#ce93d8'); _screenShake(10,300);
        presentDeath(t, actor, died, undying);
      });
      if(totalDmg===0){ addLog(`腐化爆发：无腐化层，无效果`,'miss'); spawnFloatText(actor,'无腐化','#888',14); }
      break;
    }
    case 'revive':
      actor.undying=skill.hpRestore;
      addLog(`${actor.name} 进入不屈状态`,'buff');
      spawnFloatText(actor,'不屈','#ffd54f',16); spawnAura(actor,'#ffd54f');
      break;
  }
  setTimeout(()=>{ renderBattle(); setTimeout(nextTurn,700); },900);
}

function doDamage(actor,target,skill){
  return presentDamage(actor, target, calcDamage(actor, target, skill, gameState.scene));
}

// 把 combat.js 算出来的伤害结果翻译成日志/特效/统计。
// 抽出来是因为带 power 的眩晕技能也要走同一套呈现。
function presentDamage(actor,target,r){
  if(r.dodged){
    addLog(`${target.name} 闪避了攻击！`,'miss');
    spawnFloatText(target,'MISS','#888',18); playSfx('miss');
    return 0;
  }
  if(r.isCrit){
    addLog(`💥 暴击！`,'crit'); playSfx('crit'); spawnCritBurst(target);
  }
  if(r.shieldAbsorbed > 0){
    addLog(`${target.name} 护盾吸收 ${r.shieldAbsorbed}`,'info');
    spawnFloatText(target,`🛡-${r.shieldAbsorbed}`,'#90caf9',14);
  }
  gameState.stats['p'+actor.player].dmg+=r.dmg;
  if(gameState.stats.units[actor.id]) gameState.stats.units[actor.id].dmg+=r.dmg;
  if(r.dmg>gameState.stats.maxHit.dmg) gameState.stats.maxHit={dmg:r.dmg,name:actor.name};
  addLog(`${actor.name}(ATK ${r.baseAtk.toFixed(0)}) → ${target.name}: ${r.dmg} 伤害${r.isCrit?' [暴击]':''}`,r.isCrit?'crit':'dmg');
  animateUnit(target.id,'anim-hit'); spawnHitBurst(target);
  spawnFloatText(target,`-${r.dmg}`,r.isCrit?'#ffd54f':'#ff5252',r.isCrit?28:18+Math.min(12,r.dmg/8));
  playSfx('hit'); _screenShake(r.isCrit?14:6,r.isCrit?400:200);
  target.pose='hurt'; setTimeout(()=>{target.pose='idle'; redrawUnit(target);},400);
  if(r.dotApplied) addLog(`${target.name} 中毒了`,'buff');
  if(r.selfHeal){
    gameState.stats['p'+actor.player].heal+=r.selfHeal;
    if(gameState.stats.units[actor.id]) gameState.stats.units[actor.id].heal+=r.selfHeal;
    spawnFloatText(actor,`+${r.selfHeal}`,'#16c79a',16);
  }
  presentDeath(target, actor, r.killed, r.undying);
  r.passiveEvents.forEach(({unit,event})=>renderPassiveEvent(unit,event));
  return r.dmg;
}

function doStun(actor,target,skill){
  const r = resolveStun(actor, target, skill, gameState.scene);
  // 带 power 的眩晕技能会先结算一次伤害
  if(r.damage) presentDamage(actor, target, r.damage);
  if(r.skipped) return;
  if(r.success){
    addLog(`${target.name} 被打断了！下一次行动取消`,'stun');
    spawnFloatText(target,'打断!','#f5a623',18); spawnHitBurst(target,'#f5a623');
    playSfx('stun'); _screenShake(8,250);
  } else if(r.reason === 'immune'){
    // 失败的原因必须说清楚，否则玩家学不会这个机制该怎么用
    addLog(`${target.name} 刚被打断过，处于免疫中`,'miss');
    spawnFloatText(target,'免疫','#888',16); playSfx('miss');
  } else {
    addLog(`${target.name} 灵能不足 ${r.need}，打不断`,'miss');
    spawnFloatText(target,`需SP${r.need}`,'#888',14); playSfx('miss');
  }
}

function applyCorrupt(target, stacks, actor){
  const total = applyCorruptCore(target, stacks);
  addLog(`${actor.name} 给 ${target.name} 施加 ${stacks} 层腐化（共${total}层）`,'buff');
  spawnFloatText(target,`腐化${total}层`,'#7e57c2',14); spawnCurse(target);
  return total;
}

const LOG_ICON={dmg:'⚔',heal:'💚',sp:'✨',stun:'💫',info:'•',miss:'✗',buff:'🔮',crit:'💥',death:'☠',divider:'━'};
export function addLog(text,type='info'){
  const log=document.getElementById('battle-log');
  const div=document.createElement('div');
  div.className='log-entry log-'+type;
  if(type==='divider'){
    div.classList.add('log-divider'); div.textContent=text;
  } else {
    const ts=new Date();
    const t=`${String(ts.getHours()).padStart(2,'0')}:${String(ts.getMinutes()).padStart(2,'0')}:${String(ts.getSeconds()).padStart(2,'0')}`;
    div.innerHTML=`<span class="log-time">[${t}]</span><span class="log-icon">${LOG_ICON[type]||'•'}</span>${text}`;
  }
  log.appendChild(div);
  if(!gameState.logPaused) log.scrollTop=log.scrollHeight;
  while(log.children.length>200) log.removeChild(log.firstChild);
}
export function clearLog(){ document.getElementById('battle-log').innerHTML=''; }
export function toggleLogPause(){
  gameState.logPaused=!gameState.logPaused;
  document.getElementById('btn-log-pause').textContent=gameState.logPaused?'恢复滚动':'暂停滚动';
}
