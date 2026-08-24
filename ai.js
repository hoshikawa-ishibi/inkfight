// 玩家对战的 AI。技能评分本身来自 ai-scoring.js（与平衡测试共用同一份），
// 本文件只负责「难度包装」：在同一套评分之上叠加噪声与战术加成。
//
// 这样三档难度的差别是可解释的——不是三套互不相干的经验值，而是同一个
// 判断标准配上不同的执行水平：
//   简单  评分只起弱作用 + 大噪声 + 偏爱普攻（像个新手）
//   普通  按评分走 + 中等噪声
//   困难  按评分走 + 极小噪声 + 战术加成（会针对脆皮、护住残血队友）
import { rand } from './state.js';
import { needsEnemyTarget } from './combat.js';
import { scoreSkill, pickTarget } from './ai-scoring.js';

// noise 是加在评分上的随机量，越大越容易选到次优解。
// 共享评分本身已经相当聪明，所以普通难度必须有足够噪声才不会跟困难一样强
// （实测 noise=10 时普通与困难的决策质量只差 0.4，难度形同虚设）。
// 三档难度不是三套评分，而是同一套评分配上不同的「执行水平」：
//   noise   随机量，越大越容易选到次优解
//   tempo   机会成本的权重（0~1）：算不算得清「拿这回合去加 buff 就少打一轮」
//   tactical 是否具备前瞻判断（针对脆皮、护住残血队友等）
// 只靠 noise 拉不开普通与困难的差距（实测 noise 从 10 加到 45，决策质量
// 也只差 2.3），所以改为让低难度「算不清长远账」。但 tempo 也不能直接归零：
// 实测守卫在 tempo=0 时 98% 的回合都在开护盾，反而比简单难度还差。
const DIFFICULTY = {
  easy:   { weight: 0.5, noise: 30, preferBasic: 0.7, tactical: false, tempo: 0.35 },
  normal: { weight: 1.0, noise: 12, preferBasic: 0,   tactical: false, tempo: 0.7  },
  hard:   { weight: 1.0, noise: 2,  preferBasic: 0,   tactical: true,  tempo: 1    },
};

// 困难难度独有的战术判断。共享评分已经涵盖了「能补刀」「条件不满足则不放」
// 这类基本盘，所以这里只补充更前瞻的判断，避免重复计分。
function tacticalBonus(u, s, foes, friends){
  let b = 0;
  const fragile = foes.reduce((a,c)=> a.maxHp <= c.maxHp ? a : c);
  const lowFriend = friends.length
    ? friends.reduce((a,c)=> a.hp/a.maxHp <= c.hp/c.maxHp ? a : c) : null;
  const hpFrac = u.hp / u.maxHp;

  // 集火脆皮：优先打最脆的那个，而不是见谁打谁
  if(needsEnemyTarget(s) && fragile.hp/fragile.maxHp < 0.5) b += 12;

  // 队友濒危时，保护类技能的优先级要顶上去
  if(lowFriend && lowFriend.hp/lowFriend.maxHp < 0.3 &&
     ['heal','shield','taunt','cleanse','buff'].includes(s.type)) b += 25;

  // 自己濒危时优先保命
  if(hpFrac < 0.3 && ['dodge','revive','shield'].includes(s.type)) b += 20;

  // 回蓝刚好能解锁一个大招时，值得先回蓝
  if(s.type === 'healSp'){
    const big = u.skills.find(k => k.cost >= 30);
    if(big && u.sp < big.cost && u.sp + (s.spGain||0) >= big.cost) b += 20;
  }

  // 眩晕高 SP 目标更划算（命中率随目标 SP 上升）
  if(s.type === 'stun' && foes.some(f => f.sp >= f.maxSp * 0.7)) b += 15;

  return b;
}

function canUse(u, s){
  if(u.sp < s.cost) return false;
  if(s.hpCost && u.hp <= s.hpCost) return false;
  return true;
}

function decide(u, enemies, allies, scene, level){
  const cfg = DIFFICULTY[level];
  const foes = enemies.filter(e => e.alive);
  const friends = allies.filter(a => a.alive);
  if(!foes.length) return null;

  // 简单难度：大概率直接抡普攻，保留「新手只会平A」的手感
  if(cfg.preferBasic && Math.random() < cfg.preferBasic){
    const basic = u.skills[0];
    if(canUse(u, basic)){
      return { skill: basic, target: pickTarget(u, basic, foes, friends) };
    }
  }

  let best = null, bestScore = -Infinity;
  for(const s of u.skills){
    if(!canUse(u, s)) continue;
    let score = scoreSkill(u, s, foes, friends, scene, { tempo: cfg.tempo }) * cfg.weight;
    if(cfg.tactical) score += tacticalBonus(u, s, foes, friends);
    score += Math.random() * cfg.noise;
    if(score > bestScore){ bestScore = score; best = s; }
  }

  // 全部技能都不划算时也别空过回合，退而用最便宜的
  if(!best){
    const usable = u.skills.filter(s => canUse(u, s));
    best = usable.sort((a,b) => a.cost - b.cost)[0] || null;
  }
  if(!best) return null;

  return { skill: best, target: pickTarget(u, best, foes, friends) };
}

export function aiEasy(u, enemies, allies, scene){
  return decide(u, enemies, allies, scene, 'easy');
}
export function aiNormal(u, enemies, allies, scene){
  return decide(u, enemies, allies, scene, 'normal');
}
export function aiHard(u, enemies, allies, scene){
  return decide(u, enemies, allies, scene, 'hard');
}
