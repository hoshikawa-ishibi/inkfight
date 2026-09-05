# inkfight 工作约定

本文件是当前开发约定的唯一来源。旧战役、SP、轮空回蓝、单人出手和旧战斗计划不属于当前规则；历史原因请查 Git 历史或 `docs/archive/`。

## 当前产品

游戏提供首页、墨路远征、同屏双人、人机、观战、角色档案和战绩室。所有战斗统一采用四人队伍、全队每轮共享 3 墨、每名队员每轮至多行动一次。技能消耗从共享墨池支付，余墨在收笔时转为全队护盾。远征在此基础上加入三战路线、遗物、伤势和独立存档。

保留全部 AI 生成的角色立绘。用户明确允许重写或删除其余代码、机制与资产；旧方案不能限制新设计。可按需委派较低成本的 subagent。3D 是主体表现，立绘是可切换视图和 WebGL 回退。Three.js 使用仓库内本地文件，不访问 CDN。

## 运行与验证

```bash
node serve-game.mjs                 # 静态服务器，http://localhost:5566/inkfight.html
npm test                            # Node 内置测试
npm run balance -- 4000             # 共享墨无头模拟
node tools/expedition-check.mjs 180  # 远征诊断
```

日常入口是桌面「墨境之战.lnk」，指向 `launch-game.vbs`。VBScript 必须保持纯 ASCII；修改后运行 `cscript //nologo launch-game.vbs`。端口被占用时服务器可直接退出。辅助软件与下载缓存放在 E 盘，项目保留原工作目录。

浏览器验证必须静音：先将 `localStorage.inkfight_muted` 设为 `'1'`，测试结束关闭标签页。测试结果要区分 Node、浏览器自动验收和普通玩家观察；尚未实际运行的平衡数字不得写入文档。

## 架构边界

`src/core`、`src/ai`、`src/data` 和 `tools` 应保持可在 Node 中导入；`src/game`、`src/view` 依赖 DOM。规则只放纯核心模块：

- `src/core/combat.js`：基础伤害、状态、被动、单位与场景规则。
- `src/core/ink-turn.js`：共享墨量、每人一次、连携、收笔护盾和远征行动状态。
- `src/core/skill-executor.js`：live、sim、预览共用技能执行入口。
- `src/core/state.js`：全局战斗状态与单位查询。
- `src/ai/ai-scoring.js`、`src/ai/ink-ai.js`：技能选择与共享墨决策。
- `src/game/battle.js`、`src/game/expedition.js`：流程编排，不复制规则。
- `src/core/expedition.js`：路线、遗物、伤势、旅程状态和存档校验。
- `src/core/record.js`、`src/core/share-code.js`：兼容旧战绩；记录带 `legacy` 或 `ink-v1` 规则集，远征结果不进入经典战绩。

同一规则不得在 live、sim、preview 各写一份。技能数据来自 `src/data/data.js`；给技能加字段时检查执行器、评分器和数据配置。

## 存档与兼容

`localStorage` 按 origin 隔离；localhost、GitHub Pages 和 `file://` 不共享。经典战绩和好友分享须继续读取旧格式，旧分享码的字段顺序不可改变；新字段只能追加。远征存档独立于经典记录，战斗中断从该战起点恢复。纯前端 HMAC 只是防随手改动，不是真认证。

## UI 与工程规则

当前页面集合是 `title`、`expedition`、`duel`、`archive`、`records`、`battle`、`result`。新增页面必须沿用 `[id^="screen-"]` 的显示机制，不能手抄屏幕列表。弹窗所有关闭路径都走统一 `dismiss()`。状态字段删除或改名后必须全仓库搜索读取方。

3D 战场只负责 canvas、标签、镜头和模型反馈；角色卡、墨量 HUD、技能 dock 由上层布局负责。3D 失败必须回退立绘。动画不改变战斗计算；`reduced-motion` 只减少表现。

## 提交边界

直接在 `main` 工作。用户已授权完成验证后自动 commit 并 push 到 `hoshikawa-ishibi/inkfight` 的 `main`；只有验证完成且用户未撤销授权时执行。不要提交未验证的平衡数字或混入旧战役入口。
