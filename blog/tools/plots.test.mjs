import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const Hexo = require('hexo');
const plots = require('../lib/plots.cjs');
const hexo = new Hexo(process.cwd(), { silent: true });
let dom;
let preview;

before(async () => {
  await hexo.init();
  dom = new JSDOM('<!doctype html><html></html>', { url: 'https://preview.example/admin/', runScripts: 'outside-only' });
  dom.window.eval(await readFile('source/admin/preview.js', 'utf8'));
  preview = (body) => new JSDOM(dom.window.MinxiPreview.document({ body })).window.document;
});
after(async () => { dom.window.close(); await hexo.exit(); });
const render = (text) => hexo.render.renderSync({ text, engine: 'md' });
const FENCE = '```';

/* ---------------- 表达式解析（安全求值，绝不用 eval） ---------------- */

test('expressions evaluate math with implicit multiplication and functions', () => {
  assert.equal(plots.compileExpression('x^2 - 2x + 1')(3), 4);
  assert.equal(plots.compileExpression('2^3^2')(0), 512, '^ 右结合');
  assert.equal(plots.compileExpression('(x+1)(x-1)')(3), 8);
  assert.equal(plots.compileExpression('2sin(x)')(0), 0);
  assert.ok(Math.abs(plots.compileExpression('sqrt(x) + ln(e)')(9) - 4) < 1e-9);
  assert.equal(plots.compileExpression('-x + abs(x)')(-2), 4);
  assert.equal(plots.compileExpression('1/x')(4), 0.25);
});

test('expressions reject anything beyond math (no eval, no unknown names)', () => {
  for (const bad of ['', 'alert(1)', 'x; process.exit()', 'foo(x)', 'x ** 2', '((x)', 'x +', 'x y', 'constructor', 'x.__proto__', 'sin x']) {
    assert.throws(() => plots.compileExpression(bad), undefined, bad);
  }
  assert.throws(() => plots.compileExpression('x'.repeat(500)));
});

/* ---------------- 函数图像 ```plot ---------------- */

const PLOT_MD = [
  `${FENCE}plot`,
  'title: 抛物线与正弦',
  'f: x^2 - 2x + 1 ; color=red ; label=抛物线',
  'f: sin(x)',
  'points: (1,0), (2,1), (3,4) ; connect=true ; color=blue',
  'x: -3, 5',
  FENCE,
].join('\n');

test('plot spec draws curves, connected points, colors and labels', () => {
  const svg = plots.renderPlotSvg(plots.parsePlotSpec(PLOT_MD.split('\n').slice(1, -1).join('\n')));
  assert.match(svg, /<path class="plot-curve"[^>]*stroke="#e03131"/, '指定颜色（red）要生效');
  assert.ok(svg.includes('class="plot-frame"'), '绘图区要有可见边框');
  assert.ok((svg.match(/class="plot-grid"/g) || []).length >= 4, '网格线要画出来');
  assert.equal((svg.match(/class="plot-axis"/g) || []).length, 2, 'x 轴和 y 轴都要画出来');
  assert.equal((svg.match(/<circle/g) || []).length, 3, '三个散点');
  assert.match(svg, /<path d="M[^"]*" fill="none" stroke="#1971c2"/, 'points connect 要连成线');
  assert.ok(svg.includes('抛物线'), '图例文字');
  assert.ok(svg.includes('<figcaption>抛物线与正弦</figcaption>'));
});

test('discontinuous functions break the path instead of drawing across the gap', () => {
  const svg = plots.renderPlotSvg(plots.parsePlotSpec('f: 1/x\nx: -2, 2\ny: -5, 5'));
  const d = /<path class="plot-curve" d="([^"]*)"/.exec(svg)[1];
  assert.ok((d.match(/M/g) || []).length >= 2, '1/x 应在 x=0 两侧分成两段');
});

test('bad plot lines are ignored instead of breaking the figure', () => {
  const svg = plots.renderPlotSvg(plots.parsePlotSpec('f: 好坏(x)\nf: x\n随便写点什么\npoints: 没有点'));
  assert.ok(svg.includes('plot-curve'), '合法的那条函数仍要画出来');
});

/* ---------------- 可视化图 ```graph ---------------- */

test('graph draws nodes, directed arrows, colors and labels', () => {
  const svg = plots.renderGraphSvg(plots.parseGraphSpec([
    'directed: true',
    'node: A ; label=起点 ; color=red',
    'node: B ; x=120 ; y=0',
    'edge: A -> B ; label=一步 ; color=blue',
    'edge: B -- A',
    'edge: B -> C',
  ].join('\n')));
  assert.match(svg, /<circle class="graph-node" fill="#e03131"/, '点染色');
  assert.ok(svg.includes('起点') && svg.includes('一步'), '点/边标注');
  assert.equal((svg.match(/<polygon/g) || []).length, 2, '两条有向边各有一个箭头，无向边没有');
  assert.equal((svg.match(/<circle class="graph-node"/g) || []).length, 3, '边里未声明的 C 自动建点');
});

test('undirected graphs draw no arrows; self loops render', () => {
  const svg = plots.renderGraphSvg(plots.parseGraphSpec('edge: A - B\nedge: A - A'));
  assert.ok(!(svg.includes('<polygon')), '无向图不画箭头');
  assert.ok((svg.match(/<circle/g) || []).length >= 3, '包含自环的小圆');
});

test('graph honours explicit coordinates ordering', () => {
  const svg = plots.renderGraphSvg(plots.parseGraphSpec('node: L ; x=0 ; y=0\nnode: R ; x=100 ; y=0'));
  const circles = [...svg.matchAll(/<circle class="graph-node"[^>]*cx="([\d.]+)"/g)].map((m) => Number(m[1]));
  assert.ok(circles[0] < circles[1], 'x 小的点在左边');
});

/* ---------------- 端到端：正式渲染与后台预览一致 ---------------- */

const DOC = `${PLOT_MD}\n\n${FENCE}graph\ndirected: true\nnode: A ; label=开始\nnode: B\nedge: A -> B ; label=去\n${FENCE}\n\n${FENCE}js\nconst plot = 1;\n${FENCE}`;

test('published renderer turns plot/graph fences into figures and leaves code fences alone', () => {
  const html = render(DOC);
  assert.ok(html.includes('class="md-plot"'), '函数图像 figure');
  assert.ok(html.includes('class="md-graph"'), '可视化图 figure');
  assert.ok(html.includes('const plot'), '普通代码块不受影响');
});

test('live preview keeps the SVG (including arrow polygons) after sanitizing', () => {
  const doc = preview(DOC);
  assert.ok(doc.querySelector('.md-plot svg'), '预览里有函数图像');
  assert.ok(doc.querySelector('.md-graph svg'), '预览里有可视化图');
  assert.ok(doc.querySelector('.md-graph polygon'), '箭头多边形不被过滤');
  assert.equal(doc.querySelectorAll('.md-graph circle.graph-node').length, 2);
});

test('labels are escaped in both renderers (no markup injection)', () => {
  const md = `${FENCE}graph\nnode: A ; label=<script>alert(1)</script>\nnode: B\nedge: A - B\n${FENCE}`;
  const html = render(md);
  assert.ok(!html.includes('<script>alert(1)</script>'), '正式渲染转义标签');
  const doc = preview(md);
  assert.equal(doc.querySelectorAll('script').length, 0, '预览里不出现脚本');
  assert.ok(doc.querySelector('.graph-node-label').textContent.includes('<script>'), '文字按纯文本显示');
});

test('an unclosed plot fence stays a literal code block', () => {
  const html = render(`${FENCE}plot\nf: x^2\n\n后面的正文`);
  assert.ok(!html.includes('md-plot'), '没结束围栏就不要吞掉后文生成图');
});

test('editor offers one-click plot/graph templates', async () => {
  const adminHtml = await readFile('source/admin/index.html', 'utf8');
  const adminJs = await readFile('source/admin/admin.js', 'utf8');
  assert.ok(adminHtml.includes('id="insert-plot"') && adminHtml.includes('id="insert-graph"'));
  assert.ok(adminJs.includes('```plot') && adminJs.includes('```graph'));
});
