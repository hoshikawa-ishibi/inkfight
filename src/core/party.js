import { CHARACTERS } from "../data/data.js";

/**
 * The shared four-person roster used by expedition and classic battle entry.
 * Keep the first three ids stable: old expedition saves refer to them.
 */
export const MAX_SAVED_PARTIES = 8;
export const PARTY_STORAGE_KEY = "inkfight_parties_v1";

export const PARTY_PRESETS = Object.freeze([
  {
    id: "edge",
    name: "锋起于隙",
    tag: "接力收锋",
    tags: ["破防", "连携", "续航"],
    description: "剑士布势，刀娘与墨鸦接力收锋，牧师守住归路。",
    charIds: ["swordsman", "bladedancer", "raven", "priest"],
  },
  {
    id: "sigil",
    name: "万象落纸",
    tag: "群攻铺场",
    tags: ["群攻", "减防", "护阵"],
    description: "法师、阴阳师与机关师编织群攻，医仙让伤势化开。",
    charIds: ["mage", "onmyoji", "artificer", "herbalist"],
  },
  {
    id: "rhythm",
    name: "风过弦响",
    tag: "先手爆发",
    tags: ["护盾", "增益", "收割"],
    description: "守卫架盾，鼓姬起势，弓手与刺客从阵后收锋。",
    charIds: ["archer", "assassin", "guardian", "drummer"],
  },
  {
    id: "ink-wall",
    name: "墨墙回潮",
    tag: "守成反击",
    tags: ["护盾", "反伤", "疗愈"],
    description: "守卫与机关师先铺防线，医仙把全队的伤势慢慢抹平。",
    charIds: ["guardian", "artificer", "herbalist", "priest"],
  },
  {
    id: "broken-seal",
    name: "破印疾书",
    tag: "减防爆发",
    tags: ["减防", "重招", "斩杀"],
    description: "阴阳师先破阵，法师与剑士把三笔墨集中写成一记重锋。",
    charIds: ["onmyoji", "mage", "swordsman", "assassin"],
  },
  {
    id: "red-thread",
    name: "赤线追魂",
    tag: "残血滚雪球",
    tags: ["残血", "吸血", "追击"],
    description: "狂战士与术士越打越凶，刺客沿着血线追到最后一笔。",
    charIds: ["berserker", "warlock", "assassin", "raven"],
  },
  {
    id: "thunder-drum",
    name: "雷鼓连章",
    tag: "群体连携",
    tags: ["群攻", "增益", "连笔"],
    description: "鼓姬起势，弓手铺开群攻，墨鸦寻找收割机会。",
    charIds: ["drummer", "archer", "raven", "monk"],
  },
  {
    id: "silent-garden",
    name: "静园藏锋",
    tag: "铺垫重招",
    tags: ["蓄势", "闪避", "稳进"],
    description: "医仙守住节奏，影武者与刀娘蓄笔，等敌影露出破绽再收锋。",
    charIds: ["herbalist", "shadow", "bladedancer", "monk"],
  },
  {
    id: "night-hunt",
    name: "夜行猎墨",
    tag: "控制集火",
    tags: ["控制", "集火", "灵活"],
    description: "墨鸦牵制，阴阳师锁住关键目标，弓手与刺客快速拆解前排。",
    charIds: ["raven", "onmyoji", "archer", "assassin"],
  },
  {
    id: "four-strokes",
    name: "四笔同鸣",
    tag: "多段连写",
    tags: ["多段", "锋芒", "爆发"],
    description: "刀娘与墨鸦连续落笔，剑士接上破甲，鼓姬让整队保持攻势。",
    charIds: ["bladedancer", "raven", "swordsman", "drummer"],
  },
]);

const knownIds = new Set(CHARACTERS.map((character) => character.id));
const cleanText = (value, fallback = "", max = 140) =>
  String(value ?? fallback)
    .trim()
    .slice(0, max);

function normalizedIds(ids) {
  if (!Array.isArray(ids)) return null;
  const result = ids.map((id) => String(id ?? "").trim()).filter(Boolean);
  if (
    result.length !== 4 ||
    new Set(result).size !== 4 ||
    result.some((id) => !knownIds.has(id))
  )
    return null;
  return result;
}

/** Return a small, serializable validation result for UI and game callers. */
export function validateParty(ids) {
  const charIds = normalizedIds(ids);
  if (!charIds)
    return { ok: false, charIds: null, error: "请选择 4 位不同的同行者。" };
  return { ok: true, charIds, error: "" };
}

function storage() {
  try {
    return typeof globalThis !== "undefined" && globalThis.localStorage
      ? globalThis.localStorage
      : null;
  } catch {
    return null;
  }
}

function safeParty(value, index = 0) {
  if (!value || typeof value !== "object") return null;
  const checked = validateParty(value.charIds);
  if (!checked.ok) return null;
  const id =
    cleanText(value.id, `saved-${index}`, 64).replace(/[^a-zA-Z0-9_-]/g, "-") ||
    `saved-${index}`;
  const name = cleanText(value.name, "无名阵容", 32) || "无名阵容";
  const description =
    cleanText(value.description, "由你亲手写下的四人阵容。", 120) ||
    "由你亲手写下的四人阵容。";
  const tag =
    cleanText(value.tag || value.style, "自定义阵容", 24) || "自定义阵容";
  const tags = Array.isArray(value.tags)
    ? value.tags
        .map((item) => cleanText(item, "", 16))
        .filter(Boolean)
        .slice(0, 4)
    : [tag];
  return { id, name, tag, tags, description, charIds: checked.charIds };
}

export function loadSavedParties() {
  const store = storage();
  if (!store) return [];
  try {
    const parsed = JSON.parse(store.getItem(PARTY_STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    const seen = new Set();
    return parsed
      .map((party, index) => safeParty(party, index))
      .filter((party) => {
        if (!party || seen.has(party.id)) return false;
        seen.add(party.id);
        return true;
      })
      .slice(0, MAX_SAVED_PARTIES);
  } catch {
    return [];
  }
}

function writeSavedParties(parties) {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(
      PARTY_STORAGE_KEY,
      JSON.stringify(parties.slice(0, MAX_SAVED_PARTIES)),
    );
    return true;
  } catch {
    return false;
  }
}

export function saveParty(value, maybeCharIds) {
  const input =
    typeof value === "string"
      ? { name: value, charIds: maybeCharIds }
      : value || {};
  const party = safeParty({
    ...input,
    id:
      input.id ||
      `saved-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
  });
  if (!party)
    return {
      ok: false,
      party: null,
      error: "阵容需要包含 4 位不同的已解锁角色。",
    };
  const current = loadSavedParties().filter((item) => item.id !== party.id);
  const saved = [party, ...current].slice(0, MAX_SAVED_PARTIES);
  if (!writeSavedParties(saved))
    return { ok: false, party: null, error: "当前浏览器无法保存阵容。" };
  return { ok: true, party, parties: saved };
}

export function removeSavedParty(id) {
  const current = loadSavedParties();
  const next = current.filter((party) => party.id !== String(id));
  if (next.length === current.length) return false;
  return writeSavedParties(next);
}

export const SAVED_PARTY_LIMIT = MAX_SAVED_PARTIES;
