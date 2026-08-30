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

test('当前正式阵容的立绘已经全部覆盖',()=>{
  assert.deepEqual(Object.keys(CHARACTER_PORTRAITS).sort(),CHARACTERS.map(c=>c.id).sort());
});
