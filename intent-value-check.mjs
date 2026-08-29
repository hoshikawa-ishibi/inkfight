// 「意图公开到底值多少？」—— 任务 1 的验收实验。
//
// sim.js 的 `opts.intent` 可以关掉承诺制，于是同一批对局能跑两遍：
//   关：玩家看不见下一击（改造前的世界）
//   开：玩家看得见并且敌人被承诺锁住（改造后的世界）
//
// 两件事要同时成立才算成功：
//   1. 玩家胜率上升——信息本来就该值钱
//   2. **策略价值（完美 − 乱按）的落差变大**——这才是重点。
//      光让玩家变强不算深度，要「打得好」比「乱按」更值钱才算。
import { simOneBattle, shuffle } from './sim.js';
import { makeAi, AI_BY_LEVEL } from './ai.js';
import { DIFFICULTY_MODS, applyStageMod, canUseSkill } from './combat.js';
import { CHARACTERS, SCENES } from './data.js';
import { CAMPAIGN_STAGES, CAMPAIGN_HERO, availableAllies } from './campaign.js';
import { pickTarget } from './ai-scoring.js';

const N = Number(process.argv[2] || 1500);
const skilled = noise => makeAi(
  { weight:1, noise, preferBasic:0, tactical:false, tempo:0.7, teamwork:0 });

function aiRandom(u, enemies, allies){
  const foes = enemies.filter(e => e.alive), friends = allies.filter(a => a.alive);
  if(!foes.length) return null;
  const usable = u.skills.filter(s => canUseSkill(u, s));
  if(!usable.length) return null;
  const s = usable[Math.floor(Math.random() * usable.length)];
  return { skill:s, target: pickTarget(u, s, foes, friends, { tempo:0.7, teamwork:0 }) };
}

const LADDER = [['完美',skilled(2)], ['一般',skilled(60)], ['乱按',aiRandom]];

function randomMatch(pAi, level, intentOn){
  const mod = DIFFICULTY_MODS[level];
  let wins = 0;
  for(let i = 0; i < N; i++){
    const ids = shuffle(CHARACTERS.map(c => c.id));
    const scene = SCENES[Math.floor(Math.random() * SCENES.length)];
    if(simOneBattle(ids.slice(0,2), ids.slice(2,4), scene, {
      p1Ai:pAi, p2Ai:AI_BY_LEVEL[level], intent:intentOn,
      p2Mod: mod ? (u => applyStageMod(u, mod)) : null,
    }).winner === 1) wins++;
  }
  return wins / N * 100;
}

function stage(st, pAi, intentOn){
  const scene = SCENES.find(s => s.id === st.scene);
  const allies = availableAllies(st, st.id - 1);
  let wins = 0;
  for(let i = 0; i < N; i++){
    if(simOneBattle([CAMPAIGN_HERO.id, allies[i % allies.length].id], st.enemy, scene, {
      p1Ai:pAi, p2Ai:AI_BY_LEVEL[st.difficulty], intent:intentOn,
      p2Mod: st.enemyMod ? (u => applyStageMod(u, st.enemyMod)) : null,
    }).winner === 1) wins++;
  }
  return wins / N * 100;
}

function report(label, fn){
  const off = LADDER.map(([,ai]) => fn(ai, false));
  const on  = LADDER.map(([,ai]) => fn(ai, true));
  const sOff = off[0] - off[2], sOn = on[0] - on[2];
  console.log(`\n  ${label}`);
  console.log('                     完美     一般     乱按   │ 策略价值');
  console.log('    ───────────────────────────────────────┼──────────');
  console.log('    意图不公开   ' + off.map(v=>`${v.toFixed(1)}%`.padStart(8)).join('') + `   │  ${sOff.toFixed(1)} 点`);
  console.log('    意图公开     ' + on.map(v=>`${v.toFixed(1)}%`.padStart(8)).join('') + `   │  ${sOn.toFixed(1)} 点`);
  console.log(`    ${sOn > sOff ? '✓' : '✗'} 策略价值 ${sOff.toFixed(1)} → ${sOn.toFixed(1)}（${sOn-sOff>=0?'+':''}${(sOn-sOff).toFixed(1)}）`);
}

console.log(`\n每格 ${N} 局。「策略价值」= 完美玩家胜率 − 闭眼乱按胜率。`);
console.log('要的不只是玩家变强，而是**打得好比乱按更值钱**。');
report('随机阵容 · 困难档', (ai,on) => randomMatch(ai,'hard',on));
report('随机阵容 · 墨皇档', (ai,on) => randomMatch(ai,'nightmare',on));
report('战役第 8 关 · 墨皇 BOSS', (ai,on) => stage(CAMPAIGN_STAGES[7],ai,on));
console.log();
