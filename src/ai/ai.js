// 玩家对战的 AI。技能评分本身来自 ai-scoring.js（与平衡测试共用同一份），
// 本文件只负责「难度包装」：在同一套评分之上叠加噪声与战术加成。
//
// 这样三档难度的差别是可解释的——不是三套互不相干的经验值，而是同一个
// 判断标准配上不同的执行水平：
//   简单  评分只起弱作用 + 大噪声 + 偶尔抡普攻 + 不会配合（像个新手）
//   普通  按评分走 + 中等噪声 + 一半的配合意识
//   困难  按评分走 + 极小噪声 + 完全配合 + 前瞻加成
import { scoreSkill, pickTarget } from "./ai-scoring.js";
import { canUseSkill as canUse } from "../core/combat.js";

// noise 是加在评分上的随机量，越大越容易选到次优解。
// 共享评分本身已经相当聪明，所以普通难度必须有足够噪声才不会跟困难一样强
// （实测 noise=10 时普通与困难的决策质量只差 0.4，难度形同虚设）。
// 三档难度不是三套评分，而是同一套评分配上不同的「执行水平」：
//   noise    随机量，越大越容易选到次优解
//   tempo    机会成本的权重（0~1）：算不算得清「拿这回合去加 buff 就少打一轮」
//   teamwork 配合的权重（0~1）：集火、不重复上 buff、队友濒危时顶上去
//   tactical 是否具备前瞻判断
// 只靠 noise 拉不开普通与困难的差距（实测 noise 从 10 加到 45，决策质量
// 也只差 2.3），所以改为让低难度「算不清长远账」。但 tempo 也不能直接归零：
// 实测守卫在 tempo=0 时 98% 的回合都在开护盾，反而比简单难度还差。
const DIFFICULTY = {
  easy: {
    weight: 0.5,
    noise: 35,
    preferBasic: 0.25,
    tactical: false,
    tempo: 0.35,
    teamwork: 0,
  },
  normal: {
    weight: 1.0,
    noise: 12,
    preferBasic: 0,
    tactical: false,
    tempo: 0.7,
    teamwork: 0.5,
  },
  hard: {
    weight: 1.0,
    noise: 0,
    preferBasic: 0,
    tactical: true,
    tempo: 1,
    teamwork: 1,
  },
  // 隐藏档「墨皇」：**这就是难度重做之前的那个困难**，原样冻结在这里。
  // 通关战役后才出现在难度选择界面。困难档接下来会在属性层放松，
  // 但决策水平不变——所以这一档和困难的差别只在属性，不在脑子。
  nightmare: {
    weight: 1.0,
    noise: 0,
    preferBasic: 0,
    tactical: true,
    tempo: 1,
    teamwork: 1,
  },
};

// 困难难度独有的战术判断。共享评分已经涵盖了「能补刀」「条件不满足则不放」
// 这类基本盘，配合类判断（集火、保护濒危队友）也已经下沉到共享评分并由
// teamwork 权重分档，所以这里只剩纯粹的「前瞻」——那些看一步之后才划算的选择。
function tacticalBonus(u, s, foes) {
  let b = 0;
  const hpFrac = u.hp / u.maxHp;

  // 自己濒危时优先保命
  if (hpFrac < 0.3 && ["dodge", "revive", "shield"].includes(s.type)) b += 20;

  return b;
}

// ctx 是本方队伍的战术上下文（ai-scoring.js 的 makeTeamContext），
// 由调用方为每支队伍持有一个，用来让同队单位集火同一个目标。
// 不传也能跑，只是每个单位各打各的。
// `threat` 是承诺制公开出来的敌方下一击（`{unitId,targetId,dmg}`），可缺省。
// 只有**看得见意图的一方**会拿到它——真实游戏里就是玩家，所以在
// difficulty-check / depth-check 里它只传给玩家替身那一侧。
// 不传的话行为和以前完全一样（防御类技能退回「按平均伤害瞎估」的老路径）。
function decide(u, enemies, allies, scene, cfg, ctx, threat) {
  const foes = enemies.filter((e) => e.alive);
  const friends = allies.filter((a) => a.alive);
  if (!foes.length) return null;
  const opts = {
    tempo: cfg.tempo,
    teamwork: cfg.teamwork,
    ctx,
    threat: threat || null,
  };

  // 简单难度：偶尔直接抡普攻，保留「新手会浪费机会」的手感。
  // 这个比例以前是 0.7（七成回合都在平A），实测那样它必须靠 atk ×1.15 的
  // **属性倒挂**才够得上 85% 的目标——「简单模式敌人伤害比困难还高」
  // 在难度选择界面上读起来很荒唐。降到 0.25 之后属性可以老实地是减益。
  if (cfg.preferBasic && Math.random() < cfg.preferBasic) {
    const basic = u.skills[0];
    if (canUse(u, basic)) {
      const hadBetter = u.skills.some((s) => s !== basic && canUse(u, s));
      return {
        skill: basic,
        target: pickTarget(u, basic, foes, friends, opts),
        hesitated: hadBetter,
      };
    }
  }

  // raw = 没加噪声的评分。留着它是为了知道「这次选的是不是次优解」——
  // 低难度靠噪声选到次优解时，玩家应当**看得见 AI 在犹豫**，而不是感觉
  // 自己莫名其妙就赢了。困难/墨皇的 noise 只有 2，这里几乎永不触发，
  // 所以高难度看起来依旧是一台不会失误的机器（正是想要的效果）。
  let best = null,
    bestScore = -Infinity,
    bestRaw = -Infinity,
    topRaw = -Infinity;
  for (const s of u.skills) {
    if (!canUse(u, s)) continue;
    let raw = scoreSkill(u, s, foes, friends, scene, opts) * cfg.weight;
    if (cfg.tactical) raw += tacticalBonus(u, s, foes);
    if (raw > topRaw) topRaw = raw;
    const score = raw + Math.random() * cfg.noise;
    if (score > bestScore) {
      bestScore = score;
      best = s;
      bestRaw = raw;
    }
  }

  // 全部技能都不划算时也别空过回合，退而用最便宜的
  if (!best) {
    const usable = u.skills.filter((s) => canUse(u, s));
    best = usable.sort((a, b) => a.inkCost - b.inkCost)[0] || null;
  }
  if (!best) return null;

  return {
    skill: best,
    target: pickTarget(u, best, foes, friends, opts),
    // 阈值 5 是扫出来的。实测各档的犹豫率：简单 38.9% / 普通 4.4% /
    // 困难 0% / 墨皇 0%。阈值 3 会让简单吵到 50.8%，阈值 8 会让普通掉到
    // 0.8%（等于没有）。注意普通那 4.4% 全部来自噪声路径——所以上面
    // 记 topRaw 这几行是有用的，光靠 preferBasic 标记只能覆盖简单档。
    hesitated: topRaw - bestRaw > 5,
  };
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
export function makeAi(cfg) {
  const fn = (u, enemies, allies, scene, ctx, threat) =>
    decide(u, enemies, allies, scene, cfg, ctx, threat);
  fn.inkNoise = cfg.noise;
  return fn;
}

export const aiEasy = makeAi(DIFFICULTY.easy);
export const aiNormal = makeAi(DIFFICULTY.normal);
export const aiHard = makeAi(DIFFICULTY.hard);
export const aiNightmare = makeAi(DIFFICULTY.nightmare);

// 难度档 → AI。battle.js / campaign-check.mjs 共用这一份，
// 免得每加一档就要改三处 if-else 或三份查表。
export const AI_BY_LEVEL = {
  easy: aiEasy,
  normal: aiNormal,
  hard: aiHard,
  nightmare: aiNightmare,
};
