# 墨境之战 (Ink Realm Clash)

火柴人回合制对战游戏，纯 HTML5 + Canvas，无外部依赖。

## 运行方式

需要通过 HTTP 服务器打开（ES modules 不支持 `file://`）：

- VS Code：安装 Live Server 插件，右键 `inkfight.html` → Open with Live Server
- 命令行：`npx serve .` 然后访问 `inkfight.html`

## 玩法

- 双方各选 2 名角色，轮流行动
- 键盘 `1-4` 释放技能，`ESC` 取消/退出
- SP 越满越容易被眩晕

## 角色

剑士、法师、守卫、刺客、牧师、狂战士、弓手、术士（共 8 名）

## 模块结构

| 文件 | 职责 |
|------|------|
| `inkfight.html` | HTML 结构 + CSS + 主逻辑 |
| `data.js` | 场景与角色数据 |
