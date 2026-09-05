// Explicit, visible browser test driver. It operates production buttons; it never sets HP or declares victories.
import { gameState,isAiSide,getAllies,getEnemies } from '../src/core/state.js';
import { chooseInkAction } from '../src/ai/ink-ai.js';
import { collectScreenDiagnostics, formatScreenDiagnostics } from './screen-diagnostics.js';
let auto=false, accelerated=false, planned=null;
window.addEventListener('message',e=>{
  if(e.origin!==location.origin||e.source!==parent)return;
  if(e.data.inkCheck==='auto'){
    auto=true;
    if(!accelerated){
      document.querySelector('#spec-speed')?.click();
      document.querySelector('#spec-speed')?.click();
      accelerated=true;
    }
  }
  if(e.data.inkCheck==='manual')auto=false;
});
window.inkCheckApi=Object.freeze({snapshot:()=>collectScreenDiagnostics()});
setInterval(()=>{
  const snapshot=collectScreenDiagnostics();
  parent.postMessage({
    inkCheckStatus:`${auto?'玩家代理运行':'手动操作'} · 第${gameState.round}轮 · ${document.querySelector('#turn-text')?.textContent||''}\n${formatScreenDiagnostics(snapshot)}`,
    inkCheckSnapshot:snapshot,
  },location.origin);
  if(!auto)return;
  const modal=[...document.querySelectorAll('.modal-mask')].at(-1);
  if(modal){modal.click();return;}
  if(snapshot.currentScreen!=='screen-battle'||!snapshot.onlyCurrentVisible||isAiSide(gameState.currentPlayer)||gameState.inkBusy||gameState.resultShown)return;
  if(gameState.waitingForTarget){
    const target=planned?.target;
    if(target)document.getElementById(`unit-${target.id}`)?.click();
    return;
  }
  if(!gameState.pickingActor)return;
  planned=chooseInkAction(gameState.inkTurn,getAllies(gameState.currentPlayer),getEnemies(gameState.currentPlayer),gameState.scene);
  if(!planned){document.querySelector('#btn-ink-end-turn')?.click();return;}
  document.getElementById(`unit-${planned.actor.id}`)?.click();
  const index=planned.actor.skills.indexOf(planned.skill);
  document.querySelectorAll('#skill-panel .skill-btn')[index]?.click();
},130);
