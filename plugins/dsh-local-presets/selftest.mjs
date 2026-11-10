/**
 * dsh-local-presets 自检 —— 不依赖 DSH，直接在 Node 里跑解析链路。
 *
 *     node selftest.mjs
 *
 * 校验四件事：
 *   1. preset.yml / agent.cordis.yml 能解析，顶层是数组；
 *   2. `!!js` 全部求值成功（打印实际值）；
 *   3. 相对 `./x.mjs` 引用被绝对化，且**改写后的文件真实存在**；
 *   4. 产出的 definition 形状能被 agentPresets.register() 接受
 *      （id / name / order / plugins 齐备，plugins 每项有 id + name）。
 *
 * 解析逻辑与 lib/index.js 共用同一份代码，所以这里通过就说明注入后不会卡在解析上。
 */

import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { dshHome, discoverPresets, loadYaml, buildSchema, parsePresetDir } from './lib/index.js';

const root = join(dshHome(), '.agent-presets');
const PRESETS = discoverPresets(root);

const yaml = await loadYaml();

console.log(`js-yaml 就绪 · 预设根目录 = ${root}`);
console.log('');

let failed = 0;
const fail = (msg) => { failed += 1; console.log(`  ✗ ${msg}`); };
const ok = (msg) => console.log(`  ✓ ${msg}`);

for (const id of PRESETS) {
  console.log(`=========== ${id} ===========`);
  const dir = join(root, id);
  if (!existsSync(dir)) { fail(`目录不存在：${dir}`); console.log(''); continue; }

  let def;
  try {
    def = parsePresetDir(dir, id, yaml, { orderOffset: 0 });
  } catch (err) {
    fail(`解析失败：${err.message}`);
    console.log('');
    continue;
  }

  ok(`解析成功：${def.plugins.length} 行组合`);
  console.log(`     id=${def.id}  name=${JSON.stringify(def.name)}  order=${def.order}`);
  if (def.description) console.log(`     description=${JSON.stringify(def.description.slice(0, 90))}...`);

  // ── 形状检查 ────────────────────────────────────────────────────────────
  if (!def.id) fail('缺 id');
  if (!def.name) fail('缺 name');
  if (!Number.isFinite(def.order)) fail('order 不是数字');
  if (!Array.isArray(def.plugins) || def.plugins.length === 0) fail('plugins 为空');
  const badRows = def.plugins.filter((r) => !r || typeof r !== 'object' || typeof r.name !== 'string');
  if (badRows.length) fail(`${badRows.length} 行的 name 不是字符串`);

  // ── !!js 求值结果 ───────────────────────────────────────────────────────
  const jsRows = [];
  const walk = (node) => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== 'object') return;
    if ('disabled' in node) jsRows.push(`${node.id}: disabled=${JSON.stringify(node.disabled)}`);
    for (const v of Object.values(node)) walk(v);
  };
  walk(def.plugins);
  if (jsRows.length) {
    console.log(`     !!js 求值（disabled 字段共 ${jsRows.length} 处）：`);
    for (const row of jsRows.slice(0, 8)) console.log(`       ${row}`);
  }

  // ── persona 兼容垫片 ────────────────────────────────────────────────────
  const shimmed = def.shims ?? [];
  if (shimmed.length) {
    ok(`persona 兼容垫片生效（text→prefix）：${shimmed.join(', ')}`);
  } else {
    console.log('     persona 兼容垫片：不需要（未使用旧版 text 字段）');
  }

  // ── 绝对化结果 + 文件存在性 ─────────────────────────────────────────────
  console.log(`     相对引用绝对化（${def.changed.length} 处）：`);
  for (const line of def.changed) {
    const absolute = line.split(' → ')[1];
    const target = fileURLToPath(absolute);
    const shortName = target.split(/[\\/]/).slice(-1)[0];
    if (existsSync(target)) {
      ok(`       ${shortName}  (${statSync(target).size} B)`);
    } else {
      fail(`       目标文件不存在：${target}`);
    }
  }
  if (def.changed.length === 0) console.log('       （无相对引用）');

  console.log('');
}

console.log(failed === 0 ? '✅ 自检全部通过。' : `❌ 自检失败 ${failed} 项。`);
process.exit(failed === 0 ? 0 : 1);
