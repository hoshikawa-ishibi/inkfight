const rounded = (value) =>
  Number.isFinite(Number(value)) ? Math.round(Number(value) * 10) / 10 : 0;

export const SCREEN_ACTIONS = Object.freeze({
  "screen-title": [
    ["远征", "#btn-expedition"],
    ["自由对战", ".title-actions .title-secondary"],
    ["继续远征", "#home-resume button"],
    ["快速开战", "#btn-quick-battle"],
  ],
  "screen-expedition": [
    ["启程", '[data-action="start"]'],
    ["继续", '[data-action="continue"]'],
    ["择路", '[data-action="route"]'],
    ["进入战场", '[data-action="launch"]'],
    ["选墨契", '[data-action="relic"]'],
    ["营地", '[data-action="camp"]'],
    ["新远征", '[data-action="new"]'],
    ["同种子重试", '[data-action="retry-seed"]'],
    ["回首页", '[data-action="home"]'],
  ],
  "screen-duel": [
    ["进入战场", "#btn-duel-start"],
    ["赤方阵容", "#edit-team-1"],
    ["青方阵容", "#edit-team-2"],
    ["交换阵容", "#swap-teams"],
  ],
  "screen-archive": [
    ["返回首页", ".archive-back"],
    ["角色列表", ".archive-roster-item"],
  ],
  "screen-records": [
    ["战绩分页", ".records-tab"],
    ["导入战绩", "#btn-records-import"],
    ["分享战绩", "#btn-records-export"],
    ["返回首页", ".records-foot > button"],
  ],
  "screen-battle": [
    ["战斗记录", "#btn-battle-info"],
    ["收笔", "#btn-ink-end-turn"],
    ["技能", "#skill-panel .skill-btn"],
  ],
  "screen-result": [
    ["结算操作", "#result-actions button"],
    ["返回大厅", "#screen-result > button"],
  ],
});

function rectOf(element) {
  const rect = element?.getBoundingClientRect?.() || {};
  return {
    left: rounded(rect.left),
    top: rounded(rect.top),
    right: rounded(rect.right),
    bottom: rounded(rect.bottom),
    width: rounded(rect.width),
    height: rounded(rect.height),
  };
}

function isShown(element, style, rect) {
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.visibility !== "collapse" &&
    style.contentVisibility !== "hidden" &&
    Number.parseFloat(style.opacity || "1") > 0 &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function intersectsViewport(rect, viewport) {
  return (
    rect.right > 0 &&
    rect.bottom > 0 &&
    rect.left < viewport.width &&
    rect.top < viewport.height
  );
}

const overflowClips = (value) =>
  /^(auto|scroll|overlay|hidden|clip)$/.test(value || "");
const overflowScrolls = (value) => /^(auto|scroll|overlay)$/.test(value || "");

function elementName(element) {
  if (element.id) return `#${element.id}`;
  const className =
    typeof element.className === "string"
      ? element.className.trim().split(/\s+/)[0]
      : "";
  return className
    ? `.${className}`
    : element.tagName?.toLowerCase?.() || "element";
}

function overflowInfo(element, view) {
  const style = view.getComputedStyle(element);
  const overflowX = style.overflowX || style.overflow || "visible";
  const overflowY = style.overflowY || style.overflow || "visible";
  const maxX = Math.max(
    0,
    (element.scrollWidth || 0) - (element.clientWidth || 0),
  );
  const maxY = Math.max(
    0,
    (element.scrollHeight || 0) - (element.clientHeight || 0),
  );
  return {
    style,
    clipsX: overflowClips(overflowX),
    clipsY: overflowClips(overflowY),
    scrollsX: overflowScrolls(overflowX) && maxX > 1,
    scrollsY: overflowScrolls(overflowY) && maxY > 1,
    maxX: rounded(maxX),
    maxY: rounded(maxY),
  };
}

function actionVisibility(element, doc, view, viewport) {
  const style = view.getComputedStyle(element);
  const rect = rectOf(element);
  const shown = isShown(element, style, rect);
  const clip = {
    left: 0,
    top: 0,
    right: viewport.width,
    bottom: viewport.height,
  };
  const scrollOwners = [];
  const clipOwners = [];
  let ancestor = element.parentElement;
  while (
    ancestor &&
    ancestor !== doc.body &&
    ancestor !== doc.documentElement
  ) {
    const info = overflowInfo(ancestor, view);
    if (info.clipsX || info.clipsY) {
      const ancestorRect = rectOf(ancestor);
      clipOwners.push({
        name: elementName(ancestor),
        scrollable: info.scrollsX || info.scrollsY,
      });
      if (info.clipsX) {
        clip.left = Math.max(clip.left, ancestorRect.left);
        clip.right = Math.min(clip.right, ancestorRect.right);
      }
      if (info.clipsY) {
        clip.top = Math.max(clip.top, ancestorRect.top);
        clip.bottom = Math.min(clip.bottom, ancestorRect.bottom);
      }
    }
    if (info.scrollsX || info.scrollsY) {
      scrollOwners.push({
        name: elementName(ancestor),
        x: rounded(ancestor.scrollLeft),
        y: rounded(ancestor.scrollTop),
        maxX: info.maxX,
        maxY: info.maxY,
      });
    }
    ancestor = ancestor.parentElement;
  }
  const visibleWidth = Math.max(
    0,
    Math.min(rect.right, clip.right) - Math.max(rect.left, clip.left),
  );
  const visibleHeight = Math.max(
    0,
    Math.min(rect.bottom, clip.bottom) - Math.max(rect.top, clip.top),
  );
  const inViewport = shown && visibleWidth > 0 && visibleHeight > 0;
  const fullyVisible =
    inViewport &&
    visibleWidth >= rect.width - 0.5 &&
    visibleHeight >= rect.height - 0.5;
  let reach = "hidden";
  if (fullyVisible) reach = "full";
  else if (inViewport) reach = "partial";
  else if (shown && scrollOwners.length) reach = "local-scroll";
  else if (shown && clipOwners.length) reach = "clipped";
  else if (
    shown &&
    (doc.documentElement.scrollHeight > viewport.height + 1 ||
      doc.documentElement.scrollWidth > viewport.width + 1)
  )
    reach = "page-scroll";
  else if (shown) reach = "outside";
  return {
    label:
      element.getAttribute?.("aria-label") ||
      element.textContent?.replace?.(/\s+/g, " ").trim().slice(0, 40) ||
      elementName(element),
    disabled: Boolean(element.disabled),
    shown,
    inViewport,
    fullyVisible,
    reach,
    rect,
    visible: {
      width: rounded(visibleWidth),
      height: rounded(visibleHeight),
    },
    scrollOwners,
    clipOwners,
  };
}

function collectActions(screen, screenId, doc, view, viewport) {
  const specs = SCREEN_ACTIONS[screenId] || [];
  const groups = [];
  for (const [label, selector] of specs) {
    const elements = Array.from(screen?.querySelectorAll?.(selector) || []);
    if (!elements.length) continue;
    const actions = elements.map((element) =>
      actionVisibility(element, doc, view, viewport),
    );
    groups.push({
      label,
      selector,
      count: actions.length,
      full: actions.filter((action) => action.fullyVisible).length,
      partial: actions.filter(
        (action) => action.inViewport && !action.fullyVisible,
      ).length,
      disabled: actions.filter((action) => action.disabled).length,
      actions,
    });
  }
  return groups;
}

function collectLocalScrolls(screen, view, viewport) {
  const elements = [
    screen,
    ...Array.from(screen?.querySelectorAll?.("*") || []),
  ].filter(Boolean);
  const regions = [];
  for (const element of elements) {
    const hasOverflow =
      (element.scrollWidth || 0) > (element.clientWidth || 0) + 1 ||
      (element.scrollHeight || 0) > (element.clientHeight || 0) + 1;
    if (!hasOverflow) continue;
    const info = overflowInfo(element, view);
    if (!info.scrollsX && !info.scrollsY) continue;
    const rect = rectOf(element);
    if (!isShown(element, info.style, rect)) continue;
    regions.push({
      name: elementName(element),
      axes: `${info.scrollsX ? "x" : ""}${info.scrollsY ? "y" : ""}`,
      x: rounded(element.scrollLeft),
      y: rounded(element.scrollTop),
      maxX: info.maxX,
      maxY: info.maxY,
      inViewport: intersectsViewport(rect, viewport),
    });
  }
  return regions;
}

/**
 * Read the browser's computed layout. Class names alone are deliberately not
 * treated as evidence that a screen is visible or hidden.
 */
export function collectScreenDiagnostics(doc = document, view = window) {
  const root = doc.documentElement;
  const viewport = {
    width: rounded(root.clientWidth),
    height: rounded(root.clientHeight),
  };
  const scroll = {
    x: rounded(view.scrollX),
    y: rounded(view.scrollY),
    maxX: rounded(Math.max(0, root.scrollWidth - root.clientWidth)),
    maxY: rounded(Math.max(0, root.scrollHeight - root.clientHeight)),
  };
  const page = {
    width: rounded(root.scrollWidth),
    height: rounded(root.scrollHeight),
  };
  const screenElements = Array.from(doc.querySelectorAll('[id^="screen-"]'));
  const screens = screenElements.map((element) => {
    const style = view.getComputedStyle(element);
    const rect = rectOf(element);
    const shown = isShown(element, style, rect);
    return {
      id: element.id,
      active: element.classList.contains("active"),
      hidden: element.hidden,
      inert: Boolean(element.inert),
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      shown,
      inViewport: shown && intersectsViewport(rect, viewport),
      rect,
    };
  });

  const classActiveScreens = screens.filter((screen) => screen.active);
  const currentScreen =
    doc.body?.dataset?.screen || classActiveScreens[0]?.id || null;
  const current = screens.find((screen) => screen.id === currentScreen) || null;
  const currentElement = screenElements.find(
    (screen) => screen.id === currentScreen,
  );
  const active = classActiveScreens[0] || null;
  const shownScreens = screens.filter((screen) => screen.shown);
  const leakedScreens = shownScreens.filter(
    (screen) => screen.id !== currentScreen,
  );
  const actionGroups = collectActions(
    currentElement,
    currentScreen,
    doc,
    view,
    viewport,
  );
  const localScrolls = collectLocalScrolls(currentElement, view, viewport);

  return {
    currentScreen,
    classActiveScreens: classActiveScreens.map((screen) => screen.id),
    shownScreens: shownScreens.map((screen) => screen.id),
    viewportScreens: screens
      .filter((screen) => screen.inViewport)
      .map((screen) => screen.id),
    leakedScreens: leakedScreens.map((screen) => screen.id),
    onlyCurrentVisible:
      Boolean(current) &&
      current.shown &&
      shownScreens.length === 1 &&
      leakedScreens.length === 0,
    activeOffset: active
      ? {
          viewportLeft: active.rect.left,
          viewportTop: active.rect.top,
          documentLeft: rounded(active.rect.left + scroll.x),
          documentTop: rounded(active.rect.top + scroll.y),
        }
      : null,
    viewport,
    page,
    scroll,
    screens,
    actionGroups,
    localScrolls,
  };
}

const ids = (value) => (value.length ? value.join(", ") : "无");

export function formatScreenDiagnostics(snapshot) {
  const offset = snapshot.activeOffset;
  const actions = snapshot.actionGroups?.length
    ? snapshot.actionGroups
        .map((group) => {
          const visible = group.full + group.partial;
          const local = group.actions.filter(
            (action) => action.reach === "local-scroll",
          ).length;
          const page = group.actions.filter(
            (action) => action.reach === "page-scroll",
          ).length;
          const clipped = group.actions.filter(
            (action) => action.reach === "clipped",
          ).length;
          const hidden = group.actions.filter(
            (action) => action.reach === "hidden",
          ).length;
          const state =
            group.full === group.count
              ? "全见"
              : [
                  visible ? `视口内${visible}/${group.count}` : "",
                  local ? `局部滚动${local}` : "",
                  page ? `页面滚动${page}` : "",
                  clipped ? `容器裁剪${clipped}` : "",
                  hidden ? `隐藏${hidden}` : "",
                ]
                  .filter(Boolean)
                  .join("+") || "不可见";
          const top = Math.min(
            ...group.actions.map((action) => action.rect.top),
          );
          const bottom = Math.max(
            ...group.actions.map((action) => action.rect.bottom),
          );
          return `${group.label}${group.count > 1 ? `×${group.count}` : ""}:${state}${group.disabled ? `/禁用${group.disabled}` : ""}@y${top}–${bottom}/${snapshot.viewport.height}`;
        })
        .join(" · ")
    : "无";
  const localScrolls = snapshot.localScrolls?.length
    ? snapshot.localScrolls
        .map(
          (region) =>
            `${region.name}[${region.axes} ${region.x},${region.y}/${region.maxX},${region.maxY}]`,
        )
        .join(" · ")
    : "无";
  return [
    `实际显示：${ids(snapshot.shownScreens)} · 当前唯一：${snapshot.onlyCurrentVisible ? "是" : "否"}`,
    `当前：${snapshot.currentScreen || "无"} · active class：${ids(snapshot.classActiveScreens)} · 泄漏：${ids(snapshot.leakedScreens)}`,
    `active 偏移：${offset ? `视口(${offset.viewportLeft}, ${offset.viewportTop}) / 文档(${offset.documentLeft}, ${offset.documentTop})` : "无"}`,
    `视口：${snapshot.viewport.width}×${snapshot.viewport.height} · 文档：${snapshot.page.width}×${snapshot.page.height} · 滚动：(${snapshot.scroll.x}, ${snapshot.scroll.y}) / 最大(${snapshot.scroll.maxX}, ${snapshot.scroll.maxY})`,
    `主要操作：${actions}`,
    `局部滚动：${localScrolls}`,
  ].join("\n");
}
