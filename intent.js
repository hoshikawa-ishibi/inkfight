// 敌人意图公开 + 承诺制 —— 本作战斗深度的地基（见 COMBAT_PLAN.md 任务 1）。
//
// 为什么单独一个文件：这是「回合流程编排」，不是战斗规则，所以不该塞进
// combat.js；但它又必须被 battle.js（真人对战）和 sim.js / 各种 check 脚本
// （测量玩家能不能用上这个机制）**共用同一份实现**——这个项目已经因为
// 「同一份知识两份实现」出过三次 bug。
//
// 纯函数，无 DOM / Audio / setTimeout 依赖，可在 Node 里直接测。
//
// ── 承诺制的契约 ──────────────────────────────────────────
// 玩家回合开始时，敌方下一个行动单位的打算被算出来、**公开**、并**锁定**。
// 轮到它时它照做，即使玩家的操作已经让这步棋变臭。
// 玩家于是可以：抢在它之前打死它、按预告的伤害量开盾、用嘲讽把它引开、
// 打断它、或者干脆换个人去接这一下。
//
// **只重解目标，绝不重选技能。** 否则「承诺」就是假的——玩家针对预告
// 做的所有布置都会落空，而这正是 Into the Breach 那套设计要避免的东西。
import { previewDmg } from './combat.js';
import { pickTarget } from './ai-scoring.js';

// 下一个该行动的单位。
// **battle.js 的 startTurn 和意图预测必须共用这一份**，否则会出现
// 「预告的是 A、实际动的是 B」——那比不公开意图还糟。
//
// 规则来自原 startTurn：两个都活着且上回合有人动过，就轮到另一个；
// 其余情况（只剩一个、或本方还没动过）都是列表里第一个活着的。
export function nextActor(units, lastActedId){
  const alive = units.filter(u => u.alive);
  if(!alive.length) return null;
  if(alive.length === 2 && lastActedId){
    return alive.find(u => u.id !== lastActedId) || alive[0];
  }
  return alive[0];
}

// 预估这一击会造成多少伤害。
// combat.js 的 previewDmg 不看目标（技能面板用它给玩家看自己的攻击力），
// 这里知道目标是谁，所以要把减防和「减防中」的增伤折进去——
// 报给玩家的数字不准，公开意图就失去意义了。
// 暴击不算进来：它是浮动项，标题上的「≈」就是在说这一点。
export function estimateDamage(unit, skill, target, scene){
  if(!skill.power) return null;
  const raw = previewDmg(unit, skill, scene);
  if(raw == null) return null;
  if(!target) return raw;
  let d = raw * (1 - target.def / (target.def + 50));
  if(target.debuffs.some(x => x.type === 'defDown')) d *= 1.2;
  return Math.max(1, Math.floor(d));
}

// 把 AI 的决策封成一份「承诺」。
// 存 id 而不是对象引用：单位可能在兑现之前死掉，存 id 才能干净地发现这件事。
// skill 存引用是安全的——技能是 createUnit 时深拷贝到单位身上的，不会被换掉。
export function makeIntent(unit, chosen, scene){
  if(!unit || !chosen || !chosen.skill) return null;
  const target = chosen.target || null;
  return {
    unitId: unit.id,
    skill: chosen.skill,
    targetId: target ? target.id : null,
    estDmg: estimateDamage(unit, chosen.skill, target, scene),
    hesitated: !!chosen.hesitated,
  };
}

// 兑现承诺。返回 { skill, target, retargeted, fellBack, hesitated }，
// 或 null（这份意图不是这个单位的 / 没有意图）。
//
// 三种失效情况：
//   目标已阵亡 → 按同类规则重选一个合法目标（技能不变）
//   HP 不够付 hpCost → 退化为普攻（只有 hpCost 会出现这种情况：
//                      SP 在承诺之后只增不减，玩家没有任何手段抽对方的蓝）
//   单位被打断 → 不走这里，调用方在行动开始前就把意图清掉了
export function resolveIntent(unit, intent, foes, friends, opts = {}){
  if(!intent || intent.unitId !== unit.id) return null;
  const skill = intent.skill;

  if(skill.hpCost && unit.hp <= skill.hpCost){
    const basic = unit.skills[0];
    return {
      skill: basic,
      target: pickTarget(unit, basic, foes, friends, opts),
      retargeted: false, fellBack: true, hesitated: false,
    };
  }

  let target = null;
  if(intent.targetId){
    target = [...foes, ...friends].find(u => u.id === intent.targetId && u.alive) || null;
  }
  const retargeted = !!intent.targetId && !target;
  if(!target) target = pickTarget(unit, skill, foes, friends, opts);

  return { skill, target, retargeted, fellBack: false, hesitated: intent.hesitated };
}
