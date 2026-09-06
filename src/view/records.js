// 战绩室：我的战绩 / 生涯统计 / 好友战绩，外加导出与导入。
//
// 存取全部走 game/save.js，编解码全部走 core/share-code.js，
// 这里只负责把它们摆到屏幕上。
//
// **弹窗一律用 codex.js 的 openModal / dismiss。** 自己 remove() 会绕过
// ESC 的统一关闭路径——那正是教学提示队列曾经卡死的原因（见 CLAUDE.md）。

import { playSfx } from "./audio.js";
import { openModal, dismiss } from "./codex.js";
import {
  summarize,
  mvpOf,
  outcomeOf,
  normalizeRecord,
  sceneName,
  charName,
  MODE_LABEL,
  RULESETS,
  ALL_RULESETS,
  filterRecordsByRuleset,
} from "../core/record.js";
import { DIFF_LABEL } from "../core/combat.js";
import {
  encodeShare,
  decodeShare,
  shareFileText,
  shareFileName,
  SHARE_TRUST_NOTE,
} from "../core/share-code.js";
import {
  listRecords,
  saveRecord,
  deleteRecord,
  clearRecords,
  getProfile,
  setProfileName,
  displayName,
  listFriends,
  mergeFriend,
  deleteFriend,
  RECORD_LIMIT,
} from "../game/save.js";

// ── 小工具 ────────────────────────────────────────────────
const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
const pad = (n) => String(n).padStart(2, "0");

function when(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function shortWhen(ts) {
  const d = new Date(ts);
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 一局的一句话标签：模式 + 难度。
// **模式名读 record.js 的 MODE_LABEL，难度名读 combat.js 的 DIFF_LABEL**，
// 两处都别在这里手抄一份。
function modeText(r) {
  const base = MODE_LABEL[r.mode] || r.mode;
  if (r.mode === "ai")
    return `${base} · ${DIFF_LABEL[r.diff] || r.diff || "?"}`;
  if (r.mode === "campaign") return base + (r.stage ? ` · 第${r.stage}关` : "");
  return base;
}

// 胜 / 败 / 无（观战和双人没有「我」）
function outcomeChip(r) {
  const o = outcomeOf(r);
  if (o === "win") return '<span class="rec-chip rec-win">胜</span>';
  if (o === "loss") return '<span class="rec-chip rec-loss">败</span>';
  return `<span class="rec-chip rec-none">玩家${r.winner}胜</span>`;
}

const teamNames = (r, p) =>
  r.units
    .filter((u) => u.player === p)
    .map((u) => u.name)
    .join(" ");

// ── 屏幕状态 ──────────────────────────────────────────────
let tab = "mine";
let selectedId = null;
let selectedPid = null;
let rulesetFilter = ALL_RULESETS;

export function initRecordsScreen() {
  const shell = document.getElementById("screen-records");
  if (!shell) return;
  const nameInput = document.getElementById("records-name");
  const profile = getProfile();
  nameInput.value = profile.name;
  nameInput.placeholder = displayName({ name: "" });
  if (!nameInput.dataset.bound) {
    nameInput.dataset.bound = "1";
    nameInput.addEventListener("change", () => {
      setProfileName(nameInput.value.trim());
      playSfx("click");
      render();
    });
  }
  shell.querySelectorAll(".records-tab").forEach((b) => {
    if (b.dataset.bound) return;
    b.dataset.bound = "1";
    b.addEventListener("click", () => {
      playSfx("click");
      tab = b.dataset.tab;
      render();
    });
  });
  let filter = shell.querySelector("#records-ruleset-filter");
  if (!filter) {
    filter = document.createElement("select");
    filter.id = "records-ruleset-filter";
    filter.setAttribute("aria-label", "战绩规则版本");
    filter.className = "records-ruleset-filter";
    filter.innerHTML =
      `<option value="${ALL_RULESETS}">全部规则</option><option value="${RULESETS.ink}">新共享墨规则</option><option value="${RULESETS.legacy}">经典 SP 规则</option>`;
    const body = shell.querySelector("#records-body");
    if (body) body.before(filter);
    filter.addEventListener("change", () => {
      rulesetFilter = filter.value;
      render();
    });
  }
  filter.value = rulesetFilter;
  bind("btn-records-import", openImportDialog);
  bind("btn-records-export", () => openShareDialog(listRecords(), "整册战绩"));
  render();
}

function bind(id, fn) {
  const el = document.getElementById(id);
  if (!el || el.dataset.bound) return;
  el.dataset.bound = "1";
  el.addEventListener("click", () => {
    playSfx("click");
    fn();
  });
}

function render() {
  const shell = document.getElementById("screen-records");
  if (!shell) return;
  shell
    .querySelectorAll(".records-tab")
    .forEach((b) => b.classList.toggle("selected", b.dataset.tab === tab));
  const body = document.getElementById("records-body");
  const exportBtn = document.getElementById("btn-records-export");
  const mine = listRecords();
  if (exportBtn) {
    exportBtn.disabled = !mine.length;
    exportBtn.textContent = mine.length
      ? `📤 分享我的战绩（${mine.length}）`
      : "📤 分享我的战绩";
  }
  const filtered = filterRecordsByRuleset(mine, rulesetFilter);
  if (tab === "mine") renderMine(body, filtered, mine.length);
  else if (tab === "career") renderCareer(body, filtered, mine.length);
  else renderFriends(body);
}

// ── 我的战绩 ──────────────────────────────────────────────
function renderMine(body, records, totalRecords) {
  if (!records.length) {
    body.innerHTML = totalRecords
      ? `<div class="records-empty">
        <b>当前规则筛选下没有战绩。</b>
        <p>整册里还有 ${totalRecords} 局；在上方切换到“全部规则”即可查看。</p></div>`
      : `<div class="records-empty">
        <b>还没有任何战绩。</b>
        <p>打完一局，结果会自动记在这台设备上（最多保留 ${RECORD_LIMIT} 局）。<br>
        战绩只存在本地浏览器里，不会上传到任何地方。</p></div>`;
    return;
  }
  if (!records.some((r) => r.id === selectedId)) selectedId = records[0].id;
  body.innerHTML = `
    <div class="records-split">
      <div class="records-list" id="records-list">${records.map(recordRow).join("")}</div>
      <div class="records-detail" id="records-detail"></div>
    </div>`;
  body.querySelectorAll(".rec-row").forEach((el) =>
    el.addEventListener("click", () => {
      playSfx("hover");
      selectedId = el.dataset.id;
      render();
    }),
  );
  renderDetail(
    records.find((r) => r.id === selectedId),
    true,
  );
}

function recordRow(r) {
  return `<button class="rec-row${r.id === selectedId ? " selected" : ""}" data-id="${esc(r.id)}">
    <div class="rec-row-top">
      ${outcomeChip(r)}
      <b>${esc(modeText(r))}</b>
      <span class="rec-when">${shortWhen(r.at)}</span>
    </div>
    <div class="rec-row-teams">${esc(teamNames(r, 1))} <i>vs</i> ${esc(teamNames(r, 2))}</div>
    <div class="rec-row-foot">${esc(sceneName(r.scene))} · ${r.rounds} 回合${
      r.backfilled ? ' <span class="rec-tag-backfill">补录</span>' : ""
    }</div>
  </button>`;
}

// 详情面板。`own` 为真时带上删除和单局分享。
function renderDetail(r, own, host) {
  const el = host || document.getElementById("records-detail");
  if (!el) return;
  if (!r) {
    el.innerHTML = '<div class="records-empty">选一局看看。</div>';
    return;
  }
  const mvp = mvpOf(r.units);
  const rows = (p) =>
    r.units
      .filter((u) => u.player === p)
      .map(
        (u) =>
          `<div class="rec-unit${u === mvp ? " is-mvp" : ""}">
       <b>${esc(u.name)}</b>
       <span>伤害 ${u.dmg}</span><span>治疗 ${u.heal}</span><span>击杀 ${u.kills}</span>
     </div>`,
      )
      .join("");
  el.innerHTML = `
    <div class="rec-detail-head">
      <div>
        <h3>${outcomeChip(r)} ${esc(modeText(r))}</h3>
        <p>${esc(sceneName(r.scene))} · ${r.rounds} 回合 · ${when(r.at)}</p>
      </div>
      <div class="rec-detail-acts">
        <button class="btn btn-sm btn-confirm" data-act="share">📤 分享这一局</button>
        ${own ? '<button class="btn btn-sm btn-danger" data-act="del">删除</button>' : ""}
      </div>
    </div>
    ${
      r.backfilled
        ? `<div class="rec-backfill-note">这一局是<b>手工补录</b>的——战绩功能上线前打的，
      数字照结算截图一条条抄进来，时间是当晚的估计值。</div>`
        : ""
    }
    <div class="rec-detail-kpi">
      <div><span>MVP</span><b>${mvp ? esc(mvp.name) : "—"}</b></div>
      <div><span>最高单次伤害</span><b>${r.maxHit.dmg}${r.maxHit.name ? "（" + esc(r.maxHit.name) + "）" : ""}</b></div>
      <div><span>玩家1 总伤害</span><b>${r.p1.dmg}</b></div>
      <div><span>玩家2 总伤害</span><b>${r.p2.dmg}</b></div>
    </div>
    <div class="rec-detail-teams">
      <section><h4 class="rec-side-1">玩家1${r.side === 1 ? "（我）" : ""}</h4>${rows(1)}</section>
      <section><h4 class="rec-side-2">玩家2${r.side === 2 ? "（我）" : ""}</h4>${rows(2)}</section>
    </div>`;
  const share = el.querySelector('[data-act="share"]');
  if (share)
    share.addEventListener("click", () => {
      playSfx("click");
      openShareDialog([r], "这一局");
    });
  const del = el.querySelector('[data-act="del"]');
  if (del)
    del.addEventListener("click", () => {
      playSfx("click");
      confirmBox("删除这一局？", "删掉之后就找不回来了。", () => {
        deleteRecord(r.id);
        selectedId = null;
        render();
      });
    });
}

// ── 生涯统计 ──────────────────────────────────────────────
function renderCareer(body, records, totalRecords) {
  const s = summarize(records);
  if (!s.total) {
    body.innerHTML = totalRecords
      ? `<div class="records-empty"><b>当前规则筛选下没有数据。</b><p>整册里还有 ${totalRecords} 局；切换到“全部规则”即可统计。</p></div>`
      : '<div class="records-empty"><b>还没有数据。</b><p>打几局再来看。</p></div>';
    return;
  }
  const diffRows =
    Object.entries(s.byDiff)
      .map(
        ([k, v]) =>
          `<div class="rec-bar-row">
       <span>${esc(DIFF_LABEL[k] || k)}</span>
       <div class="rec-bar"><i style="width:${v.n ? (v.w / v.n) * 100 : 0}%"></i></div>
       <b>${v.w}/${v.n}　${v.n ? ((v.w / v.n) * 100).toFixed(0) : 0}%</b>
     </div>`,
      )
      .join("") || '<p class="records-note">还没有分难度的对局。</p>';

  const charRows =
    s.chars
      .slice(0, 16)
      .map(
        (c) =>
          `<div class="rec-char-row">
       <b>${esc(charName(c.id))}</b>
       <span>${c.n} 局</span>
       <span>胜率 ${c.n ? ((c.w / c.n) * 100).toFixed(0) : 0}%</span>
       <span>累计伤害 ${c.dmg}</span>
     </div>`,
      )
      .join("") || '<p class="records-note">还没有可统计的出场。</p>';

  body.innerHTML = `
    <div class="records-career">
      <div class="rec-kpi-grid">
        <div><span>总场次</span><b>${s.total}</b></div>
        <div><span>胜 / 负</span><b>${s.wins} / ${s.losses}</b></div>
        <div><span>胜率</span><b>${s.winRate.toFixed(1)}%</b></div>
        <div><span>当前连胜</span><b>${s.currentStreak}</b></div>
        <div><span>最长连胜</span><b>${s.bestStreak}</b></div>
        <div><span>平均回合</span><b>${s.avgRounds.toFixed(1)}</b></div>
      </div>
      ${
        s.rated < s.total
          ? `<p class="records-note">另有 ${s.total - s.rated} 局没有胜负归属（观战、双人），
        计入总场次但不计胜率。</p>`
          : ""
      }
      <h4 class="rec-section">各难度战绩</h4>
      <div class="rec-bars">${diffRows}</div>
      <h4 class="rec-section">我用过的角色</h4>
      <div class="rec-chars">${charRows}</div>
      ${
        s.bestGame
          ? `<h4 class="rec-section">我打出过的单场最高伤害</h4>
        <p class="records-note"><b>${esc(s.bestGame.name)}</b> 打出 <b>${s.bestGame.dmg}</b> 点伤害
        （${when(s.bestGame.at)}）</p>`
          : ""
      }
      <div class="rec-danger-zone">
        <button class="btn btn-sm btn-danger" id="btn-records-clear">清空本机全部战绩</button>
      </div>
    </div>`;
  const clear = document.getElementById("btn-records-clear");
  if (clear)
    clear.addEventListener("click", () => {
      playSfx("click");
      confirmBox(
        "清空全部战绩？",
        `${s.total} 局记录会被删除，包括补录的那几局，且无法恢复。
      想留个底的话，先「分享我的战绩」把分享码存下来。`,
        () => {
          clearRecords();
          selectedId = null;
          render();
        },
      );
    });
}

// ── 好友战绩 ──────────────────────────────────────────────
function renderFriends(body) {
  const friends = listFriends();
  if (!friends.length) {
    body.innerHTML = `<div class="records-empty">
      <b>还没有导入过好友战绩。</b>
      <p>让朋友在他的游戏里点「分享我的战绩」，把那串分享码发给你，<br>
      再点下面的「📥 导入好友战绩」粘进去。</p>
      <p class="records-note">${esc(SHARE_TRUST_NOTE)}</p></div>`;
    return;
  }
  if (!friends.some((f) => f.pid === selectedPid)) selectedPid = friends[0].pid;
  const f = friends.find((x) => x.pid === selectedPid);
  const records = filterRecordsByRuleset(f.records, rulesetFilter);
  const s = summarize(records);
  body.innerHTML = `
    <div class="records-split">
      <div class="records-list">
        ${friends
          .map(
            (
              x,
            ) => `<button class="rec-row${x.pid === selectedPid ? " selected" : ""}" data-pid="${esc(x.pid)}">
          <div class="rec-row-top"><b>${esc(displayName(x))}</b>
            <span class="rec-when">${filterRecordsByRuleset(x.records, rulesetFilter).length} 局</span></div>
          <div class="rec-row-foot">导入于 ${shortWhen(x.importedAt)}</div>
        </button>`,
          )
          .join("")}
      </div>
      <div class="records-detail">
        <div class="rec-detail-head">
          <div><h3>${esc(displayName(f))} 的战绩</h3>
            <p>当前显示 ${records.length} / 共 ${f.records.length} 局 · 胜率 ${s.winRate.toFixed(1)}%（${s.wins}/${s.rated}）
               · 最长连胜 ${s.bestStreak}</p></div>
          <div class="rec-detail-acts">
            <button class="btn btn-sm btn-danger" id="btn-friend-del">移除这位好友</button>
          </div>
        </div>
        <div class="rec-friend-games">${
          records.length
            ? records
                .map(
                  (r) => `
          <button class="rec-row rec-row-flat" data-rid="${esc(r.id)}">
            <div class="rec-row-top">${outcomeChip(r)}<b>${esc(modeText(r))}</b>
              <span class="rec-when">${shortWhen(r.at)}</span></div>
            <div class="rec-row-teams">${esc(teamNames(r, 1))} <i>vs</i> ${esc(teamNames(r, 2))}</div>
          </button>`,
                )
                .join("")
            : '<div class="records-empty"><b>当前规则筛选下没有这位好友的战绩。</b><p>切换到“全部规则”即可查看。</p></div>'
        }</div>
        <div id="records-friend-detail"></div>
      </div>
    </div>`;
  body.querySelectorAll("[data-pid]").forEach((el) =>
    el.addEventListener("click", () => {
      playSfx("hover");
      selectedPid = el.dataset.pid;
      render();
    }),
  );
  body.querySelectorAll("[data-rid]").forEach((el) =>
    el.addEventListener("click", () => {
      playSfx("hover");
      renderDetail(
        f.records.find((r) => r.id === el.dataset.rid),
        false,
        document.getElementById("records-friend-detail"),
      );
      document
        .getElementById("records-friend-detail")
        .scrollIntoView({ behavior: "smooth", block: "nearest" });
    }),
  );
  const del = document.getElementById("btn-friend-del");
  if (del)
    del.addEventListener("click", () => {
      playSfx("click");
      confirmBox(
        "移除这位好友的战绩？",
        "只是从你这台设备上删掉，他自己的战绩不受影响。",
        () => {
          deleteFriend(f.pid);
          selectedPid = null;
          render();
        },
      );
    });
}

// ── 分享 ──────────────────────────────────────────────────
// 分享有三条出口，能力从强到弱：系统分享面板 → 剪贴板 → 存成文件。
// 三条都给出来，因为浏览器支持哪一条完全看运行环境。
export function openShareDialog(records, what) {
  const list = (records || []).map(normalizeRecord).filter(Boolean);
  if (!list.length) return;
  const profile = getProfile();
  const code = encodeShare(
    { name: displayName(profile), pid: profile.pid },
    list,
  );
  const mask = openModal(
    `
    <h3 style="text-align:center;">📤 分享${esc(what || "战绩")}</h3>
    <p class="rec-modal-sub">${list.length} 场对局 · 署名「${esc(displayName(profile))}」</p>
    <textarea class="rec-code" id="share-code" readonly rows="4">${esc(code)}</textarea>
    <p class="rec-modal-note">${esc(SHARE_TRUST_NOTE)}</p>
    <div class="row rec-modal-actions">
      <button class="btn btn-sm btn-confirm" id="share-copy">📋 复制分享码</button>
      <button class="btn btn-sm" id="share-file">💾 存成文件</button>
      <button class="btn btn-sm" id="share-native" style="display:none;">🔗 分享给…</button>
      <button class="btn btn-sm rec-modal-close" id="share-close">关闭</button>
    </div>
    <div class="rec-modal-status" id="share-status"></div>`,
    true,
  );

  const status = mask.querySelector("#share-status");
  const say = (t) => {
    status.textContent = t;
  };

  mask
    .querySelector("#share-code")
    .addEventListener("focus", (e) => e.target.select());
  mask.querySelector("#share-copy").addEventListener("click", async () => {
    playSfx("click");
    say(
      (await copyText(code))
        ? "已复制，粘给朋友就行。"
        : "复制没成功——上面的框里全选手动复制吧。",
    );
  });
  mask.querySelector("#share-file").addEventListener("click", () => {
    playSfx("click");
    downloadText(shareFileName(profile), shareFileText(profile, list, code));
    say("已存成文件，在浏览器的下载目录里。");
  });
  // navigator.share 在部分桌面浏览器上也有（会拉起系统分享面板）。
  // 没有就不显示这个按钮，而不是点了才报错。
  if (navigator.share) {
    const btn = mask.querySelector("#share-native");
    btn.style.display = "";
    btn.addEventListener("click", async () => {
      playSfx("click");
      try {
        await navigator.share({
          title: "墨境之战 · 我的战绩",
          text: shareFileText(profile, list, code),
        });
        say("分享面板已打开。");
      } catch {
        say("分享取消了。");
      }
    });
  }
  mask.querySelector("#share-close").addEventListener("click", () => {
    playSfx("click");
    dismiss(mask);
  });
}

// ── 导入 ──────────────────────────────────────────────────
export function openImportDialog() {
  const mask = openModal(
    `
    <h3 style="text-align:center;">📥 导入好友战绩</h3>
    <p class="rec-modal-sub">把朋友发来的分享码整段粘进来（前后带别的字也没关系），
      或者直接选他导出的那个文件。</p>
    <textarea class="rec-code" id="import-code" rows="5" placeholder="INK1...."></textarea>
    <div class="row rec-modal-actions">
      <button class="btn btn-sm" id="import-file">📂 从文件读取</button>
      <button class="btn btn-sm" id="import-paste">📋 从剪贴板粘贴</button>
      <button class="btn btn-sm btn-confirm" id="import-go">校验并导入</button>
      <button class="btn btn-sm rec-modal-close" id="import-close">关闭</button>
    </div>
    <div class="rec-import-result" id="import-result"></div>`,
    true,
  );

  const area = mask.querySelector("#import-code");
  const out = mask.querySelector("#import-result");

  mask.querySelector("#import-file").addEventListener("click", () => {
    playSfx("click");
    pickTextFile((text) => {
      area.value = text;
      check();
    });
  });
  mask.querySelector("#import-paste").addEventListener("click", async () => {
    playSfx("click");
    try {
      area.value = await navigator.clipboard.readText();
      check();
    } catch {
      out.innerHTML =
        '<p class="rec-bad">浏览器不让我读剪贴板，请手动 Ctrl+V 粘到上面的框里。</p>';
    }
  });
  mask.querySelector("#import-go").addEventListener("click", () => {
    playSfx("click");
    check(true);
  });
  mask.querySelector("#import-close").addEventListener("click", () => {
    playSfx("click");
    dismiss(mask);
  });
  area.addEventListener("input", () => {
    out.innerHTML = "";
  });

  // check(commit) —— 不带 commit 时只校验并显示，带 commit 才真的存进去。
  function check(commit) {
    const res = decodeShare(area.value);
    if (!res.profile && !res.records.length) {
      out.innerHTML = `<p class="rec-bad">✖ ${esc(res.message)}</p>`;
      return;
    }
    const badge =
      res.signature === "valid"
        ? '<span class="rec-verify ok">✔ 签名有效</span>'
        : '<span class="rec-verify bad">✖ 签名对不上</span>';
    const auditBadge = res.records.every((r) => r.audit.ok)
      ? '<span class="rec-verify ok">✔ 数据自洽</span>'
      : '<span class="rec-verify bad">✖ 数据不自洽</span>';
    const problems = res.records.flatMap((r, i) =>
      r.audit.ok ? [] : [`第 ${i + 1} 局：${r.audit.problems.join("；")}`],
    );

    out.innerHTML = `
      <div class="rec-verify-row">${badge}${auditBadge}</div>
      <p class="${res.ok ? "rec-good" : "rec-bad"}">${esc(res.message)}</p>
      ${problems.length ? `<ul class="rec-problems">${problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
      ${
        res.profile
          ? `<p class="rec-modal-note">来自 <b>${esc(res.profile.name)}</b>，
        共 ${res.records.length} 场，导出于 ${when(res.profile.exportedAt)}。</p>`
          : ""
      }`;

    if (!res.ok) {
      out.innerHTML +=
        '<p class="rec-modal-note">校验没过的战绩不会被存进好友榜。</p>';
      return;
    }
    // 自己的档案不进好友榜，而是并回「我的战绩」——
    // 换了浏览器或清过缓存之后，靠这条路能把之前导出的战绩接回来。
    const isSelf = res.profile.pid && res.profile.pid === getProfile().pid;
    if (!commit) {
      out.innerHTML += isSelf
        ? '<p class="rec-modal-note">这是<b>你自己</b>导出的战绩。点「校验并导入」会把它<b>并回「我的战绩」</b>，已有的那几局不会重复。</p>'
        : '<p class="rec-modal-note">点「校验并导入」把它存进好友榜。</p>';
      return;
    }
    if (isSelf) {
      const have = new Set(listRecords().map((x) => x.id));
      let added = 0;
      res.records.forEach((x) => {
        if (!have.has(x.rec.id)) {
          saveRecord(x.rec);
          added++;
        }
      });
      out.innerHTML += `<p class="rec-good">已并回「我的战绩」：新增 ${added} 场，重复的 ${res.records.length - added} 场跳过。</p>`;
      playSfx("buff");
      tab = "mine";
      render();
      return;
    }
    const r = mergeFriend(
      res.profile,
      res.records.map((x) => x.rec),
    );
    out.innerHTML += r.ok
      ? `<p class="rec-good">已存进好友榜：新增 ${r.added} 场，现共 ${r.total} 场。</p>`
      : '<p class="rec-bad">本地存储写不进去（可能存满了），没能保存。</p>';
    if (r.ok) {
      playSfx("buff");
      selectedPid = res.profile.pid;
      tab = "friends";
      render();
    }
  }
}

// ── 通用小件 ──────────────────────────────────────────────
function confirmBox(title, text, onYes) {
  const mask = openModal(`
    <h3>${esc(title)}</h3><p>${esc(text)}</p>
    <div class="row">
      <button class="btn btn-sm" data-act="no">取消</button>
      <button class="btn btn-sm btn-danger" data-act="yes">确认</button>
    </div>`);
  mask.querySelector('[data-act="no"]').addEventListener("click", () => {
    playSfx("click");
    dismiss(mask);
  });
  mask.querySelector('[data-act="yes"]').addEventListener("click", () => {
    playSfx("click");
    dismiss(mask);
    onYes();
  });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* 非安全上下文或用户拒绝，退回老办法 */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0;";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

function downloadText(filename, text) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/plain;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function pickTextFile(cb) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".txt,text/plain";
  input.style.display = "none";
  document.body.appendChild(input);
  input.addEventListener("change", () => {
    const f = input.files && input.files[0];
    if (f)
      f.text()
        .then(cb)
        .catch(() => cb(""));
    input.remove();
  });
  input.click();
}

// ── 给结算界面用 ──────────────────────────────────────────
// battle.js 打完一局后调它，把记录存下来并返回；存不进去返回 null。
export function commitRecord(rec) {
  try {
    return saveRecord(rec);
  } catch {
    return null;
  } // 战绩存不下不该把结算流程带崩
}
