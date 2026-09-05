import {
  CRIT_METER_FULL,
  CRIT_MULTIPLIER,
  critRateOf,
  willCrit,
} from "../core/combat.js";

const finiteNonNegative = (value) =>
  Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;

/** Keep over-cap charge visible while capping only the drawn progress bar. */
export function critMeterPresentation(actor) {
  const meter = finiteNonNegative(actor?.critMeter);
  const ready = meter >= CRIT_METER_FULL;
  return {
    meter,
    full: CRIT_METER_FULL,
    label: `${meter}/${CRIT_METER_FULL}`,
    fillPercent: Math.min(100, (meter / CRIT_METER_FULL) * 100),
    overflow: Math.max(0, meter - CRIT_METER_FULL),
    remaining: ready ? 0 : CRIT_METER_FULL - meter,
    ready,
  };
}

/** One skill card's next-hit state, using the combat engine's predicate. */
export function critSkillPresentation(actor, skill, attackCount) {
  const damaging = finiteNonNegative(skill?.power) > 0;
  const gain = damaging
    ? finiteNonNegative(critRateOf(actor || {}, skill || {}))
    : 0;
  const meter = critMeterPresentation(actor);
  const hits = damaging
    ? Math.max(1, Math.floor(finiteNonNegative(attackCount ?? skill?.hits) || 1))
    : 0;
  let projected = meter.meter;
  let firstCritHit = 0;
  for (let hit = 1; hit <= hits; hit++) {
    const thisHitCrit =
      hit === 1
        ? willCrit(actor || {}, skill || {})
        : projected + gain >= CRIT_METER_FULL;
    projected += gain;
    if (thisHitCrit) {
      if (!firstCritHit) firstCritHit = hit;
      projected -= CRIT_METER_FULL;
    }
  }
  const triggersCrit = firstCritHit > 0;
  return {
    damaging,
    gain,
    hits,
    firstCritHit,
    triggersCrit,
    multiplier: CRIT_MULTIPLIER,
    label: triggersCrit
      ? firstCritHit === 1
        ? `首段必定重击 ×${CRIT_MULTIPLIER}`
        : `第${firstCritHit}段触发重击 ×${CRIT_MULTIPLIER}`
      : damaging
        ? `本段锋芒 +${gain}`
        : "",
    projected,
  };
}

/** Compact rule and state copy shown beside the selected character's skills. */
export function critGuidePresentation(actor, attackCountForSkill) {
  const meter = critMeterPresentation(actor);
  const baseGain = finiteNonNegative(critRateOf(actor || {}, {}));
  const readySkills = (actor?.skills || [])
    .filter(
      (skill) =>
        critSkillPresentation(
          actor,
          skill,
          attackCountForSkill?.(skill),
        ).triggersCrit,
    )
    .map((skill) => skill.name);
  return {
    ...meter,
    baseGain,
    multiplier: CRIT_MULTIPLIER,
    readySkills,
    rule: `每段攻击 +${baseGain} 锋芒（技能加成另计） → ${CRIT_METER_FULL} 必定重击 ×${CRIT_MULTIPLIER}`,
    state: readySkills.length
      ? `${readySkills.join("、")}：可触发重击 ×${CRIT_MULTIPLIER}`
      : `再积累 ${meter.remaining} 触发重击`,
  };
}
