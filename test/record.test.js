/**
 * 战绩：密码学原语、编解码往返、篡改检出、自洽审计、生涯统计。
 *
 * SHA-256 那组用的是标准测试向量（FIPS 180-4 / RFC 4231）。
 * 它挡的是一件很难在别处发现的事：**自己写的哈希算错了但一直自洽**——
 * 签名和验签用同一份错实现，游戏里一切正常，直到某天换用标准库才发现
 * 所有历史分享码全部作废。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  sha256Hex, hmacSha256Hex, utf8Bytes, bytesToUtf8,
  bytesToBase64url, base64urlToBytes, bytesEqual, hmacSha256,
} from '../src/core/sha256.js';
import {
  makeRecord, normalizeRecord, auditRecord, summarize, mvpOf, outcomeOf,
  filterRecordsByRuleset, RECORD_VERSION, RULESETS,
} from '../src/core/record.js';
import {
  encodeShare, decodeShare, extractCode, SHARE_PREFIX, shareFileText, shareFileName,
} from '../src/core/share-code.js';
import { BACKFILLED_RECORDS } from '../src/data/backfill-records.js';
import { CHARACTERS } from '../src/data/data.js';

// ── 一局用来反复折腾的样本 ────────────────────────────────
function sampleRecord(over = {}){
  return normalizeRecord({
    v: RECORD_VERSION,
    id: 'rtest0001',
    at: Date.UTC(2026, 7, 30, 12, 0),
    mode: 'ai', diff: 'hard', scene: 'lava',
    rounds: 12, winner: 1, side: 1,
    p1: { dmg: 300, heal: 20, kills: 3 },
    p2: { dmg: 210, heal: 0, kills: 1 },
    units: [
      { charId:'archer',  name:'弓手', player:1, dmg:200, heal:0,  kills:2 },
      { charId:'priest',  name:'牧师', player:1, dmg:40,  heal:20, kills:0 },
      { charId:'mage',    name:'法师', player:1, dmg:60,  heal:0,  kills:1 },
      { charId:'monk',    name:'拳师', player:1, dmg:0,   heal:0,  kills:0 },
      { charId:'assassin',name:'刺客', player:2, dmg:150, heal:0,  kills:1 },
      { charId:'mage',    name:'法师', player:2, dmg:60,  heal:0,  kills:0 },
      { charId:'guardian',name:'守卫', player:2, dmg:0,   heal:0,  kills:0 },
      { charId:'drummer', name:'鼓姬', player:2, dmg:0,   heal:0,  kills:0 },
    ],
    maxHit: { dmg: 58, name: '弓手' },
    ...over,
  });
}

// ═══════════════════════════════════════════════════════════
describe('SHA-256 / HMAC / base64url', () => {

  test('SHA-256 标准测试向量', () => {
    assert.equal(sha256Hex(''),
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    assert.equal(sha256Hex('abc'),
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    assert.equal(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });

  test('HMAC-SHA256 标准测试向量（RFC 4231 case 1 / 2）', () => {
    assert.equal(hmacSha256Hex(Uint8Array.from(Array(20).fill(0x0b)), 'Hi There'),
      'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7');
    assert.equal(hmacSha256Hex('Jefe', 'what do ya want for nothing?'),
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
  });

  test('与 node:crypto 逐条对齐（含分块边界与多字节字符）', () => {
    const cases = ['', 'a', 'x'.repeat(55), 'y'.repeat(56), 'z'.repeat(64),
      'w'.repeat(119), 'v'.repeat(120), '墨境之战 · 战绩', '🐉🀄 emoji', 'q'.repeat(5000)];
    for(const s of cases){
      assert.equal(sha256Hex(s), crypto.createHash('sha256').update(s, 'utf8').digest('hex'),
        `SHA 对不上：${s.slice(0, 16)}`);
      for(const key of ['', 'k', '密钥', 'K'.repeat(100)]){
        assert.equal(hmacSha256Hex(key, s),
          crypto.createHmac('sha256', key).update(s, 'utf8').digest('hex'),
          `HMAC 对不上：key=${key.slice(0, 8)} msg=${s.slice(0, 16)}`);
      }
    }
  });

  test('base64url 与 UTF-8 往返无损，且和 Node 的实现一致', () => {
    for(let n = 0; n < 100; n++){
      const bytes = Uint8Array.from({ length:n }, (_, i) => (i * 61 + n * 7) % 256);
      const s = bytesToBase64url(bytes);
      assert.equal(s, Buffer.from(bytes).toString('base64url'), `长度 ${n} 的编码对不上`);
      assert.deepEqual([...base64urlToBytes(s)], [...bytes], `长度 ${n} 解不回去`);
    }
    for(const s of ['', 'abc', '墨境', '🐉 混合 mixed', '\u0000߿ࠀ￿']){
      assert.equal(bytesToUtf8(utf8Bytes(s)), s);
    }
  });

  test('bytesEqual 认长度也认内容', () => {
    assert.ok(bytesEqual(Uint8Array.of(1, 2, 3), Uint8Array.of(1, 2, 3)));
    assert.ok(!bytesEqual(Uint8Array.of(1, 2, 3), Uint8Array.of(1, 2, 4)));
    assert.ok(!bytesEqual(Uint8Array.of(1, 2, 3), Uint8Array.of(1, 2)));
  });
});

// ═══════════════════════════════════════════════════════════
describe('记录模型', () => {

  test('makeRecord 从 battle.js 的 stats 结构里取数', () => {
    const units = [
      { id:'u1', name:'弓手', charId:'archer', player:1 },
      { id:'u2', name:'刺客', charId:'assassin', player:2 },
    ];
    const stats = {
      p1:{ dmg:100, heal:0, kills:1 }, p2:{ dmg:40, heal:5, kills:0 },
      maxHit:{ dmg:30, name:'弓手' },
      units:{ u1:{ dmg:100, heal:0, kills:1 }, u2:{ dmg:40, heal:5, kills:0 } },
    };
    const r = makeRecord({ mode:'ai', difficulty:'hard', scene:{ id:'lava' },
      rounds:9, winner:1, side:1, stats, units });
    assert.equal(r.scene, 'lava');
    assert.equal(r.units[0].dmg, 100);
    assert.equal(r.units[1].heal, 5);
    assert.ok(auditRecord(r).ok, auditRecord(r).problems.join('；'));
  });

  test('MVP 用伤害+治疗×1.5+击杀×80 排，全员 0 分也给得出人', () => {
    const units = [
      { name:'A', dmg:100, heal:0, kills:0 },
      { name:'B', dmg:0, heal:0, kills:2 },      // 160 分，压过 A
      { name:'C', dmg:50, heal:40, kills:0 },
    ];
    assert.equal(mvpOf(units).name, 'B');
    const zeros = [{ name:'X', dmg:0, heal:0, kills:0 }, { name:'Y', dmg:0, heal:0, kills:0 }];
    assert.equal(mvpOf(zeros).name, 'X');
    assert.equal(mvpOf([]), null);
  });

  test('outcomeOf：观战没有「我」，返回 null', () => {
    assert.equal(outcomeOf(sampleRecord()), 'win');
    assert.equal(outcomeOf(sampleRecord({ winner:2 })), 'loss');
    assert.equal(outcomeOf(sampleRecord({ mode:'spectate', side:null })), null);
  });

  test('normalizeRecord 吃得下缺胳膊少腿的输入', () => {
    const r = normalizeRecord({ mode:'pvp' });
    assert.equal(r.rounds, 0);
    assert.deepEqual(r.p1, { dmg:0, heal:0, kills:0 });
    assert.deepEqual(r.units, []);
    assert.equal(normalizeRecord(null), null);
  });

  test('规则集默认兼容旧记录，并可明确标记共享墨规则', () => {
    assert.equal(sampleRecord().ruleset, 'legacy');
    assert.equal(sampleRecord({ ruleset:'ink-v1' }).ruleset, 'ink-v1');
  });
});

// ═══════════════════════════════════════════════════════════
describe('自洽审计', () => {

  test('正常记录通过', () => {
    const a = auditRecord(sampleRecord());
    assert.ok(a.ok, a.problems.join('；'));
  });

  test('改一个人的伤害而不改总计 → 被抓', () => {
    const r = sampleRecord();
    r.units[0].dmg = 9999;
    const a = auditRecord(r);
    assert.ok(!a.ok);
    assert.ok(a.problems.some(p => p.includes('伤害分项之和')), a.problems.join('；'));
  });

  test('伤害和总计一起改圆，但最高单击超过了本人总伤害 → 还是被抓', () => {
    const r = sampleRecord();
    r.units[0].dmg = 20; r.p1.dmg = 120;   // 弓手总伤降到 20
    const a = auditRecord(r);               // 但 maxHit 还记着 58
    assert.ok(!a.ok);
    assert.ok(a.problems.some(p => p.includes('超过了他一整局的总伤害')), a.problems.join('；'));
  });

  test('最高单击记在一个不存在的人名下 → 被抓', () => {
    const a = auditRecord(sampleRecord({ maxHit:{ dmg:58, name:'路人甲' } }));
    assert.ok(!a.ok);
    assert.ok(a.problems.some(p => p.includes('场上没有这个单位')));
  });

  test('塞一个花名册里没有的角色 → 被抓', () => {
    const r = sampleRecord();
    r.units[0].charId = 'godmode';
    assert.ok(!auditRecord(r).ok);
  });

  test('人机模式声称自己在 2 方 → 被抓', () => {
    assert.ok(!auditRecord(sampleRecord({ side:2 })).ok);
  });

  test('回合数、时间、场景的离谱值都被抓', () => {
    assert.ok(!auditRecord(sampleRecord({ rounds:0 })).ok);
    assert.ok(!auditRecord(sampleRecord({ rounds:9999 })).ok);
    assert.ok(!auditRecord(sampleRecord({ scene:'atlantis' })).ok);
    assert.ok(!auditRecord(sampleRecord({ at: Date.UTC(1999, 0, 1) })).ok);
    assert.ok(!auditRecord(sampleRecord({ at: Date.now() + 400 * 24 * 3600e3 })).ok);
  });

  test('两边人数不等只在战役里合法（墨皇独战）', () => {
    const r = sampleRecord();
    r.units = r.units.filter(u => u.player === 1).concat(r.units.filter(u => u.player === 2)[0]);
    r.p2 = { dmg:150, heal:0, kills:1 };
    assert.ok(!auditRecord(r).ok, '非战役模式不该允许 4v1');
    const c = normalizeRecord({ ...r, mode:'campaign' });
    const a = auditRecord(c);
    assert.ok(a.ok, a.problems.join('；'));
  });

  test('**不会**因为击杀数少于阵亡人数而误判（真实对局里很常见）', () => {
    // 腐化爆发 / 瘟疫 / 狂暴自伤 / 墨蚀 造成的死亡都不记击杀。
    // 用户 2026-09-02 那局就是 4 人全灭、只有 2 次记名击杀。
    const r = sampleRecord({ p1:{ dmg:300, heal:20, kills:0 } });
    r.units.filter(u => u.player === 1).forEach(u => { u.kills = 0; });
    const a = auditRecord(r);
    assert.ok(a.ok, a.problems.join('；'));
  });
});

// ═══════════════════════════════════════════════════════════
describe('分享码', () => {
  const me = { name:'墨白', pid:'abcd1234' };

  test('编码 → 解码，数据一模一样', () => {
    const rec = sampleRecord();
    const code = encodeShare(me, [rec]);
    assert.ok(code.startsWith(SHARE_PREFIX + '.'));
    const out = decodeShare(code);
    assert.ok(out.ok, out.message);
    assert.equal(out.profile.name, '墨白');
    assert.equal(out.records.length, 1);
    const back = out.records[0].rec;
    // 时间戳按秒存，其余字段必须逐项相等
    assert.equal(back.at, Math.round(rec.at / 1000) * 1000);
    for(const k of ['id','mode','diff','scene','rounds','winner','side']) assert.equal(back[k], rec[k], k);
    assert.deepEqual(back.p1, rec.p1);
    assert.deepEqual(back.p2, rec.p2);
    assert.deepEqual(back.units, rec.units);
    assert.deepEqual(back.maxHit, rec.maxHit);
  });

  test('旧规则与共享墨规则都能往返', () => {
    const legacy = sampleRecord();
    const ink = sampleRecord({ ruleset:'ink-v1' });
    const legacyOut = decodeShare(encodeShare(me, [legacy])).records[0].rec;
    const inkOut = decodeShare(encodeShare(me, [ink])).records[0].rec;
    assert.equal(legacyOut.ruleset, 'legacy');
    assert.equal(inkOut.ruleset, 'ink-v1');
  });

  test('历史20字段分享码不含规则集也能读取',()=>{
    const encoded=encodeShare(me,[sampleRecord()]);
    const parts=encoded.split('.');
    const payload=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));
    payload[4][0]=payload[4][0].slice(0,20);
    const body=JSON.stringify(payload);
    const signature=crypto.createHmac('sha256','inkfight/share/v1:墨境之战·战绩签名').update(body).digest().subarray(0,12).toString('base64url');
    const result=decodeShare('INK1.'+Buffer.from(body).toString('base64url')+'.'+signature);
    assert.equal(result.ok,true);assert.equal(result.records[0].rec.ruleset,'legacy');assert.deepEqual(result.records[0].rec.units,sampleRecord().units);
  });

  test('战役的剧情名也带得回来', () => {
    const r = sampleRecord({ mode:'campaign', diff:'normal', stage:1 });
    r.units = [
      { charId:'swordsman', name:'墨白',           player:1, dmg:120, heal:0, kills:1 },
      { charId:'guardian',  name:'铁山',           player:1, dmg:30,  heal:0, kills:0 },
      { charId:'berserker', name:'荒野狂徒·赤牙', player:2, dmg:80,  heal:0, kills:0 },
      { charId:'assassin',  name:'拾荒影盗·乌',   player:2, dmg:40,  heal:0, kills:0 },
    ];
    r.p1 = { dmg:150, heal:0, kills:1 };
    r.p2 = { dmg:120, heal:0, kills:0 };
    r.maxHit = { dmg:40, name:'墨白' };
    const out = decodeShare(encodeShare(me, [r]));
    assert.ok(out.ok, out.message);
    assert.deepEqual(out.records[0].rec.units.map(u => u.name),
      ['墨白', '铁山', '荒野狂徒·赤牙', '拾荒影盗·乌']);
    assert.equal(out.records[0].rec.stage, 1);
  });

  test('两边选到同一个角色时，最高单击落在正确的那个人身上', () => {
    // 样本里两边都有法师。把最高单击记在 2 方法师名下，解码后名字要对得上。
    const r = sampleRecord({ maxHit:{ dmg:55, name:'法师' } });
    const out = decodeShare(encodeShare(me, [r]));
    assert.ok(out.ok, out.message);
    assert.equal(out.records[0].rec.maxHit.name, '法师');
  });

  test('改动分享码里任意一个字符 → 签名失效', () => {
    const code = encodeShare(me, [sampleRecord()]);
    const body = code.split('.')[1];
    let flipped = 0;
    // 抽查 40 个位置，逐个换一个字符
    for(let i = 0; i < body.length; i += Math.max(1, Math.floor(body.length / 40))){
      const ch = body[i] === 'A' ? 'B' : 'A';
      const tampered = `${SHARE_PREFIX}.${body.slice(0, i)}${ch}${body.slice(i + 1)}.${code.split('.')[2]}`;
      const out = decodeShare(tampered);
      assert.ok(!out.ok, `第 ${i} 位被改后居然通过了`);
      flipped++;
    }
    assert.ok(flipped >= 20, '抽查次数太少，这条测试没测到东西');
  });

  test('改坏内容之后报的是「签名对不上」，而不是含糊的「格式不对」', () => {
    // 顺序很要紧：先验签再解析。反过来的话，被改过的码往往先在 JSON 上炸掉，
    // 玩家收到的就是一句不痛不痒的「格式不对」，掩盖了真正的原因。
    const code = encodeShare(me, [sampleRecord()]);
    const [pfx, body, sig] = code.split('.');
    const broken = `${pfx}.${body.slice(0, 20)}${body[20] === 'A' ? 'B' : 'A'}${body.slice(21)}.${sig}`;
    const out = decodeShare(broken);
    assert.equal(out.ok, false);
    assert.equal(out.reason, 'signature', out.message);
  });

  test('签名整段被换掉 → 报「签名对不上」而不是崩溃', () => {
    const code = encodeShare(me, [sampleRecord()]);
    const parts = code.split('.');
    const out = decodeShare(`${parts[0]}.${parts[1]}.AAAAAAAAAAAAAAAA`);
    assert.equal(out.ok, false);
    assert.equal(out.reason, 'signature');
    assert.equal(out.records.length, 1, '即便签名不对，也要能告诉玩家它声称是什么');
  });

  test('签名有效但数据不自洽 → reason 是 audit，不是 signature', () => {
    // 模拟「读过源码、能重新签名」的人：他改了数字并重签，
    // 但没把分项和总计一起改圆。
    const r = sampleRecord();
    r.units[0].dmg = 9999;                   // 只改人，不改总计
    const out = decodeShare(encodeShare(me, [r]));
    assert.equal(out.signature, 'valid');
    assert.equal(out.ok, false);
    assert.equal(out.reason, 'audit');
    assert.ok(out.records[0].audit.problems.length);
  });

  test('从一段带前后文的聊天记录里也抠得出分享码', () => {
    const code = encodeShare(me, [sampleRecord()]);
    const chat = `我昨晚那局困难赢了！\n${code}\n你导进去看看`;
    assert.deepEqual(extractCode(chat), extractCode(code));
    assert.ok(decodeShare(chat).ok);
  });

  test('导出文件的正文能被原样读回', () => {
    const recs = [sampleRecord()];
    const code = encodeShare(me, recs);
    const text = shareFileText(me, recs, code);
    assert.ok(decodeShare(text).ok);
    assert.ok(shareFileName(me).endsWith('.txt'));
    assert.ok(shareFileName(me).includes('墨白'));
  });

  test('乱七八糟的输入不会抛异常，只会返回 ok:false', () => {
    for(const s of ['', '你好', 'INK1', 'INK1.', 'INK1.!!!.???', 'INK1.AAAA.BBBB',
                    `${SHARE_PREFIX}.${bytesToBase64url(utf8Bytes('not json'))}.AAAA`,
                    null, undefined]){
      const out = decodeShare(s);
      assert.equal(out.ok, false, `${s} 居然通过了`);
      assert.ok(typeof out.message === 'string' && out.message.length);
    }
  });

  test('一整册战绩打包后仍然能全部解回来', () => {
    const many = Array.from({ length:30 }, (_, i) =>
      sampleRecord({ id:'r' + i, at: Date.UTC(2026, 7, 1) + i * 3600e3, winner: i % 2 ? 1 : 2 }));
    const out = decodeShare(encodeShare(me, many));
    assert.ok(out.ok, out.message);
    assert.equal(out.records.length, 30);
    assert.ok(out.records.every(r => r.audit.ok));
  });

  test('分享码短到能贴进聊天框（单局 4v4 不超过 500 字符）', () => {
    const code = encodeShare(me, [sampleRecord()]);
    assert.ok(code.length < 500, `单局分享码 ${code.length} 字符，太长了`);
  });

  test('HMAC 用的是完整的 payload，不是它的前缀', () => {
    // 挡「签名只覆盖了开头一段」这种实现错误：改结尾也必须失效。
    const r = sampleRecord();
    const a = encodeShare(me, [r]);
    const b = encodeShare(me, [sampleRecord({ ...r, maxHit:{ dmg:57, name:'弓手' } })]);
    assert.notEqual(a.split('.')[2], b.split('.')[2]);
  });
});

// ═══════════════════════════════════════════════════════════
describe('生涯统计', () => {
  test('战绩室默认展示全部规则，仍可按规则版本筛选', () => {
    const legacy = sampleRecord({ id:'legacy', ruleset:RULESETS.legacy });
    const ink = sampleRecord({ id:'ink', ruleset:RULESETS.ink });

    assert.deepEqual(filterRecordsByRuleset([legacy, ink]), [legacy, ink]);
    assert.deepEqual(filterRecordsByRuleset([legacy, ink], RULESETS.ink), [ink]);
    assert.deepEqual(filterRecordsByRuleset([legacy, ink], RULESETS.legacy), [legacy]);
  });


  test('胜率只算有「我」的局，观战计入总场次但不计胜负', () => {
    const list = [
      sampleRecord({ id:'a', winner:1, side:1 }),
      sampleRecord({ id:'b', winner:2, side:1 }),
      sampleRecord({ id:'c', winner:1, side:1 }),
      sampleRecord({ id:'d', mode:'spectate', side:null }),
    ];
    const s = summarize(list);
    assert.equal(s.total, 4);
    assert.equal(s.rated, 3);
    assert.equal(s.wins, 2);
    assert.equal(s.losses, 1);
    assert.ok(Math.abs(s.winRate - 66.67) < 0.1);
  });

  test('最长连胜按时间顺序算，不受数组顺序影响', () => {
    const t = Date.UTC(2026, 7, 1);
    const mk = (i, win) => sampleRecord({ id:'x' + i, at: t + i * 3600e3, winner: win ? 1 : 2 });
    // 时间顺序：胜 胜 负 胜 胜 胜 → 最长 3，当前 3
    const inOrder = [mk(0,1), mk(1,1), mk(2,0), mk(3,1), mk(4,1), mk(5,1)];
    const shuffled = [inOrder[3], inOrder[0], inOrder[5], inOrder[2], inOrder[4], inOrder[1]];
    for(const list of [inOrder, shuffled]){
      const s = summarize(list);
      assert.equal(s.bestStreak, 3);
      assert.equal(s.currentStreak, 3);
    }
  });

  test('角色统计只看我方，且同局重复选同一个角色只记一次出场', () => {
    const r = sampleRecord();
    r.units[1] = { charId:'archer', name:'弓手', player:1, dmg:40, heal:20, kills:0 };
    const s = summarize([r]);
    const archer = s.chars.find(c => c.id === 'archer');
    assert.equal(archer.n, 1, '同一局两个弓手只算一次出场');
    assert.equal(archer.dmg, 240, '伤害要两个都算上');
    assert.ok(!s.chars.some(c => c.id === 'assassin'), '敌方角色不该进我的角色统计');
  });

  test('单场个人最高伤害只看我方，观战局和敌人不算', () => {
    const mine = sampleRecord({ id:'m1' });                       // 我方弓手 200
    const watched = sampleRecord({ id:'w1', mode:'spectate', side:null });
    watched.units[0].dmg = 5000;                                  // 观战局里的 5000
    watched.p1.dmg = 5000 + 40 + 60;
    const enemyHeavy = sampleRecord({ id:'e1' });
    enemyHeavy.units[4].dmg = 4000;                               // 敌方刺客 4000
    enemyHeavy.p2.dmg = 4000 + 60;
    enemyHeavy.maxHit = { dmg:0, name:'' };
    const s = summarize([mine, watched, enemyHeavy]);
    assert.equal(s.bestGame.dmg, 200, '不该把观战局或敌人的伤害算成我的最佳');
    assert.equal(s.bestGame.name, '弓手');
  });

  test('空战绩不会除以零', () => {
    const s = summarize([]);
    assert.equal(s.total, 0);
    assert.equal(s.winRate, 0);
    assert.equal(s.bestGame, null);
  });
});

// ═══════════════════════════════════════════════════════════
describe('补录的战绩', () => {

  test('每一条都过审计（抄错一个数字就会在这里报出来）', () => {
    assert.ok(BACKFILLED_RECORDS.length > 0, '补录表是空的');
    for(const raw of BACKFILLED_RECORDS){
      const rec = normalizeRecord(raw);
      const a = auditRecord(rec);
      assert.ok(a.ok, `补录 ${raw.id} 不自洽：${a.problems.join('；')}`);
      assert.equal(rec.backfilled, true, `补录 ${raw.id} 必须标记 backfilled`);
    }
  });

  test('2026-09-02 那局的数字和截图一致', () => {
    const r = normalizeRecord(BACKFILLED_RECORDS.find(x => x.id === 'backfill-20260902-lava-hard'));
    assert.equal(r.diff, 'hard');
    assert.equal(r.scene, 'lava');
    assert.equal(r.rounds, 15);
    assert.equal(outcomeOf(r), 'win');
    assert.equal(r.p1.dmg, 483);
    assert.equal(r.p2.dmg, 410);
    assert.equal(r.maxHit.dmg, 61);
    assert.equal(r.maxHit.name, '刺客');
    // 截图上 MVP 是弓手（伤害230 治疗0 击杀2）
    assert.equal(mvpOf(r.units.filter(u => u.player === 1)).name, '弓手');
    assert.equal(mvpOf(r.units).name, '弓手');
  });

  test('补录的角色 id 都在花名册里', () => {
    const ids = new Set(CHARACTERS.map(c => c.id));
    for(const raw of BACKFILLED_RECORDS)
      for(const u of raw.units)
        assert.ok(ids.has(u.charId), `${raw.id} 里的 ${u.charId} 不在花名册`);
  });
});
