import { SCENES, CHARACTERS } from "../data/data.js";
import { gameState, getUnit, isAiSide } from "../core/state.js";
import { Audio, playSfx, toggleMute, syncMuteButton } from "../view/audio.js";
import {
  applySceneBackground,
  startMenuBackground,
  stopMenuBackground,
} from "../view/scene.js";
import { initRender, renderBattle, renderInspector } from "../view/render.js";
import { initCharacterGallery } from "../view/character-gallery.js";
import {
  openCodex,
  isModalOpen,
  closeTop,
  openModal,
  dismiss,
} from "../view/codex.js";
import { initRecordsScreen } from "../view/records.js";
import {
  initBattle,
  startBattle,
  stopBattle,
  getEffectiveAtk,
  onTargetClick,
  cancelTargeting,
  confirmExit,
  clearLog,
  toggleLogPause,
  onPreviewUnit,
  toggleSpectatePause,
  stepSpectate,
  cycleSpectateSpeed,
  endInkRound,
} from "./battle.js";
import {
  initPresentation,
  featuredCharacter,
  clearSkillCue,
} from "../view/presentation.js";
import { stopBattle3D } from "../view/battle3d.js";
import {
  initExpedition,
  openExpedition,
  finishExpeditionBattle,
  loadCurrentExpeditionSummary,
} from "./expedition.js";
import { PARTY_PRESETS, validateParty } from "../core/party.js";
import { renderPartyBuilder } from "../view/party-builder.js";
const $ = (id) => document.getElementById(id);
let currentScreen = "screen-title";
let draft = {
  mode: "ai",
  difficulty: "normal",
  scene: "void",
  teams: [PARTY_PRESETS[0].charIds.slice(), PARTY_PRESETS[1].charIds.slice()],
};
try {
  const saved = JSON.parse(localStorage.getItem("inkfight_duel_v1"));
  if (
    saved &&
    saved.teams?.length === 2 &&
    saved.teams.every((t) => validateParty(t).ok)
  )
    draft = { ...draft, ...saved };
} catch {}
let editingSide = 0;
export function showScreen(id) {
  if (!$(id)) id = "screen-title";
  if (
    id === "screen-duel" &&
    currentScreen === "screen-result" &&
    gameState.mode !== "expedition"
  ) {
    draft.teams = [gameState.p1Picks.slice(), gameState.p2Picks.slice()];
    draft.mode = gameState.mode;
    draft.difficulty = gameState.difficulty;
    draft.scene = gameState.scene.id;
    saveDraft();
  }
  if (id !== "screen-battle") {
    stopBattle3D();
    if (currentScreen === "screen-battle") Audio.startMenuBgm();
  }
  clearSkillCue();
  toggleBattleInfo(false, "log", false);
  document.querySelectorAll('[id^="screen-"]').forEach((el) => {
    const active = el.id === id;
    el.hidden = !active;
    el.inert = !active;
    el.classList.toggle("active", active);
    if (!active) el.scrollTop = 0;
  });
  document.body.dataset.screen = id;
  currentScreen = id;
  window.scrollTo(0, 0);
  if (id === "screen-battle") {
    stopMenuBackground();
    if (gameState.scene) applySceneBackground(gameState.scene);
  } else startMenuBackground();
  if (id === "screen-duel") renderDuel();
  if (id === "screen-archive") initCharacterGallery();
  if (id === "screen-records") initRecordsScreen();
  if (id === "screen-title") renderResume();
}
function renderResume() {
  const run = loadCurrentExpeditionSummary();
  $("home-resume").replaceChildren();
  if (run && !["complete", "failed"].includes(run.phase)) {
    const b = document.createElement("button");
    b.textContent =
      run.phase === "reward"
        ? "继续远征 · 领取第 " + run.wins + " 关奖励"
        : run.phase === "camp"
          ? "继续远征 · 第 " + run.wins + " 关后整备"
          : run.phase === "blessing"
            ? "继续远征 · 选择开局墨契"
            : "继续远征 · 第 " + ((run.battleIndex || 0) + 1) + " 关 / 3";
    b.onclick = () => openExpedition();
    $("home-resume").append(b);
  }
}
export function goHome() {
  if (currentScreen === "screen-battle" && !gameState.resultShown)
    confirmExit();
  else showScreen("screen-title");
}
export const showHelp = () => openCodex("economy");
export function openDuel() {
  showScreen("screen-duel");
}
function saveDraft() {
  try {
    localStorage.setItem("inkfight_duel_v1", JSON.stringify(draft));
  } catch {}
}
function updateDraft() {
  draft.mode = $("duel-mode").value;
  draft.difficulty = $("duel-difficulty").value;
  draft.scene = $("duel-scene").value;
  $("difficulty-label").hidden = draft.mode === "pvp";
  saveDraft();
}
function renderDuel() {
  $("duel-mode").value = ["ai", "pvp", "spectate"].includes(draft.mode)
    ? draft.mode
    : "ai";
  $("duel-difficulty").value = ["easy", "normal", "hard"].includes(
    draft.difficulty,
  )
    ? draft.difficulty
    : "normal";
  $("duel-scene").innerHTML = SCENES.map(
    (s) =>
      '<option value="' +
      s.id +
      '">' +
      s.name +
      " · " +
      s.buffText +
      "</option>",
  ).join("");
  $("duel-scene").value = draft.scene;
  updateDraft();
  renderDraftTeam();
}
function updateDraftSummary() {
  $("btn-duel-start").disabled = !draft.teams.every((t) => validateParty(t).ok);
  $("duel-summary").textContent =
    "赤方 " +
    draft.teams[0]
      .map((id) => CHARACTERS.find((c) => c.id === id)?.name)
      .join(" · ") +
    " / 青方 " +
    draft.teams[1]
      .map((id) => CHARACTERS.find((c) => c.id === id)?.name)
      .join(" · ");
}
function renderDraftTeam() {
  updateDraftSummary();
  $("edit-team-1").classList.toggle("selected", editingSide === 0);
  $("edit-team-2").classList.toggle("selected", editingSide === 1);
  $("duel-summary").textContent =
    "赤方 " +
    draft.teams[0]
      .map((id) => CHARACTERS.find((c) => c.id === id)?.name)
      .join(" · ") +
    " / 青方 " +
    draft.teams[1]
      .map((id) => CHARACTERS.find((c) => c.id === id)?.name)
      .join(" · ");
  renderPartyBuilder($("duel-party-builder"), {
    selected: draft.teams[editingSide],
    onChange(ids) {
      draft.teams[editingSide] = ids.slice();
      saveDraft();
      updateDraftSummary();
    },
  });
}
$("edit-team-1").onclick = () => {
  editingSide = 0;
  renderDraftTeam();
};
$("edit-team-2").onclick = () => {
  editingSide = 1;
  renderDraftTeam();
};
$("swap-teams").onclick = () => {
  draft.teams.reverse();
  saveDraft();
  renderDraftTeam();
};
for (const id of ["duel-mode", "duel-difficulty", "duel-scene"])
  $(id).onchange = updateDraft;
function launchDuel() {
  updateDraft();
  if (!draft.teams.every((t) => validateParty(t).ok)) return;
  Object.assign(gameState, {
    mode: draft.mode,
    difficulty: draft.difficulty,
    aiLevels: {
      1: draft.mode === "spectate" ? draft.difficulty : null,
      2: draft.mode === "pvp" ? null : draft.difficulty,
    },
    scene: SCENES.find((s) => s.id === draft.scene) || SCENES[0],
    p1Picks: draft.teams[0].slice(),
    p2Picks: draft.teams[1].slice(),
    inkRelics: [],
    expeditionRun: null,
  });
  startBattle();
}
$("btn-duel-start").onclick = launchDuel;
export function quickBattle() {
  const id = featuredCharacter();
  draft.mode = "ai";
  draft.teams[0] = [
    id,
    ...PARTY_PRESETS[0].charIds.filter((x) => x !== id),
  ].slice(0, 4);
  renderDuel();
  launchDuel();
}
export function toggleBattleInfo(force, tab = "log", moveFocus = true) {
  const show = typeof force === "boolean" ? force : $("battle-info").hidden;
  $("battle-info").hidden = !show;
  $("battle-info-backdrop").hidden = !show;
  if (show) {
    renderInspector();
    selectBattleInfoTab(tab);
    if (moveFocus) $("btn-close-battle-info").focus({ preventScroll: true });
  } else if (moveFocus && $("battle-info").contains(document.activeElement)) {
    $("btn-battle-info").focus({ preventScroll: true });
  }
  $("btn-battle-info").setAttribute("aria-expanded", String(show));
  $("btn-battle-info").textContent = show ? "收起记录" : "战斗记录";
}
function selectBattleInfoTab(tab) {
  const unit = tab === "unit";
  $("battle-unit-panel").hidden = !unit;
  $("battle-log-panel").hidden = unit;
  document.querySelectorAll("[data-info-tab]").forEach((button) => {
    button.setAttribute(
      "aria-selected",
      String(button.dataset.infoTab === tab),
    );
  });
}
document.querySelectorAll("[data-info-tab]").forEach((button) => {
  button.onclick = () => selectBattleInfoTab(button.dataset.infoTab);
});
let shakeTimer;
export function screenShake(intensity = 4, duration = 200) {
  if (document.body.classList.contains("reduced-motion")) return;
  clearTimeout(shakeTimer);
  $("shake-wrap").style.transform =
    "translateX(" + Math.min(3, intensity / 5) + "px)";
  shakeTimer = setTimeout(
    () => {
      $("shake-wrap").style.transform = "";
    },
    Math.min(90, duration),
  );
}
function hideTooltip() {
  $("tooltip").style.display = "none";
}
function showTooltip(html, x, y) {
  const tip = $("tooltip");
  tip.innerHTML = html;
  tip.style.display = "block";
  tip.style.left = Math.min(Math.max(8, x + 12), innerWidth - 320) + "px";
  tip.style.top = Math.min(y + 10, innerHeight - tip.offsetHeight - 12) + "px";
}
let reduced = false;
try {
  reduced = localStorage.getItem("inkfight_reduced_motion") === "1";
} catch {}
document.body.classList.toggle("reduced-motion", reduced);
export function openSettings() {
  const mask = openModal(
    '<h3>声音与画面</h3><label class="settings-row">减少动态效果<input id="motion-pref" type="checkbox" ' +
      (reduced ? "checked" : "") +
      '></label><label class="settings-row">音乐音量<input id="music-volume" type="range" min="0" max="1" step="0.05" value="' +
      (Audio.bgmGain?.gain.value ?? 0.35) +
      '"></label><label class="settings-row">音效音量<input id="sfx-volume" type="range" min="0" max="1" step="0.05" value="' +
      (Audio.sfxGain?.gain.value ?? 0.6) +
      '"></label><p style="margin-top:14px">3D 战场右上角可切换立绘、近景与全景。减少动态会关闭摇晃和技能立绘弹出，保留操作反馈。</p><div class="row"><button class="btn btn-confirm">保存并返回</button></div>',
  );
  mask.querySelector("#motion-pref").onchange = (e) => {
    reduced = e.target.checked;
    document.body.classList.toggle("reduced-motion", reduced);
    try {
      localStorage.setItem("inkfight_reduced_motion", reduced ? "1" : "0");
    } catch {}
  };
  mask.querySelector("#music-volume").oninput = (e) => {
    Audio.setBgmVol(+e.target.value);
    try {
      localStorage.setItem("inkfight_music_volume", e.target.value);
    } catch {}
  };
  mask.querySelector("#sfx-volume").oninput = (e) => {
    Audio.setSfxVol(+e.target.value);
    try {
      localStorage.setItem("inkfight_sfx_volume", e.target.value);
    } catch {}
  };
  mask.querySelector(".btn-confirm").onclick = () => dismiss(mask);
}
window.addEventListener("keydown", (e) => {
  if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if (isModalOpen()) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeTop();
    }
    return;
  }
  if (currentScreen !== "screen-battle") return;
  if (e.key === "Escape") {
    e.preventDefault();
    if (gameState.waitingForTarget) cancelTargeting();
    else if (!$("battle-info").hidden) toggleBattleInfo(false);
    else confirmExit();
    return;
  }
  if (gameState.mode === "spectate") {
    if (e.key === " ") {
      e.preventDefault();
      toggleSpectatePause();
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      stepSpectate();
    }
    return;
  }
  if (isAiSide(gameState.currentPlayer) || gameState.inkBusy) return;
  if (e.key.toLowerCase() === "e") {
    e.preventDefault();
    endInkRound();
    return;
  }
  if (/^[1-4]$/.test(e.key)) {
    const b = $("skill-panel").querySelectorAll(".skill-btn")[+e.key - 1];
    if (b && !b.disabled) b.click();
  }
});
document.addEventListener(
  "pointerdown",
  () => {
    Audio.init();
    try {
      const m = localStorage.getItem("inkfight_music_volume"),
        s = localStorage.getItem("inkfight_sfx_volume");
      if (m !== null) Audio.setBgmVol(+m);
      if (s !== null) Audio.setSfxVol(+s);
    } catch {}
    if (currentScreen === "screen-battle") Audio.startBgm(gameState.scene);
    else Audio.startMenuBgm();
  },
  { once: true },
);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) Audio.pauseForHidden();
  else Audio.resumeFromHidden();
});
initBattle(
  showScreen,
  hideTooltip,
  showTooltip,
  screenShake,
  finishExpeditionBattle,
  () => openExpedition(),
);
initExpedition({ showScreen, startBattle });
initRender(getEffectiveAtk, onTargetClick, onPreviewUnit, (tab) =>
  toggleBattleInfo(true, tab),
);
initPresentation();
showScreen("screen-title");
syncMuteButton();
Object.assign(window, {
  goHome,
  showScreen,
  quickBattle,
  openDuel,
  showHelp,
  openCodex,
  openSettings,
  playSfx,
  toggleMute,
  toggleBattleInfo,
  confirmExit,
  clearLog,
  toggleLogPause,
  toggleSpectatePause,
  stepSpectate,
  cycleSpectateSpeed,
});
