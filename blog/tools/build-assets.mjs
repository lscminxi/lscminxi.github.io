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
console.log('✓ Local KaTeX fonts/CSS and safe Markdown preview bundle prepared.');
