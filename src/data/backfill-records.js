// 手工补录的战绩。
//
// 战绩功能是 2026-09-02 才做的，在那之前打过的局没有数据留下来。
// 这里只放**有确凿凭据**（结算截图）的局，一条一条手抄进来，
// 并且全部带 `backfilled: true`——战绩室里会显示「补录」小标。
//
// **不隐瞒它是手填的。** 战绩的全部意义就是它是真的；
// 一条分不清是打出来的还是填出来的记录，会让整册战绩都失去意义。
//
// 补录的记录同样要过 record.js 的 `auditRecord`，
// 抄错一个数字（比如分项加起来对不上总伤害）会在 `npm test` 里当场报出来。

export const BACKFILLED_RECORDS = [
  {
    // 用户 2026-09-02 提供的结算截图：困难难度人机，赤焰熔岩，4v4，玩家1 胜。
    // 截图上没有时间，这里取当晚的一个近似值，因此显示时会注明是补录。
    id: 'backfill-20260902-lava-hard',
    at: Date.UTC(2026, 8, 2, 5, 50),      // 2026-09-02 01:50（美东）
    v: 1,
    mode: 'ai',
    diff: 'hard',
    scene: 'lava',
    rounds: 15,
    winner: 1,
    side: 1,
    backfilled: true,
    // 截图的「玩家1 总伤害 483 / 玩家2 总伤害 410」就是下面各行之和。
    p1: { dmg: 483, heal: 0,  kills: 2 },
    p2: { dmg: 410, heal: 30, kills: 3 },
    // 顺序照截图从上到下：先我方四人，再敌方四人。
    units: [
      { charId: 'archer',      name: '弓手',   player: 1, dmg: 230, heal: 0,  kills: 2 },
      { charId: 'mage',        name: '法师',   player: 1, dmg: 34,  heal: 0,  kills: 0 },
      { charId: 'bladedancer', name: '刀娘',   player: 1, dmg: 42,  heal: 0,  kills: 0 },
      { charId: 'onmyoji',     name: '阴阳师', player: 1, dmg: 177, heal: 0,  kills: 0 },
      { charId: 'assassin',    name: '刺客',   player: 2, dmg: 160, heal: 0,  kills: 0 },
      { charId: 'mage',        name: '法师',   player: 2, dmg: 64,  heal: 0,  kills: 2 },
      { charId: 'guardian',    name: '守卫',   player: 2, dmg: 90,  heal: 30, kills: 1 },
      { charId: 'drummer',     name: '鼓姬',   player: 2, dmg: 96,  heal: 0,  kills: 0 },
    ],
    maxHit: { dmg: 61, name: '刺客' },
  },
];
