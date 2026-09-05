import { CHARACTERS } from "../data/data.js";
import { portraitFor } from "../data/character-portraits.js";
import {
  PARTY_PRESETS,
  loadSavedParties,
  removeSavedParty,
  saveParty,
  validateParty,
} from "../core/party.js";

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
    <span class="party-builder-preset-top"><span class="party-builder-preset-tag">${esc(party.tag || "预设阵容")}</span><span class="party-builder-preset-mark" aria-hidden="true">${selected ? "✓" : "＋"}</span></span>
    <strong>${esc(party.name)}</strong><span class="party-builder-preset-description">${esc(party.description)}</span>
    <span class="party-builder-preset-tags">${list(party.tags)
      .slice(0, 3)
      .map((tag) => `<span>${esc(tag)}</span>`)
      .join("")}</span>
    <span class="party-builder-mini-portraits">${ids.map((id) => portrait(characterFor(id), true)).join("")}</span>
  </button>`;
}

function characterCard(character, selected, locked) {
  return `<button type="button" class="party-builder-character${selected ? " is-selected" : ""}" data-party-action="toggle" data-character-id="${esc(character.id)}" aria-pressed="${selected}" ${locked ? "disabled" : ""} aria-label="${selected ? "移除" : "选择"}${esc(character.name)}">
    ${portrait(character)}<span class="party-builder-character-copy"><strong>${esc(character.name)}</strong><span>${esc(character.role || "同行者")}</span></span><span class="party-builder-check" aria-hidden="true">${selected ? "✓" : ""}</span>
  </button>`;
}

function savedCard(party) {
  return `<li class="party-builder-saved-item"><div><strong>${esc(party.name)}</strong><span>${esc(party.tag || "自定义阵容")} · ${party.charIds.map((id) => esc(characterFor(id)?.name || id)).join(" · ")}</span></div><span class="party-builder-saved-actions"><button type="button" data-party-action="load" data-party-id="${esc(party.id)}">载入</button><button type="button" data-party-action="remove" data-party-id="${esc(party.id)}" aria-label="删除阵容 ${esc(party.name)}">删除</button></span></li>`;
}

function getParties(root) {
  const base = [
    ...PARTY_PRESETS,
    ...(Array.isArray(root?.__partyParties) ? root.__partyParties : []),
  ];
  const seen = new Set();
  return [...base, ...loadSavedParties()].filter((party) => {
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

function render(root, compact = false) {
  const drawerOpen =
    root.querySelector(".party-builder-roster-drawer")?.open ?? compact;
  const savedName = root.querySelector("[data-party-name]")?.value || "";
  const presetScroll =
    root.querySelector(".party-builder-presets")?.scrollLeft || 0;
  const nameId = (root.id || "party") + "-name";
  const selected = list(root.__partySelected);
  const selectedSet = new Set(selected);
  const parties = getParties(root);
  const activePreset = parties.find(
    (party) =>
      selected.length === 4 &&
      party.charIds.every((id) => selectedSet.has(id)) &&
      party.charIds.length === selectedSet.size,
  );
  const remaining = Math.max(0, 4 - selected.length);
  const saved = loadSavedParties();
  root.innerHTML = `<div class="party-builder${compact ? " party-builder-compact" : ""}">
    <div class="party-builder-heading"><div><span class="party-builder-overline">INK FORMATION</span><h3>选择 4 位同行者</h3><p>先选阵容，再在战场里用共享墨量接笔。点击角色卡可自由编队。</p></div><span class="party-builder-count${remaining === 0 ? " is-ready" : ""}" aria-live="polite"><b>${selected.length}</b> / 4 已选</span></div>
    <p class="party-builder-browse">${parties.length} 套预设 · 左右滑动浏览</p><div class="party-builder-presets" role="list" aria-label="预设阵容">${parties.map((party) => presetCard(party, activePreset?.id === party.id)).join("")}</div>
    <details class="party-builder-roster-drawer"${drawerOpen ? " open" : ""}><summary class="party-builder-roster-heading"><span>自由编队 · 16 人可选</span><small>${remaining ? `还可选择 ${remaining} 人` : "阵容已就绪，可随时替换"}</small></summary>
      <div class="party-builder-roster" role="list" aria-label="角色列表">${CHARACTERS.map((character) => characterCard(character, selectedSet.has(character.id), selected.length >= 4 && !selectedSet.has(character.id))).join("")}</div>
      <div class="party-builder-save"><div><label for="${nameId}">保存为自定义阵容</label><input id="${nameId}" data-party-name value="${esc(savedName)}" type="text" maxlength="24" placeholder="例如：我的三笔阵" autocomplete="off"><small data-party-message aria-live="polite">${esc(root.__partyMessage || "最多保存 8 个阵容，可随时载入或删除。")}</small></div><button type="button" class="party-builder-save-button" data-party-action="save" ${selected.length === 4 ? "" : "disabled"}>保存阵容</button></div>
      ${saved.length ? `<details class="party-builder-saved"${compact ? "" : " open"}><summary>我的阵容 · ${saved.length}/8</summary><ul>${saved.map(savedCard).join("")}</ul></details>` : ""}
    </details>
  </div>`;
  root.querySelector(".party-builder-presets").scrollLeft = presetScroll;
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
  if (!root.__partyDelegated) {
    root.__partyDelegated = true;
    root.addEventListener("click", (event) => {
      const target = event.target.closest("[data-party-action]");
      if (!target || !root.contains(target) || target.disabled) return;
      const action = target.dataset.partyAction;
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
        const party = getParties(root).find(
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
        const message = root.querySelector("[data-party-message]");
        if (message)
          message.textContent = result.ok
            ? `已保存「${result.party.name}」。`
            : result.error || "暂时无法保存阵容。";
        root.__partyMessage = result.ok
          ? `已保存「${result.party.name}」。`
          : result.error;
        if (result.ok) render(root, root.__partyCompact);
      }
    });
  }
  render(root, compact);
  return root;
}
