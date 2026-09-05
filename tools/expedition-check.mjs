import { SCENES } from '../src/data/data.js';
import { PARTIES, newExpedition, seededRandom, relicOffers, routeOffers, takeRelic, chooseRoute, launchEncounter, resolveEncounter, chooseCamp, applyExpeditionBattle } from '../src/core/expedition.js';
import { runInkBattle } from './ink-sim.js';

const count=Math.max(9,Number(process.argv[2])||90);
const rows=[];
for(const noise of [0,12,35]){
  const summary={noise,runs:count,completed:0,wins:0,battles:0,rounds:0,timeouts:0,thirdStrokes:0,heavyStrokes:0,totalActions:0,parties:{},relics:{}};
  for(let i=0;i<count;i++){
    const party=PARTIES[i%PARTIES.length];
    const run=newExpedition(party.id,`calibration-${i}`), signature=['flow','heavy','reserve'][Math.floor(i/3)%3];
    takeRelic(run,signature);
    while(run.phase==='route'){
      chooseRoute(run,routeOffers(run)[0].id);launchEncounter(run);
      const base=SCENES.find(s=>s.id===run.activeRoute.sceneId);
      const scene=base;
      const result=runInkBattle(run.team.map(t=>t.charId),run.activeRoute.enemyIds,scene,{
        relics:run.relics,p1Noise:noise,random:seededRandom(`${run.seed}/${run.battleIndex}/combat`),
        beforeBattle:({p1,p2})=>applyExpeditionBattle(run,p1,p2)
      });
      summary.battles++;summary.rounds+=result.rounds;summary.timeouts+=Number(result.timeout);
      const playerActions=result.actions.filter(a=>a.side===1);summary.totalActions+=playerActions.length;
      summary.thirdStrokes+=playerActions.filter((a,j)=>j>=2&&playerActions[j-2].round===a.round).length;
      summary.heavyStrokes+=playerActions.filter(a=>a.baseCost===3).length;
      summary.wins+=Number(result.winner===1);resolveEncounter(run,result);
      if(run.phase==='complete'){summary.completed++;break;}
      while(run.phase==='reward'){
        const offers=relicOffers(run);const pref=['opening','fourth','echo','keen','mercy','shelter','fury'];
        offers.sort((a,b)=>{const rank=id=>pref.includes(id)?pref.indexOf(id):99;return rank(a.id)-rank(b.id);});takeRelic(run,offers[0].id);
      }
      if(run.phase==='camp')chooseCamp(run,'rest');
    }
    for(const [group,key] of [['parties',party.id],['relics',signature]]){
      const stats=summary[group][key] ||= {runs:0,completed:0};stats.runs++;stats.completed+=Number(run.phase==='complete');
    }
  }
  summary.averageRounds=+(summary.rounds/summary.battles).toFixed(2);
  rows.push(summary);console.error(JSON.stringify(summary));
}
console.log(JSON.stringify({note:'Fixed seeds, normal routes, healing camps, same reward policy. Noise is an AI decision perturbation, not measured human skill.',rows},null,2));
