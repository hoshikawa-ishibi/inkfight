// 组合强度诊断：**哪两个角色凑一块特别强？**
//
// `npm run balance` 量的是单个角色的胜率，它有个盲区——
// 一个角色可能自己不强，但和某个搭档凑起来强得离谱。
// 用户玩下来的观察（「牧师加守卫的组合太强了」）正是这类问题，
// 而单体胜率表上完全看不出来。
//
// 做法：固定这一对同队出战，第三人随机轮换，对手随机，看胜率。
// 「协同」= 这一对的胜率 − 两人各自单飞胜率的平均。
//
// 用法：node pair-check.mjs [每对局数]
import { simOneBattle, shuffle } from './sim.js';
import { aiHard } from './ai.js';
import { CHARACTERS, SCENES } from './data.js';
import { teamSizeFor } from './state.js';

const N = Number(process.argv[2] || 300);
const N_TEAM = teamSizeFor('ai');
const IDS = CHARACTERS.map(c => c.id);
const NAME = Object.fromEntries(CHARACTERS.map(c => [c.id, c.name]));

function run(fixed){
  let wins = 0;
  for(let i = 0; i < N; i++){
    const rest = shuffle(IDS.filter(id => !fixed.includes(id)));
    const mine = [...fixed, ...rest.slice(0, N_TEAM - fixed.length)];
    const foes = rest.slice(N_TEAM - fixed.length, N_TEAM - fixed.length + N_TEAM);
    const scene = SCENES[Math.floor(Math.random() * SCENES.length)];
    if(simOneBattle(mine, foes, scene, { p1Ai: aiHard, p2Ai: aiHard }).winner === 1) wins++;
  }
  return wins / N * 100;
}

console.log(`\n每对 ${N} 局。这一对固定同队，第三人和对手随机。`);
console.log('「协同」= 这一对的胜率 − 两人各自单飞胜率的平均。');
console.log('正得多 = 1+1>2，是个 combo；负得多 = 互相挡路。\n');

const solo = {};
for(const id of IDS) solo[id] = run([id]);
console.log('  单飞基准：' + IDS.map(id => `${NAME[id]} ${solo[id].toFixed(0)}%`).join('  ') + '\n');

const rows = [];
for(let i = 0; i < IDS.length; i++)
  for(let j = i + 1; j < IDS.length; j++){
    const wr = run([IDS[i], IDS[j]]);
    rows.push({ a: IDS[i], b: IDS[j], wr, base: (solo[IDS[i]] + solo[IDS[j]]) / 2 });
  }
rows.forEach(r => r.syn = r.wr - r.base);

const show = r => console.log(
  `  ${(NAME[r.a] + '+' + NAME[r.b]).padEnd(12)} ${r.wr.toFixed(1).padStart(6)}%  ${r.base.toFixed(1).padStart(6)}%  `
  + `${(r.syn >= 0 ? '+' : '') + r.syn.toFixed(1).padStart(5)}${r.syn >= 8 ? '  ⚠超模' : r.syn <= -8 ? '  ⚠互斥' : ''}`);

console.log('  组合            胜率    单飞均值   协同');
console.log('  ──────────────────────────────────────────');
console.log('  【胜率最高的 8 对】');
rows.slice().sort((x, y) => y.wr - x.wr).slice(0, 8).forEach(show);
console.log('\n  【协同最高的 6 对】（1+1>2 最明显）');
rows.slice().sort((x, y) => y.syn - x.syn).slice(0, 6).forEach(show);
console.log('\n  【胜率最低的 4 对】');
rows.slice().sort((x, y) => x.wr - y.wr).slice(0, 4).forEach(show);

const pg = rows.find(r => (r.a === 'priest' && r.b === 'guardian') || (r.a === 'guardian' && r.b === 'priest'));
if(pg){
  console.log(`\n  ▶ 用户点名的「牧师+守卫」：胜率 ${pg.wr.toFixed(1)}%，协同 ${pg.syn >= 0 ? '+' : ''}${pg.syn.toFixed(1)}`
    + `，在 ${rows.length} 对里排第 ${rows.slice().sort((x,y)=>y.wr-x.wr).findIndex(r=>r===pg) + 1}`);
}
console.log();
