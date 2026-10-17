import zh from './i18n/zh.js';
import ja from './i18n/ja.js';
import tw from './i18n/tw.js';
export const $ = (s, r = document) => r.querySelector(s);
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const round = (v, step = 0.5) => Math.round(v / step) * step;
export const root = document.documentElement;
export const lsGet = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
export const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 存储不可用时忽略 */ } };

/* ================= 界面文字 =================
   各语言的文字在 i18n/zh.js、i18n/ja.js、i18n/tw.js */
export const I18N = { zh, ja, tw };

export const LS_UI = 'composite-font:ui';
export const NAV_LANG = navigator.language || '';
export const NAV_UI = /^ja/i.test(NAV_LANG) ? 'ja' : /^zh-(TW|HK|MO|Hant)/i.test(NAV_LANG) ? 'tw' : 'zh';      // 浏览器的语言对应的界面语言
export let UI = lsGet(LS_UI) || NAV_UI;      // 没选过就跟随浏览器
if (!['zh', 'ja', 'tw'].includes(UI)) UI = 'zh';
export function setUI(u) { UI = u; }      // 各语言的文字这时还没加载，按名字判断
export const T = (k, p) => {
  let s = I18N[UI][k] ?? I18N.zh[k] ?? k;
  if (p) s = s.replace(/\{(\w+)\}/g, (_, n) => p[n] ?? '');
  return s;
};
export const tr = o => (o && typeof o === 'object') ? (o[UI] ?? o.zh) : (o || '');
