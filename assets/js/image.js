import { $, T, debounce } from './i18n.js';
import { inRanges } from './unicode.js';
import { liveFamily, liveSpecs, state } from './core.js';
/* ================= Image export =================
   Rasterize the proof as it appears. Clone its DOM with computed styles into an SVG foreignObject, embed the live composite faces
   (Google slices and file buffers as data URLs, installed fonts through local()), and draw the SVG onto a canvas, so the browser lays out
   the image with the same engine, fonts and typography settings as the proof. Guides, class colors and missing-glyph marks are overlays and stay out.
   The SVG must be a data: URL: Chromium taints a canvas that draws a blob: SVG containing foreignObject. */
export const IMG_SCALES = [1, 2, 3], IMG_PADS = [0, 16, 32, 64];
export function imgOpts() {
  const o = state.view.img || {};
  return { scale: IMG_SCALES.includes(o.scale) ? o.scale : 2, bg: o.bg === 'clear' ? 'clear' : 'proof', pad: IMG_PADS.includes(o.pad) ? o.pad : 32 };
}
export function setImgOpt(k, v) { state.view.img = { ...imgOpts(), [k]: v }; }
export class ImgError extends Error { constructor(key) { super(key); this.key = key; } }
const MAX_SIDE = 16384, MAX_AREA = 1 << 26;      // Stay inside every browser's canvas limits.
/* Computed properties that are not copied: editing chrome, overlays and scrolling everywhere; size and position on the proof box, which the
   image sets itself; color on runs, whose span coloring is an overlay (they inherit the proof ink instead). */
const SKIP = /^(--|overflow|background|box-shadow|outline|cursor|caret|user-select|-webkit-user|transition|animation|will-change|contain|scroll|overscroll|pointer-events)/;
const SKIP_BOX = /^(width|height|inline-size|block-size|min-|max-|margin|position|top|left|right|bottom|inset)/;
const SKIP_RUN = /^(color|-webkit-text-fill-color|text-decoration)/;
function copyStyle(from, to, skip) {
  const cs = getComputedStyle(from); let css = '';
  for (const p of cs) if (!SKIP.test(p) && !skip.test(p)) css += `${p}:${cs.getPropertyValue(p)};`;
  to.setAttribute('style', css);
}
const DESC = { weight: 'font-weight', style: 'font-style', unicodeRange: 'unicode-range', sizeAdjust: 'size-adjust', ascentOverride: 'ascent-override', descentOverride: 'descent-override', lineGapOverride: 'line-gap-override', variationSettings: 'font-variation-settings' };
/* A data: font that first loads inside the SVG image can arrive after decode() resolves, and the canvas then draws fallback glyphs.
   Loading the same URL once in this document fills the shared font cache, so the image lays out with the real faces from the start.
   Each entry keeps its FontFace so the cached font stays alive for the page session. */
const urlData = new Map(), bufData = new WeakMap();
const warm = data => { const face = new FontFace('__cf_warm', `url(${data})`); return face.load().then(() => ({ data, face }), () => ({ data, face })); };
function toDataUrl(buf, type) {
  const u8 = new Uint8Array(buf); let bin = '';
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return `data:${type};base64,${btoa(bin)}`;
}
function fontType(buf) {
  const tag = String.fromCharCode(...new Uint8Array(buf, 0, 4));
  return { wOF2: 'font/woff2', wOFF: 'font/woff', OTTO: 'font/otf', ttcf: 'font/collection' }[tag] || 'font/ttf';
}
async function srcCss(src) {
  if (typeof src !== 'string') {
    if (!bufData.has(src)) bufData.set(src, warm(toDataUrl(src, fontType(src))));
    return `url(${(await bufData.get(src)).data})`;
  }
  let out = src;      // Google CSS src: inline each url(); local() needs no data.
  for (const [all, , url] of src.matchAll(/url\((['"]?)([^'")]+)\1\)/g)) {
    if (!urlData.has(url)) urlData.set(url, fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }).then(b => warm(toDataUrl(b, fontType(b)))));
    try { out = out.replace(all, `url(${(await urlData.get(url)).data})`); }
    catch (e) { urlData.delete(url); throw new ImgError('imgErrFonts'); }
  }
  return out;
}
/* Only the faces the proof can use: ranges that contain one of its characters, at its weight, and italic faces only for an italic proof. */
async function fontCss(text, weight, italic) {
  const cps = [...new Set([...text].map(c => c.codePointAt(0)))];
  const inW = d => { const [lo, hi = lo] = String(d.weight || '').split(' ').map(Number); return !lo || (weight >= lo && weight <= hi); };
  const atW = liveSpecs.some(sp => inW(sp.d)) ? liveSpecs.filter(sp => inW(sp.d)) : liveSpecs;
  const used = atW.filter(sp => (italic || sp.d.style !== 'italic') && (!sp.range || cps.some(cp => inRanges(sp.range, cp))));
  const rules = await Promise.all(used.map(async sp => {
    let r = `font-family:"${liveFamily}";src:${await srcCss(sp.src)};`;
    for (const [k, p] of Object.entries(DESC)) if (sp.d[k]) r += `${p}:${sp.d[k]};`;
    return `@font-face{${r}}`;
  }));
  return rules.join('\n');
}
/* Render the proof to a PNG blob. Returns its CSS size before scaling. */
export async function proofImage(o = imgOpts()) {
  const pt = $('#proofText'), text = pt.textContent;
  if (!text.trim()) throw new ImgError('imgEmpty');
  const cs = getComputedStyle(pt), vertical = state.view.vertical;
  /* The image frames whole line boxes, including the half-leading the horizontal proof trims with negative margins, so ascenders and
     descenders taller than the em box stay inside even without a margin. Vertical proofs scroll sideways: add the hidden scroll width
     and leave out the scrollbar. */
  const r = pt.getBoundingClientRect();
  const bw = r.width + pt.scrollWidth - pt.clientWidth, bh = r.height - (vertical ? pt.offsetHeight - pt.clientHeight : 0);
  const w = Math.ceil(bw + 2 * o.pad), h = Math.ceil(bh + 2 * o.pad);
  if (!bw || !bh) throw new ImgError('imgEmpty');
  if (w * o.scale > MAX_SIDE || h * o.scale > MAX_SIDE || w * h * o.scale * o.scale > MAX_AREA) throw new ImgError('imgErrSize');
  const box = pt.cloneNode(true);
  for (const a of [...box.attributes]) if (!['lang', 'dir'].includes(a.name)) box.removeAttribute(a.name);
  copyStyle(pt, box, SKIP_BOX);
  box.style.cssText += `;margin:0;width:${bw}px;height:${vertical ? bh + 'px' : 'auto'};overflow:visible`;
  const runs = box.querySelectorAll('*');
  pt.querySelectorAll('*').forEach((el, i) => copyStyle(el, runs[i], SKIP_RUN));
  const page = document.createElement('div'), style = document.createElement('style');
  page.style.cssText = `box-sizing:border-box;display:flow-root;width:${w}px;height:${h}px;padding:${o.pad}px;background:${o.bg === 'clear' ? 'transparent' : getComputedStyle($('#sheet')).backgroundColor}`;
  style.textContent = await fontCss(text, parseFloat(cs.fontWeight), cs.fontStyle !== 'normal');
  page.append(style, box);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w * o.scale}" height="${h * o.scale}" viewBox="0 0 ${w} ${h}"><foreignObject width="${w}" height="${h}">${new XMLSerializer().serializeToString(page)}</foreignObject></svg>`;
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  try { await img.decode(); } catch (e) { throw new ImgError('imgErrDraw'); }
  const c = document.createElement('canvas');
  c.width = w * o.scale; c.height = h * o.scale;
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise(res => { try { c.toBlob(res, 'image/png'); } catch (e) { res(null); } });      // Some browsers taint foreignObject canvases.
  if (!blob) throw new ImgError('imgErrDraw');
  return { blob, w, h };
}
/* Export dialog: preview the PNG that Download and Copy deliver. Only the latest render may update it. */
let tok = 0, url = '';
export let imgBlob = null;
/* Mark the current image stale at once, so Download and Copy never deliver an outdated render while the next one is pending. */
function pending() {
  const o = imgOpts(), my = ++tok;
  for (const [id, k] of [['exImgScale', 'scale'], ['exImgBg', 'bg'], ['exImgPad', 'pad']])
    document.querySelectorAll(`#${id} [data-v]`).forEach(b => b.setAttribute('aria-checked', b.dataset.v === String(o[k])));
  imgBlob = null;
  for (const id of ['imgDl', 'imgCopy']) $('#' + id).disabled = true;
  $('#imgMeta').textContent = T('imgRendering');
  $('#imgOut').classList.add('busy');
  return [o, my];
}
const draw = debounce(my => { if (my === tok) render(imgOpts(), my); }, 150);
export const renderImage = () => render(...pending());
export const renderImageSoon = () => draw(pending()[1]);
function render(o, my) {
  proofImage(o).then(({ blob, w, h }) => {
    if (my !== tok) return;
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(blob); imgBlob = blob;
    const im = $('#imgPreview');
    im.src = url; im.style.width = w + 'px'; im.hidden = false;
    $('#imgOut').classList.toggle('clear', o.bg === 'clear');
    $('#imgMeta').textContent = T('imgMeta', { w: w * o.scale, h: h * o.scale, kb: Math.max(1, Math.round(blob.size / 1024)) });
    for (const id of ['imgDl', 'imgCopy']) $('#' + id).disabled = false;
  }, e => {
    if (my !== tok) return;
    $('#imgPreview').hidden = true;
    $('#imgMeta').textContent = T(e instanceof ImgError ? e.key : 'imgErrDraw');
  }).finally(() => { if (my === tok) $('#imgOut').classList.remove('busy'); });
}
