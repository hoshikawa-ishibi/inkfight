import { clamp } from "./state.js";
import {
  calcDamage,
  applyCorrupt,
  applyPlague,
  applyCorruptBurst,
  resolveStun,
  resolveSelfBuff,
  makeAllyBuff,
  payCosts,
  resolveTaunt,
  applyCleanse,
  resolveHits,
  chargeCrit,
  applyHealAll,
  applyShieldAll,
  applyBuffAll,
  consumeInterruptedSkill,
} from "./combat.js";

function legacyStat(stats, actor, key, value) {
  for (const id of new Set([actor.id, actor.charId]))
    if (stats?.[id]) stats[id][key] += value;
}
function contribution(out, unit) {
  return (out.contributions[unit.id] ??= {
    unitId: unit.id,
    charId: unit.charId,
    dmg: 0,
    heal: 0,
    kills: 0,
    maxHit: 0,
  });
}
function death(out, victim, killer) {
  if (!victim?.alive && !out.deaths.some((d) => d.id === victim.id))
    out.deaths.push({ id: victim.id, killerId: killer?.id || null });
}
function healing(out, actor, target, amount, stats) {
  if (amount <= 0) return;
  out.healing.push({ actorId: actor.id, targetId: target.id, amount });
  contribution(out, actor).heal += amount;
  legacyStat(stats, actor, "heals", amount);
}
function passiveResults(out, r, stats) {
  for (const item of r?.passiveEvents || []) {
    const e = item.event;
    if (e.effect === "corruptBonus") {
      recordDamage(
        out,
        item.unit,
        e.target,
        {
          dmg: e.amount,
          killed: e.died,
          undying: e.undying,
          kind: "corruptBonus",
        },
        stats,
      );
    }
    if (e.effect === "reflect") {
      recordDamage(
        out,
        item.unit,
        e.attacker,
        { dmg: e.amount, killed: e.died, undying: e.undying, kind: "reflect" },
        stats,
      );
    }
  }
}
function recordDamage(out, actor, target, r, stats) {
  const amount = Math.max(0, r?.dmg || 0);
  out.damage.push({
    actorId: actor.id,
    targetId: target.id,
    amount,
    result: r,
  });
  const c = contribution(out, actor);
  c.dmg += amount;
  c.maxHit = Math.max(c.maxHit, amount);
  legacyStat(stats, actor, "dmg", amount);
  if (r?.killed) {
    c.kills++;
    legacyStat(stats, actor, "kills", 1);
    death(out, target, actor);
  }
  passiveResults(out, r, stats);
}
function hit(out, actor, target, skill, scene, stats) {
  const r = calcDamage(actor, target, skill, scene);
  recordDamage(out, actor, target, r, stats);
  if (r.selfHeal) healing(out, actor, actor, r.selfHeal, stats);
  return r;
}
function emptyEvents() {
  return {
    damage: [],
    healing: [],
    shields: [],
    deaths: [],
    contributions: {},
  };
}

// Single skill dispatcher for browser play and headless simulation.
export function executeSkill(actor, skill, target, scene, p1, p2, stats) {
  const out = emptyEvents();
  skill = consumeInterruptedSkill(actor, skill).skill;
  payCosts(actor, skill);
  const enemies = actor.player === 1 ? p2 : p1,
    allies = actor.player === 1 ? p1 : p2;
  switch (skill.type) {
    case "damage":
      if (skill.hits > 1) {
        const r = resolveHits(actor, target, skill, scene);
        for (const h of r.hits) {
          recordDamage(out, actor, target, h, stats);
          if (h.selfHeal) healing(out, actor, actor, h.selfHeal, stats);
        }
      } else hit(out, actor, target, skill, scene, stats);
      if (skill.critCharge) chargeCrit(actor, skill.critCharge);
      if (skill.corrupt && target.alive) applyCorrupt(target, skill.corrupt);
      break;
    case "damageAll":
      for (const t of enemies.filter((e) => e.alive))
        hit(out, actor, t, skill, scene, stats);
      break;
    case "healAll":
      for (const h of applyHealAll(allies, skill))
        healing(out, actor, h.target, h.healed, stats);
      break;
    case "shieldAll":
      for (const h of applyShieldAll(allies, skill))
        out.shields.push({
          actorId: actor.id,
          targetId: h.target.id,
          amount: h.amount,
        });
      break;
    case "buffAll":
      applyBuffAll(allies, skill);
      break;
    case "stun": {
      const r = resolveStun(actor, target, skill, scene);
      if (r.damage) recordDamage(out, actor, target, r.damage, stats);
      break;
    }
    case "heal": {
      const h = applyHealAll([target], skill)[0];
      if (h) healing(out, actor, h.target, h.healed, stats);
      break;
    }
    case "shield":
      actor.shield += skill.shieldAmt;
      out.shields.push({
        actorId: actor.id,
        targetId: actor.id,
        amount: skill.shieldAmt,
      });
      break;
    case "taunt": {
      const r = resolveTaunt(actor, target, skill, scene);
      if (r.damage) recordDamage(out, actor, target, r.damage, stats);
      if (r.shield)
        out.shields.push({
          actorId: actor.id,
          targetId: actor.id,
          amount: r.shield,
        });
      break;
    }
    case "dodge":
      actor.dodging = true;
      break;
    case "selfBuff": {
      const r = resolveSelfBuff(actor, target, skill, scene);
      if (r.damage) recordDamage(out, actor, target, r.damage, stats);
      break;
    }
    case "cleanse": {
      const r = applyCleanse(target, skill);
      healing(out, actor, target, r.healed || 0, stats);
      break;
    }
    case "buff":
      target.buffs.push(makeAllyBuff(skill));
      break;
    case "drain": {
      const dealt = hit(out, actor, target, skill, scene, stats).dmg || 0;
      if (actor.alive) {
        const wanted = Math.floor(dealt * (skill.drainPct / 100));
        const actual = Math.min(wanted, actor.maxHp - actor.hp);
        actor.hp = clamp(actor.hp + actual, 0, actor.maxHp);
        healing(out, actor, actor, actual, stats);
      }
      if (skill.corrupt && target.alive) applyCorrupt(target, skill.corrupt);
      break;
    }
    case "plague":
      for (const t of enemies.filter((e) => e.alive)) applyPlague(t, skill);
      break;
    case "corruptBurst": {
      const { hits } = applyCorruptBurst(
        actor,
        enemies.filter((e) => e.alive),
        skill,
      );
      for (const h of hits)
        recordDamage(
          out,
          actor,
          h.target,
          {
            dmg: h.dmg,
            killed: h.died,
            undying: h.undying,
            kind: "corruptBurst",
          },
          stats,
        );
      break;
    }
    case "revive":
      actor.undying = skill.hpRestore;
      break;
    default:
      throw new Error(`Unsupported skill type: ${skill.type}`);
  }
  return out;
}

function copy(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}
export function previewSkillOutcome(actor, skill, target, scene, p1, p2) {
  const before = [...(p1 || []), ...(p2 || [])],
    cp1 = copy(p1 || []),
    cp2 = copy(p2 || []),
    clones = [...cp1, ...cp2];
  const key = (u) => `${u.player}:${u.id}`,
    byKey = new Map(clones.map((u) => [key(u), u]));
  const cloneActor = byKey.get(key(actor)),
    cloneTarget = target ? byKey.get(key(target)) : null;
  if (!cloneActor) throw new Error("preview actor must belong to p1 or p2");
  const events = executeSkill(
    cloneActor,
    copy(skill),
    cloneTarget,
    scene,
    cp1,
    cp2,
    null,
  );
  const units = before.map((original) => {
    const after = byKey.get(key(original));
    return {
      id: original.id,
      player: original.player,
      charId: original.charId,
      hpDelta: after.hp - original.hp,
      shieldDelta: (after.shield || 0) - (original.shield || 0),
      killed: !!original.alive && !after.alive,
      critMeterDelta: (after.critMeter || 0) - (original.critMeter || 0),
      alive: after.alive,
      hp: after.hp,
      shield: after.shield || 0,
    };
  });
  return {
    units,
    actor: units.find((u) => u.id === actor.id && u.player === actor.player),
    events,
    stats: events.contributions,
  };
}
