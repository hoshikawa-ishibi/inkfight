import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { aiEasy, aiNormal, aiHard, aiNightmare } from '../ai.js';
import { createUnit, needsEnemyTarget, AOE_TYPES } from '../combat.js';
import { scoreSkill } from '../ai-scoring.js';
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

describe('三档难度确实存在梯度（合并评分后手感不能被抹平）', () => {
  // 难度实现从「三套经验分」改成「同一评分 + 不同噪声/加成」后，
  // 必须证明梯度还在，否则简单难度会变得跟困难一样聪明。
  // 做法：让每档 AI 在同一局面下反复决策，用共享评分给它选的技能打分，
  // 取平均值作为「决策质量」。
  function quality(fn, n = 300){
    const scene = SCENES[0];
    let sum = 0, count = 0;
    for(let i = 0; i < n; i++){
      const mine = [createUnit('swordsman',1,0), createUnit('priest',1,1)];
      const foes = [createUnit('warlock',2,0), createUnit('guardian',2,1)];
      foes[0].hp = 25;                       // 制造一个可补刀的目标
      mine[1].hp = mine[1].maxHp * 0.25;     // 制造一个需要救的队友
      const d = fn(mine[0], foes, mine, scene);
      if(d?.skill){ sum += scoreSkill(mine[0], d.skill, foes, mine, scene); count++; }
    }
    return count ? sum / count : 0;
  }

  test('困难的决策质量高于简单', () => {
    const easy = quality(aiEasy);
    const hard = quality(aiHard);
    assert.ok(hard > easy,
      `困难(${hard.toFixed(1)}) 应当优于简单(${easy.toFixed(1)})——难度梯度消失了`);
  });

  test('普通介于简单与困难之间（允许与困难接近）', () => {
    const easy = quality(aiEasy);
    const normal = quality(aiNormal);
    assert.ok(normal > easy,
      `普通(${normal.toFixed(1)}) 应当优于简单(${easy.toFixed(1)})`);
  });

  // 断言从「绝对比例 > 50%」改成「比困难高出一截」（2026-08-25 难度重做）。
  // 原来 preferBasic 是 0.7，简单 AI 七成回合都在平A——实测那样它必须靠
  // atk ×1.15 的**属性倒挂**才够得上难度目标，而「简单模式敌人伤害比困难还高」
  // 在难度选择界面上读起来很荒唐。现在是 0.25。
  // 相对断言比绝对阈值更贴设计意图：要的是「新手会浪费机会」这个手感差，
  // 而不是某个具体的百分比。
  test('简单难度比困难明显更常抡普攻（保留新手手感）', () => {
    const scene = SCENES[0];
    const basicRate = ai => {
      let hit = 0, n = 400;
      for(let i = 0; i < n; i++){
        const mine = [createUnit('swordsman',1,0)];
        const foes = [createUnit('guardian',2,0)];
        const d = ai(mine[0], foes, mine, scene);
        if(d?.skill === mine[0].skills[0]) hit++;
      }
      return hit / n;
    };
    const easy = basicRate(aiEasy), hard = basicRate(aiHard);
    assert.ok(easy > hard + 0.15,
      `简单用普攻 ${(easy*100).toFixed(0)}%、困难 ${(hard*100).toFixed(0)}%，` +
      `差距不足以让玩家感觉到"对面在浪费机会"`);
  });
});

describe('AI 的失误要看得见，而且只能出现在低难度', () => {
  // hesitated 会在战斗日志里显示成「（似乎有些犹豫）」。设计意图是
  // **让玩家看得见 AI 在浪费机会，而不是偷偷变弱**——查到的资料里
  // 「打败一个笨蛋远不如打败一个高手爽」，所以高难度一旦冒出这行字，
  // 「不会失误的对手」这个人设就塌了。
  const hesitationRate = ai => {
    const scene = SCENES[0];
    let hes = 0, n = 0;
    for(const c of CHARACTERS){
      for(let i = 0; i < 60; i++){
        const mine = [createUnit(c.id, 1, 0), createUnit('priest', 1, 1)];
        const foes = [createUnit('guardian', 2, 0), createUnit('mage', 2, 1)];
        mine[0].hp = Math.floor(mine[0].maxHp * 0.7);
        const d = ai(mine[0], foes, mine, scene);
        if(d){ n++; if(d.hesitated) hes++; }
      }
    }
    return hes / n;
  };

  test('简单难度经常犹豫，玩家看得出对面在浪费机会', () => {
    const r = hesitationRate(aiEasy);
    assert.ok(r > 0.15, `简单难度的犹豫率只有 ${(r*100).toFixed(1)}%，玩家感觉不到`);
  });

  test('困难和墨皇永不犹豫——它们就该像不会失误的机器', () => {
    for(const [name, ai] of [['困难', aiHard], ['墨皇', aiNightmare]]){
      const r = hesitationRate(ai);
      assert.equal(r, 0,
        `${name}难度出现了 ${(r*100).toFixed(1)}% 的犹豫。` +
        `高难度的卖点是"它不会失误"，日志里冒出「似乎有些犹豫」会直接毁掉这个人设——` +
        `多半是有人调大了它的 noise`);
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
