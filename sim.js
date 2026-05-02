// 纯逻辑战斗模拟器，无渲染无延迟
import { CHARACTERS, SCENES } from './data.js';

function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }

function makeUnit(charId, player, slot){
  const b = CHARACTERS.find(c=>c.id===charId);
  return {
    id:`${player}-${slot}`, charId:b.id, name:b.name, player,
    maxHp:b.hp, hp:b.hp, maxSp:b.sp, sp:b.sp,
    atk:b.atk, def:b.def, crit:b.crit, dodge:b.dodge, spRegen:b.spRegen,
    skills: JSON.parse(JSON.stringify(b.skills)),
    passive: b.passive||null, passiveStacks:0,
    alive:true, shield:0, buffs:[], debuffs:[],
    stunned:false, dodging:false, undying:0,
  };
}

function getEffectiveAtk(u){
  let a = u.atk;
  u.buffs.forEach(b=>{
    if(b.type==='atkUp'||b.type==='atkUp1'||b.type==='berserk') a*=(1+b.value);
  });
  if(u.charId==='berserker') a*=(1+(1-u.hp/u.maxHp)*0.5);
  return a;
}

function triggerPassive(trigger, unit, ctx={}){
  const p = unit.passive;
  if(!p || p.trigger!==trigger) return;
  switch(p.effect){
    case 'spGain':
      unit.sp = clamp(unit.sp+p.value, 0, unit.maxSp); break;
    case 'overchargeBuff':
      if(unit.sp/unit.maxSp>=0.8)
        unit.buffs.push({type:'atkUp',dur:1,value:0.2}); break;
    case 'allyHeal': {
      const allies = (unit.player===1?ctx.p1:ctx.p2).filter(a=>a.alive&&a.hp/a.maxHp<0.3);
      allies.forEach(a=>{ a.hp=clamp(a.hp+p.value,0,a.maxHp); }); break;
    }
    case 'critStack':
      if((unit.passiveStacks||0)<p.maxStacks){ unit.passiveStacks=(unit.passiveStacks||0)+1; unit.crit+=p.value; } break;
    case 'reflect':
      if(ctx.attacker&&ctx.attacker.alive&&ctx.dmg>0){
        const ref=Math.max(1,Math.floor(ctx.dmg*p.value));
        ctx.attacker.hp=clamp(ctx.attacker.hp-ref,0,ctx.attacker.maxHp);
        if(ctx.attacker.hp<=0) handleDeath(ctx.attacker,null,null);
      } break;
    case 'bloodRage':
      if(unit.hp/unit.maxHp<0.4&&(unit.passiveStacks||0)<p.maxStacks){
        unit.passiveStacks=(unit.passiveStacks||0)+1;
        unit.buffs.push({type:'atkUp',dur:99,value:p.value});
      } break;
    case 'soulDrain':
      if(ctx.target&&(ctx.target.debuffs.some(d=>d.type==='poison'||d.type==='cursed')))
        unit.hp=clamp(unit.hp+p.value,0,unit.maxHp); break;
  }
}

function handleDeath(u, killer, stats){
  if(u.undying){ u.hp=u.undying; u.undying=0; return; }
  u.alive=false;
  if(killer&&stats) stats[killer.charId].kills++;
}

function doDamage(actor, target, skill, scene, stats){
  if(target.dodging||Math.random()*100<target.dodge){ target.dodging=false; return 0; }
  let dmg = getEffectiveAtk(actor)*(skill.power||1);
  let isCrit = false;
  if(Math.random()*100<((skill.crit||0)+actor.crit)){ dmg*=1.5; isCrit=true; }
  if(target.debuffs.some(d=>d.type==='cursed')) dmg*=1.25;
  if(target.debuffs.some(d=>d.type==='defDown')) dmg*=1.2;
  if(scene.buff==='damageUp') dmg*=1.15;
  dmg*=(1-target.def/(target.def+50));
  actor.buffs=actor.buffs.filter(b=>b.type!=='atkUp1');
  dmg=Math.max(1,Math.floor(dmg));
  if(target.shield>0){ const ab=Math.min(target.shield,dmg); target.shield-=ab; dmg-=ab; }
  target.hp=clamp(target.hp-dmg,0,target.maxHp);
  if(stats){ stats[actor.charId].dmg+=dmg; }
  if(skill.dot) target.debuffs.push({type:'poison',dur:skill.dotDur,value:skill.dot});
  if(skill.debuff==='defDown') target.debuffs.push({type:'defDown',dur:skill.debuffDur,value:0.2});
  if(skill.selfHeal){ actor.hp=clamp(actor.hp+skill.selfHeal,0,actor.maxHp); }
  if(target.hp<=0) handleDeath(target, actor, stats);
  if(dmg>0){
    triggerPassive('onDamageDealt', actor, {target});
    triggerPassive('onTakeDamage', target, {attacker:actor, dmg});
    if(isCrit) triggerPassive('onCrit', actor, {});
  }
  return dmg;
}

function pickSkill(u, enemies, allies, scene){
  // 简单评分：优先能用的高cost技能
  const alive_enemies = enemies.filter(e=>e.alive);
  const alive_allies = allies.filter(a=>a.alive);
  if(!alive_enemies.length) return null;

  let best = null, bestScore = -1;
  for(const s of u.skills){
    if(u.sp < s.cost) continue;
    if(s.hpCost && u.hp <= s.hpCost) continue;
    let score = s.cost * 0.5;
    if(s.type==='damage'||s.type==='damageAll') score += (s.power||1)*10;
    if(s.type==='heal'){
      const needHeal = alive_allies.some(a=>a.hp/a.maxHp<0.5);
      score += needHeal ? 20 : 2;
    }
    if(s.type==='stun') score += 12;
    if(s.type==='drain') score += 8;
    if(score>bestScore){ bestScore=score; best=s; }
  }
  return best;
}

function pickTarget(actor, skill, enemies, allies){
  const needsEnemy=['damage','stun','spSteal','debuff','drain','damageAll'].includes(skill.type);
  const needsAlly=['heal','cleanse','buff'].includes(skill.type);
  if(needsEnemy){
    const taunter = enemies.find(e=>e.alive&&e.buffs.some(b=>b.type==='taunt'));
    if(taunter) return taunter;
    // 集火最低HP
    return enemies.filter(e=>e.alive).sort((a,b)=>a.hp-b.hp)[0]||null;
  }
  if(needsAlly){
    return allies.filter(a=>a.alive).sort((a,b)=>a.hp-b.hp)[0]||null;
  }
  return null; // self-targeting
}

function executeSkill(actor, skill, target, scene, p1, p2, stats){
  if(skill.cost) actor.sp-=skill.cost;
  if(skill.hpCost) actor.hp=clamp(actor.hp-skill.hpCost,1,actor.maxHp);
  const enemies = actor.player===1?p2:p1;
  const allies = actor.player===1?p1:p2;
  switch(skill.type){
    case 'damage': doDamage(actor,target,skill,scene,stats); break;
    case 'damageAll': enemies.filter(e=>e.alive).forEach(t=>doDamage(actor,t,skill,scene,stats)); break;
    case 'stun': {
      const prob=skill.basePct+skill.spScale*(target.sp/target.maxSp);
      if(Math.random()*100<prob) target.stunned=true;
      break;
    }
    case 'heal': {
      const h=skill.healAmt; target.hp=clamp(target.hp+h,0,target.maxHp);
      if(stats) stats[actor.charId].heals+=h; break;
    }
    case 'healSp':
      actor.sp=clamp(actor.sp+skill.spGain,0,actor.maxSp);
      if(skill.buffType) actor.buffs.push({type:skill.buffType,dur:skill.dur,value:0.2}); break;
    case 'shield': actor.shield+=skill.shieldAmt; break;
    case 'taunt': actor.buffs.push({type:'taunt',dur:skill.dur}); break;
    case 'dodge': actor.dodging=true; break;
    case 'selfBuff': actor.buffs.push({type:skill.buffType,dur:skill.dur,value:0.4}); break;
    case 'cleanse': target.debuffs=[]; target.stunned=false; break;
    case 'buff': target.buffs.push({type:skill.buffType,dur:skill.dur,value:0.3}); break;
    case 'spSteal': {
      const stolen=Math.min(skill.stealAmt,target.sp);
      target.sp-=stolen; actor.sp=clamp(actor.sp+stolen,0,actor.maxSp);
      doDamage(actor,target,skill,scene,stats); break;
    }
    case 'debuff': target.debuffs.push({type:skill.debuffType,dur:skill.dur,value:0.25}); break;
    case 'drain': {
      const dmg=doDamage(actor,target,skill,scene,stats);
      const drain=Math.floor(dmg*(skill.drainPct/100));
      actor.hp=clamp(actor.hp+drain,0,actor.maxHp);
      if(stats) stats[actor.charId].heals+=drain; break;
    }
    case 'revive': actor.undying=skill.hpRestore; break;
  }
}

function simOneBattle(p1ids, p2ids, scene){
  const p1 = p1ids.map((id,i)=>makeUnit(id,1,i));
  const p2 = p2ids.map((id,i)=>makeUnit(id,2,i));
  const order = [];
  const max = Math.max(p1.length,p2.length);
  for(let i=0;i<max;i++){
    if(p1[i]) order.push(p1[i]);
    if(p2[i]) order.push(p2[i]);
  }
  const stats = {};
  [...p1,...p2].forEach(u=>{ stats[u.charId]={dmg:0,heals:0,kills:0}; });

  for(let round=0; round<60; round++){
    for(const u of order){
      if(!u.alive) continue;
      // 回合开始被动
      triggerPassive('onTurnStart', u, {p1,p2});
      // 毒/狂暴
      u.debuffs.forEach(d=>{
        if(d.type==='poison'){ u.hp=clamp(u.hp-d.value,0,u.maxHp); if(u.hp<=0) handleDeath(u,null,null); }
      });
      const berserk=u.buffs.find(b=>b.type==='berserk');
      if(berserk){ u.hp=clamp(u.hp-8,0,u.maxHp); if(u.hp<=0) handleDeath(u,null,null); }
      u.buffs=u.buffs.filter(b=>--b.dur>0);
      u.debuffs=u.debuffs.filter(d=>--d.dur>0);
      if(!u.alive) continue;
      if(u.stunned){ u.stunned=false; continue; }
      u.sp=clamp(u.sp+u.spRegen,0,u.maxSp);
      if(scene.buff==='spRegen') u.sp=clamp(u.sp+5,0,u.maxSp);

      const enemies=(u.player===1?p2:p1).filter(e=>e.alive);
      const allies=(u.player===1?p1:p2).filter(a=>a.alive);
      if(!enemies.length) break;

      const skill=pickSkill(u,enemies,allies,scene);
      if(!skill) continue;
      const target=pickTarget(u,skill,enemies,allies);
      executeSkill(u,skill,target,scene,p1,p2,stats);
    }
    const p1alive=p1.some(u=>u.alive), p2alive=p2.some(u=>u.alive);
    if(!p1alive||!p2alive) return { winner: p1alive?1:2, stats };
  }
  // 超时：HP多的赢
  const p1hp=p1.reduce((s,u)=>s+u.hp,0), p2hp=p2.reduce((s,u)=>s+u.hp,0);
  return { winner: p1hp>=p2hp?1:2, stats };
}

function randomPicks(){
  const ids = CHARACTERS.map(c=>c.id);
  const shuffled = ids.sort(()=>Math.random()-0.5);
  return [shuffled.slice(0,2), shuffled.slice(2,4)];
}

// 分批跑，每批500局，用setTimeout让UI不卡死
export function runSimulation(totalRounds, onProgress, onDone){
  const charStats = {}; // charId -> {wins,games}
  CHARACTERS.forEach(c=>{ charStats[c.id]={wins:0,games:0,name:c.name}; });

  let done = 0;
  const BATCH = 500;

  function runBatch(){
    const end = Math.min(done+BATCH, totalRounds);
    for(; done<end; done++){
      const scene = SCENES[Math.floor(Math.random()*SCENES.length)];
      const [p1ids, p2ids] = randomPicks();
      const {winner} = simOneBattle(p1ids, p2ids, scene);
      const winnerIds = winner===1?p1ids:p2ids;
      [...p1ids,...p2ids].forEach(id=>{ charStats[id].games++; });
      winnerIds.forEach(id=>{ charStats[id].wins++; });
    }
    onProgress(done, totalRounds);
    if(done < totalRounds) setTimeout(runBatch, 0);
    else onDone(charStats);
  }
  setTimeout(runBatch, 0);
}
