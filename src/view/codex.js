import { INK_RULES } from "../core/ink-turn.js";
import {
  CRIT_METER_FULL,
  CRIT_MULTIPLIER,
  INTERRUPT_OUTPUT_MULTIPLIER,
  INTERRUPT_IMMUNE_TURNS,
  INK_EROSION_FROM,
  INK_EROSION_STEP,
} from "../core/combat.js";
export const CODEX = [
  {
    id: "economy",
    icon: "◆",
    title: "三墨同心",
    body:
      "双方各四人，每队回合开始刷新 " +
      INK_RULES.budget +
      " 墨。点一个尚未行动的人，再选择技能；每人每轮最多行动一次。技能消耗 1–3 墨，预算由全队共享。<br><br><b>1+1+1</b>：三人接力；<b>1+2</b>：铺垫后重招；<b>3</b>：一人倾力。没有固定出手顺序。",
  },
  {
    id: "reserve",
    icon: "◈",
    title: "留白化盾",
    body:
      "随时可以收笔。每点剩余墨让每名存活队友获得 " +
      INK_RULES.shieldPerInk +
      " 护盾，单次上限 " +
      INK_RULES.maxEndShieldPerUnit +
      "。护盾先承受伤害。收笔按钮直接显示这次能获得多少盾。",
  },
  {
    id: "intent",
    icon: "◎",
    title: "读懂敌方首招",
    body: "AI 队伍的第一招会提前公布。招式与原目标锁定，原目标倒下才会改选。你可以抢杀行动者、为目标治疗或加盾、施加扰乱。<b>后续招式会根据新局面应变。</b>伤害数字是当前局面的预估，护盾、增益和锋芒变化都会改变实际结果。同屏双人的计划不会泄露。",
  },
  {
    id: "interrupt",
    icon: "◇",
    title: "扰乱与免疫",
    body:
      "打断技能对未免疫的目标必定造成扰乱。下一次行动的伤害和治疗降到 " +
      Math.round(INTERRUPT_OUTPUT_MULTIPLIER * 100) +
      "%，行动后解除；护盾、净化和增益不受影响。被打断后获得 " +
      INTERRUPT_IMMUNE_TURNS +
      " 个己方回合的打断免疫。",
  },
  {
    id: "crit",
    icon: "✦",
    title: "锋芒与重击",
    body:
      "每击固定积累锋芒，到 " +
      CRIT_METER_FULL +
      " 点触发 " +
      CRIT_MULTIPLIER +
      " 倍重击，并扣除 " +
      CRIT_METER_FULL +
      " 点，溢出的锋芒保留。它是可预判的节奏；多段攻击每段分别结算。选中人物可在情报中查看锋芒。",
  },
  {
    id: "multihit",
    icon: "✶",
    title: "多段与蓄势",
    body: "多段技能的每一击分别承伤、积累锋芒。蓄势技能提前增加锋芒或强化下一击。蓄势也会用掉该角色本轮的出手机会，需要等下一轮兑现。",
  },
  {
    id: "statuses",
    icon: "◌",
    title: "状态何时变化",
    body: "每个队伍回合开始，该队所有存活角色一起推进状态：中毒伤害、增益时长和被动各结算一次。同轮多招不会额外推进时间。腐化会叠层；净化可清除负面。点任意角色，再打开「情报 / 战报」查看全部层数和时长。",
  },
  {
    id: "taunt",
    icon: "↗",
    title: "嘲讽",
    body: "嘲讽影响敌人之后的目标选择。已经公开的首招仍会兑现原来的目标。提前施放嘲讽，可以牵制后续攻击。",
  },
  {
    id: "erosion",
    icon: "◍",
    title: "墨蚀终局",
    body:
      "从第 " +
      INK_EROSION_FROM +
      " 轮起，所有存活角色在己方回合开始受到墨蚀，之后每轮增加 " +
      INK_EROSION_STEP +
      " 点。伤害逐轮增长，长时间只守不攻会越来越危险。",
  },
  {
    id: "expedition",
    icon: "❖",
    title: "墨路与墨契",
    body: "远征连续经历三场战斗，带着伤势、墨契和营地选择前进。路线由种子固定，换阵容可重走同路。墨契会改变落笔预算、连携或角色属性；自由对战没有远征墨契加成。退出远征保留战前状态，刷新后该场从头开始。",
  },
  {
    id: "controls",
    icon: "⌘",
    title: "镜头与操作",
    body: "点击 3D 人物或下方立绘选人，点技能后再点目标。选目标时可取消，墨量不会扣除。电脑数字键 1–4 选技能、E 收笔、Esc 取消目标。拖动战场旋转，滚轮缩放，近景与全景可切换。情报抽屉随时可关，设置里可减少动态效果。",
  },
  {
    id: "scene",
    icon: "△",
    title: "战场与公平",
    body: "备战页显示当前场景效果，双方同时受影响。自由对战的难度只改变 AI 判断，双方角色基础属性相同。赤方先手，结算后可交换阵容重赛。观战支持暂停、单招推进与播放速度。",
  },
];
export function openModal(inner, wide = false, onClose) {
  const previous = document.activeElement,
    mask = document.createElement("div");
  mask.className = "modal-mask";
  mask.innerHTML =
    '<div class="modal-box' +
    (wide ? " modal-wide" : "") +
    '" role="dialog" aria-modal="true" tabindex="-1">' +
    inner +
    "</div>";
  mask._onClose = onClose;
  mask._previousFocus = previous;
  mask.addEventListener("click", (e) => {
    if (e.target === mask) dismiss(mask);
  });
  mask.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      dismiss(mask);
    }
    if (e.key === "Tab") {
      const items = [
        ...mask.querySelectorAll(
          "button:not(:disabled),input,select,textarea,a[href]",
        ),
      ];
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const first = items[0],
        last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
  document.body.appendChild(mask);
  mask.querySelector("button,input,.modal-box")?.focus();
  return mask;
}
export function dismiss(mask) {
  if (!mask?.isConnected) return;
  const cb = mask._onClose;
  mask._onClose = null;
  mask.remove();
  mask._previousFocus?.focus?.();
  cb?.();
}
export const isModalOpen = () => !!document.querySelector(".modal-mask");
export function closeTop() {
  dismiss([...document.querySelectorAll(".modal-mask")].at(-1));
}
// Teaching is opt-in through the reference, never an interruption in a combination.
export function teachOnce() {}
export function openCodex(focusId) {
  const mask = openModal(
    '<h3>落笔手册</h3><div class="codex-nav">' +
      CODEX.map(
        (e) =>
          '<button data-goto="' +
          e.id +
          '">' +
          e.icon +
          " " +
          e.title +
          "</button>",
      ).join("") +
      '</div><div class="codex-body">' +
      CODEX.map(
        (e) =>
          '<section class="codex-entry" id="codex-' +
          e.id +
          '"><h4>' +
          e.icon +
          " " +
          e.title +
          "</h4><p>" +
          e.body +
          "</p></section>",
      ).join("") +
      '</div><div class="row"><button class="btn btn-confirm">回到游戏</button></div>',
    true,
  );
  mask.querySelector(".btn-confirm").onclick = () => dismiss(mask);
  mask
    .querySelectorAll("[data-goto]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          mask
            .querySelector("#codex-" + b.dataset.goto)
            ?.scrollIntoView({ block: "start" })),
    );
  if (focusId)
    mask.querySelector("#codex-" + focusId)?.scrollIntoView({ block: "start" });
  return mask;
}
