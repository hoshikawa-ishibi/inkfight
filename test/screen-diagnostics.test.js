import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  collectScreenDiagnostics,
  formatScreenDiagnostics,
} from "../tools/screen-diagnostics.js";

function screen(id, { active = false, hidden = false, rect } = {}) {
  return {
    id,
    hidden,
    inert: hidden,
    classList: { contains: (name) => name === "active" && active },
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
});
