/**
 * 语法体检：对全仓库每个 .js / .mjs 跑 `node --check`。
 *
 * 存在的理由：main.js / battle.js / vfx.js / scene.js / stickman.js / audio.js /
 * render.js 这 7 个文件（约 2376 行，占全项目 68%）都依赖 DOM，Node 里 import
 * 不进来，所以从来没有任何测试碰过它们——在 main.js 里写个语法错误，其余测试
 * 照样全绿，只有打开浏览器才会发现（2026-08-25 那晚就这样弄坏 main.js 两次）。
 *
 * `node --check` 只解析、不执行，所以 document / window 这些浏览器全局量不影响它。
 * 它挡不住逻辑错误，只挡「这个文件根本解析不了」——但那一类以前完全没人挡。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// node_modules 是别人的代码；.git 里没有源码；.claude 里的脚本未必是 ESM，
// 按 ESM 解析会误报——一个天天变红的测试等于没有测试。
const SKIP_DIRS = new Set(['node_modules', '.git', '.claude', 'vendor']);

function listSources(dir){
  const out = [];
  for(const entry of fs.readdirSync(dir, { withFileTypes:true })){
    const full = path.join(dir, entry.name);
    if(entry.isDirectory()){
      if(!SKIP_DIRS.has(entry.name)) out.push(...listSources(full));
    } else if(/\.m?js$/.test(entry.name)){
      out.push(full);
    }
  }
  return out;
}

const SOURCES = listSources(ROOT);
const rel = f => path.relative(ROOT, f).split(path.sep).join('/');

describe('语法体检（node --check）', () => {

  // 防止「扫描器自己坏了」把整组测试变成空跑：这 7 个正是本组测试存在的理由，
  // 它们必须在名单里。
  test('扫到的文件里包含那 7 个没有单测覆盖的模块', () => {
    // **按文件名匹配，不写死目录**：源码 2026-08-29 整理进了 src/ 的子目录，
    // 写死路径的话每次搬家都要回来改，而它本该盯的是「扫描器有没有空跑」。
    const names = SOURCES.map(f => rel(f).split('/').pop());
    for(const f of ['main.js','battle.js','vfx.js','scene.js','stickman.js','audio.js','render.js']){
      assert.ok(names.includes(f), `扫描漏了 ${f}——这组测试就是为了覆盖它`);
    }
  });

  for(const file of SOURCES){
    test(`${rel(file)} 能被解析`, () => {
      try {
        execFileSync(process.execPath, ['--check', file], { stdio:'pipe' });
      } catch(err){
        assert.fail(`${rel(file)} 解析失败：\n${(err.stderr && err.stderr.toString()) || err.message}`);
      }
    });
  }
});

// ── 顺带：import 指得到人吗 ───────────────────────────────────────────────
// 挡的是「改名了但漏改调用方」。node --check 不查这个（它不解析模块图），
// 而这类错误同样只有运行到那一行才炸。

// 行首的 import / export ... from '...'。[^'"] 能跨行，所以多行 import 也吃得下；
// 又因为它不跨引号，函数体里的字符串不会被误当成 import。
const IMPORT_RE = /^[ \t]*(?:import|export)\s+([^'"]*?)\s*from\s*['"]([^'"]+)['"]/gm;
const DECL_EXPORT_RE = /^[ \t]*export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm;
const BRACE_EXPORT_RE = /^[ \t]*export\s*\{([^}]*)\}/gm;

// 只有带 {} 的具名导入才查名字；default / namespace（import * as X）导入只查文件在不在。
function namedBindings(clause){
  const braces = clause.match(/\{([\s\S]*)\}/);
  if(!braces) return [];
  return braces[1].split(',')
    .map(s => s.trim().split(/\s+as\s+/)[0].trim())
    .filter(Boolean);
}

function exportedNames(src){
  const names = new Set();
  for(const m of src.matchAll(DECL_EXPORT_RE)) names.add(m[1]);
  for(const m of src.matchAll(BRACE_EXPORT_RE)){
    for(const part of m[1].split(',')){
      const seg = part.trim().split(/\s+as\s+/);
      const name = (seg[1] || seg[0] || '').trim();
      if(name) names.add(name);
    }
  }
  return names;
}

describe('import 目标存在，而且那边真的导出了这些名字', () => {
  for(const file of SOURCES){
    test(`${rel(file)} 的 import 都指得到人`, () => {
      const src = fs.readFileSync(file, 'utf8');
      for(const m of src.matchAll(IMPORT_RE)){
        const [, clause, spec] = m;
        if(!spec.startsWith('.')) continue;          // node: 内建和 npm 包不查
        const target = path.resolve(path.dirname(file), spec);
        assert.ok(fs.existsSync(target), `${rel(file)} 引用了 ${spec}，但这个文件不存在`);

        const targetSrc = fs.readFileSync(target, 'utf8');
        if(/^[ \t]*export\s*\*/m.test(targetSrc)) continue;   // 有 re-export star 就查不准，跳过
        const has = exportedNames(targetSrc);
        for(const name of namedBindings(clause)){
          assert.ok(has.has(name), `${rel(file)} 从 ${spec} 导入了 ${name}，但那边没导出它`);
        }
      }
    });
  }
});
