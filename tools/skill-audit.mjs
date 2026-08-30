// 技能价值审计：**这个技能到底承不承重？**
//
// 做法是逐个把技能禁掉（AI 不许选它），看它的主人胜率掉多少。
//   掉得多 → 这个技能是这套配置的支柱
//   几乎不掉 → 它是死内容，占着一个格子却什么都没干
//
// 这份诊断回答的是 choice-check 回答不了的问题。使用率低有两种可能：
//   (a) 技能本身弱 → 要改**设计**（数值 / 效果）
//   (b) 技能不弱但 AI 低估了 → 要改**评分**
// 禁用实验能分开这两种：如果禁掉一个「低使用率」技能之后胜率明显下滑，
// 说明它在关键时刻其实很关键，只是不常用——那就不是死技能。
//
// 用法：node skill-audit.mjs [每格局数]
import { simOneBattle, shuffle } from './sim.js';
import { teamSizeFor } from '../src/core/state.js';
const N_TEAM = teamSizeFor('ai');   // 随机对战 3v3，见 state.js 的 teamSizeFor
import { makeAi, AI_BY_LEVEL } from '../src/ai/ai.js';
import { canUseSkill } from '../src/core/combat.js';
import { scoreSkill, pickTarget } from '../src/ai/ai-scoring.js';
import { CHARACTERS, SCENES } from '../src/data/data.js';

const N = Number(process.argv[2] || 500);

// 完美决策，但可以禁掉指定角色的某个技能
function makeProbe(banCharId, banSkillName){
  return function(u, enemies, allies, scene, ctx, threat){
    const foes = enemies.filter(e => e.alive);
    const friends = allies.filter(a => a.alive);
    if(!foes.length) return null;
    const opts = { tempo: 1, teamwork: 1, ctx, threat: threat || null };
    let pool = u.skills.filter(s => canUseSkill(u, s));
    if(u.charId === banCharId){
      const kept = pool.filter(s => s.name !== banSkillName);
      if(kept.length) pool = kept;         // 全禁光就只好放它，别把回合空过
    }
    if(!pool.length) return null;
    const best = pool.map(s => ({ s, v: scoreSkill(u, s, foes, friends, scene, opts) }))
                     .sort((a, b) => b.v - a.v)[0];
    return { skill: best.s, target: pickTarget(u, best.s, foes, friends, opts) };
  };
}

// charId 固定在 p1 出战，队友和对手随机
function winRate(charId, ai){
  let w = 0;
  for(let i = 0; i < N; i++){
    const rest = shuffle(CHARACTERS.map(c => c.id).filter(id => id !== charId));
    const scene = SCENES[Math.floor(Math.random() * SCENES.length)];
    if(simOneBattle([charId, ...rest.slice(0, N_TEAM-1)], rest.slice(N_TEAM-1, N_TEAM*2-1), scene,
       { p1Ai: ai, p2Ai: AI_BY_LEVEL.hard }).winner === 1) w++;
  }
  return w / N * 100;
}

console.log(`\n每格 ${N} 局。禁掉一个技能，看它的主人胜率掉多少。`);
console.log('掉得越多 = 这个技能越承重；几乎不掉 = 死内容，占着格子没干活。\n');
console.log('  角色      技能            基准     禁用后    影响');
console.log('  ──────────────────────────────────────────────────────');

const dead = [];
for(const c of CHARACTERS){
  const base = winRate(c.id, makeProbe(null, null));
  for(const s of c.skills){
    const off = winRate(c.id, makeProbe(c.id, s.name));
    const d = base - off;
    const flag = d >= 4 ? '★支柱' : d >= 1.5 ? '·有用' : d <= -1.5 ? '⚠禁掉更好' : '　死内容';
    if(d < 1.5) dead.push(`${c.name}/${s.name}`);
    console.log(`  ${c.name.padEnd(8)}  ${s.name.padEnd(14)} ${base.toFixed(1).padStart(5)}%  ${off.toFixed(1).padStart(5)}%  ${(d>=0?'-':'+')}${Math.abs(d).toFixed(1).padStart(4)}  ${flag}`);
  }
}
console.log(`\n  死内容（禁掉几乎没影响）共 ${dead.length} 个：`);
console.log('    ' + dead.join('  '));
console.log('\n  注意：使用率低 ≠ 死内容。低使用率但禁掉会掉胜率的技能，');
console.log('  是「不常用但关键时刻救命」——那种不用改。\n');
