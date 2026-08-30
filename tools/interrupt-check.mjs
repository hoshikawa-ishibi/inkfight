// 打断机制候选方案对照。
//
// 四组共用真实 sim.js 战斗循环、真实技能评分和同一批阵容结构：
//   none   — 只有技能自带伤害，没有控制（基准）
//   skip   — 当前规则：目标未来一次行动完全取消
//   weaken — 下一次行动的伤害 / 治疗降为 60%，但仍可正常操作
//   drain  — 立即削掉目标 30% maxSP，行动不受限
//
// 每边固定带一名打断角色，确保旋钮真的被用到；其它位置从非打断角色中抽。
// 完整跳过组启用 avoidStunned：会正确避开被打断角色，除非全队都中招，
// 避免把 AI 原本“不认识 stunned”的盲区误算成机制本身的缺点。
import { simOneBattle, shuffle } from './sim.js';
import { teamSizeFor } from '../src/core/state.js';
import { makeAi, aiHard } from '../src/ai/ai.js';
import { canUseSkill } from '../src/core/combat.js';
import { pickTarget } from '../src/ai/ai-scoring.js';
import { CHARACTERS, SCENES } from '../src/data/data.js';

const N = Number(process.argv[2] || 2500);
const TEAM = teamSizeFor('ai');
const STUNNERS = CHARACTERS.filter(c => c.skills.some(s => s.type === 'stun')).map(c => c.id);
const OTHERS = CHARACTERS.map(c => c.id).filter(id => !STUNNERS.includes(id));

const perfect = makeAi({ weight:1, noise:2, preferBasic:0, tactical:false, tempo:0.7, teamwork:0 });
const general = makeAi({ weight:1, noise:60, preferBasic:0, tactical:false, tempo:0.7, teamwork:0 });

function randomAi(u, enemies, allies, scene){
  const foes = enemies.filter(e=>e.alive), friends = allies.filter(a=>a.alive);
  const usable = u.skills.filter(s=>canUseSkill(u,s));
  if(!foes.length || !usable.length) return null;
  const skill = usable[Math.floor(Math.random()*usable.length)];
  return { skill, target:pickTarget(u,skill,foes,friends,{tempo:0.7,teamwork:0}) };
}

const LEVELS = [
  ['完美', perfect],
  ['一般', general],
  ['乱按', randomAi],
];

const MODES = [
  ['无控制', 'none'],
  ['完整跳过', 'skip'],
  ['行动削弱40%', 'weaken'],
  ['削减30%SP', 'drain'],
];

function modeMod(mode){
  return u => u.skills.forEach(s=>{
    if(s.type !== 'stun') return;
    s.interruptMode = mode;
    if(mode === 'weaken') s.interruptWeaken = 0.6;
    if(mode === 'drain') s.interruptDrain = 0.3;
  });
}

function run(mode, p1Ai){
  let wins=0, rounds=0, timeouts=0;
  for(let i=0;i<N;i++){
    const pool=shuffle(OTHERS);
    const p1=[STUNNERS[i%STUNNERS.length], ...pool.slice(0,TEAM-1)];
    const p2=[STUNNERS[(i+1)%STUNNERS.length], ...pool.slice(TEAM-1,(TEAM-1)*2)];
    const scene=SCENES[i%SCENES.length];
    const r=simOneBattle(p1,p2,scene,{
      p1Ai, p2Ai:aiHard,
      p1Mod:modeMod(mode), p2Mod:modeMod(mode),
      avoidStunned:true,
    });
    if(r.winner===1) wins++;
    rounds+=r.rounds;
    if(r.timeout) timeouts++;
  }
  return { win:wins/N*100, rounds:rounds/N, timeout:timeouts/N*100 };
}

console.log(`\n每格 ${N} 局；双方各固定一名打断角色，其余随机；敌方 hard。`);
console.log('“策略差距”看完美玩家比一般 / 乱按多赢多少，不只看技能有多强。\n');
console.log('方案             完美     一般     乱按  │ 完美-一般  完美-乱按 │ 平均回合');
console.log('─────────────────────────────────────────┼──────────────────────┼────────');
for(const [name,mode] of MODES){
  const out=LEVELS.map(([,ai])=>run(mode,ai));
  const pg=out[0].win-out[1].win, pr=out[0].win-out[2].win;
  console.log(
    name.padEnd(14) + out.map(x=>`${x.win.toFixed(1)}%`.padStart(9)).join('') +
    ` │ ${pg.toFixed(1).padStart(9)}  ${pr.toFixed(1).padStart(9)} │ ${out[0].rounds.toFixed(1).padStart(7)}`
  );
}
console.log();
