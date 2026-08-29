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
| **`intent.js`** | **敌人意图公开 + 承诺制**（战斗深度重做的地基）。纯函数：`nextActor`（下一个该行动的单位——`battle.js` 和 `sim.js` **必须共用这一份**，各写一份的后果见 `COMBAT_PLAN.md` 任务 0）、`makeIntent`、`resolveIntent`（**只重解目标，绝不重选技能**）、`estimateDamage`。意图对象的字段是 **`estDmg`**，`ai-scoring.js` 的 `opts.threat` 读的就是它 |
| **`combat.js`** | **战斗规则引擎（纯函数，无 DOM/Audio/setTimeout）。`battle.js` 和 `sim.js` 唯一的规则真相来源：`createUnit`, `getEffectiveAtk`, `previewDmg`, `applyTurnRegen`, `handleDeath`, `triggerPassive`, `processStartOfTurn`, `calcDamage`, `calcStun`, `applyCorrupt`, `applyPlague`, `applyCorruptBurst`**。另含 `DIFFICULTY_MODS` / `applyDifficulty`（难度档位给 AI 的属性加成，改数值只改这一处） |
| `battle.js` | 回合流程编排 + DOM 渲染 + 音效特效。规则计算全部委托 `combat.js`，本文件只负责呈现（`renderPassiveEvent`/`presentDeath` 把 combat 返回的事件对象翻译成日志和特效） |
| `sim.js` | 无头战斗模拟器（平衡测试用）。规则来自 `combat.js`，决策直接调 `ai.js` 的 `aiHard`——本文件不再有任何自己的评分代码。另含 `shuffle`（Fisher-Yates）、`runSimulation`（`onDone(charStats, meta)`，`meta` 带平均回合数与超时率） |
| `test/` | `combat.test.js`（公式对不对）、`shuffle.test.js`、`ai.test.js`、`ai-teamwork.test.js`、`syntax.test.js`（全仓库 `node --check` + import 目标核对）、`skill-coverage.test.js`（**每种技能类型都真的被 `sim.js` 的 switch 接住**）。共 189 条，`npm test` |
| `campaign.js` | `CAMPAIGN_STAGES`（8关数据：阵容含剧情身份、场景、AI档、`enemyMod` 属性加成、分段剧情数组）+ `CAMPAIGN_HERO`（固定主角墨白）+ `CAMPAIGN_ALLIES`（队友解锁表）+ `enemyIds` / `availableAllies` / `unlockedAfter` |
| `main.js` | 入口：UI 流程、事件监听、`init*()` 调用、`window` 暴露。含**调试模式**：顶栏 🔊 连点 5 次开关（图标变 🛠），作用只是让 `getCampaignProgress()` 返回满进度——所有解锁门槛都从它推，所以一处撒谎即全解锁。写进度走 `rawCampaignProgress()`，真实存档不被污染 |
| `balance-report.mjs` | `npm run balance` 的入口（角色之间平不平衡） |
| `difficulty-check.mjs` | 难度公平性诊断（玩家打得过哪一档）。**玩家替身不是 aiHard**——那是完美玩家，会把每一档都校偏；现在用 `ai.js` 的 `makeAi` 造三档人类替身（熟手/一般/生手，靠 `noise` 分档），公平线是「该水平玩家自己打自己」。属性加成读 `combat.js` 的 `DIFFICULTY_MODS` |
| `campaign-check.mjs` | 战役难度曲线诊断（8 关分别有多难）。阵容 / AI档 / `enemyMod` 全读 `campaign.js`，属性加成走 `combat.js` 的 `applyStageMod`。**改完战役数据必跑** |
| `depth-check.mjs` | **策略深度诊断**：把玩家替身的水平从「完美」降到「闭眼乱按」，胜率落差 = 打得好值多少。前三份 check 量的是「难不难」，这份量的是「策略有没有用」。见 `COMBAT_PLAN.md` |
| `choice-check.mjs` | **决策存在性诊断**：完美玩家的技能使用分布 + 无悬念回合占比。主流技能占比越高，玩家越是在执行而不是决策 |
| `skill-audit.mjs` | **技能承重诊断**：逐个禁掉技能看主人胜率掉多少。掉得多=支柱，不掉=死内容，**反而涨=AI 在用亏本技能**。它能分开「技能弱」和「AI 低估」这两种低使用率。噪声 ±3，小差异别当真 |
| `stun-check.mjs` | 把眩晕命中率钉死在 0% / 100%，量「负面上没上」值多少胜率——这段落差玩家完全碰不到 |
| `intent-value-check.mjs` | 拿 `sim.js` 的 `opts.intent` 开关做对照实验：意图公开到底值多少策略价值 |

### 踩过的坑（提炼）

完整的改动经过、实测数字和当时的推理过程见 [HISTORY.md](HISTORY.md)。
这里只留**每次动手前都该记得**的硬规则：

- **本作回合流程是「双方各行动一个单位」**：队伍人数不影响行动次数，只影响血池。
  所以单人 BOSS 每回合都出手，两人队的 BOSS 只能隔回合出手一次。
- **排关卡难度要用 `campaign-check.mjs` 实测**，不能拿「两个角色在 balance 里的胜率之和」预测——
  实测反例：和更高的阵容反而更难打。真正的驱动是队伍续航（对局回合数）。
- **校准战役关卡时必须锁定该关自己的场景**。用随机场景量出来的数会差 10 个百分点。
  场景 buff 本身就是很强的难度杠杆（同一组敌人换个场景，玩家胜率 26% → 48%）。
- **`enemyMod` 选 atk 还是 hp，看这一关敌方靠什么赢**：靠伤害用 atk，靠续航用 hp。
  「攻击是最强杠杆」只在对称随机阵容下成立，不能照搬到具体关卡。
- **`enemyMod` 存在真实断崖**（hp 差 0.01 能掉 8.6 个百分点，是「几刀砍得死」的整数阈值）。
  卡在缝里就取偏易的一侧。
- **简单 AI 拉不出低难度台阶**：不管配什么阵容都给玩家 90%+，所以战役只有第 1 关用 easy。
- **排序用的权重和绝对分数必须分开**。混在一起会让「在 A、B 之间选 A」
  悄悄变成「A 这件事整体更值得做」——AI 评分踩过一次，治疗整体涨价 50%。
- **重构掉一个状态字段时，要 grep 干净所有读取方**。`turnOrder` 那次留了三处死读，
  全都「读到 undefined 之后走了一条看似正常的分支」，不抛异常，潜伏很久。
- **纯功能性技能在这个战斗节奏下需要附带即时收益**。花一整回合只给 buff 几乎永远不划算。
- **解锁门槛不要各存一份进度**。墨皇难度 / 战役关卡 / 队友全都从 `inkfight_campaign` 推，
  所以调试模式只改一行就全解锁了。同一份知识两份实现，这个项目已经因此出过三次 bug。
- **慢环境是照妖镜**。`showResult` 被调用两次那个 bug，是浏览器把标签页降频之后才现形的。
