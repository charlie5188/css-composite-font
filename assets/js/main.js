/* 入口：按依赖顺序加载各模块，全部就绪后再启动界面。
   各模块顶层只做声明和不依赖别的模块的事（绑定事件等），用到别的模块的初始化都在 init() 里 */
import './i18n.js';
import './unicode.js';
import './gfmeta.js';
import { initState } from './core.js';
import './render.js';
import './bake.js';
import './export.js';
import { init } from './ui.js';

initState();
init();
