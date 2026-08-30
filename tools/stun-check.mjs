// 「打断这个机制值多少胜率？」
//
// 改造前它叫「眩晕」，是概率命中（basePct + spScale × SP占比）。
// 那时这个脚本量的是**骰子的话语权**：落差 29.6 个百分点，
// 而玩家的全部技术只值 12.6 点——用户说的「输赢纯看负面有没有上」就是它。
//
// 2026-08-29 再改为「灵能扰乱」：目标 SP ≥ 阈值就让其下一次行动的伤害 / 治疗
// 降低 40%，不再跳过行动。所以这里现在只量「阈值容易/困难触发时，角色强度差多少」。
// 真正比较完整跳过 / 扰乱 / 削 SP 的策略差距，请跑 interrupt-check.mjs。
//   要打断：挑 SP 满的目标、卡在它蓄力时下手
//   不被打断：别坐在满蓝上，该花就花
//
// 两个数字都要看：
//   落差变小 = 这个机制不再一手遮天
//   实际值不变 = 机制强度没被削，只是波动没了
import { simOneBattle, shuffle } from './sim.js';
import { teamSizeFor } from '../src/core/state.js';
const N_TEAM = teamSizeFor('ai');   // 随机对战 3v3，见 state.js 的 teamSizeFor
import { aiHard } from '../src/ai/ai.js';
import { CHARACTERS, SCENES } from '../src/data/data.js';

const N = Number(process.argv[2] || 4000);
const STUNNERS = ['mage', 'archer'];   // 灵能过载 / 束缚箭

// 把 p1 的打断成功率钉死。skills 是每个单位各自的深拷贝，改它不污染 data.js。
// 阈值 0 = 任何 SP 都打得断（必中）；阈值 >1 = 永远够不到（必不中）。
const setStun = frac => u => {
  u.skills.forEach(s => { if(s.type === 'stun') s.spThreshold = frac; });
};

function run(mod){
  let wins = 0;
  for(let i = 0; i < N; i++){
    // p1 必带一个眩晕角色，否则这个旋钮没东西可拧
    const stunner = STUNNERS[i % STUNNERS.length];
    const rest = shuffle(CHARACTERS.map(c => c.id).filter(id => id !== stunner));
    const scene = SCENES[Math.floor(Math.random() * SCENES.length)];
    const r = simOneBattle([stunner, ...rest.slice(0, N_TEAM-1)], rest.slice(N_TEAM-1, N_TEAM*2-1), scene,
      { p1Ai: aiHard, p2Ai: aiHard, p1Mod: mod });
    if(r.winner === 1) wins++;
  }
  return wins / N * 100;
}

const never = run(setStun(99));
const real  = run(null);
const always = run(setStun(0));

console.log(`\n每格 ${N} 局。p1 固定带一名打断角色，双方都是 hard 决策。\n`);
console.log(`  打断全部落空   ${never.toFixed(1)}%`);
console.log(`  实际成功率     ${real.toFixed(1)}%   ← 现在的游戏`);
console.log(`  打断必中       ${always.toFixed(1)}%`);
console.log(`\n  阈值旋钮跨度 ${(always - never).toFixed(1)} 个百分点。`);
console.log('  这不是随机落差；正式规则是确定性的，玩家能看到双方 SP 后决定目标。\n');
