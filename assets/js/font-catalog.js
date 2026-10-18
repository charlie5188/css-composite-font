import { G, GF_LIST, axisOf, gfWeights } from './core.js';
import { GF_STYLE } from './gfmeta.js';
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
};
const SERIFS = new Set(['IBM Plex Serif', 'Source Serif 4', 'EB Garamond', 'Cormorant Garamond', 'Libre Caslon Text', 'Libre Baskerville', 'Crimson Pro', 'Lora', 'Newsreader', 'Literata', 'Spectral', 'Fraunces', 'Playfair Display', 'Instrument Serif', 'Roboto Serif']);
const SANS = new Set(['Inter', 'IBM Plex Sans', 'Source Sans 3', 'DM Sans', 'Work Sans', 'Manrope', 'Instrument Sans', 'Roboto', 'Lato', 'Open Sans', 'Montserrat', 'Jost']);
const STYLES = new Map(Object.entries(GF_STYLE).flatMap(([style, list]) => list.split(',').map(name => [name, style])));
export function catalogInfo(family) {
  const axis = axisOf(G(family), 'wght'), weights = gfWeights(family);
  const region = /\bSC$/.test(family) || ['ZCOOL XiaoWei', 'Ma Shan Zheng'].includes(family) ? 'sc'
    : /\bTC$/.test(family) ? 'tw' : /\bHK$/.test(family) ? 'hk' : /\bKR$/.test(family) ? 'kr'
    : /\bJP$|Mincho|Gothic|^Zen |^BIZ |^M PLUS|^Klee/.test(family) ? 'jp' : STYLES.has(family) || !GF_LIST.includes(family) ? null : 'latin';
  const style = STYLES.get(family) || (SERIFS.has(family) ? 'serif' : SANS.has(family) ? 'sans' : null);
  return { family, aliases: ALIASES[family] || '', region, style,
    bold: axis ? axis[2] >= 700 : weights ? weights.some(w => w >= 700) : null };
}
export function catalogOrder(category, lang, current) {
  const region = /^(zh-Hant-HK|zh-HK)/i.test(lang) ? 'hk' : /^zh-(Hant|TW)/i.test(lang) ? 'tw' : /^ja/i.test(lang) ? 'jp' : /^ko/i.test(lang) ? 'kr' : 'sc';
  const wantsLatin = ['latin', 'digit', 'shared'].includes(category), want = wantsLatin ? 'latin' : category === 'kana' ? 'jp' : category === 'bopo' ? 'tw' : region;
  const score = item => item.region === want ? 0 : wantsLatin ? item.region == null ? 1 : 2 : item.region && item.region !== 'latin' ? 1 : item.region == null ? 2 : 3;
  // Freeze this order when the dialog opens. Async preview/coverage results never change positions or filter eligibility.
  return [...new Set([...GF_LIST, ...(current ? [current] : [])])].map(catalogInfo)
    .sort((a, b) => score(a) - score(b) || Number(a.style === 'other') - Number(b.style === 'other') || a.family.localeCompare(b.family, 'en'));
}
export function filterCatalog(items, query, style, bold) {
  const q = searchKey(query.trim());
  return items.filter(item => (!q || searchKey(item.family + item.aliases).includes(q))
    && (!style || item.style == null || item.style === style) && (!bold || item.bold !== false));
}
