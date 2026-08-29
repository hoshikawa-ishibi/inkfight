// BOSS 阶段的规则测试（COMBAT_PLAN.md 任务 4）。
//
// 墨皇原来只是「术士 + 高属性」，玩家的判断和打普通术士一模一样——
// 这就是用户说的「墨皇纯看运气」。阶段化把他从属性怪变成一道题：
// 三个阶段考三种不同的能力，而且每个都有解。
//
// 这里锁的是**规则**，不是数值。数值归 campaign-check.mjs 校准。
import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  createUnit, bossPhase, actionsFor, sealSkill, canUseSkill, processStartOfTurn,
} from '../combat.js';
import { CAMPAIGN_STAGES } from '../campaign.js';

const PHASES = [
  { at: 1.00, name: '书写', actions: 1 },
  { at: 0.66, name: '涂改', actions: 2 },
  { at: 0.33, name: '重写', actions: 1, sealSkill: 2 },
];

function boss(hpFrac = 1){
  const u = createUnit('warlock', 2, 0, { hp: 100, bossPhases: PHASES });
  u.hp = Math.round(100 * hpFrac);
  return u;
}

describe('bossPhase：按血量比例切段', () => {
  test('满血 → 第一阶段', () => {
    assert.equal(bossPhase(boss(1.0), PHASES).name, '书写');
    assert.equal(bossPhase(boss(0.9), PHASES).name, '书写');
  });

  test('跌破 66% → 第二阶段', () => {
    assert.equal(bossPhase(boss(0.66), PHASES).name, '涂改');
    assert.equal(bossPhase(boss(0.40), PHASES).name, '涂改');
  });

  test('跌破 33% → 第三阶段', () => {
    assert.equal(bossPhase(boss(0.33), PHASES).name, '重写');
    assert.equal(bossPhase(boss(0.05), PHASES).name, '重写');
  });

  test('没有阶段表的普通单位返回 null（绝大多数单位走这条路）', () => {
    assert.equal(bossPhase(createUnit('swordsman', 1, 0), null), null);
    assert.equal(bossPhase(createUnit('swordsman', 1, 0), []), null);
  });
});

describe('actionsFor：这一侧回合行动几次', () => {
  test('普通单位恒为 1', () => {
    assert.equal(actionsFor(createUnit('swordsman', 1, 0)), 1);
  });

  test('阶段二「涂改」是 2 次，其余阶段 1 次', () => {
    assert.equal(actionsFor(boss(1.0)), 1);
    assert.equal(actionsFor(boss(0.5)), 2);
    assert.equal(actionsFor(boss(0.2)), 1);
  });
});

describe('sealSkill：抹掉对方一个技能', () => {
  test('封印之后那个技能真的放不出来了', () => {
    const victim = createUnit('swordsman', 1, 0);
    victim.sp = 999;
    const name = sealSkill(victim, 2);
    assert.ok(name, '应当封印到一个技能');
    const sealed = victim.skills.find(s => s.name === name);
    assert.equal(canUseSkill(victim, sealed), false, `「${name}」应当被封住`);
  });

  test('封印走的是冷却机制，所以会按回合自己解开', () => {
    const victim = createUnit('swordsman', 1, 0);
    victim.sp = 999;
    const name = sealSkill(victim, 2);
    const sealed = victim.skills.find(s => s.name === name);
    processStartOfTurn(victim, {});
    assert.equal(canUseSkill(victim, sealed), false, '第 1 回合仍被封');
    processStartOfTurn(victim, {});
    assert.equal(canUseSkill(victim, sealed), false, '第 2 回合仍被封');
    processStartOfTurn(victim, {});
    assert.equal(canUseSkill(victim, sealed), true, '第 3 回合应当解封');
  });

  test('挑的是威胁最大的技能，不是随机抹', () => {
    const victim = createUnit('swordsman', 1, 0);
    victim.sp = 999;
    // 剑士里最贵最重的是「破甲突刺」（cost 35 / power 2.1）
    assert.equal(sealSkill(victim, 2), '破甲突刺');
  });

  test('已经全被封住时返回 null，不抛异常', () => {
    const victim = createUnit('swordsman', 1, 0);
    victim.skills.forEach(s => { victim.cooldowns[s.name] = 5; });
    assert.equal(sealSkill(victim, 2), null);
  });
});

describe('processStartOfTurn 的阶段事件', () => {
  test('进入新阶段时报一次，同一阶段内不重复报', () => {
    const u = boss(1.0);
    const first = processStartOfTurn(u, {});
    assert.ok(first.phaseEvent, '第一次应当报出当前阶段');
    assert.equal(first.phaseEvent.name, '书写');
    const again = processStartOfTurn(u, {});
    assert.equal(again.phaseEvent, null, '同一阶段内不该重复报');
    u.hp = 50;
    const changed = processStartOfTurn(u, {});
    assert.equal(changed.phaseEvent && changed.phaseEvent.name, '涂改');
  });

  test('第三阶段每回合抹掉对面一个技能，挑攻击力最高的人下手', () => {
    const u = boss(0.2);
    const weak = createUnit('priest', 1, 0);      // atk 10
    const strong = createUnit('berserker', 1, 1); // atk 19
    const r = processStartOfTurn(u, { foes: [weak, strong] });
    assert.ok(r.sealed, '第三阶段应当封印');
    assert.equal(r.sealed.victim.charId, 'berserker', '该挑威胁最大的那个');
  });

  test('前两个阶段不封印', () => {
    const foes = [createUnit('swordsman', 1, 0)];
    assert.equal(processStartOfTurn(boss(1.0), { foes }).sealed, null);
    assert.equal(processStartOfTurn(boss(0.5), { foes }).sealed, null);
  });
});

describe('关卡数据接得上', () => {
  test('最终关的墨皇确实带着三阶段配置', () => {
    const stage = CAMPAIGN_STAGES.find(s => s.id === 8);
    const king = stage.enemy[0];
    assert.ok(Array.isArray(king.bossPhases), '墨皇应当配了 bossPhases');
    assert.equal(king.bossPhases.length, 3);
    // createUnit 必须把它带进单位里，否则规则全部落空且不报错
    const u = createUnit(king.id, 2, 0, king);
    assert.ok(u.bossPhases, 'createUnit 要把 bossPhases 透传到单位上');
    assert.equal(bossPhase(u, u.bossPhases).name, '书写');
  });
});
