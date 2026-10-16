import { build } from 'esbuild';
import { cp, mkdir, copyFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
const katexRoot = dirname(require.resolve('katex/package.json'));
const dest = 'source/vendor/katex';
await mkdir(dest, { recursive: true });
await copyFile(join(katexRoot, 'dist/katex.min.css'), join(dest, 'katex.min.css'));
await copyFile(join(katexRoot, 'LICENSE'), join(dest, 'LICENSE.txt'));
await cp(join(katexRoot, 'dist/fonts'), join(dest, 'fonts'), { recursive: true });
await build({
  entryPoints: ['client/preview.js'], outfile: 'source/admin/preview.js',
  bundle: true, minify: true, format: 'iife', platform: 'browser',
  target: ['es2020'], legalComments: 'eof',
});
// 外观模块：后台表单与前台渲染共用 lib/appearance.cjs 的同一套校验规则。
await build({
  entryPoints: ['client/appearance.js'], outfile: 'source/admin/appearance.js',
  bundle: true, minify: true, format: 'iife', platform: 'browser',
  target: ['es2020'], legalComments: 'eof',
});
// 访客端背景选择器：在 <head> 中同步加载，先应用访客已选的背景，再接线对话框。
// 与后台共用 lib/appearance.cjs，地址校验规则完全一致。
await build({
  entryPoints: ['client/wallpaper.js'], outfile: 'themes/minxi/source/js/wallpaper.js',
  bundle: true, minify: true, format: 'iife', platform: 'browser',
  target: ['es2020'], legalComments: 'eof',
});
console.log('✓ Local KaTeX fonts/CSS, safe Markdown preview, appearance and wallpaper bundles prepared.');
