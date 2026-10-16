// 检查界面文字：三种语言的键一致、占位符 {x} 一致，代码和 HTML 里用到的键都有。CI 里运行：node tools/check-i18n.mjs
import fs from 'node:fs';
import vm from 'node:vm';
const load = l => vm.runInNewContext('(' + fs.readFileSync(`assets/js/i18n/${l}.js`, 'utf8').replace(/^[\s\S]*?export default /, '').replace(/;\s*$/, '') + ')');
const [zh, ja, tw] = ['zh', 'ja', 'tw'].map(load), errors = [];
const holes = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
for (const [name, d] of [['ja', ja], ['tw', tw]]) {
  for (const k of Object.keys(zh)) if (!(k in d)) errors.push(`${name} 缺少 ${k}`);
  for (const k of Object.keys(d)) if (!(k in zh)) errors.push(`${name} 多了 ${k}（zh 没有）`);
  for (const k of Object.keys(zh)) if (k in d && holes(zh[k]) !== holes(d[k])) errors.push(`${name}.${k} 的占位符和 zh 不同：{${holes(d[k])}} / {${holes(zh[k])}}`);
}
// 用到的键：T('key')、data-t / data-th="key"、data-ta="属性:key"
const used = new Set();
const code = fs.readdirSync('assets/js').filter(f => f.endsWith('.js')).map(f => fs.readFileSync('assets/js/' + f, 'utf8')).join('\n') + fs.readFileSync('index.html', 'utf8');
for (const m of code.matchAll(/\bT\('(\w+)'(?!\s*\+)/g)) used.add(m[1]);      // 'fxErr_' + code 这种拼出来的不算
for (const m of code.matchAll(/data-th?="(\w+)"/g)) used.add(m[1]);
for (const m of code.matchAll(/data-ta="([^"]+)"/g)) for (const p of m[1].split(';')) used.add(p.split(':')[1]);
for (const k of used) if (!(k in zh)) errors.push(`用到了 ${k}，但界面文字里没有`);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`界面文字检查通过：${Object.keys(zh).length} 个键 × 3 种语言，代码里用到 ${used.size} 个`);
