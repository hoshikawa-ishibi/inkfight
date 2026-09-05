import { CHARACTERS, SCENES } from "../data/data.js";
import { prepareInkUnits, INK_RULES } from "./ink-turn.js";
import { PARTY_PRESETS, validateParty } from "./party.js";

export const EXPEDITION_VERSION = 1;
export const JOURNEY_RULES = Object.freeze({
  battles: 3,
  fallenRecovery: 0.25,
  rest: 0.35,
  forge: 0.08,
});
// Compatibility alias for callers that still import the old expedition name.
export const PARTIES = PARTY_PRESETS;
export const RELICS = [
  {
    id: "flow",
    name: "三叠浪",
    tag: "连携流",
    glyph: "叁",
    color: "#66c8ac",
    description: `同一轮第三位角色的伤害与治疗提高 ${Math.round((INK_RULES.flowMultiplier - 1) * 100)}%。三笔轻墨，叠成一道浪。`,
  },
  {
    id: "heavy",
    name: "一字千钧",
    tag: "重笔流",
    glyph: "钧",
    color: "#e5af6f",
    description: `每轮第一笔若原价为 3 墨，伤害与治疗提高 ${Math.round((INK_RULES.heavyMultiplier - 1) * 100)}%。把一整轮押在一招上。`,
  },
  {
    id: "reserve",
    name: "留白成壁",
    tag: "留白流",
    glyph: "白",
    color: "#a2bce4",
    description: `每点余墨转化 ${INK_RULES.shieldPerInk * 2} 点全队护盾，每人单次最多 ${INK_RULES.maxEndShieldPerUnit} 点。提前收笔，也是一种准备。`,
  },
  {
    id: "fourth",
    name: "第四笔",
    tag: "改写规则",
    glyph: "肆",
    color: "#b49be3",
    description:
      "每轮共有 4 墨，但全队最大生命降低 15%。多写一笔，也更接近破碎。",
  },
  {
    id: "opening",
    name: "起笔无痕",
    tag: "改写规则",
    glyph: "起",
    color: "#75c6c7",
    description: "每轮第一招少花 1 墨，最低 1 墨。为后续角色留出连携空间。",
  },
  {
    id: "echo",
    name: "双锋",
    tag: "普攻改写",
    glyph: "双",
    color: "#d18b90",
    description: "普通攻击改成两次 65% 威力的斩击，每次独立积累锋芒。",
  },
  {
    id: "keen",
    name: "磨墨石",
    tag: "锋芒构筑",
    glyph: "砺",
    color: "#d9c474",
    description: "每次命中额外积累 10 点锋芒。与多段攻击相互配合。",
  },
  {
    id: "shelter",
    name: "旧伞",
    tag: "守成",
    glyph: "伞",
    color: "#88aecc",
    description: "每战开局全队获得 22 点护盾。护住带伤上路的人。",
  },
  {
    id: "mercy",
    name: "回春帖",
    tag: "疗愈构筑",
    glyph: "春",
    color: "#9fca8b",
    description: "所有主动治疗效果提高 30%。最大生命不会因此增长。",
  },
  {
    id: "fury",
    name: "残卷",
    tag: "险中求胜",
    glyph: "裂",
    color: "#da8c72",
    description: "全队攻击提高 18%，最大生命降低 10%。伤势比例保持不变。",
  },
];
const relicById = (id) => RELICS.find((r) => r.id === id);
const character = (id) => CHARACTERS.find((c) => c.id === id);
const PHASES = [
  "blessing",
  "route",
  "briefing",
  "battle",
  "reward",
  "camp",
  "complete",
  "failed",
];

// Every draw is derived from its decision address; reloading cannot reroll a node.
export function seededRandom(seed) {
  let h = 2166136261;
  for (const c of String(seed)) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function draw(items, seed, count) {
  const a = [...items],
    rng = seededRandom(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, count);
}
export function newExpedition(options, legacySeed) {
  const spec =
    options && typeof options === "object" && !Array.isArray(options)
      ? options
      : { partyId: options, seed: legacySeed };
  const preset = PARTIES.find((p) => p.id === spec.partyId) || null;
  const checked = validateParty(spec.charIds);
  const charIds = checked.ok
    ? checked.charIds
    : preset?.charIds || PARTIES[0].charIds;
  const partyId = checked.ok
    ? preset?.charIds?.join(",") === charIds.join(",")
      ? preset.id
      : spec.partyId || "custom"
    : preset?.id || PARTIES[0].id;
  const cleanSeed =
    String(spec.seed ?? legacySeed ?? "墨路")
      .trim()
      .slice(0, 40) || "墨路";
  return {
    v: EXPEDITION_VERSION,
    seed: cleanSeed,
    phase: "blessing",
    battleIndex: 0,
    wins: 0,
    partyId,
    team: charIds.map((charId) => ({ charId, hpRatio: 1 })),
    relics: [],
    history: [],
    activeRoute: null,
    lastResult: null,
    forge: 0,
    rewardsRemaining: 0,
  };
}
export function relicOffers(run) {
  if (run.phase === "blessing") return RELICS.slice(0, 3);
  return draw(
    RELICS.filter((r) => !run.relics.includes(r.id)),
    `${run.seed}/relic/${run.battleIndex}/${run.relics.length}`,
    3,
  );
}
const ENCOUNTERS = [
  {
    name: "竹影试锋",
    sceneId: "spring",
    enemies: ["swordsman", "archer", "monk", "priest"],
    description: "竹林拦路人以单点攻击为主。留意对方第一笔，决定护住谁。",
  },
  {
    name: "纸灯夜渡",
    sceneId: "void",
    enemies: ["assassin", "raven", "guardian", "herbalist"],
    description: "灯影里藏着收割者。削弱预告中的杀招，再安排接力。",
  },
  {
    name: "风雪封山",
    sceneId: "void",
    enemies: ["mage", "onmyoji", "drummer", "monk"],
    description: "符阵与鼓点互相呼应。让敌方的铺垫来不及写完。",
  },
  {
    name: "落日问剑",
    sceneId: "lava",
    enemies: ["bladedancer", "berserker", "archer", "priest"],
    description: "斩击逼近血线。提前收笔留下护盾，或先拿下一人。",
  },
  {
    name: "破阵归墟",
    sceneId: "void",
    enemies: ["warlock", "artificer", "guardian", "herbalist"],
    description: "护阵之下腐化蔓延。集中突破比平均分摊更有价值。",
  },
];
export function routeOffers(run) {
  return draw(ENCOUNTERS, `${run.seed}/route/${run.battleIndex}`, 2).map(
    (e, i) => {
      const elite = i === 1;
      const final = run.battleIndex === JOURNEY_RULES.battles - 1;
      const scene =
        SCENES.find((s) => s.id === e.sceneId) ||
        SCENES[(run.battleIndex + i) % SCENES.length];
      return {
        id: `${run.battleIndex}-${i}`,
        name: e.name,
        sceneId: scene.id,
        sceneName: scene.name,
        kind: elite ? "elite" : "normal",
        description: e.description,
        rewardCount: final ? 0 : elite ? 2 : 1,
        rewardText: final
          ? elite
            ? "称号 · 破阵归人"
            : "完成远征"
          : `${elite ? 2 : 1} 件墨契`,
        enemyIds: [...e.enemies],
        modText: final
          ? elite
            ? "终局险路 · 强敌守关，胜后获得「破阵归人」称号"
            : "终局稳路 · 战胜守关队，完成这条墨路"
          : elite
            ? "险路 · 敌方更强，胜后可选两件墨契"
            : "稳路 · 胜后可选一件墨契",
      };
    },
  );
}
export function takeRelic(run, id) {
  if (
    !["blessing", "reward"].includes(run.phase) ||
    !relicOffers(run).some((r) => r.id === id)
  )
    return false;
  run.relics.push(id);
  if (run.phase === "blessing") run.phase = "route";
  else {
    run.rewardsRemaining--;
    if (run.rewardsRemaining <= 0 || !relicOffers(run).length)
      run.phase = "camp";
  }
  return true;
}
export function chooseRoute(run, id) {
  if (run.phase !== "route") return false;
  const route = routeOffers(run).find((r) => r.id === id);
  if (!route) return false;
  run.activeRoute = route;
  run.phase = "briefing";
  return true;
}
export function launchEncounter(run) {
  if (!["briefing", "battle"].includes(run.phase) || !run.activeRoute)
    return false;
  run.phase = "battle";
  return true;
}
export function resolveEncounter(run, { winner, rounds, finalUnits }) {
  if (run.phase !== "battle") return false;
  if (![1, 2].includes(winner) || !Array.isArray(finalUnits)) return false;
  const units = finalUnits.filter((u) => u.player === 1);
  if (
    units.length !== run.team.length ||
    !Number.isInteger(rounds) ||
    rounds < 1 ||
    rounds > 500
  )
    return false;
  if (
    new Set(units.map((u) => u.charId)).size !== 4 ||
    units.some(
      (u) =>
        !run.team.some((t) => t.charId === u.charId) ||
        !Number.isFinite(u.maxHp) ||
        u.maxHp <= 0 ||
        !Number.isFinite(u.hp) ||
        u.hp < 0 ||
        u.hp > u.maxHp,
    )
  )
    return false;
  run.team.forEach((t) => {
    const u = units.find((x) => x.charId === t.charId);
    t.hpRatio = u.alive
      ? Math.max(0.01, Math.min(1, u.hp / u.maxHp))
      : JOURNEY_RULES.fallenRecovery;
  });
  const won = winner === 1;
  run.lastResult = { won, rounds };
  run.history.push({ name: run.activeRoute.name, won, rounds });
  if (!won) {
    run.phase = "failed";
    return true;
  }
  run.wins++;
  if (run.wins >= JOURNEY_RULES.battles) {
    run.phase = "complete";
    return true;
  }
  run.rewardsRemaining = run.activeRoute.rewardCount;
  run.phase = "reward";
  return true;
}
export function chooseCamp(run, id) {
  if (run.phase !== "camp" || !["rest", "forge"].includes(id)) return false;
  if (id === "rest")
    run.team.forEach(
      (t) => (t.hpRatio = Math.min(1, t.hpRatio + JOURNEY_RULES.rest)),
    );
  else run.forge++;
  run.battleIndex++;
  run.activeRoute = null;
  run.phase = "route";
  return true;
}
export function applyExpeditionBattle(run, p1, p2) {
  prepareInkUnits(p1, run.relics);
  prepareInkUnits(p2);
  const hpMult =
    (run.relics.includes("fourth") ? 0.85 : 1) *
    (run.relics.includes("fury") ? 0.9 : 1);
  p1.forEach((u, i) => {
    u.maxHp = Math.round(u.maxHp * hpMult);
    u.hp = Math.max(1, Math.round(u.maxHp * run.team[i].hpRatio));
    u.atk *=
      1 +
      run.forge * JOURNEY_RULES.forge +
      (run.relics.includes("fury") ? 0.18 : 0);
    if (run.relics.includes("shelter")) u.shield += 22;
    if (run.relics.includes("keen")) u.crit += 10;
    if (run.relics.includes("echo")) {
      const s = u.skills[0];
      s.hits = 2;
      s.power = (s.power || 1) * 0.65;
      s.desc = "两次斩击，每段独立积累锋芒。";
    }
    if (run.relics.includes("mercy"))
      u.skills.forEach((s) => {
        if (s.healAmt) {
          s.healAmt = Math.round(s.healAmt * 1.3);
          s.desc = s.desc.replace(/\d+(?:\.\d+)?\s*HP/g, `${s.healAmt}HP`);
        }
      });
  });
  const elite = run.activeRoute?.kind === "elite";
  const strength = [0.72, 0.84, 0.98][run.battleIndex] + (elite ? 0.12 : 0);
  p2.forEach((u) => {
    u.atk *= strength;
    u.maxHp = Math.round(u.maxHp * strength);
    u.hp = u.maxHp;
  });
}
export function expeditionView(
  run,
  {
    landing = false,
    best = { completed: 0, attempts: 0 },
    hasSavedRun = false,
    parties = PARTIES,
    seedDraft = "",
  } = {},
) {
  const v = run || newExpedition("edge", "");
  return {
    ...v,
    phase: landing ? "landing" : v.phase,
    hasSavedRun,
    best,
    parties,
    seedDraft,
    team: v.team.map((t) => ({
      ...t,
      name: character(t.charId).name,
      color: character(t.charId).color,
    })),
    relics: v.relics.map(relicById),
    offers: relicOffers(v),
    routes: routeOffers(v),
    campOptions: [
      {
        id: "rest",
        name: "临溪歇脚",
        description: `全队回复 ${Math.round(JOURNEY_RULES.rest * 100)}% 最大生命。伤势已经随上一战保存。`,
      },
      {
        id: "forge",
        name: "以伤磨锋",
        description: `保持当前伤势，后续战斗全队攻击提高 ${Math.round(JOURNEY_RULES.forge * 100)}%。`,
      },
    ],
    rulesText: `全队每轮共用 ${!landing && v.relics.includes("fourth") ? INK_RULES.fourthBudget : INK_RULES.budget} 墨，每人至多出手一次。余墨收笔化为全队护盾；伤势带入下一战，倒下的队友以 ${Math.round(JOURNEY_RULES.fallenRecovery * 100)}% 生命归队。`,
  };
}

// Treat browser storage as untrusted: validate identities, counters and decision state.
export function restoreExpedition(value) {
  try {
    const v =
      typeof value === "string"
        ? JSON.parse(value)
        : JSON.parse(JSON.stringify(value));
    if (
      !v ||
      v.v !== EXPEDITION_VERSION ||
      !PHASES.includes(v.phase) ||
      typeof v.seed !== "string" ||
      v.seed.length > 40
    )
      return null;
    if (
      !Number.isInteger(v.battleIndex) ||
      v.battleIndex < 0 ||
      v.battleIndex > 2 ||
      !Number.isInteger(v.wins) ||
      v.wins < 0 ||
      v.wins > 3
    )
      return null;
    if (
      !Array.isArray(v.team) ||
      v.team.length !== 4 ||
      v.team.some(
        (t) =>
          !character(t.charId) ||
          !Number.isFinite(t.hpRatio) ||
          t.hpRatio <= 0 ||
          t.hpRatio > 1,
      )
    )
      return null;
    if (new Set(v.team.map((t) => t.charId)).size !== 4) return null;
    if (
      !Array.isArray(v.relics) ||
      new Set(v.relics).size !== v.relics.length ||
      v.relics.some((id) => !relicById(id))
    )
      return null;
    if (
      !Number.isInteger(v.forge) ||
      v.forge < 0 ||
      v.forge > 2 ||
      !Number.isInteger(v.rewardsRemaining) ||
      v.rewardsRemaining < 0 ||
      v.rewardsRemaining > 2
    )
      return null;
    if (
      !Array.isArray(v.history) ||
      v.history.length > 3 ||
      v.history.some(
        (h) =>
          typeof h.name !== "string" ||
          typeof h.won !== "boolean" ||
          !Number.isInteger(h.rounds) ||
          h.rounds < 1 ||
          h.rounds > 500,
      )
    )
      return null;
    if (v.activeRoute) {
      const route = routeOffers(v).find((r) => r.id === v.activeRoute.id);
      if (!route) return null;
      v.activeRoute = route;
    }
    if (
      ["briefing", "battle", "reward", "camp", "complete", "failed"].includes(
        v.phase,
      ) &&
      !v.activeRoute
    )
      return null;
    if (
      v.history.filter((h) => h.won).length !== v.wins ||
      v.history.some((h, i) => !h.won && i !== v.history.length - 1)
    )
      return null;
    if (
      v.phase === "blessing" &&
      (v.battleIndex !== 0 ||
        v.wins !== 0 ||
        v.history.length !== 0 ||
        v.relics.length !== 0)
    )
      return null;
    if (
      ["route", "briefing", "battle"].includes(v.phase) &&
      (v.wins !== v.battleIndex ||
        v.history.length !== v.wins ||
        v.rewardsRemaining !== 0)
    )
      return null;
    if (
      ["reward", "camp"].includes(v.phase) &&
      (v.battleIndex >= 2 ||
        v.wins !== v.battleIndex + 1 ||
        v.history.length !== v.wins)
    )
      return null;
    if (
      v.phase === "reward" &&
      (v.rewardsRemaining < 1 || v.rewardsRemaining > v.activeRoute.rewardCount)
    )
      return null;
    if (v.phase === "camp" && v.rewardsRemaining !== 0) return null;
    if (
      v.phase === "complete" &&
      (v.wins !== 3 || v.battleIndex !== 2 || v.history.length !== 3)
    )
      return null;
    if (
      v.phase === "failed" &&
      (v.wins !== v.battleIndex ||
        v.history.length !== v.wins + 1 ||
        v.history.at(-1)?.won !== false)
    )
      return null;
    if (v.phase !== "blessing" && !v.relics.length) return null;
    return v;
  } catch {
    return null;
  }
}
