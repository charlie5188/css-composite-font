/* Entry point: load modules in dependency order, then start the UI once all are ready.
   Module top levels only declare values and perform independent work such as event binding; cross-module initialization belongs in init(). */
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
