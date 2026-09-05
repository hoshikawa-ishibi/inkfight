import { gameState } from "../core/state.js";
import { getPresentationMode, setPresentationMode } from "../game/save.js";

let arena = null,
  loading = null,
  enabled = getPresentationMode() !== "2d";
const active = () =>
  document.getElementById("screen-battle")?.classList.contains("active");
function shell() {
  let viewport = document.getElementById("battle-3d");
  if (!viewport) {
    const field = document.querySelector(".battle-field");
    const toolbar = document.createElement("details");
    toolbar.className = "battle-view-tools";
    toolbar.innerHTML =
      '<summary>视角</summary><div class="battle-view-options"><span id="battle-view-status">立体战场</span><button type="button" id="btn-view-3d">3D 战场</button><button type="button" id="btn-view-2d">立绘战场</button><button type="button" id="btn-camera-toggle">近景</button><button type="button" id="btn-camera-reset">视角归位</button><small>拖动旋转 · 滚轮缩放</small></div>';
    // Keep the toolbar inside the battlefield so it can overlay the canvas;
    // inserting it before the field creates an extra grid row in the desktop layout.
    field.append(toolbar);
    viewport = document.createElement("div");
    viewport.id = "battle-3d";
    viewport.hidden = true;
    viewport.innerHTML = '<svg class="arena-intent" aria-hidden="true"></svg>';
    field.prepend(viewport);
    document.getElementById("btn-view-3d").onclick = () => choose(true);
    document.getElementById("btn-view-2d").onclick = () => choose(false);
    document.getElementById("btn-camera-reset").onclick = () =>
      arena?.resetCamera();
    document.getElementById("btn-camera-toggle").onclick = () => {
      const mode = arena?.toggleCamera();
      document.getElementById("btn-camera-toggle").textContent =
        mode === "close" ? "全景" : "近景";
    };
  }
  return viewport;
}
function choose(on) {
  enabled = on;
  setPresentationMode(on ? "3d" : "2d");
  syncBattle3D();
}
export function stopBattle3D() {
  arena?.stop();
}
export function syncBattle3D() {
  if (!active()) return;
  const viewport = shell();
  document
    .getElementById("btn-view-3d")
    .setAttribute("aria-pressed", String(enabled));
  document
    .getElementById("btn-view-2d")
    .setAttribute("aria-pressed", String(!enabled));
  if (!enabled) {
    arena?.stop();
    viewport.hidden = true;
    document.getElementById("screen-battle").classList.remove("stage3d-mode");
    document.getElementById("battle-view-status").textContent = "立绘战场";
    return;
  }
  if (!arena) {
    if (loading) return;
    document.getElementById("battle-view-status").textContent =
      "正在准备 3D 战场…";
    loading = import("./arena3d.js")
      .then(({ ArenaScene }) => {
        if (!enabled || !active()) return;
        viewport.hidden = false;
        arena = new ArenaScene(viewport, {
          onSelect: (id) => document.getElementById("unit-" + id)?.click(),
        });
        arena.onContextLost = () => fallback("3D 画面暂不可用，已切回立绘");
        syncBattle3D();
      })
      .catch((err) => {
        console.warn("3D renderer unavailable:", err.message);
        fallback("设备未能启用 3D，已切回立绘");
      })
      .finally(() => {
        loading = null;
      });
    return;
  }
  viewport.hidden = false;
  document.getElementById("screen-battle").classList.add("stage3d-mode");
  document.getElementById("battle-view-status").textContent =
    "立体战场 · 实时光影";
  arena.setState(gameState);
  arena.resize();
  arena.start();
}
function fallback(message) {
  enabled = false;
  arena?.dispose();
  arena = null;
  document.getElementById("screen-battle").classList.remove("stage3d-mode");
  const viewport = shell();
  viewport.hidden = true;
  document.getElementById("battle-view-status").textContent = message;
  document.getElementById("btn-view-3d").setAttribute("aria-pressed", "false");
  document.getElementById("btn-view-2d").setAttribute("aria-pressed", "true");
}
export function stageAnchor(id) {
  return enabled && arena && active() ? arena.anchor(id) : null;
}
export function animateStageUnit(id, kind, targetId) {
  if (enabled && active()) arena?.animateUnit(id, kind, targetId);
}
