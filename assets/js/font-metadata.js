import { sfntTable } from './core.js';
import { charsetCoverage } from './charset-coverage.js';

// Session-only facts from the selected binary. Never store embedded names or licenses in configuration.
const cache = new WeakMap();
// OpenType legacy language IDs (fontTools name-table maps; Mac codes checked against Apple’s TrueType reference).
// Regional variants share a row; script variants stay distinct.
// https://developer.apple.com/fonts/TrueType-Reference-Manual/RM06/Chap6name.html
const windowsLanguages = {
  0x401: "ar", 0x402: "bg", 0x403: "ca", 0x404: "tw", 0x405: "cs", 0x406: "da", 0x407: "de", 0x408: "el",
  0x409: "en", 0x40a: "es", 0x40b: "fi", 0x40c: "fr", 0x40d: "he", 0x40e: "hu", 0x40f: "is", 0x410: "it",
  0x411: "ja", 0x412: "ko", 0x413: "nl", 0x414: "nb", 0x415: "pl", 0x416: "pt", 0x417: "rm", 0x418: "ro",
  0x419: "ru", 0x41a: "hr", 0x41b: "sk", 0x41c: "sq", 0x41d: "sv", 0x41e: "th", 0x41f: "tr", 0x420: "ur",
  0x421: "id", 0x422: "uk", 0x423: "be", 0x424: "sl", 0x425: "et", 0x426: "lv", 0x427: "lt", 0x428: "tg",
  0x42a: "vi", 0x42b: "hy", 0x42c: "az", 0x42d: "eu", 0x42e: "hsb", 0x42f: "mk", 0x432: "tn", 0x434: "xh",
  0x435: "zu", 0x436: "af", 0x437: "ka", 0x438: "fo", 0x439: "hi", 0x43a: "mt", 0x43b: "se", 0x43e: "ms",
  0x43f: "kk", 0x440: "ky", 0x441: "sw", 0x442: "tk", 0x443: "uz", 0x444: "tt", 0x445: "bn", 0x446: "pa",
  0x447: "gu", 0x448: "or", 0x449: "ta", 0x44a: "te", 0x44b: "kn", 0x44c: "ml", 0x44d: "as", 0x44e: "mr",
  0x44f: "sa", 0x450: "mn", 0x451: "bo", 0x452: "cy", 0x453: "km", 0x454: "lo", 0x456: "gl", 0x457: "kok",
  0x45a: "syr", 0x45b: "si", 0x45d: "iu", 0x45e: "am", 0x461: "ne", 0x462: "fy", 0x463: "ps", 0x464: "fil",
  0x465: "dv", 0x468: "ha", 0x46a: "yo", 0x46b: "qu", 0x46c: "nso", 0x46d: "ba", 0x46e: "lb", 0x46f: "kl",
  0x470: "ig", 0x478: "ii", 0x47a: "arn", 0x47c: "moh", 0x47e: "br", 0x480: "ug", 0x481: "mi", 0x482: "oc",
  0x483: "co", 0x484: "gsw", 0x485: "sah", 0x486: "quc", 0x487: "rw", 0x488: "wo", 0x48c: "prs", 0x801: "ar",
  0x804: "zh", 0x807: "de", 0x809: "en", 0x80a: "es", 0x80c: "fr", 0x810: "it", 0x813: "nl", 0x814: "nn",
  0x816: "pt", 0x81a: "sr-Latn", 0x81d: "sv", 0x82c: "az-Cyrl", 0x82e: "dsb", 0x83b: "se", 0x83c: "ga", 0x83e: "ms",
  0x843: "uz-Cyrl", 0x845: "bn", 0x850: "mn", 0x85d: "iu-Latn", 0x85f: "tzm", 0x86b: "qu", 0xc01: "ar", 0xc04: "tw",
  0xc07: "de", 0xc09: "en", 0xc0a: "es", 0xc0c: "fr", 0xc1a: "sr", 0xc3b: "se", 0xc6b: "qu", 0x1001: "ar",
  0x1004: "zh", 0x1007: "de", 0x1009: "en", 0x100a: "es", 0x100c: "fr", 0x101a: "hr", 0x103b: "smj", 0x1401: "ar",
  0x1404: "tw", 0x1407: "de", 0x1409: "en", 0x140a: "es", 0x140c: "fr", 0x141a: "bs", 0x143b: "smj", 0x1801: "ary",
  0x1809: "en", 0x180a: "es", 0x180c: "fr", 0x181a: "sr-Latn", 0x183b: "sma", 0x1c01: "aeb", 0x1c09: "en", 0x1c0a: "es",
  0x1c1a: "sr-Cyrl", 0x1c3b: "sms", 0x2001: "ar", 0x2009: "en", 0x200a: "es", 0x201a: "bs-Cyrl", 0x203b: "sms", 0x2401: "ar",
  0x2409: "en", 0x240a: "es", 0x243b: "smn", 0x2801: "ar", 0x2809: "en", 0x280a: "es", 0x2c01: "ar", 0x2c09: "en",
  0x2c0a: "es", 0x3001: "ar", 0x3009: "en", 0x300a: "es", 0x3401: "ar", 0x3409: "en", 0x340a: "es", 0x3801: "ar",
  0x380a: "es", 0x3c01: "ar", 0x3c0a: "es", 0x4001: "ar", 0x4009: "en", 0x400a: "es", 0x4409: "en", 0x440a: "es",
  0x4809: "en", 0x480a: "es", 0x4c0a: "es", 0x500a: "es", 0x540a: "es"
};
const macLanguages = {
  0: "en", 1: "fr", 2: "de", 3: "it", 4: "nl", 5: "sv", 6: "es", 7: "da",
  8: "pt", 9: "no", 10: "he", 11: "ja", 12: "ar", 13: "fi", 14: "el", 15: "is",
  16: "mt", 17: "tr", 18: "hr", 19: "tw", 20: "ur", 21: "hi", 22: "th", 23: "ko",
  24: "lt", 25: "pl", 26: "hu", 27: "et", 28: "lv", 29: "se", 30: "fo", 31: "fa",
  32: "ru", 33: "zh", 34: "nl", 35: "ga", 36: "sq", 37: "ro", 38: "cs", 39: "sk",
  40: "sl", 41: "yi", 42: "sr", 43: "mk", 44: "bg", 45: "uk", 46: "be", 47: "uz",
  48: "kk", 49: "az-Cyrl", 50: "az-Arab", 51: "hy", 52: "ka", 53: "mo", 54: "ky", 55: "tg",
  56: "tk", 57: "mn-Mong", 58: "mn-Cyrl", 59: "ps", 60: "ku", 61: "ks", 62: "sd", 63: "bo",
  64: "ne", 65: "sa", 66: "mr", 67: "bn", 68: "as", 69: "gu", 70: "pa", 71: "or",
  72: "ml", 73: "kn", 74: "ta", 75: "te", 76: "si", 77: "my", 78: "km", 79: "lo",
  80: "vi", 81: "id", 82: "tl", 83: "ms", 84: "ms-Arab", 85: "am", 86: "ti", 87: "om",
  88: "so", 89: "sw", 90: "rw", 91: "rn", 92: "ny", 93: "mg", 94: "eo", 128: "cy",
  129: "eu", 130: "ca", 131: "la", 132: "qu", 133: "gn", 134: "ay", 135: "tt", 136: "ug",
  137: "dz", 138: "jv", 139: "su", 140: "gl", 141: "af", 142: "br", 143: "iu", 144: "gd",
  145: "gv", 146: "ga", 147: "to", 148: "el", 149: "kl", 150: "az", 151: "nn"
};
const tag = name => [...name].reduce((n, c) => n * 256 + c.charCodeAt(0), 0);
async function tableOf(buffer, name, offset = null) {
  try { return await sfntTable(buffer, tag(name), offset); } catch (error) { return null; }
}
function readNames(table) {
  if (!table || table.byteLength < 6) return null;
  const records = [], count = Math.min(table.getUint16(2), Math.floor((table.byteLength - 6) / 12)), storage = table.getUint16(4);
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 12, platform = table.getUint16(at), encoding = table.getUint16(at + 2), lang = table.getUint16(at + 4), id = table.getUint16(at + 6);
    const length = table.getUint16(at + 8), start = storage + table.getUint16(at + 10);
    if (start + length > table.byteLength) continue;
    let locale = platform === 3 ? windowsLanguages[lang] || 'und-x-win-' + lang.toString(16) : platform === 1 ? macLanguages[lang] || 'und-x-mac-' + lang : null;
    if (table.getUint16(0) === 1 && lang >= 0x8000) {
      const offset = 6 + count * 12, index = lang - 0x8000;
      if (offset + 2 <= table.byteLength && index < table.getUint16(offset) && offset + 6 + index * 4 <= table.byteLength) {
        const q = offset + 2 + index * 4, size = table.getUint16(q), pos = storage + table.getUint16(q + 2);
        if (pos + size <= table.byteLength) {
          const value = new TextDecoder('utf-16be').decode(new Uint8Array(table.buffer, table.byteOffset + pos, size));
          try {
            const canonical = Intl.getCanonicalLocales(value)[0];
            locale = /zh-(Hant|TW|HK|MO)/i.test(canonical) ? 'tw' : /^(zh|en|ja)\b/i.exec(canonical)?.[1]?.toLowerCase() || canonical;
          } catch (error) { locale = null; }
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
  const localized = Object.fromEntries([...new Set(records.filter(r => r.id === 4 && r.locale).map(r => r.locale))].map(locale => [locale, get(4, locale, true)]));
  return { localized, fullName: get(4, 'en'), family: get(16, 'en') || get(1, 'en'), style: get(17, 'en') || get(2, 'en'),
    postscript: get(6, 'en'), designer: get(9, 'en'), manufacturer: get(8, 'en'), license: get(13, 'en'), licenseUrl: get(14, 'en'), version: get(5, 'en') };
}
function characterCoverage(table, glyphCount) {
  if (!table || table.byteLength < 4 || glyphCount === 0) return null;
  // Count Unicode scalar values mapped to nonzero glyphs, not maxp's glyph count (which includes alternates).
  const covered = new Uint8Array(0x110000), seen = new Set(); let supported = false;
  const add = (code, glyph) => { if (glyph && (glyphCount == null || glyph < glyphCount) && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)) covered[code] = 1; };
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
    return supported ? { count: covered.reduce((sum, n) => sum + n, 0), sets: charsetCoverage(code => covered[code] === 1) } : null;
  } catch (error) { return null; }
}
export function readFontMetadata(buffer, postscript = '') {
  if (!cache.has(buffer)) cache.set(buffer, new Map());
  const faces = cache.get(buffer);
  if (!faces.has(postscript)) faces.set(postscript, (async () => {
    const view = new DataView(buffer); let offset = null;
    // Local Font Access may return a collection. Never inspect a different face's character map.
    if (view.getUint32(0) === 0x74746366 && postscript) {
      for (let i = 0; i < view.getUint32(8); i++) {
        const candidate = view.getUint32(12 + i * 4);
        if (readNames(await tableOf(buffer, 'name', candidate))?.postscript === postscript) { offset = candidate; break; }
      }
      if (offset == null) throw new Error('collection-face-unavailable');
    }
    const [name, cmap, post, fvar, maxp] = await Promise.all(['name', 'cmap', 'post', 'fvar', 'maxp'].map(n => tableOf(buffer, n, offset)));
    const supported = view.getUint32(0) !== 0x774f4632;
    let names = null;
    try { names = readNames(name); } catch (error) { /* One malformed optional table must not reject a usable font. */ }
    const coverage = characterCoverage(cmap, maxp?.byteLength >= 6 ? maxp.getUint16(4) : null);
    return { names, characterCount: coverage?.count ?? null, coverage: coverage?.sets ?? null, size: buffer.byteLength, supported,
      monospaced: post?.byteLength >= 16 ? !!post.getUint32(12) : null,
      variable: supported ? !!fvar : null };
  })());
  return faces.get(postscript);
}
