import { gameState, rand } from './state.js';
import { needsEnemyTarget } from './combat.js';

let _previewDmg;
export function initAi(previewDmg){ _previewDmg=previewDmg; }

export function aiEasy(u,enemies,allies){
  const usable=u.skills.filter(s=>u.sp>=s.cost&&!(s.hpCost&&u.hp<=s.hpCost));
  if(usable.length===0) return null;
  let skill=Math.random()<0.7?u.skills[0]:usable[rand(0,usable.length-1)];
  let target=enemies[rand(0,enemies.length-1)];
  if(['heal','cleanse','buff'].includes(skill.type)) target=allies[rand(0,allies.length-1)];
  if(!needsEnemyTarget(skill) &&
     ['healSp','shield','taunt','dodge','selfBuff','revive','damageAll','corruptBurst'].includes(skill.type)) target=null;
  if(['damage','stun','spSteal','debuff','drain','plague'].includes(skill.type)){
    const t=enemies.find(e=>e.buffs.some(b=>b.type==='taunt'));
    if(t) target=t;
  }
  return {skill,target};
}

export function aiNormal(u,enemies,allies){
  let best=null,bestScore=-Infinity,bestTarget=null;
  for(const s of u.skills){
    if(u.sp<s.cost||s.hpCost&&u.hp<=s.hpCost) continue;
    const r=scoreSkill(u,s,enemies,allies,'normal');
    if(r.score>bestScore){ bestScore=r.score; best=s; bestTarget=r.target; }
  }
  return best?{skill:best,target:bestTarget}:null;
}

export function aiHard(u,enemies,allies){
  let best=null,bestScore=-Infinity,bestTarget=null;
  for(const s of u.skills){
    if(u.sp<s.cost||s.hpCost&&u.hp<=s.hpCost) continue;
    const r=scoreSkill(u,s,enemies,allies,'hard');
    if(r.score>bestScore){ bestScore=r.score; best=s; bestTarget=r.target; }
  }
  return best?{skill:best,target:bestTarget}:null;
}

function scoreSkill(u,s,enemies,allies,level){
  let score=0,target=null;
  const lowEnemy=enemies.slice().sort((a,b)=>a.hp-b.hp)[0];
  const lowAlly=allies.slice().sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0];
  const highSpEnemy=enemies.slice().sort((a,b)=>b.sp/b.maxSp-a.sp/a.maxSp)[0];
  const fragileEnemy=enemies.slice().sort((a,b)=>a.maxHp-b.maxHp)[0];
  const dmgEst=_previewDmg(u,s);
  switch(s.type){
    case 'damage':
      target=lowEnemy; score=(s.power||1)*30;
      if(dmgEst&&target.hp<=dmgEst+target.shield) score+=80;
      else if(dmgEst&&target.hp<=dmgEst*1.5) score+=30;
      if(level==='hard'){ if(target===fragileEnemy) score+=15; if(s.crit&&target.hp/target.maxHp<0.4) score+=20; }
      if(s.cost>0) score+=8; break;
    case 'damageAll':
      score=enemies.length*22+10;
      if(level==='hard'&&enemies.length>=2&&enemies.every(e=>e.hp/e.maxHp<0.5)) score+=40; break;
    case 'stun': {
      target=highSpEnemy;
      const prob=s.basePct+s.spScale*(target.sp/target.maxSp);
      score=prob*0.7;
      if(level==='hard'){ if(target.atk>15) score+=15; if(target.sp>=target.maxSp*0.7) score+=20; }
      break;
    }
    case 'heal':
      target=lowAlly;
      score=target.hp/target.maxHp>0.75?-20:(1-target.hp/target.maxHp)*80;
      if(level==='hard'&&target.hp/target.maxHp<0.3) score+=30; break;
    case 'healSp':
      score=u.sp/u.maxSp<0.3?28:-10;
      if(level==='hard'){ const bigSkill=u.skills.find(sk=>sk.cost>=30); if(bigSkill&&u.sp<bigSkill.cost&&u.sp+s.spGain>=bigSkill.cost) score+=25; }
      break;
    case 'shield': score=u.hp/u.maxHp<0.6?22:5; if(level==='hard'&&enemies.some(e=>e.atk>=18)) score+=10; break;
    case 'taunt': score=allies.some(a=>a.hp/a.maxHp<0.4)?32:8; if(level==='hard'&&u.maxHp>=140) score+=15; break;
    case 'dodge': score=u.hp/u.maxHp<0.4?38:8; break;
    case 'selfBuff':
      // 带 power 的边打边上 buff，要选目标；纯 buff 技能则占掉整个回合
      if(s.power){ target=lowEnemy; score=22+(s.power||0)*20; }
      else score=22;
      if(level==='hard'&&u.hp/u.maxHp>0.6) score+=10; break;
    case 'cleanse':
      target=allies.find(a=>a.debuffs.length>0||a.stunned)||lowAlly;
      score=target.debuffs?.length>0||target.stunned?32:-25; break;
    case 'buff':
      target=allies.sort((a,b)=>b.atk-a.atk)[0];
      score=20; if(level==='hard'&&target.atk>=20) score+=15; break;
    case 'spSteal':
      target=highSpEnemy; score=26; if(level==='hard'&&target.sp>=40) score+=15; break;
    case 'debuff':
      target=enemies.sort((a,b)=>b.hp-a.hp)[0]; score=24; if(level==='hard') score+=8; break;
    case 'drain':
      target=lowEnemy; score=30+(u.hp/u.maxHp<0.5?20:0); break;
    case 'plague':
      score=35; if(enemies.length>=2) score+=20;
      if(level==='hard') score+=10; break;
    case 'corruptBurst': {
      const totalStacks=enemies.reduce((s,e)=>s+e.debuffs.filter(d=>d.type==='corrupt').reduce((a,d)=>a+d.value,0),0);
      score=totalStacks*15-5;
      if(level==='hard'&&totalStacks>=3) score+=30; break;
    }
    case 'revive':
      score=u.hp/u.maxHp<0.35?42:-50; break;
  }
  if(needsEnemyTarget(s)){
    const t=enemies.find(e=>e.buffs.some(b=>b.type==='taunt'));
    if(t) target=t;
  }
  score+=Math.random()*(level==='hard'?2:6);
  return {score,target};
}
