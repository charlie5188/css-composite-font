// Check UI translations: matching keys and {x} placeholders in all four languages, with every key used by code and HTML defined. Run in CI: node tools/check-i18n.mjs.
import fs from 'node:fs';
import vm from 'node:vm';
const load = l => vm.runInNewContext('(' + fs.readFileSync(`assets/js/i18n/${l}.js`, 'utf8').replace(/^[\s\S]*?export default /, '').replace(/;\s*$/, '') + ')');
const [zh, ja, tw, en] = ['zh', 'ja', 'tw', 'en'].map(load), errors = [];
const holes = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
for (const [name, d] of [['ja', ja], ['tw', tw], ['en', en]]) {
  for (const k of Object.keys(zh)) if (!(k in d)) errors.push(`${name} 缺少 ${k}`);
  for (const k of Object.keys(d)) if (!(k in zh)) errors.push(`${name} 多了 ${k}（zh 没有）`);
  for (const k of Object.keys(zh)) if (k in d && holes(zh[k]) !== holes(d[k])) errors.push(`${name}.${k} 的占位符和 zh 不同：{${holes(d[k])}} / {${holes(zh[k])}}`);
}
// Used keys: T('key'), data-t / data-th="key", and data-ta="attribute:key".
const used = new Set();
const code = fs.readdirSync('assets/js').filter(f => f.endsWith('.js')).map(f => fs.readFileSync('assets/js/' + f, 'utf8')).join('\n') + fs.readFileSync('index.html', 'utf8');
for (const m of code.matchAll(/\bT\('(\w+)'(?!\s*\+)/g)) used.add(m[1]);      // Exclude dynamically constructed keys such as 'fxErr_' + code.
for (const m of code.matchAll(/data-th?="(\w+)"/g)) used.add(m[1]);
for (const m of code.matchAll(/data-ta="([^"]+)"/g)) for (const p of m[1].split(';')) used.add(p.split(':')[1]);
for (const k of used) if (!(k in zh)) errors.push(`用到了 ${k}，但界面文字里没有`);
// Inline { zh, ja, tw, en } translations: each line must have equal counts of tw: and en:.
for (const f of ['core.js', 'unicode.js', 'ui.js']) fs.readFileSync('assets/js/' + f, 'utf8').split('\n').forEach((l, i) => {
  const n = s => (l.match(new RegExp(`\\b${s}: *['"\`]`, 'g')) || []).length;
  if (n('ja') && n('tw') !== n('en')) errors.push(`${f}:${i + 1} 的翻译缺少英文（tw ${n('tw')} 个，en ${n('en')} 个）`);
});
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`界面文字检查通过：${Object.keys(zh).length} 个键 × 4 种语言，代码里用到 ${used.size} 个`);
