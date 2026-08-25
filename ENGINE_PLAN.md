# 底层维护性改进 · 计划

> 持久化执行计划，供 context 重置后的新对话继续。
> 每完成一条把 `[ ]` 改成 `[x]`，并在末尾「进度记录」补一行。
> **每条任务都是自包含的**：只读本文件 + 对应代码就能动手，不需要翻历史对话。
> 前三份计划见 `REFACTOR_PLAN.md`、`AI_MERGE_PLAN.md`、`CAMPAIGN_PLAN.md`（均已完成）。

---

## ▶ 当前进度：**任务 1 已完成，从任务 2 开始做**

接手时先跑一遍确认基线：

```bash
npm test                        # 应为 150/150 通过
git log --oneline -3
```

**动手前必读**：`CLAUDE.md` 的「工作约定」一节。

---

## 背景：这份计划从哪来

2026-08-25，用户让我审 `Game todo.html`（去年某个 AI 写的 10 条改进清单），
挑出「改了有助于维护」的部分。结论分两半：

**那 10 条里没有一条是维护性任务**，全是功能。其中 5 条已经做完
（被动系统 / 战役模式 / 结算增强 / 雷达图 / Ban-Pick），
剩下 #3 更多场景、#4 更多状态效果、#7 羁绊、#8 技能CD、#10 随机增益。

我第一版提了 4 个重构 Phase，**自查后砍掉 3 个**（理由见下节）。
留下的 4 条全部有实测证据，不是「看着不优雅」。

---

## 砍掉了什么（别再捡回来，除非触发条件成立）

- **「技能执行分发搬进 combat.js」— 砍。**
  数过了：17 个 case 里 **10 个已经是 combat.js 函数的薄包装**
  （calcDamage / resolveStun / resolveSelfBuff / applyPlague / applyCorruptBurst /
  makeAllyBuff / makeSpBuff / makeDebuff），真正重复的只有 7 个一到三行的 case
  （shield+= / dodging=true / undying= / 血量 clamp 这种）。
  而且有结构性障碍：`battle.js` **在特效回调里结算伤害**（为了动画时序），
  `sim.js` 是同步的，统一就得动这个时序。2.5 小时高风险换 7 行去重，不划算。
  历史上真出过的那个 bug（sim.js 整类技能缺失）用**任务 4b 的测试**挡，成本 1/5。
  → **重新考虑的条件**：重复逻辑超过一半的 case，或新技能类型要在两边各写 10 行以上。

- **「canUseSkill 收敛」— 暂时砍。**
  三处判断（`ai.js:51-52` / `battle.js:339` / `battle.js:364`）现在**完全一致**，
  而且只有 2 行。唯一理由是 todo #8 技能CD，但战斗平均 6~9 回合就结束，
  大部分技能的 CD 根本转不回来第二次，这个功能本身就存疑。
  → **该做的条件**：真要做 #8 技能CD，或 #4 里的「沉默」状态时，先做这个。

- **「场景 / 状态效果数据化」— 暂时砍。**
  场景效果一共只有 2 种（damageUp / spRegen），状态机制现在跑得好好的。
  这两个抽象唯一的理由是 todo #3/#4——还没决定要不要做的功能。
  **在第二个用例出现之前就抽象，是投机性泛化。**
  这个项目历史上成功的几次重构（抽 combat.js、合并 AI）都是等痛感真实出现、
  而且被量化之后才动手的。
  → **该做的条件**：真要加第 4 个场景效果，或第 4 种状态效果时。

---

## 回归网（每条任务改完都拿它对）

这个项目有现成的行为回归网，比单测更能覆盖整体行为。**基线数字**（2026-08-25 实测）：

```bash
npm test                        # 150/150（任务 1 之后；此前是 103/103）
npm run balance 10000           # 牧师63.8 弓手54.4 术士54.3 守卫52.9
                                # 法师45.5 剑士45.1 刺客43.2 狂战士40.6（±1.5 噪声）
node campaign-check.mjs 5000    # 93.7 → 86.0 → 78.8 → 74.2 → 65.8 → 59.0 → 50.1 → 41.6
```

**规则一旦改错，后两个数字会立刻抖起来。** 抖了就回滚，别硬调。

---

## 任务 1 — 让 `npm test` 覆盖到剩下 68% 的代码

**问题**：7 个文件从来没有被任何测试 import 过。

```
从没被测试碰过：main.js 679 / battle.js 622 / vfx.js 427 / scene.js 213
                stickman.js 182 / audio.js 147 / render.js 106   = 2376 行（68%）
被覆盖的：      combat.js / sim.js / ai.js / ai-scoring.js / data.js / state.js = 1128 行
```

意思是：**在 `main.js` 里写个语法错误，`npm test` 103 条全绿，
只有打开浏览器才会发现。**
（2026-08-25 那晚就这样弄坏 main.js 两次，都是靠浏览器报错才发现的。）

- [x] 新增 `test/syntax.test.js`：对仓库根目录下所有 `.js` / `.mjs` 跑 `node --check`，
      任何一个解析失败就让测试红。用 `child_process.execFileSync('node', ['--check', file])`。
      `node --check` **只解析不执行**，所以 `document` / `window` 这些浏览器全局量不影响。
- [x] **先确认 `package.json` 有 `"type": "module"`**——没有的话 `node --check`
      会按 CommonJS 解析 `import`，全部误报。有就直接用，没有就加 `--input-type=module`。
- [x] （可选，顺手）再加一条：扫描每个文件的 import 语句，确认目标文件存在
      且确实导出了那些名字。能挡住「改名了但漏改调用方」。
- [x] 排除 `node_modules`；`test/` 下的文件也一并检查。

**验证**：故意在 `main.js` 里写一行坏语法，`npm test` 必须变红；改回来必须变绿。
**工作量**：20 分钟。

---

## 任务 2 — 删掉死字段 `gameState.busy`

**问题**：`state.js:19` 声明了 `busy:false`，**全项目 0 处读、0 处写**。

这正是 `turnOrder` 那次的同一个物种——CLAUDE.md 里专门记了
「重构掉一个状态字段时，要 grep 干净所有读取方」，结果又留了一个。

- [ ] 删掉 `state.js` 里的 `busy:false,`
- [ ] 顺手全量扫一遍其它字段，确认没有别的死字段。扫法：
      取 `state.js` 里 gameState 声明的所有字段名，
      在全部源文件里数 `gameState.<字段名>` 出现次数，`<=1` 的就是可疑。
      （`stats` 里的 dmg / heal / kills 是嵌套字段，会误报，忽略即可。）

**验证**：`npm test` 全绿 + 浏览器开一局人机确认没炸。
**工作量**：5 分钟。

---

## 任务 3 — 修掉文档里的假信息

**问题一：`CLAUDE.md` 详细描述了两个从来不存在的文件。**
`generate-game.js` 和 `fix-game.js` —— git 全历史查过，**从未被提交过**。
但 CLAUDE.md 有一整节 `## CLI Scripts` 在讲它们，命令区还写着
`node generate-game.js` / `node fix-game.js`，以及「CLI 脚本需要 ANTHROPIC_AUTH_TOKEN」。
**CLAUDE.md 是每个新会话都会加载进上下文的文件**——
等于每次开新对话都从一条假信息开始。

**问题二：`README.md` 严重过时。**
模块表只剩 2 行，还写着「`inkfight.html` = HTML 结构 + CSS + 主逻辑」——
主逻辑早就拆成 16 个模块了。完全没提战役模式、桌面快捷方式、
`npm test`、`npm run balance`、`campaign-check.mjs`。

- [ ] `CLAUDE.md`：删掉整节 `## CLI Scripts`、命令区那两行、
      以及「CLI 脚本需要 ANTHROPIC_AUTH_TOKEN」那句。
      **只删不存在的东西，别动其它内容。**
- [ ] `README.md` 重写。这是给人看的入口，要覆盖：
      - 怎么跑（桌面快捷方式「墨境之战.lnk」是用户日常入口；命令行 `node serve-game.mjs`）
      - 四种模式（双人 / 人机三档 / **战役 8 关** / 平衡测试）
      - 模块结构表（照 CLAUDE.md 那张表精简，别再写「主逻辑在 html 里」）
      - 开发者命令：`npm test` / `npm run balance` / `difficulty-check` / `campaign-check`
- [ ] 顺手核对 README 里「SP 越满越容易被眩晕」这句是不是真的
      （去 `combat.js` 的 `calcStun` 看公式），不对就改掉。

**验证**：人读一遍；`ls` 一遍 README 提到的每个文件，确认都存在。
**工作量**：40 分钟。

---

## 任务 4a — `sim.js` 别再手抄回合开始流程

**问题**：`combat.js` 有 `processStartOfTurn(u, ctx)`（中毒扣血 / 狂暴自损 /
buff-debuff 回合数递减）和 `applyTurnRegen(u, scene)`（回蓝 + 场景回蓝加成）。
`battle.js` 调它们。**`sim.js:134~150` 不调，自己又逐行抄了一遍。**

这有具体后果：以后往 `processStartOfTurn` 里加任何东西（比如 todo #4 的「燃烧」），
只改 combat.js 的话，`npm test` 全绿、浏览器里也对——
**但 `npm run balance` 跑的是 sim.js，它那份里没有。**
于是你拿到一份「机制不全的世界」的胜率表，还以为那是平衡数据。

**这不是假设**：CLAUDE.md 里记着一模一样的事——sim.js 漏抄术士的
`plague` / `corruptBurst`，几千局里瘟疫一次都没被用过，
牧师胜率从 39.6% 一路修正到 58.2%，**修复前的所有数据都是错的**。

- [ ] `sim.js` 删掉手抄的那段（回合开始的毒 / 狂暴 / buff 递减 / 回蓝 / 场景回蓝），
      改成调 `processStartOfTurn(u, {allies})` 和 `applyTurnRegen(u, scene)`。
      **注意**：combat.js 那份**内部已经调了 `triggerPassive('onTurnStart')`**，
      所以 sim.js 上面那句 `triggerPassive` 要一并删掉，否则被动会触发两次。
- [ ] 返回值 `{passiveEvent, poison, berserk}` sim.js 用不上，忽略即可。
- [ ] 眩晕那两行（`if(u.stunned){ u.stunned=false; continue; }`）留在 sim.js 的循环里
      ——那是回合流程编排，不是战斗规则。

**验证**：`npm run balance 10000` 八个角色胜率与上面基线一致（±1.5 个百分点内）；
`node campaign-check.mjs 5000` 曲线一致。**抖了就回滚，说明抄漏了。**
**工作量**：30 分钟。

---

## 任务 4b — 补「每种技能类型都真的被执行到」的测试

**问题**：`sim.js` 的 `executeSkill` 是个 `switch(skill.type)`。
漏掉一个 case，switch 就一路穿过去，**什么都不发生**——不报错、不崩溃，
那个单位白白浪费一回合，安静地存在很久。术士那次就是这么来的。

现有 103 条测试测的是**公式对不对**（calcDamage 之类），
没有一条测**这个 case 有没有被接住**。

- [ ] `sim.js` 把 `executeSkill` export 出来（一行）。
- [ ] 新增测试：对 `data.js` 里每一个技能（8 角色 × 4 技能 = 32 个，覆盖全部 17 种类型），
      造一个「让这个技能有事可做」的局面，执行，断言**状态确实变了**。
      伪代码：

      对每个角色的每个技能：
        actor = createUnit(角色, 1, 0)；target = createUnit('guardian', 2, 0)
        seed(actor, target)              造局面，见下
        before = snapshot(actor, target)
        executeSkill(actor, skill, target, 场景, [actor], [target], null)
        断言 snapshot 与 before 不同，否则报「这个技能执行后什么都没变」

- [ ] **真正花时间的是 `seed()`，不是断言。** 局面造不对就会误报：
      - 目标身上得先挂个中毒，否则「净化」执行前后 `debuffs` 都是空数组，看不出变化
      - actor 得先掉点血，否则治疗类看不出变化
      - 双方 SP 要给够，否则技能根本用不出来
      - `snapshot` 要包含：hp / sp / shield / buffs / debuffs / stunned / dodging / undying

**这条测试不保证什么（别高估它）**：
- **只测 `sim.js` 那一份，测不到 `battle.js`**（后者依赖 DOM，Node 里 import 不进来）。
  但历史上出问题的一直是 sim.js——battle.js 那份你一玩就看得见，sim.js 那份没人盯。
  价值就在没人盯的那半边。
- **只断言「有东西变了」，不断言「变对了」**。数值正确性是 `combat.test.js` 的职责。
  这条补的是另一个洞：**这个 case 到底有没有被接住。**

**验证**：先让全部 32 个技能通过；再故意注释掉 `sim.js` 里 `case 'plague':`，
测试必须变红。**两个方向都验过才算这条测试可信。**
**工作量**：1 小时。

---

## 建议顺序与中断策略

**1 → 2 → 3 → 4a → 4b**。前三条是纯止损（约 1 小时），做完就已经消掉大部分风险；
4a / 4b 是防御性投资。

- 每条任务结束时代码都应处于**可提交、测试全绿**的状态，**一条一个 commit**。
- 直接提交 `main`，不开分支（见 CLAUDE.md 工作约定）。
- 若中途 context 重置，从本文件第一个未勾选项继续即可。

## 风险与应对

- **风险：任务 1 的 `node --check` 误报。**
  应对：先只对一两个文件试跑确认，再铺开。误报比漏报更烦人——
  一个天天变红的测试等于没有测试。
- **风险：任务 4a 抄漏一句，平衡数据整体偏移。**
  应对：`npm run balance 10000` 前后对比，这是硬指标，不靠肉眼看代码。
- **风险：任务 4b 的 `seed()` 造不好导致误报。**
  应对：正反两个方向都验（全绿 + 故意删 case 能变红）。
- **风险：任务 3 重写 README 时又写进不存在的东西。**
  应对：写完 `ls` 一遍提到的每个文件。**这条计划的起因就是这个。**

## 进度记录

- 2026-08-25：写下本计划。起因是审 `Game todo.html`，
  结论是那 10 条全是功能、没有维护性任务，真正该改的是本文件这 4 条
  ——其中 3 条（任务 1 / 2 / 3）是审查过程中新发现的，原 todo 里根本没有。
  第一版提的 4 个重构 Phase 砍掉 3 个，理由和「重新考虑的条件」记在上面，
  免得以后又被当成好主意捡回来。
- 2026-08-25：**任务 1 完成**。新增 `test/syntax.test.js`，`npm test` 103 → 150 条。
  两组：(1) 全仓库 21 个 `.js`/`.mjs` 各跑一次 `node --check`；
  (2) 每个文件的相对 import 逐条核对——目标文件在不在、那边有没有导出这个名字。
  - `package.json` 已有 `"type": "module"`，Node 24 的 `node --check` 直接按 ESM 解析，
    **不需要 `--input-type=module`**（已在 main.js 上实测确认，它满是 `import`）。
  - 排除 `node_modules` / `.git` / `.claude`。**`.claude` 是特意排的**：那底下将来放的
    钩子脚本未必是 ESM，按 ESM 解析会误报——计划里写了「误报比漏报更烦人」。
  - 加了一条哨兵测试，断言扫描结果里确实含那 7 个没被覆盖的模块。
    否则哪天扫描器自己坏了（比如目录遍历写错），这一整组会安静地变成空跑、照样全绿。
  - **正反三个方向都验过**：main.js 写坏语法 → 红；把 `combat.js` 的 `calcStun` 改名
    不改调用方 → 红（报「test/combat.test.js 从 ../combat.js 导入了 calcStun，
    但那边没导出它」）；把 import 路径指向不存在的文件 → 红。全部还原后 150/150 绿。
  - 顺带确认了这条测试的边界：`node --check` **只解析不执行**，所以
    `main.js` 里写 `getElementById('typo-id')` 这种它一点都发现不了。
    它挡的只是「文件根本解析不了」——但那一类此前完全没人挡。
