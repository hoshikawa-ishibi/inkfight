// 纯逻辑战斗模拟器，无渲染无延迟。
// 战斗规则（伤害公式/被动/腐化等）全部来自 combat.js，
// 与 battle.js 共用同一份实现，避免两边数值再次漂移出 bug。
//
// 决策同理：直接调 ai.js 的 aiHard，也就是玩家在困难难度下面对的那个 AI。
// 以前这里有一份自己的 pickSkill，于是「平衡测试测的根本不是玩家打的 AI」，
// 胜率结论对真实对局未必成立。现在这条链路上只剩一份实现。
import { CHARACTERS, SCENES } from './data.js';
import { clamp, teamSizeFor } from './state.js';
import {
  createUnit as makeUnit, unitSpec, calcDamage, processStartOfTurn, applyTurnRegen, applyRestRegen,
  applyCorrupt, applyPlague, applyCorruptBurst,
  resolveStun, resolveSelfBuff, makeAllyBuff, makeSpBuff, payCosts, resolveTaunt, applyCleanse,
  actionsFor, processBenchedTurn
} from './combat.js';
import { makeTeamContext, pickActor } from './ai-scoring.js';
import { nextActor, makeIntent, resolveIntent } from './intent.js';
import { aiEasy, aiNormal, aiHard } from './ai.js';

function noteKill(died, killer, stats){
  if(died && killer && stats) stats[killer.charId].kills++;
}

function doDamage(actor, target, skill, scene, stats){
  const r = calcDamage(actor, target, skill, scene);
  if(stats && r.dmg > 0) stats[actor.charId].dmg += r.dmg;
  noteKill(r.killed, actor, stats);
  return r.dmg;
}


// export 是给 test/skill-coverage.test.js 用的：那条测试逐个执行 data.js 里的
// 32 个技能，断言「这个 case 确实被接住了」。switch 漏掉一个 case 不会报错，
// 只会一路穿过去什么都不做——术士的 plague/corruptBurst 就这么静默失效过。
export function executeSkill(actor, skill, target, scene, p1, p2, stats){
  payCosts(actor, skill);
  const enemies = actor.player===1?p2:p1;
  const allies = actor.player===1?p1:p2;
  switch(skill.type){
    case 'damage':
      doDamage(actor,target,skill,scene,stats);
      if(skill.corrupt&&target.alive) applyCorrupt(target,skill.corrupt);
      break;
    case 'damageAll': enemies.filter(e=>e.alive).forEach(t=>doDamage(actor,t,skill,scene,stats)); break;
    case 'stun': {
      const r = resolveStun(actor, target, skill, scene);
      if(r.damage && stats && r.damage.dmg > 0){
        stats[actor.charId].dmg += r.damage.dmg;
        noteKill(r.damage.killed, actor, stats);
      }
      break;
    }
    case 'heal': {
      const h=skill.healAmt; target.hp=clamp(target.hp+h,0,target.maxHp);
      if(stats) stats[actor.charId].heals+=h; break;
    }
    case 'healSp':
      actor.sp=clamp(actor.sp+skill.spGain,0,actor.maxSp);
      if(skill.buffType) actor.buffs.push(makeSpBuff(skill)); break;
    case 'shield': actor.shield+=skill.shieldAmt; break;
    case 'taunt': {
      const r = resolveTaunt(actor, target, skill, scene);
      if(r.damage && stats && r.damage.dmg > 0){
        stats[actor.charId].dmg += r.damage.dmg;
        noteKill(r.damage.killed, actor, stats);
      }
      break;
    }
    case 'dodge': actor.dodging=true; break;
    case 'selfBuff': {
      const r = resolveSelfBuff(actor, target, skill, scene);
      if(r.damage && stats && r.damage.dmg > 0){
        stats[actor.charId].dmg += r.damage.dmg;
        noteKill(r.damage.killed, actor, stats);
      }
      break;
    }
    case 'cleanse': {
      const r = applyCleanse(target, skill);
      if(stats && r.healed) stats[actor.charId].heals += r.healed;
      break;
    }
    case 'buff': target.buffs.push(makeAllyBuff(skill)); break;
    case 'drain': {
      const dmg=doDamage(actor,target,skill,scene,stats);
      const drain=Math.floor(dmg*(skill.drainPct/100));
      actor.hp=clamp(actor.hp+drain,0,actor.maxHp);
      if(stats) stats[actor.charId].heals+=drain;
      if(skill.corrupt&&target.alive) applyCorrupt(target,skill.corrupt);
      break;
    }
    case 'plague':
      enemies.filter(e=>e.alive).forEach(t=>applyPlague(t, skill));
      break;
    case 'corruptBurst': {
      const { hits } = applyCorruptBurst(actor, enemies.filter(e=>e.alive), skill);
      hits.forEach(({dmg, died})=>{
        if(stats) stats[actor.charId].dmg += dmg;
        noteKill(died, actor, stats);
      });
      break;
    }
    case 'revive': actor.undying=skill.hpRestore; break;
  }
}

// 打满这么多回合还分不出胜负就按剩余总血量判定。
// 这类「超时局」的比例是个有用的健康指标：比例一高，说明双方都在互相
// 磨血磨不动，多半是治疗/护盾被高估了。
// 2026-08-26 从 60 改成 120：回合的含义变了。以前一个「回合」要跑完
// [p1a,p2a,p1b,p2b] 四次行动，现在和 battle.js 一致——一个回合双方各出一个单位。
// 翻倍是为了保持总行动预算不变，否则超时局比例会凭空翻一倍。
// 副作用（是好事）：报告里的「平均回合数」现在和玩家在回合计数器上看到的是同一个数。
const MAX_ROUNDS = 120;

// opts 用来做「非对称」实验（平衡报告本身不传，两边完全对等）：
//   p1Mod / p2Mod — 建好单位后调一次，用来复现难度档位给 AI 的属性加成
//   p1Ai / p2Ai   — 换掉某一方的 AI 档位
// 有了这两个口子，「困难难度到底公不公平」就能直接量，
// 而不必在别处另抄一份战斗循环——那正是这个项目反复踩的坑。
export function simOneBattle(p1ids, p2ids, scene, opts = {}){
  // 条目可以是角色 id 字符串，也可以是带身份/属性的对象（战役关卡就是后者）
  const p1 = p1ids.map((e,i)=>{ const [id,ov] = unitSpec(e); return makeUnit(id,1,i,ov); });
  const p2 = p2ids.map((e,i)=>{ const [id,ov] = unitSpec(e); return makeUnit(id,2,i,ov); });
  if(opts.p1Mod) p1.forEach(opts.p1Mod);
  if(opts.p2Mod) p2.forEach(opts.p2Mod);
  const aiOf = { 1: opts.p1Ai || aiHard, 2: opts.p2Ai || aiHard };
  const stats = {};
  [...p1,...p2].forEach(u=>{ stats[u.charId]={dmg:0,heals:0,kills:0}; });
  // 每支队伍一份战术上下文（集火目标），队内共享、局间不复用
  const ctx = { 1: makeTeamContext(), 2: makeTeamContext() };

  // 谁上次出手过——`nextActor` 靠它决定这一方轮到哪个单位。
  const lastActed = { 1:null, 2:null };

  // ── 承诺制（和 battle.js 同构） ─────────────────────────
  // 信息是**不对称**的，真实游戏里就是这样：
  //   p1（玩家一侧）在出手前看得见 p2 下一个单位要干什么；
  //   p2 则被自己的承诺锁住，哪怕 p1 的操作已经让那步棋变臭。
  // 不模拟这一层的话，difficulty-check / depth-check 量出来的「玩家」
  // 就是个无视游戏核心机制的人，所有难度数字都失真。
  // `opts.intent:false` 可以关掉，用来做「意图公开到底值多少」的对照实验。
  const useIntent = opts.intent !== false;
  let intent = null;
  const clearIfMine = u => { if(intent && intent.unitId === u.id) intent = null; };

  for(let round=0; round<MAX_ROUNDS; round++){
    // **一个回合 = 双方各行动一个单位**，和 battle.js 完全一致。
    //
    // 以前这里是一个固定顺序数组 `[p1a,p2a,p1b,p2b]` 逐个跑、跳过死人，
    // 那等价于「队伍人数直接决定行动次数」——一旦有人阵亡，那一方的
    // 出手次数立刻减半。而 battle.js 是双方严格轮流各出一个单位，
    // 人数只影响血池和技能池，**不影响行动次数**（CLAUDE.md 明文规定）。
    //
    // 后果很严重：单人 BOSS 在旧模型里只能拿到玩家一半的行动次数，
    // 于是 campaign-check 把墨皇量得远比实战弱，第 8 关校到的 42% 是虚的。
    // 现在两边共用 intent.js 的 `nextActor`，同一份规则只有一处实现。
    for(const side of [1,2]){
      // p1 出手之前，先把 p2 下一个行动单位的打算算出来并**锁定**。
      // 这一步必须在 p1 决策之前，它正是 p1 能拿到的那份情报。
      if(useIntent && side === 1){
        intent = null;
        // **必须和上面实际出手的挑法完全一致**，否则预告的和真动的不是同一个
        const foe = opts.p2Pick ? opts.p2Pick(p2.filter(x=>x.alive), p1, scene)
          : opts.strictOrder ? nextActor(p2, lastActed[2])
          : pickActor(p2, p1, scene, { tempo:1, teamwork:1, ctx:ctx[2] });
        const foeEnemies = p1.filter(e => e.alive);
        if(foe && foeEnemies.length){
          const foeAllies = p2.filter(a => a.alive);
          intent = makeIntent(foe, aiOf[2](foe, foeEnemies, foeAllies, scene, ctx[2]), scene);
        }
      }
      const team = side===1 ? p1 : p2;
      // opts.pick 让某一方**自由挑**这回合派谁上（默认仍是严格轮流）。
      // 用来实验「把出手顺序交还给玩家」值不值——见 COMBAT_PLAN.md 任务 5。
      // 这回合派谁上。默认**双方都自由挑**（和 battle.js 一致）；
      // opts.p1Pick / p2Pick 可以覆盖，`opts.strictOrder` 退回旧的严格轮流
      // ——那两个口子是给对照实验用的，正常跑不要传。
      const chooser = side===1 ? opts.p1Pick : opts.p2Pick;
      const u = chooser ? chooser(team.filter(x=>x.alive), side===1?p2:p1, scene)
        : opts.strictOrder ? nextActor(team, lastActed[side])
        : pickActor(team, side===1?p2:p1, scene, { tempo:1, teamwork:1, ctx:ctx[side] });
      if(!u) continue;
      lastActed[side] = u.id;

      // 回合开始（被动 / 中毒 / 狂暴自损 / buff-debuff 递减）走 combat.js 那一份。
      // 这里以前是手抄的副本，往 processStartOfTurn 里加机制时很容易漏掉这边，
      // 于是 npm run balance 跑的是「机制不全的世界」，胜率表看着正常却是错的。
      // 返回的 {passiveEvent, poison, berserk} 只给 battle.js 做日志/特效，无头模拟不需要。
      processStartOfTurn(u, {allies:team, foes:(side===1?p2:p1), round:round+1});
      // 轮空的队友也要走状态衰减，否则中毒不掉、buff 不过期、封印解不开
      processBenchedTurn(team, u);
      // 预告的单位被中毒带走 / 被眩晕 → 那一击就没了，这正是玩家操作的回报
      if(!u.alive){ clearIfMine(u); continue; }
      // 眩晕跳过是回合流程编排（battle.js 那边在 activateUnit 里做），不是战斗规则，留在这
      if(u.stunned){ u.stunned=false; clearIfMine(u); continue; }
      // opts.restRegen：回蓝给**轮空**的单位而不是出手的那个。
      // 严格轮流下两者等价（各自隔回合回一次），但它会惩罚「一直派同一个人」。
      // 只剩一个人时没得换，照常回气（否则单人 BOSS 永远没蓝）。
      // 轮空回蓝（见 combat.js 的 applyRestRegen）。`opts.strictOrder` 下退回旧规则，
      // 因为那两条是配套的：严格轮流 + 轮空回蓝 == 严格轮流 + 老规则回蓝。
      if(opts.strictOrder) applyTurnRegen(u, scene);
      else applyRestRegen(team, u, scene);

      const enemies=(side===1?p2:p1).filter(e=>e.alive);
      const allies=team.filter(a=>a.alive);
      if(!enemies.length) break;

      // p2 兑现承诺；p1 拿着情报现算。承诺作废（原单位已死）时退回现算。
      let chosen = null;
      if(useIntent && side === 2){
        chosen = resolveIntent(u, intent, enemies, allies, { teamwork:1, ctx:ctx[2] });
        if(chosen) intent = null;
      }
      if(!chosen){
        chosen = aiOf[side](u, enemies, allies, scene, ctx[side], side===1 ? intent : null);
      }
      if(!chosen||!chosen.skill) continue;
      executeSkill(u,chosen.skill,chosen.target,scene,p1,p2,stats);

      // BOSS 阶段二「涂改」：这一侧回合里再行动 (actionsFor-1) 次。
      // 承诺制只覆盖第一次（预告的就是它），后续几次现算——
      // 玩家在这中间没有操作机会，所以那几次不构成决策点。
      for(let extra = actionsFor(u) - 1; extra > 0 && u.alive; extra--){
        const foes2 = (side===1?p2:p1).filter(e=>e.alive);
        if(!foes2.length) break;
        const again = aiOf[side](u, foes2, team.filter(a=>a.alive), scene, ctx[side], null);
        if(!again || !again.skill) break;
        executeSkill(u, again.skill, again.target, scene, p1, p2, stats);
      }
    }
    const p1alive=p1.some(u=>u.alive), p2alive=p2.some(u=>u.alive);
    if(!p1alive||!p2alive) return { winner: p1alive?1:2, stats, rounds: round+1, timeout: false };
  }
  // 超时：HP多的赢
  const p1hp=p1.reduce((s,u)=>s+u.hp,0), p2hp=p2.reduce((s,u)=>s+u.hp,0);
  return { winner: p1hp>=p2hp?1:2, stats, rounds: MAX_ROUNDS, timeout: true };
}

// Fisher-Yates 洗牌。不要用 sort(()=>Math.random()-0.5)：那个比较函数不满足
// 排序算法要求的传递性，V8 对小数组的插入排序会让元素明显倾向于留在原位，
// 实测 8 个角色的入选率会从 50% 偏到 41%~58%，直接扭曲平衡统计的采样。
export function shuffle(arr){
  const r = arr.slice();
  for(let i=r.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [r[i],r[j]] = [r[j],r[i]];
  }
  return r;
}

function randomPicks(){
  const shuffled = shuffle(CHARACTERS.map(c=>c.id));
  const n = teamSizeFor('ai');
  // **两边独立抽，允许撞人**——和游戏里一致（见 main.js 的 renderCharGrid）。
  // 以前是一副牌切两半，等于「一方拿走 3 个，另一方只能从剩下 5 个里挑」，
  // 阵容差异大到把打法好坏淹掉：实测「完美 vs 一般」的落差只有 0.1 个百分点。
  return [shuffled.slice(0,n), shuffle(CHARACTERS.map(c=>c.id)).slice(0,n)];
}

// 分批跑，每批500局，用setTimeout让UI不卡死。
// onDone(charStats, meta)：meta 里是整体健康指标（平均回合数、超时率），
// 老调用方只取 charStats 也不受影响。
export function runSimulation(totalRounds, onProgress, onDone){
  const charStats = {}; // charId -> {wins,games}
  CHARACTERS.forEach(c=>{ charStats[c.id]={wins:0,games:0,name:c.name}; });

  let done = 0, totalBattleRounds = 0, timeouts = 0;
  const BATCH = 500;

  function runBatch(){
    const end = Math.min(done+BATCH, totalRounds);
    for(; done<end; done++){
      const scene = SCENES[Math.floor(Math.random()*SCENES.length)];
      const [p1ids, p2ids] = randomPicks();
      const {winner, rounds, timeout} = simOneBattle(p1ids, p2ids, scene);
      totalBattleRounds += rounds;
      if(timeout) timeouts++;
      const winnerIds = winner===1?p1ids:p2ids;
      [...p1ids,...p2ids].forEach(id=>{ charStats[id].games++; });
      winnerIds.forEach(id=>{ charStats[id].wins++; });
    }
    onProgress(done, totalRounds);
    if(done < totalRounds) setTimeout(runBatch, 0);
    else onDone(charStats, {
      avgRounds: totalBattleRounds/totalRounds,
      timeoutPct: timeouts/totalRounds*100
    });
  }
  setTimeout(runBatch, 0);
}
