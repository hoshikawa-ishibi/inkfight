import { gameState, getUnit, isAiSide } from '../core/state.js';
import { INK_RULES } from '../core/ink-turn.js';
import { RELICS } from '../core/expedition.js';
import { INTERRUPT_OUTPUT_MULTIPLIER } from '../core/combat.js';

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function numberOrDash(value) {
  return Number.isFinite(Number(value)) ? String(Number(value)) : '—';
}

function currentSideName(player) {
  return player === 1 ? '你的墨阵' : '敌方墨阵';
}

function dropsMarkup(turn) {
  const total = Number(turn?.total);
  const remaining = Number(turn?.remaining);
  if (!Number.isFinite(total) || total <= 0) return '<span class="ink-drop-empty" aria-hidden="true">墨滴未显形</span>';
  const count = Math.min(12, Math.max(1, Math.round(total)));
  const filled = Math.max(0, Math.min(count, Number.isFinite(remaining) ? Math.round(remaining) : 0));
  return Array.from({ length: count }, (_, index) => `<span class="ink-drop${index < filled ? ' is-filled' : ''}" aria-hidden="true"></span>`).join('');
}

function actedNames(turn) {
  const ids = asArray(turn?.acted);
  return ids.map(id => getUnit(id)?.name || String(id)).filter(Boolean);
}

function helpText() {
  return `每人每轮一次，技能花费1–3墨。每点余墨为全队各增加${INK_RULES.shieldPerInk}护盾，单次上限${INK_RULES.maxEndShieldPerUnit}。敌方预告仅锁定第一招，后续会应变。未免疫的目标必定受到灵能扰乱，下一次伤害和治疗降低${Math.round((1-INTERRUPT_OUTPUT_MULTIPLIER)*100)}%；护盾与增益不受影响。`;
}

function ensureHud() {
  let panel = document.getElementById('ink-hud');
  if (panel) return panel;
  const skillPanel = document.getElementById('skill-panel');
  if (!skillPanel) return null;
  panel = document.createElement('section');
  panel.id = 'ink-hud';
  panel.className = 'ink-hud';
  panel.setAttribute('aria-label', '本轮墨状态');
  skillPanel.parentNode.insertBefore(panel, skillPanel);
  panel.addEventListener('click', event => {
    const button = event.target.closest('[data-ink-action="end-turn"]');
    if (!button || button.disabled) return;
    panel.__inkOnEndTurn?.();
  });
  return panel;
}

/**
 * Render the shared ink resource for expedition mode. The battle parent owns
 * turn transitions; this function only creates/updates the HUD and calls the
 * supplied callback when the player presses the end-of-turn button.
 */
export function renderInkHud(onEndTurn = () => {}) {
  const panel = ensureHud();
  if (!panel) return null;
  panel.__inkOnEndTurn = onEndTurn;

  const expedition = gameState.mode === 'expedition';
  panel.hidden = !expedition;
  panel.setAttribute('aria-hidden', String(!expedition));
  if (!expedition) {
    panel.replaceChildren();
    return panel;
  }

  const turn = gameState.inkTurn;
  const acted = asArray(turn?.acted);
  const names = actedNames(turn);
  const player = gameState.currentPlayer;
  const hasTurn = !!turn && !turn.ended;
  const disabled = isAiSide(player) || !!gameState.inkBusy || !!gameState.waitingForTarget
    || !!gameState.resultShown || !hasTurn;
  const currentLabel = currentSideName(player);
  const actedLabel = names.length ? names.join('、') : '尚未落笔';
  const helpWasOpen = panel.querySelector('.ink-hud-help')?.open;
  const flowReady=hasTurn&&turn.relics.includes('flow')&&turn.chain.length===2&&!gameState.inkBusy;
  const resonance=flowReady?`第三笔 · 三叠浪共鸣：伤害与治疗 +${Math.round((INK_RULES.flowMultiplier-1)*100)}%`:'';

  panel.innerHTML = `<div class="ink-hud-main">
    <div class="ink-hud-resource"><span class="ink-hud-overline">SHARED INK</span><div class="ink-hud-resource-line"><strong><span class="ink-hud-number">${esc(numberOrDash(turn?.remaining))}</span><span class="ink-hud-slash">/</span>${esc(numberOrDash(turn?.total))}</strong><span class="ink-hud-label">全队墨滴</span></div><div class="ink-hud-drops" aria-label="剩余 ${esc(numberOrDash(turn?.remaining))}，总计 ${esc(numberOrDash(turn?.total))} 墨滴">${dropsMarkup(turn)}</div></div>
    <div class="ink-hud-turn"><span class="ink-hud-overline">CURRENT SIDE</span><strong>${esc(currentLabel)}</strong><span class="ink-hud-turn-state">${turn?.ended ? '本轮已收笔' : gameState.inkBusy ? '墨迹处理中' : gameState.waitingForTarget ? '等待目标' : '可继续连携'}</span></div>
    <div class="ink-hud-acted"><span class="ink-hud-overline">STROKES LANDED</span><strong><span class="ink-hud-number">${esc(acted.length)}</span> 笔已落</strong><span class="ink-hud-acted-names">${esc(actedLabel)}</span></div>
    <button id="btn-ink-end-turn" class="ink-hud-end-turn" type="button" data-ink-action="end-turn" ${disabled ? 'disabled' : ''} aria-label="收笔，余墨化盾">收笔 <span>·</span> 余墨化盾 <span class="ink-hud-arrow" aria-hidden="true">↗</span></button>
  </div><div class="ink-build">${(gameState.inkRelics||[]).map(id=>RELICS.find(r=>r.id===id)).filter(Boolean).map(r=>`<span title="${esc(r.description)}">${esc(r.glyph)} ${esc(r.name)}</span>`).join('')}${resonance?`<strong class="ink-resonance">${esc(resonance)}</strong>`:''}</div><details class="ink-hud-help"><summary aria-label="展开墨路规则说明">本轮怎么落笔？</summary><p>${esc(helpText())}</p></details>`;
  if(helpWasOpen) panel.querySelector('.ink-hud-help').open=true;
  return panel;
}
