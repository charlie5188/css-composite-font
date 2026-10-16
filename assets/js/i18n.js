'use strict';
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const round = (v, step = 0.5) => Math.round(v / step) * step;
const root = document.documentElement;
const lsGet = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 存储不可用时忽略 */ } };

/* ================= 界面文字 =================
   各语言的文字在 i18n/zh.js、i18n/ja.js、i18n/tw.js，按这个顺序在本文件之后加载 */
const I18N = {};

const LS_UI = 'composite-font:ui';
const NAV_LANG = navigator.language || '';
let UI = lsGet(LS_UI) || (/^ja/i.test(NAV_LANG) ? 'ja' : /^zh-(TW|HK|MO|Hant)/i.test(NAV_LANG) ? 'tw' : 'zh');
if (!['zh', 'ja', 'tw'].includes(UI)) UI = 'zh';      // 各语言的文字这时还没加载，按名字判断
const T = (k, p) => {
  let s = I18N[UI][k] ?? I18N.zh[k] ?? k;
  if (p) s = s.replace(/\{(\w+)\}/g, (_, n) => p[n] ?? '');
  return s;
};
const tr = o => (o && typeof o === 'object') ? (o[UI] ?? o.zh) : (o || '');
