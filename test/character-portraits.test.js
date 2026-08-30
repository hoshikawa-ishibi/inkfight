import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHARACTERS } from '../src/data/data.js';
import { CHARACTER_PORTRAITS } from '../src/data/character-portraits.js';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

test('已配置的角色立绘都属于正式角色且资产存在',()=>{
  const ids=new Set(CHARACTERS.map(c=>c.id));
  for(const [id,asset] of Object.entries(CHARACTER_PORTRAITS)){
    assert.ok(ids.has(id),`未知角色立绘：${id}`);
    assert.ok(fs.existsSync(path.join(ROOT,asset)),`${id} 立绘不存在：${asset}`);
  }
});

// 和 scene-assets.test.js 的体积守卫对齐。原本这里只查存在不查大小，
// 于是 16 张 2~3MB 的原始 PNG 直接进了仓库（.git 一次涨到 49MB）。
test('立绘都已经压到可以上线的体积',()=>{
  for(const [id,asset] of Object.entries(CHARACTER_PORTRAITS)){
    const size=fs.statSync(path.join(ROOT,asset)).size;
    assert.ok(size<500*1024,`${id} 立绘 ${(size/1024).toFixed(0)}KB 超过 500KB，请先压缩再提交`);
  }
});

test('当前正式阵容的立绘已经全部覆盖',()=>{
  assert.deepEqual(Object.keys(CHARACTER_PORTRAITS).sort(),CHARACTERS.map(c=>c.id).sort());
});
