import zh from './i18n/zh.js';
import ja from './i18n/ja.js';
import tw from './i18n/tw.js';
import en from './i18n/en.js';
export const $ = (s, r = document) => r.querySelector(s);
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const round = (v, step = 0.5) => Math.round(v / step) * step;
export const root = document.documentElement;
export const lsGet = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
export const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* Ignore unavailable storage. */ } };

/* ================= UI text =================
   Translations live in i18n/zh.js, i18n/ja.js, i18n/tw.js and i18n/en.js. */
export const I18N = { zh, ja, tw, en };

export const LS_UI = 'composite-font:ui';
export const NAV_LANG = navigator.language || '';
export const NAV_UI = /^ja/i.test(NAV_LANG) ? 'ja' : /^zh-(TW|HK|MO|Hant)/i.test(NAV_LANG) ? 'tw' : /^zh/i.test(NAV_LANG) ? 'zh' : 'en';      // Map browser language to the UI language; use English outside Chinese and Japanese.
export let UI = lsGet(LS_UI) || NAV_UI;      // Follow the browser until the user chooses a language.
if (!['zh', 'ja', 'tw', 'en'].includes(UI)) UI = 'en';
export function setUI(u) { UI = u; }      // Translations are not loaded yet; infer the language from its name.
export const T = (k, p) => {
  let s = I18N[UI][k] ?? I18N.zh[k] ?? k;
  if (p) s = s.replace(/\{(\w+)\}/g, (_, n) => p[n] ?? '');
  return s;
};
export const tr = o => (o && typeof o === 'object') ? (o[UI] ?? o.zh) : (o || '');
