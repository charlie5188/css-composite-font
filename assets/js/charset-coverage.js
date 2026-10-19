import { CHARSETS } from './charset-data.js';

export { CHARSETS };
export const COVERAGE_THRESHOLD = 0.9;
export const INFO_CHARSETS = ['sc', 'tc', 'jp', 'latin', 'digit', 'kana', 'bopo', 'pinyin'];
export const CHARSET_LABELS = { sc: 'GB 2312-80', tc: 'Big5', jp: 'JIS X 0208:1990', latin: 'covBasicLatin', digit: 'covBasicDigits', kana: 'covBasicKana', bopo: 'covBopo', pinyin: 'covPinyin', shared: 'pkCoverShared', punct: 'pkCoverPunct', symbol: 'pkCoverSymbol' };
// Counts and filter ratios always refer to the same pinned Unicode repertoires.
export function charsetCoverage(has) {
  return Object.fromEntries(Object.entries(CHARSETS).map(([key, { chars, total }]) => {
    let have = 0, missing = '';
    for (const char of chars) { if (has(char.codePointAt(0))) have++; else missing += char; }
    return [key, { have, total, missing }];
  }));
}
export const coverageRatios = counts => counts && Object.fromEntries(Object.entries(counts).map(([key, { have, total }]) => [key, have / total]));
