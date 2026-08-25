# 底层维护性改进 · 计划

> 持久化执行计划，供 context 重置后的新对话继续。
> 每完成一条把 `[ ]` 改成 `[x]`，并在末尾「进度记录」补一行。
> **每条任务都是自包含的**：只读本文件 + 对应代码就能动手，不需要翻历史对话。
> 前三份计划见 `REFACTOR_PLAN.md`、`AI_MERGE_PLAN.md`、`CAMPAIGN_PLAN.md`（均已完成）。

---

## ▶ 当前进度：**任务 1 / 2 / 3 / 4a / 4b 全部完成，本计划已收尾**

接手时先跑一遍确认基线：

```bash
npm test                        # 应为 188/188 通过
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

- [x] 删掉 `state.js` 里的 `busy:false,`
- [x] 顺手全量扫一遍其它字段，确认没有别的死字段。扫法：
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

- [x] `CLAUDE.md`：删掉整节 `## CLI Scripts`、命令区那两行、
      以及「CLI 脚本需要 ANTHROPIC_AUTH_TOKEN」那句。
      **只删不存在的东西，别动其它内容。**
- [x] `README.md` 重写。这是给人看的入口，要覆盖：
      - 怎么跑（桌面快捷方式「墨境之战.lnk」是用户日常入口；命令行 `node serve-game.mjs`）
      - 四种模式（双人 / 人机三档 / **战役 8 关** / 平衡测试）
      - 模块结构表（照 CLAUDE.md 那张表精简，别再写「主逻辑在 html 里」）
      - 开发者命令：`npm test` / `npm run balance` / `difficulty-check` / `campaign-check`
- [x] 顺手核对 README 里「SP 越满越容易被眩晕」这句是不是真的
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

- [x] `sim.js` 删掉手抄的那段（回合开始的毒 / 狂暴 / buff 递减 / 回蓝 / 场景回蓝），
      改成调 `processStartOfTurn(u, {allies})` 和 `applyTurnRegen(u, scene)`。
      **注意**：combat.js 那份**内部已经调了 `triggerPassive('onTurnStart')`**，
      所以 sim.js 上面那句 `triggerPassive` 要一并删掉，否则被动会触发两次。
- [x] 返回值 `{passiveEvent, poison, berserk}` sim.js 用不上，忽略即可。
- [x] 眩晕那两行（`if(u.stunned){ u.stunned=false; continue; }`）留在 sim.js 的循环里
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

- [x] `sim.js` 把 `executeSkill` export 出来（一行）。
- [x] 新增测试：对 `data.js` 里每一个技能（8 角色 × 4 技能 = 32 个，覆盖全部 17 种类型），
      造一个「让这个技能有事可做」的局面，执行，断言**状态确实变了**。
      伪代码：

      对每个角色的每个技能：
        actor = createUnit(角色, 1, 0)；target = createUnit('guardian', 2, 0)
        seed(actor, target)              造局面，见下
        before = snapshot(actor, target)
        executeSkill(actor, skill, target, 场景, [actor], [target], null)
        断言 snapshot 与 before 不同，否则报「这个技能执行后什么都没变」

- [x] **真正花时间的是 `seed()`，不是断言。** 局面造不对就会误报：
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
- 2026-08-25：**任务 2 完成**。删掉 `state.js` 的 `busy:false`——全仓库 grep 只有
  声明那一行，0 读 0 写，确认是死字段。
  - **全量扫过一遍，没有第二个死字段**：把 `gameState` 声明块里的字段名逐个拿去数
    `gameState.<字段名>` 的出现次数，除 `busy` 外最少的也有 2 次（`stageMod` /
    `p1Roster` / `p2Roster`，各是「写一次 + 读一次」，正常）。
    `stats` 底下的 `p1/dmg/heal/kills/p2` 如计划所料是嵌套字段误报，实际走
    `gameState.stats.p1.dmg`，`stats` 本身有 30 次引用。
  - **反向扫出一件计划里没预料到的事**：有 5 个字段代码在用、但 `state.js` 根本没声明——
    `currentPlayer` / `p1LastActed` / `p2LastActed`（battle.js:135-137 开局赋值）、
    `campaignStage`（main.js:440）、`bannedIds`（main.js:197）。
    都在读之前就赋过值，**功能上没问题，不是 bug**；但讽刺的是
    `currentPlayer` / `p1LastActed` / `p2LastActed` 正是当年替换掉 `turnOrder` 的那三个字段——
    `turnOrder` 的教训写进了 CLAUDE.md，接替它的字段却没进声明。
    于是 `state.js` 这份「状态清单」看不到回合流程的核心状态。
    **没动它**（超出本条任务范围，且加声明会给它们一个初值，属于行为变更）。
    要做的话是独立一条：把这 5 个补进声明并加注释，纯文档性质。
  - 验证：`npm test` 150/150 绿；浏览器实跑一局人机（困难，剑士+法师 VS 牧师+术士）
    到第 4 回合——技能面板、数字键 1~4、ESC 取消选目标（目标高亮清掉 **且** 面板重绘，
    老 bug 的两半都在）、`active-turn` 高亮、AI 回合、中毒 / 瘟疫 / 被动全部正常，
    控制台无报错、16 个模块全 200。
    （跑不完整局是因为**内置浏览器面板隐藏时定时器被降频**，26 秒才走一个回合，
    这是环境限制不是游戏问题。）
- 2026-08-25：**任务 3 完成**。`CLAUDE.md` 删掉幽灵 CLI 脚本，`README.md` 重写。
  - `CLAUDE.md` 328 → 310 行：删掉末尾整节 `## CLI Scripts`（20 行）、命令区那个
    `node generate-game.js` / `node fix-game.js` 代码块，「CLI 脚本需要
    `ANTHROPIC_AUTH_TOKEN`」那句只留下「游戏本身无构建步骤。」。
    删完 `grep generate-game|fix-game|ANTHROPIC|CLI 脚本` 在 CLAUDE.md 里 0 命中。
  - **同一条假信息还渗到了另外两个文件**（计划里没预料到，顺手一起清）：
    `package.json` 的 `"main": "generate-game.js"`（指向从未存在的文件，
    这个包不发布也没 bin，字段本身是死的）、`.gitignore` 里
    「（generate-game.js / fix-game.js 需要 ANTHROPIC_AUTH_TOKEN）」这句注释
    以及为这两个脚本准备的 `newgame/` / `game-output/` 忽略项。
  - **留了一个没动**：`package.json` 里的 `@anthropic-ai/sdk` 依赖也是给那两个脚本
    装的，全仓库 0 处 import，是死依赖。没删是因为卸载会动 `package-lock.json`
    和 `node_modules`，超出「改文档」这条任务的范围。要清是独立一条。
  - `README.md` 22 → 119 行。原文只有 2 行模块表，还写着「`inkfight.html` =
    HTML 结构 + CSS + 主逻辑」——主逻辑早就拆成一堆独立模块了。
    新版覆盖：桌面快捷方式 + `node serve-game.mjs`（端口 5566）、四种模式
    （含「BAN 阶段只有 PVP 有」）、难度两层表、玩法规则、8 角色属性与被动、
    3 张战场效果、模块结构表、开发者命令、`localStorage` 键。
  - **「SP 越满越容易被眩晕」核对结果：是真的，保留。**
    `combat.js:236` `prob = skill.basePct + skill.spScale*(target.sp/target.maxSp)`，
    两个眩晕技能的 `spScale` 都是正数（灵能过载 35、束缚箭 30）。
    README 里顺手把公式写清楚了，不再只给结论。
  - 校对时抓到自己写错一处：`inkfight_sim` 我先写成「测试局数」，
    实际存的是最近 10 次平衡测试的完整结果（`main.js:540`）。已改。
  - 验证：按计划「写完 `ls` 一遍提到的每个文件」——脚本抽出 README 里所有
    反引号文件名逐个 `-e` 检查，23 个全部存在，0 个 MISS。`npm test` 150/150 绿。
- 2026-08-25：**任务 4a 完成**。`sim.js` 回合开始那 13 行手抄副本换成
  `processStartOfTurn(u, {allies})` + `applyTurnRegen(u, scene)`，净减 8 行。
  `triggerPassive` 按计划一并删掉（combat 那份内部已经调了，留着会触发两次）。
  - **顺手删掉两个因此变成死代码的东西**：sim.js 本地的 `handleDeath(u,killer,stats)`
    包装（只有手抄块调它，killer/stats 恒为 null，等于白转一层）以及它用的
    `handleDeath as resolveDeath` 导入。`BUFF_DEFAULTS` 导入同样没人用了，也删了。
    `noteKill` 留着——executeSkill 里还有 4 处在用。
  - **验证方式没按计划走，改用了更硬的一种。** 计划说拿 `npm run balance 10000`
    前后对比，但第一次跑完狂战士 38.5%（基线 40.6%），超出计划写的 ±1.5 噪声带。
    光看这个数没法判断是「抄漏了」还是「噪声带估窄了」，于是写了个临时脚本
    `equiv_tmp.mjs`：用 mulberry32 固定随机数序列，**同一批阵容 / 场景 / 种子分别跑
    新旧两份 `sim.js`，逐局比对 winner / rounds / timeout / 每角色的 dmg-heals-kills**。
    `git show HEAD:sim.js > sim_old_tmp.mjs` 拿到旧版，两份同时 import。
    结果 **2000 局全部一致，0 处差异**——行为等价，是证明不是统计。验完两个临时文件都删了。
  - 回过头看噪声：第二次 `npm run balance 10000` 狂战士 41.0% / 刺客 41.6%，
    和第一次的 38.5% / 42.9% 一比，**弱势角色的run-to-run 波动实测有 2~2.5 个百分点**，
    计划里写的 ±1.5 偏乐观。基线那一行的数字建议按 ±2.5 读。
  - `node campaign-check.mjs 5000`：93.3 → 85.3 → 78.7 → 75.7 → 65.4 → 58.2 → 48.0 → 42.7，
    仍单调下降、最大偏差 3.7（第 4 关，正好是计划里记着「hp×0.84/0.85 差 0.01 掉 8.6 个
    百分点」那个断崖附近，本来就抖）。`npm test` 150/150 绿。
  - **给后面几条留个方法**：这种「重构应当零行为变更」的任务，
    固定随机数直接对拍比跑统计快得多也准得多——统计只能告诉你「大概没变」，
    对拍能告诉你「一步都没变」。任务 4b 之后若再动 sim.js 的规则链路，照这个套路来。
- 2026-08-25：**任务 4b 完成，本计划收尾**。新增 `test/skill-coverage.test.js`
  （36 条），`npm test` 150 → **188**（新文件自己也被任务 1 那个语法扫描器接管了，
  所以是 +36+2）。`sim.js` 的 `executeSkill` 加了 export。
  - **计划的伪代码里藏着一个会让整条测试失效的坑，实现时才发现**：
    `executeSkill` 开头那两行扣 SP / 扣 HP 在 `switch` **之前**。
    所以按计划「前后快照比对」的写法，**任何有 cost 的技能哪怕 case 整个丢了
    也照样有变化**——铁壁 / 嘲讽 / 净化 / 祝福 / 不屈 / 腐化爆发 / 瘟疫
    这些「case 体才是全部意义」的技能会全部误判为通过。
    修法：基线先把这笔预扣算进去（`payCost()`），只剩 case 体的效果参与比对。
    **这条测试的价值几乎全在这十行上**，没有它就是一条永远绿的测试。
  - **Math.random 钉死成 0**。战斗里有三处随机（闪避 / 暴击 / 眩晕判定），
    不钉死的话这条测试会以百分之几的概率无缘无故变红。
    附带条件：`seed()` 里必须把所有单位的 `dodge` 清零——random 恒为 0 时
    `0 < dodge` 恒真，否则每个单位都会把所有攻击躲光，damage 类全看不出变化。
  - **反向验证没只做计划里的 plague 一个，做成了全量变异测试**：
    临时脚本逐个把 `case 'X':` 改名成 `case 'X__DISABLED':`
    （这正是「漏掉一个 case」的真实形态），跑一遍测试看红不红。
    结果 **17 个 case 里 15 个变红**，每个都精确指向对应的技能名。
  - **变异测试顺手挖出一件计划里没写的事**：剩下 2 个 case——
    `spSteal` 和 `debuff`——**data.js 里没有任何技能用它们**，
    却在 `sim.js` / `battle.js` / `ai-scoring.js` 三处都各有一份实现。
    （计划里写的「32 个技能覆盖全部 17 种类型」不对，实际只有 15 种。）
    没删：删要三个文件一起动，是另一条任务。改成在测试里登记成「已知盲区」，
    名单变了就报红并提示怎么改——加技能用上了、或者把死 case 清了，两种都想被看见。
    **注意别和 `skill.debuff:'defDown'` 那个字段搞混**：那个是活的（破甲突刺在用），
    走 `calcDamage`，不走 switch。
  - 这条测试**不保证什么**（写在文件头了）：只测 sim.js 那一份（battle.js 依赖 DOM，
    Node 里 import 不进来）；只断言「有东西变了」，不断言「变对了」（那是 combat.test.js 的职责）。
  - 验证：`npm test` 188/188 绿；`npm run balance 2000` 正常出数（export 是纯增量改动）。

### 本计划到此结束

4 条任务（1 / 2 / 3 / 4a / 4b）全部完成。三条「砍掉了什么」里的重构仍然砍着，
重新捡起来的条件写在上面那一节，别在条件没成立时捡回来。

**基线更新为**：`npm test` 188/188。

## 收尾之后：把「记着没清」的死代码清了（2026-08-25）

任务 3 和 4b 各留了一笔「发现了但超出本条任务范围」的账，一起结掉。
**行为零变更是量出来的**：删之前用固定随机数序列跑 3000 局压出一个 sha256，
删完再跑一次，哈希一模一样（`e299011b…`）——不可达的代码删掉当然不影响结果，
但这件事要证明，不能靠"看着像"。`npm test` 188 → **187**（删了一条测试，见下）。

清掉的东西，都是「实现存在但没有任何配置能触达」这一个物种：

- **技能类型 `spSteal` / `debuff`**：`data.js` 里没有任何技能用这两种类型，
  却在 `sim.js` / `battle.js` / `ai-scoring.js` **三处**各有一份实现。
  连带删掉随之变成死代码的 `combat.js` 的 `makeDebuff()`、
  `BUFF_DEFAULTS.debuff`、以及 `needsEnemyTarget` 里的那两个类型名。
- **被动效果 `soulDrain`**：`combat.js` 的 `triggerPassive` 有完整实现、
  `battle.js` 有对应的日志和特效分支，但 `data.js` / `campaign.js` 里
  **没有任何角色配 `effect:'soulDrain'`**。这个是清 spSteal 时顺藤摸出来的，
  4b 的变异测试没覆盖到它（那条测试只扫技能类型，不扫被动效果）。
  `test/combat.test.js` 里那条 `soulDrain` 测试跟着删——**它测的是一个
  游戏里永远不会发生的机制**，绿着反而给人虚假的安全感。
- **`package.json` 的 `@anthropic-ai/sdk` 依赖**（任务 3 记过一笔）：
  是给两个从未存在过的 CLI 脚本装的，全仓库 0 处 import。
  `npm install` 同步掉 lock 和 node_modules（removed 4 packages）。
- 文档跟手：`CLAUDE.md` 的 `makeDebuff` 和测试条数。

**4b 那条「已知盲区」测试升级成了不变量**：原本断言死 case 名单
`['spSteal','debuff']`，现在断言**这个名单必须是空的**——
「switch 里不许有任何技能都触达不到的 case」。变异测试复跑：15 个 case 全被盯住。

**还剩一个没动，需要你拍板**：状态类型 `cursed`（诅咒）。
`combat.js` 的 `calcDamage` 给带 `cursed` 的目标 ×1.25 伤害，
`render.js` 会显示「👁诅咒」，`combat.test.js` 还有一条测试——
但**全仓库没有任何代码会产生 `cursed`**（唯一可能的生产者就是刚删掉的
`makeDebuff`）。它是死的，但删它等于删一条游戏机制，
而 `Game todo.html` 的 #4「更多状态效果」正好会用上它，所以留着等你决定。

### 从这次清理里学到的

- **变异测试只覆盖它扫的那一维。** 4b 扫的是"技能类型"，
  于是"被动效果"这一维的死代码 `soulDrain` 完整地漏了过去。
  同一个物种，换个维度就照不到——**照妖镜要对准才有用**。
- **仓库里 `combat.js` 是 CRLF，`sim.js` / `battle.js` / `ai-scoring.js` 是 LF。**
  写批量补丁脚本时按 LF 写的模式在 combat.js 上会静默匹配 0 次。
  补丁脚本一定要断言"命中次数 == 1"，否则会安静地什么都没改还报成功。
