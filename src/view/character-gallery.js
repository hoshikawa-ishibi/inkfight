import { CHARACTERS } from '../data/data.js';
import { portraitFor } from '../data/character-portraits.js';
import { drawStickman } from './stickman.js';

let selectedId=CHARACTERS[0]?.id;
let animHandle=0;

const statRows=c=>[
  ['生命',c.hp],['灵能',c.sp],['攻击',c.atk],['防御',c.def],
  ['锋芒',`+${c.crit}/击`],['减伤',`${c.dodge}%`],['回灵',c.spRegen]
];

function rosterHtml(){
  return CHARACTERS.map(c=>`<button class="archive-roster-item${c.id===selectedId?' selected':''}" data-char-id="${c.id}" style="--char:${c.color}">
    <span class="archive-roster-mark"></span><span><b>${c.name}</b><small>${c.role}</small></span>
  </button>`).join('');
}

function detailHtml(c){
  const portrait=portraitFor(c.id);
  const skills=c.skills.map((s,i)=>`<article class="archive-skill" style="--skill:${s.iconColor||c.color}">
    <div class="archive-skill-icon">${s.icon||i+1}</div><div><header><b>${s.name}</b><span>${s.cost?`${s.cost} SP`:'无消耗'}</span></header><p>${s.desc}</p></div>
  </article>`).join('');
  return `<section class="archive-portrait" style="--char:${c.color}">
      <div class="archive-portrait-slot${portrait?' has-portrait':''}" data-portrait-for="${c.id}">
        ${portrait?`<img src="${portrait}" alt="${c.name}立绘">`:'<span>CHARACTER ILLUSTRATION</span><b>立绘预留区</b><small>未来可直接接入透明 PNG / WebP</small>'}
      </div>
      <div class="archive-identity"><span>NO. ${String(CHARACTERS.indexOf(c)+1).padStart(2,'0')}</span><h2>${c.name}</h2><p>${c.role}</p></div>
    </section>
    <section class="archive-profile">
      <div class="archive-heading"><span>COMBAT PROFILE</span><h3>战斗档案</h3></div>
      <div class="archive-combat-preview"><canvas id="archive-stickman" width="180" height="166"></canvas><div><b>战场形态</b><p>定位：${c.role}</p><small>与实际战斗共用同一绘制配置</small></div></div>
      <div class="archive-stats">${statRows(c).map(([k,v])=>`<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
      <article class="archive-passive"><span>被动</span><div><b>${c.passive?.name||'无'}</b><p>${c.passive?.desc||'暂无被动能力'}</p></div></article>
      <div class="archive-heading archive-heading-skills"><span>SKILLS</span><h3>技能组</h3></div>
      <div class="archive-skills">${skills}</div>
    </section>`;
}

function renderDetail(){
  const c=CHARACTERS.find(x=>x.id===selectedId)||CHARACTERS[0];
  const roster=document.getElementById('archive-roster');
  const detail=document.getElementById('archive-detail');
  if(!roster||!detail||!c)return;
  roster.innerHTML=rosterHtml();
  detail.innerHTML=detailHtml(c);
  roster.querySelectorAll('[data-char-id]').forEach(btn=>btn.onclick=()=>{
    selectedId=btn.dataset.charId; renderDetail();
  });
}

function animate(t){
  const screen=document.getElementById('screen-archive');
  if(!screen?.classList.contains('active')){ animHandle=0; return; }
  const c=CHARACTERS.find(x=>x.id===selectedId)||CHARACTERS[0];
  drawStickman(document.getElementById('archive-stickman'),c,'idle',t/120);
  animHandle=requestAnimationFrame(animate);
}

export function initCharacterGallery(){
  renderDetail();
  if(!animHandle)animHandle=requestAnimationFrame(animate);
}
