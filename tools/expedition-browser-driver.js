// Explicit, visible browser test driver. It operates production buttons; it never sets HP or declares victories.
import { gameState } from '../src/core/state.js';
import { chooseInkAction } from '../src/ai/ink-ai.js';
import { cycleSpectateSpeed, onPreviewUnit, endInkRound } from '../src/game/battle.js';
import { isModalOpen, closeTop } from '../src/view/codex.js';
let auto=false, accelerated=false, planned=null;
window.addEventListener('message',e=>{
  if(e.origin!==location.origin||e.source!==parent)return;
  if(e.data.inkCheck==='auto'){auto=true;if(!accelerated){cycleSpectateSpeed();cycleSpectateSpeed();accelerated=true;}}
  if(e.data.inkCheck==='manual')auto=false;
});
setInterval(()=>{
  const active=document.querySelector('[id^="screen-"].active')?.id;
  parent.postMessage({inkCheckStatus:`${auto?'玩家代理运行':'手动操作'} · ${active} · 第${gameState.round}轮 · 视口 ${document.documentElement.clientWidth}px / 页面 ${document.documentElement.scrollWidth}px · ${document.querySelector('#turn-text')?.textContent||''}`},location.origin);
  if(!auto)return;
  if(isModalOpen()){closeTop();return;}
  if(active!=='screen-battle'||gameState.mode!=='expedition'||gameState.currentPlayer!==1||gameState.inkBusy||gameState.resultShown)return;
  if(gameState.waitingForTarget){
    const target=planned?.target;
    if(target)document.getElementById(`unit-${target.id}`)?.click();
    return;
  }
  if(!gameState.pickingActor)return;
  planned=chooseInkAction(gameState.inkTurn,gameState.p1Units,gameState.p2Units,gameState.scene);
  if(!planned){endInkRound();return;}
  onPreviewUnit(planned.actor);
  const index=planned.actor.skills.indexOf(planned.skill);
  document.querySelectorAll('#skill-panel .skill-btn')[index]?.click();
},130);
