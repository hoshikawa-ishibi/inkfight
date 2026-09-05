// 探险模式的无头模拟。技能执行复用 tools/sim.js，避免第二份技能 switch。
import { createUnit, unitSpec, processStartOfTurn } from '../src/core/combat.js';
import {
  prepareInkUnits, createInkTurn, commitInkAction, finishInkTurn, availableInkUnits
} from '../src/core/ink-turn.js';
import { chooseInkAction } from '../src/ai/ink-ai.js';
import { executeSkill } from './sim.js';
import { makeIntent, resolveIntent } from '../src/core/intent.js';

function build(entries, player){
  return entries.map((entry, slot) => {
    const [id, override] = unitSpec(entry);
    return createUnit(id, player, slot, override);
  });
}

function ensurePrepared(units, relics){
  const missing = units.filter(u => !u.inkMode);
  if(missing.length) prepareInkUnits(missing, relics);
}

function totalHp(units){
  return units.reduce((sum, u) => sum + Math.max(0, u.hp), 0);
}

export function runInkBattle(p1ids, p2ids, scene, opts={}){
  const p1 = build(p1ids, 1);
  const p2 = build(p2ids, 2);
  if(opts.beforeBattle) opts.beforeBattle({p1, p2, scene});
  ensurePrepared(p1, opts.relics || []);
  ensurePrepared(p2, opts.p2Relics || []);

  const random = opts.random || Math.random;
  const maxRounds = opts.maxRounds || 120;
  const actions = [];
  let completedRounds = 0;
  let enemyIntent = null;

  for(let round=1; round<=maxRounds; round++){
    completedRounds = round;
    for(const side of [1,2]){
      const team = side === 1 ? p1 : p2;
      const foes = side === 1 ? p2 : p1;

      // 每个侧回合只在这里统一触发一次；行动链里绝不再次 tick。
      for(const unit of team.filter(u => u.alive))
        processStartOfTurn(unit, {allies:team, foes, round});
      if(!team.some(u => u.alive) || !foes.some(u => u.alive)) break;

      // 与实战同一时点：P1 全队状态先推进，再锁住尚未推进自身状态的 P2 首招。
      // 同一侧回合里的后续动作仍根据玩家刚造成的新局面自由决策。
      if(side === 1 && opts.intent !== false){
        const previewTurn = createInkTurn(opts.p2Relics || []);
        const planned = chooseInkAction(previewTurn, p2, p1, scene, {
          random, noise:opts.p2Noise || 0
        });
        enemyIntent = planned ? makeIntent(planned.actor, planned, scene) : null;
      }

      const relics = side === 1 ? (opts.relics || []) : (opts.p2Relics || []);
      const turn = createInkTurn(relics);
      const noise = side === 1 ? (opts.p1Noise || 0) : (opts.p2Noise || 0);
      let firstAction = true;

      while(availableInkUnits(turn, team).length && foes.some(u => u.alive)){
        let chosen = null;
        if(side === 2 && firstAction && enemyIntent){
          const actor = team.find(u => u.alive && u.id === enemyIntent.unitId);
          if(actor){
            const resolved = resolveIntent(
              actor, enemyIntent, foes.filter(u=>u.alive), team.filter(u=>u.alive), {teamwork:1}
            );
            if(resolved) chosen = {actor, skill:resolved.skill, target:resolved.target};
          }
          enemyIntent = null;
        }
        if(!chosen) chosen = chooseInkAction(turn, team, foes, scene, {random, noise});
        if(!chosen) break;
        const executable = commitInkAction(turn, chosen.actor, chosen.skill);
        if(!executable){
          if(firstAction){
            firstAction = false;
            continue;
          }
          break;
        }
        const record = turn.chain.at(-1);
        executeSkill(chosen.actor, executable, chosen.target, scene, p1, p2, null);
        actions.push({ round, side, ...record });
        firstAction = false;
      }
      finishInkTurn(turn, team);
      if(!p1.some(u => u.alive) || !p2.some(u => u.alive)) break;
    }
    if(!p1.some(u => u.alive) || !p2.some(u => u.alive)) break;
  }

  const p1alive = p1.some(u => u.alive);
  const p2alive = p2.some(u => u.alive);
  const timeout = p1alive && p2alive && completedRounds >= maxRounds;
  const winner = !p1alive ? 2
    : !p2alive ? 1
    : totalHp(p1) >= totalHp(p2) ? 1 : 2;
  return {
    winner,
    rounds:completedRounds,
    timeout,
    finalUnits:[...p1, ...p2],
    p1Units:p1,
    p2Units:p2,
    finalHP:{p1:totalHp(p1), p2:totalHp(p2)},
    actions
  };
}
