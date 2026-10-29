import { $, esc } from './i18n.js';
import { inRanges } from './unicode.js';
import { files, state } from './core.js';
import { fxFetch, gfInfo, gfPick, gfUrl, localFind } from './bake.js';
import { localData } from './ui.js';
import { ImgError, frameOf, usedSpecs } from './image.js';
/* ================= Outlined SVG =================
   The browser has already laid out the proof: line breaks, spacing, trimming and baseline shifts. Keep its positions, and take the glyphs
   from the full font files: HarfBuzz (loaded only for this export) shapes each run with the proof's language and features, and turns each
   glyph into a path placed at the position of its first character. Text becomes outlines, so the SVG needs no fonts wherever it is opened.
   Horizontal proofs only. Characters no composite font covers are drawn by system fonts in the proof and are left out here. */
export const HB_URL = 'https://cdn.jsdelivr.net/npm/harfbuzzjs@1.6.0/dist/index.mjs';
let hbLoad = null;
const harfbuzz = () => hbLoad ||= import(HB_URL).catch(() => { hbLoad = null; throw new ImgError('imgErrEngine'); });
/* ---------- Full font files ----------
   Google Fonts come from google/fonts, like font-file export: the web subsets are WOFF2, which HarfBuzz cannot read, and lack most features.
   Each face is cached for the page session with its Unicode coverage. */
const faces = new Map();      // source key -> Promise<{ face, has, fonts: Map(variation key -> Font) }>
const nameOf = f => f.kind === 'google' ? f.family + (f.ital ? ' Italic' : '') : f.kind === 'local' ? f.name : f.fileName;
const tagOf = buf => String.fromCharCode(...new Uint8Array(buf, 0, 4));
async function fontBytes(f, onFetch) {
  if (f.kind === 'google') {
    const g = gfInfo(f.family);
    await g.promise;
    const pick = g.st === 'ok' && gfPick(g.names, f.weight || 400, !!f.ital);
    if (!pick) throw new ImgError('imgErrSource', { name: nameOf(f) });
    try { return { buf: await fxFetch(gfUrl(g.lic, g.slug, pick.name), (got, total) => onFetch(nameOf(f), got, total)) }; }
    catch (e) { throw new ImgError('imgErrSource', { name: nameOf(f) }); }
  }
  if (f.kind === 'file') {
    const fl = files.get(f.fileId);
    if (!fl) throw new ImgError('imgErrSource', { name: nameOf(f) });
    if (['wOFF', 'wOF2'].includes(tagOf(fl.buffer))) throw new ImgError('imgErrWoff', { name: nameOf(f) });
    return { buf: fl.buffer };
  }
  const fd = localData.get(f.name) || localFind(f);
  if (!fd) throw new ImgError('queryLocalFonts' in window ? 'imgNeedLocal' : 'imgErrLocalApi', { name: nameOf(f) });
  return { buf: await (await fd.blob()).arrayBuffer(), ps: fd.postscriptName };
}
/* A collection (TTC) holds several faces: choose the installed face by PostScript name. */
function openFace(hb, buf, ps) {
  const blob = new hb.Blob(buf);
  if (ps && tagOf(buf) === 'ttcf') for (let i = 0, n = new DataView(buf).getUint32(8); i < n; i++) { const face = new hb.Face(blob, i); if (face.getName(6, 'en') === ps) return face; }
  return new hb.Face(blob, 0);
}
function faceFor(hb, f, onFetch) {
  const key = f.kind === 'google' ? `g:${f.family}:${f.weight || 400}:${f.ital ? 1 : 0}` : f.kind === 'file' ? 'f:' + f.fileId : 'l:' + f.name;
  if (!faces.has(key)) faces.set(key, fontBytes(f, onFetch).then(({ buf, ps }) => {
    const face = openFace(hb, buf, ps);
    return { face, has: new Set(face.collectUnicodes()), fonts: new Map() };
  }));
  const p = faces.get(key);
  p.catch(() => faces.delete(key));      // Allow a retry after a failed download or a granted permission.
  return p;
}
/* Variations as the browser applies them: explicit settings first; otherwise font-weight on wght within the face's declared range, and
   automatic optical sizing on opsz. */
function fontAt(hb, entry, d, weight, sizePx) {
  const axes = entry.face.getAxisInfos(), vals = {};
  for (const [, tag, v] of String(d.variationSettings || '').matchAll(/"(\w{4})"\s+(-?[\d.]+)/g)) vals[tag] = +v;
  if (axes.wght && vals.wght == null) { const [lo, hi = lo] = String(d.weight || weight).split(' ').map(Number); vals.wght = Math.min(hi, Math.max(lo, weight)); }
  if (axes.opsz && vals.opsz == null) vals.opsz = sizePx;
  const list = Object.entries(vals).filter(([t]) => axes[t]).map(([t, v]) => [t, Math.min(axes[t].max, Math.max(axes[t].min, v))]);
  const key = JSON.stringify(list);
  if (!entry.fonts.has(key)) {
    const font = new hb.Font(entry.face);
    if (list.length) font.setVariations(list.map(([t, v]) => new hb.Variation(t, v)));
    entry.fonts.set(key, { font, paths: new Map() });
  }
  return entry.fonts.get(key);
}
/* ---------- Features ----------
   font-feature-settings plus the font-variant properties the Text layout tab writes, as HarfBuzz feature strings. */
const VARIANTS = {
  'font-variant-numeric': { 'lining-nums': 'lnum', 'oldstyle-nums': 'onum', 'proportional-nums': 'pnum', 'tabular-nums': 'tnum', 'diagonal-fractions': 'frac', 'stacked-fractions': 'afrc', ordinal: 'ordn', 'slashed-zero': 'zero' },
  'font-variant-east-asian': { jis78: 'jp78', jis83: 'jp83', jis90: 'jp90', jis04: 'jp04', simplified: 'smpl', traditional: 'trad', 'full-width': 'fwid', 'proportional-width': 'pwid', ruby: 'ruby' },
  'font-variant-ligatures': { 'no-common-ligatures': '-liga,-clig', 'discretionary-ligatures': 'dlig', 'historical-ligatures': 'hlig', 'no-contextual': '-calt', none: '-liga,-clig,-calt' },
  'font-variant-caps': { 'small-caps': 'smcp', 'all-small-caps': 'smcp,c2sc', 'petite-caps': 'pcap', 'all-petite-caps': 'pcap,c2pc', unicase: 'unic', 'titling-caps': 'titl' },
};
function featuresOf(cs) {
  const out = [];
  for (const [prop, map] of Object.entries(VARIANTS)) for (const v of cs.getPropertyValue(prop).split(/\s+/)) if (map[v]) out.push(...map[v].split(','));
  for (const [, tag, v] of cs.fontFeatureSettings.matchAll(/"(\w{4})"(?:\s+(\w+))?/g)) out.push(`${tag}=${v === 'off' ? 0 : v === 'on' || v == null ? 1 : v}`);
  return out;
}
/* ---------- Layout ---------- */
const OPEN = /[\p{Ps}\p{Pi}]/u, MIDDLE = /[・：；]/u, CJK = /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Bopomofo}\u3000-\u303f\uff00-\uffef]/u;
const r2 = v => +v.toFixed(2);
const place = (d, ox, oy, s) => d.replace(/(-?[\d.]+(?:e-?\d+)?),(-?[\d.]+(?:e-?\d+)?)/g, (_, x, y) => `${r2(ox + x * s)},${r2(oy - y * s)}`);
/* Distance from a text range's top to the baseline. Chrome sizes every text rect in an element by its primary font, whichever font draws the
   glyph, so one probe in the proof's own style measures it. */
function baselineOffset(pt) {
  const probe = pt.cloneNode(false), mark = document.createElement('span');
  for (const a of [...probe.attributes]) if (!['lang', 'style', 'class'].includes(a.name)) probe.removeAttribute(a.name);
  probe.style.cssText += ';position:absolute;left:-9999px;top:0;visibility:hidden;width:auto;height:auto;margin:0';
  mark.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
  probe.append('国', mark);
  pt.parentNode.append(probe);
  const r = document.createRange(); r.setStart(probe.firstChild, 0); r.setEnd(probe.firstChild, 1);
  const a = mark.getBoundingClientRect().bottom - r.getClientRects()[0].top;
  probe.remove();
  return a;
}
const charRect = (node, i, len) => { const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + len); return r.getClientRects()[0] || null; };
export async function proofSvg(o, onStatus) {
  if (state.view.vertical) throw new ImgError('imgSvgVertical');
  const pt = $('#proofText'), { text, cs, box, w, h, bg } = frameOf(pt, o, 1);
  onStatus('imgLoadingEngine');
  const hb = await harfbuzz();
  const weight = parseFloat(cs.fontWeight), sizePx = parseFloat(cs.fontSize), italic = cs.fontStyle !== 'normal';
  /* Rules in declaration order, each with the live faces (and Unicode ranges) it declared. The browser uses the last declared rule whose range
     contains a character and whose font has it; the Han base declares no range and comes first. */
  const rules = new Map();
  for (const sp of usedSpecs(weight, italic, true)) { if (!rules.has(sp.p)) rules.set(sp.p, { p: sp.p, d: sp.d, specs: [] }); rules.get(sp.p).specs.push(sp); }
  const order = [...rules.values()].reverse(), fetching = new Map();
  const onFetch = (name, got, total) => { fetching.set(name, [got, total]); const v = [...fetching.values()]; onStatus('imgFetching', { got: (v.reduce((s, x) => s + x[0], 0) / 1e6).toFixed(1), total: (v.reduce((s, x) => s + x[1], 0) / 1e6).toFixed(1) }); };
  const used = new Set([...text].map(c => c.codePointAt(0)));
  const need = order.filter(r => [...used].some(cp => r.specs.some(sp => !sp.range || inRanges(sp.range, cp))));
  onStatus('imgFetching', { got: '0.0', total: '…' });
  const entries = new Map(await Promise.all(need.map(async r => [r, await faceFor(hb, r.p.font, onFetch)])));
  const ruleFor = cp => need.find(r => entries.get(r).has.has(cp) && r.specs.some(sp => !sp.range || inRanges(sp.range, cp)));
  onStatus('imgDrawing');
  const A = baselineOffset(pt), placed = [], missing = new Set(), cells = new Map();      // cells: text node -> offset -> { ch, rect, adv, lead }
  const nodes = [], walker = document.createTreeWalker(pt, NodeFilter.SHOW_TEXT);
  for (let node; (node = walker.nextNode());) nodes.push(node);
  for (const node of nodes) {
    const data = node.data, at = new Map(), ecs = getComputedStyle(node.parentElement), feats = featuresOf(ecs).map(x => hb.Feature.fromString(x)).filter(Boolean);
    cells.set(node, at);
    /* Runs: consecutive characters drawn by the same rule. Whitespace joins the current run so kerning and contextual forms see it. */
    const runs = [];
    for (let i = 0; i < data.length;) {
      const cp = data.codePointAt(i), ch = String.fromCodePoint(cp), space = /\s/.test(ch);
      at.set(i, { ch, rect: charRect(node, i, ch.length), lead: 0 });
      const rule = space ? runs.at(-1)?.rule : ruleFor(cp);
      if (!space && !rule && !/[\p{M}\p{Cf}]/u.test(ch)) missing.add(ch);
      if (rule && runs.at(-1)?.rule === rule) runs.at(-1).end = i + ch.length;
      else runs.push({ rule, start: i, end: i + ch.length });
      i += ch.length;
    }
    for (const run of runs) {
      if (!run.rule) continue;
      const entry = entries.get(run.rule), fa = fontAt(hb, entry, run.rule.d, weight, sizePx), s = sizePx * (parseFloat(run.rule.d.sizeAdjust) || 100) / 100 / entry.face.upem;
      const str = data.slice(run.start, run.end), cell = g => at.get(run.start + g.cluster);
      const shapeWith = fs => {
        const buf = new hb.Buffer();
        buf.addText(str); buf.guessSegmentProperties(); buf.setDirection(hb.Direction.LTR);
        if (pt.lang) buf.setLanguage(pt.lang);
        hb.shape(fa.font, buf, fs);
        return buf.getGlyphInfosAndPositions();
      };
      /* Keep the shaping whose advances match the browser's: features the proof's web subsets lack (such as palt) must not move glyphs here. */
      const score = gs => gs.reduce((sum, g) => { const r = cell(g)?.rect; return r ? sum + Math.abs(r.width - g.xAdvance * s) : sum; }, 0);
      const plain = shapeWith([]), styled = feats.length ? shapeWith(feats) : plain;
      for (const g of feats.length && score(plain) < score(styled) - 0.5 ? plain : styled) {
        const c = cell(g);
        if (!c?.rect || /\s/.test(c.ch)) continue;
        c.adv ??= g.xAdvance * s;
        if (!fa.paths.has(g.codepoint)) fa.paths.set(g.codepoint, fa.font.glyphToPath(g.codepoint));
        const d = fa.paths.get(g.codepoint);
        if (d) placed.push({ c, d, dx: g.xOffset * s, dy: g.yOffset * s, s });
      }
    }
  }
  /* Justified CJK lines: Chrome adds an ideograph's expansion after it, and another one before an ideograph that follows other text, inside
     that ideograph's box. Take a line's expansion from ideographs that follow ideographs, and move the others' glyphs right by it. */
  let line = [];
  const flush = () => {
    const extra = c => c.rect.width - c.adv, cjk = (k, list = line) => k >= 0 && CJK.test(list[k].ch);
    const ex = line.filter((c, k) => c.adv != null && cjk(k) && cjk(k - 1)).map(extra).sort((a, b) => a - b), u = ex.length ? ex[ex.length >> 1] : 0;
    if (u > 0.5) line.forEach((c, k) => { if (k && c.adv != null && cjk(k) && !cjk(k - 1)) c.lead = Math.min(u, Math.max(0, extra(c) - u)); });
    line = [];
  };
  for (const node of nodes) for (const c of cells.get(node).values()) {
    if (!c.rect || (line.length && c.rect.left < line.at(-1).rect.left - 1)) flush();      // A line starts where the next character jumps back left; baseline shifts move tops, not lines.
    if (c.rect) line.push(c);
  }
  flush();
  const paths = placed.map(({ c, d, dx, dy, s }) => {
    /* text-spacing-trim narrows punctuation without moving the trimmed side's ink: opening marks lose their left half, middle marks both sides. */
    const cut = c.adv - c.rect.width, trim = cut > 0.5 ? (OPEN.test(c.ch) ? cut : MIDDLE.test(c.ch) ? cut / 2 : 0) : 0;
    return `<path d="${place(d, c.rect.left - box.left + o.pad + c.lead + dx - trim, c.rect.top - box.top + o.pad + A - dy, s)}"/>`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><title>${esc(text.trim().slice(0, 80))}</title>` +
    (o.bg === 'clear' ? '' : `<rect width="${w}" height="${h}" fill="${bg}"/>`) + `\n<g fill="${cs.color}">\n${paths.join('\n')}\n</g>\n</svg>\n`;
  return { svg, w, h, missing: [...missing] };
}
