import { Audio, playSfx } from "../view/audio.js";
import {
  gameState,
  getUnit,
  getEnemies,
  getAllies,
  aiLevelOf,
  isAiSide,
} from "../core/state.js";
import { renderBattle, animateUnit } from "../view/render.js";
import { critSkillPresentation } from "../view/tactical.js";
import {
  playSkillVfx as rawSkillVfx,
  spawnFloatText,
  spawnHitBurst,
  spawnHealColumn,
  spawnHexShield,
  spawnAura,
} from "../view/vfx.js";
import { applyExpeditionBattle } from "../core/expedition.js";
import {
  createInkTurn,
  availableInkUnits,
  canInkAct,
  commitInkAction,
  finishInkTurn,
  inkActionCost,
  previewInkSkill,
  prepareInkUnits,
  startInkSideRound,
  inkAiOptions,
} from "../core/ink-turn.js";
import { chooseInkAction } from "../ai/ink-ai.js";
import { renderInkHud } from "../view/ink-hud.js";
import { makeTeamContext } from "../ai/ai-scoring.js";
import { makeIntent, resolveIntent } from "../core/intent.js";
import { openModal, dismiss } from "../view/codex.js";
import { makeRecord, mvpOf } from "../core/record.js";
import { commitRecord, openShareDialog } from "../view/records.js";
import { showSkillCue } from "../view/presentation.js";
import { animateStageUnit } from "../view/battle3d.js";
import {
  createUnit,
  getEffectiveAtk,
  previewDmg as calcPreviewDmg,
  unitSpec,
  canUseSkill,
  needsEnemyTarget,
  DIFF_LABEL,
  INTERRUPT_OUTPUT_MULTIPLIER,
} from "../core/combat.js";
import { executeSkill as resolveSkill } from "../core/skill-executor.js";

export { createUnit, getEffectiveAtk };

let battleGeneration = 0;
let pendingImpacts = 0;
const battleTimers = new Set();
function battleDelay(fn, ms) {
  const generation = battleGeneration;
  const timer = globalThis.setTimeout(() => {
    battleTimers.delete(timer);
    if (generation === battleGeneration) fn();
  }, ms);
  battleTimers.add(timer);
  return timer;
}
function playSkillVfx(actor, target, skill, onHit) {
  const generation = battleGeneration;
  pendingImpacts++;
  rawSkillVfx(actor, target, skill, () => {
    if (generation === battleGeneration) {
      try {
        onHit?.();
      } finally {
        pendingImpacts--;
      }
    }
  });
}
export function stopBattle() {
  battleGeneration++;
  for (const timer of battleTimers) clearTimeout(timer);
  battleTimers.clear();
  pendingImpacts = 0;
  gameState.inkBusy = true;
  gameState.waitingForTarget = false;
  gameState.pickingActor = false;
  gameState.pendingActor = null;
  gameState.pendingSkill = null;
  Audio.stopBgm();
}
const isExpedition = () => gameState.mode === "expedition";

// Pause at settled action boundaries; all modes share playback speed.
let _specPaused = false; // 暂停中
let _specResume = null; // 挂起的「继续」动作，单步时执行它
let _specSpeed = 1; // 倍速：所有节奏延时都除以它
// Single-step admits exactly one prepared AI action, including across side boundaries.
let _specStepOnce = false;

// **所有战斗节奏的延时都过这个函数**，倍速才有意义。
// 漏一处就会出现「别的都快了，就它还按原速」这种割裂感。
function d(ms) {
  return Math.max(30, Math.round(ms / _specSpeed));
}

function isSpectating() {
  return gameState.mode === "spectate";
}

// 返回 true 表示「已挂起，调用方别再往下走」。
function pauseGate(cont) {
  if (!isSpectating() || !_specPaused) return false;
  if (_specStepOnce) {
    _specStepOnce = false;
    return false;
  } // 单步放行这一次
  _specResume = cont;
  renderSpectateBar();
  return true;
}

export function toggleSpectatePause() {
  _specPaused = !_specPaused;
  _specStepOnce = false;
  // 从暂停恢复时，把挂起的那一步接上
  if (!_specPaused && _specResume) {
    const f = _specResume;
    _specResume = null;
    f();
  }
  renderSpectateBar();
}

// 单步：没暂停时先暂停（下一个边界会停住），已暂停就放行一步。
export function stepSpectate() {
  if (!_specPaused) {
    _specPaused = true;
    renderSpectateBar();
    return;
  }
  if (!_specResume) return;
  _specStepOnce = true; // 让下一次闸门放行
  const f = _specResume;
  _specResume = null;
  f();
  renderSpectateBar();
}

export function cycleSpectateSpeed() {
  const steps = [1, 2, 4, 0.5];
  _specSpeed = steps[(steps.indexOf(_specSpeed) + 1) % steps.length];
  renderSpectateBar();
}

function renderSpectateBar() {
  const bar = document.getElementById("spectate-bar");
  if (!bar) return;
  bar.style.display = isSpectating() ? "flex" : "none";
  document.getElementById("spec-speed").textContent = `⏩ ${_specSpeed}×`;
  if (!isSpectating()) return;
  document.getElementById("spec-pause").textContent = _specPaused
    ? "▶ 继续"
    : "⏸ 暂停";
  document.getElementById("spec-step").disabled = !_specPaused || !_specResume;
  document.getElementById("spec-speed").textContent = `⏩ ${_specSpeed}×`;
}

// 每局开始时复位，否则上一局的暂停状态会带进下一局（下一局一开始就是卡住的）。
function resetSpectateControls() {
  _specPaused = false;
  _specResume = null;
  _specStepOnce = false;
  renderSpectateBar();
}

// AI targeting context holds references only for this battle.
// 每局开始时重建（里面存着上一局单位的引用，留着会认错人）。
let teamCtx = { 1: makeTeamContext(), 2: makeTeamContext() };

// ── 被动技能事件呈现（规则本身在 combat.js，这里只管日志/特效） ──────────
function renderPassiveEvent(unit, event) {
  if (!event) return;
  switch (event.effect) {
    case "critCharge":
      addLog(`【${event.name}】${unit.name} 锋芒 +${event.value}`, "buff");
      spawnFloatText(unit, `锋芒+${event.value}`, "#ffd54f", 14);
      break;
    case "allyHeal":
      event.targets.forEach((a) => {
        addLog(
          `【${event.name}】${unit.name} 圣光治疗 ${a.name} ${event.value} HP`,
          "heal",
        );
        spawnFloatText(a, `+${event.value}`, "#66bb6a", 14);
        spawnHealColumn(a);
      });
      break;
    case "critStack":
      addLog(
        `【${event.name}】${unit.name} 锋芒充能 +${event.value}/击（${event.stacks}层）`,
        "buff",
      );
      spawnFloatText(unit, `鹰眼${event.stacks}层`, "#ffd54f", 13);
      break;
    case "reflect":
      addLog(
        `【${event.name}】${unit.name} 反弹 ${event.amount} 伤害给 ${event.attacker.name}`,
        "dmg",
      );
      spawnFloatText(event.attacker, `-${event.amount}`, "#90caf9", 14);
      presentDeath(event.attacker, null, event.died, event.undying);
      break;
    case "bloodRage":
      addLog(
        `【${event.name}】${unit.name} 血怒觉醒！攻击+${event.value * 100}%（${event.stacks}层）`,
        "buff",
      );
      spawnFloatText(unit, "血怒!", "#ff7043", 16);
      spawnAura(unit, "#ff5722");
      break;
    case "corruptBonus":
      addLog(
        `【${event.name}】腐化侵蚀 ${event.target.name} 额外 ${event.amount} 伤害（${event.stacks}层）`,
        "dmg",
      );
      spawnFloatText(event.target, `-${event.amount}`, "#ce93d8", 16);
      presentDeath(event.target, event.killer, event.died, event.undying);
      break;
  }
}

function presentDeath(u, killer, died, undying) {
  if (undying) {
    addLog(`${u.name} 触发不屈，保留 ${u.hp} HP！`, "heal");
    spawnFloatText(u, "不屈!", "#ffd54f", 20);
    spawnAura(u, "#ffd54f");
    return;
  }
  if (!died) return;
  addLog(`☠ ${u.name} 阵亡！`, "death");
  playSfx("death");
  _screenShake(12, 400);
  // 玩家抢在预告兑现之前把它打死了——这是「看得见下一击」最直接的回报，
  // 要说出来。（意图属于别的单位时 cancelIntentOf 会自己跳过。）
  cancelIntentOf(u, "随其阵亡");
  if (killer) {
    gameState.stats["p" + killer.player].kills++;
    if (gameState.stats.units[killer.id])
      gameState.stats.units[killer.id].kills++;
  }
}

let _showScreen,
  _hideTooltip,
  _showTooltip,
  _screenShake,
  _onExpeditionResult,
  _returnExpedition;
export function initBattle(
  showScreen,
  hideTooltip,
  showTooltip,
  screenShake,
  onExpeditionResult,
  returnExpedition,
) {
  _showScreen = showScreen;
  _hideTooltip = hideTooltip;
  _showTooltip = showTooltip;
  _screenShake = screenShake;
  _onExpeditionResult = onExpeditionResult;
  _returnExpedition = returnExpedition;
}

// **同阵容再来一场。** 阵容 / 场景 / 难度 / aiLevels 打完都还留在 gameState 里，
// 所以直接再跑一次 startBattle 就够了——不要在这里另存一份「上一局的设置」，
// 那就又是同一份知识两份实现。
//
// 观战模式尤其需要它：想比较两档 AI，就得让它们在**同一套阵容**上反复打，
// 否则每局阵容都变，看到的差异分不清是难度还是运气。
export function rematch() {
  playSfx("click");
  startBattle();
}

export function startBattle() {
  stopBattle();
  gameState.inkTurn = null;
  gameState.inkBusy = false;
  document.getElementById("screen-battle").classList.add("ink-battle");
  gameState.actionHistory = [];
  gameState.inspectedUnitId = null;
  document.getElementById("battle-info").hidden = true;
  _showScreen("screen-battle");
  _hideTooltip();
  const fx = document.getElementById("fx-canvas");
  fx.width = window.innerWidth;
  fx.height = window.innerHeight;
  gameState.p1Units = gameState.p1Picks.map((e, i) => {
    const [id, ov] = unitSpec(e);
    return createUnit(id, 1, i, ov);
  });
  gameState.p2Units = gameState.p2Picks.map((e, i) => {
    const [id, ov] = unitSpec(e);
    return createUnit(id, 2, i, ov);
  });
  if (isExpedition())
    applyExpeditionBattle(
      gameState.expeditionRun,
      gameState.p1Units,
      gameState.p2Units,
    );
  else prepareInkUnits([...gameState.p1Units, ...gameState.p2Units]);
  teamCtx = { 1: makeTeamContext(), 2: makeTeamContext() };
  gameState.round = 1;
  gameState.activeUnitId = null;
  gameState.resultShown = false;
  gameState.enemyIntent = null;
  resetSpectateControls();
  gameState.stats = {
    p1: { dmg: 0, heal: 0, kills: 0 },
    p2: { dmg: 0, heal: 0, kills: 0 },
    maxHit: { dmg: 0, name: "" },
    units: {},
  };
  [...gameState.p1Units, ...gameState.p2Units].forEach((u) => {
    gameState.stats.units[u.id] = {
      name: u.name,
      player: u.player,
      dmg: 0,
      heal: 0,
      kills: 0,
    };
  });
  buildTurnOrder();
  document.getElementById("battle-log").innerHTML = "";
  const modeLabel = isExpedition()
    ? `墨路远征 · 第${gameState.expeditionRun.battleIndex + 1}战 · 三笔墨`
    : gameState.mode === "spectate"
      ? `观战 A[${DIFF_LABEL[aiLevelOf(1)]}] vs B[${DIFF_LABEL[aiLevelOf(2)]}]`
      : gameState.mode === "ai"
        ? `人机·${DIFF_LABEL[aiLevelOf(2)]}`
        : "双人";
  document.getElementById("scene-banner").textContent =
    `战场：${gameState.scene.name} ｜ ${gameState.scene.buffText} ｜ 模式：${modeLabel}`;
  addLog("═══ 墨境之战 开始 ═══", "divider");
  addLog(
    `战场：${gameState.scene.name}（${gameState.scene.buffText}）`,
    "buff",
  );
  addLog(
    `玩家1: ${gameState.p1Units.map((u) => u.name).join(", ")}  VS  玩家2: ${gameState.p2Units.map((u) => u.name).join(", ")}`,
    "info",
  );
  Audio.startBgm(gameState.scene);
  renderBattle();
  renderInkHud(endInkRound);
  startTurn();
}

function buildTurnOrder() {
  gameState.currentPlayer = 1;
}

let inkChoice = null;
function inkRelicsFor(side) {
  return side === 1 ? gameState.inkRelics || [] : [];
}
function startInkRound() {
  const side = gameState.currentPlayer;
  gameState.inkTurn = createInkTurn(inkRelicsFor(side));
  gameState.inkBusy = true;
  // A volley advances time once for every teammate, regardless of how many ink actions follow.
  startInkSideRound(
    getAllies(side),
    getEnemies(side),
    gameState.scene,
    gameState.round,
  ).forEach(({ unit, result }) => presentStartOfTurn(unit, result));
  if (checkVictory()) return;
  if (side === 1 && isAiSide(2)) {
    const turn = createInkTurn([]);
    const chosen = chooseInkAction(
      turn,
      getAllies(2),
      getEnemies(2),
      gameState.scene,
      inkAiOptions(aiLevelOf(2)),
    );
    gameState.enemyIntent = chosen
      ? makeIntent(chosen.actor, chosen, gameState.scene)
      : null;
  }
  continueInkTurn();
}
function continueInkTurn() {
  gameState.inkBusy = false;
  gameState.activeUnitId = null;
  gameState.pickingActor = false;
  const side = gameState.currentPlayer,
    team = getAllies(side);
  const units = availableInkUnits(gameState.inkTurn, team);
  if (!units.length) {
    finishInkRound();
    return;
  }
  renderInkHud(endInkRound);
  if (!isAiSide(side)) {
    beginActorChoice(side, units);
    return;
  }
  inkChoice = null;
  if (
    side === 2 &&
    gameState.inkTurn.acted.length === 0 &&
    gameState.enemyIntent
  ) {
    const it = gameState.enemyIntent,
      actor = team.find((u) => u.id === it.unitId && u.alive);
    if (actor) {
      const chosen = resolveIntent(
        actor,
        it,
        getEnemies(side).filter((u) => u.alive),
        team.filter((u) => u.alive),
        { teamwork: 1, ctx: teamCtx[side] },
      );
      if (chosen && canInkAct(gameState.inkTurn, actor, chosen.skill))
        inkChoice = { actor, ...chosen };
    }
    if (!inkChoice) addLog("敌方预告未能落笔，阵型被打乱。", "crit");
    gameState.enemyIntent = null;
  }
  inkChoice ||= chooseInkAction(
    gameState.inkTurn,
    team,
    getEnemies(side),
    gameState.scene,
    inkAiOptions(aiLevelOf(side)),
  );
  if (!inkChoice) {
    finishInkRound();
    return;
  }
  beginAiAction();
}
function beginAiAction() {
  if (pauseGate(beginAiAction)) return;
  activateUnit(inkChoice.actor);
}
function finishInkRound() {
  if (gameState.inkTurn?.ended) return;
  const shield = finishInkTurn(
    gameState.inkTurn,
    getAllies(gameState.currentPlayer),
  );
  if (shield) addLog(`收笔留白：全队各获得 ${shield} 点护盾。`, "buff");
  gameState.inkBusy = true;
  gameState.pickingActor = false;
  gameState.activeUnitId = null;
  document.getElementById("skill-panel").innerHTML =
    '<span class="ink-resolving">这一轮已收笔…</span>';
  renderBattle();
  renderInkHud(endInkRound);
  battleDelay(nextTurn, d(450));
}
export function endInkRound() {
  if (
    gameState.inkBusy ||
    gameState.waitingForTarget ||
    isAiSide(gameState.currentPlayer) ||
    gameState.resultShown
  )
    return;
  finishInkRound();
}

function startTurn() {
  startInkRound();
}

function beginActorChoice(player, units) {
  gameState.pickingActor = true;
  gameState.previewUnitId = units[0].id;
  document.getElementById("round-badge").textContent =
    `回合 ${gameState.round}`;
  document.getElementById("turn-text").textContent =
    `第 ${gameState.round} 轮 · ${player === 1 ? "赤方" : "青方"}落笔 · 点人查看技能`;
  renderBattle();
  renderSkillPanel(units[0]);
}

// 战场上点了自己人：只换预览，不提交。
export function onPreviewUnit(u) {
  if (!gameState.pickingActor || !u.alive) return;
  if (
    gameState.inkBusy ||
    !availableInkUnits(gameState.inkTurn, getAllies(u.player)).includes(u)
  )
    return;
  gameState.previewUnitId = u.id;
  renderBattle();
  renderSkillPanel(u);
}

// 真正提交出手的单位。返回它还能不能行动（中毒倒下 / 旧版跳过打断算不能）。
// 从 activateUnit 里拆出来，是为了让「玩家点了技能才提交」这条路复用同一份逻辑——
// 两份实现是这个项目的头号病因。
function beginTurnFor(u) {
  gameState.activeUnitId = u.id;
  gameState.pickingActor = false;
  gameState.previewUnitId = null;
  document.getElementById("round-badge").textContent =
    "第 " + gameState.round + " 轮";
  document.getElementById("turn-text").textContent =
    (u.player === 1 ? "赤方" : "青方") + " · " + u.name + " 落笔";
  return u.alive;
}

function cancelIntentOf(u, reason) {
  const it = gameState.enemyIntent;
  if (!it || it.unitId !== u.id) return;
  addLog(`💥 ${u.name} 的「${it.skill.name}」${reason}，没能打出来！`, "crit");
  gameState.enemyIntent = null;
}

function activateUnit(u) {
  if (!beginTurnFor(u)) return;
  renderBattle();
  if (isAiSide(u.player)) {
    document.getElementById("skill-panel").innerHTML =
      `<span style="color:#888;">🤖 AI 思考中...</span>`;
    battleDelay(() => aiAct(u), d(700 + Math.random() * 400));
  } else {
    renderSkillPanel(u);
  }
}

function presentStartOfTurn(u, r) {
  if (r.springHeal) spawnFloatText(u, "+" + r.springHeal, "#9bd9c4", 12);
  renderPassiveEvent(u, r.passiveEvent);
  if (r.poison) {
    addLog(`${u.name} 受到中毒伤害 ${r.poison.dmg}`, "dmg");
    spawnFloatText(u, `-${r.poison.dmg}`, "#9ccc65", 14);
    presentDeath(u, null, r.poison.died, r.poison.undying);
  }
  if (r.erosion) {
    // 墨蚀对双方对称，无论先落在谁身上都应提示：它描述的是局面阶段，不是某一方的处境。
    addLog(
      `🕳 墨蚀侵蚀 ${u.name}，损失 ${r.erosion.dmg} HP（拖得越久越重）`,
      "dmg",
    );
    spawnFloatText(u, `-${r.erosion.dmg}`, "#7e57c2", 15);
    presentDeath(u, null, r.erosion.died, r.erosion.undying);
  }
  if (r.berserk) {
    addLog(`${u.name} 因狂暴失去 8 HP`, "dmg");
    spawnFloatText(u, "-8", "#ff7043", 14);
    presentDeath(u, null, r.berserk.died, r.berserk.undying);
  }
}

function nextTurn() {
  if (checkVictory()) return;
  if (gameState.currentPlayer === 2) {
    gameState.round++;
    addLog(`═══ 回合 ${gameState.round} 开始 ═══`, "divider");
  }
  gameState.currentPlayer = gameState.currentPlayer === 1 ? 2 : 1;
  startTurn();
}

function checkVictory() {
  const p1 = gameState.p1Units.some((u) => u.alive);
  const p2 = gameState.p2Units.some((u) => u.alive);
  if (!p1 || !p2) {
    battleDelay(() => showResult(p1 ? 1 : 2), d(700));
    return true;
  }
  return false;
}

// 结算表格 + 数字滚动动画。战役和人机/PVP 共用这一份——
// 以前战役赢了直接跳过场，打完一关看不到任何伤害/MVP 统计。
function renderStatsPanel(extraRows, actionsHtml) {
  const s = gameState.stats;
  const allUnits = Object.values(s.units);
  // MVP 的算法在 core/record.js —— 战绩室要显示同一个人，
  // 两边各写一份就会出现「结算说是弓手、战绩里说是刺客」。
  const mvp = mvpOf(allUnits) || { name: "—", dmg: 0, heal: 0, kills: 0 };
  const rows = [
    ["最高单次伤害", `${s.maxHit.dmg}（${s.maxHit.name}）`],
    [
      "MVP",
      `${mvp.name} ⭐（伤害${mvp.dmg} 治疗${mvp.heal} 击杀${mvp.kills}）`,
    ],
    ["─────────────", "─────────────"],
    ...allUnits.map((u) => [
      u.name,
      `伤害 ${u.dmg} / 治疗 ${u.heal} / 击杀 ${u.kills}`,
    ]),
    ["─────────────", "─────────────"],
    ...(extraRows || []),
    ["总回合数", gameState.round],
  ];
  const statsEl = document.getElementById("result-stats");
  const best = [...gameState.actionHistory].sort(
    (a, b) =>
      b.dmg +
      b.heal * 1.5 +
      b.kills * 80 -
      (a.dmg + a.heal * 1.5 + a.kills * 80),
  )[0];
  const recap = best
    ? '<div class="recap-highlight"><h4>关键落笔 · ' +
      best.actor +
      " / " +
      best.skill +
      "</h4><p>第 " +
      best.round +
      " 轮 · " +
      best.cost +
      " 墨 → " +
      best.dmg +
      " 伤害 / " +
      best.heal +
      " 治疗 / " +
      best.kills +
      ' 击倒</p><div class="action-recap">' +
      gameState.actionHistory
        .filter((a) => a.round === best.round && a.side === best.side)
        .map(
          (a) =>
            "<span>" + a.actor + " · " + a.skill + " (" + a.cost + "墨)</span>",
        )
        .join("") +
      "</div></div>"
    : "";
  statsEl.innerHTML =
    recap +
    "<h3>战斗统计</h3>" +
    rows
      .map(
        ([k, v]) =>
          `<div class="row"><span>${k}</span><span class="stat-val" data-val="${v}">${typeof v === "number" ? 0 : v}</span></div>`,
      )
      .join("") +
    (actionsHtml || "");
  statsEl.querySelectorAll(".stat-val[data-val]").forEach((el) => {
    // 只滚**纯数字**的行。以前用 parseInt(...) 是否 NaN 来判断，
    // 于是「22（守卫）」这种也被当成数字滚了一遍，滚完括号里的名字就没了
    // ——「最高单次伤害」那一行一直显示不出是谁打的。
    if (!/^[0-9]+$/.test(el.dataset.val)) return;
    const target = parseInt(el.dataset.val);
    let cur = 0;
    const step = Math.max(1, Math.floor(target / 30));
    const t = setInterval(() => {
      cur = Math.min(cur + step, target);
      el.textContent = cur;
      if (cur >= target) clearInterval(t);
    }, 30);
  });
}

// ── 战绩 ──────────────────────────────────────────────────
// 打完一局把结果记进本机战绩。**战绩不是核心玩法**：这里任何一步出问题
// 都只在控制台留一行，绝不能把结算界面带崩。
function commitBattleRecord(w) {
  try {
    // 「我」坐在哪一边由模式决定，不是自由填的（规则见 core/record.js 的审计）：
    // 人机 / 战役是 1 方；观战两边都是 AI；双人是同一台电脑上的两个人，
    // 说不清哪边算「我」，所以都不认领，只记谁赢了。
    const side = gameState.mode === "ai" ? 1 : null;
    return commitRecord(
      makeRecord({
        mode: gameState.mode,
        ruleset: "ink-v1",
        difficulty: gameState.mode === "pvp" ? null : aiLevelOf(2),
        scene: gameState.scene,
        rounds: gameState.round,
        winner: w,
        side,
        stage: null,
        stats: gameState.stats,
        units: [...gameState.p1Units, ...gameState.p2Units],
      }),
    );
  } catch (err) {
    console.warn("这一局没能记进战绩：", err);
    return null;
  }
}

function recordNoteHtml(rec) {
  return rec
    ? `<div class="result-record-note">
         <span>📜 已记入战绩</span>
         <button class="btn btn-sm btn-confirm" id="btn-result-share">📤 分享这一局</button>
         <button class="btn btn-sm" id="btn-result-records">查看战绩室</button>
       </div>`
    : `<div class="result-record-note is-fail">⚠ 这一局没能记进战绩（浏览器的本地存储写不进去）</div>`;
}

// renderStatsPanel 把 html 塞进 DOM 之后才能绑事件，所以拆成两步。
function bindRecordNote(rec) {
  if (!rec) return;
  const share = document.getElementById("btn-result-share");
  if (share)
    share.onclick = () => {
      playSfx("click");
      openShareDialog([rec], "这一局");
    };
  const go = document.getElementById("btn-result-records");
  if (go)
    go.onclick = () => {
      playSfx("click");
      _showScreen("screen-records");
    };
}

function showResult(w) {
  // 一局只结算一次。checkVictory() 有两个调用点（nextTurn 和「行动单位已阵亡」
  // 那条分支），胜负已定时**两边都会各排一个 battleDelay(showResult, 700)**。
  // 正常速度下第二次在玩家还没点按钮时就跑完了，看不出来；但玩家只要在 700ms 内
  // 点掉「继续剧情」，延迟的第二次就会把他从过场/通关界面拽回战斗结算界面。
  if (gameState.resultShown) return;
  gameState.resultShown = true;
  if (isExpedition()) {
    stopBattle();
    const settlement = _onExpeditionResult?.({
      winner: w,
      rounds: gameState.round,
      finalUnits: [...gameState.p1Units, ...gameState.p2Units],
    });
    const journey = gameState.expeditionRun || {};
    const total = Math.max(1, Number(settlement?.total) || 3);
    const completed = Math.max(
      0,
      Math.min(total, Number(settlement?.completed ?? journey.wins) || 0),
    );
    const current = Math.max(
      1,
      Math.min(
        total,
        Number(settlement?.current) || (Number(journey.battleIndex) || 0) + 1,
      ),
    );
    const phase = settlement?.phase || journey.phase;
    const rewardsRemaining = Math.max(
      0,
      Number(settlement?.rewardsRemaining ?? journey.rewardsRemaining) || 0,
    );
    let title;
    let description;
    let returnLabel;
    if (w === 1 && phase === "complete") {
      title = "墨路远征完整通关";
      description = `已完成 ${completed} / ${total} 关。三场战斗全部胜利；下一步：查看完整通关记录。`;
      returnLabel = "查看完整通关 →";
    } else if (w === 1 && phase === "reward") {
      title = `第 ${completed} 关胜利`;
      description = `已完成 ${completed} / ${total} 关。下一步：领取 ${rewardsRemaining} 件战后墨契，再到营地整备，前往第 ${Math.min(total, completed + 1)} 关。`;
      returnLabel = `领取第 ${completed} 关奖励 →`;
    } else if (w === 1 && phase === "camp") {
      title = `第 ${completed} 关胜利`;
      description = `已完成 ${completed} / ${total} 关。下一步：在营地选择整备方式，再前往第 ${Math.min(total, completed + 1)} 关。`;
      returnLabel = `前往第 ${completed} 关营地 →`;
    } else if (w === 1) {
      title = `第 ${Math.max(1, completed)} 关胜利`;
      description = `已完成 ${completed} / ${total} 关。下一步：返回墨路继续远征。`;
      returnLabel = "返回墨路继续 →";
    } else {
      title = `第 ${current} 关失利`;
      description = `已完成 ${completed} / ${total} 关。本次远征在第 ${current} 关结束；下一步：查看本次记录，或用同一种子重新启程。`;
      returnLabel = "查看本次远征总结 →";
    }
    _showScreen("screen-result");
    const actions = document.getElementById("result-actions");
    actions.style.display = "flex";
    actions.innerHTML = `<button class="btn btn-confirm" id="btn-expedition-return">${returnLabel}</button>`;
    document.getElementById("result-title").textContent = title;
    document.getElementById("result-title").style.color =
      w === 1 ? "#9bd9c4" : "#dba594";
    document.getElementById("result-desc").textContent = description;
    playSfx(w === 1 ? "victory" : "defeat");
    renderStatsPanel([]);
    document.getElementById("btn-expedition-return").onclick = () =>
      _returnExpedition?.();
    return;
  }
  // 记账放在最前面：中途关掉页面不该丢掉这一局。
  const rec = commitBattleRecord(w);
  Audio.stopBgm();
  _showScreen("screen-result");
  const actions = document.getElementById("result-actions");

  if (actions) {
    actions.style.display = "flex";
    // 同阵容再来一场。观战时最有用：同一套阵容反复打，才分得清
    // 差异来自难度还是来自运气。
    actions.innerHTML =
      `<button class="btn btn-confirm" id="btn-rematch">🔄 同阵容再来一场</button>` +
      `<button class="btn" id="btn-swap-rematch">交换阵容再战</button><button class="btn" onclick="showScreen('screen-duel')">调整阵容</button>`;
    document.getElementById("btn-rematch").onclick = rematch;
    document.getElementById("btn-swap-rematch").onclick = () => {
      [gameState.p1Picks, gameState.p2Picks] = [
        gameState.p2Picks,
        gameState.p1Picks,
      ];
      startBattle();
    };
  }
  document.getElementById("result-title").textContent =
    gameState.mode === "spectate"
      ? `${w === 1 ? "A 方" : "B 方"}获胜`
      : `玩家 ${w} 胜利！`;
  document.getElementById("result-title").style.color =
    w === 1 ? "#e94560" : "#16c79a";
  document.getElementById("result-desc").textContent =
    gameState.mode === "spectate"
      ? `A[${DIFF_LABEL[aiLevelOf(1)]}] vs B[${DIFF_LABEL[aiLevelOf(2)]}] — 同阵容可以直接再打一局对比`
      : w === 1
        ? "三笔成阵，胜负落定。"
        : "墨迹未干，试试另一种出手顺序。";
  // 观战模式没有「玩家」，两边都是 AI，胜负音效不该按输赢给
  const isPlayerWin =
    gameState.mode === "spectate"
      ? true
      : (gameState.mode === "ai" && w === 1) || gameState.mode === "pvp";
  playSfx(isPlayerWin ? "victory" : "defeat");
  renderStatsPanel(
    [
      ["玩家1 总伤害", gameState.stats.p1.dmg],
      ["玩家2 总伤害", gameState.stats.p2.dmg],
    ],
    recordNoteHtml(rec),
  );
  bindRecordNote(rec);
}

export function confirmExit() {
  const mask = openModal(
    "<h3>离开这场对弈？</h3><p>" +
      (isExpedition()
        ? "路线与战前伤势已保存，回来后本场从头开始。"
        : "当前对战不保存，阵容仍保留在备战页。") +
      '</p><div class="row"><button class="btn" id="cancel-exit">继续战斗</button><button class="btn btn-danger" id="ok-exit">离开战场</button></div>',
  );
  mask.querySelector("#cancel-exit").onclick = () => dismiss(mask);
  mask.querySelector("#ok-exit").onclick = () => {
    dismiss(mask);
    stopBattle();
    if (isExpedition()) _returnExpedition?.();
    else _showScreen("screen-title");
  };
}

export function previewDmg(u, s) {
  return calcPreviewDmg(
    u,
    previewInkSkill(gameState.inkTurn, u, s),
    gameState.scene,
  );
}

export function renderSkillPanel(u) {
  renderInkHud(endInkRound);
  const panel = document.getElementById("skill-panel");
  panel.replaceChildren();
  for (const [i, s] of u.skills.entries()) {
    const btn = document.createElement("button");
    btn.className = "skill-btn";
    btn.disabled = gameState.inkBusy || !canInkAct(gameState.inkTurn, u, s);
    const cost = inkActionCost(gameState.inkTurn, u, s),
      dmg = previewDmg(u, s),
      effect = previewInkSkill(gameState.inkTurn, u, s),
      crit = critSkillPresentation(
        u,
        effect,
        effect.type === "damageAll"
          ? getEnemies(u.player).filter((enemy) => enemy.alive).length
          : undefined,
      );
    btn.innerHTML =
      "<strong>" +
      s.icon +
      " " +
      s.name +
      '</strong><span class="ink-cost">' +
      cost +
      ' 墨</span><span class="skill-desc">' +
      s.desc +
      '</span><span class="skill-outcome' +
      (crit.triggersCrit ? " will-crit" : "") +
      '">' +
      (crit.triggersCrit ? crit.label + " · " : "") +
      (u.disrupted ? "扰乱：输出降低 · " : "") +
      (effect.outputMultiplier > 1
        ? "墨契 ×" + effect.outputMultiplier + " · "
        : "") +
      (dmg !== null
        ? "约 " + dmg + " 伤害"
        : s.hpCost
          ? "消耗 " + s.hpCost + " 生命"
          : "") +
      '</span><span class="key-hint">' +
      (i + 1) +
      "</span>";
    btn.onclick = () => {
      playSfx("click");
      _hideTooltip();
      onSkillClick(u, s);
    };
    panel.append(btn);
  }
}

function onSkillClick(u, s) {
  if (
    gameState.inkBusy ||
    u.player !== gameState.currentPlayer ||
    !canInkAct(gameState.inkTurn, u, s)
  )
    return;
  if (!canUseSkill(u, s)) return;
  // 还在「点人看技能」阶段：这一点就是提交。
  // 提交会跑回合开始流程（中毒 / buff / 回蓝），技能可用性可能因此变化，
  // 所以提交后要重新校验一次，别让玩家放出一个已经放不起的技能。
  if (gameState.pickingActor) {
    if (!beginTurnFor(u)) return;
    renderBattle();
    if (!canUseSkill(u, s)) {
      renderSkillPanel(u);
      return;
    }
  }
  const needsEnemy = needsEnemyTarget(s);
  const needsAlly = ["heal", "cleanse", "buff"].includes(s.type);
  const noTarget =
    !needsEnemy &&
    [
      "shield",
      "taunt",
      "dodge",
      "selfBuff",
      "revive",
      "damageAll",
      "corruptBurst",
      "plague",
      "healAll",
      "shieldAll",
      "buffAll",
    ].includes(s.type);
  if (noTarget) {
    executeSkill(u, s, null);
    return;
  }
  if (needsEnemy) {
    const taunter = getEnemies(u.player).find(
      (e) => e.alive && e.buffs.some((b) => b.type === "taunt"),
    );
    if (taunter) {
      addLog(`${taunter.name} 的嘲讽生效，必须攻击它`, "info");
      executeSkill(u, s, taunter);
      return;
    }
  }
  gameState.waitingForTarget = true;
  gameState.pendingSkill = s;
  gameState.pendingSkillFriendly = needsAlly;
  gameState.pendingActor = u;
  renderInkHud(endInkRound);
  const panel = document.getElementById("skill-panel");
  panel.innerHTML =
    '<div class="target-instruction"><div><strong>' +
    u.name +
    " · " +
    s.name +
    "</strong><p>" +
    s.desc +
    '。绿色边框是可选目标，取消不花墨。</p></div><button class="btn" id="btn-cancel-target">取消选招</button></div>';
  panel.querySelector("#btn-cancel-target").onclick = cancelTargeting;
  renderBattle();
}

export function onTargetClick(t) {
  if (!gameState.waitingForTarget) return;
  const valid = gameState.pendingSkillFriendly
    ? t.player === gameState.pendingActor.player
    : t.player !== gameState.pendingActor.player;
  if (!valid || !t.alive) return;
  gameState.waitingForTarget = false;
  const s = gameState.pendingSkill,
    a = gameState.pendingActor;
  gameState.pendingSkill = null;
  gameState.pendingActor = null;
  executeSkill(a, s, t);
}

export function cancelTargeting() {
  if (!gameState.waitingForTarget) return;
  // 要把技能面板还给「正在选目标的那个人」——pendingActor 就是他，
  // 所以得在清空之前先抓住。清了之后再去别处找，正是之前卡死的原因：
  // waitingForTarget 已经置 false（点角色不再有反应），面板却没重绘，
  // 玩家这一回合既点不了角色也点不了技能。
  const actor = gameState.pendingActor || getUnit(gameState.activeUnitId);
  gameState.waitingForTarget = false;
  gameState.pendingSkill = null;
  gameState.pendingActor = null;
  gameState.pickingActor = true;
  gameState.previewUnitId = actor?.id;
  if (actor) renderSkillPanel(actor);
  renderBattle();
}

function aiAct(u) {
  const chosen = inkChoice;
  if (!chosen || !canInkAct(gameState.inkTurn, u, chosen.skill)) {
    continueInkTurn();
    return;
  }
  executeSkill(u, chosen.skill, chosen.target);
}

function executeSkill(actor, skill, target) {
  if (gameState.inkBusy) return;
  const paid = commitInkAction(gameState.inkTurn, actor, skill);
  if (!paid) return;
  gameState.inkBusy = true;
  gameState.pickingActor = false;
  document.getElementById("skill-panel").innerHTML =
    '<span class="ink-resolving">' +
    actor.name +
    " · " +
    skill.name +
    "，墨迹正落…</span>";
  const entry = {
    round: gameState.round,
    side: actor.player,
    actor: actor.name,
    skill: skill.name,
    cost: paid.paidInk,
    target: target?.name || "全队",
    dmg: 0,
    heal: 0,
    kills: 0,
  };
  gameState.actionHistory.push(entry);
  addLog(
    actor.name +
      " 落笔「" +
      skill.name +
      "」 · " +
      paid.paidInk +
      " 墨 · 余 " +
      gameState.inkTurn.remaining +
      " 墨",
    "buff",
  );
  if (actor.disrupted)
    addLog(actor.name + " 受扰乱，伤害与治疗降低40%。", "stun");
  renderInkHud(endInkRound);
  animateStageUnit(actor.id, "attack", target?.id);
  showSkillCue(actor, paid);
  if (paid.sfx) playSfx(paid.sfx);
  const victim = target || getEnemies(actor.player).find((u) => u.alive);
  playSkillVfx(actor, victim, paid, () => {
    const events = resolveSkill(
      actor,
      paid,
      target,
      gameState.scene,
      gameState.p1Units,
      gameState.p2Units,
    );
    for (const c of Object.values(events.contributions)) {
      const u = getUnit(c.unitId);
      if (!u) continue;
      const unit = gameState.stats.units[u.id],
        side = gameState.stats["p" + u.player];
      for (const key of ["dmg", "heal", "kills"]) {
        unit[key] += c[key];
        side[key] += c[key];
      }
      if (c.maxHit > gameState.stats.maxHit.dmg)
        gameState.stats.maxHit = { dmg: c.maxHit, name: u.name };
      if (u.player === actor.player) {
        entry.dmg += c.dmg;
        entry.heal += c.heal;
        entry.kills += c.kills;
      }
    }
    for (const hit of events.damage) {
      const t = getUnit(hit.targetId),
        a = getUnit(hit.actorId);
      if (!t) continue;
      const crit = hit.result?.isCrit;
      addLog(
        a.name +
          " → " +
          t.name +
          "：" +
          hit.amount +
          " 伤害" +
          (crit ? " · 重击" : ""),
        crit ? "crit" : "dmg",
      );
      animateUnit(t.id, "anim-hit");
      spawnHitBurst(t);
      spawnFloatText(
        t,
        "−" + hit.amount,
        crit ? "#ffd54f" : "#f0a58f",
        crit ? 25 : 18,
      );
      if (hit.result?.shieldAbsorbed)
        spawnFloatText(t, "盾 −" + hit.result.shieldAbsorbed, "#90caf9", 12);
      if (hit.result?.undying) spawnFloatText(t, "不屈", "#ffd54f", 18);
    }
    for (const h of events.healing) {
      const t = getUnit(h.targetId);
      spawnHealColumn(t);
      spawnFloatText(t, "+" + h.amount, "#9bd9c4", 18);
      addLog(
        getUnit(h.actorId).name +
          " → " +
          t.name +
          "：恢复 " +
          h.amount +
          " 生命",
        "heal",
      );
    }
    for (const h of events.shields) {
      const t = getUnit(h.targetId);
      spawnHexShield(t);
      spawnFloatText(t, "盾 +" + h.amount, "#90caf9", 15);
    }
    for (const dead of events.deaths) {
      const u = getUnit(dead.id);
      addLog(u.name + " 倒下。", "death");
      cancelIntentOf(u, "因倒下");
      animateStageUnit(u.id, "dead");
      playSfx("death");
    }
    if (events.damage.length) {
      playSfx("hit");
      _screenShake(6, 150);
    }
    if (
      !events.damage.length &&
      !events.healing.length &&
      !events.shields.length
    )
      spawnAura(actor, "#d8c28c");
    renderBattle();
    battleDelay(afterAction, d(620));
  });
}
function afterAction() {
  if (pendingImpacts > 0) {
    battleDelay(afterAction, 30);
    return;
  }
  if (!checkVictory()) continueInkTurn();
}

const LOG_ICON = {
  dmg: "·",
  crit: "✦",
  heal: "＋",
  buff: "◆",
  death: "×",
  stun: "◇",
};
export function addLog(text, type = "info") {
  const log = document.getElementById("battle-log");
  const div = document.createElement("div");
  div.className = "log-entry log-" + type;
  if (type === "divider") {
    div.classList.add("log-divider");
    div.textContent = text;
  } else {
    const ts = new Date();
    const t = `${String(ts.getHours()).padStart(2, "0")}:${String(ts.getMinutes()).padStart(2, "0")}:${String(ts.getSeconds()).padStart(2, "0")}`;
    div.innerHTML = `<span class="log-time">[${t}]</span><span class="log-icon">${LOG_ICON[type] || "•"}</span>${text}`;
  }
  log.appendChild(div);
  if (!gameState.logPaused) log.scrollTop = log.scrollHeight;
  while (log.children.length > 200) log.removeChild(log.firstChild);
}
export function clearLog() {
  document.getElementById("battle-log").innerHTML = "";
}
export function toggleLogPause() {
  gameState.logPaused = !gameState.logPaused;
  document.getElementById("btn-log-pause").textContent = gameState.logPaused
    ? "恢复滚动"
    : "暂停滚动";
}
