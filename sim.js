// 纯逻辑战斗模拟器，无渲染无延迟。
// 战斗规则（伤害公式/被动/腐化等）全部来自 combat.js，
// 与 battle.js 共用同一份实现，避免两边数值再次漂移出 bug。
//
// 决策同理：直接调 ai.js 的 aiHard，也就是玩家在困难难度下面对的那个 AI。
// 以前这里有一份自己的 pickSkill，于是「平衡测试测的根本不是玩家打的 AI」，
// 胜率结论对真实对局未必成立。现在这条链路上只剩一份实现。
import { CHARACTERS, SCENES } from './data.js';
import { clamp } from './state.js';
import {
  createUnit as makeUnit, triggerPassive, calcDamage,
  applyCorrupt, applyPlague, applyCorruptBurst, handleDeath as resolveDeath,
  resolveStun, resolveSelfBuff, makeAllyBuff, makeSpBuff, makeDebuff, BUFF_DEFAULTS
} from './combat.js';
import { makeTeamContext } from './ai-scoring.js';
import { aiHard } from './ai.js';

function noteKill(died, killer, stats){
  if(died && killer && stats) stats[killer.charId].kills++;
}

function handleDeath(u, killer, stats){
  const { died } = resolveDeath(u);
  noteKill(died, killer, stats);
}

function doDamage(actor, target, skill, scene, stats){
  const r = calcDamage(actor, target, skill, scene);
  if(stats && r.dmg > 0) stats[actor.charId].dmg += r.dmg;
  noteKill(r.killed, actor, stats);
  return r.dmg;
}


function executeSkill(actor, skill, target, scene, p1, p2, stats){
  if(skill.cost) actor.sp-=skill.cost;
  if(skill.hpCost) actor.hp=clamp(actor.hp-skill.hpCost,1,actor.maxHp);
  const enemies = actor.player===1?p2:p1;
  const allies = actor.player===1?p1:p2;
  switch(skill.type){
    case 'damage':
      doDamage(actor,target,skill,scene,stats);
      if(skill.corrupt&&target.alive) applyCorrupt(target,skill.corrupt);
      break;
    case 'damageAll': enemies.filter(e=>e.alive).forEach(t=>doDamage(actor,t,skill,scene,stats)); break;
    case 'stun': {
      const r = resolveStun(actor, target, skill, scene);
      if(r.damage && stats && r.damage.dmg > 0){
        stats[actor.charId].dmg += r.damage.dmg;
        noteKill(r.damage.killed, actor, stats);
      }
      break;
    }
    case 'heal': {
      const h=skill.healAmt; target.hp=clamp(target.hp+h,0,target.maxHp);
      if(stats) stats[actor.charId].heals+=h; break;
    }
    case 'healSp':
      actor.sp=clamp(actor.sp+skill.spGain,0,actor.maxSp);
      if(skill.buffType) actor.buffs.push(makeSpBuff(skill)); break;
    case 'shield': actor.shield+=skill.shieldAmt; break;
    case 'taunt': actor.buffs.push({type:'taunt',dur:skill.dur}); break;
    case 'dodge': actor.dodging=true; break;
    case 'selfBuff': {
      const r = resolveSelfBuff(actor, target, skill, scene);
      if(r.damage && stats && r.damage.dmg > 0){
        stats[actor.charId].dmg += r.damage.dmg;
        noteKill(r.damage.killed, actor, stats);
      }
      break;
    }
    case 'cleanse': target.debuffs=[]; target.stunned=false; break;
    case 'buff': target.buffs.push(makeAllyBuff(skill)); break;
    case 'spSteal': {
      const stolen=Math.min(skill.stealAmt,target.sp);
      target.sp-=stolen; actor.sp=clamp(actor.sp+stolen,0,actor.maxSp);
      doDamage(actor,target,skill,scene,stats); break;
    }
    case 'debuff': target.debuffs.push(makeDebuff(skill)); break;
    case 'drain': {
      const dmg=doDamage(actor,target,skill,scene,stats);
      const drain=Math.floor(dmg*(skill.drainPct/100));
      actor.hp=clamp(actor.hp+drain,0,actor.maxHp);
      if(stats) stats[actor.charId].heals+=drain;
      if(skill.corrupt&&target.alive) applyCorrupt(target,skill.corrupt);
      break;
    }
    case 'plague':
      enemies.filter(e=>e.alive).forEach(t=>applyPlague(t, skill));
      break;
    case 'corruptBurst': {
      const { hits } = applyCorruptBurst(actor, enemies.filter(e=>e.alive), skill);
      hits.forEach(({dmg, died})=>{
        if(stats) stats[actor.charId].dmg += dmg;
        noteKill(died, actor, stats);
      });
      break;
    }
    case 'revive': actor.undying=skill.hpRestore; break;
  }
}

// 打满这么多回合还分不出胜负就按剩余总血量判定。
// 这类「超时局」的比例是个有用的健康指标：比例一高，说明双方都在互相
// 磨血磨不动，多半是治疗/护盾被高估了。
const MAX_ROUNDS = 60;

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
  // 每支队伍一份战术上下文（集火目标），队内共享、局间不复用
  const ctx = { 1: makeTeamContext(), 2: makeTeamContext() };

  for(let round=0; round<MAX_ROUNDS; round++){
    for(const u of order){
      if(!u.alive) continue;
      // 回合开始被动
      triggerPassive('onTurnStart', u, {allies:u.player===1?p1:p2});
      // 毒/狂暴
      u.debuffs.forEach(d=>{
        if(d.type==='poison'){ u.hp=clamp(u.hp-d.value,0,u.maxHp); if(u.hp<=0) handleDeath(u,null,null); }
      });
      const berserk=u.buffs.find(b=>b.type==='berserk');
      if(berserk){
        u.hp=clamp(u.hp-(berserk.selfDmg ?? BUFF_DEFAULTS.berserkSelfDmg),0,u.maxHp);
        if(u.hp<=0) handleDeath(u,null,null);
      }
      u.buffs=u.buffs.filter(b=>--b.dur>0);
      u.debuffs=u.debuffs.filter(d=>--d.dur>0);
      if(!u.alive) continue;
      if(u.stunned){ u.stunned=false; continue; }
      u.sp=clamp(u.sp+u.spRegen,0,u.maxSp);
      if(scene.buff==='spRegen') u.sp=clamp(u.sp+5,0,u.maxSp);

      const enemies=(u.player===1?p2:p1).filter(e=>e.alive);
      const allies=(u.player===1?p1:p2).filter(a=>a.alive);
      if(!enemies.length) break;

      const chosen=aiHard(u,enemies,allies,scene,ctx[u.player]);
      if(!chosen||!chosen.skill) continue;
      executeSkill(u,chosen.skill,chosen.target,scene,p1,p2,stats);
    }
    const p1alive=p1.some(u=>u.alive), p2alive=p2.some(u=>u.alive);
    if(!p1alive||!p2alive) return { winner: p1alive?1:2, stats, rounds: round+1, timeout: false };
  }
  // 超时：HP多的赢
  const p1hp=p1.reduce((s,u)=>s+u.hp,0), p2hp=p2.reduce((s,u)=>s+u.hp,0);
  return { winner: p1hp>=p2hp?1:2, stats, rounds: MAX_ROUNDS, timeout: true };
}

// Fisher-Yates 洗牌。不要用 sort(()=>Math.random()-0.5)：那个比较函数不满足
// 排序算法要求的传递性，V8 对小数组的插入排序会让元素明显倾向于留在原位，
// 实测 8 个角色的入选率会从 50% 偏到 41%~58%，直接扭曲平衡统计的采样。
export function shuffle(arr){
  const r = arr.slice();
  for(let i=r.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [r[i],r[j]] = [r[j],r[i]];
  }
  return r;
}

function randomPicks(){
  const shuffled = shuffle(CHARACTERS.map(c=>c.id));
  return [shuffled.slice(0,2), shuffled.slice(2,4)];
}

// 分批跑，每批500局，用setTimeout让UI不卡死。
// onDone(charStats, meta)：meta 里是整体健康指标（平均回合数、超时率），
// 老调用方只取 charStats 也不受影响。
export function runSimulation(totalRounds, onProgress, onDone){
  const charStats = {}; // charId -> {wins,games}
  CHARACTERS.forEach(c=>{ charStats[c.id]={wins:0,games:0,name:c.name}; });

  let done = 0, totalBattleRounds = 0, timeouts = 0;
  const BATCH = 500;

  function runBatch(){
    const end = Math.min(done+BATCH, totalRounds);
    for(; done<end; done++){
      const scene = SCENES[Math.floor(Math.random()*SCENES.length)];
      const [p1ids, p2ids] = randomPicks();
      const {winner, rounds, timeout} = simOneBattle(p1ids, p2ids, scene);
      totalBattleRounds += rounds;
      if(timeout) timeouts++;
      const winnerIds = winner===1?p1ids:p2ids;
      [...p1ids,...p2ids].forEach(id=>{ charStats[id].games++; });
      winnerIds.forEach(id=>{ charStats[id].wins++; });
    }
    onProgress(done, totalRounds);
    if(done < totalRounds) setTimeout(runBatch, 0);
    else onDone(charStats, {
      avgRounds: totalBattleRounds/totalRounds,
      timeoutPct: timeouts/totalRounds*100
    });
  }
  setTimeout(runBatch, 0);
}
