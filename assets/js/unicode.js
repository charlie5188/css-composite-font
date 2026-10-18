import { state } from './core.js';
/* ================= Unicode ranges ================= */
export const hex = n => n.toString(16).toUpperCase().padStart(4, '0');
export function norm(list) {
  const a = list.filter(r => Number.isFinite(r[0]) && Number.isFinite(r[1]) && r[0] <= r[1] && r[1] <= 0x10FFFF)
    .map(r => [r[0], r[1]]).sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const r of a) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]); else out.push(r);
  }
  return out;
}
export function parseRanges(str) {
  const out = [];
  for (let t of String(str).split(/[\s,]+/)) {
    t = t.trim().replace(/^u\+/i, '');
    if (!t) continue;
    if (t.includes('?')) out.push([parseInt(t.replace(/\?/g, '0'), 16), parseInt(t.replace(/\?/g, 'F'), 16)]);
    else if (t.includes('-')) { const [a, b] = t.split('-'); out.push([parseInt(a, 16), parseInt(b.replace(/^u\+/i, ''), 16)]); }
    else { const v = parseInt(t, 16); out.push([v, v]); }
  }
  return norm(out);
}
export const union = (a, b) => norm([...a, ...b]);
export function subtract(a, b) {
  const out = [];
  for (const [lo0, hi] of a) {
    let lo = lo0;
    for (const [bl, bh] of b) { if (bh < lo || bl > hi) continue; if (bl > lo) out.push([lo, bl - 1]); lo = Math.max(lo, bh + 1); if (lo > hi) break; }
    if (lo <= hi) out.push([lo, hi]);
  }
  return out;
}
export function intersect(a, b) {
  const out = []; let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    const lo = Math.max(a[i][0], b[j][0]), hi = Math.min(a[i][1], b[j][1]);
    if (lo <= hi) out.push([lo, hi]);
    if (a[i][1] < b[j][1]) i++; else j++;
  }
  return out;
}
export function inRanges(list, cp) {
  let lo = 0, hi = list.length - 1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (cp < list[m][0]) hi = m - 1; else if (cp > list[m][1]) lo = m + 1; else return true; }
  return false;
}
export const fmtRange = ([a, b]) => a === b ? `U+${hex(a)}` : `U+${hex(a)}-${hex(b)}`;
export const fmtRanges = list => list.map(fmtRange).join(', ');
/* Character input accepts literal characters or ranges such as U+2018-201D. */
export function parseChars(input) {
  const out = [];
  const rest = String(input).replace(/U\+[0-9A-F?]{1,6}(?:-(?:U\+)?[0-9A-F]{1,6})?/gi, m => { out.push(...parseRanges(m)); return ' '; });
  for (const ch of rest) { if (/[\s,]/.test(ch)) continue; const cp = ch.codePointAt(0); out.push([cp, cp]); }
  return norm(out);
}

/* ================= Character classes (InDesign composite-font rows) ================= */
export const CLASSES = [
  { id: 'han', name: { zh: '汉字', ja: '漢字', tw: '漢字', en: 'Han' }, desc: { zh: '基础字体。负责 CJK 统一汉字及扩展区，也兜底所有未归类的字符（如谚文、emoji）。', ja: 'ベースフォント。CJK 統合漢字と拡張領域を受け持ち、分類外の文字（ハングル、絵文字など）もここで表示します。', tw: '基礎字型。負責 CJK 統一漢字及擴充區，也接手所有未歸類的字元（如韓文字母、emoji）。', en: 'Base font. Covers CJK Unified Ideographs and their extensions, and is the fallback for every unclassified character (such as Hangul and emoji).' }, sample: '永国字體',
    ranges: '2E80-2FDF, 2FF0-2FFF, 3005-3007, 3021-3029, 3038-303B, 31C0-31EF, 3400-4DBF, 4E00-9FFF, F900-FAFF, 20000-2FA1F, 30000-323AF' },
  { id: 'latin', name: { zh: '半角西文', ja: '半角欧文', tw: '半形西文', en: 'Western' }, desc: { zh: '拉丁、希腊、西里尔字母，以及半角标点、货币符号等。', ja: 'ラテン・ギリシャ・キリル文字と、半角の約物や通貨記号など。', tw: '拉丁、希臘、西里爾字母，以及半形標點、貨幣符號等。', en: 'Latin, Greek and Cyrillic letters, plus half-width punctuation, currency symbols and more.' }, sample: 'Aa Gg Rr',
    ranges: '0020-002F, 003A-007E, 00A0-00B6, 00B8-024F, 0250-02C6, 02C8-02C9, 02CC-02D8, 02DA-036F, 0370-03FF, 0400-04FF, 1E00-1EFF, 2000-2013, 2016-2017, 201A-201B, 201E-2024, 2027-203A, 203C-206F, 20A0-20CF, 2122, FB00-FB06' },
  { id: 'digit', name: { zh: '半角数字', ja: '半角数字', tw: '半形數字', en: 'Digits' }, desc: { zh: '只含半角 0–9；全角数字 ０–９ 属于全角符号。', ja: '半角の 0–9 のみ。全角数字 ０–９ は全角記号に含まれます。', tw: '只含半形 0–9；全形數字 ０–９ 屬於全形符號。', en: 'Half-width 0–9 only; full-width digits ０–９ belong to Full-width symbols.' }, sample: '0123', follow: 'latin', ranges: '0030-0039' },
  { id: 'kana', name: { zh: '假名', ja: 'かな', tw: '假名', en: 'Kana' }, desc: { zh: '平假名、片假名，含半角片假名。', ja: 'ひらがな・カタカナ。半角カナを含みます。', tw: '平假名、片假名，含半形片假名。', en: 'Hiragana and katakana, including half-width katakana.' }, sample: 'あいアイ', follow: 'han',
    ranges: '3040-309F, 30A0-30FA, 30FC-30FF, 31F0-31FF, FF66-FF9F, 1AFF0-1AFFF, 1B000-1B16F' },
  /* Taiwan Zhuyin and tone marks (acute, caron, grave, dot). Tone marks originally lie in Western ranges; assign them here to use the Zhuyin font, with a gear option to restore Western ownership. */
  { id: 'bopo', name: { zh: '注音符号', ja: '注音符号', tw: '注音符號', en: 'Zhuyin' }, desc: { zh: '注音符号ㄅㄆㄇ和声调符号 ˊ ˇ ˋ ˙。', ja: '注音符号ㄅㄆㄇと声調記号 ˊ ˇ ˋ ˙。', tw: '注音符號ㄅㄆㄇ和聲調號 ˊ ˇ ˋ ˙。', en: 'Zhuyin ㄅㄆㄇ and tone marks ˊ ˇ ˋ ˙.' }, sample: 'ㄅㄆㄇ', follow: 'han',
    ranges: '02C7, 02CA-02CB, 02D9, 3100-312F, 31A0-31BF' },
  { id: 'punct', name: { zh: '全角标点', ja: '全角約物', tw: '全形標點', en: 'Full-width punctuation' }, desc: { zh: '句读、括号等全角标点，如 、。「」《》（）。', ja: '句読点や括弧などの全角約物。例：、。「」（）', tw: '句讀、括號等全形標點，如 、。「」《》（）。', en: 'Full-width punctuation such as commas, periods and brackets: 、。「」《》（）.' }, sample: '，。「」《》', follow: 'han',
    ranges: '3000-3004, 3008-3020, 3030, 303D, 30FB, FE10-FE1F, FE30-FE4F, FE50-FE6F, FF01-FF0F, FF1A-FF20, FF3B-FF40, FF5B-FF65' },
  { id: 'symbol', name: { zh: '全角符号', ja: '全角記号', tw: '全形符號', en: 'Full-width symbols' }, desc: { zh: '※、全角英数、带圈字符、箭头、数学符号、几何图形等。可用齿轮把部分组改由半角西文显示。', ja: '※、全角英数、丸囲み文字、矢印、数学記号、幾何学図形など。歯車から一部のグループを半角欧文に回せます。', tw: '※、全形英數、帶圈字元、箭頭、數學符號、幾何圖形等。可用齒輪把部分組改由半形西文顯示。', en: '※, full-width alphanumerics, circled characters, arrows, math symbols, geometric shapes and more. Use the gear to send some groups to Western.' }, sample: '①※→℃', follow: 'han',
    ranges: '203B, 2103, 2109, 2116, 2121, 2150-218F, 2190-21FF, 2200-22FF, 2460-24FF, 2500-27BF, 3200-33FF, FF10-FF19, FF21-FF3A, FF41-FF5A, FFE0-FFEF' },
  { id: 'shared', name: { zh: '中西共用标点', ja: '和欧共通の約物', tw: '中西共用標點', en: 'Shared punctuation' }, desc: { zh: '引号 “ ” ‘ ’、破折号 —、省略号 …、间隔号 ·。中西文共用这些码位，可用齿轮逐组决定归属。', ja: '引用符 “ ” ‘ ’、ダッシュ —、リーダー …、中点 ·。和文と欧文で同じ符号位置を使うため、歯車からグループごとに振り分けられます。', tw: '引號 “ ” ‘ ’、破折號 —、刪節號 …、間隔號 ·。中西文共用這些碼位，可用齒輪逐組決定歸屬。', en: 'Quotes “ ” ‘ \', dash —, ellipsis … and middle dot ·. CJK and Western text share these code points; use the gear to choose where each group goes.' }, sample: '“‘—…·', follow: 'han',
    ranges: '00B7, 2014-2015, 2018-2019, 201C-201D, 2025-2026, 2E3A-2E3B' },
].map(c => ({ ...c, r: parseRanges(c.ranges) }));
export const CLS = Object.fromEntries(CLASSES.map(c => [c.id, c]));
/* Gear-menu groups can be delegated to Western text. Omit glyphs Western fonts usually lack, such as full-width alphanumerics and reference marks. */
export const GROUPS = {
  symbol: [
    { id: 'arrows', name: { zh: '箭头', ja: '矢印', tw: '箭頭', en: 'Arrows' }, sample: '→⇒↑', ranges: '2190-21FF' },
    { id: 'math', name: { zh: '数学符号', ja: '数学記号', tw: '數學符號', en: 'Math symbols' }, sample: '≠≦∑', ranges: '2200-22FF' },
    { id: 'letterlike', name: { zh: '字母式符号与罗马数字', ja: '文字様記号・ローマ数字', tw: '字母式符號與羅馬數字', en: 'Letterlike symbols and Roman numerals' }, sample: '℃№Ⅲ', ranges: '2103, 2109, 2116, 2121, 2150-218F' },
    { id: 'enclosed', name: { zh: '带圈与括号字符', ja: '丸囲み・括弧付き文字', tw: '帶圈與括號字元', en: 'Circled and parenthesized characters' }, sample: '①⑴ⓐ', ranges: '2460-24FF' },
    { id: 'geometric', name: { zh: '制表符与几何图形', ja: '罫線・幾何学図形', tw: '製表符與幾何圖形', en: 'Box drawing and geometric shapes' }, sample: '─■○', ranges: '2500-25FF' },
    { id: 'misc', name: { zh: '杂项符号与装饰符号', ja: 'その他の記号・装飾記号', tw: '雜項符號與裝飾符號', en: 'Misc. symbols and dingbats' }, sample: '★♪✓', ranges: '2600-27BF' },
  ],
  /* Tone marks default to Zhuyin; turning this off delegates them to Western text. Accented letters such as French e-acute and a-grave use other code points and are unaffected. */
  bopo: [
    { id: 'tones', name: { zh: '声调号', ja: '声調記号', tw: '聲調號', en: 'Tone marks' }, sample: 'ˊˇˋ˙', ranges: '02C7, 02CA-02CB, 02D9' },
  ],
  shared: [
    { id: 'quotes', name: { zh: '引号', ja: '引用符', tw: '引號', en: 'Quotes' }, sample: '“”‘’', ranges: '2018-2019, 201C-201D' },
    { id: 'dashes', name: { zh: '破折号', ja: 'ダッシュ', tw: '破折號', en: 'Dashes' }, sample: '—―', ranges: '2014-2015, 2E3A-2E3B' },
    { id: 'ellipsis', name: { zh: '省略号', ja: 'リーダー', tw: '刪節號', en: 'Ellipsis' }, sample: '…‥', ranges: '2025-2026' },
    { id: 'middot', name: { zh: '间隔号', ja: '中点', tw: '間隔號', en: 'Middle dot' }, sample: '·', ranges: '00B7' },
  ],
};
for (const gs of Object.values(GROUPS)) for (const g of gs) g.r = parseRanges(g.ranges);
export const isMoved = (cls, g) => !!state.moved?.[cls + '.' + g.id];
/* Effective ranges: subtract reassigned groups from each class and merge them into Western text. */
export const EFF = {};
export let CLASS_TABLE = [];
export function rebuildClassRanges() {
  let moved = [];
  for (const c of CLASSES) {
    let r = c.r;
    for (const g of GROUPS[c.id] || []) if (isMoved(c.id, g)) { r = subtract(r, g.r); moved = moved.concat(g.r); }
    EFF[c.id] = r;
  }
  EFF.latin = union(EFF.latin, moved);
  CLASS_TABLE = CLASSES.flatMap(c => EFF[c.id].map(([a, b]) => [a, b, c.id])).sort((x, y) => x[0] - y[0]);
}
export function classOf(cp) {
  let lo = 0, hi = CLASS_TABLE.length - 1;
  while (lo <= hi) { const m = (lo + hi) >> 1, r = CLASS_TABLE[m]; if (cp < r[0]) hi = m - 1; else if (cp > r[1]) lo = m + 1; else return r[2]; }
  return null;
}
