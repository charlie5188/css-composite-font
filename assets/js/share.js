import { $, T } from './i18n.js';
import { CLASSES, GROUPS } from './unicode.js';
import { SAMPLES, TYPO, WEIGHTS, isViewTypo, normalizeState, recordHistory, setState, state } from './core.js';
import { refresh } from './refresh.js';
import { syncPanes, toast } from './ui.js';

/* 链接只带一份当前配置，不带历史、预设库或用户输入的校样正文。
   新分享链接与旧 #cfg=（嵌入页面转去导出字体）分开，打开分享不会弹出导出面板。 */
const MAX_BYTES = 262144, MAX_LINK = 32768;
let ids;
const classIds = () => ids ||= new Set(CLASSES.map(c => c.id));
const obj = v => v && typeof v === 'object' && !Array.isArray(v);
const ensure = ok => { if (!ok) throw new Error('invalid'); };
const str = (v, max = 512) => { ensure(typeof v === 'string' && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v)); return v; };
const num = (v, lo, hi) => { ensure(Number.isFinite(v) && v >= lo && v <= hi); return v; };
const choice = (v, values) => { ensure(values.includes(v)); return v; };
const weights = v => { ensure(Array.isArray(v) && v.length && v.length <= 9 && v.every(w => WEIGHTS.includes(w))); return [...new Set(v)]; };
const axisTag = v => { ensure(typeof v === 'string' && /^[A-Za-z0-9 ]{4}$/.test(v)); return v; };
export const b64u = bytes => {
  let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
export async function encodeConfig(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  if (bytes.length > MAX_BYTES) throw new Error('large');
  try {
    const data = await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
    return { mode: 'd', data: b64u(new Uint8Array(data)) };
  } catch (e) { return { mode: 'j', data: b64u(bytes) }; }
}
export async function decodeConfig(data, mode = 'd') {
  ensure(typeof data === 'string' && data.length <= MAX_LINK && /^[\w-]+$/.test(data));
  const bytes = Uint8Array.from(atob(data.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  let stream = new Blob([bytes]).stream();
  if (mode === 'd') stream = stream.pipeThrough(new DecompressionStream('deflate-raw'));
  else ensure(mode === 'j');
  // 解压过程中限长，而非整份展开以后才检查，损坏或过大的链接不替换当前工作。
  const reader = stream.getReader(), chunks = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.length; if (length > MAX_BYTES) throw new Error('large'); chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const out = new Uint8Array(length); let at = 0;
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(out));
}
function font(f, italic = false) {
  if (f == null) return null;
  ensure(obj(f));
  const kind = f.kind || (italic && f.fileId ? 'file' : '');
  choice(kind, ['google', 'local', 'file', 'path']);
  const out = { kind };
  for (const key of kind === 'google' ? ['family'] : kind === 'local' ? ['name'] : kind === 'file' ? ['fileId', 'fileName'] : ['path']) out[key] = str(f[key]);
  if (f.weight != null) out.weight = num(f.weight, 1, 1000);
  if (f.axis != null) { ensure(Array.isArray(f.axis) && f.axis.length === 2); out.axis = f.axis.map(v => num(v, 1, 1000)); ensure(out.axis[0] <= out.axis[1]); }
  if (f.axes != null) {
    ensure(Array.isArray(f.axes) && f.axes.length <= 64);
    out.axes = f.axes.map(a => { ensure(Array.isArray(a) && a.length === 4); return [axisTag(a[0]), ...a.slice(1).map(v => num(v, -1e6, 1e6))]; });
  }
  for (const key of ['axesUnknown', 'vf', 'cont']) if (f[key] != null) { ensure(typeof f[key] === 'boolean'); out[key] = f[key]; }
  if (f.ital != null) { ensure([0, 1, false, true].includes(f.ital)); out.ital = f.ital; }
  if (f.alt != null) { ensure(Array.isArray(f.alt) && f.alt.length <= 32); out.alt = f.alt.map(v => str(v)); }
  if (f.xa != null) { ensure(Array.isArray(f.xa) && f.xa.length <= 64); out.xa = f.xa.map(axisTag); }
  if (f.cls != null) out.cls = choice(f.cls, ['serif', 'sans', 'other']);
  if (f.italPath != null) out.italPath = str(f.italPath, 2048);
  if (f.italic != null && !italic) { out.italic = font(f.italic, true); if (!f.italic.kind) delete out.italic.kind; }
  return out;
}
function cls(o) {
  ensure(obj(o));
  const out = { follow: o.follow == null ? null : choice(o.follow, [...classIds()]), font: font(o.font), size: o.size == null ? null : num(o.size, 50, 200), shift: o.shift == null ? null : num(o.shift, -30, 30) };
  ensure(out.follow || out.font);
  if (o.vary != null) {
    ensure(obj(o.vary) && Object.keys(o.vary).length <= 64);
    out.vary = Object.fromEntries(Object.entries(o.vary).map(([k, v]) => [axisTag(k), v === 'auto' && k === 'opsz' ? v : num(v, -1e6, 1e6)]));
  }
  return out;
}
/* 对链接数据逐项重建，未知字段不进入 state；跟随关系还要检查环。
   v 是应用的状态版本，链接前缀的 1 是分享格式版本，两者独立。 */
export function cleanConfig(raw) {
  ensure(obj(raw) && raw.v === 11 && obj(raw.classes) && Array.isArray(raw.custom) && raw.custom.length <= 100);
  const out = { v: 11, preset: '', name: str(raw.name), classes: {}, custom: [], weights: weights(raw.weights),
    baseMode: choice(raw.baseMode, ['link', 'expand']), generic: choice(raw.generic, ['auto', 'serif', 'sans-serif']),
    scope: choice(raw.scope, ['', 'zh-Hans', 'zh-Hant-TW', 'zh-Hant-HK', 'ja', 'ko', 'en']), wmode: choice(raw.wmode, ['steps', 'cont']),
    italic: raw.italic, lineMetrics: choice(raw.lineMetrics, ['han', 'off']), weightNames: {}, moved: {}, wOver: {}, typo: {} };
  ensure(typeof out.italic === 'boolean');
  ensure(Array.isArray(raw.wrange) && raw.wrange.length === 2);
  out.wrange = raw.wrange.map(v => num(v, 100, 900)); ensure(out.wrange[0] < out.wrange[1]);
  for (const id of classIds()) out.classes[id] = cls(raw.classes[id]);
  ensure(!out.classes.han.follow && out.classes.han.font);
  for (const id of classIds()) {
    const seen = new Set(); let k = id;
    while (k) { ensure(!seen.has(k)); seen.add(k); k = out.classes[k].follow; }
  }
  out.custom = raw.custom.map(c => ({ ...cls(c), chars: str(c.chars, 8192) }));
  for (const [W, row] of Object.entries(raw.wOver || {})) {
    ensure(WEIGHTS.includes(+W) && obj(row)); const next = {};
    for (const [key, value] of Object.entries(row)) {
      ensure(classIds().has(key) || /^#\d+$/.test(key) && +key.slice(1) < out.custom.length); ensure(obj(value));
      const ov = {};
      if (value.size != null) ov.size = num(value.size, 50, 200);
      if (value.weight != null) ov.weight = num(value.weight, 1, 1000);
      if (value.font != null) ov.font = font(value.font);
      if (Object.keys(ov).length) next[key] = ov;
    }
    if (Object.keys(next).length) out.wOver[W] = next;
  }
  for (const [key, value] of Object.entries(raw.weightNames || {})) {
    ensure(/\|(100|200|300|400|500|600|700|800|900)$/.test(key)); out.weightNames[str(key, 1024)] = str(value, 2048);
  }
  for (const [id, groups] of Object.entries(GROUPS)) for (const g of groups) if (raw.moved?.[id + '.' + g.id]) out.moved[id + '.' + g.id] = true;
  for (const t of TYPO.filter(t => !isViewTypo(t))) if (raw.typo?.[t.key] != null) out.typo[t.key] = choice(raw.typo[t.key], t.values.map(([v]) => v));
  if (raw.fx != null) {
    ensure(obj(raw.fx)); out.fx = { weights: weights(raw.fx.weights) };
    for (const key of ['italic', 'ttf', 'woff2', 'otf']) { ensure(typeof raw.fx[key] === 'boolean'); out.fx[key] = raw.fx[key]; }
    ensure(out.fx.ttf || out.fx.woff2 || out.fx.otf);
  }
  const view = raw.view || {}; ensure(obj(view));
  out.view = { sample: Object.hasOwn(SAMPLES, view.sample) ? view.sample : /^ja/.test(out.typo.lang) ? 'ja' : /^zh-Hant/.test(out.typo.lang) ? 'tw' : 'zh',
    size: num(view.size ?? 24, 12, 160), lh: num(view.lh ?? 1.85, 1, 2.6), weight: choice(view.weight ?? 400, WEIGHTS), wcont: num(view.wcont ?? 400, 100, 900), vertical: !!view.vertical };
  return out;
}
export const shareSnapshot = () => cleanConfig(state);
export async function shareLink(snapshot = shareSnapshot()) {
  const { mode, data } = await encodeConfig(snapshot), url = new URL(location.href);
  url.search = ''; url.hash = 'share=1' + mode + '.' + data;
  if (url.href.length > MAX_LINK) throw new Error('large');
  return url.href;
}
const nonWebFonts = s => [...Object.values(s.classes), ...s.custom, ...Object.values(s.wOver).flatMap(Object.values)].some(c => c.font && c.font.kind !== 'google');
let importing = 0;
export async function importShare() {
  const hash = location.hash;
  if (!hash.startsWith('#share=')) return;
  const turn = ++importing;
  try {
    const m = /^#share=1([dj])\.([\w-]+)$/.exec(hash); ensure(m);
    const next = cleanConfig(await decodeConfig(m[2], m[1]));
    if (turn !== importing || location.hash !== hash) return;
    const prev = state;
    next.view = { ...prev.view, ...next.view, ltab: 'fonts', mview: 'preview', text: SAMPLES[next.view.sample].text };
    next.typo = { ...Object.fromEntries(TYPO.filter(isViewTypo).map(t => [t.key, prev.typo[t.key]])), ...next.typo };
    try { setState(next); normalizeState(); } finally { setState(prev); }
    recordHistory(); setState(next);
    refresh('ranges', 'toolbar', 'typoRows', 'editor', 'preview', 'presets', 'fonts', 'fxFields', 'export');
    syncPanes();
    history.replaceState(null, '', location.pathname + location.search);
    toast(T(nonWebFonts(next) ? 'shareLoadedFonts' : 'shareLoaded'));
  } catch (e) {
    if (turn !== importing || location.hash !== hash) return;
    history.replaceState(null, '', location.pathname + location.search);
    toast(T('shareInvalid'));
  }
}
export function initShare() {
  const dialog = $('#shareDlg'), field = $('#shareUrl'), button = $('#shareBtn');
  const select = () => { field.focus(); field.select(); };
  field.addEventListener('click', select);
  $('#shareClose').addEventListener('click', () => dialog.close());
  $('#shareCopy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(field.value); dialog.close(); toast(T('shareCopied')); }
    catch (e) { select(); toast(T('shareManual')); }
  });
  button.addEventListener('click', async () => {
    button.disabled = true; button.setAttribute('aria-busy', 'true');
    let link, snapshot;
    try {
      snapshot = shareSnapshot(); link = shareLink(snapshot);
      // Safari 要求在点击当下调用剪贴板；把压缩结果作为 Blob promise 交给它，保留用户手势。
      if (navigator.clipboard?.write && window.ClipboardItem) await navigator.clipboard.write([new ClipboardItem({ 'text/plain': link.then(url => new Blob([url], { type: 'text/plain' })) })]);
      else await navigator.clipboard.writeText(await link);
      toast(T(nonWebFonts(snapshot) ? 'shareCopiedFonts' : 'shareCopied'));
    } catch (e) {
      try {
        if (!link) throw e;
        field.value = await link; $('#shareFontsNote').hidden = !nonWebFonts(snapshot); dialog.showModal(); select();
      } catch (error) { toast(T(error.message === 'large' ? 'shareTooLarge' : 'shareFailed')); }
    } finally { button.disabled = false; button.removeAttribute('aria-busy'); }
  });
  window.addEventListener('hashchange', importShare);
  importShare();
}
