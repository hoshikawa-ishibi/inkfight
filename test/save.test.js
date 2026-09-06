import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  listFriends,
  listRecords,
  mergeFriend,
  saveRecord,
} from "../src/game/save.js";

const originalStorage = globalThis.localStorage;

afterEach(() => {
  if (originalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = originalStorage;
});

describe("战绩本地存储", () => {
  test("写入失败时不谎报已保存", () => {
    globalThis.localStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota exceeded");
      },
    };

    assert.equal(saveRecord({ id: "cannot-save" }), null);
  });

  test("写入成功时返回规范化后的记录", () => {
    const store = new Map();
    globalThis.localStorage = {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, value),
    };

    const saved = saveRecord({ id: "saved-ok", ruleset: "ink-v1" });
    assert.equal(saved.id, "saved-ok");
    assert.equal(saved.ruleset, "ink-v1");
    assert.equal(JSON.parse(store.get("inkfight_records_v1"))[0].id, "saved-ok");
  });

  test("合法 JSON 但顶层形状损坏时自动降级，不拖垮战绩页", () => {
    const store = new Map([
      ["inkfight_records_v1", '{"unexpected":"object"}'],
      ["inkfight_backfilled_v1", "done"],
      ["inkfight_friends_v1", '{"ghost":null,"broken":{"pid":"p1","records":"nope"}}'],
    ]);
    globalThis.localStorage = {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, value),
    };

    assert.deepEqual(listRecords(), []);
    assert.deepEqual(listFriends(), [
      { pid: "p1", name: "", importedAt: 0, records: [] },
    ]);

    const saved = saveRecord({ id: "recovered" });
    assert.equal(saved.id, "recovered");
    assert.deepEqual(listRecords().map((record) => record.id), ["recovered"]);

    const merged = mergeFriend({ pid: "p1", name: "墨客" }, [saved]);
    assert.deepEqual(merged, { ok: true, added: 1, total: 1 });
    assert.deepEqual(listFriends()[0].records.map((record) => record.id), [
      "recovered",
    ]);
  });
});
