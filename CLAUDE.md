# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm test                 # 跑单元测试（Node 内置 node --test，无外部依赖）
npm run balance          # 无头模拟 4000 局，输出各角色胜率 + 采样均匀度
npm run balance 10000    # 指定局数
node difficulty-check.mjs 6000   # 难度公平性：玩家打各档 AI 的胜率
node campaign-check.mjs 3000     # 战役难度曲线：玩家打 8 关各自的胜率

npx serve .              # 起本地服务器，然后打开 inkfight.html
node serve-game.mjs      # 零依赖静态服务器（launch-game.vbs 用的就是它）
```

**用户日常启动游戏走桌面快捷方式，不走命令行**：桌面上的「墨境之战.lnk」
指向 `launch-game.vbs`（隐藏窗口启动 `serve-game.mjs` + 自动打开浏览器）。
改这条链路时注意：
- `launch-game.vbs` 必须**纯 ASCII**，不能有中文注释——VBScript 对文件编码
  很敏感，中文注释被当 GBK 误读会直接把脚本解析炸掉（`Object required: 'fso'`），
  改完必须用 `cscript //nologo launch-game.vbs` 跑一遍确认没报错（wscript 双击
  不出错误对话框，看不出来）。
- `serve-game.mjs` 端口被占用（`EADDRINUSE`）时直接退出而不报错，这样重复
  点桌面图标不会弹错误——已经在跑就什么都不用做。

游戏本身无构建步骤。

## AI 架构（`AI_MERGE_PLAN.md` 已全部完成）

**AI 只有一条链路**：

```
data.js（技能配置）
   └─ ai-scoring.js  scoreSkill / pickTarget / focusFoe  ← 唯一一份评分
        └─ ai.js     aiEasy / aiNormal / aiHard          ← 只做难度包装
             ├─ battle.js  玩家对战
             └─ sim.js     npm run balance（直接调 aiHard）
```

`npm run balance` 现在跑的就是玩家在困难难度下面对的那个 AI，
胜率数字第一次真正代表实战平衡。

**给技能加新字段时，要检查三处是否需要同步：`ai-scoring.js` 的评分、
`combat.js` 的执行、以及 `data.js` 的配置。** 历史教训：给「狂暴」加 `power`
时漏改 `ai.js`，导致 AI 放狂暴不造成伤害、玩家放却会。

**改 `pickTarget` 时记住：「评分为 0」是软约束，不是硬保证。** 简单难度的噪声
高达 30，0 分甚至负分的技能照样可能被选中。所以只要一个技能**有可能被选中**，
目标解析就必须给得出合法目标——返回 `null` 会让 `battle.js` 在 `target.hp` /
`target.debuffs` 上抛异常，AI 回合的 setTimeout 里没人接，整局直接卡死。
（治疗和净化都踩过这个坑，见 `test/ai-teamwork.test.js` 最后一组测试。）

## 工作约定（重要）

- **战斗规则只改 `combat.js`。** `battle.js` 和 `sim.js` 都依赖它。历史上这两个文件
  各自手写过一份战斗逻辑，漂移出过真实 bug（术士整套机制在平衡测试里静默失效）。
  不要为了图快在 `battle.js` 或 `sim.js` 里就地写规则。
- **改完 `combat.js` / `battle.js` / `sim.js` 必须跑 `npm test`。**
- **调整角色数值后跑 `npm run balance` 复验**，并留意输出里的"采样均匀度"一行
  （参战次数极差应 < 10%，否则统计不可信）。
- `npm run balance` 用的就是 `ai.js` 的 hard 难度（Phase 4 打通），
  与玩家面对的 AI 完全一致。但**仍然只适合发现离群角色，不适合精调
  小数点后的差异**——AI 是评分式的，评分模型本身的偏好会体现在胜率里。
- 输出里的「节奏」一行是健康指标：平均回合数突然拉长、或超时局比例上升，
  通常意味着治疗 / 护盾类技能被高估了。
- **先手值约 10 个百分点。** 同一个 AI、同样属性、随机阵容，先手方赢 ≈59.8%。
  所以判断「某一档难度公不公平」时，基准线是 **60% 不是 50%**——
  拿 50% 当尺子会把每一档都误判成偏难。`difficulty-check.mjs` 会先把这条线量出来
  再报相对偏差。（这条先手优势本身也许值得单独处理，属于未做的事。）
- **难度 = AI 决策水平 + 属性加成，两层。** 调其中一层前先想清楚另一层：
  合并两套 AI 之后困难的决策水平涨了一大截，原来配的攻 +15% 就成了双重加成。
- 这是个人项目，**直接在 `main` 上提交即可**，不需要开分支走 PR。
- **在浏览器里测试游戏时必须保持静音**——用户在旁边工作，测试音效会打扰他们。
  静音状态存在 `localStorage.inkfight_muted`（`'1'` = 静音），页面加载即生效。
  若在全新浏览器配置里测试，先 `localStorage.setItem('inkfight_muted','1')` 再刷新，
  然后才开始点击（**任何一次点击**都会触发 [main.js](main.js) 的 `Audio.init()` + `startMenuBgm()`）。
- **测完要关闭标签页**。只调 `preview_stop` 不够——页面仍在运行，音频循环不会停。

## inkfight — 墨境之战

Jeu de combat au tour par tour en HTML5 vanilla. Servir via HTTP (ES modules requis) :

```bash
npx serve .        # ou VS Code Live Server
# ouvrir inkfight.html
```

### Structure des modules

| Fichier | Contenu |
|---------|---------|
| `inkfight.html` | Structure HTML + CSS uniquement |
| `data.js` | `SCENES`, `CHARACTERS` (données statiques) |
| `audio.js` | `Audio`（含 `startMenuBgm`/`startBgm`/`stopBgm`）, `SFX`, `playSfx()`, `toggleMute()` |
| `state.js` | `gameState`, `clamp`, `rand`, `pct`, `getAllUnits`, `getUnit`, `getEnemies`, `getAllies`。回合状态：`currentPlayer` + `p1LastActed`/`p2LastActed` 决定轮到谁，`activeUnitId` 记录当前行动单位（高亮 / 快捷键 / 取消选目标都读它） |
| `stickman.js` | `drawStickman`, `drawWeapon` (纯Canvas绘图，无副作用) |
| `scene.js` | `applySceneBackground`, `startMenuBackground`, `stopMenuBackground`, `startSceneBgLayers`, `startSceneFx`, `drawScenePreview` |
| `vfx.js` | `playSkillVfx`, `spawnFloatText`, `spawnHitBurst`, `spawnCritBurst`, `spawnHealColumn`, `spawnHexShield`, `spawnAura`, `spawnSmoke`, `spawnCurse`, `spawnDrainBeam`, `pushFx`, `getUnitScreenPos` |
| `render.js` | `initRender`, `renderBattle`, `redrawUnit`, `animateUnit`, `lungeActor`（含 idle 动画 setInterval） |
| **`ai-scoring.js`** | **技能评分的唯一实现，`ai.js`（并经由它被 `sim.js`）共用**。`scoreSkill(u, s, foes, friends, scene, opts)` 把各类技能收益折算成「等效伤害」以便横向比较；`pickTarget` 选目标；`focusFoe` 定集火目标；`makeTeamContext()` 造队伍战术上下文。`opts.tempo`（0~1）控制是否计入「占掉一回合」的机会成本，`opts.teamwork`（0~1）控制配合意识强度 |
| `ai.js` | 纯函数，可在 Node 运行。只做**难度包装**：`aiEasy`/`aiNormal`/`aiHard`(u, enemies, allies, scene, ctx)，三档的区别是噪声大小、`tempo` 权重、`teamwork` 权重、以及 hard 独有的 `tacticalBonus`。`ctx` 是本方队伍的战术上下文，同队单位共享才能集火 |
| **`combat.js`** | **战斗规则引擎（纯函数，无 DOM/Audio/setTimeout）。`battle.js` 和 `sim.js` 唯一的规则真相来源：`createUnit`, `getEffectiveAtk`, `previewDmg`, `applyTurnRegen`, `handleDeath`, `triggerPassive`, `processStartOfTurn`, `calcDamage`, `calcStun`, `applyCorrupt`, `applyPlague`, `applyCorruptBurst`**。另含 `DIFFICULTY_MODS` / `applyDifficulty`（难度档位给 AI 的属性加成，改数值只改这一处） |
| `battle.js` | 回合流程编排 + DOM 渲染 + 音效特效。规则计算全部委托 `combat.js`，本文件只负责呈现（`renderPassiveEvent`/`presentDeath` 把 combat 返回的事件对象翻译成日志和特效） |
| `sim.js` | 无头战斗模拟器（平衡测试用）。规则来自 `combat.js`，决策直接调 `ai.js` 的 `aiHard`——本文件不再有任何自己的评分代码。另含 `shuffle`（Fisher-Yates）、`runSimulation`（`onDone(charStats, meta)`，`meta` 带平均回合数与超时率） |
| `test/` | `combat.test.js`、`shuffle.test.js`、`ai.test.js`、`ai-teamwork.test.js`（共 91 条，`npm test`） |
| `campaign.js` | `CAMPAIGN_STAGES`（8关数据：阵容含剧情身份、场景、AI档、`enemyMod` 属性加成、分段剧情数组）+ `CAMPAIGN_HERO`（固定主角墨白）+ `CAMPAIGN_ALLIES`（队友解锁表）+ `enemyIds` / `availableAllies` / `unlockedAfter` |
| `main.js` | 入口：UI 流程、事件监听、`init*()` 调用、`window` 暴露 |
| `balance-report.mjs` | `npm run balance` 的入口（角色之间平不平衡） |
| `difficulty-check.mjs` | 难度公平性诊断（玩家打得过哪一档）。用 `simOneBattle` 的 `p1Mod/p2Mod/p1Ai/p2Ai` 做非对称对局，属性加成读 `combat.js` 的 `DIFFICULTY_MODS` |
| `campaign-check.mjs` | 战役难度曲线诊断（8 关分别有多难）。阵容 / AI档 / `enemyMod` 全读 `campaign.js`，属性加成走 `combat.js` 的 `applyStageMod`。**改完战役数据必跑** |

### 近期改动记录

- 音量控件移至左上角，ESC退出按钮保持右上角，消除重叠
- 技能按钮统一为 150×64px 固定尺寸
- 非战斗界面添加墨水粒子动态背景（`startMenuBackground`）
- BGM 系统重构：菜单用慢速琶音，战斗用鼓点+旋律，按场景变化音色；战斗BGM在 `startBattle()` 启动
- 角色平衡调整：刺客 ATK 24→21 / 闪避 18→12；弓手 ATK 18→20；守卫盾墙反击回血 25→15；牧师祝福持续 3→2 回合；术士灵能震荡 spScale 40→30
- **被动技能系统**：`data.js` 每个角色新增 `passive` 字段；`battle.js` 新增 `triggerPassive()` 函数，在 `processStartOfTurn`/`doDamage` 节点触发；技能面板下方展示被动名称和描述
- **结算界面增强**：追踪单位级别伤害/治疗/击杀；MVP 评分（伤害+治疗×1.5+击杀×80）；最高单次伤害记录；数字滚动动画
- **选阵容雷达图**：选角完成后显示 `screen-radar`，Canvas 绘制5维雷达图（攻击/防御/灵能/机动/支撑），确认后进入战斗
- **抽出 `combat.js` + 补测试**（2026-08-24）：`battle.js` 658→557 行；`sim.js` 删除重复实现。
  修复两个既有 bug：(1) `sim.js` 漏抄 `corruptBonus` 被动和 `plague`/`corruptBurst` 技能类型，
  术士整套机制在平衡测试里静默失效；(2) `randomPicks` 用 `sort(()=>Math.random()-0.5)` 洗牌，
  角色入选率偏到 41%~58%（应为 50%），改为 Fisher-Yates。详见 `REFACTOR_PLAN.md`。
- **重写 `sim.js` 的 `pickSkill` + 平衡调整**（2026-08-24）。
  起因：旧 `pickSkill` 只给 `damage`/`heal`/`stun`/`drain` 四种技能打分，其余 13 种只拿
  `cost×0.5`。实测几千局里**术士的瘟疫一次都没被使用过**，守卫的铁壁/嘲讽、
  牧师的净化/祝福同样被系统性忽略——**这意味着此前所有胜率数据都不反映角色真实强度**。
  - 新评分把各类技能的收益统一折算成「等效伤害」，并让条件性技能（净化 / 腐化爆发 /
    治疗）在条件不满足时得 0 分，避免浪费回合。`pickTarget` 同步修正：净化只找真正
    带 debuff 的队友，治疗按缺失血量选，加攻给输出最高的队友。
  - 修复过程中发现并修掉两个评分 bug：`healSp` 的自损惩罚不随血量放大（剑士 30 HP
    残血时仍用「剑气」自损 18 HP，属自杀式回蓝）；`selfBuff` 漏乘技能倍率导致算出负分。
  - **修复前后对比（同为 4000 局）**：牧师 39.6% → 58.2%（从全场最弱变第三强），
    守卫 46.7% → 60.0%，术士 70.1% → 58.4%。**修复前的数据是错的，不要参考。**
  - 数值改动：剑士 `spRegen` 8→10、破甲突刺 `power` 1.8→2.1。
    依据：剑士是纯单体输出且无工具技能，却背着全场最低回蓝，大招占 SP 池 44%
    （法师同为 35SP 但只占 27%），且同成本下法师大招伤害高出 43%。
  - **当前平衡（10000 局，采样极差 2.9%）**：守卫 56.7% / 术士 54.9% / 牧师 53.9% /
    法师 50.6% / 狂战士 48.3% / 剑士 45.8% / 弓手 45.6% / 刺客 44.2%。
    跨度从最初的 27.6 个百分点收窄到 12.5，无离群角色。
- **修掉零使用技能 + 补上机会成本建模**（2026-08-24）。
  - **根本原因是评分漏了一项**：辅助技能要占掉一整个回合，但评分从没把
    「这回合本可以打出的伤害」算作代价，导致 buff / 护盾 / 嘲讽类技能分数虚高。
    加上 `tempo` 机会成本后，平衡跨度从 21 收窄到 7.3 个百分点——**这是本轮
    改动里效果最大的一处，比任何数值调整都管用。**
  - **设计原则：纯功能性技能在这个战斗节奏下需要附带即时收益。**
    「花一整回合只给 buff」几乎永远不划算（狂暴实测：增伤刚好被少打的那回合抵消，
    还倒亏血）。因此给眩晕类和自我增益类技能加了 `power` 字段，改成边打边生效：
    - `combat.js` 新增 `resolveStun` / `resolveSelfBuff`，带 `power` 时先结算伤害再上效果
    - 法师「灵能过载」140% 伤害 + 眩晕、弓手「束缚箭」130% + 眩晕、
      狂战士「狂暴」80% 伤害 + 3 回合攻 +35%
  - **buff 强度不再硬编码**。此前 `0.4`/`0.3`/`0.25`/自损 `8` 散落在
    `combat.js`/`sim.js`/`battle.js` **三处**，改个数值要动三个文件的代码。
    现已集中为 `BUFF_DEFAULTS` + `makeSelfBuff`/`makeAllyBuff`/`makeSpBuff`/`makeDebuff`
    工厂函数，data.js 可用 `buffValue` / `selfDmg` / `debuffValue` 覆盖。
    **调数值不必再改代码。**
  - 数值改动：牧师祝福 35SP/+30%/2回合 → 28SP/+50%/3回合。
  - **当前平衡（10000 局，采样极差 3.4%）**：牧师 55.3% / 守卫 53.1% / 术士 51.2% /
    法师 50.3% / 弓手 49.9% / 剑士 49.8% / 狂战士 46.8% / 刺客 43.7%。
    跨度 11.6，无离群角色。
  - 仍属低使用率但**合理**的技能：免费普攻（有更好技能时自然不用）、
    刺客「消失」/ 狂战士「不屈」等保命技能（本就是情境技能）。
- **合并两套 AI + 让 AI 学会配合**（2026-08-24，`AI_MERGE_PLAN.md` Phase 1～4）。
  技能评分收敛为 `ai-scoring.js` 一份，`ai.js` 只做难度包装，`sim.js` 直接调
  `aiHard`。**平衡测试第一次真正测的是玩家面对的那个 AI。**
  - **AI 配合**：集火（按「威胁 / 有效血量」选目标，选定后整队不换人）、
    不重复上 buff、队友濒危时坦克顶上去、按产出选治疗目标、
    不用大招收残血（伤害按目标有效血量封顶）。
    强度由 `teamwork` 权重分档：easy 0 / normal 0.5 / hard 1。
  - **过程中挖出两个 AI 盲区**（都是评分的错，不是角色强弱）：
    (1) 威胁度只算攻击力，牧师是全场最低，**敌方奶妈从来没被列入过集火名单**，
    胜率虚高到 65.2%；改为 `max(伤害产出, 治疗量)`。
    (2) 「优先救输出高的队友」的权重误乘进了分数，等于让治疗整体涨价 50%。
    **教训：排序用的权重和绝对分数必须分开**——混在一起会让「在 A、B 之间选 A」
    悄悄变成「A 这件事整体更值得做」。
  - **当前基线（10000 局，AI=hard，采样极差 3.7%，平均 8.7 回合分胜负、
    0.5% 超时）**：牧师 63.6% / 弓手 55.3% / 术士 54.0% / 守卫 53.3% /
    剑士 46.3% / 法师 45.2% / 刺客 43.2% / 狂战士 39.1%。
    跨度 24.5。**这组数字和 Phase 4 之前的不可比**（换了 AI），也不是回归——
    以前的数字测的是另一个 AI。
  - **AI 变强会放大角色差距**：集火让脆皮更吃亏（法师、刺客下滑），
    不浪费回合让辅助更受益（牧师上升）。狂战士 39.1% 最低，
    因为它的 `getEffectiveAtk` 随掉血上升、有效血量随掉血下降，
    在「威胁 / 有效血量」的集火模型里会被越打越优先，形成死亡螺旋。
  - 已确认**不是**评分盲区：净化 / 腐化爆发在条件满足时使用率 100%；
    「狂暴」使用率 0% 是技能本身算不过账（3 回合多打约 7 点伤害，
    却要自损 18 HP 并放弃「鲜血之力」的吸血），属角色数值问题。
  - **浏览器实测（困难）实录到完整配合链条**：`牧师 祝福 → 刺客`（加给输出最高的
    队友而非自己）、`刺客 暗影突袭 → 法师` + `牧师 光击 → 法师`（两个单位集火同一
    目标）、法师阵亡后两人同时改打守卫（集火目标随死亡切换）、收人头用免费的
    「匕首」而不是 30SP 的「暗影突袭」。简单难度则连续平A，守卫全程不开铁壁嘲讽。
  - **实测抓到一个单测没覆盖的回归**：`pickTarget` 在全队满血时给治疗返回 `null`
    （净化同理），简单难度的噪声照样会选中它，于是 `battle.js` 在 `target.hp`
    上抛异常、整局卡死。已修并补了 4 条测试。详见上面的「评分为 0 是软约束」。
  - **角色数值调整留到下一轮**，不在合并 AI 这条线里做。
    当前跨度 24.5：牧师 63.4% 偏强、狂战士 38.9% 偏弱（后者有明确机制原因，
    见 `AI_MERGE_PLAN.md` 文末）。
- **困难难度属性加成减半**（2026-08-24）。用户反馈"完全打不过困难"，实测确认：
  玩家胜率只有 42.4%，而**先手对镜的公平线是 59.8%**（先手值约 10 个百分点，
  以前一直拿 50% 当基准，等于把难度判断建立在错的尺子上）。
  - **根因是双重加成**：攻 +15% 是给合并 AI 之前那个笨 AI 配的，
    现在 AI 本身会集火、不浪费回合，两层难度叠在一起就过头了。
  - **拆开量才发现攻击是罪魁**：只留攻 +15% 是 -13.8，只留回蓝 +20% 只有 -2.3。
  - 改为攻 +7% / 回蓝 +10%，落在 52.5%（相对公平线 -7.3）。
    梯度：简单 99.1% / 普通 64.2% / 困难 52.5%。
  - 当时也考虑过全去掉（60.4%），但那样普通和困难只差 3 个百分点，
    难度选项名存实亡——**AI 决策水平本身拉开的差距比想象中小**，
    之前一直是那个 +15% 攻击在撑"困难"的体感。
  - 数值收敛到 `combat.js` 的 `DIFFICULTY_MODS`，`battle.js` 与
    `difficulty-check.mjs` 共用，避免"调了一处、量的却是另一套数"。
- **修掉 `gameState.turnOrder` 的三处死读**（2026-08-24）。回合流程早先从
  「turnOrder 数组 + 下标」改成了 `currentPlayer` + `p1/p2LastActed`，但三个读取方
  没跟着改，读到的永远是 `undefined`——**而且全都静默失败，不报错**：
  - `cancelTargeting()` 拿不到当前单位 → 按 ESC 取消选目标后，`waitingForTarget`
    已置 false（点角色没反应）而技能面板没重绘（还停在「请选择敌方目标」），
    **这一回合彻底无法行动**。
  - 数字键 1~4 快捷键**完全失效**，尽管技能按钮上就写着 `[1] [2] [3] [4]`。
  - 当前行动单位的 `active-turn` 高亮**永远不亮**。
  改法：新增 `gameState.activeUnitId`，由 `activateUnit()` 单点写入，三处统一读它；
  `cancelTargeting` 优先用手上就有的 `pendingActor`（更精确）。
  删除 `turnOrder`/`currentIdx`。
  **教训：重构掉一个状态字段时，要 grep 干净所有读取方。** 这三处的共同点是
  「读到 undefined 之后走了一条看似正常的分支」（`if(u)` 直接跳过、
  `===` 恒为 false），不抛异常，所以能潜伏很久。
- **战役角色与剧情绑定 + 曲线重新校准**（2026-08-25，`CAMPAIGN_PLAN.md` Phase 4）。
  - 战役有固定主角了：`CAMPAIGN_HERO` = 剑士「墨白」，每关预选不可换；
    队友池 7 人各有剧情名，每通一关解锁一个（顺序按「弱的先给」排，牧师最后）。
    选角界面四态：主角锁定 / 可选 / **本关敌方**（禁选）/ 未解锁。
  - **解锁进度不另存 key**，直接从 `inkfight_campaign`（已通关数）推——
    同一份知识两份实现迟早对不上，这个项目已经因此出过三次 bug。
  - 固定主角把 Phase 1 校好的曲线整个打乱（第 2 关 97%、第 4 关 49%），
    逐关重搜 `enemyMod`。**当前曲线（5000 局/关，公平线 60.3%）**：
    93.7 → 86.0 → 78.8 → 74.2 → 65.8 → 59.0 → 50.1 → **41.6**，
    单调下降、最大偏差 2.2。
  - **这个游戏极度吃阵容克制，而且到处都是，不只是 BOSS 关。**
    普通的第 6 关，玩家 28 种阵容的胜率标准差就有 26.5、极差 87 个百分点；
    单人墨皇是 31.5 / 97，只是略高。
    **`npm run balance` 对随机阵容取平均，把这件事整个掩盖掉了**——
    它只能告诉你「角色平均有多强」，不能告诉你「这套阵容打那套阵容如何」。
    所以 `campaign-check.mjs` 现在逐个队友分别报胜率，只看均值会漏掉「带错人必输」。
  - 固定主角的一个副作用是**最差情况变好了**：随机 2 人打墨皇时最差组合只有 0.2%
    （守卫+牧师，纯纯打不动），固定剑士提供了伤害下限之后，最差的队友也有 12%。
  - `enemyMod` 调参时注意**存在真实断崖**：第 4 关 hp×0.84 是 75.3%、×0.85 是 66.7%，
    差 0.01 掉 8.6 个百分点。原因是「几刀砍得死」的整数阈值，不是噪声——
    多跑几次局数确认过。卡在缝里就取偏易的一侧。
- **战役敌人有身份 + 墨皇是真 BOSS + 剧情分段**（2026-08-25，`CAMPAIGN_PLAN.md` Phase 2/3/5）。
  - `createUnit(charId, player, slot, override)` 加了第四个参数，可覆盖
    name/color/hp/sp/atk/def/crit/dodge/spRegen/passive。**同一个角色、不同身份**
    靠它实现，不新增角色数据。另有 `unitSpec(entry)` 把「字符串 or {id,name,…} 对象」
    的解析收敛成一处，`battle.js` 和 `sim.js` 共用。
  - 16 个战役敌人都有了剧情名；`gameState` 拆成 `p2Picks`（纯 id，雷达图按 id 读）
    和 `p2Roster`（带身份的原始条目，建单位时用）。
  - **最终关改成墨皇独战**。依据是一条实测出来的机制事实：
    **本作回合流程是「双方各行动一个单位」，队伍人数不影响行动次数、只影响血池。**
    所以两人队里 BOSS 只能隔回合出手一次，单人则每回合都出手——
    「165 血的换皮术士」和「每回合都出手的 260 血墨皇」，只有后者像 BOSS。
    属性 260/22/8 是 `campaign-check.mjs` 校到 42% 的结果（实测 40.7%）。
  - **血量预算比想象中紧**：给墨皇 +40% 血就吃掉 24 个百分点。
    165/19/7 的双人版本只给玩家 6.1%，远超目标。
  - 过场支持多段文本（`intro`/`outro` 改成数组，字符串仍兼容），
    8 关剧情从不到 40 行扩到 52 段，并串了一条主线。
    **没做打字机效果**：分段推进本身就是节奏控制，再加打字机会让「点一下」
    产生两种含义（补完本段 vs 翻页），把最简单的交互复杂化。
  - 修掉两个既有 bug：(1) 战役赢了直接跳过场，**看不到任何战斗结算**——
    现在赢下一关也走完整结算界面，看完点「继续剧情 →」再进过场；
    (2) 「最终战役统计」显示的其实是**最后一关单场**数据——
    现在按关卡 id 存每关一份（`inkfight_campaign_totals`）、展示时求和。
    按 id 存而不是直接累加，是因为通关的关卡可以重打，重打只该覆盖那一关。
  - **修掉「`showResult` 会被调用两次」**：`checkVictory()` 有两个调用点
    （`nextTurn` 和「行动单位已阵亡」那条分支），胜负已定时两边**各排一个**
    `setTimeout(showResult, 700)`。正常速度下第二次在玩家还没点按钮时就跑完了，
    看不出来；但玩家只要在 700ms 内点掉「继续剧情」，延迟的第二次就会把他
    **从过场/通关界面拽回战斗结算界面**。加了 `gameState.resultShown` 幂等标记。
    这个 bug 是浏览器把标签页降频之后才现形的——**慢环境是照妖镜**。
  - 顺手修掉一个藏了很久的显示 bug：结算界面的数字滚动动画用
    `isNaN(parseInt(v))` 判断该不该滚，于是「22（守卫）」这种也被当数字滚了一遍，
    滚完括号里的名字就没了——「最高单次伤害」那行**一直没显示过是谁打的**。
    改成只滚纯数字（`/^[0-9]+$/`）。
- **战役难度曲线重排**（2026-08-24，`CAMPAIGN_PLAN.md` Phase 1）。
  起因：8 关的敌方阵容是按剧情随手写的，没人算过强度账，实测曲线是锯齿——
  最终 BOSS（62.5%）比第三关（40.1%）还好打，真正最难的是第七关（23.1%）。
  - **新尺子 `campaign-check.mjs`**：每关跑 N 局，报玩家胜率、目标偏差、单调性。
    和 `difficulty-check.mjs` 一样先量公平线（这次量到 60.8%）再报相对偏差。
  - **新旋钮 `enemyMod`**（`campaign.js` 数据 → `combat.js` 的 `applyStageMod`）。
    战役此前完全不吃 `applyDifficulty`，难度杠杆只剩 3 档 AI；
    现在多了一条 campaign 专用的属性路径。
    **两条路径不能合并**——叠加会让校准好的曲线整体跳变。
  - **当前曲线（5000 局/关，目标 ±2.5 以内，单调下降）**：
    92.4% → 83.8% → 75.9% → 73.4% → 64.0% → 57.1% → 47.9% → **39.5%**。
    阵容按实测强度排，每个角色恰好出场两次。
  - **推翻了一个想当然的代理指标**：「两名敌人在 `npm run balance` 里的胜率之和」
    预测不了关卡难度。实测 狂战士+守卫（和 93.5）只给玩家 41.9%，
    比 守卫+牧师（和 116.7，52.0%）还难打。**真正的驱动是队伍续航**——
    平均 15~23 回合的对局都是硬仗，6~8 回合的都是送。
    排关卡要用 `campaign-check.mjs` 实测，不要用胜率相加。
  - **场景 buff 本身就是很强的难度杠杆**，而且以前从没被当成杠杆用过。
    同样是 术士+牧师 + hard AI：在墨色虚空（无效果）玩家只有 26.2%，
    在赤焰熔岩（+15% 伤害）有 47.7%——**+15% 伤害正好破续航流**。
    校准时**必须锁定该关自己的场景**，用随机场景量出来的数会差 10 个百分点
    （这个坑当场踩到了）。
  - **选 atk 还是 hp 做旋钮，要看这一关的敌方靠什么赢。** 靠伤害的用 atk，
    靠续航的用 hp：第 8 关（术士+牧师）对 atk 几乎免疫
    （0.80~1.25 只从 39.1% 走到 24.8%），对 hp 却极敏感（0.80 → 58.4%）。
    项目原有的「攻击是最强杠杆」只在对称随机阵容下成立，不能照搬到具体关卡。
  - **简单 AI 拉不出低难度台阶**：不管配什么阵容都给玩家 90%~99%，
    所以 8 关里只有第 1 关用 easy，第 2 关起就是 normal / hard 加属性微调。
