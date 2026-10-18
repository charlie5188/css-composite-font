import { G, GF_LIST, axisOf, gfWeights } from './core.js';
import { CATALOG_COVERAGE } from './font-catalog-data.js';
import { GF_ITALIC, GF_STYLE, GF_HANDWRITING, GF_PRIMARY_SCRIPT } from './gfmeta.js';
import { searchKey } from './ui-controls.js';

// These search aliases do not replace the font's canonical family name.
const ALIASES = {
  'Noto Sans SC': '思源黑体 思源黑體 简体 簡體', 'Noto Serif SC': '思源宋体 思源宋體 简体 簡體',
  'Noto Sans TC': '思源黑体 思源黑體 繁体 繁體 台湾 台灣', 'Noto Serif TC': '思源宋体 思源宋體 繁体 繁體 明體 台湾 台灣',
  'Noto Sans HK': '思源黑体 思源黑體 香港', 'Noto Sans JP': '源ノ角ゴシック 日本語', 'Noto Serif JP': '源ノ明朝 日本語',
  'Noto Sans KR': '본고딕 한국어', 'Noto Serif KR': '본명조 한국어', 'LXGW WenKai TC': '霞鹜文楷 霞鶩文楷 繁體 楷体 楷體',
  'Shippori Mincho': 'しっぽり明朝', 'Zen Old Mincho': 'ZENオールド明朝', 'Zen Kaku Gothic New': 'ZEN角ゴシック',
  'Zen Maru Gothic': 'ZEN丸ゴシック 丸ゴ', 'BIZ UDPGothic': 'BIZ UDPゴシック', 'BIZ UDPMincho': 'BIZ UDP明朝',
  'M PLUS 2': 'エムプラス', 'Klee One': 'クレー 手書き', 'ZCOOL XiaoWei': '站酷小薇体 站酷小薇體', 'Ma Shan Zheng': '马善政楷书 馬善政楷書',
  'ZCOOL KuaiLe': '站酷快乐体 站酷快樂體', 'ZCOOL QingKe HuangYou': '站酷庆科黄油体 站酷慶科黃油體',
  'PingFang SC': '苹方 蘋方 简体 簡體', 'PingFang TC': '苹方 蘋方 繁体 繁體 台湾 台灣', 'PingFang HK': '苹方 蘋方 香港',
  'Songti SC': '宋体 宋體 简体 簡體', 'Songti TC': '宋体 宋體 繁体 繁體',
};
// Common search names help explain matches without claiming that Noto and Source Han are identical families.
const NATIVE_NAMES = {
  'Noto Sans SC': '思源黑体', 'Noto Serif SC': '思源宋体', 'Noto Sans TC': '思源黑體', 'Noto Serif TC': '思源宋體',
  'Noto Sans HK': '思源黑體', 'Noto Sans JP': '源ノ角ゴシック', 'Noto Serif JP': '源ノ明朝',
  'Noto Sans KR': '본고딕', 'Noto Serif KR': '본명조', 'LXGW WenKai TC': '霞鶩文楷',
  'Shippori Mincho': 'しっぽり明朝', 'Zen Old Mincho': 'ZENオールド明朝', 'Zen Kaku Gothic New': 'ZEN角ゴシック',
  'Zen Maru Gothic': 'ZEN丸ゴシック', 'BIZ UDPGothic': 'BIZ UDPゴシック', 'BIZ UDPMincho': 'BIZ UDP明朝',
  'M PLUS 2': 'エムプラス', 'Klee One': 'クレー', 'ZCOOL XiaoWei': '站酷小薇体', 'Ma Shan Zheng': '马善政楷书',
  'ZCOOL KuaiLe': '站酷快乐体', 'ZCOOL QingKe HuangYou': '站酷庆科黄油体',
  'PingFang SC': '苹方-简', 'PingFang TC': '蘋方-繁', 'PingFang HK': '蘋方-港',
  'Songti SC': '宋体-简', 'Songti TC': '宋體-繁', 'Hiragino Sans GB': '冬青黑体', 'Hiragino Sans': 'ヒラギノ角ゴ',
  'Hiragino Mincho ProN': 'ヒラギノ明朝', 'Microsoft YaHei': '微软雅黑', 'Microsoft JhengHei': '微軟正黑體',
  'SimSun': '宋体', 'Yu Gothic': '游ゴシック', 'Yu Mincho': '游明朝', 'Meiryo': 'メイリオ',
};
const SERIFS = new Set(['IBM Plex Serif', 'Source Serif 4', 'EB Garamond', 'Cormorant Garamond', 'Libre Caslon Text', 'Libre Baskerville', 'Crimson Pro', 'Lora', 'Newsreader', 'Literata', 'Spectral', 'Fraunces', 'Playfair Display', 'Instrument Serif', 'Roboto Serif']);
const SANS = new Set(['Inter', 'IBM Plex Sans', 'Source Sans 3', 'DM Sans', 'Work Sans', 'Manrope', 'Instrument Sans', 'Roboto', 'Lato', 'Open Sans', 'Montserrat', 'Jost']);
const STYLES = new Map(Object.entries(GF_STYLE).flatMap(([style, list]) => list.split(',').map(name => [name, style])));
// Official descriptions identify these as running/grass/calligraphic scripts, even
// though metadata only says Handwriting: google/fonts/ofl/{family}/DESCRIPTION.en_us.html.
const CJK_CALLIGRAPHY = new Set(['Zhi Mang Xing', 'Long Cang', 'Liu Jian Mao Cao']);
// Refine browsing tags only. Match explicit names, not vague syllables:
// Kaisei is not a Kai face; composition retains its existing coarse style model.
function refinedStyles(family, style) {
  if (/Fang\s?Song|仿宋/i.test(family)) return ['fangsong'];
  if (/楷|(?:^|[ -])(?:KaiTi|Kaiti|BiauKai|BiaoKai|DFKai|STKaiti|Kai)(?:$|[ -])/i.test(family) || family === 'LXGW WenKai TC') return ['kai'];
  if (/教科書|教科书|Kyokasho|Kyoukasho/i.test(family)) return ['textbook'];
  if (/(?:^|[ -])Maru(?:[ -]|$)|MaruGothic|Rounded|YuanTi|圆体|圓體|丸ゴ/i.test(family)) return [style === 'serif' ? 'serif' : 'sans', 'rounded'];
  if (family === 'Ma Shan Zheng') return ['kai', 'brush'];
  if (CJK_CALLIGRAPHY.has(family)) return ['brush'];
  if (/Brush|毛筆|毛笔|行書|行书|隷書|隶书|Gyosho|Reisho|Kantei|勘亭|Yuji (Boku|Mai|Syuku)/i.test(family)) return ['brush'];
  if (/Handwriting|手書|手写|手寫/i.test(family) || ['Klee One', 'Zen Kurenaido'].includes(family)) return ['handwriting'];
  return style ? [style] : null;
}
export function catalogStyles(family, style) {
  const styles = refinedStyles(family, style);
  // A specific CJK label can coexist with official Handwriting; never lose that
  // classification to the coarse composition model's "other" bucket.
  if (GF_HANDWRITING.has(family)) return [...new Set([...(styles || []).filter(s => s !== 'other'), 'handwriting'])];
  return styles;
}
export function catalogInfo(family) {
  const axis = axisOf(G(family), 'wght'), weights = gfWeights(family);
  const region = /\bSC$/.test(family) || ['ZCOOL XiaoWei', 'Ma Shan Zheng'].includes(family) ? 'sc'
    : /\bTC$/.test(family) ? 'tw' : /\bHK$/.test(family) ? 'hk' : /\bKR$/.test(family) ? 'kr'
    : /\bJP$|Mincho|Gothic|^Zen |^BIZ |^M PLUS|^Klee/.test(family) ? 'jp' : STYLES.has(family) || !GF_LIST.includes(family) ? null : 'latin';
  const style = STYLES.get(family) || (SERIFS.has(family) ? 'serif' : SANS.has(family) ? 'sans' : null);
  return { family, nativeName: NATIVE_NAMES[family] || '', nameIsAlias: family.startsWith('Noto '), primaryScript: GF_PRIMARY_SCRIPT[family] || '', aliases: (ALIASES[family] || '') + ' ' + (NATIVE_NAMES[family] || ''), region, style, styles: catalogStyles(family, style),
    weights: weights || [], italic: GF_ITALIC.has(family) ? true : axis || weights || STYLES.has(family) ? false : null,
    weightType: axis ? 'continuous' : weights?.length ? 'stepped' : null, coverage: CATALOG_COVERAGE[family] || null,
    weightRange: axis ? [axis[1], axis[2]] : weights?.length ? [weights[0], weights.at(-1)] : null,
    bold: axis ? axis[2] >= 700 : weights ? weights.some(w => w >= 700) : null };
}
export function sortCatalog(items, mode = 'name') {
  const name = (a, b) => a.family.localeCompare(b.family, 'en', { numeric: true, sensitivity: 'base' }) || (a.kind || '').localeCompare(b.kind || '');
  const span = item => item.weightRange ? item.weightRange[1] - item.weightRange[0] : -1;
  return [...items].sort((a, b) => (mode === 'weights' ? span(b) - span(a) : 0) || name(a, b));
}
export function catalogOrder(current) {
  return sortCatalog([...new Set([...GF_LIST, ...(current ? [current] : [])])].map(catalogInfo));
}
// Local Font Access exposes named faces before their binaries are read. Reuse those
// explicit style names, but do not infer that an unread face lacks a variable axis.
export function localWeightInfo(faces, axesByName, weightsByName = new Map()) {
  const namedWeight = value => {
    const name = value.replace(/italic|oblique/ig, '').replace(/[\s_-]/g, '').toLowerCase();
    const words = { thin: 100, hairline: 100, extralight: 200, ultralight: 200, light: 300, regular: 400, normal: 400, roman: 400, book: 400, medium: 500, semibold: 600, demibold: 600, bold: 700, extrabold: 800, ultrabold: 800, black: 900, heavy: 900 };
    return words[name] || (/^[1-9]00$/.test(name) ? +name : null);
  };
  const axes = faces.flatMap(face => { const data = axesByName.get(face.fullName); return data?.unknown ? [] : (data?.axes || []).filter(a => a[0] === 'wght'); });
  const weights = [...new Set(faces.map(face => weightsByName.get(face.fullName) ?? namedWeight(face.style)).filter(w => w != null))].sort((a, b) => a - b);
  const complete = faces.length > 0 && faces.every(face => { const data = axesByName.get(face.fullName); return data && !data.unknown; });
  const limits = [...axes.flatMap(a => [a[1], a[2]]), ...weights];
  const weightRange = axes.length || weights.length > 1 || complete && weights.length ? [Math.min(...limits), Math.max(...limits)] : null;
  const weightType = axes.length ? 'continuous' : complete ? 'stepped' : null;
  return { weights, weightRange, weightType, bold: limits.some(w => w >= 700) ? true : complete && limits.length ? false : null };
}
// Only explicit Italic faces or an ital axis count; oblique names and browser synthesis do not.
export function localItalicInfo(faces, axesByName) {
  if (faces.some(face => /italic/i.test(face.style) || (axesByName.get(face.fullName)?.axes || []).some(axis => axis[0] === 'ital' && axis[2] >= 1))) return true;
  return faces.length && faces.every(face => { const data = axesByName.get(face.fullName); return data && !data.unknown; }) ? false : null;
}
export function filterCatalog(items, query, style, bold, weightTypes = [], coverage = [], italic = false) {
  const q = searchKey(query.trim());
  const styles = Array.isArray(style) ? style : style ? [style] : [];
  const matchesStyle = item => { const tags = item.styles || (item.style ? [item.style] : null); return !styles.length || !tags || styles.some(tag => tags.includes(tag)); };
  return items.filter(item => (!q || searchKey(item.family + item.aliases).includes(q))
    && matchesStyle(item) && (!bold || item.bold !== false) && (!italic || item.italic !== false)
    && (!weightTypes.length || item.weightType == null || weightTypes.includes(item.weightType))
    && coverage.every(key => item.coverage?.[key] === true));
}
