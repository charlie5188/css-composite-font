'use strict';
/* ================= 导出 · 字体文件 =================
   把合成字体做成真正的字体文件（TTF，可选 WOFF2）：每个字重、正斜体各一个，打包成 zip。
   做法和导出的 CSS 一一对应：同一张规则表（buildPlan），每条规则的字体只取它负责的字，按 size-adjust 缩放、
   按基线偏移上下平移，再合并成一个字体；行高度量用汉字基础字体的。
   在 Web Worker 里跑 Pyodide（浏览器里的 Python）+ fontTools，源字体由页面下载后交给 Worker：
   - Google Fonts：google/fonts 仓库里的完整文件（网页接口给的切片去掉了大部分 OpenType 特性）
   - 上传的字体：直接用文件内容
   artifact 等嵌入页面不能下载外部文件，改为打开 GitHub Pages 版，并在链接里带上当前设置 */
const BK = {
  pyodide: 'https://cdn.jsdelivr.net/npm/pyodide@0.27.7/',
  brotli: 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/brotli-1.1.0-cp312-cp312-pyodide_2024_0_wasm32.whl',
  wheel: 'assets/py/fonttools-4.60.2-py3-none-any.whl',      // PyPI 不允许网页跨域下载，放在仓库里由 GitHub Pages 提供
  pages: 'https://charlie5188.github.io/css-composite-font/',
  raw: 'https://raw.githubusercontent.com/google/fonts/main/',
  api: 'https://api.github.com/repos/google/fonts/contents/',
  runtimeMB: 15,      // Pyodide + fontTools，第一次要下载的大小
};
const CAN_BAKE = window.top === window.self;      // 和「下载文件」按钮同一个判断：嵌入的框架里浏览器会拦截下载
const STY = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };
const styleName = (W, ital) => ital ? (W === 400 ? 'Italic' : `${STY[W]} Italic`) : STY[W];
const LIC_NAME = { ofl: 'OFL', apache: 'Apache 2.0', ufl: 'UFL' };
/* 写进字体和 zip 的许可说明用英文：字体的元数据、许可文件一般都是英文 */
const LIC_OFL = ['This Font Software is licensed under the SIL Open Font License, Version 1.1.', 'https://openfontlicense.org'];
const LIC_PRIVATE = ['Contains fonts used under their own licenses. Private use only; do not redistribute.', ''];
const LIC_HEAD_OPEN = 'This font combines the fonts listed below. All of them are under the SIL Open Font License 1.1 or a compatible open license, and this font is licensed under the SIL Open Font License 1.1. Their copyright notices and license texts follow.';
const LIC_HEAD_PRIVATE = 'This font combines the fonts listed below. Some of them are not under an open license; whoever made this font confirmed they have the right to modify and combine them. Do not redistribute this font.';

/* ---------- Google Fonts 的源文件：google/fonts 仓库里的完整文件 ----------
   先按仓库的命名规则直接猜文件名（可变字体：字体族去空格[轴,…].ttf，轴名按 ASCII 排序；静态字体：字体族去空格-Regular.ttf 等），
   用 HEAD 请求确认存在；猜不到才用 GitHub API 列目录。API 每个 IP 每小时只能用 60 次，公司网络里很多人共用一个出口，很快会用完 */
const gfDirs = new Map();      // 字体族 -> { st: 'loading' | 'ok' | 'err', lic, slug, names: [[文件名, 大小]], text, rfn }
const gfUrl = (lic, slug, name) => BK.raw + lic + '/' + slug + '/' + encodeURIComponent(name);
async function gfGuess(family, slug) {
  let lic = null, text = '';
  for (const [l, f] of [['ofl', 'OFL.txt'], ['apache', 'LICENSE.txt'], ['ufl', 'UFL.txt'], ['ufl', 'LICENCE.txt']]) {
    const r = await fetch(gfUrl(l, slug, f));
    if (r.ok) { lic = l; text = await r.text(); break; }
  }
  if (!lic) return null;
  const head = async n => { try { const r = await fetch(gfUrl(lic, slug, n), { method: 'HEAD' }); return r.ok ? [n, +r.headers.get('content-length') || 0] : null; } catch (e) { return null; } };
  const stem = family.replace(/\s+/g, ''), ax = (GF_AXES[family] || '').split(',').map(x => x.split(' ')[0]).filter(t => t && t !== 'ital').sort();
  let names = [];
  if (ax.length) names = (await Promise.all([`${stem}[${ax}].ttf`, `${stem}-Italic[${ax}].ttf`].map(head))).filter(Boolean);
  if (!names.length) names = (await Promise.all(Object.entries(STY).flatMap(([w, st]) => [`${stem}-${st}.ttf`, `${stem}-${+w === 400 ? '' : st}Italic.ttf`]).map(head))).filter(Boolean);
  return names.length ? { lic, names, text } : null;
}
async function gfList(slug) {
  for (const lic of ['ofl', 'apache', 'ufl']) {
    const r = await fetch(BK.api + lic + '/' + slug);
    if (r.status === 404) continue;
    if (!r.ok) throw Object.assign(new Error('gh'), { code: r.status === 403 || r.status === 429 ? 'ghLimit' : 'net' });
    const names = (await r.json()).map(x => [x.name, x.size]), lf = names.find(([n]) => /^(OFL|LICENSE|LICENCE|UFL)\.txt$/i.test(n));
    return { lic, names, text: lf ? await (await fetch(gfUrl(lic, slug, lf[0]))).text() : '' };
  }
  throw Object.assign(new Error('gf'), { code: 'gfNone' });
}
function gfInfo(family) {
  let g = gfDirs.get(family);
  if (g) return g;
  g = { st: 'loading' };
  gfDirs.set(family, g);
  (async () => {
    const slug = family.toLowerCase().replace(/[^a-z0-9]/g, ''), ck = 'composite-font:gf2:' + slug;
    let d = lsGet(ck);
    if (!d || Date.now() - d.t > 7 * 864e5) {
      d = { t: Date.now(), ...((await gfGuess(family, slug)) || (await gfList(slug))) };
      try { localStorage.setItem(ck, JSON.stringify(d)); } catch (e) { /* 存不了就下次再查 */ }
    }
    Object.assign(g, { st: 'ok', lic: d.lic, slug, names: d.names, text: d.text, rfn: rfnOf(d.text) });
  })().catch(e => Object.assign(g, { st: 'err', err: e.code || 'net' })).finally(() => { if (exKind === 'font') renderFontTab(); });
  return g;
}
/* 选文件：可变字体优先（正体 / Italic 各一个）；静态字体取最接近的一档，和 CSS 的字重匹配一样 400 以上往粗找 */
function gfPick(names, weight, ital) {
  const fonts = names.filter(([n]) => /\.(ttf|otf)$/i.test(n));
  const vf = fonts.find(([n]) => n.includes('[') && n.includes('Italic') === ital);
  if (vf) return { name: vf[0], size: vf[1], vf: true };
  const have = [];
  for (const [w, s] of Object.entries(STY)) {
    const want = ital ? (+w === 400 ? '' : s) + 'Italic' : s;
    const hit = fonts.find(([n]) => n.replace(/\.(ttf|otf)$/i, '').split('-').pop() === want);
    if (hit) have.push([+w, hit]);
  }
  if (!have.length) return null;
  have.sort((a, b) => Math.abs(a[0] - weight) - Math.abs(b[0] - weight) || (weight >= 400 ? b[0] - a[0] : a[0] - b[0]));
  return { name: have[0][1][0], size: have[0][1][1], vf: false };
}
/* OFL 的保留名称（Reserved Font Name）：新字体的名字里不能有 */
function rfnOf(text) {
  const out = new Set();
  for (const m of (text || '').matchAll(/Reserved Font Names?\s*((?:[“"'‘][^“”"'‘’\n]+[”"'’][\s,&]*(?:and\s*)?)+)/gi))
    for (const q of m[1].matchAll(/[“"'‘]([^“”"'‘’\n]+)[”"'’]/g)) out.add(q[1].trim());
  return [...out];
}

/* ---------- 上传的字体、本机字体：读 name / OS/2 表，判断许可和轮廓 ---------- */
const fileMetas = new Map();      // fileId -> 结果；读取中为 null
function fileMeta(id, fl) {
  if (fileMetas.has(id)) return fileMetas.get(id);
  fileMetas.set(id, null);
  readFontMeta(fl.buffer).then(m => { fileMetas.set(id, m); if (exKind === 'font') renderFontTab(); });
  return null;
}
/* ps：字体集合（TTC）里要用的那一款的 PostScript 名；不给就看第一款 */
async function readFontMeta(buf, ps) {
  const m = { lic: 'unknown', rfn: [], size: buf.byteLength };
  try {
    const v = new DataView(buf), tag = x => String.fromCharCode(x >>> 24, (x >> 16) & 255, (x >> 8) & 255, x & 255);
    const sig = v.getUint32(0);
    if (sig === 0x774F4632) { m.woff2 = true; return m; }      // brotli 压缩，读不了表：许可不明，轮廓到生成时再检查
    const read = async base => {
      const tabs = {}, tags = new Set();
      if (v.getUint32(base) === 0x774F4646) {
        for (let i = 0, n = v.getUint16(12); i < n; i++) {
          const r = 44 + i * 20, t = tag(v.getUint32(r)), off = v.getUint32(r + 4), comp = v.getUint32(r + 8), orig = v.getUint32(r + 12);
          tags.add(t);
          if (t !== 'name' && t !== 'OS/2') continue;
          let tb = buf.slice(off, off + comp);
          if (comp < orig) tb = await new Response(new Blob([tb]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();
          tabs[t] = new DataView(tb);
        }
      } else {
        for (let i = 0, n = v.getUint16(base + 4); i < n; i++) {
          const r = base + 12 + i * 16, t = tag(v.getUint32(r));
          tags.add(t);
          if (t === 'name' || t === 'OS/2') tabs[t] = new DataView(buf, v.getUint32(r + 8), v.getUint32(r + 12));
        }
      }
      return { tabs, tags, names: nameRecs(tabs.name) };
    };
    const bases = sig === 0x74746366 ? Array.from({ length: v.getUint32(8) }, (_, i) => v.getUint32(12 + i * 4)) : [0];
    m.ttc = sig === 0x74746366;
    let face = null;
    for (const b of bases) { const r = await read(b); face ||= r; if (!ps || r.names[6] === ps) { face = r; break; } }
    m.cff = face.tags.has('CFF ') || face.tags.has('CFF2');
    m.outline = m.cff || face.tags.has('glyf');
    const os2 = face.tabs['OS/2'];
    if (os2 && os2.byteLength >= 62) m.vendor = String.fromCharCode(...[58, 59, 60, 61].map(k => os2.getUint8(k))).trim();
    m.copyright = face.names[0] || ''; m.license = face.names[13] || ''; m.licenseUrl = face.names[14] || '';
    const all = [m.license, m.licenseUrl, m.copyright].join(' ');
    m.lic = /^a?appl$/i.test(m.vendor || '') || /\bApple (Inc|Computer)/.test(m.copyright) ? 'apple'      // 厂商代码有 APPL、Appl、Aapl 几种写法
      : /open font licen[cs]e|\bOFL\b|scripts\.sil\.org\/OFL|openfontlicense/i.test(all) ? 'ofl'
      : /apache licen[cs]e|apache\.org\/licenses/i.test(all) ? 'apache'
      : /ubuntu font licen[cs]e/i.test(all) ? 'ufl' : 'unknown';
    m.rfn = rfnOf(m.copyright + '\n' + m.license);
  } catch (e) { /* 读不懂：许可不明 */ }
  return m;
}
function nameRecs(d) {
  const got = {};
  if (d) for (let i = 0, count = d.getUint16(2), so = d.getUint16(4); i < count; i++) {
    const r = 6 + i * 12, pid = d.getUint16(r), eid = d.getUint16(r + 2), lid = d.getUint16(r + 4), nid = d.getUint16(r + 6), len = d.getUint16(r + 8), off = so + d.getUint16(r + 10);
    if (![0, 6, 13, 14].includes(nid)) continue;
    let s = '';
    if (pid === 0 || pid === 3) for (let k = 0; k + 1 < len; k += 2) s += String.fromCharCode(d.getUint16(off + k));
    else if (pid === 1 && eid === 0) for (let k = 0; k < len; k++) s += String.fromCharCode(d.getUint8(off + k));
    else continue;
    const pref = pid === 3 && lid === 0x409 ? 2 : 1;
    if (!got[nid] || got[nid].p < pref) got[nid] = { s, p: pref };
  }
  return Object.fromEntries(Object.entries(got).map(([k, x]) => [k, x.s]));
}
/* 本机安装的字体：用浏览器的本机字体接口（Chrome / Edge）读文件内容。第一次要用户点按钮授权 */
const fxLocal = { st: 'idle', map: new Map(), metas: new Map() };      // st：idle 没查过 / check 查权限中 / need 要用户授权 / asking / ok / denied
async function fxLocalLoad(ask) {
  if (!('queryLocalFonts' in window)) return;
  if (!ask) {
    fxLocal.st = 'check';
    try { if ((await navigator.permissions.query({ name: 'local-fonts' })).state !== 'granted') { fxLocal.st = 'need'; renderFontTab(); return; } }
    catch (e) { fxLocal.st = 'need'; renderFontTab(); return; }
  }
  fxLocal.st = 'asking';
  try {
    const list = window.queryLocalFonts();      // 点按钮时同步调用：浏览器要求在用户操作里请求权限
    if (ask) renderFontTab();
    for (const fd of await list) { fxLocal.map.set(fd.fullName, fd); fxLocal.map.set(fd.postscriptName, fd); }
    fxLocal.st = 'ok';
  } catch (e) { fxLocal.st = 'denied'; }
  renderFontTab();
}
const localFind = f => [f.name, ...(f.alt || [])].map(n => fxLocal.map.get(n)).find(Boolean) || null;
function localMeta(fd) {
  const k = fd.postscriptName;
  if (fxLocal.metas.has(k)) return fxLocal.metas.get(k);
  fxLocal.metas.set(k, null);
  fd.blob().then(b => b.arrayBuffer()).then(buf => readFontMeta(buf, k)).then(m => { fxLocal.metas.set(k, m); if (exKind === 'font') renderFontTab(); });
  return null;
}

/* ---------- 要生成哪些文件，各用哪些源字体 ---------- */
function fxPlan() {
  const fam = cssFamilyName(), out = { fam, jobs: [], srcs: new Map(), block: new Set(), loading: false, unknown: false, needLocal: false, rfn: null };
  const use = (p, W) => {
    const f = p.font;
    if (!f) return null;
    let s, w = null;
    if (f.kind === 'google') {
      const g = gfInfo(f.family), name = f.family + (f.ital ? ' Italic' : '');
      if (g.st === 'loading') { out.loading = true; s = { key: 'g:' + name, kind: 'google', name }; }
      else if (g.st === 'err') s = { key: 'g:' + name, kind: 'google', name, err: g.err };
      else {
        const pick = gfPick(g.names, f.weight, !!f.ital);
        if (!pick) s = { key: 'g:' + name, kind: 'google', name, err: 'gfNone' };
        else {
          s = { key: pick.name, kind: 'google', name, file: pick.name, url: gfUrl(g.lic, g.slug, pick.name), size: pick.size, lic: g.lic, licText: g.text, rfn: g.rfn };
          if (pick.vf) { const a = axisOf(G(f.family), 'wght'); w = a ? Math.min(a[2], Math.max(a[1], f.weight)) : f.weight; }
        }
      }
    } else if (f.kind === 'file') {
      const fl = files.get(f.fileId);
      if (!fl) s = { key: 'f:' + f.fileId, kind: 'file', name: f.fileName, err: 'noFile' };
      else {
        const m = fileMeta(f.fileId, fl);
        if (!m) out.loading = true;
        s = { key: 'f:' + f.fileId, kind: 'file', name: fl.name, file: 'u' + f.fileId + '_' + fl.name.replace(/[^\w.-]+/g, '_'), size: fl.buffer.byteLength, fileId: f.fileId,
          lic: m ? m.lic : null, meta: m, rfn: m ? m.rfn : [], static: !f.axis, cff: m && m.cff,
          err: m && (m.lic === 'apple' ? 'apple' : !m.woff2 && !m.outline ? 'outline' : null) };
        if (f.axis) w = f.weight || 400;
      }
    } else if (f.kind === 'local') {
      const fd = fxLocal.st === 'ok' ? localFind(f) : null, m = fd && localMeta(fd);
      if (!('queryLocalFonts' in window)) s = { key: 'l:' + f.name, kind: 'local', name: f.name, err: 'localApi' };
      else if (fxLocal.st === 'denied') s = { key: 'l:' + f.name, kind: 'local', name: f.name, err: 'localDenied' };
      else if (fxLocal.st !== 'ok') { out.needLocal = true; s = { key: 'l:' + f.name, kind: 'local', name: f.name, needLocal: true }; }
      else if (!fd) s = { key: 'l:' + f.name, kind: 'local', name: f.name, err: 'localMissing' };
      else {
        if (!m) out.loading = true;
        s = { key: 'l:' + fd.postscriptName, kind: 'local', name: fd.fullName, file: 'l_' + fd.postscriptName.replace(/[^\w.-]+/g, '_'), ps: fd.postscriptName, fd,
          size: m ? m.size : 0, lic: m ? m.lic : null, meta: m, rfn: m ? m.rfn : [], cff: m && m.cff,
          err: m && (m.lic === 'apple' ? 'apple' : !m.outline ? 'outline' : null) };
        if (f.axis) w = f.weight || 400;
      }
    } else s = { key: f.kind + ':' + (f.name || f.path), kind: f.kind, name: f.name || f.path, err: 'noFile' };
    const prev = out.srcs.get(s.key);
    if (prev) s = prev; else { s.owners = new Set(); s.ws = new Set(); s.pct = new Set(); out.srcs.set(s.key, s); }
    p.owners.forEach(o => s.owners.add(o)); s.ws.add(W); s.pct.add(p.size);
    return { file: s.file, name: s.name, weight: w, fvs: p.fvs || null, key: s.key, ps: s.ps || null };
  };
  const keys = pl => pl.map(p => p.font ? fontKey(p.font) : '').join('|');
  for (const W of WEIGHTS.filter(w => state.fx.weights.includes(w))) {
    const up = buildPlan(W, true, false);
    for (const ital of state.fx.italic ? [false, true] : [false]) {
      const plan = ital ? buildPlan(W, true, true) : up;
      if (ital && keys(plan) === keys(up)) continue;      // 没有一个类别有斜体：斜体和正体一样，不生成
      out.jobs.push({ W, italic: ital, plan, srcs: plan.map(p => use(p, W)), label: `${fam} ${styleName(W, ital)}` });
    }
  }
  for (const s of out.srcs.values()) {
    if (s.err) out.block.add(s.err);
    if (s.lic === 'unknown') out.unknown = true;
    const hit = (s.rfn || []).find(r => fam.toLowerCase().includes(r.toLowerCase()));
    if (hit && !out.rfn) out.rfn = { rfn: hit, src: s.name };
  }
  out.italSkipped = state.fx.italic && !out.jobs.some(j => j.italic) && out.jobs.length > 0;
  return out;
}
/* 预计用时：实测 Pyodide 里每 MB 源字体约 2 秒（Noto Sans JP 9.6 MB 一个字重约 20 秒）；CFF 轮廓要转换，按两倍算 */
function fxEstimate(pl) {
  let sec = 0, mb = 0;
  for (const j of pl.jobs) sec += 3 + j.srcs.reduce((a, s) => { const x = s && pl.srcs.get(s.key); return a + (x ? (x.size || 0) / 1e6 * (x.cff ? 4 : 2) : 0); }, 0);
  for (const s of pl.srcs.values()) if (s.kind === 'google' && !fx.sent.has(s.file)) mb += (s.size || 0) / 1e6;      // 已经交给 Worker 的不用再下载
  return { n: pl.jobs.length * (state.fx.woff2 ? 2 : 1), min: Math.max(1, Math.round(sec / 60)), mb: Math.round(mb + (fx.worker ? 0 : BK.runtimeMB)) };
}

/* ---------- 字体文件：左边的设置、右边的面板 ---------- */
const fx = { worker: null, sent: new Set(), running: false, agree: false, stage: '', pct: 0, t0: 0, tick: null, result: null, err: '', sig: '' };
const fxSig = pl => JSON.stringify([pl.fam, state.fx.woff2, pl.jobs.map(j => [j.W, j.italic, j.srcs.map(s => s && [s.key, s.weight, s.fvs]), j.plan.map(p => [p.size, p.range && p.range.length])]), state.classes, state.custom]);
const fmtMB = n => (n / 1e6).toFixed(n < 1e7 ? 1 : 0);
function renderFontFields() {
  $('#fxWeights').innerHTML = WEIGHTS.map(w => `<button type="button" data-w="${w}" aria-pressed="${state.fx.weights.includes(w)}" title="${esc(wTip(w))}"${wTag(w) ? ' class="wl"' : ''}>${w}${wTag(w)}</button>`).join('');
  $('#fxItalic').checked = state.fx.italic;
  $('#fxWoff2').checked = state.fx.woff2;
}
const fxLimits = () => `<div class="fx-sec fx-limits"><h3 class="fx-h">${esc(T('fxLimitsTitle'))}</h3><ul>${T('fxLimits').split('\n').map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
function renderFontTab() {
  const box = $('#fontPane');
  if (!CAN_BAKE) {
    box.innerHTML = `<p class="fx-intro">${esc(T('fxEmbedded'))}</p><p><a class="btn primary" id="fxPages" href="${esc(BK.pages)}" target="_blank" rel="noopener">${esc(T('fxOpenPages'))} ↗</a></p>${fxLimits()}`;
    cfgLink().then(u => { const a = $('#fxPages'); if (a) a.href = u; });
    return;
  }
  const pl = fxPlan(), est = fxEstimate(pl), rows = [];
  if (pl.needLocal && fxLocal.st === 'idle') fxLocalLoad(false);      // 已经授权过的话不用再点按钮
  for (const s of pl.srcs.values()) {
    const kind = T(s.kind === 'google' ? 'fxKindGoogle' : s.kind === 'file' ? 'fxKindFile' : 'fxKindLocal');
    const lic = s.err ? `<span class="fx-lic no">${esc(T('fxLicNo'))}</span>`
      : s.needLocal ? `<span class="fx-lic">${esc(T('fxLicLocked'))}</span>`
      : s.lic == null ? `<span class="fx-lic">${esc(T('fxLicReading'))}</span>`
      : s.lic === 'unknown' ? `<span class="fx-lic warn">${esc(T('fxLicUnknown'))}</span>`
      : `<span class="fx-lic ok">${esc(LIC_NAME[s.lic] || s.lic)}</span>`;
    const pct = [...s.pct].filter(x => x !== 100).map(x => x + '%');
    const meta = [kind, s.size ? fmtMB(s.size) + ' MB' : '', T('fxUsedFor', { list: [...s.owners].map(ownerName).join(T('joiner')) }) + (pct.length ? ' · ' + pct.join(' / ') : '')].filter(Boolean).join(' · ');
    const notes = [];
    if (s.err) notes.push([T('fxErr_' + s.err, { name: s.name }), 'no']);
    else if (!s.needLocal) {
      if (s.cff) notes.push([T('fxCffNote'), '']);
      if (s.kind === 'file' && s.static && s.ws.size > 1) notes.push([T('fxStaticNote'), '']);
    }
    rows.push(`<div class="fx-row"><span class="fx-name">${esc(s.name)}</span>${lic}<span class="fx-meta">${esc(meta)}</span>${notes.map(([t, c]) => `<span class="fx-note ${c}">${esc(t)}</span>`).join('')}</div>`);
  }
  /* 本机字体的授权、系统字体的许可提醒：各说一次，不在每一行重复 */
  const localAsk = pl.needLocal ? `<div class="fx-local"><p>${esc(T('fxLocalNeed'))}</p>${fxLocal.st === 'asking' || fxLocal.st === 'check' ? '' : `<button type="button" class="btn" id="fxLocalAsk">${esc(T('fxLocalAsk'))}</button>`}</div>` : '';
  const localWarn = [...pl.srcs.values()].some(s => s.kind === 'local' && s.lic === 'unknown') ? `<p class="fx-note">${esc(T('fxLocalNote'))}</p>` : '';
  const block = pl.block.size ? [T('fxBlockSrc')] : [];      // 各字体的原因写在上面那一行里，这里只说一句
  if (!pl.jobs.length) block.push(T('fxNoWeights'));
  if (pl.rfn) block.push(T('fxRfn', pl.rfn));
  const sig = fxSig(pl), res = fx.result, stale = res && fx.sig !== sig;
  const ready = !fx.running && pl.jobs.length && !block.length && !pl.loading && !pl.needLocal && (!pl.unknown || fx.agree);
  const summary = !pl.jobs.length ? '' : pl.needLocal ? T('fxSummaryLocal', est) : pl.loading ? T('fxSummaryWait', est) : T(est.mb ? 'fxSummary' : 'fxSummaryNoDl', est);
  box.innerHTML = `<p class="fx-intro">${esc(T('fxIntro'))}</p>
    <div class="fx-sec"><h3 class="fx-h">${esc(T('fxSources'))}</h3>${localAsk}<div class="fx-src">${rows.join('') || `<p class="hint">…</p>`}</div>
      ${pl.unknown ? `<div class="fx-agree">${localWarn}<label class="fx-chk"><input type="checkbox" id="fxAgree"${fx.agree ? ' checked' : ''}> ${esc(T('fxAgree'))}</label></div>` : ''}</div>
    ${block.length ? `<div class="fx-block">${block.map(b => `<p>${esc(b)}</p>`).join('')}</div>` : ''}
    <div class="fx-go">
      <button type="button" class="btn${fx.running || (res && !stale) ? '' : ' primary'}" id="fxGo"${fx.running || ready ? '' : ' disabled'}>${esc(T(fx.running ? 'fxStop' : 'fxGen'))}</button>
      <span class="fx-sum">${esc(summary)}${pl.jobs.length ? `<br><span class="fx-styles">${esc(pl.jobs.map(j => styleName(j.W, j.italic)).join(' · '))}</span>` : ''}${pl.italSkipped ? `<br>${esc(T('fxNoItal'))}` : ''}</span>
    </div>
    <div class="fx-run" id="fxRun"${fx.running || fx.err || res ? '' : ' hidden'}></div>
    ${fxLimits()}`;
  renderFxRun(stale);
}
function renderFxRun(stale) {
  const el = $('#fxRun'); if (!el) return;
  const s = fx.t0 ? Math.round(((fx.running ? performance.now() : fx.t1) - fx.t0) / 1000) : 0;
  if (fx.running) el.innerHTML = `<p>${esc(fx.stage)}</p><div class="fx-bar"><i style="width:${(fx.pct * 100).toFixed(1)}%"></i></div><p class="hint">${esc(T('fxElapsed', { s }))}</p>`;
  else if (fx.err) el.innerHTML = `<p class="fx-err">${esc(fx.err)}</p>`;
  else if (fx.result) {
    const r = fx.result;
    el.innerHTML = `<p>${esc(T('fxDone', { s }))}${stale ? ` <span class="fx-stale">${esc(T('fxStale'))}</span>` : ''}</p>
      <div class="fx-files">${r.files.map(([n, b]) => `<span>${esc(n)}</span><span>${fmtMB(b)} MB</span>`).join('')}</div>
      <p><button type="button" class="btn primary" id="fxSave">${esc(T('fxDownload', { mb: fmtMB(r.zip.size) }))}</button></p>`;
  }
}

/* ---------- 生成 ---------- */
async function fxFetch(url, onProgress) {
  let cache = null;
  try { cache = await caches.open('composite-font-src-v1'); const hit = await cache.match(url); if (hit) return await hit.arrayBuffer(); } catch (e) { cache = null; }
  const r = await fetch(url);
  if (!r.ok) throw Object.assign(new Error('http ' + r.status), { code: 'net' });
  const total = +r.headers.get('content-length') || 0, reader = r.body.getReader(), chunks = [];
  let got = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; onProgress(got, Math.max(total, got)); }
  const buf = await new Blob(chunks).arrayBuffer();
  try { if (cache) await cache.put(url, new Response(buf.slice(0))); } catch (e) { /* 缓存满了：下次重新下载 */ }
  return buf;
}
function fxStop(err) {
  if (fx.worker) { fx.worker.terminate(); fx.worker = null; fx.sent.clear(); }
  fx.abort?.(); fx.abort = null;      // 正在等 Worker 的 fxRun 结束掉
  fx.running = false; fx.t1 = performance.now(); clearInterval(fx.tick);
  fx.err = err || ''; renderFontTab();
}
async function fxRun() {
  const pl = fxPlan();
  if (!pl.jobs.length || pl.block.size || pl.rfn || pl.loading || pl.needLocal || (pl.unknown && !fx.agree)) return;
  Object.assign(fx, { running: true, err: '', result: null, pct: 0, t0: performance.now(), stage: T('fxStPrep'), sig: fxSig(pl) });
  fx.tick = setInterval(() => renderFxRun(), 1000);
  renderFontTab();
  const say = (stage, pct) => { fx.stage = stage; if (pct != null) fx.pct = pct; renderFxRun(); };
  try {
    /* 源字体：Google 的从 GitHub 下载，上传的复制一份（交给 Worker 的会被转移走） */
    const send = {}, transfer = [], need = [...pl.srcs.values()].filter(s => s.file && !fx.sent.has(s.file));
    for (const [i, s] of need.entries()) {
      let buf;
      if (s.kind === 'google') buf = await fxFetch(s.url, (got, total) => say(T('fxStFetch', { name: s.name, got: fmtMB(got), total: fmtMB(total) }), 0.15 * (i + got / total) / need.length));
      else if (s.kind === 'local') { say(T('fxStLocal', { name: s.name }), 0.15 * i / need.length); buf = await (await s.fd.blob()).arrayBuffer(); }
      else buf = files.get(s.fileId).buffer.slice(0);
      if (!fx.running) return;
      send[s.file] = buf; transfer.push(buf);
    }
    const jobs = pl.jobs.map(j => {
      const keep = j.plan.map((p, i) => i).filter(i => j.srcs[i]);      // 没有字体的规则（不会出现在 CSS 里）跳过
      return {
      weight: j.W, italic: j.italic, label: j.label,
      srcs: keep.map(i => j.srcs[i]).map(s => ({ file: s.file, name: s.name, weight: s.weight, fvs: s.fvs, ps: s.ps })),
      plan: keep.map(i => j.plan[i]).map(p => ({ font: { family: p.font.family || p.font.name || p.font.fileName || '', ital: !!p.font.ital }, size: p.size, range: p.range,
        owners: p.owners.map(o => ({ o, ranges: o === 'han' ? null : o[0] === '#' ? customRanges[+o.slice(1)] : EFF[o], shift: settingOf(o).shift || 0 })) })),
      };
    });
    const open = [...pl.srcs.values()].every(s => ['ofl', 'apache', 'ufl'].includes(s.lic));
    const opts = { family: pl.fam, woff2: state.fx.woff2, lic: open ? LIC_OFL : LIC_PRIVATE,
      extra: [[open ? 'OFL.txt' : 'LICENSES.txt', fxLicenseText(pl, open)], ['README.txt', fxReadme(pl)]] };
    if (!fx.worker) {
      const url = URL.createObjectURL(new Blob(['(' + bakeWorker.toString() + ')()'], { type: 'text/javascript' }));
      fx.worker = new Worker(url);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    const n = jobs.length, t0 = performance.now();
    const done = await new Promise((resolve, reject) => {
      fx.abort = () => reject(new Error('stopped'));
      fx.worker.onmessage = ({ data: m }) => {
        if (m.t === 'stage') say(T(m.k === 'brotli' ? 'fxStBrotli' : 'fxStRuntime'), 0.15);
        else if (m.t === 'job') say(T('fxStBake', { name: m.label, i: m.n + 1, n }), 0.15 + 0.8 * m.n / n);
        else if (m.t === 'zip') say(T('fxStZip'), 0.97);
        else if (m.t === 'done') resolve(m);
        else if (m.t === 'error') reject(Object.assign(new Error(m.msg || m.error), { code: m.error, name: m.name }));
      };
      fx.worker.onerror = e => reject(Object.assign(new Error(e.message || 'worker'), { code: 'internal' }));
      fx.worker.postMessage({ cfg: { pyodide: BK.pyodide, brotli: BK.brotli, wheels: [new URL(BK.wheel, location.href).href, BK.pages + BK.wheel], code: BAKE_PY },
        jobs, opts, files: send }, transfer);
    });
    need.forEach(s => fx.sent.add(s.file));
    fx.result = { files: done.files, zip: new Blob([done.zip], { type: 'application/zip' }), name: (pl.fam.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '') || 'composite-font') + '.zip', ms: performance.now() - t0 };
    fx.running = false; fx.t1 = performance.now(); clearInterval(fx.tick);
    renderFontTab();
  } catch (e) {
    if (!fx.running) return;      // 用户停止了
    const msg = e.code === 'cff' || e.code === 'outline' || e.code === 'read' ? T('fxErr_' + e.code, { name: e.name || '' })
      : e.code === 'ghLimit' ? T('fxErr_ghLimit') : e.code === 'net' ? T('fxErr_net') : T('fxErrRun', { msg: String(e.message || e).slice(-300) });
    fxStop(msg);
  }
}
function fxSave() {
  const r = fx.result; if (!r) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(r.zip); a.download = r.name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
/* zip 里的许可文件：全是开源字体时是 OFL.txt（附上各来源的许可全文），有许可不明的字体时是 LICENSES.txt */
function fxLicenseText(pl, open) {
  const parts = [open ? LIC_HEAD_OPEN : LIC_HEAD_PRIVATE, ''];
  for (const s of pl.srcs.values()) {
    parts.push('='.repeat(72), s.name, '='.repeat(72));
    if (s.licText) parts.push(s.licText);
    else if (s.meta) parts.push(...[s.meta.copyright, s.meta.license, s.meta.licenseUrl].filter(Boolean), s.lic === 'unknown' ? T('fxLicUserOk') : '');
    parts.push('');
  }
  return parts.join('\n');
}
function fxReadme(pl) {
  const j = pl.jobs[0];
  const lines = [T('fxRmHead', { fam: pl.fam }), '', T('fxRmFiles'), ...pl.jobs.map(x => '  ' + x.label), '', T('fxRmParts')];
  for (const p of j.plan) {
    const sh = [...new Set(p.owners.map(o => settingOf(o).shift || 0))].filter(Boolean);
    lines.push(`  ${p.owners.map(ownerName).join(T('joiner'))}: ${fontLabel(p.font)} ${p.size}%${sh.length ? ' · ' + T('fxRmShift', { v: sh.join('/') }) : ''}`);
  }
  lines.push('', T('fxRmNotes'), '', T('fxRmMade', { date: new Date().toISOString().slice(0, 10), url: BK.pages }), '');
  return lines.join('\n');
}

/* ---------- 从 artifact 带设置到 GitHub Pages：设置压缩后放在链接的 #cfg= 里 ---------- */
const b64u = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
async function cfgLink() {
  try {
    const z = await new Response(new Blob([JSON.stringify({ ...state, view: { ...state.view, text: state.view.text.slice(0, 2500) } })]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
    return BK.pages + '#cfg=' + b64u(new Uint8Array(z));
  } catch (e) { return BK.pages; }
}
async function importCfg() {
  const m = /^#cfg=([\w-]+)$/.exec(location.hash);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  try {
    const bin = atob(m[1].replace(/-/g, '+').replace(/_/g, '/')), bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    const s = JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text());
    if (!validState(s)) return;
    state = s;
    normalizeState(); refreshCustomRanges(); syncToolbar(); renderEditor(); renderPreview(); renderPresetCards(); rebuild(); saveState();
    toast(T('fxImported'));
    setExKind('font');
    $('#export').scrollIntoView({ block: 'start' });
  } catch (e) { /* 链接坏了：照常打开 */ }
}
function initFontTab() {
  $('#fxWeights').addEventListener('click', e => {
    const b = e.target.closest('[data-w]'); if (!b) return;
    const w = +b.dataset.w, ws = state.fx.weights;
    state.fx.weights = ws.includes(w) ? ws.filter(x => x !== w) : [...ws, w].sort((x, y) => x - y);
    renderFontFields(); renderFontTab(); saveState();
  });
  $('#fxItalic').addEventListener('change', e => { state.fx.italic = e.target.checked; renderFontTab(); saveState(); });
  $('#fxWoff2').addEventListener('change', e => { state.fx.woff2 = e.target.checked; renderFontTab(); saveState(); });
  $('#fontPane').addEventListener('change', e => { if (e.target.id === 'fxAgree') { fx.agree = e.target.checked; renderFontTab(); } });
  $('#fontPane').addEventListener('click', e => {
    const id = e.target.closest('button')?.id;
    if (id === 'fxGo') { if (fx.running) fxStop(); else fxRun(); }
    else if (id === 'fxSave') fxSave();
    else if (id === 'fxLocalAsk') fxLocalLoad(true);
  });
  importCfg();
}

/* ---------- Worker：Pyodide + fontTools。整个函数转成字符串在 Worker 里运行，不能用外面的变量 ---------- */
function bakeWorker() {
  let py = null, brotli = false;
  onmessage = async ({ data: m }) => {
    try {
      if (!py) {
        postMessage({ t: 'stage', k: 'runtime' });
        importScripts(m.cfg.pyodide + 'pyodide.js');
        py = await loadPyodide({ indexURL: m.cfg.pyodide });
        let whl = null;
        for (const u of m.cfg.wheels) { try { const r = await fetch(u); if (r.ok) { whl = await r.arrayBuffer(); break; } } catch (e) { /* 试下一个地址 */ } }
        if (!whl) throw Object.assign(new Error('fontTools'), { code: 'net' });
        py.FS.writeFile('/tmp/ft.whl', new Uint8Array(whl));
        py.runPython("import zipfile; zipfile.ZipFile('/tmp/ft.whl').extractall('/lib/python3.12/site-packages')");
        py.FS.mkdirTree('/src'); py.FS.mkdirTree('/w');
        py.runPython(m.cfg.code);
      }
      if (!brotli && (m.opts.woff2 || Object.keys(m.files).some(n => /\.woff2$/i.test(n)))) { postMessage({ t: 'stage', k: 'brotli' }); await py.loadPackage(m.cfg.brotli); brotli = true; }
      for (const [name, buf] of Object.entries(m.files)) py.FS.writeFile('/src/' + name, new Uint8Array(buf));
      const run = py.globals.get('run_all');
      const res = JSON.parse(run(JSON.stringify(m.jobs), JSON.stringify(m.opts), (n, label) => postMessage({ t: n < 0 ? 'zip' : 'job', n, label })));
      run.destroy();
      if (res.error) { postMessage({ t: 'error', error: res.error, name: res.name, msg: res.msg }); return; }
      const zip = py.FS.readFile('/w/out.zip').slice().buffer;
      py.FS.unlink('/w/out.zip');
      postMessage({ t: 'done', zip, files: res.files }, [zip]);
    } catch (e) {
      postMessage({ t: 'error', error: e.code || 'internal', msg: String((e && e.message) || e).slice(-600) });
    }
  };
}

/* ---------- Python：烘焙的核心（和本地验证用的 bake_core.py 相同，加上批量生成和打包） ---------- */
const BAKE_PY = String.raw`
import os, re, io, json, copy, time, zipfile
from fontTools.ttLib import TTFont, TTCollection, newTable
from fontTools import subset
from fontTools.merge import Merger, Options as MergeOptions
from fontTools.ttLib.scaleUpem import scale_upem
from fontTools.varLib import instancer

STYLE = {100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black'}

class BakeError(Exception):
    def __init__(self, code, name=''):
        super().__init__(code); self.code = code; self.name = name

def is_ttc(path):
    with open(path, 'rb') as fh: return fh.read(4) == b'ttcf'

def open_face(path, ps=None, lazy=False):
    """字体集合（TTC/OTC）按 PostScript 名取其中一款，没有名字或找不到时取第一款"""
    if not is_ttc(path): return TTFont(path, lazy=lazy)
    for i in range(len(TTCollection(path, lazy=True).fonts)):
        if ps and TTFont(path, fontNumber=i, lazy=True)['name'].getDebugName(6) == ps:
            return TTFont(path, fontNumber=i, lazy=lazy)
    return TTFont(path, fontNumber=0, lazy=lazy)

def check_source(path, name, ps=None):
    try:
        tags = set(open_face(path, ps, lazy=True).keys())
    except Exception:
        raise BakeError('read', name)
    if not tags & {'glyf', 'CFF ', 'CFF2'}:
        raise BakeError('outline', name)      # 只有位图（例如 emoji）的字体

def instance_file(path, weight, fvs, out, ps=None):
    """可变字体截到这个字重（其他轴取 fvs 里的值，没有的取默认值）；字体集合取出其中一款；普通静态字体原样返回"""
    f = open_face(path, ps)
    if 'fvar' in f:
        loc = {}
        for a in f['fvar'].axes:
            v = weight if a.axisTag == 'wght' and weight else (fvs or {}).get(a.axisTag)
            loc[a.axisTag] = None if v is None else min(a.maxValue, max(a.minValue, v))
        instancer.instantiateVariableFont(f, loc, inplace=True, updateFontNames=False)
    elif not is_ttc(path):
        return path
    f.save(out)
    return out

def cff_to_glyf(f):
    """CFF 轮廓（三次曲线）转成 TrueType（二次曲线），误差不超过 1 个单位。
    竖排原点：CFF 字体用 VORG 表记，TrueType 由 vmtx 的上边距和字形顶边算出，所以按 VORG 重算上边距"""
    from fontTools.pens.cu2quPen import Cu2QuPen
    from fontTools.pens.ttGlyphPen import TTGlyphPen
    order, gs = f.getGlyphOrder(), f.getGlyphSet()
    glyphs = {}
    for gn in order:
        pen = TTGlyphPen(gs)
        gs[gn].draw(Cu2QuPen(pen, max_err=1.0, reverse_direction=True))
        glyphs[gn] = pen.glyph()
    glyf = newTable('glyf'); glyf.glyphOrder = order; glyf.glyphs = glyphs
    vorg = f['VORG'] if 'VORG' in f else None
    for t in ('CFF ', 'CFF2', 'VORG'):
        if t in f: del f[t]
    f['glyf'] = glyf; f['loca'] = newTable('loca')
    hm = f['hmtx']
    for gn in order:
        g = glyphs[gn]; g.recalcBounds(glyf)
        hm[gn] = (hm[gn][0], g.xMin if g.numberOfContours else 0)
    if vorg is not None and 'vmtx' in f:      # 没有 VORG 时，原点本来就由上边距和字形顶边算出，不用改
        vm = f['vmtx']
        for gn in order:
            g = glyphs[gn]
            if g.numberOfContours: vm[gn] = (vm[gn][0], vorg.VOriginRecords.get(gn, vorg.defaultVertOriginY) - g.yMax)
    maxp = newTable('maxp'); maxp.tableVersion = 0x00010000; maxp.numGlyphs = len(order)
    for k in ('maxZones', 'maxTwilightPoints', 'maxStorage', 'maxFunctionDefs', 'maxInstructionDefs', 'maxStackElements', 'maxSizeOfInstructions', 'maxComponentElements', 'maxPoints', 'maxContours', 'maxCompositePoints', 'maxCompositeContours', 'maxComponentDepth'):
        setattr(maxp, k, 1 if k == 'maxZones' else 0)
    f['maxp'] = maxp
    post = f['post']; post.formatType = 2.0; post.extraNames = []; post.mapping = {}
    f.sfntVersion = '\x00\x01\x00\x00'

def align_scripts(fonts):
    """合并前让每个部件的 GSUB / GPOS 都有所有部件出现过的书写系统和语言。
    lang=ja 时数字、标点跟着前后的汉字算 hani；西文字体只在 DFLT / latn 下有字距，合并后有了 hani 就不再退回 DFLT，
    西文的字距、连字会全部失效。这里按 HarfBuzz 的退回规则预先补齐"""
    from fontTools.ttLib.tables import otTables as ot
    for tag in ('GSUB', 'GPOS'):
        tabs = [f[tag].table for f in fonts if tag in f and f[tag].table.ScriptList]
        want = {}
        for t in tabs:
            for sr in t.ScriptList.ScriptRecord:
                want.setdefault(sr.ScriptTag, set()).update(l.LangSysTag for l in sr.Script.LangSysRecord)
        for t in tabs:
            have = {sr.ScriptTag: sr.Script for sr in t.ScriptList.ScriptRecord}
            fb = (have.get('DFLT') or have.get('latn') or next(iter(have.values()))).DefaultLangSys
            for st, langs in want.items():
                sc = have.get(st)
                if sc is None:
                    sc = ot.Script(); sc.DefaultLangSys = copy.deepcopy(fb); sc.LangSysRecord = []; sc.LangSysCount = 0
                    rec = ot.ScriptRecord(); rec.ScriptTag = st; rec.Script = sc
                    t.ScriptList.ScriptRecord.append(rec); have[st] = sc
                dflt = sc.DefaultLangSys or fb
                got = {l.LangSysTag for l in sc.LangSysRecord}
                for lt in sorted(langs - got):
                    lr = ot.LangSysRecord(); lr.LangSysTag = lt; lr.LangSys = copy.deepcopy(dflt)
                    sc.LangSysRecord.append(lr)
                sc.LangSysRecord.sort(key=lambda l: l.LangSysTag); sc.LangSysCount = len(sc.LangSysRecord)
            t.ScriptList.ScriptRecord.sort(key=lambda r: r.ScriptTag); t.ScriptList.ScriptCount = len(t.ScriptList.ScriptRecord)

def in_ranges(rs, cp):
    return any(a <= cp <= b for a, b in rs)

def bake(plan, srcs, family, weight, italic, lic, work):
    """plan：规则表（第一条是汉字基础字体）；srcs：和 plan 同序、已截到字重的源字体路径。返回 (TTFont, PostScript 名)"""
    cmaps = [TTFont(p, lazy=True).getBestCmap() for p in srcs]
    U = TTFont(srcs[0], lazy=True)['head'].unitsPerEm      # 以汉字基础字体的 em 为准
    owners = [o for r in plan for o in r['owners']]
    custom = [o for o in owners if o['o'].startswith('#')][::-1]
    cls = [o for o in owners if not o['o'].startswith('#') and o['o'] != 'han']
    han_shift = next((o['shift'] for o in owners if o['o'] == 'han'), 0)
    def shift_of(cp):
        for o in custom + cls:
            if o['ranges'] and in_ranges(o['ranges'], cp): return o['shift']
        return han_shift
    # 每个字符归哪条规则：和 CSS 一样，后面的规则优先；它的字体里没有这个字就往前退，最后退到基础字体
    seg = {}
    for cp in sorted(set().union(*[set(c) for c in cmaps])):
        for i in range(len(plan) - 1, -1, -1):
            if (i == 0 or in_ranges(plan[i]['range'] or [], cp)) and cp in cmaps[i]:
                seg.setdefault((i, shift_of(cp)), []).append(cp); break
    top = TTFont(srcs[0], lazy=True)['OS/2'].sTypoAscender
    parts = []
    for (i, s), cps in sorted(seg.items()):
        f = TTFont(srcs[i])
        o = subset.Options()
        o.layout_features = ['*']; o.layout_scripts = ['*']
        o.name_IDs = ['*']; o.name_languages = ['*']; o.name_legacy = True
        o.notdef_outline = True; o.glyph_names = True; o.hinting = False; o.legacy_kern = True
        o.drop_tables += ['STAT', 'DSIG', 'meta', 'MVAR', 'HVAR', 'VVAR', 'BASE', 'JSTF', 'COLR', 'CPAL', 'SVG ', 'sbix', 'CBDT', 'CBLC', 'EBDT', 'EBLC', 'EBSC']      # 彩色、位图字形合并不了，只留轮廓
        sub = subset.Subsetter(o); sub.populate(unicodes=cps); sub.subset(f)
        if 'glyf' not in f: cff_to_glyf(f)      # 只转这个部件用到的字形：比整个字体转换快得多
        src_upem = f['head'].unitsPerEm
        k = plan[i]['size'] / 100 * U / src_upem
        if abs(k - 1) > 1e-6:
            scale_upem(f, round(src_upem * k))      # 坐标 × k
            f['head'].unitsPerEm = U                # 再把 em 改回来：字形相对 em 放大（缩小）了 k 倍
        dy = round(s / 100 * U)
        glyf = f['glyf']
        if dy:
            for gn in f.getGlyphOrder():
                g = glyf[gn]
                if g.numberOfContours > 0: g.coordinates.translate((0, dy)); g.recalcBounds(glyf)
            for gn in f.getGlyphOrder():
                g = glyf[gn]
                if g.isComposite(): g.recalcBounds(glyf)
        if 'vmtx' not in f:      # 竖排度量：没有 vmtx 的（西文）补一份，竖排原点放在基础字体的 ascender
            vm = newTable('vmtx'); vm.metrics = {}
            for gn in f.getGlyphOrder():
                g = glyf[gn]
                vm.metrics[gn] = (U, top - g.yMax if g.numberOfContours else 0)
            f['vmtx'] = vm
            vh = newTable('vhea')
            vh.tableVersion = 0x00011000; vh.ascent = U // 2; vh.descent = -(U // 2); vh.lineGap = 0
            vh.advanceHeightMax = U; vh.minTopSideBearing = vh.minBottomSideBearing = vh.yMaxExtent = 0
            vh.caretSlopeRise = 0; vh.caretSlopeRun = 1; vh.caretOffset = 0
            vh.reserved1 = vh.reserved2 = vh.reserved3 = vh.reserved4 = 0; vh.metricDataFormat = 0; vh.numberOfVMetrics = 0
            f['vhea'] = vh
        elif dy:
            vm = f['vmtx']
            for gn, (ah, tsb) in list(vm.metrics.items()):
                if glyf[gn].numberOfContours: vm.metrics[gn] = (ah, tsb - dy)
        parts.append((os.path.join(work, 'part%d_%s.ttf' % (i, s)), f))
    align_scripts([f for _, f in parts])
    for p, f in parts: f.save(p)
    parts = [p for p, _ in parts]
    font = Merger(options=MergeOptions()).merge(parts)
    for p in parts: os.remove(p)
    base = TTFont(srcs[0])
    bk = plan[0]['size'] / 100
    for t, fields in (('hhea', ['ascent', 'descent', 'lineGap']), ('OS/2', ['sTypoAscender', 'sTypoDescender', 'sTypoLineGap', 'usWinAscent', 'usWinDescent']),
                      ('vhea', ['ascent', 'descent', 'lineGap'])):
        if t in base and t in font:
            for fd in fields: setattr(font[t], fd, round(getattr(base[t], fd) * bk))
    font['OS/2'].fsSelection = (font['OS/2'].fsSelection & ~(1 << 7)) | (base['OS/2'].fsSelection & (1 << 7))
    font['post'].underlinePosition = base['post'].underlinePosition; font['post'].underlineThickness = base['post'].underlineThickness
    if 'BASE' in base: font['BASE'] = base['BASE']      # 表意字框等基线：取汉字基础字体的
    W, it = weight, italic
    style = (('' if W == 400 else STYLE[W] + ' ') + 'Italic') if it else STYLE[W]
    font['OS/2'].usWeightClass = W
    bold = W == 700
    font['OS/2'].fsSelection = (font['OS/2'].fsSelection & ~0b1100001) | (0b100000 if bold else 0) | (1 if it else 0) | (0b1000000 if not bold and not it else 0)
    font['head'].macStyle = (1 if bold else 0) | (2 if it else 0)
    font['post'].italicAngle = 0
    if it:      # 斜体角度取西文斜体的（汉字仍是正体）
        for p in srcs[1:]:
            a = TTFont(p, lazy=True)['post'].italicAngle
            if a: font['post'].italicAngle = a; break
    font['OS/2'].recalcUnicodeRanges(font)
    if hasattr(font['OS/2'], 'recalcAvgCharWidth'): font['OS/2'].recalcAvgCharWidth(font)
    fam = family
    if W in (400, 700): legacy_fam, legacy_sub = fam, ('Bold' if bold else 'Regular') if not it else ('Bold Italic' if bold else 'Italic')
    else: legacy_fam, legacy_sub = fam + ' ' + STYLE[W], 'Italic' if it else 'Regular'
    ps = (re.sub(r'[^A-Za-z0-9]', '', fam)[:40] or 'CompositeFont') + '-' + style.replace(' ', '')
    srcnames = [TTFont(p, lazy=True)['name'] for p in srcs]
    copyright = ' / '.join(dict.fromkeys(n.getDebugName(0) for n in srcnames if n.getDebugName(0)))
    name = newTable('name'); name.names = []
    vals = {0: copyright, 1: legacy_fam, 2: legacy_sub, 3: ps + ';' + time.strftime('%Y%m%d'), 4: fam + ' ' + style, 5: 'Version 1.000',
            6: ps, 13: lic[0], 14: lic[1], 16: fam, 17: style}
    for nid, val in vals.items():
        if not val: continue
        name.setName(val, nid, 3, 1, 0x409)
        try:
            val.encode('mac_roman'); name.setName(val, nid, 1, 0, 0)
        except UnicodeEncodeError:
            pass      # 中日文名字只写 Windows 平台的名称记录
    font['name'] = name
    font['head'].fontRevision = 1.0
    return font, ps

def run_all(jobs_json, opts_json, progress):
    try:
        jobs = json.loads(jobs_json); opts = json.loads(opts_json)
        SRC, WORK = opts.get('src', '/src/'), opts.get('work', '/w/')      # 本地测试时换成临时目录
        for s in {s['file']: s for j in jobs for s in j['srcs'] if s}.values():
            check_source(SRC + s['file'], s['name'], s.get('ps'))
        key = lambda s: (s['file'], s.get('ps'), s.get('weight'), json.dumps(s.get('fvs'), sort_keys=True))
        inst, made = {}, 0
        zb = open(WORK + 'out.zip', 'wb'); z = zipfile.ZipFile(zb, 'w', zipfile.ZIP_DEFLATED)
        out = []
        for n, job in enumerate(jobs):
            progress(n, job['label'])
            srcs = []
            for s in job['srcs']:
                k = key(s)
                if k not in inst:
                    made += 1
                    inst[k] = instance_file(SRC + s['file'], s.get('weight'), s.get('fvs'), WORK + 'inst%d.ttf' % made, s.get('ps'))
                srcs.append(inst[k])
            font, ps = bake(job['plan'], srcs, opts['family'], job['weight'], job['italic'], opts['lic'], WORK)
            b = io.BytesIO(); font.save(b); data = b.getvalue()
            z.writestr(ps + '.ttf', data); out.append([ps + '.ttf', len(data)])
            if opts.get('woff2'):
                font.flavor = 'woff2'; b = io.BytesIO(); font.save(b); data = b.getvalue()
                z.writestr(ps + '.woff2', data); out.append([ps + '.woff2', len(data)])
            del font
            rest = {key(s) for j in jobs[n + 1:] for s in j['srcs'] if s}      # 后面用不到的截取结果：删掉，省内存
            for k in list(inst):
                if k not in rest:
                    if inst[k].startswith(WORK): os.remove(inst[k])
                    del inst[k]
        progress(-1, '')
        for name, text in opts['extra']: z.writestr(name, text)
        z.close(); zb.close()
        return json.dumps({'files': out})
    except BakeError as e:
        return json.dumps({'error': e.code, 'name': e.name})
    except Exception as e:
        import traceback
        return json.dumps({'error': 'internal', 'msg': traceback.format_exc()[-600:]})
`;
