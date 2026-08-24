import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { aiHard } from '../ai.js';
import { createUnit } from '../combat.js';
import { scoreSkill, pickTarget, focusFoe, makeTeamContext } from '../ai-scoring.js';
import { SCENES, CHARACTERS } from '../data.js';

// Phase 3：队伍配合。
// 配合行为按 teamwork 权重分档（easy 0 / normal 0.5 / hard 1），所以每组行为
// 都要同时验证「困难会配合」和「简单不会」——否则简单难度会悄悄变得跟困难
// 一样聪明，难度梯度就白设计了。

const VOID = SCENES[0];
const skillOf = (charId, type) =>
  CHARACTERS.find(c => c.id === charId).skills.find(s => s.type === type);

describe('集火：整队盯住同一个目标，不为一两点血差反复横跳', () => {
  test('目标选择看的是「威胁 / 有效血量」，而不是单纯的当前血量', () => {
    // 守卫血厚防高但输出低，法师又脆又能打——该先杀法师，
    // 哪怕此刻守卫的血量数字更低。
    const mage = createUnit('mage', 2, 0);
    const guardian = createUnit('guardian', 2, 1);
    guardian.hp = 90;                    // 比满血法师的 92 还低
    assert.equal(focusFoe([mage, guardian], null, 1), mage,
      '应当先杀又脆又能打的法师，而不是血量数字更低的守卫');
  });

  test('敌方奶妈不会因为攻击力低就被无视', () => {
    // 只按攻击力算威胁的话牧师是全场最低，10000 局实测胜率会飙到 65.2%——
    // 那不是牧师强，是 AI 从来没想过要杀它。
    const priest = createUnit('priest', 2, 0);
    for(const other of ['guardian', 'archer', 'berserker']){
      assert.equal(focusFoe([priest, createUnit(other, 2, 1)], null, 1), priest,
        `面对 ${other} 时应当先杀牧师`);
    }
  });

  test('护盾算进有效血量：不去啃刚开了盾的坦克', () => {
    const guardian = createUnit('guardian', 2, 0);
    const mage = createUnit('mage', 2, 1);
    guardian.hp = 30;
    const before = focusFoe([guardian, mage], null, 1);
    guardian.shield = 45;                // 铁壁：30 血的坦克瞬间变成 75
    const after = focusFoe([guardian, mage], null, 1);
    assert.equal(before, guardian, '没盾时 30 血的守卫是最该杀的');
    assert.equal(after, mage, '开了 45 点护盾之后就不该继续啃守卫了');
  });

  test('已选定的目标不会因为微小差距被换掉', () => {
    const ctx = makeTeamContext();
    const a = createUnit('mage', 2, 0);
    const b = createUnit('mage', 2, 1);
    assert.equal(focusFoe([a, b], ctx, 1), a);
    ctx.focusTarget = a;
    b.hp = 85;                           // 只低 7 点血，不值得换人
    assert.equal(focusFoe([a, b], ctx, 1), a, '差距不大时应当继续打原目标');
    assert.equal(focusFoe([a, b], null, 1), b, '不带上下文时才会见谁血少打谁');
  });

  test('新目标明显更值时仍然会换（不会死心眼）', () => {
    const ctx = makeTeamContext();
    const a = createUnit('mage', 2, 0);
    const b = createUnit('mage', 2, 1);
    ctx.focusTarget = a;
    b.hp = 12;                           // 一刀就能收
    assert.equal(focusFoe([a, b], ctx, 1), b, '眼看能补掉的目标必须去补');
  });

  test('集火目标阵亡后自动清空', () => {
    const ctx = makeTeamContext();
    const a = createUnit('mage', 2, 0);
    const b = createUnit('archer', 2, 1);
    ctx.focusTarget = a;
    a.alive = false;
    assert.equal(focusFoe([b], ctx, 1), b);
    assert.equal(ctx.focusTarget, null, '死掉的目标不该继续留在上下文里');
  });

  test('两个我方单位都会去打残血的那个敌人', () => {
    const ctx = makeTeamContext();
    for(let i = 0; i < 30; i++){
      const mine = [createUnit('swordsman',1,0), createUnit('archer',1,1)];
      const foes = [createUnit('guardian',2,0), createUnit('assassin',2,1)];
      foes[1].hp = 20;
      for(const u of mine){
        const d = aiHard(u, foes, mine, VOID, ctx);
        if(d?.target) assert.equal(d.target, foes[1],
          `${u.name} 没去打残血的敌人，而是打了 ${d.target.name}`);
      }
    }
  });

  test('简单难度不使用集火上下文（配合只给高难度）', () => {
    const ctx = makeTeamContext();
    const a = createUnit('mage', 2, 0);
    const b = createUnit('mage', 2, 1);
    ctx.focusTarget = a;
    b.hp = 85;
    assert.equal(focusFoe([a, b], ctx, 0), b, 'teamwork=0 时不该记得队友在打谁');
    assert.equal(ctx.focusTarget, a, '低难度不应写脏上下文');
  });
});

describe('不重复增益：同一个 buff 不往同一个人身上叠第二次', () => {
  const bless = skillOf('priest', 'buff');
  const foe = () => [createUnit('guardian', 2, 0)];

  test('优先加给还没带同类 buff 的队友', () => {
    const priest = createUnit('priest', 1, 0);
    const mage = createUnit('mage', 1, 1);
    const friends = [priest, mage];
    assert.equal(pickTarget(priest, bless, foe(), friends, { teamwork: 1 }), mage,
      '没人带 buff 时该加给输出最高的法师');
    mage.buffs.push({ type: 'atkUp', dur: 3, value: 0.5 });
    assert.equal(pickTarget(priest, bless, foe(), friends, { teamwork: 1 }), priest,
      '法师已经有 atkUp 了，该轮到牧师自己');
  });

  test('全队都带着同类 buff 时，再加一次就不值得出手了', () => {
    const fresh = [createUnit('priest',1,0), createUnit('mage',1,1)];
    const buffed = [createUnit('priest',1,0), createUnit('mage',1,1)];
    buffed.forEach(f => f.buffs.push({ type: 'atkUp', dur: 3, value: 0.5 }));

    const before = scoreSkill(fresh[0], bless, foe(), fresh, VOID, { teamwork: 1 });
    const after  = scoreSkill(buffed[0], bless, foe(), buffed, VOID, { teamwork: 1 });
    assert.ok(before > 0, `没人带 buff 时祝福应当划算（实得 ${before.toFixed(1)}）`);
    assert.ok(after < 0, `全队已有 atkUp 时不该再祝福（实得 ${after.toFixed(1)}）`);
  });

  test('简单难度察觉不到重复（teamwork=0 时照样往上叠）', () => {
    const buffed = [createUnit('priest',1,0), createUnit('mage',1,1)];
    buffed.forEach(f => f.buffs.push({ type: 'atkUp', dur: 3, value: 0.5 }));
    const dumb = scoreSkill(buffed[0], bless, foe(), buffed, VOID, { teamwork: 0 });
    const smart = scoreSkill(buffed[0], bless, foe(), buffed, VOID, { teamwork: 1 });
    assert.ok(dumb > smart, '简单难度不该识破重复 buff');
  });
});

describe('保护残血队友：坦克在队友濒危时顶上去', () => {
  function scoreWith(skill, allyHpFrac, teamwork){
    const guardian = createUnit('guardian', 1, 0);
    const mage = createUnit('mage', 1, 1);
    mage.hp = Math.round(mage.maxHp * allyHpFrac);
    const foes = [createUnit('archer', 2, 0), createUnit('assassin', 2, 1)];
    return scoreSkill(guardian, skill, foes, [guardian, mage], VOID, { teamwork });
  }

  for(const [name, type] of [['嘲讽','taunt'], ['铁壁','shield']]){
    const skill = skillOf('guardian', type);

    test(`${name} 在队友濒危时分数更高`, () => {
      const safe = scoreWith(skill, 1.0, 1);
      const danger = scoreWith(skill, 0.2, 1);
      assert.ok(danger > safe,
        `${name}：队友濒危(${danger.toFixed(1)}) 应当高于队友满血(${safe.toFixed(1)})`);
    });

    test(`${name} 的保护加成对简单难度无效`, () => {
      assert.equal(scoreWith(skill, 0.2, 0), scoreWith(skill, 1.0, 0),
        `${name}：teamwork=0 时不该关心队友死活`);
    });
  }

  test('嘲讽在身时加盾更值（等于在替队友挡刀）', () => {
    const shield = skillOf('guardian', 'shield');
    const foes = [createUnit('archer', 2, 0)];
    const plain = createUnit('guardian', 1, 0);
    const taunting = createUnit('guardian', 1, 0);
    taunting.buffs.push({ type: 'taunt', dur: 2 });
    const ally = () => { const m = createUnit('mage',1,1); m.hp = 18; return m; };
    assert.ok(
      scoreSkill(taunting, shield, foes, [taunting, ally()], VOID, { teamwork: 1 }) >
      scoreSkill(plain, shield, foes, [plain, ally()], VOID, { teamwork: 1 }),
      '挂着嘲讽的守卫加盾应当比裸着加盾更值');
  });
});

describe('治疗优先级：同等缺血时先救输出更高的队友', () => {
  const heal = skillOf('priest', 'heal');

  // pickTarget 对治疗只负责给队友排序，与谁施法无关（施法的永远是牧师）
  function pick(teamwork){
    const guardian = createUnit('guardian', 1, 0);
    const mage = createUnit('mage', 1, 1);
    guardian.hp = guardian.maxHp - 48;   // 两人缺失血量完全相同
    mage.hp = mage.maxHp - 48;
    return pickTarget(guardian, heal, [createUnit('archer',2,0)], [guardian, mage], { teamwork });
  }

  test('困难难度救法师（同样缺 48 血，法师的输出高得多）', () => {
    assert.equal(pick(1).charId, 'mage');
  });

  test('简单难度只看缺血量，谁排在前面救谁', () => {
    assert.equal(pick(0).charId, 'guardian');
  });

  test('奶妈自己也是高价值队友（治疗量算作产出）', () => {
    const priest = createUnit('priest', 1, 0);
    const guardian = createUnit('guardian', 1, 1);
    priest.hp = priest.maxHp - 48;
    guardian.hp = guardian.maxHp - 48;
    const t = pickTarget(priest, heal, [createUnit('archer',2,0)], [priest, guardian], { teamwork: 1 });
    assert.equal(t.charId, 'priest', '每回合抵消 48 点伤害的牧师不比坦克次要');
  });

  test('濒死的队友仍然优先于「缺得多但安全」的队友', () => {
    const priest = createUnit('priest', 1, 0);
    const mage = createUnit('mage', 1, 1);
    priest.hp = 20;                      // 108 血只剩 20，下一刀就没了
    mage.hp = mage.maxHp - 50;           // 缺得更多，但还很安全
    const t = pickTarget(priest, heal, [createUnit('guardian',2,0)], [priest, mage], { teamwork: 1 });
    assert.equal(t.charId, 'priest', '快死的人应当优先于缺血多的人');
  });

  test('溢出的治疗不算收益（48 点治疗只能补 48 点缺口）', () => {
    const priest = createUnit('priest', 1, 0);
    const mage = createUnit('mage', 1, 1);
    const foes = [createUnit('guardian', 2, 0)];
    mage.hp = mage.maxHp - 5;
    const barelyHurt = scoreSkill(priest, heal, foes, [priest, mage], VOID, { teamwork: 1 });
    mage.hp = mage.maxHp - 48;
    const properlyHurt = scoreSkill(priest, heal, foes, [priest, mage], VOID, { teamwork: 1 });
    assert.ok(properlyHurt > barelyHurt, '只掉 5 点血时不该急着放 48 点的大治疗');
  });
});

describe('过量杀伤：不用大招去收最后一丝血', () => {
  test('残血目标面前，满蓝的剑士也该用免费的普攻', () => {
    let basic = 0;
    const n = 200;
    for(let i = 0; i < n; i++){
      const mine = [createUnit('swordsman', 1, 0)];
      const foes = [createUnit('guardian', 2, 0)];
      foes[0].hp = 5;
      foes[0].dodge = 0;
      const d = aiHard(mine[0], foes, mine, VOID);
      if(d?.skill === mine[0].skills[0]) basic++;
    }
    assert.ok(basic / n > 0.95,
      `只有 ${(basic/n*100).toFixed(0)}% 的情况用普攻收人头，其余都在浪费大招`);
  });

  test('目标满血时该出手还是要出手（补刀封顶不能压掉正常输出）', () => {
    const mine = [createUnit('swordsman', 1, 0)];
    const foes = [createUnit('guardian', 2, 0)];
    const basic = mine[0].skills[0];
    const big = mine[0].skills.find(s => s.cost === 35);
    assert.ok(scoreSkill(mine[0], big, foes, mine, VOID) >
              scoreSkill(mine[0], basic, foes, mine, VOID),
      '打满血目标时大招仍应优于普攻');
  });

  test('护盾会让「能补刀」的判断落空（45 点盾挡在前面就不算残血）', () => {
    const mine = [createUnit('archer', 1, 0)];
    const bare = [createUnit('guardian', 2, 0)];
    const shielded = [createUnit('guardian', 2, 0)];
    bare[0].hp = 5;
    shielded[0].hp = 5;
    shielded[0].shield = 45;
    const basic = mine[0].skills[0];
    assert.ok(scoreSkill(mine[0], basic, bare, mine, VOID) >
              scoreSkill(mine[0], basic, shielded, mine, VOID),
      '带盾的残血目标不该被算成「一刀能收」');
  });
});

describe('战术上下文在两局之间不串味', () => {
  test('makeTeamContext 每次都是全新的对象', () => {
    const a = makeTeamContext(), b = makeTeamContext();
    a.focusTarget = createUnit('mage', 2, 0);
    assert.equal(b.focusTarget, null, '两支队伍 / 两局之间不该共享集火目标');
  });
});
