import test from "node:test";
import assert from "node:assert/strict";
import {
  critGuidePresentation,
  critMeterPresentation,
  critSkillPresentation,
} from "../src/view/tactical.js";

test("锋芒展示保留超过100的真实数值，同时把进度条封顶", () => {
  const view = critMeterPresentation({ critMeter: 138 });
  assert.equal(view.label, "138/100");
  assert.equal(view.fillPercent, 100);
  assert.equal(view.overflow, 38);
  assert.equal(view.ready, true);
});

test("技能重击提示复用核心判定，且不会把非攻击技能标成重击", () => {
  const actor = { critMeter: 72, crit: 18 };
  const attack = critSkillPresentation(actor, { power: 1.5, crit: 10 });
  const charge = critSkillPresentation(actor, { type: "selfBuff", critCharge: 45 });
  assert.equal(attack.triggersCrit, true);
  assert.equal(attack.label, "首段必定重击 ×1.5");
  assert.equal(charge.damaging, false);
  assert.equal(charge.triggersCrit, false);
});

test("多段技能标出跨过100的具体段数", () => {
  const actor = { critMeter: 60, crit: 12 };
  const view = critSkillPresentation(actor, { power: 2.5, hits: 4 });
  assert.equal(view.triggersCrit, true);
  assert.equal(view.firstCritHit, 4);
  assert.equal(view.label, "第4段触发重击 ×1.5");
  assert.equal(view.projected, 8);
});

test("角色常驻提示列出当前可重击技能并使用核心倍率", () => {
  const actor = {
    critMeter: 85,
    crit: 10,
    skills: [
      { name: "轻击", power: 1 },
      { name: "蓄力斩", power: 2, crit: 10 },
      { name: "凝神", type: "selfBuff", critCharge: 30 },
    ],
  };
  const view = critGuidePresentation(actor);
  assert.deepEqual(view.readySkills, ["蓄力斩"]);
  assert.match(view.rule, /100 必定重击 ×1\.5/);
  assert.equal(view.state, "蓄力斩：可触发重击 ×1.5");
});
