import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { executeSkill } from '../sim.js';
import { createUnit, applyCorrupt } from '../combat.js';
import { CHARACTERS, SCENES } from '../data.js';
import { clamp } from '../state.js';

// 这条测试补的洞和 combat.test.js 完全不同。
//
// combat.test.js 测的是**公式对不对**（伤害算得准不准、腐化叠到几层）。
// 这里测的是更低一层的东西：**executeSkill 那个 switch 到底有没有接住这个技能。**
// 漏一个 case，switch 就一路穿过去，不报错、不崩溃——那个单位白白浪费一回合，
// 安静地存在很久。术士的 plague / corruptBurst 就这么在 sim.js 里静默失效过，
// 几千局里瘟疫一次都没被用过，修复前的所有胜率数据都是错的。
//
// 边界（别高估它）：
//   · 只测 sim.js 那一份。battle.js 依赖 DOM，Node 里 import 不进来。
//     但历史上出问题的一直是 sim.js——battle.js 那份你一玩就看得见，
//     sim.js 那份没人盯，价值就在没人盯的那半边。
//   · 只断言「有东西变了」，不断言「变对了」。数值正确性归 combat.test.js。

const VOID = SCENES[0];            // 墨色虚空：无场景加成，少一个变量

// ── 随机数：直接钉死 ────────────────────────────────────
// 战斗规则里有三处 Math.random（闪避 / 暴击 / 眩晕判定）。不钉死的话
// 这条测试会以百分之几的概率无缘无故变红——**一个偶尔变红的测试等于没有测试**。
// 钉成 0 的效果：必不闪避（配合下面把 dodge 清零）、必暴击、眩晕必中，
// 每一条路径都走进最"有事发生"的那一支。
function withFixedRandom(fn){
  const real = Math.random;
  Math.random = () => 0;
  try { return fn(); } finally { Math.random = real; }
}

// ── 快照 ────────────────────────────────────────────────
function snap(u){
  return {
    hp:u.hp, sp:u.sp, shield:u.shield, alive:u.alive,
    stunned:u.stunned, dodging:u.dodging, undying:u.undying,
    atk:u.atk, crit:u.crit, passiveStacks:u.passiveStacks,
    buffs:u.buffs, debuffs:u.debuffs
  };
}
const snapAll = us => JSON.stringify(us.map(snap));

// 目标是队友还是敌人。其余类型要么打敌人，要么只作用于自己（此时 target 被忽略）。
const ALLY_TARGETED = new Set(['heal', 'cleanse', 'buff']);

// 直接扫 sim.js 源码里的 case 标签。用源码而不是维护一份手写清单，
// 是因为手写清单必然和代码漂移——这个项目已经因为「同一份知识两份实现」
// 出过三次 bug 了。
function handledTypes(){
  const src = fs.readFileSync(new URL('../sim.js', import.meta.url), 'utf8');
  return [...new Set([...src.matchAll(/case +'([a-zA-Z]+)' *:/g)].map(m => m[1]))];
}

// ── 造局面 ──────────────────────────────────────────────
// **这里才是这条测试真正的工作量。** 局面造不对就会误报：
// 满血的人看不出治疗、身上干净的人看不出净化、没有腐化层的敌人
// 让「腐化爆发」什么都不做——而那恰恰是这条测试要抓的现象本身。
function seed(charId, skill){
  const actor = createUnit(charId, 1, 0);
  const ally  = createUnit('priest', 1, 1);
  const foe   = createUnit('guardian', 2, 0);
  const foe2  = createUnit('guardian', 2, 1);

  // 闪避清零：Math.random 钉成 0 之后，`0 < dodge` 恒真，任何带闪避的
  // 单位都会把所有攻击躲光，damage 类技能全都看不出变化。
  [actor, ally, foe, foe2].forEach(u => { u.dodge = 0; });

  // 施法者留出余量：SP 不满（否则 healSp 的回蓝被 clamp 吃掉看不见）、
  // HP 不满（否则 drain 的吸血和 selfHeal 看不见）。
  actor.sp = Math.floor(actor.maxSp * 0.5);
  actor.hp = Math.floor(actor.maxHp * 0.6);

  ally.hp = ally.maxHp - 60;         // 治疗 48 点要看得出来
  ally.debuffs.push({ type:'poison', dur:3, value:8 });   // 给净化一点活干
  ally.stunned = true;

  [foe, foe2].forEach(f => applyCorrupt(f, 3));           // 给腐化爆发一点活干

  const target = ALLY_TARGETED.has(skill.type) ? ally : foe;
  return { actor, ally, foe, foe2, target, p1:[actor, ally], p2:[foe, foe2] };
}

// executeSkill 开头那两行（扣 SP、扣 HP）在 switch **之前**，
// 也就是说**哪怕 case 整个丢了，有成本的技能一样会让 actor 的数值变化**。
// 直接拿前后快照对比的话，铁壁 / 嘲讽 / 净化 / 祝福 / 不屈 这些
// 「case 体才是全部意义」的技能会**全部误判为通过**——测了个寂寞。
// 所以基线要先把这笔预扣算进去，只剩 case 体的效果。
function payCost(actor, skill){
  const before = snap(actor);
  before.sp = actor.sp - (skill.cost || 0);
  if(skill.hpCost) before.hp = clamp(actor.hp - skill.hpCost, 1, actor.maxHp);
  return before;
}

describe('每种技能都真的被 executeSkill 接住了', () => {
  CHARACTERS.forEach(c => {
    c.skills.forEach(skill => {
      test(`${c.name} · ${skill.name}（${skill.type}）执行后确实改变了战场状态`, () => {
        const s = seed(c.id, skill);
        const units = [s.actor, s.ally, s.foe, s.foe2];

        const before = JSON.stringify(units.map(
          u => u === s.actor ? payCost(u, skill) : snap(u)));

        withFixedRandom(() =>
          executeSkill(s.actor, skill, s.target, VOID, s.p1, s.p2, null));

        assert.notEqual(snapAll(units), before,
          `「${skill.name}」执行后战场毫无变化——多半是 sim.js 的 switch ` +
          `没有 case '${skill.type}'，技能被一路穿过去了`);
      });
    });
  });
});

// ── 哨兵 ────────────────────────────────────────────────
// 上面那组是循环生成的。万一哪天遍历写坏了（比如 skills 改名），
// 它会安静地变成 0 条测试、照样全绿。所以要有一条盯着「到底跑了多少」。
describe('哨兵：别让上面那组悄悄变成空跑', () => {
  test('每个角色都是 4 个技能，且循环真的跑过了每一个', () => {
    // **不写死总数**——角色数量是会变的（8 → 16，见 ROSTER_PLAN.md），
    // 写死会在每次扩阵容时假报错，而它本该盯的是「遍历有没有空跑」。
    assert.ok(CHARACTERS.length >= 8, `角色数看起来不对：${CHARACTERS.length}`);
    CHARACTERS.forEach(c => {
      assert.equal(c.skills.length, 4, `${c.name} 应当有 4 个技能`);
    });
    assert.equal(
      CHARACTERS.reduce((n, c) => n + c.skills.length, 0),
      CHARACTERS.length * 4);
  });

  test('data.js 用到的每一种技能类型，sim.js 的 switch 里都有对应的 case', () => {
    const used = new Set(CHARACTERS.flatMap(c => c.skills.map(s => s.type)));
    const handled = new Set(handledTypes());
    const missing = [...used].filter(t => !handled.has(t));
    assert.deepEqual(missing, [],
      `data.js 里有技能用了这些类型，但 sim.js 的 switch 没接：${missing.join(', ')}`);
  });

  // 反过来的方向：switch 里不许有任何技能都触达不到的 case。
  // 这条一开始是「已知盲区」名单——变异测试发现 `spSteal` 和 `debuff` 两个 case
  // 谁也调不到（data.js 里没有技能用这两种类型），却在 sim.js / battle.js /
  // ai-scoring.js 三处各有一份实现。它们后来被清掉了，这条就从「记录盲区」
  // 升级成了「不许再长出盲区」。
  //
  // 死 case 不是无害的：它让人以为游戏有这个机制，也让人在改技能系统时
  // 多维护三份永远不会执行的代码。
  // （别和 `skill.debuff:'defDown'` 那个**字段**搞混——那个是活的，破甲突刺在用，
  //   由 combat.js 的 calcDamage 处理，根本不走这个 switch。）
  test('switch 里没有任何技能都触达不到的死 case', () => {
    const used = new Set(CHARACTERS.flatMap(c => c.skills.map(s => s.type)));
    const orphan = handledTypes().filter(t => !used.has(t));
    assert.deepEqual(orphan, [],
      `sim.js 的 switch 有 case 但没有任何技能用：${orphan.join(', ')}。` +
      `要么给它配个技能，要么删掉——留着只会让人以为游戏有这个机制`);
  });

  test('局面确实造对了：不满血、不满蓝、有 debuff、有腐化层', () => {
    // 这几条是上面所有断言的前提。前提塌了，整组测试会变成「什么都没测出来」
    // 却依旧全绿——和它要防的那个 bug 是同一个物种。
    const s = seed('priest', CHARACTERS[4].skills[1]);
    assert.ok(s.actor.hp < s.actor.maxHp, '施法者该是残血的，否则看不出治疗/吸血');
    assert.ok(s.actor.sp < s.actor.maxSp, '施法者该是缺蓝的，否则看不出回蓝');
    assert.ok(s.ally.hp < s.ally.maxHp - 40, '队友血要缺得够多，否则治疗量被 clamp 掉');
    assert.ok(s.ally.debuffs.length > 0 && s.ally.stunned, '队友身上要有东西可净化');
    assert.ok(s.foe.debuffs.some(d => d.type === 'corrupt'), '敌人要有腐化层可引爆');
    assert.equal(s.foe.dodge, 0, '闪避必须清零，否则钉死的随机数会让敌人躲光一切');
  });
});
