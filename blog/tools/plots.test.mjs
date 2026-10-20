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
  assert.ok(svg.includes('r="5"'), '函数描点默认半径加大到 5');
  assert.match(svg, /<path class="plot-segment"[^>]*stroke="#1971c2"/, 'points connect 要连成线');
  assert.ok(svg.includes('抛物线'), '图例文字');
  assert.ok(svg.includes('<figcaption>抛物线与正弦</figcaption>'));
});

test('discontinuous functions break the path instead of drawing across the gap', () => {
  const svg = plots.renderPlotSvg(plots.parsePlotSpec('f: 1/x\nx: -2, 2\ny: -5, 5'));
  const d = /<path class="plot-curve"[^>]* d="([^"]*)"/.exec(svg)[1];
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
  assert.match(svg, /<circle class="graph-node"[^>]*r="20"/, '图的点默认半径加大到 20');
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

test('grid, axes, edges and node labels carry inline styles that survive sanitizing', () => {
  // 回归：只靠 CSS 类上色时，样式表没加载/被缓存就会出现「曲线在、网格和边看不见」。
  const doc = preview(DOC);
  const grid = doc.querySelector('.plot-grid');
  assert.ok(grid?.getAttribute('style')?.includes('stroke'), '网格线自带描边样式');
  const axis = doc.querySelector('.plot-axis');
  assert.ok(axis?.getAttribute('style')?.includes('stroke'), '坐标轴自带描边样式');
  const edge = doc.querySelector('.md-graph line, .md-graph path');
  assert.ok(edge?.getAttribute('style')?.includes('stroke') || edge?.getAttribute('stroke'), '连边自带描边');
  const label = doc.querySelector('.graph-node-label');
  assert.ok(label?.getAttribute('style')?.includes('fill'), '点编号自带文字颜色');
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


/* ---------------- 坐标 / 交点 / 方程 / 网格对比度 ---------------- */

test('plot shows point coordinates, intersections and function/segment equations', () => {
  const spec = plots.parsePlotSpec('f: x\nf: -x + 2\npoints: (0,0), (2,2) ; connect=true\nx: -3, 5\ny: -3, 5');
  const intersections = plots.findPlotIntersections(spec, [-3, 5], [-3, 5]);
  assert.ok(intersections.some((point) => Math.abs(point.x - 1) < 1e-6 && Math.abs(point.y - 1) < 1e-6), '两条直线交于 (1, 1)');
  assert.ok(intersections.some((point) => Math.abs(point.x) < 1e-6 && Math.abs(point.y) < 1e-6), '包含与坐标轴的交点');
  const svg = plots.renderPlotSvg(spec);
  assert.ok(svg.includes('class="plot-coord"') && svg.includes('(2, 2)'), '明确给出的点显示坐标');
  assert.ok(svg.includes('class="plot-intersection"') && svg.includes('(1, 1)'), '交点有标记和坐标');
  assert.ok(svg.includes('class="plot-equations"') && svg.includes('y = -x + 2'), '显示函数方程');
  assert.equal(plots.lineEquation([0, 1], [2, 5]), 'y = 2x + 1');
  assert.equal(plots.lineEquation([0, 2], [3, 2]), 'y = 2', '水平线方程');
  assert.equal(plots.lineEquation([1, 0], [1, 3]), 'x = 1', '竖直线方程');
});

test('plot display switches can hide coordinates, intersections and equations', () => {
  const svg = plots.renderPlotSvg(plots.parsePlotSpec('f: x\npoints: (1,1)\ncoords: off\nintersections: off\nequations: off'));
  assert.ok(!svg.includes('class="plot-coord"'), '关闭坐标后不显示点坐标');
  assert.ok(!svg.includes('class="plot-intersection"'), '关闭交点后不画交点');
  assert.match(svg, /<div class="plot-equations" hidden>/, '关闭方程后隐藏方程区');
});

test('plot grid uses dedicated high-contrast theme variables in both modes', async () => {
  const css = await readFile('themes/minxi/source/css/main.css', 'utf8');
  assert.ok(css.includes('--plot-grid: #8293ab'), '深色模式网格色');
  assert.ok(css.includes('--plot-grid: #7f96b1'), '浅色模式网格色');
  assert.ok(css.includes('--plot-axis: #f2f6fb') && css.includes('--plot-axis: #17233a'), '深浅色坐标轴都要清楚');
  assert.match(css, /\.plot-grid \{[^}]*opacity: 0\.62/, '网格不透明度要足够高');
});

/* ---------------- 前台交互：平移 / 缩放 / 开关（JSDOM） ---------------- */

async function interactiveDom(html) {
  const page = new JSDOM(`<!doctype html><html><body><main class="article-content">${html}</main></body></html>`, {
    url: 'https://example.test/post/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  page.window.Element.prototype.getBoundingClientRect = function rect() {
    return { left: 0, top: 0, right: 680, bottom: 420, width: 680, height: 420, x: 0, y: 0, toJSON() {} };
  };
  page.window.eval(await readFile('themes/minxi/source/js/plot.js', 'utf8'));
  return page;
}
const waitFrame = () => new Promise((resolve) => { setTimeout(resolve, 60); });
function pointer(page, target, type, x, y, id = 1) {
  const event = new page.window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(event, 'pointerId', { value: id });
  target.dispatchEvent(event);
}

test('interactive plot zooms, pans, toggles coordinates and resets', async () => {
  const page = await interactiveDom(render(`${FENCE}plot\nf: x\npoints: (1,1)\nx: -5, 5\ny: -5, 5\n${FENCE}`));
  try {
    const figure = page.window.document.querySelector('.md-plot');
    const stage = figure.querySelector('.plot-stage');
    const rangeWidth = () => {
      const svg = stage.querySelector('svg');
      return Number(svg.dataset.xMax) - Number(svg.dataset.xMin);
    };
    assert.equal(figure.classList.contains('is-interactive'), true, '前台脚本接管图像');
    assert.equal(rangeWidth(), 10);

    figure.querySelector('[data-plot-action="zoom-in"]').click();
    await waitFrame();
    assert.ok(rangeWidth() < 10, '点击放大后显示范围变小');

    const beforePan = Number(stage.querySelector('svg').dataset.xMin);
    const beforePanY = Number(stage.querySelector('svg').dataset.yMin);
    pointer(page, stage, 'pointerdown', 340, 210);
    pointer(page, stage, 'pointermove', 408, 252);
    pointer(page, stage, 'pointerup', 408, 252);
    await waitFrame();
    assert.ok(Number(stage.querySelector('svg').dataset.xMin) < beforePan, '向右拖动后视图向左平移（内容跟随指针）');
    assert.ok(Number(stage.querySelector('svg').dataset.yMin) > beforePanY, '向下拖动后 y 范围同向移动（内容跟随指针向下）');

    figure.querySelector('[data-plot-toggle="coords"]').click();
    await waitFrame();
    assert.equal(stage.querySelector('.plot-coord'), null, '坐标开关关闭坐标文字');

    figure.querySelector('[data-plot-action="reset"]').click();
    await waitFrame();
    assert.equal(rangeWidth(), 10, '重置恢复初始范围');
  } finally { page.window.close(); }
});

test('interactive graph zooms and reports node coordinates', async () => {
  const page = await interactiveDom(render(`${FENCE}graph\nnode: A ; x=0 ; y=0\nnode: B ; x=100 ; y=0\nedge: A - B\n${FENCE}`));
  try {
    const figure = page.window.document.querySelector('.md-graph');
    const svg = figure.querySelector('svg');
    const before = svg.getAttribute('viewBox');
    figure.querySelector('[data-graph-action="zoom-in"]').click();
    assert.notEqual(svg.getAttribute('viewBox'), before, '图的缩放按钮改变 viewBox');
    const group = svg.querySelector('.graph-node-group');
    assert.equal(group.hasAttribute('data-x'), false, '顶点不再携带坐标');
    assert.ok(!group.querySelector('title').textContent.includes('(0, 0)'), '顶点提示不显示坐标');
    pointer(page, group, 'pointermove', 100, 100);
    assert.equal(figure.querySelector('.plot-readout').textContent, '点 A', '悬停顶点只显示点名');
  } finally { page.window.close(); }
});


test('editor preview gets the same plot interactions via parent enhancement (iframe stays script-free)', async () => {
  const md = `${FENCE}plot\nf: x\nf: -x + 2\npoints: (1,1) ; connect=true\nx: -5, 5\ny: -5, 5\n${FENCE}`;
  const srcdoc = dom.window.MinxiPreview.document({ body: md });
  assert.ok(!srcdoc.includes('<script'), '预览文档本身不带脚本');
  const page = new JSDOM(srcdoc, { url: 'https://preview.example/', runScripts: 'outside-only', pretendToBeVisual: true });
  try {
    page.window.Element.prototype.getBoundingClientRect = function rect() {
      return { left: 0, top: 0, right: 680, bottom: 420, width: 680, height: 420, x: 0, y: 0, toJSON() {} };
    };
    // 后台父页面把交互挂到 iframe 文档上（真实后台由 iframe load 事件触发）。
    dom.window.MinxiPreview.enhance(page.window.document);
    const figure = page.window.document.querySelector('.md-plot');
    const stage = figure.querySelector('.plot-stage');
    assert.equal(figure.classList.contains('is-interactive'), true, '预览中的图也被接管，工具栏随之显示');
    const width = () => Number(stage.querySelector('svg').dataset.xMax) - Number(stage.querySelector('svg').dataset.xMin);
    assert.equal(width(), 10);

    figure.querySelector('[data-plot-action="zoom-in"]').click();
    await waitFrame();
    assert.ok(width() < 10, '预览里可以缩放');

    const beforePan = Number(stage.querySelector('svg').dataset.xMin);
    pointer(page, stage, 'pointerdown', 340, 210);
    pointer(page, stage, 'pointermove', 408, 210);
    pointer(page, stage, 'pointerup', 408, 210);
    await waitFrame();
    assert.ok(Number(stage.querySelector('svg').dataset.xMin) < beforePan, '预览里可以拖动平移');

    figure.querySelector('[data-plot-toggle="intersections"]').click();
    await waitFrame();
    assert.equal(stage.querySelector('.plot-intersection'), null, '预览里可以开关交点');

    // 模拟后台在重渲染前收集视图、重渲染后写回：平移/缩放状态不应丢失。
    const views = [...page.window.document.querySelectorAll('.md-plot')].map((item) => ({
      xMin: item.dataset.viewXMin, xMax: item.dataset.viewXMax,
      yMin: item.dataset.viewYMin, yMax: item.dataset.viewYMax,
      coords: item.dataset.viewCoords, intersections: item.dataset.viewIntersections,
      equations: item.dataset.viewEquations,
    }));
    const page2 = new JSDOM(dom.window.MinxiPreview.document({ body: md, plotViews: views }), {
      url: 'https://preview.example/', runScripts: 'outside-only', pretendToBeVisual: true,
    });
    try {
      page2.window.Element.prototype.getBoundingClientRect = page.window.Element.prototype.getBoundingClientRect;
      dom.window.MinxiPreview.enhance(page2.window.document);
      const svg2 = page2.window.document.querySelector('.md-plot svg');
      assert.equal(Number(svg2.dataset.xMin), Number(views[0].xMin), '重渲染后恢复平移/缩放范围');
      assert.equal(page2.window.document.querySelector('.md-plot .plot-intersection'), null, '重渲染后保留交点开关状态');
    } finally { page2.window.close(); }
  } finally { page.window.close(); }
});

test('editor preview graph is interactive via parent enhancement', async () => {
  const srcdoc = dom.window.MinxiPreview.document({ body: `${FENCE}graph\nnode: A ; x=0 ; y=0\nnode: B ; x=100 ; y=0\nedge: A - B\n${FENCE}` });
  const page = new JSDOM(srcdoc, { url: 'https://preview.example/', runScripts: 'outside-only', pretendToBeVisual: true });
  try {
    dom.window.MinxiPreview.enhance(page.window.document);
    const figure = page.window.document.querySelector('.md-graph');
    const svg = figure.querySelector('svg');
    const before = svg.getAttribute('viewBox');
    figure.querySelector('[data-graph-action="zoom-in"]').click();
    assert.notEqual(svg.getAttribute('viewBox'), before, '预览里的可视化图可以缩放');
    assert.ok(svg.getAttribute('data-preview-viewbox'), '图的视图会被记录以便重渲染恢复');
  } finally { page.window.close(); }
});


/* ---------------- 正式发文管线（Hexo post.render） ---------------- */

test('full Hexo post pipeline renders plot/graph fences as figures, not code blocks', async () => {
  // 回归：post.render 会先把围栏代码块抽走高亮，只测 hexo.render 会漏掉这层。
  const post = await hexo.post.render('plot-pipeline-test.md', { content: DOC });
  const doc = new JSDOM(post.content).window.document;
  assert.ok(doc.querySelector('.md-plot svg'), '正式发文管线里函数图像要生成 SVG');
  assert.ok(doc.querySelector('.md-graph svg'), '正式发文管线里可视化图要生成 SVG');
  assert.ok(doc.querySelector('.plot-intersection'), '交点也要在');
  assert.ok(!doc.querySelector('.highlight.plaintext'), '不能被当成普通代码块高亮');
});

test('plot fences nested inside a plain code fence stay literal', async () => {
  const md = '````md\n```plot\nf: x\n```\n````';
  assert.equal(plots.convertPlotFences(md), md, '转换函数不动普通代码块里的示例');
  const post = await hexo.post.render('plot-nested-test.md', { content: md });
  assert.ok(!post.content.includes('md-plot'), '正式管线里示例仍是代码');
});
