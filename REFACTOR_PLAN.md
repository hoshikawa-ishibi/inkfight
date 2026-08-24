# battle.js 拆分 + 测试补齐 计划

> 本文件是持久化的执行计划，供 context 重置后的新对话继续使用。
> 每完成一步，把对应的 `[ ]` 改成 `[x]`，并在"进度记录"里补一行。
> 如果计划中途发现假设错误，直接修改本文件，不要另开一份。

## 背景 / 动因

用户原话反馈：`battle.js`（658 行）职责太杂——纯数值计算（伤害/暴击/减防公式）、
回合流程编排、DOM 操作、音效特效调用全部揉在一起，缺测试覆盖，回归风险高。

调查后发现一个**更严重的既有 bug**，直接证明了"数值逻辑没有独立成纯函数模块"这件事
已经在产生真实后果：

`sim.js`（"平衡测试"模式用的无头对战模拟器）是手工从 `battle.js` **抄了一份**战斗数学逻辑
（伤害公式、被动触发、技能执行 switch），两边已经漂移出明确 bug：

- `triggerPassive`：`battle.js` 有 8 种被动效果，`sim.js` 只抄了 7 种，**缺 `corruptBonus`**
  （术士被动"腐化侵蚀"，永不触发）
- `doDamage`：`battle.js` 会读 `skill.corrupt` 字段施加腐化层，`sim.js` 完全没处理这个字段
  （术士任何攻击都不会在模拟器里真正施加腐化层）
- `executeSkill` switch：`battle.js` 有 17 种技能类型，`sim.js` 只有 15 种，
  **缺 `plague`（瘟疫）和 `corruptBurst`（腐化爆发）**——这两个 case 在 sim.js 里落进
  switch 的默认分支，直接静默 no-op，白扣 SP 且回合浪费
- 综合结果：**术士（warlock）整套技能在"平衡测试"模式里基本是废的**，
  角色定位=腐化/爆发，但爆发和腐化机制在统计数据里从未真正生效过。
  平衡测试跑出来的术士胜率数字没有参考价值。

结论：把 `battle.js` 和 `sim.js` 共用的"战斗规则"部分抽成一个纯函数模块（无 DOM、无
Audio、无 setTimeout），**同时解决"文件太大"和"没有测试"和"两份逻辑会漂移出 bug"** 三个问题，
这不是三件独立的事，是同一个根因的三个症状。

## 目标

1. 新增 `combat.js`：纯函数战斗规则引擎（无 `document`/`Audio`/`Image`/`setTimeout` 依赖），
   作为 `battle.js`（真人对战，带渲染/动画/音效）和 `sim.js`（无头模拟，出统计数据）
   **唯一的规则真相来源**。
2. 修掉上面发现的漂移 bug（顺带发生，因为统一到一份代码后自然就不会再漂移）。
3. 用 Node 内置 `node --test`（零新增依赖，符合项目"无构建步骤"的原则）给 `combat.js`
   的纯函数写单测：伤害公式（暴击/减防曲线/诅咒和破防加成/场景加成/护盾吸收/闪避）、
   眩晕概率公式、8 种被动效果、回合开始的中毒/狂暴掉血、腐化层叠加与腐化爆发结算。
4. `battle.js` 瘦身：把纯计算部分移出去后，`battle.js` 应该只剩"回合流程编排 + DOM 渲染
   + 音效特效触发"，体积明显下降。

## 非目标（明确不做，避免范围膨胀）

- 不引入构建工具/打包器/TypeScript/任何新的 npm 依赖——测试用 Node 自带的 `node --test`。
- 不重写 `render.js`/`vfx.js`/`audio.js`/`stickman.js`/`ai.js`/`scene.js`。
- 不改动员小的、本来就没漂移风险的 `executeSkill` 分支（`shield`/`taunt`/`dodge`/
  `selfBuff`/`cleanse`/`buff`/`spSteal`/`debuff`/`revive`/`healSp`/`heal`/`damageAll`
  分发）——这些两边本来就一致、代码量小、风险低，全量统一的 ROI 不划算，列为 Phase 4
  可选项，不在本次范围内。
- 不加浏览器端 UI 测试（不引入 jsdom/Playwright）——DOM 渲染部分继续靠人工在浏览器里过一遍。

## 阶段划分

### Phase 1 — 测试基础设施
- [x] 确认 `state.js`/`data.js` 在 Node 环境下可安全 `import`（无 DOM 依赖）—— 已确认，纯数据/工具函数。
- [x] `package.json` 的 `test` script 改为 `node --test`。
- [x] 建 `test/` 目录，约定测试文件用 `*.test.js` 命名（Node 测试运行器默认能发现）。

### Phase 2 — 抽取 `combat.js`，收敛 `battle.js`/`sim.js` 的重复逻辑
从 `battle.js` 和 `sim.js` 里挑出**两边都各自实现了一份、且值得共用**的部分，
迁到 `combat.js`，两边都改成调用它：

- [x] `createUnit(charId, player, slot)`（合并 `battle.js` 的 `createUnit` 和 `sim.js` 的
  `makeUnit`，取渲染字段的超集版本，`sim.js` 里多出来的几个未用字段不影响性能）
- [x] `getEffectiveAtk(unit)`
- [x] `previewDmg(unit, skill, scene)`（`scene` 显式传参，去掉对全局 `gameState` 的隐式依赖）
- [x] `triggerPassive(trigger, unit, ctx)`：完整 8 种效果，**返回事件描述对象**（不再内联
  `addLog`/`spawnFloatText`），调用方各自决定怎么呈现
- [x] `calcDamage(actor, target, skill, scene)`：伤害计算核心（闪避判定/暴击判定/诅咒
  破防场景加成/减防公式/护盾吸收/中毒破防附加/自愈/死亡判定/被动触发），返回富结果对象
- [x] `calcStun(actor, target, skill)`：眩晕概率与判定，返回 `{prob, success}`
- [x] `applyCorrupt(target, stacks)`：施加腐化层，返回叠加后总层数
- [x] `handleDeath(unit, killer)`：死亡状态处理（含"不屈"复活），返回 `{died, undying}`
- [x] `processStartOfTurn(unit, scene)`：回合开始的中毒/狂暴掉血 + buff/debuff 时长衰减，
  返回事件列表
- [x] 修复 `sim.js` 的 `executeSkill`：补上 `plague`、`corruptBurst` 两个 case（用共享的
  `applyCorrupt`/`calcDamage`），并让 `damage`/`drain` 类型技能正确处理 `skill.corrupt` 字段
- [x] `battle.js` 里对应函数改为薄封装：调用 `combat.js` 拿到结果对象后，只负责
  `addLog`/`spawnFloatText`/`playSfx`/`_screenShake`/`gameState.stats` 记账等呈现逻辑
- [x] `sim.js` 里对应函数同样改为调用 `combat.js`，删除自己重复实现的规则代码

### Phase 3 — 单元测试
- [x] `test/combat.test.js`：伤害公式（含暴击、减防曲线、诅咒/破防倍率、场景+15%、
  护盾吸收顺序、闪避 MISS）
- [x] 眩晕概率公式（basePct + spScale × sp比例）
- [x] 8 种被动效果各至少一条用例（含边界：叠层上限、触发条件不满足时不触发）
- [x] 回合开始中毒/狂暴掉血 + buff/debuff 到期衰减
- [x] 腐化层叠加、`corruptBurst` 结算、`corruptBonus` 被动加成
- [x] 回归验证：写一条用例直接复现"之前 sim.js 里瘟疫/腐化爆发静默失效"的场景，
  确认修复后确实生效（防止未来再次漂移）

### Phase 4（可选/暂不做）— 进一步拆分 battle.js 剩余部分
如果 Phase 2 完成后 `battle.js` 仍然偏大，可以再拆出 `battle-ui.js`
（`renderSkillPanel`/`showUnitPicker`/`addLog`/`showResult`/`confirmExit` 等纯 DOM 渲染函数），
`battle.js` 只保留回合流程编排（`startTurn`/`activateUnit`/`nextTurn`/`executeSkill` 调度）。
本次不做，等 Phase 2/3 落地后再评估是否有必要。

### 验证
- [x] `npm test` 全绿
- [x] 浏览器里手动跑一局人机对战，确认视觉/日志/被动触发和重构前一致（无 console 报错）
- [x] 跑一次小规模 `runSimulation`（比如 50 局，用 Node 脚本直接调用，不经浏览器）确认
  术士参与的对局里瘟疫/腐化爆发/腐化侵蚀确实生效（而不是之前的静默 no-op）

## 进度记录

- 2026-08-24：完成调查，确认 sim.js/battle.js 漂移 bug（corruptBonus 被动缺失、plague/
  corruptBurst case 缺失、corrupt 字段未处理），写下本计划，开始执行 Phase 1-3。
- 2026-08-24：**Phase 1-3 全部完成，验证通过。**
  - 新建 `combat.js`（约230行纯函数），`battle.js` 658→558行，`sim.js` 从"手抄一份还漏掉
    一半"变成直接复用 `combat.js`。
  - `test/combat.test.js`：39 个用例全绿（`npm test`）。
  - 浏览器实测：完整走了一局人机对战（术士+剑士 vs 牧师+刺客，场景选的赤焰熔岩验证
    +15%场景加成），瘟疫/腐化爆发/圣光庇护被动/中毒跳血/净化技能全部触发正确，
    控制台全程零报错。
  - 用 Node 直接跑了 200 局无头模拟（`runSimulation`）验证 bug 确实修好了：术士胜率
    71.7%（106局76胜），是目前采样里最高的——**这说明术士在真实对战里的机制一直是
    完整生效的（bug 只出在 sim.js 这个统计工具本身），现在数据准了，但也第一次
    露出术士可能偏强的信号，值得后续单独评估平衡性，不在本次重构范围内。**
- 2026-08-24（追加）：**修复平衡测试的采样偏置 —— 这是让胜率数字第一次可信的另一半。**
  - `sim.js` 的 `randomPicks` 用的是 `ids.sort(()=>Math.random()-0.5)`。这个比较函数不满足
    传递性，V8 对小数组的插入排序会让元素明显倾向于留在原位。10 万次实测：8 个角色的
    入选率本该都是 50%，实际分布在 **41.3%（牧师）~ 58.2%（法师）**，偏差最大 8.7 个
    百分点，且与 `CHARACTERS` 的定义顺序强相关（前 4 个角色平均多打 ~20% 的对局）。
  - 影响：不只是"某些角色少测几局"，而是**对位组合的分布是歪的**，胜率统计本身失真。
  - 已改为 Fisher-Yates（`sim.js` 导出 `shuffle`，附注释说明为什么不能用 sort 洗牌）。
    修复后同样口径实测偏差 < 0.5 个百分点。
  - 新增 `test/shuffle.test.js`（4 条）：含一条 2 万次采样的统计测试，阈值 3 个百分点——
    旧实现在这条上会以 8.7 的偏差失败，所以它确实能挡住这类回归，不是装饰性测试。
  - 新增 `balance-report.mjs` + `npm run balance [局数]`：跑无头模拟并按胜率排序输出，
    同时报告采样均匀度（参战次数极差），方便以后调完数值立刻复验。
  - **修完之后的第一份可信平衡数据（4000 局，参战次数极差已收敛到 4.5%）：**

    | 角色 | 胜率 | 偏离 50% |
    |------|------|----------|
    | 术士 | 67.2% | **+17.2** ⚠ |
    | 法师 | 54.9% | +4.9 |
    | 守卫 | 50.6% | +0.6 |
    | 剑士 | 49.6% | -0.4 |
    | 狂战士 | 49.1% | -0.9 |
    | 刺客 | 45.4% | -4.6 |
    | 弓手 | 43.8% | -6.2 |
    | 牧师 | 39.6% | **-10.4** ⚠ |

    中间 5 个角色（守卫/剑士/狂战士/刺客/弓手）落在 43.8%~50.6%，这部分平衡是健康的。
    两端的术士和牧师是真实的离群点，跨度 27.6 个百分点。
  - **数值调整没有做**：改角色强度是设计决策不是 bug 修复，需要你来定方向（削术士的
    腐化爆发系数？加强牧师的治疗量或生存能力？）。数据和复验工具都已就位，定了方向
    之后改完跑一次 `npm run balance` 就能验证。
    另注：`sim.js` 的 `pickSkill` 是个很简陋的评分 AI（只看 cost 和 power），它代表不了
    `ai.js` 里 hard 难度的真实决策水平，所以这组数字适合用来发现**离群角色**，
    不适合用来精调小数点后的差异。
  - Phase 4（拆 battle-ui.js）评估后没做：`battle.js` 瘦身到 558 行后，剩下的内容
    本来就是"回合流程+DOM渲染"两件强耦合的事（比如 `processStartOfTurn` 同时要更新
    状态和刷新界面），继续拆没有清晰的纯函数/副作用边界了，勉强拆只会增加文件跳转
    成本而不解决实际问题。如果以后 `battle.js` 因为加新功能又变大，可以重新评估。
