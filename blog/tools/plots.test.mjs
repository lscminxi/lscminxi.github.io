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

test('plot spec draws curves and connected points without in-figure names', () => {
  const spec = plots.parsePlotSpec(PLOT_MD.split('\n').slice(1, -1).join('\n'));
  const svg = plots.renderPlotSvg(spec);
  const inner = plots.renderPlotSvgInner(spec, { xRange: [-3, 5], yRange: [-2, 10] });
  assert.match(svg, /<path class="plot-curve"[^>]*stroke="#e03131"/, '指定颜色（red）要生效');
  assert.ok(svg.includes('class="plot-frame"'), '绘图区要有可见边框');
  assert.ok((svg.match(/class="plot-grid"/g) || []).length >= 4, '网格线要画出来');
  assert.equal((svg.match(/class="plot-axis"/g) || []).length, 2, 'x 轴和 y 轴都要画出来');
  assert.equal((svg.match(/plot-point-dot/g) || []).length, 3, '三个散点');
  assert.ok(svg.includes('r="5"'), '函数描点默认半径加大到 5');
  assert.match(svg, /<path class="plot-segment"[^>]*stroke="#1971c2"/, 'points connect 要连成线');
  assert.ok(!inner.includes('class="plot-label"') && !inner.includes('>抛物线</text>'), '图内不显示曲线或点的名称');
  assert.ok(svg.includes('<figcaption>抛物线与正弦</figcaption>'), '图题仍保留');
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
  assert.match(svg, /<circle class="graph-node"[^>]*style="fill:#e03131;/, '点色写进内联样式，不会被主题 CSS 的默认填充盖掉');
  assert.match(svg, /<circle class="graph-node"[^>]*r="20"/, '图的点默认半径加大到 20');
  assert.ok(svg.includes('起点') && svg.includes('一步'), '点/边标注');
  assert.equal((svg.match(/<polygon/g) || []).length, 2, '两条有向边各有一个箭头，无向边没有');
  assert.equal((svg.match(/<circle class="graph-node"/g) || []).length, 3, '边里未声明的 C 自动建点');
  assert.ok(svg.includes('class="graph-edge-group"') && svg.includes('class="graph-edge-hit"'), '边有分组和宽命中区，方便悬停加粗');
  assert.ok(svg.includes('class="graph-node-ring"'), '顶点带选中外圈（参考图编辑器）');
});

test('undirected graphs draw no arrows; self loops render', () => {
  const svg = plots.renderGraphSvg(plots.parseGraphSpec('edge: A - B\nedge: A - A'));
  assert.ok(!(svg.includes('<polygon')), '无向图不画箭头');
  assert.ok((svg.match(/<circle/g) || []).length >= 3, '包含自环的小圆');
});

test('graph algorithms find components, bridges, cut vertices, MST and bipartite conflicts', () => {
  const spec = plots.parseGraphSpec([
    'node: A', 'node: B', 'node: C', 'node: D', 'node: E',
    'edge: A - B ; weight=5',
    'edge: B - C ; label=1',
    'edge: A - C ; weight=3',
    'edge: C - D ; weight=2',
  ].join('\n'));
  assert.equal(spec.edges[0].weight, 5, 'weight= 解析边权');
  assert.equal(spec.edges[1].weight, 1, '纯数字标注也作为边权');
  const result = plots.analyzeGraph(spec);
  assert.deepEqual(result.components.map((component) => component.join('')), ['ABCD', 'E'], '连通分量包含孤立点');
  assert.deepEqual(result.bridges, [3], '只有 C-D 是桥');
  assert.deepEqual(result.cutVertices, ['C'], 'C 是割点');
  assert.deepEqual(result.mst.edges, [1, 3, 2], 'Kruskal 按权重选边');
  assert.equal(result.mst.totalWeight, 6, '最小生成森林总权重');
  assert.equal(result.bipartite.ok, false, '三角形不是二分图');
  assert.notEqual(result.bipartite.conflict, null, '二分图判定给出冲突边');
  const parallel = plots.analyzeGraphData(['A', 'B'], [
    { from: 'A', to: 'B', weight: 1 }, { from: 'A', to: 'B', weight: 1 },
  ]);
  assert.deepEqual(parallel.bridges, [], '平行边互为回边，都不是桥');
  const evenCycle = plots.analyzeGraphData(['A', 'B', 'C', 'D'], [
    { from: 'A', to: 'B' }, { from: 'B', to: 'C' }, { from: 'C', to: 'D' }, { from: 'D', to: 'A' },
  ]);
  assert.equal(evenCycle.bipartite.ok, true, '偶环是二分图');
  const svg = plots.renderGraphSvg(spec);
  assert.ok(svg.includes('data-edge-index="0"') && svg.includes('data-weight="5"'), '边组带编号和权重供前端算法定位');
});

test('graph algorithms find vertex/edge biconnected components and a DFS tree with back edges', () => {
  const result = plots.analyzeGraphData(['A', 'B', 'C', 'D', 'E', 'F', 'G'], [
    { from: 'A', to: 'B' }, { from: 'B', to: 'C' }, { from: 'C', to: 'A' },
    { from: 'C', to: 'D' },
    { from: 'D', to: 'E' }, { from: 'E', to: 'F' }, { from: 'F', to: 'D' },
  ]);
  const signatures = (components) => components.map((component) => component.nodes.join('')).sort();
  assert.deepEqual(signatures(result.vertexBiconnectedComponents), ['ABC', 'CD', 'DEF', 'G'], '点双：割点 C、D 同时属于两个分量，孤立点自成一个');
  assert.deepEqual(signatures(result.edgeBiconnectedComponents), ['ABC', 'DEF', 'G'], '边双：删掉桥 C-D 后的连通块');
  assert.deepEqual(result.dfsTree.roots, ['A', 'G'], '不连通图得到 DFS 森林');
  assert.deepEqual(result.dfsTree.order, ['A', 'B', 'C', 'D', 'E', 'F', 'G'], 'DFS 访问顺序');
  assert.deepEqual(result.dfsTree.treeEdges, [0, 1, 3, 4, 5], 'DFS 树边');
  assert.deepEqual(result.dfsTree.backEdges, [2, 6], '两个环各留一条返祖边');
  assert.deepEqual(result.dfsTree.otherEdges, [], '无向图没有横边');

  const parallel = plots.analyzeGraphData(['A', 'B'], [{ from: 'A', to: 'B' }, { from: 'A', to: 'B' }]);
  assert.deepEqual(parallel.vertexBiconnectedComponents.map((component) => component.edges), [[0, 1]], '平行边同属一个点双分量');
  assert.deepEqual(parallel.dfsTree.backEdges, [1], '第二条平行边是返祖边');

  const directed = plots.analyzeGraphData(['A', 'B', 'C'], [
    { from: 'A', to: 'B', directed: true }, { from: 'B', to: 'A', directed: true },
    { from: 'A', to: 'C', directed: true }, { from: 'C', to: 'B', directed: true },
  ]);
  assert.deepEqual(directed.dfsTree.treeEdges, [0, 2], '有向图沿箭头方向建 DFS 树');
  assert.deepEqual(directed.dfsTree.backEdges, [1], '指向祖先的是返祖边');
  assert.deepEqual(directed.dfsTree.otherEdges, [3], '指向已访问非祖先点的边单独算横边');
});

test('graph algorithm can be preset by the author or left to readers', () => {
  assert.equal(plots.parseGraphSpec('node: A').algorithm, 'reader', '不写 algo 时默认读者自选');
  assert.equal(plots.parseGraphSpec('algo: mst\nnode: A').algorithm, 'mst', '作者预设最小生成树');
  assert.equal(plots.parseGraphSpec('算法：桥与割点\nnode: A').algorithm, 'bridges', '中文算法名也能预设');
  assert.equal(plots.parseGraphSpec('algo: none\nnode: A').algorithm, 'none', '作者可关闭算法显示');
  assert.equal(plots.parseGraphSpec('algo: 点双\nnode: A').algorithm, 'vbcc', '作者可预设点双连通分量');
  assert.equal(plots.parseGraphSpec('algo: 边双连通分量\nnode: A').algorithm, 'ebcc', '作者可预设边双连通分量');
  assert.equal(plots.parseGraphSpec('algo: 带返祖边的树\nnode: A').algorithm, 'dfs', '作者可预设带返祖边的 DFS 树');
  assert.equal(plots.parseGraphSpec('algo: 随便写\nnode: A').algorithm, 'reader', '写错的算法名回落到读者自选');
  const fixed = plots.renderGraphSvg(plots.parseGraphSpec('algo: bipartite\nnode: A\nnode: B\nedge: A - B'));
  assert.ok(fixed.includes('data-graph-algorithm="bipartite"'), '预设模式写进图容器供前端读取');
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
  assert.ok(adminHtml.includes('value="reader"') && adminHtml.includes('value="mst"') && adminHtml.includes('value="none"'), '后台插入可视化图时可选择算法显示方式');
  assert.ok(adminHtml.includes('value="vbcc"') && adminHtml.includes('value="ebcc"') && adminHtml.includes('value="dfs"'), '后台可预设点双、边双和 DFS 树');
  assert.ok(adminJs.includes('```plot') && adminJs.includes('```graph'));
  assert.ok(adminJs.includes('algo: " + mode'), '后台会把所选算法写进图源码');
});


/* ---------------- 坐标 / 交点 / 方程 / 网格对比度 ---------------- */

test('plot shows selected point coordinates and intersections without equations or names', () => {
  const spec = plots.parsePlotSpec('f: x\nf: -x + 2\npoints: (0,0), (2,2) ; connect=true\nx: -3, 5\ny: -3, 5');
  const intersections = plots.findPlotIntersections(spec, [-3, 5], [-3, 5]);
  assert.ok(intersections.some((point) => Math.abs(point.x - 1) < 1e-6 && Math.abs(point.y - 1) < 1e-6), '两条直线交于 (1, 1)');
  assert.ok(intersections.some((point) => Math.abs(point.x) < 1e-6 && Math.abs(point.y) < 1e-6), '包含与坐标轴的交点');
  const svg = plots.renderPlotSvg(spec);
  assert.ok(!svg.includes('class="plot-coord"'), '未选中时描点和交点都不显示坐标标签');
  assert.ok(svg.includes('class="plot-intersection-hit"'), '交点保留透明命中区，但不直接显现圆点');
  const selectedPoint = plots.renderPlotSvgInner(spec, { xRange: [-3, 5], yRange: [-3, 5], selectedPointKey: 'point:2:2' });
  assert.ok(selectedPoint.includes('class="plot-coord"') && selectedPoint.includes('class="plot-coord-box"') && selectedPoint.includes('(2, 2)'), '只有选中的描点显示圆角坐标框');
  const selectedIntersection = plots.renderPlotSvgInner(spec, { xRange: [-3, 5], yRange: [-3, 5], selectedPointKey: 'intersection:1:1' });
  assert.ok(selectedIntersection.includes('(1, 1)'), '只有选中的交点显示坐标');
  assert.ok(!svg.includes('class="plot-equations"') && !svg.includes('data-plot-toggle="equations"'), '函数图不显示方程区和方程开关');
  const labeled = plots.parsePlotSpec('f: -x + 2 ; label=曲线名\npoints: (0,0), (2,2) ; connect=true ; label=点名\nx: -3, 5\ny: -3, 5');
  const labeledInner = plots.renderPlotSvgInner(labeled, { xRange: [-3, 5], yRange: [-3, 5], selectedPointKey: 'point:2:2' });
  assert.ok(!labeledInner.includes('class="plot-label"') && !labeledInner.includes('曲线名') && !labeledInner.includes('点名'), '图内不显示曲线和点的名称');
  assert.ok(!labeledInner.includes('data-equation') && !labeledInner.includes('y = -x + 2'), '图内不附带方程文字');
  assert.ok(labeledInner.includes('data-segment-index="0"'), '线段带选中定位编号');
  assert.equal(plots.lineEquation([0, 1], [2, 5]), 'y = 2x + 1', '选中线段时才计算并显示方程式');
  assert.equal(plots.lineEquation([1, 0], [1, 3]), 'x = 1', '竖直线段方程式');
});

test('plot display switches can hide coordinates and intersections', () => {
  const svg = plots.renderPlotSvg(plots.parsePlotSpec('f: x\npoints: (1,1)\ncoords: off\nintersections: off\nequations: off'));
  assert.ok(!svg.includes('class="plot-coord"'), '关闭坐标后不显示点坐标');
  assert.ok(!svg.includes('class="plot-intersection"'), '关闭交点后不画交点');
  assert.ok(!svg.includes('data-plot-toggle="equations"'), '旧 equations 写法被忽略且不生成方程开关');
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
    assert.equal(stage.querySelector('.plot-coord'), null, '没有选中点时不显示坐标');
    assert.match(figure.querySelector('.plot-readout').textContent, /选中点或交点看坐标，选中直线看方程式/, '初始读数只给操作提示');
    const initialDot = stage.querySelector('.plot-point');
    pointer(page, initialDot, 'pointermove', 408, 148);
    assert.equal(stage.querySelector('.plot-point').classList.contains('is-selected'), true, '指针移到描点上立即选中，不等点击');
    assert.equal(figure.querySelector('.plot-tooltip').classList.contains('is-visible'), true, '选中描点立即显示坐标框');
    assert.ok(figure.querySelector('.plot-readout').textContent.includes('(1, 1)'), '选中描点立即在读数中显示坐标');
    assert.ok(stage.querySelector('.plot-coord')?.textContent.includes('(1, 1)'), '选中描点立即显示图内坐标标签');

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
    figure.querySelector('[data-plot-toggle="coords"]').click();
    await waitFrame();

    // 移到直线上即选中：立即显示方程式，不等点击。
    const curve = stage.querySelector('.plot-curve');
    pointer(page, curve, 'pointermove', 340, 210);
    assert.equal(stage.querySelector('.plot-curve').classList.contains('is-selected'), true, '指针移到直线上立即选中');
    assert.equal(figure.querySelector('.plot-tooltip').classList.contains('is-visible'), true, '选中直线立即显示方程框');
    assert.equal(figure.querySelector('.plot-readout').textContent, 'y = x', '选中直线立即在读数中显示方程式');

    // 第一次 click 是拖动结束的那次（应被吞掉），第二次才真正选中。
    const dot = stage.querySelector('.plot-point');
    pointer(page, dot, 'click', 100, 100);
    pointer(page, dot, 'click', 100, 100);
    assert.equal(stage.querySelector('.plot-point').classList.contains('is-selected'), true, '点击选中一个点');
    assert.ok(stage.querySelector('.plot-coord')?.textContent.includes('(1, 1)'), '选中描点后才显示坐标');
    figure.querySelector('[data-plot-action="zoom-in"]').click();
    await waitFrame();
    assert.ok(stage.querySelector('.plot-point.is-selected'), '缩放重绘后仍按同一坐标保持选中');
    assert.ok(stage.querySelector('.plot-coord')?.textContent.includes('(1, 1)'), '缩放后选中点坐标仍显示且不变');

    // 点击空白取消选中，坐标立刻消失。
    pointer(page, stage, 'click', 620, 380);
    assert.equal(stage.querySelector('.plot-point.is-selected'), null, '点击空白取消选中');
    assert.equal(stage.querySelector('.plot-coord'), null, '取消选中后不显示坐标');

    // 交点默认只有命中区：移上去即选中，不突出直线，立即只显示交点坐标。
    const intersection = stage.querySelector('.plot-intersection');
    pointer(page, intersection, 'pointermove', 340, 210);
    assert.equal(stage.querySelector('.plot-curve').classList.contains('is-hovered'), false, '选中交点不突出直线');
    assert.equal(figure.querySelector('.plot-tooltip').classList.contains('is-visible'), true, '选中交点立即显示坐标框');
    assert.equal(stage.querySelector('.plot-intersection').classList.contains('is-selected'), true, '移到交点上立即选中');
    assert.equal(stage.querySelector('.plot-curve.is-selected'), null, '选中交点不突出关联直线');
    assert.ok(stage.querySelector('.plot-intersection-label')?.textContent.includes('(0, 0)'), '选中交点立即显示它的坐标');
    pointer(page, intersection, 'click', 340, 210);
    assert.equal(stage.querySelector('.plot-intersection').classList.contains('is-selected'), true, '点击仍可固定选中交点');
    pointer(page, stage, 'click', 620, 380);
    assert.equal(stage.querySelector('.plot-coord-tag'), null, '取消交点选中后坐标消失');
  } finally { page.window.close(); }
});

test('interactive plot shows equation only for a selected line and coordinates only for a selected point', async () => {
  const page = await interactiveDom(render(`${FENCE}plot\nf: 0\npoints: (1,1), (3,2) ; connect=true\nx: -5, 5\ny: -5, 5\n${FENCE}`));
  try {
    const figure = page.window.document.querySelector('.md-plot');
    const stage = figure.querySelector('.plot-stage');
    const readout = figure.querySelector('.plot-readout');
    const tooltip = figure.querySelector('.plot-tooltip');

    const curve = stage.querySelector('.plot-curve');
    pointer(page, curve, 'click', 340, 100);
    assert.equal(stage.querySelector('.plot-curve').classList.contains('is-selected'), true, '点击选中函数曲线');
    assert.equal(readout.textContent, 'y = 0', '选中曲线后才显示方程式');
    assert.equal(tooltip.classList.contains('is-visible'), true, '选中曲线时显示方程框');

    figure.querySelector('[data-plot-action="zoom-in"]').click();
    await waitFrame();
    assert.equal(stage.querySelector('.plot-curve').classList.contains('is-selected'), true, '缩放重绘后仍选中同一曲线');
    assert.equal(readout.textContent, 'y = 0', '缩放后仍显示选中曲线方程式');

    const segment = stage.querySelector('.plot-segment');
    pointer(page, segment, 'click', 340, 200);
    assert.equal(stage.querySelector('.plot-segment').classList.contains('is-selected'), true, '点击选中线段');
    assert.equal(stage.querySelector('.plot-curve').classList.contains('is-selected'), false, '选中线段后取消曲线选中');
    assert.equal(readout.textContent, 'y = 0.5x + 0.5', '选中线段后才显示它的方程式');

    const dot = stage.querySelector('.plot-point');
    pointer(page, dot, 'click', 100, 100);
    assert.equal(stage.querySelector('.plot-segment').classList.contains('is-selected'), false, '选中点后取消线段选中');
    assert.equal(readout.textContent, '(1, 1)', '选中点后只显示坐标');
    assert.ok(stage.querySelector('.plot-coord')?.textContent.includes('(1, 1)'), '选中点的坐标框出现');

    pointer(page, stage, 'click', 620, 380);
    assert.equal(stage.querySelector('.is-selected'), null, '点击空白取消全部选中');
    assert.ok(!readout.textContent.includes('y ='), '取消选中后不显示方程式');
    assert.equal(stage.querySelector('.plot-coord'), null, '取消选中后不显示坐标');
  } finally { page.window.close(); }
});

test('plot selection survives real pointer jitter and a click retargeted to the stage', async () => {
  const page = await interactiveDom(render(`${FENCE}plot\nf: x\nf: -x + 2\nx: -5, 5\ny: -5, 5\n${FENCE}`));
  try {
    const figure = page.window.document.querySelector('.md-plot');
    const stage = figure.querySelector('.plot-stage');
    const readout = figure.querySelector('.plot-readout');
    const press = (target, type, x, y) => {
      const event = new page.window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
      Object.defineProperties(event, { pointerId: { value: 1 }, movementX: { value: 1 }, movementY: { value: 1 } });
      target.dispatchEvent(event);
    };
    const clickAtStage = (target, x, y) => {
      // 真实浏览器：按下→几像素抖动→松开，click 可能因指针捕获/重绘落到 stage 上。
      press(target, 'pointerdown', x, y);
      press(target, 'pointermove', x + 2, y + 1);
      press(target, 'pointerup', x + 2, y + 1);
      press(stage, 'click', x + 2, y + 1);
    };

    const beforeX = Number(stage.querySelector('svg').dataset.xMin);
    clickAtStage(stage.querySelector('.plot-intersection'), 340, 210);
    assert.equal(Number(stage.querySelector('svg').dataset.xMin), beforeX, '几像素抖动不算拖动平移');
    assert.equal(stage.querySelector('.plot-intersection').classList.contains('is-selected'), true, '抖动后松开仍选中交点');
    assert.ok(stage.querySelector('.plot-intersection-label')?.textContent.includes('(0, 0)'), '选中交点显示坐标标签');
    assert.equal(readout.textContent, '(0, 0)', '选中交点在读数框显示坐标');

    clickAtStage(stage.querySelector('.plot-curve'), 340, 100);
    assert.equal(stage.querySelector('.plot-curve').classList.contains('is-selected'), true, '抖动后松开仍选中曲线');
    assert.equal(readout.textContent, 'y = x', '选中曲线在读数框显示方程式');
    assert.equal(figure.querySelector('.plot-tooltip').classList.contains('is-visible'), true, '选中曲线显示方程浮框');
    assert.equal(stage.querySelector('.plot-intersection-label'), null, '选中曲线后交点坐标隐藏');
  } finally { page.window.close(); }
});

test('plot selection also works when the click lands near (not exactly on) a point or line', async () => {
  const page = await interactiveDom(render(`${FENCE}plot\nf: x\nf: -x + 2\nx: -5, 5\ny: -5, 5\n${FENCE}`));
  try {
    const figure = page.window.document.querySelector('.md-plot');
    const stage = figure.querySelector('.plot-stage');
    const readout = figure.querySelector('.plot-readout');
    // (0,0) 的屏幕位置约为 (357,199)；点在它右下 11px 处的空白上，应命中交点。
    pointer(page, stage, 'click', 365, 207);
    assert.equal(stage.querySelector('.plot-intersection').classList.contains('is-selected'), true, '点在交点附近也能选中交点');
    assert.ok(stage.querySelector('.plot-intersection-label')?.textContent.includes('(0, 0)'), '几何命中选中交点后显示坐标标签');
    assert.equal(readout.textContent, '(0, 0)', '几何命中选中交点后底部读数显示坐标');
    // 点在曲线 y=x 附近（下方约 12px）的空白上，应命中曲线并显示方程。
    pointer(page, stage, 'click', 300, 245);
    assert.equal(stage.querySelector('.plot-curve').classList.contains('is-selected'), true, '点在曲线附近也能选中曲线');
    assert.equal(readout.textContent, 'y = x', '几何命中选中曲线后显示方程式');
  } finally { page.window.close(); }
});

test('named graph edges still show their weight', async () => {
  const svg = plots.renderGraphSvg(plots.parseGraphSpec('node: A\nnode: B\nedge: A - B ; label=路径 ; weight=3'));
  assert.ok(svg.includes('路径 · 边权 3'), '图上标注同时显示名称与边权');
  assert.ok(svg.includes('data-label="路径"') && svg.includes('data-weight="3"'), '边组保留名称与边权供交互读数');
  const page = await interactiveDom(render(`${FENCE}graph\nnode: A ; x=0 ; y=0\nnode: B ; x=100 ; y=0\nedge: A - B ; label=路径 ; weight=3\n${FENCE}`));
  try {
    const figure = page.window.document.querySelector('.md-graph');
    const hit = figure.querySelector('.graph-edge-hit');
    pointer(page, hit, 'pointermove', 200, 100);
    assert.match(figure.querySelector('.plot-readout').textContent, /路径 · 边权 3/, '悬停有名称的边时读数带边权');
    pointer(page, hit, 'click', 200, 100);
    assert.match(figure.querySelector('.plot-readout').textContent, /边权 3/, '点击有名称的边时读数带边权');
  } finally { page.window.close(); }
});

test('plot selection starts on pointerdown and remains after pointerup without a click', async () => {
  const page = await interactiveDom(render(`${FENCE}plot\nf: x\nf: -x + 2\nx: -5, 5\ny: -5, 5\n${FENCE}`));
  try {
    const figure = page.window.document.querySelector('.md-plot');
    const stage = figure.querySelector('.plot-stage');
    const readout = figure.querySelector('.plot-readout');
    const press = (target, type, x, y) => {
      const event = new page.window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      target.dispatchEvent(event);
    };
    // 只发 pointerdown/pointerup，不发 click：一按到交点就显示，松手后仍保持。
    const intersection = stage.querySelector('.plot-intersection');
    press(intersection, 'pointerdown', 340, 210);
    assert.equal(stage.querySelector('.plot-intersection').classList.contains('is-selected'), true, '按到交点立即选中，不等 click');
    assert.equal(readout.textContent, '(0, 0)', '按到交点立即显示坐标读数');
    press(intersection, 'pointerup', 341, 211);
    assert.equal(stage.querySelector('.plot-intersection').classList.contains('is-selected'), true, '松手后仍选中交点');
    assert.ok(stage.querySelector('.plot-intersection-label')?.textContent.includes('(0, 0)'), '松手后交点坐标标签出现');
    assert.equal(readout.textContent, '(0, 0)', '松手后底部读数显示交点坐标');
    assert.equal(figure.querySelector('.plot-tooltip').classList.contains('is-visible'), true, '松手后坐标标签框出现');
    // 随后姗姗来迟且落到 stage 上的 click 不能把刚选好的交点清掉。
    press(stage, 'click', 341, 211);
    assert.equal(stage.querySelector('.plot-intersection').classList.contains('is-selected'), true, '迟到的 click 不清除已选中交点');
    assert.equal(readout.textContent, '(0, 0)', '迟到的 click 后读数仍是交点坐标');

    const curve = stage.querySelector('.plot-curve');
    press(curve, 'pointerdown', 340, 100);
    assert.equal(stage.querySelector('.plot-curve').classList.contains('is-selected'), true, '按到曲线立即选中并显示方程式');
    assert.equal(readout.textContent, 'y = x', '按到曲线立即显示方程式');
    press(curve, 'pointerup', 341, 101);
    assert.equal(stage.querySelector('.plot-curve').classList.contains('is-selected'), true, '松手后仍选中曲线');
    assert.equal(readout.textContent, 'y = x', '松手后底部读数显示方程式');
    press(stage, 'click', 341, 101);
    assert.equal(readout.textContent, 'y = x', '迟到的 click 后仍显示方程式');
  } finally { page.window.close(); }
});


test('plot shows coordinates and equations as soon as hover selects a target, with no click at all', async () => {
  const page = await interactiveDom(render(`${FENCE}plot\nf: x\nf: -x + 2\npoints: (1,1)\nx: -5, 5\ny: -5, 5\n${FENCE}`));
  try {
    const figure = page.window.document.querySelector('.md-plot');
    const stage = figure.querySelector('.plot-stage');
    const readout = figure.querySelector('.plot-readout');

    pointer(page, stage.querySelector('.plot-intersection'), 'pointermove', 340, 210);
    assert.equal(stage.querySelector('.plot-intersection').classList.contains('is-selected'), true, '只移动到交点上就选中');
    assert.ok(stage.querySelector('.plot-intersection-label')?.textContent.includes('(0, 0)'), '只移动到交点上就显示坐标标签');
    assert.equal(readout.textContent, '(0, 0)', '只移动到交点上就显示底部坐标');
    assert.equal(figure.querySelector('.plot-tooltip').classList.contains('is-visible'), true, '只移动到交点上就显示坐标框');

    pointer(page, stage.querySelector('.plot-curve'), 'pointermove', 340, 100);
    assert.equal(stage.querySelector('.plot-curve').classList.contains('is-selected'), true, '只移动到曲线上就选中');
    assert.equal(readout.textContent, 'y = x', '只移动到曲线上就显示方程式');
    assert.equal(stage.querySelector('.plot-intersection-label'), null, '选中曲线后交点坐标隐藏');

    pointer(page, stage, 'pointermove', 620, 380);
    assert.equal(stage.querySelector('.is-selected'), null, '移回空白处取消 hover 选中');
    assert.equal(stage.querySelector('.plot-coord'), null, '移回空白处后坐标隐藏');
    assert.match(readout.textContent, /选中点或交点看坐标/, '移回空白处恢复默认读数');
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
    pointer(page, group, 'click', 100, 100);
    assert.equal(svg.querySelector('.graph-node-group').classList.contains('is-selected'), true, '点击选中顶点微放大');
    assert.equal(group.hasAttribute('data-x'), false, '顶点不再携带坐标');
    assert.ok(!group.querySelector('title').textContent.includes('(0, 0)'), '顶点提示不显示坐标');
    pointer(page, group, 'pointermove', 100, 100);
    assert.equal(figure.querySelector('.plot-readout').textContent, '点 A', '悬停顶点只显示点名');
    const edgeGroup = svg.querySelector('.graph-edge-group');
    const edgeHit = svg.querySelector('.graph-edge-hit');
    pointer(page, edgeHit, 'pointermove', 200, 100);
    assert.equal(edgeGroup.classList.contains('is-hovered'), true, '悬停边时对应边高亮');
    assert.match(figure.querySelector('.plot-readout').textContent, /边 A — B/, '悬停边显示边信息');
    assert.equal(figure.querySelector('.plot-tooltip').classList.contains('is-visible'), true, '坐标显示框跟随显示');
    pointer(page, edgeHit, 'click', 200, 100);
    assert.equal(svg.querySelector('.graph-edge-group').classList.contains('is-selected'), true, '点击选中边');
  } finally { page.window.close(); }
});

test('interactive graph algorithms highlight components, bridges, MST and bipartite results', async () => {
  const page = await interactiveDom(render(`${FENCE}graph\nnode: A ; x=0 ; y=0\nnode: B ; x=100 ; y=0\nnode: C ; x=200 ; y=0\nnode: D ; x=300 ; y=0\nedge: A - B ; weight=5\nedge: B - C ; label=1\nedge: A - C ; weight=3\nedge: C - D ; weight=2\n${FENCE}`));
  try {
    const figure = page.window.document.querySelector('.md-graph');
    const svg = figure.querySelector('svg');
    const readout = figure.querySelector('.plot-readout');
    const edgeByIndex = (index) => svg.querySelector(`[data-edge-index="${index}"]`);

    figure.querySelector('[data-graph-algo="components"]').click();
    assert.match(readout.textContent, /连通分量：共 1 个/, '连通分量给出结论');
    assert.equal(svg.querySelectorAll('.graph-node-group.is-algo-node').length, 4, '连通分量给顶点染色');

    figure.querySelector('[data-graph-algo="bridges"]').click();
    assert.equal(edgeByIndex(3).classList.contains('is-algo-bridge'), true, '桥被高亮');
    assert.ok([...svg.querySelectorAll('.graph-node-group')].find((group) => group.dataset.nodeId === 'C').classList.contains('is-cut-vertex'), '割点被标出');
    assert.match(readout.textContent, /桥与割点/, '桥与割点给出结论');

    figure.querySelector('[data-graph-algo="mst"]').click();
    assert.equal(edgeByIndex(1).classList.contains('is-algo-active'), true, '最小生成树选中最轻边');
    assert.equal(edgeByIndex(0).classList.contains('is-algo-dim'), true, '未选中的重边变淡');
    assert.match(readout.textContent, /总权重 6/, '最小生成树给出总权重');

    figure.querySelector('[data-graph-algo="bipartite"]').click();
    assert.match(readout.textContent, /不是二分图/, '三角形被判定为非二分图');
    assert.ok(svg.querySelector('.graph-edge-group.is-algo-conflict'), '冲突边被标红');

    figure.querySelector('[data-graph-algo="vbcc"]').click();
    assert.match(readout.textContent, /点双连通分量/, '点双给出结论');
    assert.ok([...svg.querySelectorAll('.graph-node-group')].find((group) => group.dataset.nodeId === 'C').classList.contains('is-cut-vertex'), '点双下割点同时属于多个分量，加橙色外圈');
    assert.equal(edgeByIndex(3).classList.contains('is-algo-active'), true, '桥自成点双分量也被涂色');

    figure.querySelector('[data-graph-algo="ebcc"]').click();
    assert.match(readout.textContent, /边双连通分量/, '边双给出结论');
    assert.equal(edgeByIndex(3).classList.contains('is-algo-bridge'), true, '边双下桥标红且不属于任何分量');
    assert.equal(svg.querySelectorAll('.graph-node-group.is-algo-node').length, 4, '边双按分量给顶点染色');

    figure.querySelector('[data-graph-algo="dfs"]').click();
    assert.match(readout.textContent, /DFS 树（带返祖边）/, 'DFS 树给出结论');
    assert.match(readout.textContent, /访问顺序 A/, 'DFS 树列出访问顺序');
    assert.equal(edgeByIndex(2).classList.contains('is-algo-back'), true, '返祖边被标出');
    assert.equal(edgeByIndex(0).classList.contains('is-algo-active'), true, '树边被高亮');
    assert.ok(svg.querySelector('.graph-node-group.is-dfs-root'), 'DFS 根被标出');

    figure.querySelector('[data-graph-algo="clear"]').click();
    assert.equal(svg.querySelector('.is-algo-active, .is-algo-bridge, .is-algo-conflict, .is-algo-node, .is-algo-back, .is-dfs-root'), null, '清除算法恢复原图');
    assert.equal(figure.querySelector('[data-graph-algo="mst"]').getAttribute('aria-pressed'), 'false', '清除后按钮恢复未选中');
  } finally { page.window.close(); }
});


test('interactive graph honours author-preset and disabled algorithm modes', async () => {
  const fixedPage = await interactiveDom(render(`${FENCE}graph\nalgo: mst\nnode: A ; x=0 ; y=0\nnode: B ; x=100 ; y=0\nnode: C ; x=200 ; y=0\nedge: A - B ; weight=5\nedge: B - C ; weight=1\nedge: A - C ; weight=3\n${FENCE}`));
  try {
    const figure = fixedPage.window.document.querySelector('.md-graph');
    assert.equal(figure.querySelector('[data-graph-algo]'), null, '作者指定算法时不给读者算法按钮');
    assert.match(figure.querySelector('.graph-algorithm-fixed').textContent, /最小生成树/, '显示作者指定的算法名');
    assert.match(figure.querySelector('.plot-readout').textContent, /总权重 4/, '进页面直接显示预设算法结论');
    assert.ok(figure.querySelector('.graph-edge-group.is-algo-active'), '进页面直接高亮预设算法');
  } finally { fixedPage.window.close(); }

  const nonePage = await interactiveDom(render(`${FENCE}graph\nalgo: none\nnode: A ; x=0 ; y=0\nnode: B ; x=100 ; y=0\nedge: A - B\n${FENCE}`));
  try {
    const figure = nonePage.window.document.querySelector('.md-graph');
    assert.equal(figure.querySelector('[data-graph-algo]'), null, 'algo: none 时没有算法按钮');
    assert.equal(figure.querySelector('.graph-algorithm-fixed'), null, 'algo: none 时没有作者指定标记');
    assert.equal(figure.querySelector('.is-algo-active'), null, 'algo: none 时不高亮任何算法');
  } finally { nonePage.window.close(); }

  const readerPage = await interactiveDom(render(`${FENCE}graph\nalgo: reader\nnode: A ; x=0 ; y=0\nnode: B ; x=100 ; y=0\nedge: A - B\n${FENCE}`));
  try {
    const figure = readerPage.window.document.querySelector('.md-graph');
    assert.ok(figure.querySelector('[data-graph-algo="components"]'), 'algo: reader 时读者可自选算法');
    assert.equal(figure.querySelector('.is-algo-active'), null, '读者自选时默认不高亮算法');
  } finally { readerPage.window.close(); }
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
  const srcdoc = dom.window.MinxiPreview.document({ body: `${FENCE}graph\nnode: A ; x=0 ; y=0\nnode: B ; x=100 ; y=0\nedge: A - B ; weight=7\n${FENCE}` });
  const page = new JSDOM(srcdoc, { url: 'https://preview.example/', runScripts: 'outside-only', pretendToBeVisual: true });
  try {
    dom.window.MinxiPreview.enhance(page.window.document);
    const figure = page.window.document.querySelector('.md-graph');
    const svg = figure.querySelector('svg');
    const before = svg.getAttribute('viewBox');
    figure.querySelector('[data-graph-action="zoom-in"]').click();
    assert.notEqual(svg.getAttribute('viewBox'), before, '预览里的可视化图可以缩放');
    assert.ok(svg.getAttribute('data-preview-viewbox'), '图的视图会被记录以便重渲染恢复');
    assert.ok(figure.querySelector('[data-graph-algo="mst"]'), '预览里也有图算法工具栏');
    figure.querySelector('[data-graph-algo="mst"]').click();
    assert.match(figure.querySelector('.plot-readout').textContent, /总权重 7/, '预览里最小生成树能读到边权');

    const fixedSrcdoc = dom.window.MinxiPreview.document({ body: `${FENCE}graph\nalgo: bridges\nnode: A ; x=0 ; y=0\nnode: B ; x=100 ; y=0\nnode: C ; x=200 ; y=0\nedge: A - B\nedge: B - C\n${FENCE}` });
    const fixedPage = new JSDOM(fixedSrcdoc, { url: 'https://preview.example/', runScripts: 'outside-only', pretendToBeVisual: true });
    try {
      dom.window.MinxiPreview.enhance(fixedPage.window.document);
      const fixedFigure = fixedPage.window.document.querySelector('.md-graph');
      assert.equal(fixedFigure.querySelector('[data-graph-algo]'), null, '预览里作者指定算法时没有读者按钮');
      assert.match(fixedFigure.querySelector('.plot-readout').textContent, /桥与割点/, '预览里进图直接显示作者预设算法');
    } finally { fixedPage.window.close(); }
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


test('intersections are round dots whose coordinates stay fixed across views', () => {
  const spec = plots.parsePlotSpec('f: x^2 - 2x + 1\nf: -x + 3\npoints: (1, 0), (3, 2) ; connect=true\nx: -3, 5\ny: -2, 10');
  const pts = plots.findPlotIntersections(spec, [-3, 5], [-2, 10]);
  assert.ok(pts.some((pt) => Math.abs(pt.x - 2) < 1e-9 && Math.abs(pt.y - 1) < 1e-9), '交点精确落在 (2, 1)');
  assert.ok(pts.some((pt) => Math.abs(pt.x + 1) < 1e-9 && Math.abs(pt.y - 4) < 1e-9), '交点精确落在 (-1, 4)');
  assert.ok(!pts.some((pt) => Math.abs(pt.x - 1.9667) < 0.01), '不再出现随采样漂移的近似交点');
  const grab = (svg) => [...svg.matchAll(/class="plot-intersection" data-kind="intersection" data-x="([^"]+)" data-y="([^"]+)"/g)].map((m) => `${m[1]},${m[2]}`);
  const wide = plots.renderPlotSvgInner(spec, { xRange: [-3, 5], yRange: [-2, 10] });
  const zoomed = plots.renderPlotSvgInner(spec, { xRange: [0, 3], yRange: [0, 4] });
  assert.ok(wide.includes('class="plot-dot plot-intersection-dot"'), '交点是圆点而不是菱形');
  const wideCoords = grab(wide);
  assert.ok(grab(zoomed).length > 0);
  for (const coord of grab(zoomed)) assert.ok(wideCoords.includes(coord), `缩放后坐标 ${coord} 与原图一致`);
});

test('points gently enlarge when selected (CSS)', async () => {
  const css = await readFile('themes/minxi/source/css/main.css', 'utf8');
  assert.ok(css.includes('.plot-point.is-selected .plot-dot'), '描点选中态样式');
  assert.ok(css.includes('.plot-intersection.is-selected .plot-dot'), '交点选中态样式');
  assert.ok(css.includes('transform: scale(1.45)'), '选中微放大');
  assert.ok(css.includes('.graph-node-group.is-selected .graph-node'), '图顶点选中态样式');
  assert.ok(css.includes('.plot-intersection-dot { opacity: 0; }'), '交点圆点默认隐藏');
  assert.ok(css.includes('.plot-intersection:hover .plot-intersection-dot'), '悬停交点才显现圆点');
  assert.ok(css.includes('.plot-intersection.is-selected .plot-intersection-dot'), '选中交点显现圆点');
});


test('coordinate display box and line hover styles are shipped (CSS)', async () => {
  const css = await readFile('themes/minxi/source/css/main.css', 'utf8');
  assert.ok(css.includes('.plot-tooltip'), '坐标显示框样式');
  assert.ok(css.includes('.plot-tooltip.is-visible'), '坐标显示框可见态');
  assert.match(css, /\.plot-readout \{[^}]*border-left: 3px solid var\(--accent\)/, '底部读数也是显示框');
  assert.ok(css.includes('.plot-curve.is-hovered'), '函数曲线悬停加粗');
  assert.ok(css.includes('.graph-edge-group:hover .graph-edge-line'), '图边悬停加粗');
  assert.ok(css.includes('.graph-node-ring'), '图顶点外圈样式');
  assert.ok(!css.includes('.plot-equations') && !css.includes('.plot-label'), '函数图方程区与图内名称样式已删除');
  assert.ok(css.includes('.graph-edge-group.is-algo-active .graph-edge-line'), '图算法边高亮样式');
  assert.ok(css.includes('.plot-curve.is-selected'), '选中函数曲线加粗样式');
  assert.ok(css.includes('.plot-segment.is-selected'), '选中线段加粗样式');
  assert.ok(css.includes('.graph-node-group.is-cut-vertex .graph-node-ring'), '割点外圈样式');
  assert.ok(css.includes('.graph-algorithm-fixed'), '作者指定算法标记样式');
  assert.ok(css.includes('.graph-edge-group.is-algo-back .graph-edge-line'), '返祖边样式');
  assert.ok(css.includes('.graph-node-group.is-dfs-root .graph-node-ring'), 'DFS 根外圈样式');
});

test('editor preview graph nodes drag locally and save reports all source positions at once', async () => {
  const srcdoc = dom.window.MinxiPreview.document({ body: `${FENCE}graph\nnode: A ; x=0 ; y=0\nnode: B ; x=100 ; y=0\nedge: A - B\n${FENCE}` });
  const page = new JSDOM(srcdoc, { url: 'https://preview.example/', runScripts: 'outside-only', pretendToBeVisual: true });
  try {
    page.window.Element.prototype.getBoundingClientRect = function rect() {
      return { left: 0, top: 0, right: 680, bottom: 420, width: 680, height: 420, x: 0, y: 0, toJSON() {} };
    };
    dom.window.MinxiPreview.enhance(page.window.document);
    const figure = page.window.document.querySelector('.md-graph');
    assert.equal(figure.dataset.graphEditable, 'true', '后台预览的图带可调整标记');
    const adjustButton = figure.querySelector('[data-graph-adjust]');
    assert.ok(adjustButton, '预览工具栏有「调整点位」');
    const svg = figure.querySelector('svg');
    assert.ok(svg.getAttribute('data-graph-scale-x'), '渲染器给出坐标变换供拖动换算');
    const groupA = svg.querySelector('.graph-node-group[data-node-id="A"]');
    assert.equal(groupA.dataset.nodeX, '0', '节点带原始坐标');

    // 正式文章页（没有预览标记）不出现调整入口。
    const publicPage = await interactiveDom(render(`${FENCE}graph\nnode: A ; x=0 ; y=0\nnode: B ; x=100 ; y=0\nedge: A - B\n${FENCE}`));
    try {
      assert.equal(publicPage.window.document.querySelector('[data-graph-adjust]'), null, '读者页没有调整点位');
    } finally { publicPage.window.close(); }

    let committed = null;
    let commitCount = 0;
    page.window.document.addEventListener('minxi:graph-positions', (event) => { committed = event.detail; commitCount += 1; });
    adjustButton.click();
    assert.equal(figure.classList.contains('is-adjusting'), true, '进入调整模式');
    const savePositionsButton = figure.querySelector('[data-graph-save-positions]');
    assert.ok(savePositionsButton, '调整模式有保存点位按钮');
    assert.equal(savePositionsButton.hidden, false, '保存点位按钮在调整模式显示');
    assert.equal(adjustButton.textContent, '退出调整', '调整中按钮显示退出调整');
    const readout = figure.querySelector('.plot-readout');
    assert.equal(readout.style.visibility, 'hidden', '调整点位时暂时关闭下方详细信息，避免行数变化抖动');
    const frozenReadout = readout.textContent;
    const stage = figure.querySelector('.graph-stage');
    const circleA = groupA.querySelector('.graph-node');
    // A 的 SVG 位置约 (52, 280)，画布高 560 映射到 420px 显示高。
    pointer(page, groupA, 'pointerdown', 52, 210);
    pointer(page, stage, 'pointermove', 120, 252);
    assert.equal(Number(circleA.getAttribute('cx')), 120, '拖动中节点实时跟随');
    assert.equal(readout.textContent, frozenReadout, '拖动中详细信息冻结不更新，行数不变不抖动');
    pointer(page, stage, 'pointerup', 120, 252);
    assert.equal(commitCount, 0, '拖完一个点松手不写回源码、不触发重渲染');
    // 同一轮调整里继续拖同一点：位置只在本地累积，仍然不派发事件。
    pointer(page, groupA, 'pointerdown', 120, 252);
    pointer(page, stage, 'pointermove', 150, 280);
    pointer(page, stage, 'pointerup', 150, 280);
    assert.equal(commitCount, 0, '连续拖动仍只暂存本地');
    savePositionsButton.click();
    assert.equal(commitCount, 1, '调整完毕点保存点位后只统一派发一次');
    assert.ok(committed, '保存后发出点位写回事件');
    assert.equal(committed.graphIndex, 0);
    assert.equal(committed.reset, false);
    assert.ok(Math.abs(committed.positions.A.x - 17.01) < 0.1, `A 的最终横坐标一次性换算回源码坐标，实际 ${committed.positions.A.x}`);
    assert.ok(Math.abs(committed.positions.A.y - 24.56) < 0.1, `A 的最终纵坐标一次性换算回源码坐标，实际 ${committed.positions.A.y}`);
    assert.equal(committed.positions.B.x, 100, '没拖的点保持原横坐标');
    assert.equal(committed.positions.B.y, 0, '没拖的点保持原纵坐标');
    const line = svg.querySelector('.graph-edge-group line.graph-edge-line') || svg.querySelectorAll('.graph-edge-group line')[1];
    assert.ok(Math.abs(Number(line.getAttribute('x1')) - (120 + 20)) < 0.01 || Number(line.getAttribute('x1')) > 52, '相连边端点跟随节点更新');
    assert.equal(readout.textContent, frozenReadout, '保存后调整模式内仍不更新详细信息（写回提示看后台状态栏）');
    // 保存后再拖动但不保存就退出：本地恢复到上次保存位置，且不产生第二次写回。
    pointer(page, groupA, 'pointerdown', 150, 280);
    pointer(page, stage, 'pointermove', 170, 294);
    pointer(page, stage, 'pointerup', 170, 294);
    assert.equal(commitCount, 1, '未保存的后续拖动仍不写回');
    adjustButton.click();
    assert.equal(commitCount, 1, '未保存退出不派发写回事件');
    assert.equal(Number(circleA.getAttribute('cx')), 150, '未保存退出恢复到上次保存位置');
    assert.equal(readout.style.visibility, '', '退出调整模式后详细信息恢复显示');
    assert.match(readout.textContent, /拖动平移/, '退出后恢复默认提示');
  } finally { page.window.close(); }
});
