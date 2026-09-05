// 每方出战人数。**随机对战 4 人、战役 2 人。**
//
// 只有 8 个角色时 4v4 是不行的：双方各 4 人等于每局用光全部角色，
// 阵容失去变化，策略价值从 3v3 的 61.0 掉到 50.3。
// **角色扩到 16 个之后这个限制就没了**（ROSTER_PLAN.md）：
// 重扫 2v2/3v3/4v4/5v5，策略价值分别是 54.7 / 52.4 / 53.3 / 53.6，
// 4v4 不再塌，而对局种类到了 331 万（C(16,4)²）。
//
// **改人数会大幅改变 AoE 技能的强度**——AoE 的收益随目标数线性增长。
// 3v3 时弓手「穿透箭」一度冲到 69.2%，4v4 时弓手/术士/机关师/鼓姬
// 集体超模到 57~63%，两次都要专门做一轮 AoE 下调。
//
// 战役暂时留在 2（主角 + 1 名同伴），它的 8 关曲线是按 2v2 校准的，
// 改人数要整条重校——见 COMBAT_PLAN.md。
export function teamSizeFor(mode){
  return mode === 'campaign' ? 2 : 4;
}

export let gameState = {
  mode:null, difficulty:'normal', scene:null,
  expeditionRun:null, inkRelics:[], inkTurn:null, inkBusy:false,
  // **哪一方由 AI 控制，以及用哪一档** —— 唯一真相来源。
  // null = 真人操作。以前这件事是各处自己判 `mode==='ai' && player===2`，
  // 散在 battle.js 的 startTurn / activateUnit / aiAct / updateEnemyIntent
  // 和 main.js 的快捷键里共 5 处；加「观战」模式（两边都是 AI、还各自选档）
  // 时那 5 处都得改，正是这个项目反复出 bug 的模式。
  //   双人   {1:null,      2:null}
  //   人机   {1:null,      2:难度}
  //   战役   {1:null,      2:关卡AI档}
  //   观战   {1:A方难度,   2:B方难度}
  aiLevels:{1:null, 2:null},
  p1Picks:[], p2Picks:[],
  p1Units:[], p2Units:[],
  // 当前正在行动的单位 id，由 battle.js 的 activateUnit() 写入。
  // 以前这里是 turnOrder[]/currentIdx，后来改成 currentPlayer + p1/p2LastActed，
  // 再后来（COMBAT_PLAN.md 任务 5）出手顺序改成每回合自己挑，连 LastActed 也
  // 一并删了。教训留在这：那次重构留下三处死读，读到的永远是 undefined，
  // 于是「按 ESC 取消选目标」会把回合卡死、数字键快捷键全哑、行动高亮不亮。
  // **删状态字段一定要 grep 干净所有读取方。**
  activeUnitId:null, round:1,
  // 战役关卡的敌方属性加成（campaign.js 的 enemyMod），由 launchCampaignStage 写入
  stageMod:null,
  // 战役敌人的原始条目（带剧情名 / 墨皇的属性覆盖），由 launchCampaignStage 写入
  p2Roster:null,
  // 战役玩家单位的原始条目（主角墨白 + 同伴的剧情名）
  p1Roster:null,
  // 本局是否已经结算过（showResult 的幂等标记，见 battle.js 的注释）
  resultShown:false,
  // 敌方下一个行动单位的**已锁定**打算：{unitId, skill, targetId, estDmg, hesitated}。
  // 玩家回合开始时由 battle.js 的 updateEnemyIntent() 写入并公开显示，
  // 轮到该单位时**照此兑现**（见 intent.js 的「承诺制的契约」）。
  // 人机 / 战役模式才有；PvP 下恒为 null。
  enemyIntent:null,
  // 当前行动方这一「侧回合」还剩几次额外行动（BOSS 阶段二「涂改」= 1）。
  // 见 battle.js 的 afterAction / combat.js 的 actionsFor。
  extraActions:0,
  // 「点我方角色查看技能」阶段：pickingActor 为真时，玩家还没提交出手单位，
  // previewUnitId 只是当前在看谁的技能面板。点技能才提交（见 battle.js 的 beginTurnFor）。
  pickingActor:false, previewUnitId:null,
  waitingForTarget:false, pendingSkill:null, pendingSkillFriendly:false, pendingActor:null,
  logPaused:false,
  stats:{ p1:{dmg:0,heal:0,kills:0}, p2:{dmg:0,heal:0,kills:0} }
};

export function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
export function rand(a,b){return Math.floor(Math.random()*(b-a+1))+a;}
export function pct(v,m){return Math.round(v/m*100);}

export function getAllUnits(){return [...gameState.p1Units,...gameState.p2Units];}
export function getUnit(id){return getAllUnits().find(u=>u.id===id);}
export function getEnemies(p){return p===1?gameState.p2Units:gameState.p1Units;}
export function getAllies(p){return p===1?gameState.p1Units:gameState.p2Units;}

// 这一方是 AI 在操作吗？返回它的难度档，真人则返回 null。
export function aiLevelOf(player){ return gameState.aiLevels[player] || null; }
export function isAiSide(player){ return !!aiLevelOf(player); }
