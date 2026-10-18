import { sfntTable } from './core.js';

// Session-only facts from the selected binary. Never store embedded names or licenses in configuration.
const cache = new WeakMap();
const tag = name => [...name].reduce((n, c) => n * 256 + c.charCodeAt(0), 0);
async function tableOf(buffer, name) {
  try { return await sfntTable(buffer, tag(name)); } catch (error) { return null; }
}
function readNames(table) {
  if (!table || table.byteLength < 6) return null;
  const records = [], count = Math.min(table.getUint16(2), Math.floor((table.byteLength - 6) / 12)), storage = table.getUint16(4);
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 12, platform = table.getUint16(at), encoding = table.getUint16(at + 2), lang = table.getUint16(at + 4), id = table.getUint16(at + 6);
    const length = table.getUint16(at + 8), start = storage + table.getUint16(at + 10);
    if (start + length > table.byteLength) continue;
    let locale = platform === 3 ? ({ 4: 'zh', 9: 'en', 17: 'ja' })[lang & 0x3ff] : platform === 1 ? ({ 0: 'en', 11: 'ja', 19: 'tw', 33: 'zh' })[lang] : null;
    if (platform === 3 && [0x404, 0xc04, 0x1404].includes(lang)) locale = 'tw';
    if (table.getUint16(0) === 1 && lang >= 0x8000) {
      const offset = 6 + count * 12, index = lang - 0x8000;
      if (offset + 2 <= table.byteLength && index < table.getUint16(offset) && offset + 6 + index * 4 <= table.byteLength) {
        const q = offset + 2 + index * 4, size = table.getUint16(q), pos = storage + table.getUint16(q + 2);
        if (pos + size <= table.byteLength) {
          const value = new TextDecoder('utf-16be').decode(new Uint8Array(table.buffer, table.byteOffset + pos, size));
          locale = /zh-(Hant|TW|HK|MO)/i.test(value) ? 'tw' : /^(zh|en|ja)\b/i.exec(value)?.[1]?.toLowerCase() || null;
        }
      }
    }
    const decoder = platform === 0 || platform === 3 && [0, 1, 10].includes(encoding) ? 'utf-16be'
      : platform === 1 ? ({ 0: 'macintosh', 1: 'shift_jis', 2: 'big5', 25: 'gb18030' })[encoding] : null;
    if (!decoder) continue;
    const text = new TextDecoder(decoder).decode(new Uint8Array(table.buffer, table.byteOffset + start, length)).replace(/\0/g, '').trim();
    if (text && !text.includes('\uFFFD')) records.push({ id, locale, text, rank: platform === 3 ? 2 : platform === 0 ? 1 : 0 });
  }
  const get = (id, locale, strict = false) => records.filter(r => r.id === id && (!strict || r.locale === locale))
    .sort((a, b) => ((b.locale === locale ? 10 : b.locale === 'en' ? 5 : 0) + b.rank) - ((a.locale === locale ? 10 : a.locale === 'en' ? 5 : 0) + a.rank))[0]?.text || '';
  const localized = Object.fromEntries(['zh', 'tw', 'ja', 'en'].map(locale => [locale, get(4, locale, true)]));
  return { localized, fullName: get(4, 'en'), family: get(16, 'en') || get(1, 'en'), style: get(17, 'en') || get(2, 'en'),
    postscript: get(6, 'en'), designer: get(9, 'en'), manufacturer: get(8, 'en'), license: get(13, 'en'), licenseUrl: get(14, 'en'), version: get(5, 'en') };
}
function characterCount(table) {
  if (!table || table.byteLength < 4) return null;
  // Count Unicode scalar values mapped to nonzero glyphs, not maxp's glyph count (which includes alternates).
  const covered = new Uint8Array(0x110000), seen = new Set(); let supported = false;
  const add = (code, glyph) => { if (glyph && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)) covered[code] = 1; };
  try {
    for (let i = 0; i < table.getUint16(2); i++) {
      const rec = 4 + i * 8, platform = table.getUint16(rec), encoding = table.getUint16(rec + 2), at = table.getUint32(rec + 4);
      if (!(platform === 0 || platform === 3 && [1, 10].includes(encoding)) || seen.has(at)) continue;
      seen.add(at); const format = table.getUint16(at);
      if ([12, 13].includes(format)) {
        supported = true; let previous = -1;
        if (table.getUint32(at + 12) > (table.byteLength - at - 16) / 12) return null;
        for (let j = 0; j < table.getUint32(at + 12); j++) {
          const q = at + 16 + j * 12, lo = table.getUint32(q), hi = Math.min(0x10ffff, table.getUint32(q + 4)), glyph = table.getUint32(q + 8);
          if (lo <= previous || hi < lo) return null; previous = hi;
          for (let c = lo; c <= hi; c++) add(c, format === 13 ? glyph : glyph + c - lo);
        }
      } else if (format === 4) {
        supported = true; const count = table.getUint16(at + 6) / 2, ends = at + 14, starts = ends + count * 2 + 2, deltas = starts + count * 2, ranges = deltas + count * 2;
        let previous = -1;
        for (let j = 0; j < count; j++) {
          const lo = table.getUint16(starts + j * 2), hi = Math.min(0xfffe, table.getUint16(ends + j * 2)), delta = table.getInt16(deltas + j * 2), offset = table.getUint16(ranges + j * 2);
          if (lo <= previous || hi < lo && lo !== 0xffff) return null; previous = hi;
          for (let c = lo; c <= hi; c++) {
            const raw = offset ? table.getUint16(ranges + j * 2 + offset + (c - lo) * 2) : c;
            add(c, offset && !raw ? 0 : (raw + delta) & 0xffff);
          }
        }
      } else if ([0, 6, 10].includes(format)) {
        supported = true;
        const first = format === 0 ? 0 : format === 6 ? table.getUint16(at + 6) : table.getUint32(at + 12);
        const count = format === 0 ? 256 : format === 6 ? table.getUint16(at + 8) : Math.min(0x110000, table.getUint32(at + 16));
        for (let j = 0; j < count; j++) add(first + j, format === 0 ? table.getUint8(at + 6 + j) : table.getUint16(at + (format === 6 ? 10 : 20) + j * 2));
      }
    }
    return supported ? covered.reduce((sum, n) => sum + n, 0) : null;
  } catch (error) { return null; }
}
export function readFontMetadata(buffer) {
  if (!cache.has(buffer)) cache.set(buffer, (async () => {
    const [name, cmap, post, fvar] = await Promise.all(['name', 'cmap', 'post', 'fvar'].map(n => tableOf(buffer, n)));
    const supported = new DataView(buffer).getUint32(0) !== 0x774f4632;
    let names = null;
    try { names = readNames(name); } catch (error) { /* One malformed optional table must not reject a usable font. */ }
    return { names, characterCount: characterCount(cmap), size: buffer.byteLength, supported,
      monospaced: post?.byteLength >= 16 ? !!post.getUint32(12) : null,
      variable: supported ? !!fvar : null };
  })());
  return cache.get(buffer);
}
