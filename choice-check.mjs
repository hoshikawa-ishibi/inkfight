// 「每回合到底有没有得选？」
//
// depth-check 量的是「打得好值多少分」，这里量的是**决策本身存不存在**。
// 一个回合如果最优解永远是同一个技能、而且甩开第二名一大截，
// 那这个回合玩家其实没有在做决定，只是在执行。
//
// 两个指标：
//   主流技能占比 — 完美玩家有多少比例的回合在放同一个技能。越高越没得选。
//   无悬念回合   — 最优解比次优解高出 30% 以上的回合占比。越高越是「执行」。
//
// 用法：node choice-check.mjs [局数]
import { simOneBattle, shuffle } from './sim.js';
import { scoreSkill, pickTarget } from './ai-scoring.js';
import { CHARACTERS, SCENES } from './data.js';

const N = Number(process.argv[2] || 1500);

// charId -> { skillName -> 次数 }
const use = {};
let turns = 0, forced = 0, onlyOne = 0;
CHARACTERS.forEach(c => { use[c.id] = {}; c.skills.forEach(s => { use[c.id][s.name] = 0; }); });

const canUse = (u, s) => u.sp >= s.cost && !(s.hpCost && u.hp <= s.hpCost);

// 完美决策 + 埋点。评分口径与 aiHard 一致（tempo 1 / teamwork 1），
// 只是去掉噪声与 tacticalBonus，好让「最优 vs 次优」的差距干净可读。
function aiProbe(u, enemies, allies, scene, ctx){
  const foes = enemies.filter(e => e.alive);
  const friends = allies.filter(a => a.alive);
  if(!foes.length) return null;
  const opts = { tempo: 1, teamwork: 1, ctx };
  const scored = u.skills.filter(s => canUse(u, s))
    .map(s => ({ s, v: scoreSkill(u, s, foes, friends, scene, opts) }))
    .sort((a, b) => b.v - a.v);
  if(!scored.length) return null;

  turns++;
  use[u.charId][scored[0].s.name]++;
  if(scored.length === 1) { onlyOne++; forced++; }
  else {
    const [a, b] = scored;
    const span = Math.abs(a.v);
    if(span > 0 && (a.v - b.v) / span > 0.30) forced++;
  }
  return { skill: scored[0].s, target: pickTarget(u, scored[0].s, foes, friends, opts) };
}

for(let i = 0; i < N; i++){
  const ids = shuffle(CHARACTERS.map(c => c.id));
  const scene = SCENES[Math.floor(Math.random() * SCENES.length)];
  simOneBattle(ids.slice(0, 2), ids.slice(2, 4), scene, { p1Ai: aiProbe, p2Ai: aiProbe });
}

console.log(`\n${N} 局 / ${turns} 个决策点。完美玩家的技能使用分布：\n`);
console.log('  角色      主流技能            占比   四个技能的分布');
console.log('  ──────────────────────────────────────────────────────────────────');
const shares = [];
for(const c of CHARACTERS){
  const rows = Object.entries(use[c.id]).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((n, r) => n + r[1], 0) || 1;
  const top = rows[0];
  shares.push(top[1] / total * 100);
  const dist = c.skills.map(s => `${s.name} ${(use[c.id][s.name] / total * 100).toFixed(0)}%`).join('  ');
  console.log(`  ${c.name.padEnd(8)}  ${top[0].padEnd(18)} ${(top[1]/total*100).toFixed(0).padStart(3)}%   ${dist}`);
}

const avgShare = shares.reduce((a, b) => a + b, 0) / shares.length;
console.log(`\n  平均主流技能占比：${avgShare.toFixed(1)}%`);
console.log(`  无悬念回合（最优甩开次优 30%+）：${(forced / turns * 100).toFixed(1)}%`);
console.log(`    其中「只有一个技能放得起」：${(onlyOne / turns * 100).toFixed(1)}%`);
console.log('\n  读法：主流占比越高、无悬念回合越多，玩家越是在**执行**而不是**决策**。');
console.log('  健康区间大致是主流占比 < 40%、无悬念回合 < 50%。\n');
