// 战绩记录：数据模型 + MVP + 生涯统计 + 自洽审计。
//
// 纯函数，Node 里跑得动，所以 `npm test` 能覆盖到它。存取在 game/save.js，
// 呈现在 view/records.js，这里只负责「一条战绩是什么、合不合理」。
//
// **审计（auditRecord）是防伪的第二层。** 第一层的 HMAC 签名（share-code.js）
// 挡的是「拿记事本改数字」；密钥就在玩家自己的浏览器里，读过源码的人可以重新签名。
// 这一层挡的是那种人：一局战斗的数字之间存在真实约束，要伪造得整套编圆。
// 两层都不是绝对的，界面上必须如实说明边界——写一个假的「已认证」比不校验更糟。

import { CHARACTERS, SCENES } from "../data/data.js";

export const RECORD_VERSION = 1;
export const RULESETS = Object.freeze({ legacy: "legacy", ink: "ink-v1" });

export const MODE_LABEL = {
  ai: "人机",
  pvp: "双人",
  spectate: "观战",
  campaign: "战役",
};

const CHAR_IDS = new Set(CHARACTERS.map((c) => c.id));
const SCENE_IDS = new Set(SCENES.map((s) => s.id));
const SCENE_NAME = Object.fromEntries(SCENES.map((s) => [s.id, s.name]));
const CHAR_NAME = Object.fromEntries(CHARACTERS.map((c) => [c.id, c.name]));

export const sceneName = (id) => SCENE_NAME[id] || id;
export const charName = (id) => CHAR_NAME[id] || id;

// ── MVP ───────────────────────────────────────────────────
// 综合评分 = 伤害 + 治疗×1.5 + 击杀×80。结算面板和战绩室共用这一份。
// **MVP 不进分享码**，永远由这个函数从各单位数据现算——
// 于是「MVP 是谁」这一项伪造不了，只能靠把伤害数据整体编圆来间接影响。
export const MVP_HEAL_WEIGHT = 1.5;
export const MVP_KILL_WEIGHT = 80;

export function mvpScore(u) {
  return u.dmg + u.heal * MVP_HEAL_WEIGHT + u.kills * MVP_KILL_WEIGHT;
}

export function mvpOf(units) {
  if (!units || !units.length) return null;
  // 全员 0 分时也要给出一个人。以前这里从 {score:0} 起 reduce，
  // 那种局面会返回一个没有 name 的空壳，面板上显示成 "undefined ⭐"。
  return units.reduce(
    (best, u) => (mvpScore(u) > mvpScore(best) ? u : best),
    units[0],
  );
}

// ── 构造一条记录 ───────────────────────────────────────────
// 入参就是 battle.js 结算时手上有的东西，不做额外查询。
export function makeRecord({
  mode,
  difficulty,
  scene,
  rounds,
  winner,
  side,
  stats,
  units,
  at,
  id,
  backfilled,
  stage,
  ruleset = RULESETS.legacy,
}) {
  const rows = units.map((u) => ({
    name: u.name,
    charId: u.charId,
    player: u.player,
    dmg: stats.units[u.id] ? stats.units[u.id].dmg : 0,
    heal: stats.units[u.id] ? stats.units[u.id].heal : 0,
    kills: stats.units[u.id] ? stats.units[u.id].kills : 0,
  }));
  return normalizeRecord({
    v: RECORD_VERSION,
    id: id || newRecordId(at),
    at: at || Date.now(),
    mode,
    diff: difficulty || null,
    scene: scene && scene.id ? scene.id : scene,
    rounds,
    winner,
    side: side == null ? null : side,
    stage: stage || null,
    p1: { dmg: stats.p1.dmg, heal: stats.p1.heal, kills: stats.p1.kills },
    p2: { dmg: stats.p2.dmg, heal: stats.p2.heal, kills: stats.p2.kills },
    units: rows,
    maxHit: { dmg: stats.maxHit.dmg, name: stats.maxHit.name },
    ruleset,
    ...(backfilled ? { backfilled: true } : {}),
  });
}

export function newRecordId(at) {
  const t = (at || Date.now()).toString(36);
  const r = Math.floor(Math.random() * 0x10000)
    .toString(36)
    .padStart(4, "0");
  return `r${t}${r}`;
}

const int = (v) => (Number.isFinite(+v) ? Math.round(+v) : 0);

// 把任何来源（本机存档、分享码、补录）的记录整成同一个形状。
// 缺字段补默认值，多字段丢掉——存档格式改动时不会让整个战绩室崩掉。
export function normalizeRecord(r) {
  if (!r || typeof r !== "object") return null;
  return {
    v: int(r.v) || RECORD_VERSION,
    id: String(r.id || newRecordId(r.at)),
    at: int(r.at),
    mode: String(r.mode || "ai"),
    diff: r.diff == null ? null : String(r.diff),
    scene: String(r.scene || "void"),
    rounds: int(r.rounds),
    winner: int(r.winner),
    side: r.side == null ? null : int(r.side),
    stage: r.stage == null ? null : int(r.stage),
    p1: sideTotals(r.p1),
    p2: sideTotals(r.p2),
    units: (Array.isArray(r.units) ? r.units : []).map((u) => ({
      name: String(u.name || ""),
      charId: String(u.charId || ""),
      player: int(u.player),
      dmg: int(u.dmg),
      heal: int(u.heal),
      kills: int(u.kills),
    })),
    maxHit: {
      dmg: int(r.maxHit && r.maxHit.dmg),
      name: String((r.maxHit && r.maxHit.name) || ""),
    },
    ruleset: r.ruleset == null ? RULESETS.legacy : String(r.ruleset),
    ...(r.backfilled ? { backfilled: true } : {}),
  };
}

function sideTotals(t) {
  return {
    dmg: int(t && t.dmg),
    heal: int(t && t.heal),
    kills: int(t && t.kills),
  };
}

// ── 这一局对「我」是赢是输 ─────────────────────────────────
// 观战两边都是 AI，没有「我」，返回 null。
export function outcomeOf(r) {
  if (r.side == null) return null;
  return r.winner === r.side ? "win" : "loss";
}

// ── 自洽审计 ──────────────────────────────────────────────
// 每条规则只写「一定成立」的约束。**宁可漏判，不可误判**——
// 一条会对真实对局报警的规则，会让整套校验失去意义。
//
// 反例留在这：曾想加「击杀数之和 = 阵亡单位数」，但腐化爆发、瘟疫、
// 狂暴自伤、墨蚀造成的死亡都不记击杀，用户 2026-09-02 那局就是
// 4 人全灭却只有 2 次记名击杀。这条规则会把真实战绩判成伪造。
const MAX_ROUNDS = 500;
const MAX_TEAM = 6;
const MAX_SINGLE_HIT = 3000;
const EARLIEST = Date.UTC(2024, 0, 1);
const FUTURE_SLACK = 7 * 24 * 3600 * 1000; // 朋友的电脑时钟可能快几天

export function auditRecord(rec, now = Date.now()) {
  const problems = [];
  const bad = (msg) => problems.push(msg);
  const r = normalizeRecord(rec);
  if (!r) return { ok: false, problems: ["记录是空的"] };

  if (r.v > RECORD_VERSION) bad(`记录版本 ${r.v} 比本作新，装个新版再看`);
  if (r.ruleset !== RULESETS.legacy && r.ruleset !== RULESETS.ink)
    bad(`未知规则集：${r.ruleset}`);
  if (!MODE_LABEL[r.mode]) bad(`未知的对战模式：${r.mode}`);
  if (!SCENE_IDS.has(r.scene)) bad(`未知的场景：${r.scene}`);
  if (r.winner !== 1 && r.winner !== 2) bad("胜方不是 1 或 2");
  if (r.side !== null && r.side !== 1 && r.side !== 2)
    bad("玩家所在方不是 1 / 2 / 无");
  // 「我」坐在哪一边，是由模式决定的，不是自由填的：
  //   人机 / 战役 —— 玩家永远是 1 方
  //   观战 —— 两边都是 AI，没有「我」
  //   双人 —— 同一台电脑上的两个人，说不清哪边算「我」，所以也不认领
  // 这条约束让「把一局输掉的人机改成自己在 2 方赢了」这种伪造走不通。
  if ((r.mode === "ai" || r.mode === "campaign") && r.side !== 1)
    bad(`${MODE_LABEL[r.mode]}模式里玩家只可能在 1 方`);
  if ((r.mode === "spectate" || r.mode === "pvp") && r.side !== null)
    bad(`${MODE_LABEL[r.mode]}模式不该有「玩家所在方」`);
  if (!(r.rounds >= 1 && r.rounds <= MAX_ROUNDS))
    bad(`回合数 ${r.rounds} 不合理`);
  if (r.at < EARLIEST || r.at > now + FUTURE_SLACK) bad("对局时间不合理");

  // 编制：人数在合理范围内，角色必须在花名册里。
  // **这里刻意不写死「每方 4 人」**——战役是 2v2，而最终关是墨皇 1 人对玩家 2 人，
  // 写死编制会把真实战绩判成伪造；何况编制以后还可能再改一次（见 state.js）。
  const sides = [1, 2].map((p) => r.units.filter((u) => u.player === p));
  sides.forEach((side, i) => {
    if (side.length < 1 || side.length > MAX_TEAM)
      bad(`${i + 1} 方有 ${side.length} 人，不在 1~${MAX_TEAM} 的范围内`);
    side.forEach((u) => {
      if (!CHAR_IDS.has(u.charId)) bad(`花名册里没有「${u.charId}」这个角色`);
      if (!u.name) bad("有单位没有名字");
      if (u.dmg < 0 || u.heal < 0 || u.kills < 0) bad(`${u.name} 有负数统计`);
    });
  });
  // 只有战役会出现两边人数不等（墨皇独战）。
  if (r.mode !== "campaign" && sides[0].length !== sides[1].length)
    bad(`两边人数不等（${sides[0].length} vs ${sides[1].length}）`);
  if (r.units.some((u) => u.player !== 1 && u.player !== 2))
    bad("有单位不属于任何一方");

  // 分项之和 = 方级总计。伪造时改了任何一个人的数，就得把总计一起改圆。
  [1, 2].forEach((p) => {
    const side = r.units.filter((u) => u.player === p);
    const tot = r["p" + p];
    ["dmg", "heal", "kills"].forEach((k) => {
      const sum = side.reduce((a, u) => a + u[k], 0);
      if (sum !== tot[k])
        bad(
          `${p} 方的${{ dmg: "伤害", heal: "治疗", kills: "击杀" }[k]}分项之和 ${sum} 对不上总计 ${tot[k]}`,
        );
    });
  });

  // 最高单次伤害：打出它的人必须真实存在，且这一击不可能超过他一整局的总伤害。
  if (r.maxHit.dmg < 0 || r.maxHit.dmg > MAX_SINGLE_HIT)
    bad(`最高单次伤害 ${r.maxHit.dmg} 不合理`);
  if (r.maxHit.dmg > 0) {
    // 两边可能选到同一个角色（重名），所以取同名单位里总伤害最高的那个。
    const same = r.units.filter((u) => u.name === r.maxHit.name);
    if (!same.length)
      bad(`最高单次伤害记在「${r.maxHit.name}」名下，但场上没有这个单位`);
    else if (r.maxHit.dmg > Math.max(...same.map((u) => u.dmg)))
      bad(
        `「${r.maxHit.name}」的最高单次伤害 ${r.maxHit.dmg} 超过了他一整局的总伤害`,
      );
  } else if (r.maxHit.name) {
    bad("最高单次伤害是 0，却记了名字");
  }

  return { ok: problems.length === 0, problems };
}

// ── 生涯统计 ──────────────────────────────────────────────
// 只统计**有「我」参与**的对局（观战没有「我」，算局数不算胜负）。
export function summarize(records, ruleset = "all") {
  const list = (records || [])
    .map(normalizeRecord)
    .filter(Boolean)
    .filter((r) => ruleset === "all" || r.ruleset === ruleset)
    .sort((a, b) => a.at - b.at);
  const rated = list.filter((r) => outcomeOf(r) !== null);
  const wins = rated.filter((r) => outcomeOf(r) === "win").length;

  const byDiff = {};
  rated.forEach((r) => {
    const k = r.diff || "—";
    byDiff[k] = byDiff[k] || { n: 0, w: 0 };
    byDiff[k].n++;
    if (outcomeOf(r) === "win") byDiff[k].w++;
  });

  // 角色统计只看「我」带上场的那一边；观战两边都不算。
  const byChar = {};
  list.forEach((r) => {
    if (r.side == null) return;
    const mine = r.units.filter((u) => u.player === r.side);
    const won = outcomeOf(r) === "win";
    // 同一局里两个位置选到同一个角色只记一次出场，但伤害要全算上。
    const seen = new Set();
    mine.forEach((u) => {
      const c = (byChar[u.charId] = byChar[u.charId] || {
        id: u.charId,
        n: 0,
        w: 0,
        dmg: 0,
        heal: 0,
        kills: 0,
      });
      if (!seen.has(u.charId)) {
        seen.add(u.charId);
        c.n++;
        if (won) c.w++;
      }
      c.dmg += u.dmg;
      c.heal += u.heal;
      c.kills += u.kills;
    });
  });

  // 最长连胜：按时间顺序，只看有胜负的局。
  let streak = 0,
    bestStreak = 0,
    current = 0;
  rated.forEach((r) => {
    if (outcomeOf(r) === "win") {
      streak++;
      bestStreak = Math.max(bestStreak, streak);
    } else streak = 0;
  });
  current = streak;

  // 单场个人最佳（伤害）。**只看我方的单位**——观战局里的 AI 和对面的敌人
  // 都不是「我打出来的」，混进来会让这一行说谎。
  let bestGame = null;
  list.forEach((r) => {
    if (r.side == null) return;
    r.units
      .filter((u) => u.player === r.side)
      .forEach((u) => {
        if (!bestGame || u.dmg > bestGame.dmg)
          bestGame = {
            dmg: u.dmg,
            name: u.name,
            charId: u.charId,
            at: r.at,
            id: r.id,
          };
      });
  });

  return {
    total: list.length,
    rated: rated.length,
    wins,
    losses: rated.length - wins,
    winRate: rated.length ? (wins / rated.length) * 100 : 0,
    byDiff,
    chars: Object.values(byChar).sort((a, b) => b.n - a.n || b.dmg - a.dmg),
    bestStreak,
    currentStreak: current,
    bestGame,
    avgRounds: list.length
      ? list.reduce((a, r) => a + r.rounds, 0) / list.length
      : 0,
    firstAt: list.length ? list[0].at : null,
    lastAt: list.length ? list[list.length - 1].at : null,
  };
}
