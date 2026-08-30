// 战役难度曲线诊断：每一关，玩家打得过吗？
//
// 「玩家」= 固定主角墨白（剑士）+ 该关**实际可选**的一名队友，hard 级决策、
// 零属性加成。和 difficulty-check.mjs 同一个近似，所以胜率是**上限**：
// 真人算不到 hard AI 的水平，只会更低。目标曲线的最终关定在 42% 就是给这段差值留的余量。
//
// 队友是轮着换的（不是随机），所以每个队友的样本数一样多，
// 均值不会被某一个队友的运气带偏；同时单独报出「最好 / 最差队友」——
// 这个游戏极度吃阵容克制，只看均值会漏掉「带错人就必输」的关卡。
//
// 关卡数据（阵容 / AI 档 / enemyMod / 解锁表）全部读 campaign.js 那一份，
// 属性加成走 combat.js 的 applyStageMod。**本文件不存任何数值。**
//
// 用法：node campaign-check.mjs [每关局数]
import { simOneBattle, shuffle } from './sim.js';
import { AI_BY_LEVEL, aiHard } from '../src/ai/ai.js';
import { applyStageMod } from '../src/core/combat.js';
import { CAMPAIGN_STAGES, CAMPAIGN_HERO, availableAllies } from '../src/data/campaign.js';
import { CHARACTERS, SCENES } from '../src/data/data.js';

const N = Number(process.argv[2] || 3000);

const DIFF_LABEL = { easy: '简单', normal: '普通', hard: '困难' };

// Phase 1 定的目标曲线：单调下降，最终关最难。允许 ±4 个百分点。
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
    if(simOneBattle(ids.slice(0,2), ids.slice(2,4), scene, { p1Ai: aiHard, p2Ai: aiHard }).winner === 1) wins++;
  }
  return wins / N * 100;
}

function runStage(stage){
  const scene = SCENES.find(s => s.id === stage.scene);
  const p2Mod = stage.enemyMod ? (u => applyStageMod(u, stage.enemyMod)) : null;
  const allies = availableAllies(stage, stage.id - 1);   // 首周目：已通关数 = 关卡号 - 1
  const per = allies.map(a => ({ ally: a, wins: 0, n: 0 }));
  let rounds = 0;
  for(let i = 0; i < N; i++){
    const slot = per[i % per.length];
    const r = simOneBattle([CAMPAIGN_HERO.id, slot.ally.id], stage.enemy, scene, {
      p1Ai: aiHard, p2Ai: AI_BY_LEVEL[stage.difficulty], p2Mod,
    });
    slot.n++;
    if(r.winner === 1) slot.wins++;
    rounds += r.rounds;
  }
  per.forEach(p => p.wr = p.wins / p.n * 100);
  per.sort((a, b) => b.wr - a.wr);
  const wins = per.reduce((s, p) => s + p.wins, 0);
  return { wr: wins / N * 100, rounds: rounds / N, per };
}

const modText = m => m ? Object.entries(m).map(([k,v]) => `${k}×${v}`).join(' ') : '—';
const foeText = s => s.enemy.map(e => typeof e === 'string' ? NAME[e] : (e.name || NAME[e.id])).join('+');

console.log(`\n每关 ${N} 局。「玩家」= 主角${CAMPAIGN_HERO.name}（${NAME[CAMPAIGN_HERO.id]}）+ 该关可选队友（轮换），hard 级决策、无加成。`);
const fair = measureFairLine();
console.log(`公平线（同水平对镜、随机阵容）= ${fair.toFixed(1)}%　先手优势 ≈ ${(fair-50).toFixed(1)} 个百分点\n`);

console.log('  关卡                敌方              AI档  加成         胜率    目标   偏差   回合');
console.log('  ──────────────────────────────────────────────────────────────────────────────────');

const rows = [];
for(const stage of CAMPAIGN_STAGES){
  const r = runStage(stage);
  const target = TARGET[stage.id];
  const diff = r.wr - target;
  const flag = Math.abs(diff) <= 4 ? ' ' : (diff > 0 ? '↑太易' : '↓太难');
  rows.push({ id: stage.id, wr: r.wr, per: r.per });
  console.log(
    `  ${stage.title.padEnd(12)} ${foeText(stage).padEnd(16)} ${DIFF_LABEL[stage.difficulty]}  ` +
    `${modText(stage.enemyMod).padEnd(12)} ${r.wr.toFixed(1).padStart(5)}%  ` +
    `${String(target).padStart(3)}%  ${(diff>=0?'+':'')}${diff.toFixed(1).padStart(5)} ${flag}  ${r.rounds.toFixed(1)}`
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
console.log(`  最大偏差：第${worst.id}关 ${(worst.wr - TARGET[worst.id]).toFixed(1)} 个百分点`);

// 带错队友会不会必输？这个游戏极度吃克制，均值达标不代表每种选法都能打。
console.log('\n  每关各队友分别的胜率（选错人 = 打不过，得盯住最差那个）');
console.log('  ──────────────────────────────────────────────────────────────');
for(const row of rows){
  console.log(`  第${row.id}关  ` + row.per.map(p => `${p.ally.name} ${p.wr.toFixed(0)}%`).join('  '));
}
console.log();
