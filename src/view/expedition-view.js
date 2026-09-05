import { CHARACTERS } from '../data/data.js';
import { portraitFor } from '../data/character-portraits.js';

const PHASE_NAMES = {
  landing: '启程', blessing: '墨契', route: '择路', briefing: '战前',
  battle: '交锋', reward: '战后', camp: '歇脚', complete: '抵达', failed: '留痕'
};

const STOP_WORDS = ['壹', '贰', '叁'];

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function text(value, fallback = '') {
  const result = String(value ?? '').trim();
  return result || fallback;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function safeColor(value, fallback = '#6cae9a') {
  const color = String(value ?? '').trim();
  return /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\))$/i.test(color)
    ? color : fallback;
}

function clampRatio(value) {
  const ratio = Number(value);
  return Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
}

function characterFor(id) {
  return CHARACTERS.find(character => character.id === id) || null;
}

function portraitMarkup(id, name, className = 'expedition-portrait') {
  const character = characterFor(id);
  const color = safeColor(character?.color, '#6cae9a');
  const portrait = portraitFor(id);
  if (portrait) {
    return `<img class="${className}" src="${esc(portrait)}" alt="${esc(name || character?.name || '角色')}" loading="lazy" draggable="false">`;
  }
  const initial = esc(text(name, character?.name || '?').slice(0, 1));
  return `<span class="${className} expedition-portrait-fallback" style="--portrait-color:${esc(color)}" aria-hidden="true">${initial}</span>`;
}

function relicGlyph(relic) {
  return `<span class="expedition-relic-glyph" style="--relic-color:${esc(safeColor(relic?.color, '#c89a56'))}" aria-hidden="true">${esc(text(relic?.glyph, '✦'))}</span>`;
}

function relicCard(relic, index, action = 'relic') {
  const item = relic || {};
  const id = text(item.id, `relic-${index}`);
  return `<button class="expedition-choice-card expedition-relic-card" type="button" data-action="${esc(action)}" data-value="${esc(id)}" aria-label="选择遗物：${esc(text(item.name, '无名遗物'))}">
    <span class="expedition-card-index">${String(index + 1).padStart(2, '0')}</span>
    ${relicGlyph(item)}
    <span class="expedition-card-copy"><span class="expedition-card-tag">${esc(text(item.tag, '墨契'))}</span><strong>${esc(text(item.name, '无名遗物'))}</strong><span class="expedition-card-description">${esc(text(item.description, '一件尚未显形的遗物。'))}</span></span>
    <span class="expedition-card-arrow" aria-hidden="true">↗</span>
  </button>`;
}

function enemyCard(enemyId, index, compact = false) {
  const character = characterFor(enemyId);
  const name = text(character?.name, enemyId || '未知对手');
  const role = text(character?.role, '墨影');
  return `<article class="expedition-enemy-card${compact ? ' is-compact' : ''}" style="--enemy-color:${esc(safeColor(character?.color, '#9b7567'))}">
    <div class="expedition-enemy-portrait">${portraitMarkup(enemyId, name, 'expedition-portrait')}</div>
    <div class="expedition-enemy-meta"><span class="expedition-overline">敌影 ${String(index + 1).padStart(2, '0')}</span><strong>${esc(name)}</strong><span>${esc(role)}</span></div>
  </article>`;
}

function teamPanel(view) {
  const team = list(view.team);
  if (!team.length) return '';
  return `<aside class="expedition-side-panel expedition-team-panel">
    <div class="expedition-side-heading"><span class="expedition-overline">同行者</span><strong>墨契小队</strong><span class="expedition-side-rule"></span></div>
    <div class="expedition-team-list">${team.map((member, index) => {
      const ratio = clampRatio(member?.hpRatio);
      const color = safeColor(member?.color || characterFor(member?.charId)?.color, '#6cae9a');
      const name = text(member?.name, characterFor(member?.charId)?.name || `同行者 ${index + 1}`);
      return `<div class="expedition-team-member" style="--member-color:${esc(color)}">
        <div class="expedition-team-portrait">${portraitMarkup(member?.charId, name, 'expedition-portrait')}</div>
        <div class="expedition-team-copy"><strong>${esc(name)}</strong><span class="expedition-hp-label">生息 ${Math.round(ratio * 100)}%</span><span class="expedition-hp-track" role="progressbar" aria-label="${esc(name)}当前生命" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(ratio * 100)}"><span style="width:${ratio * 100}%"></span></span></div>
      </div>`;
    }).join('')}</div>
  </aside>`;
}

function relicPanel(view) {
  const relics = list(view.relics);
  return `<aside class="expedition-side-panel expedition-relic-panel">
    <div class="expedition-side-heading"><span class="expedition-overline">已收墨印</span><strong>随身遗物</strong><span class="expedition-side-rule"></span></div>
    ${relics.length ? `<div class="expedition-owned-relics">${relics.map(relic => `<div class="expedition-owned-relic">${relicGlyph(relic)}<span><strong>${esc(text(relic?.name, '无名遗物'))}</strong><small>${esc(text(relic?.tag, '墨契'))}</small></span></div>`).join('')}</div>` : '<p class="expedition-empty-note">还没有遗物。路会替你留下第一道印。</p>'}
  </aside>`;
}

function historyPanel(view) {
  const history = list(view.history);
  return `<div class="expedition-history-list">${[0, 1, 2].map(index => {
    const entry = history[index];
    const state = entry ? (entry.won ? 'won' : 'lost') : 'pending';
    const label = text(entry?.name, '尚未落笔');
    const rounds = entry && entry.rounds != null ? ` · ${esc(entry.rounds)}回合` : '';
    return `<div class="expedition-history-row is-${state}"><span class="expedition-history-mark" aria-hidden="true">${entry ? (entry.won ? '✓' : '×') : '·'}</span><span><strong>${STOP_WORDS[index]} · ${esc(label)}</strong><small>${entry ? (entry.won ? `已通过${rounds}` : `止步于此${rounds}`) : '等待远征到达'}</small></span></div>`;
  }).join('')}</div>`;
}

function progressMap(view) {
  const phase = text(view.phase, 'landing');
  const completed = phase === 'complete' ? 3 : list(view.history).filter(item => item?.won).length;
  const activeIndex = Math.max(0, Math.min(2, Number(view.battleIndex) || 0));
  const routeName = text(view.activeRoute?.name, '下一站');
  const points = [
    { x: 56, y: 82, label: text(view.history?.[0]?.name, '入墨') },
    { x: 220, y: 34, label: text(view.history?.[1]?.name, '回锋') },
    { x: 384, y: 82, label: text(view.history?.[2]?.name, '归印') }
  ];
  const pointMarkup = points.map((point, index) => {
    const state = index < completed ? 'done' : index === activeIndex && phase !== 'landing' ? 'active' : 'future';
    return `<g class="expedition-map-stop is-${state}"><circle cx="${point.x}" cy="${point.y}" r="${state === 'active' ? 13 : 10}"></circle><circle class="expedition-map-core" cx="${point.x}" cy="${point.y}" r="3"></circle><text x="${point.x}" y="${point.y + 33}" text-anchor="middle">${esc(STOP_WORDS[index])}</text><title>${esc(point.label)}</title></g>`;
  }).join('');
  return `<section class="expedition-map-panel" aria-label="墨路三站进度">
    <div class="expedition-map-heading"><div><span class="expedition-overline">THE INK ROAD · 03 CHECKPOINTS</span><strong>${phase === 'landing' ? '一纸未落，三站待行' : `墨路进度 · ${esc(routeName)}`}</strong></div><span class="expedition-map-count">${phase === 'landing' ? '等待启程' : `${Math.min(completed, 3)} / 3 已留印`}</span></div>
    <svg class="expedition-map" viewBox="0 0 440 126" role="img" aria-label="三站手绘旅程地图">
      <path class="expedition-map-line" d="M56 82 C112 100 168 10 220 34 S329 100 384 82"></path>
      <path class="expedition-map-echo" d="M56 88 C115 106 166 22 220 42 S325 106 384 88"></path>
      <path class="expedition-map-branch" d="M220 34 C248 15 273 15 295 27"></path>
      ${pointMarkup}
    </svg>
  </section>`;
}

function runHeader(view) {
  const phase = text(view.phase, 'landing');
  const running = phase !== 'landing' && phase !== 'complete' && phase !== 'failed';
  return `<header class="expedition-header">
    <div class="expedition-brand"><span class="expedition-brand-mark" aria-hidden="true">墨</span><div><span class="expedition-overline">INKFIGHT · EXPEDITION</span><strong>墨路远征</strong></div></div>
    <div class="expedition-header-right"><span class="expedition-phase-chip">${esc(PHASE_NAMES[phase] || phase)}</span>${phase !== 'landing' && view.seed ? `<button class="expedition-text-button" type="button" data-action="copy-seed" aria-label="复制本次远征种子">种子 ${esc(view.seed)} · 复制</button>` : ''}${running ? '<button class="expedition-text-button expedition-abandon" type="button" data-action="abandon" aria-label="放弃本次远征">放弃远征</button>' : ''}${phase === 'landing' ? '<button class="expedition-text-button expedition-home-link" type="button" data-action="home" aria-label="返回首页">返回首页 <span aria-hidden="true">⌂</span></button>' : ''}</div>
  </header>`;
}

function landingView(view) {
  const parties = list(view.parties).slice(0, 3);
  const selected = view.__selectedParty || '';
  return `<section class="expedition-landing expedition-main-column">
    <div class="expedition-landing-top"><div class="expedition-landing-intro"><span class="expedition-brush-stroke" aria-hidden="true"></span><span class="expedition-overline">THREE STROKES · ONE FINISH</span><h1>墨路远征</h1><p class="expedition-motto">三笔成阵，一笔收锋</p><p>把一支小队交给一条会改变形状的墨路。每一次择路、取印与歇脚，都会把下一笔写得更近。</p><div class="expedition-rules-note"><span class="expedition-overline">本局节奏</span><strong>${esc(text(view.rulesText, '共用三墨 · 自由连携 · 伤势延续'))}</strong></div></div><aside class="expedition-ink-lesson" aria-label="三笔墨构筑说明"><div class="expedition-ink-lesson-head"><span class="expedition-overline">THE THREE INK STROKES</span><strong>三笔墨，写出一整轮</strong></div><svg class="expedition-ink-lesson-art" viewBox="0 0 420 194" role="img" aria-label="三墨滴可以组成一加一加一连携、一加二铺垫重招、三墨独占整轮"><path class="lesson-brush-line" d="M35 31 C114 11 201 48 382 24"></path><text class="lesson-ink-character" x="27" y="114">墨</text><g class="lesson-drop-hero"><circle cx="113" cy="92" r="15"></circle><circle cx="151" cy="92" r="15"></circle><circle cx="189" cy="92" r="15"></circle></g><text class="lesson-equation" x="114" y="132">1 + 1 + 1</text><text class="lesson-label" x="114" y="153">连携 · 三人各落一笔</text><g class="lesson-combo" transform="translate(254 66)"><circle cx="0" cy="0" r="10"></circle><text x="19" y="5">+</text><circle cx="45" cy="0" r="15"></circle><circle cx="45" cy="0" r="7" class="lesson-inner-drop"></circle><text class="lesson-combo-label" x="22" y="31">1 + 2</text><text class="lesson-combo-caption" x="22" y="49">铺垫重招</text></g><g class="lesson-combo lesson-combo-last" transform="translate(254 137)"><circle cx="0" cy="0" r="19"></circle><circle cx="0" cy="0" r="9" class="lesson-inner-drop"></circle><text x="29" y="6">3</text><text class="lesson-combo-caption" x="64" y="5">独占整轮</text></g></svg><p class="expedition-ink-lesson-note">三次轻招或一记重招，收笔时余墨化盾。</p></aside></div>
    <p class="expedition-career">已启程 ${esc(view.best?.attempts || 0)} 次 · 完成 ${esc(view.best?.completed || 0)} 次${list(view.best?.titles).length ? ` · 称号：${esc(view.best.titles.join('、'))}` : ''}</p><div class="expedition-section-heading"><div><span class="expedition-overline">01 · 选择同行者</span><h2>从一纸阵容出发</h2></div><span>三种起笔，各有回声</span></div>
    <div class="expedition-party-grid">${parties.map((party, index) => {
      const partyId = text(party?.id, `party-${index}`);
      const ids = list(party?.charIds);
      return `<button class="expedition-party-card${selected === partyId ? ' is-selected' : ''}" type="button" data-action="select-party" data-party-id="${esc(partyId)}" aria-pressed="${selected === partyId}" aria-label="选择阵容：${esc(text(party?.name, `阵容 ${index + 1}`))}">
        <span class="expedition-party-number">${String(index + 1).padStart(2, '0')}</span><span class="expedition-party-brush" aria-hidden="true"></span><strong>${esc(text(party?.name, `阵容 ${index + 1}`))}</strong><span class="expedition-party-description">${esc(text(party?.description, '一支等待你落笔的队伍。'))}</span>
        <span class="expedition-party-portraits">${ids.slice(0, 4).map(id => portraitMarkup(id, characterFor(id)?.name, 'expedition-party-portrait')).join('')}</span><span class="expedition-party-check" aria-hidden="true">${selected === partyId ? '已选' : '选择'}</span>
      </button>`;
    }).join('')}</div>
    <div class="expedition-start-dock"><div class="expedition-seed-wrap"><label class="expedition-seed-field"><span>路线种子 <small>可选 · 留空随机</small></span><input class="expedition-seed-input" type="text" maxlength="40" autocomplete="off" placeholder="留空，让墨迹自行流动" aria-label="输入可选的路线种子" value=""></label>${view.hasSavedRun && view.seed ? `<span class="expedition-saved-seed">已保存种子：${esc(view.seed)} · 可手填复刻 <button type="button" class="expedition-seed-copy" data-action="copy-seed" aria-label="复制已保存种子">复制</button></span>` : ''}</div><div class="expedition-start-actions"><button class="expedition-primary-button" type="button" data-action="start" ${selected ? '' : 'disabled'}>落笔启程 <span>↗</span></button><button class="expedition-secondary-button" type="button" data-action="continue" ${view.hasSavedRun ? '' : 'disabled'}>继续上次远征 <span aria-hidden="true">↻</span></button></div></div>
    ${view.hasSavedRun ? '<p class="expedition-save-note"><span aria-hidden="true">●</span> 旅程已保存在本机。中断的战斗会从本战开头重来。</p>' : ''}
  </section>`;
}

function choiceView(view, phase) {
  const isReward = phase === 'reward';
  const offers = list(view.offers).slice(0, 3);
  return `<section class="expedition-main-column expedition-choice-view"><div class="expedition-page-kicker"><span class="expedition-overline">${isReward ? 'AFTER THE CLASH' : 'A MARK FOR THE ROAD'}</span><span class="expedition-kicker-symbol" aria-hidden="true">${isReward ? '✧' : '◌'}</span></div><h1>${isReward ? '战后拾墨' : '墨契祝福'}</h1><p class="expedition-lede">${isReward ? `还可取 ${Math.max(0, Number(view.rewardsRemaining)||0)} 件墨契。每次从三件中选一件，带入后续战斗。` : '远征从一枚选择开始。三道墨契在纸上显形，只能带走其中一道。'}</p><div class="expedition-card-grid">${offers.map((offer, index) => relicCard(offer, index)).join('')}</div></section>`;
}

function routeCard(route, index, selectedId) {
  const item = route || {};
  const id = text(item.id, `route-${index}`);
  const enemies = list(item.enemyIds);
  const selected = selectedId && selectedId === id;
  return `<article class="expedition-route-card${selected ? ' is-selected' : ''}" style="--route-accent:${esc(safeColor(item.color, index ? '#b98667' : '#6cae9a'))}">
    <div class="expedition-route-card-head"><span class="expedition-card-index">${String(index + 1).padStart(2, '0')}</span><span class="expedition-route-kind">${esc(item.kind === 'elite' ? '精英墨关' : '寻常墨关')}</span><span class="expedition-route-scene">${esc(text(item.sceneName, item.sceneId || '未知场景'))}</span></div>
    <h3>${esc(text(item.name, `无名之路 ${index + 1}`))}</h3><p class="expedition-route-description">${esc(text(item.description, '一条尚未显形的路。'))}</p>
    <div class="expedition-route-enemies">${enemies.length ? enemies.map((id, enemyIndex) => enemyCard(id, enemyIndex, true)).join('') : '<span class="expedition-empty-note">敌影尚未显形</span>'}</div>
    <div class="expedition-route-details"><span><b>胜后所得</b>${esc(item.rewardText || `${item.rewardCount ?? '—'} 件墨契`)}</span><span><b>路上变化</b>${esc(text(item.modText, '无额外描述'))}</span></div>
    <button class="expedition-route-select" type="button" data-action="route" data-value="${esc(id)}" aria-label="选择路线：${esc(text(item.name, `无名之路 ${index + 1}`))}">${selected ? '已选此路' : '选这条路'} <span aria-hidden="true">↗</span></button>
  </article>`;
}

function routeView(view) {
  const routes = list(view.routes);
  const selected = text(view.activeRoute?.id, '');
  return `<section class="expedition-main-column expedition-route-view"><div class="expedition-page-kicker"><span class="expedition-overline">THE ROAD FORKS</span><span class="expedition-kicker-symbol" aria-hidden="true">⌁</span></div><h1>择路</h1><p class="expedition-lede">两条路，两组敌人。比较阵容与战后奖励，再决定在哪里落笔。</p><div class="expedition-route-grid">${routes.slice(0, 2).map((route, index) => routeCard(route, index, selected)).join('')}</div></section>`;
}

function briefingView(view) {
  const route = view.activeRoute || {};
  const enemies = list(route.enemyIds);
  return `<section class="expedition-main-column expedition-briefing-view"><div class="expedition-page-kicker"><span class="expedition-overline">CHECKPOINT ${Math.min(3, (Number(view.battleIndex) || 0) + 1)} · INK MEETS INK</span><span class="expedition-kicker-symbol" aria-hidden="true">⚔</span></div><h1>战前一瞥</h1><p class="expedition-lede">你选择了「${esc(text(route.name, '这条路'))}」。纸面已经写出这一站的轮廓。</p><div class="expedition-briefing-card"><div class="expedition-briefing-meta"><span class="expedition-route-kind">${esc(route.kind === 'elite' ? '精英墨关' : '寻常墨关')}</span><strong>${esc(text(route.sceneName, route.sceneId || '未知场景'))}</strong><p>${esc(text(route.modText, '此站没有额外路况。'))}</p></div><div class="expedition-enemy-line">${enemies.length ? enemies.map((id, index) => enemyCard(id, index)).join('') : '<span class="expedition-empty-note">敌影尚未显形</span>'}</div><div class="expedition-briefing-foot"><span>胜后所得：<b>${esc(route.rewardText || `${route.rewardCount ?? '—'} 件墨契`)}</b></span><button class="expedition-primary-button" type="button" data-action="launch">踏入战场 <span>↗</span></button></div></div></section>`;
}

function battleView(view) {
  const route = view.activeRoute || {};
  return `<section class="expedition-main-column expedition-battle-view"><div class="expedition-battle-sigil" aria-hidden="true"><span></span><b>墨</b></div><span class="expedition-overline">CHECKPOINT ${Math.min(3, (Number(view.battleIndex) || 0) + 1)} · SAVED</span><h1>战斗已落印</h1><p class="expedition-lede">路线、墨契和战前伤势已保存。重新进入会从本战第 1 轮开始。</p><div class="expedition-battle-brief"><span class="expedition-route-kind">当前路线</span><strong>${esc(text(route.name, '未择之路'))}</strong><span>${esc(text(route.sceneName, route.sceneId || '未知场景'))}</span></div><button class="expedition-primary-button expedition-launch-large" type="button" data-action="launch">重新进入战场 <span>↗</span></button></section>`;
}

function campView(view) {
  const options = list(view.campOptions);
  return `<section class="expedition-main-column expedition-camp-view"><div class="expedition-page-kicker"><span class="expedition-overline">BETWEEN INK AND ASH</span><span class="expedition-kicker-symbol" aria-hidden="true">⌂</span></div><h1>歇脚</h1><p class="expedition-lede">下一站还在纸外。用一小段安静，决定队伍如何把余墨带下去。</p><div class="expedition-camp-grid">${options.slice(0, 2).map((option, index) => `<button class="expedition-choice-card expedition-camp-card" type="button" data-action="camp" data-value="${esc(text(option?.id, `camp-${index}`))}" aria-label="选择歇脚方式：${esc(text(option?.name, `选项 ${index + 1}`))}"><span class="expedition-card-index">${String(index + 1).padStart(2, '0')}</span><span class="expedition-camp-glyph" aria-hidden="true">${index === 0 ? '◒' : '⌘'}</span><span class="expedition-card-copy"><span class="expedition-card-tag">${index === 0 ? 'REST' : 'FORGE'}</span><strong>${esc(text(option?.name, `歇脚选项 ${index + 1}`))}</strong><span class="expedition-card-description">${esc(text(option?.description, '让下一笔更稳。'))}</span></span><span class="expedition-card-arrow" aria-hidden="true">↗</span></button>`).join('')}</div><p class="expedition-resource-note">已磨锋次数：<b>${esc(view.forge ?? 0)}</b></p></section>`;
}

function recapView(view, phase) {
  const won = phase === 'complete';
  return `<section class="expedition-main-column expedition-recap-view"><div class="expedition-recap-stamp is-${won ? 'complete' : 'failed'}" aria-hidden="true">${won ? '抵达' : '留痕'}</div><span class="expedition-overline">THE INK ROAD REMEMBERS</span><h1>${won ? '墨路尽头' : '墨路未尽'}</h1><p class="expedition-lede">${won ? '三处关隘都已留下你的印。' : '这一次停在了墨路中段，但留下的笔势仍然属于你。'}</p>${won && view.activeRoute?.kind === 'elite' ? '<p class="expedition-title-earned">终局险路已破 · 获得称号「破阵归人」</p>' : ''}${historyPanel(view)}<div class="expedition-recap-actions"><button class="expedition-primary-button" type="button" data-action="new">再开一纸 <span>↗</span></button><button class="expedition-secondary-button" type="button" data-action="home">回到首页 <span>⌂</span></button></div></section>`;
}

function phaseView(view) {
  switch (view.phase) {
    case 'landing': return landingView(view);
    case 'blessing': return choiceView(view, 'blessing');
    case 'route': return routeView(view);
    case 'briefing': return briefingView(view);
    case 'battle': return battleView(view);
    case 'reward': return choiceView(view, 'reward');
    case 'camp': return campView(view);
    case 'complete':
    case 'failed': return recapView(view, view.phase);
    default: return landingView({ ...view, phase: 'landing' });
  }
}

function sideRail(view) {
  if (view.phase === 'landing') return '';
  return `<aside class="expedition-rail">${teamPanel(view)}${relicPanel(view)}${view.phase === 'complete' || view.phase === 'failed' ? '' : '<p class="expedition-rail-note">每一道墨印都只属于这条远征。</p>'}</aside>`;
}

function bindDelegation(root) {
  if (root.__expeditionDelegated) return;
  root.__expeditionDelegated = true;
  root.addEventListener('click', event => {
    const target = event.target.closest('[data-action]');
    if (!target || !root.contains(target) || target.disabled) return;
    const action = target.dataset.action;
    if (action === 'select-party') {
      root.__expeditionSelectedParty = target.dataset.partyId || '';
      root.querySelectorAll('[data-action="select-party"]').forEach(card => {
        const selected = card.dataset.partyId === root.__expeditionSelectedParty;
        card.classList.toggle('is-selected', selected);
        card.setAttribute('aria-pressed', String(selected));
        const check = card.querySelector('.expedition-party-check');
        if (check) check.textContent = selected ? '已选' : '选择';
      });
      const startButton = root.querySelector('[data-action="start"]');
      if (startButton) startButton.disabled = !root.__expeditionSelectedParty;
      return;
    }
    const value = target.dataset.value;
    if (action === 'start') {
      const seedInput = root.querySelector('.expedition-seed-input');
      root.__expeditionOnAction?.('start', { partyId: root.__expeditionSelectedParty || '', seed: seedInput?.value?.trim() || '' });
      return;
    }
    if (action === 'new') root.__expeditionSelectedParty = '';
    root.__expeditionOnAction?.(action, value || undefined);
  });
}

/**
 * Render the presentation layer for 墨路远征. The parent owns all state and
 * rules; this view only escapes supplied text, draws the map, and emits actions.
 */
export function renderExpedition(root, view = {}, onAction = () => {}) {
  if (!root) return;
  bindDelegation(root);
  root.__expeditionOnAction = onAction;
  const phase = text(view.phase, 'landing');
  if (phase === 'landing' && root.__expeditionSelectedParty && !list(view.parties).some(party => party?.id === root.__expeditionSelectedParty)) {
    root.__expeditionSelectedParty = '';
  }
  const renderView = phase === 'landing' ? { ...view, __selectedParty: root.__expeditionSelectedParty || '' } : view;
  root.classList.add('expedition-root');
  Array.from(root.classList).forEach(className => {
    if (className.startsWith('expedition-phase-')) root.classList.remove(className);
  });
  root.classList.add(`expedition-phase-${phase.replace(/[^a-z0-9_-]/gi, '') || 'landing'}`);
  root.innerHTML = `<div class="expedition-inkwash" aria-hidden="true"></div><div class="expedition-shell">${runHeader(renderView)}${phase !== 'landing' ? progressMap(renderView) : ''}<div class="expedition-layout">${phaseView(renderView)}${sideRail(renderView)}</div></div>`;
}
