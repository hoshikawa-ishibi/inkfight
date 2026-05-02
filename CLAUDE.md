# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Generate a new game
node generate-game.js

# Fix an existing game in ./game-output/
node fix-game.js
```

Requires `ANTHROPIC_AUTH_TOKEN` (or `ANTHROPIC_API_KEY`) environment variable. No build step, no test suite.

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
| `battle.js` | `initBattle`, `startBattle`, `getEffectiveAtk`, `previewDmg`, `renderSkillPanel`, `onTargetClick`, `cancelTargeting`, `confirmExit`, `addLog`, `clearLog`, `toggleLogPause` |
| `campaign.js` | `CAMPAIGN_STAGES`（8关剧情数据：阵容、场景、难度、剧情文本） |
| `main.js` | 入口：UI 流程、事件监听、`init*()` 调用、`window` 暴露 |

### 近期改动记录

- 音量控件移至左上角，ESC退出按钮保持右上角，消除重叠
- 技能按钮统一为 150×64px 固定尺寸
- 非战斗界面添加墨水粒子动态背景（`startMenuBackground`）
- BGM 系统重构：菜单用慢速琶音，战斗用鼓点+旋律，按场景变化音色；战斗BGM在 `startBattle()` 启动
- 角色平衡调整：刺客 ATK 24→21 / 闪避 18→12；弓手 ATK 18→20；守卫盾墙反击回血 25→15；牧师祝福持续 3→2 回合；术士灵能震荡 spScale 40→30
- **被动技能系统**：`data.js` 每个角色新增 `passive` 字段；`battle.js` 新增 `triggerPassive()` 函数，在 `processStartOfTurn`/`doDamage` 节点触发；技能面板下方展示被动名称和描述
- **结算界面增强**：追踪单位级别伤害/治疗/击杀；MVP 评分（伤害+治疗×1.5+击杀×80）；最高单次伤害记录；数字滚动动画
- **选阵容雷达图**：选角完成后显示 `screen-radar`，Canvas 绘制5维雷达图（攻击/防御/灵能/机动/支撑），确认后进入战斗

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
