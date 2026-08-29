import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createUnit, getEffectiveAtk, previewDmg, applyTurnRegen, handleDeath,
  triggerPassive, processStartOfTurn, calcDamage, calcStun, canInterrupt, interruptNeed, willCrit,
  applyCorrupt, applyPlague, applyCorruptBurst, countCorrupt, MAX_CORRUPT_STACKS,
  needsEnemyTarget, AOE_TYPES, resolveSelfBuff, applyStageMod, unitSpec
} from '../combat.js';
import { CHARACTERS } from '../data.js';

function makeUnit(overrides={}){
  return Object.assign({
    id:'u1', charId:'test', name:'测试单位', player:1, color:'#fff', weapon:'sword',
    maxHp:100, hp:100, maxSp:100, sp:100, atk:20, def:0, crit:0, dodge:0, spRegen:10,
    skills:[], passive:null, passiveStacks:0,
    alive:true, shield:0, buffs:[], debuffs:[], stunned:false, dodging:false, undying:0,
    interruptImmune:0, critMeter:0,
    pose:'idle', blink:0
  }, overrides);
}

function withRandom(value, fn){
  const orig = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = orig; }
}

describe('calcDamage', () => {
  test('基础伤害 = atk * power，无防御时不打折', () => {
    const actor = makeUnit({atk:20});
    const target = makeUnit({def:0});
    const r = calcDamage(actor, target, {power:1}, null);
    assert.equal(r.dodged, false);
    assert.equal(r.dmg, 20);
    assert.equal(target.hp, 80);
  });

  test('防御减伤曲线 def/(def+50)', () => {
    const actor = makeUnit({atk:20});
    const target = makeUnit({def:50}); // defReduce = 0.5
    const r = calcDamage(actor, target, {power:1}, null);
    assert.equal(r.dmg, 10);
  });

  test('target.dodging 标记必定闪避，且不消耗任何随机数判定暴击', () => {
    const actor = makeUnit();
    const target = makeUnit({dodging:true});
    const r = calcDamage(actor, target, {power:1}, null);
    assert.equal(r.dodged, true);
    assert.equal(r.dmg, 0);
    assert.equal(target.dodging, false, 'dodging 状态用后应清除');
    assert.equal(target.hp, 100, '闪避不掉血');
  });

  test('暴击 1.5 倍伤害', () => {
    const actor = makeUnit({atk:20, crit:100});
    const target = makeUnit();
    const r = withRandom(0, () => calcDamage(actor, target, {power:1}, null));
    assert.equal(r.isCrit, true);
    assert.equal(r.dmg, 30);
  });

  test('defDown 目标额外 1.2 倍', () => {
    const actor = makeUnit({atk:20});
    const defDown = makeUnit({debuffs:[{type:'defDown', dur:1}]});
    assert.equal(calcDamage(actor, defDown, {power:1}, null).dmg, 24);
  });

  test('场景 damageUp 加成 1.15 倍', () => {
    const actor = makeUnit({atk:20});
    const target = makeUnit();
    const r = calcDamage(actor, target, {power:1}, {buff:'damageUp'});
    assert.equal(r.dmg, 23); // floor(20*1.15)=23
  });

  test('护盾先吸收伤害，再扣血；返回吸收量', () => {
    const actor = makeUnit({atk:20});
    const target = makeUnit({shield:5});
    const r = calcDamage(actor, target, {power:1}, null);
    assert.equal(r.shieldAbsorbed, 5);
    assert.equal(r.dmg, 15);
    assert.equal(target.shield, 0);
    assert.equal(target.hp, 85);
  });

  test('dot/defDown/selfHeal 技能字段会附加对应状态', () => {
    const actor = makeUnit({atk:20, hp:50});
    const target = makeUnit();
    const skill = {power:1, dot:5, dotDur:3, debuff:'defDown', debuffDur:2, selfHeal:10};
    const r = calcDamage(actor, target, skill, null);
    assert.equal(r.dotApplied, true);
    assert.ok(target.debuffs.some(d=>d.type==='poison' && d.value===5 && d.dur===3));
    assert.ok(target.debuffs.some(d=>d.type==='defDown' && d.dur===2));
    assert.equal(r.selfHeal, 10);
    assert.equal(actor.hp, 60);
  });

  test('atkUp1 buff 生效一次后被消耗', () => {
    const actor = makeUnit({atk:20, buffs:[{type:'atkUp1', dur:1, value:0.5}]});
    const target = makeUnit();
    const r = calcDamage(actor, target, {power:1}, null);
    assert.equal(r.dmg, 30); // 20*1.5
    assert.equal(actor.buffs.length, 0);
  });

  test('斩杀目标：killed=true，被 undying 保命时 undying=true 且不视为死亡', () => {
    const actor = makeUnit({atk:1000});
    const dying = makeUnit({hp:10});
    const r1 = calcDamage(actor, dying, {power:1}, null);
    assert.equal(r1.killed, true);
    assert.equal(dying.alive, false);

    const saved = makeUnit({hp:10, undying:30});
    const r2 = calcDamage(actor, saved, {power:1}, null);
    assert.equal(r2.killed, false);
    assert.equal(r2.undying, true);
    assert.equal(saved.alive, true);
    assert.equal(saved.hp, 30);
  });

  test('造成伤害时触发 onDamageDealt/onTakeDamage/onCrit 被动，事件带在返回值里', () => {
    const actor = makeUnit({
      atk:20, crit:100,
      passive:{name:'剑意', trigger:'onCrit', effect:'spGain', value:8}, sp:50
    });
    const target = makeUnit();
    const r = withRandom(0, () => calcDamage(actor, target, {power:1}, null));
    assert.equal(actor.sp, 58);
    const spGainEvent = r.passiveEvents.find(e=>e.event.effect==='spGain');
    assert.ok(spGainEvent, '应包含 spGain 被动事件');
  });
});

// 打断（原「眩晕」）现在是**确定性**的，见 COMBAT_PLAN.md 任务 2a。
// 旧断言锁的是 `basePct + spScale × SP占比` 这个概率公式，
// 那一个骰子实测值 29.6 个百分点的胜率、而玩家的全部技术只值 12.6 点。
// 这一组测试现在锁的是新契约：**同样的局面必须给出同样的结果，不掷骰。**
// 暴击 / 闪避改成确定性（COMBAT_PLAN.md 任务 2b + 2c）。
// 这一组锁的核心是：**同样的输入必须给出同样的输出**。
// 期望伤害要和原来的概率模型一致，否则等于偷偷改了平衡。
describe('暴击蓄能条：确定性，且期望值不变', () => {
  test('攒满 100 才暴击，攒的速度就是暴击率', () => {
    const actor = makeUnit({crit:25, critMeter:0});
    const hits = [];
    for(let i = 0; i < 8; i++){
      hits.push(calcDamage(actor, makeUnit({def:0, dodge:0}), {power:1}).isCrit);
    }
    // 每次 +25，第 4、8 次攒满
    assert.deepEqual(hits, [false,false,false,true,false,false,false,true]);
  });

  test('技能自带暴击加成算进蓄能速度', () => {
    const actor = makeUnit({crit:10, critMeter:0});
    // 10 + 40 = 50/次 → 第 2 次必暴
    assert.equal(calcDamage(actor, makeUnit({def:0,dodge:0}), {power:1, crit:40}).isCrit, false);
    assert.equal(calcDamage(actor, makeUnit({def:0,dodge:0}), {power:1, crit:40}).isCrit, true);
  });

  test('结果与 Math.random 无关', () => {
    const a = makeUnit({crit:50, critMeter:50});
    const b = makeUnit({crit:50, critMeter:50});
    assert.equal(withRandom(0,    () => calcDamage(a, makeUnit({def:0,dodge:0}), {power:1})).isCrit, true);
    assert.equal(withRandom(0.99, () => calcDamage(b, makeUnit({def:0,dodge:0}), {power:1})).isCrit, true);
  });

  test('长期期望伤害与旧的概率模型一致（20% 暴击 = 平均 1.1 倍）', () => {
    const N = 100;
    let total = 0;
    const actor = makeUnit({atk:100, crit:20, critMeter:0});
    for(let i = 0; i < N; i++){
      total += calcDamage(actor, makeUnit({def:0, dodge:0, hp:1e9, maxHp:1e9}), {power:1}).dmg;
    }
    const avg = total / N;
    // 期望 = 100 × (1 + 0.20×0.5) = 110
    assert.ok(Math.abs(avg - 110) < 1, `平均伤害应当接近 110，实际 ${avg}`);
  });

  test('willCrit 和 calcDamage 判断一致（预览与结算必须同口径）', () => {
    const u = makeUnit({crit:30, critMeter:80});
    const s = {power:1};
    assert.equal(willCrit(u, s), true);
    assert.equal(calcDamage(u, makeUnit({def:0,dodge:0}), s).isCrit, true);
    // 打完之后 meter 归到 10，下一刀就不暴了
    assert.equal(willCrit(u, s), false);
  });
});

describe('被动闪避：改成确定性减伤，期望值不变', () => {
  test('10% 闪避 = 恒定少受 10% 伤害，而不是 10% 概率完全免疫', () => {
    const actor = makeUnit({atk:100, crit:0});
    const a = calcDamage(actor, makeUnit({def:0, dodge:0, hp:1e9, maxHp:1e9}), {power:1}).dmg;
    const b = calcDamage(actor, makeUnit({def:0, dodge:10, hp:1e9, maxHp:1e9}), {power:1}).dmg;
    assert.equal(b, Math.floor(a * 0.9));
  });

  test('闪避不再让攻击落空（dodged 恒为 false）', () => {
    const actor = makeUnit({atk:100, crit:0});
    for(let i = 0; i < 50; i++){
      assert.equal(calcDamage(actor, makeUnit({dodge:90}), {power:1}).dodged, false);
    }
  });

  test('主动闪避（「消失」）仍然是完全免疫，且一次性', () => {
    const actor = makeUnit({atk:100, crit:0});
    const t = makeUnit({dodge:0, dodging:true});
    assert.equal(calcDamage(actor, t, {power:1}).dodged, true);
    assert.equal(t.dodging, false, '用掉之后要清掉');
    assert.equal(calcDamage(actor, t, {power:1}).dodged, false);
  });
});

describe('calcStun：确定性打断', () => {
  const SKILL = {spThreshold:0.5};

  test('SP 达到阈值 → 必定打断（连跑 50 次结果完全一致）', () => {
    for(let i = 0; i < 50; i++){
      const target = makeUnit({sp:50, maxSp:100});
      const r = calcStun(makeUnit(), target, SKILL);
      assert.equal(r.success, true);
      assert.equal(target.stunned, true);
    }
  });

  test('SP 低于阈值 → 必定打不断（连跑 50 次结果完全一致）', () => {
    for(let i = 0; i < 50; i++){
      const target = makeUnit({sp:49, maxSp:100});
      const r = calcStun(makeUnit(), target, SKILL);
      assert.equal(r.success, false);
      assert.equal(r.reason, 'lowSp');
      assert.equal(target.stunned, false);
    }
  });

  test('结果与 Math.random 无关（这正是本次改动的全部意义）', () => {
    const hi = makeUnit({sp:80, maxSp:100});
    const lo = makeUnit({sp:10, maxSp:100});
    assert.equal(withRandom(0,    () => calcStun(makeUnit(), hi, SKILL)).success, true);
    hi.stunned = false; hi.interruptImmune = 0;
    assert.equal(withRandom(0.99, () => calcStun(makeUnit(), hi, SKILL)).success, true);
    assert.equal(withRandom(0,    () => calcStun(makeUnit(), lo, SKILL)).success, false);
    assert.equal(withRandom(0.99, () => calcStun(makeUnit(), lo, SKILL)).success, false);
  });

  test('阈值随技能配置走，need 报得出具体数字（UI 要显示它）', () => {
    const t = makeUnit({sp:60, maxSp:200});
    assert.equal(interruptNeed(t, {spThreshold:0.5}), 100);
    assert.equal(calcStun(makeUnit(), t, {spThreshold:0.5}).need, 100);
    assert.equal(calcStun(makeUnit(), makeUnit({sp:60,maxSp:200}), {spThreshold:0.25}).success, true);
  });

  test('打断后进入免疫期，防止被锁死', () => {
    const t = makeUnit({sp:100, maxSp:100});
    assert.equal(calcStun(makeUnit(), t, SKILL).success, true);
    assert.ok(t.interruptImmune > 0, '成功打断后应进入免疫期');
    t.stunned = false;
    const again = calcStun(makeUnit(), t, SKILL);
    assert.equal(again.success, false);
    assert.equal(again.reason, 'immune');
  });

  test('免疫期按被打断者自己的回合递减', () => {
    const t = makeUnit({sp:100, maxSp:100});
    calcStun(makeUnit(), t, SKILL);
    const start = t.interruptImmune;
    processStartOfTurn(t, {});
    assert.equal(t.interruptImmune, start - 1);
  });

  test('canInterrupt 和 calcStun 判断一致（评分与执行必须同口径）', () => {
    const hi = makeUnit({sp:60, maxSp:100});
    const lo = makeUnit({sp:20, maxSp:100});
    assert.equal(canInterrupt(hi, SKILL), true);
    assert.equal(canInterrupt(lo, SKILL), false);
    assert.equal(calcStun(makeUnit(), hi, SKILL).success, true);
    assert.equal(calcStun(makeUnit(), lo, SKILL).success, false);
  });
});

describe('triggerPassive - 7 种被动效果', () => {
  test('spGain：无条件回复 SP', () => {
    const u = makeUnit({sp:50, passive:{name:'剑意', trigger:'onCrit', effect:'spGain', value:8}});
    const ev = triggerPassive('onCrit', u);
    assert.equal(u.sp, 58);
    assert.equal(ev.effect, 'spGain');
  });

  test('overchargeBuff：SP≥80% 才触发', () => {
    const p = {name:'法力涌动', trigger:'onTurnStart', effect:'overchargeBuff'};
    const low = makeUnit({sp:50, passive:p});
    assert.equal(triggerPassive('onTurnStart', low), null);
    assert.equal(low.buffs.length, 0);

    const high = makeUnit({sp:90, passive:p});
    const ev = triggerPassive('onTurnStart', high);
    assert.ok(ev);
    assert.ok(high.buffs.some(b=>b.type==='atkUp'));
  });

  test('allyHeal：只治疗 HP<30% 的友军', () => {
    const p = {name:'圣光', trigger:'onTurnStart', effect:'allyHeal', value:20};
    const u = makeUnit({passive:p});
    const low = makeUnit({id:'low', hp:10, maxHp:100});
    const healthy = makeUnit({id:'healthy', hp:80, maxHp:100});
    const ev = triggerPassive('onTurnStart', u, {allies:[low, healthy]});
    assert.equal(low.hp, 30);
    assert.equal(healthy.hp, 80);
    assert.equal(ev.targets.length, 1);
  });

  test('critStack：叠层有上限，超过上限不再触发', () => {
    const p = {name:'鹰眼', trigger:'onTurnStart', effect:'critStack', value:3, maxStacks:2};
    const u = makeUnit({crit:10, passive:p});
    assert.ok(triggerPassive('onTurnStart', u));
    assert.equal(u.crit, 13);
    assert.ok(triggerPassive('onTurnStart', u));
    assert.equal(u.crit, 16);
    assert.equal(triggerPassive('onTurnStart', u), null, '达到上限后不再触发');
    assert.equal(u.crit, 16);
  });

  test('reflect：按比例反弹伤害，可反杀攻击者', () => {
    const p = {name:'铁甲反弹', trigger:'onTakeDamage', effect:'reflect', value:0.5};
    const u = makeUnit({passive:p});
    const attacker = makeUnit({hp:5});
    const ev = triggerPassive('onTakeDamage', u, {attacker, dmg:20});
    assert.equal(ev.amount, 10);
    assert.equal(attacker.hp, 0);
    assert.equal(ev.died, true);
    assert.equal(attacker.alive, false);
  });

  test('bloodRage：HP<40% 才触发，且有叠层上限', () => {
    const p = {name:'血怒', trigger:'onTurnStart', effect:'bloodRage', value:0.3, maxStacks:1};
    const healthy = makeUnit({hp:80, maxHp:100, passive:p});
    assert.equal(triggerPassive('onTurnStart', healthy), null);

    const hurt = makeUnit({hp:30, maxHp:100, passive:p});
    const ev = triggerPassive('onTurnStart', hurt);
    assert.ok(ev);
    assert.ok(hurt.buffs.some(b=>b.type==='atkUp' && b.value===0.3));
  });

  test('corruptBonus：按腐化层数造成额外伤害，可致命', () => {
    const p = {name:'腐化侵蚀', trigger:'onDamageDealt', effect:'corruptBonus'};
    const warlock = makeUnit({passive:p});
    const noCorrupt = makeUnit({debuffs:[]});
    assert.equal(triggerPassive('onDamageDealt', warlock, {target:noCorrupt}), null, '无腐化层不触发');

    const corrupted = makeUnit({hp:10, debuffs:[{type:'corrupt', dur:99, value:2}]});
    const ev = triggerPassive('onDamageDealt', warlock, {target:corrupted});
    assert.equal(ev.amount, 16); // 2层 * 8
    assert.equal(corrupted.hp, 0);
    assert.equal(ev.died, true);
    assert.equal(ev.killer, warlock, '击杀者应记为被动持有者，供上层记功');
  });
});

describe('processStartOfTurn', () => {
  test('中毒扣血 + 狂暴扣血 + buff/debuff 到期衰减', () => {
    const u = makeUnit({
      hp:100,
      debuffs:[{type:'poison', dur:1, value:5}],
      buffs:[{type:'berserk', dur:1, value:0.4}, {type:'atkUp', dur:2, value:0.2}]
    });
    const r = processStartOfTurn(u);
    assert.equal(u.hp, 87); // 100-5(poison)-8(berserk)
    assert.equal(r.poison.dmg, 5);
    assert.equal(r.berserk.dmg, 8);
    assert.equal(u.debuffs.length, 0, 'dur 用尽的 debuff 应被移除');
    assert.equal(u.buffs.length, 1, 'berserk(dur1) 到期移除，atkUp(dur2) 仍保留一回合');
    assert.equal(u.buffs[0].type, 'atkUp');
  });

  test('回合开始被动事件会一并返回', () => {
    const u = makeUnit({sp:90, passive:{name:'法力涌动', trigger:'onTurnStart', effect:'overchargeBuff'}});
    const r = processStartOfTurn(u);
    assert.ok(r.passiveEvent);
    assert.equal(r.passiveEvent.effect, 'overchargeBuff');
  });

  test('中毒致命时正确报告死亡', () => {
    const u = makeUnit({hp:3, debuffs:[{type:'poison', dur:1, value:5}]});
    const r = processStartOfTurn(u);
    assert.equal(r.poison.died, true);
    assert.equal(u.alive, false);
  });
});

describe('腐化机制：applyCorrupt / applyPlague / applyCorruptBurst', () => {
  test('applyCorrupt 层数累加', () => {
    const target = makeUnit();
    assert.equal(applyCorrupt(target, 2), 2);
    assert.equal(applyCorrupt(target, 1), 3);
  });

  test('腐化层不会超过上限（防止「腐化侵蚀」被动无限滚雪球）', () => {
    const target = makeUnit();
    for(let i=0;i<10;i++) applyCorrupt(target, 2);
    assert.equal(countCorrupt(target), MAX_CORRUPT_STACKS);
  });

  test('已达上限时再施加腐化不会增加层数', () => {
    const target = makeUnit();
    applyCorrupt(target, MAX_CORRUPT_STACKS);
    assert.equal(applyCorrupt(target, 3), MAX_CORRUPT_STACKS);
  });

  test('部分溢出时只吃到上限为止', () => {
    const target = makeUnit();
    applyCorrupt(target, MAX_CORRUPT_STACKS - 1);
    assert.equal(applyCorrupt(target, 5), MAX_CORRUPT_STACKS, '只应补满 1 层');
  });

  test('腐化爆发清空层数后可以重新叠满（爆发→再叠的循环成立）', () => {
    const actor = makeUnit();
    const target = makeUnit({maxHp:9999, hp:9999});
    applyCorrupt(target, MAX_CORRUPT_STACKS);
    applyCorruptBurst(actor, [target], {dmgPerStack:22});
    assert.equal(countCorrupt(target), 0, '爆发后应清空');
    assert.equal(applyCorrupt(target, MAX_CORRUPT_STACKS), MAX_CORRUPT_STACKS, '应能重新叠满');
  });

  test('applyPlague 同时施加腐化与中毒', () => {
    const target = makeUnit();
    const total = applyPlague(target, {corrupt:2, dot:7, dotDur:3});
    assert.equal(total, 2);
    assert.ok(target.debuffs.some(d=>d.type==='corrupt' && d.value===2));
    assert.ok(target.debuffs.some(d=>d.type==='poison' && d.value===7 && d.dur===3));
  });

  test('applyCorruptBurst：按层数结算伤害并清空腐化，无腐化的目标不计入命中', () => {
    const actor = makeUnit();
    const stacked = makeUnit({id:'a', debuffs:[{type:'corrupt', dur:99, value:3}]});
    const clean = makeUnit({id:'b', debuffs:[]});
    const { hits, totalDmg } = applyCorruptBurst(actor, [stacked, clean], {dmgPerStack:22});
    assert.equal(hits.length, 1);
    assert.equal(hits[0].dmg, 66); // 3*22
    assert.equal(totalDmg, 66);
    assert.equal(stacked.hp, 34);
    assert.equal(stacked.debuffs.some(d=>d.type==='corrupt'), false, '结算后腐化层应清空');
  });

  test('applyCorruptBurst 可致命并在结果里报告', () => {
    const actor = makeUnit();
    const target = makeUnit({hp:10, debuffs:[{type:'corrupt', dur:99, value:5}]});
    const { hits } = applyCorruptBurst(actor, [target], {dmgPerStack:22});
    assert.equal(hits[0].died, true);
    assert.equal(target.alive, false);
  });
});

describe('回归测试：术士（warlock）在无头模拟中不再静默失效', () => {
  // 这是本次重构要修的既有 bug：旧版 sim.js 手抄了一份战斗逻辑，
  // 遗漏了 corruptBonus 被动、plague/corruptBurst 技能类型、以及
  // damage/drain 技能的 skill.corrupt 字段处理，导致术士整套机制
  // 在"平衡测试"模式里从未真正生效过。现在 sim.js 和 battle.js
  // 共用 combat.js，这里直接用真实角色数据验证机制确实生效。
  const warlockDef = CHARACTERS.find(c=>c.id==='warlock');

  test('术士角色数据存在且带有腐化爆发/瘟疫技能与腐化侵蚀被动（回归测试的前提）', () => {
    assert.ok(warlockDef, '未找到术士角色数据，回归测试前提不成立');
    assert.ok(warlockDef.skills.some(s=>s.type==='corruptBurst'));
    assert.ok(warlockDef.skills.some(s=>s.type==='plague'));
    assert.equal(warlockDef.passive.effect, 'corruptBonus');
  });

  test('瘟疫技能通过 applyPlague 真正施加腐化层（旧 sim.js 里是死代码分支）', () => {
    const plague = warlockDef.skills.find(s=>s.type==='plague');
    const target = createUnit('swordsman', 2, 0);
    const total = applyPlague(target, plague);
    assert.equal(total, plague.corrupt);
    assert.ok(target.debuffs.some(d=>d.type==='poison'));
  });

  test('腐化爆发按之前施加的层数真正结算伤害（旧 sim.js 里是死代码分支）', () => {
    const corruptBurst = warlockDef.skills.find(s=>s.type==='corruptBurst');
    const warlock = createUnit('warlock', 1, 0);
    const target = createUnit('swordsman', 2, 0);
    target.debuffs.push({type:'corrupt', dur:99, value:3});
    const { hits, totalDmg } = applyCorruptBurst(warlock, [target], corruptBurst);
    assert.equal(totalDmg, 3 * corruptBurst.dmgPerStack);
    assert.equal(hits.length, 1);
    assert.equal(target.hp, target.maxHp - totalDmg);
  });

  test('腐化侵蚀被动在造成伤害时真正触发额外伤害（旧 sim.js 里被动列表缺这一项）', () => {
    const warlock = createUnit('warlock', 1, 0);
    const target = createUnit('swordsman', 2, 0);
    target.debuffs.push({type:'corrupt', dur:99, value:2});
    const hpBefore = target.hp;
    const ev = triggerPassive('onDamageDealt', warlock, {target});
    assert.ok(ev, '腐化侵蚀被动应该触发');
    assert.equal(ev.effect, 'corruptBonus');
    assert.equal(target.hp, hpBefore - 2*8);
  });
});

describe('createUnit / getEffectiveAtk / previewDmg / applyTurnRegen', () => {
  test('createUnit 根据角色数据生成完整可用于战斗的单位', () => {
    const u = createUnit('swordsman', 1, 0);
    assert.equal(u.id, '1-0');
    assert.equal(u.alive, true);
    assert.ok(u.skills.length > 0);
  });

  test('getEffectiveAtk 叠加 atkUp/berserk buff', () => {
    const u = makeUnit({atk:20, buffs:[{type:'atkUp', dur:1, value:0.5}]});
    assert.equal(getEffectiveAtk(u), 30);
  });

  test('previewDmg 无伤害技能返回 null，场景加成会反映在预览里', () => {
    const u = makeUnit({atk:20});
    assert.equal(previewDmg(u, {power:0}, null), null);
    assert.equal(previewDmg(u, {power:1}, null), 20);
    assert.equal(previewDmg(u, {power:1}, {buff:'damageUp'}), 23);
  });

  test('applyTurnRegen 按 spRegen 回复，灵泉场景额外 +5', () => {
    const u = makeUnit({sp:50, maxSp:100, spRegen:8});
    applyTurnRegen(u, null);
    assert.equal(u.sp, 58);
    applyTurnRegen(u, {buff:'spRegen'});
    assert.equal(u.sp, 71); // 58+8+5
  });
});

describe('目标分配的一致性（防止「AI 和玩家用同一技能行为不同」再次发生）', () => {
  // 起因：给狂战士「狂暴」加 power（边打边上 buff）时，只改了 battle.js 和 sim.js，
  // 漏了 ai.js，结果 AI 放狂暴不造成伤害、玩家放却会。判断逻辑现已收敛到
  // needsEnemyTarget()，这条测试保证以后任何带 power 的技能都不会漏配目标。
  test('data.js 里每个带 power 的非 AoE 技能都会被分配敌方目标', () => {
    for(const c of CHARACTERS){
      for(const s of c.skills){
        if(!s.power) continue;
        if(AOE_TYPES.includes(s.type)) continue;   // AoE 自行遍历敌人
        assert.ok(needsEnemyTarget(s),
          `${c.name}·${s.name}（type=${s.type}）带 power 却拿不到敌方目标，伤害会静默失效`);
      }
    }
  });

  test('不带 power 的自我增益技能不需要目标', () => {
    assert.equal(needsEnemyTarget({type:'selfBuff', dur:3}), false);
    assert.equal(needsEnemyTarget({type:'shield'}), false);
    assert.equal(needsEnemyTarget({type:'taunt'}), false);
  });

  test('带 power 的自我增益技能：有目标才结算伤害，无目标只上 buff', () => {
    const skill = {type:'selfBuff', buffType:'berserk', dur:3, power:1.0, buffValue:0.4, selfDmg:5};
    const actor = createUnit('berserker',1,0);
    const target = createUnit('swordsman',2,0);
    target.dodge = 0;   // 剑士自带 5% 闪避，不清零这条测试会偶发性失败
    const r = resolveSelfBuff(actor, target, skill, null);
    assert.ok(r.damage && r.damage.dmg > 0, '有目标时应结算伤害');
    assert.equal(actor.buffs.length, 1, 'buff 也要上');
    assert.ok(target.hp < target.maxHp, '目标应该掉血');
  });
});

describe('handleDeath', () => {
  test('undying 触发时保留指定 HP，不算死亡', () => {
    const u = makeUnit({hp:0, undying:40});
    const r = handleDeath(u);
    assert.equal(r.died, false);
    assert.equal(r.undying, true);
    assert.equal(u.hp, 40);
    assert.equal(u.alive, true);
  });

  test('无 undying 时正常死亡', () => {
    const u = makeUnit({hp:0});
    const r = handleDeath(u);
    assert.equal(r.died, true);
    assert.equal(u.alive, false);
  });
});

describe('applyStageMod（战役关卡的属性旋钮）', () => {
  test('mod 为 null 时原样返回，不动任何属性', () => {
    const u = makeUnit({atk:20, maxHp:100, hp:80});
    applyStageMod(u, null);
    assert.equal(u.atk, 20);
    assert.equal(u.maxHp, 100);
    assert.equal(u.hp, 80);
  });

  test('atk / def / spRegen 是乘在原属性上的倍率', () => {
    const u = makeUnit({atk:20, def:10, spRegen:8});
    applyStageMod(u, {atk:1.10, def:0.9, spRegen:1.25});
    assert.equal(u.atk, 22);
    assert.equal(u.def, 9);
    assert.equal(u.spRegen, 10);
  });

  test('hp 同时改 maxHp 并把 hp 拉满——关卡开局不能是残血', () => {
    const u = makeUnit({maxHp:100, hp:60});
    applyStageMod(u, {hp:1.15});
    assert.equal(u.maxHp, 115);
    assert.equal(u.hp, 115);
  });

  test('sp 是「起手蓝量占蓝条的比例」，不是倍率', () => {
    const u = makeUnit({maxSp:80, sp:80});
    applyStageMod(u, {sp:0.5});
    assert.equal(u.sp, 40);
    assert.equal(u.maxSp, 80);
  });

  test('只写了一个字段时，其它属性一律不动', () => {
    const u = makeUnit({atk:20, def:10, maxHp:100, spRegen:8, maxSp:60, sp:60});
    applyStageMod(u, {hp:1.2});
    assert.equal(u.atk, 20);
    assert.equal(u.def, 10);
    assert.equal(u.spRegen, 8);
    assert.equal(u.sp, 60);
    assert.equal(u.maxHp, 120);
  });
});

describe('createUnit 的 override（战役身份 / 墨皇）', () => {
  test('不传 override 时行为和以前完全一致', () => {
    const u = createUnit('warlock', 2, 0);
    const b = CHARACTERS.find(c => c.id === 'warlock');
    assert.equal(u.name, b.name);
    assert.equal(u.maxHp, b.hp);
    assert.equal(u.atk, b.atk);
    assert.equal(u.passive.name, b.passive.name);
  });

  test('只给 name 时，只有名字变，属性一律照旧', () => {
    const u = createUnit('berserker', 2, 0, { id:'berserker', name:'荒野狂徒·赤牙' });
    const b = CHARACTERS.find(c => c.id === 'berserker');
    assert.equal(u.name, '荒野狂徒·赤牙');
    assert.equal(u.charId, 'berserker');       // 技能/被动仍按角色 id 走
    assert.equal(u.maxHp, b.hp);
    assert.equal(u.atk, b.atk);
  });

  test('墨皇：改属性但沿用术士的技能组和被动', () => {
    const u = createUnit('warlock', 2, 0, { id:'warlock', name:'墨皇', hp:260, sp:130, atk:22, def:8 });
    assert.equal(u.name, '墨皇');
    assert.equal(u.maxHp, 260);
    assert.equal(u.hp, 260);
    assert.equal(u.maxSp, 130);
    assert.equal(u.sp, 130);
    assert.equal(u.atk, 22);
    assert.equal(u.def, 8);
    assert.equal(u.passive.effect, 'corruptBonus');
    assert.equal(u.skills.length, CHARACTERS.find(c=>c.id==='warlock').skills.length);
  });

  test('override 可以把 passive 显式置空', () => {
    const u = createUnit('warlock', 2, 0, { id:'warlock', passive:null });
    assert.equal(u.passive, null);
  });

  test('单位 id 仍由 player/slot 决定，不受 override.id 影响', () => {
    const u = createUnit('warlock', 2, 1, { id:'warlock', name:'墨皇' });
    assert.equal(u.id, '2-1');
  });
});

describe('unitSpec（关卡条目 → [角色id, override]）', () => {
  test('字符串条目：没有 override', () => {
    assert.deepEqual(unitSpec('mage'), ['mage', null]);
  });

  test('对象条目：原样当 override 传下去', () => {
    const e = { id:'mage', name:'焰纹术士·灼' };
    assert.deepEqual(unitSpec(e), ['mage', e]);
  });
});
