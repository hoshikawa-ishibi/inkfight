import { CHARACTERS } from './data.js';
import { Audio, playSfx } from './audio.js';
import { gameState, clamp, getUnit, getEnemies, getAllies } from './state.js';
import { renderBattle, redrawUnit, animateUnit, lungeActor } from './render.js';
import { playSkillVfx, spawnFloatText, spawnHitBurst, spawnCritBurst, spawnHealColumn, spawnHexShield, spawnAura, spawnSmoke, spawnCurse, spawnDrainBeam } from './vfx.js';
import { aiEasy, aiNormal, aiHard } from './ai.js';

// ── 被动技能触发 ──────────────────────────────────────────
function triggerPassive(trigger, unit, ctx={}){
  const p = unit.passive;
  if(!p || p.trigger !== trigger) return;
  switch(p.effect){
    case 'spGain':
      unit.sp = clamp(unit.sp + p.value, 0, unit.maxSp);
      addLog(`【${p.name}】${unit.name} 回复 ${p.value} SP`, 'sp');
      spawnFloatText(unit, `+${p.value} SP`, '#4fc3f7', 14);
      break;
    case 'overchargeBuff':
      if(unit.sp / unit.maxSp >= 0.8){
        unit.buffs.push({type:'atkUp', dur:1, value:0.2});
        addLog(`【${p.name}】${unit.name} 灵能充盈，下次技能伤害+20%`, 'buff');
        spawnFloatText(unit, '法力涌动!', '#4fc3f7', 14);
      }
      break;
    case 'allyHeal': {
      const allies = getAllies(unit.player).filter(a => a.alive && a.hp/a.maxHp < 0.3);
      allies.forEach(a => {
        a.hp = clamp(a.hp + p.value, 0, a.maxHp);
        addLog(`【${p.name}】${unit.name} 圣光治疗 ${a.name} ${p.value} HP`, 'heal');
        spawnFloatText(a, `+${p.value}`, '#66bb6a', 14);
        spawnHealColumn(a);
      });
      break;
    }
    case 'critStack': {
      const stacks = unit.passiveStacks || 0;
      if(stacks < p.maxStacks){
        unit.passiveStacks = stacks + 1;
        unit.crit += p.value;
        addLog(`【${p.name}】${unit.name} 暴击率+${p.value}%（${unit.passiveStacks}层）`, 'buff');
        spawnFloatText(unit, `鹰眼${unit.passiveStacks}层`, '#ffd54f', 13);
      }
      break;
    }
    case 'reflect': {
      const attacker = ctx.attacker;
      if(attacker && attacker.alive && ctx.dmg > 0){
        const ref = Math.max(1, Math.floor(ctx.dmg * p.value));
        attacker.hp = clamp(attacker.hp - ref, 0, attacker.maxHp);
        addLog(`【${p.name}】${unit.name} 反弹 ${ref} 伤害给 ${attacker.name}`, 'dmg');
        spawnFloatText(attacker, `-${ref}`, '#90caf9', 14);
        if(attacker.hp <= 0) handleDeath(attacker);
      }
      break;
    }
    case 'bloodRage': {
      if(unit.hp / unit.maxHp < 0.4){
        const stacks = unit.passiveStacks || 0;
        if(stacks < p.maxStacks){
          unit.passiveStacks = stacks + 1;
          unit.buffs.push({type:'atkUp', dur:99, value:p.value});
          addLog(`【${p.name}】${unit.name} 血怒觉醒！攻击+${p.value*100}%（${unit.passiveStacks}层）`, 'buff');
          spawnFloatText(unit, '血怒!', '#ff7043', 16);
          spawnAura(unit, '#ff5722');
        }
      }
      break;
    }
    case 'soulDrain': {
      const target = ctx.target;
      if(target && (target.debuffs.some(d=>d.type==='poison'||d.type==='cursed'))){
        unit.hp = clamp(unit.hp + p.value, 0, unit.maxHp);
        addLog(`【${p.name}】${unit.name} 灵魂侵蚀吸取 ${p.value} HP`, 'heal');
        spawnFloatText(unit, `+${p.value}`, '#ce93d8', 14);
      }
      break;
    }
  }
}


let _showScreen, _hideTooltip, _showTooltip, _screenShake, _onCampaignWin;
export function initBattle(showScreen, hideTooltip, showTooltip, screenShake, onCampaignWin){
  _showScreen=showScreen; _hideTooltip=hideTooltip;
  _showTooltip=showTooltip; _screenShake=screenShake;
  _onCampaignWin=onCampaignWin;
}

export function createUnit(charId,player,slot){
  const b=CHARACTERS.find(c=>c.id===charId);
  return {
    id:`${player}-${slot}`, charId:b.id, name:b.name, player, color:b.color, weapon:b.weapon,
    maxHp:b.hp, hp:b.hp, maxSp:b.sp, sp:b.sp, atk:b.atk, def:b.def, crit:b.crit, dodge:b.dodge, spRegen:b.spRegen,
    skills:JSON.parse(JSON.stringify(b.skills)),
    passive:b.passive||null, passiveStacks:0,
    alive:true, shield:0, buffs:[], debuffs:[], stunned:false, dodging:false, undying:0,
    pose:'idle', blink:0
  };
}

export function startBattle(){
  _showScreen('screen-battle');
  _hideTooltip();
  const fx=document.getElementById('fx-canvas');
  fx.width=window.innerWidth; fx.height=window.innerHeight;
  gameState.p1Units=gameState.p1Picks.map((id,i)=>createUnit(id,1,i));
  gameState.p2Units=gameState.p2Picks.map((id,i)=>createUnit(id,2,i));
  if(gameState.mode==='ai'){
    const d=gameState.difficulty;
    gameState.p2Units.forEach(u=>{
      if(d==='easy'){ u.atk=Math.round(u.atk*0.85); u.sp=Math.floor(u.maxSp*0.5); }
      else if(d==='hard'){ u.atk=Math.round(u.atk*1.15); u.spRegen=Math.round(u.spRegen*1.2); }
    });
  }
  gameState.round=1; gameState.currentIdx=0;
  gameState.stats={
    p1:{dmg:0,heal:0,kills:0}, p2:{dmg:0,heal:0,kills:0},
    maxHit:{dmg:0,name:''}, units:{}
  };
  [...gameState.p1Units,...gameState.p2Units].forEach(u=>{
    gameState.stats.units[u.id]={name:u.name,player:u.player,dmg:0,heal:0,kills:0};
  });
  buildTurnOrder();
  document.getElementById('battle-log').innerHTML='';
  const modeLabel=gameState.mode==='campaign'?`战役·第${gameState.campaignStage}关`:gameState.mode==='ai'?('人机·'+({easy:'简单',normal:'普通',hard:'困难'}[gameState.difficulty])):'双人';
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
  gameState.turnOrder=[];
  const max=Math.max(gameState.p1Units.length,gameState.p2Units.length);
  for(let i=0;i<max;i++){
    if(gameState.p1Units[i]) gameState.turnOrder.push(gameState.p1Units[i].id);
    if(gameState.p2Units[i]) gameState.turnOrder.push(gameState.p2Units[i].id);
  }
  gameState.currentIdx=0;
}

function startTurn(){
  const id=gameState.turnOrder[gameState.currentIdx];
  const u=getUnit(id);
  if(!u||!u.alive){ nextTurn(); return; }
  if(u.stunned){
    addLog(`${u.name} 被眩晕，跳过回合！`,'stun');
    playSfx('stun'); u.stunned=false;
    setTimeout(nextTurn,700); return;
  }
  processStartOfTurn(u);
  if(!u.alive){ setTimeout(nextTurn,600); return; }
  u.sp=clamp(u.sp+u.spRegen,0,u.maxSp);
  if(gameState.scene.buff==='spRegen') u.sp=clamp(u.sp+5,0,u.maxSp);
  document.getElementById('round-badge').textContent=`回合 ${gameState.round}`;
  document.getElementById('turn-text').textContent=
    `玩家${u.player} - ${u.name}（ATK:${getEffectiveAtk(u).toFixed(0)}）行动`;
  renderBattle();
  if(gameState.mode==='ai'&&u.player===2){
    document.getElementById('skill-panel').innerHTML=`<span style="color:#888;">🤖 AI 思考中...</span>`;
    setTimeout(()=>aiAct(u),700+Math.random()*400);
  } else {
    renderSkillPanel(u);
  }
}

function processStartOfTurn(u){
  // 被动：回合开始
  triggerPassive('onTurnStart', u);
  u.debuffs.forEach(d=>{
    if(d.type==='poison'){
      u.hp=clamp(u.hp-d.value,0,u.maxHp);
      addLog(`${u.name} 受到中毒伤害 ${d.value}`,'dmg');
      spawnFloatText(u,`-${d.value}`,'#9ccc65',14);
      if(u.hp<=0) handleDeath(u);
    }
  });
  const berserk=u.buffs.find(b=>b.type==='berserk');
  if(berserk){
    u.hp=clamp(u.hp-8,0,u.maxHp);
    addLog(`${u.name} 因狂暴失去 8 HP`,'dmg');
    spawnFloatText(u,'-8','#ff7043',14);
    if(u.hp<=0) handleDeath(u);
  }
  u.buffs=u.buffs.filter(b=>--b.dur>0);
  u.debuffs=u.debuffs.filter(d=>--d.dur>0);
}

function nextTurn(){
  if(checkVictory()) return;
  gameState.currentIdx++;
  if(gameState.currentIdx>=gameState.turnOrder.length){
    gameState.currentIdx=0; gameState.round++;
    addLog(`═══ 回合 ${gameState.round} 开始 ═══`,'divider');
  }
  startTurn();
}

function checkVictory(){
  const p1=gameState.p1Units.some(u=>u.alive);
  const p2=gameState.p2Units.some(u=>u.alive);
  if(!p1||!p2){ setTimeout(()=>showResult(p1?1:2),700); return true; }
  return false;
}

function showResult(w){
  Audio.stopBgm();
  if(gameState.mode==='campaign'){
    if(w===1&&_onCampaignWin){ _onCampaignWin(); return; }
    // 战役失败
    playSfx('defeat');
    _showScreen('screen-result');
    document.getElementById('result-title').textContent='战败...';
    document.getElementById('result-title').style.color='#888';
    document.getElementById('result-desc').textContent='墨境的黑暗尚未散去，再试一次吧。';
    const s=gameState.stats;
    document.getElementById('result-stats').innerHTML=`
      <h3>战斗统计</h3>
      <div class="row"><span>造成伤害</span><span>${s.p1.dmg}</span></div>
      <div class="row"><span>治疗量</span><span>${s.p1.heal}</span></div>
      <div class="row"><span>坚持回合</span><span>${gameState.round}</span></div>
      <div style="margin-top:12px;display:flex;gap:10px;justify-content:center;">
        <button class="btn btn-confirm" onclick="playSfx('click'); showScreen('screen-campaign')">返回地图</button>
        <button class="btn" onclick="playSfx('click'); location.reload()">重新开始</button>
      </div>`;
    return;
  }
  _showScreen('screen-result');
  document.getElementById('result-title').textContent=`玩家 ${w} 胜利！`;
  document.getElementById('result-title').style.color=w===1?'#e94560':'#16c79a';
  document.getElementById('result-desc').textContent=
    w===1?'黑墨团赢得了墨境的统治权！':'白线派守护了墨境的秩序！';
  const isPlayerWin=(gameState.mode==='ai'&&w===1)||gameState.mode==='pvp';
  playSfx(isPlayerWin?'victory':'defeat');
  const s=gameState.stats;
  // MVP：综合评分 = 伤害 + 治疗×1.5 + 击杀×80
  const allUnits=Object.values(s.units);
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
    ['玩家1 总伤害', s.p1.dmg],['玩家2 总伤害', s.p2.dmg],
    ['总回合数', gameState.round],
  ];
  const statsEl=document.getElementById('result-stats');
  statsEl.innerHTML=`<h3>战斗统计</h3>`+rows.map(([k,v])=>
    `<div class="row"><span>${k}</span><span class="stat-val" data-val="${v}">${typeof v==='number'?0:v}</span></div>`
  ).join('');
  // 数字滚动动画
  statsEl.querySelectorAll('.stat-val[data-val]').forEach(el=>{
    const target=parseInt(el.dataset.val);
    if(isNaN(target)) return;
    let cur=0; const step=Math.max(1,Math.floor(target/30));
    const t=setInterval(()=>{ cur=Math.min(cur+step,target); el.textContent=cur; if(cur>=target) clearInterval(t); },30);
  });
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

export function getEffectiveAtk(u){
  let a=u.atk;
  u.buffs.forEach(b=>{
    if(b.type==='atkUp'||b.type==='atkUp1') a*=(1+b.value);
    if(b.type==='berserk') a*=(1+b.value);
  });
  if(u.charId==='berserker') a*=(1+(1-u.hp/u.maxHp)*0.5);
  return a;
}

export function previewDmg(u,s){
  if(!s.power) return null;
  let d=getEffectiveAtk(u)*s.power;
  if(gameState.scene.buff==='damageUp') d*=1.15;
  return Math.floor(d);
}

export function renderSkillPanel(u){
  const p=document.getElementById('skill-panel');
  p.innerHTML='';
  u.skills.forEach((s,i)=>{
    const btn=document.createElement('button');
    btn.className='skill-btn';
    btn.disabled=u.sp<s.cost||(s.hpCost&&u.hp<=s.hpCost);
    const dmg=previewDmg(u,s);
    btn.innerHTML=`
      <span class="skill-icon" style="background:${s.iconColor}33;color:${s.iconColor};border:1px solid ${s.iconColor}">${s.icon}</span>
      <span class="key-hint">[${i+1}]</span>
      ${s.name}
      <span class="sp-cost">${s.cost>0?s.cost+'SP':'免费'}${s.hpCost?` -${s.hpCost}HP`:''}</span>
      ${dmg!==null?`<span class="dmg-preview">≈${dmg}伤害</span>`:''}`;
    btn.onmouseenter=(e)=>{ if(!btn.disabled) playSfx('hover');
      _showTooltip(`<b style="color:${s.iconColor}">${s.icon} ${s.name}</b><br>${s.desc}<br><span style="color:#16c79a">消耗:${s.cost} SP${s.hpCost?` / ${s.hpCost} HP`:''}</span>`,e.clientX,e.clientY);
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
  if(u.sp<s.cost||s.hpCost&&u.hp<=s.hpCost) return;
  const needsEnemy=['damage','stun','spSteal','debuff','drain'].includes(s.type);
  const needsAlly=['heal','cleanse','buff'].includes(s.type);
  const noTarget=['healSp','shield','taunt','dodge','selfBuff','revive','damageAll'].includes(s.type);
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
  if(gameState.waitingForTarget){
    gameState.waitingForTarget=false;
    gameState.pendingSkill=null; gameState.pendingActor=null;
    const u=getUnit(gameState.turnOrder[gameState.currentIdx]);
    if(u) renderSkillPanel(u);
    renderBattle();
  }
}

function aiAct(u){
  const enemies=getEnemies(u.player).filter(e=>e.alive);
  const allies=getAllies(u.player).filter(e=>e.alive);
  if(enemies.length===0){ setTimeout(nextTurn,400); return; }
  const d=gameState.difficulty;
  let chosen;
  if(d==='easy') chosen=aiEasy(u,enemies,allies);
  else if(d==='hard') chosen=aiHard(u,enemies,allies);
  else chosen=aiNormal(u,enemies,allies);
  if(!chosen||!chosen.skill){ setTimeout(nextTurn,400); return; }
  addLog(`🤖 ${u.name} 使用 ${chosen.skill.name}${chosen.target?` → ${chosen.target.name}`:''}`,'info');
  executeSkill(u,chosen.skill,chosen.target);
}

function executeSkill(actor,skill,target){
  if(skill.cost) actor.sp-=skill.cost;
  if(skill.hpCost) actor.hp=clamp(actor.hp-skill.hpCost,1,actor.maxHp);
  if(skill.sfx) playSfx(skill.sfx);
  lungeActor(actor); actor.pose='attack';
  setTimeout(()=>{ actor.pose='idle'; redrawUnit(actor); },500);
  switch(skill.type){
    case 'damage': playSkillVfx(actor,target,skill,()=>doDamage(actor,target,skill)); break;
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
      if(skill.buffType) actor.buffs.push({type:skill.buffType,dur:skill.dur,value:0.2});
      break;
    case 'shield':
      actor.shield+=skill.shieldAmt;
      addLog(`${actor.name} 获得 ${skill.shieldAmt} 点护盾`,'info');
      spawnFloatText(actor,`🛡+${skill.shieldAmt}`,'#90caf9',16); spawnHexShield(actor);
      break;
    case 'taunt':
      actor.buffs.push({type:'taunt',dur:skill.dur});
      addLog(`${actor.name} 发动嘲讽`,'info');
      spawnFloatText(actor,'嘲讽','#f5a623',16); spawnAura(actor,'#f5a623');
      break;
    case 'dodge':
      actor.dodging=true;
      addLog(`${actor.name} 进入闪避状态`,'info');
      spawnFloatText(actor,'💨','#fff',20); spawnSmoke(actor);
      break;
    case 'selfBuff':
      actor.buffs.push({type:skill.buffType,dur:skill.dur,value:0.4});
      addLog(`${actor.name} 进入${skill.buffType==='berserk'?'狂暴':'强化'}状态`,'buff');
      spawnFloatText(actor,'狂暴!','#ff7043',18); spawnAura(actor,'#ff5722');
      break;
    case 'cleanse':
      target.debuffs=[]; target.stunned=false;
      addLog(`${actor.name} 净化了 ${target.name}`,'heal');
      spawnHealColumn(target,'#fff');
      break;
    case 'buff':
      target.buffs.push({type:skill.buffType,dur:skill.dur,value:0.3});
      addLog(`${actor.name} 给予 ${target.name} 攻击祝福`,'buff');
      spawnFloatText(target,'ATK↑','#ce93d8',16); spawnAura(target,'#ffd54f');
      break;
    case 'spSteal': {
      const stolen=Math.min(skill.stealAmt,target.sp);
      target.sp-=stolen; actor.sp=clamp(actor.sp+stolen,0,actor.maxSp);
      addLog(`${actor.name} 偷取 ${target.name} ${stolen} SP`,'sp');
      spawnFloatText(target,`-${stolen} SP`,'#4fc3f7',14);
      playSkillVfx(actor,target,skill,()=>doDamage(actor,target,skill));
      break;
    }
    case 'debuff':
      target.debuffs.push({type:skill.debuffType,dur:skill.dur,value:0.25});
      addLog(`${actor.name} 诅咒了 ${target.name}`,'buff');
      spawnFloatText(target,'诅咒','#7e57c2',16); spawnCurse(target);
      break;
    case 'drain':
      playSkillVfx(actor,target,skill,()=>{
        const dmg=doDamage(actor,target,skill);
        const drain=Math.floor(dmg*skill.drainPct/100);
        actor.hp=clamp(actor.hp+drain,0,actor.maxHp);
        gameState.stats['p'+actor.player].heal+=drain;
        if(gameState.stats.units[actor.id]) gameState.stats.units[actor.id].heal+=drain;
        spawnFloatText(actor,`+${drain}`,'#16c79a',16); spawnDrainBeam(target,actor);
      });
      break;
    case 'revive':
      actor.undying=skill.hpRestore;
      addLog(`${actor.name} 进入不屈状态`,'buff');
      spawnFloatText(actor,'不屈','#ffd54f',16); spawnAura(actor,'#ffd54f');
      break;
  }
  setTimeout(()=>{ renderBattle(); setTimeout(nextTurn,700); },900);
}

function doDamage(actor,target,skill){
  if(target.dodging||Math.random()*100<target.dodge){
    addLog(`${target.name} 闪避了攻击！`,'miss');
    spawnFloatText(target,'MISS','#888',18); playSfx('miss');
    target.dodging=false; return 0;
  }
  let baseAtk=getEffectiveAtk(actor);
  let dmg=baseAtk*(skill.power||1);
  let isCrit=false;
  const totalCrit=(skill.crit||0)+actor.crit;
  if(Math.random()*100<totalCrit){
    dmg*=1.5; isCrit=true;
    addLog(`💥 暴击！`,'crit'); playSfx('crit'); spawnCritBurst(target);
  }
  if(target.debuffs.some(d=>d.type==='cursed')) dmg*=1.25;
  if(target.debuffs.some(d=>d.type==='defDown')) dmg*=1.2;
  if(gameState.scene.buff==='damageUp') dmg*=1.15;
  const defReduce=target.def/(target.def+50);
  dmg*=(1-defReduce);
  actor.buffs=actor.buffs.filter(b=>b.type!=='atkUp1');
  dmg=Math.max(1,Math.floor(dmg));
  if(target.shield>0){
    const ab=Math.min(target.shield,dmg);
    target.shield-=ab; dmg-=ab;
    if(ab>0){ addLog(`${target.name} 护盾吸收 ${ab}`,'info'); spawnFloatText(target,`🛡-${ab}`,'#90caf9',14); }
  }
  target.hp=clamp(target.hp-dmg,0,target.maxHp);
  gameState.stats['p'+actor.player].dmg+=dmg;
  if(gameState.stats.units[actor.id]) gameState.stats.units[actor.id].dmg+=dmg;
  if(dmg>gameState.stats.maxHit.dmg) gameState.stats.maxHit={dmg,name:actor.name};
  addLog(`${actor.name}(ATK ${baseAtk.toFixed(0)}) → ${target.name}: ${dmg} 伤害${isCrit?' [暴击]':''}`,isCrit?'crit':'dmg');
  animateUnit(target.id,'anim-hit'); spawnHitBurst(target);
  spawnFloatText(target,`-${dmg}`,isCrit?'#ffd54f':'#ff5252',isCrit?28:18+Math.min(12,dmg/8));
  playSfx('hit'); _screenShake(isCrit?14:6,isCrit?400:200);
  target.pose='hurt'; setTimeout(()=>{target.pose='idle'; redrawUnit(target);},400);
  if(skill.dot){ target.debuffs.push({type:'poison',dur:skill.dotDur,value:skill.dot}); addLog(`${target.name} 中毒了`,'buff'); }
  if(skill.debuff==='defDown') target.debuffs.push({type:'defDown',dur:skill.debuffDur,value:0.2});
  if(skill.selfHeal){
    actor.hp=clamp(actor.hp+skill.selfHeal,0,actor.maxHp);
    gameState.stats['p'+actor.player].heal+=skill.selfHeal;
    if(gameState.stats.units[actor.id]) gameState.stats.units[actor.id].heal+=skill.selfHeal;
    spawnFloatText(actor,`+${skill.selfHeal}`,'#16c79a',16);
  }
  if(target.hp<=0) handleDeath(target,actor);
  // 被动触发
  if(dmg > 0){
    triggerPassive('onDamageDealt', actor, {target});
    triggerPassive('onTakeDamage', target, {attacker:actor, dmg});
    if(isCrit) triggerPassive('onCrit', actor, {target});
  }
  return dmg;
}

function doStun(actor,target,skill){
  const prob=skill.basePct+skill.spScale*(target.sp/target.maxSp);
  const roll=Math.random()*100;
  addLog(`${actor.name} 对 ${target.name} 施放${skill.name}，眩晕概率 ${prob.toFixed(1)}%`,'stun');
  if(roll<prob){
    target.stunned=true;
    addLog(`${target.name} 被眩晕了！`,'stun');
    spawnFloatText(target,'眩晕!','#f5a623',18); spawnHitBurst(target,'#f5a623');
    playSfx('stun'); _screenShake(8,250);
  } else {
    addLog(`${target.name} 抵抗了眩晕`,'miss');
    spawnFloatText(target,'抵抗','#888',16); playSfx('miss');
  }
}

function handleDeath(u,killer){
  if(u.undying){
    u.hp=u.undying; u.undying=0;
    addLog(`${u.name} 触发不屈，保留 ${u.hp} HP！`,'heal');
    spawnFloatText(u,'不屈!','#ffd54f',20); spawnAura(u,'#ffd54f');
    return;
  }
  u.alive=false; u.pose='dead';
  addLog(`☠ ${u.name} 阵亡！`,'death'); playSfx('death'); _screenShake(12,400);
  if(killer){
    gameState.stats['p'+killer.player].kills++;
    if(gameState.stats.units[killer.id]) gameState.stats.units[killer.id].kills++;
  }
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
