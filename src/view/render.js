import { gameState, pct, getAllUnits, getUnit } from "../core/state.js";
import { portraitFor } from "../data/character-portraits.js";
import { syncBattle3D, animateStageUnit } from "./battle3d.js";
import { previewInkSkill } from "../core/ink-turn.js";
import { previewSkillOutcome } from "../core/skill-executor.js";
import { CRIT_METER_FULL } from "../core/combat.js";
let _getEffectiveAtk, _onTargetClick, _onPreviewUnit;
export function initRender(atk, target, preview) {
  _getEffectiveAtk = atk;
  _onTargetClick = target;
  _onPreviewUnit = preview;
}
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const acted = (u) =>
  u.player === gameState.currentPlayer &&
  gameState.inkTurn?.acted.includes(u.id);
const status = (u) =>
  !u.alive
    ? "已倒下"
    : acted(u)
      ? "本轮已出手"
      : u.player === gameState.currentPlayer
        ? "可落笔"
        : "等待回合";
function targetable(u) {
  return (
    gameState.waitingForTarget &&
    u.alive &&
    (gameState.pendingSkillFriendly
      ? u.player === gameState.pendingActor.player
      : u.player !== gameState.pendingActor.player)
  );
}
function pickable(u) {
  return (
    gameState.pickingActor &&
    u.alive &&
    u.player === gameState.currentPlayer &&
    !acted(u) &&
    !gameState.inkBusy
  );
}
function actOnUnit(u) {
  gameState.inspectedUnitId = u.id;
  if (targetable(u)) _onTargetClick(u);
  else if (pickable(u)) _onPreviewUnit(u);
  else {
    document.getElementById("battle-info").hidden = false;
    renderInspector();
  }
}
function previewTarget(u) {
  if (!targetable(u)) return "";
  const a = gameState.pendingActor,
    s = previewInkSkill(gameState.inkTurn, a, gameState.pendingSkill);
  try {
    const out = previewSkillOutcome(
      a,
      s,
      u,
      gameState.scene,
      gameState.p1Units,
      gameState.p2Units,
    ).units.find((v) => v.id === u.id);
    if (!out) return "";
    return out.killed
      ? "预计击倒"
      : out.hpDelta < 0
        ? "生命 −" +
          -out.hpDelta +
          (out.shieldDelta < 0 ? " / 盾 −" + -out.shieldDelta : "")
        : out.hpDelta > 0
          ? "生命 +" + out.hpDelta
          : out.shieldDelta < 0
            ? "护盾 −" + -out.shieldDelta
            : gameState.pendingSkill.type === "stun"
              ? u.interruptImmune
                ? "打断免疫"
                : "施加扰乱"
              : gameState.pendingSkill.type === "cleanse"
                ? "清除负面"
                : "施加效果";
  } catch {
    return "选择目标";
  }
}
function brief(u) {
  const bits = [];
  if (u.shield) bits.push("盾 " + u.shield);
  if (u.disrupted) bits.push("扰乱");
  const poison = u.debuffs
    .filter((x) => x.type === "poison")
    .reduce((n, x) => n + x.value, 0);
  if (poison) bits.push("毒 " + poison);
  const corrupt = u.debuffs
    .filter((x) => x.type === "corrupt")
    .reduce((n, x) => n + x.value, 0);
  if (corrupt) bits.push("蚀 " + corrupt);
  return bits.join(" · ") || status(u);
}
function renderUnit(u) {
  const el = document.createElement("button");
  el.id = "unit-" + u.id;
  el.type = "button";
  el.className =
    "battle-unit" +
    (!u.alive ? " dead" : "") +
    (acted(u) ? " ink-acted" : "") +
    (targetable(u) ? " target-select" : "") +
    (pickable(u) ? " pickable" : "") +
    (u.id === gameState.previewUnitId ? " previewing" : "") +
    (u.id === gameState.activeUnitId ? " active-turn" : "") +
    (u.hp / u.maxHp < 0.25 ? " low-hp" : "") +
    (gameState.enemyIntent?.targetId === u.id ? " intent-target" : "");
  el.setAttribute(
    "aria-label",
    (targetable(u) ? "选择目标" : pickable(u) ? "查看技能" : "查看情报") +
      "：玩家" +
      u.player +
      " " +
      u.name +
      "，HP " +
      u.hp +
      "/" +
      u.maxHp +
      "，" +
      status(u),
  );
  const tip = previewTarget(u);
  el.innerHTML =
    '<div class="unit-art has-portrait" id="art-' +
    u.id +
    '"><img class="unit-portrait" src="' +
    portraitFor(u.charId) +
    '" alt="" draggable="false"></div><div><div class="unit-name">' +
    esc(u.name) +
    "<small>" +
    (acted(u) ? "✓" : u.player === 1 ? "赤" : "青") +
    '</small></div><div class="bar-wrap"><div class="bar-fill" style="width:' +
    pct(u.hp, u.maxHp) +
    '%"></div></div><div class="unit-health">' +
    u.hp +
    "/" +
    u.maxHp +
    '</div><div class="unit-brief">' +
    esc(brief(u)) +
    "</div></div>" +
    (tip ? '<span class="target-preview">' + tip + "</span>" : "");
  el.onclick = () => actOnUnit(u);
  return el;
}
export function renderBattle() {
  for (const [index, id] of ["team-left", "team-right"].entries()) {
    const team = index === 0 ? gameState.p1Units : gameState.p2Units,
      el = document.getElementById(id);
    el.replaceChildren(...team.map(renderUnit));
    const vitals = document.getElementById("team-vitals-" + (index + 1));
    vitals.textContent =
      team.filter((u) => u.alive).length +
      "/4 · " +
      team.reduce((n, u) => n + u.hp, 0) +
      " HP";
  }
  const it = gameState.enemyIntent,
    actor = it && getUnit(it.unitId),
    target = it?.targetId && getUnit(it.targetId);
  document.getElementById("battle-intent").textContent = actor?.alive
    ? "敌方首招 · " +
      actor.name +
      "「" +
      it.skill.name +
      "」" +
      (target ? " → " + target.name : " → 全队")
    : "";
  renderFallback();
  syncBattle3D();
  renderInspector();
  const units = getAllUnits();
  document
    .querySelectorAll("#battle-3d .arena-name")
    .forEach((label, index) => {
      const u = units[index];
      if (!u) return;
      label.textContent = u.name + (acted(u) ? " ✓" : "");
      label.dataset.inkState = acted(u)
        ? "acted"
        : u.player === gameState.currentPlayer
          ? "ready"
          : "other";
      label.setAttribute(
        "aria-label",
        "模型：玩家" + u.player + " " + u.name + "，" + status(u),
      );
    });
}
function renderFallback() {
  let root = document.querySelector(".fallback-stage");
  if (!root) {
    root = document.createElement("div");
    root.className = "fallback-stage";
    document.querySelector(".battle-field").append(root);
  }
  root.replaceChildren();
  for (const u of getAllUnits()) {
    const b = document.createElement("button");
    b.className =
      "fallback-fighter" +
      (!u.alive ? " dead" : "") +
      (targetable(u) ? " target-select" : "");
    b.innerHTML =
      '<img src="' +
      portraitFor(u.charId) +
      '" alt="' +
      esc(u.name) +
      '"><span>' +
      esc(u.name) +
      "</span>";
    b.onclick = () => actOnUnit(u);
    root.append(b);
  }
}
export function renderInspector() {
  const panel = document.getElementById("unit-inspector");
  if (!panel) return;
  const u =
    getUnit(gameState.inspectedUnitId) ||
    getUnit(gameState.previewUnitId) ||
    getUnit(gameState.activeUnitId) ||
    gameState.p1Units[0];
  if (!u) return;
  panel.innerHTML =
    "<h4>" +
    esc(u.name) +
    " · " +
    status(u) +
    '</h4><div class="inspector-stats"><span>攻击 ' +
    Math.round(_getEffectiveAtk(u)) +
    "</span><span>防御 " +
    u.def +
    "</span><span>锋芒 " +
    (u.critMeter || 0) +
    "/" +
    CRIT_METER_FULL +
    "</span></div><p>生命 " +
    u.hp +
    "/" +
    u.maxHp +
    " · 每击锋芒 +" +
    u.crit +
    '</p><div class="unit-status">' +
    statusChips(u) +
    "</div><p><b>" +
    esc(u.passive?.name || "") +
    "</b> " +
    esc(u.passive?.desc || "") +
    "</p>";
}
function statusChips(u) {
  const list = [];
  // kind: 'good' = 对自己有利（绿），'bad' = 不利（红）。默认 bad。
  const add = (icon, text, tip, kind) =>
    list.push({ icon, text, tip, kind: kind || "bad" });

  if (u.shield > 0)
    add(
      "🛡",
      String(u.shield),
      `护盾 ${u.shield}：优先承受伤害，不受防御影响`,
      "good",
    );

  const corrupt = u.debuffs
    .filter((d) => d.type === "corrupt")
    .reduce((n, d) => n + d.value, 0);
  if (corrupt > 0)
    add(
      "🕳",
      `${corrupt}层`,
      `腐化 ${corrupt} 层：术士系每次攻击额外造成 层数×5 伤害；` +
        `「腐化爆发」会一次性消耗全部层数，每层 12 伤害（上限 5 层）`,
    );

  const poison = u.debuffs.filter((d) => d.type === "poison");
  if (poison.length) {
    const dmg = poison.reduce((n, d) => n + d.value, 0);
    const turns = Math.max(...poison.map((d) => d.dur));
    add(
      "☠",
      `${dmg}/回合·${turns}回`,
      `中毒：每回合开始损失 ${dmg} HP，还剩 ${turns} 回合。无视防御，可被「净化」清除`,
    );
  }

  const defDown = u.debuffs.find((d) => d.type === "defDown");
  if (defDown)
    add(
      "🛡",
      `↓${defDown.dur}回`,
      `破防：受到的伤害 +20%，还剩 ${defDown.dur} 回合`,
    );

  if (u.disrupted)
    add("◇", "扰乱", "下一次伤害和治疗降低40%，行动后解除；护盾与增益不受影响");
  // 打断的副作用，作用是防连锁：没有它，两个带打断的角色可以把对方锁住。
  if (u.interruptImmune > 0)
    add(
      "🚫",
      `打断免疫${u.interruptImmune}`,
      `打断免疫：刚被打断过的附送。接下来 ${u.interruptImmune} 个自己的回合内不会再被打断（防连锁）`,
      "good",
    );
  if (u.dodging) add("💨", "闪避", "闪避姿态：完全免疫下一次攻击", "good");
  if (u.undying)
    add(
      "💀",
      `不屈${u.undying}`,
      `不屈：下次致死时保留 ${u.undying} HP（一次性）`,
      "good",
    );

  const berserk = u.buffs.find((b) => b.type === "berserk");
  if (berserk)
    add(
      "🔥",
      `狂暴${berserk.dur}回`,
      `狂暴：攻击 +${Math.round(berserk.value * 100)}%，每回合自损 HP，还剩 ${berserk.dur} 回合`,
      "good",
    );

  const taunt = u.buffs.find((b) => b.type === "taunt");
  if (taunt)
    add(
      "🎯",
      `嘲讽${taunt.dur}回`,
      `嘲讽：敌人之后的决策会优先打它，还剩 ${taunt.dur} 回合——` +
        `但敌人「已经预告出来」的那一击不会改道`,
      "good",
    );

  const atkUp = u.buffs.filter((b) => b.type === "atkUp");
  if (atkUp.length) {
    const pctSum = Math.round(atkUp.reduce((n, b) => n + b.value, 0) * 100);
    const turns = Math.max(...atkUp.map((b) => b.dur));
    add(
      "⚔️",
      `+${pctSum}%·${turns}回`,
      `攻击强化 +${pctSum}%，还剩 ${turns} 回合` +
        (atkUp.length > 1 ? `（${atkUp.length} 层叠加）` : ""),
      "good",
    );
  }

  const focus = u.buffs.find((b) => b.type === "atkUp1");
  if (focus)
    add(
      "👁",
      `+${Math.round(focus.value * 100)}%`,
      `专注：「下一次」攻击 +${Math.round(focus.value * 100)}%，打完就消失`,
      "good",
    );

  // 按 kind 分组渲染，而不是靠调整上面 add 的先后顺序：
  // 顺序只能保证当下这一组状态不相邻，再加一个状态就又会挤到一起。
  const chip = (c) =>
    `<span class="stat-chip chip-${c.kind}" title="${c.tip.replace(/"/g, "&quot;")}">${c.icon}${c.text}</span>`;
  const good = list
    .filter((c) => c.kind === "good")
    .map(chip)
    .join("");
  const bad = list
    .filter((c) => c.kind === "bad")
    .map(chip)
    .join("");
  return good && bad
    ? `${good}<span class="chip-sep"></span>${bad}`
    : good + bad;
}

export function redrawUnit() {}
export function animateUnit(id, cls) {
  if (cls === "anim-hit") animateStageUnit(id, "hit");
  const el = document.getElementById("unit-" + id);
  if (!el) return;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), 500);
}
export function lungeActor() {}
