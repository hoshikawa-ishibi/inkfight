import { CHARACTERS } from '../data/data.js';
import { playSfx } from './audio.js';
import { gameState, pct, getAllUnits, getUnit } from '../core/state.js';
import { drawStickman } from './stickman.js';
import { portraitFor } from '../data/character-portraits.js';
import { syncBattle3D, animateStageUnit } from './battle3d.js';
import { bossPhase, DEFAULT_INTERRUPT_SP, INTERRUPT_OUTPUT_MULTIPLIER,
  CRIT_METER_FULL, CRIT_MULTIPLIER, willCrit } from '../core/combat.js';

let _getEffectiveAtk, _onTargetClick, _onPreviewUnit;
export function initRender(getEffectiveAtk, onTargetClick, onPreviewUnit){
  _getEffectiveAtk=getEffectiveAtk;
  _onTargetClick=onTargetClick;
  _onPreviewUnit=onPreviewUnit;
}

function expeditionInkStatus(u){
  if(gameState.mode!=='expedition' || !gameState.inkTurn) return '';
  if(u.player!==gameState.currentPlayer) return 'other';
  return Array.isArray(gameState.inkTurn.acted) && gameState.inkTurn.acted.includes(u.id) ? 'acted' : 'ready';
}

// 3D 的人物名牌由 arena3d.js 创建；这里把同一份墨状态投影到名牌，
// 这样切到立体战场时，玩家仍能看懂谁已落笔、谁可接笔。
function updateExpeditionInkLabels(){
  const labels=document.querySelectorAll('#battle-3d .arena-name');
  if(!labels.length) return;
  const units=getAllUnits();
  labels.forEach((label,index)=>{
    const u=units[index];
    if(!u) return;
    const status=expeditionInkStatus(u);
    label.textContent=`${u.name}${status==='acted'?' ✓':''}`;
    label.dataset.inkState=status;
    label.setAttribute('aria-label',`模型：玩家${u.player} ${u.name}${status==='acted'?'，本轮已出手':status==='ready'?'，可接笔':status==='other'?'，敌方墨阵':''}`);
    label.title=status==='acted'?'本轮已出手':status==='ready'?'可接笔':status==='other'?'敌方墨阵':u.name;
  });
}

export function renderBattle(){
  ['team-left','team-right'].forEach((id,idx)=>{
    const c=document.getElementById(id);
    c.innerHTML='';
    const units=idx===0?gameState.p1Units:gameState.p2Units;
    units.forEach(u=>c.appendChild(renderUnit(u)));
    const vitals=document.getElementById(`team-vitals-${idx+1}`);
    if(vitals) vitals.textContent=`${units.filter(u=>u.alive).length}/${units.length} 存活 · ${units.reduce((n,u)=>n+u.hp,0)} HP`;
  });
  requestAnimationFrame(drawIntentPath);
  syncBattle3D();
  updateExpeditionInkLabels();
}

// 锁定目标从同一个 enemyIntent 读取；随布局重算端点，避免特效打向旧卡片坐标。
function drawIntentPath(){
  const svg=document.getElementById('battle-intent-map');
  if(!svg) return;
  svg.replaceChildren();
  if(!document.getElementById('screen-battle')?.classList.contains('active')) return;
  const intent=gameState.enemyIntent;
  if(!intent?.targetId || !getUnit(intent.unitId)?.alive || !getUnit(intent.targetId)?.alive) return;
  const source=document.querySelector(`#unit-${intent.unitId} .unit-art`);
  const target=document.querySelector(`#unit-${intent.targetId} .unit-art`);
  if(!source || !target) return;
  const box=svg.getBoundingClientRect(), a=source.getBoundingClientRect(), b=target.getBoundingClientRect();
  const x1=a.left+a.width/2-box.left, x2=b.left+b.width/2-box.left;
  const y1=a.top+10-box.top, y2=b.top+10-box.top;
  const bend=Math.max(5, Math.min(y1,y2)-42);
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('d',`M ${x1} ${y1} C ${x1} ${bend}, ${x2} ${bend}, ${x2} ${y2}`);
  const dot=document.createElementNS('http://www.w3.org/2000/svg','circle');
  dot.setAttribute('cx',x2); dot.setAttribute('cy',y2); dot.setAttribute('r',4);
  svg.append(path,dot);
}
window.addEventListener('resize',drawIntentPath);

// 状态条。四条规矩：
//   1. **有层数 / 剩余回合的，数字必须外显**——「中毒」不说还剩几回合等于没说。
//   2. **每个都能悬浮看说明**（原生 title），玩家不该去猜图标什么意思。
//   3. **别漏机制**。腐化层以前完全没显示，而它是术士和墨皇整套打法的核心，
//      玩家看不见就没法判断「腐化爆发」什么时候会来。
//   4. **标签必须说得出自己是什么**。「免疫」说不出免疫的是什么，所以写「打断免疫N」。
//   5. **增益和减益分开排**。「扰乱」和「打断免疫」是同一次打断的两端，
//      必然同时挂上；紧邻显示时会被读成一个复合状态。
//      现在增益在前、减益在后，两组之间有分隔线，颜色也不同。
function statusChips(u){
  const list = [];
  // kind: 'good' = 对自己有利（绿），'bad' = 不利（红）。默认 bad。
  const add = (icon, text, tip, kind) => list.push({ icon, text, tip, kind: kind || 'bad' });

  if(u.shield > 0)
    add('🛡', String(u.shield), `护盾 ${u.shield}：优先承受伤害，不受防御影响`, 'good');

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

  // tooltip 要讲全因果：前提（SP 过半才可能被打断）、
  // 效果（本次行动降到 N% 威力，而不是跳过回合）、副作用（下面的打断免疫）。
  // 百分比读 combat.js 的常量。
  if(u.disrupted) add('💫', '扰乱',
    `灵能扰乱：被抓是因为 SP 超过了上限的 ${Math.round(DEFAULT_INTERRUPT_SP*100)}%（SP 越满越危险）。`
    + `下一次行动只有 ${Math.round(INTERRUPT_OUTPUT_MULTIPLIER*100)}% 威力（不是跳过回合），行动后自动解除；`
    + `护盾、净化和增益不受影响`);
  // 这个状态只有 interrupt-check.mjs 的「完整跳过」对照会用到，正式规则里不出现。
  // 图标不能和「扰乱」共用 💫——一个图标两种含义分不出来。
  if(u.stunned) add('😵', '跳过回合', '旧版对照状态：下一次行动会被完全跳过');
  // 打断的副作用，作用是防连锁：没有它，两个带打断的角色可以把对方锁住。
  if(u.interruptImmune > 0)
    add('🚫', `打断免疫${u.interruptImmune}`,
      `打断免疫：刚被打断过的附送。接下来 ${u.interruptImmune} 个自己的回合内不会再被打断（防连锁）`, 'good');
  if(u.dodging) add('💨', '闪避', '闪避姿态：完全免疫下一次攻击', 'good');
  if(u.undying) add('💀', `不屈${u.undying}`, `不屈：下次致死时保留 ${u.undying} HP（一次性）`, 'good');

  const berserk = u.buffs.find(b => b.type === 'berserk');
  if(berserk) add('🔥', `狂暴${berserk.dur}回`,
    `狂暴：攻击 +${Math.round(berserk.value*100)}%，每回合自损 HP，还剩 ${berserk.dur} 回合`, 'good');

  const taunt = u.buffs.find(b => b.type === 'taunt');
  if(taunt) add('🎯', `嘲讽${taunt.dur}回`,
    `嘲讽：敌人之后的决策会优先打它，还剩 ${taunt.dur} 回合——`
    + `但敌人「已经预告出来」的那一击不会改道`, 'good');

  const atkUp = u.buffs.filter(b => b.type === 'atkUp');
  if(atkUp.length){
    const pctSum = Math.round(atkUp.reduce((n,b) => n + b.value, 0) * 100);
    const turns = Math.max(...atkUp.map(b => b.dur));
    add('⚔️', `+${pctSum}%·${turns}回`, `攻击强化 +${pctSum}%，还剩 ${turns} 回合`
      + (atkUp.length > 1 ? `（${atkUp.length} 层叠加）` : ''), 'good');
  }

  const focus = u.buffs.find(b => b.type === 'atkUp1');
  if(focus) add('👁', `+${Math.round(focus.value*100)}%`,
    `专注：「下一次」攻击 +${Math.round(focus.value*100)}%，打完就消失`, 'good');

  const cds = u.cooldowns ? Object.entries(u.cooldowns).filter(([,v]) => v > 0) : [];
  if(cds.length) add('⏳', `${cds.length}项`,
    '技能被封 / 冷却中：' + cds.map(([k,v]) => `${k}（还剩 ${v} 回合）`).join('、'));

  // 按 kind 分组渲染，而不是靠调整上面 add 的先后顺序：
  // 顺序只能保证当下这一组状态不相邻，再加一个状态就又会挤到一起。
  const chip = c =>
    `<span class="stat-chip chip-${c.kind}" title="${c.tip.replace(/"/g,'&quot;')}">${c.icon}${c.text}</span>`;
  const good = list.filter(c => c.kind === 'good').map(chip).join('');
  const bad  = list.filter(c => c.kind === 'bad').map(chip).join('');
  return good && bad ? `${good}<span class="chip-sep"></span>${bad}` : good + bad;
}

// 敌人下一击的预告条。这是整个战斗深度重做的地基（见 COMBAT_PLAN.md 任务 1）：
// 玩家看得见下一击，才谈得上布防 / 抢杀 / 改道 / 打断。
// 任务 2b 之后重击也是确定的（锋芒蓄能条），所以这个数字是**准的**，不是估的：
// estimateDamage 把减防、重击、闪避减伤全折算进去了。
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
  const expedition=gameState.mode==='expedition';
  const inkTurn=gameState.inkTurn;
  const inkActed=expedition && u.player===gameState.currentPlayer && Array.isArray(inkTurn?.acted) && inkTurn.acted.includes(u.id);
  const inkLocked=expedition && (!inkTurn || inkTurn.ended || gameState.inkBusy);
  const isActive=gameState.activeUnitId===u.id&&!gameState.waitingForTarget;
  // 「点我方角色查看技能」阶段：本方存活单位都可点，当前预览的那个加高亮。
  const isPickable=gameState.pickingActor&&u.alive&&u.player===gameState.currentPlayer
    &&(!expedition || (!inkLocked&&!inkActed));
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
    +((u.disrupted||u.stunned)?' stunned':'')
    +(lowHp?' low-hp':'')
    +(isIntentTarget?' intent-target':'')
    +(isPickable?' pickable':'')
    +(inkActed?' ink-acted':'')
    +(isPreview?' previewing':'');
  div.id='unit-'+u.id;
  div.style.setProperty('--unit-color',u.color);
  if(isTargetable || isPickable){
    div.tabIndex=0;
    div.setAttribute('role','button');
    div.setAttribute('aria-label',`${isTargetable?'选择目标':'查看技能'}：玩家${u.player} ${u.name}，HP ${u.hp}/${u.maxHp}`);
    div.onkeydown=e=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); e.stopPropagation(); div.click(); } };
  }
  const eff=_getEffectiveAtk(u);
  const atkChanged=Math.abs(eff-u.atk)>0.5;
  // 锋芒条。
  //   1. 「是否快满」必须调 combat.js 的 willCrit，不要在这里另写判据。
  //      传 {} 表示按普通攻击估算，技能自带的锋芒加成不在这一层。
  //   2. 锋芒可以超过上限（「蓄刃」这类技能不攻击也能充能）。
  //      超出部分单独显示，因为它会留到下一击：calcDamage 是减去上限，不是清零。
  const meter = u.critMeter || 0;
  const meterText = meter > CRIT_METER_FULL
    ? `${CRIT_METER_FULL}/${CRIT_METER_FULL} +${meter - CRIT_METER_FULL}`
    : `${meter}/${CRIT_METER_FULL}`;
  div.innerHTML=`
    <div class="unit-art${portraitFor(u.charId)?' has-portrait':''}" id="art-${u.id}">
      <span class="unit-sigil"></span>
      ${portraitFor(u.charId)?`<img class="unit-portrait" src="${portraitFor(u.charId)}" alt="${u.name}" draggable="false">`:''}
      <canvas class="unit-canvas" width="100" height="92" id="cv-${u.id}"></canvas>
      ${!u.alive?'<span class="unit-action-tag">已阵亡</span>':isTargetable?'<span class="unit-action-tag">选择目标</span>':isPreview?'<span class="unit-action-tag">准备出手</span>':isActive?'<span class="unit-action-tag">正在行动</span>':''}
    </div>
    <div class="unit-name"><span style="color:${u.color}">${u.name}</span><span style="font-size:11px;color:#aaa">${u.player===1?'P1':'P2'}</span></div>
    <div class="unit-meta">
      <span class="meta-atk">⚔ ${atkChanged?`<s style="color:#666">${Number(u.atk.toFixed(1))}</s>→${eff.toFixed(0)}`:Number(u.atk.toFixed(1))}</span>
      <span class="meta-def">🛡 ${u.def}</span>
      <span class="meta-crit${willCrit(u, {})?' crit-ready':''}" title="锋芒：每击攒 ${u.crit} 点（技能自带的加成另算，多段技能每段各攒一次），攒满 ${CRIT_METER_FULL} 下一击必定重击（伤害 ×${CRIT_MULTIPLIER}）然后清零重攒。这是确定的，不是概率">锋芒 ${meterText}</span>
    </div>
    <div class="bar-wrap bar-hp">
      <div class="bar-fill" style="width:${pct(u.hp,u.maxHp)}%"></div>
      ${u.shield>0?`<div class="bar-shield" style="width:${pct(Math.min(u.shield,u.maxHp),u.maxHp)}%"></div>`:''}
      <div class="bar-label">HP ${u.hp}/${u.maxHp}${u.shield>0?` (+${u.shield})`:''}</div>
    </div>
    ${expedition?`<div class="ink-unit-strip ink-state-${inkActed?'acted':u.player===gameState.currentPlayer?'ready':'other'}"><span>${inkActed?'本轮已出手':u.player===gameState.currentPlayer?'可接笔':'敌方墨阵'}</span>${u.player===gameState.currentPlayer?`<span class="ink-unit-mark" aria-hidden="true">${inkActed?'✓':'·'}</span>`:''}</div>`:`<div class="bar-wrap bar-sp"><div class="bar-fill" style="width:${pct(u.sp,u.maxSp)}%"></div><div class="bar-label">SP ${u.sp}/${u.maxSp}</div></div>`}
    <div class="unit-status">${statusChips(u)}</div>
    ${phaseTag(u)}
    ${intentBar(u)}`;
  if(isTargetable) div.onclick=()=>{ playSfx('select'); _onTargetClick(u); };
  else if(isPickable) div.onclick=()=>{ playSfx('select'); _onPreviewUnit(u); };
  const portrait=div.querySelector('.unit-portrait');
  if(portrait) portrait.addEventListener('error',()=>{
    portrait.remove(); div.querySelector('.unit-art').classList.remove('has-portrait');
    redrawUnit(u);
  },{once:true});
  if(!portrait) setTimeout(()=>redrawUnit(u),10);
  return div;
}

export function redrawUnit(u){
  const cv=document.getElementById('cv-'+u.id);
  if(cv && !cv.parentElement.classList.contains('has-portrait')) drawStickman(cv,u,u.alive?((u.disrupted||u.stunned)?'stun':u.pose):'dead');
}

export function animateUnit(id,cls){
  if(cls==='anim-hit') animateStageUnit(id,'hit');
  const el=document.getElementById('unit-'+id);
  if(!el) return;
  el.classList.add(cls);
  setTimeout(()=>el.classList.remove(cls),600);
}

export function lungeActor(actor){
  const cv=document.getElementById('art-'+actor.id);
  if(!cv) return;
  const cls=actor.player===1?'lunge-left':'lunge-right';
  cv.classList.add(cls);
  setTimeout(()=>cv.classList.remove(cls),350);
}

// idle 呼吸动画。**以前是模块顶层的裸 setInterval**：页面一加载就开始跑，
// 不管当前在哪个屏幕、标签页是否可见。setInterval 在后台只会被节流到 ~1s，
// 不会停，于是切走之后它仍在遍历全部单位 + 16 个角色预览重绘。
//
// 现在加一道 document.hidden 闸：定时器照常触发，但隐藏时**一笔都不画**。
// 昂贵的是绘制不是定时器，所以后台开销实质归零。
//
// 为什么不干脆换成 requestAnimationFrame（它天生「隐藏即暂停」）：
// 实测过，**rAF 的暂停条件不是「标签页隐藏」而是「这个页面在合成」**。
// 在内置浏览器面板里 `document.visibilityState === 'visible'`、
// `document.hidden === false`，而 rAF 一秒 0 帧——换成 rAF 会让动画在这类
// 环境里静默冻住，而这个项目恰恰要在那种面板里做 UI 验收。
// 拿一个「不保证会跑」的回调换一个 if，不划算。
const IDLE_STEP_MS=120;
let idleAnimTime=0;
setInterval(()=>{
  if(document.hidden) return;
  idleAnimTime++;
  getAllUnits().forEach(u=>{
    if(u.alive&&u.pose==='idle'){
      const cv=document.getElementById('cv-'+u.id);
      if(cv && !cv.parentElement.classList.contains('has-portrait')) drawStickman(cv,u,'idle',idleAnimTime);
    }
  });
  CHARACTERS.forEach(c=>{
    const cv=document.getElementById('prev-'+c.id);
    if(cv) drawStickman(cv,{id:c.id,charId:c.id,color:c.color,weapon:c.weapon,player:1},'idle',idleAnimTime);
  });
},IDLE_STEP_MS);
