'use strict';
/* ================= 导出 ================= */
const ownerName = o => o[0] === '#' ? T('customName', { c: (state.custom[+o.slice(1)]?.chars || '').slice(0, 16) }) : tr(CLS[o].name);
const fmtRangeShort = ([a, b]) => a === b ? `U+${a.toString(16).toUpperCase()}` : `U+${a.toString(16).toUpperCase()}-${b.toString(16).toUpperCase()}`;
function wrapRanges(list, indent) {
  const parts = list.map(fmtRangeShort), lines = []; let cur = '';
  for (const p of parts) {
    if (cur && (cur.length + p.length + 2) > 76) { lines.push(cur + ','); cur = p; } else cur = cur ? cur + ', ' + p : p;
  }
  if (cur) lines.push(cur);
  return lines.join('\n' + indent);
}
function srcFor(x) {
  const f = x.p.font;
  if (f.kind === 'local') return localSrc(f);
  if (f.kind === 'file' || f.kind === 'path') {
    const file = f.kind === 'file' ? f.fileName : f.path;
    const fmt = { woff2: 'woff2', woff: 'woff', otf: 'opentype', ttf: 'truetype' }[(file.split('.').pop() || '').toLowerCase()];
    return `url("fonts/${file}")${fmt ? ` format("${fmt}")` : ''}`;
  }
  return x.face.src.replace(/'/g, '"');
}
function cssFamilyName() { return (state.name || '').trim().replace(/["\\]/g, '') || 'My Composite'; }
const canLinkBase = plan => plan[0].font?.kind === 'google' && plan[0].size === 100 && !(plan[0].font.weight % 100);   // 细调过粗细的可变字体要自己写规则
function buildCss() {
  const plan = buildPlan(), weights = [...state.weights].sort((a, b) => a - b);
  const fam = cssFamilyName(), generic = state.generic !== 'auto' ? state.generic : guessGeneric();
  const linkBase = state.baseMode === 'link' && weights.every(W => canLinkBase(buildPlan(W)));
  const out = [T(linkBase ? 'cssHLink' : 'cssH', { fam })];
  let stack = `"${fam}"`, count = 0, usedFvs = false;
  const notes = [];
  if (linkBase) {     // 汉字基础字体直接引用 Google 的 CSS，不复制它的分片规则
    const bf = plan[0].font;
    const ws = [...new Set(weights.map(W => { const fW = buildPlan(W)[0].font; return sources.get(fontKey(fW))?.actualWeight || fW.weight; }))].sort((a, b) => a - b);
    out.push(`@import url("https://fonts.googleapis.com/css2?family=${encodeURIComponent(bf.family).replace(/%20/g, '+')}:wght@${ws.join(';')}&display=swap");`);
    stack += `, "${bf.family}"`;
  }
  for (const W of weights) {
    const planW = buildPlan(W);
    const rows = expandPlan(linkBase ? planW.slice(1) : planW, false);
    if (weights.length > 1) out.push('', `/* ===== font-weight: ${W} ===== */`);
    let lastP = null;
    for (const x of rows) {
      if (x.p !== lastP) {
        lastP = x.p;
        const owners = x.p.owners.map(ownerName).join(T('joiner'));
        const n = rows.filter(r => r.p === x.p && !r.missing).length;
        out.push('', `/* ${owners} — ${fontLabel(x.p.font)}（${kindLabel(x.p.font)}${n > 1 ? T('cssSlices', { n }) : ''}）${x.p.size !== 100 ? ` · ${x.p.size}%` : ''}${x.p.range ? '' : T('cssBase')} */`);
        const s = sources.get(fontKey(x.p.font));
        if (s?.status === 'error' && x.p.font.kind === 'local') out.push(T('cssLocalMissing', { name: x.p.font.name }));
        if (x.p.font.kind === 'file') notes.push(`fonts/${x.p.font.fileName}`);
        if (x.p.font.kind === 'path') notes.push(`fonts/${x.p.font.path}`);
      }
      if (x.missing) { out.push(x.status === 'loading' ? T('cssGLoading') : T('cssGMissing', { font: fontLabel(x.p.font) })); continue; }
      count++;
      out.push('@font-face {', `  font-family: "${fam}";`, `  src: ${srcFor(x)};`, `  font-weight: ${W};`, `  font-style: normal;`, `  font-display: swap;`);
      const wv = wghtFor(x.p.font, W);
      if (wv) { out.push(`  font-variation-settings: "wght" ${wv};`); usedFvs = true; }
      if (x.p.size !== 100) out.push(`  size-adjust: ${x.p.size}%;`);
      if (x.range) out.push(`  unicode-range: ${wrapRanges(x.range, '    ')};`);
      out.push('}');
    }
  }
  if (usedFvs) out.splice(1, 0, T('cssFvs'));
  const extra = [];
  for (const t of TYPO) {
    const val = state.typo[t.key];
    if (t.attr || !val || (!t.always && val === (t.init ?? t.def))) continue;
    const sup = t.sup ? `Chrome ${t.sup.chrome} · Firefox ${t.sup.firefox} · Safari ${t.sup.safari}` : '';
    extra.push([`  ${t.prop}: ${val};`, `/* ${tr(t.label)}${sup ? ' · ' + sup : ''} */`]);
  }
  const w = Math.max(0, ...extra.map(e => e[0].length)) + 2;
  const lang = state.scope;
  const head = [lang ? T('cssUseLang', { lang }) : T('cssUseAny')];
  if (state.typo.wordBreak === 'auto-phrase' && !/^(ja|ko)/.test(lang)) head.push(T('cssAutoPhrase'));
  out.push('', ...head, scopeSel() + ' {', `  font-family: ${stack}, ${generic};`, ...extra.map(([a, b]) => a.padEnd(w) + b), '}');
  return { css: out.join('\n'), count, files: [...new Set(notes)] };
}
/* 选了适用语言时用 :lang() 限定，字体只在这个语言的内容里生效 */
const scopeSel = () => state.scope ? `.composite:lang(${state.scope})` : '.composite';
function shiftTable() {
  let segs = [];
  for (const c of CLASSES) { const s = resolveCls(c.id).shift; if (s) segs.push(...EFF[c.id].map(([a, b]) => [a, b, s / 100])); }
  state.custom.forEach((cu, i) => {
    const rng = customRanges[i]; if (!rng?.length) return;
    const next = [];
    for (const [a, b, v] of segs) {   // 例外先在类别范围上挖洞
      let start = a;
      for (const [ra, rb] of rng) { if (rb < start || ra > b) continue; if (ra > start) next.push([start, ra - 1, v]); start = Math.max(start, rb + 1); }
      if (start <= b) next.push([start, b, v]);
    }
    const s = resolveCustom(cu).shift;
    if (s) next.push(...rng.map(([a, b]) => [a, b, s / 100]));
    segs = next;
  });
  segs.sort((x, y) => x[0] - y[0]);
  const merged = [];
  for (const g of segs) {
    const last = merged[merged.length - 1];
    if (last && last[2] === g[2] && g[0] <= last[1] + 1) last[1] = Math.max(last[1], g[1]); else merged.push([...g]);
  }
  return merged;
}
function buildJs() {
  const segs = shiftTable();
  if (!segs.length) return null;
  const rows = segs.map(([a, b, v]) => `[0x${hex(a)}, 0x${hex(b)}, ${+v.toFixed(4)}]`);
  const table = []; for (let i = 0; i < rows.length; i += 3) table.push('    ' + rows.slice(i, i + 3).join(', '));
  return T('jsHead', { fam: cssFamilyName() }) + `
(() => {
  const SELECTOR = '${scopeSel()}';
  const SHIFT = [ ${T('jsTable')}
${table.join(',\n')}
  ];
  const shiftOf = cp => {
    let lo = 0, hi = SHIFT.length - 1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1, r = SHIFT[m];
      if (cp < r[0]) hi = m - 1; else if (cp > r[1]) lo = m + 1; else return r[2];
    }
    return 0;
  };
  const skip = el => !el || el.closest('[data-cf-shift], script, style, textarea, code, pre');
  function apply(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) if (!skip(walker.currentNode.parentElement)) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const runs = [];
      let cur = null;
      for (const ch of node.data) {
        const s = shiftOf(ch.codePointAt(0));
        if (cur && cur.s === s) cur.t += ch; else runs.push(cur = { s, t: ch });
      }
      if (!runs.some(r => r.s)) continue;
      const frag = document.createDocumentFragment();
      for (const r of runs) {
        if (!r.s) { frag.append(r.t); continue; }
        const span = document.createElement('span');
        span.dataset.cfShift = '';
        span.style.cssText = \`position:relative;inset-block-start:\${-r.s}em\`;
        span.textContent = r.t;
        frag.append(span);
      }
      node.replaceWith(frag);
    }
  }
  document.querySelectorAll(SELECTOR).forEach(apply);
})();`;
}
function highlight(code, lang) {
  let h = esc(code);
  h = h.replace(/\/\*[\s\S]*?\*\//g, m => `<span class="cm">${m}</span>`);
  if (lang === 'css') {
    h = h.replace(/^(@font-face|\.composite)/gm, '<span class="at">$1</span>');
    h = h.replace(/^(\s+)([a-z-]+)(:)/gm, '$1<span class="pr">$2</span>$3');
  }
  return h;
}
let exTab = 'css', lastExport = '';
function ensureExportSources() {
  for (const W of state.weights) for (const p of buildPlan(W)) {
    const f = p.font;
    if (f && (f.kind === 'google' || f.kind === 'local')) source(f);
  }
}
async function gzipSize(text) {
  if (typeof CompressionStream === 'undefined') return null;
  try { return (await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).blob()).size; } catch (e) { return null; }
}
let gzTok = 0;
function renderExport() {
  ensureExportSources();
  const { css, count, files: fl } = buildCss();
  const js = buildJs();
  const kb = s => (new Blob([s]).size / 1024).toFixed(1);
  let stat = null;   // [代码, 前半, 后半]：gzip 大小算好后插在中间
  $('#exBaseField').hidden = !state.weights.every(W => canLinkBase(buildPlan(W)));
  if (exTab === 'css') {
    lastExport = css;
    $('#codeOut').innerHTML = highlight(css, 'css');
    $('#exNote').textContent = fl.length ? T('noteFiles', { files: fl.join(T('joiner')) }) : '';
    stat = [css, T('stats', { n: count, kb: kb(css) }), js ? T('statsJs') : T('statsCss')];
  } else if (exTab === 'js') {
    lastExport = js || '';
    $('#codeOut').innerHTML = js ? highlight(js, 'js') : `<span class="cm">${esc(T('jsNone'))}</span>`;
    $('#exNote').textContent = js ? T('noteJs') : T('noteNoJs');
    if (js) stat = [js, kb(js) + ' KB', ''];
  }
  const meta = $('#exStats'), tok = ++gzTok;
  meta.hidden = !stat;
  if (stat) {
    const [text, head, tail] = stat;
    meta.textContent = head + tail;
    gzipSize(text).then(n => { if (n != null && tok === gzTok) meta.textContent = head + T('gz', { kb: (n / 1024).toFixed(1) }) + tail; });
  }
  $('#copyBtn').disabled = !lastExport;
  $('#exBar').hidden = !$('#exNote').textContent;
}
const renderExportSoon = debounce(() => renderExport(), 150);
