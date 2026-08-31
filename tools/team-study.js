// 4v4 配队研究：先均匀普查全部四人组合，再让候选队互换先后手、跨场景复赛。
// 战斗本身仍只走 simOneBattle，因此不会另造一套 AI 或战斗规则。
import { CHARACTERS, SCENES } from '../src/data/data.js';
import { simOneBattle, shuffle } from './sim.js';

const BATCH = 120;

export function allFourMemberTeams(ids = CHARACTERS.map(c => c.id)){
  const teams = [];
  for(let a=0; a<ids.length-3; a++)
    for(let b=a+1; b<ids.length-2; b++)
      for(let c=b+1; c<ids.length-1; c++)
        for(let d=c+1; d<ids.length; d++) teams.push([ids[a],ids[b],ids[c],ids[d]]);
  return teams;
}

export function teamKey(ids){ return ids.slice().sort().join('|'); }

// 排名用 Wilson 下界而不是裸胜率，避免小样本的 100% 胜率冲到第一。
export function wilsonLower(wins, games, z = 1.96){
  if(!games) return 0;
  const p = wins / games;
  const z2 = z*z;
  return (p + z2/(2*games) - z*Math.sqrt((p*(1-p)+z2/(4*games))/games)) / (1+z2/games);
}

function blank(ids){ return { ids, wins:0, games:0, scenes:{} }; }
function record(stats, ids, won, sceneId){
  const key = teamKey(ids);
  const row = stats.get(key) || blank(ids.slice());
  row.games++;
  if(won) row.wins++;
  const scene = row.scenes[sceneId] || {wins:0,games:0};
  scene.games++;
  if(won) scene.wins++;
  row.scenes[sceneId] = scene;
  stats.set(key,row);
}

function makePairKey(a,b){ return a < b ? `${a}::${b}` : `${b}::${a}`; }
function recordMatchups(matchups, aIds, bIds, aWins){
  const a = teamKey(aIds), b = teamKey(bIds), key = makePairKey(a,b);
  const row = matchups.get(key) || { a:a<b?a:b, b:a<b?b:a, aWins:0, games:0 };
  row.games++;
  if((a === row.a && aWins) || (b === row.a && !aWins)) row.aWins++;
  matchups.set(key,row);
}

function playMirrored(a,b,scene,stats,matchups){
  const first = simOneBattle(a,b,scene);
  const second = simOneBattle(b,a,scene);
  recordMirroredResult(stats,matchups,a,b,scene.id,first.winner,second.winner);
}

// Worker 只负责跑真实战斗，统计仍统一在这里，避免并行版和单线程版各算一套口径。
export function recordMirroredResult(stats,matchups,a,b,sceneId,firstWinner,secondWinner){
  record(stats,a,firstWinner===1,sceneId);
  record(stats,b,firstWinner===2,sceneId);
  if(matchups) recordMatchups(matchups,a,b,firstWinner===1);
  record(stats,b,secondWinner===1,sceneId);
  record(stats,a,secondWinner===2,sceneId);
  if(matchups) recordMatchups(matchups,a,b,secondWinner===2);
}

function rankRows(rows){
  return rows.slice().sort((a,b) => wilsonLower(b.wins,b.games)-wilsonLower(a.wins,a.games));
}

function matchupFor(matchups, mine, foe){
  const row = matchups.get(makePairKey(mine,foe));
  if(!row) return null;
  const wins = row.a === mine ? row.aWins : row.games-row.aWins;
  return { games:row.games, wins, pct:wins/row.games*100 };
}

export function buildTeamStudyReport({totalBattles, scoutBattles, scoutStats, finalStats, matchups}){
  const names = Object.fromEntries(CHARACTERS.map(c=>[c.id,c.name]));
  const roles = Object.fromEntries(CHARACTERS.map(c=>[c.id,c.role]));
  const ranked = rankRows([...finalStats.values()]);
  const recommendations = ranked.slice(0,12).map(row=>{
    const mine = teamKey(row.ids);
    const opponents = ranked.filter(x=>teamKey(x.ids)!==mine)
      .map(x=>({ ids:x.ids, ...matchupFor(matchups,mine,teamKey(x.ids)) }))
      .filter(x=>x.games);
    const best = opponents.slice().sort((a,b)=>b.pct-a.pct)[0];
    const worst = opponents.slice().sort((a,b)=>a.pct-b.pct)[0];
    return {
      ids:row.ids, names:row.ids.map(id=>names[id]), roles:row.ids.map(id=>roles[id]),
      wins:row.wins, games:row.games, winRate:row.wins/row.games*100,
      confidenceFloor:wilsonLower(row.wins,row.games)*100,
      scenes:Object.fromEntries(SCENES.map(s=>{
        const x=row.scenes[s.id]||{wins:0,games:0};
        return [s.id,{name:s.name,games:x.games,winRate:x.games?x.wins/x.games*100:0}];
      })),
      bestAgainst:best ? {names:best.ids.map(id=>names[id]),games:best.games,winRate:best.pct} : null,
      worstAgainst:worst ? {names:worst.ids.map(id=>names[id]),games:worst.games,winRate:worst.pct} : null
    };
  });
  return {
    version:1, createdAt:Date.now(), totalBattles, scoutBattles,
    evaluationBattles:totalBattles-scoutBattles,
    teamCount:scoutStats.size, finalistCount:finalStats.size, recommendations
  };
}

// totalBattles 按“实际战斗局数”计。每组对局必定正反手各打一局。
function studySetup(totalBattles){
  totalBattles = Math.max(10000, Math.floor(totalBattles/2)*2);
  const evaluationTarget = Math.min(20000, Math.max(3000, Math.floor(totalBattles*.2/2)*2));
  const scoutBattles = totalBattles-evaluationTarget;
  return {totalBattles,scoutBattles};
}

function runTeamStudySequential(totalBattles, onProgress, onDone){
  ({totalBattles}=studySetup(totalBattles));
  const {scoutBattles}=studySetup(totalBattles);
  const allTeams = allFourMemberTeams();
  const scoutStats = new Map();
  let finalStats = new Map(), matchups = new Map(), finalists = [];
  let phase='scout', done=0, scoutPool=[], scoutAt=0, finalSchedule=[], finalAt=0;

  function refillScout(){ scoutPool=shuffle(allTeams); scoutAt=0; }
  function nextScoutPair(){
    if(scoutAt+1>=scoutPool.length) refillScout();
    return [scoutPool[scoutAt++],scoutPool[scoutAt++]];
  }
  function buildFinalSchedule(){
    const schedule=[];
    for(let a=0;a<finalists.length-1;a++) for(let b=a+1;b<finalists.length;b++)
      SCENES.forEach(scene=>schedule.push({a:finalists[a],b:finalists[b],scene}));
    finalSchedule=shuffle(schedule); finalAt=0;
  }
  function nextFinalPair(){
    if(finalAt>=finalSchedule.length) buildFinalSchedule();
    return finalSchedule[finalAt++];
  }
  function runBatch(){
    const end=Math.min(done+BATCH,totalBattles);
    while(done+1<end){
      if(phase==='scout' && done>=scoutBattles){
        const candidateCount=totalBattles<30000?12:24;
        finalists=rankRows([...scoutStats.values()]).slice(0,candidateCount).map(x=>x.ids);
        phase='final'; buildFinalSchedule();
      }
      if(phase==='scout'){
        const [a,b]=nextScoutPair();
        playMirrored(a,b,SCENES[Math.floor(Math.random()*SCENES.length)],scoutStats,null);
      }else{
        const x=nextFinalPair(); playMirrored(x.a,x.b,x.scene,finalStats,matchups);
      }
      done+=2;
    }
    onProgress(done,totalBattles,phase);
    if(done<totalBattles) setTimeout(runBatch,0);
    else onDone(buildTeamStudyReport({totalBattles,scoutBattles,scoutStats,finalStats,matchups}));
  }
  refillScout();
  setTimeout(runBatch,0);
}

function parallelism(){
  if(typeof Worker==='undefined' || typeof navigator==='undefined') return 0;
  // 留出一半核心给页面和用户的其它工作，且封顶 6，避免为了测试把整机吃满。
  return Math.min(6,Math.max(2,Math.floor((navigator.hardwareConcurrency||4)/2)));
}

function runWorkerPhase({workersCount,totalPairs,nextMatch,stats,matchups,phase,offsetBattles,totalBattles,onProgress}){
  const workers=[];
  const pairsPerJob=24;
  let assigned=0,completed=0,settled=false;
  return new Promise((resolve,reject)=>{
    const finish=()=>{
      if(settled || completed<totalPairs) return;
      settled=true; workers.forEach(w=>w.terminate()); resolve();
    };
    const dispatch=worker=>{
      if(assigned>=totalPairs){ finish(); return; }
      const count=Math.min(pairsPerJob,totalPairs-assigned);
      const matches=Array.from({length:count},()=>nextMatch());
      assigned+=count;
      worker.postMessage({matches});
    };
    for(let i=0;i<workersCount;i++){
      const worker=new Worker(new URL('./team-study-worker.js',import.meta.url),{type:'module'});
      workers.push(worker);
      worker.onmessage=e=>{
        e.data.results.forEach(r=>recordMirroredResult(stats,matchups,r.a,r.b,r.sceneId,r.firstWinner,r.secondWinner));
        completed+=e.data.results.length;
        onProgress(offsetBattles+completed*2,totalBattles,phase,workersCount);
        dispatch(worker);
      };
      worker.onerror=e=>{
        if(settled) return;
        settled=true; workers.forEach(w=>w.terminate()); reject(e);
      };
      dispatch(worker);
    }
  });
}

async function runTeamStudyParallel(totalBattles,onProgress,onDone,workersCount){
  ({totalBattles}=studySetup(totalBattles));
  const {scoutBattles}=studySetup(totalBattles);
  const allTeams=allFourMemberTeams();
  const scoutStats=new Map(), finalStats=new Map(), matchups=new Map();
  let scoutPool=[],scoutAt=0;
  const refillScout=()=>{scoutPool=shuffle(allTeams);scoutAt=0;};
  const nextScout=()=>{
    if(scoutAt+1>=scoutPool.length) refillScout();
    return {a:scoutPool[scoutAt++],b:scoutPool[scoutAt++],sceneId:SCENES[Math.floor(Math.random()*SCENES.length)].id};
  };
  refillScout();
  await runWorkerPhase({workersCount,totalPairs:scoutBattles/2,nextMatch:nextScout,stats:scoutStats,matchups:null,
    phase:'scout',offsetBattles:0,totalBattles,onProgress});

  const candidateCount=totalBattles<30000?12:24;
  const finalists=rankRows([...scoutStats.values()]).slice(0,candidateCount).map(x=>x.ids);
  let schedule=[],at=0;
  const refillFinal=()=>{
    const next=[];
    for(let a=0;a<finalists.length-1;a++) for(let b=a+1;b<finalists.length;b++)
      SCENES.forEach(scene=>next.push({a:finalists[a],b:finalists[b],sceneId:scene.id}));
    schedule=shuffle(next);at=0;
  };
  const nextFinal=()=>{if(at>=schedule.length) refillFinal();return schedule[at++];};
  refillFinal();
  await runWorkerPhase({workersCount,totalPairs:(totalBattles-scoutBattles)/2,nextMatch:nextFinal,stats:finalStats,matchups,
    phase:'final',offsetBattles:scoutBattles,totalBattles,onProgress});
  onDone(buildTeamStudyReport({totalBattles,scoutBattles,scoutStats,finalStats,matchups}));
}

export function runTeamStudy(totalBattles,onProgress,onDone){
  const workersCount=parallelism();
  if(!workersCount){ runTeamStudySequential(totalBattles,onProgress,onDone); return; }
  runTeamStudyParallel(totalBattles,onProgress,onDone,workersCount).catch(()=>{
    // 极少数浏览器会宣称支持 module worker 却加载失败；自动回到可靠的单线程路径。
    runTeamStudySequential(totalBattles,onProgress,onDone);
  });
}
