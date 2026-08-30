// 策略深度诊断：**打得好，到底有多大用？**
//
// difficulty-check 回答的是「这一档难不难」，本文件回答的是另一个问题：
// 把玩家的决策水平从「完美」一路降到「闭眼乱按」，胜率会掉多少？
// 这个落差就是**策略的全部价值**。落差越小，说明胜负越是骰子说了算。
//
// 对照组把 crit / dodge 两个字段清零（它们只是单位字段，不用改游戏代码）。
//
// **注意这一行的含义在任务 2 之后变了。** 改造前暴击和闪避是掷骰，
// 清零 = 移除两个随机源，用来验证「随机在不在稀释决策」（答案是：不是主因）。
// 现在两者都已确定化（暴击蓄能条 / 闪避改恒定减伤），清零 = **移除机制本身**，
// 量的是「这两个机制给策略贡献了多少」。落差比原样低，说明它们现在
// 是在**增加**决策而不是淹没决策——这正是想要的结果。
//
// 用法：node depth-check.mjs [每格局数]
import { simOneBattle, shuffle } from './sim.js';
import { teamSizeFor } from '../src/core/state.js';
const N_TEAM = teamSizeFor('ai');   // 随机对战 3v3，见 state.js 的 teamSizeFor
import { makeAi, AI_BY_LEVEL } from '../src/ai/ai.js';
import { applyStageMod, DIFFICULTY_MODS, canUseSkill } from '../src/core/combat.js';
import { CHARACTERS, SCENES } from '../src/data/data.js';
import { CAMPAIGN_STAGES, CAMPAIGN_HERO, availableAllies } from '../src/data/campaign.js';
import { pickTarget } from '../src/ai/ai-scoring.js';

const N = Number(process.argv[2] || 3000);

const skilled = noise => makeAi(
  { weight: 1, noise, preferBasic: 0, tactical: false, tempo: 0.7, teamwork: 0 });

// 「闭眼乱按」：完全不看评分，在能放的技能里随机挑一个。
// 目标仍走 pickTarget（返回 null 会让战斗抛异常），所以这是
// **决策水平的下限**，不是真正的随机——真人只会比它好。
function aiRandom(u, enemies, allies, scene, ctx){
  const foes = enemies.filter(e => e.alive);
  const friends = allies.filter(a => a.alive);
  if(!foes.length) return null;
  const usable = u.skills.filter(s => canUseSkill(u, s));
  if(!usable.length) return null;
  const s = usable[Math.floor(Math.random() * usable.length)];
  return { skill: s, target: pickTarget(u, s, foes, friends, { tempo: 0.7, teamwork: 0 }) };
}

const LADDER = [
  { name: '完美',   ai: skilled(2)   },
  { name: '熟手',   ai: skilled(30)  },
  { name: '一般',   ai: skilled(60)  },
  { name: '生手',   ai: skilled(100) },
  { name: '乱按',   ai: aiRandom     },
];

// 纯输出随机源归零：暴击率、闪避率、技能自带暴击加成
const noLuck = u => {
  u.crit = 0; u.dodge = 0;
  u.skills.forEach(s => { if(s.crit) s.crit = 0; });
};

// ── 场景 A：随机阵容打「困难 / 墨皇」档 ────────────────────
function runRandomMatch(pAi, level, luckOff){
  const oAi = AI_BY_LEVEL[level];
  const mod = DIFFICULTY_MODS[level];
  let wins = 0;
  for(let i = 0; i < N; i++){
    const ids = shuffle(CHARACTERS.map(c => c.id));
    const scene = SCENES[Math.floor(Math.random() * SCENES.length)];
    const r = simOneBattle(ids.slice(0, N_TEAM), ids.slice(N_TEAM, N_TEAM*2), scene, {
      p1Ai: pAi, p2Ai: oAi,
      p1Mod: luckOff ? noLuck : null,
      p2Mod: u => { if(luckOff) noLuck(u); if(mod) applyStageMod(u, mod); },
    });
    if(r.winner === 1) wins++;
  }
  return wins / N * 100;
}

// ── 场景 B：战役某一关 ────────────────────────────────────
function runStage(stage, pAi, luckOff){
  const scene = SCENES.find(s => s.id === stage.scene);
  const allies = availableAllies(stage, stage.id - 1);
  let wins = 0;
  for(let i = 0; i < N; i++){
    const ally = allies[i % allies.length];
    const r = simOneBattle([CAMPAIGN_HERO.id, ally.id], stage.enemy, scene, {
      p1Ai: pAi, p2Ai: AI_BY_LEVEL[stage.difficulty],
      p1Mod: luckOff ? noLuck : null,
      p2Mod: u => { if(luckOff) noLuck(u); if(stage.enemyMod) applyStageMod(u, stage.enemyMod); },
    });
    if(r.winner === 1) wins++;
  }
  return wins / N * 100;
}

function table(label, fn){
  const on  = LADDER.map(p => fn(p.ai, false));
  const off = LADDER.map(p => fn(p.ai, true));
  const span  = on[0]  - on[on.length - 1];
  const spanO = off[0] - off[off.length - 1];
  console.log(`\n  ${label}`);
  console.log('    玩家水平      ' + LADDER.map(p => p.name.padStart(7)).join('') + '   │ 策略价值');
  console.log('    ────────────' + '─'.repeat(7 * LADDER.length) + '───┼──────────');
  console.log('    原样        ' + on.map(v => `${v.toFixed(1)}%`.padStart(7)).join('') +
              `   │  ${span.toFixed(1)} 点`);
  console.log('    机制归零  ' + off.map(v => `${v.toFixed(1)}%`.padStart(7)).join('') +
              `   │  ${spanO.toFixed(1)} 点`);
  return { span, spanO };
}

console.log(`\n每格 ${N} 局。「策略价值」= 完美玩家胜率 − 闭眼乱按胜率。`);
console.log('这个数字就是**打得好值多少**。它越小，胜负越是骰子说了算。');
console.log('参考：策略型游戏里这个落差通常在 60 点以上；低于 30 点基本等于在掷硬币。');

table('随机阵容 · 困难档', (ai, off) => runRandomMatch(ai, 'hard', off));
table('随机阵容 · 墨皇档', (ai, off) => runRandomMatch(ai, 'nightmare', off));
table('战役第 8 关 · 墨皇 BOSS', (ai, off) => runStage(CAMPAIGN_STAGES[7], ai, off));
console.log();
