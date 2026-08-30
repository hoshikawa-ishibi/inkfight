// 「两边允许选同样的角色，会更好玩吗？」
//
// 现状是**不允许重复**：8 个角色洗牌后前 3 给 A、后 3 给 B，两边不会撞人。
// 允许重复之后，两边各自独立从 8 个里抽 3——可以出现镜像对局，
// 也可以出现「双方都带牧师」这种局面。
//
// 量三件事：
//   对局种类   变化多少 = 「打过一次就记住了」这个问题缓解多少
//   策略价值   完美玩家 − 闭眼乱按，打得好还值不值钱
//   镜像对局   完全相同阵容互打时，先手到底值多少（这是最干净的先手测量）
//
// 用法：node dup-check.mjs [每格局数]
import { simOneBattle, shuffle } from './sim.js';
import { makeAi, AI_BY_LEVEL } from '../src/ai/ai.js';
import { canUseSkill, DIFFICULTY_MODS, applyStageMod } from '../src/core/combat.js';
import { pickTarget } from '../src/ai/ai-scoring.js';
import { CHARACTERS, SCENES } from '../src/data/data.js';
import { teamSizeFor } from '../src/core/state.js';

const N = Number(process.argv[2] || 800);
const N_TEAM = teamSizeFor('ai');
const IDS = CHARACTERS.map(c => c.id);

const perfect = makeAi({weight:1,noise:2,preferBasic:0,tactical:true,tempo:1,teamwork:1});
const mid     = makeAi({weight:1,noise:60,preferBasic:0,tactical:false,tempo:0.7,teamwork:0});
function aiRandom(u, en, al){
  const foes = en.filter(e=>e.alive), friends = al.filter(a=>a.alive);
  if(!foes.length) return null;
  const usable = u.skills.filter(s => canUseSkill(u, s));
  if(!usable.length) return null;
  const s = usable[Math.floor(Math.random()*usable.length)];
  return { skill:s, target: pickTarget(u, s, foes, friends, {tempo:0.7,teamwork:0}) };
}

// 两种抽阵容的方式
const drawNoDup = () => { const s = shuffle(IDS); return [s.slice(0,N_TEAM), s.slice(N_TEAM, N_TEAM*2)]; };
const drawDup   = () => [shuffle(IDS).slice(0,N_TEAM), shuffle(IDS).slice(0,N_TEAM)];

function wr(pAi, draw){
  let w = 0;
  for(let i = 0; i < N; i++){
    const [a,b] = draw();
    const scene = SCENES[Math.floor(Math.random()*SCENES.length)];
    if(simOneBattle(a, b, scene, {
      p1Ai:pAi, p2Ai:AI_BY_LEVEL.hard,
      p2Mod: DIFFICULTY_MODS.hard ? (u=>applyStageMod(u,DIFFICULTY_MODS.hard)) : null,
    }).winner === 1) w++;
  }
  return w/N*100;
}

// 出现过多少种不同的对局（阵容无序，两边有别）
function variety(draw){
  const seen = new Set();
  for(let i = 0; i < N*4; i++){
    const [a,b] = draw();
    seen.add(a.slice().sort().join(',') + ' vs ' + b.slice().sort().join(','));
  }
  return seen.size;
}

// 组合数：C(8,3) = 56
const C = (n,k) => k ? C(n-1,k-1)*n/k : 1;
const total = { noDup: C(8,N_TEAM) * C(8-N_TEAM, N_TEAM), dup: C(8,N_TEAM) ** 2 };

console.log(`\n每格 ${N} 局，每方 ${N_TEAM} 人。\n`);
console.log('  抽法        完美     一般     乱按   │ 策略价值  完美−一般  对局种类(理论)');
console.log('  ──────────────────────────────────┼──────────────────────────────────');
for(const [name, draw, tot] of [['不许重复(现状)', drawNoDup, total.noDup], ['允许重复    ', drawDup, total.dup]]){
  const p = wr(perfect, draw), m = wr(mid, draw), r = wr(aiRandom, draw);
  console.log(`  ${name}  ${p.toFixed(1).padStart(6)}%  ${m.toFixed(1).padStart(6)}%  ${r.toFixed(1).padStart(6)}%  │`
    + `  ${(p-r).toFixed(1).padStart(5)} 点   ${(p-m).toFixed(1).padStart(5)} 点      ${String(tot).padStart(5)}`);
}

// 镜像对局：完全一样的阵容互打，胜负只剩先手和临场
let mirrorFirst = 0, mirrorN = 0;
for(let i = 0; i < N; i++){
  const team = shuffle(IDS).slice(0, N_TEAM);
  const scene = SCENES[Math.floor(Math.random()*SCENES.length)];
  if(simOneBattle(team.slice(), team.slice(), scene, {p1Ai:perfect, p2Ai:perfect}).winner === 1) mirrorFirst++;
  mirrorN++;
}
console.log(`\n  镜像对局（两边完全同一套阵容、同一个 AI）先手方胜率：${(mirrorFirst/mirrorN*100).toFixed(1)}%`);
console.log('  这是最干净的先手测量——阵容差异被完全消掉了，剩下的全是先手 + 承诺制的信息差。');
console.log(`\n  实抽 ${N*4} 次出现的不同对局数：不许重复 ${variety(drawNoDup)}  ／  允许重复 ${variety(drawDup)}\n`);
