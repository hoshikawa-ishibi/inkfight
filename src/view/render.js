import { CHARACTERS } from '../data/data.js';
import { playSfx } from './audio.js';
import { gameState, pct, getAllUnits, getUnit } from '../core/state.js';
import { drawStickman } from './stickman.js';
import { bossPhase } from '../core/combat.js';

let _getEffectiveAtk, _onTargetClick, _onPreviewUnit;
export function initRender(getEffectiveAtk, onTargetClick, onPreviewUnit){
  _getEffectiveAtk=getEffectiveAtk;
  _onTargetClick=onTargetClick;
  _onPreviewUnit=onPreviewUnit;
}

export function renderBattle(){
  ['team-left','team-right'].forEach((id,idx)=>{
    const c=document.getElementById(id);
    c.innerHTML='';
    const units=idx===0?gameState.p1Units:gameState.p2Units;
    units.forEach(u=>c.appendChild(renderUnit(u)));
  });
}

// 状态条。三条规矩：
//   1. **有层数 / 剩余回合的，数字必须外显**——「中毒」不说还剩几回合等于没说。
//   2. **每个都能悬浮看说明**（原生 title），玩家不该去猜图标什么意思。
//   3. **别漏机制**。腐化层以前完全没显示，而它是术士和墨皇整套打法的核心，
//      玩家看不见就没法判断「腐化爆发」什么时候会来。
function statusChips(u){
  const list = [];
  const add = (icon, text, tip) => list.push({ icon, text, tip });

  if(u.shield > 0)
    add('🛡', String(u.shield), `护盾 ${u.shield}：优先承受伤害，不受防御影响`);

  const corrupt = u.debuffs.filter(d => d.type === 'corrupt').reduce((n,d) => n + d.value, 0);
  if(corrupt > 0)
    add('🕳', `${corrupt}层`, `腐化 ${corrupt} 层：术士系每次攻击额外造成 层数×5 伤害；`
      + `「腐化爆发」会一次性消耗全部层数，每层 12 伤害（上限 5 层）`);

  const poison = u.debuffs.filter(d => d.type === 'poison');
  if(poison.length){
    const dmg = poison.reduce((n,d) => n + d.value, 0);
    const turns = Math.max(...poison.map(d => d.dur));
    add('☠', `${dmg}/回合·${turns}回`, `中毒：每回合开始损失 ${dmg} HP，还剩 ${turns} 回合。无视防御，可被「净化」清除`);
  }

  const defDown = u.debuffs.find(d => d.type === 'defDown');
  if(defDown) add('🛡', `↓${defDown.dur}回`, `破防：受到的伤害 +20%，还剩 ${defDown.dur} 回合`);

  if(u.stunned) add('💫', '打断', '已被打断：下一次行动会被跳过');
  if(u.interruptImmune > 0)
    add('🚫', `免疫${u.interruptImmune}`, `打断免疫：还有 ${u.interruptImmune} 个自己的回合内不会再被打断`);
  if(u.dodging) add('💨', '闪避', '闪避姿态：完全免疫下一次攻击');
  if(u.undying) add('💀', `不屈${u.undying}`, `不屈：下次致死时保留 ${u.undying} HP（一次性）`);

  const berserk = u.buffs.find(b => b.type === 'berserk');
  if(berserk) add('🔥', `狂暴${berserk.dur}回`,
    `狂暴：攻击 +${Math.round(berserk.value*100)}%，每回合自损 HP，还剩 ${berserk.dur} 回合`);

  const taunt = u.buffs.find(b => b.type === 'taunt');
  if(taunt) add('🎯', `嘲讽${taunt.dur}回`, `嘲讽：敌方被迫攻击它，还剩 ${taunt.dur} 回合`);

  const atkUp = u.buffs.filter(b => b.type === 'atkUp');
  if(atkUp.length){
    const pctSum = Math.round(atkUp.reduce((n,b) => n + b.value, 0) * 100);
    const turns = Math.max(...atkUp.map(b => b.dur));
    add('⚔️', `+${pctSum}%·${turns}回`, `攻击强化 +${pctSum}%，还剩 ${turns} 回合`
      + (atkUp.length > 1 ? `（${atkUp.length} 层叠加）` : ''));
  }

  const focus = u.buffs.find(b => b.type === 'atkUp1');
  if(focus) add('👁', `+${Math.round(focus.value*100)}%`,
    `专注：**下一次**攻击 +${Math.round(focus.value*100)}%，打完就消失`);

  const cds = u.cooldowns ? Object.entries(u.cooldowns).filter(([,v]) => v > 0) : [];
  if(cds.length) add('⏳', `${cds.length}项`,
    '技能被封 / 冷却中：' + cds.map(([k,v]) => `${k}（还剩 ${v} 回合）`).join('、'));

  return list.map(c =>
    `<span class="stat-chip" title="${c.tip.replace(/"/g,'&quot;')}">${c.icon}${c.text}</span>`).join('');
}

// 敌人下一击的预告条。这是整个战斗深度重做的地基（见 COMBAT_PLAN.md 任务 1）：
// 玩家看得见下一击，才谈得上布防 / 抢杀 / 改道 / 打断。
// 任务 2b 之后暴击也是确定的（蓄能条），所以这个数字是**准的**，不是估的：
// estimateDamage 把减防、暴击、闪避减伤全折算进去了。
function intentBar(u){
  const it=gameState.enemyIntent;
  if(!it||it.unitId!==u.id||!u.alive) return '';
  const t=it.targetId?getUnit(it.targetId):null;
  const tgt=t?`<span class="intent-arrow">→</span>${t.name}`:'';
  const dmg=it.estDmg!=null?`<b class="intent-dmg">≈${it.estDmg}</b>`:'';
  return `<div class="unit-intent" title="敌方已锁定这个行动，你可以打断它、抢先击杀、或按这个伤害量布防">`
    +`${it.skill.icon||'❗'} ${it.skill.name}${tgt}${dmg}</div>`;
}

// BOSS 阶段标记。规则中途会变，玩家得一直看得见现在是哪一段。
function phaseTag(u){
  const ph = bossPhase(u, u.bossPhases);
  if(!ph || !u.alive) return '';
  const extra = (ph.actions > 1) ? ` ×${ph.actions}行动` : (ph.sealSkill ? ' 抹除' : '');
  return `<div class="unit-phase">◆ ${ph.name}${extra}</div>`;
}

function renderUnit(u){
  const div=document.createElement('div');
  const isActive=gameState.activeUnitId===u.id&&!gameState.waitingForTarget;
  // 「点我方角色查看技能」阶段：本方存活单位都可点，当前预览的那个加高亮。
  const isPickable=gameState.pickingActor&&u.alive&&u.player===gameState.currentPlayer;
  const isPreview=isPickable&&gameState.previewUnitId===u.id;
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
    +(isIntentTarget?' intent-target':'')
    +(isPickable?' pickable':'')
    +(isPreview?' previewing':'');
  div.id='unit-'+u.id;
  const eff=_getEffectiveAtk(u);
  const atkChanged=Math.abs(eff-u.atk)>0.5;
  div.innerHTML=`
    <canvas class="unit-canvas" width="100" height="92" id="cv-${u.id}"></canvas>
    <div class="unit-name"><span style="color:${u.color}">${u.name}</span><span style="font-size:11px;color:#aaa">${u.player===1?'P1':'P2'}</span></div>
    <div class="unit-meta">
      <span class="meta-atk">⚔ ${atkChanged?`<s style="color:#666">${u.atk}</s>→${eff.toFixed(0)}`:u.atk}</span>
      <span class="meta-def">🛡 ${u.def}</span>
      <span class="meta-crit${u.critMeter>=100-u.crit?' crit-ready':''}" title="暴击蓄能：攒满 100 必定暴击">★ ${u.critMeter||0}/100</span>
    </div>
    <div class="bar-wrap bar-hp">
      <div class="bar-fill" style="width:${pct(u.hp,u.maxHp)}%"></div>
      ${u.shield>0?`<div class="bar-shield" style="width:${pct(Math.min(u.shield,u.maxHp),u.maxHp)}%"></div>`:''}
      <div class="bar-label">HP ${u.hp}/${u.maxHp}${u.shield>0?` (+${u.shield})`:''}</div>
    </div>
    <div class="bar-wrap bar-sp"><div class="bar-fill" style="width:${pct(u.sp,u.maxSp)}%"></div><div class="bar-label">SP ${u.sp}/${u.maxSp}</div></div>
    <div class="unit-status">${statusChips(u)}</div>
    ${phaseTag(u)}
    ${intentBar(u)}`;
  if(isTargetable) div.onclick=()=>{ playSfx('select'); _onTargetClick(u); };
  else if(isPickable) div.onclick=()=>{ playSfx('select'); _onPreviewUnit(u); };
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
