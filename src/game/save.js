// 本地存档（localStorage）。进度类数据只在这里读写，别处不要另写 getItem。
//
// 各 key 是互相推不出来的独立知识：
//   inkfight_campaign   战役进度（墨皇难度 / 关卡 / 队友全部由它推出）
//   inkfight_taught     已提示过的机制（由 codex.js 管理）
//   inkfight_charplays  每个角色的出战局数（机制解读的解锁门槛）
//   inkfight_teamstudy  用户手动跑出的最近一份配队研究报告
//   inkfight_profile_v1 本机玩家昵称 + 安装 id
//   inkfight_records_v1 本机打过的每一局战绩
//   inkfight_friends_v1 导入进来的好友战绩
//
// CLAUDE.md 的「解锁门槛不要各存一份进度」禁止的是同一份知识存两份，
// 不是禁止新增 key。新增前先确认它确实推不出来。

import { BACKFILLED_RECORDS } from '../data/backfill-records.js';
import { normalizeRecord, summarize } from '../core/record.js';

// ── 调试模式 ───────────────────────────────────────────────
// 实验功能总开关：控制战役 / 平衡测试 / 墨皇难度是否可见，
// 并让所有解锁门槛一律视为已达成。
export const DEBUG_KEY = 'inkfight_debug';
export function isDebug(){ return localStorage.getItem(DEBUG_KEY) === '1'; }
export function setDebug(on){ localStorage.setItem(DEBUG_KEY, on ? '1' : '0'); }

// ── 角色出战局数 → 机制解读解锁 ────────────────────────────
// 门槛挂在角色自己身上（用他打满 N 局），输赢都算。
// 要求获胜会把门槛压在最难用的角色上，而那恰恰是最需要解读的角色。
const PLAYS_KEY = 'inkfight_charplays';
export const INSIGHT_UNLOCK_PLAYS = 3;

export function getCharPlays(){
  try { return JSON.parse(localStorage.getItem(PLAYS_KEY)) || {}; }
  catch { return {}; }
}
export function playsOf(id){ return getCharPlays()[id] || 0; }

// 一局开始时调用一次，传入本局玩家自己带上场的角色 id。
// 同一局内同一个 id 只计一次（两边可能选到同一个角色）。
export function recordCharPlays(ids){
  if(!ids || !ids.length) return;
  const plays = getCharPlays();
  new Set(ids).forEach(id => { plays[id] = (plays[id] || 0) + 1; });
  localStorage.setItem(PLAYS_KEY, JSON.stringify(plays));
}

export function insightUnlocked(id){
  return isDebug() || playsOf(id) >= INSIGHT_UNLOCK_PLAYS;
}

// ── 配队研究报告 ──────────────────────────────────────────
// 只存压缩后的最终报告，不存数万局原始记录；重新分析成功前旧报告一直保留。
const TEAM_STUDY_KEY = 'inkfight_teamstudy_v1';
export function loadTeamStudy(){
  try { return JSON.parse(localStorage.getItem(TEAM_STUDY_KEY)); }
  catch { return null; }
}
export function saveTeamStudy(report){
  localStorage.setItem(TEAM_STUDY_KEY, JSON.stringify(report));
}

// ── 战绩 ──────────────────────────────────────────────────
// 三份互相推不出来的知识，各占一个 key：
//   inkfight_profile_v1   本机玩家的昵称 + 安装 id（分享码里带这两样）
//   inkfight_records_v1   本机打过的每一局
//   inkfight_friends_v1   导入进来的好友战绩，按安装 id 归档
//
// 战绩不做「上限之外还压缩」这类事：一条约 700 字节，封顶 200 条也才 140KB，
// localStorage 的额度是 5MB。真到了要压缩的那天，说明该做的是导出到文件。

const PROFILE_KEY = 'inkfight_profile_v1';
const RECORDS_KEY = 'inkfight_records_v1';
const FRIENDS_KEY = 'inkfight_friends_v1';
const BACKFILL_KEY = 'inkfight_backfilled_v1';

export const RECORD_LIMIT = 200;

// localStorage 可能整个不可用（隐私模式、被策略禁掉、某些 file:// 环境），
// 也可能写满。战绩不是核心玩法，**任何一步失败都只是没记上**，
// 不能让它把结算流程或战绩室带崩。
function readRaw(key){
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeRaw(key, value){
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}
function removeRaw(key){
  try { localStorage.removeItem(key); } catch { /* 读不到就当已经没了 */ }
}

function readJson(key, fallback){
  try {
    const v = JSON.parse(readRaw(key));
    return v == null ? fallback : v;
  } catch { return fallback; }
}

function writeJson(key, value){
  try { return writeRaw(key, JSON.stringify(value)); }
  catch { return false; }
}

// ── 本机档案 ──────────────────────────────────────────────
// pid 是这台设备的安装 id，只用来在好友榜上区分同名玩家，不含任何身份信息。
export function getProfile(){
  const p = readJson(PROFILE_KEY, null);
  if(p && p.pid) return p;
  const fresh = { name: '', pid: newPid() };
  writeJson(PROFILE_KEY, fresh);
  return fresh;
}

export function setProfileName(name){
  const p = getProfile();
  p.name = String(name || '').slice(0, 12);
  writeJson(PROFILE_KEY, p);
  return p;
}

// 昵称没填时对外用的名字。**别在界面里各写一份默认值**。
export function displayName(profile){
  return (profile && profile.name) || '无名墨客';
}

function newPid(){
  const rnd = () => Math.floor(Math.random() * 0x10000).toString(36).padStart(4, '0');
  return rnd() + rnd() + Date.now().toString(36).slice(-4);
}

// ── 本机战绩 ──────────────────────────────────────────────
export function listRecords(){
  seedBackfilled();
  return readJson(RECORDS_KEY, []).map(normalizeRecord).filter(Boolean)
    .sort((a, b) => b.at - a.at);        // 新的在前
}

export function saveRecord(rec){
  const r = normalizeRecord(rec);
  if(!r) return null;
  const all = readJson(RECORDS_KEY, []).filter(x => x && x.id !== r.id);
  all.push(r);
  all.sort((a, b) => b.at - a.at);
  writeJson(RECORDS_KEY, all.slice(0, RECORD_LIMIT));
  return r;
}

export function deleteRecord(id){
  writeJson(RECORDS_KEY, readJson(RECORDS_KEY, []).filter(r => r && r.id !== id));
}

export function clearRecords(){
  removeRaw(RECORDS_KEY);
  // 补录的那几局也一并清掉，并记下「已经清过」，
  // 免得下次进战绩室时它们又自己长回来。
  writeRaw(BACKFILL_KEY, 'cleared');
}

export function careerSummary(){
  return summarize(listRecords());
}

// 补录只种一次。玩家把它删掉之后不该再冒出来，所以这里记的是
// 「有没有种过」，而不是「战绩里有没有这一条」。
function seedBackfilled(){
  if(readRaw(BACKFILL_KEY)) return;
  const all = readJson(RECORDS_KEY, []);
  const have = new Set(all.map(r => r && r.id));
  BACKFILLED_RECORDS.forEach(r => { if(!have.has(r.id)) all.push(normalizeRecord(r)); });
  all.sort((a, b) => b.at - a.at);
  // 写不进去就别记「已种过」，下次进来再试一次。
  if(writeJson(RECORDS_KEY, all.slice(0, RECORD_LIMIT))) writeRaw(BACKFILL_KEY, 'done');
}

// ── 好友战绩 ──────────────────────────────────────────────
// 按对方的安装 id 归档：同一个人第二次发战绩过来是**合并**，不是新开一份。
export function listFriends(){
  const raw = readJson(FRIENDS_KEY, {});
  return Object.values(raw).map(f => ({
    pid: String(f.pid || ''),
    name: String(f.name || ''),
    importedAt: f.importedAt || 0,
    records: (f.records || []).map(normalizeRecord).filter(Boolean).sort((a, b) => b.at - a.at),
  })).sort((a, b) => b.importedAt - a.importedAt);
}

// 返回这次实际新增了几条（同 id 的算已有，不重复计）。
export function mergeFriend(profile, records){
  const raw = readJson(FRIENDS_KEY, {});
  const pid = String((profile && profile.pid) || 'unknown');
  const prev = raw[pid] || { pid, name:'', records:[] };
  const byId = new Map((prev.records || []).map(r => [r.id, r]));
  let added = 0;
  records.forEach(r => {
    const n = normalizeRecord(r);
    if(!n) return;
    if(!byId.has(n.id)) added++;
    byId.set(n.id, n);
  });
  raw[pid] = {
    pid,
    name: String((profile && profile.name) || prev.name || ''),
    importedAt: Date.now(),
    records: [...byId.values()].sort((a, b) => b.at - a.at).slice(0, RECORD_LIMIT),
  };
  const ok = writeJson(FRIENDS_KEY, raw);
  return { ok, added, total: raw[pid].records.length };
}

export function deleteFriend(pid){
  const raw = readJson(FRIENDS_KEY, {});
  delete raw[pid];
  writeJson(FRIENDS_KEY, raw);
}
