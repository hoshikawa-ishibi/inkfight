// 机制词典 + 一次性教学提示。
//
// 两条路径共用下面这一份词条表：`short` 是机制首次触发时的提示，
// `body` 是随时可查的词典正文。同一条知识只写一处。
//
// 文案里的数值一律从 combat.js 的常量取，不手写。
import { playSfx } from './audio.js';
import {
  DEFAULT_INTERRUPT_SP, INTERRUPT_OUTPUT_MULTIPLIER,
  INK_EROSION_FROM, INK_EROSION_STEP,
  CRIT_METER_FULL, CRIT_MULTIPLIER, INTERRUPT_IMMUNE_TURNS,
} from '../core/combat.js';

const P = n => Math.round(n * 100);

// ── 词条 ───────────────────────────────────────────────────
// `short` 是一个字符串数组，每项渲染成一行。三行以内，顺序固定：
//   1. 刚才发生了什么（指向玩家此刻在屏幕上看得到的东西）
//   2. 规则是什么
//   3. 这对接下来的选择意味着什么
// 只有 `short` 非空的词条会触发提示；其余只进词典。
export const CODEX = [
  {
    id: 'crit',
    icon: '💥',
    title: '锋芒 / 重击',
    short: [
      '技能上出现 💥，是因为这个角色的锋芒条已经攒满 ' + CRIT_METER_FULL + '。',
      `下一次攻击<b>必定</b>打出重击，伤害 ×${CRIT_MULTIPLIER}，之后锋芒清零重新攒。`,
      '锋芒每次攻击固定累加，不是概率，所以把消耗最大的技能留到这一下最划算。',
    ],
    body: `每次攻击都会往角色的<b>锋芒</b>条里攒点数（单位卡上的「锋芒 47/${CRIT_METER_FULL}」），
      攒满 ${CRIT_METER_FULL} 就<b>必定</b>打出一次<b>重击</b>（伤害 ×${CRIT_MULTIPLIER}），之后清零重新攒。
      每击攒多少写在角色的属性里，技能自带的加成另算。<br><br>
      因为累加是固定的，<b>重击落在哪一下可以提前看出来</b>：锋芒条快满时它会变成金色，
      技能按钮上也会显示「💥 必定重击」。把消耗最大的技能留到那一下，是这套机制唯一的用法。`,
  },
  {
    id: 'multihit',
    icon: '👊',
    title: '多段技能',
    short: [
      '刚才那个技能分成了几段，每一段各自结算一次伤害。',
      '每一段也各自往锋芒条里攒一次，所以它的锋芒涨得比普通攻击快得多。',
      '想尽快凑出一次重击时，优先用多段技能。',
    ],
    body: `写着「两段共 120% 伤害」的技能，是真的结算两次，不是把一次攻击拆开显示。
      <b>每一段各自往锋芒条里攒一次</b>，所以多段角色（拳师、刀娘）的锋芒涨得特别快，
      重击也来得特别频繁。<br><br>
      拳师整套就建立在这上面：多段技能快速攒满锋芒，重击触发被动「寸劲」回 SP，
      回来的 SP 又够再放一次多段技能。`,
  },
  {
    id: 'interrupt',
    icon: '💫',
    title: '灵能扰乱',
    short: [
      `这个角色的 SP 超过了上限的 ${P(DEFAULT_INTERRUPT_SP)}%，被敌人的打断技能命中。`,
      `本次行动的伤害和治疗只剩 ${P(INTERRUPT_OUTPUT_MULTIPLIER)}%，行动结束后自动解除；护盾和净化不受影响。`,
      `接下来它自己的 ${INTERRUPT_IMMUNE_TURNS} 个回合内不会再被打断。`,
    ],
    body: `打断<b>不是概率，是条件</b>：目标的 SP 超过上限的
      <b>${P(DEFAULT_INTERRUPT_SP)}%</b> 才打得断，没超过则必定打不断。
      SP 条一直看得见，所以打不打得断是可以判断的。<br><br>
      被打断的一方，下一次行动的伤害和治疗降到 <b>${P(INTERRUPT_OUTPUT_MULTIPLIER)}%</b>，
      但<b>不会跳过回合</b>，仍然可以出手；护盾、净化和增益不受影响。行动结束后自动解除。<br><br>
      反过来说，SP 攒得越满越容易被打断。该花的时候就得花，不要一直坐在满蓝上。`,
  },
  {
    id: 'immune',
    icon: '🚫',
    title: '打断免疫',
    short: [],
    body: `挨过一次打断之后附带获得的状态：接下来自己的 ${INTERRUPT_IMMUNE_TURNS} 个回合内不会再被打断。
      作用是防止连锁——没有它，两个带打断的角色可以把对方一直锁住。<br><br>
      状态条上它显示为绿色，和红色的「扰乱」分在两组。两个同时在，说明刚被打断；
      只剩绿色的，说明扰乱已经消耗掉了。`,
  },
  {
    id: 'restregen',
    icon: '✨',
    title: '轮空回蓝',
    short: [
      '这回合你派了一个角色出手，其余队友各自回复了一些 SP。',
      'SP 只回给轮空的人，出手的那个不回。',
      '连续派同一个角色，他的 SP 会见底，所以派谁上场也要看谁还有蓝。',
    ],
    body: `每回合由你决定派谁出手，而 SP <b>只回给这回合没出手的队友</b>。<br><br>
      这两条规则是配套的：一直派最强的那个，他的 SP 会越用越少，
      板凳上的人则越攒越满。换人不是退让，是把 SP 换到需要的人身上。`,
  },
  {
    id: 'economy',
    icon: '⚖',
    title: '行动经济',
    short: [],
    body: `<b>每回合双方各行动一个单位</b>，与队伍人数无关。
      人数<b>只影响血池，不影响出手次数</b>：四个人不代表一回合能打四次。<br><br>
      单人 BOSS 因此每回合都能出手，而你的四个人共享同样的一次机会。
      这是 BOSS 战压力的来源。`,
  },
  {
    id: 'erosion',
    icon: '🕳',
    title: '墨蚀',
    short: [
      `已经打到第 ${INK_EROSION_FROM} 回合，从现在起每个角色在自己回合开始时都会掉血。`,
      `每多拖一回合就多掉 ${INK_EROSION_STEP} 点，无视防御和护盾，双方一视同仁。`,
      '继续对耗只会让两边一起变弱，需要尽快把局面打完。',
    ],
    body: `从第 <b>${INK_EROSION_FROM}</b> 回合起，每个单位在自己回合开始时损失 HP，
      每多拖一回合多掉 <b>${INK_EROSION_STEP}</b> 点，<b>无视防御和护盾</b>。<br><br>
      它对双方完全对称，正常长度的对局碰不到它。它针对的只有一种局面：
      双方都带满治疗和护盾、谁也打不死谁的续航僵局。`,
  },
  {
    id: 'shield',
    icon: '🛡',
    title: '护盾',
    short: [],
    body: `护盾<b>优先承受伤害</b>，并且<b>不受防御影响</b>。
      因此它套在低防角色身上收益最大，套在本来就很硬的角色身上收益最小。<br><br>
      护盾也不会被「扰乱」削弱：被打断的那一回合伤害和治疗只剩
      ${P(INTERRUPT_OUTPUT_MULTIPLIER)}%，但套盾仍是满额的。
      被扰乱的回合适合用来布防，而不是硬打。`,
  },
  {
    id: 'taunt',
    icon: '🎯',
    title: '嘲讽',
    short: [],
    body: `嘲讽让敌人<b>之后的决策</b>优先攻击自己。<br><br>
      它<b>不能改变敌人已经预告出来的那一击</b>：那条预告是一份承诺，
      技能和目标都已确定，只有目标先阵亡才会重选。
      看到预告指着牧师再开嘲讽，牧师依然会挨那一下。<br><br>
      嘲讽要在敌人做出下一次决策之前开，不是看到预告之后再开。`,
  },
  {
    id: 'intent',
    icon: '👁',
    title: '敌人预告',
    short: [],
    body: `敌人头顶写着它<b>下一击打谁、打多少</b>。这个数字是准确值，
      减防、重击、闪避减伤都已折算在内。<br><br>
      敌人<b>必须照预告执行</b>，除非目标先阵亡。因此应对方式是具体的：
      抢先把它打死、给目标套盾、把目标换下场，
      或者打断它，让这一击只剩 ${P(INTERRUPT_OUTPUT_MULTIPLIER)}% 威力。`,
  },
  {
    id: 'scene',
    icon: '🔮',
    title: '场景效果',
    short: [],
    body: `战场本身会改变规则：有的场景全场伤害 +15%，有的每回合额外回 5 SP。
      同一组敌人换一个场景，胜率可以相差十几个百分点。<br><br>
      当前场景写在战斗界面顶部的横幅上。`,
  },
];

const BY_ID = Object.fromEntries(CODEX.map(e => [e.id, e]));

// ── 已教过的条目 ───────────────────────────────────────────
// 教学提示的全部状态只用这一个 key。
const TAUGHT_KEY = 'inkfight_taught';

function taughtSet(){
  try { return new Set(JSON.parse(localStorage.getItem(TAUGHT_KEY)) || []); }
  catch { return new Set(); }
}
function markTaught(id){
  const s = taughtSet(); s.add(id);
  localStorage.setItem(TAUGHT_KEY, JSON.stringify([...s]));
}

// ── 弹窗 ───────────────────────────────────────────────────
// 样式复用 modal-mask / modal-box，但行为和 main.js 的 showModal 不同：
// 教学提示需要排队，词典需要滚动，所以这里自带一份。
//
// **关闭必须统一走 `dismiss()`。** 弹窗有三条关闭路径（按钮、点背景、ESC，
// 后者在 main.js 里调 `closeTop`），三条都必须触发 `onClose`——
// 教学提示靠它放出队列里的下一条。任何一条路径直接 `remove()`，
// `showing` 就会永远保持 true，后续提示进队列后不再显示，
// 且已被记为「已教过」，不会再有第二次机会。
//
// 弹窗不推进回合：回合由 battle.js 的 setTimeout 驱动，
// 遮罩挡住鼠标，键盘由 main.js 的 `isModalOpen()` 拦截。
// 战绩室的弹窗也走这里，不另造一套：`closeTop()`（ESC）对所有 .modal-mask
// 一视同仁，各写一份 remove() 就会绕过 onClose。
export function openModal(inner, wide, onClose){
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.innerHTML = `<div class="modal-box${wide ? ' modal-wide' : ''}">${inner}</div>`;
  mask._onClose = onClose || null;
  mask.addEventListener('click', e => { if(e.target === mask) dismiss(mask); });
  document.body.appendChild(mask);
  return mask;
}
export function dismiss(mask){
  if(!mask || !mask.isConnected) return;
  const cb = mask._onClose;
  mask._onClose = null;          // 只回调一次
  mask.remove();
  if(cb) cb();
}
export function isModalOpen(){ return !!document.querySelector('.modal-mask'); }
export function closeTop(){
  const all = document.querySelectorAll('.modal-mask');
  if(all.length) dismiss(all[all.length - 1]);
}

// ── 一次性教学提示 ─────────────────────────────────────────
// 每个 id 只提示一次，跨对局有效。
// 多条机制可能在同一帧触发，所以一次只显示一条，其余排队等上一条关闭。
let queue = [], showing = false;

export function teachOnce(id){
  const entry = BY_ID[id];
  if(!entry || !entry.short.length) return;
  if(taughtSet().has(id)) return;
  markTaught(id);            // 先记账：弹窗未关就重开一局也不应再弹
  queue.push(entry);
  if(!showing) drainQueue();
}

function drainQueue(){
  const entry = queue.shift();
  if(!entry){ showing = false; return; }
  showing = true;
  playSfx('buff');
  const mask = openModal(`
    <div class="codex-tip-tag">首次触发 · 仅显示一次</div>
    <h3 style="text-align:center;">${entry.icon} ${entry.title}</h3>
    ${entry.short.map(line => `<p class="codex-tip-line">${line}</p>`).join('')}
    <p class="codex-tip-foot">这条说明在战斗界面的「❓ 机制」里可以随时重看。</p>
    <div class="row"><button class="btn btn-confirm">明白了</button></div>`,
    false, drainQueue);
  mask.querySelector('.btn').addEventListener('click', () => { playSfx('click'); dismiss(mask); });
}

// ── 常驻机制词典 ───────────────────────────────────────────
export function openCodex(focusId){
  playSfx('click');
  const nav = CODEX.map(e =>
    `<button class="codex-nav-item" data-goto="${e.id}">${e.icon} ${e.title}</button>`).join('');
  const body = CODEX.map(e =>
    `<section class="codex-entry" id="codex-${e.id}">
       <h4>${e.icon} ${e.title}</h4>
       <p>${e.body}</p>
     </section>`).join('');
  const mask = openModal(`
    <h3 style="text-align:center;">📚 机制词典</h3>
    <div class="codex-nav">${nav}</div>
    <div class="codex-body">${body}</div>
    <div class="row"><button class="btn btn-confirm">关闭</button></div>`, true);
  mask.querySelector('.btn-confirm').addEventListener('click', () => { playSfx('click'); dismiss(mask); });
  mask.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => {
    playSfx('hover');
    mask.querySelector('#codex-' + b.dataset.goto)
      .scrollIntoView({ behavior:'smooth', block:'start' });
  }));
  if(focusId && BY_ID[focusId])
    setTimeout(() => mask.querySelector('#codex-' + focusId)?.scrollIntoView({ block:'start' }), 30);
  return mask;
}
