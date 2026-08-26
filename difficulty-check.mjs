// 难度公平性诊断：真人玩家打各档 AI，胜率是多少？
//
// **玩家替身不是 aiHard。** 以前是，那等于拿「每回合都算得最准的完美玩家」
// 当尺子——这把尺子把三档难度全校偏了（实测：正常玩家打困难只有 38%，
// 而旧尺子报的是 52.5%）。
//
// 现在的替身用 `makeAi` 造：同一套评分，但 noise 更大（更容易选到次优解）、
// teamwork 0（不集火）、tempo 0.7（机会成本只算个大概）。这三条正是真人
// 和 AI 的真实差距。noise 越大水平越低，实测 30/60/100 约等于
// 「每回合有 10%/25%/40% 概率乱选技能」。
//
// **真人水平是个区间不是一个点**，所以三档替身全都要报：
// 只有三档同向的改动才可信。
//
// 用法：node difficulty-check.mjs [局数]
import { simOneBattle, shuffle } from './sim.js';
import { makeAi, aiEasy, aiNormal, aiHard } from './ai.js';
import { DIFFICULTY_MODS } from './combat.js';
import { CHARACTERS, SCENES } from './data.js';

const N = Number(process.argv[2] || 4000);

// 玩家替身：同一套评分，只是算得没那么准、也不会配合
const player = noise => makeAi(
  { weight: 1, noise, preferBasic: 0, tactical: false, tempo: 0.7, teamwork: 0 });

const PLAYERS = [
  { name: '熟手玩家', ai: player(30)  },
  { name: '一般玩家', ai: player(60)  },   // ← 校准基准，目标曲线以这一档为准
  { name: '生手玩家', ai: player(100) },
];
const LEVELS = [
  { name: '简单', ai: aiEasy,   mod: DIFFICULTY_MODS.easy   },
  { name: '普通', ai: aiNormal, mod: DIFFICULTY_MODS.normal },
  { name: '困难', ai: aiHard,   mod: DIFFICULTY_MODS.hard   },
];

// 玩家永远是 p1（游戏里也是玩家先手，这份先手优势要保留在测量里）
function run(pAi, oAi, mod){
  let wins = 0, rounds = 0;
  for(let i = 0; i < N; i++){
    const ids = shuffle(CHARACTERS.map(c => c.id));
    const scene = SCENES[Math.floor(Math.random() * SCENES.length)];
    const r = simOneBattle(ids.slice(0, 2), ids.slice(2, 4), scene,
      { p1Ai: pAi, p2Ai: oAi, p2Mod: mod });
    if(r.winner === 1) wins++;
    rounds += r.rounds;
  }
  return { wr: wins / N * 100, rounds: rounds / N };
}

console.log(`\n每格 ${N} 局。玩家恒定先手（游戏里也是），这份优势已包含在所有数字里。`);
console.log('「公平线」= 该水平的玩家自己打自己、双方无加成——**不是 50%**，');
console.log('先手在这个战斗节奏下值约 10 个百分点，拿 50% 当基准会把每档都误判成偏难。\n');

console.log('  玩家水平    公平线  │    简单      普通      困难');
console.log('  ────────────────────┼────────────────────────────────');
for(const p of PLAYERS){
  const fair = run(p.ai, p.ai, null).wr;
  const cells = LEVELS.map(l => run(p.ai, l.ai, l.mod));
  const wr  = cells.map(c => `${c.wr.toFixed(1)}%`.padStart(8)).join('  ');
  const dev = cells.map(c => {
    const d = c.wr - fair;
    return `${d >= 0 ? '+' : ''}${d.toFixed(1)}`.padStart(8);
  }).join('  ');
  console.log(`  ${p.name}    ${fair.toFixed(1)}%  │${wr}`);
  console.log(`  ${' '.repeat(8)}  相对偏差 │${dev}`);
}

console.log('\n  目标曲线（以「一般玩家」为准，见 DIFFICULTY_PLAN.md）：');
console.log('    简单 85%  ／  普通 65%  ／  困难 50%  ／  隐藏档 ~35%');
console.log('  **单调性比绝对值更重要**：任何一档对任何水平的玩家，');
console.log('  都不该出现「简单比普通还难」这种翻转。\n');
