// 「负面有没有上，到底值多少胜率？」
// 本作回合流程是「双方各行动一个单位」，所以一次眩晕 = 直接偷走对方一整个行动。
// 这里把眩晕命中率强行拨到 0% 和 100%，看同一场对局的胜率会被拉开多远。
// 这个落差全部由骰子掌管，玩家**没有任何操作可以影响它**。
import { simOneBattle, shuffle } from './sim.js';
import { aiHard } from './ai.js';
import { CHARACTERS, SCENES } from './data.js';

const N = Number(process.argv[2] || 4000);
const STUNNERS = ['mage', 'archer'];   // 灵能过载 / 束缚箭

// 把 p1 的眩晕命中率钉死。skills 是每个单位各自的深拷贝，改它不污染 data.js。
const setStun = pctVal => u => {
  u.skills.forEach(s => { if(s.type === 'stun'){ s.basePct = pctVal; s.spScale = 0; } });
};

function run(mod){
  let wins = 0;
  for(let i = 0; i < N; i++){
    // p1 必带一个眩晕角色，否则这个旋钮没东西可拧
    const stunner = STUNNERS[i % STUNNERS.length];
    const rest = shuffle(CHARACTERS.map(c => c.id).filter(id => id !== stunner));
    const scene = SCENES[Math.floor(Math.random() * SCENES.length)];
    const r = simOneBattle([stunner, rest[0]], rest.slice(1, 3), scene,
      { p1Ai: aiHard, p2Ai: aiHard, p1Mod: mod });
    if(r.winner === 1) wins++;
  }
  return wins / N * 100;
}

const never = run(setStun(0));
const real  = run(null);
const always = run(setStun(100));

console.log(`\n每格 ${N} 局。p1 固定带一名眩晕角色，双方都是 hard 决策。\n`);
console.log(`  眩晕全部落空   ${never.toFixed(1)}%`);
console.log(`  实际命中率     ${real.toFixed(1)}%   ← 现在的游戏`);
console.log(`  眩晕必中       ${always.toFixed(1)}%`);
console.log(`\n  落差 ${(always - never).toFixed(1)} 个百分点——**完全由骰子决定，玩家碰不到**。`);
console.log(`  作为对照：完美玩家和一般玩家的差距只有 12.6 个百分点。\n`);
