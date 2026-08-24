# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm test                 # 跑单元测试（Node 内置 node --test，无外部依赖）
npm run balance          # 无头模拟 4000 局，输出各角色胜率 + 采样均匀度
npm run balance 10000    # 指定局数

npx serve .              # 起本地服务器，然后打开 inkfight.html
```

CLI 脚本（与游戏本身无关）：

```bash
node generate-game.js    # 生成新游戏到 ./newgame/
node fix-game.js         # 修复 ./game-output/ 里的游戏
```

CLI 脚本需要 `ANTHROPIC_AUTH_TOKEN`（或 `ANTHROPIC_API_KEY`）环境变量。游戏本身无构建步骤。

## 工作约定（重要）

- **战斗规则只改 `combat.js`。** `battle.js` 和 `sim.js` 都依赖它。历史上这两个文件
  各自手写过一份战斗逻辑，漂移出过真实 bug（术士整套机制在平衡测试里静默失效）。
  不要为了图快在 `battle.js` 或 `sim.js` 里就地写规则。
- **改完 `combat.js` / `battle.js` / `sim.js` 必须跑 `npm test`。**
- **调整角色数值后跑 `npm run balance` 复验**，并留意输出里的"采样均匀度"一行
  （参战次数极差应 < 10%，否则统计不可信）。
- `npm run balance` 用的是 `sim.js` 里的简易评分 AI，只看 cost 和 power，
  代表不了 `ai.js` 里 hard 难度的真实水平。**这组数字适合发现离群角色，
  不适合精调小数点后的差异。**
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
| `state.js` | `gameState`, `clamp`, `rand`, `pct`, `getAllUnits`, `getUnit`, `getEnemies`, `getAllies` |
| `stickman.js` | `drawStickman`, `drawWeapon` (纯Canvas绘图，无副作用) |
| `scene.js` | `applySceneBackground`, `startMenuBackground`, `stopMenuBackground`, `startSceneBgLayers`, `startSceneFx`, `drawScenePreview` |
| `vfx.js` | `playSkillVfx`, `spawnFloatText`, `spawnHitBurst`, `spawnCritBurst`, `spawnHealColumn`, `spawnHexShield`, `spawnAura`, `spawnSmoke`, `spawnCurse`, `spawnDrainBeam`, `pushFx`, `getUnitScreenPos` |
| `render.js` | `initRender`, `renderBattle`, `redrawUnit`, `animateUnit`, `lungeActor`（含 idle 动画 setInterval） |
| `ai.js` | `initAi`, `aiEasy`, `aiNormal`, `aiHard`（`scoreSkill` 内部，`previewDmg` 注入） |
| **`combat.js`** | **战斗规则引擎（纯函数，无 DOM/Audio/setTimeout）。`battle.js` 和 `sim.js` 唯一的规则真相来源：`createUnit`, `getEffectiveAtk`, `previewDmg`, `applyTurnRegen`, `handleDeath`, `triggerPassive`, `processStartOfTurn`, `calcDamage`, `calcStun`, `applyCorrupt`, `applyPlague`, `applyCorruptBurst`** |
| `battle.js` | 回合流程编排 + DOM 渲染 + 音效特效。规则计算全部委托 `combat.js`，本文件只负责呈现（`renderPassiveEvent`/`presentDeath` 把 combat 返回的事件对象翻译成日志和特效） |
| `sim.js` | 无头战斗模拟器（平衡测试用）。复用 `combat.js`，另含 `shuffle`（Fisher-Yates）、`runSimulation` |
| `campaign.js` | `CAMPAIGN_STAGES`（8关剧情数据：阵容、场景、难度、剧情文本） |
| `main.js` | 入口：UI 流程、事件监听、`init*()` 调用、`window` 暴露 |
| `test/` | `combat.test.js`（39 例）、`shuffle.test.js`（4 例，含统计偏置检测） |
| `balance-report.mjs` | `npm run balance` 的入口 |

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

---

## CLI Scripts

Two independent CLI scripts, both using `@anthropic-ai/sdk` with `claude-opus-4-6`:

**`generate-game.js`**
- Prompts user for a game description
- Streams Claude's response directly to `./newgame/index.html` (single-file HTML5 game, no external deps)
- Makes a second non-streaming call to generate `./newgame/README.md`
- Output dir: `./newgame/`

**`fix-game.js`**
- Reads all files from `./game-output/`
- Collects console errors and/or behavior description from user (double-Enter to submit)
- Scores files by relevance to the problem, sends top 4 (truncated to 4000 chars each) to Claude
- Claude returns JSON `{ analysis, fixes[] }` — fixes are written back to `./game-output/`
- Output dir: `./game-output/`

The two scripts use different output directories and are not connected to each other.
