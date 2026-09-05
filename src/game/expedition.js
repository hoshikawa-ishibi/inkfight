import { SCENES } from "../data/data.js";
import { gameState } from "../core/state.js";
import {
  newExpedition,
  restoreExpedition,
  expeditionView,
  takeRelic,
  chooseRoute,
  launchEncounter,
  resolveEncounter,
  chooseCamp,
  expeditionProgress,
} from "../core/expedition.js";
import { PARTY_PRESETS, loadSavedParties } from "../core/party.js";
import { renderExpedition } from "../view/expedition-view.js";
import { playSfx } from "../view/audio.js";
import { openModal, dismiss } from "../view/codex.js";

const SAVE_KEY = "inkfight_expedition_v1",
  BEST_KEY = "inkfight_expedition_best_v1";
let run = null,
  best = { completed: 0, attempts: 0, titles: [] },
  showScreen,
  startBattle,
  landing = true,
  storageWarning = false,
  seedDraft = "";
function persist() {
  try {
    if (run) localStorage.setItem(SAVE_KEY, JSON.stringify(run));
    else localStorage.removeItem(SAVE_KEY);
    localStorage.setItem(BEST_KEY, JSON.stringify(best));
  } catch {
    storageWarning = true;
  }
}
function ongoing() {
  return !!run && !["complete", "failed"].includes(run.phase);
}
function render() {
  const root = document.getElementById("screen-expedition");
  let parties = PARTY_PRESETS;
  try {
    parties = [...PARTY_PRESETS, ...loadSavedParties()];
  } catch {}
  renderExpedition(
    root,
    expeditionView(run, {
      landing,
      best,
      hasSavedRun: ongoing(),
      parties,
      seedDraft,
    }),
    act,
  );
  window.scrollTo(0, 0);
  if (storageWarning) {
    const note = document.createElement("p");
    note.className = "expedition-storage-warning";
    note.textContent =
      "浏览器未能保存进度；请保持本页打开，关闭后本次旅程会丢失。";
    root.prepend(note);
  }
}
function confirmReplace(callback, abandoning = false) {
  const mask = openModal(
    abandoning
      ? '<h3>结束本次远征？</h3><p>将放弃当前旅程，已完成次数与称号会保留。</p><div class="row"><button class="btn btn-confirm">结束本次远征</button><button class="btn" data-cancel>继续旅程</button></div>'
      : '<h3>重写这条墨路？</h3><p>当前旅程会被新旅程替换，已完成次数会保留。</p><div class="row"><button class="btn btn-confirm">重写旅程</button><button class="btn" data-cancel>保留当前</button></div>',
  );
  mask.querySelector("[data-cancel]").onclick = () => dismiss(mask);
  mask.querySelector(".btn-confirm").onclick = () => {
    dismiss(mask);
    callback();
  };
}
export function initExpedition(options) {
  showScreen = options.showScreen;
  startBattle = options.startBattle;
  try {
    run = restoreExpedition(localStorage.getItem(SAVE_KEY));
    const saved = JSON.parse(localStorage.getItem(BEST_KEY) || "{}");
    best = {
      completed: Math.max(0, Math.floor(Number(saved.completed) || 0)),
      attempts: Math.max(0, Math.floor(Number(saved.attempts) || 0)),
      titles:
        Array.isArray(saved.titles) && saved.titles.includes("破阵归人")
          ? ["破阵归人"]
          : [],
    };
    if (
      run?.phase === "complete" &&
      run.activeRoute?.kind === "elite" &&
      !best.titles.length
    ) {
      best.titles.push("破阵归人");
      persist();
    }
  } catch {
    storageWarning = true;
  }
  document.getElementById("btn-expedition").onclick = () =>
    openExpedition(true);
}
export function openExpedition(asLanding = false) {
  playSfx("click");
  landing = asLanding || !run;
  showScreen("screen-expedition");
  render();
}

/** Read-only homepage summary; malformed or finished runs are not resumable. */
export function loadCurrentExpeditionSummary() {
  try {
    const saved = restoreExpedition(localStorage.getItem(SAVE_KEY));
    if (!saved || ["complete", "failed"].includes(saved.phase)) return null;
    return {
      phase: saved.phase,
      battleIndex: saved.battleIndex,
      wins: saved.wins,
      seed: saved.seed,
      partyId: saved.partyId || "",
      team: saved.team.map((item) => item.charId),
    };
  } catch {
    return null;
  }
}
function launch() {
  if (!run || !launchEncounter(run)) return;
  persist();
  const base =
    SCENES.find((s) => s.id === run.activeRoute.sceneId) || SCENES[0];
  const scene =
    base.buff === "teamRegen"
      ? { ...base, buff: null, buffText: "远征 · 灵泉澄明，无额外增益" }
      : base;
  Object.assign(gameState, {
    mode: "expedition",
    difficulty: "normal",
    aiLevels: { 1: null, 2: "normal" },
    scene,
    p1Picks: run.team.map((t) => t.charId),
    p2Picks: run.activeRoute.enemyIds,
    expeditionRun: run,
    inkRelics: [...run.relics],
    waitingForTarget: false,
    pendingActor: null,
    pendingSkill: null,
  });
  startBattle();
}
export function finishExpeditionBattle(result) {
  if (!run || !resolveEncounter(run, result)) return null;
  if (run.phase === "complete") {
    best.completed++;
    if (run.activeRoute?.kind === "elite" && !best.titles.includes("破阵归人"))
      best.titles.push("破阵归人");
  }
  persist();
  return { phase: run.phase, ...expeditionProgress(run) };
}
async function act(action, value) {
  playSfx("click");
  if (action === "home") {
    showScreen("screen-title");
    return;
  }
  if (action === "start") {
    const start = () => {
      run = newExpedition({
        partyId: value?.partyId,
        charIds: value?.charIds,
        seed: value?.seed || `墨-${Date.now().toString(36).toUpperCase()}`,
      });
      best.attempts++;
      seedDraft = "";
      landing = false;
      persist();
      render();
    };
    if (ongoing()) confirmReplace(start);
    else start();
    return;
  }
  if (action === "continue") {
    landing = false;
    render();
    return;
  }
  if (action === "new") {
    seedDraft = "";
    landing = true;
    render();
    return;
  }
  if (action === "retry-seed") {
    seedDraft = String(value || run?.seed || "").slice(0, 40);
    landing = true;
    render();
    return;
  }
  if (action === "abandon") {
    confirmReplace(() => {
      run = null;
      landing = true;
      persist();
      render();
    }, true);
    return;
  }
  if (action === "copy-seed") {
    try {
      await navigator.clipboard.writeText(run?.seed || "");
      const button = document.querySelector(
        '#screen-expedition [data-action="copy-seed"]',
      );
      if (button) button.textContent = "种子已复制";
    } catch {
      const button = document.querySelector(
        '#screen-expedition [data-action="copy-seed"]',
      );
      if (button) button.textContent = `种子：${run?.seed || ""}`;
    }
    return;
  }
  if (action === "launch") {
    launch();
    return;
  }
  if (!run) return;
  const changed =
    action === "relic"
      ? takeRelic(run, value)
      : action === "route"
        ? chooseRoute(run, value)
        : action === "camp"
          ? chooseCamp(run, value)
          : false;
  if (changed) {
    persist();
    render();
  }
}
