// 纯逻辑战斗模拟器，无渲染无延迟。
// 战斗规则（伤害公式/被动/腐化等）全部来自 combat.js，
// 与 battle.js 共用同一份实现，避免两边数值再次漂移出 bug。
import { CHARACTERS, SCENES } from './data.js';
import { clamp } from './state.js';
import {
  createUnit as makeUnit, triggerPassive, calcDamage, getEffectiveAtk, countCorrupt,
  applyCorrupt, applyPlague, applyCorruptBurst, handleDeath as resolveDeath,
  resolveStun, resolveSelfBuff, makeAllyBuff, makeSpBuff, makeDebuff, BUFF_DEFAULTS,
  needsEnemyTarget
} from './combat.js';

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

// 技能评分：把每种技能的收益统一折算成「等效伤害」，好让 17 种技能类型
// 能够横向比较。旧版本只给 damage/heal/stun/drain 四种打分，其余 13 种
// 只拿 cost×0.5，结果是术士的瘟疫、守卫的铁壁嘲讽等技能在几千局里
// 一次都没被使用过，统计出来的胜率并不反映角色真实强度。
//
// 条件性技能（净化 / 腐化爆发 / 治疗）在条件不满足时必须给接近 0 的分，
// 否则 AI 会白白浪费一个回合。
const KILL_BONUS = 60;      // 能补掉一个目标的额外价值
const SP_STARVED = 0.35;    // SP 低于这个比例才认为「缺蓝」

function scoreSkill(u, s, foes, friends, scene){
  const atk = getEffectiveAtk(u);
  const sceneMul = scene.buff === 'damageUp' ? 1.15 : 1;
  // 粗估：无视防御的伤害（中毒等）按原值算，普通伤害按目标平均减伤折算
  const avgDefMul = 1 - (foes.reduce((n,f)=>n+f.def,0)/foes.length) / ((foes.reduce((n,f)=>n+f.def,0)/foes.length) + 50);
  const dmgOf = p => atk * (p||1) * sceneMul * avgDefMul;

  const weakestFoe = foes.reduce((a,b)=> a.hp <= b.hp ? a : b);
  const hurt = friends.filter(f => f.hp < f.maxHp);
  const neediest = hurt.length ? hurt.reduce((a,b)=> a.hp/a.maxHp <= b.hp/b.maxHp ? a : b) : null;
  const hpFrac = u.hp / u.maxHp;

  // 辅助技能要占掉一整个回合，这回合本可以打出的最高伤害就是它的机会成本。
  // 不减掉它，buff / 护盾 / 嘲讽一类技能的分数全是虚高的——实测狂战士因此
  // 频繁开「狂暴」，而开一次刚好把增伤赚回来又倒亏血，胜率反而下滑。
  const dmgOptions = u.skills.filter(k => k.power && u.sp >= k.cost);
  const tempo = dmgOptions.length
    ? Math.max(...dmgOptions.map(k => atk * k.power * sceneMul * avgDefMul)) : 0;

  switch(s.type){
    case 'damage': {
      const d = dmgOf(s.power);
      return d + (d >= weakestFoe.hp ? KILL_BONUS : 0);
    }

    case 'damageAll':
      // 打到每个存活敌人，但单体收益略低于同威力的单体技能
      return dmgOf(s.power) * foes.length * 0.9;

    case 'drain': {
      const d = dmgOf(s.power);
      const healed = Math.min(d * (s.drainPct/100), u.maxHp - u.hp);
      return d + healed * 0.8 + (d >= weakestFoe.hp ? KILL_BONUS : 0);
    }

    case 'spSteal': {
      const d = dmgOf(s.power);
      const avgFoeSp = foes.reduce((n,f)=>n+f.sp,0)/foes.length;
      return d + Math.min(s.stealAmt, avgFoeSp) * 0.4;
    }

    case 'stun': {
      // 挑最容易晕到的目标（SP 越满命中率越高），收益 = 对方少打的那一回合，
      // 要按它能放出来的最强技能估，而不是裸 atk。
      const cand = foes.reduce((a,b)=>
        (s.basePct + s.spScale*(a.sp/a.maxSp)) >= (s.basePct + s.spScale*(b.sp/b.maxSp)) ? a : b);
      const p = Math.min(1, (s.basePct + s.spScale * (cand.sp/cand.maxSp)) / 100);
      const foeBest = Math.max(1, ...cand.skills.filter(k=>k.power).map(k=>k.power));
      // 带 power 的眩晕技能自带一次伤害，要算进收益
      return dmgOf(s.power || 0) + p * getEffectiveAtk(cand) * foeBest;
    }

    case 'plague': {
      // 中毒无视防御，且是 AoE：预期总伤害 = dot × 持续回合 × 敌人数
      const poison = (s.dot||0) * (s.dotDur||0) * foes.length;
      // 腐化层本身对带 corruptBonus 被动的角色才有额外价值
      const corruptWorth = u.passive?.effect === 'corruptBonus'
        ? (s.corrupt||0) * foes.length * 8 : 0;
      return poison + corruptWorth;
    }

    case 'corruptBurst': {
      // 没有腐化层时是纯浪费回合
      const stacks = foes.reduce((n,f)=> n + countCorrupt(f), 0);
      return stacks * (s.dmgPerStack||0);
    }

    case 'heal': {
      if(!neediest) return 0;                       // 满血就别治
      const effective = Math.min(s.healAmt, neediest.maxHp - neediest.hp);
      // 队友越危险，治疗越值钱
      const urgency = neediest.hp/neediest.maxHp < 0.35 ? 1.8 : 1.0;
      return effective * urgency - tempo * 0.6;
    }

    case 'cleanse': {
      // 没有负面状态可清就毫无价值
      const bad = friends.reduce((n,f)=> n + f.debuffs.length + (f.stunned?1:0), 0);
      return bad * 22 - tempo;
    }

    case 'buff': {
      // 给还活着的队友加攻：预期多打出来的伤害
      const target = friends.filter(f=>f!==u).concat(friends)[0] || u;
      const buffVal = s.buffValue ?? BUFF_DEFAULTS.allyBuff;
      return getEffectiveAtk(target) * buffVal * (s.dur||1) * 0.9 - tempo;
    }

    case 'selfBuff': {
      // 增伤是乘在技能倍率上的，不能只按裸 atk 算，否则算出来永远是负分。
      // 强度和自损都要读技能实际配置，不能写死默认值——否则改了 data.js 也不生效。
      const myBest = Math.max(1, ...u.skills.filter(k=>k.power).map(k=>k.power));
      const buffVal = s.buffValue ?? BUFF_DEFAULTS.selfBuff;
      const gain = atk * myBest * buffVal * (s.dur||1) * avgDefMul;
      const perTurn = s.buffType === 'berserk' ? (s.selfDmg ?? BUFF_DEFAULTS.berserkSelfDmg) : 0;
      const cost = perTurn * (s.dur||1) * (hpFrac < 0.4 ? 3 : 1);
      // 带 power 的边打边上 buff，不算浪费回合
      const immediate = s.power ? dmgOf(s.power) : 0;
      return immediate + gain - cost - (s.power ? 0 : tempo);
    }

    case 'shield': {
      // 护盾等价于同量治疗，但能提前吃伤害；已有盾时收益递减
      const worth = (s.shieldAmt||0) * (u.shield > 0 ? 0.4 : 0.85);
      return worth * (hpFrac < 0.5 ? 1.3 : 1.0) - tempo;
    }

    case 'taunt': {
      // 把火力吸到自己身上：自己越硬、队友越危险，越值
      const ally = friends.find(f => f !== u);
      const allyRisk = ally && ally.hp/ally.maxHp < 0.4 ? 45 : 12;
      return allyRisk * (hpFrac > 0.5 ? 1.2 : 0.5) - tempo;
    }

    case 'dodge':
      // 免疫下一次攻击，残血时价值陡增
      return foes.reduce((n,f)=>n+getEffectiveAtk(f),0)/foes.length * (hpFrac < 0.4 ? 1.4 : 0.7) - tempo;

    case 'revive':
      // 不屈：血越少越该开
      return (hpFrac < 0.35 ? (s.hpRestore||0) * 1.5 : (s.hpRestore||0) * 0.25) - tempo;

    case 'healSp': {
      // 回蓝的价值取决于它能解锁什么；不缺蓝时基本没用
      const locked = u.skills.filter(k => k.cost > u.sp && k.cost <= u.sp + (s.spGain||0));
      const unlockWorth = locked.length ? Math.max(...locked.map(k => atk * (k.power||1.2))) * 0.5 : 0;
      const starved = u.sp / u.maxSp < SP_STARVED ? 1.5 : 0.6;
      // 自损换蓝在残血时是自杀（剑士「剑气」-18HP）：惩罚必须随血量放大，
      // 否则 AI 会把自己耗死。
      const hpRisk = (s.hpCost||0) * (hpFrac < 0.35 ? 6 : hpFrac < 0.6 ? 1.8 : 0.6);
      return (unlockWorth + (s.spGain||0) * 0.35) * starved - hpRisk - tempo * 0.5;
    }

    case 'debuff':
      // 诅咒：让后续伤害按 debuffValue 提升，折算成接下来几回合的额外输出
      return atk * (s.debuffValue ?? BUFF_DEFAULTS.debuff) * (s.dur||1);

    default:
      return s.cost * 0.5;
  }
}

function pickSkill(u, enemies, allies, scene){
  const foes = enemies.filter(e=>e.alive);
  const friends = allies.filter(a=>a.alive);
  if(!foes.length) return null;

  let best = null, bestScore = 0;   // 0 分及以下的技能不如不放
  for(const s of u.skills){
    if(u.sp < s.cost) continue;
    if(s.hpCost && u.hp <= s.hpCost) continue;
    const score = scoreSkill(u, s, foes, friends, scene);
    if(score > bestScore){ bestScore = score; best = s; }
  }
  // 全部技能都不划算时，退而求其次用最便宜的能用技能，别空过回合
  if(!best){
    const usable = u.skills.filter(s => u.sp >= s.cost && !(s.hpCost && u.hp <= s.hpCost));
    best = usable.sort((a,b)=>a.cost-b.cost)[0] || null;
  }
  return best;
}

function pickTarget(actor, skill, enemies, allies){
  const foes = enemies.filter(e=>e.alive);
  const friends = allies.filter(a=>a.alive);
  const needsEnemy = needsEnemyTarget(skill);

  if(needsEnemy){
    const taunter = foes.find(e=>e.buffs.some(b=>b.type==='taunt'));
    if(taunter) return taunter;
    return foes.slice().sort((a,b)=>a.hp-b.hp)[0] || null;   // 集火残血
  }

  switch(skill.type){
    case 'heal':
      // 治疗按缺失血量最多的选，而不是绝对血量最低的
      return friends.slice().sort((a,b)=>
        (b.maxHp-b.hp) - (a.maxHp-a.hp))[0] || null;
    case 'cleanse': {
      // 只对真正带负面状态的队友净化，否则这一回合就白费了
      const afflicted = friends.filter(f => f.debuffs.length > 0 || f.stunned);
      return afflicted.sort((a,b)=>
        (b.debuffs.length + (b.stunned?1:0)) - (a.debuffs.length + (a.stunned?1:0)))[0] || null;
    }
    case 'buff':
      // 加攻给输出最高的队友收益最大
      return friends.slice().sort((a,b)=>
        getEffectiveAtk(b) - getEffectiveAtk(a))[0] || null;
    default:
      return null;   // damageAll / plague / corruptBurst 是 AoE，自身增益类无需目标
  }
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
