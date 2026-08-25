// 战役难度曲线诊断：每一关，玩家打得过吗？
//
// 「玩家」= 随机 2 名角色 + hard 级决策 + 零属性加成——和 difficulty-check.mjs
// 同一个近似，所以这里的胜率同样是**上限**：真人算不到 hard AI 的水平，只会更低。
// 目标曲线的最终关定在 42% 而不是更低，就是给这段差值留的余量。
//
// 关卡数据（阵容 / AI 档 / enemyMod）全部读 campaign.js 那一份，
// 属性加成走 combat.js 的 applyStageMod。**本文件不存任何数值**，
// 否则又会变成「调了一处、量的却是另一套数」。
//
// 用法：node campaign-check.mjs [每关局数]
import { simOneBattle, shuffle } from './sim.js';
import { aiEasy, aiNormal, aiHard } from './ai.js';
import { applyStageMod } from './combat.js';
import { CAMPAIGN_STAGES, enemyIds } from './campaign.js';
import { CHARACTERS, SCENES } from './data.js';

const N = Number(process.argv[2] || 3000);
const AIS = { easy: aiEasy, normal: aiNormal, hard: aiHard };
const DIFF_LABEL = { easy: '简单', normal: '普通', hard: '困难' };

// Phase 1 的目标曲线：单调下降，最终关最难。允许 ±4 个百分点。
// 关键是**单调 + 最终关最难**，绝对值可以整体平移。
const TARGET = { 1: 92, 2: 85, 3: 78, 4: 72, 5: 65, 6: 58, 7: 50, 8: 42 };

const ALL_IDS = CHARACTERS.map(c => c.id);
const NAME = Object.fromEntries(CHARACTERS.map(c => [c.id, c.name]));

// 公平线：同一个 AI、同样属性、随机阵容，先手方能赢多少。
// 这条线**不是 50%**——先手在这个战斗节奏下值大约 10 个百分点。
function measureFairLine(){
  let wins = 0;
  for(let i = 0; i < N; i++){
    const ids = shuffle(ALL_IDS.slice());
    const scene = SCENES[Math.floor(Math.random() * SCENES.length)];
    const r = simOneBattle(ids.slice(0,2), ids.slice(2,4), scene, { p1Ai: aiHard, p2Ai: aiHard });
    if(r.winner === 1) wins++;
  }
  return wins / N * 100;
}

function runStage(stage){
  const scene = SCENES.find(s => s.id === stage.scene);
  const foes = enemyIds(stage);
  const p2Mod = stage.enemyMod ? (u => applyStageMod(u, stage.enemyMod)) : null;
  let wins = 0, rounds = 0, timeouts = 0;
  for(let i = 0; i < N; i++){
    const pool = shuffle(ALL_IDS.slice());
    const r = simOneBattle(pool.slice(0,2), foes, scene, {
      p1Ai: aiHard,
      p2Ai: AIS[stage.difficulty],
      p2Mod,
    });
    if(r.winner === 1) wins++;
    if(r.timeout) timeouts++;
    rounds += r.rounds;
  }
  return { wr: wins / N * 100, rounds: rounds / N, timeoutPct: timeouts / N * 100 };
}

function modText(mod){
  if(!mod) return '—';
  return Object.entries(mod).map(([k,v]) => `${k}×${v}`).join(' ');
}

console.log(`\n每关 ${N} 局。「玩家」= 随机 2 人 + hard 级决策 + 无属性加成（上限值，真人更低）。`);
const fair = measureFairLine();
console.log(`公平线（同水平对镜、随机阵容）= ${fair.toFixed(1)}%　先手优势 ≈ ${(fair-50).toFixed(1)} 个百分点\n`);

console.log('  关卡                敌方阵容        AI档  加成            胜率    目标   偏差   回合');
console.log('  ─────────────────────────────────────────────────────────────────────────────────');

const rows = [];
for(const stage of CAMPAIGN_STAGES){
  const r = runStage(stage);
  const target = TARGET[stage.id];
  const diff = r.wr - target;
  const flag = Math.abs(diff) <= 4 ? ' ' : (diff > 0 ? '↑太易' : '↓太难');
  rows.push({ id: stage.id, wr: r.wr });
  const foes = enemyIds(stage).map(id => NAME[id]).join('+');
  console.log(
    `  ${stage.title.padEnd(12)} ${foes.padEnd(14)} ${DIFF_LABEL[stage.difficulty]}  ` +
    `${modText(stage.enemyMod).padEnd(15)} ${r.wr.toFixed(1).padStart(5)}%  ` +
    `${String(target).padStart(3)}%  ${(diff>=0?'+':'')}${diff.toFixed(1).padStart(5)} ${flag}  ` +
    `${r.rounds.toFixed(1)}`
  );
}

// 单调性：曲线只要有一处回升，玩家就会遇到「后面的关比前面简单」的锯齿。
const breaks = [];
for(let i = 1; i < rows.length; i++){
  if(rows[i].wr > rows[i-1].wr + 0.5) breaks.push(`第${rows[i-1].id}→${rows[i].id}关 回升 ${(rows[i].wr - rows[i-1].wr).toFixed(1)}`);
}
console.log();
console.log(breaks.length
  ? `  ⚠ 曲线不单调：${breaks.join('，')}`
  : `  ✓ 曲线单调下降，最终关最难（${rows[0].wr.toFixed(1)}% → ${rows[rows.length-1].wr.toFixed(1)}%）`);

const worst = rows.reduce((a,b) => Math.abs(b.wr - TARGET[b.id]) > Math.abs(a.wr - TARGET[a.id]) ? b : a);
console.log(`  最大偏差：第${worst.id}关 ${(worst.wr - TARGET[worst.id]).toFixed(1)} 个百分点\n`);
