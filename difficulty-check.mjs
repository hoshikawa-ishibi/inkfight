// 难度公平性诊断：玩家（无加成）对上各难度档位的 AI，胜率是多少？
//
// 用「同样是 hard AI、但没有属性加成」的一方来近似「打得不错的玩家」——
// 这是个乐观假设（真人不会每回合都算得这么准），所以这里跑出来的玩家胜率
// 应当视为**上限**：真人只会更低。
//
// 用法：node difficulty-check.mjs [局数]
import { simOneBattle, shuffle } from './sim.js';
import { aiEasy, aiNormal, aiHard } from './ai.js';
import { DIFFICULTY_MODS } from './combat.js';
import { CHARACTERS, SCENES } from './data.js';

const N = Number(process.argv[2] || 4000);

// 属性加成直接读 combat.js 那份，玩家实际面对的就是它
const MODS = DIFFICULTY_MODS;
const AIS = { easy: aiEasy, normal: aiNormal, hard: aiHard };

// 玩家永远是 p1：hard 级决策、零属性加成
function run(label, aiLevel, applyMod){
  let playerWins = 0, rounds = 0;
  for(let i = 0; i < N; i++){
    const ids = shuffle(CHARACTERS.map(c => c.id));
    const scene = SCENES[Math.floor(Math.random() * SCENES.length)];
    const r = simOneBattle(ids.slice(0,2), ids.slice(2,4), scene, {
      p1Ai: aiHard,                                  // 玩家：满水平、无加成
      p2Ai: AIS[aiLevel],
      p2Mod: applyMod ? MODS[aiLevel] : null,
    });
    if(r.winner === 1) playerWins++;
    rounds += r.rounds;
  }
  const wr = playerWins / N * 100;
  const bar = '█'.repeat(Math.max(0, Math.round(wr / 2.5)));
  console.log(`  ${label.padEnd(26)} ${wr.toFixed(1).padStart(5)}%  ${(rounds/N).toFixed(1).padStart(4)} 回合  ${bar}`);
  return wr;
}

console.log(`\n每档 ${N} 局。「玩家胜率」= 无属性加成的 hard 级决策方获胜的比例。`);
console.log('真人打不到 hard AI 的决策水平，所以这些数字是玩家的上限。\n');

// 先量出「公平线」：同一个 AI、同样属性，先手方能赢多少。
// 这条线**不是 50%**——先手在这个战斗节奏下值大约 10 个百分点，
// 拿 50% 当基准会把每一档都误判成「偏难」。
console.log('  ── 公平线：同水平对镜 ─────────────────────────────');
const fair = run('hard vs hard，双方无加成', 'hard', false);
console.log(`  （先手优势 ≈ ${(fair-50).toFixed(1)} 个百分点，下面都以这条线为准）`);

console.log('\n  ── 各难度档位（AI 带 DIFFICULTY_MODS 的加成）──────');
for(const lvl of ['easy','normal','hard']){
  const wr = run(({easy:'简单',normal:'普通',hard:'困难'})[lvl], lvl, true);
  const dev = wr - fair;
  console.log(`  ${' '.repeat(26)}相对公平线 ${dev>=0?'+':''}${dev.toFixed(1)}`);
}

console.log('\n  ── 参照：困难去掉属性加成会怎样 ───────────────────');
run('困难（纯 AI 决策强度）', 'hard', false);
console.log();
