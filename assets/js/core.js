import { $, T, UI, debounce, lsGet, lsSet, root, sleep, tr } from './i18n.js';
import { CLASSES, EFF, classOf, fmtRanges, inRanges, intersect, parseChars, parseRanges, rebuildClassRanges, union } from './unicode.js';
import { AXIS_NAMES, GF_AXES, GF_ITALIC, GF_STYLE, GF_WEIGHTS } from './gfmeta.js';
import { checkMissSoon, drawSpecimen, fitGlyphs, refreshVAutospace, renderChipsStatus, renderEditor } from './render.js';
import { renderExport, renderExportSoon } from './export.js';
import { localData, renderPresetCardsSoon } from './ui.js';
/* ================= Font sources ================= */
export const G = (family, weight = 400) => ({ kind: 'google', family, weight });
export const L = (name, alt = []) => ({ kind: 'local', name, alt });
/* Google Fonts object: ital = italic file; xa = other axes to retain (for example opsz, wdth); vf = full weight axis. */
export function fontKey(f) {
  if (!f) return 'none';
  if (f.kind === 'google') return `g:${f.family}@${f.vf ? 'vf' : f.weight}${f.ital ? 'i' : ''}${f.xa?.length ? '+' + f.xa.join(',') : ''}`;
  return f.kind === 'local' ? `l:${f.name}` : f.kind === 'path' ? `p:${f.path}` : `f:${f.fileId}`;
}
export const sameFont = (a, b) => fontKey(a) === fontKey(b);
export const fontLabel = f => !f ? T('unset') : f.kind === 'google' ? `${f.family}${f.ital ? ' Italic' : ''} ${f.vf ? 'VF' : sources.get(fontKey(f))?.actualWeight || f.weight}` : (f.kind === 'local' ? f.name : f.kind === 'path' ? f.path : f.fileName) + (f.axis ? ` ${f.weight || 400}` : '');
export const kindLabel = f => !f ? '' : f.kind === 'google' ? T('kindGoogle') : f.kind === 'local' ? T('kindLocal') : T('kindFile');
export const localSrc = f => [...new Set([f.name, ...(f.alt || [])])].map(n => `local("${n.replace(/["\\]/g, '\\$&')}")`).join(', ');

export const LOCAL_COMMON = [
  ['PingFang SC Regular', 'PingFangSC-Regular', 'macOS'], ['PingFang TC Regular', 'PingFangTC-Regular', 'macOS'],
  ['Hiragino Sans GB W3', 'HiraginoSansGB-W3', 'macOS'], ['Hiragino Sans W3', 'HiraginoSans-W3', 'macOS'],
  ['Hiragino Mincho ProN W3', 'HiraMinProN-W3', 'macOS'], ['Songti SC Regular', 'STSongti-SC-Regular', 'macOS'],
  ['Apple SD Gothic Neo Regular', 'AppleSDGothicNeo-Regular', 'macOS'],
  ['Helvetica Neue', 'HelveticaNeue', 'macOS'], ['Avenir Next Regular', 'AvenirNext-Regular', 'macOS'],
  ['Baskerville', 'Baskerville', 'macOS'], ['Didot', 'Didot', 'macOS'], ['Optima Regular', 'Optima-Regular', 'macOS'],
  ['Palatino', 'Palatino-Roman', 'macOS'], ['Futura Medium', 'Futura-Medium', 'macOS'], ['Hoefler Text', 'HoeflerText-Regular', 'macOS'],
  ['Iowan Old Style Roman', 'IowanOldStyle-Roman', 'macOS'], ['Charter Roman', 'Charter-Roman', 'macOS'], ['Menlo Regular', 'Menlo-Regular', 'macOS'],
  ['Microsoft YaHei', 'MicrosoftYaHei', 'Windows'], ['SimSun', 'SimSun', 'Windows'], ['Microsoft JhengHei', 'MicrosoftJhengHeiRegular', 'Windows'],
  ['Yu Gothic Regular', 'YuGothic-Regular', 'Windows'], ['Yu Mincho Regular', 'YuMincho-Regular', 'Windows'], ['Meiryo', 'Meiryo', 'Windows'],
  ['Malgun Gothic', 'MalgunGothic', 'Windows'], ['Segoe UI', 'SegoeUI', 'Windows'], ['Cambria', 'Cambria', 'Windows'], ['Calibri', 'Calibri', 'Windows'],
  ['Georgia', 'Georgia', ''], ['Times New Roman', 'TimesNewRomanPSMT', ''], ['Arial', 'ArialMT', ''],
];
export const localAlt = new Map(LOCAL_COMMON.map(([n, ps]) => [n, ps]));
export const GF_LIST = ['Noto Sans SC', 'Noto Serif SC', 'Noto Sans TC', 'Noto Serif TC', 'Noto Sans HK', 'Noto Sans JP', 'Noto Serif JP', 'Noto Sans KR', 'Noto Serif KR',
  'LXGW WenKai TC', 'Shippori Mincho', 'Zen Old Mincho', 'Zen Kaku Gothic New', 'Zen Maru Gothic', 'BIZ UDPGothic', 'BIZ UDPMincho', 'M PLUS 2', 'Klee One',
  'ZCOOL XiaoWei', 'Ma Shan Zheng', 'Inter', 'IBM Plex Sans', 'IBM Plex Serif', 'Source Sans 3', 'Source Serif 4', 'EB Garamond', 'Cormorant Garamond',
  'Libre Caslon Text', 'Libre Baskerville', 'Crimson Pro', 'Lora', 'Newsreader', 'Literata', 'Spectral', 'Fraunces', 'Playfair Display', 'DM Sans',
  'Work Sans', 'Manrope', 'Instrument Sans', 'Instrument Serif', 'Roboto', 'Roboto Serif', 'Lato', 'Open Sans', 'Montserrat', 'Jost', 'JetBrains Mono', 'IBM Plex Mono'];

export const files = new Map();          // fileId -> {name, buffer}
export const sources = new Map();        // fontKey -> {status, faces, family, error, promise}
export let srcSeq = 0;

export function source(f, { retry = false } = {}) {
  const key = fontKey(f);
  let s = sources.get(key);
  if (s && retry && s.status === 'error' && f.kind !== 'file') { sources.delete(key); s = null; }
  if (!s) {
    s = { key, font: f, status: 'loading', faces: [], family: `__cf_src_${++srcSeq}`, error: '' };
    sources.set(key, s);
    s.promise = loadSource(s);
  }
  return s;
}
export class SrcError extends Error { constructor(key, params) { super(key); this.key = key; this.params = params; } }
export async function loadSource(s) {
  const f = s.font;
  try {
    if (!f) throw new SrcError('errUnset');
    if (f.kind === 'google') {
      let css = null;
      if (f.vf) {               // Continuous weight mode: load the full variable file and let the element's font-weight control weight.
        const axis = await vfAxis(f.family);
        if (axis) { try { css = await fetchGoogleCss(f.family, gfSpec(f, `${axis[0]}..${axis[1]}`)); s.axis = axis; } catch (e) { /* Fall back to static. */ } }
      } else if (f.weight % 100) {     // Only variable fonts support non-hundred weights; request the axis range to obtain the complete variable file.
        const axis = await vfAxis(f.family);
        if (axis) {
          try { css = await fetchGoogleCss(f.family, gfSpec(f, `${axis[0]}..${axis[1]}`)); s.wght = clampW(f.weight, axis); s.actualWeight = s.wght; s.axis = axis; } catch (e) { /* Fall back to a static weight. */ }
        }
      }
      if (!css) for (const w of weightChain(Math.round(f.weight / 100) * 100)) {    // If this weight is unavailable, search toward 400 for the nearest one.
        try { css = await fetchGoogleCss(f.family, gfSpec(f, w)); s.actualWeight = w; break; } catch (e) { /* Try the next weight. */ }
      }
      if (!css) throw new SrcError('errGoogle', { family: f.family + (f.ital ? ' Italic' : ''), weight: f.weight });
      s.faces = parseFontFaceCss(css);
      if (!s.faces.length) throw new SrcError('errGoogleEmpty');
    } else if (f.kind === 'local') {
      s.faces = [{ src: localSrc(f), range: null }];
    } else {
      const file = f.kind === 'file' && files.get(f.fileId);
      if (!file) throw new SrcError('errFileGone');
      s.faces = [{ buffer: file.buffer, range: null }];
    }
    const vs = s.wght ? { variationSettings: `"wght" ${s.wght}` } : f.axis && !f.cont ? { variationSettings: `"wght" ${f.weight || 400}` } : {};
    const ffs = s.faces.map(fc => new FontFace(s.family, fc.buffer || fc.src, fc.range ? { unicodeRange: fmtRanges(fc.range), display: 'swap', ...vs } : { display: 'swap', ...vs }));
    ffs.forEach(x => document.fonts.add(x));
    if (f.kind !== 'google') {
      try { await ffs[0].load(); }
      catch (e) {
        const record = f.kind === 'local' && localData.get(f.name);
        if (!record) throw new SrcError(f.kind === 'local' ? 'errLocal' : 'errFileBad');
        // Some installed faces are enumerable but cannot be addressed through CSS local().
        document.fonts.delete(ffs[0]);
        const buffer = await (await record.blob()).arrayBuffer();
        const face = new FontFace(s.family, buffer, { display: 'swap', ...vs });
        await face.load(); document.fonts.add(face); s.faces[0].buffer = buffer;
      }
    }
    s.status = 'ok';
  } catch (e) {
    s.status = 'error';
    s.errKey = e instanceof SrcError ? e.key : 'errLoad';
    s.errParams = e instanceof SrcError ? e.params : null;
  }
  onSourcesChanged();
}
export const srcError = s => T(s.errKey || 'errLoad', s.errParams);
/* CSS2 axis syntax, for example 'ital,opsz,wght@1,8..144,400': lowercase registered axes precede uppercase custom axes; sort each group alphabetically.
   Google pins omitted axes to their defaults and removes them from the file. */
export function gfSpec(f, wght) {
  const parts = [['wght', String(wght)]];
  if (f.ital) parts.push(['ital', '1']);
  for (const t of f.xa || []) { const a = axisOf(f, t); if (a) parts.push([t, `${a[1]}..${a[2]}`]); }
  const lower = t => t === t.toLowerCase();
  parts.sort(([a], [b]) => lower(a) !== lower(b) ? (lower(a) ? -1 : 1) : a < b ? -1 : 1);
  return parts.map(x => x[0]).join(',') + '@' + parts.map(x => x[1]).join(',');
}
export async function fetchGoogleCss(family, spec) {
  const fam = encodeURIComponent(family.trim()).replace(/%20/g, '+'), sp = String(spec).includes('@') ? spec : `wght@${spec}`;
  const urls = [`https://fonts.googleapis.com/css2?family=${fam}:${sp}&display=swap`];
  if (sp === 'wght@400') urls.push(`https://fonts.googleapis.com/css2?family=${fam}&display=swap`);
  for (const url of urls) {
    try { const r = await fetch(url); if (r.ok) return await r.text(); continue; }
    catch (e) { /* CSP may block fetch; try reading through a <link> instead. */ }
    try { return await cssViaLink(url); } catch (e) { /* Next URL. */ }
  }
  throw new SrcError('errGoogle', { family, weight: spec });
}
/* ================= Variable fonts ================= */
export const clampW = (w, axis) => Math.min(axis[1], Math.max(axis[0], Math.round(w)));
/* Google Fonts returns 200 only for ranges within the font's wght axis. Try 100..900 first, then probe individual values for the bounds. Cache results in the browser. */
export const LS_VF = 'composite-font:vf';
export const vfCache = lsGet(LS_VF) || {}, vfPending = new Map();
export const gfOk = (family, spec) => fetchGoogleCss(family, spec).then(() => true, () => false);
/* Use bundled metadata's wght range for known families, without network probing. */
export const seedVf = family => { const a = axisOf({ kind: 'google', family }, 'wght'); vfCache[family] = a ? [a[1], a[2]] : 0; };
export function vfAxis(family) {
  if (!(family in vfCache) && GF_AXES[family]) seedVf(family);
  if (family in vfCache) return Promise.resolve(vfCache[family] || null);
  if (!vfPending.has(family)) vfPending.set(family, (async () => {
    let axis = null;
    if (await gfOk(family, '100..900')) axis = [100, 900];
    else {
      const pts = [100, 200, 300, 400, 500, 600, 700, 800];
      const lo = await Promise.all(pts.map(w => gfOk(family, `${w}..${w + 1}`)));
      const min = pts.find((w, i) => lo[i]);
      if (min) {
        const ups = [200, 300, 400, 500, 600, 700, 800, 900].filter(w => w > min);
        const hi = await Promise.all(ups.map(w => gfOk(family, `${w - 1}..${w}`)));
        axis = [min, ups.filter((w, i) => hi[i]).pop() || min + 1];
      }
    }
    vfCache[family] = axis || 0; lsSet(LS_VF, vfCache);
    onSourcesChanged();
    return axis;
  })());
  return vfPending.get(family);
}
/* Synchronous lookup: return [min, max] or null when known; otherwise return undefined and probe in the background. */
export function vfAxisNow(f) {
  if (!f) return null;
  if (f.kind !== 'google') return f.axis || null;
  if (!(f.family in vfCache) && GF_AXES[f.family]) seedVf(f.family);
  if (f.family in vfCache) return vfCache[f.family] || null;
  vfAxis(f.family);
  return undefined;
}
/* The rule's font-weight always stays at the target step so the composite remains consistent; use font-variation-settings to fine-tune actual weight. */
/* ================= Other variation axes and italics ================= */
/* Variation axes: [[tag, minimum, maximum, default], ...]. Use bundled metadata for Google Fonts and read fvar for uploaded/local fonts. */
export const gfAxesMemo = new Map();
export function axesOf(f) {
  if (!f) return [];
  if (f.kind !== 'google') return f.axes || (f.axis ? [['wght', f.axis[0], f.axis[1], 400]] : []);
  if (!gfAxesMemo.has(f.family)) gfAxesMemo.set(f.family, (GF_AXES[f.family] || '').split(',').filter(Boolean).map(a => { const [t, ...n] = a.split(' '); return [t, ...n.map(Number)]; }));
  return gfAxesMemo.get(f.family);
}
export const axisOf = (f, tag) => axesOf(f).find(a => a[0] === tag);
export const extraAxes = f => axesOf(f).filter(a => !(a[0] === 'wght' && a[2] > 10) && a[0] !== 'ital');     // Weight and italics have dedicated settings.
export const AX_LABEL = { wdth: { zh: '宽度', ja: '幅', tw: '寬度', en: 'Width' }, opsz: { zh: '光学尺寸', ja: 'オプティカルサイズ', tw: '光學尺寸', en: 'Optical size' }, slnt: { zh: '倾斜', ja: '傾き', tw: '傾斜', en: 'Slant' }, GRAD: { zh: '笔画粗细', ja: 'グレード', tw: '筆畫粗細', en: 'Grade' } };
export const axisLabel = t => AX_LABEL[t] ? tr(AX_LABEL[t]) : AXIS_NAMES[t] || t;
/* Resolve the italic font: use true Google/uploaded italics, or the slnt / ital axis in variable fonts.
   Probe local fonts for a corresponding Italic name. Return null when unavailable, keeping this class upright in italic text. */
export function italOf(f) {
  if (!f) return null;
  if (f.kind === 'google' && f.ital) return f;
  if (f.kind === 'google' && GF_ITALIC.has(f.family)) return { ...f, ital: 1 };
  if (f.kind === 'file' && f.italic) return { kind: 'file', ...f.italic, weight: f.weight };
  if (f.kind === 'path' && f.italPath) return { kind: 'path', path: f.italPath };
  if (f.kind === 'local') { const n = italicLocal(f); if (n) return L(n); }
  const sl = axisOf(f, 'slnt'), it = axisOf(f, 'ital');
  if (sl && sl[1] < 0) return { ...f, slant: 'slnt' };
  if (it && it[2] >= 1) return { ...f, slant: 'ital' };
  return null;
}
export const italNames = new Map();       // Local font name -> italic name; null = unavailable, undefined = checking.
export function italicLocal(f) {
  if (italNames.has(f.name)) return italNames.get(f.name);
  italNames.set(f.name, undefined);
  const cands = [];
  for (const n of [f.name, ...(f.alt || [])]) {
    if (/ Regular$/.test(n)) cands.push(n.replace(/ Regular$/, ' Italic'));
    if (/-Regular$/.test(n)) cands.push(n.replace(/-Regular$/, '-Italic'));
    cands.push(/\s/.test(n) ? n + ' Italic' : /-/.test(n) ? n + 'Italic' : n + '-Italic');     // Helvetica Neue Bold Italic / HelveticaNeue-BoldItalic
  }
  (async () => {
    for (const n of new Set(cands)) if (await localExists(n)) { italNames.set(f.name, n); weightNamesChanged(); return; }
    italNames.set(f.name, null);
  })();
  return undefined;
}
/* Font + class axis settings -> the font used in rules and fixed font-variation-settings values.
   vary: { tag: number | 'auto' }; 'auto' is only for opsz (follow font size). */
export function finalFont(f, vary, ital = false) {
  if (!f) return { font: f, fvs: null, up: false };
  let up = false;
  if (ital) { const it = italOf(f); if (it) f = it; else up = true; }
  const xa = new Set(), fvs = {};
  for (const [t, v] of Object.entries(vary || {})) {
    const a = axisOf(f, t);
    if (!a || (t === 'wght' && a[2] > 10) || t === 'ital') continue;
    xa.add(t);
    if (v !== 'auto') fvs[t] = Math.min(a[2], Math.max(a[1], +v));
  }
  if (f.slant === 'slnt') { xa.add('slnt'); fvs.slnt = axisOf(f, 'slnt')[1]; }
  if (f.slant === 'ital') fvs.ital = 1;
  if (f.kind === 'google' && xa.size) f = { ...f, xa: [...xa].sort() };
  return { font: f, fvs: Object.keys(fvs).length ? fvs : null, up };
}
/* The actual loaded font, including retained axes: use this for loading status rather than the class's original font. */
export const usedFont = r => finalFont(r.font, r.vary).font;
export const fvsKey = fvs => fvs ? Object.entries(fvs).sort().map(([t, v]) => `${t}=${v}`).join(',') : '';
/* Rule font-variation-settings: fine-tuned weight (omitted in continuous mode) plus fixed axis values. */
export function fvsOf(p, W, cont) {
  const parts = [], wv = cont ? null : wghtFor(p.font, W);
  if (wv) parts.push(`"wght" ${wv}`);
  for (const [t, v] of Object.entries(p.fvs || {}).sort()) parts.push(`"${t}" ${v}`);
  return parts.join(', ');
}
export function wghtFor(f, W) {
  if (!f) return null;
  const w = f.kind === 'google' ? sources.get(fontKey(f))?.wght : f.axis ? (f.weight || 400) : null;
  return w && w !== W ? w : null;
}
/* Uploaded font fvar axes: [[tag, minimum, maximum, default], ...]. Read TTF/OTF directly; decompress WOFF tables with zlib.
   Browsers cannot decode WOFF2's Brotli data here. Detect fvar presence only, assume wght 100-900 and mark other axes unknown. */
export function readFvar(v, off) {
  const axesOff = v.getUint16(off + 4), count = v.getUint16(off + 8), size = v.getUint16(off + 10), out = [];
  for (let a = 0; a < count; a++) {
    const q = off + axesOff + a * size, fx = o => Math.round(v.getInt32(q + o) / 655.36) / 100;
    out.push([String.fromCharCode(v.getUint8(q), v.getUint8(q + 1), v.getUint8(q + 2), v.getUint8(q + 3)), fx(4), fx(12), fx(8)]);
  }
  return out;
}
export async function fileAxes(buf) {
  try {
    const v = new DataView(buf);
    let sig = v.getUint32(0), base = 0;
    if (sig === 0x74746366) { base = v.getUint32(12); sig = v.getUint32(base); }      // 'ttcf' collection: read the first font.
    if (sig === 0x774F4632) {           // wOF2
      const n = v.getUint16(12);
      let p = 48;
      for (let i = 0; i < n; i++) {
        const flags = v.getUint8(p++), idx = flags & 63;
        let tag = null;
        if (idx === 63) { tag = v.getUint32(p); p += 4; }
        if (idx === 47 || tag === 0x66766172) return { axes: [['wght', 100, 900, 400]], unknown: true };
        const readBase128 = () => { let x = 0; for (let k = 0; k < 5; k++) { const c = v.getUint8(p++); x = (x << 7) | (c & 127); if (!(c & 128)) break; } return x; };
        readBase128();
        const t = (flags >> 6) & 3;
        if (((idx === 10 || idx === 11) && t === 0) || (!(idx === 10 || idx === 11) && t !== 0)) readBase128();
      }
      return null;
    }
    if (sig === 0x774F4646) {           // wOFF
      const n = v.getUint16(12);
      for (let i = 0; i < n; i++) {
        const r = 44 + i * 20;
        if (v.getUint32(r) !== 0x66766172) continue;
        const off = v.getUint32(r + 4), comp = v.getUint32(r + 8), orig = v.getUint32(r + 12);
        let tb = buf.slice(off, off + comp);
        if (comp < orig) tb = await new Response(new Blob([tb]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();
        return { axes: readFvar(new DataView(tb), 0) };
      }
      return null;
    }
    const n = v.getUint16(base + 4);
    for (let i = 0; i < n; i++) {
      const r = base + 12 + i * 16;
      if (v.getUint32(r) === 0x66766172) return { axes: readFvar(v, v.getUint32(r + 8)) };     // 'fvar'
    }
  } catch (e) { /* Treat unreadable data as a regular font. */ }
  return null;
}
/* Read one font table as a DataView: TTF/OTF/TTC (first face) directly, WOFF after decompression. Return null for WOFF2's unsupported Brotli data. */
export async function sfntTable(buf, want) {
  const v = new DataView(buf);
  let sig = v.getUint32(0), base = 0;
  if (sig === 0x74746366) { base = v.getUint32(12); sig = v.getUint32(base); }      // 'ttcf'
  if (sig === 0x774F4632) return null;      // wOF2
  if (sig === 0x774F4646) {      // wOFF
    for (let i = 0, n = v.getUint16(12); i < n; i++) {
      const r = 44 + i * 20; if (v.getUint32(r) !== want) continue;
      const off = v.getUint32(r + 4), comp = v.getUint32(r + 8), orig = v.getUint32(r + 12);
      let tb = buf.slice(off, off + comp);
      if (comp < orig) tb = await new Response(new Blob([tb]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();
      return new DataView(tb);
    }
    return null;
  }
  for (let i = 0, n = v.getUint16(base + 4); i < n; i++) {
    const r = base + 12 + i * 16;
    if (v.getUint32(r) === want) return new DataView(buf, v.getUint32(r + 8), v.getUint32(r + 12));
  }
  return null;
}
/* Font-declared style (OS/2): prefer IBM sFamilyClass, then PANOSE.
   serif = Song/Ming-style, sans = Hei/Gothic-style, other = decorative, handwriting or symbols. Return null if undeclared, as in many CJK fonts. */
export function os2Style(t) {
  if (!t || t.byteLength < 42) return null;
  const cls = t.getInt16(30) >> 8, fam = t.getUint8(32), ser = t.getUint8(33);
  if ([1, 2, 3, 4, 5, 7].includes(cls)) return 'serif';
  if (cls === 8) return 'sans';
  if ([9, 10, 12].includes(cls)) return 'other';
  if (fam === 3 || fam === 4 || fam === 5) return 'other';      // PANOSE: handwriting, decorative or symbol fonts.
  if (fam === 2) return ser >= 11 && ser <= 15 ? 'sans' : ser >= 2 ? 'serif' : null;      // Latin text faces: values 11-15 are sans-serif styles.
  return null;
}
export async function fileStyle(buf) { try { return os2Style(await sfntTable(buf, 0x4F532F32)); } catch (e) { return null; } }      // 'OS/2'
// Prefer a face's declared weight over its style name once its file has been read.
export async function fileWeight(buf) {
  try { const table = await sfntTable(buf, 0x4F532F32), weight = table && table.byteLength >= 6 ? table.getUint16(4) : 0; return weight >= 1 && weight <= 1000 ? weight : null; }
  catch (error) { return null; }
}
/* Classify serif, sans or other from uploaded/local OS/2 data, then Google Fonts metadata, then the font name. */
const SERIF_RE = /Serif|Mincho|Ming|Song|Batang|Myeongjo|明|宋/i, SANS_RE = /Sans|Gothic|Hei|Kaku|PingFang|YaHei|Meiryo|Dotum|Gulim|Maru|Yuan|Rounded|M PLUS|黑|圆|圓|ゴシック/i;
let gfStyleMap = null;
export function styleOfFont(f) {
  if (!f) return 'other';
  if (f.cls) return f.cls;
  if (f.kind === 'google') {
    gfStyleMap ||= new Map(Object.entries(GF_STYLE).flatMap(([k, v]) => v.split(',').map(n => [n, k])));
    const st = gfStyleMap.get(f.family); if (st) return st;
  }
  const n = f.family || f.name || f.fileName || '';
  return SERIF_RE.test(n) ? 'serif' : SANS_RE.test(n) ? 'sans' : 'other';
}
/* Store detected axes on the font object; keep wght separately as axis (the weight range). */
export function setFontAxes(f, fa, W) {
  delete f.axis; delete f.axes; delete f.axesUnknown;
  if (!fa) return f;
  f.axes = fa.axes; if (fa.unknown) f.axesUnknown = true;
  const w = fa.axes.find(a => a[0] === 'wght' && a[2] > 10);      // Treat non-CSS wght scales, such as Skia's 0.48-3.2, as ordinary variation axes.
  if (w) { f.axis = [w[1], w[2]]; f.weight = clampW(W || f.weight || 400, f.axis); }
  return f;
}
export function weightChain(w) { const out = [w]; for (let x = w; x !== 400;) { x += x > 400 ? -100 : 100; out.push(x); } return out; }
export function cssViaLink(url) {
  return new Promise((res, rej) => {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.crossOrigin = 'anonymous'; l.href = url; l.media = 'print';
    l.onload = () => { try { const css = [...l.sheet.cssRules].map(r => r.cssText).join('\n'); l.remove(); res(css); } catch (e) { l.remove(); rej(e); } };
    l.onerror = () => { l.remove(); rej(new Error('load')); };
    document.head.append(l);
  });
}
export function parseFontFaceCss(css) {
  const faces = [], re = /@font-face\s*{([^}]*)}/g; let m;
  while ((m = re.exec(css))) {
    const src = /src:\s*([^;]+);?/.exec(m[1]);
    const ur = /unicode-range:\s*([^;]+);?/.exec(m[1]);
    if (src) faces.push({ src: src[1].trim(), range: ur ? parseRanges(ur[1]) : null });
  }
  return faces;
}

/* ================= Samples, properties and presets ================= */
export const SAMPLES = {
  /* Use natural Chinese and Japanese body copy, with brands, products, abbreviations and units that occur in everyday text (iPhone, 5G, UI, km).
   Include tight combinations of dates, percentages, parentheses, abbreviations and nested quotation marks to exercise mixed-script spacing and line breaks. */
  zh: { label: { zh: '简体', ja: '簡体', tw: '簡體', en: 'Simplified' }, lang: 'zh-Hans', text:
`清晨6点半，第一班地铁驶出西直门站。车厢里人还不多，有人戴着AirPods听播客，有人用iPhone回复微信消息。这条线路全长27.6公里，共有19座车站，工作日客流量超过80万人次。

2026年，北京独立咖啡馆的数量增长了12.5%（GMV同比增长约20%），不少店开始用人工智能（AI）排班和订货。车站旁新开的这家只卖三样：美式18元，拿铁22元，换燕麦奶加3元，也可以在App上提前下单。营业时间写在门口的小黑板上——工作日7:30开门，周末晚半小时；Wi-Fi密码贴在收银台旁边。

店主林晓以前在一家SaaS公司做UI设计。她说：“开业第一个月卖出了4000多杯（比预想的多了一半）。来的大多是熟客……慢一点也没关系。”` },
  ja: { label: { zh: '日文', ja: '日本語', tw: '日文', en: 'Japanese' }, lang: 'ja', text:
`朝6時半、始発の電車が駅を出る。車内はまだ空いていて、AirPodsでポッドキャストを聴く人や、iPhoneでLINEを返す人がいる。この路線は全長27.6km、駅は19か所。平日には1日80万人以上が利用する。

2026年、都内の個人経営カフェは前年比12.5%増（新規開業は約1,200店）。人工知能（AI）で発注やシフトを組む店も増えている。駅前のこの店のメニューは3つだけで、ドリップコーヒーが450円、カフェラテが520円、オーツミルクへの変更は＋50円。営業時間は平日7:30〜19:00、Wi-Fiのパスワードはレジの横に貼ってある。

店主の林さんは以前、SaaS企業でUIデザイナーをしていた。「開店から1か月で4,000杯以上（予想の1.5倍）が売れました。来てくれるのは、ほとんど常連さんです」と話す。` },
  /* Taiwan and Hong Kong versions use regional wording: corner-bracket quotes and Taiwan AI/revenue terms, versus Cantonese characters and $ prices in Hong Kong. */
  tw: { label: { zh: '繁体TW', ja: '繁体TW', tw: '繁體TW', en: 'Traditional (TW)' }, lang: 'zh-Hant-TW', text:
`早上6點半，第一班捷運從終點站開出。車廂裡人還不多，有人戴著AirPods聽Podcast，有人用iPhone回LINE訊息。這條路線全長27.6公里，共有19個車站，平日運量超過80萬人次。

2026年，台北獨立咖啡店的數量成長了12.5%（營收年增約20%），不少店家開始用人工智慧（AI）排班和叫貨。車站旁新開的這家只賣三樣：美式70元、拿鐵90元，換燕麥奶加15元，也可以用App預先點餐。營業時間寫在門口的小黑板上——平日7:30開門，週末晚半小時；Wi-Fi密碼貼在櫃檯旁邊。

店長林曉以前在一家SaaS公司做UI設計。她說：「開幕第一個月賣出了4,000多杯（比預期多了一半），來的大多是熟客……慢一點也沒關係。」` },
  hk: { label: { zh: '繁体HK', ja: '繁体HK', tw: '繁體HK', en: 'Traditional (HK)' }, lang: 'zh-Hant-HK', text:
`早上6時半，第一班港鐵列車駛出總站。車廂內人不多，有人戴着AirPods聽Podcast，有人用iPhone覆WhatsApp。這條路線全長27.6公里，設有19個車站，平日客量超過80萬人次。

2026年，本港獨立咖啡店數目增加了12.5%（營業額按年升約20%），不少店舖開始用人工智能（AI）編更和訂貨。車站旁新開的這間只賣三款：Americano $38、Latte $42，轉燕麥奶加$5，亦可以用App預先落單。營業時間寫在門口的小黑板上——平日7:30開門，週末遲半小時；Wi-Fi密碼貼在收銀處旁邊。

店主林曉以前在一間SaaS公司做UI設計。佢話：「開業頭一個月賣咗4,000幾杯（比預期多咗一半），嚟嘅大多係熟客……慢啲都冇所謂。」` },
  /* Use short lines without enclosing quotes or full stops, like manga balloons; separate balloons with blank lines. */
  manga: { label: { zh: '漫画对白', ja: 'マンガ', tw: '漫畫對白', en: 'Manga' }, lang: 'ja', text:
`なんだって！？
そんな馬鹿な
話があるか…

ここは危険だ
早く逃げろ！！

待ってくれ！
まだ３人いるんだ

……１分だけ待つ` },
  chars: { label: { zh: '字符表', ja: '文字表', tw: '字元表', en: 'Charset' }, lang: 'zh-Hans', text:
`永国字體 あいうえお アイウエオ
字骨曜返东国三力今直
，。、；：？！「」『』《》（）
①②③ ※ → ℃ ○ ■ ０１２
“双引号” ‘单引号’ ——破折号 ……省略号 · 间隔号
Aa Bb Gg Qq Rr & @ # % ( ) [ ]
0123456789 ½ € $ ¥
3.14　12:30　1,000　50%　¥1,980
ㄅㄆㄇㄈ　ㄓㄨˋ ㄧㄣ　ㄈㄨˊ ㄏㄠˋ　嘅咗嚟啲 𠝹𨋢
Hànyǔ Pīnyīn · nǚ lǜ lüè · Běijīng` },
};

/* Native CSS text properties. sup lists each browser's first supported version (MDN browser-compat-data, 2026-10). */
/* Advanced layout illustrations: bars for paragraphs, squares for Han characters, dashed lines for text-area edges. Selected illustrations turn black. */
export const tSvg = body => `<svg class="tt-svg" viewBox="0 0 48 30" aria-hidden="true">${body}</svg>`;
export const tBars = rows => rows.map(([x, w, y]) => `<rect x="${x}" y="${y}" width="${w}" height="3" rx=".6"/>`).join('');
export const tEdge = (...xs) => xs.map(x => `<path d="M${x} 1v28" class="tt-edge"/>`).join('');
/* text-justify: distribute eight extra units among gaps in a line of Han pairs and a Western word. */
export const tJust = gaps => {
  const w = [4, 4, 10, 4, 4]; let x = 4, out = '';
  w.forEach((ww, i) => { out += ww === 10 ? `<rect x="${x}" y="9.5" width="10" height="2.5" rx=".6"/>` : `<rect x="${x}" y="8" width="4" height="4" rx=".4"/>`; x += ww + (gaps[i] ?? 0); });
  return out + `<rect x="4" y="18" width="4" height="4" rx=".4"/><rect x="9" y="18" width="4" height="4" rx=".4"/>` + tEdge(3, 45);      // Both outer lines mark text-area edges.
};
export const TILE_SVG = {
  wrap: { wrap: tBars([[4, 40, 4], [4, 40, 11], [4, 40, 18], [4, 5, 25]]), pretty: tBars([[4, 40, 4], [4, 40, 11], [4, 31, 18], [4, 14, 25]]), balance: tBars([[4, 34, 4], [4, 34, 11], [4, 34, 18], [4, 31, 25]]) },
  align: { justify: tBars([[4, 40, 4], [4, 40, 11], [4, 40, 18], [4, 22, 25]]), start: tBars([[4, 36, 4], [4, 40, 11], [4, 31, 18], [4, 22, 25]]), center: tBars([[8, 32, 4], [4, 40, 11], [10, 28, 18], [13, 22, 25]]) },
  hang: {
    none: tBars([[6, 30, 6], [6, 34, 14], [6, 20, 22]]) + '<circle cx="38.5" cy="8" r="1.4"/>' + tEdge(5.5, 41.5),
    'allow-end': tBars([[6, 35, 6], [6, 34, 14], [6, 20, 22]]) + '<circle cx="43.5" cy="8" r="1.4"/>' + tEdge(5.5, 41.5),
    'first allow-end last': tBars([[6, 35, 6], [6, 34, 14], [6, 35, 22]]) + '<circle cx="43.5" cy="8" r="1.4"/><path d="M4.6 5.2H2.6V9.6" class="tt-mark"/><path d="M42.8 20v4.4h2" class="tt-mark"/>' + tEdge(5.5, 41.5),
  },
};
TILE_SVG.justify = { auto: tJust([3, 4, 4, 3]), 'inter-character': tJust([3, 4, 4, 3]), 'inter-word': tJust([1, 6, 6, 1]), none: tJust([1, 2, 2, 1]) };
export const tSvgTile = key => v => `<span class="tt-s tt-pic" aria-hidden="true">${tSvg(TILE_SVG[key][v])}</span>`;
/* Line breaking and punctuation compression: render real text with the current composite in a narrow box; the left line marks the text-area edge. */
export const tBox = (prop, text, lang, cls = '') => v => `<span class="tt-s tt-box${cls}"${lang ? ` lang="${lang}"` : ''} style="${prop}:${v}" aria-hidden="true">${text}</span>`;
export const TYPO = [
  { key: 'lang', label: { zh: '语言', ja: '言語', tw: '語言', en: 'Language' }, prop: 'lang', attr: true, def: 'zh-Hans',
    values: [['zh-Hans', { zh: '简体中文', ja: '簡体字中国語', tw: '簡體中文', en: 'Simplified Chinese' }], ['zh-Hant-TW', { zh: '繁體中文（台灣）', ja: '繁体字中国語（台湾）', tw: '繁體中文（台灣）', en: 'Traditional Chinese (Taiwan)' }], ['zh-Hant-HK', { zh: '繁體中文（香港）', ja: '繁体字中国語（香港）', tw: '繁體中文（香港）', en: 'Traditional Chinese (Hong Kong)' }], ['ja', { zh: '日本語', ja: '日本語', tw: '日本語', en: 'Japanese' }], ['ko', { zh: '한국어', ja: '韓国語', tw: '한국어', en: 'Korean' }], ['en', { zh: 'English', ja: '英語', tw: 'English', en: 'English' }]],
    note: { zh: 'HTML 的 lang 属性，不是 CSS。它决定字形的地区变体、禁则规则，word-break: auto-phrase 也依赖它。', ja: 'HTML の lang 属性で、CSS ではありません。字形の地域差や禁則を決め、word-break: auto-phrase もこれに依存します。', tw: 'HTML 的 lang 屬性，不是 CSS。它決定字形的地區變體、禁則規則，word-break: auto-phrase 也依賴它。', en: 'The HTML lang attribute, not CSS. It sets regional glyph variants and line breaking rules, and word-break: auto-phrase depends on it.' } },
  { key: 'autospace', label: { zh: '中西间距', ja: '和欧間のアキ', tw: '中西文間距', en: 'CJK–Western spacing' }, prop: 'text-autospace', def: 'normal', always: true, tiles: '字Ab字12字', tileW: 112, tileFs: 18, tileCode: true,
    sup: { chrome: '140', firefox: '145', safari: '18.4' },
    values: [['normal', { zh: '加 1/8 em', ja: '1/8 em 空ける', tw: '加 1/8 em', en: 'Add 1/8 em' }], ['no-autospace', { zh: '不加', ja: '空けない', tw: '不加', en: 'None' }]],
    note: { zh: '只在没有空格的地方加，已经手动敲了空格的不会再加。Chrome 实测初始值是 no-autospace，所以导出时总会写出这一行。', ja: 'スペースのない箇所にだけ入り、手で入れたスペースには追加されません。Chrome の実際の初期値は no-autospace なので、書き出しでは常にこの行を出力します。', tw: '只在沒有空格的地方加，已經手動敲了空格的不會再加。Chrome 實測初始值是 no-autospace，所以匯出時總會寫出這一行。', en: 'Added only where there is no space; spaces you typed get nothing extra. Chrome\'s actual initial value is no-autospace, so the export always writes this line.' } },
  { key: 'trim', label: { zh: '标点挤压', ja: '約物の詰め', tw: '標點擠壓', en: 'Punctuation compression' }, prop: 'text-spacing-trim', def: 'trim-start', init: 'normal', tiles: true, tileHtml: tBox('text-spacing-trim', '「甲乙」「丙丁」'), tileW: 112, tileCode: true,
    sup: { chrome: '123', firefox: '—', safari: '—' },
    values: [['normal', { zh: '相邻标点挤压，行首不挤', ja: '隣接する約物を詰める。行頭は詰めない', tw: '相鄰標點擠壓，行首不擠', en: 'Compress adjacent, not at line head' }], ['space-all', { zh: '全部保持全角', ja: 'すべて全角のまま', tw: '全部保持全形', en: 'Keep all full-width' }], ['space-first', { zh: '行首也挤压，段首行除外', ja: '行頭も詰める（段落の 1 行目を除く）', tw: '行首也擠壓，段首行除外', en: 'Also at line head, except first line' }], ['trim-start', { zh: '行首也挤压，包括段首行', ja: '行頭も詰める（1 行目を含む）', tw: '行首也擠壓，包括段首行', en: 'Also at line head, incl. first line' }]],
    note: { zh: '例如「。」」连在一起时，其中一个收成半角。目前只有 Chromium 实现。', ja: 'たとえば「。」」が続くと片方が半角になります。現在は Chromium だけが実装しています。', tw: '例如「。」」連在一起時，其中一個收成半形。目前只有 Chromium 實作。', en: 'For example, when 「。」」 run together, one of them becomes half-width. Currently only Chromium implements this.' } },
  { key: 'wordBreak', label: { zh: '换行单位', ja: '改行の単位', tw: '換行單位', en: 'Break unit' }, prop: 'word-break', def: 'normal', tiles: true, tileHtml: tBox('word-break', '美しい日本語の文章', 'ja'), tileW: 112, tileCode: true,
    sup: { chrome: '119', firefox: '—', safari: '—' },
    values: [['normal', { zh: '逐字', ja: '1 文字ずつ', tw: '逐字', en: 'Per character' }], ['auto-phrase', { zh: '按词组', ja: '文節単位', tw: '按詞組', en: 'By phrase' }]],
    note: { zh: 'auto-phrase 只对 lang="ja" 和 lang="ko" 生效，适合标题和短文。', ja: 'auto-phrase は lang="ja" と lang="ko" でのみ有効で、見出しや短い文に向いています。', tw: 'auto-phrase 只對 lang="ja" 和 lang="ko" 生效，適合標題和短文。', en: 'auto-phrase only works with lang="ja" and lang="ko"; good for headings and short text.' } },
  { key: 'lineBreak', label: { zh: '禁则', ja: '禁則', tw: '禁則', en: 'Line breaking rules' }, prop: 'line-break', def: 'strict', init: 'auto', tiles: true, tileHtml: tBox('line-break', 'まあ時々、ちょっと', 'ja', ' tt-lb'), tileW: 88, tileCode: true,      /* This sentence wraps differently for all five values in a four-character-wide box (auto matches normal in Chrome). */
    sup: { chrome: '58', firefox: '69', safari: '11' },
    values: [['auto', { zh: '由浏览器决定', ja: 'ブラウザに任せる', tw: '由瀏覽器決定', en: 'Browser decides' }], ['loose', { zh: '宽松', ja: 'ゆるい', tw: '寬鬆', en: 'Loose' }], ['normal', { zh: '标准', ja: '標準', tw: '標準', en: 'Normal' }], ['strict', { zh: '严格', ja: '厳しい', tw: '嚴格', en: 'Strict' }], ['anywhere', { zh: '任意处断行', ja: 'どこでも改行', tw: '任意處斷行', en: 'Break anywhere' }]],
    note: { zh: '哪些字不能放在行首或行尾，例如句号、逗号不放在行首。auto 由浏览器按语言决定；strict 更严格，小写假名（っ、ゃ）和长音「ー」也不放行首，日文正文常用；loose 更宽松，适合窄栏；anywhere 在任何地方都可以断行。', ja: '行頭・行末に置けない文字の規則です（句読点を行頭に置かないなど）。auto はブラウザが言語に応じて決めます。strict はより厳しく、小書きのかな（っ・ゃ）や長音記号「ー」も行頭に置きません（日本語の本文でよく使います）。loose はゆるく、狭い段組み向けです。anywhere はどこでも改行します。', tw: '哪些字不能放在行首或行尾，例如句號、逗號不放在行首。auto 由瀏覽器按語言決定；strict 更嚴格，小寫假名（っ、ゃ）和長音「ー」也不放行首，日文內文常用；loose 更寬鬆，適合窄欄；anywhere 在任何地方都可以斷行。', en: 'Which characters may not start or end a line, e.g. periods and commas never start a line. auto lets the browser decide by language; strict also keeps small kana (っ, ゃ) and the prolonged sound mark 「ー」 off the line head, common in Japanese body text; loose is more relaxed, suited to narrow columns; anywhere can break at any point.' } },
  /* Wrapping, alignment and justification (grp: 'view') are preview-only page layout, not font settings. Keep them in View and out of exported CSS. */
  { key: 'wrap', grp: 'view', label: { zh: '段落换行', ja: '段落の折り返し', tw: '段落換行', en: 'Paragraph wrap' }, prop: 'text-wrap', def: 'wrap', init: 'wrap', tiles: true, tileHtml: tSvgTile('wrap'), tileW: 96, tileCode: true,
    sup: { chrome: 'balance 114 · pretty 117', firefox: 'balance 121', safari: 'balance 17.5 · pretty 26' },
    values: [['wrap', null], ['pretty', { zh: '避免末行孤字', ja: '最終行の孤立を避ける', tw: '避免末行孤字', en: 'Avoid orphans' }], ['balance', { zh: '各行等长（标题）', ja: '行長をそろえる（見出し）', tw: '各行等長（標題）', en: 'Even lines (headings)' }]],
    note: { zh: 'Chrome 的 pretty 只调整段落最后四行。Safari 的 pretty 会重排整段：每行排得更短，两端对齐时字距被拉开，标点悬挂也会失效，所以正文默认不用。', ja: 'Chrome の pretty は段落の最後の 4 行だけを調整します。Safari の pretty は段落全体を組み直すため、行が短くなって両端揃えでは字間が空き、ぶら下がりも効かなくなります。そのため本文の初期値にはしていません。', tw: 'Chrome 的 pretty 只調整段落最後四行。Safari 的 pretty 會重排整段：每行排得更短，左右對齊時字距被拉開，標點懸掛也會失效，所以正文預設不用。', en: 'Chrome\'s pretty only adjusts the last four lines of a paragraph. Safari\'s pretty reflows the whole paragraph: lines get shorter, justified text gets wide inter-character spacing, and hanging punctuation stops working, so body text doesn\'t use it by default.' } },
  { key: 'align', grp: 'view', label: { zh: '对齐', ja: '揃え', tw: '對齊', en: 'Alignment' }, prop: 'text-align', def: 'justify', tiles: true, tileHtml: tSvgTile('align'), tileW: 96, tileCode: true,
    values: [['justify', { zh: '两端对齐', ja: '両端揃え', tw: '兩端對齊', en: 'Justify' }], ['start', { zh: '齐头', ja: '行頭揃え', tw: '靠行首對齊', en: 'Start' }], ['center', { zh: '居中', ja: '中央揃え', tw: '置中', en: 'Center' }]] },
  { key: 'justify', grp: 'view', label: { zh: '对齐方式', ja: '両端揃えの方法', tw: '對齊方式', en: 'Justify method' }, prop: 'text-justify', def: 'auto', tiles: true, tileHtml: tSvgTile('justify'), tileW: 96, tileCode: true,
    sup: { chrome: '145', firefox: '55', safari: '—' },
    values: [['auto', null], ['inter-character', { zh: '字间分配', ja: '字間で調整', tw: '字間分配', en: 'Between characters' }], ['inter-word', { zh: '只在词间', ja: '語間のみ', tw: '只在詞間', en: 'Between words only' }], ['none', null]],
    note: { zh: '配合 text-align: justify 使用。', ja: 'text-align: justify と組み合わせて使います。', tw: '配合 text-align: justify 使用。', en: 'Use with text-align: justify.' } },
  { key: 'hang', label: { zh: '标点悬挂', ja: 'ぶら下がり', tw: '標點懸掛', en: 'Hanging punctuation' }, prop: 'hanging-punctuation', def: 'allow-end', init: 'none', tiles: true, tileHtml: tSvgTile('hang'), tileW: 112, tileCode: true,
    sup: { chrome: '—', firefox: '—', safari: '10' },
    values: [['none', null], ['allow-end', { zh: '行尾句读可悬挂', ja: '行末の句読点をぶら下げる', tw: '行尾句讀可懸掛', en: 'Hang line-end punctuation' }], ['first allow-end last', { zh: '段首段尾的引号括号也悬挂', ja: '段落の最初と最後の括弧も', tw: '段首段尾的引號括號也懸掛', en: 'Also quotes and brackets at paragraph start and end' }]],
    note: { zh: '让行尾的句号、逗号伸出版心，右边缘看起来更齐。目前只有 Safari 支持，其他浏览器照常排；段落换行设成 pretty 时，Safari 也不悬挂。first / last 让段落开头、结尾的引号和括号也悬挂。', ja: '行末の句読点を版面の外にはみ出させ、右端をそろえて見せます。現在対応しているのは Safari だけで、ほかのブラウザでは通常どおり組まれます。段落の折り返しを pretty にすると、Safari でもぶら下がりません。first / last は段落の最初・最後の括弧や引用符もぶら下げます。', tw: '讓行尾的句號、逗號伸出版心，右邊緣看起來更齊。目前只有 Safari 支援，其他瀏覽器照常排；段落換行設成 pretty 時，Safari 也不懸掛。first / last 讓段落開頭、結尾的引號和括號也懸掛。', en: 'Lets periods and commas at line end extend past the type area, so the right edge looks straighter. Only Safari supports it for now; other browsers set text as usual. When paragraph wrap is pretty, Safari doesn\'t hang either. first / last also hang quotes and brackets at the start and end of a paragraph.' } },
  { key: 'feat', grp: 'font', label: { zh: '字距特性', ja: '字詰めの機能', tw: '字距特性', en: 'Spacing features' }, prop: 'font-feature-settings', def: 'normal', tiles: '「アイ」、ウ。', tileW: 112, tileFs: 17, tileCode: true,
    sup: { chrome: '48', firefox: '34', safari: '9.1' },
    values: [['normal', null], ['"palt"', { zh: '假名标点比例宽', ja: 'かなと約物をプロポーショナルに', tw: '假名標點比例寬', en: 'Proportional kana and punctuation' }], ['"halt"', { zh: '标点半角', ja: '約物を半角に', tw: '標點半形', en: 'Half-width punctuation' }]],
    note: { zh: '日文排版常用的 OpenType 特性。palt 让假名和标点按字形本身的宽度排，字距更紧，适合标题；halt 只把标点压成半宽。正文一般保持 normal。字体没有这些特性时不起作用；思源 / Noto CJK 等字体的标点也支持。', ja: '和文組版でよく使う OpenType 機能です。palt はかなや約物を字形そのものの幅で組み、字間が詰まるので見出し向きです。halt は約物だけを半角にします。本文はふつう normal のままです。フォントにこれらの機能がなければ効きません。源ノ / Noto CJK などのフォントは約物も対応しています。', tw: '日文排版常用的 OpenType 特性。palt 讓假名和標點按字形本身的寬度排，字距更緊，適合標題；halt 只把標點壓成半寬。內文一般保持 normal。字型沒有這些特性時不起作用；思源 / Noto CJK 等字型的標點也支援。', en: 'OpenType features common in Japanese typesetting. palt sets kana and punctuation at their own glyph widths for tighter spacing, good for headings; halt only narrows punctuation to half width. Body text usually stays normal. No effect if the font lacks these features; punctuation in Source Han / Noto CJK fonts supports them too.' } },
  /* Numeric styles: the same five choices as InDesign. Slashed zero has its own row; export both as one font-variant-numeric declaration.
   tiles uses specimen cards rendered in the current digit font; the third item supplies a usage hint. */
  { key: 'num', grp: 'font', label: { zh: '数字样式', ja: '数字のスタイル', tw: '數字樣式', en: 'Figure style' }, prop: 'font-variant-numeric', def: 'normal', tiles: '11,980', hint: 'numHint',
    sup: { chrome: '52', firefox: '34', safari: '9.1' },
    values: [['normal', { zh: '字体默认', ja: 'フォントの既定', tw: '字型預設', en: 'Font default' }],
      ['lining-nums tabular-nums', { zh: '等高等宽', ja: 'ライニング・等幅', tw: '等高等寬', en: 'Tabular lining' }, { zh: '表格、金额', ja: '表・金額', tw: '表格、金額', en: 'Tables, amounts' }],
      ['lining-nums proportional-nums', { zh: '等高比例', ja: 'ライニング・プロポーショナル', tw: '等高比例', en: 'Proportional lining' }],
      ['oldstyle-nums proportional-nums', { zh: '旧式比例', ja: 'オールドスタイル・プロポーショナル', tw: '舊式比例', en: 'Proportional oldstyle' }, { zh: '西文正文', ja: '欧文の本文', tw: '西文內文', en: 'Western body text' }],
      ['oldstyle-nums tabular-nums', { zh: '旧式等宽', ja: 'オールドスタイル・等幅', tw: '舊式等寬', en: 'Tabular oldstyle' }]],
    note: { zh: '和 InDesign 的「数字样式」一样的五种。等高 / 旧式是数字的高低，比例 / 等宽是数字的宽度。效果取决于显示数字的那个字体有没有这些 OpenType 特性；Google Fonts 的网页字体删掉了旧式数字和斜线零。写在使用规则里，页面上可以按元素改，例如只让表格用等宽数字。', ja: 'InDesign の「数字スタイル」と同じ 5 種類です。ライニング / オールドスタイルは数字の高さ、プロポーショナル / 等幅は数字の幅です。効果は数字を表示するフォントにこれらの OpenType 機能があるかどうかで決まります。Google Fonts の Web フォントではオールドスタイル数字とスラッシュ付きゼロが削られています。使用側の規則に書かれるので、表だけ等幅数字にするなど、要素ごとに変えられます。', tw: '和 InDesign 的「數字樣式」一樣的五種。等高 / 舊式是數字的高低，比例 / 等寬是數字的寬度。效果取決於顯示數字的那個字型有沒有這些 OpenType 特性；Google Fonts 的網頁字型刪掉了舊式數字和斜線零。寫在使用規則裡，頁面上可以按元素改，例如只讓表格用等寬數字。', en: 'The same five options as InDesign\'s figure style. Lining / oldstyle is the height of the figures, proportional / tabular their width. The effect depends on whether the font that shows the digits has these OpenType features; Google Fonts web fonts drop oldstyle figures and slashed zero. It is written into the usage rules, so the page can change it per element, e.g. tabular figures only in tables.' } },
  { key: 'zero', grp: 'font', label: { zh: '斜线零', ja: 'スラッシュ付きゼロ', tw: '斜線零', en: 'Slashed zero' }, prop: 'font-variant-numeric', def: 'normal', tiles: '100',
    sup: { chrome: '52', firefox: '34', safari: '9.1' },
    values: [['normal', { zh: '不用', ja: '使わない', tw: '不用', en: 'Off' }], ['slashed-zero', { zh: '斜线零', ja: 'スラッシュ付き', tw: '斜線零', en: 'Slashed zero' }, { zh: '和字母 O 区分', ja: 'O と区別', tw: '和字母 O 區分', en: 'Distinct from letter O' }]] },
  /* East Asian forms: combine glyph standards (JIS versions, traditional/simplified forms) and kana/punctuation width into one font-variant-east-asian declaration. */
  { key: 'eaVar', grp: 'font', label: { zh: '字形标准', ja: '字形の規格', tw: '字形標準', en: 'Glyph standard' }, prop: 'font-variant-east-asian', def: 'normal', tiles: '辻葛飴鴎国', tileW: 128, hint: 'eaHint',
    sup: { chrome: '63', firefox: '34', safari: '9.1' },
    values: [['normal', { zh: '字体默认', ja: 'フォントの既定', tw: '字型預設', en: 'Font default' }], ['jis04', { zh: 'JIS2004', ja: 'JIS2004', tw: 'JIS2004', en: 'JIS2004' }, { zh: '现行标准', ja: '現行の規格', tw: '現行標準', en: 'Current standard' }], ['jis90', { zh: 'JIS90', ja: 'JIS90', tw: 'JIS90', en: 'JIS90' }, { zh: '2004 年以前', ja: '2004 年より前', tw: '2004 年以前', en: 'Before 2004' }], ['jis83', { zh: 'JIS83', ja: 'JIS83', tw: 'JIS83', en: 'JIS83' }], ['jis78', { zh: 'JIS78', ja: 'JIS78', tw: 'JIS78', en: 'JIS78' }], ['traditional', { zh: '旧字形', ja: '旧字体', tw: '舊字形', en: 'Traditional forms' }], ['simplified', { zh: '简化字形', ja: '簡略字形', tw: '簡化字形', en: 'Simplified forms' }]],
    note: { zh: '日文汉字有几版字形标准：JIS2004 是现行标准，例如「辻」的走之是两点、「飴」的食字旁是新写法；JIS90 是 2004 年以前 Windows XP 等使用的写法，JIS83、JIS78 更早。旧字形把字换成传统写法（例如国 → 國），简化字形相反。需要字体本身带有这些字形：冬青黑体（Hiragino）、游明朝等本机字体通常有，Google Fonts 的网页字体把这些特性删掉了。和校样的语言无关，中文字体如果带有这些特性也会生效。', ja: '日本語の漢字には字形の規格がいくつかあります。JIS2004 は現行の規格で、たとえば「辻」のしんにょうは 2 点、「飴」の食偏は新しい形です。JIS90 は 2004 年より前（Windows XP など）の形で、JIS83・JIS78 はさらに古い形です。旧字体は字を伝統的な形に（国 → 國）、簡略字形はその逆にします。フォント自体がこれらの字形を持っている必要があり、ヒラギノや游明朝などのローカルフォントにはたいていありますが、Google Fonts の Web フォントではこれらの機能が削られています。校正刷りの言語とは関係なく、中国語フォントでも機能があれば効きます。', tw: '日文漢字有幾版字形標準：JIS2004 是現行標準，例如「辻」的辶是兩點、「飴」的食字旁是新寫法；JIS90 是 2004 年以前 Windows XP 等使用的寫法，JIS83、JIS78 更早。舊字形把字換成傳統寫法（例如国 → 國），簡化字形相反。需要字型本身帶有這些字形：冬青黑體（Hiragino）、游明朝等本機字型通常有，Google Fonts 的網頁字型把這些特性刪掉了。和校樣的語言無關，中文字型如果帶有這些特性也會生效。', en: 'Japanese kanji have several glyph standards: JIS2004 is the current one, e.g. the 辶 radical in 「辻」 has two dots and the 食 radical in 「飴」 uses the new form; JIS90 is the form used before 2004 by Windows XP and others; JIS83 and JIS78 are older still. Traditional forms switch characters to their traditional shapes (e.g. 国 → 國); simplified forms do the opposite. The font itself must contain these glyphs: installed fonts such as Hiragino and Yu Mincho usually do, while Google Fonts web fonts drop these features. This doesn\'t depend on the proof language; Chinese fonts with these features are affected too.' } },
  { key: 'eaWidth', grp: 'font', label: { zh: '假名与标点宽度', ja: 'かなと約物の幅', tw: '假名與標點寬度', en: 'Kana and punctuation width' }, prop: 'font-variant-east-asian', def: 'normal', tiles: 'イリ「ア」ﾃｽ', tileW: 150, tileFs: 18, hint: 'eaWHint',      /* Proportional width also narrows corner brackets; full-width mode converts half-width katakana to full-width forms. */
    sup: { chrome: '63', firefox: '34', safari: '9.1' },
    values: [['normal', { zh: '字体默认', ja: 'フォントの既定', tw: '字型預設', en: 'Font default' }], ['proportional-width', { zh: '比例宽', ja: 'プロポーショナル', tw: '比例寬', en: 'Proportional' }, { zh: '按字形本身的宽度', ja: '字形そのものの幅', tw: '按字形本身的寬度', en: 'Each glyph\'s own width' }], ['full-width', { zh: '全角', ja: '全角', tw: '全形', en: 'Full-width' }, { zh: '半角假名也变全角', ja: '半角カナも全角に', tw: '半形假名也變全形', en: 'Half-width kana become full-width too' }]] },
];
/* Combine related rows into one CSS property: numeric style + slashed zero -> font-variant-numeric; glyph standard + width -> font-variant-east-asian. */
/* grp: 'font' controls glyph selection and belongs in Fonts; the remaining settings belong in Text layout. */
export const isFontTypo = t => t.grp === 'font';
export const isViewTypo = t => t.grp === 'view';
export const VIEW_TYPO = new Set(['wrap', 'align', 'justify']);      // Matches TYPO's grp: 'view' entries; list them here because presetSnap may run before TYPO is available.
export const TYPO_MERGE = { 'font-variant-numeric': ['num', 'zero'], 'font-variant-east-asian': ['eaVar', 'eaWidth'] };
export const typoValue = t => TYPO_MERGE[t.prop] ? TYPO_MERGE[t.prop].map(k => state.typo[k]).filter(v => v && v !== 'normal').join(' ') || 'normal' : state.typo[t.key];
export const typoMergedAway = t => TYPO_MERGE[t.prop] && TYPO_MERGE[t.prop][0] !== t.key;      // Merged into the preceding row; do not export separately.
/* Map East Asian form values to OpenType features when checking whether the font contains the requested glyph forms. */
export const EA_FEAT = { jis78: 'jp78', jis83: 'jp83', jis90: 'jp90', jis04: 'jp04', simplified: 'smpl', traditional: 'trad', 'full-width': 'fwid', 'proportional-width': 'pwid' };
/* Defaults target body text: justified alignment, strict line breaking and hanging punctuation. Avoid pretty: Safari shortens lines and disables hanging punctuation.
   def is the tool default; init is the CSS initial value. Omit only values equal to init from exports. */
export const typoDef = (t, lang = state?.typo?.lang) => t.defJa && /^ja/.test(lang || '') ? t.defJa : t.def;
export const typoDefaults = lang => Object.fromEntries(TYPO.map(t => [t.key, typoDef(t, lang)]));
export const TYPO_DEFAULTS = typoDefaults('zh-Hans');
export const ENGINE = (() => {
  const ua = navigator.userAgent; let m;
  if ((m = ua.match(/Firefox\/(\d+)/))) return { id: 'firefox', name: 'Firefox', v: m[1] };
  if ((m = ua.match(/(?:Chrome|Chromium)\/(\d+)/))) return { id: 'chrome', name: /Edg\//.test(ua) ? 'Edge' : 'Chrome', v: m[1] };
  if ((m = ua.match(/Version\/([\d.]+).*Safari/))) return { id: 'safari', name: 'Safari', v: m[1] };
  return { id: '', name: '', v: '' };
})();
export const typoSupported = (t, v) => t.attr || CSS.supports(t.prop, v);
/* Numeric styles: combine numeric style and slashed zero into font-variant-numeric.
   Map each value to OpenType features to check support in the font used for digits. */
export const NUM_FEAT = { 'lining-nums': 'lnum', 'oldstyle-nums': 'onum', 'proportional-nums': 'pnum', 'tabular-nums': 'tnum', 'slashed-zero': 'zero' };
export const NUM_TAGS = Object.values(NUM_FEAT);
export const NUM_LABEL = { lnum: { zh: '等高数字', ja: 'ライニング数字', tw: '等高數字', en: 'Lining figures' }, onum: { zh: '旧式数字', ja: 'オールドスタイル数字', tw: '舊式數字', en: 'Oldstyle figures' }, pnum: { zh: '比例数字', ja: 'プロポーショナル数字', tw: '比例數字', en: 'Proportional figures' }, tnum: { zh: '等宽数字', ja: '等幅数字', tw: '等寬數字', en: 'Tabular figures' }, zero: { zh: '斜线零', ja: 'スラッシュ付きゼロ', tw: '斜線零', en: 'Slashed zero' } };
export const numValue = () => typoValue(TYPO.find(t => t.key === 'num'));
export const numTags = () => numValue().split(' ').map(v => NUM_FEAT[v]).filter(Boolean);
export const numLabel = t => tr(NUM_LABEL[t]);

/* Preset Western sizes, weights and baselines were measured by Auto-fit Western at weights 100-900 (2026-10-17, Chrome 155, macOS).
   latin stores the font and weight at 400; latinSize is its size. latinW stores per-weight { size, weight } values.
   Sizes differing from 400 by less than 0.5 inherit the base value; store weights only when overriding the derived value.
   latinShift is the baseline, with offsets within 2% em set to 0. Local static fonts fit size and baseline only; weights remain name-derived. */
/* style: serif (Song/Ming) or sans (Hei/Gothic) Han font, used for preset filtering. */
export const PRESETS = [
  { id: 'serif-sc', style: 'serif', region: 'sc', name: { zh: '宋体 × Garamond', ja: '宋体 × Garamond', tw: '宋體 × Garamond', en: 'Song × Garamond' }, tag: { zh: '简体中文', ja: '簡体字中国語', tw: '簡體中文', en: 'Simplified' }, han: G('Noto Serif SC'), latin: G('EB Garamond'), latinSize: 115, latinW: { 100: { size: 114, weight: 400 }, 200: { size: 114, weight: 400 }, 300: { size: 114.5, weight: 400 }, 500: { size: 115.5, weight: 460 }, 600: { size: 116, weight: 500 }, 700: { size: 116.5, weight: 620 }, 800: { size: 117, weight: 660 }, 900: { size: 117.5, weight: 740 } }, sample: 'zh' },
  { id: 'sans-sc', style: 'sans', region: 'sc', name: { zh: '黑体 × Inter', ja: '黒体 × Inter', tw: '黑體 × Inter', en: 'Hei × Inter' }, tag: { zh: '简体中文', ja: '簡体字中国語', tw: '簡體中文', en: 'Simplified' }, han: G('Noto Sans SC'), latin: G('Inter'), latinSize: 100, latinW: { 100: { size: 98, weight: 160 }, 200: { size: 98.5, weight: 220 }, 300: { size: 99, weight: 260 }, 500: { size: 101 }, 600: { size: 101.5 }, 700: { size: 102 }, 800: { size: 102.5, weight: 740 }, 900: { size: 103.5, weight: 800 } }, sample: 'zh' },
  { id: 'mincho-jp', style: 'serif', region: 'jp', name: { zh: '明朝 × Cormorant', ja: '明朝 × Cormorant', tw: '明朝 × Cormorant', en: 'Mincho × Cormorant' }, tag: { zh: '日文', ja: '日本語', tw: '日文', en: 'Japanese' }, han: G('Shippori Mincho'), latin: G('Cormorant Garamond', 420), latinSize: 120, latinW: { 100: { weight: 400 }, 200: { weight: 400 }, 300: { weight: 400 }, 500: { size: 120.5 }, 600: { size: 121, weight: 600 }, 700: { size: 121.5, weight: 700 }, 800: { size: 122, weight: 700 }, 900: { size: 122, weight: 700 } }, sample: 'ja' },
  { id: 'gothic-jp', style: 'sans', region: 'jp', name: { zh: 'ゴシック × Jost', ja: 'ゴシック × Jost', tw: 'ゴシック × Jost', en: 'Gothic × Jost' }, tag: { zh: '日文', ja: '日本語', tw: '日文', en: 'Japanese' }, han: G('Noto Sans JP'), latin: G('Jost'), latinSize: 108, latinW: { 100: { size: 107, weight: 220 }, 200: { size: 107, weight: 260 }, 300: { size: 107.5 }, 500: { size: 108.5 }, 600: { size: 108.5, weight: 520 }, 700: { size: 109, weight: 620 }, 800: { size: 109.5, weight: 680 }, 900: { size: 109.5, weight: 740 } }, latinShift: -2, sample: 'ja' },
  /* Antigochi: Gothic Han glyphs with Antique kana; Western text and punctuation follow Gothic. Zen Antique's heavy kana balance with Han at 500. */
  { id: 'antigochi', style: 'sans', region: 'jp', name: { zh: 'アンチゴチ', ja: 'アンチゴチ', tw: 'アンチゴチ', en: 'Antigochi' }, tag: { zh: '漫画对白', ja: 'マンガの台詞', tw: '漫畫對白', en: 'Manga dialogue' }, han: G('Zen Kaku Gothic New', 500), latin: null, latinShift: 3, classes: { kana: { font: G('Zen Antique') } }, sample: 'manga', vertical: true },
  /* macOS: SF Pro is hidden from local() on the web; use Avenir Next, which ships on every Mac, for Western text. */
  { id: 'mac', style: 'sans', region: 'sc', name: { zh: '苹方 × Avenir Next', ja: 'PingFang × Avenir Next', tw: '蘋方-簡 × Avenir Next', en: 'PingFang SC × Avenir Next' }, tag: { zh: 'macOS 系统字体 · 简体中文', ja: 'macOS 標準・簡体字', tw: 'macOS 系統字型 · 簡體中文', en: 'macOS · Simplified' }, han: L('PingFang SC Regular', ['PingFangSC-Regular']), latin: L('Avenir Next Regular', ['AvenirNext-Regular']), latinSize: 104, latinW: { 700: { size: 102.5 }, 800: { size: 99.5 }, 900: { size: 99.5 } }, latinShift: -3,
    classes: { kana: { font: L('Hiragino Sans W3', ['HiraginoSans-W3']) } }, sample: 'zh' },   /* PingFang has kana, but use Hiragino's Japanese-designed kana for Japanese text. */
  { id: 'mac-jp', style: 'sans', region: 'jp', name: { zh: 'ヒラギノ角ゴ × Avenir Next', ja: 'ヒラギノ角ゴ × Avenir Next', tw: 'ヒラギノ角ゴ × Avenir Next', en: 'Hiragino Sans × Avenir Next' }, tag: { zh: 'macOS 系统字体 · 日文', ja: 'macOS 標準・日本語', tw: 'macOS 系統字型 · 日文', en: 'macOS · Japanese' }, han: L('Hiragino Sans W3', ['HiraginoSans-W3']), latin: L('Avenir Next Regular', ['AvenirNext-Regular']), latinSize: 111.5, latinW: { 100: { size: 108.5 }, 200: { size: 110.5 }, 300: { size: 111 }, 500: { size: 112 }, 600: { size: 112.5 }, 700: { size: 112 }, 800: { size: 110 } }, latinShift: -3.5, sample: 'ja' },
  /* Measure the regional Noto fonts separately for Taiwan and Hong Kong. Their built-in Western glyphs are identical, yielding the same fit as Simplified Chinese. */
  { id: 'ming-tw', style: 'serif', region: 'tc', name: { zh: '明體 × Garamond', ja: '明体 × Garamond', tw: '明體 × Garamond', en: 'Ming × Garamond' }, tag: { zh: '繁体中文（台湾）', ja: '繁体字中国語（台湾）', tw: '繁體中文（台灣）', en: 'Traditional (TW)' }, han: G('Noto Serif TC'), latin: G('EB Garamond'), latinSize: 115, latinW: { 100: { size: 114, weight: 400 }, 200: { size: 114, weight: 400 }, 300: { size: 114.5, weight: 400 }, 500: { size: 115.5, weight: 460 }, 600: { size: 116, weight: 500 }, 700: { size: 116.5, weight: 620 }, 800: { size: 117, weight: 660 }, 900: { size: 117.5, weight: 740 } }, sample: 'tw' },
  { id: 'hei-tw', style: 'sans', region: 'tc', name: { zh: '黑体 × Inter', ja: '黒体 × Inter', tw: '黑體 × Inter', en: 'Hei × Inter' }, tag: { zh: '繁体中文（台湾）', ja: '繁体字中国語（台湾）', tw: '繁體中文（台灣）', en: 'Traditional (TW)' }, han: G('Noto Sans TC'), latin: G('Inter'), latinSize: 100, latinW: { 100: { size: 98, weight: 160 }, 200: { size: 98.5, weight: 220 }, 300: { size: 99, weight: 260 }, 500: { size: 101 }, 600: { size: 101.5 }, 700: { size: 102 }, 800: { size: 102.5, weight: 740 }, 900: { size: 103.5, weight: 800 } }, sample: 'tw' },
  { id: 'hei-hk', style: 'sans', region: 'hk', name: { zh: '黑体 × Inter', ja: '黒体 × Inter', tw: '黑體 × Inter', en: 'Hei × Inter' }, tag: { zh: '繁体中文（香港）', ja: '繁体字中国語（香港）', tw: '繁體中文（香港）', en: 'Traditional (HK)' }, han: G('Noto Sans HK'), latin: G('Inter'), latinSize: 100, latinW: { 100: { size: 98, weight: 160 }, 200: { size: 98.5, weight: 220 }, 300: { size: 99, weight: 260 }, 500: { size: 101 }, 600: { size: 101.5 }, 700: { size: 102 }, 800: { size: 102.5, weight: 740 }, 900: { size: 103.5, weight: 800 } }, sample: 'hk' },
  { id: 'mac-tw', style: 'sans', region: 'tc', name: { zh: '蘋方-繁 × Avenir Next', ja: 'PingFang TC × Avenir Next', tw: '蘋方-繁 × Avenir Next', en: 'PingFang TC × Avenir Next' }, tag: { zh: 'macOS 系统字体 · 繁体中文', ja: 'macOS 標準・繁体字', tw: 'macOS 系統字型 · 繁體中文', en: 'macOS · Traditional' }, han: L('PingFang TC Regular', ['PingFangTC-Regular']), latin: L('Avenir Next Regular', ['AvenirNext-Regular']), latinSize: 104, latinW: { 700: { size: 102.5 }, 800: { size: 99.5 }, 900: { size: 99.5 } }, latinShift: -3, sample: 'tw' },
];

/* ================= State ================= */
/* null size / shift means inherit: from the followed class when following, otherwise 100% / 0 for independent fonts. */
export function freshClasses(p) {
  const c = {};
  for (const k of CLASSES) c[k.id] = { follow: k.follow || null, font: null, size: null, shift: null };
  c.han.font = p.han;
  if (p.latin) { c.latin.font = p.latin; c.latin.size = p.latinSize && p.latinSize !== 100 ? p.latinSize : null; } else c.latin.follow = 'han';
  if (p.latinShift) c.latin.shift = p.latinShift;
  for (const [id, o] of Object.entries(p.classes || {})) Object.assign(c[id], { follow: null }, o);
  return c;
}
export function stateFromPreset(p, prev) {
  return {
    v: 11,
    preset: p.id,
    name: prev?.name || 'My Composite',
    weights: prev?.weights || [100, 200, 300, 400, 500, 600, 700, 800, 900],
    baseMode: prev?.baseMode || 'link',
    weightNames: prev?.weightNames || {},
    moved: prev?.moved ? { ...prev.moved } : {},
    wOver: Object.fromEntries(Object.entries(p.latinW || {}).map(([W, settings]) => [W, { latin: { ...settings } }])),      // Clone settings so edits cannot mutate built-in presets.
    generic: prev?.generic || 'auto',
    scope: prev?.scope ?? '',
    wmode: prev?.wmode || 'steps',
    wrange: prev?.wrange || [100, 900],
    italic: prev ? !!prev.italic : true,
    lineMetrics: prev?.lineMetrics || 'han',      // Export italics by default: real Western italics, upright Han.
    classes: freshClasses(p),
    custom: [],
    view: prev?.view ? { ...prev.view } : { sample: p.sample, text: SAMPLES[p.sample].text, size: 24, lh: 1.85, vertical: !!p.vertical, colorize: false, miss: true, cmp: 'plain', weight: 400 },
    typo: prev?.typo ? { ...prev.typo } : { ...typoDefaults(SAMPLES[p.sample].lang), lang: SAMPLES[p.sample].lang },
    fx: prev?.fx ? { ...prev.fx, weights: [...prev.fx.weights] } : undefined,      // Font-file settings persist when switching presets.
  };
}

export const LS_STATE = 'composite-font:state:v1', LS_PRESETS = 'composite-font:presets:v1';
export let userPresets = lsGet(LS_PRESETS) || {};
/* normalizeState adds newer classes such as Zhuyin; validate only the original classes here. */
export function validState(s) {
  return s && s.classes && ['han', 'latin', 'kana', 'punct'].every(id => s.classes[id] && 'size' in s.classes[id]) && s.classes.han.font && Array.isArray(s.custom) && s.view;
}
/* Choose the initial preset by UI language: Mincho x Cormorant for Japanese, Ming x Garamond for Traditional Chinese, Song x Garamond for Simplified Chinese. */
export const defaultPresetId = () => UI === 'ja' ? 'mincho-jp' : UI === 'tw' ? 'ming-tw' : 'serif-sc';
/* All current settings. Imported bindings cannot be reassigned from other modules; use setState to replace the object. */
export let state = null;
export function setState(s) { state = s; }
/* Compare settings with the snapshot from applying or saving the preset. Proof text, size and other view state do not count as preset edits. */
export const PRESET_SKIP = new Set(['view', 'preset', 'presetBase', 'v', 'fx']);
/* Preview-only layout settings, such as alignment, do not count as preset edits. */
export function presetSnap(st = state) { return JSON.stringify(st, function (k, v) { return this === st && (PRESET_SKIP.has(k) || k === 'meta') || this === st.typo && VIEW_TYPO.has(k) ? undefined : v; }); }
export const presetDirty = () => {
  const name = state.preset?.startsWith('user:') ? state.preset.slice(5) : null;
  const saved = name != null && Object.hasOwn(userPresets, name) ? userPresets[name] : null;
  // After updating a user preset, compare undone edits with the currently saved version, rather than the old baseline in history.
  const baseline = saved?.v === state.v ? presetSnap(saved) : state.presetBase;
  return baseline ? presetSnap() !== baseline : state.preset === '';
};
/* All preview entry points use the export domain; restoring data, undoing or importing shares must not leave an unexported weight selected. */
export function previewWeight(x) {
  x = Number.isFinite(x) ? x : 400;
  if (state.wmode === 'cont') return Math.min(state.wrange[1], Math.max(state.wrange[0], Math.round(x)));
  return state.weights.reduce((a, b) => Math.abs(b - x) < Math.abs(a - x) ? b : a);
}
export function constrainPreviewWeight() {
  const v = state.view, before = v.weight;
  if (state.wmode === 'cont') {
    v.wcont = previewWeight(v.wcont);
    v.weight = Math.min(900, Math.max(100, Math.round((v.wcont - 1) / 100) * 100));
  } else v.weight = previewWeight(v.weight);
  return before !== v.weight;
}
export function normalizeState() {
  if (!(state.v >= 2)) {    // Older follow behavior also followed size and baseline; migrate these values to inheritance.
    for (const o of [...Object.values(state.classes), ...state.custom]) if (o.follow) { o.size = null; o.shift = null; }
    state.v = 2;
  }
  if (state.v === 2) {      // v2 exported only 400 by default; v3 exports all weights so each can be adjusted separately.
    if (Array.isArray(state.weights) && state.weights.length === 1 && state.weights[0] === 400) state.weights = [100, 200, 300, 400, 500, 600, 700, 800, 900];
    state.v = 3;
  }
  for (const c of CLASSES) state.classes[c.id] ||= { follow: c.follow || null, font: null, size: null, shift: null };     // Classes added later.
  /* Font-file export has separate weights (400 and 700 by default because baking is slow), italic output and optional WOFF2. */
  state.fx = { weights: [400, 700], italic: true, ttf: true, woff2: false, otf: false, ...(state.fx || {}) };
  if (!Array.isArray(state.fx.weights)) state.fx.weights = [400, 700];
  if (state.typo?.lang === 'zh-Hant') state.typo.lang = 'zh-Hant-TW';       // Split Traditional Chinese into Taiwan and Hong Kong.
  if (state.scope === 'zh-Hant') state.scope = 'zh-Hant-TW';
  if (state.typo) delete state.typo.tcy;                                   // Text combine upright was removed.
  if (state.typo) delete state.typo.emoji;                                 // Emoji display was removed.
  state.typo = { ...typoDefaults(state.typo?.lang), ...(state.typo || {}) };
  for (const t of TYPO) if (!t.values.some(([v]) => v === state.typo[t.key])) state.typo[t.key] = typoDef(t);      // Reset removed options, such as ideograph-alpha autospace, to defaults.
  if (state.v === 3) {      // v4 defaults: text-wrap: pretty and Japanese line-break: strict. Migrate values that still match the old defaults.
    if (state.typo.wrap === 'wrap') state.typo.wrap = 'pretty';
    if (/^ja/.test(state.typo.lang) && state.typo.lineBreak === 'auto') state.typo.lineBreak = 'strict';
    state.v = 4;
  }
  if (state.v === 4) {      // v5 exports italics by default; previously even Western text inside em and i was synthetically slanted.
    state.italic = true;
    state.v = 5;
  }
  if (state.v === 5) {      // v6 uses strict line breaking for every language, previously Japanese only. Migrate the old auto default to strict.
    if (state.typo.lineBreak === 'auto') state.typo.lineBreak = 'strict';
    state.v = 6;
  }
  if (state.v === 6) {      // v7 defaults punctuation spacing to space-first: narrow opening brackets on wrapped lines to align the left edge. Migrate the old normal default.
    if (state.typo.trim === 'normal') state.typo.trim = 'space-first';
    state.v = 7;
  }
  if (state.v === 7) {      // v8 defaults hanging punctuation to allow-end (currently effective only in Safari). Migrate the old none default.
    if (state.typo.hang === 'none') state.typo.hang = 'allow-end';
    state.v = 8;
  }
  if (state.v === 8) {      // v9 defaults punctuation spacing to trim-start, also narrowing opening brackets on a paragraph's first line. Migrate the previous space-first default.
    if (state.typo.trim === 'space-first') state.typo.trim = 'trim-start';
    state.v = 9;
  }
  if (state.v === 9) {      // v10 restores wrap as the paragraph default: Safari's pretty shortens lines and disables hanging punctuation. Migrate the previous pretty default.
    if (state.typo.wrap === 'pretty') state.typo.wrap = 'wrap';
    state.v = 10;
  }
  if (state.v === 10) {      // v11 makes alignment, justification and wrapping preview-only. Remove them from stored preset snapshots to avoid false modified indicators.
    if (state.presetBase) try { const b = JSON.parse(state.presetBase); if (b.typo) for (const k of VIEW_TYPO) delete b.typo[k]; state.presetBase = JSON.stringify(b); } catch (e) { /* Ignore malformed data. */ }
    state.v = 11;
  }
  delete state.view.compare; delete state.view.cmp;      // The comparison view was removed.
  delete state.view.presetsOpen;                                   // Presets no longer collapse into a row after moving into a left-pane tab.
  if (state.view.miss === undefined) state.view.miss = true;         // Highlight missing glyphs by default.
  delete state.metric;                                              // The metric alignment percentage controls were removed.
  state.weights = Array.isArray(state.weights) && state.weights.length ? [...new Set(state.weights)].sort((a, b) => a - b) : [state.weight || 400];
  delete state.weight;
  state.baseMode = state.baseMode || 'link';
  state.weightNames = state.weightNames || {};
  state.scope = state.scope || '';
  state.wmode = state.wmode === 'cont' ? 'cont' : 'steps';        // Weights: stepped / continuous (variable fonts).
  state.italic = !!state.italic;                                   // Export italics.
  state.lineMetrics = state.lineMetrics === 'off' ? 'off' : 'han';  // Align line metrics to the Han font by default.
  if (state.num) {        // Numeric styles moved from the digit gear menu, where they were stored by OpenType feature, to advanced text properties.
    const n = state.num;
    if (n.fig || n.spc) state.typo.num = `${n.fig === 'onum' ? 'oldstyle' : 'lining'}-nums ${n.spc === 'tnum' ? 'tabular' : 'proportional'}-nums`;
    if (n.zero) state.typo.zero = 'slashed-zero';
    delete state.num;
  }
  delete state.stretch; delete state.view.wstretch;                // The follow-page-width option was removed.
  const wr = Array.isArray(state.wrange) ? state.wrange.map(Math.round) : [];
  state.wrange = wr[0] >= 100 && wr[1] <= 900 && wr[0] < wr[1] ? wr : [100, 900];      // Exported weight range in continuous mode.
  if (!Number.isFinite(state.view.wcont)) state.view.wcont = state.view.weight || 400;
  state.view.wcont = Math.min(state.wrange[1], Math.max(state.wrange[0], state.view.wcont));
  state.wOver = state.wOver || {};
  state.moved = state.moved || {};
  if (state.view.sample === 'title') {   // The heading sample was removed; return to body text.
    const k = state.typo.lang?.startsWith('ja') ? 'ja' : 'zh';
    Object.assign(state.view, { sample: k, text: SAMPLES[k].text, size: 24, lh: 1.85 });
  }
  /* Multiple custom tabs each store text and language in view.customs; selection is 'c0', 'c1', etc. */
  const vw = state.view;
  if (vw.sample === 'en') { vw.sample = 'zh'; vw.text = SAMPLES.zh.text; }      // The Western-dominant sample was removed.
  if (!Array.isArray(vw.customs)) vw.customs = [];
  if (vw.customText != null) { vw.customs.push({ text: vw.customText, lang: vw.customLang || state.typo.lang }); if (vw.sample === 'custom') vw.sample = 'c' + (vw.customs.length - 1); }      // Legacy data with a single custom sample.
  delete vw.customText; delete vw.customLang;
  if (!(vw.sample in SAMPLES) && !/^c\d+$/.test(vw.sample)) { vw.customs.push({ text: vw.text || '', lang: state.typo.lang }); vw.sample = 'c' + (vw.customs.length - 1); }      // An earlier edited-text format.
  const ci = /^c(\d+)$/.exec(vw.sample);
  if (ci && !vw.customs[+ci[1]]) vw.sample = 'zh';
  if (ci && vw.customs[+ci[1]]) vw.text = vw.customs[+ci[1]].text;
  else if (vw.sample in SAMPLES) vw.text = SAMPLES[vw.sample].text;     // Refresh built-in sample text when that sample is selected.
  constrainPreviewWeight();
  if (state.presetBase === undefined && state.preset) state.presetBase = presetSnap();      // For legacy stored data, use the current settings as the baseline.
  rebuildClassRanges();
}
/* Load saved settings, or the default preset. This depends on other modules, so main.js calls it after all modules initialize rather than at module load. */
export function initState() {
  state = validState(lsGet(LS_STATE)) ? lsGet(LS_STATE) : stateFromPreset(PRESETS.find(p => p.id === defaultPresetId()));
  normalizeState();
}
export const saveState = debounce(() => { lsSet(LS_STATE, state); recordHistory(); }, 400);
/* ================= Undo / redo =================
   Save settings snapshots without proof view state: preview weight, sample text and preview-only alignment.
   The existing 400ms save debounce groups continuous typing and dragging into one step. */
export const HIST_MAX = 100, hist = { list: [], i: -1, onChange: null };
export const histSnap = () => JSON.stringify(state, function (k, v) { return this === state && k === 'view' || this === state.typo && VIEW_TYPO.has(k) ? undefined : v; });
export function recordHistory() {
  const snap = histSnap();
  if (hist.list[hist.i] === snap) return;
  hist.list.splice(hist.i + 1, Infinity, snap);
  if (hist.list.length > HIST_MAX) hist.list.shift();
  hist.i = hist.list.length - 1;
  hist.onChange?.();
}
export const canUndo = () => hist.i > 0, canRedo = () => hist.i < hist.list.length - 1;
/* Restore one history step while preserving the current view. Replace its snapshot after normalization so saving does not create a new step. */
export function stepHistory(d) {
  recordHistory();      // Record changes still pending in the save debounce first.
  const j = hist.i + d; if (j < 0 || j >= hist.list.length) return false;
  hist.i = j;
  const s = JSON.parse(hist.list[j]), keep = Object.fromEntries([...VIEW_TYPO].map(k => [k, state.typo[k]]));
  state = { ...s, view: state.view, typo: { ...s.typo, ...keep } };
  normalizeState();
  hist.list[j] = histSnap();
  hist.onChange?.();
  return true;
}

/* ================= Weights: tool settings map to 400; derive other weights automatically ================= */
export const BASE_W = 400;
export const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];
export const WEIGHT_WORDS = { 100: ['Thin', 'UltraLight', 'Hairline'], 200: ['ExtraLight', 'UltraLight'], 300: ['Light'], 400: ['Regular'], 500: ['Medium'], 600: ['Semibold', 'SemiBold', 'DemiBold'], 700: ['Bold'], 800: ['ExtraBold', 'Heavy'], 900: ['Black', 'Heavy'] };
export const ALL_WORDS = [...new Set(Object.values(WEIGHT_WORDS).flat())].sort((a, b) => b.length - a.length);
export const WORD_RE = new RegExp(`([ _-])(${ALL_WORDS.join('|')})$`, 'i');
export function weightOrder(W) {          // Try the target first, then search outward by distance, favoring the side toward 400.
  const out = [W], dir = W > BASE_W ? -1 : 1;
  for (let d = 100; d <= 800; d += 100) for (const x of [W + dir * d, W - dir * d]) if (x >= 100 && x <= 900 && x !== BASE_W && !out.includes(x)) out.push(x);
  return out;
}
export function nameAtWeight(name, wt) {
  const hw = name.match(/^(.*\bW)(\d)$/);          // Hiragino：W3 → W6
  if (hw) { const n = +hw[2] + (wt - BASE_W) / 100; return n >= 0 && n <= 9 ? [hw[1] + n] : []; }
  const m = name.match(WORD_RE);
  const stem = m ? name.slice(0, -m[0].length) : name;
  const sep = m ? m[1] : (/\s/.test(name) || !/[a-z][A-Z]|-/.test(name) ? ' ' : '-');
  return WEIGHT_WORDS[wt].map(w => stem + sep + w);
}
export const existsCache = new Map();
export function localExists(name) {
  if (!existsCache.has(name)) existsCache.set(name, new FontFace('__cf_probe', `local("${name.replace(/["\\]/g, '\\$&')}")`).load().then(() => true, () => false));
  return existsCache.get(name);
}
export const autoNames = new Map();       // 'font|weight' -> {name, status}
export function autoLocal(f, W) {
  const k = fontKey(f) + '|' + W;
  let a = autoNames.get(k);
  if (!a) {
    const cands = [...new Set(weightOrder(W).flatMap(wt => [f.name, ...(f.alt || [])].flatMap(n => nameAtWeight(n, wt))))];
    a = { name: cands[0] || f.name, status: 'checking' };
    autoNames.set(k, a);
    (async () => {
      for (const n of cands) if (await localExists(n)) { a.name = n; a.status = 'ok'; break; }
      if (a.status !== 'ok') a.status = 'guess';
      weightNamesChanged();
    })();
  }
  return a;
}
export function guessPath(file, W) {
  const m = file.match(/^(.*?)(\.[a-z0-9]+)$/i), stem = m ? m[1] : file, ext = m ? m[2] : '';
  const mm = stem.match(WORD_RE);
  return (mm ? stem.slice(0, -mm[0].length) + mm[1] : stem + '-') + WEIGHT_WORDS[W][0] + ext;
}
/* Actual static Google Fonts weights. Return null for unknown families, treating any 100-900 step as potentially available. */
export const gfWeights = fam => GF_WEIGHTS[fam] ? [...GF_WEIGHTS[fam]].map(d => d * 100) : null;
export function fontAtWeight(f, W, live = false) {
  if (!f || W === BASE_W) return f;
  if (f.kind === 'google') return G(f.family, Math.min(900, Math.max(100, f.weight + (W - BASE_W))));
  if (f.axis) return { ...f, weight: clampW((f.weight || 400) + (W - BASE_W), f.axis) };     // Variable local/uploaded font: use the same face at a different weight.
  const manual = state.weightNames[fontKey(f) + '|' + W];
  if (f.kind === 'local') return L(manual || autoLocal(f, W).name);
  if (f.kind === 'file') return live ? f : { kind: 'path', path: manual || guessPath(f.fileName, W), ...(f.italic ? { italPath: guessPath(f.italic.fileName, W) } : {}) };
  return f;
}
/* Column reset keeps the source and other axes, restoring only adjustable weight to the actual step nearest regular 400. */
export function defaultFontWeight(f) {
  if (!f) return null;
  const axis = vfAxisNow(f);
  if (Array.isArray(axis)) return clampW(BASE_W, axis);
  if (f.kind !== 'google') return null;
  const weights = gfWeights(f.family);
  return weights?.length ? weights.reduce((a, b) => Math.abs(b - BASE_W) < Math.abs(a - BASE_W) ? b : a) : BASE_W;
}
export const weightNamesChanged = debounce(() => { renderEditor(); renderExport(); if (state.view.weight !== BASE_W) rebuild(); }, 60);

/* ================= Resolve classes to actual font / size / baseline ================= */
export function rootOf(id, depth = 0) { const c = state.classes[id]; return c.follow && depth < 4 ? rootOf(c.follow, depth + 1) : id; }
/* Resolve settings at a weight. Following shares the font; size and baseline inherit only when not explicitly set.
   Use class settings at 400; derive other font weights by the same offset, then apply per-weight wOver values. */
export function ownFontAt(o, ov, W, live) {
  let font = o.font;
  if (font && W !== BASE_W && ov?.font) return ov.font;      // This weight explicitly uses a different font.
  if (font && W !== BASE_W) font = ov?.weight && (font.kind === 'google' || font.axis) ? (font.kind === 'google' ? G(font.family, ov.weight) : { ...font, weight: ov.weight }) : fontAtWeight(font, W, live);
  return font;
}
/* Trust only font metadata: manually declared local VF defaults, unknown families and unread axes cannot justify unchecking exports. */
export function knownWeightRange(f) {
  if (!f || f.axesUnknown || (f.kind === 'local' && f.axis && !f.axes?.some(a => a[0] === 'wght'))) return null;
  const axis = vfAxisNow(f);
  if (Array.isArray(axis)) return axis;
  const weights = f.kind === 'google' && gfWeights(f.family);
  return weights?.length ? [weights[0], weights.at(-1)] : null;
}
/* Check the requested actual weight, not resolveCls results already clamped to an axis endpoint. Explicit mappings/replacements use their row values.
   For static fonts, exclude only weights outside the full range; gaps inside it still use the existing nearest-weight rules. */
export function uncoveredWeights(weights) {
  const owners = [...CLASSES.filter(c => c.id === 'han' || EFF[c.id]?.length).map(c => [c.id, state.classes[c.id]]),
    ...state.custom.flatMap((o, i) => parseChars(o.chars).length ? [['#' + i, o]] : [])];
  return weights.filter(W => owners.some(([key, o]) => {
    for (let depth = 0; o?.follow && depth < 4; depth++) { key = o.follow; o = state.classes[key]; }
    if (!o?.font) return false;
    const ov = W === BASE_W ? null : state.wOver[W]?.[key], f = ov?.font || o.font, range = knownWeightRange(f);
    if (!range) return false;
    const weight = W === BASE_W || ov?.font ? (f.weight ?? BASE_W) : (ov?.weight ?? (f.weight ?? BASE_W) + W - BASE_W);
    return weight < range[0] || weight > range[1];
  }));
}
export function resolveObj(key, o, W = BASE_W, live = false, depth = 0) {
  const ov = W !== BASE_W ? state.wOver[W]?.[key] : null;
  if (o.follow && depth < 4) {
    const p = resolveCls(o.follow, W, live, depth + 1);
    return { font: p.font, size: ov?.size ?? o.size ?? p.size, shift: o.shift ?? p.shift, vary: p.vary };      // Following another class also follows its variation axes.
  }
  return { font: ownFontAt(o, ov, W, live), size: ov?.size ?? o.size ?? 100, shift: o.shift ?? 0, vary: o.vary || null };
}
export function resolveCls(id, W = BASE_W, live = false, depth = 0) { return resolveObj(id, state.classes[id], W, live, depth); }
export const resolveCustom = (cu, W = BASE_W, live = false) => resolveObj('#' + state.custom.indexOf(cu), cu, W, live);
export const objByKey = key => key[0] === '#' ? state.custom[+key.slice(1)] : state.classes[key];
/* Inherited values shown in grey in the table. */
export function inheritedSize(key, W) {
  const o = objByKey(key);
  if (W !== BASE_W && o.size != null) return o.size;
  return o.follow ? resolveCls(o.follow, W, true).size : 100;
}
export const inheritedShift = key => { const o = objByKey(key); return o.follow ? resolveCls(o.follow).shift : 0; };
export const ownSize = (key, W) => W === BASE_W ? objByKey(key).size : state.wOver[W]?.[key]?.size;
export function setSizeAt(key, W, v) {
  if (W === BASE_W) { objByKey(key).size = v; return; }
  if (v != null) { ((state.wOver[W] ||= {})[key] ||= {}).size = v; return; }
  const ov = state.wOver[W]?.[key]; if (!ov) return;      // Restore inheritance and remove empty override entries.
  delete ov.size;
  if (!Object.keys(ov).length) delete state.wOver[W][key];
  if (!Object.keys(state.wOver[W]).length) delete state.wOver[W];
}
export let customRanges = [];
export const refreshCustomRanges = () => { customRanges = state.custom.map(cu => parseChars(cu.chars)); };

export function ownerOf(cp) {
  for (let i = state.custom.length - 1; i >= 0; i--) if (customRanges[i]?.length && inRanges(customRanges[i], cp)) return '#' + i;
  return classOf(cp) || 'other';
}
export function settingOf(owner) {
  if (owner === 'other') return resolveCls('han');
  if (owner[0] === '#') return resolveCustom(state.custom[+owner.slice(1)]);
  return resolveCls(owner);
}
export const anyShift = () => CLASSES.some(c => resolveCls(c.id).shift) || state.custom.some(cu => resolveCustom(cu).shift);

/* Build the rule plan: unrestricted base font first, classes merged by (font, size, axes), then custom characters.
   ital builds the italic plan: use italics where available, otherwise upright; up means keep upright. */
export function buildPlan(W = BASE_W, live = false, ital = false) {
  const fin = r => ({ ...finalFont(r.font, r.vary, ital), size: r.size });
  const base = fin(resolveCls('han', W, live));
  const plan = [{ ...base, range: null, owners: ['han'] }];
  const gk = r => fontKey(r.font) + '|' + r.size + '|' + fvsKey(r.fvs);
  const groups = new Map();
  for (const c of CLASSES) {
    if (c.id === 'han') continue;
    const r = fin(resolveCls(c.id, W, live));
    if (gk(r) === gk(base)) { plan[0].owners.push(c.id); continue; }
    let g = groups.get(gk(r));
    if (!g) groups.set(gk(r), g = { ...r, range: [], owners: [] });
    g.range = union(g.range, EFF[c.id]); g.owners.push(c.id);
  }
  plan.push(...groups.values());
  state.custom.forEach((cu, i) => {
    const rng = customRanges[i] || [];
    if (!rng.length) return;
    const r = resolveCustom(cu, W, live);
    if (!r.font) return;
    plan.push({ ...fin(r), range: rng, owners: ['#' + i] });
  });
  return plan;
}
/* ================= Continuous weights: segments by step =================
   All classes share identical font-weight ranges; inconsistent descriptors break composite fonts in Chrome.
   Variable fonts reuse the same file in every segment and vary smoothly within it; static fonts use the nearest step per segment.
   Merge adjacent segments when every class matches. All-variable fonts with weight-independent sizes therefore yield one segment.
   Export only state.wrange; browsers resolve page weights outside it to the nearest segment. */
export function contFont(f) {
  if (!f) return f;
  if (f.kind === 'google') {
    if (Array.isArray(vfAxisNow(f))) return { ...f, weight: 400, vf: true };
    const aw = sources.get(fontKey(f))?.actualWeight;      // The weight actually returned when the requested step is unavailable; matching results can merge into one segment.
    return aw && aw !== f.weight ? { ...f, weight: aw } : f;
  }
  return f.axis ? { ...f, weight: undefined, cont: true } : f;
}
/* This step's continuous weight interval, intersected with the export range; null when outside it. */
export function stepSpan(W) {
  const [a, b] = state.wrange, lo = Math.max(a, W === 100 ? 100 : W - 49), hi = Math.min(b, W === 900 ? 900 : W + 50);
  return lo <= hi ? [lo, hi] : null;
}
export function buildSegments(live = false, skipBase = false) {      // skipBase excludes the Han base from segmentation when linked through @import.
  const segs = [];
  for (const W of WEIGHTS) {
    const span = stepSpan(W);
    if (!span) continue;
    const cf = pl => pl.map(p => ({ ...p, font: contFont(p.font) }));
    const plan = cf(buildPlan(W, live)), iplan = state.italic ? cf(buildPlan(W, live, true)) : null;
    const k = pl => pl.slice(skipBase ? 1 : 0).map(p => `${fontKey(p.font)}|${p.size}|${fvsKey(p.fvs)}|${p.owners.join(',')}`).join(';');
    const key = k(plan) + (iplan ? '/' + k(iplan) : '');
    const last = segs[segs.length - 1];
    if (last && last.key === key) last.hi = span[1]; else segs.push({ lo: span[0], hi: span[1], W, plan, iplan, key });
  }
  return segs;
}
/* Used variable fonts and their weight ranges, which determine the export range's Widest / Common buttons. */
export function vfAxes() {
  const m = new Map();
  for (const W of WEIGHTS) for (const p of buildPlan(W)) {
    const f = p.font, axis = vfAxisNow(f);
    if (Array.isArray(axis)) m.set(f.family || f.name || f.fileName, axis);
  }
  return [...m];
}
export function expandPlan(plan, live) {
  const out = [];
  for (const p of plan) {
    const s = sources.get(fontKey(p.font));
    if (!s || s.status !== 'ok') {
      if (!live && p.font && p.font.kind !== 'google') out.push({ p, face: { fallback: true }, range: p.range });
      else out.push({ p, missing: true, status: s?.status || 'loading' });
      continue;
    }
    for (const fc of s.faces) {
      let range = p.range;
      if (fc.range) range = range ? intersect(range, fc.range) : fc.range;
      if (range && !range.length) continue;
      out.push({ p, face: fc, range });
    }
  }
  return out;
}

/* ================= Live preview fonts ================= */
export let gen = 0, liveFaces = [], liveFamily = '';
export function loadText() {
  return (state.view.text.slice(0, 2500) + '国Hxg' + CLASSES.map(c => c.sample).join('') + state.custom.map(c => c.chars).join(''));
}
export async function rebuildNow() {
  const my = ++gen, W = state.view.weight, cont = state.wmode === 'cont';
  /* Stepped mode builds only the current step; continuous mode builds every segment and lets the preview slider choose the weight. */
  const segs = cont ? buildSegments(true) : [{ lo: W, hi: W, plan: buildPlan(W, true), iplan: state.italic ? buildPlan(W, true, true) : null }];
  setBusy(T('loading'));
  await Promise.all(segs.flatMap(sg => [...sg.plan, ...(sg.iplan || [])].map(p => source(p.font).promise)));
  if (lmOn()) await Promise.all(segs.map(sg => ensureLineMetrics(sg.plan[0].font)));
  if (my !== gen) return;
  const fam = `__cf_live_${my}`;
  const faces = [];
  for (const sg of segs) for (const [pl, style] of [[sg.plan, 'normal'], [sg.iplan, 'italic']]) {
    if (!pl) continue;
    for (const x of expandPlan(italFallback(pl), true)) {
      if (x.missing) continue;
      /* Declare and preview the current weight so system fallback glyphs, such as Simplified Chinese missing from a Japanese font, follow the same weight. */
      const d = { display: 'swap', weight: sg.lo === sg.hi ? String(W) : `${sg.lo} ${sg.hi}`, style };
      const fvs = fvsOf(x.p, W, cont);
      if (fvs) d.variationSettings = fvs;
      if (x.range) d.unicodeRange = fmtRanges(x.range);
      if (x.p.size !== 100) d.sizeAdjust = `${x.p.size}%`;
      const ov = x.p !== pl[0] && overridesFor(x.p, sg.plan[0]);
      if (ov) Object.assign(d, { ascentOverride: ov.ascent, descentOverride: ov.descent, lineGapOverride: ov.lineGap });
      try { faces.push(new FontFace(fam, x.face.buffer || x.face.src, d)); } catch (e) { /* Ignore invalid rules. */ }
    }
  }
  faces.forEach(f => document.fonts.add(f));
  const hanSrc = sources.get(fontKey(usedFont(resolveCls('han', state.view.weight, true))));
  const loads = [document.fonts.load(`32px "${fam}"`, loadText())];
  if (hanSrc?.status === 'ok') loads.push(document.fonts.load(`32px "${hanSrc.family}"`, '国Hx'));
  try { await Promise.race([Promise.allSettled(loads), sleep(6000)]); } catch (e) { /* Keep displaying the preview when some fonts fail to load. */ }
  if (my !== gen) { faces.forEach(f => document.fonts.delete(f)); return; }
  const old = liveFaces;
  liveFaces = faces; liveFamily = fam;
  root.style.setProperty('--cf', `"${fam}"`);
  requestAnimationFrame(fitGlyphs);      // Changing fonts can change the class-table sample widths.
  root.style.setProperty('--fw', cont ? state.view.wcont : W);
  old.forEach(f => document.fonts.delete(f));
  refreshVAutospace();      // Changing fonts can change vertical column breaks.
  setBusy('');
  drawSpecimen();
  renderExport();
  checkMissSoon();
}
export const rebuild = debounce(rebuildNow, 70);
/* ================= Line metrics =================
   A composite font's normal line height and baseline position come from the rule owning spaces: Western text, after size-adjust scaling.
   Give non-base rules the Han base font's ascent, descent and line gap so the composite uses Han line metrics.
   Overrides are multiplied by size-adjust, so divide them first. Google families share metrics across weights; cache once per family. */
export const LM = new Map();
export const lmKey = f => f.kind === 'google' ? 'g:' + f.family : fontKey(f);
export const lmOn = () => state.lineMetrics !== 'off';
export async function ensureLineMetrics(f) {
  if (!f) return null;
  const key = lmKey(f);
  if (LM.has(key)) return LM.get(key);
  const s = source(f);
  await s.promise;
  if (s.status !== 'ok' || LM.has(key)) return LM.get(key) || null;
  try { await document.fonts.load(`100px "${s.family}"`, '国'); } catch (e) { /* Measure normally. */ }
  const c = document.createElement('canvas').getContext('2d');
  c.font = `100px "${s.family}"`;
  const m = c.measureText('国'), a = m.fontBoundingBoxAscent / 100, d = m.fontBoundingBoxDescent / 100;
  const el = document.createElement('div');      // Line gap: line-height: normal minus ascent + descent.
  el.style.cssText = `position:absolute;visibility:hidden;left:-9999px;white-space:nowrap;font:100px/normal "${s.family}"`;
  el.textContent = '国';
  document.body.append(el);
  const g = Math.max(0, el.getBoundingClientRect().height / 100 - a - d);
  el.remove();
  const lm = a > 0 ? { a, d, g } : null;
  LM.set(key, lm);
  return lm;
}
/* Metric overrides for a non-base rule; base is this group's Han base rule, including its own size adjustment. */
export function overridesFor(p, base) {
  const lm = lmOn() && p.range && base?.font && LM.get(lmKey(base.font));
  if (!lm) return null;
  const k = (base.size || 100) / p.size, f = x => `${+(x * 100 * k).toFixed(2)}%`;
  return { ascent: f(lm.a), descent: f(lm.d), lineGap: f(lm.g) };
}
/* If an italic file fails to load, for example an unavailable Google weight, use upright for that rule. */
export function italFallback(pl) {
  return pl.map(p => p.font?.kind === 'google' && p.font.ital && sources.get(fontKey(p.font))?.status === 'error'
    ? { ...p, font: (({ ital, ...rest }) => rest)(p.font), up: true } : p);
}
export function onSourcesChanged() {
  if (!$('#editor').contains(document.activeElement)) renderEditor(); else renderChipsStatus();
  renderExportSoon(); renderPresetCardsSoon(); checkMissSoon();
}
export function setBusy(t) { $('#busy').textContent = t; }
