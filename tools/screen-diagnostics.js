const rounded = (value) =>
  Number.isFinite(Number(value)) ? Math.round(Number(value) * 10) / 10 : 0;

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
  const screens = Array.from(doc.querySelectorAll('[id^="screen-"]')).map(
    (element) => {
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
    },
  );

  const classActiveScreens = screens.filter((screen) => screen.active);
  const currentScreen =
    doc.body?.dataset?.screen || classActiveScreens[0]?.id || null;
  const current = screens.find((screen) => screen.id === currentScreen) || null;
  const active = classActiveScreens[0] || null;
  const shownScreens = screens.filter((screen) => screen.shown);
  const leakedScreens = shownScreens.filter(
    (screen) => screen.id !== currentScreen,
  );

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
  };
}

const ids = (value) => (value.length ? value.join(", ") : "无");

export function formatScreenDiagnostics(snapshot) {
  const offset = snapshot.activeOffset;
  return [
    `实际显示：${ids(snapshot.shownScreens)} · 当前唯一：${snapshot.onlyCurrentVisible ? "是" : "否"}`,
    `当前：${snapshot.currentScreen || "无"} · active class：${ids(snapshot.classActiveScreens)} · 泄漏：${ids(snapshot.leakedScreens)}`,
    `active 偏移：${offset ? `视口(${offset.viewportLeft}, ${offset.viewportTop}) / 文档(${offset.documentLeft}, ${offset.documentTop})` : "无"}`,
    `视口：${snapshot.viewport.width}×${snapshot.viewport.height} · 文档：${snapshot.page.width}×${snapshot.page.height} · 滚动：(${snapshot.scroll.x}, ${snapshot.scroll.y}) / 最大(${snapshot.scroll.maxX}, ${snapshot.scroll.maxY})`,
  ].join("\n");
}
