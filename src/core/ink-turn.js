// 探险模式的共享墨量行动规则。这里不碰普通对战的 SP / 冷却流程。
import { canUseSkill } from './combat.js';

export const INK_RULES = Object.freeze({
  budget: 3,
  fourthBudget: 4,
  shieldPerInk: 7,
  maxEndShieldPerUnit: 28,
  flowMultiplier: 1.5,
  heavyMultiplier: 1.3,
  openingDiscount: 1,
  herbalistHealMultiplier: 0.85,
  relicIds: Object.freeze(['flow', 'heavy', 'reserve', 'fourth', 'opening'])
});

const THREE_INK = new Set([
  '墨之洪流', '破甲突刺', '盾墙反击', '穿透箭', '腐化爆发', '瘟疫', '灵魂收割',
  '一闪', '破魔符', '铁幕', '进军令', '雷鸣震', '百草汤', '连环崩拳', '断魂爪'
]);

const TWO_INK = new Set([
  '旋风斩', '灵能过载', '铁壁', '暗影突袭', '毒刃', '治愈之光', '祝福',
  '狂暴', '鲜血之力', '不屈', '束缚箭', '樱花乱', '缚灵', '咒返', '过载',
  '金疮药', '逆袭', '铁山靠', '蚀骨'
]);

const ONE_INK = new Set([
  '斩击', '墨弹', '盾击', '匕首', '光击', '重击', '射击', '暗影弹',
  '拔刀', '符射', '齿轮击', '鼓点', '银针', '苦无', '直拳', '啄',
  '剑气', '冥想', '嘲讽', '净化', '消失', '集中', '蓄刃', '检修',
  '振奋', '醒神', '残影', '烟遁', '调息'
]);

const SP_SKILL_REPLACEMENTS = Object.freeze({
  '剑气':       { type:'selfBuff', hpCost:12, buffType:'atkUp1', dur:2, buffValue:0.30, desc:'消耗12HP，凝聚剑气：攻击+30% 2回合' },
  '冥想':       { type:'selfBuff', buffType:'atkUp1', dur:2, buffValue:0.35, desc:'凝神蓄势：攻击+35% 2回合' },
  '集中':       { type:'healSp', spGain:0, critCharge:20, buffType:'atkUp1', dur:1, buffValue:0.20, desc:'凝神：下次攻击+20%，锋芒+20' },
  '蓄刃':       { type:'healSp', spGain:0, critCharge:45, desc:'锋芒+45，把下一刀推向必定重击' },
  '检修':       { type:'shield', shieldAmt:30, desc:'检修装甲，获得30护盾' },
  '振奋':       { type:'buffAll', buffType:'atkUp', dur:2, buffValue:0.18, desc:'全队攻击+18% 2回合' },
  '烟遁':       { type:'healSp', spGain:0, critCharge:20, buffType:'atkUp1', dur:1, buffValue:0.20, desc:'隐入烟幕：下次攻击+20%，锋芒+20' },
  '调息':       { type:'healSp', spGain:0, critCharge:35, desc:'调匀气息，锋芒+35' }
});

function cleanSpText(desc=''){
  return desc
    .replace(/(?:消耗|恢复|回复|回)\s*\d+\s*SP[，、+；;]?/gi, '')
    .replace(/SP\s*[≥>过]\s*\d+%?/gi, '')
    .replace(/目标SP过(?:半|\d+%)/g, '目标')
    .replace(/^[，、+；;\s]+|[，、+；;\s]+$/g, '') || '探险技能';
}

function convertedPassive(passive){
  if(!passive) return null;
  const p = JSON.parse(JSON.stringify(passive));
  if(p.effect === 'spGain'){
    p.effect = 'critCharge';
    p.desc = `重击后锋芒 +${p.value}`;
  } else if(p.effect === 'allySp'){
    p.effect = 'allyHeal';
    p.desc = `回合开始时，为生命低于30%的友方回复 ${p.value} HP`;
  } else if(p.effect === 'overchargeBuff'){
    p.effect = 'critStack';
    p.value = 5;
    p.maxStacks = 4;
    p.desc = '每回合开始锋芒充能 +5/击（最多叠加4层）';
  } else {
    p.desc = cleanSpText(p.desc);
  }
  return p;
}

// 已知的 16 人技能按名字精确分档；未知技能再按字段保守归类，方便以后扩阵容。
export function inkCost(skill){
  if(Number.isInteger(skill?.inkCost) && skill.inkCost >= 1 && skill.inkCost <= 3) return skill.inkCost;
  if(THREE_INK.has(skill?.name)) return 3;
  if(TWO_INK.has(skill?.name)) return 2;
  if(ONE_INK.has(skill?.name)) return 1;
  if(['damageAll','plague','corruptBurst','healAll','shieldAll','buffAll'].includes(skill?.type)) return 3;
  if((skill?.power || 0) >= 2.2 || (skill?.healAmt || 0) >= 36 || (skill?.shieldAmt || 0) >= 35) return 3;
  if((skill?.power || 0) >= 1.4 || (skill?.healAmt || 0) >= 28) return 2;
  return 1;
}

function convertSkill(source){
  const original = JSON.parse(JSON.stringify(source));
  const replacement = SP_SKILL_REPLACEMENTS[source.name];
  const skill = { ...original, ...(replacement || {}) };
  skill.originalDesc = source.originalDesc || source.desc || '';
  skill.originalCost = source.originalCost ?? source.cost ?? 0;
  skill.desc = replacement?.desc || cleanSpText(source.desc);
  skill.inkCost = inkCost(source);
  skill.cost = 0;
  skill.cd = 0;
  delete skill.spThreshold;
  if(skill.type !== 'healSp') delete skill.spGain;
  return skill;
}

// createUnit 已经深拷贝技能；这里再克隆一次，使重复准备和外部传入单位也不会共享对象。
export function prepareInkUnits(units, relicIds=[]){
  for(const unit of units || []){
    unit.inkMode = true;
    unit.skills = (unit.skills || []).map(skill => convertSkill(skill));
    if(unit.charId==='herbalist')unit.skills.forEach(skill=>{
      if(!skill.healAmt)return;
      skill.inkBaseHealAmt ??= skill.healAmt;
      skill.healAmt=Math.round(skill.inkBaseHealAmt*INK_RULES.herbalistHealMultiplier);
      skill.desc=skill.desc.replace(/\d+(?:\.\d+)?\s*HP/g,`${skill.healAmt}HP`);
    });
    unit.passive = convertedPassive(unit.passive);
    unit.sp = 0;
    unit.maxSp = 0;
    unit.spRegen = 0;
    unit.cooldowns = {};
    unit.inkRelics = [...new Set(relicIds)].filter(id => INK_RULES.relicIds.includes(id));
  }
  return units;
}

export function createInkTurn(relicIds=[]){
  const relics = [...new Set(relicIds)].filter(id => INK_RULES.relicIds.includes(id));
  const total = relics.includes('fourth') ? INK_RULES.fourthBudget : INK_RULES.budget;
  return { total, remaining:total, acted:[], chain:[], relics, ended:false, shieldGranted:0 };
}

export function inkActionCost(turn, unit, skill){
  const base = inkCost(skill);
  return turn && !turn.ended && turn.chain.length === 0 && turn.relics.includes('opening')
    ? Math.max(1, base - INK_RULES.openingDiscount)
    : base;
}

function outputMultiplier(turn, skill){
  if(!turn || turn.ended) return 1;
  if(turn.chain.length === 0 && inkCost(skill) === 3 && turn.relics.includes('heavy'))
    return INK_RULES.heavyMultiplier;
  if(turn.chain.length === 2 && turn.relics.includes('flow'))
    return INK_RULES.flowMultiplier;
  return 1;
}

const OUTPUT_FIELDS = new Set([
  'power', 'healAmt', 'dot', 'dmgPerStack', 'selfHeal'
]);
const INTEGER_OUTPUT_FIELDS = new Set([
  'healAmt', 'dot', 'dmgPerStack', 'selfHeal'
]);

export function previewInkSkill(turn, unit, skill){
  const out = { ...skill };
  const multiplier = outputMultiplier(turn, skill);
  if(multiplier !== 1){
    for(const key of OUTPUT_FIELDS){
      if(typeof out[key] !== 'number') continue;
      const scaled = out[key] * multiplier;
      out[key] = INTEGER_OUTPUT_FIELDS.has(key) ? Math.round(scaled) : scaled;
    }
  }
  out.cost = 0; // 共享墨量已经由 commitInkAction 支付，核心执行器不得再扣一次。
  out.cd = 0;
  out.paidInk = inkActionCost(turn, unit, skill);
  out.outputMultiplier = multiplier;
  return out;
}

export function canInkAct(turn, unit, skill){
  if(!turn || turn.ended || !unit?.alive || !skill) return false;
  if(turn.acted.includes(unit.id)) return false;
  if(!canUseSkill(unit, skill)) return false;
  return inkActionCost(turn, unit, skill) <= turn.remaining;
}

export function availableInkUnits(turn, units){
  return (units || []).filter(unit =>
    unit.alive && (unit.skills || []).some(skill => canInkAct(turn, unit, skill)));
}

export function commitInkAction(turn, unit, skill){
  if(!canInkAct(turn, unit, skill)) return null;
  const executable = previewInkSkill(turn, unit, skill);
  const cost = executable.paidInk;
  const before = turn.remaining;
  turn.remaining -= cost;
  turn.acted.push(unit.id);
  turn.chain.push({
    actorId:unit.id,
    charId:unit.charId,
    actorName:unit.name,
    skillName:skill.name,
    baseCost:inkCost(skill),
    cost,
    remainingBefore:before,
    remainingAfter:turn.remaining,
    multiplier:executable.outputMultiplier
  });
  return executable;
}

export function finishInkTurn(turn, units){
  if(!turn) return 0;
  if(turn.ended) return turn.shieldGranted || 0;
  const reserve = turn.relics.includes('reserve') ? 2 : 1;
  const amount = Math.min(
    turn.remaining * INK_RULES.shieldPerInk * reserve,
    INK_RULES.maxEndShieldPerUnit
  );
  if(amount > 0){
    for(const unit of units || []) if(unit.alive) unit.shield = (unit.shield || 0) + amount;
  }
  turn.ended = true;
  turn.shieldGranted = amount;
  return amount;
}
