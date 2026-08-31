import { runTeamStudy } from '../../tools/team-study.js';
import { loadTeamStudy, saveTeamStudy } from '../game/save.js';

const pct = n => `${n.toFixed(1)}%`;
const teamNames = names => names.join(' · ');

function renderReport(report){
  const el=document.getElementById('team-study-results');
  if(!report){
    el.innerHTML='<div class="team-study-empty">还没有报告。第一次分析完成后，结果会一直保存在这台设备上。</div>';
    return;
  }
  const when=new Date(report.createdAt).toLocaleString();
  el.innerHTML=`<div class="team-study-summary">
      <strong>上次报告：${when}</strong>
      <span>${report.totalBattles.toLocaleString()} 局 · 普查 ${report.teamCount} 队 · 复赛 ${report.finalistCount} 队</span>
    </div>`+report.recommendations.map((r,i)=>{
      const sceneText=Object.values(r.scenes).map(s=>`${s.name} ${pct(s.winRate)}`).join('　');
      return `<article class="team-study-card">
        <div class="team-study-rank">#${i+1}</div>
        <div class="team-study-main">
          <h3>${teamNames(r.names)}</h3>
          <div class="team-study-roles">${r.roles.join(' / ')}</div>
          <div class="team-study-scenes">${sceneText}</div>
          <div class="team-study-matchups">优势对局：${r.bestAgainst?`${teamNames(r.bestAgainst.names)}（${pct(r.bestAgainst.winRate)}）`:'—'}<br>
          苦手对局：${r.worstAgainst?`${teamNames(r.worstAgainst.names)}（${pct(r.worstAgainst.winRate)}）`:'—'}</div>
        </div>
        <div class="team-study-rate"><b>${pct(r.winRate)}</b><span>${r.games} 局复赛</span><small>95%保守下界 ${pct(r.confidenceFloor)}</small></div>
      </article>`;
    }).join('');
}

export function initTeamStudy(){
  renderReport(loadTeamStudy());
  const btn=document.getElementById('btn-team-study-start');
  if(btn && !btn.dataset.bound){
    btn.dataset.bound='1';
    btn.addEventListener('click',startTeamStudy);
  }
}

function startTeamStudy(){
  const rounds=parseInt(document.getElementById('team-study-rounds').value,10);
  const btn=document.getElementById('btn-team-study-start');
  const progress=document.getElementById('team-study-progress');
  btn.disabled=true;
  progress.style.display='block';
  progress.textContent='准备普查全部四人队……旧报告会保留到新报告完成。';
  runTeamStudy(rounds,(done,total,phase,workers)=>{
    const engine=workers?` · ${workers} 线程并行`:' · 单线程兼容模式';
    progress.textContent=`${phase==='scout'?'普查全部 1820 种队伍':'候选队镜像复赛'}：${done.toLocaleString()} / ${total.toLocaleString()} 局${engine}`;
  },report=>{
    saveTeamStudy(report);
    renderReport(report);
    progress.textContent=`分析完成：${report.totalBattles.toLocaleString()} 局，报告已保存在本机。`;
    btn.disabled=false;
  });
}
