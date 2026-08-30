import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { SCENES } from '../src/data/data.js';

test('每个场景都有可维护的美术配方和实际底图', () => {
  for (const scene of SCENES) {
    assert.ok(scene.bg, `${scene.id} 缺少图片失败时的渐变兜底`);
    assert.ok(scene.art?.image, `${scene.id} 缺少 art.image`);
    assert.ok(scene.art?.overlay, `${scene.id} 缺少可读性遮罩`);
    assert.ok(scene.art?.motion, `${scene.id} 缺少动态层配方`);
    assert.ok(scene.art?.particles?.kind, `${scene.id} 缺少粒子配方`);
    assert.ok(existsSync(scene.art.image), `${scene.id} 图片不存在：${scene.art.image}`);
    assert.ok(statSync(scene.art.image).size < 1024 * 1024,
      `${scene.id} 图片超过 1MB，请先压缩再提交`);
  }
});

test('场景 id 和图片路径不重复', () => {
  assert.equal(new Set(SCENES.map(scene => scene.id)).size, SCENES.length);
  assert.equal(new Set(SCENES.map(scene => scene.art.image)).size, SCENES.length);
});
