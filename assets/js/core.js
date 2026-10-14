'use strict';
/* ================= 字体来源 ================= */
const G = (family, weight = 400) => ({ kind: 'google', family, weight });
const L = (name, alt = []) => ({ kind: 'local', name, alt });
function fontKey(f) {
  if (!f) return 'none';
  return f.kind === 'google' ? `g:${f.family}@${f.weight}` : f.kind === 'local' ? `l:${f.name}` : f.kind === 'path' ? `p:${f.path}` : `f:${f.fileId}`;
}
const sameFont = (a, b) => fontKey(a) === fontKey(b);
const fontLabel = f => !f ? T('unset') : f.kind === 'google' ? `${f.family} ${sources.get(fontKey(f))?.actualWeight || f.weight}` : f.kind === 'local' ? f.name : f.kind === 'path' ? f.path : f.fileName;
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
      for (const w of weightChain(f.weight)) {    // 没有这个字重时，向 400 方向找最接近的
        try { css = await fetchGoogleCss(f.family, w); s.actualWeight = w; break; } catch (e) { /* 试下一个字重 */ }
      }
      if (!css) throw new SrcError('errGoogle', { family: f.family, weight: f.weight });
      s.faces = parseFontFaceCss(css);
      if (!s.faces.length) throw new SrcError('errGoogleEmpty');
    } else if (f.kind === 'local') {
      s.faces = [{ src: localSrc(f), range: null }];
    } else {
      const file = f.kind === 'file' && files.get(f.fileId);
      if (!file) throw new SrcError('errFileGone');
      s.faces = [{ buffer: file.buffer, range: null }];
    }
    const ffs = s.faces.map(fc => new FontFace(s.family, fc.buffer || fc.src, fc.range ? { unicodeRange: fmtRanges(fc.range), display: 'swap' } : { display: 'swap' }));
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
async function fetchGoogleCss(family, weight) {
  const fam = encodeURIComponent(family.trim()).replace(/%20/g, '+');
  const urls = [`https://fonts.googleapis.com/css2?family=${fam}:wght@${weight}&display=swap`];
  if (+weight === 400) urls.push(`https://fonts.googleapis.com/css2?family=${fam}&display=swap`);
  for (const url of urls) {
    try { const r = await fetch(url); if (r.ok) return await r.text(); continue; }
    catch (e) { /* fetch 可能被 CSP 拦截，改用 <link> 读取 */ }
    try { return await cssViaLink(url); } catch (e) { /* 下一个 url */ }
  }
  throw new SrcError('errGoogle', { family, weight });
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
  zh: { label: { zh: '中文正文', ja: '中国語の本文' }, lang: 'zh-Hans', text:
`西文和汉字放在一起时，西文常常显得偏小、偏轻。InDesign和Illustrator用「复合字体」解决这个问题：汉字、假名、标点、符号、西文和数字，各自指定字体、大小和基线。

网页也能做到。@font-face的unicode-range决定一个字体负责哪些字符，size-adjust调整它的大小。几条规则共用一个font-family名称，浏览器就会逐字挑选字体。Chrome 92、Firefox 92和Safari 17以后都支持。中西文之间的空隙交给text-autospace，不必手动敲空格。

最微妙的是引号和破折号。同一个码位U+201C，在中文里应该是全角的“引号”——在“English quotes”里又应该是比例宽度。` },
  ja: { label: { zh: '日文正文', ja: '日本語の本文' }, lang: 'ja', text:
`和文と欧文を混ぜて組むと、欧文はたいてい小さく、細く見えます。InDesignの「合成フォント」は、漢字・かな・約物・記号・欧文・数字ごとにフォントとサイズとベースラインを指定して、この問題を解決します。

Webでも同じことができます。@font-faceのunicode-rangeで担当する文字を決め、size-adjustで大きさを合わせる。同じfont-family名で複数のルールを書けば、ブラウザが一文字ずつフォントを選びます（Chrome 92、Firefox 92、Safari 17以降）。和欧間のアキはtext-autospaceに任せられます。` },
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
0123456789 ½ € $ ¥` },
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
  { key: 'lineBreak', label: { zh: '禁则', ja: '禁則' }, prop: 'line-break', def: 'auto',
    sup: { chrome: '58', firefox: '69', safari: '11' },
    values: [['auto', null], ['loose', { zh: '宽松', ja: 'ゆるい' }], ['normal', null], ['strict', { zh: '严格', ja: '厳しい' }], ['anywhere', { zh: '任意处断行', ja: 'どこでも改行' }]] },
  { key: 'wrap', label: { zh: '段落换行', ja: '段落の折り返し' }, prop: 'text-wrap', def: 'wrap',
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
const TYPO_DEFAULTS = Object.fromEntries(TYPO.map(t => [t.key, t.def]));
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
    classes: { kana: { font: L('Hiragino Sans W3', ['HiraginoSans-W3']) } }, sample: 'zh' },   /* 苹方没有假名，假名交给冬青黑体 */
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
    v: 3,
    preset: p.id,
    name: prev?.name || 'My Composite',
    weights: prev?.weights || [100, 200, 300, 400, 500, 600, 700, 800, 900],
    baseMode: prev?.baseMode || 'link',
    weightNames: prev?.weightNames || {},
    moved: prev?.moved ? { ...prev.moved } : {},
    wOver: {},
    generic: prev?.generic || 'auto',
    scope: prev?.scope ?? '',
    classes: freshClasses(p),
    custom: [],
    view: prev?.view ? { ...prev.view } : { sample: p.sample, text: SAMPLES[p.sample].text, size: 24, lh: 1.85, vertical: !!p.vertical, colorize: false, compare: false, cmp: 'plain', weight: 400 },
    typo: prev?.typo ? { ...prev.typo } : { ...TYPO_DEFAULTS, lang: SAMPLES[p.sample].lang },
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
  state.typo = { ...TYPO_DEFAULTS, ...(state.typo || {}) };
  state.view.cmp = state.view.cmp || 'plain';
  state.metric = { basis: 'mix', target: 83, ...(state.metric || {}) };
  state.weights = Array.isArray(state.weights) && state.weights.length ? [...new Set(state.weights)].sort((a, b) => a - b) : [state.weight || 400];
  delete state.weight;
  state.baseMode = state.baseMode || 'link';
  state.weightNames = state.weightNames || {};
  state.scope = state.scope || '';     // 导出的 CSS 只在这个语言里生效；空 = 不限语言
  state.wOver = state.wOver || {};
  state.moved = state.moved || {};
  if (state.view.sample === 'title') {   // 「标题」示例已删除，回到正文
    const k = state.typo.lang?.startsWith('ja') ? 'ja' : 'zh';
    Object.assign(state.view, { sample: k, text: SAMPLES[k].text, size: 24, lh: 1.85 });
  }
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
  const manual = state.weightNames[fontKey(f) + '|' + W];
  if (f.kind === 'local') return L(manual || autoLocal(f, W).name);
  if (f.kind === 'file') return live ? f : { kind: 'path', path: manual || guessPath(f.fileName, W) };
  return f;
}
/* 正在改字体名时不重绘表格，免得输入框失去焦点 */
const weightNamesChanged = debounce(() => { if (!document.activeElement?.classList.contains('wname')) renderEditor(); renderExport(); if (state.view.weight !== BASE_W) rebuild(); }, 60);

/* ================= 解析：类别 → 实际字体/大小/基线 ================= */
function rootOf(id, depth = 0) { const c = state.classes[id]; return c.follow && depth < 4 ? rootOf(c.follow, depth + 1) : id; }
/* 某个字重下的实际设定。「跟随」只跟随字体；大小、基线没有单独设定时继承所跟随的类别。
   400 用类别本身的设定；其他字重的字体按差值换算，再叠加该字重的单独调整（wOver） */
function ownFontAt(o, ov, W, live) {
  let font = o.font;
  if (font && W !== BASE_W) font = font.kind === 'google' && ov?.weight ? G(font.family, ov.weight) : fontAtWeight(font, W, live);
  return font;
}
function resolveObj(key, o, W = BASE_W, live = false, depth = 0) {
  const ov = W !== BASE_W ? state.wOver[W]?.[key] : null;
  if (o.follow && depth < 4) {
    const p = resolveCls(o.follow, W, live, depth + 1);
    return { font: p.font, size: ov?.size ?? o.size ?? p.size, shift: o.shift ?? p.shift };
  }
  return { font: ownFontAt(o, ov, W, live), size: ov?.size ?? o.size ?? 100, shift: o.shift ?? 0 };
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

/* 生成规则表：基础字体在最前（不限范围），类别按 (字体, 大小) 合并，例外在最后 */
function buildPlan(W = BASE_W, live = false) {
  const base = resolveCls('han', W, live);
  const plan = [{ font: base.font, size: base.size, range: null, owners: ['han'] }];
  const groups = new Map();
  for (const c of CLASSES) {
    if (c.id === 'han') continue;
    const r = resolveCls(c.id, W, live);
    if (sameFont(r.font, base.font) && r.size === base.size) { plan[0].owners.push(c.id); continue; }
    const k = fontKey(r.font) + '|' + r.size;
    let g = groups.get(k);
    if (!g) groups.set(k, g = { font: r.font, size: r.size, range: [], owners: [] });
    g.range = union(g.range, EFF[c.id]); g.owners.push(c.id);
  }
  plan.push(...groups.values());
  state.custom.forEach((cu, i) => {
    const rng = customRanges[i] || [];
    if (!rng.length) return;
    const r = resolveCustom(cu, W, live);
    if (!r.font) return;
    plan.push({ font: r.font, size: r.size, range: rng, owners: ['#' + i] });
  });
  return plan;
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
  const my = ++gen, W = state.view.weight;
  const plan = buildPlan(W, true);
  setBusy(T('loading'));
  await Promise.all(plan.map(p => source(p.font).promise));
  if (my !== gen) return;
  const fam = `__cf_live_${my}`;
  const faces = [];
  for (const x of expandPlan(plan, true)) {
    if (x.missing) continue;
    /* 规则带上当前字重，校样也用这个字重：这样落到系统字体的字（比如日文字体里没有的简体字）也会跟着变粗细 */
    const d = { display: 'swap', weight: String(W) };
    if (x.range) d.unicodeRange = fmtRanges(x.range);
    if (x.p.size !== 100) d.sizeAdjust = `${x.p.size}%`;
    try { faces.push(new FontFace(fam, x.face.buffer || x.face.src, d)); } catch (e) { /* 忽略无效的规则 */ }
  }
  faces.forEach(f => document.fonts.add(f));
  const hanSrc = sources.get(fontKey(resolveCls('han', state.view.weight, true).font));
  const loads = [document.fonts.load(`32px "${fam}"`, loadText())];
  if (hanSrc?.status === 'ok') loads.push(document.fonts.load(`32px "${hanSrc.family}"`, '国Hx'));
  try { await Promise.race([Promise.allSettled(loads), sleep(6000)]); } catch (e) { /* 部分字体加载失败时照常显示 */ }
  if (my !== gen) { faces.forEach(f => document.fonts.delete(f)); return; }
  const old = liveFaces;
  liveFaces = faces; liveFamily = fam;
  root.style.setProperty('--cf', `"${fam}"`);
  root.style.setProperty('--fw', W);
  old.forEach(f => document.fonts.delete(f));
  setBusy('');
  updateNaive();
  drawSpecimen();
  renderExport();
}
const rebuild = debounce(rebuildNow, 70);
function hanCapRatio(han) {
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = `100px "${han.family}"`;
  return ctx.measureText('H').actualBoundingBoxAscent / 100;
}
let lastFsaR = null;
function updateNaive() {
  const latF = resolveCls('latin', state.view.weight, true).font, hanF = resolveCls('han', state.view.weight, true).font;
  const lat = sources.get(fontKey(latF)), han = sources.get(fontKey(hanF));
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
