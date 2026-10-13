'use strict';
/* ================= Unicode ranges ================= */
const hex = n => n.toString(16).toUpperCase().padStart(4, '0');
function norm(list) {
  const a = list.filter(r => Number.isFinite(r[0]) && Number.isFinite(r[1]) && r[0] <= r[1] && r[1] <= 0x10FFFF)
    .map(r => [r[0], r[1]]).sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const r of a) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]); else out.push(r);
  }
  return out;
}
function parseRanges(str) {
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
const union = (a, b) => norm([...a, ...b]);
function subtract(a, b) {
  const out = [];
  for (const [lo0, hi] of a) {
    let lo = lo0;
    for (const [bl, bh] of b) { if (bh < lo || bl > hi) continue; if (bl > lo) out.push([lo, bl - 1]); lo = Math.max(lo, bh + 1); if (lo > hi) break; }
    if (lo <= hi) out.push([lo, hi]);
  }
  return out;
}
function intersect(a, b) {
  const out = []; let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    const lo = Math.max(a[i][0], b[j][0]), hi = Math.min(a[i][1], b[j][1]);
    if (lo <= hi) out.push([lo, hi]);
    if (a[i][1] < b[j][1]) i++; else j++;
  }
  return out;
}
function inRanges(list, cp) {
  let lo = 0, hi = list.length - 1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (cp < list[m][0]) hi = m - 1; else if (cp > list[m][1]) lo = m + 1; else return true; }
  return false;
}
const fmtRange = ([a, b]) => a === b ? `U+${hex(a)}` : `U+${hex(a)}-${hex(b)}`;
const fmtRanges = list => list.map(fmtRange).join(', ');
/* 字符输入：既可以直接写字符，也可以写 U+2018-201D */
function parseChars(input) {
  const out = [];
  const rest = String(input).replace(/U\+[0-9A-F?]{1,6}(?:-(?:U\+)?[0-9A-F]{1,6})?/gi, m => { out.push(...parseRanges(m)); return ' '; });
  for (const ch of rest) { if (/[\s,]/.test(ch)) continue; const cp = ch.codePointAt(0); out.push([cp, cp]); }
  return norm(out);
}

/* ================= 字符类别（对应 InDesign 复合字体的行） ================= */
const CLASSES = [
  { id: 'han', name: { zh: '汉字', ja: '漢字' }, note: { zh: '基础字体', ja: 'ベースフォント' }, desc: { zh: '基础字体。负责 CJK 统一汉字及扩展区，也兜底所有未归类的字符（如谚文、emoji）。', ja: 'ベースフォント。CJK 統合漢字と拡張領域を受け持ち、分類外の文字（ハングル、絵文字など）もここで表示します。' }, sample: '永国字體',
    ranges: '2E80-2FDF, 2FF0-2FFF, 3005-3007, 3021-3029, 3038-303B, 31C0-31EF, 3400-4DBF, 4E00-9FFF, F900-FAFF, 20000-2FA1F, 30000-323AF' },
  { id: 'latin', name: { zh: '半角西文', ja: '半角欧文' }, desc: { zh: '拉丁、希腊、西里尔字母，以及半角标点、货币符号等。', ja: 'ラテン・ギリシャ・キリル文字と、半角の約物や通貨記号など。' }, sample: 'Aa Gg Rr',
    ranges: '0020-002F, 003A-007E, 00A0-00B6, 00B8-024F, 0250-036F, 0370-03FF, 0400-04FF, 1E00-1EFF, 2000-2013, 2016-2017, 201A-201B, 201E-2024, 2027-203A, 203C-206F, 20A0-20CF, 2122, FB00-FB06' },
  { id: 'digit', name: { zh: '半角数字', ja: '半角数字' }, note: { zh: '0–9', ja: '0–9' }, desc: { zh: '只含半角 0–9；全角数字 ０–９ 属于全角符号。', ja: '半角の 0–9 のみ。全角数字 ０–９ は全角記号に含まれます。' }, sample: '0123', follow: 'latin', ranges: '0030-0039' },
  { id: 'kana', name: { zh: '假名', ja: 'かな' }, desc: { zh: '平假名、片假名，含半角片假名。', ja: 'ひらがな・カタカナ。半角カナを含みます。' }, sample: 'あいアイ', follow: 'han',
    ranges: '3040-309F, 30A0-30FA, 30FC-30FF, 31F0-31FF, FF66-FF9F, 1AFF0-1AFFF, 1B000-1B16F' },
  { id: 'punct', name: { zh: '全角标点', ja: '全角約物' }, desc: { zh: '句读、括号等全角标点，如 、。「」《》（）。', ja: '句読点や括弧などの全角約物。例：、。「」（）' }, sample: '，。「」《》', follow: 'han',
    ranges: '3000-3004, 3008-3020, 3030, 303D, 30FB, FE10-FE1F, FE30-FE4F, FE50-FE6F, FF01-FF0F, FF1A-FF20, FF3B-FF40, FF5B-FF65' },
  { id: 'symbol', name: { zh: '全角符号', ja: '全角記号' }, note: { zh: '含全角英数', ja: '全角英数を含む' }, desc: { zh: '※、全角英数、带圈字符、箭头、数学符号、几何图形等。可用齿轮把部分组改由半角西文显示。', ja: '※、全角英数、丸囲み文字、矢印、数学記号、幾何学図形など。歯車から一部のグループを半角欧文に回せます。' }, sample: '①※→℃', follow: 'han',
    ranges: '203B, 2103, 2109, 2116, 2121, 2150-218F, 2190-21FF, 2200-22FF, 2460-24FF, 2500-27BF, 3200-33FF, FF10-FF19, FF21-FF3A, FF41-FF5A, FFE0-FFEF' },
  { id: 'shared', name: { zh: '中西共用标点', ja: '和欧共通の約物' }, note: { zh: '引号 破折号 省略号 间隔号', ja: '引用符・ダッシュ・リーダー・中点' }, desc: { zh: '引号 “ ” ‘ ’、破折号 —、省略号 …、间隔号 ·。中西文共用这些码位，可用齿轮逐组决定归属。', ja: '引用符 “ ” ‘ ’、ダッシュ —、リーダー …、中点 ·。和文と欧文で同じ符号位置を使うため、歯車からグループごとに振り分けられます。' }, sample: '“‘—…·', follow: 'han',
    ranges: '00B7, 2014-2015, 2018-2019, 201C-201D, 2025-2026, 2E3A-2E3B' },
].map(c => ({ ...c, r: parseRanges(c.ranges) }));
const CLS = Object.fromEntries(CLASSES.map(c => [c.id, c]));
/* 可以单独改由半角西文显示的字符组（类别行旁的齿轮）。西文字体通常没有的字形（全角英数、※ 等）不列入 */
const GROUPS = {
  symbol: [
    { id: 'arrows', name: { zh: '箭头', ja: '矢印' }, sample: '→⇒↑', ranges: '2190-21FF' },
    { id: 'math', name: { zh: '数学符号', ja: '数学記号' }, sample: '≠≦∑', ranges: '2200-22FF' },
    { id: 'letterlike', name: { zh: '字母式符号与罗马数字', ja: '文字様記号・ローマ数字' }, sample: '℃№Ⅲ', ranges: '2103, 2109, 2116, 2121, 2150-218F' },
    { id: 'enclosed', name: { zh: '带圈与括号字符', ja: '丸囲み・括弧付き文字' }, sample: '①⑴ⓐ', ranges: '2460-24FF' },
    { id: 'geometric', name: { zh: '制表符与几何图形', ja: '罫線・幾何学図形' }, sample: '─■○', ranges: '2500-25FF' },
    { id: 'misc', name: { zh: '杂项符号与装饰符号', ja: 'その他の記号・装飾記号' }, sample: '★♪✓', ranges: '2600-27BF' },
  ],
  shared: [
    { id: 'quotes', name: { zh: '引号', ja: '引用符' }, sample: '“”‘’', ranges: '2018-2019, 201C-201D' },
    { id: 'dashes', name: { zh: '破折号', ja: 'ダッシュ' }, sample: '—―', ranges: '2014-2015, 2E3A-2E3B' },
    { id: 'ellipsis', name: { zh: '省略号', ja: 'リーダー' }, sample: '…‥', ranges: '2025-2026' },
    { id: 'middot', name: { zh: '间隔号', ja: '中点' }, sample: '·', ranges: '00B7' },
  ],
};
for (const gs of Object.values(GROUPS)) for (const g of gs) g.r = parseRanges(g.ranges);
const isMoved = (cls, g) => !!state.moved?.[cls + '.' + g.id];
/* 各类别实际负责的范围：默认范围减去被移走的组，移走的组并入半角西文 */
const EFF = {};
let CLASS_TABLE = [];
function rebuildClassRanges() {
  let moved = [];
  for (const c of CLASSES) {
    let r = c.r;
    for (const g of GROUPS[c.id] || []) if (isMoved(c.id, g)) { r = subtract(r, g.r); moved = moved.concat(g.r); }
    EFF[c.id] = r;
  }
  EFF.latin = union(EFF.latin, moved);
  CLASS_TABLE = CLASSES.flatMap(c => EFF[c.id].map(([a, b]) => [a, b, c.id])).sort((x, y) => x[0] - y[0]);
}
function classOf(cp) {
  let lo = 0, hi = CLASS_TABLE.length - 1;
  while (lo <= hi) { const m = (lo + hi) >> 1, r = CLASS_TABLE[m]; if (cp < r[0]) hi = m - 1; else if (cp > r[1]) lo = m + 1; else return r[2]; }
  return null;
}
