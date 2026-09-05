import { CHARACTERS } from "../data/data.js";
import { portraitFor } from "../data/character-portraits.js";
import {
  PARTY_PRESETS,
  loadSavedParties,
  removeSavedParty,
  saveParty,
  validateParty,
} from "../core/party.js";

const TABS = ["preset", "custom", "saved"];
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>'"]/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        char
      ],
  );
const list = (value) => (Array.isArray(value) ? value : []);
const characterFor = (id) =>
  CHARACTERS.find((character) => character.id === id);

function portrait(character, small = false) {
  const path = portraitFor(character?.id);
  if (path)
    return `<img class="party-builder-portrait${small ? " is-small" : ""}" src="${esc(path)}" alt="${esc(character?.name || "角色")}立绘" loading="lazy">`;
  return `<span class="party-builder-portrait party-builder-placeholder${small ? " is-small" : ""}" aria-hidden="true">${esc((character?.name || "?").slice(0, 1))}</span>`;
}

function presetCard(party, selected) {
  const ids = list(party.charIds);
  return `<button type="button" class="party-builder-preset${selected ? " is-selected" : ""}" data-party-action="preset" data-party-id="${esc(party.id)}" aria-pressed="${selected}">
    <span class="party-builder-preset-copy"><strong>${esc(party.name)}</strong><span>${esc(party.tag || "预设打法")}</span></span>
    <span class="party-builder-mini-portraits">${ids.map((id) => portrait(characterFor(id), true)).join("")}</span>
    <span class="party-builder-preset-mark" aria-hidden="true">${selected ? "✓" : ""}</span>
  </button>`;
}

function characterCard(character, selected, locked) {
  return `<button type="button" class="party-builder-character${selected ? " is-selected" : ""}" data-party-action="toggle" data-character-id="${esc(character.id)}" aria-pressed="${selected}" ${locked ? "disabled" : ""} aria-label="${selected ? "移除" : "选择"}${esc(character.name)}">
    ${portrait(character)}<span class="party-builder-character-copy"><strong>${esc(character.name)}</strong><span>${esc(character.role || "同行者")}</span></span><span class="party-builder-check" aria-hidden="true">${selected ? "✓" : ""}</span>
  </button>`;
}

function savedCard(party) {
  return `<li class="party-builder-saved-item"><div class="party-builder-saved-copy"><strong>${esc(party.name)}</strong><span>${esc(party.tag || "自定义阵容")}</span></div><span class="party-builder-mini-portraits">${party.charIds.map((id) => portrait(characterFor(id), true)).join("")}</span><span class="party-builder-saved-actions"><button type="button" data-party-action="load" data-party-id="${esc(party.id)}">载入</button><button type="button" data-party-action="remove" data-party-id="${esc(party.id)}" aria-label="删除阵容 ${esc(party.name)}">删除</button></span></li>`;
}

function getPresetParties(root) {
  const savedIds = new Set(loadSavedParties().map((party) => party.id));
  const base = [
    ...PARTY_PRESETS,
    ...(Array.isArray(root?.__partyParties)
      ? root.__partyParties.filter((party) => !savedIds.has(party?.id))
      : []),
  ];
  const seen = new Set();
  return base.filter((party) => {
    if (!party || seen.has(party.id)) return false;
    seen.add(party.id);
    return true;
  });
}

function emit(root, ids) {
  root.__partySelected = [...ids];
  const result = validateParty(root.__partySelected);
  root.__partyOnChange?.(
    result.ok ? result.charIds : [...root.__partySelected],
  );
}

function rememberFocus(root) {
  const active = document.activeElement;
  if (!active || !root.contains(active)) return null;
  if (active.matches("[data-party-name]"))
    return {
      kind: "name",
      start: active.selectionStart,
      end: active.selectionEnd,
    };
  return {
    kind: "action",
    action: active.dataset.partyAction,
    partyId: active.dataset.partyId,
    characterId: active.dataset.characterId,
    tab: active.dataset.partyTab,
  };
}

function restoreFocus(root, saved) {
  if (!saved) return;
  if (saved.kind === "name") {
    const input = root.querySelector("[data-party-name]");
    input?.focus();
    if (input && saved.start !== null)
      input.setSelectionRange(saved.start, saved.end ?? saved.start);
    return;
  }
  const match = [...root.querySelectorAll("[data-party-action]")].find(
    (button) =>
      button.dataset.partyAction === saved.action &&
      button.dataset.partyId === saved.partyId &&
      button.dataset.characterId === saved.characterId &&
      button.dataset.partyTab === saved.tab,
  );
  (
    match || root.querySelector('[data-party-tab][aria-selected="true"]')
  )?.focus();
}

function setTab(root, requested, focus = false) {
  const tab = TABS.includes(requested) ? requested : "preset";
  root.__partyTab = tab;
  root.querySelectorAll("[data-party-tab]").forEach((button) => {
    const active = button.dataset.partyTab === tab;
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
    if (active && focus) button.focus();
  });
  root.querySelectorAll("[data-party-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.partyPanel !== tab;
  });
  const save = root.querySelector("[data-party-save]");
  if (save) save.hidden = tab === "preset";
}

function render(root, compact = false) {
  const focus = rememberFocus(root);
  const currentInput = root.querySelector("[data-party-name]")?.value;
  if (currentInput !== undefined) root.__partyDraftName = currentInput;
  const nameId = (root.id || "party") + "-name";
  const tabBase = (root.id || "party") + "-party";
  const selected = list(root.__partySelected);
  const selectedSet = new Set(selected);
  const presets = getPresetParties(root);
  const activePreset = presets.find(
    (party) =>
      selected.length === 4 &&
      party.charIds.length === selectedSet.size &&
      party.charIds.every((id) => selectedSet.has(id)),
  );
  const remaining = Math.max(0, 4 - selected.length);
  const saved = loadSavedParties();
  const draftName = root.__partyDraftName || "";
  root.innerHTML = `<div class="party-builder${compact ? " party-builder-compact" : ""}">
    <header class="party-builder-toolbar">
      <nav class="party-builder-tabs" role="tablist" aria-label="编队方式">
        <button id="${tabBase}-preset-tab" type="button" role="tab" data-party-action="tab" data-party-tab="preset" aria-controls="${tabBase}-preset">预设 <small>${presets.length}</small></button>
        <button id="${tabBase}-custom-tab" type="button" role="tab" data-party-action="tab" data-party-tab="custom" aria-controls="${tabBase}-custom">自由编队</button>
        <button id="${tabBase}-saved-tab" type="button" role="tab" data-party-action="tab" data-party-tab="saved" aria-controls="${tabBase}-saved">已保存 <small>${saved.length}</small></button>
      </nav>
      <span class="party-builder-count${remaining === 0 ? " is-ready" : ""}" aria-live="polite"><b>${selected.length}</b>/4</span>
    </header>
    <div class="party-builder-panels">
      <section id="${tabBase}-preset" class="party-builder-panel party-builder-preset-panel" role="tabpanel" aria-labelledby="${tabBase}-preset-tab" data-party-panel="preset">
        <div class="party-builder-selection-note"><strong>${esc(activePreset?.name || "选择一套预设")}</strong><span>${esc(activePreset?.description || "短卡展示阵容打法；选中后，这里显示完整说明。")}</span></div>
        <div class="party-builder-presets" role="list" aria-label="预设阵容">${presets.map((party) => presetCard(party, activePreset?.id === party.id)).join("")}</div>
      </section>
      <section id="${tabBase}-custom" class="party-builder-panel party-builder-custom-panel" role="tabpanel" aria-labelledby="${tabBase}-custom-tab" data-party-panel="custom" hidden>
        <div class="party-builder-panel-line"><strong>自由编队</strong><span>${remaining ? `再选 ${remaining} 人` : "四人已齐，可点击替换"}</span></div>
        <div class="party-builder-roster" role="list" aria-label="角色列表">${CHARACTERS.map((character) => characterCard(character, selectedSet.has(character.id), selected.length >= 4 && !selectedSet.has(character.id))).join("")}</div>
      </section>
      <section id="${tabBase}-saved" class="party-builder-panel party-builder-saved-panel" role="tabpanel" aria-labelledby="${tabBase}-saved-tab" data-party-panel="saved" hidden>
        ${saved.length ? `<ul class="party-builder-saved-list">${saved.map(savedCard).join("")}</ul>` : '<p class="party-builder-empty">还没有保存的阵容。先选满四人并在下方命名保存。</p>'}
      </section>
    </div>
    <div class="party-builder-save" data-party-save hidden><label for="${nameId}">阵容名</label><input id="${nameId}" data-party-name value="${esc(draftName)}" type="text" maxlength="24" placeholder="例如：我的三笔阵" autocomplete="off"><button type="button" class="party-builder-save-button" data-party-action="save" ${selected.length === 4 ? "" : "disabled"}>保存</button><small data-party-message aria-live="polite">${esc(root.__partyMessage || (remaining ? `还需选择 ${remaining} 人` : "可保存当前四人"))}</small></div>
  </div>`;
  setTab(root, root.__partyTab || "preset");
  restoreFocus(root, focus);
}

function bindDelegation(root) {
  if (root.__partyDelegated) return;
  root.__partyDelegated = true;
  root.addEventListener("input", (event) => {
    if (event.target.matches("[data-party-name]"))
      root.__partyDraftName = event.target.value;
  });
  root.addEventListener("keydown", (event) => {
    const tab = event.target.closest("[data-party-tab]");
    if (!tab || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
      return;
    event.preventDefault();
    const current = TABS.indexOf(tab.dataset.partyTab);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? TABS.length - 1
          : (current + (event.key === "ArrowRight" ? 1 : -1) + TABS.length) %
            TABS.length;
    setTab(root, TABS[next], true);
  });
  root.addEventListener("click", (event) => {
    const target = event.target.closest("[data-party-action]");
    if (!target || !root.contains(target) || target.disabled) return;
    const action = target.dataset.partyAction;
    if (action === "tab") {
      setTab(root, target.dataset.partyTab);
      return;
    }
    if (action === "toggle") {
      const id = target.dataset.characterId;
      const ids = list(root.__partySelected);
      const next = ids.includes(id)
        ? ids.filter((item) => item !== id)
        : ids.length < 4
          ? [...ids, id]
          : ids;
      emit(root, next);
      render(root, root.__partyCompact);
      return;
    }
    if (action === "preset") {
      const party = getPresetParties(root).find(
        (item) => item.id === target.dataset.partyId,
      );
      if (party) {
        emit(root, party.charIds);
        render(root, root.__partyCompact);
      }
      return;
    }
    if (action === "load") {
      const party = loadSavedParties().find(
        (item) => item.id === target.dataset.partyId,
      );
      if (party) {
        emit(root, party.charIds);
        render(root, root.__partyCompact);
      }
      return;
    }
    if (action === "remove") {
      removeSavedParty(target.dataset.partyId);
      render(root, root.__partyCompact);
      return;
    }
    if (action === "save") {
      const result = saveParty({
        name: root.querySelector("[data-party-name]")?.value,
        charIds: root.__partySelected,
      });
      root.__partyMessage = result.ok
        ? `已保存「${result.party.name}」。`
        : result.error || "暂时无法保存阵容。";
      if (result.ok) render(root, root.__partyCompact);
      else {
        const message = root.querySelector("[data-party-message]");
        if (message) message.textContent = root.__partyMessage;
      }
    }
  });
}

/**
 * Render the shared four-person formation picker. The component owns only its
 * temporary selection and browser saved formations; the caller owns the run.
 */
export function renderPartyBuilder(
  root,
  { selected = [], onChange = () => {}, compact = false, parties = null } = {},
) {
  if (!root) return root;
  root.__partySelected = list(selected).slice(0, 4);
  root.__partyOnChange = onChange;
  root.__partyCompact = compact;
  root.__partyParties =
    Array.isArray(parties) && parties.length ? parties : null;
  bindDelegation(root);
  render(root, compact);
  return root;
}
