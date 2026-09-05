import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { SCENES } from "../src/data/data.js";
import {
  createUnit,
  canUseSkill,
  payCosts,
  calcDamage,
  resolveStun,
  processStartOfTurn,
  applyCorrupt,
  applyCorruptBurst,
  applyCleanse,
  resolveSelfBuff,
  triggerPassive,
} from "../src/core/combat.js";
const VOID = SCENES[0],
  u = (id, p = 1, i = 0) => createUnit(id, p, i);
describe("共享墨量下的战斗核心", () => {
  test("单位不再创建个人资源或冷却状态", () => {
    const x = u("mage");
    assert.equal("sp" in x, false);
    assert.equal("maxSp" in x, false);
    assert.equal("cooldowns" in x, false);
    assert.equal(x.inkMode, true);
  });
  test("技能可用性只检查存活与生命代价", () => {
    const x = u("swordsman"),
      s = x.skills.find((k) => k.name === "剑气");
    assert.equal(canUseSkill(x, s), true);
    x.hp = s.hpCost;
    assert.equal(canUseSkill(x, s), false);
    x.alive = false;
    assert.equal(canUseSkill(x, x.skills[0]), false);
  });
  test("payCosts只支付生命代价且至少保留1HP", () => {
    const x = u("swordsman"),
      s = x.skills.find((k) => k.name === "剑气"),
      before = x.hp;
    payCosts(x, s);
    assert.equal(x.hp, before - s.hpCost);
  });
  test("伤害、护盾与死亡仍走同一公式", () => {
    const a = u("raven"),
      b = u("guardian", 2);
    b.dodge = 0;
    const r = calcDamage(a, b, a.skills[0], VOID);
    assert.ok(r.dmg > 0);
    assert.equal(b.hp, b.maxHp - r.dmg);
  });
  test("扰乱稳定命中并由免疫阻止连锁", () => {
    const a = u("mage"),
      b = u("guardian", 2),
      s = a.skills.find((k) => k.type === "stun");
    assert.equal(resolveStun(a, b, s, VOID).success, true);
    assert.equal(b.disrupted, true);
    assert.equal(resolveStun(a, b, s, VOID).reason, "immune");
  });
  test("自我蓄势技能真实增加锋芒且不需虚构buff", () => {
    const a = u("bladedancer"),
      s = a.skills.find((k) => k.name === "蓄刃");
    resolveSelfBuff(a, null, s, VOID);
    assert.equal(a.critMeter, 45);
  });
  test("腐化爆发消耗层数并造成伤害", () => {
    const a = u("warlock"),
      b = u("guardian", 2);
    applyCorrupt(b, 3);
    const before = b.hp,
      r = applyCorruptBurst(
        a,
        [b],
        a.skills.find((k) => k.type === "corruptBurst"),
      );
    assert.ok(r.totalDmg > 0);
    assert.ok(b.hp < before);
    assert.equal(
      b.debuffs.some((d) => d.type === "corrupt"),
      false,
    );
  });
  test("净化清除扰乱与负面并治疗", () => {
    const a = u("priest"),
      b = u("guardian");
    b.hp -= 20;
    b.disrupted = true;
    b.debuffs.push({ type: "poison", dur: 2, value: 4 });
    const r = applyCleanse(
      b,
      a.skills.find((k) => k.type === "cleanse"),
    );
    assert.ok(r.removed >= 2);
    assert.equal(b.disrupted, false);
    assert.equal(b.debuffs.length, 0);
    assert.ok(r.healed > 0);
  });
  test("所有存活单位的开始事件可独立推进", () => {
    const a = u("mage"),
      before = a.crit,
      r = processStartOfTurn(a, { allies: [a], round: 1 });
    assert.ok(a.crit > before);
    assert.equal(r.passiveEvent.effect, "critStack");
  });
  test("鼓姬被动只治疗生命比例最低的受伤队友", () => {
    const a = u("drummer"),
      b = u("guardian", 1, 1),
      c = u("raven", 1, 2);
    b.hp -= 20;
    c.hp -= 20;
    const before = [b.hp, c.hp];
    triggerPassive("onTurnStart", a, { allies: [a, b, c] });
    assert.equal(b.hp, before[0]);
    assert.equal(c.hp, before[1] + 5);
  });
});
