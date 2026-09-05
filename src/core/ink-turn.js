import { canUseSkill, processStartOfTurn } from "./combat.js";
import { clamp } from "./state.js";

export const INK_RULES = Object.freeze({
  budget: 3,
  fourthBudget: 4,
  shieldPerInk: 7,
  maxEndShieldPerUnit: 28,
  springHeal: 3,
  flowMultiplier: 1.5,
  heavyMultiplier: 1.3,
  openingDiscount: 1,
  relicIds: Object.freeze(["flow", "heavy", "reserve", "fourth", "opening"]),
});
export const INK_AI_NOISE = Object.freeze({
  easy: 35,
  normal: 12,
  hard: 0,
  nightmare: 0,
});
export function inkAiOptions(level = "hard") {
  return { noise: INK_AI_NOISE[level] ?? 0 };
}
export function inkCost(skill) {
  return Number.isInteger(skill?.inkCost) &&
    skill.inkCost >= 1 &&
    skill.inkCost <= 3
    ? skill.inkCost
    : Infinity;
}
export function prepareInkUnits(units, relicIds = []) {
  const relics = [...new Set(relicIds)].filter((id) =>
    INK_RULES.relicIds.includes(id),
  );
  for (const unit of units || []) {
    unit.inkMode = true;
    unit.inkRelics = [...relics];
  }
  return units;
}
export function createInkTurn(relicIds = []) {
  const relics = [...new Set(relicIds)].filter((id) =>
    INK_RULES.relicIds.includes(id),
  );
  const total = relics.includes("fourth")
    ? INK_RULES.fourthBudget
    : INK_RULES.budget;
  return {
    total,
    remaining: total,
    acted: [],
    chain: [],
    relics,
    ended: false,
    shieldGranted: 0,
  };
}
export function inkActionCost(turn, unit, skill) {
  const base = inkCost(skill);
  return turn &&
    !turn.ended &&
    turn.chain.length === 0 &&
    turn.relics.includes("opening")
    ? Math.max(1, base - INK_RULES.openingDiscount)
    : base;
}
function outputMultiplier(turn, skill) {
  if (!turn || turn.ended) return 1;
  if (
    turn.chain.length === 0 &&
    inkCost(skill) === 3 &&
    turn.relics.includes("heavy")
  )
    return INK_RULES.heavyMultiplier;
  if (turn.chain.length === 2 && turn.relics.includes("flow"))
    return INK_RULES.flowMultiplier;
  return 1;
}
const OUTPUT_FIELDS = ["power", "healAmt", "dot", "dmgPerStack", "selfHeal"];
const INTEGER_FIELDS = new Set(["healAmt", "dot", "dmgPerStack", "selfHeal"]);
export function previewInkSkill(turn, unit, skill) {
  const out = { ...skill };
  const multiplier = outputMultiplier(turn, skill);
  for (const key of OUTPUT_FIELDS) {
    if (multiplier === 1 || typeof out[key] !== "number") continue;
    const value = out[key] * multiplier;
    out[key] = INTEGER_FIELDS.has(key) ? Math.round(value) : value;
  }
  out.paidInk = inkActionCost(turn, unit, skill);
  out.outputMultiplier = multiplier;
  return out;
}
export function canInkAct(turn, unit, skill) {
  return (
    !!turn &&
    !turn.ended &&
    !!unit?.alive &&
    !!skill &&
    !turn.acted.includes(unit.id) &&
    canUseSkill(unit, skill) &&
    inkActionCost(turn, unit, skill) <= turn.remaining
  );
}
export function availableInkUnits(turn, units) {
  return (units || []).filter(
    (unit) =>
      unit.alive &&
      (unit.skills || []).some((skill) => canInkAct(turn, unit, skill)),
  );
}
export function commitInkAction(turn, unit, skill) {
  if (!canInkAct(turn, unit, skill)) return null;
  const executable = previewInkSkill(turn, unit, skill);
  const before = turn.remaining;
  turn.remaining -= executable.paidInk;
  turn.acted.push(unit.id);
  turn.chain.push({
    actorId: unit.id,
    charId: unit.charId,
    actorName: unit.name,
    skillName: skill.name,
    baseCost: inkCost(skill),
    cost: executable.paidInk,
    remainingBefore: before,
    remainingAfter: turn.remaining,
    multiplier: executable.outputMultiplier,
  });
  return executable;
}
export function finishInkTurn(turn, units) {
  if (!turn) return 0;
  if (turn.ended) return turn.shieldGranted || 0;
  const reserve = turn.relics.includes("reserve") ? 2 : 1;
  const amount = Math.min(
    turn.remaining * INK_RULES.shieldPerInk * reserve,
    INK_RULES.maxEndShieldPerUnit,
  );
  if (amount)
    for (const unit of units || [])
      if (unit.alive) unit.shield = (unit.shield || 0) + amount;
  turn.ended = true;
  turn.shieldGranted = amount;
  return amount;
}
export function startInkSideRound(team, foes, scene, round) {
  const results = [];
  for (const unit of team || []) {
    if (!unit.alive) continue;
    const result = processStartOfTurn(unit, { allies: team, foes, round });
    let springHeal = 0;
    if (unit.alive && scene?.buff === "teamRegen") {
      const before = unit.hp;
      unit.hp = clamp(unit.hp + INK_RULES.springHeal, 0, unit.maxHp);
      springHeal = unit.hp - before;
    }
    results.push({ unit, result: { ...result, springHeal } });
  }
  return results;
}
