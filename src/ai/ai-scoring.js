// AI 技能评分：ai.js（玩家对战）与 sim.js（平衡测试）共用的唯一一份实现。
//
// 此前两边各有一套：ai.js 用经验分（score=22/30/80），sim.js 用等效伤害。
// 结果是平衡测试测的根本不是玩家面对的 AI，而且给技能加字段时改一处忘另一处
// 就会漂移（「狂暴」加 power 后 AI 放它不造成伤害、玩家放却会）。
//
// 统一采用「等效伤害」尺度：把每种技能的收益都折算成伤害当量，17 种技能类型
// 才能横向比较。难度差异由 ai.js 在此之上做包装（噪声 + 战术加成），
// 而不是各写一套评分。

import { getEffectiveAtk, countCorrupt, BUFF_DEFAULTS, needsEnemyTarget, canInterrupt, willCrit, canUseSkill, CORRUPT_BONUS_PER_STACK, previewInterruptedSkill } from '../core/combat.js';

// 技能评分：把每种技能的收益统一折算成「等效伤害」，好让 17 种技能类型
// 能够横向比较。旧版本只给 damage/heal/stun/drain 四种打分，其余 13 种
// 只拿 cost×0.5，结果是术士的瘟疫、守卫的铁壁嘲讽等技能在几千局里
// 一次都没被使用过，统计出来的胜率并不反映角色真实强度。
//
// 条件性技能（净化 / 腐化爆发 / 治疗）在条件不满足时必须给接近 0 的分，
// 否则 AI 会白白浪费一个回合。
const KILL_BONUS = 60;      // 能补掉一个目标的额外价值
const SP_STARVED = 0.35;    // SP 低于这个比例才认为「缺蓝」
const DOT_DISCOUNT = 0.65;  // 中毒是延迟伤害，目标先死就收不满，见 riders

// ── 队伍战术上下文 ───────────────────────────────────────
// 同一支队伍的单位之间共享，用来记住「整队正在集火谁」。
//
// 只存 focusTarget 一项。原计划还打算记 buffedThisRound / lastActedRound，
// 实现时发现两者都是多余的：技能是**立即结算**的，队友干了什么直接写在单位
// 身上（buff 已经挂上、目标已经死了），从单位状态读比另记一份账更准；
// 而「回合」在 battle.js 与 sim.js 里含义还不一样——battle.js 一个回合只走
// 「我方一个单位 + 敌方一个单位」，同队两个单位分属相邻的两个回合，
// 按 round 清空反而永远清在错的时机。集火是唯一真正需要跨单位记忆的行为，
// 因为「整队决定先杀谁」没法从战场状态反推出来。
export function makeTeamContext(){
  return { focusTarget: null };
}

function bestPower(u){
  const ps = u.skills.filter(k => k.power).map(k => k.power);
  return ps.length ? Math.max(...ps) : 1;
}

// 威胁度：这个单位一回合最多能产出多少「等效伤害」。
// 治疗必须算进来。只按攻击力算的话，牧师（atk 10、最高倍率 1.0）是全场
// 威胁最低的单位，敌方奶妈于是永远排不进集火名单——实测这么跑 10000 局，
// 牧师胜率直接飙到 65.2%，纯粹是 AI 的盲区，不是角色真的强。
// 一个没人管的牧师每回合抵消掉 48 点伤害，那它就值 48 点威胁。
function threatOf(u){
  const dmg = getEffectiveAtk(u) * bestPower(u);
  const heal = Math.max(0, ...u.skills.map(k => k.healAmt || 0));
  return Math.max(dmg, heal);
}

// 击杀性价比 = 威胁度 / 有效血量。数值越高越该先杀。
// 只看当前 HP 会挑错人：满血的法师（92HP/def3）比掉了血的守卫（155HP/def9）
// 好杀得多，威胁也更大。护盾和减伤都要折进有效血量，
// 否则 AI 会去啃一个刚开了 45 点护盾的坦克。
function killValue(f){
  const dmgMul = 1 - f.def/(f.def + 50);
  const ehp = Math.max(1, (f.hp + (f.shield||0)) / Math.max(0.05, dmgMul));
  return threatOf(f) / ehp;
}

// 整队集火的目标。teamwork=0 时不使用上下文，纯按性价比选（低难度不会配合）。
// 换目标要有明显收益才换（阈值 25%），否则两个单位会为了一两点血差
// 在两个敌人之间反复横跳，谁也磨不死。
export function focusFoe(foes, ctx, teamwork = 1){
  if(!foes.length) return null;
  const taunter = foes.find(e => e.buffs.some(b => b.type === 'taunt'));
  if(taunter) return taunter;                     // 被嘲讽了就没得选
  const best = foes.reduce((a,b)=> killValue(a) >= killValue(b) ? a : b);
  if(!ctx || !teamwork) return best;
  if(ctx.focusTarget && !ctx.focusTarget.alive) ctx.focusTarget = null;
  const focus = foes.includes(ctx.focusTarget) ? ctx.focusTarget : null;
  if(focus && killValue(focus) * 1.25 >= killValue(best)) return focus;
  return best;
}

// 打断的目标：只有 SP 够满、又不在免疫期的目标才打得断（规则在 combat.js 的
// `canInterrupt`）。**scoreSkill 和 pickTarget 必须共用这一份**——
// 这两处历史上各挑各的（评分挑「最容易晕的」、实际却打在集火目标身上），
// 于是算出来的收益和实际发生的事对不上。
// 一个都打不断时退回集火目标：技能自带伤害，不至于白扔一个回合。
export function stunTarget(foes, skill, ctx, tw = 1){
  if(!foes.length) return null;
  const taunter = foes.find(e => e.buffs.some(b => b.type === 'taunt'));
  if(taunter) return taunter;                       // 被嘲讽了就没得选
  const hittable = foes.filter(f => canInterrupt(f, skill));
  if(!hittable.length) return focusFoe(foes, ctx, tw);
  // 打得断的里面挑威胁最大的——打断的收益就是「它少打的那一下」
  return hittable.reduce((a, b) => threatOf(a) >= threatOf(b) ? a : b);
}

// 伤害类技能的收益。超出目标有效血量的部分打不出去（40 点伤害砸在 5 血的
// 敌人身上有 35 点白给），而且技能越贵、溢出越多，越不该拿它来补这一刀——
// 免费的普攻明明也能杀。不封顶的话 AI 永远用大招收最后一丝血。
function damageWorth(d, foe, skill){
  const ehp = foe.hp + (foe.shield || 0);
  if(d < ehp) return d;
  return ehp + KILL_BONUS - (skill.cost || 0) * (1 - ehp / d);
}

// 治疗的实际收益：只有「治疗量」与「缺失血量」的较小值真正生效，
// 溢出的治疗是浪费。队友越濒危越值钱。
function healGain(f, skill){
  const usable = Math.min(skill.healAmt || 0, f.maxHp - f.hp);
  return usable * (f.hp/f.maxHp < 0.35 ? 1.8 : 1.0);
}

// 选谁来治：在实际收益之上，按队友的产出加权——同样缺 48 血，
// 把法师奶回来比把坦克奶满更能赢。这一项**只用于排序**，不能拿去当分数，
// 否则「优先救输出高的」会连带把治疗这个技能整体抬价，牧师就开始滥治疗了。
// `incoming` 是承诺制公开出来的下一击（`{unitId,targetId,dmg}`），可缺省。
// 注意它和 `topThreat` 不是一回事：后者指「队友里产出最高的那个」，
// 这里指「敌人下一记要打谁」。
function healPriority(f, skill, topThreat, tw, incoming){
  const value = topThreat > 0 ? 1 + tw * 0.5 * threatOf(f)/topThreat : 1;
  // 已知下一击落在它头上而且打得死：先奶它是保命，不是补血，优先级要压过一切。
  const doomed = (incoming && incoming.targetId === f.id
    && (incoming.dmg || 0) >= f.hp + (f.shield || 0)) ? 2.2 : 1;
  return healGain(f, skill) * value * doomed;
}

// 注意：全队满血时也**必须**返回一个合法队友，不能返回 null。
// 评分那边已经把「没人受伤」的治疗算成 0 收益（healGain 为 0，再减 tempo 就是负分），
// 但负分不等于不会被选中——简单难度的噪声高达 30，照样可能挑中它。
// 早期版本这里返回 null，结果 battle.js 的 `target.hp` 直接崩：
// 「AI 蠢到给满血队友放治疗」是可以接受的，「AI 一放治疗就抛异常」不行。
function healTarget(friends, skill, tw, incoming){
  if(!friends.length) return null;
  const hurt = friends.filter(f => f.hp < f.maxHp);
  const pool = hurt.length ? hurt : friends;
  const topThreat = Math.max(...friends.map(threatOf));
  return pool.reduce((a,b)=>
    healPriority(a, skill, topThreat, tw, incoming) >= healPriority(b, skill, topThreat, tw, incoming) ? a : b);
}

// 加攻目标：优先给还没带同类 buff 的人。牧师连着两回合祝福同一个人，
// 第二次只是把 dur 刷新一下，等于白扔一个回合。
function buffTarget(friends, skill, tw){
  const fresh = friends.filter(f => !f.buffs.some(b => b.type === skill.buffType));
  const pool = (tw > 0 && fresh.length) ? fresh : friends;
  if(!pool.length) return null;
  return pool.reduce((a,b)=> getEffectiveAtk(a) >= getEffectiveAtk(b) ? a : b);
}

// 这回合派谁上？（COMBAT_PLAN.md 任务 5）
//
// 本作原来是**严格轮流**：两个单位交替出手，队伍人数不影响行动次数。
// 那等于每局只有开局一次选择，之后顺序全定死——一个白白丢掉的决策点。
//
// 改成自由挑之后必须配上「轮空回蓝」（见 combat.js 的 applyRestRegen），
// 否则会退化成「一直派最强的那个」：实测纯自由挑时连续派同一个单位占 78%，
// 加了轮空回蓝之后降到 47%（47% ≈ 没有偏好，也就是真的在按局势选）。
//
// **battle.js 的玩家回合、AI 回合、以及意图预测三处必须共用这一份**——
// 意图预测算的是「哪个敌人会动」，和实际动的必须是同一个，
// 否则「预告的是 A、实际动的是 B」，承诺制就塌了。
export function pickActor(team, foes, scene, opts = {}){
  const alive = team.filter(u => u.alive);
  if(alive.length <= 1) return alive[0] || null;
  const live = foes.filter(f => f.alive);
  if(!live.length) return alive[0];
  const best = u => {
    const usable = u.skills.filter(sk => canUseSkill(u, sk));
    if(!usable.length) return -Infinity;
    return Math.max(...usable.map(sk => scoreSkill(u, sk, live, alive, scene, opts)));
  };
  return alive.reduce((a, b) => best(a) >= best(b) ? a : b);
}

// opts.tempo 是「机会成本」的权重（0~1，默认 1 = 完全计入）：
// 低难度的 AI 算不清「这回合拿去加 buff 就少打一轮」这笔长远账，
// 于是会在该输出的时候去开增益。这是真实的水平差距，比单纯加随机噪声更像人。
// 注意不能直接归零——实测守卫在 tempo=0 时 98% 的回合都在开护盾，
// 满血还狂加盾，反而比「只会平A」的简单难度更差，梯度会倒挂。
//
// opts.teamwork（0~1，默认 1）是「配合」类判断的权重：集火、不重复上 buff、
// 队友濒危时顶上去、优先救输出高的。低难度的 AI 各打各的。
// opts.ctx 是队伍战术上下文（见 makeTeamContext），缺省则退化为单打独斗。
export function scoreSkill(u, s, foes, friends, scene, opts = {}){
  // 被扰乱时仍然可以自由选技能，但这一次伤害 / 治疗只有 60%。AI 必须按
  // 玩家实际会得到的结果算分；护盾、净化等功能技能不受影响，因而自然成为应对。
  s = previewInterruptedSkill(u, s);
  const atk = getEffectiveAtk(u);
  const sceneMul = scene?.buff === 'damageUp' ? 1.15 : 1;   // scene 可缺省
  // 粗估：无视防御的伤害（中毒等）按原值算，普通伤害按目标平均减伤折算
  const avgDefMul = 1 - (foes.reduce((n,f)=>n+f.def,0)/foes.length) / ((foes.reduce((n,f)=>n+f.def,0)/foes.length) + 50);
  // 暴击是确定的了（蓄能条），所以评分也必须把它算进来——否则 AI 不会
  // 「留着大招砸在必暴的那一刀上」，而那正是任务 2b 想创造的决策。
  // 注意倍率要按**这个技能自己的** crit 加成算（暗影突袭自带 +40）。
  const dmgOf = (p, sk) => atk * (p||1) * sceneMul * avgDefMul
    * (sk && willCrit(u, sk) ? 1.5 : 1);

  // ── 已知的下一击 ─────────────────────────────────────
  // 承诺制公开出来的敌方意图（`opts.threat = {unitId, targetId, dmg}`）。
  // 只有看得见意图的一方拿得到它——真实游戏里就是玩家。
  //
  // **这是「防御类技能值不值一个回合」的唯一可靠依据。** 不知道下一击是什么
  // 的时候，开盾 / 闪避 / 嘲讽全是赌博，评分只能按平均伤害瞎估，所以它们
  // 长期被低估（实测「消失」「不屈」使用率是 0%）。知道了之后这就是算术：
  // 「这一记 68 伤害，我花一个回合把它变成 0，划不划算」。
  //
  // 不给这一项的话，difficulty-check 的玩家替身就是个**无视核心机制的玩家**，
  // 量出来的每一个难度数字都失真。
  // 字段名必须和 intent.js 的 `makeIntent` 一致：**是 `estDmg` 不是 `dmg`**。
  // 第一版这里写的 `threat.dmg`，恒定读到 undefined，于是威胁值永远是 0，
  // 防御类技能一个都没被救活——而且不报错，只是「看起来没效果」。
  const threat = opts.threat || null;
  const threatDmg = threat ? (threat.estDmg || 0) : 0;
  const threatOnMe = (threat && threat.targetId === u.id) ? threatDmg : 0;
  const threatOnAlly = (threat && threat.targetId && threat.targetId !== u.id) ? threatDmg : 0;

  const tw = opts.teamwork ?? 1;
  // 评分和选目标必须看同一个目标，否则会出现「按 A 的血量算能补刀、
  // 实际却打在 B 身上」。两边都走 focusFoe。这里不写回 ctx——
  // 评分要对每个技能各跑一次，中途改集火目标等于让技能顺序影响结果。
  const mainFoe = focusFoe(foes, opts.ctx, tw) || foes[0];
  const hpFrac = u.hp / u.maxHp;

  // 抢杀：赶在预告兑现之前把那个单位打死，等于顺手把那一击也抵消了。
  // 只在「集火目标恰好就是放话的那个」时计入——评分和选目标必须看同一个目标，
  // 否则会算出「打 A 能抵消威胁」却实际打在 B 身上。
  const preempt = (foe, d) =>
    (threat && foe && threat.unitId === foe.id && d >= (foe.hp + (foe.shield || 0))) ? threatDmg : 0;

  // ── 技能的「附带效果」值多少 ──────────────────────────
  // **这里以前是空白**：`case 'damage'` 只算 `power`，完全不看 dot / debuff /
  // corrupt。后果是系统性的误判——skill-audit 实测「禁掉刺客的暗影突袭，
  // 胜率反而 +11.3」，因为省下的 30 SP 拿去放毒刃更划算，而毒刃那
  // 24 点无视防御的毒伤 AI 根本看不见。剑士的破甲突刺同理（减防不计分）。
  //
  // 目标已经被这一击打死的话，附带效果全部落空，所以要先判存活。
  // 主动充能（刀娘「蓄刃」）：只有真的能把下一刀顶成必暴才值钱。
  // 不这么判的话 AI 会在满能时继续瞎充，白扔回合。
  const chargeWorth = (sk) => {
    if(!sk.critCharge) return 0;
    const meter = (u.critMeter || 0) + sk.critCharge;
    if(meter < 100) return sk.critCharge * 0.15;      // 还没满，只值一点点
    const best = Math.max(1, ...u.skills.filter(k=>k.power).map(k=>k.power));
    return atk * best * avgDefMul * 0.5;              // 顶满了 = 下一刀白赚半倍
  };

  const riders = (sk, foe, d) => {
    if(!foe) return 0;
    const survives = d < foe.hp + (foe.shield || 0);
    if(!survives) return 0;
    let v = 0;
    // 中毒无视防御，但**是延迟到账的**：分 dotDur 个回合慢慢掉，
    // 目标中途死了剩下的就白给。按全额算会矫枉过正——实测不打折时
    // 刺客的「毒刃」使用率冲到 77%，等于制造了一个新的支配性技能。
    v += (sk.dot || 0) * (sk.dotDur || 0) * DOT_DISCOUNT;
    // 减防：后续每一下多打 20%。按「这段时间里大约还能再打 debuffDur 下」估，
    // 再打个六折——队友不一定接得上，目标也可能先死。
    if(sk.debuff === 'defDown') v += atk * bestPower(u) * avgDefMul * 0.2 * (sk.debuffDur || 0) * 0.6;
    // 腐化层只对带「腐化侵蚀」被动的角色有额外价值（每层每次攻击 +8）
    if(sk.corrupt && u.passive?.effect === 'corruptBonus') v += sk.corrupt * CORRUPT_BONUS_PER_STACK;
    return v;
  };

  // 队友保护：队友越危险，护盾/嘲讽这类顶在前面的技能越该优先。
  // 这一项以前只存在于 ai.js 的困难难度加成里，平衡测试完全吃不到。
  const others = friends.filter(f => f !== u);
  const allyDanger = others.length ? Math.min(...others.map(f => f.hp/f.maxHp)) : 1;
  const protect = (allyDanger < 0.3 ? 1 : allyDanger < 0.5 ? 0.45 : 0) * tw;

  // 辅助技能要占掉一整个回合，这回合本可以打出的最高伤害就是它的机会成本。
  // 不减掉它，buff / 护盾 / 嘲讽一类技能的分数全是虚高的——实测狂战士因此
  // 频繁开「狂暴」，而开一次刚好把增伤赚回来又倒亏血，胜率反而下滑。
  const dmgOptions = u.skills.filter(k => k.power && canUseSkill(u, k));
  const tempoW = opts.tempo ?? 1;
  const tempo = (tempoW > 0 && dmgOptions.length)
    ? Math.max(...dmgOptions.map(k => atk * k.power * sceneMul * avgDefMul)) * tempoW : 0;

  switch(s.type){
    case 'damage': {
      const d = dmgOf(s.power, s);
      return damageWorth(d, mainFoe, s) + riders(s, mainFoe, d) + chargeWorth(s) + preempt(mainFoe, d);
    }

    case 'damageAll':
      // 打到每个存活敌人，但单体收益略低于同威力的单体技能
      return dmgOf(s.power, s) * foes.length * 0.9;

    case 'drain': {
      const d = dmgOf(s.power, s);
      // 吸血按实际打出的伤害算，溢杀的部分照样吸得回来，所以这里不封顶
      const healed = Math.min(d * (s.drainPct/100), u.maxHp - u.hp);
      return damageWorth(d, mainFoe, s) + healed * 0.8 + riders(s, mainFoe, d) + preempt(mainFoe, d);
    }

    case 'stun': {
      // 打断是**确定性**的了（见 combat.js 的 calcStun）：没有概率可算，
      // 只有「打得断 / 打不断」。目标和 pickTarget 共用 stunTarget。
      const cand = stunTarget(foes, s, opts.ctx, tw) || mainFoe;
      const works = canInterrupt(cand, s);
      // 收益 = 它少打的那一下。已知它下一步要干什么时就用真实数字，
      // 取两者较大：预告是治疗/增益类时 threatDmg 为 0，那就退回 threatOf。
      const fullLost = works
        ? ((threat && threat.unitId === cand.id)
            ? Math.max(threatDmg, threatOf(cand)) : threatOf(cand))
        : 0;
      // interrupt-check.mjs 会在技能深拷贝上临时切换历史候选规则。
      // 正式数据不写 interruptMode，默认是下一次行动伤害 / 治疗降低 40%。
      let controlWorth = fullLost * 0.4;
      if(s.interruptMode === 'weaken')
        controlWorth = fullLost * (1 - (s.interruptWeaken ?? 0.6));
      else if(s.interruptMode === 'skip')
        controlWorth = fullLost;
      else if(s.interruptMode === 'drain')
        controlWorth = works ? cand.maxSp * (s.interruptDrain ?? 0.3) * 0.55 : 0;
      else if(s.interruptMode === 'none')
        controlWorth = 0;
      // 带 power 的打断技能自带一次伤害，打不断时它就退化成一个普通伤害技能
      const d = dmgOf(s.power || 0, s);
      return damageWorth(d, cand, s) + riders(s, cand, d) + controlWorth + preempt(cand, d);
    }

    case 'plague': {
      // 中毒无视防御，且是 AoE：预期总伤害 = dot × 持续回合 × 敌人数
      const poison = (s.dot||0) * (s.dotDur||0) * foes.length;
      // 腐化层本身对带 corruptBonus 被动的角色才有额外价值
      const corruptWorth = u.passive?.effect === 'corruptBonus'
        ? (s.corrupt||0) * foes.length * CORRUPT_BONUS_PER_STACK : 0;
      return poison + corruptWorth;
    }

    case 'corruptBurst': {
      // 没有腐化层时是纯浪费回合
      const stacks = foes.reduce((n,f)=> n + countCorrupt(f), 0);
      return stacks * (s.dmgPerStack||0);
    }

    // ── 新 8 人的群体支援三件套（ROSTER_PLAN.md） ──────────
    case 'healAll': {
      // 只有真正吃得下的治疗才算数，溢出全是浪费
      const usable = friends.reduce((n2,f)=> n2 + Math.min(s.healAmt||0, f.maxHp - f.hp), 0);
      const hurt = friends.filter(f => f.hp/f.maxHp < 0.5).length;
      return usable * (1 + 0.25 * hurt) - tempo * 0.6;
    }

    case 'shieldAll': {
      // 已经有盾的人身上再叠收益递减，和单体 shield 同一个口径
      const worth = friends.reduce((n2,f)=> n2 + (s.shieldAmt||0) * (f.shield > 0 ? 0.4 : 0.85), 0);
      // 已知有一击要落下时，护盾是确定收益（同 case 'shield' 的道理）
      const blocks = Math.min(s.shieldAmt||0, threatDmg);
      return worth + blocks * 0.9 - tempo;
    }

    case 'buffAll': {
      const val = s.buffValue ?? BUFF_DEFAULTS.allyBuff;
      // 已经带着同类 buff 的人再上一次只是刷新时长，几乎白给
      const gain = friends.reduce((n2,f)=>{
        const dup = f.buffs.some(b => b.type === s.buffType);
        return n2 + getEffectiveAtk(f) * val * (s.dur||1) * 0.85 * (dup ? 1 - 0.85*tw : 1);
      }, 0);
      return gain - tempo;
    }

    case 'heal': {
      const target = healTarget(friends, s, tw, threat);
      // 全队满血时 healGain 为 0，减掉机会成本就是负分，AI 自然不会选它
      if(!target) return 0;
      // 预读治疗：这一击本来打得死它，先奶起来就等于抵消掉一次击杀。
      // 只有「奶完真的活得下来」才算数，奶不住的话这一回合还是白扔。
      const healed = Math.min(s.healAmt || 0, target.maxHp - target.hp);
      const ehp = target.hp + (target.shield || 0);
      const saves = (threat && threat.targetId === target.id
        && threatDmg >= ehp && ehp + healed > threatDmg) ? threatDmg * 0.8 : 0;
      return healGain(target, s) + saves - tempo * 0.6;
    }

    case 'cleanse': {
      // 没有负面可清时，它退化成一个小治疗——所以不再是「毫无价值」。
      // 这个即时收益是 2026-08-26 加的：skill-audit 实测纯净化禁掉反而 +2.8。
      const bad = friends.reduce((n,f)=> n + f.debuffs.length + ((f.disrupted||f.stunned)?1:0), 0);
      const t = healTarget(friends, s, tw, threat);
      const heal = t ? Math.min(s.healAmt || 0, t.maxHp - t.hp) : 0;
      return bad * 22 + heal - tempo;
    }

    case 'buff': {
      // 给还活着的队友加攻：预期多打出来的伤害
      const target = buffTarget(friends, s, tw);
      if(!target) return 0;
      const buffVal = s.buffValue ?? BUFF_DEFAULTS.allyBuff;
      const gain = getEffectiveAtk(target) * buffVal * (s.dur||1) * 0.9;
      // 全队都已经带着同类 buff：再放一次只是刷新 dur，基本等于空过一回合
      const dup = target.buffs.some(b => b.type === s.buffType);
      return gain * (dup ? 1 - 0.85 * tw : 1) - tempo;
    }

    case 'selfBuff': {
      // 增伤是乘在技能倍率上的，不能只按裸 atk 算，否则算出来永远是负分。
      // 强度和自损都要读技能实际配置，不能写死默认值——否则改了 data.js 也不生效。
      const myBest = Math.max(1, ...u.skills.filter(k=>k.power).map(k=>k.power));
      const buffVal = s.buffValue ?? BUFF_DEFAULTS.selfBuff;
      const gain = atk * myBest * buffVal * (s.dur||1) * avgDefMul;
      const perTurn = s.buffType === 'berserk' ? (s.selfDmg ?? BUFF_DEFAULTS.berserkSelfDmg) : 0;
      const cost = perTurn * (s.dur||1) * (hpFrac < 0.4 ? 3 : 1);
      // 带 power 的边打边上 buff，不算浪费回合
      const immediate = s.power ? dmgOf(s.power, s) : 0;
      return immediate + gain - cost - (s.power ? 0 : tempo);
    }

    // ── 防御三兄弟：护盾 / 嘲讽 / 闪避 ─────────────────────
    // **机会成本（tempo）只该扣在「猜」的那部分上，不该扣在「算」的那部分上。**
    //
    // 这里以前一律 `收益 - tempo`，而伤害技能算的是毛收益（打出多少）。
    // 等于防御方按净收益、进攻方按毛收益来比大小，防御类永远比不过——
    // 实测「消失」「不屈」的使用率长期是 0%，根因就在这个不对称。
    //
    // 意图公开之后，「挡掉预告的那一击」是**确定且当场兑现**的收益，
    // 和「打出多少伤害」是同一个量纲，可以直接比。所以拆成两段：
    //   已知威胁驱动的部分 → 不扣 tempo，正面和伤害技能比
    //   没有情报时的估算   → 照旧扣 tempo（那才是真的在赌）
    case 'shield': {
      // 护盾等价于同量治疗，但能提前吃伤害；已有盾时收益递减
      const worth = (s.shieldAmt||0) * (u.shield > 0 ? 0.4 : 0.85);
      // 自己身上挂着嘲讽时，加盾就是在替队友挡刀，价值更高
      const taunting = u.buffs.some(b => b.type === 'taunt') ? 1.6 : 1;
      const guess = worth * (hpFrac < 0.5 ? 1.3 : 1.0) + protect * 22 * taunting - tempo;
      // 真正挡掉的量是 min(盾量, 那一击)，超出的部分是白给的
      const blocks = Math.min(s.shieldAmt||0, threatOnMe);
      return blocks > 0 ? blocks * 0.95 + Math.max(0, guess) : guess;
    }

    case 'taunt': {
      // 把火力吸到自己身上：自己越硬、队友越危险，越值
      const allyRisk = 12 + protect * 48;
      // 带 power 的嘲讽自带一次攻击（目前 data.js 没配，留着是为了 BOSS 招式）
      const hit = s.power ? damageWorth(dmgOf(s.power, s), mainFoe, s) : 0;
      const guess = allyRisk * (hpFrac > 0.5 ? 1.2 : 0.5) + hit - (s.power ? 0 : tempo);
      // 预告打的是队友：嘲讽把它改道到自己身上，省下的就是
      // 「同一击打在队友身上 vs 打在我身上」的血量差。我越扛揍越划算。
      if(threatOnAlly > 0 && u.hp > threatOnAlly){
        const myMul = 1 - u.def/(u.def + 50);
        const saved = threatOnAlly * (1 - myMul) + threatOnAlly * 0.3;
        return saved + Math.max(0, guess);
      }
      return guess;
    }

    case 'dodge': {
      // 免疫下一次攻击。知道那一击是什么的时候收益是全额且确定的。
      if(threatOnMe > 0) return threatOnMe;
      // 不知道时只能按平均攻击力瞎估——那才是在赌，照旧扣机会成本
      return foes.reduce((n,f)=>n+getEffectiveAtk(f),0)/foes.length
        * (hpFrac < 0.4 ? 1.4 : 0.7) - tempo;
    }

    case 'revive': {
      // 不屈：血越少越该开
      const guess = (hpFrac < 0.35 ? (s.hpRestore||0) * 1.5 : (s.hpRestore||0) * 0.25) - tempo;
      // 已知那一击正好能打死自己：这就是保命符，价值等于「不死」本身
      if(threatOnMe >= u.hp + (u.shield||0)) return (s.hpRestore||0) + threatOnMe * 0.5;
      return guess;
    }

    case 'healSp': {
      // 回蓝的价值取决于它能解锁什么；不缺蓝时基本没用
      const locked = u.skills.filter(k => k.cost > u.sp && k.cost <= u.sp + (s.spGain||0));
      const unlockWorth = locked.length ? Math.max(...locked.map(k => atk * (k.power||1.2))) * 0.5 : 0;
      const starved = u.sp / u.maxSp < SP_STARVED ? 1.5 : 0.6;
      // 「每点 SP 恒定值 0.35 伤害」这个白送项是错的：不缺蓝的时候多出来的
      // SP 一点用都没有。skill-audit 实测禁掉「剑气」胜率 +6.8、禁掉「集中」
      // +3.5——AI 一直在花整回合换用不上的蓝。只在真缺蓝时才计这一项。
      const spWorth = u.sp / u.maxSp < SP_STARVED ? (s.spGain||0) * 0.35 : 0;
      // 自损换蓝在残血时是自杀（剑士「剑气」-18HP）：惩罚必须随血量放大，
      // 否则 AI 会把自己耗死。
      const hpRisk = (s.hpCost||0) * (hpFrac < 0.35 ? 6 : hpFrac < 0.6 ? 1.8 : 0.6);
      // 机会成本按**全额**算：花一回合回蓝，这回合的输出就是全没了，
      // 不是少了一半。原来写的 `tempo * 0.5` 是这一族技能被高估的主因。
      return (unlockWorth + spWorth) * starved + chargeWorth(s) - hpRisk - tempo;
    }

    default:
      return s.cost * 0.5;
  }
}

// opts 与 scoreSkill 同源（ctx / teamwork），保证「算分时看的目标」和
// 「实际打的目标」是同一个。这里是唯一会写回 ctx.focusTarget 的地方：
// 决策已经定了，才把集火目标登记给队友。
export function pickTarget(actor, skill, enemies, allies, opts = {}){
  const foes = enemies.filter(e=>e.alive);
  const friends = allies.filter(a=>a.alive);
  const tw = opts.teamwork ?? 1;
  const ctx = opts.ctx;

  // 打断有自己的挑人规则（要挑打得断的），必须走和 scoreSkill 同一份实现。
  // 放在 needsEnemyTarget 之前——'stun' 也在那个列表里，会被它先截走。
  if(skill.type === 'stun'){
    // 不写回 ctx.focusTarget：打断是一次针对性的操作，不代表整队改集火。
    return stunTarget(foes, skill, ctx, tw);
  }

  if(needsEnemyTarget(skill)){
    const focus = focusFoe(foes, ctx, tw);
    if(ctx && tw && focus) ctx.focusTarget = focus;
    return focus;
  }

  switch(skill.type){
    case 'heal':
      // 必须和 scoreSkill 传一样的 threat，否则会「按 A 算分、实际奶在 B 身上」
      return healTarget(friends, skill, tw, opts.threat || null);
    case 'cleanse': {
      // 只对真正带负面状态的队友净化，否则这一回合就白费了。
      // 没人中负面时仍要给个合法目标（理由同 healTarget：低难度照样可能选中它，
      // 返回 null 会让 battle.js 的 `target.debuffs=[]` 抛异常）。
      const afflicted = friends.filter(f => f.debuffs.length > 0 || f.disrupted || f.stunned);
      const pool = afflicted.length ? afflicted : friends;
      return pool.slice().sort((a,b)=>
        (b.debuffs.length + ((b.disrupted||b.stunned)?1:0)) -
        (a.debuffs.length + ((a.disrupted||a.stunned)?1:0)))[0] || null;
    }
    case 'buff':
      return buffTarget(friends, skill, tw);
    default:
      return null;   // damageAll / plague / corruptBurst 是 AoE，自身增益类无需目标
  }
}
