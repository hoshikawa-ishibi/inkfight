import { test } from "node:test";
import assert from "node:assert/strict";
import { SCENES } from "../src/data/data.js";
import { createUnit, applyCorrupt } from "../src/core/combat.js";
import {
  executeSkill,
  previewSkillOutcome,
} from "../src/core/skill-executor.js";

const VOID = SCENES[0];
function setup(actorId, targetId = "guardian") {
  const actor = createUnit(actorId, 1, 0),
    target = createUnit(targetId, 2, 0);
  target.dodge = 0;
  return { actor, target, p1: [actor], p2: [target] };
}
function assertMatches(s, skill) {
  const beforeHp = s.target.hp,
    beforeShield = s.target.shield,
    beforeActorHp = s.actor.hp;
  const preview = previewSkillOutcome(
    s.actor,
    skill,
    s.target,
    VOID,
    s.p1,
    s.p2,
  );
  assert.equal(s.target.hp, beforeHp);
  assert.equal(s.target.shield, beforeShield);
  assert.equal(s.actor.hp, beforeActorHp);
  executeSkill(s.actor, skill, s.target, VOID, s.p1, s.p2, null);
  const target = preview.units.find(
    (u) => u.player === 2 && u.id === s.target.id,
  );
  const actor = preview.actor;
  assert.equal(target.hpDelta, s.target.hp - beforeHp);
  assert.equal(target.shieldDelta, s.target.shield - beforeShield);
  assert.equal(actor.hpDelta, s.actor.hp - beforeActorHp);
  return preview;
}

test("previewSkillOutcome多段伤害与实际完全一致且不改原局面", () => {
  const s = setup("monk");
  const p = assertMatches(
    s,
    s.actor.skills.find((k) => k.name === "连环崩拳"),
  );
  assert.ok(p.events.damage.length > 1);
});
test("previewSkillOutcome只在克隆上消费扰乱状态", () => {
  const s = setup("mage");
  s.actor.disrupted = true;
  const p = assertMatches(s, s.actor.skills[0]);
  assert.ok(p.units.find((u) => u.player === 2).hpDelta < 0);
});
test("previewSkillOutcome覆盖腐化爆发", () => {
  const s = setup("warlock");
  applyCorrupt(s.target, 3);
  assertMatches(
    s,
    s.actor.skills.find((k) => k.type === "corruptBurst"),
  );
});
test("previewSkillOutcome覆盖吸血并返回actor变化", () => {
  const s = setup("berserker");
  s.actor.hp -= 30;
  const p = assertMatches(
    s,
    s.actor.skills.find((k) => k.type === "drain"),
  );
  assert.ok(p.actor.hpDelta > 0);
});
test("executeSkill返回按unit.id聚合的贡献并只统计实际吸血", () => {
  const s = setup("berserker", "mage");
  s.actor.hp = s.actor.maxHp - 2;
  const stats = { [s.actor.id]: { dmg: 0, heals: 0, kills: 0 } };
  const e = executeSkill(
    s.actor,
    s.actor.skills.find((k) => k.type === "drain"),
    s.target,
    VOID,
    s.p1,
    s.p2,
    stats,
  );
  assert.equal(e.healing[0].amount, 2);
  assert.equal(stats[s.actor.id].heals, 2);
  assert.equal(e.contributions[s.actor.id].heal, 2);
  assert.ok(e.contributions[s.actor.id].maxHit > 0);
});
test("多段自疗逐段记录实际恢复量", () => {
  const s = setup("monk", "mage");
  s.actor.hp -= 20;
  const stats = { [s.actor.id]: { dmg: 0, heals: 0, kills: 0 } };
  const skill = {
    name: "测试连愈",
    type: "damage",
    power: 1,
    hits: 2,
    selfHeal: 15,
  };
  const e = executeSkill(s.actor, skill, s.target, VOID, s.p1, s.p2, stats);
  assert.equal(
    e.healing.reduce((n, h) => n + h.amount, 0),
    20,
  );
  assert.equal(stats[s.actor.id].heals, 20);
});
test("施法者被反伤击杀后吸血不会复活尸体", () => {
  const s = setup("berserker", "shadow");
  s.actor.hp = 1;
  const e = executeSkill(
    s.actor,
    s.actor.skills.find((k) => k.type === "drain"),
    s.target,
    VOID,
    s.p1,
    s.p2,
    null,
  );
  assert.equal(s.actor.alive, false);
  assert.equal(s.actor.hp, 0);
  assert.equal(e.healing.length, 0);
  assert.ok(
    e.deaths.some((d) => d.id === s.actor.id && d.killerId === s.target.id),
  );
});
