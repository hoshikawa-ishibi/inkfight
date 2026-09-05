import { gameState, isAiSide, getAllies } from "../core/state.js";
import { INK_RULES } from "../core/ink-turn.js";
export function renderInkHud(onEndTurn = () => {}) {
  const panel = document.getElementById("ink-hud");
  if (!panel) return;
  const t = gameState.inkTurn,
    disabled =
      !t ||
      t.ended ||
      gameState.inkBusy ||
      gameState.waitingForTarget ||
      gameState.resultShown ||
      isAiSide(gameState.currentPlayer);
  const left = t?.remaining ?? 0,
    total = t?.total ?? 3;
  const shield = Math.min(
    left * INK_RULES.shieldPerInk * (t?.relics.includes("reserve") ? 2 : 1),
    INK_RULES.maxEndShieldPerUnit,
  );
  const chain = t?.chain || [];
  panel.innerHTML =
    '<div class="ink-resource"><b>' +
    left +
    "</b><span>/ " +
    total +
    ' 墨</span><div class="ink-drops">' +
    Array.from(
      { length: total },
      (_, i) =>
        '<i class="ink-drop' + (i < left ? " is-filled" : "") + '"></i>',
    ).join("") +
    '</div><span class="ink-side-name">' +
    (gameState.currentPlayer === 1 ? "赤方" : "青方") +
    '共享</span></div><div class="ink-chain">' +
    (chain.length
      ? chain
          .map(
            (a, i) =>
              '<span title="' +
              a.skillName +
              " · " +
              a.cost +
              '墨">' +
              (i + 1) +
              ". " +
              a.actorName +
              "</span>",
          )
          .join("")
      : '<span class="empty-chain">每人一次 · 选择你的落笔顺序</span>') +
    "</div>" +
    (t?.relics.includes("flow") && chain.length === 2
      ? '<b class="ink-resonance">第三笔 ×1.5</b>'
      : "") +
    '<button id="btn-ink-end-turn" class="ink-hud-end-turn" ' +
    (disabled ? "disabled" : "") +
    ' aria-label="收笔，余墨化盾">收笔 · 全队各 +' +
    shield +
    " 盾</button>";
  panel.querySelector("button").onclick = onEndTurn;
  const feedback = document.getElementById("battle-feedback");
  if (feedback)
    feedback.textContent = gameState.waitingForTarget
      ? "绿色边框是合法目标 · 点选前可看生命与护盾变化"
      : gameState.inkBusy
        ? "正在落笔…"
        : isAiSide(gameState.currentPlayer)
          ? "对手正在构思连携"
          : chain.length
            ? "还剩 " + left + " 墨 · 换一位未行动的队友接笔，或收笔化盾"
            : "点击人物或立绘，选择第一笔";
  return panel;
}
