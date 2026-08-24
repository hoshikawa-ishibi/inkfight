// 战斗规则引擎：纯函数，无 DOM / Audio / setTimeout 依赖。
// battle.js（真人对战，负责渲染/动画/音效）和 sim.js（无头模拟，负责统计数据）
// 都从这里调用同一套规则，避免两边各自实现出现漂移。
import { CHARACTERS } from './data.js';
import { clamp } from './state.js';

export function createUnit(charId, player, slot){
  const b = CHARACTERS.find(c=>c.id===charId);
  return {
    id:`${player}-${slot}`, charId:b.id, name:b.name, player, color:b.color, weapon:b.weapon,
    maxHp:b.hp, hp:b.hp, maxSp:b.sp, sp:b.sp, atk:b.atk, def:b.def, crit:b.crit, dodge:b.dodge, spRegen:b.spRegen,
    skills:JSON.parse(JSON.stringify(b.skills)),
    passive:b.passive||null, passiveStacks:0,
    alive:true, shield:0, buffs:[], debuffs:[], stunned:false, dodging:false, undying:0,
    pose:'idle', blink:0
  };
}

export function getEffectiveAtk(u){
  let a = u.atk;
  u.buffs.forEach(b=>{
    if(b.type==='atkUp'||b.type==='atkUp1'||b.type==='berserk') a*=(1+b.value);
  });
  if(u.charId==='berserker') a*=(1+(1-u.hp/u.maxHp)*0.5);
  return a;
}

export function previewDmg(u, s, scene){
  if(!s.power) return null;
  let d = getEffectiveAtk(u)*s.power;
  if(scene && scene.buff==='damageUp') d*=1.15;
  return Math.floor(d);
}

export function applyTurnRegen(u, scene){
  u.sp = clamp(u.sp+u.spRegen, 0, u.maxSp);
  if(scene && scene.buff==='spRegen') u.sp = clamp(u.sp+5, 0, u.maxSp);
}

export function handleDeath(unit){
  if(unit.undying){
    unit.hp = unit.undying;
    unit.undying = 0;
    return { died:false, undying:true };
  }
  unit.alive = false;
  unit.pose = 'dead';
  return { died:true, undying:false };
}

// ── 被动技能 ──────────────────────────────────────────
// ctx 视 trigger 类型可能带 { target, attacker, dmg, allies }。
// 返回描述实际发生了什么的事件对象，或 null（条件不满足，什么都没发生）。
// 调用方（battle.js/sim.js）各自决定要不要呈现（日志/特效/统计）。
export function triggerPassive(trigger, unit, ctx={}){
  const p = unit.passive;
  if(!p || p.trigger !== trigger) return null;
  switch(p.effect){
    case 'spGain':
      unit.sp = clamp(unit.sp + p.value, 0, unit.maxSp);
      return { name:p.name, effect:'spGain', value:p.value };

    case 'overchargeBuff':
      if(unit.sp / unit.maxSp >= 0.8){
        unit.buffs.push({type:'atkUp', dur:1, value:0.2});
        return { name:p.name, effect:'overchargeBuff' };
      }
      return null;

    case 'allyHeal': {
      const allies = (ctx.allies||[]).filter(a => a.alive && a.hp/a.maxHp < 0.3);
      allies.forEach(a => { a.hp = clamp(a.hp + p.value, 0, a.maxHp); });
      return { name:p.name, effect:'allyHeal', value:p.value, targets:allies };
    }

    case 'critStack': {
      const stacks = unit.passiveStacks || 0;
      if(stacks < p.maxStacks){
        unit.passiveStacks = stacks + 1;
        unit.crit += p.value;
        return { name:p.name, effect:'critStack', value:p.value, stacks:unit.passiveStacks };
      }
      return null;
    }

    case 'reflect': {
      const attacker = ctx.attacker;
      if(attacker && attacker.alive && ctx.dmg > 0){
        const ref = Math.max(1, Math.floor(ctx.dmg * p.value));
        attacker.hp = clamp(attacker.hp - ref, 0, attacker.maxHp);
        const death = attacker.hp <= 0 ? handleDeath(attacker) : null;
        return { name:p.name, effect:'reflect', attacker, amount:ref, died:!!death?.died, undying:!!death?.undying };
      }
      return null;
    }

    case 'bloodRage': {
      if(unit.hp / unit.maxHp < 0.4){
        const stacks = unit.passiveStacks || 0;
        if(stacks < p.maxStacks){
          unit.passiveStacks = stacks + 1;
          unit.buffs.push({type:'atkUp', dur:99, value:p.value});
          return { name:p.name, effect:'bloodRage', value:p.value, stacks:unit.passiveStacks };
        }
      }
      return null;
    }

    case 'soulDrain': {
      const target = ctx.target;
      if(target && target.debuffs.some(d=>d.type==='poison'||d.type==='cursed')){
        unit.hp = clamp(unit.hp + p.value, 0, unit.maxHp);
        return { name:p.name, effect:'soulDrain', value:p.value };
      }
      return null;
    }

    case 'corruptBonus': {
      const target = ctx.target;
      if(!target) return null;
      const stacks = countCorrupt(target);
      if(stacks <= 0) return null;
      const bonus = stacks * 8;
      target.hp = clamp(target.hp - bonus, 0, target.maxHp);
      const death = target.hp <= 0 ? handleDeath(target) : null;
      return { name:p.name, effect:'corruptBonus', target, amount:bonus, stacks, killer:unit, died:!!death?.died, undying:!!death?.undying };
    }

    default:
      return null;
  }
}

// ── 回合开始：中毒/狂暴掉血 + buff/debuff 时长衰减 ──────────
export function processStartOfTurn(u, ctx={}){
  const passiveEvent = triggerPassive('onTurnStart', u, ctx);

  let poison = null;
  u.debuffs.forEach(d=>{
    if(d.type==='poison'){
      u.hp = clamp(u.hp - d.value, 0, u.maxHp);
      const death = u.hp <= 0 ? handleDeath(u) : null;
      poison = { dmg:d.value, died:!!death?.died, undying:!!death?.undying };
    }
  });

  let berserk = null;
  const berserkBuff = u.buffs.find(b=>b.type==='berserk');
  if(berserkBuff){
    const selfDmg = berserkBuff.selfDmg ?? BUFF_DEFAULTS.berserkSelfDmg;
    u.hp = clamp(u.hp - selfDmg, 0, u.maxHp);
    const death = u.hp <= 0 ? handleDeath(u) : null;
    berserk = { dmg:selfDmg, died:!!death?.died, undying:!!death?.undying };
  }

  u.buffs = u.buffs.filter(b=>--b.dur>0);
  u.debuffs = u.debuffs.filter(d=>--d.dur>0);

  return { passiveEvent, poison, berserk };
}

// ── 伤害结算 ──────────────────────────────────────────
export function calcDamage(actor, target, skill, scene){
  if(target.dodging || Math.random()*100 < target.dodge){
    target.dodging = false;
    return { dodged:true, dmg:0, isCrit:false, shieldAbsorbed:0, baseAtk:getEffectiveAtk(actor), killed:false, undying:false, passiveEvents:[] };
  }
  const baseAtk = getEffectiveAtk(actor);
  let dmg = baseAtk * (skill.power||1);
  let isCrit = false;
  const totalCrit = (skill.crit||0) + actor.crit;
  if(Math.random()*100 < totalCrit){ dmg *= 1.5; isCrit = true; }
  if(target.debuffs.some(d=>d.type==='cursed')) dmg *= 1.25;
  if(target.debuffs.some(d=>d.type==='defDown')) dmg *= 1.2;
  if(scene && scene.buff==='damageUp') dmg *= 1.15;
  const defReduce = target.def/(target.def+50);
  dmg *= (1-defReduce);
  actor.buffs = actor.buffs.filter(b=>b.type!=='atkUp1');
  dmg = Math.max(1, Math.floor(dmg));

  let shieldAbsorbed = 0;
  if(target.shield > 0){
    shieldAbsorbed = Math.min(target.shield, dmg);
    target.shield -= shieldAbsorbed;
    dmg -= shieldAbsorbed;
  }
  target.hp = clamp(target.hp - dmg, 0, target.maxHp);

  if(skill.dot) target.debuffs.push({type:'poison', dur:skill.dotDur, value:skill.dot});
  if(skill.debuff==='defDown') target.debuffs.push({type:'defDown', dur:skill.debuffDur, value:0.2});
  let selfHeal = 0;
  if(skill.selfHeal){
    selfHeal = skill.selfHeal;
    actor.hp = clamp(actor.hp + selfHeal, 0, actor.maxHp);
  }

  let killed = false, undying = false;
  if(target.hp <= 0){
    const death = handleDeath(target);
    killed = death.died; undying = death.undying;
  }

  const passiveEvents = [];
  if(dmg > 0){
    const e1 = triggerPassive('onDamageDealt', actor, {target});
    if(e1) passiveEvents.push({unit:actor, event:e1});
    const e2 = triggerPassive('onTakeDamage', target, {attacker:actor, dmg});
    if(e2) passiveEvents.push({unit:target, event:e2});
    if(isCrit){
      const e3 = triggerPassive('onCrit', actor, {target});
      if(e3) passiveEvents.push({unit:actor, event:e3});
    }
  }

  return { dodged:false, dmg, isCrit, shieldAbsorbed, baseAtk, dotApplied:!!skill.dot, defDownApplied:skill.debuff==='defDown', selfHeal, killed, undying, passiveEvents };
}

export function calcStun(actor, target, skill){
  const prob = skill.basePct + skill.spScale*(target.sp/target.maxSp);
  const success = Math.random()*100 < prob;
  if(success) target.stunned = true;
  return { prob, success };
}

// 眩晕技能：带 power 的先结算伤害，再判定眩晕。
// 闪避或直接打死的情况下不再判眩晕。
export function resolveStun(actor, target, skill, scene){
  const damage = skill.power ? calcDamage(actor, target, skill, scene) : null;
  if(damage && (damage.dodged || damage.killed || !target.alive)){
    return { damage, prob:0, success:false, skipped:true };
  }
  const { prob, success } = calcStun(actor, target, skill);
  return { damage, prob, success, skipped:false };
}

// ── buff/debuff 构造 ────────────────────────────────────
// 强度以前硬编码在 sim.js 和 battle.js 各一份（共三处），
// 想调狂暴的加成得同时改代码三个地方。集中到这里，并允许
// data.js 用 buffValue / selfDmg 覆盖，数值调整不必再动代码。
export const BUFF_DEFAULTS = { selfBuff:0.4, allyBuff:0.3, spBuff:0.2, debuff:0.25, berserkSelfDmg:8 };

// 这个技能是否需要一个敌方目标。
// 判断以前分散在 ai.js / battle.js / sim.js 三处，给「狂暴」加 power 时
// 只改了两处，导致 AI 放狂暴不造成伤害、玩家放却会——同一技能两种行为。
// 收敛到这里，三方共用，并由测试锁住。
export function needsEnemyTarget(skill){
  if(['damage','stun','spSteal','debuff','drain'].includes(skill.type)) return true;
  if(skill.type === 'selfBuff' && skill.power) return true;   // 边打边上 buff
  return false;
}

// AoE / 自身类技能：由执行逻辑自行遍历敌人，不需要单体目标
export const AOE_TYPES = ['damageAll','plague','corruptBurst'];

// 自我增益技能：带 power 的会先打出一次伤害再上 buff。
// 纯 buff 技能要占掉一整个回合，在这个节奏下几乎永远不划算
// （狂战士「狂暴」实测：增伤刚好被少打的那一回合抵消，还倒亏血）。
export function resolveSelfBuff(actor, target, skill, scene){
  const damage = (skill.power && target) ? calcDamage(actor, target, skill, scene) : null;
  actor.buffs.push(makeSelfBuff(skill));
  return { damage };
}

export function makeSelfBuff(skill){
  const b = { type:skill.buffType, dur:skill.dur, value:skill.buffValue ?? BUFF_DEFAULTS.selfBuff };
  if(skill.buffType === 'berserk') b.selfDmg = skill.selfDmg ?? BUFF_DEFAULTS.berserkSelfDmg;
  return b;
}
export function makeAllyBuff(skill){
  return { type:skill.buffType, dur:skill.dur, value:skill.buffValue ?? BUFF_DEFAULTS.allyBuff };
}
export function makeSpBuff(skill){
  return { type:skill.buffType, dur:skill.dur, value:skill.buffValue ?? BUFF_DEFAULTS.spBuff };
}
export function makeDebuff(skill){
  return { type:skill.debuffType, dur:skill.dur, value:skill.debuffValue ?? BUFF_DEFAULTS.debuff };
}

// 腐化层上限。腐化层 dur:99 实际上永不过期（战斗上限 60 回合），
// 而「腐化侵蚀」被动每次攻击都吃 层数×8，没有上限就是无限滚雪球：
// 术士的免费技能在 10 层时能打出 94 伤害，超过别人 35SP 的大招。
export const MAX_CORRUPT_STACKS = 5;

export function countCorrupt(target){
  return target.debuffs.filter(d=>d.type==='corrupt').reduce((s,d)=>s+d.value,0);
}

export function applyCorrupt(target, stacks){
  const current = countCorrupt(target);
  const added = Math.min(stacks, Math.max(0, MAX_CORRUPT_STACKS - current));
  if(added > 0) target.debuffs.push({type:'corrupt', dur:99, value:added});
  return current + added;
}

export function applyPlague(target, skill){
  const total = applyCorrupt(target, skill.corrupt);
  target.debuffs.push({type:'poison', dur:skill.dotDur, value:skill.dot});
  return total;
}

export function applyCorruptBurst(actor, enemies, skill){
  const hits = [];
  let totalDmg = 0;
  enemies.forEach(t=>{
    const stacks = countCorrupt(t);
    if(stacks <= 0) return;
    const dmg = stacks * skill.dmgPerStack;
    t.debuffs = t.debuffs.filter(d=>d.type!=='corrupt');
    t.hp = clamp(t.hp - dmg, 0, t.maxHp);
    totalDmg += dmg;
    let died = false, undying = false;
    if(t.hp <= 0){
      const death = handleDeath(t);
      died = death.died; undying = death.undying;
    }
    hits.push({ target:t, dmg, stacks, died, undying });
  });
  return { hits, totalDmg };
}
