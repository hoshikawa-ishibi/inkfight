// 战役曲线校准器：给每一关扫一遍 enemyMod.hp，报出最接近目标胜率的那个值。
//
// 逐关手调太慢——8 关每关要试好几个值，每次还得等 1000+ 局跑完。
// 这个脚本一次把整条曲线扫出来，直接给出「该填什么」。
//
// **它只读 campaign.js 的阵容和目标，不存任何数值**（和 campaign-check 同一条约定）。
// 扫出来的值要手动填回 campaign.js，再用 campaign-check 复验——
// 自动写回太容易在没人看的时候把曲线改坏。
//
// 用法：node campaign-tune.mjs [每格局数] [只扫第几关]
import { simOneBattle } from './sim.js';
import { AI_BY_LEVEL, aiHard } from '../src/ai/ai.js';
import { applyStageMod } from '../src/core/combat.js';
import { CAMPAIGN_STAGES, CAMPAIGN_HERO, availableAllies } from '../src/data/campaign.js';
import { SCENES } from '../src/data/data.js';

const N = Number(process.argv[2] || 600);
const ONLY = process.argv[3] ? Number(process.argv[3]) : null;
const TARGET = { 1: 92, 2: 85, 3: 78, 4: 72, 5: 65, 6: 58, 7: 50, 8: 42 };
const GRID = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.25, 1.4, 1.6, 1.8, 2.1];

function run(stage, hpMul){
  const scene = SCENES.find(s => s.id === stage.scene);
  const allies = availableAllies(stage, stage.id - 1);
  const mod = { ...(stage.enemyMod || {}), hp: hpMul };
  let wins = 0;
  for(let i = 0; i < N; i++){
    const ally = allies[i % allies.length];
    if(simOneBattle([CAMPAIGN_HERO.id, ally.id], stage.enemy, scene, {
      p1Ai: aiHard, p2Ai: AI_BY_LEVEL[stage.difficulty],
      p2Mod: u => applyStageMod(u, mod),
    }).winner === 1) wins++;
  }
  return wins / N * 100;
}

console.log(`\n每格 ${N} 局。扫 enemyMod.hp，找最接近目标胜率的那个值。`);
console.log('敌方血越厚，玩家胜率越低——曲线应当单调下降。\n');

for(const stage of CAMPAIGN_STAGES){
  if(ONLY && stage.id !== ONLY) continue;
  const target = TARGET[stage.id];
  const rows = GRID.map(m => ({ m, wr: run(stage, m) }));
  const best = rows.reduce((a, b) =>
    Math.abs(b.wr - target) < Math.abs(a.wr - target) ? b : a);
  const line = rows.map(r => `${r.m.toFixed(2)}:${r.wr.toFixed(0)}%`).join('  ');
  console.log(`  第${stage.id}关（目标 ${target}%）  → 建议 hp×${best.m}（${best.wr.toFixed(1)}%）`);
  console.log(`    ${line}`);
}
console.log('\n  扫完手动填回 campaign.js 的 enemyMod，再跑 campaign-check.mjs 复验。\n');
