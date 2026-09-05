import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  collectScreenDiagnostics,
  formatScreenDiagnostics,
} from "../tools/screen-diagnostics.js";

function screen(
  id,
  { active = false, hidden = false, rect, queries = {}, descendants = [] } = {},
) {
  const item = {
    id,
    hidden,
    inert: hidden,
    classList: { contains: (name) => name === "active" && active },
    querySelectorAll: (selector) =>
      selector === "*" ? descendants : queries[selector] || [],
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      right: 1280,
      bottom: 720,
      width: 1280,
      height: 720,
      ...rect,
    }),
  };
  descendants.forEach((element) => {
    if (!element.parentElement) element.parentElement = item;
  });
  return item;
}

function element(
  id,
  { rect, parentElement, overflowY = "visible", dimensions = {} } = {},
) {
  return {
    id,
    parentElement,
    hidden: false,
    inert: false,
    disabled: false,
    textContent: id,
    className: "",
    getAttribute: () => null,
    clientWidth: dimensions.clientWidth || 200,
    clientHeight: dimensions.clientHeight || 40,
    scrollWidth: dimensions.scrollWidth || dimensions.clientWidth || 200,
    scrollHeight: dimensions.scrollHeight || dimensions.clientHeight || 40,
    scrollLeft: dimensions.scrollLeft || 0,
    scrollTop: dimensions.scrollTop || 0,
    style: { overflowY },
    getBoundingClientRect: () => ({
      left: 20,
      top: 100,
      right: 220,
      bottom: 140,
      width: 200,
      height: 40,
      ...rect,
    }),
  };
}

function fixture(items, currentScreen = "screen-battle") {
  const root = {
    clientWidth: 1280,
    clientHeight: 720,
    scrollWidth: 1280,
    scrollHeight: 720,
  };
  return {
    doc: {
      documentElement: root,
      body: { dataset: { screen: currentScreen } },
      querySelectorAll: () => items,
    },
    view: {
      scrollX: 0,
      scrollY: 0,
      getComputedStyle: (item) => ({
        display: item.hidden ? "none" : "block",
        visibility: "visible",
        contentVisibility: "visible",
        opacity: "1",
        overflowX: item.style?.overflowX || "visible",
        overflowY: item.style?.overflowY || "visible",
      }),
    },
  };
}

describe("浏览器 screen 显示不变量", () => {
  test("仅当前 screen 实际显示时通过", () => {
    const battle = screen("screen-battle", { active: true });
    const expedition = screen("screen-expedition", { hidden: true });
    const { doc, view } = fixture([battle, expedition]);
    const result = collectScreenDiagnostics(doc, view);

    assert.equal(result.onlyCurrentVisible, true);
    assert.deepEqual(result.shownScreens, ["screen-battle"]);
    assert.deepEqual(result.leakedScreens, []);
    assert.deepEqual(result.activeOffset, {
      viewportLeft: 0,
      viewportTop: 0,
      documentLeft: 0,
      documentTop: 0,
    });
  });

  test("非 active 的旧远征 screen 仍有布局时判定为泄漏", () => {
    const battle = screen("screen-battle", {
      active: true,
      rect: { top: 720, bottom: 1440 },
    });
    const expedition = screen("screen-expedition");
    const { doc, view } = fixture([expedition, battle]);
    doc.documentElement.scrollHeight = 1440;
    const result = collectScreenDiagnostics(doc, view);

    assert.deepEqual(result.classActiveScreens, ["screen-battle"]);
    assert.deepEqual(result.shownScreens, [
      "screen-expedition",
      "screen-battle",
    ]);
    assert.deepEqual(result.viewportScreens, ["screen-expedition"]);
    assert.deepEqual(result.leakedScreens, ["screen-expedition"]);
    assert.equal(result.onlyCurrentVisible, false);
    assert.match(formatScreenDiagnostics(result), /当前唯一：否/);
    assert.match(formatScreenDiagnostics(result), /泄漏：screen-expedition/);
  });

  test("hidden 属性若被更强 CSS 覆盖，仍按计算布局报告泄漏", () => {
    const battle = screen("screen-battle", { active: true });
    const expedition = screen("screen-expedition", { hidden: true });
    const { doc, view } = fixture([expedition, battle]);
    view.getComputedStyle = () => ({
      display: "flex",
      visibility: "visible",
      contentVisibility: "visible",
      opacity: "1",
    });

    const result = collectScreenDiagnostics(doc, view);
    assert.equal(result.screens[0].hidden, true);
    assert.equal(result.screens[0].shown, true);
    assert.deepEqual(result.leakedScreens, ["screen-expedition"]);
    assert.equal(result.onlyCurrentVisible, false);
  });

  test("主要操作区分页面滚动可达与局部滚动可达", () => {
    const pageButton = element("btn-duel-start", {
      rect: { top: 800, bottom: 840 },
    });
    const localList = element("duel-list", {
      rect: {
        left: 0,
        top: 100,
        right: 300,
        bottom: 300,
        width: 300,
        height: 200,
      },
      overflowY: "auto",
      dimensions: { clientWidth: 300, clientHeight: 200, scrollHeight: 600 },
    });
    const teamButton = element("edit-team-1", {
      parentElement: localList,
      rect: { top: 500, bottom: 540 },
    });
    const duel = screen("screen-duel", {
      active: true,
      queries: {
        "#btn-duel-start": [pageButton],
        "#edit-team-1": [teamButton],
      },
      descendants: [pageButton, localList, teamButton],
    });
    localList.parentElement = duel;
    const { doc, view } = fixture([duel], "screen-duel");
    doc.documentElement.scrollHeight = 900;

    const result = collectScreenDiagnostics(doc, view);
    assert.equal(result.actionGroups[0].actions[0].reach, "page-scroll");
    assert.equal(result.actionGroups[1].actions[0].reach, "local-scroll");
    assert.deepEqual(result.actionGroups[1].actions[0].scrollOwners, [
      { name: "#duel-list", x: 0, y: 0, maxX: 0, maxY: 400 },
    ]);
    assert.deepEqual(result.localScrolls, [
      {
        name: "#duel-list",
        axes: "y",
        x: 0,
        y: 0,
        maxX: 0,
        maxY: 400,
        inViewport: true,
      },
    ]);
    assert.match(formatScreenDiagnostics(result), /页面滚动1/);
    assert.match(formatScreenDiagnostics(result), /局部滚动1/);
  });
});
