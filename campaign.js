// 战役模式关卡数据
//
// ── 阵容不是按剧情随手排的 ──────────────────────────────
// 难度实际由「敌方这一对角色配合起来有多强」决定，而**不是**两人单独胜率之和：
// 实测 狂战士+守卫（单独胜率和 93.5）只给玩家 41.9%，比 守卫+牧师（116.7）
// 还难打——真正的驱动是队伍续航（打 17~23 回合的都是硬仗）。
// 所以 8 关的阵容是按 campaign-check.mjs 实测的玩家胜率排的，
// 并且每个角色恰好出场两次。
//
// ── enemyMod：属性微调旋钮 ──────────────────────────────
// 数值含义见 combat.js 的 applyStageMod。选 hp 还是 atk 要看这一关的敌方
// 靠什么赢：靠伤害的用 atk，靠续航的用 hp。
// 实测第 8 关（术士+牧师）对 atk 几乎免疫（0.80~1.25 只从 39.1% 走到 24.8%），
// 但对 hp 极敏感（0.80 → 58.4%）——难度来自牧师的续航，不是伤害。
//
// ── 改动阵容或 enemyMod 后必须重跑 ──────────────────────
//   node campaign-check.mjs 3000
export const CAMPAIGN_STAGES = [
  {
    id: 1,
    title: '第一关：墨境初醒',
    scene: 'void',
    enemy: ['berserker', 'assassin'],
    difficulty: 'easy',
    // 简单 AI 弱到不管什么阵容都给玩家 96%+，只能靠加血把它压到 92
    enemyMod: { hp: 1.10 },
    intro: '墨境世界的边缘，一名狂徒与一道黑影拦住了你的去路。\n"外来者，此路不通。"',
    outro: '狂徒倒下，黑影遁入虚空。\n墨境的大门，向你敞开了。',
  },
  {
    id: 2,
    title: '第二关：赤焰试炼',
    scene: 'lava',
    enemy: ['swordsman', 'mage'],
    difficulty: 'normal',
    // 简单 AI 顶不到 85%（atk 拉到 1.25 也才 88.4%），改用普通 AI 再减血
    enemyMod: { hp: 0.90 },
    intro: '赤焰熔岩之地，一名剑士与一名法师守着古老的熔炉。\n剑士横刀："用你的血，来祭奠这片火海！"',
    outro: '烈焰熄灭，法阵崩散。\n熔炉的秘密，等待着你去揭开。',
  },
  {
    id: 3,
    title: '第三关：灵泉伏击',
    scene: 'spring',
    enemy: ['assassin', 'swordsman'],
    difficulty: 'normal',
    enemyMod: { hp: 1.05 },
    intro: '灵泉的水面毫无波澜——直到两道杀气从背后袭来。\n刺客低语："在这里，连水都不会记得你。"',
    outro: '伏击者反被击溃，灵泉恢复了平静。\n水面倒映出更深处的宫殿轮廓。',
  },
  {
    id: 4,
    title: '第四关：虚空关隘',
    scene: 'void',
    enemy: ['guardian', 'archer'],
    difficulty: 'normal',
    enemyMod: null,
    intro: '虚空中悬着一道关隘，守卫与弓手据守其上。\n守卫举盾："灵泉的力量，不属于你这样的人。"',
    outro: '关隘洞开，虚空的风终于安静下来。\n更深处，有什么在等着你。',
  },
  {
    id: 5,
    title: '第五关：熔岩双将',
    scene: 'lava',
    enemy: ['archer', 'warlock'],
    difficulty: 'normal',
    enemyMod: null,
    intro: '熔岩深处，墨皇的两名先锋将领严阵以待。\n"墨皇有令——格杀勿论。"',
    outro: '两将败北，熔岩中传来遥远的怒吼。\n墨皇的王座，已近在咫尺。',
  },
  {
    id: 6,
    title: '第六关：灵泉防线',
    scene: 'spring',
    enemy: ['mage', 'guardian'],
    difficulty: 'hard',
    enemyMod: null,
    intro: '灵泉的最后防线，由最精锐的卫士把守。\n法师冷声道："就算你走到这里，也休想再进一步！"',
    outro: '防线崩溃，灵泉之水涌向远方。\n前方，是墨皇的宫殿。',
  },
  {
    id: 7,
    title: '第七关：墨皇近卫',
    scene: 'void',
    enemy: ['priest', 'berserker'],
    difficulty: 'hard',
    enemyMod: { hp: 1.10 },
    intro: '墨皇宫殿门前，两名近卫展开了最后的阻拦。\n牧师低吟："墨皇赐予我们力量，你无法通过。"',
    outro: '近卫倒下，宫殿大门缓缓开启。\n黑暗中，一道威严的声音传来："……终于来了。"',
  },
  {
    id: 8,
    title: '最终关：墨皇决战',
    scene: 'lava',
    enemy: ['warlock', 'priest'],
    difficulty: 'hard',
    // 术士+牧师是全游戏最强组合，但熔岩的 +15% 伤害正好克制牧师续航
    // （同一阵容在虚空只给玩家 26.2%，在熔岩有 47.7%），所以这里反而要加血
    enemyMod: { hp: 1.05 },
    intro: '墨皇现身，身旁是他最后的圣女。\n"你的旅途，到此为止。墨境，永远是我的。"\n\n——这是最后的决战。',
    outro: '墨皇的力量消散，墨境的天空第一次出现了光芒。\n\n"也许……墨境需要的，从来不是统治，而是自由。"\n\n【战役通关！墨境之战，你赢了。】',
  },
];

// 关卡敌方阵容的统一读法。Phase 2 会把 enemy 扩展成带身份的对象（{id, name}），
// 这里先收敛成一个入口，免得 battle.js 和 campaign-check.mjs 各写一份解析。
export function enemyIds(stage){
  return stage.enemy.map(e => typeof e === 'string' ? e : e.id);
}
