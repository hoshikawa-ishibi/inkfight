// 探险模式 AI：在整队的合法「演员 × 技能」组合里挑一步。
import { previewDmg } from "../core/combat.js";
import { scoreSkill, pickTarget, makeTeamContext } from "./ai-scoring.js";
import {
  canInkAct,
  inkActionCost,
  previewInkSkill,
  INK_RULES,
} from "../core/ink-turn.js";

function shieldValue(turn, allies) {
  const reserve = turn.relics.includes("reserve") ? 2 : 1;
  const perUnit = Math.min(
    turn.remaining * INK_RULES.shieldPerInk * reserve,
    INK_RULES.maxEndShieldPerUnit,
  );
  return perUnit * allies.filter((u) => u.alive).length * 0.42;
}

function followupPossible(turn, allies, chosenActor, spent) {
  const left = turn.remaining - spent;
  if (left <= 0) return false;
  return allies.some(
    (u) =>
      u.alive &&
      u !== chosenActor &&
      !turn.acted.includes(u.id) &&
      u.skills.some(
        (s) =>
          inkActionCost(
            { ...turn, remaining: left, chain: [...turn.chain, {}] },
            u,
            s,
          ) <= left,
      ),
  );
}

// 只看下一笔，不复制战斗执行器：它的作用是识别“这笔之后还接得上一招”，
// 具体 buff / 伤害仍由真正执行后的下一次 chooseInkAction 重新评分。
function followupValue(turn, allies, foes, scene, chosenActor, spent) {
  const left = turn.remaining - spent;
  if (left <= 0) return 0;
  const nextTurn = {
    ...turn,
    remaining: left,
    acted: [...turn.acted, chosenActor.id],
    chain: [...turn.chain, {}],
  };
  let best = 0;
  for (const actor of allies) {
    if (actor === chosenActor || nextTurn.acted.includes(actor.id)) continue;
    for (const skill of actor.skills || []) {
      if (!canInkAct(nextTurn, actor, skill)) continue;
      const transformed = previewInkSkill(nextTurn, actor, skill);
      const raw = scoreSkill(actor, transformed, foes, allies, scene, {
        tempo: 0.55,
        teamwork: 1,
        ctx: makeTeamContext(),
      });
      best = Math.max(best, raw / inkActionCost(nextTurn, actor, skill));
    }
  }
  return best;
}

export function chooseInkAction(
  turn,
  allies,
  foes,
  scene,
  { random = () => Math.random(), noise = 0 } = {},
) {
  if (!turn || turn.ended) return null;
  const liveAllies = (allies || []).filter((u) => u.alive);
  const liveFoes = (foes || []).filter((u) => u.alive);
  if (!liveAllies.length || !liveFoes.length) return null;

  const candidates = [];
  for (const actor of liveAllies) {
    for (const skill of actor.skills || []) {
      if (!canInkAct(turn, actor, skill)) continue;
      const transformed = previewInkSkill(turn, actor, skill);
      const cost = inkActionCost(turn, actor, skill);
      const ctx = makeTeamContext();
      const target = pickTarget(actor, transformed, liveFoes, liveAllies, {
        tempo: 0.55,
        teamwork: 1,
        ctx,
      });
      const raw = scoreSkill(actor, transformed, liveFoes, liveAllies, scene, {
        tempo: 0.55,
        teamwork: 1,
        ctx,
      });
      const predicted = target ? previewDmg(actor, transformed, scene) : null;
      const kill =
        predicted != null && predicted >= target.hp + (target.shield || 0)
          ? 34
          : 0;
      const completes = cost === turn.remaining ? 7 : 0;
      const followup = followupPossible(turn, liveAllies, actor, cost) ? 4 : -3;
      const lookahead =
        followupValue(turn, liveAllies, liveFoes, scene, actor, cost) * 0.12;
      const setup =
        ["buff", "buffAll", "selfBuff", "cleanse"].includes(skill.type) &&
        followup > 0
          ? 5
          : 0;
      const flow =
        turn.relics.includes("flow") && turn.chain.length < 2 && cost === 1
          ? 5
          : 0;
      const economy =
        raw / cost +
        raw * 0.16 +
        lookahead +
        kill +
        completes +
        followup +
        setup +
        flow;
      const jitter = noise ? (random() * 2 - 1) * noise : 0;
      candidates.push({ actor, skill, target, value: economy + jitter });
    }
  }
  if (!candidates.length) return null;
  candidates.sort(
    (a, b) =>
      b.value - a.value ||
      inkActionCost(turn, a.actor, a.skill) -
        inkActionCost(turn, b.actor, b.skill),
  );

  // 留下的墨也是真实选择：当前最好动作还不如把墨化盾，就提前收手。
  if (
    turn.chain.length > 0 &&
    candidates[0].value < shieldValue(turn, liveAllies)
  )
    return null;
  const best = candidates[0];
  return { actor: best.actor, skill: best.skill, target: best.target };
}
