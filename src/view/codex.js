// 机制词典 + 一次性教学提示（UX_PLAN.md 阶段 3）
//
// **为什么不是「把玩法说明写得更全」**：静态文本已经被证伪了。2026-08-30 的
// 玩家实测里，agent **读过**玩法说明、扰乱那条甚至原样复述了出来，然后照样
// 不懂——读的时候没有上下文，读完就忘。
//
// 所以这里做两件事：
//   1. **一次性提示**：某个机制第一次落到玩家身上的**那一刻**弹一条说明。
//      学习发生在困惑发生的时候，不是在主菜单。
//   2. **常驻词典**：打到一半忘了可以随时查（战斗界面右下角的 ❓）。
//
// 两者共用同一份词条文本（下面的 `CODEX`），不写两遍——
// 「同一份知识两份实现」是这个项目的头号病因。
import { playSfx } from './audio.js';
import {
  DEFAULT_INTERRUPT_SP, INTERRUPT_OUTPUT_MULTIPLIER,
  INK_EROSION_FROM, INK_EROSION_STEP,
} from '../core/combat.js';

const P = n => Math.round(n * 100);

// ── 词条 ───────────────────────────────────────────────────
// `short` 是一次性提示弹出来时说的那句（短，戳中当下这一刻）；
// `body` 是词典里的常驻版（长，讲清整个因果）。
// 只有 `short` 非空的词条才会被 `teachOnce` 触发。
export const CODEX = [
  {
    id: 'crit',
    icon: '💥',
    title: '锋芒 / 重击',
    short: '锋芒攒满了，这一击<b>必定</b>重击——不是运气，是数出来的。',
    body: `每次攻击都会往角色的<b>锋芒</b>条里攒点数（单位卡上的「锋芒 47/100」），
      攒满 100 就<b>必定</b>打出一次<b>重击</b>（伤害 ×1.5），然后清零重攒。
      <b>这是确定的，不是概率</b>——所以你可以数出来是哪一下，
      把最贵的那个技能留到那一刀上。技能按钮上写着 <b>💥N 必定重击</b> 的时候就是它了。`,
  },
  {
    id: 'multihit',
    icon: '👊',
    title: '多段技能',
    short: '多段技能的<b>每一段都单独攒锋芒</b>，所以它充能特别快。',
    body: `「两段共 120% 伤害」不是把一次攻击拆开显示——它真的结算了两次，
      <b>每一段各自往锋芒条里攒一次</b>。所以多段角色（拳师、刀娘）的锋芒涨得特别快，
      重击也来得特别频繁。拳师那一整套就是这么转的：
      多段 → 快充锋芒 → 频繁重击 → 被动「寸劲」在重击后回蓝 → 又能放多段。`,
  },
  {
    id: 'interrupt',
    icon: '💫',
    title: '灵能扰乱（被打断）',
    short: `你 SP 过半被抓了；这次行动只有 ${P(INTERRUPT_OUTPUT_MULTIPLIER)}% 威力，
      但接下来 2 个回合不会再被打断。`,
    body: `打断<b>不是概率，是条件</b>：只有当目标的 SP 超过上限的
      <b>${P(DEFAULT_INTERRUPT_SP)}%</b> 时才打得断，否则必定打不断。
      SP 条一直看得见，所以这是判断不是赌博——代价是<b>坐在满蓝上很危险</b>，该花就得花。<br><br>
      被打断之后：下一次行动的伤害和治疗降到 <b>${P(INTERRUPT_OUTPUT_MULTIPLIER)}%</b>
      （<b>不是跳过回合</b>，你照样能出手），行动完自动解除。护盾、净化和增益不受影响。`,
  },
  {
    id: 'immune',
    icon: '🚫',
    title: '打断免疫',
    short: '',
    body: `被打断的<b>副作用</b>：挨了一次打断之后，接下来自己的 2 个回合内不会再被打断。
      它存在的理由是<b>防连锁</b>——没有它，两个带打断的角色能把对方一直锁死。<br><br>
      状态条上它是绿色的（对自己有利），和红色的「扰乱」分在两组，中间有分隔线。
      两个都在，说明你刚被打断；只剩绿的，说明扰乱已经用掉了。`,
  },
  {
    id: 'restregen',
    icon: '✨',
    title: '轮空回蓝',
    short: '这回合没派上场的队友会回蓝——不是所有人都该一直出战。',
    body: `每回合<b>你自己挑派谁上</b>，而回蓝<b>只给这回合没出手的队友</b>。<br><br>
      这两条是配套的：一直派最强的那个，会把他的蓝耗干，而板凳上的人越攒越满。
      换人不是妥协，是资源管理。`,
  },
  {
    id: 'economy',
    icon: '⚖',
    title: '行动经济',
    short: '',
    body: `<b>每回合双方各行动一个单位</b>，跟队伍人数无关。
      所以人数<b>只影响血池，不影响出手次数</b>——四个人不代表一回合能打四次。<br><br>
      反过来看单人 BOSS：它每回合都出手，而你四个人共享同样的一次出手机会。
      这就是 BOSS 战的压力来源。`,
  },
  {
    id: 'erosion',
    icon: '🕳',
    title: '墨蚀',
    short: `第 ${INK_EROSION_FROM} 回合起每回合掉血，而且越掉越多，无视防御和护盾——局面必须收尾了。`,
    body: `从第 <b>${INK_EROSION_FROM}</b> 回合起，每个单位在自己回合开始时损失 HP，
      每多拖一回合就多掉 <b>${INK_EROSION_STEP}</b> 点，<b>无视防御和护盾</b>。<br><br>
      它对双方完全对称，正常长度的对局根本碰不到它。它只对付一种情况：
      双方都带满治疗和护盾、谁也打不死谁的续航僵局。
      看到它出现，就该想「我怎么在接下来几回合里赢下来」，而不是继续对耗。`,
  },
  {
    id: 'shield',
    icon: '🛡',
    title: '护盾',
    short: '',
    body: `护盾<b>优先承受伤害</b>，而且<b>不受防御影响</b>——防御高的人套盾不会更耐打，
      防御低的人套盾收益反而最直接。<br><br>
      护盾也不会被「扰乱」削弱：被打断的那一回合，伤害和治疗降到
      ${P(INTERRUPT_OUTPUT_MULTIPLIER)}%，但<b>套盾还是满额的</b>。
      所以被扰乱的回合适合拿来布防，而不是硬打。`,
  },
  {
    id: 'taunt',
    icon: '🎯',
    title: '嘲讽',
    short: '',
    body: `嘲讽让敌人<b>之后的决策</b>优先打你。<br><br>
      但它<b>拦不住已经预告出来的那一击</b>——敌人头顶那条预告是一个<b>承诺</b>，
      技能和目标都已经定死了，只有目标先死了才会重选。
      所以「牧师头上有预告 → 赶紧开嘲讽去救」是<b>救不回来</b>的，牧师照样会挨那一下。
      嘲讽要<b>提前开</b>，在敌人做下一次决策之前。`,
  },
  {
    id: 'intent',
    icon: '👁',
    title: '敌人预告',
    short: '',
    body: `敌人头顶写着它<b>下一击要打谁、大概打多少</b>。这个数字是<b>准的</b>，
      不是估的——减防、重击、闪避减伤都已经折算进去了。<br><br>
      而且敌人<b>必须照预告打出来</b>（除非目标先死了）。
      所以你能做的事很具体：抢在它之前把它打死、给目标套盾、把目标换下去、
      或者打断它让这一击只剩 ${P(INTERRUPT_OUTPUT_MULTIPLIER)}% 威力。`,
  },
  {
    id: 'scene',
    icon: '🔮',
    title: '场景效果',
    short: '',
    body: `战场本身会改变规则：有的场景全场伤害 +15%，有的每回合多回 5 SP。
      选场景不是选背景图——同一组敌人换个场景，难度能差十几个百分点。<br><br>
      当前场景写在战斗界面顶部的横幅上。`,
  },
];

const BY_ID = Object.fromEntries(CODEX.map(e => [e.id, e]));

// ── 已教过的条目 ───────────────────────────────────────────
// 和 inkfight_muted 同样的路子：一个 key，存一个 id 集合。
// **只能有这一个 key**——别为「词典读过没有」之类的东西再开第二个。
const TAUGHT_KEY = 'inkfight_taught';

function taughtSet(){
  try { return new Set(JSON.parse(localStorage.getItem(TAUGHT_KEY)) || []); }
  catch { return new Set(); }
}
function markTaught(id){
  const s = taughtSet(); s.add(id);
  localStorage.setItem(TAUGHT_KEY, JSON.stringify([...s]));
}
export function resetTaught(){ localStorage.removeItem(TAUGHT_KEY); }

// ── 弹窗 ───────────────────────────────────────────────────
// 自带一份，不去依赖 main.js 的 showModal——那个没导出，而且这里要的
// 行为不一样（教学提示要能排队，词典要能滚动）。样式复用同一批 class。
//
// **战斗中打开不会推进回合**：回合是 battle.js 里的 setTimeout 在推，
// 弹窗只是一层 DOM 遮罩。遮罩会挡住点击，所以也不会误触技能；
// 键盘快捷键那边由 main.js 的 `isModalOpen()` 挡。
//
// **所有关闭路径都必须走 `dismiss`。** 一个弹窗有三种关法：按钮、点背景、按 ESC
// （ESC 那条在 main.js，调的是这里导出的 `closeTop`）。教学提示关掉时要接着放
// 队列里的下一条，只要有一条路径绕过去直接 `remove()`，`showing` 就永远卡在 true，
// 后面所有提示都进队列再也不出来——**而且它们已经被记成「教过了」，永远不会再弹**。
// 实测踩到过：按 ESC 关掉「多段技能」那条之后，「锋芒」那条就再没出现。
function openModal(inner, wide, onClose){
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.innerHTML = `<div class="modal-box${wide ? ' modal-wide' : ''}">${inner}</div>`;
  mask._onClose = onClose || null;
  mask.addEventListener('click', e => { if(e.target === mask) dismiss(mask); });
  document.body.appendChild(mask);
  return mask;
}
function dismiss(mask){
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
// 同一个 id 只弹一次，**跨对局也只弹一次**（存 localStorage）。
//
// 一次只显示一条：几条机制可能在同一帧里一起触发（比如第一次多段技能
// 正好打出第一次重击），三个弹窗叠在一起没人看得下去。后来的排进队列，
// 关掉上一条才出下一条。
let queue = [], showing = false;

export function teachOnce(id){
  const entry = BY_ID[id];
  if(!entry || !entry.short) return;
  if(taughtSet().has(id)) return;
  markTaught(id);            // 先记账：弹窗还没关就重开一局也不该再弹
  queue.push(entry);
  if(!showing) drainQueue();
}

function drainQueue(){
  const entry = queue.shift();
  if(!entry){ showing = false; return; }
  showing = true;
  playSfx('buff');
  const mask = openModal(`
    <div class="codex-tip-tag">初次遇到 · 只提示这一次</div>
    <h3 style="text-align:center;">${entry.icon} ${entry.title}</h3>
    <p>${entry.short}</p>
    <p class="codex-tip-foot">打到一半忘了？战斗界面右下角的 ❓ 随时能查。</p>
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
