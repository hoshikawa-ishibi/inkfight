// Local presentation preferences and historical/new battle records. Storage errors never block play.
import { BACKFILLED_RECORDS } from "../data/backfill-records.js";
import { normalizeRecord, summarize } from "../core/record.js";

export function getPresentationMode() {
  try {
    return localStorage.getItem("inkfight_presentation") || "3d";
  } catch {
    return "3d";
  }
}
export function setPresentationMode(mode) {
  try {
    localStorage.setItem("inkfight_presentation", mode);
  } catch {
    /* 模式在本次会话仍可切换。 */
  }
}

// ── 战绩 ──────────────────────────────────────────────────
// 三份互相推不出来的知识，各占一个 key：
//   inkfight_profile_v1   本机玩家的昵称 + 安装 id（分享码里带这两样）
//   inkfight_records_v1   本机打过的每一局
//   inkfight_friends_v1   导入进来的好友战绩，按安装 id 归档
//
// 战绩不做「上限之外还压缩」这类事：一条约 700 字节，封顶 200 条也才 140KB，
// localStorage 的额度是 5MB。真到了要压缩的那天，说明该做的是导出到文件。

const PROFILE_KEY = "inkfight_profile_v1";
const RECORDS_KEY = "inkfight_records_v1";
const FRIENDS_KEY = "inkfight_friends_v1";
const BACKFILL_KEY = "inkfight_backfilled_v1";

export const RECORD_LIMIT = 200;

// localStorage 可能整个不可用（隐私模式、被策略禁掉、某些 file:// 环境），
// 也可能写满。战绩不是核心玩法，**任何一步失败都只是没记上**，
// 不能让它把结算流程或战绩室带崩。
function readRaw(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeRaw(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
function removeRaw(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* 读不到就当已经没了 */
  }
}

function readJson(key, fallback) {
  try {
    const v = JSON.parse(readRaw(key));
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    return writeRaw(key, JSON.stringify(value));
  } catch {
    return false;
  }
}

function readArray(key) {
  const value = readJson(key, []);
  return Array.isArray(value) ? value : [];
}

function readObject(key) {
  const value = readJson(key, {});
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

// ── 本机档案 ──────────────────────────────────────────────
// pid 是这台设备的安装 id，只用来在好友榜上区分同名玩家，不含任何身份信息。
export function getProfile() {
  const p = readJson(PROFILE_KEY, null);
  if (p && p.pid) return p;
  const fresh = { name: "", pid: newPid() };
  writeJson(PROFILE_KEY, fresh);
  return fresh;
}

export function setProfileName(name) {
  const p = getProfile();
  p.name = String(name || "").slice(0, 12);
  writeJson(PROFILE_KEY, p);
  return p;
}

// 昵称没填时对外用的名字。**别在界面里各写一份默认值**。
export function displayName(profile) {
  return (profile && profile.name) || "无名墨客";
}

function newPid() {
  const rnd = () =>
    Math.floor(Math.random() * 0x10000)
      .toString(36)
      .padStart(4, "0");
  return rnd() + rnd() + Date.now().toString(36).slice(-4);
}

// ── 本机战绩 ──────────────────────────────────────────────
export function listRecords() {
  seedBackfilled();
  return readArray(RECORDS_KEY)
    .map(normalizeRecord)
    .filter(Boolean)
    .sort((a, b) => b.at - a.at); // 新的在前
}

export function saveRecord(rec) {
  const r = normalizeRecord(rec);
  if (!r) return null;
  const all = readArray(RECORDS_KEY).filter((x) => x && x.id !== r.id);
  all.push(r);
  all.sort((a, b) => b.at - a.at);
  return writeJson(RECORDS_KEY, all.slice(0, RECORD_LIMIT)) ? r : null;
}

export function deleteRecord(id) {
  writeJson(
    RECORDS_KEY,
    readArray(RECORDS_KEY).filter((r) => r && r.id !== id),
  );
}

export function clearRecords() {
  removeRaw(RECORDS_KEY);
  // 补录的那几局也一并清掉，并记下「已经清过」，
  // 免得下次进战绩室时它们又自己长回来。
  writeRaw(BACKFILL_KEY, "cleared");
}

export function careerSummary() {
  return summarize(listRecords());
}

// 补录只种一次。玩家把它删掉之后不该再冒出来，所以这里记的是
// 「有没有种过」，而不是「战绩里有没有这一条」。
function seedBackfilled() {
  if (readRaw(BACKFILL_KEY)) return;
  const all = readArray(RECORDS_KEY);
  const have = new Set(all.map((r) => r && r.id));
  BACKFILLED_RECORDS.forEach((r) => {
    if (!have.has(r.id)) all.push(normalizeRecord(r));
  });
  all.sort((a, b) => b.at - a.at);
  // 写不进去就别记「已种过」，下次进来再试一次。
  if (writeJson(RECORDS_KEY, all.slice(0, RECORD_LIMIT)))
    writeRaw(BACKFILL_KEY, "done");
}

// ── 好友战绩 ──────────────────────────────────────────────
// 按对方的安装 id 归档：同一个人第二次发战绩过来是**合并**，不是新开一份。
export function listFriends() {
  const raw = readObject(FRIENDS_KEY);
  return Object.values(raw)
    .filter((f) => f && typeof f === "object" && f.pid)
    .map((f) => ({
      pid: String(f.pid || ""),
      name: String(f.name || ""),
      importedAt: f.importedAt || 0,
      records: (Array.isArray(f.records) ? f.records : [])
        .map(normalizeRecord)
        .filter(Boolean)
        .sort((a, b) => b.at - a.at),
    }))
    .sort((a, b) => b.importedAt - a.importedAt);
}

// 返回这次实际新增了几条（同 id 的算已有，不重复计）。
export function mergeFriend(profile, records) {
  const raw = readObject(FRIENDS_KEY);
  const pid = String((profile && profile.pid) || "unknown");
  const candidate = raw[pid];
  const prev =
    candidate && typeof candidate === "object"
      ? candidate
      : { pid, name: "", records: [] };
  const previousRecords = (Array.isArray(prev.records) ? prev.records : [])
    .map(normalizeRecord)
    .filter(Boolean);
  const byId = new Map(previousRecords.map((r) => [r.id, r]));
  let added = 0;
  (Array.isArray(records) ? records : []).forEach((r) => {
    const n = normalizeRecord(r);
    if (!n) return;
    if (!byId.has(n.id)) added++;
    byId.set(n.id, n);
  });
  raw[pid] = {
    pid,
    name: String((profile && profile.name) || prev.name || ""),
    importedAt: Date.now(),
    records: [...byId.values()]
      .sort((a, b) => b.at - a.at)
      .slice(0, RECORD_LIMIT),
  };
  const ok = writeJson(FRIENDS_KEY, raw);
  return { ok, added, total: raw[pid].records.length };
}

export function deleteFriend(pid) {
  const raw = readObject(FRIENDS_KEY);
  delete raw[pid];
  writeJson(FRIENDS_KEY, raw);
}
