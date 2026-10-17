import { refresh } from './refresh.js';
import { $, T, esc, lsGet } from './i18n.js';
import { EFF } from './unicode.js';
import { GF_AXES } from './gfmeta.js';
import { G, WEIGHTS, axisOf, buildPlan, customRanges, files, fontKey, fontLabel, normalizeState, setState, settingOf, state, validState } from './core.js';
import { wTag, wTip } from './render.js';
import { cssFamilyName, exKind, ownerName, setExKind, showExport } from './export.js';
import { toast } from './ui.js';
/* ================= 导出 · 字体文件 =================
   把合成字体做成真正的字体文件（TTF，可选 WOFF2）：每个字重、正斜体各一个，打包成 zip。
   做法和导出的 CSS 一一对应：同一张规则表（buildPlan），每条规则的字体只取它负责的字，按 size-adjust 缩放、
   按基线偏移上下平移，再合并成一个字体；行高度量用汉字基础字体的。
   在 Web Worker 里跑 Pyodide（浏览器里的 Python）+ fontTools，源字体由页面下载后交给 Worker：
   - Google Fonts：google/fonts 仓库里的完整文件（网页接口给的切片去掉了大部分 OpenType 特性）
   - 上传的字体：直接用文件内容
   artifact 等嵌入页面不能下载外部文件，改为打开 GitHub Pages 版，并在链接里带上当前设置 */
export const BK = {
  pyodide: 'https://cdn.jsdelivr.net/npm/pyodide@0.27.7/',
  brotli: 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/brotli-1.1.0-cp312-cp312-pyodide_2024_0_wasm32.whl',
  wheel: 'assets/py/fonttools-4.60.2-py3-none-any.whl',      // PyPI 不允许网页跨域下载，放在仓库里由 GitHub Pages 提供
  core: 'assets/py/bake_core.py',      // 烘焙的 Python 代码
  pages: 'https://charlie5188.github.io/css-composite-font/',
  raw: 'https://raw.githubusercontent.com/google/fonts/main/',
  api: 'https://api.github.com/repos/google/fonts/contents/',
  runtimeMB: 15,      // Pyodide + fontTools，第一次要下载的大小
};
export const CAN_BAKE = window.top === window.self;      // 和「下载文件」按钮同一个判断：嵌入的框架里浏览器会拦截下载
export const STY = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };
export const styleName = (W, ital) => ital ? (W === 400 ? 'Italic' : `${STY[W]} Italic`) : STY[W];
export const LIC_NAME = { ofl: 'OFL', apache: 'Apache 2.0', ufl: 'UFL' };
/* 写进字体和 zip 的许可说明用英文：字体的元数据、许可文件一般都是英文 */
export const LIC_OFL = ['This Font Software is licensed under the SIL Open Font License, Version 1.1.', 'https://openfontlicense.org'];
export const LIC_PRIVATE = ['Contains fonts used under their own licenses. Private use only; do not redistribute.', ''];
export const LIC_HEAD_OPEN = 'This font combines the fonts listed below. All of them are under the SIL Open Font License 1.1 or a compatible open license, and this font is licensed under the SIL Open Font License 1.1. Their copyright notices and license texts follow.';
export const LIC_HEAD_PRIVATE = 'This font combines the fonts listed below. Some of them are not under an open license; whoever made this font confirmed they have the right to modify and combine them. Do not redistribute this font.';

/* ---------- Google Fonts 的源文件：google/fonts 仓库里的完整文件 ----------
   先按仓库的命名规则直接猜文件名（可变字体：字体族去空格[轴,…].ttf，轴名按 ASCII 排序；静态字体：字体族去空格-Regular.ttf 等），
   用 HEAD 请求确认存在；猜不到才用 GitHub API 列目录。API 每个 IP 每小时只能用 60 次，公司网络里很多人共用一个出口，很快会用完 */
export const gfDirs = new Map();      // 字体族 -> { st: 'loading' | 'ok' | 'err', lic, slug, names: [[文件名, 大小]], text, rfn }
export const gfUrl = (lic, slug, name) => BK.raw + lic + '/' + slug + '/' + encodeURIComponent(name);
export async function gfGuess(family, slug) {
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
export async function gfList(slug) {
  for (const lic of ['ofl', 'apache', 'ufl']) {
    const r = await fetch(BK.api + lic + '/' + slug);
    if (r.status === 404) continue;
    if (!r.ok) throw Object.assign(new Error('gh'), { code: r.status === 403 || r.status === 429 ? 'ghLimit' : 'net' });
    const names = (await r.json()).map(x => [x.name, x.size]), lf = names.find(([n]) => /^(OFL|LICENSE|LICENCE|UFL)\.txt$/i.test(n));
    return { lic, names, text: lf ? await (await fetch(gfUrl(lic, slug, lf[0]))).text() : '' };
  }
  throw Object.assign(new Error('gf'), { code: 'gfNone' });
}
export function gfInfo(family) {
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
export function gfPick(names, weight, ital) {
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
export function rfnOf(text) {
  const out = new Set();
  for (const m of (text || '').matchAll(/Reserved Font Names?\s*((?:[“"'‘][^“”"'‘’\n]+[”"'’][\s,&]*(?:and\s*)?)+)/gi))
    for (const q of m[1].matchAll(/[“"'‘]([^“”"'‘’\n]+)[”"'’]/g)) out.add(q[1].trim());
  return [...out];
}

/* ---------- 上传的字体、本机字体：读 name / OS/2 表，判断许可和轮廓 ---------- */
export const fileMetas = new Map();      // fileId -> 结果；读取中为 null
export function fileMeta(id, fl) {
  if (fileMetas.has(id)) return fileMetas.get(id);
  fileMetas.set(id, null);
  readFontMeta(fl.buffer).then(m => { fileMetas.set(id, m); if (exKind === 'font') renderFontTab(); });
  return null;
}
/* ps：字体集合（TTC）里要用的那一款的 PostScript 名；不给就看第一款 */
export async function readFontMeta(buf, ps) {
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
    /* 只认得出开源许可；其他一律算许可不明，不按厂商区别对待（系统字体、商用字体的许可大多都不允许修改），由用户确认 */
    m.lic = /open font licen[cs]e|\bOFL\b|scripts\.sil\.org\/OFL|openfontlicense/i.test(all) ? 'ofl'
      : /apache licen[cs]e|apache\.org\/licenses/i.test(all) ? 'apache'
      : /ubuntu font licen[cs]e/i.test(all) ? 'ufl' : 'unknown';
    m.rfn = rfnOf(m.copyright + '\n' + m.license);
  } catch (e) { /* 读不懂：许可不明 */ }
  return m;
}
export function nameRecs(d) {
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
export const fxLocal = { st: 'idle', map: new Map(), metas: new Map() };      // st：idle 没查过 / check 查权限中 / need 要用户授权 / asking / ok / denied
export async function fxLocalLoad(ask) {
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
export const localFind = f => [f.name, ...(f.alt || [])].map(n => fxLocal.map.get(n)).find(Boolean) || null;
export function localMeta(fd) {
  const k = fd.postscriptName;
  if (fxLocal.metas.has(k)) return fxLocal.metas.get(k);
  fxLocal.metas.set(k, null);
  fd.blob().then(b => b.arrayBuffer()).then(buf => readFontMeta(buf, k)).then(m => { fxLocal.metas.set(k, m); if (exKind === 'font') renderFontTab(); });
  return null;
}

/* ---------- 要生成哪些文件，各用哪些源字体 ---------- */
export function fxPlan() {
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
          err: m && !m.woff2 && !m.outline ? 'outline' : null };
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
          err: m && !m.outline ? 'outline' : null };
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
export function fxEstimate(pl) {
  let sec = 0, mb = 0;
  for (const j of pl.jobs) {
    const mb = j.srcs.reduce((a, s) => { const x = s && pl.srcs.get(s.key); return a + (x ? (x.size || 0) / 1e6 : 0); }, 0);
    sec += 3 + j.srcs.reduce((a, s) => { const x = s && pl.srcs.get(s.key); return a + (x ? (x.size || 0) / 1e6 * (x.cff ? 4 : 2) : 0); }, 0) + (state.fx.otf ? mb * 2 : 0);
  }
  for (const s of pl.srcs.values()) if (s.kind === 'google' && !fx.sent.has(s.file)) mb += (s.size || 0) / 1e6;      // 已经交给 Worker 的不用再下载
  return { n: pl.jobs.length * (state.fx.ttf + state.fx.woff2 + state.fx.otf), min: Math.max(1, Math.round(sec / 60)), mb: Math.round(mb + (fx.worker ? 0 : BK.runtimeMB)) };
}

/* ---------- 字体文件：左边的设置、右边的面板 ---------- */
export const fx = { worker: null, sent: new Set(), running: false, agree: false, stage: '', pct: 0, t0: 0, tick: null, result: null, err: '', sig: '' };
export const fxSig = pl => JSON.stringify([pl.fam, state.fx.ttf, state.fx.woff2, state.fx.otf, pl.jobs.map(j => [j.W, j.italic, j.srcs.map(s => s && [s.key, s.weight, s.fvs]), j.plan.map(p => [p.size, p.range && p.range.length])]), state.classes, state.custom]);
export const fmtMB = n => (n / 1e6).toFixed(n < 1e7 ? 1 : 0);
export function renderFontFields() {
  $('#fxWeights').innerHTML = WEIGHTS.map(w => `<button type="button" data-w="${w}" aria-pressed="${state.fx.weights.includes(w)}" title="${esc(wTip(w))}"${wTag(w) ? ' class="wl"' : ''}>${w}${wTag(w)}</button>`).join('');
  $('#fxItalic').checked = state.fx.italic;
  $('#fxTtf').checked = state.fx.ttf;
  $('#fxWoff2').checked = state.fx.woff2;
  $('#fxOtf').checked = state.fx.otf;
}
export const fxLimits = () => `<div class="fx-sec fx-limits"><h3 class="label">${esc(T('fxLimitsTitle'))}</h3><ul>${T('fxLimits').split('\n').map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
export function renderFontTab() {
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
      if (s.lic === 'unknown') {      // 有许可说明就摘许可说明，没有就摘版权声明
        const cut = x => { x = (x || '').replace(/\s+/g, ' ').trim(); return x.length > 160 ? x.slice(0, 160) + '…' : x; };
        const lt = cut(s.meta?.license), ct = cut(s.meta?.copyright);
        notes.push([lt ? T('fxLicText', { t: lt }) : ct ? T('fxLicCopy', { t: ct }) : T('fxLicNone'), 'lic']);
      }
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
  box.innerHTML = `<div class="fx-sec"><h3 class="label">${esc(T('fxSources'))}</h3>${localAsk}<div class="fx-src">${rows.join('') || `<p class="hint">…</p>`}</div>
      ${pl.unknown ? `<div class="callout fx-agree">${localWarn}<label class="fx-chk"><input type="checkbox" id="fxAgree"${fx.agree ? ' checked' : ''}> ${esc(T('fxAgree'))}</label></div>` : ''}</div>
    ${block.length ? `<div class="callout fx-block">${block.map(b => `<p>${esc(b)}</p>`).join('')}</div>` : ''}
    <div class="fx-go">
      <button type="button" class="btn${fx.running || (res && !stale) ? '' : ' primary'}" id="fxGo"${fx.running || ready ? '' : ' disabled'}>${esc(T(fx.running ? 'fxStop' : 'fxGen'))}</button>
      <span class="fx-sum">${esc(summary)}${pl.jobs.length ? `<br><span class="fx-styles">${esc(pl.jobs.map(j => styleName(j.W, j.italic)).join(' · '))}</span>` : ''}${pl.italSkipped ? `<br>${esc(T('fxNoItal'))}` : ''}</span>
    </div>
    <div class="fx-run" id="fxRun"${fx.running || fx.err || res ? '' : ' hidden'}></div>
    ${fxLimits()}`;
  renderFxRun(stale);
}
/* 字形超过上限、删减了字形变体或罕用汉字时的说明（和 README 里写的一样） */
export function fxTrimText(t) {
  const names = OT_LANG_NAMES();
  return T('fxTrimHead') + (t.langs?.length ? T('fxTrimLangs', { langs: t.langs.map(x => names[x] || x).join(T('joiner')) }) : '') + (t.rare ? T('fxTrimRare', { n: t.rare }) : '');
}
export function renderFxRun(stale) {
  const tb = $('#exToggle');      // 对话框关着也看得到：顶栏「导出」按钮的底边是进度条
  tb.classList.toggle('running', fx.running); tb.style.setProperty('--pct', (fx.pct * 100).toFixed(1) + '%');
  const el = $('#fxRun'); if (!el) return;
  const s = fx.t0 ? Math.round(((fx.running ? performance.now() : fx.t1) - fx.t0) / 1000) : 0;
  if (fx.running) el.innerHTML = `<p>${esc(fx.stage)}</p><div class="fx-bar"><i style="width:${(fx.pct * 100).toFixed(1)}%"></i></div><p class="hint">${esc(T('fxElapsed', { s }))}</p>`;
  else if (fx.err) el.innerHTML = `<p class="fx-err">${esc(fx.err)}</p>`;
  else if (fx.result) {
    const r = fx.result;
    el.innerHTML = `<p>${esc(T('fxDone', { s }))}${stale ? ` <span class="fx-stale">${esc(T('fxStale'))}</span>` : ''}</p>
      <div class="fx-files">${r.files.map(([n, b]) => `<span>${esc(n)}</span><span>${fmtMB(b)} MB</span>`).join('')}</div>
      ${r.trimmed ? `<p class="callout fx-note-trim">${esc(fxTrimText(r.trimmed))}</p>` : ''}
      <p><button type="button" class="btn primary" id="fxSave">${esc(T('fxDownload', { mb: fmtMB(r.zip.size) }))}</button></p>`;
  }
}

/* ---------- 生成 ---------- */
export async function fxFetch(url, onProgress) {
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
export function fxStop(err) {
  if (fx.worker) { fx.worker.terminate(); fx.worker = null; fx.sent.clear(); }
  fx.abort?.(); fx.abort = null;      // 正在等 Worker 的 fxRun 结束掉
  fx.running = false; fx.t1 = performance.now(); clearInterval(fx.tick);
  fx.err = err || ''; renderFontTab();
}
/* 语言 → OpenType 语言标签（字体里各地区字形变体按它切换） */
export const otLang = l => /^ja/.test(l) ? 'JAN ' : /^ko/.test(l) ? 'KOR ' : /^zh-(Hant-)?(HK|MO)/.test(l) ? 'ZHH ' : /^zh-(Hant|TW)/.test(l) ? 'ZHT ' : /^zh/.test(l) ? 'ZHS ' : null;
export const OT_LANG_NAMES = () => Object.fromEntries(T('fxLangNames').split(',').map(x => x.split('=')));
export async function fxRun() {
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
    const opts = { family: pl.fam, ttf: state.fx.ttf, woff2: state.fx.woff2, otf: state.fx.otf, lic: open ? LIC_OFL : LIC_PRIVATE,
      extra: [[open ? 'OFL.txt' : 'LICENSES.txt', fxLicenseText(pl, open)], ['README.txt', fxReadme(pl)]],
      otLang: otLang(state.scope || state.typo.lang),      // 字形超过上限时只留这个语言的字形变体
      notes: { head: T('fxTrimHead'), langs: T('fxTrimLangs'), rare: T('fxTrimRare'), names: OT_LANG_NAMES(), sep: T('joiner') } };
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
        else if (m.t === 'otf') say(T('fxStOtf', { name: m.label, i: m.n + 1, n }), 0.15 + 0.8 * (m.n + 0.5) / n);
        else if (m.t === 'zip') say(T('fxStZip'), 0.97);
        else if (m.t === 'done') resolve(m);
        else if (m.t === 'error') reject(Object.assign(new Error(m.msg || m.error), { code: m.error, name: m.name }));
      };
      fx.worker.onerror = e => reject(Object.assign(new Error(e.message || 'worker'), { code: 'internal' }));
      fx.worker.postMessage({ cfg: { pyodide: BK.pyodide, brotli: BK.brotli, wheels: [new URL(BK.wheel, location.href).href, BK.pages + BK.wheel], core: [new URL(BK.core, location.href).href, BK.pages + BK.core] },
        jobs, opts, files: send }, transfer);
    });
    need.forEach(s => fx.sent.add(s.file));
    fx.result = { files: done.files, trimmed: done.trimmed, zip: new Blob([done.zip], { type: 'application/zip' }), name: (pl.fam.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '') || 'composite-font') + '.zip', ms: performance.now() - t0 };
    fx.running = false; fx.t1 = performance.now(); clearInterval(fx.tick);
    if (!$('#exDlg').open) $('#exToggle').classList.add('ready');      // 做好的时候对话框关着：按钮上亮一个点
    renderFontTab();
  } catch (e) {
    if (!fx.running) return;      // 用户停止了
    const msg = e.code === 'cff' || e.code === 'outline' || e.code === 'read' || e.code === 'glyphs' ? T('fxErr_' + e.code, { name: e.name || '' })
      : e.code === 'ghLimit' ? T('fxErr_ghLimit') : e.code === 'net' ? T('fxErr_net') : T('fxErrRun', { msg: String(e.message || e).slice(-300) });
    fxStop(msg);
  }
}
export function fxSave() {
  const r = fx.result; if (!r) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(r.zip); a.download = r.name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
/* zip 里的许可文件：全是开源字体时是 OFL.txt（附上各来源的许可全文），有许可不明的字体时是 LICENSES.txt */
export function fxLicenseText(pl, open) {
  const parts = [open ? LIC_HEAD_OPEN : LIC_HEAD_PRIVATE, ''];
  for (const s of pl.srcs.values()) {
    parts.push('='.repeat(72), s.name, '='.repeat(72));
    if (s.licText) parts.push(s.licText);
    else if (s.meta) parts.push(...[s.meta.copyright, s.meta.license, s.meta.licenseUrl].filter(Boolean), s.lic === 'unknown' ? T('fxLicUserOk') : '');
    parts.push('');
  }
  return parts.join('\n');
}
export function fxReadme(pl) {
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
export const b64u = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
export async function cfgLink() {
  try {
    const z = await new Response(new Blob([JSON.stringify({ ...state, view: { ...state.view, text: state.view.text.slice(0, 2500) } })]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
    return BK.pages + '#cfg=' + b64u(new Uint8Array(z));
  } catch (e) { return BK.pages; }
}
export async function importCfg() {
  const m = /^#cfg=([\w-]+)$/.exec(location.hash);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  try {
    const bin = atob(m[1].replace(/-/g, '+').replace(/_/g, '/')), bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    const s = JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text());
    if (!validState(s)) return;
    setState(s);
    normalizeState(); refresh('ranges', 'toolbar', 'editor', 'preview', 'presets', 'fonts');
    toast(T('fxImported'));
    setExKind('font'); showExport();
  } catch (e) { /* 链接坏了：照常打开 */ }
}
export function initFontTab() {
  $('#fxWeights').addEventListener('click', e => {
    const b = e.target.closest('[data-w]'); if (!b) return;
    const w = +b.dataset.w, ws = state.fx.weights;
    state.fx.weights = ws.includes(w) ? ws.filter(x => x !== w) : [...ws, w].sort((x, y) => x - y);
    refresh('fxFields', 'fx');
  });
  $('#fxItalic').addEventListener('change', e => { state.fx.italic = e.target.checked; refresh('fx'); });
  // 三种格式各自独立，但至少要留一种：取消最后一个时不让取消
  for (const [id, k] of [['#fxTtf', 'ttf'], ['#fxWoff2', 'woff2'], ['#fxOtf', 'otf']]) $(id).addEventListener('change', e => {
    if (!e.target.checked && ['ttf', 'woff2', 'otf'].every(x => x === k || !state.fx[x])) { e.target.checked = true; return; }
    state.fx[k] = e.target.checked; refresh('fx');
  });
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
export function bakeWorker() {
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
        let code = null;      // 每次都向服务器确认有没有新版本（no-cache 仍会用缓存，只是先验证）
        for (const u of m.cfg.core) { try { const r = await fetch(u, { cache: 'no-cache' }); if (r.ok) { code = await r.text(); break; } } catch (e) { /* 试下一个地址 */ } }
        if (!code) throw Object.assign(new Error('bake_core.py'), { code: 'net' });
        py.runPython(code);
      }
      if (!brotli && (m.opts.woff2 || Object.keys(m.files).some(n => /\.woff2$/i.test(n)))) { postMessage({ t: 'stage', k: 'brotli' }); await py.loadPackage(m.cfg.brotli); brotli = true; }
      for (const [name, buf] of Object.entries(m.files)) py.FS.writeFile('/src/' + name, new Uint8Array(buf));
      const run = py.globals.get('run_all');
      const res = JSON.parse(run(JSON.stringify(m.jobs), JSON.stringify(m.opts), (n, label) => postMessage({ t: n < 0 ? 'zip' : n % 1 ? 'otf' : 'job', n: Math.floor(n), label })));
      run.destroy();
      if (res.error) { postMessage({ t: 'error', error: res.error, name: res.name, msg: res.msg }); return; }
      const zip = py.FS.readFile('/w/out.zip').slice().buffer;
      py.FS.unlink('/w/out.zip');
      postMessage({ t: 'done', zip, files: res.files, trimmed: res.trimmed }, [zip]);
    } catch (e) {
      postMessage({ t: 'error', error: e.code || 'internal', msg: String((e && e.message) || e).slice(-600) });
    }
  };
}
