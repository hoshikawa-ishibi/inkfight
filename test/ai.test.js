import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { aiEasy, aiNormal, aiHard } from '../ai.js';
import { createUnit, needsEnemyTarget, AOE_TYPES } from '../combat.js';
import { SCENES, CHARACTERS } from '../data.js';

// 这个测试文件本身就是 Phase 1 的验收标准：
// 它能在 Node 里 import 并调用 ai.js，就证明 ai.js 已经不依赖浏览器
// （此前 ai.js 通过 initAi() 注入 battle.js 的 previewDmg，而后者读 gameState）。

const VOID = SCENES[0];

function team(ids, player){
  return ids.map((id,i)=>createUnit(id, player, i));
}

describe('ai.js 可在 Node 中直接运行（不依赖 DOM / gameState）', () => {
  const levels = [['easy',aiEasy], ['normal',aiNormal], ['hard',aiHard]];

  for(const [name, fn] of levels){
    test(`${name} 难度能返回合法决策`, () => {
      const mine = team(['swordsman','priest'], 1);
      const foes = team(['warlock','guardian'], 2);
      const d = fn(mine[0], foes, mine, VOID);
      assert.ok(d, '应当返回决策而不是 null');
      assert.ok(d.skill, '决策里应当有技能');
      assert.ok(mine[0].skills.includes(d.skill), '选的技能必须属于该单位');
    });
  }

  test('每个角色在三档难度下都能正常决策（覆盖全部 8 名角色）', () => {
    for(const c of CHARACTERS){
      const mine = team([c.id, 'priest'], 1);
      const foes = team(['guardian','archer'], 2);
      for(const [name, fn] of levels){
        const d = fn(mine[0], foes, mine, VOID);
        assert.ok(d && d.skill, `${c.name} 在 ${name} 难度下没有返回有效决策`);
      }
    }
  });

  test('SP 不足时不会选择放不起的技能', () => {
    const mine = team(['mage'], 1);
    const foes = team(['guardian'], 2);
    mine[0].sp = 0;
    for(const [name, fn] of levels){
      const d = fn(mine[0], foes, mine, VOID);
      if(d && d.skill) assert.ok(d.skill.cost <= 0, `${name} 选了 SP 不够的技能`);
    }
  });
});

describe('AI 的目标分配与 needsEnemyTarget 保持一致', () => {
  // 防的是这个真实 bug：给「狂暴」加 power 后，ai.js 仍把 selfBuff 一律
  // 置 target=null，导致 AI 放狂暴不造成伤害、玩家放却会。
  test('需要敌方目标的技能，AI 一定会给出目标', () => {
    for(const c of CHARACTERS){
      const mine = team([c.id, 'priest'], 1);
      const foes = team(['guardian','archer'], 2);
      // 给足资源，让每个技能都有机会被选中
      mine[0].sp = mine[0].maxSp;
      for(let i=0;i<40;i++){
        const d = aiHard(mine[0], foes, mine, VOID);
        if(!d || !d.skill) continue;
        if(needsEnemyTarget(d.skill)){
          assert.ok(d.target, `${c.name}·${d.skill.name} 需要敌方目标却返回了 null`);
          assert.equal(d.target.player, 2, '目标应当是敌方单位');
        }
      }
    }
  });

  test('AoE 技能不需要单体目标（由执行逻辑自行遍历敌人）', () => {
    for(const c of CHARACTERS){
      for(const s of c.skills){
        if(!AOE_TYPES.includes(s.type)) continue;
        assert.equal(needsEnemyTarget(s), false,
          `${c.name}·${s.name} 是 AoE，不该要求单体目标`);
      }
    }
  });
});

describe('场景加成通过参数传入而非全局状态', () => {
  test('传入不同场景不会抛错，且决策仍然合法', () => {
    for(const scene of SCENES){
      const mine = team(['swordsman'], 1);
      const foes = team(['guardian'], 2);
      const d = aiHard(mine[0], foes, mine, scene);
      assert.ok(d && d.skill, `场景「${scene.name}」下决策失败`);
    }
  });

  test('不传 scene 也不崩（previewDmg 对 scene 做了空值兜底）', () => {
    const mine = team(['swordsman'], 1);
    const foes = team(['guardian'], 2);
    const d = aiHard(mine[0], foes, mine, undefined);
    assert.ok(d && d.skill);
  });
});
