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
const AX_LABEL = { wdth: { zh: '宽度', ja: '幅' }, opsz: { zh: '光学尺寸', ja: 'オプティカルサイズ' }, slnt: { zh: '倾斜', ja: '傾き' }, GRAD: { zh: '笔画粗细', ja: 'グレード' } };
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
  zh: { label: { zh: '中文正文', ja: '中国語の本文' }, lang: 'zh-Hans', text:
`清晨6点半，第一班地铁驶出西直门站。车厢里人还不多，有人戴着AirPods听播客，有人用iPhone回复微信消息。这条线路全长27.6公里，共有19座车站，工作日客流量超过80万人次。

2026年，北京独立咖啡馆的数量增长了12.5%（GMV同比增长约20%），不少店开始用人工智能（AI）排班和订货。车站旁新开的这家只卖三样：美式18元，拿铁22元，换燕麦奶加3元，也可以在App上提前下单。营业时间写在门口的小黑板上——工作日7:30开门，周末晚半小时；Wi-Fi密码贴在收银台旁边。

店主林晓以前在一家SaaS公司做UI设计。她说：“开业第一个月卖出了4000多杯（比预想的多了一半）。来的大多是熟客……慢一点也没关系。”` },
  ja: { label: { zh: '日文正文', ja: '日本語の本文' }, lang: 'ja', text:
`朝6時半、始発の電車が駅を出る。車内はまだ空いていて、AirPodsでポッドキャストを聴く人や、iPhoneでLINEを返す人がいる。この路線は全長27.6km、駅は19か所。平日には1日80万人以上が利用する。

2026年、都内の個人経営カフェは前年比12.5%増（新規開業は約1,200店）。人工知能（AI）で発注やシフトを組む店も増えている。駅前のこの店のメニューは3つだけで、ドリップコーヒーが450円、カフェラテが520円、オーツミルクへの変更は＋50円。営業時間は平日7:30〜19:00、Wi-Fiのパスワードはレジの横に貼ってある。

店主の林さんは以前、SaaS企業でUIデザイナーをしていた。「開店から1か月で4,000杯以上（予想の1.5倍）が売れました。来てくれるのは、ほとんど常連さんです」と話す。` },
  en: { label: { zh: '西文为主', ja: '欧文中心' }, lang: 'zh-Hans', text:
`Latin type set beside Chinese characters usually looks a size too small. A CJK glyph fills most of its em square, while a Latin x-height often covers less than half of it. 汉字几乎占满字身框，而西文的x高通常不到字身的一半。

A composite font fixes this one character class at a time. Quotes, dashes and the ellipsis (“ ” — …) are the hard cases, because Chinese and English share the same code points.` },
  /* 吹き出しのように括弧なし・句点なしで短く改行し、空行で吹き出しを分ける */
  manga: { label: { zh: '漫画对白', ja: 'マンガの台詞' }, lang: 'ja', text:
`なんだって！？
そんな馬鹿な
話があるか…

ここは危険だ
早く逃げろ！！

待ってくれ！
まだ３人いるんだ

……１分だけ待つ` },
  chars: { label: { zh: '字符表', ja: '文字表' }, lang: 'zh-Hans', text:
`永国字體 あいうえお アイウエオ
字骨曜返东国三力今直
，。、；：？！「」『』《》（）
①②③ ※ → ℃ ○ ■ ０１２
“双引号” ‘单引号’ ——破折号 ……省略号 · 间隔号
Aa Bb Gg Qq Rr & @ # % ( ) [ ]
0123456789 ½ € $ ¥
3.14　12:30　1,000　50%　¥1,980` },
};

/* CSS 原生排版属性。sup：各浏览器开始支持的版本（MDN browser-compat-data，2026-10） */
const TYPO = [
  { key: 'lang', label: { zh: '语言', ja: '言語' }, prop: 'lang', attr: true, def: 'zh-Hans',
    values: [['zh-Hans', { zh: '简体中文', ja: '簡体字中国語' }], ['zh-Hant', { zh: '繁體中文', ja: '繁体字中国語' }], ['ja', { zh: '日本語', ja: '日本語' }], ['ko', { zh: '한국어', ja: '韓国語' }], ['en', { zh: 'English', ja: '英語' }]],
    note: { zh: 'HTML 的 lang 属性，不是 CSS。它决定字形的地区变体、禁则规则，word-break: auto-phrase 也依赖它。', ja: 'HTML の lang 属性で、CSS ではありません。字形の地域差や禁則を決め、word-break: auto-phrase もこれに依存します。' } },
  { key: 'autospace', label: { zh: '中西间距', ja: '和欧間のアキ' }, prop: 'text-autospace', def: 'normal', always: true,
    sup: { chrome: '140', firefox: '145', safari: '18.4' },
    values: [['normal', { zh: '加 1/8 em', ja: '1/8 em 空ける' }], ['no-autospace', { zh: '不加', ja: '空けない' }], ['ideograph-alpha', { zh: '只在字母旁', ja: '英字の前後のみ' }], ['ideograph-numeric', { zh: '只在数字旁', ja: '数字の前後のみ' }], ['auto', { zh: '由浏览器决定', ja: 'ブラウザに任せる' }]],
    note: { zh: '只在没有空格的地方加，已经手动敲了空格的不会再加。Chrome 实测初始值是 no-autospace，所以导出时总会写出这一行。', ja: 'スペースのない箇所にだけ入り、手で入れたスペースには追加されません。Chrome の実際の初期値は no-autospace なので、書き出しでは常にこの行を出力します。' } },
  { key: 'trim', label: { zh: '标点挤压', ja: '約物の詰め' }, prop: 'text-spacing-trim', def: 'normal',
    sup: { chrome: '123', firefox: '—', safari: '—' },
    values: [['normal', { zh: '相邻标点挤压，行首不挤', ja: '隣接する約物を詰める。行頭は詰めない' }], ['space-all', { zh: '全部保持全角', ja: 'すべて全角のまま' }], ['space-first', { zh: '行首也挤压，段首行除外', ja: '行頭も詰める（段落の 1 行目を除く）' }], ['trim-start', { zh: '行首也挤压，包括段首行', ja: '行頭も詰める（1 行目を含む）' }]],
    note: { zh: '例如「。」」连在一起时，其中一个收成半角。目前只有 Chromium 实现。', ja: 'たとえば「。」」が続くと片方が半角になります。現在は Chromium だけが実装しています。' } },
  { key: 'wordBreak', label: { zh: '换行单位', ja: '改行の単位' }, prop: 'word-break', def: 'normal',
    sup: { chrome: '119', firefox: '—', safari: '—' },
    values: [['normal', { zh: '逐字', ja: '1 文字ずつ' }], ['auto-phrase', { zh: '按词组', ja: '文節単位' }]],
    note: { zh: 'auto-phrase 只对 lang="ja" 和 lang="ko" 生效，适合标题和短文。', ja: 'auto-phrase は lang="ja" と lang="ko" でのみ有効で、見出しや短い文に向いています。' } },
  { key: 'lineBreak', label: { zh: '禁则', ja: '禁則' }, prop: 'line-break', def: 'auto', defJa: 'strict', init: 'auto',
    sup: { chrome: '58', firefox: '69', safari: '11' },
    values: [['auto', null], ['loose', { zh: '宽松', ja: 'ゆるい' }], ['normal', null], ['strict', { zh: '严格', ja: '厳しい' }], ['anywhere', { zh: '任意处断行', ja: 'どこでも改行' }]] },
  { key: 'wrap', label: { zh: '段落换行', ja: '段落の折り返し' }, prop: 'text-wrap', def: 'pretty', init: 'wrap',
    sup: { chrome: 'balance 114 · pretty 117', firefox: 'balance 121', safari: 'balance 17.5 · pretty 26' },
    values: [['wrap', null], ['pretty', { zh: '避免末行孤字', ja: '最終行の孤立を避ける' }], ['balance', { zh: '各行等长（标题）', ja: '行長をそろえる（見出し）' }]],
    note: { zh: 'Chrome 的 pretty 只调整段落最后四行。', ja: 'Chrome の pretty は段落の最後の 4 行だけを調整します。' } },
  { key: 'align', label: { zh: '对齐', ja: '揃え' }, prop: 'text-align', def: 'justify',
    values: [['justify', { zh: '两端对齐', ja: '両端揃え' }], ['start', { zh: '齐头', ja: '行頭揃え' }], ['center', { zh: '居中', ja: '中央揃え' }]] },
  { key: 'justify', label: { zh: '对齐方式', ja: '両端揃えの方法' }, prop: 'text-justify', def: 'auto',
    sup: { chrome: '145', firefox: '55', safari: '—' },
    values: [['auto', null], ['inter-character', { zh: '字间分配', ja: '字間で調整' }], ['inter-word', { zh: '只在词间', ja: '語間のみ' }], ['none', null]],
    note: { zh: '配合 text-align: justify 使用。', ja: 'text-align: justify と組み合わせて使います。' } },
  { key: 'hang', label: { zh: '标点悬挂', ja: 'ぶら下がり' }, prop: 'hanging-punctuation', def: 'none',
    sup: { chrome: '—', firefox: '—', safari: '10' },
    values: [['none', null], ['allow-end', { zh: '行尾句读可悬挂', ja: '行末の句読点をぶら下げる' }], ['first allow-end last', null]] },
  { key: 'feat', label: { zh: '字距特性', ja: '字詰めの機能' }, prop: 'font-feature-settings', def: 'normal',
    sup: { chrome: '48', firefox: '34', safari: '9.1' },
    values: [['normal', null], ['"palt"', { zh: '假名标点比例宽', ja: 'かなと約物をプロポーショナルに' }], ['"halt"', { zh: '标点半角', ja: '約物を半角に' }]] },
];
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

/* 预设的西文大小：以汉字字体自带西文为基准，取「按大写高对齐」与「按 x 高对齐」的几何平均，
   大写高不超过自带西文的 103%（见度量对齐面板的说明）。基线都为 0：这些组合的中线偏差在 ±2% em 以内。 */
const PRESETS = [
  { id: 'serif-sc', name: { zh: '宋体 × Garamond', ja: '宋体 × Garamond' }, tag: { zh: '简体中文', ja: '簡体字中国語' }, han: G('Noto Serif SC'), latin: G('EB Garamond'), latinSize: 115, sample: 'zh' },
  { id: 'sans-sc', name: { zh: '黑体 × Inter', ja: '黒体 × Inter' }, tag: { zh: '简体中文', ja: '簡体字中国語' }, han: G('Noto Sans SC'), latin: G('Inter'), latinSize: 100, sample: 'zh' },
  { id: 'mincho-jp', name: { zh: '明朝 × Cormorant', ja: '明朝 × Cormorant' }, tag: { zh: '日文', ja: '日本語' }, han: G('Shippori Mincho'), latin: G('Cormorant Garamond', 500), latinSize: 120, sample: 'ja' },
  /* Jost は Futura 系のジオメトリック。公式式は 107.9% だが、108% だと中線偏差が 2% em を超えるので 107% */
  { id: 'gothic-jp', name: { zh: 'ゴシック × Jost', ja: 'ゴシック × Jost' }, tag: { zh: '日文', ja: '日本語' }, han: G('Noto Sans JP'), latin: G('Jost'), latinSize: 107, sample: 'ja' },
  /* アンチゴチ：漢字はゴシック体、かなはアンチック体。欧文と約物はゴシックに従う。Zen Antique のかなは太いので、漢字は 500 で釣り合う */
  { id: 'antigochi', name: { zh: 'アンチゴチ', ja: 'アンチゴチ' }, tag: { zh: '漫画对白', ja: 'マンガの台詞' }, han: G('Zen Kaku Gothic New', 500), latin: null, classes: { kana: { font: G('Zen Antique') } }, sample: 'manga', vertical: true },
  { id: 'mac', name: { zh: '苹方 × Helvetica', ja: 'PingFang × Helvetica' }, tag: { zh: 'macOS 系统字体 · 简体中文', ja: 'macOS 標準・簡体字' }, han: L('PingFang SC Regular', ['PingFangSC-Regular']), latin: L('Helvetica Neue', ['HelveticaNeue']), latinSize: 100,
    classes: { kana: { font: L('Hiragino Sans W3', ['HiraginoSans-W3']) } }, sample: 'zh' },   /* 苹方也有假名，但日文里用冬青黑体为日文设计的假名 */
  { id: 'mac-jp', name: { zh: 'ヒラギノ角ゴ × Helvetica', ja: 'ヒラギノ角ゴ × Helvetica' }, tag: { zh: 'macOS 系统字体 · 日文', ja: 'macOS 標準・日本語' }, han: L('Hiragino Sans W3', ['HiraginoSans-W3']), latin: L('Helvetica Neue', ['HelveticaNeue']), latinSize: 106.5, sample: 'ja' },
  { id: 'win', name: { zh: '雅黑 × Segoe UI', ja: 'YaHei × Segoe UI' }, tag: { zh: 'Windows 系统字体 · 简体中文', ja: 'Windows 標準・簡体字' }, han: L('Microsoft YaHei', ['MicrosoftYaHei']), latin: L('Segoe UI', ['SegoeUI']), latinSize: 100, sample: 'zh' },
];

/* ================= 状态 ================= */
/* size / shift 为 null 表示继承：跟随别的类别时继承它的值，独立字体时为 100% / 0 */
function freshClasses(p) {
  const c = {};
  for (const k of CLASSES) c[k.id] = { follow: k.follow || null, font: null, size: null, shift: null };
  c.han.font = p.han;
  if (p.latin) { c.latin.font = p.latin; c.latin.size = p.latinSize && p.latinSize !== 100 ? p.latinSize : null; } else c.latin.follow = 'han';
  for (const [id, o] of Object.entries(p.classes || {})) Object.assign(c[id], { follow: null }, o);
  return c;
}
function stateFromPreset(p, prev) {
  return {
    v: 4,
    preset: p.id,
    name: prev?.name || 'My Composite',
    weights: prev?.weights || [100, 200, 300, 400, 500, 600, 700, 800, 900],
    baseMode: prev?.baseMode || 'link',
    weightNames: prev?.weightNames || {},
    moved: prev?.moved ? { ...prev.moved } : {},
    wOver: {},
    generic: prev?.generic || 'auto',
    scope: prev?.scope ?? '',
    wmode: prev?.wmode || 'steps',
    wrange: prev?.wrange || [100, 900],
    italic: !!prev?.italic,
    classes: freshClasses(p),
    custom: [],
    view: prev?.view ? { ...prev.view } : { sample: p.sample, text: SAMPLES[p.sample].text, size: 24, lh: 1.85, vertical: !!p.vertical, colorize: false, compare: false, cmp: 'plain', weight: 400 },
    typo: prev?.typo ? { ...prev.typo } : { ...typoDefaults(SAMPLES[p.sample].lang), lang: SAMPLES[p.sample].lang },
    metric: prev?.metric || { basis: 'mix', target: 83 },
  };
}

const LS_STATE = 'composite-font:state:v1', LS_PRESETS = 'composite-font:presets:v1';
let userPresets = lsGet(LS_PRESETS) || {};
function validState(s) {
  return s && s.classes && CLASSES.every(c => s.classes[c.id] && 'size' in s.classes[c.id]) && s.classes.han.font && Array.isArray(s.custom) && s.view;
}
let state = validState(lsGet(LS_STATE)) ? lsGet(LS_STATE) : stateFromPreset(PRESETS.find(p => p.id === (UI === 'ja' ? 'mincho-jp' : 'serif-sc')));
function normalizeState() {
  if (!(state.v >= 2)) {    // 旧版本里「跟随」连大小、基线一起跟随，迁移为继承
    for (const o of [...Object.values(state.classes), ...state.custom]) if (o.follow) { o.size = null; o.shift = null; }
    state.v = 2;
  }
  if (state.v === 2) {      // v2 默认只导出 400；v3 起默认导出全部字重，让每个字重都能单独调整
    if (Array.isArray(state.weights) && state.weights.length === 1 && state.weights[0] === 400) state.weights = [100, 200, 300, 400, 500, 600, 700, 800, 900];
    state.v = 3;
  }
  state.typo = { ...typoDefaults(state.typo?.lang), ...(state.typo || {}) };
  if (state.v === 3) {      // v4 起正文默认：text-wrap: pretty；日文 line-break: strict。仍是旧默认值的改成新默认值
    if (state.typo.wrap === 'wrap') state.typo.wrap = 'pretty';
    if (/^ja/.test(state.typo.lang) && state.typo.lineBreak === 'auto') state.typo.lineBreak = 'strict';
    state.v = 4;
  }
  state.view.cmp = state.view.cmp || 'plain';
  state.metric = { basis: 'mix', target: 83, ...(state.metric || {}) };
  state.weights = Array.isArray(state.weights) && state.weights.length ? [...new Set(state.weights)].sort((a, b) => a - b) : [state.weight || 400];
  delete state.weight;
  state.baseMode = state.baseMode || 'link';
  state.weightNames = state.weightNames || {};
  state.scope = state.scope || '';
  state.wmode = state.wmode === 'cont' ? 'cont' : 'steps';        // 字重：分档 / 连续（可变字体）
  state.italic = !!state.italic;                                   // 导出斜体
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
  if (state.view.sample in SAMPLES) state.view.text = SAMPLES[state.view.sample].text;     // 选的是示例时跟着示例更新（改过的文字已经是 custom）
  if (!state.weights.includes(state.view.weight)) state.view.weight = state.weights.includes(400) ? 400 : state.weights[0];
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
  const ov = ((state.wOver[W] ||= {})[key] ||= {});
  if (v == null) delete ov.size; else ov.size = v;
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
}
const rebuild = debounce(rebuildNow, 70);
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
  renderExportSoon(); renderPresetCardsSoon();
}
function setBusy(t) { $('#busy').textContent = t; }
