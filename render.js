import { CHARACTERS } from './data.js';
import { playSfx } from './audio.js';
import { gameState, pct, getAllUnits, getUnit } from './state.js';
import { drawStickman } from './stickman.js';

let _getEffectiveAtk, _onTargetClick;
export function initRender(getEffectiveAtk, onTargetClick){
  _getEffectiveAtk=getEffectiveAtk;
  _onTargetClick=onTargetClick;
}

export function renderBattle(){
  ['team-left','team-right'].forEach((id,idx)=>{
    const c=document.getElementById(id);
    c.innerHTML='';
    const units=idx===0?gameState.p1Units:gameState.p2Units;
    units.forEach(u=>c.appendChild(renderUnit(u)));
  });
}

function statusChips(u){
  const list=[];
  if(u.shield>0) list.push(`🛡${u.shield}`);
  if(u.stunned) list.push('💫眩晕');
  if(u.dodging) list.push('💨闪避');
  if(u.buffs.some(b=>b.type==='berserk')) list.push('🔥狂暴');
  if(u.buffs.some(b=>b.type==='taunt')) list.push('🎯嘲讽');
  if(u.buffs.some(b=>b.type==='atkUp')) list.push('⚔️攻↑');
  if(u.buffs.some(b=>b.type==='atkUp1')) list.push('🎯专注');
  if(u.debuffs.some(d=>d.type==='poison')) list.push('☠中毒');
  if(u.debuffs.some(d=>d.type==='defDown')) list.push('🛡↓');
  if(u.undying) list.push('💀不屈');
  return list.map(t=>`<span class="stat-chip">${t}</span>`).join('');
}

// 敌人下一击的预告条。这是整个战斗深度重做的地基（见 COMBAT_PLAN.md 任务 1）：
// 玩家看得见下一击，才谈得上布防 / 抢杀 / 改道 / 打断。
// 数字带「≈」是因为暴击是浮动项，estimateDamage 已经把减防折算进去了。
function intentBar(u){
  const it=gameState.enemyIntent;
  if(!it||it.unitId!==u.id||!u.alive) return '';
  const t=it.targetId?getUnit(it.targetId):null;
  const tgt=t?`<span class="intent-arrow">→</span>${t.name}`:'';
  const dmg=it.estDmg!=null?`<b class="intent-dmg">≈${it.estDmg}</b>`:'';
  return `<div class="unit-intent" title="敌方已锁定这个行动，你可以打断它、抢先击杀、或按这个伤害量布防">`
    +`${it.skill.icon||'❗'} ${it.skill.name}${tgt}${dmg}</div>`;
}

function renderUnit(u){
  const div=document.createElement('div');
  const isActive=gameState.activeUnitId===u.id&&!gameState.waitingForTarget;
  const isIntentTarget=!!gameState.enemyIntent&&gameState.enemyIntent.targetId===u.id&&u.alive;
  const isTargetable=gameState.waitingForTarget&&(
    gameState.pendingSkillFriendly?u.player===gameState.pendingActor.player:u.player!==gameState.pendingActor.player
  )&&u.alive;
  const lowHp=u.alive&&u.hp/u.maxHp<0.25;
  div.className='battle-unit'
    +(isActive?' active-turn':'')
    +(isTargetable?' target-select':'')
    +(!u.alive?' dead':'')
    +(u.stunned?' stunned':'')
    +(lowHp?' low-hp':'')
    +(isIntentTarget?' intent-target':'');
  div.id='unit-'+u.id;
  const eff=_getEffectiveAtk(u);
  const atkChanged=Math.abs(eff-u.atk)>0.5;
  div.innerHTML=`
    <canvas class="unit-canvas" width="100" height="120" id="cv-${u.id}"></canvas>
    <div class="unit-name"><span style="color:${u.color}">${u.name}</span><span style="font-size:11px;color:#aaa">${u.player===1?'P1':'P2'}</span></div>
    <div class="unit-meta">
      <span class="meta-atk">⚔ ${atkChanged?`<s style="color:#666">${u.atk}</s>→${eff.toFixed(0)}`:u.atk}</span>
      <span class="meta-def">🛡 ${u.def}</span>
      <span class="meta-crit">★ ${u.crit}%</span>
    </div>
    <div class="bar-wrap bar-hp">
      <div class="bar-fill" style="width:${pct(u.hp,u.maxHp)}%"></div>
      ${u.shield>0?`<div class="bar-shield" style="width:${pct(Math.min(u.shield,u.maxHp),u.maxHp)}%"></div>`:''}
      <div class="bar-label">HP ${u.hp}/${u.maxHp}${u.shield>0?` (+${u.shield})`:''}</div>
    </div>
    <div class="bar-wrap bar-sp"><div class="bar-fill" style="width:${pct(u.sp,u.maxSp)}%"></div><div class="bar-label">SP ${u.sp}/${u.maxSp}</div></div>
    <div class="unit-status">${statusChips(u)}</div>
    ${intentBar(u)}`;
  if(isTargetable) div.onclick=()=>{ playSfx('select'); _onTargetClick(u); };
  setTimeout(()=>drawStickman(document.getElementById('cv-'+u.id),u,u.alive?(u.stunned?'stun':u.pose):'dead'),10);
  return div;
}

export function redrawUnit(u){
  const cv=document.getElementById('cv-'+u.id);
  if(cv) drawStickman(cv,u,u.alive?(u.stunned?'stun':u.pose):'dead');
}

export function animateUnit(id,cls){
  const el=document.getElementById('unit-'+id);
  if(!el) return;
  el.classList.add(cls);
  setTimeout(()=>el.classList.remove(cls),600);
}

export function lungeActor(actor){
  const cv=document.getElementById('cv-'+actor.id);
  if(!cv) return;
  const cls=actor.player===1?'lunge-left':'lunge-right';
  cv.classList.add(cls);
  setTimeout(()=>cv.classList.remove(cls),350);
}

let idleAnimTime=0;
setInterval(()=>{
  idleAnimTime++;
  getAllUnits().forEach(u=>{
    if(u.alive&&u.pose==='idle'){
      const cv=document.getElementById('cv-'+u.id);
      if(cv) drawStickman(cv,u,'idle',idleAnimTime);
    }
  });
  CHARACTERS.forEach(c=>{
    const cv=document.getElementById('prev-'+c.id);
    if(cv) drawStickman(cv,{color:c.color,weapon:c.weapon,player:1},'idle',idleAnimTime);
  });
},120);
