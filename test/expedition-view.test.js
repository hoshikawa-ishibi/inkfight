import test from "node:test";
import assert from "node:assert/strict";
import {
  newExpedition,
  expeditionView,
  relicOffers,
  routeOffers,
  takeRelic,
  chooseRoute,
  launchEncounter,
  resolveEncounter,
  chooseCamp,
} from "../src/core/expedition.js";
import { createUnit } from "../src/core/combat.js";
import { renderExpedition } from "../src/view/expedition-view.js";

function fakeRoot() {
  const classes = new Set();
  return {
    innerHTML: "",
    addEventListener() {},
    contains() {
      return true;
    },
    querySelector() {
      return null;
    },
    classList: {
      add(value) {
        classes.add(value);
      },
      remove(value) {
        classes.delete(value);
      },
      [Symbol.iterator]() {
        return classes.values();
      },
    },
  };
}

function units(run) {
  return run.team.map((member, index) =>
    createUnit(member.charId, 1, index),
  );
}

function launched() {
  const run = newExpedition("edge", "阶段文案");
  takeRelic(run, "flow");
  chooseRoute(run, routeOffers(run)[0].id);
  launchEncounter(run);
  return run;
}

function markup(run, options) {
  const root = fakeRoot();
  renderExpedition(root, expeditionView(run, options));
  return root.innerHTML;
}

function clearRewardAndLaunchNext(run) {
  while (run.phase === "reward") takeRelic(run, relicOffers(run)[0].id);
  chooseCamp(run, "rest");
  chooseRoute(run, routeOffers(run)[0].id);
  launchEncounter(run);
}

test("intermediate victory, reward and camp screens state progress and the next action", () => {
  const run = launched();
  resolveEncounter(run, { winner: 1, rounds: 4, finalUnits: units(run) });
  const reward = markup(run);
  assert.match(reward, /第 1 关胜利 · 领取奖励/);
  assert.match(reward, /已完成 1 \/ 3 关/);
  assert.match(reward, /选完后进入营地整备，再前往第 2 关/);
  assert.doesNotMatch(reward, /完整通关|终局险路已破/);

  const landing = markup(run, { landing: true, hasSavedRun: true });
  assert.match(landing, /继续：领取第 1 关奖励/);

  while (run.phase === "reward") takeRelic(run, relicOffers(run)[0].id);
  const camp = markup(run);
  assert.match(camp, /第 1 关营地 · 选择整备/);
  assert.match(camp, /立即进入第 2 关择路/);
  assert.match(camp, /前往第 2 关 ↗/);
});

test("only the third victory uses complete-run language", () => {
  const run = launched();
  for (let checkpoint = 1; checkpoint <= 3; checkpoint++) {
    resolveEncounter(run, {
      winner: 1,
      rounds: checkpoint + 3,
      finalUnits: units(run),
    });
    const html = markup(run);
    if (checkpoint < 3) {
      assert.match(html, new RegExp(`第 ${checkpoint} 关胜利`));
      assert.doesNotMatch(html, /墨路远征完整通关/);
      clearRewardAndLaunchNext(run);
    } else {
      assert.match(html, /墨路远征完整通关/);
      assert.match(html, /已完成 3 \/ 3 关/);
    }
  }
});

test("failure recap names the failed checkpoint and completed count", () => {
  const run = launched();
  resolveEncounter(run, { winner: 1, rounds: 4, finalUnits: units(run) });
  clearRewardAndLaunchNext(run);
  resolveEncounter(run, { winner: 2, rounds: 7, finalUnits: units(run) });
  const html = markup(run);
  assert.match(html, /第 2 关失利 · 本次远征结束/);
  assert.match(html, /已完成 1 \/ 3 关/);
  assert.doesNotMatch(html, /墨路远征完整通关/);
});
