import { CHARACTERS, SCENES } from '../data/data.js';
import { portraitFor } from '../data/character-portraits.js';
import { teamSizeFor } from '../core/state.js';

let featuredId = CHARACTERS[0].id;
let cueTimer;
export const featuredCharacter = () => featuredId;

export function initPresentation(){
  const screen = document.getElementById('screen-title');
  const backdrop = new URL(SCENES.find(s=>s.id==='spring').art.image, document.baseURI).href;
  screen.style.setProperty('--title-scene', `url("${backdrop}")`);
  const roster = document.getElementById('title-roster');
  CHARACTERS.forEach(c => {
    const button = document.createElement('button');
    button.className = 'title-roster-item';
    button.dataset.hero = c.id;
    button.setAttribute('aria-label', `展示${c.name} · ${c.role}`);
    const portrait = portraitFor(c.id);
    button.innerHTML = `${portrait ? `<img src="${portrait}" alt="" loading="lazy">` : ''}<span>${c.name}</span>`;
    button.addEventListener('click', () => selectHero(c));
    roster.appendChild(button);
  });
  document.getElementById('title-roster-count').textContent = `${CHARACTERS.length} 位墨境行者`;
  document.getElementById('quick-battle-note').textContent = `普通难度 · 自动补齐双方 ${teamSizeFor('ai')} 人阵容`;
  selectHero(CHARACTERS[0]);
}

function selectHero(c){
  featuredId = c.id;
  const screen = document.getElementById('screen-title');
  screen.style.setProperty('--hero-color', c.color);
  const image = document.getElementById('title-hero-image');
  image.src = portraitFor(c.id) || '';
  image.alt = `${c.name}立绘`;
  image.classList.remove('hero-enter');
  void image.offsetWidth;
  image.classList.add('hero-enter');
  document.getElementById('title-hero-name').textContent = c.name;
  document.getElementById('title-hero-role').textContent = c.role;
  document.getElementById('title-hero-skills').textContent = c.skills.map(s=>s.name).join(' / ');
  document.getElementById('btn-quick-battle').textContent = `带${c.name}出战　↗`;
  document.querySelectorAll('[data-hero]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.hero === c.id)));
}

// 演出只读行动信息，既不等待它结束，也不接管伤害回调。
export function showSkillCue(actor, skill){
  const cue = document.getElementById('skill-cue');
  if(!cue) return;
  clearTimeout(cueTimer);
  cue.style.setProperty('--cue-color', skill.iconColor || actor.color);
  cue.replaceChildren();
  const portrait = portraitFor(actor.charId);
  if(portrait){
    const image = document.createElement('img'); image.src = portrait; image.alt = '';
    cue.appendChild(image);
  }
  const copy = document.createElement('div');
  const who = document.createElement('small'); who.textContent = `玩家${actor.player} · ${actor.name}`;
  const name = document.createElement('strong'); name.textContent = skill.name;
  copy.append(who, name); cue.appendChild(copy);
  cue.classList.remove('is-visible'); void cue.offsetWidth; cue.classList.add('is-visible');
  cueTimer = setTimeout(() => cue.classList.remove('is-visible'), 950);
}

export function clearSkillCue(){
  clearTimeout(cueTimer);
  document.getElementById('skill-cue')?.classList.remove('is-visible');
}
