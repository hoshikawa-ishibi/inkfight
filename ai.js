// 玩家对战的 AI。技能评分本身来自 ai-scoring.js（与平衡测试共用同一份），
// 本文件只负责「难度包装」：在同一套评分之上叠加噪声与战术加成。
//
// 这样三档难度的差别是可解释的——不是三套互不相干的经验值，而是同一个
// 判断标准配上不同的执行水平：
//   简单  评分只起弱作用 + 大噪声 + 偏爱普攻 + 不会配合（像个新手）
//   普通  按评分走 + 中等噪声 + 一半的配合意识
//   困难  按评分走 + 极小噪声 + 完全配合 + 前瞻加成（攒蓝放大招、挑满蓝的目标晕）
import { scoreSkill, pickTarget } from './ai-scoring.js';

// noise 是加在评分上的随机量，越大越容易选到次优解。
// 共享评分本身已经相当聪明，所以普通难度必须有足够噪声才不会跟困难一样强
// （实测 noise=10 时普通与困难的决策质量只差 0.4，难度形同虚设）。
// 三档难度不是三套评分，而是同一套评分配上不同的「执行水平」：
//   noise    随机量，越大越容易选到次优解
//   tempo    机会成本的权重（0~1）：算不算得清「拿这回合去加 buff 就少打一轮」
//   teamwork 配合的权重（0~1）：集火、不重复上 buff、队友濒危时顶上去
//   tactical 是否具备前瞻判断（攒蓝放大招、专挑满蓝的目标晕）
// 只靠 noise 拉不开普通与困难的差距（实测 noise 从 10 加到 45，决策质量
// 也只差 2.3），所以改为让低难度「算不清长远账」。但 tempo 也不能直接归零：
// 实测守卫在 tempo=0 时 98% 的回合都在开护盾，反而比简单难度还差。
const DIFFICULTY = {
  easy:   { weight: 0.5, noise: 30, preferBasic: 0.7, tactical: false, tempo: 0.35, teamwork: 0   },
  normal: { weight: 1.0, noise: 12, preferBasic: 0,   tactical: false, tempo: 0.7,  teamwork: 0.5 },
  hard:   { weight: 1.0, noise: 2,  preferBasic: 0,   tactical: true,  tempo: 1,    teamwork: 1   },
  // 隐藏档「墨皇」：**这就是难度重做之前的那个困难**，原样冻结在这里。
  // 通关战役后才出现在难度选择界面。困难档接下来会在属性层放松，
  // 但决策水平不变——所以这一档和困难的差别只在属性，不在脑子。
  nightmare: { weight: 1.0, noise: 2, preferBasic: 0, tactical: true, tempo: 1, teamwork: 1 },
};

// 困难难度独有的战术判断。共享评分已经涵盖了「能补刀」「条件不满足则不放」
// 这类基本盘，配合类判断（集火、保护濒危队友）也已经下沉到共享评分并由
// teamwork 权重分档，所以这里只剩纯粹的「前瞻」——那些看一步之后才划算的选择。
function tacticalBonus(u, s, foes){
  let b = 0;
  const hpFrac = u.hp / u.maxHp;

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

// ctx 是本方队伍的战术上下文（ai-scoring.js 的 makeTeamContext），
// 由调用方为每支队伍持有一个，用来让同队单位集火同一个目标。
// 不传也能跑，只是每个单位各打各的。
function decide(u, enemies, allies, scene, cfg, ctx){
  const foes = enemies.filter(e => e.alive);
  const friends = allies.filter(a => a.alive);
  if(!foes.length) return null;
  const opts = { tempo: cfg.tempo, teamwork: cfg.teamwork, ctx };

  // 简单难度：大概率直接抡普攻，保留「新手只会平A」的手感
  if(cfg.preferBasic && Math.random() < cfg.preferBasic){
    const basic = u.skills[0];
    if(canUse(u, basic)){
      return { skill: basic, target: pickTarget(u, basic, foes, friends, opts) };
    }
  }

  let best = null, bestScore = -Infinity;
  for(const s of u.skills){
    if(!canUse(u, s)) continue;
    let score = scoreSkill(u, s, foes, friends, scene, opts) * cfg.weight;
    if(cfg.tactical) score += tacticalBonus(u, s, foes);
    score += Math.random() * cfg.noise;
    if(score > bestScore){ bestScore = score; best = s; }
  }

  // 全部技能都不划算时也别空过回合，退而用最便宜的
  if(!best){
    const usable = u.skills.filter(s => canUse(u, s));
    best = usable.sort((a,b) => a.cost - b.cost)[0] || null;
  }
  if(!best) return null;

  return { skill: best, target: pickTarget(u, best, foes, friends, opts) };
}

// 按 cfg 造一个 AI。三档难度只是它的三个实例。
//
// 导出它是给 difficulty-check.mjs 造「玩家替身」用的：那边需要的是
// 「同一套评分、但更容易选到次优解、而且不集火」，正好就是另一组 cfg——
// 所以不必再写第二份决策循环。（实测 noise 30/60/100 拉出的水平梯度，
// 和"每回合有 10%/25%/40% 概率乱选技能"几乎重合，所以也不需要额外的失误字段。）
//
// **注意：不要把新 cfg 注册成第四个难度档。** 玩家替身是测量工具，
// 玩家永远不该在 UI 里见到它。
export function makeAi(cfg){
  return (u, enemies, allies, scene, ctx) => decide(u, enemies, allies, scene, cfg, ctx);
}

export const aiEasy      = makeAi(DIFFICULTY.easy);
export const aiNormal    = makeAi(DIFFICULTY.normal);
export const aiHard      = makeAi(DIFFICULTY.hard);
export const aiNightmare = makeAi(DIFFICULTY.nightmare);

// 难度档 → AI。battle.js / campaign-check.mjs 共用这一份，
// 免得每加一档就要改三处 if-else 或三份查表。
export const AI_BY_LEVEL = {
  easy: aiEasy, normal: aiNormal, hard: aiHard, nightmare: aiNightmare,
};
