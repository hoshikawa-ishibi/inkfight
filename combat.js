// 战斗规则引擎：纯函数，无 DOM / Audio / setTimeout 依赖。
// battle.js（真人对战，负责渲染/动画/音效）和 sim.js（无头模拟，负责统计数据）
// 都从这里调用同一套规则，避免两边各自实现出现漂移。
import { CHARACTERS } from './data.js';
import { clamp } from './state.js';

// override（可选）用来做「同一个角色、不同身份」：战役里敌人有剧情名，
// 最终关的墨皇更是直接改属性和被动，而**不新增一份角色数据**。
// 可覆盖 name / color / hp / sp / atk / def / crit / dodge / spRegen / passive；
// 传 `{id, name}` 这种只带名字的对象也行（id 字段会被忽略，单位 id 另算）。
// 缺省 undefined 时走原路径，其它模式的行为一点不变。
export function createUnit(charId, player, slot, override){
  const b = CHARACTERS.find(c=>c.id===charId);
  const o = override || {};
  const hp = o.hp ?? b.hp;
  const sp = o.sp ?? b.sp;
  return {
    id:`${player}-${slot}`, charId:b.id, name:o.name ?? b.name, player,
    color:o.color ?? b.color, weapon:b.weapon,
    maxHp:hp, hp, maxSp:sp, sp,
    atk:o.atk ?? b.atk, def:o.def ?? b.def, crit:o.crit ?? b.crit, dodge:o.dodge ?? b.dodge,
    spRegen:o.spRegen ?? b.spRegen,
    skills:JSON.parse(JSON.stringify(b.skills)),
    passive:(o.passive !== undefined ? o.passive : (b.passive||null)), passiveStacks:0,
    // BOSS 阶段表（可选，来自 campaign.js 的关卡 override）。见 bossPhase()
    bossPhases:o.bossPhases || null,
    alive:true, shield:0, buffs:[], debuffs:[], stunned:false, dodging:false, undying:0,
    // 打断免疫的剩余回合数（见 calcStun）。在 processStartOfTurn 里递减。
    interruptImmune:0,
    // 暴击蓄能条（见 calcDamage）。攒满 100 必暴击，玩家看得见。
    critMeter:0,
    // 技能冷却：技能名 → 剩余回合数（见 canUseSkill / payCosts）
    cooldowns:{},
    pose:'idle', blink:0
  };
}

// 关卡敌人条目 → [角色id, override]。字符串和 {id,name,...} 对象都吃，
// battle.js 和 sim.js 共用，免得两边各写一份解析（这个项目已经因此出过三次 bug）。
export function unitSpec(entry){
  return typeof entry === 'string' ? [entry, null] : [entry.id, entry];
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
  // 暴击现在是确定的（蓄能条），所以预览也该是确定的——
  // 攒满了就把 1.5 倍算进去。玩家正是靠这个数字决定「大招留不留到下一刀」。
  if(willCrit(u, s)) d*=1.5;
  return Math.floor(d);
}

export function applyTurnRegen(u, scene){
  u.sp = clamp(u.sp+u.spRegen, 0, u.maxSp);
  if(scene && scene.buff==='spRegen') u.sp = clamp(u.sp+5, 0, u.maxSp);
}

// 轮空回蓝：**回蓝给这回合没出手的队友**，而不是出手的那个。
// （COMBAT_PLAN.md 任务 5）
//
// 严格轮流时两者完全等价——每个单位都是隔一回合回一次，总量不变。
// 它唯一惩罚的是「一直派同一个人上」：被反复派出去的那个会渐渐没蓝，
// 逼你换人。于是「这回合派谁」从一个空选择变成了真正的资源决策。
//
// 实测（1200 局/格）：自由挑但按老规矩回蓝 → 连续派同一个单位占 78%，
// 退化成「一直派最强的那个」；换成轮空回蓝之后降到 47%，
// 同时策略价值 49.7 → 57.8、「完美 vs 一般」的落差 10.3 → 11.6。
//
// 只剩一个人时没得换，照常回气——否则单人 BOSS 永远没蓝。
export function applyRestRegen(team, actor, scene){
  const resting = team.filter(x => x.alive && x !== actor);
  if(resting.length) resting.forEach(x => applyTurnRegen(x, scene));
  else if(actor) applyTurnRegen(actor, scene);
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

    case 'corruptBonus': {
      const target = ctx.target;
      if(!target) return null;
      const stacks = countCorrupt(target);
      if(stacks <= 0) return null;
      const bonus = stacks * (p.value ?? CORRUPT_BONUS_PER_STACK);
      target.hp = clamp(target.hp - bonus, 0, target.maxHp);
      const death = target.hp <= 0 ? handleDeath(target) : null;
      return { name:p.name, effect:'corruptBonus', target, amount:bonus, stacks, killer:unit, died:!!death?.died, undying:!!death?.undying };
    }

    default:
      return null;
  }
}

// 状态衰减：buff / debuff 时长、打断免疫、技能冷却。
//
// **这一份要对本方所有存活单位跑，不只是出手的那个。**
// 任务 5 把出手顺序改成玩家自己挑之后，轮空的单位不再每隔一回合就走一次
// processStartOfTurn——于是它身上的中毒不掉血、buff 不过期、冷却不递减。
// 后果不只是「可以把中毒的人雪藏起来」这种小便宜：墨皇阶段三每回合封一个
// 技能，而封印是靠冷却递减解开的，轮空的人**永远解不开**，最后无技可用，
// AI 的 decide() 返回 null，那个单位整局一动不动。实测胜率恒为 0%。
export function tickEffects(u){
  if(!u.alive) return;
  u.buffs = u.buffs.filter(b=>--b.dur>0);
  u.debuffs = u.debuffs.filter(d=>--d.dur>0);
  if(u.interruptImmune > 0) u.interruptImmune--;
  if(u.cooldowns) for(const k in u.cooldowns) if(u.cooldowns[k] > 0) u.cooldowns[k]--;
}

// 轮空单位的回合开始处理：**只衰减状态，不触发 onTurnStart 被动**。
// 被动（弓手攒暴击、法师充能、牧师群奶）是「行动」的一部分，
// 让板凳上的人白拿会直接把这些角色抬价。
export function processBenchedTurn(team, actor){
  team.forEach(u => { if(u !== actor) tickEffects(u); });
}

// ── 墨蚀：拖太久就一起被墨吞掉 ────────────────────────────
//
// 允许两边选同样的角色之后出现了续航僵局：实测按「场上牧师/守卫的总数」分组，
//   0 个 → 12.8 回合、0% 超时
//   2 个 → 47.2 回合、21% 超时
//   4 个 → 105 回合、**69% 超时**
// 也就是八局里有一局完全磨不动、最后按剩余血量判定，非常反高潮。
//
// 解法不是砍治疗（那会伤到正常对局），而是给僵局一个**兜底的收束**：
// 从第 `INK_EROSION_FROM` 回合起，每个单位在自己回合开始时损失一点 HP，
// 而且越拖越多。它对双方完全对称，正常长度的对局根本碰不到它。
// 无视防御、无视护盾——这是「时间到了」，不是一次攻击。
export const INK_EROSION_FROM = 18;   // 从第几回合开始
export const INK_EROSION_STEP = 3;    // 每多一回合加多少

export function inkErosion(round){
  if(!round || round < INK_EROSION_FROM) return 0;
  return (round - INK_EROSION_FROM + 1) * INK_EROSION_STEP;
}

// ── 回合开始：中毒/狂暴掉血 + buff/debuff 时长衰减 ──────────
export function processStartOfTurn(u, ctx={}){
  const passiveEvent = triggerPassive('onTurnStart', u, ctx);

  // ── BOSS 阶段（见 bossPhase） ─────────────────────────
  // 阶段切换要**说出来**：BOSS 战的规则中途变了，玩家不知道就只会觉得
  // 「怎么突然打不过了」。这条日志是这场仗从「属性怪」变成「一道题」的关键。
  let phaseEvent = null, sealed = null;
  const phase = bossPhase(u, u.bossPhases);
  if(phase){
    if(u.lastPhase !== phase.name){
      u.lastPhase = phase.name;
      phaseEvent = { name:phase.name, desc:phase.desc || '', actions:phase.actions || 1 };
    }
    // 阶段三「重写」：抹掉对面一个技能。挑威胁最大的那个人下手。
    if(phase.sealSkill && ctx.foes){
      const alive = ctx.foes.filter(f => f.alive);
      if(alive.length){
        const victim = alive.reduce((a,b)=> getEffectiveAtk(b) > getEffectiveAtk(a) ? b : a);
        const name = sealSkill(victim, phase.sealSkill);
        if(name) sealed = { victim, skill:name, turns:phase.sealSkill };
      }
    }
  }

  let poison = null;
  u.debuffs.forEach(d=>{
    if(d.type==='poison'){
      u.hp = clamp(u.hp - d.value, 0, u.maxHp);
      const death = u.hp <= 0 ? handleDeath(u) : null;
      poison = { dmg:d.value, died:!!death?.died, undying:!!death?.undying };
    }
  });

  // 墨蚀：拖太久，双方一起被吞。无视防御和护盾。
  let erosion = null;
  const ero = inkErosion(ctx.round);
  if(ero > 0){
    u.hp = clamp(u.hp - ero, 0, u.maxHp);
    const death = u.hp <= 0 ? handleDeath(u) : null;
    erosion = { dmg:ero, died:!!death?.died, undying:!!death?.undying };
  }

  let berserk = null;
  const berserkBuff = u.buffs.find(b=>b.type==='berserk');
  if(berserkBuff){
    const selfDmg = berserkBuff.selfDmg ?? BUFF_DEFAULTS.berserkSelfDmg;
    u.hp = clamp(u.hp - selfDmg, 0, u.maxHp);
    const death = u.hp <= 0 ? handleDeath(u) : null;
    berserk = { dmg:selfDmg, died:!!death?.died, undying:!!death?.undying };
  }

  tickEffects(u);

  return { passiveEvent, poison, berserk, erosion, phaseEvent, sealed };
}

// ── 伤害结算 ──────────────────────────────────────────
// ── 暴击：蓄能条，不掷骰 ────────────────────────────────
// （COMBAT_PLAN.md 任务 2b。原计划是「满足条件必暴击」，改成蓄能条是因为
// 那个方案会废掉弓手「鹰眼」被动、也动到角色身份——而身份是红线。）
//
// 每次攻击把 `暴击率` 点数攒进 `critMeter`，攒满 100 就必定暴击并清 100。
// **期望伤害和原来的概率模型完全一致**（每 100/暴击率 次攻击暴一次），
// 但波动为零，而且**玩家看得见条子**——于是产生一个新决策：
// 「留着大招砸在必暴的那一下」。这是把随机变成计划的典型手法。
export const CRIT_METER_FULL = 100;

export function critRateOf(actor, skill){
  return (skill.crit || 0) + (actor.crit || 0);
}

// 这一击会不会暴击？UI 的伤害预览、敌方意图预估、AI 评分都要问它，
// 三处必须和 calcDamage 判断一致，所以收敛成一个函数。
export function willCrit(actor, skill){
  return (actor.critMeter || 0) + critRateOf(actor, skill) >= CRIT_METER_FULL;
}

export function calcDamage(actor, target, skill, scene){
  // 主动闪避（刺客「消失」）：说好了免疫下一次攻击就一定免疫，本来就是确定的。
  // **被动闪避率那一掷已经删掉**——见下面的减伤项。
  if(target.dodging){
    target.dodging = false;
    return { dodged:true, dmg:0, isCrit:false, shieldAbsorbed:0, baseAtk:getEffectiveAtk(actor), killed:false, undying:false, passiveEvents:[] };
  }
  const baseAtk = getEffectiveAtk(actor);
  let dmg = baseAtk * (skill.power||1);
  let isCrit = false;
  actor.critMeter = (actor.critMeter || 0) + critRateOf(actor, skill);
  if(actor.critMeter >= CRIT_METER_FULL){
    actor.critMeter -= CRIT_METER_FULL;
    dmg *= 1.5; isCrit = true;
  }
  if(target.debuffs.some(d=>d.type==='defDown')) dmg *= 1.2;
  if(scene && scene.buff==='damageUp') dmg *= 1.15;
  const defReduce = target.def/(target.def+50);
  dmg *= (1-defReduce);
  // 被动闪避（原来是「dodge% 概率完全免疫」）改成**确定性减伤**。
  // 期望伤害一模一样，但不再有「这一下闪没闪掉」的骰子。
  // 5~10% 的闪避率本来也构不成任何决策，只贡献噪声。
  if(target.dodge) dmg *= (1 - target.dodge/100);
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

// ── 打断（原「眩晕」） ──────────────────────────────────
// **确定性，不掷骰。**（COMBAT_PLAN.md 任务 2a）
//
// 旧设计是概率命中（`basePct + spScale × SP占比`）。实测那一个骰子值
// **29.6 个百分点**的胜率，而玩家的全部技术只值 12.6 点——骰子的话语权
// 是玩家技术的 2.3 倍。用户的原话「输赢纯看负面有没有上」说的就是它。
//
// 现在改成看得见的确定条件：**目标 SP ≥ 阈值就一定打断，否则一定不打断**。
// 保留了原设计的意图（越蓄力越容易被打断），但把「赌」换成了「算」——
// SP 条双方都一直看得见。
//
// 附带产生一个新的策略维度：**坐在满蓝上会被打断**，所以「攒够就放」
// 不再是无脑最优解。这一条正面削弱了任务 3 要打的「有蓝放大招」。
export const DEFAULT_INTERRUPT_SP = 0.5;

export function interruptNeed(target, skill){
  return Math.ceil((skill.spThreshold ?? DEFAULT_INTERRUPT_SP) * target.maxSp);
}

// 免疫期（`interruptImmune`）防连锁：没有它，两个打断角色可以把对方锁死。
// 计数在 processStartOfTurn 里递减，所以设 2 意味着「最多隔一次打断一回」。
export function canInterrupt(target, skill){
  return !target.interruptImmune && target.sp >= interruptNeed(target, skill);
}

export const INTERRUPT_IMMUNE_TURNS = 2;

export function calcStun(actor, target, skill){
  const need = interruptNeed(target, skill);
  if(target.interruptImmune) return { success:false, reason:'immune', need };
  if(target.sp < need)       return { success:false, reason:'lowSp', need };
  target.stunned = true;
  target.interruptImmune = INTERRUPT_IMMUNE_TURNS;
  return { success:true, reason:'ok', need };
}

// 打断技能：带 power 的先结算伤害，再判定打断。
// 闪避或直接打死的情况下不再判打断。
export function resolveStun(actor, target, skill, scene){
  const damage = skill.power ? calcDamage(actor, target, skill, scene) : null;
  if(damage && (damage.dodged || damage.killed || !target.alive)){
    return { damage, success:false, reason:'dead', need:0, skipped:true };
  }
  const r = calcStun(actor, target, skill);
  return { damage, ...r, skipped:false };
}

// ── buff/debuff 构造 ────────────────────────────────────
// 强度以前硬编码在 sim.js 和 battle.js 各一份（共三处），
// 想调狂暴的加成得同时改代码三个地方。集中到这里，并允许
// data.js 用 buffValue / selfDmg 覆盖，数值调整不必再动代码。
export const BUFF_DEFAULTS = { selfBuff:0.4, allyBuff:0.3, spBuff:0.2, berserkSelfDmg:8 };

// ── 难度档位给 AI 单位的属性加成 ─────────────────────────
// **这是「叠在 AI 决策水平之上的第二层难度」**，两层要一起看。
// 合并两套 AI 之后困难的决策水平本身涨了一大截（会集火、不浪费回合），
// 原来的攻 +15% 于是变成双重加成：实测玩家胜率只有 42.4%，
// 而先手对镜的公平线是 59.9%，等于倒欠 17.5 个百分点。
// 攻击加成是压垮玩家的那一半（单独就值 -13.8），回蓝几乎无害（-2.3），
// 所以两项一起减半，落在 52.6%。
//
// 调这里的数之前先跑 `node difficulty-check.mjs`——它和 battle.js 读的是
// 这同一份表，不会出现「改了一处、量的却是另一套数」。
// 倍率含义与 applyStageMod 完全相同（下面那张战役表），两边共用同一个变换：
// atk / def / spRegen / hp 是乘在原属性上的倍率，sp 是**起手蓝量占蓝条的比例**。
// 以前这里是三个手写函数，各自重复了一遍取整逻辑；改成数据之后
// 调难度不必再动代码，也不会出现「两处取整方式不一样」这种漂移。
// 2026-08-25 重新校准（见 DIFFICULTY_PLAN.md 任务 4）。以「一般玩家」为准：
// 简单 85% / 普通 64% / 困难 49% / 墨皇 40%。
// **困难是 null——它不拿任何属性优势，纯靠 AI 决策水平**。
// 以前那份 atk 1.07 是给合并 AI 之前那个笨 AI 配的，叠在现在的 AI 上就过头了。
// 2026-08-26 战斗深度重做后重校（COMBAT_PLAN.md 任务 0）。
// 玩家这一侧多了两样东西：**看得见敌人的下一击**（承诺制）和
// **每回合自己挑派谁上**。实测四档全线偏易 7~14 个百分点，所以整体上调。
//
// **困难不再是 null。** 原来那条「困难不拿任何属性优势，纯靠 AI 决策水平」
// 的原则在承诺制之后站不住了：AI 现在被自己的承诺锁住，玩家可以针对预告
// 布防、抢杀、打断——这是一个**结构性**的劣势，不是决策水平能补的。
// 用属性把这份劣势补回来是诚实的做法，藏起意图才是走回头路。
export const DIFFICULTY_MODS = {
  easy:      { atk: 0.99 },
  normal:    { atk: 0.94 },
  hard:      { atk: 1.07 },
  nightmare: { atk: 1.08, spRegen: 1.1 },
};

export function applyDifficulty(unit, level){
  return applyStageMod(unit, DIFFICULTY_MODS[level]);
}

// ── 战役关卡的属性微调旋钮 ─────────────────────────────────
// 和 DIFFICULTY_MODS 的关键区别：那边是**函数**（三档写死在代码里），
// 这边是**数据**（每关一份 enemyMod，写在 campaign.js）。
// 理由：8 关的难度曲线要靠反复微调逼近目标，数值散进代码里就调不动了；
// 而且 campaign-check.mjs 必须和游戏读同一份数值，否则又是
// 「调了一处、量的却是另一套数」——这个项目已经因此出过三次 bug。
//
// 倍率含义：atk / def / hp / spRegen 是乘在原属性上的倍率；
// sp 特殊，是**起手蓝量占蓝条的比例**（0~1），和 DIFFICULTY_MODS.easy 同一个路子。
//
// 注意：战役模式**不**走 applyDifficulty，stage.difficulty 只决定 AI 决策档位。
// 两套加成叠在一起会让 enemyMod 调出来的曲线整体跳变。
export function applyStageMod(unit, mod){
  if(!mod) return unit;
  if(mod.atk     != null) unit.atk     = Math.round(unit.atk * mod.atk);
  if(mod.def     != null) unit.def     = Math.round(unit.def * mod.def);
  if(mod.spRegen != null) unit.spRegen = Math.round(unit.spRegen * mod.spRegen);
  if(mod.hp      != null){
    unit.maxHp = Math.round(unit.maxHp * mod.hp);
    unit.hp    = unit.maxHp;
  }
  if(mod.sp      != null) unit.sp = Math.floor(unit.maxSp * mod.sp);
  return unit;
}

// ── 技能可用性与代价：**唯一实现** ───────────────────────
// （COMBAT_PLAN.md 任务 3a）
//
// 加冷却之前，「这个技能放不放得起」在仓库里有 **8 份**拷贝：
// ai.js、battle.js（技能按钮 + 点击校验）、intent.js、choice-check、
// depth-check、intent-value-check、ai-scoring 的 tempo 估算。
// 每加一个新条件（比如冷却）就要同步 8 处——这个项目已经因为
// 「同一份知识多份实现」出过四次 bug 了，不能再来第五次。
//
// 冷却按**这个单位自己的回合**计数，在 processStartOfTurn 里递减。
// 存 `cd + 1` 是因为递减发生在下一回合开头：cd:2 要真的挡住 2 个回合，
// 就得先垫一格给「用掉它的这个回合」。
export function skillOnCooldown(u, s){
  return (u.cooldowns && u.cooldowns[s.name] > 0);
}

export function canUseSkill(u, s){
  if(u.sp < s.cost) return false;
  if(s.hpCost && u.hp <= s.hpCost) return false;
  if(skillOnCooldown(u, s)) return false;
  return true;
}

// 付出技能的代价。battle.js 和 sim.js 的 executeSkill 都调它——
// 以前两边各写一行扣 SP，加冷却时又会变成两处要改。
export function payCosts(actor, skill){
  if(skill.cost) actor.sp = clamp(actor.sp - skill.cost, 0, actor.maxSp);
  if(skill.hpCost) actor.hp = clamp(actor.hp - skill.hpCost, 1, actor.maxHp);
  if(skill.cd){
    if(!actor.cooldowns) actor.cooldowns = {};
    actor.cooldowns[skill.name] = skill.cd + 1;
  }
}

// ── 嘲讽 / 净化的执行 ───────────────────────────────────
// 收敛到这里而不是让 battle.js 和 sim.js 各写一份——这两个技能刚加了
// 「附带即时收益」，正是最容易漏改一处的时候。
//
// 为什么要加即时收益：`skill-audit.mjs` 实测**禁掉嘲讽胜率反而 +4.0、
// 禁掉净化 +2.8**——纯功能技能在这个战斗节奏下要占掉一整个回合，
// 而一个回合值 30 点上下的伤害，光靠「改变敌人目标」或「清个负面」赚不回来。
// 这是本项目反复验证过的老结论（见 CLAUDE.md 踩过的坑）。
// 嘲讽。`power` / `shieldAmt` 是可选的附加收益，**目前 data.js 里都没配**。
//
// ⚠ 2026-08-26 三次尝试全部失败，别再重试同样的路子（详见 COMBAT_PLAN.md）：
//   纯功能（现状）  skill-audit 禁掉它胜率 +4.0
//   ＋30 护盾        +8.0（更糟）
//   ＋100% 伤害      +16.5（更糟）
//   ＋反弹 ×3.5      +9.7（更糟）
// 规律很一致：给它加赠品只会抬高评分让 AI 用得更勤，而**嘲讽的效果本身是负的**。
//
// 根因是本作的回合结构：「双方各行动一个单位」，**行动次数不随存活人数变化**。
// 别的战棋里嘲讽的核心价值是「保住脆皮让它继续输出」，那个价值在这里不存在——
// 队伍总共要吃的伤害没变，只是换了个人挨。要救活嘲讽得先动回合结构（任务 6）。
export function resolveTaunt(actor, target, skill, scene){
  const damage = (skill.power && target) ? calcDamage(actor, target, skill, scene) : null;
  actor.buffs.push({type:'taunt', dur:skill.dur});
  if(skill.shieldAmt) actor.shield += skill.shieldAmt;
  return { damage, shield:skill.shieldAmt || 0 };
}

export function applyCleanse(target, skill){
  const removed = target.debuffs.length + (target.stunned ? 1 : 0);
  target.debuffs = [];
  target.stunned = false;
  const healed = Math.min(skill.healAmt || 0, target.maxHp - target.hp);
  if(healed > 0) target.hp = clamp(target.hp + healed, 0, target.maxHp);
  return { removed, healed };
}

// ── BOSS 阶段 ───────────────────────────────────────────
// （COMBAT_PLAN.md 任务 4）
//
// 墨皇原来只是「术士 + 260血 + 22攻」——玩家能做的判断和打普通术士一模一样，
// 只是数字更大。所谓「难」= 容错更低 = 同一批骰子权重更高，这正是用户说的
// 「墨皇纯看运气」。阶段化是要把他从**属性怪**变成**一道题**。
//
// 阶段按 HP 比例切换，`phases` 从高到低排列，取最后一个满足 `hp比例 <= at` 的。
// 配置写在 campaign.js 的关卡数据里，规则留在这里——
// **别在 battle.js 里就地写 BOSS 规则**（CLAUDE.md 头号约定）。
export function bossPhase(unit, phases){
  if(!phases || !phases.length) return null;
  const frac = unit.maxHp > 0 ? unit.hp / unit.maxHp : 0;
  let cur = phases[0];
  for(const p of phases) if(frac <= p.at) cur = p;
  return cur;
}

// 这个单位这一「侧回合」要行动几次。阶段二「涂改」= 2 次。
export function actionsFor(unit){
  const ph = bossPhase(unit, unit.bossPhases);
  return Math.max(1, (ph && ph.actions) || 1);
}

// 阶段三「重写」：抹掉目标一个技能若干回合。
// **直接复用冷却机制**——`canUseSkill` 已经是唯一实现，`processStartOfTurn`
// 已经在递减 `cooldowns`，所以封印不需要第二套状态。
// （这也是任务 3 把冷却机制留在代码里的理由：BOSS 招式节奏和「削玩家的选项」
// 是两回事，前者是设计意图，后者被实测否定了。）
export function sealSkill(target, turns){
  // **永不封普攻（skills[0]），也永不把对方封到只剩一个技能。**
  // 否则玩家会被封到无技可用——AI 的 decide() 返回 null，那个单位整局不动。
  // 「让玩家换打法」是设计意图，「让玩家没法动」不是。
  const usable = target.skills.filter(s => canUseSkill(target, s));
  const pool = usable.filter((s, i) => target.skills.indexOf(s) !== 0);
  if(pool.length < 2) return null;
  // 抹掉它**当前最能打的那个**，而不是随机抹——BOSS 该是有针对性的
  const worst = pool.reduce((a, b) => (b.power || 0) * (b.cost || 1) > (a.power || 0) * (a.cost || 1) ? b : a);
  if(!target.cooldowns) target.cooldowns = {};
  target.cooldowns[worst.name] = turns + 1;
  return worst.name;
}

// 这个技能是否需要一个敌方目标。
// 判断以前分散在 ai.js / battle.js / sim.js 三处，给「狂暴」加 power 时
// 只改了两处，导致 AI 放狂暴不造成伤害、玩家放却会——同一技能两种行为。
// 收敛到这里，三方共用，并由测试锁住。
export function needsEnemyTarget(skill){
  if(['damage','stun','drain'].includes(skill.type)) return true;
  // 边打边上 buff / 边打边嘲讽：带 power 就需要一个挨打的对象
  if(['selfBuff','taunt'].includes(skill.type) && skill.power) return true;
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

// 「腐化侵蚀」每层每次攻击的额外伤害。原来是硬编码的 8，5 层时等于每刀 +40——
// 这个引擎让术士在平衡表上一骑绝尘（69.3%，全场第一，比垫底的剑士高 40 个百分点）。
// 提出来变成常量，`ai-scoring.js` 的评分也读它，改一处即可。
export const CORRUPT_BONUS_PER_STACK = 5;

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
