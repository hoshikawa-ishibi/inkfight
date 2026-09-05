import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTERS, SCENES } from '../src/data/data.js';
import { createUnit, processStartOfTurn, resolveStun, triggerPassive } from '../src/core/combat.js';
import {
  INK_RULES, prepareInkUnits, inkCost, createInkTurn, inkActionCost,
  previewInkSkill, canInkAct, availableInkUnits, commitInkAction, finishInkTurn
} from '../src/core/ink-turn.js';
import { chooseInkAction } from '../src/ai/ink-ai.js';
import { runInkBattle } from '../tools/ink-sim.js';
import { executeSkill } from '../tools/sim.js';

const VOID = SCENES[0];
const unit = (id, player=1, slot=0, relics=[]) => {
  const u = createUnit(id, player, slot);
  prepareInkUnits([u], relics);
  return u;
};

test('治疗统计只记实际恢复量，满血治疗不刷统计',()=>{
  const actor=unit('priest'),target=unit('swordsman',1,1);
  target.hp=target.maxHp-5;
  const stats={priest:{dmg:0,heals:0,kills:0}},skill=actor.skills.find(s=>s.type==='heal');
  executeSkill(actor,skill,target,VOID,[actor,target],[],stats);
  assert.equal(target.hp,target.maxHp);assert.equal(stats.priest.heals,5);
  executeSkill(actor,skill,target,VOID,[actor,target],[],stats);
  assert.equal(stats.priest.heals,5);
});

describe('prepareInkUnits', () => {
  test('转换所有真实技能且不改共享角色数据', () => {
    const before = JSON.stringify(CHARACTERS);
    const units = CHARACTERS.map((c, i) => createUnit(c.id, 1, i));
    prepareInkUnits(units);

    assert.equal(JSON.stringify(CHARACTERS), before);
    for(const u of units){
      assert.equal(u.inkMode, true);
      assert.equal(u.sp, 0);
      assert.equal(u.maxSp, 0);
      assert.equal(u.spRegen, 0);
      assert.equal(u.skills.length, 4);
      for(const skill of u.skills){
        assert.equal(skill.cost, 0);
        assert.equal(skill.cd, 0);
        assert.ok(inkCost(skill) >= 1 && inkCost(skill) <= 3);
        assert.ok(skill.originalDesc.length > 0);
        assert.doesNotMatch(skill.desc, /SP/i);
      }
      if(u.passive) assert.doesNotMatch(u.passive.desc, /SP/i);
      assert.equal(u.skills[0].inkCost, 1, `${u.name} 的基础技应为1墨`);
    }
  });

  test('八个纯回蓝技能都换成会真实产生效果的技能', () => {
    const ids = ['swordsman','mage','archer','bladedancer','artificer','drummer','shadow','monk'];
    for(const id of ids){
      const original = CHARACTERS.find(c => c.id === id).skills.find(s => s.type === 'healSp');
      const converted = unit(id).skills.find(s => s.name === original.name);
      assert.ok(
        converted.power || converted.shieldAmt || converted.buffType || converted.critCharge,
        `${id}/${original.name} 不能只剩空壳`
      );
      assert.equal(converted.spGain || 0, 0);
    }
  });

  test('SP 被动转换后由现有战斗引擎真正执行', () => {
    const assassin = unit('assassin');
    const beforeMeter = assassin.critMeter;
    triggerPassive('onCrit', assassin);
    assert.ok(assassin.critMeter > beforeMeter);

    const drummer = unit('drummer');
    const ally = unit('guardian', 1, 1);
    ally.hp = Math.floor(ally.maxHp * 0.2);
    const beforeHp = ally.hp;
    processStartOfTurn(drummer, {allies:[drummer, ally]});
    assert.ok(ally.hp > beforeHp);

    const onmyoji = unit('onmyoji');
    const beforeCrit = onmyoji.crit;
    processStartOfTurn(onmyoji, {allies:[onmyoji]});
    assert.ok(onmyoji.crit > beforeCrit);
  });
});

describe('共享墨量行动账本', () => {
  test('默认3墨，fourth遗物为4墨', () => {
    assert.deepEqual(createInkTurn().total, INK_RULES.budget);
    assert.deepEqual(createInkTurn(['fourth']).total, INK_RULES.fourthBudget);
  });

  test('同一角色每个侧回合只能行动一次', () => {
    const actor = unit('swordsman');
    const turn = createInkTurn();
    const first = actor.skills[0];
    assert.ok(commitInkAction(turn, actor, first));
    assert.equal(canInkAct(turn, actor, actor.skills[1]), false);
    assert.equal(commitInkAction(turn, actor, actor.skills[1]), null);
    assert.deepEqual(turn.acted, [actor.id]);
  });

  test('opening只给首招减1墨且不会把技能降到0墨', () => {
    const raven = unit('raven');
    const ally = unit('guardian', 1, 1);
    const turn = createInkTurn(['opening']);
    const finisher = raven.skills.find(s => s.name === '断魂爪');
    assert.equal(inkActionCost(turn, raven, finisher), 2);
    assert.ok(commitInkAction(turn, raven, finisher));
    assert.equal(turn.remaining, 1);
    assert.equal(inkActionCost(turn, ally, ally.skills[0]), 1);
    assert.ok(commitInkAction(turn, ally, ally.skills[0]));
    assert.equal(turn.remaining, 0);
  });

  test('availableInkUnits排除已行动、阵亡和付不起技能的单位', () => {
    const a = unit('raven');
    const b = unit('guardian', 1, 1);
    const c = unit('mage', 1, 2);
    c.alive = false;
    const turn = createInkTurn();
    commitInkAction(turn, a, a.skills[0]);
    turn.remaining = 1;
    b.skills = b.skills.filter(s => s.inkCost > 1);
    assert.deepEqual(availableInkUnits(turn, [a,b,c]), []);
  });
});

describe('遗物产出修正', () => {
  test('heavy和flow只改执行副本，不污染单位技能', () => {
    const raven = unit('raven');
    const claw = raven.skills.find(s => s.name === '断魂爪');
    const originalPower = claw.power;
    const heavyTurn = createInkTurn(['heavy']);
    const preview = previewInkSkill(heavyTurn, raven, claw);
    assert.equal(preview.power, originalPower * INK_RULES.heavyMultiplier);
    assert.equal(claw.power, originalPower);
    assert.equal(heavyTurn.chain.length, 0, '预览不得提交行动');
    const committed = commitInkAction(heavyTurn, raven, claw);
    assert.equal(committed.power, preview.power);
    assert.equal(claw.power, originalPower);

    const team = [unit('guardian',1,0), unit('priest',1,1), unit('swordsman',1,2)];
    const flowTurn = createInkTurn(['flow']);
    commitInkAction(flowTurn, team[0], team[0].skills[0]);
    commitInkAction(flowTurn, team[1], team[1].skills[0]);
    const thirdBase = team[2].skills[0].power;
    const third = commitInkAction(flowTurn, team[2], team[2].skills[0]);
    assert.equal(thirdBase, 1);
    assert.equal(third.power, 1.5, '整数倍率字段 power 必须保留小数');
    assert.equal(third.power, thirdBase * INK_RULES.flowMultiplier);
    assert.equal(team[2].skills[0].power, thirdBase);
  });

  test('flow/heavy只提高承诺的伤害与治疗，不放大护盾、增益或锋芒', () => {
    const team = [unit('guardian',1,0), unit('priest',1,1), unit('artificer',1,2)];
    const turn = createInkTurn(['flow']);
    commitInkAction(turn, team[0], team[0].skills[0]);
    commitInkAction(turn, team[1], team[1].skills[0]);
    const shield = team[2].skills.find(s => s.name === '检修');
    const boosted = previewInkSkill(turn, team[2], shield);
    assert.equal(boosted.outputMultiplier, INK_RULES.flowMultiplier);
    assert.equal(boosted.shieldAmt, shield.shieldAmt);

    const wall = team[2].skills.find(s => s.name === '铁幕');
    const heavyWall = previewInkSkill(createInkTurn(['heavy']), team[2], wall);
    assert.equal(heavyWall.outputMultiplier, INK_RULES.heavyMultiplier);
    assert.equal(heavyWall.shieldAmt, wall.shieldAmt);

    const drummer = unit('drummer',1,2);
    const buffTurn = createInkTurn(['flow']);
    commitInkAction(buffTurn, team[0], team[0].skills[0]);
    commitInkAction(buffTurn, team[1], team[1].skills[0]);
    const rally = drummer.skills.find(s => s.name === '振奋');
    assert.equal(previewInkSkill(buffTurn, drummer, rally).buffValue, rally.buffValue);

    const dancer = unit('bladedancer',1,2);
    const chargeTurn = createInkTurn(['flow']);
    commitInkAction(chargeTurn, team[0], team[0].skills[0]);
    commitInkAction(chargeTurn, team[1], team[1].skills[0]);
    const charge = dancer.skills.find(s => s.name === '蓄刃');
    assert.equal(previewInkSkill(chargeTurn, dancer, charge).critCharge, charge.critCharge);
  });

  test('结束回合的余墨护盾有上限且只能结算一次', () => {
    const team = [unit('guardian'), unit('priest',1,1)];
    const turn = createInkTurn(['reserve']);
    commitInkAction(turn, team[0], team[0].skills[0]); // 剩2墨，reserve翻倍后触顶28
    const amount = finishInkTurn(turn, team);
    assert.equal(amount, INK_RULES.maxEndShieldPerUnit);
    assert.deepEqual(team.map(u => u.shield), [amount, amount]);
    assert.equal(finishInkTurn(turn, team), amount);
    assert.deepEqual(team.map(u => u.shield), [amount, amount]);
  });
});

describe('Ink AI 与模拟器', () => {
  test('打断在inkMode不再读取已经移除的个人SP阈值', () => {
    const actor = unit('mage');
    const target = unit('guardian', 2, 0);
    const stun = actor.skills.find(s => s.type === 'stun');
    assert.equal(target.sp, 0);
    const result = resolveStun(actor, target, stun, VOID);
    assert.equal(result.success, true);
    assert.equal(target.disrupted, true);
  });

  test('AI返回合法且可复现的角色技能目标', () => {
    const allies = [unit('swordsman'), unit('priest',1,1), unit('mage',1,2)];
    const foes = [unit('guardian',2,0), unit('raven',2,1)];
    const turn = createInkTurn();
    const first = chooseInkAction(turn, allies, foes, VOID, {random:()=>0.25, noise:8});
    const second = chooseInkAction(turn, allies, foes, VOID, {random:()=>0.25, noise:8});
    assert.ok(first);
    assert.equal(canInkAct(turn, first.actor, first.skill), true);
    assert.deepEqual(
      [first.actor.id, first.skill.name, first.target?.id],
      [second.actor.id, second.skill.name, second.target?.id]
    );
  });

  test('每个单位的状态每侧回合只tick一次', () => {
    const result = runInkBattle(['guardian'], ['guardian'], VOID, {
      maxRounds:1,
      random:()=>0.5,
      beforeBattle({p1}){
        p1[0].debuffs.push({type:'poison', dur:3, value:1});
      }
    });
    const poison = result.p1Units[0].debuffs.find(d => d.type === 'poison');
    assert.equal(poison?.dur, 2);
  });

  test('完整模拟能收束，行动历史证明每轮预算与演员唯一性合法', () => {
    const result = runInkBattle(
      ['raven','mage','priest'],
      ['raven','guardian','herbalist'],
      VOID,
      {random:()=>0.5, maxRounds:80}
    );
    assert.equal(result.timeout, false);
    assert.ok([1,2].includes(result.winner));
    assert.ok(result.actions.length > 0);
    assert.equal(result.finalUnits.length, 6);
    assert.equal(result.finalHP.p1, result.p1Units.reduce((n,u)=>n+u.hp,0));

    const groups = new Map();
    for(const action of result.actions){
      const key = `${action.round}-${action.side}`;
      if(!groups.has(key)) groups.set(key, []);
      groups.get(key).push(action);
    }
    for(const group of groups.values()){
      assert.ok(group.reduce((n,a)=>n+a.cost,0) <= INK_RULES.budget);
      assert.equal(new Set(group.map(a=>a.actorId)).size, group.length);
      assert.equal(group[0].remainingBefore, INK_RULES.budget);
      group.forEach((a,i) => {
        assert.ok(a.cost >= 1 && a.cost <= 3);
        assert.ok(a.remainingAfter >= 0);
        if(i) assert.equal(a.remainingBefore, group[i-1].remainingAfter);
      });
    }
  });
});
