/* 引擎的唯一公开入口。

   存在的理由：浏览器那边（Svelte UI 与单文件交付）需要一个
   「引擎」而不是七个模块。而更要紧的是，你说过不要两个语言各实现一遍 ——
   基岩版和 Java 版那种漂移。所以规则只有一条：

     engine/ 是唯一的引擎实现，浏览器用它编译出来的产物。

   Svelte 页面和 Worker 导入同一入口；单文件 HTML 由同一应用生成。

   构建：npm run build:engine
     web/engine.mjs  —— ES 模块，给 Svelte import
     web/engine.js   —— IIFE，挂在 window.TouhouChess 上，给普通 <script>
*/
export * from './board.js';
export * from './geometry.js';
export * from './rules.js';
export * from './deploy.js';
export * from './eval.js';
export * from './search.js';
export {P, RULES, WEIGHTS, applyWeights} from './pieces.js';

/* 权重是 JSON，不走 export *，否则 bundler 要把它当模块处理。
   浏览器那边自己 fetch 或者构建时内联 —— 见 loadWeights。 */
import {applyWeights as _aw} from './pieces.js';
import type {Weights} from './pieces.js';

/** 装载权重。评估前必须调用；单文件构建已内联默认权重。 */
export function loadWeights(w: Weights) { _aw(w); }
