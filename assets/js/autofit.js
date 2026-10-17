import { finalFont, fontKey, gfWeights, source, vfAxisNow } from './core.js';
import { fmtRanges, inRanges } from './unicode.js';
import { round } from './i18n.js';
import { loadBlank } from './ui.js';

/* 自动匹配只测量，不改 state；所有结果算完再由 ui 一次写入，避免预览闪动和撤销记下中间状态。
   字重以汉字字体自带的 H、h 为参照，在最终大小下比较主干；不是按汉字的黑色面积猜粗细。
   这是视觉匹配的起点，衬线反差、字形风格等仍需在正文里判断。 */
const FS = 256, SAMPLE = 'Hhx', median = a => a.sort((a, b) => a - b)[Math.floor(a.length / 2)];
let seq = 0;

/* 同类字符逐字比较，不能把句号、声调号等小字形放大到汉字高度。
   全角标点/符号按字身宽度匹配大小，再用对应字形的位置匹配基线。 */
export const FIT_SAMPLES = {
  digit: '0123456789', kana: 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんアイウエオカナ',
  punct: '「」『』（）［］《》〈〉、。，．！？：；', shared: '“”‘’—…·',
  symbol: '※①②③→←↑↓＋−＝０１２３４５６７８９', bopo: 'ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏ',
};

function glyphStroke(ctx, ch, m) {
  ctx.clearRect(0, 0, 512, 512); ctx.fillText(ch, 48, 384);
  const px = ctx.getImageData(0, 0, 512, 512).data, runs = [], h = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
  const x0 = 48 - m.actualBoundingBoxLeft, x1 = 48 + m.actualBoundingBoxRight, y0 = 384 - m.actualBoundingBoxAscent;
  for (const q of [.2, .35, .5, .65, .8]) for (const vertical of [false, true]) {
    const fixed = Math.round(vertical ? x0 + (x1 - x0) * q : y0 + h * q);
    let run = 0;
    for (let p = 0; p <= 512; p++) {
      const x = vertical ? fixed : p, y = vertical ? p : fixed;
      const a = p < 512 && x >= 0 && x < 512 && y >= 0 && y < 512 ? px[(y * 512 + x) * 4 + 3] / 255 : 0;
      if (a) run += a;
      else if (run) { if (run > .75 && run < h * .3) runs.push(run); run = 0; }
    }
  }
  return runs.length >= 6 ? runs.sort((a, b) => a - b)[Math.floor(runs.length * .35)] : null;
}

export function fitSize(ref, latin, hanSize = 100) {
  const cap = ref.H / latin.H, x = ref.x / latin.x;
  const scale = ref.hasLatin ? Math.min(Math.sqrt(cap * x), 1.03 * cap) : 0.83 * ref.face / latin.H;
  return Math.min(200, Math.max(50, round(scale * hanSize)));
}

/* 横切 H 的上下部和 h 的下部，绕开横画、拱肩和衬线；每条竖干取抗锯齿覆盖宽度。
   在 256px 测量而非校样字号，避免屏幕像素取整让相邻候选字重的结果抖动。 */
function stems(ctx, ch, height) {
  ctx.clearRect(0, 0, 512, 512); ctx.fillText(ch, 48, 384);
  const pixels = ctx.getImageData(0, 0, 512, 512).data, widths = [];
  const cuts = ch === 'H' ? [0.2, 0.3, 0.7, 0.8] : [0.65, 0.75, 0.85];
  for (const q of cuts) {
    const y = Math.round(384 - height * (1 - q));
    let run = 0;
    for (let x = 0; x < 512; x++) {
      const a = pixels[(y * 512 + x) * 4 + 3] / 255;
      if (a > 0) run += a;
      else if (run) { if (run > 0.5 && run < height * 0.45) widths.push(run); run = 0; }
    }
  }
  return widths.length >= cuts.length ? median(widths) : null;
}

export function createFitter() {
  const faces = [], cache = new Map(), variations = 'variationSettings' in FontFace.prototype;
  async function measure(r, weight, han = false, chars = '') {
    const { font, fvs } = finalFont(r.font, r.vary);
    if (!font) return null;
    // 旧浏览器忽略 FontFace 的可变轴描述；其他轴无法可靠测量时保留该类别，不能按默认轮廓误调。
    if (!variations && fvs && Object.keys(fvs).length) return null;
    const axis = vfAxisNow(font), w = weight ?? font.weight ?? 400;
    const key = JSON.stringify([fontKey(font), fvs, w, han, chars]);
    if (cache.has(key)) return cache.get(key);
    const pending = (async () => {
      /* Google 可变字体只下载一次完整轴；每个候选借同一文件建立固定轴值的临时 face。 */
      const s = source(font.kind === 'google' && Array.isArray(axis) ? { ...font, vf: true } : font);
      await s.promise;
      if (s.status !== 'ok') return null;
      if (font.kind === 'google' && Array.isArray(axis) && !s.axis) return null;
      // 当前字体和汉字参照可以使用实际取到的相邻档位；候选必须确实存在，不能把回退当成新字重。
      if (font.kind === 'google' && !axis && weight != null && s.actualWeight !== w) return null;
      const family = `__cf_fit_${++seq}`, vars = { ...fvs };
      if (Array.isArray(axis)) vars.wght = w;
      const settings = Object.entries(vars).map(([k, v]) => `"${k}" ${v}`).join(', ');
      const sample = chars || SAMPLE + (han ? '国' : '');
      // wght 同时走标准 font-weight：旧版 Chromium 不支持 variationSettings，会把所有候选画成默认字重。
      const cssWeight = Array.isArray(axis) ? w : 400, fontSpec = `${cssWeight} ${FS}px "${family}"`;
      for (const fc of s.faces) {
        // CJK 网页字体可能有上百分片；每个候选只注册样字用到的分片，避免多类别测量堆积临时 face。
        if (fc.range && ![...sample].some(ch => inRanges(fc.range, ch.codePointAt(0)))) continue;
        const d = { weight: String(cssWeight), ...(fc.range ? { unicodeRange: fmtRanges(fc.range) } : {}), ...(settings ? { variationSettings: settings } : {}) };
        const face = new FontFace(family, fc.buffer || fc.src, d);
        faces.push(face); document.fonts.add(face);
      }
      let timer;
      try {
        await Promise.race([document.fonts.load(fontSpec, sample), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('font timeout')), 8000); })]);
      } catch (e) { return null; } finally { clearTimeout(timer); }
      const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
      ctx.canvas.width = ctx.canvas.height = 512;
      /* 用项目已有的零宽空白字体接管缺字，不能把系统的 CJK 回退误当成源字体。 */
      if (!(await loadBlank())) return null;
      ctx.font = `${fontSpec}, "__cf_blank"`;
      const owns = ch => ctx.measureText(ch).width > 0;
      if (chars) {
        const owned = [...new Set(chars)].filter(owns), glyphs = {};
        ctx.font = fontSpec; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#000';
        for (const ch of owned) {
          const m = ctx.measureText(ch), height = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
          if (height > 0) glyphs[ch] = { height, width: m.width, mid: (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2,
            stroke: Object.keys(glyphs).length < 8 ? glyphStroke(ctx, ch, m) : null };
        }
        return Object.keys(glyphs).length ? { glyphs, weight: s.actualWeight } : null;
      }
      const hasLatin = [...SAMPLE].every(owns);
      if ((!han && !hasLatin) || (han && !owns('国'))) return null;
      ctx.font = fontSpec; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#000';
      const H = ctx.measureText('H').actualBoundingBoxAscent, x = ctx.measureText('x').actualBoundingBoxAscent;
      const m = han && ctx.measureText('国'), face = m ? m.actualBoundingBoxAscent + m.actualBoundingBoxDescent : null;
      const stroke = hasLatin ? ['H', 'h'].map(ch => stems(ctx, ch, ctx.measureText(ch).actualBoundingBoxAscent)) : [];
      return (han ? face > 0 : H > 0 && x > 0) ? { H, x, face, weight: s.actualWeight, mid: m ? (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2 : null, hasLatin, stroke: stroke.every(v => v > 0) && stroke.length ? stroke : null } : null;
    })();
    cache.set(key, pending); return pending;
  }

  async function fit(row, matchWeight) {
    const chars = row.sample || '', ref = await measure(row.han, null, !chars, chars), current = await measure(row.latin, null, false, chars);
    if (!ref || !current) return { ...row, candidates: [] };
    const common = chars && [...chars].filter(ch => ref.glyphs[ch] && current.glyphs[ch]);
    if (chars && common.length < (row.minimum || 2)) return { ...row, candidates: [] };
    const f = row.latin.font, axis = vfAxisNow(f);
    const avail = f.kind === 'google' ? gfWeights(f.family) : null;
    const strokeChars = chars && common.filter(ch => ref.glyphs[ch].stroke && current.glyphs[ch].stroke);
    const canMatch = matchWeight && (chars ? strokeChars.length >= Math.min(3, common.length) : ref.hasLatin && ref.stroke && current.stroke) && (Array.isArray(axis) || avail?.length > 1);
    const currentWeight = Array.isArray(axis) ? Math.min(axis[1], Math.max(axis[0], f.weight || 400)) : current.weight ?? f.weight ?? null;
    const candidate = async w => {
      const m = w === currentWeight ? current : await measure({ ...row.latin, font: { ...f, weight: w } }, w, false, chars);
      if (!m || (canMatch && !chars && !m.stroke)) return null;
      if (chars) {
        if (common.some(ch => !m.glyphs[ch]) || (canMatch && strokeChars.some(ch => !m.glyphs[ch].stroke))) return null;
        const dimension = row.width ? 'width' : 'height';
        const size = Math.min(200, Math.max(50, round(median(common.map(ch => ref.glyphs[ch][dimension] / m.glyphs[ch][dimension])) * row.han.size)));
        const shift = round((row.han.shift || 0) + median(common.map(ch => ref.glyphs[ch].mid * row.han.size - m.glyphs[ch].mid * size)) / FS);
        const error = canMatch ? median(strokeChars.map(ch => Math.abs(Math.log(m.glyphs[ch].stroke * size / (ref.glyphs[ch].stroke * row.han.size))))) : 0;
        return { weight: w, size, shift, error };
      }
      const size = fitSize(ref, m, row.han.size), scale = size / row.han.size;
      const error = canMatch && m.stroke ? m.stroke.reduce((n, v, i) => n + Math.abs(Math.log(v * scale / ref.stroke[i])), 0) / m.stroke.length : 0;
      return { weight: w, size, shift: round((row.han.shift || 0) + (ref.mid * row.han.size - m.H * size / 2) / FS), error };
    };
    const original = await candidate(currentWeight);
    if (!canMatch) return { ...row, candidates: [original], original };
    let weights = Array.isArray(axis) ? [axis[0], axis[1], ...Array.from({ length: 9 }, (_, i) => (i + 1) * 100).filter(w => w >= axis[0] && w <= axis[1])] : avail;
    const candidates = [original];
    const add = async ws => { for (const w of [...new Set(ws)]) if (!candidates.some(c => c.weight === w)) { const c = await candidate(w); if (c) candidates.push(c); } };
    await add(weights);
    if (Array.isArray(axis)) {
      const best = candidates.reduce((a, b) => b.error < a.error ? b : a);
      weights = Array.from({ length: 11 }, (_, i) => best.weight - 100 + i * 20).filter(w => w >= axis[0] && w <= axis[1]);
      await add(weights);
    }
    /* 少于约 4% 的测量改善不改字重；轻微惩罚大幅换档，优先保留设计师当前的选择。 */
    for (const c of candidates) c.cost = c === original ? c.error : c.error + 0.04 + Math.abs(c.weight - original.weight) / 100 * 0.005;
    return { ...row, candidates, original };
  }
  return { fit, dispose() { faces.forEach(f => document.fonts.delete(f)); } };
}

/* 同一字体的各档一起选：最低误差也不能让粗体比正文更细。手动换过字体的行分开处理。 */
export function chooseFits(rows) {
  const groups = new Map(), out = new Map();
  for (const row of rows) {
    if (!row.candidates.length) continue;
    const f = row.latin.font;
    const key = JSON.stringify([f.kind, f.family || f.fileId || f.name, f.ital, row.latin.vary]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => a.W - b.W);
    let prev = [{ cost: 0, path: [], weight: -Infinity }];
    for (const row of group) {
      prev = row.candidates.map(c => {
        const p = prev.filter(p => c.weight == null || p.weight == null || p.weight <= c.weight).reduce((a, b) => b.cost < a.cost ? b : a, { cost: Infinity });
        return { weight: c.weight, cost: p.cost + (c.cost ?? c.error), path: [...(p.path || []), c] };
      });
    }
    const best = prev.reduce((a, b) => b.cost < a.cost ? b : a, { cost: Infinity });
    group.forEach((row, i) => out.set(row.W, Number.isFinite(best.cost) ? best.path[i] : row.original));
  }
  return out;
}
