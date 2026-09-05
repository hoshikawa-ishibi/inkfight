// Every playable format uses the same four-person shared-ink combat rules.
export const teamSizeFor = () => 4;
export const gameState = {
  mode: null,
  difficulty: "normal",
  scene: null,
  expeditionRun: null,
  inkRelics: [],
  inkTurn: null,
  inkBusy: false,
  aiLevels: { 1: null, 2: null },
  p1Picks: [],
  p2Picks: [],
  p1Units: [],
  p2Units: [],
  activeUnitId: null,
  round: 1,
  currentPlayer: 1,
  resultShown: false,
  enemyIntent: null,
  pickingActor: false,
  previewUnitId: null,
  inspectedUnitId: null,
  waitingForTarget: false,
  pendingSkill: null,
  pendingSkillFriendly: false,
  pendingActor: null,
  logPaused: false,
  actionHistory: [],
  stats: {
    p1: { dmg: 0, heal: 0, kills: 0 },
    p2: { dmg: 0, heal: 0, kills: 0 },
  },
};
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
export const pct = (v, m) => Math.round((v / m) * 100);
export const getAllUnits = () => [...gameState.p1Units, ...gameState.p2Units];
export const getUnit = (id) => getAllUnits().find((u) => u.id === id);
export const getEnemies = (p) =>
  p === 1 ? gameState.p2Units : gameState.p1Units;
export const getAllies = (p) =>
  p === 1 ? gameState.p1Units : gameState.p2Units;
export const aiLevelOf = (player) => gameState.aiLevels[player] || null;
export const isAiSide = (player) => !!aiLevelOf(player);
