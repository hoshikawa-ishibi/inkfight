import test from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTERS } from '../src/data/data.js';
import { CHARACTER_VISUALS, visualFor, DEFAULT_CHARACTER_VISUAL } from '../src/data/character-visuals.js';

const REQUIRED=['body','stance','head','outer','attack','accent'];

test('每个正式角色都有且只有一份完整视觉配方',()=>{
  const ids=CHARACTERS.map(c=>c.id).sort();
  assert.deepEqual(Object.keys(CHARACTER_VISUALS).sort(),ids);
  for(const c of CHARACTERS){
    const v=CHARACTER_VISUALS[c.id];
    for(const key of REQUIRED) assert.equal(typeof v[key],'string',`${c.name} 缺少 ${key}`);
  }
});

test('16 人不能是完全相同的视觉配方换颜色',()=>{
  const signatures=Object.values(CHARACTER_VISUALS).map(v=>REQUIRED.map(k=>v[k]).join('|'));
  assert.equal(new Set(signatures).size,CHARACTERS.length);
});

test('未知角色有稳定默认外观',()=>{
  assert.equal(visualFor('not-a-character'),DEFAULT_CHARACTER_VISUAL);
});
