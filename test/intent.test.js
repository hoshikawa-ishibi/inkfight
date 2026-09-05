// 承诺制的契约测试（COMBAT_PLAN.md 任务 1）。
//
// 这三组断言锁住的是**玩家能不能信任预告**：
//   1. nextActor 和真实回合流程读同一份规则（预告的是谁，动的就是谁）
//   2. 承诺被原样兑现——即使已经变成臭棋
//   3. 三种失效情况各自的处理方式
//
// 第 2 条尤其重要：任何「AI 发现情况变了就重新决策」的优化都会让预告失效，
// 玩家针对它做的所有布置都白费。那正是本次重做要消灭的东西。
import { test, describe } from "node:test";
import assert from "node:assert";
import { createUnit } from "../src/core/combat.js";
import {
  nextActor,
  makeIntent,
  resolveIntent,
  estimateDamage,
} from "../src/core/intent.js";
import { scoreSkill } from "../src/ai/ai-scoring.js";

const mk = (id, player, slot) => createUnit(id, player, slot);

describe("nextActor：预告的是谁，动的就是谁", () => {
  test("两个都活着且上回合有人动过 → 轮到另一个", () => {
    const a = mk("swordsman", 2, 0),
      b = mk("mage", 2, 1);
    assert.strictEqual(nextActor([a, b], a.id).id, b.id);
    assert.strictEqual(nextActor([a, b], b.id).id, a.id);
  });

  test("本方还没动过 → 第一个", () => {
    const a = mk("swordsman", 2, 0),
      b = mk("mage", 2, 1);
    assert.strictEqual(nextActor([a, b], null).id, a.id);
  });

  test("上一个行动的已阵亡 → 落到还活着的那个，不返回 null", () => {
    const a = mk("swordsman", 2, 0),
      b = mk("mage", 2, 1);
    a.alive = false;
    assert.strictEqual(nextActor([a, b], b.id).id, b.id);
  });

  test("全灭 → null", () => {
    const a = mk("swordsman", 2, 0);
    a.alive = false;
    assert.strictEqual(nextActor([a], null), null);
  });
});

describe("makeIntent / estimateDamage", () => {
  test("预估伤害把目标减防折算进去了（不能拿裸攻击力糊弄玩家）", () => {
    const atk = mk("swordsman", 2, 0);
    const soft = mk("mage", 1, 0); // def 3
    const hard = mk("guardian", 1, 1); // def 9
    const skill = atk.skills[0];
    const vs1 = estimateDamage(atk, skill, soft, null);
    const vs2 = estimateDamage(atk, skill, hard, null);
    assert.ok(vs2 < vs1, `打高防应当更低：${vs2} 应 < ${vs1}`);
  });

  test("无伤害技能的预估是 null，不是 0（UI 靠它决定显不显示数字）", () => {
    const p = mk("priest", 2, 0);
    const heal = p.skills.find((s) => s.type === "heal");
    assert.strictEqual(estimateDamage(p, heal, null, null), null);
  });

  test("意图存的是 id 不是对象引用（单位会死，引用会认错人）", () => {
    const a = mk("swordsman", 2, 0),
      t = mk("mage", 1, 0);
    const it = makeIntent(a, { skill: a.skills[0], target: t }, null);
    assert.strictEqual(it.unitId, a.id);
    assert.strictEqual(it.targetId, t.id);
  });
});

describe("resolveIntent：承诺必须被兑现", () => {
  test("原样兑现——哪怕目标已经开了盾、这步棋变臭了", () => {
    const a = mk("swordsman", 2, 0);
    const t = mk("mage", 1, 0),
      other = mk("priest", 1, 1);
    const big = a.skills[3]; // 破甲突刺
    const it = makeIntent(a, { skill: big, target: t }, null);
    t.shield = 500; // 玩家开了个大盾，现在打它很亏
    const r = resolveIntent(a, it, [t, other], [a]);
    assert.strictEqual(r.skill, big, "技能不许被换掉");
    assert.strictEqual(r.target.id, t.id, "目标不许被换掉");
    assert.strictEqual(r.retargeted, false);
    assert.strictEqual(r.fellBack, false);
  });

  test("目标已阵亡 → 只重解目标，技能不变", () => {
    const a = mk("swordsman", 2, 0);
    const t = mk("mage", 1, 0),
      other = mk("priest", 1, 1);
    const big = a.skills[3];
    const it = makeIntent(a, { skill: big, target: t }, null);
    t.alive = false;
    const r = resolveIntent(a, it, [other], [a]);
    assert.strictEqual(r.skill, big, "技能仍然不许被换掉");
    assert.strictEqual(r.target.id, other.id);
    assert.strictEqual(r.retargeted, true);
  });

  test("HP 不够付 hpCost → 退化为普攻", () => {
    const s = mk("swordsman", 2, 0);
    const t = mk("mage", 1, 0);
    const qi = s.skills.find((k) => k.hpCost); // 剑气：hpCost 18
    assert.ok(qi, "剑士应当有一个自损换蓝的技能");
    const it = makeIntent(s, { skill: qi, target: null }, null);
    s.hp = 10; // 玩家把它打到付不起了
    const r = resolveIntent(s, it, [t], [s]);
    assert.strictEqual(r.skill, s.skills[0]);
    assert.strictEqual(r.fellBack, true);
  });

  test("意图属于别的单位 → 返回 null，让调用方现算", () => {
    const a = mk("swordsman", 2, 0),
      b = mk("mage", 2, 1),
      t = mk("priest", 1, 0);
    const it = makeIntent(a, { skill: a.skills[0], target: t }, null);
    assert.strictEqual(resolveIntent(b, it, [t], [a, b]), null);
  });

  test("没有意图 → 返回 null", () => {
    const a = mk("swordsman", 2, 0),
      t = mk("mage", 1, 0);
    assert.strictEqual(resolveIntent(a, null, [t], [a]), null);
  });

  test("makeIntent 造出来的对象，scoreSkill 必须真的读得懂", () => {
    // 这条是**契约测试**，专门防字段名漂移。
    // 第一版 ai-scoring.js 读的是 `threat.dmg`，而 makeIntent 存的是 `estDmg`，
    // 于是威胁值恒为 0、防御技能一个都没救活——**不报错，只是没效果**，
    // 光看单测和跑游戏都发现不了，是靠埋点统计才挖出来的。
    // 用真对象做端到端断言，这类漂移下次会当场失败。
    const foe = createUnit("warlock", 2, 0);
    const me = createUnit("assassin", 1, 0);
    const ally = createUnit("priest", 1, 1);
    // 攻击力拉高，让这一击**明确地**比自己一回合的输出更值钱。
    // 原本用裸术士打出来只有 28，而刺客一刀值 30——那种情况下不闪才是对的，
    // 断言反而会挂。边界附近不适合拿来锁契约。
    foe.atk = 40;
    const big = foe.skills.find((k) => k.type === "drain"); // 灵魂收割
    const it = makeIntent(foe, { skill: big, target: me }, null);
    assert.ok(
      it.estDmg > 60,
      `这一击应当足够重才有讨论价值，实际 ${it.estDmg}`,
    );

    const opts = { tempo: 1, teamwork: 1, threat: it };
    const dodge = me.skills.find((s) => s.type === "dodge");
    const attack = me.skills.find((s) => s.name === "暗影突袭");
    const dodgeScore = scoreSkill(me, dodge, [foe], [me, ally], null, opts);
    const attackScore = scoreSkill(me, attack, [foe], [me, ally], null, opts);
    assert.ok(
      dodgeScore > attackScore,
      `已知有一记 ${it.estDmg} 伤害要落在自己头上时，闪避应当压过输出：` +
        `闪避 ${dodgeScore.toFixed(1)} vs 输出 ${attackScore.toFixed(1)}`,
    );

    // 没有情报时则相反——防御是赌博，该扣机会成本
    const blind = { tempo: 1, teamwork: 1, threat: null };
    assert.ok(
      scoreSkill(me, dodge, [foe], [me, ally], null, blind) <
        scoreSkill(me, attack, [foe], [me, ally], null, blind),
      "没有情报时闪避不该压过输出",
    );
  });

  test("AoE 技能（目标为 null）也能兑现，不抛异常", () => {
    const w = mk("warlock", 2, 0),
      t = mk("mage", 1, 0);
    const plague = w.skills.find((k) => k.type === "plague");
    const it = makeIntent(w, { skill: plague, target: null }, null);
    const r = resolveIntent(w, it, [t], [w]);
    assert.strictEqual(r.skill, plague);
    assert.strictEqual(r.retargeted, false);
  });
});
