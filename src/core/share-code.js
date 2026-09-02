// 分享码：把一份战绩档案编成一串能贴进聊天框的文本，并签名。
//
// ── 防伪能做到什么，做不到什么 ────────────────────────────
// 这是纯前端游戏，没有服务器，**密钥就在每个玩家的浏览器里**。
// 所以签名挡得住「拿记事本打开分享码，把 230 改成 9999」——改任何一个字节
// 签名都对不上；挡不住读过源码、能重新签名的人。那种人交给第二层：
// record.js 的 `auditRecord` 要求一局战斗的数字互相自洽，得整套编圆才行。
//
// 界面上必须把这条边界说清楚。写一个假的「已认证 ✓」比不做校验更糟。
//
// ── 编码为什么不是直接 JSON ───────────────────────────────
// 分享码要能贴进聊天框，越短越好。所以：
//   · 角色、场景、模式、难度都编成花名册里的下标（一个数字代替一串字符）
//   · 单位名和角色默认名相同时不存（只有战役的剧情名才是例外）
//   · 记录编成定长数组，省掉所有键名
// 一局 4v4 的战绩因此从约 900 字节的 JSON 压到约 310 个字符。

import { CHARACTERS, SCENES } from '../data/data.js';
import { normalizeRecord, auditRecord } from './record.js';
import {
  utf8Bytes, bytesToUtf8, hmacSha256, bytesEqual,
  bytesToBase64url, base64urlToBytes,
} from './sha256.js';

export const SHARE_PREFIX = 'INK1';
export const SHARE_FORMAT_VERSION = 1;

// 分享码里带的签名密钥。**它是公开的**——见文件头的说明，
// 它的作用是让「随手改一个数字」立刻失效，不是防住读过源码的人。
const SHARE_SECRET = 'inkfight/share/v1:墨境之战·战绩签名';

const SIG_BYTES = 12;                 // 96 位，够挡篡改，又只占 16 个字符

// 顺序即编码。**往这些表里加东西只能追加到末尾**，插在中间会让所有
// 已经分发出去的分享码解出错误的角色 / 场景。
const CHAR_ORDER = CHARACTERS.map(c => c.id);
const SCENE_ORDER = SCENES.map(s => s.id);
const MODE_ORDER = ['ai', 'pvp', 'spectate', 'campaign'];
const DIFF_ORDER = ['easy', 'normal', 'hard', 'nightmare'];

const idxOf = (arr, v) => { const i = arr.indexOf(v); return i < 0 ? -1 : i; };
const at = (arr, i) => (i >= 0 && i < arr.length ? arr[i] : null);

const DEFAULT_NAME = Object.fromEntries(CHARACTERS.map(c => [c.id, c.name]));

// ── 一条记录 ⇄ 定长数组 ───────────────────────────────────
function packRecord(r){
  const units = r.units.map(u => {
    const row = [idxOf(CHAR_ORDER, u.charId), u.player, u.dmg, u.heal, u.kills];
    // 战役的剧情名（「荒野狂徒·赤牙」）和默认名不同，才需要额外存一份。
    if(u.name !== DEFAULT_NAME[u.charId]) row.push(u.name);
    return row;
  });
  // 最高单次伤害记的是**名字**，而两边可能选到同一个角色。存下标，
  // 解码时从单位表里取回同一个字符串；找不到就退回存原文。
  let maxRef = -1;
  if(r.maxHit.dmg > 0){
    const i = r.units.findIndex(u => u.name === r.maxHit.name);
    maxRef = i >= 0 ? i : r.maxHit.name;
  }
  return [
    r.v, r.id, Math.round(r.at / 1000),
    idxOf(MODE_ORDER, r.mode), idxOf(DIFF_ORDER, r.diff), idxOf(SCENE_ORDER, r.scene),
    r.rounds, r.winner, r.side == null ? 0 : r.side, r.stage == null ? 0 : r.stage,
    r.p1.dmg, r.p1.heal, r.p1.kills,
    r.p2.dmg, r.p2.heal, r.p2.kills,
    r.maxHit.dmg, maxRef,
    units,
    r.backfilled ? 1 : 0,
  ];
}

function unpackRecord(a){
  if(!Array.isArray(a) || a.length < 20) throw new RangeError('记录字段数不对');
  const [v, id, ts, mi, di, si, rounds, winner, side, stage,
         p1d, p1h, p1k, p2d, p2h, p2k, maxD, maxRef, rows, flag] = a;
  const units = (Array.isArray(rows) ? rows : []).map(row => {
    const cid = at(CHAR_ORDER, row[0]) || '';
    return {
      charId: cid,
      player: row[1],
      dmg: row[2], heal: row[3], kills: row[4],
      name: row.length > 5 ? String(row[5]) : (DEFAULT_NAME[cid] || cid),
    };
  });
  const maxName = maxD > 0
    ? (typeof maxRef === 'number' ? (units[maxRef] ? units[maxRef].name : '') : String(maxRef))
    : '';
  return normalizeRecord({
    v, id, at: ts * 1000,
    mode: at(MODE_ORDER, mi) || 'ai',
    diff: at(DIFF_ORDER, di),
    scene: at(SCENE_ORDER, si) || 'void',
    rounds, winner, side: side || null, stage: stage || null,
    p1: { dmg:p1d, heal:p1h, kills:p1k },
    p2: { dmg:p2d, heal:p2h, kills:p2k },
    units,
    maxHit: { dmg: maxD, name: maxName },
    ...(flag ? { backfilled:true } : {}),
  });
}

// ── 编码 ──────────────────────────────────────────────────
// profile: { name, pid }，records: 记录数组（可以只有一条）
export function encodeShare(profile, records){
  const payload = JSON.stringify([
    SHARE_FORMAT_VERSION,
    String((profile && profile.name) || '无名'),
    String((profile && profile.pid) || ''),
    Math.round(Date.now() / 1000),
    (records || []).map(normalizeRecord).filter(Boolean).map(packRecord),
  ]);
  const body = bytesToBase64url(utf8Bytes(payload));
  const sig = bytesToBase64url(hmacSha256(SHARE_SECRET, payload).slice(0, SIG_BYTES));
  return `${SHARE_PREFIX}.${body}.${sig}`;
}

// 从一段可能夹带前后文的文本里把分享码抠出来。
// 玩家会把它连同「这是我那局」一起发过来，也会带上换行。
const CODE_RE = new RegExp(`${SHARE_PREFIX}\\.([A-Za-z0-9_-]+)\\.([A-Za-z0-9_-]+)`);

export function extractCode(text){
  if(!text) return null;
  const m = String(text).replace(/\s+/g, '').match(CODE_RE);
  return m ? { body: m[1], sig: m[2] } : null;
}

// ── 解码 ──────────────────────────────────────────────────
// 返回值永远带上 records，即使校验没过——界面要能告诉玩家
// 「这份战绩声称是什么」以及「哪一条对不上」，而不是只给一句「无效」。
//
//   { ok, reason, profile, records:[{ rec, audit }], signature:'valid'|'invalid' }
export function decodeShare(text, now = Date.now()){
  const found = extractCode(text);
  if(!found) return fail('format', '没找到分享码。它应该以 ' + SHARE_PREFIX + '. 开头。');

  let payload, sigOk = false;
  try {
    payload = bytesToUtf8(base64urlToBytes(found.body));
  } catch {
    return fail('format', '分享码的内容部分损坏了，可能复制时被截断。');
  }
  try {
    sigOk = bytesEqual(
      base64urlToBytes(found.sig),
      hmacSha256(SHARE_SECRET, payload).slice(0, SIG_BYTES),
    );
  } catch { sigOk = false; }

  // **先验签，再解析。** 顺序反过来时，被改过的分享码往往先在 JSON 解析上炸掉，
  // 于是玩家收到的是「格式不对」——一句不痛不痒的话，而真正的原因是它被动过。
  let parsed = null;
  try { parsed = JSON.parse(payload); } catch { parsed = null; }
  const parsedOk = Array.isArray(parsed) && parsed.length >= 5;
  if(!sigOk && !parsedOk)
    return fail('signature', '签名对不上，内容也解不出来——这串码被改过，或者复制时断了一截。');
  if(!parsedOk)
    return fail('format', '签名是对的，但内容解不出来。可能是复制时漏了一段。');

  const [fv, name, pid, ts, rawRecords] = parsed;
  if(fv > SHARE_FORMAT_VERSION)
    return fail('version', `这串分享码来自更新的版本（格式 v${fv}），本作只认得 v${SHARE_FORMAT_VERSION}。`);

  let records;
  try {
    records = (Array.isArray(rawRecords) ? rawRecords : []).map(a => {
      const rec = unpackRecord(a);
      return { rec, audit: auditRecord(rec, now) };
    });
  } catch(e){
    return fail('format', '战绩内容读不出来：' + e.message);
  }
  if(!records.length) return fail('empty', '这份分享里一条战绩都没有。');

  const profile = { name: String(name || '无名'), pid: String(pid || ''), exportedAt: (ts || 0) * 1000 };
  if(!sigOk){
    return { ok:false, reason:'signature', signature:'invalid', profile, records,
      message:'签名对不上——这份战绩在导出之后被改过，或者不是本作导出的。' };
  }
  const broken = records.filter(r => !r.audit.ok);
  if(broken.length){
    return { ok:false, reason:'audit', signature:'valid', profile, records,
      message:`签名有效，但有 ${broken.length} 条战绩的数字互相对不上。`};
  }
  return { ok:true, signature:'valid', profile, records, message:'签名与数据校验都通过。' };
}

function fail(reason, message){
  return { ok:false, reason, message, signature:'invalid', profile:null, records:[] };
}

// ── 存成文件时的外包装 ────────────────────────────────────
// 头几行是给人看的，解码时靠正则把分享码抠出来，所以随便怎么写都不影响读取。
export function shareFileText(profile, records, code){
  const when = new Date().toLocaleString();
  const lines = [
    '墨境之战 · 战绩分享',
    `玩家：${(profile && profile.name) || '无名'}`,
    `导出时间：${when}`,
    `包含 ${records.length} 场对局`,
    '',
    '把下面这一整行贴进游戏的「战绩室 → 导入好友战绩」即可查看。',
    '中间任何一个字符被改动，签名都会对不上。',
    '',
    code,
    '',
  ];
  return lines.join('\n');
}

export function shareFileName(profile){
  const safe = String((profile && profile.name) || '无名').replace(/[^\w一-龥-]/g, '') || '无名';
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `墨境战绩_${safe}_${stamp}.txt`;
}

// 给界面用的一句话说明。**别在别处再写一份**——
// 这段话的分寸（说清能挡什么、挡不住什么）是这个功能的一部分。
export const SHARE_TRUST_NOTE =
  '分享码带 HMAC-SHA256 签名，导出后改动任何一个字符都会失效；'
  + '导入时还会检查各项数字是否互相自洽（分项之和、最高单击不超过总伤害等）。'
  + '但本作没有服务器，密钥就在游戏代码里——它挡的是随手改数字，'
  + '挡不住愿意读源码重签的人。看战绩图个乐，别拿它当认证。';
