import { CHARACTERS } from "../data/data.js";
import { portraitFor } from "../data/character-portraits.js";
import { renderPartyBuilder } from "./party-builder.js";

const PHASE_NAMES = {
  landing: "启程",
  blessing: "墨契",
  route: "择路",
  briefing: "战前",
  battle: "交锋",
  reward: "战后",
  camp: "歇脚",
  complete: "抵达",
  failed: "留痕",
};

const STOP_WORDS = ["壹", "贰", "叁"];

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function text(value, fallback = "") {
  const result = String(value ?? "").trim();
  return result || fallback;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function safeColor(value, fallback = "#6cae9a") {
  const color = String(value ?? "").trim();
  return /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\))$/i.test(
    color,
  )
    ? color
    : fallback;
}

function clampRatio(value) {
  const ratio = Number(value);
  return Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
}

function journeyProgress(view) {
  const total = Math.max(1, Number(view?.progress?.total) || 3);
  const completed = Math.max(
    0,
    Math.min(total, Number(view?.progress?.completed ?? view?.wins) || 0),
  );
  const current = Math.max(
    1,
    Math.min(
      total,
      Number(view?.progress?.current) || (Number(view?.battleIndex) || 0) + 1,
    ),
  );
  return {
    total,
    completed,
    current,
    next: Math.min(total, Number(view?.progress?.next) || completed + 1),
  };
}

function continueLabel(view) {
  const { completed, current } = journeyProgress(view);
  switch (view?.savedPhase) {
    case "blessing":
      return "继续：选择启程墨契";
    case "route":
      return `继续：选择第 ${current} 关路线`;
    case "briefing":
      return `继续：查看第 ${current} 关战前`;
    case "battle":
      return `继续：重打第 ${current} 关`;
    case "reward":
      return `继续：领取第 ${completed} 关奖励`;
    case "camp":
      return `继续：完成第 ${completed} 关营地整备`;
    default:
      return "继续上次远征";
  }
}

function characterFor(id) {
  return CHARACTERS.find((character) => character.id === id) || null;
}

function portraitMarkup(id, name, className = "expedition-portrait") {
  const character = characterFor(id);
  const color = safeColor(character?.color, "#6cae9a");
  const portrait = portraitFor(id);
  if (portrait) {
    return `<img class="${className}" src="${esc(portrait)}" alt="${esc(name || character?.name || "角色")}" loading="lazy" draggable="false">`;
  }
  const initial = esc(text(name, character?.name || "?").slice(0, 1));
  return `<span class="${className} expedition-portrait-fallback" style="--portrait-color:${esc(color)}" aria-hidden="true">${initial}</span>`;
}

function relicGlyph(relic) {
  return `<span class="expedition-relic-glyph" style="--relic-color:${esc(safeColor(relic?.color, "#c89a56"))}" aria-hidden="true">${esc(text(relic?.glyph, "✦"))}</span>`;
}

function relicCard(relic, index, action = "relic", actionText = "选择") {
  const item = relic || {};
  const id = text(item.id, `relic-${index}`);
  return `<button class="expedition-choice-card expedition-relic-card" type="button" data-action="${esc(action)}" data-value="${esc(id)}" aria-label="选择墨契：${esc(text(item.name, "无名墨契"))}">
    <span class="expedition-card-index">${String(index + 1).padStart(2, "0")}</span>
    ${relicGlyph(item)}
     <span class="expedition-card-copy"><span class="expedition-card-tag">${esc(text(item.tag, "墨契"))}</span><strong>${esc(text(item.name, "无名墨契"))}</strong><span class="expedition-card-description">${esc(text(item.description, "一道尚未显形的墨契。"))}</span></span>
    <span class="expedition-card-arrow" aria-hidden="true">${esc(actionText)} ↗</span>
  </button>`;
}

function enemyCard(enemyId, index, compact = false) {
  const character = characterFor(enemyId);
  const name = text(character?.name, enemyId || "未知对手");
  const role = text(character?.role, "墨影");
  return `<article class="expedition-enemy-card${compact ? " is-compact" : ""}" style="--enemy-color:${esc(safeColor(character?.color, "#9b7567"))}">
    <div class="expedition-enemy-portrait">${portraitMarkup(enemyId, name, "expedition-portrait")}</div>
    <div class="expedition-enemy-meta"><span class="expedition-overline">敌影 ${String(index + 1).padStart(2, "0")}</span><strong>${esc(name)}</strong><span>${esc(role)}</span></div>
  </article>`;
}

function teamPanel(view) {
  const team = list(view.team);
  if (!team.length) return "";
  return `<aside class="expedition-side-panel expedition-team-panel">
    <div class="expedition-side-heading"><span class="expedition-overline">同行者</span><strong>墨契小队</strong><span class="expedition-side-rule"></span></div>
    <div class="expedition-team-list">${team
      .map((member, index) => {
        const ratio = clampRatio(member?.hpRatio);
        const color = safeColor(
          member?.color || characterFor(member?.charId)?.color,
          "#6cae9a",
        );
        const name = text(
          member?.name,
          characterFor(member?.charId)?.name || `同行者 ${index + 1}`,
        );
        return `<div class="expedition-team-member" style="--member-color:${esc(color)}">
        <div class="expedition-team-portrait">${portraitMarkup(member?.charId, name, "expedition-portrait")}</div>
        <div class="expedition-team-copy"><strong>${esc(name)}</strong><span class="expedition-hp-label">生息 ${Math.round(ratio * 100)}%</span><span class="expedition-hp-track" role="progressbar" aria-label="${esc(name)}当前生命" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(ratio * 100)}"><span style="width:${ratio * 100}%"></span></span></div>
      </div>`;
      })
      .join("")}</div>
  </aside>`;
}

function relicPanel(view) {
  const relics = list(view.relics);
  return `<aside class="expedition-side-panel expedition-relic-panel">
     <div class="expedition-side-heading"><span class="expedition-overline">已收墨印</span><strong>随身墨契</strong><span class="expedition-side-rule"></span></div>
    ${relics.length ? `<div class="expedition-owned-relics">${relics.map((relic) => `<details class="expedition-owned-relic"><summary>${relicGlyph(relic)}<span><strong>${esc(text(relic?.name, "无名墨契"))}</strong><small>${esc(text(relic?.tag, "墨契"))}</small></span></summary><p>${esc(text(relic?.description, "这道墨印的作用尚未显形。"))}</p></details>`).join("")}</div>` : '<p class="expedition-empty-note">还没有墨契。路会替你留下第一道印。</p>'}
  </aside>`;
}

function historyPanel(view) {
  const history = list(view.history);
  return `<div class="expedition-history-list">${[0, 1, 2]
    .map((index) => {
      const entry = history[index];
      const state = entry ? (entry.won ? "won" : "lost") : "pending";
      const label = text(entry?.name, "尚未落笔");
      const rounds =
        entry && entry.rounds != null ? ` · ${esc(entry.rounds)}回合` : "";
      return `<div class="expedition-history-row is-${state}"><span class="expedition-history-mark" aria-hidden="true">${entry ? (entry.won ? "✓" : "×") : "·"}</span><span><strong>${STOP_WORDS[index]} · ${esc(label)}</strong><small>${entry ? (entry.won ? `已通过${rounds}` : `止步于此${rounds}`) : "等待远征到达"}</small></span></div>`;
    })
    .join("")}</div>`;
}

function progressMap(view) {
  const phase = text(view.phase, "landing");
  const { completed, total } = journeyProgress(view);
  const activeIndex = Math.max(0, Math.min(2, Number(view.battleIndex) || 0));
  const history = list(view.history);
  return `<nav class="expedition-progress" aria-label="墨路三关进度"><span class="expedition-map-count">${completed} / ${total} 关已完成</span><ol>${[
    0, 1, 2,
  ]
    .map((index) => {
      const entry = history[index];
      const state = entry
        ? entry.won
          ? "done"
          : "lost"
        : index === activeIndex && phase !== "complete"
          ? "active"
          : "future";
      const label = text(
        entry?.name,
        index === activeIndex ? view.activeRoute?.name : "尚未到达",
      );
      return `<li class="is-${state}" aria-current="${state === "active" ? "step" : "false"}"><span>${STOP_WORDS[index]}</span><b>第 ${index + 1} 关</b><small>${esc(label)}</small></li>`;
    })
    .join("")}</ol></nav>`;
}

function runHeader(view) {
  const phase = text(view.phase, "landing");
  const running =
    phase !== "landing" && phase !== "complete" && phase !== "failed";
  return `<header class="expedition-header">
    <div class="expedition-brand"><span class="expedition-brand-mark" aria-hidden="true">墨</span><strong>墨路远征</strong></div>
    <div class="expedition-header-right"><span class="expedition-phase-chip">${esc(PHASE_NAMES[phase] || phase)}</span>${phase !== "landing" && view.seed ? `<button class="expedition-text-button" type="button" data-action="copy-seed" aria-label="复制本次远征种子">种子 ${esc(view.seed)} · 复制</button>` : ""}${running ? '<button class="expedition-text-button expedition-home-link" type="button" data-action="home" aria-label="返回首页并保留远征进度">返回首页 <span aria-hidden="true">⌂</span></button><button class="expedition-text-button expedition-abandon" type="button" data-action="abandon" aria-label="放弃本次远征">放弃远征</button>' : ""}${phase === "landing" ? '<button class="expedition-text-button expedition-home-link" type="button" data-action="home" aria-label="返回首页">返回首页 <span aria-hidden="true">⌂</span></button>' : ""}</div>
  </header>`;
}

function landingView(view) {
  return `<section class="expedition-landing expedition-main-column">
    <div class="expedition-landing-intro"><div><h1>三战一程，带伤前行</h1><p>${esc(text(view.rulesText, "共用三墨 · 自由连携 · 伤势延续"))}</p></div><span class="expedition-career">启程 ${esc(view.best?.attempts || 0)} 次 · 通关 ${esc(view.best?.completed || 0)} 次</span></div>
    <div class="expedition-party-builder" data-party-builder></div>
    <div class="expedition-start-dock"><div class="expedition-seed-wrap"><label class="expedition-seed-field"><span>路线种子 <small>可选 · 留空随机</small></span><input class="expedition-seed-input" type="text" maxlength="40" autocomplete="off" placeholder="留空，让墨迹自行流动" aria-label="输入可选的远征路线种子" value="${esc(view.seedDraft || "")}"></label>${view.hasSavedRun && view.seed ? `<span class="expedition-saved-seed">已保存种子：${esc(view.seed)} · 可手填复刻 <button type="button" class="expedition-seed-copy" data-action="copy-seed" aria-label="复制已保存种子">复制</button></span>` : ""}</div><div class="expedition-start-actions"><button class="expedition-primary-button" type="button" data-action="start" disabled>落笔启程 <span>↗</span></button><button class="expedition-secondary-button" type="button" data-action="continue" ${view.hasSavedRun ? "" : "disabled"}>${esc(continueLabel(view))} <span aria-hidden="true">↻</span></button></div></div>
  </section>`;
}

function choiceView(view, phase) {
  const isReward = phase === "reward";
  const offers = list(view.offers).slice(0, 3);
  const { completed, total, next } = journeyProgress(view);
  const remaining = Math.max(0, Number(view.rewardsRemaining) || 0);
  return `<section class="expedition-main-column expedition-choice-view"><header class="expedition-stage-head"><div><h1>${isReward ? `第 ${completed} 关胜利 · 领取奖励` : "选择启程墨契"}</h1><p>${isReward ? `已完成 ${completed} / ${total} 关。还可领取 ${remaining} 件；选完后进入营地整备，再前往第 ${next} 关。` : "三道墨契只能带走一道，它会伴随整条远征。"}</p></div><span>${isReward ? `${remaining} 件待领` : "三选一"}</span></header><div class="expedition-card-grid">${offers.map((offer, index) => relicCard(offer, index, "relic", isReward ? "领取" : "选择")).join("")}</div></section>`;
}

function routeCard(route, index, selectedId) {
  const item = route || {};
  const id = text(item.id, `route-${index}`);
  const enemies = list(item.enemyIds);
  const selected = selectedId && selectedId === id;
  return `<article class="expedition-route-card${selected ? " is-selected" : ""}" style="--route-accent:${esc(safeColor(item.color, index ? "#b98667" : "#6cae9a"))}">
    <div class="expedition-route-card-head"><span class="expedition-card-index">${String(index + 1).padStart(2, "0")}</span><span class="expedition-route-kind">${esc(item.kind === "elite" ? "精英墨关" : "寻常墨关")}</span><span class="expedition-route-scene">${esc(text(item.sceneName, item.sceneId || "未知场景"))}</span></div>
    <h3>${esc(text(item.name, `无名之路 ${index + 1}`))}</h3><p class="expedition-route-description">${esc(text(item.description, "一条尚未显形的路。"))}</p>
    <div class="expedition-route-enemies">${enemies.length ? enemies.map((id, enemyIndex) => enemyCard(id, enemyIndex, true)).join("") : '<span class="expedition-empty-note">敌影尚未显形</span>'}</div>
    <div class="expedition-route-details"><span><b>胜后所得</b>${esc(item.rewardText || `${item.rewardCount ?? "—"} 件墨契`)}</span><span><b>路上变化</b>${esc(text(item.modText, "无额外描述"))}</span></div>
    <button class="expedition-route-select" type="button" data-action="route" data-value="${esc(id)}" aria-label="选择路线：${esc(text(item.name, `无名之路 ${index + 1}`))}">${selected ? "已选此路" : "选这条路"} <span aria-hidden="true">↗</span></button>
  </article>`;
}

function routeView(view) {
  const routes = list(view.routes);
  const selected = text(view.activeRoute?.id, "");
  const { completed, total, current } = journeyProgress(view);
  return `<section class="expedition-main-column expedition-route-view"><header class="expedition-stage-head"><div><h1>第 ${current} 关 · 择路</h1><p>已完成 ${completed} / ${total} 关。比较敌人、路况和战利品，然后直接选择。</p></div><span>二选一</span></header><div class="expedition-route-grid">${routes
    .slice(0, 2)
    .map((route, index) => routeCard(route, index, selected))
    .join("")}</div></section>`;
}

function briefingView(view) {
  const route = view.activeRoute || {};
  const enemies = list(route.enemyIds);
  const { current } = journeyProgress(view);
  return `<section class="expedition-main-column expedition-briefing-view"><header class="expedition-stage-head"><div><h1>第 ${current} 关 · ${esc(text(route.name, "战前确认"))}</h1><p>${esc(text(route.modText, "此站没有额外路况。"))}</p></div><span>${esc(route.kind === "elite" ? "精英关" : "普通关")}</span></header><div class="expedition-briefing-card"><div class="expedition-briefing-meta"><strong>${esc(text(route.sceneName, route.sceneId || "未知场景"))}</strong><span>胜后：${esc(route.rewardText || `${route.rewardCount ?? "—"} 件墨契`)}</span></div><div class="expedition-enemy-line">${enemies.length ? enemies.map((id, index) => enemyCard(id, index)).join("") : '<span class="expedition-empty-note">敌影尚未显形</span>'}</div><div class="expedition-briefing-foot"><span>伤势与墨契会带入本战</span><button class="expedition-primary-button" type="button" data-action="launch">踏入战场 <span>↗</span></button></div></div></section>`;
}

function battleView(view) {
  const route = view.activeRoute || {};
  const { current } = journeyProgress(view);
  return `<section class="expedition-main-column expedition-battle-view"><header class="expedition-stage-head"><div><h1>第 ${current} 关 · 战斗已保存</h1><p>重新进入会从本战第 1 轮开始，战前伤势与墨契保持不变。</p></div></header><div class="expedition-battle-brief"><span>当前路线</span><strong>${esc(text(route.name, "未择之路"))}</strong><small>${esc(text(route.sceneName, route.sceneId || "未知场景"))}</small><button class="expedition-primary-button" type="button" data-action="launch">重新进入战场 <span>↗</span></button></div></section>`;
}

function campView(view) {
  const options = list(view.campOptions);
  const { completed, total, next } = journeyProgress(view);
  return `<section class="expedition-main-column expedition-camp-view"><header class="expedition-stage-head"><div><h1>第 ${completed} 关营地 · 选择整备</h1><p>已完成 ${completed} / ${total} 关。选择后立即进入第 ${next} 关择路。</p></div><span>磨锋 ${esc(view.forge ?? 0)} 次</span></header><div class="expedition-camp-grid">${options
    .slice(0, 2)
    .map(
      (option, index) =>
        `<button class="expedition-choice-card expedition-camp-card" type="button" data-action="camp" data-value="${esc(text(option?.id, `camp-${index}`))}" aria-label="选择整备方式并进入第 ${next} 关：${esc(text(option?.name, `选项 ${index + 1}`))}"><span class="expedition-card-index">${String(index + 1).padStart(2, "0")}</span><span class="expedition-camp-glyph" aria-hidden="true">${index === 0 ? "◒" : "⌘"}</span><span class="expedition-card-copy"><span class="expedition-card-tag">${index === 0 ? "REST" : "FORGE"}</span><strong>${esc(text(option?.name, `歇脚选项 ${index + 1}`))}</strong><span class="expedition-card-description">${esc(text(option?.description, "让下一笔更稳。"))}</span></span><span class="expedition-card-arrow" aria-hidden="true">前往第 ${next} 关 ↗</span></button>`,
    )
    .join("")}</div></section>`;
}

function recapView(view, phase) {
  const won = phase === "complete";
  const { completed, total, current } = journeyProgress(view);
  return `<section class="expedition-main-column expedition-recap-view"><header class="expedition-stage-head"><div><h1>${won ? "墨路远征完整通关" : `第 ${current} 关失利 · 本次远征结束`}</h1><p>${won ? `已完成 ${completed} / ${total} 关，三处关隘都已留下你的印。` : `已完成 ${completed} / ${total} 关。可重新启程或用同一种子更换阵容。`}</p></div><span class="expedition-recap-stamp is-${won ? "complete" : "failed"}">${won ? "通关" : "结束"}</span></header>${won && view.activeRoute?.kind === "elite" ? '<p class="expedition-title-earned">终局险路已破 · 获得称号「破阵归人」</p>' : ""}${historyPanel(view)}<div class="expedition-recap-actions"><button class="expedition-primary-button" type="button" data-action="new">开始新远征 <span>↗</span></button><button class="expedition-secondary-button" type="button" data-action="retry-seed" data-value="${esc(view.seed || "")}">同种子换阵容 <span>⌁</span></button><button class="expedition-secondary-button" type="button" data-action="home">回到首页 <span>⌂</span></button></div></section>`;
}

function phaseView(view) {
  switch (view.phase) {
    case "landing":
      return landingView(view);
    case "blessing":
      return choiceView(view, "blessing");
    case "route":
      return routeView(view);
    case "briefing":
      return briefingView(view);
    case "battle":
      return battleView(view);
    case "reward":
      return choiceView(view, "reward");
    case "camp":
      return campView(view);
    case "complete":
    case "failed":
      return recapView(view, view.phase);
    default:
      return landingView({ ...view, phase: "landing" });
  }
}

function sideRail(view) {
  if (view.phase === "landing") return "";
  const relicCount = list(view.relics).length;
  return `<details class="expedition-rail" open><summary><b>行囊</b><span>4 位同行者 · ${relicCount} 件墨契</span></summary><div class="expedition-rail-body">${teamPanel(view)}${relicPanel(view)}</div></details>`;
}

function bindDelegation(root) {
  if (root.__expeditionDelegated) return;
  root.__expeditionDelegated = true;
  root.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target || !root.contains(target) || target.disabled) return;
    const action = target.dataset.action;
    const value = target.dataset.value;
    if (action === "start") {
      const seedInput = root.querySelector(".expedition-seed-input");
      root.__expeditionOnAction?.("start", {
        partyId: root.__expeditionSelectedParty || "",
        charIds: root.__expeditionSelectedPartyIds || [],
        seed: seedInput?.value?.trim() || "",
      });
      return;
    }
    if (action === "new" || action === "retry-seed") {
      root.__expeditionSelectedParty = "";
      root.__expeditionSelectedPartyIds = [];
    }
    root.__expeditionOnAction?.(action, value || undefined);
  });
}

/**
 * Render the presentation layer for 墨路远征. The parent owns all state and
 * rules; this view only escapes supplied text and emits actions.
 */
export function renderExpedition(root, view = {}, onAction = () => {}) {
  if (!root) return;
  bindDelegation(root);
  root.__expeditionOnAction = onAction;
  const phase = text(view.phase, "landing");
  if (phase === "landing" && !Array.isArray(root.__expeditionSelectedPartyIds))
    root.__expeditionSelectedPartyIds = [];
  const renderView = phase === "landing" ? { ...view } : view;
  root.classList.add("expedition-root");
  Array.from(root.classList).forEach((className) => {
    if (className.startsWith("expedition-phase-"))
      root.classList.remove(className);
  });
  root.classList.add(
    `expedition-phase-${phase.replace(/[^a-z0-9_-]/gi, "") || "landing"}`,
  );
  root.innerHTML = `<div class="expedition-inkwash" aria-hidden="true"></div><div class="expedition-shell">${runHeader(renderView)}${phase !== "landing" ? progressMap(renderView) : ""}<div class="expedition-layout">${phaseView(renderView)}${sideRail(renderView)}</div></div>`;
  const rail = root.querySelector(".expedition-rail");
  if (
    rail &&
    typeof window !== "undefined" &&
    window.matchMedia?.("(max-width: 620px)").matches
  )
    rail.open = false;
  if (phase === "landing") {
    const builderRoot = root.querySelector("[data-party-builder]");
    if (builderRoot)
      renderPartyBuilder(builderRoot, {
        selected: root.__expeditionSelectedPartyIds,
        parties: view.parties,
        onChange: (ids) => {
          root.__expeditionSelectedPartyIds = [...ids];
          const matching = list(view.parties).find(
            (party) =>
              list(party?.charIds).length === ids.length &&
              list(party?.charIds).every((id) => ids.includes(id)),
          );
          root.__expeditionSelectedParty =
            matching?.id || (ids.length === 4 ? "custom" : "");
          const start = root.querySelector('[data-action="start"]');
          if (start) start.disabled = ids.length !== 4;
        },
      });
    const start = root.querySelector('[data-action="start"]');
    if (start) start.disabled = root.__expeditionSelectedPartyIds.length !== 4;
  }
}
