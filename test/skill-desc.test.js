// 技能说明必须和实际数值对得上。
//
// 这条守卫是补的：2026-08-30 一次查出 **17 处**不一致，全是「调平衡时改了
// 数字、没改玩家看得见的那句话」。最离谱的是弓手「穿透箭」——4v4 那轮 AoE
// 下调把倍率从 140% 砍到 110%，文案原样留着；玩家照着 140% 做决定。
//
// 这不是文风检查，是**同一份知识两份实现**在数据文件里的形态：数值写在字段
// 里，又用中文在 desc 里写了一遍，两份必然漂移。既然 desc 是自由文本、没法
// 直接从字段生成，就退而求其次——让它一漂就有测试报错。
//
// 只校验 desc 里**明确写出来的数字**：没写就不管，写了就必须对。
import test from "node:test";
import assert from "node:assert/strict";
import { CHARACTERS } from "../src/data/data.js";

// desc 里的数字 → 该和哪个字段比。取不到就返回 null（视为「没写」）。
const CHECKS = [
  [
    "倍率",
    /(\d+)\s*%\s*伤害/,
    (s) => (s.power != null ? Math.round(s.power * 100) : null),
  ],
  ["治疗量", /治疗[^0-9]{0,4}(\d+)\s*HP/, (s) => s.healAmt ?? null],
  ["治疗量", /回复\s*(\d+)\s*HP/, (s) => s.healAmt ?? null],
  [
    "增益",
    /\+\s*(\d+)\s*%/,
    (s) => (s.buffValue != null ? Math.round(s.buffValue * 100) : null),
  ],
  ["持续", /(\d+)\s*回合/, (s) => s.dur ?? null],
  ["HP消耗", /消耗\s*(\d+)\s*HP/, (s) => s.hpCost ?? null],
];

test("技能说明里写出来的数字，和实际字段一致", () => {
  const bad = [];
  for (const c of CHARACTERS) {
    for (const s of c.skills) {
      for (const [label, re, field] of CHECKS) {
        const m = (s.desc || "").match(re);
        const actual = field(s);
        if (!m || actual == null) continue;
        const said = Number(m[1]);
        if (said !== actual)
          bad.push(
            `${c.name}/${s.name} ${label}：实际 ${actual}，文案说 ${said}（「${s.desc}」）`,
          );
      }
    }
  }
  assert.deepEqual(bad, [], "\n  " + bad.join("\n  ") + "\n");
});
