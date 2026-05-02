export let gameState = {
  mode:null, difficulty:'normal', scene:null,
  p1Picks:[], p2Picks:[],
  p1Units:[], p2Units:[],
  turnOrder:[], currentIdx:0, round:1,
  waitingForTarget:false, pendingSkill:null, pendingSkillFriendly:false, pendingActor:null,
  busy:false, logPaused:false,
  stats:{ p1:{dmg:0,heal:0,kills:0}, p2:{dmg:0,heal:0,kills:0} }
};

export function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
export function rand(a,b){return Math.floor(Math.random()*(b-a+1))+a;}
export function pct(v,m){return Math.round(v/m*100);}

export function getAllUnits(){return [...gameState.p1Units,...gameState.p2Units];}
export function getUnit(id){return getAllUnits().find(u=>u.id===id);}
export function getEnemies(p){return p===1?gameState.p2Units:gameState.p1Units;}
export function getAllies(p){return p===1?gameState.p1Units:gameState.p2Units;}
