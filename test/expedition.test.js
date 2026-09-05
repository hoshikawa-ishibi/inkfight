import test from 'node:test';
import assert from 'node:assert/strict';
import { createUnit } from '../src/core/combat.js';
import { newExpedition, restoreExpedition, relicOffers, routeOffers, takeRelic, chooseRoute, launchEncounter, resolveEncounter, chooseCamp, applyExpeditionBattle, JOURNEY_RULES } from '../src/core/expedition.js';

function launched(){
  const r=newExpedition('edge','固定墨路');takeRelic(r,'flow');chooseRoute(r,routeOffers(r)[0].id);launchEncounter(r);return r;
}
function units(r){return r.team.map((t,i)=>createUnit(t.charId,1,i));}
test('decisions and reward draws survive reload unchanged',()=>{
  const a=launched(),b=restoreExpedition(JSON.stringify(a));
  assert.deepEqual(a,b);assert.deepEqual(routeOffers(a),routeOffers(b));
  for(const r of [a,b])resolveEncounter(r,{winner:1,rounds:4,finalUnits:units(r)});
  assert.deepEqual(relicOffers(a),relicOffers(b));
});
test('three encounters complete once; rewards cannot be farmed through duplicate settlement',()=>{
  const r=launched();
  for(let i=0;i<3;i++){
    assert.equal(resolveEncounter(r,{winner:1,rounds:i+4,finalUnits:units(r)}),true);
    assert.equal(resolveEncounter(r,{winner:1,rounds:i+4,finalUnits:units(r)}),false);
    assert.equal(r.wins,i+1);
    if(i<2){
      assert.equal(takeRelic(r,relicOffers(r)[0].id),true);
      assert.equal(r.phase,'camp');assert.equal(chooseCamp(r,'rest'),true);
      assert.equal(chooseRoute(r,routeOffers(r)[0].id),true);launchEncounter(r);
    }
  }
  assert.equal(r.phase,'complete');assert.equal(r.history.length,3);
  assert.ok(restoreExpedition(r));
});
test('elite rewards require two different choices, then a single camp decision',()=>{
  const r=newExpedition('sigil','险路');takeRelic(r,'heavy');chooseRoute(r,routeOffers(r)[1].id);launchEncounter(r);
  resolveEncounter(r,{winner:1,rounds:3,finalUnits:units(r)});
  const first=relicOffers(r)[0].id;assert.ok(takeRelic(r,first));assert.equal(r.phase,'reward');
  assert.equal(takeRelic(r,first),false);assert.ok(takeRelic(r,relicOffers(r)[0].id));assert.equal(r.phase,'camp');
  assert.ok(chooseCamp(r,'forge'));assert.equal(chooseCamp(r,'forge'),false);assert.equal(r.forge,1);
});
test('wounds persist by ratio, fallen allies recover, modifiers never double-apply on resume',()=>{
  const r=launched(),p1=units(r),p2=r.activeRoute.enemyIds.map((id,i)=>createUnit(id,2,i));
  p1[0].hp=Math.round(p1[0].maxHp*.5);p1[1].hp=0;p1[1].alive=false;
  resolveEncounter(r,{winner:1,rounds:7,finalUnits:p1});
  assert.equal(r.team[1].hpRatio,JOURNEY_RULES.fallenRecovery);
  const ratio=r.team[0].hpRatio;
  takeRelic(r,relicOffers(r)[0].id);chooseCamp(r,'rest');
  assert.equal(r.team[0].hpRatio,Math.min(1,ratio+JOURNEY_RULES.rest));
  chooseRoute(r,routeOffers(r)[0].id);launchEncounter(r);
  const a=units(r),b=units(r);applyExpeditionBattle(r,a,p2);applyExpeditionBattle(restoreExpedition(r),b,[]);
  assert.deepEqual(a,b);
  assert.equal(a[0].hp,Math.round(a[0].maxHp*r.team[0].hpRatio));
});
test('loss terminates the journey and rejects further routes and rewards',()=>{
  const r=launched();resolveEncounter(r,{winner:2,rounds:10,finalUnits:units(r)});
  assert.equal(r.phase,'failed');assert.equal(r.wins,0);
  assert.equal(chooseRoute(r,'0-0'),false);assert.equal(takeRelic(r,'heavy'),false);assert.equal(launchEncounter(r),false);
});
test('corrupt storage cannot supply unknown actors, altered enemy rosters or non-finite wounds',()=>{
  assert.equal(restoreExpedition('{broken'),null);
  const original=launched();
  for(const mutate of [r=>r.team[0].charId='unknown',r=>r.team[0].hpRatio=-1,r=>r.team.pop(),r=>r.relics.push('flow'),r=>r.battleIndex=9]){
    const r=structuredClone(original);mutate(r);assert.equal(restoreExpedition(r),null);
  }
  const r=structuredClone(original);r.activeRoute.enemyIds=['priest'];
  assert.deepEqual(restoreExpedition(r).activeRoute.enemyIds,original.activeRoute.enemyIds);
});
test('settlement matches wounds by character, rejects invalid results without changing the journey',()=>{
  const r=launched(),p1=units(r);p1[0].hp=50;
  const original=structuredClone(r);
  assert.equal(resolveEncounter(r,{winner:8,rounds:3,finalUnits:p1}),false);assert.deepEqual(r,original);
  assert.equal(resolveEncounter(r,{winner:1,rounds:3,finalUnits:[p1[0],p1[0],p1[2],p1[3]]}),false);
  assert.ok(resolveEncounter(r,{winner:1,rounds:3,finalUnits:[...p1].reverse()}));
  assert.equal(r.team[0].hpRatio,50/p1[0].maxHp);
});
test('contradictory saved phases and rewards are rejected',()=>{
  const r=launched();
  for(const change of [{phase:'complete'},{phase:'camp'},{wins:3},{rewardsRemaining:2}])assert.equal(restoreExpedition({...r,...change}),null);
});
test('final route honestly offers completion or a title, not unusable relics',()=>{
  const r=launched();r.battleIndex=2;
  const routes=routeOffers(r);
  assert.ok(routes.every(route=>route.rewardCount===0));assert.match(routes[1].rewardText,/破阵归人/);
});
