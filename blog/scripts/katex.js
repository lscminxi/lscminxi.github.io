'use strict';
const markedKatex = require('marked-katex-extension');
const foldContainers = require('../lib/fold-containers.cjs');
const plotExtensions = require('../lib/plots.cjs');
const options = require('../lib/math-options.cjs');
// Extend the existing renderer: retain Hexo code highlighting, heading IDs and TOC.
hexo.extend.filter.register('marked:extensions', function (extensions) {
  extensions.push(...markedKatex(options).extensions, ...foldContainers().extensions, ...plotExtensions().extensions);
});

// Hexo 发文管线会先把围栏代码块抽走高亮（backtick_code_block，优先级 10），
// 因此 plot/graph 必须赶在它之前（优先级 5）把围栏换成图形 HTML，
// 否则正式文章里只会显示成普通代码块（后台预览只走 Marked，不受影响）。
hexo.extend.filter.register('before_post_render', function (data) {
  if (data && typeof data.content === 'string') {
    data.content = plotExtensions.convertPlotFences(data.content);
  }
  return data;
}, 5);
