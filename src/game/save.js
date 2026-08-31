// 本地存档（localStorage）。进度类数据只在这里读写，别处不要另写 getItem。
//
// 现有三个 key，各自是一份独立的知识，互相推不出来：
//   inkfight_campaign   战役进度（墨皇难度 / 关卡 / 队友全部由它推出）
//   inkfight_taught     已提示过的机制（由 codex.js 管理）
//   inkfight_charplays  每个角色的出战局数（机制解读的解锁门槛）
//
// CLAUDE.md 的「解锁门槛不要各存一份进度」禁止的是同一份知识存两份，
// 不是禁止新增 key。新增前先确认它确实推不出来。

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
