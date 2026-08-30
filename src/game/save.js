// 本地存档（localStorage）。**只有这里碰 localStorage 里的进度类数据**，
// 别在别处再手写一份 getItem——这个项目的头号病因就是同一份知识两份实现。
//
// 目前三份进度，各有各的 key，但**每份都只有一处真相**：
//   inkfight_campaign   战役进度（→ 墨皇难度 / 关卡 / 队友，全从它推）
//   inkfight_taught     已教过的机制提示（codex.js 自己管）
//   inkfight_charplays  每个角色出战过几局（→ 机制解读解锁）
//
// **`inkfight_charplays` 为什么可以另开一个 key**：CLAUDE.md 那条
// 「解锁门槛不要各存一份进度」针对的是**同一份知识存两份**（墨皇 / 关卡 /
// 队友本质上都是「战役打到第几关」）。「每个角色出战过几局」是一份全新的知识，
// 从现有存档里推不出来。**但也只能有这一个**——别再为「解读读过没有」另开第三个。

// ── 调试模式 ───────────────────────────────────────────────
// 语义是**实验功能总开关**：藏起来的战役 / 平衡测试 / 墨皇难度，
// 外加「所有解锁门槛一律当作已达成」。放在这里而不是 main.js，
// 是因为 character-gallery.js 也要问它，而 main.js 反过来 import 它。
export const DEBUG_KEY = 'inkfight_debug';
export function isDebug(){ return localStorage.getItem(DEBUG_KEY) === '1'; }
export function setDebug(on){ localStorage.setItem(DEBUG_KEY, on ? '1' : '0'); }

// ── 角色出战局数 → 机制解读解锁 ────────────────────────────
// 门槛挂在**这个角色自己**身上（用他打满 N 局），不挂在难度上：
// 解读讲的是这个角色，玩家还没碰过他的时候给他看，他一样不会看。
// **输赢都算**——要求赢会把门槛压在最难用的角色头上，而那恰恰是最需要解读的。
const PLAYS_KEY = 'inkfight_charplays';
export const INSIGHT_UNLOCK_PLAYS = 3;

export function getCharPlays(){
  try { return JSON.parse(localStorage.getItem(PLAYS_KEY)) || {}; }
  catch { return {}; }
}
export function playsOf(id){ return getCharPlays()[id] || 0; }

// 一局开始时调一次，传这一局玩家自己带上场的角色 id。
// 同一局里同一个 id 只算一次（两边选到同一个角色是允许的）。
export function recordCharPlays(ids){
  if(!ids || !ids.length) return;
  const plays = getCharPlays();
  new Set(ids).forEach(id => { plays[id] = (plays[id] || 0) + 1; });
  localStorage.setItem(PLAYS_KEY, JSON.stringify(plays));
}

export function insightUnlocked(id){
  return isDebug() || playsOf(id) >= INSIGHT_UNLOCK_PLAYS;
}
