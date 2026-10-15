'use strict';
/* ================= 字体来源 ================= */
const G = (family, weight = 400) => ({ kind: 'google', family, weight });
const L = (name, alt = []) => ({ kind: 'local', name, alt });
/* Google Fonts 的字体对象：ital = 斜体文件，xa = 文件里要保留的其他轴（粗细以外，例如 opsz、wdth），vf = 整个粗细轴 */
function fontKey(f) {
  if (!f) return 'none';
  if (f.kind === 'google') return `g:${f.family}@${f.vf ? 'vf' : f.weight}${f.ital ? 'i' : ''}${f.xa?.length ? '+' + f.xa.join(',') : ''}`;
  return f.kind === 'local' ? `l:${f.name}` : f.kind === 'path' ? `p:${f.path}` : `f:${f.fileId}`;
}
const sameFont = (a, b) => fontKey(a) === fontKey(b);
const fontLabel = f => !f ? T('unset') : f.kind === 'google' ? `${f.family}${f.ital ? ' Italic' : ''} ${f.vf ? 'VF' : sources.get(fontKey(f))?.actualWeight || f.weight}` : (f.kind === 'local' ? f.name : f.kind === 'path' ? f.path : f.fileName) + (f.axis ? ` ${f.weight || 400}` : '');
const kindLabel = f => !f ? '' : f.kind === 'google' ? T('kindGoogle') : f.kind === 'local' ? T('kindLocal') : T('kindFile');
const localSrc = f => [...new Set([f.name, ...(f.alt || [])])].map(n => `local("${n.replace(/["\\]/g, '\\$&')}")`).join(', ');

const LOCAL_COMMON = [
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
const localAlt = new Map(LOCAL_COMMON.map(([n, ps]) => [n, ps]));
const GF_LIST = ['Noto Sans SC', 'Noto Serif SC', 'Noto Sans TC', 'Noto Serif TC', 'Noto Sans HK', 'Noto Sans JP', 'Noto Serif JP', 'Noto Sans KR', 'Noto Serif KR',
  'LXGW WenKai TC', 'Shippori Mincho', 'Zen Old Mincho', 'Zen Kaku Gothic New', 'Zen Maru Gothic', 'BIZ UDPGothic', 'BIZ UDPMincho', 'M PLUS 2', 'Klee One',
  'ZCOOL XiaoWei', 'Ma Shan Zheng', 'Inter', 'IBM Plex Sans', 'IBM Plex Serif', 'Source Sans 3', 'Source Serif 4', 'EB Garamond', 'Cormorant Garamond',
  'Libre Caslon Text', 'Libre Baskerville', 'Crimson Pro', 'Lora', 'Newsreader', 'Literata', 'Spectral', 'Fraunces', 'Playfair Display', 'DM Sans',
  'Work Sans', 'Manrope', 'Instrument Sans', 'Instrument Serif', 'Roboto', 'Roboto Serif', 'Lato', 'Open Sans', 'Montserrat', 'Jost', 'JetBrains Mono', 'IBM Plex Mono'];

const files = new Map();          // fileId -> {name, buffer}
const sources = new Map();        // fontKey -> {status, faces, family, error, promise}
let srcSeq = 0;

function source(f, { retry = false } = {}) {
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
class SrcError extends Error { constructor(key, params) { super(key); this.key = key; this.params = params; } }
async function loadSource(s) {
  const f = s.font;
  try {
    if (!f) throw new SrcError('errUnset');
    if (f.kind === 'google') {
      let css = null;
      if (f.vf) {               // 连续字重模式：整个可变字体文件，粗细交给元素的 font-weight
        const axis = await vfAxis(f.family);
        if (axis) { try { css = await fetchGoogleCss(f.family, gfSpec(f, `${axis[0]}..${axis[1]}`)); s.axis = axis; } catch (e) { /* 退回静态 */ } }
      } else if (f.weight % 100) {     // 非整百的粗细只有可变字体能做到：按轴的范围请求，拿到完整的可变字体文件
        const axis = await vfAxis(f.family);
        if (axis) {
          try { css = await fetchGoogleCss(f.family, gfSpec(f, `${axis[0]}..${axis[1]}`)); s.wght = clampW(f.weight, axis); s.actualWeight = s.wght; s.axis = axis; } catch (e) { /* 退回静态字重 */ }
        }
      }
      if (!css) for (const w of weightChain(Math.round(f.weight / 100) * 100)) {    // 没有这个字重时，向 400 方向找最接近的
        try { css = await fetchGoogleCss(f.family, gfSpec(f, w)); s.actualWeight = w; break; } catch (e) { /* 试下一个字重 */ }
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
      catch (e) { throw new SrcError(f.kind === 'local' ? 'errLocal' : 'errFileBad'); }
    }
    s.status = 'ok';
  } catch (e) {
    s.status = 'error';
    s.errKey = e instanceof SrcError ? e.key : 'errLoad';
    s.errParams = e instanceof SrcError ? e.params : null;
  }
  onSourcesChanged();
}
const srcError = s => T(s.errKey || 'errLoad', s.errParams);
/* css2 的轴写法，例如「ital,opsz,wght@1,8..144,400」：小写的注册轴在前、大写的自定义轴在后，各自按字母排序。
   没写进来的轴，Google 会固定在默认值并从文件里去掉 */
function gfSpec(f, wght) {
  const parts = [['wght', String(wght)]];
  if (f.ital) parts.push(['ital', '1']);
  for (const t of f.xa || []) { const a = axisOf(f, t); if (a) parts.push([t, `${a[1]}..${a[2]}`]); }
  const lower = t => t === t.toLowerCase();
  parts.sort(([a], [b]) => lower(a) !== lower(b) ? (lower(a) ? -1 : 1) : a < b ? -1 : 1);
  return parts.map(x => x[0]).join(',') + '@' + parts.map(x => x[1]).join(',');
}
async function fetchGoogleCss(family, spec) {
  const fam = encodeURIComponent(family.trim()).replace(/%20/g, '+'), sp = String(spec).includes('@') ? spec : `wght@${spec}`;
  const urls = [`https://fonts.googleapis.com/css2?family=${fam}:${sp}&display=swap`];
  if (sp === 'wght@400') urls.push(`https://fonts.googleapis.com/css2?family=${fam}&display=swap`);
  for (const url of urls) {
    try { const r = await fetch(url); if (r.ok) return await r.text(); continue; }
    catch (e) { /* fetch 可能被 CSP 拦截，改用 <link> 读取 */ }
    try { return await cssViaLink(url); } catch (e) { /* 下一个 url */ }
  }
  throw new SrcError('errGoogle', { family, weight });
}
/* ================= 可变字体 ================= */
const clampW = (w, axis) => Math.min(axis[1], Math.max(axis[0], Math.round(w)));
/* Google Fonts 只在请求的范围落在字体的 wght 轴内时才返回 200：先试 100..900，不行再逐点试出上下界。结果存在浏览器里 */
const LS_VF = 'composite-font:vf';
const vfCache = lsGet(LS_VF) || {}, vfPending = new Map();
const gfOk = (family, spec) => fetchGoogleCss(family, spec).then(() => true, () => false);
/* 内置元数据里有的字体族直接用它的 wght 轴，不用在线检测 */
const seedVf = family => { const a = axisOf({ kind: 'google', family }, 'wght'); vfCache[family] = a ? [a[1], a[2]] : 0; };
function vfAxis(family) {
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
/* 同步查询：已知时返回 [min, max] 或 null；未知时返回 undefined 并在后台检测 */
function vfAxisNow(f) {
  if (!f) return null;
  if (f.kind !== 'google') return f.axis || null;
  if (!(f.family in vfCache) && GF_AXES[f.family]) seedVf(f.family);
  if (f.family in vfCache) return vfCache[f.family] || null;
  vfAxis(f.family);
  return undefined;
}
/* 规则里的 font-weight 永远是这一档（保持一致，复合字体才不会出错）；实际粗细不同时，用 font-variation-settings 细调 */
/* ================= 其他可变轴、斜体 ================= */
/* 字体的可变轴：[[标签, 最小, 最大, 默认], …]。Google Fonts 查内置的元数据，字体文件和本机字体读 fvar 表 */
const gfAxesMemo = new Map();
function axesOf(f) {
  if (!f) return [];
  if (f.kind !== 'google') return f.axes || (f.axis ? [['wght', f.axis[0], f.axis[1], 400]] : []);
  if (!gfAxesMemo.has(f.family)) gfAxesMemo.set(f.family, (GF_AXES[f.family] || '').split(',').filter(Boolean).map(a => { const [t, ...n] = a.split(' '); return [t, ...n.map(Number)]; }));
  return gfAxesMemo.get(f.family);
}
const axisOf = (f, tag) => axesOf(f).find(a => a[0] === tag);
const extraAxes = f => axesOf(f).filter(a => !(a[0] === 'wght' && a[2] > 10) && a[0] !== 'ital');     // 粗细和斜体另有专门的设定
const AX_LABEL = { wdth: { zh: '宽度', ja: '幅', tw: '寬度' }, opsz: { zh: '光学尺寸', ja: 'オプティカルサイズ', tw: '光學尺寸' }, slnt: { zh: '倾斜', ja: '傾き', tw: '傾斜' }, GRAD: { zh: '笔画粗细', ja: 'グレード', tw: '筆畫粗細' } };
const axisLabel = t => AX_LABEL[t] ? tr(AX_LABEL[t]) : AXIS_NAMES[t] || t;
/* 斜体时用的字体。Google Fonts 和上传的斜体文件用真正的斜体；有 slnt / ital 轴的可变字体倾斜过去；
   本机字体按名称找「… Italic」。都没有时返回 null：这个类别在斜体里保持正体 */
function italOf(f) {
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
const italNames = new Map();       // 本机字体名 → 斜体的名称；null = 没有，undefined = 检测中
function italicLocal(f) {
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
/* 字体 + 这个类别的轴设定 → 实际写进规则的字体、固定的轴值（font-variation-settings）。
   vary：{ 标签: 数值 | 'auto' }，'auto' 只用于 opsz（跟随字号） */
function finalFont(f, vary, ital = false) {
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
/* 实际加载的字体（带上要保留的轴）：查加载状态时用它，不用类别上原始的字体 */
const usedFont = r => finalFont(r.font, r.vary).font;
const fvsKey = fvs => fvs ? Object.entries(fvs).sort().map(([t, v]) => `${t}=${v}`).join(',') : '';
/* 规则里的 font-variation-settings：细调的粗细（连续字重时不写）+ 固定的轴值 */
function fvsOf(p, W, cont) {
  const parts = [], wv = cont ? null : wghtFor(p.font, W);
  if (wv) parts.push(`"wght" ${wv}`);
  for (const [t, v] of Object.entries(p.fvs || {}).sort()) parts.push(`"${t}" ${v}`);
  return parts.join(', ');
}
function wghtFor(f, W) {
  if (!f) return null;
  const w = f.kind === 'google' ? sources.get(fontKey(f))?.wght : f.axis ? (f.weight || 400) : null;
  return w && w !== W ? w : null;
}
/* 上传的字体里的可变轴（fvar 表）：[[标签, 最小, 最大, 默认], …]。ttf / otf 直接读；woff 的表用 zlib 压缩，解压后读；
   woff2 用 brotli 压缩，浏览器解不开，只能看到有没有 fvar：这时按 wght 100–900 处理，其他轴读不出来（unknown） */
function readFvar(v, off) {
  const axesOff = v.getUint16(off + 4), count = v.getUint16(off + 8), size = v.getUint16(off + 10), out = [];
  for (let a = 0; a < count; a++) {
    const q = off + axesOff + a * size, fx = o => Math.round(v.getInt32(q + o) / 655.36) / 100;
    out.push([String.fromCharCode(v.getUint8(q), v.getUint8(q + 1), v.getUint8(q + 2), v.getUint8(q + 3)), fx(4), fx(12), fx(8)]);
  }
  return out;
}
async function fileAxes(buf) {
  try {
    const v = new DataView(buf);
    let sig = v.getUint32(0), base = 0;
    if (sig === 0x74746366) { base = v.getUint32(12); sig = v.getUint32(base); }      // 'ttcf' 字体集：读第一个字体
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
  } catch (e) { /* 读不懂就当作普通字体 */ }
  return null;
}
/* 把读到的轴记到字体对象上：wght 轴另外记成 axis（粗细的范围） */
function setFontAxes(f, fa, W) {
  delete f.axis; delete f.axes; delete f.axesUnknown;
  if (!fa) return f;
  f.axes = fa.axes; if (fa.unknown) f.axesUnknown = true;
  const w = fa.axes.find(a => a[0] === 'wght' && a[2] > 10);      // Skia 之类不按 CSS 刻度（0.48–3.2）的 wght 轴当作普通的轴
  if (w) { f.axis = [w[1], w[2]]; f.weight = clampW(W || f.weight || 400, f.axis); }
  return f;
}
function weightChain(w) { const out = [w]; for (let x = w; x !== 400;) { x += x > 400 ? -100 : 100; out.push(x); } return out; }
function cssViaLink(url) {
  return new Promise((res, rej) => {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.crossOrigin = 'anonymous'; l.href = url; l.media = 'print';
    l.onload = () => { try { const css = [...l.sheet.cssRules].map(r => r.cssText).join('\n'); l.remove(); res(css); } catch (e) { l.remove(); rej(e); } };
    l.onerror = () => { l.remove(); rej(new Error('load')); };
    document.head.append(l);
  });
}
function parseFontFaceCss(css) {
  const faces = [], re = /@font-face\s*{([^}]*)}/g; let m;
  while ((m = re.exec(css))) {
    const src = /src:\s*([^;]+);?/.exec(m[1]);
    const ur = /unicode-range:\s*([^;]+);?/.exec(m[1]);
    if (src) faces.push({ src: src[1].trim(), range: ur ? parseRanges(ur[1]) : null });
  }
  return faces;
}

/* ================= 示例、属性、预设 ================= */
const SAMPLES = {
  /* 正文示例按真实的中日文写：西文是日常文章里自然会出现的品牌、产品、缩写和单位（iPhone、5G、UI、km）。
     特意放进几种挤在一起的写法：「2026年，增长了12.5%（GMV…）」「人工智能（AI）」「她说：“……”」，
     日文对应「前年比12.5%増（…約1,200店）」「人工知能（AI）」「「……（予想の1.5倍）……」と話す」 */
  zh: { label: { zh: '简体', ja: '簡体', tw: '簡體' }, lang: 'zh-Hans', text:
`清晨6点半，第一班地铁驶出西直门站。车厢里人还不多，有人戴着AirPods听播客，有人用iPhone回复微信消息。这条线路全长27.6公里，共有19座车站，工作日客流量超过80万人次。

2026年，北京独立咖啡馆的数量增长了12.5%（GMV同比增长约20%），不少店开始用人工智能（AI）排班和订货。车站旁新开的这家只卖三样：美式18元，拿铁22元，换燕麦奶加3元，也可以在App上提前下单。营业时间写在门口的小黑板上——工作日7:30开门，周末晚半小时；Wi-Fi密码贴在收银台旁边。

店主林晓以前在一家SaaS公司做UI设计。她说：“开业第一个月卖出了4000多杯（比预想的多了一半）。来的大多是熟客……慢一点也没关系。”` },
  ja: { label: { zh: '日文', ja: '日本語', tw: '日文' }, lang: 'ja', text:
`朝6時半、始発の電車が駅を出る。車内はまだ空いていて、AirPodsでポッドキャストを聴く人や、iPhoneでLINEを返す人がいる。この路線は全長27.6km、駅は19か所。平日には1日80万人以上が利用する。

2026年、都内の個人経営カフェは前年比12.5%増（新規開業は約1,200店）。人工知能（AI）で発注やシフトを組む店も増えている。駅前のこの店のメニューは3つだけで、ドリップコーヒーが450円、カフェラテが520円、オーツミルクへの変更は＋50円。営業時間は平日7:30〜19:00、Wi-Fiのパスワードはレジの横に貼ってある。

店主の林さんは以前、SaaS企業でUIデザイナーをしていた。「開店から1か月で4,000杯以上（予想の1.5倍）が売れました。来てくれるのは、ほとんど常連さんです」と話す。` },
  /* 台湾、香港：同样的内容按各自的用语写。台湾用「」作引号、「人工智慧」「營收年增」；香港夹着粤语字（嘅、咗、嚟、啲、冇），价格写 $ */
  tw: { label: { zh: '繁体TW', ja: '繁体TW', tw: '繁體TW' }, lang: 'zh-Hant-TW', text:
`早上6點半，第一班捷運從終點站開出。車廂裡人還不多，有人戴著AirPods聽Podcast，有人用iPhone回LINE訊息。這條路線全長27.6公里，共有19個車站，平日運量超過80萬人次。

2026年，台北獨立咖啡店的數量成長了12.5%（營收年增約20%），不少店家開始用人工智慧（AI）排班和叫貨。車站旁新開的這家只賣三樣：美式70元、拿鐵90元，換燕麥奶加15元，也可以用App預先點餐。營業時間寫在門口的小黑板上——平日7:30開門，週末晚半小時；Wi-Fi密碼貼在櫃檯旁邊。

店長林曉以前在一家SaaS公司做UI設計。她說：「開幕第一個月賣出了4,000多杯（比預期多了一半），來的大多是熟客……慢一點也沒關係。」` },
  hk: { label: { zh: '繁体HK', ja: '繁体HK', tw: '繁體HK' }, lang: 'zh-Hant-HK', text:
`早上6時半，第一班港鐵列車駛出總站。車廂內人不多，有人戴着AirPods聽Podcast，有人用iPhone覆WhatsApp。這條路線全長27.6公里，設有19個車站，平日客量超過80萬人次。

2026年，本港獨立咖啡店數目增加了12.5%（營業額按年升約20%），不少店舖開始用人工智能（AI）編更和訂貨。車站旁新開的這間只賣三款：Americano $38、Latte $42，轉燕麥奶加$5，亦可以用App預先落單。營業時間寫在門口的小黑板上——平日7:30開門，週末遲半小時；Wi-Fi密碼貼在收銀處旁邊。

店主林曉以前在一間SaaS公司做UI設計。佢話：「開業頭一個月賣咗4,000幾杯（比預期多咗一半），嚟嘅大多係熟客……慢啲都冇所謂。」` },
  /* 吹き出しのように括弧なし・句点なしで短く改行し、空行で吹き出しを分ける */
  manga: { label: { zh: '漫画对白', ja: 'マンガ', tw: '漫畫對白' }, lang: 'ja', text:
`なんだって！？
そんな馬鹿な
話があるか…

ここは危険だ
早く逃げろ！！

待ってくれ！
まだ３人いるんだ

……１分だけ待つ` },
  chars: { label: { zh: '字符表', ja: '文字表', tw: '字元表' }, lang: 'zh-Hans', text:
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

/* CSS 原生排版属性。sup：各浏览器开始支持的版本（MDN browser-compat-data，2026-10） */
/* 高级排版属性的示意图卡片：段落用横条、汉字用小方块画，虚线是版心边缘。选中时跟着变成黑色 */
const tSvg = body => `<svg class="tt-svg" viewBox="0 0 48 30" aria-hidden="true">${body}</svg>`;
const tBars = rows => rows.map(([x, w, y]) => `<rect x="${x}" y="${y}" width="${w}" height="3" rx=".6"/>`).join('');
const tEdge = (...xs) => xs.map(x => `<path d="M${x} 1v28" class="tt-edge"/>`).join('');
/* text-justify：一行「汉字 汉字 word 汉字 汉字」，多出来的 8 个单位分给哪些空隙 */
const tJust = gaps => {
  const w = [4, 4, 10, 4, 4]; let x = 4, out = '';
  w.forEach((ww, i) => { out += ww === 10 ? `<rect x="${x}" y="9.5" width="10" height="2.5" rx=".6"/>` : `<rect x="${x}" y="8" width="4" height="4" rx=".4"/>`; x += ww + (gaps[i] ?? 0); });
  return out + `<rect x="4" y="18" width="4" height="4" rx=".4"/><rect x="9" y="18" width="4" height="4" rx=".4"/>` + tEdge(44.5);
};
const TILE_SVG = {
  wrap: { wrap: tBars([[4, 40, 4], [4, 40, 11], [4, 40, 18], [4, 5, 25]]), pretty: tBars([[4, 40, 4], [4, 40, 11], [4, 31, 18], [4, 14, 25]]), balance: tBars([[4, 34, 4], [4, 34, 11], [4, 34, 18], [4, 31, 25]]) },
  align: { justify: tBars([[4, 40, 4], [4, 40, 11], [4, 40, 18], [4, 22, 25]]), start: tBars([[4, 36, 4], [4, 40, 11], [4, 31, 18], [4, 22, 25]]), center: tBars([[8, 32, 4], [4, 40, 11], [10, 28, 18], [13, 22, 25]]) },
  hang: {
    none: tBars([[6, 30, 6], [6, 34, 14], [6, 20, 22]]) + '<circle cx="38.5" cy="8" r="1.4"/>' + tEdge(5.5, 41.5),
    'allow-end': tBars([[6, 35, 6], [6, 34, 14], [6, 20, 22]]) + '<circle cx="43.5" cy="8" r="1.4"/>' + tEdge(5.5, 41.5),
    'first allow-end last': tBars([[6, 35, 6], [6, 34, 14], [6, 35, 22]]) + '<circle cx="43.5" cy="8" r="1.4"/><path d="M4.6 5.2H2.6V9.6" class="tt-mark"/><path d="M42.8 20v4.4h2" class="tt-mark"/>' + tEdge(5.5, 41.5),
  },
};
TILE_SVG.justify = { auto: tJust([3, 4, 4, 3]), 'inter-character': tJust([3, 4, 4, 3]), 'inter-word': tJust([1, 6, 6, 1]), none: tJust([1, 2, 2, 1]) };
const tSvgTile = key => v => `<span class="tt-s tt-pic" aria-hidden="true">${tSvg(TILE_SVG[key][v])}</span>`;
/* 换行、标点挤压：用当前的合成字体，在窄框里真的排一段，左边的线是版心边缘 */
const tBox = (prop, text, lang) => v => `<span class="tt-s tt-box"${lang ? ` lang="${lang}"` : ''} style="${prop}:${v}" aria-hidden="true">${text}</span>`;
const TYPO = [
  { key: 'lang', label: { zh: '语言', ja: '言語', tw: '語言' }, prop: 'lang', attr: true, def: 'zh-Hans',
    values: [['zh-Hans', { zh: '简体中文', ja: '簡体字中国語', tw: '簡體中文' }], ['zh-Hant-TW', { zh: '繁體中文（台灣）', ja: '繁体字中国語（台湾）', tw: '繁體中文（台灣）' }], ['zh-Hant-HK', { zh: '繁體中文（香港）', ja: '繁体字中国語（香港）', tw: '繁體中文（香港）' }], ['ja', { zh: '日本語', ja: '日本語', tw: '日本語' }], ['ko', { zh: '한국어', ja: '韓国語', tw: '한국어' }], ['en', { zh: 'English', ja: '英語', tw: 'English' }]],
    note: { zh: 'HTML 的 lang 属性，不是 CSS。它决定字形的地区变体、禁则规则，word-break: auto-phrase 也依赖它。', ja: 'HTML の lang 属性で、CSS ではありません。字形の地域差や禁則を決め、word-break: auto-phrase もこれに依存します。', tw: 'HTML 的 lang 屬性，不是 CSS。它決定字形的地區變體、禁則規則，word-break: auto-phrase 也依賴它。' } },
  { key: 'autospace', label: { zh: '中西间距', ja: '和欧間のアキ', tw: '中西文間距' }, prop: 'text-autospace', def: 'normal', always: true, tiles: '字Ab字12字', tileW: 112, tileFs: 18, tileCode: true,
    sup: { chrome: '140', firefox: '145', safari: '18.4' },
    values: [['normal', { zh: '加 1/8 em', ja: '1/8 em 空ける', tw: '加 1/8 em' }], ['no-autospace', { zh: '不加', ja: '空けない', tw: '不加' }], ['ideograph-alpha', { zh: '只在字母旁', ja: '英字の前後のみ', tw: '只在字母旁' }], ['ideograph-numeric', { zh: '只在数字旁', ja: '数字の前後のみ', tw: '只在數字旁' }], ['auto', { zh: '由浏览器决定', ja: 'ブラウザに任せる', tw: '由瀏覽器決定' }]],
    note: { zh: '只在没有空格的地方加，已经手动敲了空格的不会再加。Chrome 实测初始值是 no-autospace，所以导出时总会写出这一行。', ja: 'スペースのない箇所にだけ入り、手で入れたスペースには追加されません。Chrome の実際の初期値は no-autospace なので、書き出しでは常にこの行を出力します。', tw: '只在沒有空格的地方加，已經手動敲了空格的不會再加。Chrome 實測初始值是 no-autospace，所以匯出時總會寫出這一行。' } },
  { key: 'trim', label: { zh: '标点挤压', ja: '約物の詰め', tw: '標點擠壓' }, prop: 'text-spacing-trim', def: 'space-first', init: 'normal', tiles: true, tileHtml: tBox('text-spacing-trim', '「甲乙」「丙丁」'), tileW: 112, tileCode: true,
    sup: { chrome: '123', firefox: '—', safari: '—' },
    values: [['normal', { zh: '相邻标点挤压，行首不挤', ja: '隣接する約物を詰める。行頭は詰めない', tw: '相鄰標點擠壓，行首不擠' }], ['space-all', { zh: '全部保持全角', ja: 'すべて全角のまま', tw: '全部保持全形' }], ['space-first', { zh: '行首也挤压，段首行除外', ja: '行頭も詰める（段落の 1 行目を除く）', tw: '行首也擠壓，段首行除外' }], ['trim-start', { zh: '行首也挤压，包括段首行', ja: '行頭も詰める（1 行目を含む）', tw: '行首也擠壓，包括段首行' }]],
    note: { zh: '例如「。」」连在一起时，其中一个收成半角。目前只有 Chromium 实现。', ja: 'たとえば「。」」が続くと片方が半角になります。現在は Chromium だけが実装しています。', tw: '例如「。」」連在一起時，其中一個收成半形。目前只有 Chromium 實作。' } },
  { key: 'wordBreak', label: { zh: '换行单位', ja: '改行の単位', tw: '換行單位' }, prop: 'word-break', def: 'normal', tiles: true, tileHtml: tBox('word-break', '美しい日本語の文章', 'ja'), tileW: 112, tileCode: true,
    sup: { chrome: '119', firefox: '—', safari: '—' },
    values: [['normal', { zh: '逐字', ja: '1 文字ずつ', tw: '逐字' }], ['auto-phrase', { zh: '按词组', ja: '文節単位', tw: '按詞組' }]],
    note: { zh: 'auto-phrase 只对 lang="ja" 和 lang="ko" 生效，适合标题和短文。', ja: 'auto-phrase は lang="ja" と lang="ko" でのみ有効で、見出しや短い文に向いています。', tw: 'auto-phrase 只對 lang="ja" 和 lang="ko" 生效，適合標題和短文。' } },
  { key: 'lineBreak', label: { zh: '禁则', ja: '禁則', tw: '禁則' }, prop: 'line-break', def: 'strict', init: 'auto',
    sup: { chrome: '58', firefox: '69', safari: '11' },
    values: [['auto', null], ['loose', { zh: '宽松', ja: 'ゆるい', tw: '寬鬆' }], ['normal', null], ['strict', { zh: '严格', ja: '厳しい', tw: '嚴格' }], ['anywhere', { zh: '任意处断行', ja: 'どこでも改行', tw: '任意處斷行' }]],
    note: { zh: '哪些字不能放在行首或行尾，例如句号、逗号不放在行首。auto 由浏览器按语言决定；strict 更严格，小写假名（っ、ゃ）和长音「ー」也不放行首，日文正文常用；loose 更宽松，适合窄栏；anywhere 在任何地方都可以断行。', ja: '行頭・行末に置けない文字の規則です（句読点を行頭に置かないなど）。auto はブラウザが言語に応じて決めます。strict はより厳しく、小書きのかな（っ・ゃ）や長音記号「ー」も行頭に置きません（日本語の本文でよく使います）。loose はゆるく、狭い段組み向けです。anywhere はどこでも改行します。', tw: '哪些字不能放在行首或行尾，例如句號、逗號不放在行首。auto 由瀏覽器按語言決定；strict 更嚴格，小寫假名（っ、ゃ）和長音「ー」也不放行首，日文內文常用；loose 更寬鬆，適合窄欄；anywhere 在任何地方都可以斷行。' } },
  { key: 'wrap', label: { zh: '段落换行', ja: '段落の折り返し', tw: '段落換行' }, prop: 'text-wrap', def: 'pretty', init: 'wrap', tiles: true, tileHtml: tSvgTile('wrap'), tileW: 96, tileCode: true,
    sup: { chrome: 'balance 114 · pretty 117', firefox: 'balance 121', safari: 'balance 17.5 · pretty 26' },
    values: [['wrap', null], ['pretty', { zh: '避免末行孤字', ja: '最終行の孤立を避ける', tw: '避免末行孤字' }], ['balance', { zh: '各行等长（标题）', ja: '行長をそろえる（見出し）', tw: '各行等長（標題）' }]],
    note: { zh: 'Chrome 的 pretty 只调整段落最后四行。', ja: 'Chrome の pretty は段落の最後の 4 行だけを調整します。', tw: 'Chrome 的 pretty 只調整段落最後四行。' } },
  { key: 'align', label: { zh: '对齐', ja: '揃え', tw: '對齊' }, prop: 'text-align', def: 'justify', tiles: true, tileHtml: tSvgTile('align'), tileW: 96, tileCode: true,
    values: [['justify', { zh: '两端对齐', ja: '両端揃え', tw: '兩端對齊' }], ['start', { zh: '齐头', ja: '行頭揃え', tw: '靠行首對齊' }], ['center', { zh: '居中', ja: '中央揃え', tw: '置中' }]] },
  { key: 'justify', label: { zh: '对齐方式', ja: '両端揃えの方法', tw: '對齊方式' }, prop: 'text-justify', def: 'auto', tiles: true, tileHtml: tSvgTile('justify'), tileW: 96, tileCode: true,
    sup: { chrome: '145', firefox: '55', safari: '—' },
    values: [['auto', null], ['inter-character', { zh: '字间分配', ja: '字間で調整', tw: '字間分配' }], ['inter-word', { zh: '只在词间', ja: '語間のみ', tw: '只在詞間' }], ['none', null]],
    note: { zh: '配合 text-align: justify 使用。', ja: 'text-align: justify と組み合わせて使います。', tw: '配合 text-align: justify 使用。' } },
  { key: 'hang', label: { zh: '标点悬挂', ja: 'ぶら下がり', tw: '標點懸掛' }, prop: 'hanging-punctuation', def: 'allow-end', init: 'none', tiles: true, tileHtml: tSvgTile('hang'), tileW: 112, tileCode: true,
    sup: { chrome: '—', firefox: '—', safari: '10' },
    values: [['none', null], ['allow-end', { zh: '行尾句读可悬挂', ja: '行末の句読点をぶら下げる', tw: '行尾句讀可懸掛' }], ['first allow-end last', { zh: '段首段尾的引号括号也悬挂', ja: '段落の最初と最後の括弧も', tw: '段首段尾的引號括號也懸掛' }]],
    note: { zh: '让行尾的句号、逗号伸出版心，右边缘看起来更齐。目前只有 Safari 支持，其他浏览器照常排。first / last 让段落开头、结尾的引号和括号也悬挂。', ja: '行末の句読点を版面の外にはみ出させ、右端をそろえて見せます。現在対応しているのは Safari だけで、ほかのブラウザでは通常どおり組まれます。first / last は段落の最初・最後の括弧や引用符もぶら下げます。', tw: '讓行尾的句號、逗號伸出版心，右邊緣看起來更齊。目前只有 Safari 支援，其他瀏覽器照常排。first / last 讓段落開頭、結尾的引號和括號也懸掛。' } },
  { key: 'feat', grp: 'font', label: { zh: '字距特性', ja: '字詰めの機能', tw: '字距特性' }, prop: 'font-feature-settings', def: 'normal', tiles: '「アイ」、ウ。', tileW: 112, tileFs: 17, tileCode: true,
    sup: { chrome: '48', firefox: '34', safari: '9.1' },
    values: [['normal', null], ['"palt"', { zh: '假名标点比例宽', ja: 'かなと約物をプロポーショナルに', tw: '假名標點比例寬' }], ['"halt"', { zh: '标点半角', ja: '約物を半角に', tw: '標點半形' }]],
    note: { zh: '日文排版常用的 OpenType 特性。palt 让假名和标点按字形本身的宽度排，字距更紧，适合标题；halt 只把标点压成半宽。正文一般保持 normal。字体没有这些特性时不起作用；思源 / Noto CJK 等字体的标点也支持。', ja: '和文組版でよく使う OpenType 機能です。palt はかなや約物を字形そのものの幅で組み、字間が詰まるので見出し向きです。halt は約物だけを半角にします。本文はふつう normal のままです。フォントにこれらの機能がなければ効きません。源ノ / Noto CJK などのフォントは約物も対応しています。', tw: '日文排版常用的 OpenType 特性。palt 讓假名和標點按字形本身的寬度排，字距更緊，適合標題；halt 只把標點壓成半寬。內文一般保持 normal。字型沒有這些特性時不起作用；思源 / Noto CJK 等字型的標點也支援。' } },
  /* 数字样式：和 InDesign 的「数字样式」一样的五种。斜线零单独一行，导出时两行合成一条 font-variant-numeric。
     tiles：用字样卡片选（每张卡片用当前的数字字体排出这个样式），第三项是用途提示 */
  { key: 'num', grp: 'font', label: { zh: '数字样式', ja: '数字のスタイル', tw: '數字樣式' }, prop: 'font-variant-numeric', def: 'normal', tiles: '11,980', hint: 'numHint',
    sup: { chrome: '52', firefox: '34', safari: '9.1' },
    values: [['normal', { zh: '字体默认', ja: 'フォントの既定', tw: '字型預設' }],
      ['lining-nums tabular-nums', { zh: '等高等宽', ja: 'ライニング・等幅', tw: '等高等寬' }, { zh: '表格、金额', ja: '表・金額', tw: '表格、金額' }],
      ['lining-nums proportional-nums', { zh: '等高比例', ja: 'ライニング・プロポーショナル', tw: '等高比例' }],
      ['oldstyle-nums proportional-nums', { zh: '旧式比例', ja: 'オールドスタイル・プロポーショナル', tw: '舊式比例' }, { zh: '西文正文', ja: '欧文の本文', tw: '西文內文' }],
      ['oldstyle-nums tabular-nums', { zh: '旧式等宽', ja: 'オールドスタイル・等幅', tw: '舊式等寬' }]],
    note: { zh: '和 InDesign 的「数字样式」一样的五种。等高 / 旧式是数字的高低，比例 / 等宽是数字的宽度。效果取决于显示数字的那个字体有没有这些 OpenType 特性；Google Fonts 的网页字体删掉了旧式数字和斜线零。写在使用规则里，页面上可以按元素改，例如只让表格用等宽数字。', ja: 'InDesign の「数字スタイル」と同じ 5 種類です。ライニング / オールドスタイルは数字の高さ、プロポーショナル / 等幅は数字の幅です。効果は数字を表示するフォントにこれらの OpenType 機能があるかどうかで決まります。Google Fonts の Web フォントではオールドスタイル数字とスラッシュ付きゼロが削られています。使用側の規則に書かれるので、表だけ等幅数字にするなど、要素ごとに変えられます。', tw: '和 InDesign 的「數字樣式」一樣的五種。等高 / 舊式是數字的高低，比例 / 等寬是數字的寬度。效果取決於顯示數字的那個字型有沒有這些 OpenType 特性；Google Fonts 的網頁字型刪掉了舊式數字和斜線零。寫在使用規則裡，頁面上可以按元素改，例如只讓表格用等寬數字。' } },
  { key: 'zero', grp: 'font', label: { zh: '斜线零', ja: 'スラッシュ付きゼロ', tw: '斜線零' }, prop: 'font-variant-numeric', def: 'normal', tiles: '100',
    sup: { chrome: '52', firefox: '34', safari: '9.1' },
    values: [['normal', { zh: '不用', ja: '使わない', tw: '不用' }], ['slashed-zero', { zh: '斜线零', ja: 'スラッシュ付き', tw: '斜線零' }, { zh: '和字母 O 区分', ja: 'O と区別', tw: '和字母 O 區分' }]] },
  /* 东亚字形：字形标准（JIS 各版、旧字形 / 简化字形）和假名标点的宽度，两行合成一条 font-variant-east-asian */
  { key: 'eaVar', grp: 'font', label: { zh: '字形标准', ja: '字形の規格', tw: '字形標準' }, prop: 'font-variant-east-asian', def: 'normal', tiles: '辻葛飴鴎国', tileW: 128, hint: 'eaHint',
    sup: { chrome: '63', firefox: '34', safari: '9.1' },
    values: [['normal', { zh: '字体默认', ja: 'フォントの既定', tw: '字型預設' }], ['jis04', { zh: 'JIS2004', ja: 'JIS2004', tw: 'JIS2004' }, { zh: '现行标准', ja: '現行の規格', tw: '現行標準' }], ['jis90', { zh: 'JIS90', ja: 'JIS90', tw: 'JIS90' }, { zh: '2004 年以前', ja: '2004 年より前', tw: '2004 年以前' }], ['jis83', { zh: 'JIS83', ja: 'JIS83', tw: 'JIS83' }], ['jis78', { zh: 'JIS78', ja: 'JIS78', tw: 'JIS78' }], ['traditional', { zh: '旧字形', ja: '旧字体', tw: '舊字形' }], ['simplified', { zh: '简化字形', ja: '簡略字形', tw: '簡化字形' }]],
    note: { zh: '日文汉字有几版字形标准：JIS2004 是现行标准，例如「辻」的走之是两点、「飴」的食字旁是新写法；JIS90 是 2004 年以前 Windows XP 等使用的写法，JIS83、JIS78 更早。旧字形把字换成传统写法（例如国 → 國），简化字形相反。需要字体本身带有这些字形：冬青黑体（Hiragino）、游明朝等本机字体通常有，Google Fonts 的网页字体把这些特性删掉了。和校样的语言无关，中文字体如果带有这些特性也会生效。', ja: '日本語の漢字には字形の規格がいくつかあります。JIS2004 は現行の規格で、たとえば「辻」のしんにょうは 2 点、「飴」の食偏は新しい形です。JIS90 は 2004 年より前（Windows XP など）の形で、JIS83・JIS78 はさらに古い形です。旧字体は字を伝統的な形に（国 → 國）、簡略字形はその逆にします。フォント自体がこれらの字形を持っている必要があり、ヒラギノや游明朝などのローカルフォントにはたいていありますが、Google Fonts の Web フォントではこれらの機能が削られています。校正刷りの言語とは関係なく、中国語フォントでも機能があれば効きます。', tw: '日文漢字有幾版字形標準：JIS2004 是現行標準，例如「辻」的辶是兩點、「飴」的食字旁是新寫法；JIS90 是 2004 年以前 Windows XP 等使用的寫法，JIS83、JIS78 更早。舊字形把字換成傳統寫法（例如国 → 國），簡化字形相反。需要字型本身帶有這些字形：冬青黑體（Hiragino）、游明朝等本機字型通常有，Google Fonts 的網頁字型把這些特性刪掉了。和校樣的語言無關，中文字型如果帶有這些特性也會生效。' } },
  { key: 'eaWidth', grp: 'font', label: { zh: '假名与标点宽度', ja: 'かなと約物の幅', tw: '假名與標點寬度' }, prop: 'font-variant-east-asian', def: 'normal', tiles: 'イリ「ア」ﾃｽ', tileW: 150, tileFs: 18,
    sup: { chrome: '63', firefox: '34', safari: '9.1' },
    values: [['normal', { zh: '字体默认', ja: 'フォントの既定', tw: '字型預設' }], ['proportional-width', { zh: '比例宽', ja: 'プロポーショナル', tw: '比例寬' }, { zh: '按字形本身的宽度', ja: '字形そのものの幅', tw: '按字形本身的寬度' }], ['full-width', { zh: '全角', ja: '全角', tw: '全形' }, { zh: '半角假名也变全角', ja: '半角カナも全角に', tw: '半形假名也變全形' }]] },
];
/* 几行合成一条 CSS 属性：数字样式 + 斜线零 → font-variant-numeric；字形标准 + 宽度 → font-variant-east-asian */
/* grp: 'font' 的几行是字体的事（用哪个字形），放在「字体」页签；其余是排版的事，放在「排版」页签 */
const isFontTypo = t => t.grp === 'font';
const TYPO_MERGE = { 'font-variant-numeric': ['num', 'zero'], 'font-variant-east-asian': ['eaVar', 'eaWidth'] };
const typoValue = t => TYPO_MERGE[t.prop] ? TYPO_MERGE[t.prop].map(k => state.typo[k]).filter(v => v && v !== 'normal').join(' ') || 'normal' : state.typo[t.key];
const typoMergedAway = t => TYPO_MERGE[t.prop] && TYPO_MERGE[t.prop][0] !== t.key;      // 合并到前一行，导出时不单独写
/* 东亚字形的值和 OpenType 特性的对应：检查字体有没有这些字形时用 */
const EA_FEAT = { jis78: 'jp78', jis83: 'jp83', jis90: 'jp90', jis04: 'jp04', simplified: 'smpl', traditional: 'trad', 'full-width': 'fwid', 'proportional-width': 'pwid' };
/* 工具的默认值以正文为前提：段落换行用 pretty；日文正文的禁则用 strict。
   def 是工具的默认值，init 是 CSS 的初始值：导出时只省略等于 init 的值 */
const typoDef = (t, lang = state?.typo?.lang) => t.defJa && /^ja/.test(lang || '') ? t.defJa : t.def;
const typoDefaults = lang => Object.fromEntries(TYPO.map(t => [t.key, typoDef(t, lang)]));
const TYPO_DEFAULTS = typoDefaults('zh-Hans');
const ENGINE = (() => {
  const ua = navigator.userAgent; let m;
  if ((m = ua.match(/Firefox\/(\d+)/))) return { id: 'firefox', name: 'Firefox', v: m[1] };
  if ((m = ua.match(/(?:Chrome|Chromium)\/(\d+)/))) return { id: 'chrome', name: /Edg\//.test(ua) ? 'Edge' : 'Chrome', v: m[1] };
  if ((m = ua.match(/Version\/([\d.]+).*Safari/))) return { id: 'safari', name: 'Safari', v: m[1] };
  return { id: '', name: '', v: '' };
})();
const typoSupported = (t, v) => t.attr || CSS.supports(t.prop, v);
/* 数字样式（高级排版属性里的「数字样式」「斜线零」，合成一条 font-variant-numeric）。
   下面是各个值对应的 OpenType 特性：检查显示数字的字体有没有这些特性时用 */
const NUM_FEAT = { 'lining-nums': 'lnum', 'oldstyle-nums': 'onum', 'proportional-nums': 'pnum', 'tabular-nums': 'tnum', 'slashed-zero': 'zero' };
const NUM_TAGS = Object.values(NUM_FEAT);
const NUM_LABEL = { lnum: { zh: '等高数字', ja: 'ライニング数字', tw: '等高數字' }, onum: { zh: '旧式数字', ja: 'オールドスタイル数字', tw: '舊式數字' }, pnum: { zh: '比例数字', ja: 'プロポーショナル数字', tw: '比例數字' }, tnum: { zh: '等宽数字', ja: '等幅数字', tw: '等寬數字' }, zero: { zh: '斜线零', ja: 'スラッシュ付きゼロ', tw: '斜線零' } };
const numValue = () => typoValue(TYPO.find(t => t.key === 'num'));
const numTags = () => numValue().split(' ').map(v => NUM_FEAT[v]).filter(Boolean);
const numLabel = t => tr(NUM_LABEL[t]);

/* 预设的西文大小和基线都是「自动调整大小和基线」在 100–900 各字重量出来的结果（2026-10，Chrome 155、macOS）：
   latinSize 是 400 的大小，latinW 是和 400 相差 0.5 以上的字重自己的大小，
   latinShift 是基线（大写中线和汉字字面中线相差 2% em 以上时才有，导出时需要 JS）。 */
const PRESETS = [
  { id: 'serif-sc', region: 'sc', name: { zh: '宋体 × Garamond', ja: '宋体 × Garamond', tw: '宋體 × Garamond' }, tag: { zh: '简体中文', ja: '簡体字中国語', tw: '簡體中文' }, han: G('Noto Serif SC'), latin: G('EB Garamond'), latinSize: 115, latinW: { 100: 114, 200: 114, 300: 114.5, 500: 115.5, 600: 116, 700: 116.5, 800: 117, 900: 117.5 }, sample: 'zh' },
  { id: 'sans-sc', region: 'sc', name: { zh: '黑体 × Inter', ja: '黒体 × Inter', tw: '黑體 × Inter' }, tag: { zh: '简体中文', ja: '簡体字中国語', tw: '簡體中文' }, han: G('Noto Sans SC'), latin: G('Inter'), latinSize: 100, latinW: { 100: 98, 200: 98.5, 300: 99, 500: 101, 600: 101.5, 700: 102, 800: 102.5, 900: 103.5 }, sample: 'zh' },
  { id: 'mincho-jp', region: 'jp', name: { zh: '明朝 × Cormorant', ja: '明朝 × Cormorant', tw: '明朝 × Cormorant' }, tag: { zh: '日文', ja: '日本語', tw: '日文' }, han: G('Shippori Mincho'), latin: G('Cormorant Garamond', 500), latinSize: 120, latinW: { 500: 120.5, 600: 121, 700: 121.5, 800: 122, 900: 122 }, sample: 'ja' },
  { id: 'gothic-jp', region: 'jp', name: { zh: 'ゴシック × Jost', ja: 'ゴシック × Jost', tw: 'ゴシック × Jost' }, tag: { zh: '日文', ja: '日本語', tw: '日文' }, han: G('Noto Sans JP'), latin: G('Jost'), latinSize: 108, latinW: { 100: 107, 200: 107, 300: 107.5, 500: 108.5, 600: 108.5, 700: 109, 800: 109.5, 900: 109.5 }, latinShift: -2, sample: 'ja' },
  /* アンチゴチ：漢字はゴシック体、かなはアンチック体。欧文と約物はゴシックに従う。Zen Antique のかなは太いので、漢字は 500 で釣り合う */
  { id: 'antigochi', region: 'jp', name: { zh: 'アンチゴチ', ja: 'アンチゴチ', tw: 'アンチゴチ' }, tag: { zh: '漫画对白', ja: 'マンガの台詞', tw: '漫畫對白' }, han: G('Zen Kaku Gothic New', 500), latin: null, latinShift: 3, classes: { kana: { font: G('Zen Antique') } }, sample: 'manga', vertical: true },
  /* macOS：SF Pro 不能用 local() 引用（系统界面字体对网页隐藏），西文用每台 Mac 都自带的 Avenir Next */
  { id: 'mac', region: 'sc', name: { zh: '苹方 × Avenir Next', ja: 'PingFang × Avenir Next', tw: '蘋方-簡 × Avenir Next' }, tag: { zh: 'macOS 系统字体 · 简体中文', ja: 'macOS 標準・簡体字', tw: 'macOS 系統字型 · 簡體中文' }, han: L('PingFang SC Regular', ['PingFangSC-Regular']), latin: L('Avenir Next Regular', ['AvenirNext-Regular']), latinSize: 104, latinW: { 700: 102.5, 800: 99.5, 900: 99.5 }, latinShift: -3,
    classes: { kana: { font: L('Hiragino Sans W3', ['HiraginoSans-W3']) } }, sample: 'zh' },   /* 苹方也有假名，但日文里用冬青黑体为日文设计的假名 */
  { id: 'mac-jp', region: 'jp', name: { zh: 'ヒラギノ角ゴ × Avenir Next', ja: 'ヒラギノ角ゴ × Avenir Next', tw: 'ヒラギノ角ゴ × Avenir Next' }, tag: { zh: 'macOS 系统字体 · 日文', ja: 'macOS 標準・日本語', tw: 'macOS 系統字型 · 日文' }, han: L('Hiragino Sans W3', ['HiraginoSans-W3']), latin: L('Avenir Next Regular', ['AvenirNext-Regular']), latinSize: 111.5, latinW: { 100: 108.5, 200: 110.5, 300: 111, 500: 112, 600: 112.5, 700: 112, 800: 110 }, latinShift: -3.5, sample: 'ja' },
  /* 台湾、香港：思源（Noto CJK）的繁中版和简中版共用同一套西文，西文大小沿用对应的简中预设 */
  { id: 'ming-tw', region: 'tc', name: { zh: '明體 × Garamond', ja: '明体 × Garamond', tw: '明體 × Garamond' }, tag: { zh: '繁体中文（台湾）', ja: '繁体字中国語（台湾）', tw: '繁體中文（台灣）' }, han: G('Noto Serif TC'), latin: G('EB Garamond'), latinSize: 115, latinW: { 100: 114, 200: 114, 300: 114.5, 500: 115.5, 600: 116, 700: 116.5, 800: 117, 900: 117.5 }, sample: 'tw' },
  { id: 'hei-tw', region: 'tc', name: { zh: '黑體 × Inter', ja: '黒体 × Inter', tw: '黑體 × Inter' }, tag: { zh: '繁体中文（台湾）', ja: '繁体字中国語（台湾）', tw: '繁體中文（台灣）' }, han: G('Noto Sans TC'), latin: G('Inter'), latinSize: 100, latinW: { 100: 98, 200: 98.5, 300: 99, 500: 101, 600: 101.5, 700: 102, 800: 102.5, 900: 103.5 }, sample: 'tw' },
  { id: 'hei-hk', region: 'hk', name: { zh: '香港黑體 × Inter', ja: '香港の黒体 × Inter', tw: '香港黑體 × Inter' }, tag: { zh: '繁体中文（香港）', ja: '繁体字中国語（香港）', tw: '繁體中文（香港）' }, han: G('Noto Sans HK'), latin: G('Inter'), latinSize: 100, latinW: { 100: 98, 200: 98.5, 300: 99, 500: 101, 600: 101.5, 700: 102, 800: 102.5, 900: 103.5 }, sample: 'hk' },
  { id: 'mac-tw', region: 'tc', name: { zh: '蘋方-繁 × Avenir Next', ja: 'PingFang TC × Avenir Next', tw: '蘋方-繁 × Avenir Next' }, tag: { zh: 'macOS 系统字体 · 繁体中文', ja: 'macOS 標準・繁体字', tw: 'macOS 系統字型 · 繁體中文' }, han: L('PingFang TC Regular', ['PingFangTC-Regular']), latin: L('Avenir Next Regular', ['AvenirNext-Regular']), latinSize: 104, latinW: { 700: 102.5, 800: 99.5, 900: 99.5 }, latinShift: -3, sample: 'tw' },
];

/* ================= 状态 ================= */
/* size / shift 为 null 表示继承：跟随别的类别时继承它的值，独立字体时为 100% / 0 */
function freshClasses(p) {
  const c = {};
  for (const k of CLASSES) c[k.id] = { follow: k.follow || null, font: null, size: null, shift: null };
  c.han.font = p.han;
  if (p.latin) { c.latin.font = p.latin; c.latin.size = p.latinSize && p.latinSize !== 100 ? p.latinSize : null; } else c.latin.follow = 'han';
  if (p.latinShift) c.latin.shift = p.latinShift;
  for (const [id, o] of Object.entries(p.classes || {})) Object.assign(c[id], { follow: null }, o);
  return c;
}
function stateFromPreset(p, prev) {
  return {
    v: 8,
    preset: p.id,
    name: prev?.name || 'My Composite',
    weights: prev?.weights || [100, 200, 300, 400, 500, 600, 700, 800, 900],
    baseMode: prev?.baseMode || 'link',
    weightNames: prev?.weightNames || {},
    moved: prev?.moved ? { ...prev.moved } : {},
    wOver: Object.fromEntries(Object.entries(p.latinW || {}).map(([W, size]) => [W, { latin: { size } }])),      // 各字重自己的西文大小
    generic: prev?.generic || 'auto',
    scope: prev?.scope ?? '',
    wmode: prev?.wmode || 'steps',
    wrange: prev?.wrange || [100, 900],
    italic: prev ? !!prev.italic : true,
    lineMetrics: prev?.lineMetrics || 'han',      // 默认导出斜体：西文用真斜体，汉字保持正体
    classes: freshClasses(p),
    custom: [],
    view: prev?.view ? { ...prev.view } : { sample: p.sample, text: SAMPLES[p.sample].text, size: 24, lh: 1.85, vertical: !!p.vertical, colorize: false, miss: true, compare: false, cmp: 'plain', weight: 400 },
    typo: prev?.typo ? { ...prev.typo } : { ...typoDefaults(SAMPLES[p.sample].lang), lang: SAMPLES[p.sample].lang },
  };
}

const LS_STATE = 'composite-font:state:v1', LS_PRESETS = 'composite-font:presets:v1';
let userPresets = lsGet(LS_PRESETS) || {};
/* 新增的类别（例如注音）在 normalizeState 里补上，这里只检查原有的几个 */
function validState(s) {
  return s && s.classes && ['han', 'latin', 'kana', 'punct'].every(id => s.classes[id] && 'size' in s.classes[id]) && s.classes.han.font && Array.isArray(s.custom) && s.view;
}
/* 第一次打开时按界面语言选预设：日文 → 明朝 × Cormorant，繁中 → 明體 × Garamond，简中 → 宋体 × Garamond */
const defaultPresetId = () => UI === 'ja' ? 'mincho-jp' : UI === 'tw' ? 'ming-tw' : 'serif-sc';
let state = validState(lsGet(LS_STATE)) ? lsGet(LS_STATE) : stateFromPreset(PRESETS.find(p => p.id === defaultPresetId()));
/* 预设有没有被改过：和套用（或保存）预设那一刻的设定比较。校样的文字、字号等（view）不算 */
const PRESET_SKIP = new Set(['view', 'preset', 'presetBase', 'v']);
function presetSnap() { return JSON.stringify(state, function (k, v) { return this === state && PRESET_SKIP.has(k) ? undefined : v; }); }
const presetDirty = () => state.presetBase ? presetSnap() !== state.presetBase : state.preset === '';
function normalizeState() {
  if (!(state.v >= 2)) {    // 旧版本里「跟随」连大小、基线一起跟随，迁移为继承
    for (const o of [...Object.values(state.classes), ...state.custom]) if (o.follow) { o.size = null; o.shift = null; }
    state.v = 2;
  }
  if (state.v === 2) {      // v2 默认只导出 400；v3 起默认导出全部字重，让每个字重都能单独调整
    if (Array.isArray(state.weights) && state.weights.length === 1 && state.weights[0] === 400) state.weights = [100, 200, 300, 400, 500, 600, 700, 800, 900];
    state.v = 3;
  }
  for (const c of CLASSES) state.classes[c.id] ||= { follow: c.follow || null, font: null, size: null, shift: null };     // 后来新增的类别
  if (state.typo?.lang === 'zh-Hant') state.typo.lang = 'zh-Hant-TW';       // 「繁體中文」拆成台湾、香港
  if (state.scope === 'zh-Hant') state.scope = 'zh-Hant-TW';
  if (state.typo) delete state.typo.tcy;                                   // 纵中横已删除
  if (state.typo) delete state.typo.emoji;                                 // emoji 显示已删除
  state.typo = { ...typoDefaults(state.typo?.lang), ...(state.typo || {}) };
  if (state.v === 3) {      // v4 起正文默认：text-wrap: pretty；日文 line-break: strict。仍是旧默认值的改成新默认值
    if (state.typo.wrap === 'wrap') state.typo.wrap = 'pretty';
    if (/^ja/.test(state.typo.lang) && state.typo.lineBreak === 'auto') state.typo.lineBreak = 'strict';
    state.v = 4;
  }
  if (state.v === 4) {      // v5 起默认导出斜体（以前默认不导出，em、i 里的西文也被模拟倾斜）
    state.italic = true;
    state.v = 5;
  }
  if (state.v === 5) {      // v6 起所有语言的禁则默认 strict（以前只有日文）。仍是旧默认值 auto 的改成 strict
    if (state.typo.lineBreak === 'auto') state.typo.lineBreak = 'strict';
    state.v = 6;
  }
  if (state.v === 6) {      // v7 起标点挤压默认 space-first：折行后的行首括号也收成半角，左边缘对齐。仍是旧默认值 normal 的改成 space-first
    if (state.typo.trim === 'normal') state.typo.trim = 'space-first';
    state.v = 7;
  }
  if (state.v === 7) {      // v8 起标点悬挂默认 allow-end（目前只有 Safari 生效）。仍是旧默认值 none 的改成 allow-end
    if (state.typo.hang === 'none') state.typo.hang = 'allow-end';
    state.v = 8;
  }
  state.view.cmp = state.view.cmp || 'plain';
  if (state.view.miss === undefined) state.view.miss = true;         // 「标出缺字」默认打开
  delete state.metric;                                              // 度量对齐的「按 … 对齐到 …%」已删除
  state.weights = Array.isArray(state.weights) && state.weights.length ? [...new Set(state.weights)].sort((a, b) => a - b) : [state.weight || 400];
  delete state.weight;
  state.baseMode = state.baseMode || 'link';
  state.weightNames = state.weightNames || {};
  state.scope = state.scope || '';
  state.wmode = state.wmode === 'cont' ? 'cont' : 'steps';        // 字重：分档 / 连续（可变字体）
  state.italic = !!state.italic;                                   // 导出斜体
  state.lineMetrics = state.lineMetrics === 'off' ? 'off' : 'han';  // 行高度量对齐汉字字体（默认打开）
  if (state.num) {        // 数字样式原来在半角数字的齿轮里（按 OpenType 特性分开存），移到高级排版属性
    const n = state.num;
    if (n.fig || n.spc) state.typo.num = `${n.fig === 'onum' ? 'oldstyle' : 'lining'}-nums ${n.spc === 'tnum' ? 'tabular' : 'proportional'}-nums`;
    if (n.zero) state.typo.zero = 'slashed-zero';
    delete state.num;
  }
  delete state.stretch; delete state.view.wstretch;                // 「字宽跟随页面」已删除
  const wr = Array.isArray(state.wrange) ? state.wrange.map(Math.round) : [];
  state.wrange = wr[0] >= 100 && wr[1] <= 900 && wr[0] < wr[1] ? wr : [100, 900];      // 连续模式导出的粗细范围
  if (!Number.isFinite(state.view.wcont)) state.view.wcont = state.view.weight || 400;
  state.view.wcont = Math.min(state.wrange[1], Math.max(state.wrange[0], state.view.wcont));
  state.wOver = state.wOver || {};
  state.moved = state.moved || {};
  if (state.view.sample === 'title') {   // 「标题」示例已删除，回到正文
    const k = state.typo.lang?.startsWith('ja') ? 'ja' : 'zh';
    Object.assign(state.view, { sample: k, text: SAMPLES[k].text, size: 24, lh: 1.85 });
  }
  /* 自定义页签：可以有好几组，每组记着文字和语言（view.customs）；选中的是 'c0'、'c1'… */
  const vw = state.view;
  if (vw.sample === 'en') { vw.sample = 'zh'; vw.text = SAMPLES.zh.text; }      // 「西文为主」示例已删除
  if (!Array.isArray(vw.customs)) vw.customs = [];
  if (vw.customText != null) { vw.customs.push({ text: vw.customText, lang: vw.customLang || state.typo.lang }); if (vw.sample === 'custom') vw.sample = 'c' + (vw.customs.length - 1); }      // 只有一组时的旧数据
  delete vw.customText; delete vw.customLang;
  if (!(vw.sample in SAMPLES) && !/^c\d+$/.test(vw.sample)) { vw.customs.push({ text: vw.text || '', lang: state.typo.lang }); vw.sample = 'c' + (vw.customs.length - 1); }      // 更早的「改过的文字」
  const ci = /^c(\d+)$/.exec(vw.sample);
  if (ci && !vw.customs[+ci[1]]) vw.sample = 'zh';
  if (ci && vw.customs[+ci[1]]) vw.text = vw.customs[+ci[1]].text;
  else if (vw.sample in SAMPLES) vw.text = SAMPLES[vw.sample].text;     // 选的是示例时跟着示例更新
  if (!state.weights.includes(state.view.weight)) state.view.weight = state.weights.includes(400) ? 400 : state.weights[0];
  if (state.presetBase === undefined && state.preset) state.presetBase = presetSnap();      // 旧的保存数据：以现在为准
  rebuildClassRanges();
}
normalizeState();
const saveState = debounce(() => lsSet(LS_STATE, state), 400);

/* ================= 字重：工具里设定的字体对应 400，其他字重自动换算 ================= */
const BASE_W = 400;
const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];
const WEIGHT_WORDS = { 100: ['Thin', 'UltraLight', 'Hairline'], 200: ['ExtraLight', 'UltraLight'], 300: ['Light'], 400: ['Regular'], 500: ['Medium'], 600: ['Semibold', 'SemiBold', 'DemiBold'], 700: ['Bold'], 800: ['ExtraBold', 'Heavy'], 900: ['Black', 'Heavy'] };
const ALL_WORDS = [...new Set(Object.values(WEIGHT_WORDS).flat())].sort((a, b) => b.length - a.length);
const WORD_RE = new RegExp(`([ _-])(${ALL_WORDS.join('|')})$`, 'i');
function weightOrder(W) {          // 先目标字重，再按距离向两侧找，靠近 400 的一侧优先
  const out = [W], dir = W > BASE_W ? -1 : 1;
  for (let d = 100; d <= 800; d += 100) for (const x of [W + dir * d, W - dir * d]) if (x >= 100 && x <= 900 && x !== BASE_W && !out.includes(x)) out.push(x);
  return out;
}
function nameAtWeight(name, wt) {
  const hw = name.match(/^(.*\bW)(\d)$/);          // Hiragino：W3 → W6
  if (hw) { const n = +hw[2] + (wt - BASE_W) / 100; return n >= 0 && n <= 9 ? [hw[1] + n] : []; }
  const m = name.match(WORD_RE);
  const stem = m ? name.slice(0, -m[0].length) : name;
  const sep = m ? m[1] : (/\s/.test(name) || !/[a-z][A-Z]|-/.test(name) ? ' ' : '-');
  return WEIGHT_WORDS[wt].map(w => stem + sep + w);
}
const existsCache = new Map();
function localExists(name) {
  if (!existsCache.has(name)) existsCache.set(name, new FontFace('__cf_probe', `local("${name.replace(/["\\]/g, '\\$&')}")`).load().then(() => true, () => false));
  return existsCache.get(name);
}
const autoNames = new Map();       // 「字体|字重」→ {name, status}
function autoLocal(f, W) {
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
function guessPath(file, W) {
  const m = file.match(/^(.*?)(\.[a-z0-9]+)$/i), stem = m ? m[1] : file, ext = m ? m[2] : '';
  const mm = stem.match(WORD_RE);
  return (mm ? stem.slice(0, -mm[0].length) + mm[1] : stem + '-') + WEIGHT_WORDS[W][0] + ext;
}
function fontAtWeight(f, W, live = false) {
  if (!f || W === BASE_W) return f;
  if (f.kind === 'google') return G(f.family, Math.min(900, Math.max(100, f.weight + (W - BASE_W))));
  if (f.axis) return { ...f, weight: clampW((f.weight || 400) + (W - BASE_W), f.axis) };     // 可变的本机字体 / 文件：同一个字体，换粗细
  const manual = state.weightNames[fontKey(f) + '|' + W];
  if (f.kind === 'local') return L(manual || autoLocal(f, W).name);
  if (f.kind === 'file') return live ? f : { kind: 'path', path: manual || guessPath(f.fileName, W), ...(f.italic ? { italPath: guessPath(f.italic.fileName, W) } : {}) };
  return f;
}
const weightNamesChanged = debounce(() => { renderEditor(); renderExport(); if (state.view.weight !== BASE_W) rebuild(); }, 60);

/* ================= 解析：类别 → 实际字体/大小/基线 ================= */
function rootOf(id, depth = 0) { const c = state.classes[id]; return c.follow && depth < 4 ? rootOf(c.follow, depth + 1) : id; }
/* 某个字重下的实际设定。「跟随」只跟随字体；大小、基线没有单独设定时继承所跟随的类别。
   400 用类别本身的设定；其他字重的字体按差值换算，再叠加该字重的单独调整（wOver） */
function ownFontAt(o, ov, W, live) {
  let font = o.font;
  if (font && W !== BASE_W && ov?.font) return ov.font;      // 这个字重单独换成了另一个字体
  if (font && W !== BASE_W) font = ov?.weight && (font.kind === 'google' || font.axis) ? (font.kind === 'google' ? G(font.family, ov.weight) : { ...font, weight: ov.weight }) : fontAtWeight(font, W, live);
  return font;
}
function resolveObj(key, o, W = BASE_W, live = false, depth = 0) {
  const ov = W !== BASE_W ? state.wOver[W]?.[key] : null;
  if (o.follow && depth < 4) {
    const p = resolveCls(o.follow, W, live, depth + 1);
    return { font: p.font, size: ov?.size ?? o.size ?? p.size, shift: o.shift ?? p.shift, vary: p.vary };      // 跟随别的类别时，可变轴也跟随
  }
  return { font: ownFontAt(o, ov, W, live), size: ov?.size ?? o.size ?? 100, shift: o.shift ?? 0, vary: o.vary || null };
}
function resolveCls(id, W = BASE_W, live = false, depth = 0) { return resolveObj(id, state.classes[id], W, live, depth); }
const resolveCustom = (cu, W = BASE_W, live = false) => resolveObj('#' + state.custom.indexOf(cu), cu, W, live);
const objByKey = key => key[0] === '#' ? state.custom[+key.slice(1)] : state.classes[key];
/* 表格里灰色显示的继承值 */
function inheritedSize(key, W) {
  const o = objByKey(key);
  if (W !== BASE_W && o.size != null) return o.size;
  return o.follow ? resolveCls(o.follow, W, true).size : 100;
}
const inheritedShift = key => { const o = objByKey(key); return o.follow ? resolveCls(o.follow).shift : 0; };
const ownSize = (key, W) => W === BASE_W ? objByKey(key).size : state.wOver[W]?.[key]?.size;
function setSizeAt(key, W, v) {
  if (W === BASE_W) { objByKey(key).size = v; return; }
  if (v != null) { ((state.wOver[W] ||= {})[key] ||= {}).size = v; return; }
  const ov = state.wOver[W]?.[key]; if (!ov) return;      // 恢复继承：顺手删掉空的条目
  delete ov.size;
  if (!Object.keys(ov).length) delete state.wOver[W][key];
  if (!Object.keys(state.wOver[W]).length) delete state.wOver[W];
}
let customRanges = [];
const refreshCustomRanges = () => { customRanges = state.custom.map(cu => parseChars(cu.chars)); };

function ownerOf(cp) {
  for (let i = state.custom.length - 1; i >= 0; i--) if (customRanges[i]?.length && inRanges(customRanges[i], cp)) return '#' + i;
  return classOf(cp) || 'other';
}
function settingOf(owner) {
  if (owner === 'other') return resolveCls('han');
  if (owner[0] === '#') return resolveCustom(state.custom[+owner.slice(1)]);
  return resolveCls(owner);
}
const anyShift = () => CLASSES.some(c => resolveCls(c.id).shift) || state.custom.some(cu => resolveCustom(cu).shift);

/* 生成规则表：基础字体在最前（不限范围），类别按 (字体, 大小, 轴值) 合并，例外在最后。
   ital：斜体那一组的规则（有斜体的类别换成斜体字体，没有的用正体，up = 保持正体） */
function buildPlan(W = BASE_W, live = false, ital = false) {
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
/* ================= 连续字重：按档位分段 =================
   所有类别共用同一套分段，每段的 font-weight 都是同一个范围（描述不一致时 Chrome 的复合字体会失效）。
   可变字体每段都用同一个可变字体文件，段内可以任意粗细；静态字体每段用最接近的那一档。
   相邻两段所有类别都一样时合并：全是可变字体、大小也不随字重变化时，最后只剩一段。
   只导出 state.wrange 里的粗细：页面用到范围以外的值时，浏览器按最接近的一段显示 */
function contFont(f) {
  if (!f) return f;
  if (f.kind === 'google') {
    if (Array.isArray(vfAxisNow(f))) return { ...f, weight: 400, vf: true };
    const aw = sources.get(fontKey(f))?.actualWeight;      // 没有这一档时实际取到的字重：相同的就能合并成一段
    return aw && aw !== f.weight ? { ...f, weight: aw } : f;
  }
  return f.axis ? { ...f, weight: undefined, cont: true } : f;
}
/* 这一档在连续模式里负责的粗细（和导出范围取交集）；不在范围里时为 null */
function stepSpan(W) {
  const [a, b] = state.wrange, lo = Math.max(a, W === 100 ? 100 : W - 49), hi = Math.min(b, W === 900 ? 900 : W + 50);
  return lo <= hi ? [lo, hi] : null;
}
function buildSegments(live = false, skipBase = false) {      // skipBase：汉字基础字体用 @import 引用时，不参与分段
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
/* 用到的可变字体和各自的粗细范围：导出范围的「最大 / 共同」按钮由这些算出 */
function vfAxes() {
  const m = new Map();
  for (const W of WEIGHTS) for (const p of buildPlan(W)) {
    const f = p.font, axis = vfAxisNow(f);
    if (Array.isArray(axis)) m.set(f.family || f.name || f.fileName, axis);
  }
  return [...m];
}
function expandPlan(plan, live) {
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

/* ================= 实时预览用的字体 ================= */
let gen = 0, liveFaces = [], liveFamily = '';
function loadText() {
  return (state.view.text.slice(0, 2500) + '国Hxg' + CLASSES.map(c => c.sample).join('') + state.custom.map(c => c.chars).join(''));
}
async function rebuildNow() {
  const my = ++gen, W = state.view.weight, cont = state.wmode === 'cont';
  /* 分档：只建当前这一档的规则；连续：建所有分段的规则，校样的粗细由滑块决定 */
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
      /* 规则带上当前字重，校样也用这个字重：这样落到系统字体的字（比如日文字体里没有的简体字）也会跟着变粗细 */
      const d = { display: 'swap', weight: sg.lo === sg.hi ? String(W) : `${sg.lo} ${sg.hi}`, style };
      const fvs = fvsOf(x.p, W, cont);
      if (fvs) d.variationSettings = fvs;
      if (x.range) d.unicodeRange = fmtRanges(x.range);
      if (x.p.size !== 100) d.sizeAdjust = `${x.p.size}%`;
      const ov = x.p !== pl[0] && overridesFor(x.p, sg.plan[0]);
      if (ov) Object.assign(d, { ascentOverride: ov.ascent, descentOverride: ov.descent, lineGapOverride: ov.lineGap });
      try { faces.push(new FontFace(fam, x.face.buffer || x.face.src, d)); } catch (e) { /* 忽略无效的规则 */ }
    }
  }
  faces.forEach(f => document.fonts.add(f));
  const hanSrc = sources.get(fontKey(usedFont(resolveCls('han', state.view.weight, true))));
  const loads = [document.fonts.load(`32px "${fam}"`, loadText())];
  if (hanSrc?.status === 'ok') loads.push(document.fonts.load(`32px "${hanSrc.family}"`, '国Hx'));
  try { await Promise.race([Promise.allSettled(loads), sleep(6000)]); } catch (e) { /* 部分字体加载失败时照常显示 */ }
  if (my !== gen) { faces.forEach(f => document.fonts.delete(f)); return; }
  const old = liveFaces;
  liveFaces = faces; liveFamily = fam;
  root.style.setProperty('--cf', `"${fam}"`);
  root.style.setProperty('--fw', cont ? state.view.wcont : W);
  old.forEach(f => document.fonts.delete(f));
  setBusy('');
  updateNaive();
  drawSpecimen();
  renderExport();
  checkMissSoon();
}
const rebuild = debounce(rebuildNow, 70);
/* ================= 行高度量 =================
   合成字体的行高（line-height: normal）和基线在行框里的位置，取自负责空格的那条规则，也就是半角西文，而且是 size-adjust 放大之后的。
   给基础字体以外的规则写上汉字基础字体的 ascent / descent / line gap，合成字体排起来就和汉字字体一样。
   覆盖值还会再乘以 size-adjust，所以要先除掉。同一个 Google 字族各字重的度量相同，按字族记一次 */
const LM = new Map();
const lmKey = f => f.kind === 'google' ? 'g:' + f.family : fontKey(f);
const lmOn = () => state.lineMetrics !== 'off';
async function ensureLineMetrics(f) {
  if (!f) return null;
  const key = lmKey(f);
  if (LM.has(key)) return LM.get(key);
  const s = source(f);
  await s.promise;
  if (s.status !== 'ok' || LM.has(key)) return LM.get(key) || null;
  try { await document.fonts.load(`100px "${s.family}"`, '国'); } catch (e) { /* 照常测量 */ }
  const c = document.createElement('canvas').getContext('2d');
  c.font = `100px "${s.family}"`;
  const m = c.measureText('国'), a = m.fontBoundingBoxAscent / 100, d = m.fontBoundingBoxDescent / 100;
  const el = document.createElement('div');      // 行距（line gap）：line-height: normal 的行高减去 ascent + descent
  el.style.cssText = `position:absolute;visibility:hidden;left:-9999px;white-space:nowrap;font:100px/normal "${s.family}"`;
  el.textContent = '国';
  document.body.append(el);
  const g = Math.max(0, el.getBoundingClientRect().height / 100 - a - d);
  el.remove();
  const lm = a > 0 ? { a, d, g } : null;
  LM.set(key, lm);
  return lm;
}
/* 一条非基础规则要写的覆盖值；base 是这一组的汉字基础字体规则（它自己的大小也算进去） */
function overridesFor(p, base) {
  const lm = lmOn() && p.range && base?.font && LM.get(lmKey(base.font));
  if (!lm) return null;
  const k = (base.size || 100) / p.size, f = x => `${+(x * 100 * k).toFixed(2)}%`;
  return { ascent: f(lm.a), descent: f(lm.d), lineGap: f(lm.g) };
}
/* 斜体文件加载失败（例如 Google 上这个粗细没有斜体）时，这一条改用正体 */
function italFallback(pl) {
  return pl.map(p => p.font?.kind === 'google' && p.font.ital && sources.get(fontKey(p.font))?.status === 'error'
    ? { ...p, font: (({ ital, ...rest }) => rest)(p.font), up: true } : p);
}
function hanCapRatio(han) {
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = `100px "${han.family}"`;
  return ctx.measureText('H').actualBoundingBoxAscent / 100;
}
let lastFsaR = null;
function updateNaive() {
  const latR = resolveCls('latin', state.view.weight, true), hanR = resolveCls('han', state.view.weight, true), latF = latR.font, hanF = hanR.font;
  const lat = sources.get(fontKey(usedFont(latR))), han = sources.get(fontKey(usedFont(hanR)));
  const fams = [lat, han].filter(s => s && s.status === 'ok').map(s => `"${s.family}"`);
  root.style.setProperty('--cf-naive', [...new Set(fams)].join(', ') || 'serif');
  const code = [`font-family: "${shortName(latF)}", "${shortName(hanF)}";`];
  const el = $('#naiveText');
  if (state.view.cmp === 'fsa' && han?.status === 'ok') {
    const r = +hanCapRatio(han).toFixed(3);
    el.style.fontSizeAdjust = `cap-height ${r}`;
    code.push(`font-size-adjust: cap-height ${r};`);
    lastFsaR = r;
  } else {
    el.style.fontSizeAdjust = '';
  }
  $('#naiveCode').textContent = code.join(' ');
}
function onSourcesChanged() {
  if (!$('#editor').contains(document.activeElement)) renderEditor(); else renderChipsStatus();
  renderExportSoon(); renderPresetCardsSoon(); checkMissSoon();
}
function setBusy(t) { $('#busy').textContent = t; }
