# 场景美术工作流

这套流程用于新增或替换《墨境之战》的战场。目标是让场景有独立性，同时保持同一世界观，
并确保任何一张图加载失败时游戏仍可正常显示。

## 一张场景由什么组成

```text
assets/scenes/<scene-id>.webp       静态环境底图
src/data/data.js / SCENES.art       图片、遮罩、裁切、动态层和粒子配方
src/view/scene.js                   共用渲染器，一般不随新增场景修改
```

底图负责地点、空间、材质和光影；Canvas 只负责可循环的轻动态。规则效果仍在场景的
`buff` 字段中，美术配置不得参与战斗计算。

## 生成前先写“场景身份证”

每个场景先确定五项，不要直接抽图：

1. **视觉命题**：一句话说明这个地点在世界中的意义。
2. **空间结构**：横向、纵深、悬浮、封闭或开阔，只选一个主结构。
3. **主材质**：水、纸、岩、灰、木等，最多两个。
4. **主动态**：水光、火星、墨尘、落叶等，只选一个主动态。
5. **禁用项**：列出最容易让它变成通用 AI 壁纸的元素。

三个现有场景的区分基准：

| 场景 | 空间 | 材质 | 动势 | 色彩 |
|---|---|---|---|---|
| 墨色虚空 | 悬浮、大片留白 | 干墨、断纸 | 缓慢失重 | 炭黑、灰紫、冷银 |
| 赤焰熔岩 | 低矮横向、沉重 | 黑曜石、朱砂 | 上卷烟柱 | 墨黑、赭石、赤红 |
| 碧蓝灵泉 | 山谷纵深、湿润 | 水、矿物青 | 上升灵流 | 深青、青碧、微红 |

## 图像生成模板

以已采用的 `assets/scenes/spring.webp` 作为**世界媒介参考**，不要求新场景复制其构图。

```text
Use case: stylized-concept
Asset type: 16:9 static battle-scene background for a UI-heavy Chinese fantasy tactical game.
Input image: world-style reference only. Preserve Chinese ink, mineral pigment, rice-paper texture,
and large readable value masses; create a different place and spatial identity.
Primary request: <场景名 + 视觉命题>
Scene/backdrop: <地点、主材质、一个标志物、一个主动态>
Composition/framing: Four translucent character cards occupy the left and right middle zones;
a skill panel occupies the lower center. Keep the lower 38 percent dark and low-detail.
Keep both side zones quiet. Put the landmark and brightest detail in the upper central corridor.
Style/medium: Contemporary Chinese ink landscape, restrained mineral pigment, xuan-paper grain.
Lighting/mood: <光线与情绪>
Color palette: <3–5 个主色>
Constraints: Environment only; no people, creatures, weapons, text, logo, watermark, UI or frame.
Avoid: Generic anime, photorealism, neon, crowded particles, bright lower foreground,
<本场景自己的禁用项>.
```

生成规则：

- 先出一张，检查空间和 UI 留白；问题明确时只改一个变量再生成。
- 同批场景共用“媒介”，但必须改变空间结构、材质、动势和主色中的至少三项。
- 原始候选不进仓库，只保留最终采用图与提示词摘要。

## 接入步骤

1. 将采用图转成 WebP，放到 `assets/scenes/<scene-id>.webp`。
2. 尺寸保持 16:9 左右；单张必须低于 1MB，通常 150–500KB 足够。
3. 在 `src/data/data.js` 的 `SCENES` 新增条目和 `art` 配方：

```js
art: {
  image:'assets/scenes/new-scene.webp',
  position:'50% 45%',
  overlay:'linear-gradient(180deg, rgba(...), rgba(...))',
  preview:['#上方兜底色','#下方兜底色'],
  motion:'waterFlow',
  particles:{
    kind:'wisp', color:'#颜色', count:40,
    alpha:[.12,.4], radius:[.8,2.2], speed:[.08,.3]
  }
}
```

4. 优先复用现有 `motion`（`voidDrift`、`heatVeil`、`waterFlow`）和粒子类型
   （`rune`、`ember`、`wisp`）。只有新场景确实需要新的动态语言时才改 `scene.js`。
5. `bg` 必须保留，它是图片加载失败时的渐变兜底。
6. 运行 `npm test`；测试会检查图片存在、配置完整、路径不重复且单张低于 1MB。

## 浏览器验收

- 先静音，再进入场景选择页，确认缩略图就是战斗中的同一张图。
- 分别检查 1366×768 和 1920×1080：标志物不能被 `cover` 裁掉。
- 进入真实战斗检查角色名、HP/SP、意图、技能文字是否清楚。
- 动态层只能在静态截图之外增加生命感，不能盖住角色卡或造成明显卡顿。
- 测完关闭游戏标签页。

如果可读性有问题，调整顺序是：`overlay` → `position` → 粒子数量/透明度 → 回炉改图。
不要为了修 UI 遮挡而立即重画整张背景。
