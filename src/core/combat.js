// 战斗规则引擎：纯函数，无 DOM / Audio / setTimeout 依赖。
// battle.js（真人对战，负责渲染/动画/音效）和 sim.js（无头模拟，负责统计数据）
// 都从这里调用同一套规则，避免两边各自实现出现漂移。
import { CHARACTERS } from "../data/data.js";
import { clamp } from "./state.js";

// override（可选）用来做「同一个角色、不同身份」，不新增一份角色数据。
// 可覆盖 name / color / hp / atk / def / crit / dodge / passive；
// 传 `{id, name}` 这种只带名字的对象也行（id 字段会被忽略，单位 id 另算）。
// 缺省 undefined 时走原路径，其它模式的行为一点不变。
export function createUnit(charId, player, slot, override) {
  const b = CHARACTERS.find((c) => c.id === charId);
  const o = override || {};
  const hp = o.hp ?? b.hp;
  return {
    id: `${player}-${slot}`,
    charId: b.id,
    name: o.name ?? b.name,
    player,
    color: o.color ?? b.color,
    weapon: b.weapon,
    maxHp: hp,
    hp,
    atk: o.atk ?? b.atk,
    def: o.def ?? b.def,
    crit: o.crit ?? b.crit,
    dodge: o.dodge ?? b.dodge,
    skills: JSON.parse(JSON.stringify(b.skills)),
    passive: o.passive !== undefined ? o.passive : b.passive || null,
    passiveStacks: 0,
    alive: true,
    shield: 0,
    buffs: [],
    debuffs: [],
    disrupted: false,
    stunned: false,
    dodging: false,
    undying: 0,
    // 打断免疫的剩余回合数（见 calcStun）。在 processStartOfTurn 里递减。
    interruptImmune: 0,
    // 暴击蓄能条（见 calcDamage）。攒满 100 必暴击，玩家看得见。
    critMeter: 0,
    inkMode: true,
    pose: "idle",
    blink: 0,
  };
}

// 关卡敌人条目 → [角色id, override]。字符串和 {id,name,...} 对象都吃，
// battle.js 和 sim.js 共用，免得两边各写一份解析（这个项目已经因此出过三次 bug）。
export function unitSpec(entry) {
  return typeof entry === "string" ? [entry, null] : [entry.id, entry];
}

export function getEffectiveAtk(u) {
  let a = u.atk;
  u.buffs.forEach((b) => {
    if (b.type === "atkUp" || b.type === "atkUp1" || b.type === "berserk")
      a *= 1 + b.value;
  });
  if (u.charId === "berserker") a *= 1 + (1 - u.hp / u.maxHp) * 0.5;
  return a;
}

export function previewDmg(u, s, scene) {
  s = previewInterruptedSkill(u, s);
  if (!s.power) return null;
  let d = getEffectiveAtk(u) * s.power;
  if (scene && scene.buff === "damageUp") d *= 1.15;
  // 暴击现在是确定的（蓄能条），所以预览也该是确定的——
  // 攒满了就把 1.5 倍算进去。玩家正是靠这个数字决定「大招留不留到下一刀」。
  if (willCrit(u, s)) d *= CRIT_MULTIPLIER;
  return Math.floor(d);
}

export function handleDeath(unit) {
  if (unit.undying) {
    unit.hp = unit.undying;
    unit.undying = 0;
    return { died: false, undying: true };
  }
  unit.alive = false;
  unit.pose = "dead";
  return { died: true, undying: false };
}

// ── 被动技能 ──────────────────────────────────────────
// ctx 视 trigger 类型可能带 { target, attacker, dmg, allies }。
// 返回描述实际发生了什么的事件对象，或 null（条件不满足，什么都没发生）。
// 调用方（battle.js/sim.js）各自决定要不要呈现（日志/特效/统计）。
export function triggerPassive(trigger, unit, ctx = {}) {
  const p = unit.passive;
  if (!p || p.trigger !== trigger) return null;
  switch (p.effect) {
    case "allyHeal": {
      let allies = (ctx.allies || []).filter((a) => a.alive && a.hp < a.maxHp);
      if (p.target === "lowest" && allies.length) {
        allies = [
          allies.reduce((a, b) => (a.hp / a.maxHp <= b.hp / b.maxHp ? a : b)),
        ];
      } else allies = allies.filter((a) => a.hp / a.maxHp < 0.3);
      allies.forEach((a) => {
        a.hp = clamp(a.hp + p.value, 0, a.maxHp);
      });
      return {
        name: p.name,
        effect: "allyHeal",
        value: p.value,
        targets: allies,
      };
    }

    case "critStack": {
      const stacks = unit.passiveStacks || 0;
      if (stacks < p.maxStacks) {
        unit.passiveStacks = stacks + 1;
        unit.crit += p.value;
        return {
          name: p.name,
          effect: "critStack",
          value: p.value,
          stacks: unit.passiveStacks,
        };
      }
      return null;
    }

    case "reflect": {
      const attacker = ctx.attacker;
      if (attacker && attacker.alive && ctx.dmg > 0) {
        const ref = Math.max(1, Math.floor(ctx.dmg * p.value));
        attacker.hp = clamp(attacker.hp - ref, 0, attacker.maxHp);
        const death = attacker.hp <= 0 ? handleDeath(attacker) : null;
        return {
          name: p.name,
          effect: "reflect",
          attacker,
          amount: ref,
          died: !!death?.died,
          undying: !!death?.undying,
        };
      }
      return null;
    }

    case "bloodRage": {
      if (unit.hp / unit.maxHp < 0.4) {
        const stacks = unit.passiveStacks || 0;
        if (stacks < p.maxStacks) {
          unit.passiveStacks = stacks + 1;
          unit.buffs.push({ type: "atkUp", dur: 99, value: p.value });
          return {
            name: p.name,
            effect: "bloodRage",
            value: p.value,
            stacks: unit.passiveStacks,
          };
        }
      }
      return null;
    }

    // 新 8 人用到的三个被动（ROSTER_PLAN.md）
    case "critCharge": // 刀娘「残心」：暴击后继续充能，可以连着暴
      unit.critMeter = (unit.critMeter || 0) + p.value;
      return { name: p.name, effect: "critCharge", value: p.value };

    case "selfShield": {
      // 机关师「自动机括」：挨打就自动结甲
      unit.shield += p.value;
      return { name: p.name, effect: "selfShield", value: p.value };
    }

    case "selfHeal": {
      // 医仙「回春」
      const before = unit.hp;
      unit.hp = clamp(unit.hp + p.value, 0, unit.maxHp);
      const healed = unit.hp - before;
      return healed > 0
        ? { name: p.name, effect: "selfHeal", value: healed }
        : null;
    }

    case "corruptBonus": {
      const target = ctx.target;
      if (!target) return null;
      const stacks = countCorrupt(target);
      if (stacks <= 0) return null;
      const bonus = stacks * (p.value ?? CORRUPT_BONUS_PER_STACK);
      target.hp = clamp(target.hp - bonus, 0, target.maxHp);
      const death = target.hp <= 0 ? handleDeath(target) : null;
      return {
        name: p.name,
        effect: "corruptBonus",
        target,
        amount: bonus,
        stacks,
        killer: unit,
        died: !!death?.died,
        undying: !!death?.undying,
      };
    }

    default:
      return null;
  }
}

// 状态衰减：buff / debuff 时长、打断免疫。共享墨侧回合开始时，
// 本方每名存活单位都必须调用一次，防止通过不选角色来冻结负面状态。
export function tickEffects(u) {
  if (!u.alive) return;
  u.buffs = u.buffs.filter((b) => --b.dur > 0);
  u.debuffs = u.debuffs.filter((d) => --d.dur > 0);
  if (u.interruptImmune > 0) u.interruptImmune--;
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
export const INK_EROSION_FROM = 18; // 从第几回合开始
export const INK_EROSION_STEP = 3; // 每多一回合加多少

export function inkErosion(round) {
  if (!round || round < INK_EROSION_FROM) return 0;
  return (round - INK_EROSION_FROM + 1) * INK_EROSION_STEP;
}

// ── 回合开始：中毒/狂暴掉血 + buff/debuff 时长衰减 ──────────
export function processStartOfTurn(u, ctx = {}) {
  const passiveEvent = triggerPassive("onTurnStart", u, ctx);

  let poison = null;
  u.debuffs.forEach((d) => {
    if (d.type === "poison") {
      u.hp = clamp(u.hp - d.value, 0, u.maxHp);
      const death = u.hp <= 0 ? handleDeath(u) : null;
      poison = { dmg: d.value, died: !!death?.died, undying: !!death?.undying };
    }
  });

  // 墨蚀：拖太久，双方一起被吞。无视防御和护盾。
  let erosion = null;
  const ero = inkErosion(ctx.round);
  if (ero > 0) {
    u.hp = clamp(u.hp - ero, 0, u.maxHp);
    const death = u.hp <= 0 ? handleDeath(u) : null;
    erosion = { dmg: ero, died: !!death?.died, undying: !!death?.undying };
  }

  let berserk = null;
  const berserkBuff = u.buffs.find((b) => b.type === "berserk");
  if (berserkBuff) {
    const selfDmg = berserkBuff.selfDmg ?? BUFF_DEFAULTS.berserkSelfDmg;
    u.hp = clamp(u.hp - selfDmg, 0, u.maxHp);
    const death = u.hp <= 0 ? handleDeath(u) : null;
    berserk = { dmg: selfDmg, died: !!death?.died, undying: !!death?.undying };
  }

  tickEffects(u);

  return { passiveEvent, poison, berserk, erosion };
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
// 重击倍率。UI 有三处要说「伤害 ×1.5」，全部读这里，别再各抄一遍。
export const CRIT_MULTIPLIER = 1.5;

export function critRateOf(actor, skill) {
  return (skill.crit || 0) + (actor.crit || 0);
}

// 这一击会不会暴击？UI 的伤害预览、敌方意图预估、AI 评分都要问它，
// 三处必须和 calcDamage 判断一致，所以收敛成一个函数。
export function willCrit(actor, skill) {
  return (actor.critMeter || 0) + critRateOf(actor, skill) >= CRIT_METER_FULL;
}

export function calcDamage(actor, target, skill, scene) {
  // 主动闪避（刺客「消失」）：说好了免疫下一次攻击就一定免疫，本来就是确定的。
  // **被动闪避率那一掷已经删掉**——见下面的减伤项。
  if (target.dodging) {
    target.dodging = false;
    return {
      dodged: true,
      dmg: 0,
      isCrit: false,
      shieldAbsorbed: 0,
      baseAtk: getEffectiveAtk(actor),
      killed: false,
      undying: false,
      passiveEvents: [],
    };
  }
  const baseAtk = getEffectiveAtk(actor);
  let dmg = baseAtk * (skill.power || 1);
  let isCrit = false;
  actor.critMeter = (actor.critMeter || 0) + critRateOf(actor, skill);
  if (actor.critMeter >= CRIT_METER_FULL) {
    actor.critMeter -= CRIT_METER_FULL;
    dmg *= CRIT_MULTIPLIER;
    isCrit = true;
  }
  if (target.debuffs.some((d) => d.type === "defDown")) dmg *= 1.2;
  if (scene && scene.buff === "damageUp") dmg *= 1.15;
  const defReduce = target.def / (target.def + 50);
  dmg *= 1 - defReduce;
  // 被动闪避（原来是「dodge% 概率完全免疫」）改成**确定性减伤**。
  // 期望伤害一模一样，但不再有「这一下闪没闪掉」的骰子。
  // 5~10% 的闪避率本来也构不成任何决策，只贡献噪声。
  if (target.dodge) dmg *= 1 - target.dodge / 100;
  actor.buffs = actor.buffs.filter((b) => b.type !== "atkUp1");
  dmg = Math.max(1, Math.floor(dmg));

  let shieldAbsorbed = 0;
  if (target.shield > 0) {
    shieldAbsorbed = Math.min(target.shield, dmg);
    target.shield -= shieldAbsorbed;
    dmg -= shieldAbsorbed;
  }
  target.hp = clamp(target.hp - dmg, 0, target.maxHp);

  if (skill.dot)
    target.debuffs.push({
      type: "poison",
      dur: skill.dotDur,
      value: skill.dot,
    });
  if (skill.debuff === "defDown")
    target.debuffs.push({ type: "defDown", dur: skill.debuffDur, value: 0.2 });
  let selfHeal = 0;
  if (skill.selfHeal) {
    const before = actor.hp;
    actor.hp = clamp(actor.hp + skill.selfHeal, 0, actor.maxHp);
    selfHeal = actor.hp - before;
  }

  let killed = false,
    undying = false;
  if (target.hp <= 0) {
    const death = handleDeath(target);
    killed = death.died;
    undying = death.undying;
  }

  const passiveEvents = [];
  if (dmg > 0) {
    const e1 = triggerPassive("onDamageDealt", actor, { target });
    if (e1) passiveEvents.push({ unit: actor, event: e1 });
    const e2 = triggerPassive("onTakeDamage", target, { attacker: actor, dmg });
    if (e2) passiveEvents.push({ unit: target, event: e2 });
    if (isCrit) {
      const e3 = triggerPassive("onCrit", actor, { target });
      if (e3) passiveEvents.push({ unit: actor, event: e3 });
    }
  }

  return {
    dodged: false,
    dmg,
    isCrit,
    shieldAbsorbed,
    baseAtk,
    dotApplied: !!skill.dot,
    defDownApplied: skill.debuff === "defDown",
    selfHeal,
    killed,
    undying,
    passiveEvents,
  };
}

// ── 打断（原「眩晕」） ──────────────────────────────────
// **确定性，不掷骰。** 唯一限制是短暂免疫，避免连续锁死。
// 免疫期（`interruptImmune`）防连锁：没有它，两个打断角色可以把对方锁死。
// 计数在 processStartOfTurn 里递减，所以设 2 意味着「最多隔一次打断一回」。
export function canInterrupt(target) {
  return !!target?.alive && !target.interruptImmune;
}

export const INTERRUPT_IMMUNE_TURNS = 2;
export const INTERRUPT_OUTPUT_MULTIPLIER = 0.6;

// 正式打断不再没收行动：只把目标下一次行动的伤害 / 治疗压到 60%。
// 两个调用方都必须经这两个函数取技能，避免 battle.js 和 sim.js 再各算一份。
//
// **按「技能实际产出什么」折算，不是按字段名折算。** 第一版只缩 power 和
// healAmt，于是和写在 UI 上的规则对不上，而且是两个方向同时错：
//   - 说了「伤害 -40%」却没做到：术士「腐化爆发」的伤害走 dmgPerStack、
//     中毒走 dot，两个都没被缩——被扰乱时改放腐化爆发等于完全免疫，
//     而且这条免票只有术士一个人有。
//   - 说了「净化不受影响」却做过头：净化 / 醒神带的附带治疗也叫 healAmt，
//     跟着被砍了 40%。净化本来是被明确留出来的应对手段。
// 这不是改规则，是让实现追上早就写出去的那条规则。
export function previewInterruptedSkill(actor, skill) {
  if (!actor.disrupted) return skill;
  const M = INTERRUPT_OUTPUT_MULTIPLIER;
  const cut = (v) => Math.max(1, Math.round(v * M));
  const out = { ...skill };
  // 伤害：直伤、持续伤害、按层数结算的爆发，三条路都要走同一个折扣
  if (out.power) out.power *= M;
  if (out.dot) out.dot = cut(out.dot);
  if (out.dmgPerStack) out.dmgPerStack = cut(out.dmgPerStack);
  // 治疗：净化除外——它和护盾 / 增益一样，是玩家被扰乱时该改用的东西
  if (out.healAmt && out.type !== "cleanse") out.healAmt = cut(out.healAmt);
  return out;
}

export function consumeInterruptedSkill(actor, skill) {
  const consumed = !!actor.disrupted;
  const out = previewInterruptedSkill(actor, skill);
  if (consumed) actor.disrupted = false;
  return { skill: out, consumed };
}

// 多段连击：`hits: N` 的伤害技能打 N 段，**每段各自走一遍 calcDamage**。
// 这一点很重要：每段各自给暴击蓄能条充能，所以多段技能天然和暴击流联动
// （拳师「连环崩拳」打 3 段 = 一口气充 3 次）。
// 每段的倍率是 power/hits，总量和单段技能可比，差别在于蓄能和溢杀。
export function resolveHits(actor, target, skill, scene) {
  const n = Math.max(1, skill.hits || 1);
  if (n === 1)
    return { hits: [calcDamage(actor, target, skill, scene)], total: 0 };
  const per = { ...skill, power: (skill.power || 1) / n, hits: 1 };
  const out = [];
  for (let i = 0; i < n; i++) {
    if (!target.alive) break;
    out.push(calcDamage(actor, target, per, scene));
  }
  return { hits: out, total: out.reduce((a, r) => a + r.dmg, 0) };
}

// 直接给自己的暴击蓄能条充值。刀娘「蓄刃」靠它把下一刀顶成必暴。
export function chargeCrit(actor, amount) {
  actor.critMeter = (actor.critMeter || 0) + (amount || 0);
  return actor.critMeter;
}

// ── 群体版的治疗 / 护盾 / 增益 ────────────────────────────
// 对称于已有的 damageAll。这三个是新 8 人里「群体支援」那一族的核心，
// 老 8 人里治疗/护盾/增益全是单体。
export function applyHealAll(allies, skill) {
  const hits = [];
  allies
    .filter((a) => a.alive)
    .forEach((a) => {
      const healed = Math.min(skill.healAmt || 0, a.maxHp - a.hp);
      if (healed > 0) a.hp = clamp(a.hp + healed, 0, a.maxHp);
      hits.push({ target: a, healed });
    });
  return hits;
}

export function applyShieldAll(allies, skill) {
  const hits = [];
  allies
    .filter((a) => a.alive)
    .forEach((a) => {
      a.shield += skill.shieldAmt || 0;
      hits.push({ target: a, amount: skill.shieldAmt || 0 });
    });
  return hits;
}

export function applyBuffAll(allies, skill) {
  const hits = [];
  allies
    .filter((a) => a.alive)
    .forEach((a) => {
      a.buffs.push(makeAllyBuff(skill));
      hits.push({ target: a });
    });
  return hits;
}

export function calcStun(actor, target, skill) {
  if (target.interruptImmune)
    return { success: false, reason: "immune", need: 0 };
  target.disrupted = true;
  target.interruptImmune = INTERRUPT_IMMUNE_TURNS;
  return { success: true, reason: "ok", need: 0, mode: "weaken" };
}

// 打断技能：带 power 的先结算伤害，再判定打断。
// 闪避或直接打死的情况下不再判打断。
export function resolveStun(actor, target, skill, scene) {
  const damage = skill.power ? calcDamage(actor, target, skill, scene) : null;
  if (damage && (damage.dodged || damage.killed || !target.alive)) {
    return { damage, success: false, reason: "dead", need: 0, skipped: true };
  }
  const r = calcStun(actor, target, skill);
  return { damage, ...r, skipped: false };
}

// ── buff/debuff 构造 ────────────────────────────────────
// 强度以前硬编码在 sim.js 和 battle.js 各一份（共三处），
// 想调狂暴的加成得同时改代码三个地方。集中到这里，并允许
// data.js 用 buffValue / selfDmg 覆盖，数值调整不必再动代码。
export const BUFF_DEFAULTS = {
  selfBuff: 0.4,
  allyBuff: 0.3,
  focusBuff: 0.2,
  berserkSelfDmg: 8,
};

// 难度只影响 AI 决策噪声；名称仍由战斗和战绩界面共用。
export const DIFF_LABEL = {
  easy: "简单",
  normal: "普通",
  hard: "困难",
  nightmare: "墨皇",
};

// 通用单位属性倍率，供明确配置了属性变化的规则调用。
export function applyStageMod(unit, mod) {
  if (!mod) return unit;
  if (mod.atk != null) unit.atk = Math.round(unit.atk * mod.atk);
  if (mod.def != null) unit.def = Math.round(unit.def * mod.def);
  if (mod.hp != null) {
    unit.maxHp = Math.round(unit.maxHp * mod.hp);
    unit.hp = unit.maxHp;
  }
  return unit;
}

// ── 技能可用性与生命代价：唯一实现 ───────────────────────
export function canUseSkill(u, s) {
  if (!u?.alive || !s) return false;
  if (s.hpCost && u.hp <= s.hpCost) return false;
  return true;
}

// 付出技能自身的生命代价；共享墨量由 ink-turn 在提交动作时支付。
export function payCosts(actor, skill) {
  if (skill.hpCost) actor.hp = clamp(actor.hp - skill.hpCost, 1, actor.maxHp);
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
export function resolveTaunt(actor, target, skill, scene) {
  const damage =
    skill.power && target ? calcDamage(actor, target, skill, scene) : null;
  actor.buffs.push({ type: "taunt", dur: skill.dur });
  if (skill.shieldAmt) actor.shield += skill.shieldAmt;
  return { damage, shield: skill.shieldAmt || 0 };
}

export function applyCleanse(target, skill) {
  const removed =
    target.debuffs.length +
    (target.disrupted ? 1 : 0) +
    (target.stunned ? 1 : 0);
  target.debuffs = [];
  target.disrupted = false;
  target.stunned = false;
  const healed = Math.min(skill.healAmt || 0, target.maxHp - target.hp);
  if (healed > 0) target.hp = clamp(target.hp + healed, 0, target.maxHp);
  return { removed, healed };
}

// 这个技能是否需要一个敌方目标。
// 判断以前分散在 ai.js / battle.js / sim.js 三处，给「狂暴」加 power 时
// 只改了两处，导致 AI 放狂暴不造成伤害、玩家放却会——同一技能两种行为。
// 收敛到这里，三方共用，并由测试锁住。
export function needsEnemyTarget(skill) {
  if (["damage", "stun", "drain"].includes(skill.type)) return true;
  // 边打边上 buff / 边打边嘲讽：带 power 就需要一个挨打的对象
  if (["selfBuff", "taunt"].includes(skill.type) && skill.power) return true;
  return false;
}

// AoE / 自身类技能：由执行逻辑自行遍历敌人，不需要单体目标
export const AOE_TYPES = [
  "damageAll",
  "plague",
  "corruptBurst",
  "healAll",
  "shieldAll",
  "buffAll",
];

// 自我增益技能：带 power 的会先打出一次伤害再上 buff。
// 纯 buff 技能要占掉一整个回合，在这个节奏下几乎永远不划算
// （狂战士「狂暴」实测：增伤刚好被少打的那一回合抵消，还倒亏血）。
export function resolveSelfBuff(actor, target, skill, scene) {
  const damage =
    skill.power && target ? calcDamage(actor, target, skill, scene) : null;
  const buff = skill.buffType ? makeSelfBuff(skill) : null;
  if (buff) actor.buffs.push(buff);
  const charged = skill.critCharge ? chargeCrit(actor, skill.critCharge) : null;
  return { damage, buff, charged };
}

export function makeSelfBuff(skill) {
  const b = {
    type: skill.buffType,
    dur: skill.dur,
    value: skill.buffValue ?? BUFF_DEFAULTS.selfBuff,
  };
  if (skill.buffType === "berserk")
    b.selfDmg = skill.selfDmg ?? BUFF_DEFAULTS.berserkSelfDmg;
  return b;
}
export function makeAllyBuff(skill) {
  return {
    type: skill.buffType,
    dur: skill.dur,
    value: skill.buffValue ?? BUFF_DEFAULTS.allyBuff,
  };
}
export function makeFocusBuff(skill) {
  return {
    type: skill.buffType,
    dur: skill.dur,
    value: skill.buffValue ?? BUFF_DEFAULTS.focusBuff,
  };
}

// 「腐化侵蚀」每层每次攻击的额外伤害。原来是硬编码的 8，5 层时等于每刀 +40——
// 这个引擎让术士在平衡表上一骑绝尘（69.3%，全场第一，比垫底的剑士高 40 个百分点）。
// 提出来变成常量，`ai-scoring.js` 的评分也读它，改一处即可。
export const CORRUPT_BONUS_PER_STACK = 5;

// 腐化层上限。腐化层 dur:99 实际上永不过期（战斗上限 60 回合），
// 而「腐化侵蚀」被动每次攻击都吃 层数×8，没有上限就是无限滚雪球：
// 层数没有上限时，持续攻击会无限滚雪球。
export const MAX_CORRUPT_STACKS = 5;

export function countCorrupt(target) {
  return target.debuffs
    .filter((d) => d.type === "corrupt")
    .reduce((s, d) => s + d.value, 0);
}

export function applyCorrupt(target, stacks) {
  const current = countCorrupt(target);
  const added = Math.min(stacks, Math.max(0, MAX_CORRUPT_STACKS - current));
  if (added > 0)
    target.debuffs.push({ type: "corrupt", dur: 99, value: added });
  return current + added;
}

export function applyPlague(target, skill) {
  const total = applyCorrupt(target, skill.corrupt);
  target.debuffs.push({ type: "poison", dur: skill.dotDur, value: skill.dot });
  return total;
}

export function applyCorruptBurst(actor, enemies, skill) {
  const hits = [];
  let totalDmg = 0;
  enemies.forEach((t) => {
    const stacks = countCorrupt(t);
    if (stacks <= 0) return;
    const dmg = stacks * skill.dmgPerStack;
    t.debuffs = t.debuffs.filter((d) => d.type !== "corrupt");
    t.hp = clamp(t.hp - dmg, 0, t.maxHp);
    totalDmg += dmg;
    let died = false,
      undying = false;
    if (t.hp <= 0) {
      const death = handleDeath(t);
      died = death.died;
      undying = death.undying;
    }
    hits.push({ target: t, dmg, stacks, died, undying });
  });
  return { hits, totalDmg };
}
