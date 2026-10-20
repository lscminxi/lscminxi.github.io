'use strict';
const markedKatex = require('marked-katex-extension');
const foldContainers = require('../lib/fold-containers.cjs');
const plotExtensions = require('../lib/plots.cjs');
const options = require('../lib/math-options.cjs');
// Extend the existing renderer: retain Hexo code highlighting, heading IDs and TOC.
hexo.extend.filter.register('marked:extensions', function (extensions) {
  extensions.push(...markedKatex(options).extensions, ...foldContainers().extensions, ...plotExtensions().extensions);
});
