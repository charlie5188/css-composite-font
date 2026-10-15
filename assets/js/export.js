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
/* 汉字基础字体能直接 @import Google 的 CSS：没有细调粗细、没有固定的轴值；导出斜体时它自己也没有斜体（汉字字体一般都没有） */
const canLinkBase = plan => plan[0].font?.kind === 'google' && plan[0].size === 100 && !(plan[0].font.weight % 100) && !plan[0].fvs && !(state.italic && italOf(plan[0].font));
/* 导出的分组：分档模式每个字重一组（font-weight: 700）；连续模式每个分段一组（font-weight: 551 650） */
function exportGroups() {
  if (state.wmode === 'cont') {
    let segs = buildSegments();
    if (state.baseMode === 'link' && segs.every(sg => canLinkBase(sg.plan))) segs = buildSegments(false, true);
    return segs.map(sg => ({ W: sg.W, desc: sg.lo === sg.hi ? String(sg.lo) : `${sg.lo} ${sg.hi}`, plan: sg.plan, iplan: sg.iplan && italFallback(sg.iplan), cont: true }));
  }
  return [...state.weights].sort((a, b) => a - b).map(W => ({ W, desc: String(W), plan: buildPlan(W), iplan: state.italic ? italFallback(buildPlan(W, false, true)) : null, cont: false }));
}
function buildCss() {
  const plan = buildPlan(), groups = exportGroups(), cont = state.wmode === 'cont';
  const fam = cssFamilyName(), generic = state.generic !== 'auto' ? state.generic : guessGeneric();
  const linkBase = state.baseMode === 'link' && groups.every(g => canLinkBase(g.plan));
  const out = [T(linkBase ? 'cssHLink' : 'cssH', { fam })];
  let stack = `"${fam}"`, count = 0, usedFvs = false, usedAxes = false;
  const notes = [];
  if (linkBase) {     // 汉字基础字体直接引用 Google 的 CSS，不复制它的分片规则
    const bf = plan[0].font, axis = cont ? vfAxisNow(bf) : null, [a, b] = state.wrange;
    let ws;
    if (Array.isArray(axis)) {      // 连续模式下的可变字体：按轴和导出范围的交集引用，范围以外的粗细停在端点
      const lo = Math.max(axis[0], a), hi = Math.min(axis[1], b);
      ws = [lo < hi ? `${lo}..${hi}` : String(b < axis[0] ? axis[0] : a > axis[1] ? axis[1] : lo)];
    } else ws = [...new Set((cont ? WEIGHTS.filter(stepSpan).map(W => buildPlan(W)[0].font) : groups.map(g => g.plan[0].font)).map(fW => sources.get(fontKey(fW))?.actualWeight || fW.weight))].sort((x, y) => x - y);
    const specs = ws.map(w => gfSpec(bf, w));      // 带上要保留的轴：「opsz,wght@8..144,400;8..144,700」
    out.push(`@import url("https://fonts.googleapis.com/css2?family=${encodeURIComponent(bf.family).replace(/%20/g, '+')}:${specs[0].split('@')[0]}@${specs.map(x => x.split('@')[1]).join(';')}&display=swap");`);
    stack += `, "${bf.family}"`;
  }
  /* 一组规则：同一个 font-weight；style 为 italic 时是斜体那一组 */
  const emit = (g, pl, style) => {
    const W = g.W, rows = expandPlan(linkBase ? pl.slice(1) : pl, false);
    let lastP = null;
    for (const x of rows) {
      if (x.p !== lastP) {
        lastP = x.p;
        const owners = x.p.owners.map(ownerName).join(T('joiner'));
        const n = rows.filter(r => r.p === x.p && !r.missing).length;
        const ax = (x.p.font.xa || []).filter(t => !(t in (x.p.fvs || {}))).map(t => T('cssAxAuto', { t }));     // 文件里保留、但不固定的轴（opsz 跟随字号）
        const extraNote = (ax.length ? ' · ' + ax.join(T('joiner')) : '') + (style === 'italic' && x.p.up ? T('cssUpright') : '');
        out.push('', `/* ${owners} — ${fontLabel(x.p.font)}（${kindLabel(x.p.font)}${n > 1 ? T('cssSlices', { n }) : ''}）${x.p.size !== 100 ? ` · ${x.p.size}%` : ''}${x.p.range ? '' : T('cssBase')}${extraNote} */`);
        const s = sources.get(fontKey(x.p.font));
        if (s?.status === 'error' && x.p.font.kind === 'local') out.push(T('cssLocalMissing', { name: x.p.font.name }));
        if (x.p.font.kind === 'file') notes.push(`fonts/${x.p.font.fileName}`);
        if (x.p.font.kind === 'path') notes.push(`fonts/${x.p.font.path}`);
      }
      if (x.missing) { out.push(x.status === 'loading' ? T('cssGLoading') : T('cssGMissing', { font: fontLabel(x.p.font) })); continue; }
      count++;
      out.push('@font-face {', `  font-family: "${fam}";`, `  src: ${srcFor(x)};`, `  font-weight: ${g.desc};`, `  font-style: ${style};`);
      out.push(`  font-display: swap;`);
      const fvs = fvsOf(x.p, W, g.cont);
      if (fvs) { out.push(`  font-variation-settings: ${fvs};`); if (fvs.includes('"wght"')) usedFvs = true; else usedAxes = true; }
      if (x.p.size !== 100) out.push(`  size-adjust: ${x.p.size}%;`);
      if (x.range) out.push(`  unicode-range: ${wrapRanges(x.range, '    ')};`);
      out.push('}');
    }
  };
  for (const g of groups) {
    if (groups.length > 1) out.push('', `/* ===== font-weight: ${g.desc.replace(' ', '–')} ===== */`);
    emit(g, g.plan, 'normal');
    if (g.iplan) { out.push('', T('cssItalicHead')); emit(g, g.iplan, 'italic'); }
  }
  if (usedFvs || usedAxes) out.splice(1, 0, T(usedFvs ? 'cssFvs' : 'cssFvsAx'));
  if (state.italic) out.splice(1, 0, T('cssItalic'));
  if (cont) out.splice(1, 0, T('cssCont', { a: state.wrange[0], b: state.wrange[1] }));
  const extra = [];
  for (const t of TYPO) {
    if (t.key === 'zero') continue;      // 和数字样式合成一条 font-variant-numeric
    const val = t.key === 'num' ? numValue() : state.typo[t.key];
    if (t.attr || !val || (!t.always && val === (t.init ?? t.def))) continue;
    const sup = t.sup ? `Chrome ${t.sup.chrome} · Firefox ${t.sup.firefox} · Safari ${t.sup.safari}` : '';
    extra.push([`  ${t.prop}: ${val};`, `/* ${tr(t.label)}${sup ? ' · ' + sup : ''} */`]);
  }
  if (state.italic) extra.push(['  font-synthesis-style: none;', `/* ${T('cssNoSynth')} · Chrome 97 · Firefox 111 · Safari 16.4 */`]);
  const w = Math.max(0, ...extra.map(e => e[0].length)) + 2;
  const lang = state.scope;
  const head = [lang ? T('cssUseLang', { lang: (LANG_ALIASES[lang] || [lang]).join(T('joiner')) }) : T('cssUseAny')];
  if (state.typo.wordBreak === 'auto-phrase' && !/^(ja|ko)/.test(lang)) head.push(T('cssAutoPhrase'));
  out.push('', ...head, scopeSel() + ' {', `  font-family: ${stack}, ${generic};`, ...extra.map(([a, b]) => a.padEnd(w) + b), '}');
  return { css: out.join('\n'), count, files: [...new Set(notes)] };
}
/* 选了适用语言时用 :lang() 限定，字体只在这个语言的内容里生效。
   页面常写 zh-CN、zh-TW、zh-HK，而 :lang(zh-Hans) 匹配不到它们（浏览器不会从地区推出文字），所以把常见写法都列进去。
   :lang() 里直接写列表 Chrome 还不支持，用 :is() 把几个 :lang() 合起来。
   台湾版也认不带地区的 zh-Hant；它同样会匹配 zh-Hant-HK，所以排除掉，留给香港版 */
const LANG_ALIASES = { 'zh-Hans': ['zh-Hans', 'zh-CN', 'zh-SG'], 'zh-Hant-TW': ['zh-Hant', 'zh-TW'], 'zh-Hant-HK': ['zh-Hant-HK', 'zh-HK', 'zh-Hant-MO', 'zh-MO'] };
function scopeSel() {
  const s = state.scope, al = LANG_ALIASES[s];
  if (!s) return '.composite';
  if (!al) return `.composite:lang(${s})`;
  return `.composite:is(${al.map(l => `:lang(${l})`).join(', ')})` + (s === 'zh-Hant-TW' ? ':not(:lang(zh-Hant-HK), :lang(zh-Hant-MO))' : '');
}
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
/* 导出的 JS：@font-face 没有基线描述符，需要偏移的字符包进 span 相对移动。没有偏移时返回 null */
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
  for (const g of exportGroups()) for (const p of [...g.plan, ...(g.iplan || [])]) {
    const f = p.font;
    if (f && (f.kind === 'google' || f.kind === 'local')) source(f);
  }
}
async function gzipSize(text) {
  if (typeof CompressionStream === 'undefined') return null;
  try { return (await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).blob()).size; } catch (e) { return null; }
}
/* 连续模式的导出范围：两个数字，加上按用到的可变字体算出的「全部 / 最大 / 共同」 */
function renderWRange() {
  const [a, b] = state.wrange;
  for (const [id, x] of [['exWLo', a], ['exWHi', b]]) if (document.activeElement !== $('#' + id)) $('#' + id).value = x;
  const ax = vfAxes(), list = ax.map(([n, r]) => `${n} ${r[0]}–${r[1]}`).join(T('joiner'));
  const any = ax.length ? [Math.min(...ax.map(x => x[1][0])), Math.max(...ax.map(x => x[1][1]))] : null;
  const common = ax.length ? [Math.max(...ax.map(x => x[1][0])), Math.min(...ax.map(x => x[1][1]))] : null;
  const same = (r, s) => r && s && r[0] === s[0] && r[1] === s[1];
  const opts = [['wrAll', [100, 900]]];
  if (any && !same(any, [100, 900]) && !same(any, common)) opts.push(['wrAny', any]);
  if (common && common[0] < common[1] && !same(common, [100, 900])) opts.push(['wrCommon', common]);
  $('#exWNote').hidden = b >= 600;      // 范围里没有粗体时，Chrome 会给 700 等描边模拟加粗
  $('#exWPresets').innerHTML = opts.map(([k, r]) => `<button type="button" data-r="${r}" aria-pressed="${same(r, state.wrange)}" title="${esc(T(k + 'Tip', { list }))}">${esc(T(k))} ${r[0]}–${r[1]}</button>`).join('');
}
let gzTok = 0;
function renderExport() {
  ensureExportSources();
  const { css, count, files: fl } = buildCss();
  const js = buildJs();
  const kb = s => (new Blob([s]).size / 1024).toFixed(1);
  let stat = null;   // [代码, 前半, 后半]：gzip 大小算好后插在中间
  $('#exBaseField').hidden = !exportGroups().every(g => canLinkBase(g.plan));
  if (state.wmode === 'cont') renderWRange();
  renderLangWarn();
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
