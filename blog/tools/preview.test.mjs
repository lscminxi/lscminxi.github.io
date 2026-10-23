import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
const require = createRequire(import.meta.url);
const Hexo = require('hexo');
const hexo = new Hexo(process.cwd(), { silent: true });
let dom;
let preview;
before(async () => {
  await hexo.init();
  dom = new JSDOM('<!doctype html><html></html>', { url: 'https://preview.example/admin/', runScripts: 'outside-only' });
  dom.window.eval(await readFile('source/admin/preview.js', 'utf8'));
  preview = (body) => new JSDOM(dom.window.MinxiPreview.document({ body, title: '<script>bad()</script>' })).window.document;
});
after(async () => { dom.window.close(); await hexo.exit(); });
const render = (text) => hexo.render.renderSync({ text, engine: 'md' });

test('inline/display math survives Markdown and matches the published renderer', () => {
  const md = '中文$a_i^2$公式与$O(n\\log n)$复杂度。\n\n$$\n\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\n$$';
  const expected = new JSDOM(render(md)).window.document;
  const actual = preview(md);
  assert.equal(actual.querySelectorAll('.katex').length, 3);
  assert.equal(actual.querySelectorAll('.katex-display').length, 1);
  assert.deepEqual([...actual.querySelectorAll('annotation')].map(x => x.textContent),
    [...expected.querySelectorAll('annotation')].map(x => x.textContent));
  assert(actual.querySelector('math'), 'Accessible MathML remains');
});
test('code fences and inline code are never interpreted as formulas', async () => {
  const md = '`$a_i$`\n\n```cpp\n// $x$\nint main() {}\n```';
  assert.equal(preview(md).querySelectorAll('.katex').length, 0);
  assert(!render(md).includes('class="katex"'));
  const post = await hexo.post.render('preview-test.md', { content: md });
  assert(post.content.includes('highlight'), 'Keep existing Hexo syntax highlighting');
});
test('line numbers are enabled only by the exact line-numbers fence option', async () => {
  const post = await hexo.post.render('line-number-test.md', {
    content: '```cpp line-numbers\nint numbered;\n```\n\n```cpp\nint plain;\n```\n\n```cpp line-number\nint typo;\n```',
  });
  const doc = new JSDOM(post.content).window.document;
  const blocks = doc.querySelectorAll('figure.highlight');
  assert.equal(blocks.length, 3);
  assert(blocks[0].querySelector('.gutter'), 'The explicit option displays line numbers');
  assert(!blocks[0].querySelector('figcaption'), 'The option is not displayed as a caption');
  assert(!blocks[1].querySelector('.gutter'), 'A normal cpp fence has no line numbers');
  assert(!blocks[2].querySelector('.gutter'), 'A misspelled option does not enable line numbers');
});

test('invalid TeX does not crash preview or publication', () => {
  assert(preview('$\\frac{$').querySelector('.katex-error'));
  assert(render('$\\frac{$').includes('katex-error'));
});
test('preview sanitizes scripts, event handlers, forms, and javascript URLs', () => {
  const doc = preview('<script>alert(1)</script><img src="/images/test.png" onerror="bad()"><iframe src="evil"></iframe><form><input></form>\n\n[bad](javascript:alert%281%29)');
  assert.equal(doc.querySelectorAll('script, iframe, form, input').length, 0);
  assert.equal(doc.querySelectorAll('[onerror], [onclick]').length, 0);
  assert(!doc.querySelector('a')?.hasAttribute('href'));
  assert.equal(doc.querySelector('h1').textContent, '<script>bad()</script>');
  assert(!preview('$\\href{javascript:alert(1)}{x}$').querySelector('a[href^="javascript:"]'));
});
test('normal Markdown, tables, image paths, local styles and font files remain available', async () => {
  const doc = preview('# 标题\n\n- 项目\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n![图片](/images/a.png)\n\n> 引用');
  assert(doc.querySelector('.article-content h1'));
  assert(doc.querySelector('table'));
  assert(doc.querySelector('ul'));
  assert(doc.querySelector('blockquote'));
  assert.equal(doc.querySelector('img').getAttribute('src'), '/images/a.png');
  const css = await readFile('source/vendor/katex/katex.min.css', 'utf8');
  for (const [, path] of css.matchAll(/url\(([^)]+)\)/g)) {
    await readFile(`source/vendor/katex/${path}`);
  }
});
test('real editor updates live, supports modes and inserts math without network requests', async () => {
  const html = await readFile('source/admin/index.html', 'utf8');
  const editor = new JSDOM(html, { url: 'https://preview.example/admin/', runScripts: 'outside-only' });
  const w = editor.window;
  w.scrollTo = () => {};
  w.fetch = () => { throw new Error('Preview must never request GitHub'); };
  w.eval(await readFile('source/admin/preview.js', 'utf8'));
  w.eval(await readFile('source/admin/admin.js', 'utf8'));
  const field = w.document.querySelector('#f-body');
  field.value = '实时$a_i$';
  field.dispatchEvent(new w.Event('input'));
  await new Promise(resolve => setTimeout(resolve, 240));
  const frame = w.document.querySelector('#post-preview');
  assert(frame.srcdoc.includes('katex'));
  assert.equal(frame.getAttribute('sandbox'), 'allow-same-origin');
  w.document.querySelector('[data-editor-mode="preview"]').click();
  assert.equal(w.document.querySelector('#writing-workspace').dataset.mode, 'preview');
  assert.equal(w.document.querySelector('[data-editor-mode="preview"]').getAttribute('aria-pressed'), 'true');
  w.document.querySelector('#insert-math').click();
  assert(field.value.includes('\\sum_{i=1}^{n}'));
  assert(frame.srcdoc.includes('katex-display'));
  w.document.querySelector('#new-post-button').click();
  assert(frame.srcdoc.includes('在左侧输入正文'));
  editor.window.close();
});

test('full Hexo post pipeline keeps formulas, backslashes, heading IDs and code highlighting', async () => {
  const post = await hexo.post.render('preview-test.md', {
    content: '# 数学笔记\n\n中文$a_i^2$公式\n\n$$\n\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\n$$\n\n```cpp\nint main() {}\n```',
  });
  const doc = new JSDOM(post.content).window.document;
  assert.equal(doc.querySelectorAll('.katex').length, 2);
  assert(doc.querySelector('.katex-display'));
  assert(doc.querySelector('h1[id]'));
  assert(doc.querySelector('.highlight'));
});

test('info/success fold boxes have escaped titles, default labels and Markdown/KaTeX bodies', () => {
  const md = ':::info[思路提示]\n\n**加粗** 与 $a_i$\n\n- 第一条\n- 第二条\n\n:::\n\n:::success[]\n\n已经 AC！\n\n:::';
  for (const doc of [preview(md), new JSDOM(render(md)).window.document]) {
    const boxes = doc.querySelectorAll('details.fold-box');
    assert.equal(boxes.length, 2);
    assert(boxes[0].classList.contains('fold-box--info'));
    assert(boxes[1].classList.contains('fold-box--success'));
    assert.equal(boxes[0].querySelector('summary').textContent, '思路提示');
    assert.equal(boxes[1].querySelector('summary').textContent, '成功');
    assert(!boxes[0].hasAttribute('open'), 'Closed by default');
    assert(boxes[0].querySelector('strong'));
    assert.equal(boxes[0].querySelectorAll('li').length, 2);
    assert(boxes[0].querySelector('.katex'));
    assert.equal(boxes[1].querySelector('.fold-box-body').textContent.trim(), '已经 AC！');
  }
  const emptyTitle = preview(':::info[]\n:::\n');
  assert.equal(emptyTitle.querySelector('summary').textContent, '提示');
  const title = preview(':::info[<img src=x onerror=bad()>]\n内容\n:::\n');
  assert.equal(title.querySelector('summary').textContent, '<img src=x onerror=bad()>');
  assert(!title.querySelector('summary img'));
});

test('fold boxes support nesting, consecutive blocks and paragraphs without blank lines', () => {
  const md = '前面的正文\n:::info[外层]\n开始\n\n:::success[内层]\n**结果**\n:::\n\n结束\n:::\n:::info[第二个]\n第二个正文\n:::\n后面的正文';
  for (const doc of [preview(md), new JSDOM(render(md)).window.document]) {
    assert.equal(doc.querySelectorAll('details').length, 3);
    assert.equal(doc.querySelector('details details summary').textContent, '内层');
    assert(doc.querySelector('details details strong'));
    assert(doc.body.textContent.includes('后面的正文'));
  }
});

test('fold syntax inside code stays literal; code inside a fold does not close it', async () => {
  const md = ':::info[代码示例]\n\n```md\n:::success[不是折叠框]\n:::\n```\n\n代码之后的内容\n:::';
  const published = await hexo.post.render('fold-test.md', { content: md });
  for (const doc of [preview(md), new JSDOM(published.content).window.document]) {
    assert.equal(doc.querySelectorAll('details').length, 1);
    assert(doc.querySelector('details code, details .highlight').textContent.includes(':::success'));
    assert(doc.querySelector('.fold-box-body').textContent.includes('代码之后的内容'));
  }
  const rawCode = '```md\n:::info[代码]\n内容\n:::\n```\n\n`:::success[]`';
  assert.equal(preview(rawCode).querySelectorAll('details').length, 0);
  assert.equal(new JSDOM((await hexo.post.render('fold-test.md', { content: rawCode })).content).window.document.querySelectorAll('details').length, 0);
  const tildes = ':::success[波浪线围栏]\n\n~~~~md\n:::\n~~~\n~~~~\n\n正文\n:::';
  assert.equal(preview(tildes).querySelectorAll('details').length, 1);
  assert(preview(tildes).querySelector('details code').textContent.includes(':::'));
});

test('unclosed or unsupported containers remain literal and preserve following text', () => {
  for (const md of [':::info[未闭合]\n\n正文\n\n# 后续标题', ':::warning[未知类型]\n正文\n:::', ':::success\n正文\n:::']) {
    for (const doc of [preview(md), new JSDOM(render(md)).window.document]) {
      assert.equal(doc.querySelectorAll('details').length, 0);
      assert(doc.body.textContent.includes(':::'));
      assert(doc.body.textContent.includes('正文'));
    }
  }
});

test('full Hexo pipeline renders headings, highlighted code and display math inside folds', async () => {
  const md = ':::success[完整文章]\n\n## 标题\n\n$$\n\\sum_{i=1}^{n} i\n$$\n\n```cpp\nint main() {}\n```\n\n:::';
  const post = await hexo.post.render('fold-test.md', { content: md });
  const doc = new JSDOM(post.content).window.document;
  assert(doc.querySelector('details h2[id]'));
  assert(doc.querySelector('details .highlight'));
  assert(doc.querySelector('details .katex-display'));
  assert(preview(md).querySelector('details .katex-display'));
});

test('editor inserts both fold box templates and updates the preview without saving', async () => {
  const html = await readFile('source/admin/index.html', 'utf8');
  const editor = new JSDOM(html, { url: 'https://preview.example/admin/', runScripts: 'outside-only' });
  const w = editor.window;
  w.scrollTo = () => {};
  w.fetch = () => { throw new Error('Inserting a fold box must not save or fetch'); };
  w.eval(await readFile('source/admin/preview.js', 'utf8'));
  w.eval(await readFile('source/admin/admin.js', 'utf8'));
  const select = w.document.querySelector('#insert-fold');
  for (const kind of ['info', 'success']) {
    select.value = kind;
    select.dispatchEvent(new w.Event('change'));
    assert(w.document.querySelector('#f-body').value.includes(`:::${kind}[`));
    const doc = new JSDOM(w.document.querySelector('#post-preview').srcdoc).window.document;
    assert(doc.querySelector(`details.fold-box--${kind}`));
    assert.equal(select.value, '');
  }
  editor.window.close();
});

test('live preview preserves fold states with stable keys, including duplicate and nested titles', () => {
  const md = ':::info[提示]\n\n:::success[内层]\n内容\n:::\n\n:::\n\n:::info[提示]\n第二个\n:::';
  const original = new JSDOM(dom.window.MinxiPreview.document({ body: md })).window.document;
  const folds = [...original.querySelectorAll('details.fold-box')];
  const keys = folds.map(fold => fold.dataset.previewFoldKey);
  assert.equal(new Set(keys).size, 3, 'Duplicate labels must have distinct keys');
  const updated = new JSDOM(dom.window.MinxiPreview.document({
    body: md.replace('内容', '**新内容**'), title: '新文章标题', openFolds: keys.slice(0, 2),
  })).window.document;
  const updatedFolds = [...updated.querySelectorAll('details.fold-box')];
  assert.deepEqual(updatedFolds.map(fold => fold.dataset.previewFoldKey), keys);
  assert(updatedFolds[0].open);
  assert(updatedFolds[1].open);
  assert(!updatedFolds[2].open);
  assert(updated.querySelector('details details strong'));
  const fresh = new JSDOM(dom.window.MinxiPreview.document({ body: md })).window.document;
  assert.equal(fresh.querySelectorAll('details[open]').length, 0, 'New articles start folded');
});

test('blocks carry source start and end lines, including fold interiors', () => {
  const md = '段一\n\n:::info[提示]\n内部一\n\n内部二\n:::\n\n```plot\ny = x\n```\n\n```graph\nnode: A\n```\n\n尾段';
  const doc = preview(md);
  const blocks = [...doc.querySelector('.article-content').children];
  const fold = blocks.find((el) => el.classList.contains('fold-box'));
  const plot = blocks.find((el) => el.classList.contains('md-plot'));
  const graph = blocks.find((el) => el.classList.contains('md-graph'));
  assert.equal(fold.dataset.sourceLine, '3', '折叠框起始行');
  assert.ok(Number(fold.dataset.sourceEndLine) > 7, '折叠框带结束行（覆盖内部全部源码）');
  assert.deepEqual(
    [...fold.querySelectorAll('.fold-box-body > *')].map((el) => el.dataset.sourceLine),
    ['4', '6'],
    '折叠框内部块也标了源码行，展开时可逐块对齐',
  );
  assert.equal(plot.dataset.sourceLine, '9', '函数图起始行');
  assert.equal(graph.dataset.sourceLine, '13', '关系图起始行');
  for (const el of [plot, graph]) {
    assert.ok(Number(el.dataset.sourceEndLine) > Number(el.dataset.sourceLine), '图块带结束行，供整块对齐判定范围');
  }
});

test('preview typography matches the published article reading size', () => {
  const html = dom.window.MinxiPreview.document({ title: '标题', body: '正文' });
  assert.ok(html.includes('.article-content{font-size:16px!important;line-height:2'), '预览正文强制与前台文章相同的 16px/2 字号行高，不受 iframe 窄宽断点缩小');
  assert.ok(html.includes('h1{font-size:33px;line-height:1.55'), '预览标题与前台文章标题字号一致');
});

test('incremental patch only updates changed blocks and keeps figure DOM nodes', () => {
  const md = '第一段\n\n```graph\nnode: A ; x=0 ; y=0\nnode: B ; x=100 ; y=0\nedge: A - B\n```\n\n最后一段';
  const doc = preview(md);
  dom.window.MinxiPreview.enhance(doc);
  const content = doc.querySelector('.article-content');
  const firstBlock = content.children[0];
  const figure = content.querySelector('.md-graph');
  const lastBlock = content.children[2];
  assert.ok(figure.classList.contains('is-interactive'), '图块已增强成交互状态');

  // 只改第一段文字：图块与最后一段的 DOM 节点必须原样保留（不重渲染、不闪）。
  const ok = dom.window.MinxiPreview.patch(doc, { title: '新标题', body: '第一段改了一点\n\n```graph\nnode: A ; x=0 ; y=0\nnode: B ; x=100 ; y=0\nedge: A - B\n```\n\n最后一段' });
  assert.equal(ok, true);
  assert.equal(doc.querySelector('h1').textContent, '新标题', '标题就地更新');
  assert.equal(content.children[0].textContent, '第一段改了一点', '变化的块更新内容');
  assert.equal(content.querySelector('.md-graph'), figure, '源码没变的图块保留原 DOM 节点（交互状态不丢）');
  assert.equal(content.children[2], lastBlock, '没变的块保留原 DOM 节点');

  // 插入新段落、删掉旧段落：逐块增删，不整页替换。
  dom.window.MinxiPreview.patch(doc, { body: '第一段改了一点\n\n```graph\nnode: A ; x=0 ; y=0\nnode: B ; x=100 ; y=0\nedge: A - B\n```\n\n新插入段\n\n最后一段' });
  assert.equal(content.children.length, 4, '新块被插入');
  assert.equal(content.children[2].textContent, '新插入段');
  assert.equal(content.querySelector('.md-graph'), figure, '插入段落后图块仍保留');
});

test('live editor patches the preview in place instead of reloading srcdoc', async () => {
  const editor = new JSDOM(await readFile('source/admin/index.html', 'utf8'), {
    url: 'https://preview.example/admin/', runScripts: 'outside-only',
  });
  const w = editor.window;
  w.scrollTo = () => {};
  w.fetch = () => { throw new Error('Preview patch must not fetch'); };
  w.eval(await readFile('source/admin/preview.js', 'utf8'));
  w.eval(await readFile('source/admin/admin.js', 'utf8'));
  const field = w.document.querySelector('#f-body');
  const frame = w.document.querySelector('#post-preview');
  field.value = '第一段';
  field.dispatchEvent(new w.Event('input'));
  await new Promise((resolve) => setTimeout(resolve, 260));
  const srcdocBefore = frame.srcdoc;
  assert.ok(srcdocBefore.includes('第一段'), '首次仍整页灌入');

  // 模拟 iframe 已加载出正文文档：后续输入应走增量 patch，不再重灌 srcdoc。
  const doc = frame.contentDocument;
  doc.body.innerHTML = '<h1>未命名文章</h1><p class="article-description"></p><div class="article-content"><p>第一段</p></div>';
  const keptParagraph = doc.querySelector('.article-content p');
  field.value = '第一段改了';
  field.dispatchEvent(new w.Event('input'));
  await new Promise((resolve) => setTimeout(resolve, 260));
  assert.equal(frame.srcdoc, srcdocBefore, '编辑时不再重灌 srcdoc（不整页重载、不闪）');
  assert.equal(doc.querySelector('.article-content p'), keptParagraph, '未变位置的块保留原节点');
  assert.equal(keptParagraph.textContent, '第一段改了', '变化内容就地更新');
  editor.window.close();
});

test('editor and preview stay aligned and synced without jumping back to the top', async () => {
  const css = await readFile('source/admin/admin.css', 'utf8');
  assert.match(css, /\.writing-workspace \{[^}]*align-items: stretch/, '编辑区和预览区两端对齐');
  assert.match(css, /\.writing-workspace \{[^}]*height: 65vh/, '分屏工作区有统一高度');
  assert.match(css, /\.writing-workspace \.code-area \{[^}]*height: 100%/, '编辑区撑满对齐高度');
  assert.match(css, /#post-preview \{[^}]*height: 100%/, '预览区撑满对齐高度');

  const editor = new JSDOM(await readFile('source/admin/index.html', 'utf8'), {
    url: 'https://preview.example/admin/', runScripts: 'outside-only',
  });
  const w = editor.window;
  w.scrollTo = () => {};
  w.fetch = () => { throw new Error('Scroll sync must not fetch'); };
  w.eval(await readFile('source/admin/preview.js', 'utf8'));
  w.eval(await readFile('source/admin/admin.js', 'utf8'));
  const field = w.document.querySelector('#f-body');
  const frame = w.document.querySelector('#post-preview');
  // 先完成首次渲染，后续编辑属于同一篇文章的增量更新，不应再重置滚动。
  field.value = '初始正文';
  field.dispatchEvent(new w.Event('input'));
  await new Promise((resolve) => setTimeout(resolve, 260));
  frame.dispatchEvent(new w.Event('load'));
  await new Promise((resolve) => setTimeout(resolve, 90));
  const previewDoc = frame.contentDocument;
  if (!previewDoc.scrollingElement) {
    Object.defineProperty(previewDoc, 'scrollingElement', { configurable: true, get: () => previewDoc.documentElement });
  }
  const previewScroll = previewDoc.scrollingElement;
  assert.ok(previewScroll, '预览有可滚动根元素');
  const metric = (element, height, client, get, set) => {
    Object.defineProperties(element, {
      scrollHeight: { configurable: true, get: () => height },
      clientHeight: { configurable: true, get: () => client },
      scrollTop: { configurable: true, get, set },
    });
  };
  let editorTop = 400;
  let previewTop = 0;
  metric(field, 1000, 200, () => editorTop, (value) => { editorTop = value; });
  field.style.paddingBottom = '0px'; // 本用例的几何不含文末留白；留白排除另有专门用例
  metric(previewScroll, 1600, 200, () => previewTop, (value) => { previewTop = value; });

  // 预览块带源码行号，编辑区按行锚点同步（无锚点时才退回比例）。
  const stamped = preview('# 标题\n\n第一段\n\n第二段');
  assert.deepEqual([...stamped.querySelectorAll('.article-content > [data-source-line]')].map((el) => el.dataset.sourceLine), ['1', '3', '5'], '预览顶层块标有源码起始行');
  const adminJs = await readFile('source/admin/admin.js', 'utf8');
  assert.ok(adminJs.includes('collectScrollAnchors') && adminJs.includes('syncPreviewScroll'), '同步走参考编辑器的行锚点单向对齐');
  assert.ok(adminJs.includes('scroll.style.scrollBehavior = "auto"'), '程序对齐关闭平滑滚动，直接落位无滚动动画');
  assert.ok(adminJs.includes('previewFrame.style.visibility = "hidden"') && adminJs.includes('revealAlignedPreview'), '重渲染先隐藏新预览，对齐完成后才显示，不先露最前端');
  assert.ok(!adminJs.includes('syncEditorToPreview') && !adminJs.includes('isSyncEcho'), '单向同步：预览不反写编辑区，没有回声守卫');

  field.dispatchEvent(new w.Event('scroll'));
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(previewTop, 700, '编辑区滚到一半时预览按比例对齐到一半（同步经 rAF 合并）');

  frame.dispatchEvent(new w.Event('load'));
  await new Promise((resolve) => setTimeout(resolve, 260));
  assert.equal(previewTop, 700, '重新渲染后按编辑区当前位置重新对齐，不回最前端');
  // 单向同步（参考编辑器同款）：在预览里滚动不反写编辑区。
  previewTop = 1050;
  frame.contentWindow.dispatchEvent(new w.Event('scroll'));
  await new Promise((resolve) => setTimeout(resolve, 90));
  assert.equal(editorTop, 400, '预览滚动不带动编辑区（单向同步）');
  assert.equal(previewTop, 1050, '预览自己的滚动位置不被编辑区抢回去');

  // 再次编辑触发重新渲染：仍以编辑区为准对齐，不回到头。
  field.value = '改了一点正文，触发重新渲染';
  field.dispatchEvent(new w.Event('input'));
  await new Promise((resolve) => setTimeout(resolve, 260));
  const renderedDoc = frame.contentDocument;
  if (!renderedDoc.scrollingElement) {
    Object.defineProperty(renderedDoc, 'scrollingElement', { configurable: true, get: () => renderedDoc.documentElement });
  }
  metric(renderedDoc.scrollingElement, 1600, 200, () => previewTop, (value) => { previewTop = value; });
  frame.dispatchEvent(new w.Event('load'));
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(previewTop, 700, '重新渲染后预览按编辑区对齐到对应位置，不回头');
  editor.window.close();
});

test('view mode changes do not reload an unchanged live preview', async () => {
  const editor = new JSDOM(await readFile('source/admin/index.html', 'utf8'), {
    url: 'https://preview.example/admin/', runScripts: 'outside-only',
  });
  const w = editor.window;
  w.scrollTo = () => {};
  w.fetch = () => { throw new Error('Preview must never submit'); };
  w.eval(await readFile('source/admin/preview.js', 'utf8'));
  let renders = 0;
  const renderDocument = w.MinxiPreview.document;
  w.MinxiPreview.document = (input) => { renders++; return renderDocument(input); };
  w.eval(await readFile('source/admin/admin.js', 'utf8'));
  w.document.querySelector('#new-post-button').click();
  const baseline = renders;
  for (const mode of ['preview', 'edit', 'split']) {
    w.document.querySelector(`[data-editor-mode="${mode}"]`).click();
  }
  assert.equal(renders, baseline);
  w.document.querySelector('#new-post-button').click();
  assert.equal(renders, baseline + 1, 'Opening a new article resets the preview even with identical inputs');
  editor.window.close();
});

test('zen (pure) editor mode hides the chrome, keeps the draft and exits with Esc', async () => {
  const editor = new JSDOM(await readFile('source/admin/index.html', 'utf8'), {
    url: 'https://preview.example/admin/', runScripts: 'outside-only',
  });
  const w = editor.window;
  w.scrollTo = () => {};
  w.fetch = () => { throw new Error('Zen mode must not fetch'); };
  w.eval(await readFile('source/admin/preview.js', 'utf8'));
  w.eval(await readFile('source/admin/admin.js', 'utf8'));
  const field = w.document.querySelector('#f-body');
  field.value = '纯净模式里写的草稿';
  w.document.querySelector('[data-editor-mode="zen"]').click();
  assert.equal(w.document.querySelector('#writing-workspace').dataset.mode, 'zen');
  assert.ok(w.document.body.classList.contains('zen-editing'), '纯净模式给 body 打上 zen-editing 标记');
  assert.equal(field.value, '纯净模式里写的草稿', '切换模式不丢未保存内容');
  const css = await readFile('source/admin/admin.css', 'utf8');
  assert.match(css, /body\.zen-editing \.admin-topbar/, '纯净模式隐藏后台顶栏');
  assert.match(css, /\.writing-workspace\[data-mode="zen"\] \{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)/, '纯净模式是左编辑右预览的专注分屏');
  assert.ok(!/\.writing-workspace\[data-mode="zen"\] #post-preview \{[^}]*display: none/.test(css), '纯净模式不再隐藏预览区');
  w.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(w.document.querySelector('#writing-workspace').dataset.mode, 'split', 'Esc 退回分屏');
  assert.ok(!w.document.body.classList.contains('zen-editing'));
  assert.equal(field.value, '纯净模式里写的草稿', '退出纯净模式也不丢内容');
  editor.window.close();
});

test('preview scrolling stays independent and re-render re-aligns to the editor', async () => {
  const editor = new JSDOM(await readFile('source/admin/index.html', 'utf8'), {
    url: 'https://preview.example/admin/', runScripts: 'outside-only',
  });
  const w = editor.window;
  w.scrollTo = () => {};
  w.fetch = () => { throw new Error('Scroll sync must not fetch'); };
  w.eval(await readFile('source/admin/preview.js', 'utf8'));
  w.eval(await readFile('source/admin/admin.js', 'utf8'));
  const field = w.document.querySelector('#f-body');
  const frame = w.document.querySelector('#post-preview');
  field.value = '第一段\\n\\n第二段\\n\\n第三段';
  field.dispatchEvent(new w.Event('input'));
  await new Promise((resolve) => setTimeout(resolve, 260));
  frame.dispatchEvent(new w.Event('load'));
  const metric = (element, height, client, get, set) => {
    Object.defineProperties(element, {
      scrollHeight: { configurable: true, get: () => height },
      clientHeight: { configurable: true, get: () => client },
      scrollTop: { configurable: true, get, set },
    });
  };
  let editorTop = 0;
  let previewTop = 0;
  metric(field, 1000, 200, () => editorTop, (value) => { editorTop = value; });
  field.style.paddingBottom = '0px'; // 本用例的几何不含文末留白；留白排除另有专门用例
  const doc = frame.contentDocument;
  if (!doc.scrollingElement) {
    Object.defineProperty(doc, 'scrollingElement', { configurable: true, get: () => doc.documentElement });
  }
  metric(doc.scrollingElement, 1600, 200, () => previewTop, (value) => { previewTop = value; });
  // 编辑区滚到一半，预览跟随到一半。
  editorTop = 400;
  field.dispatchEvent(new w.Event('scroll'));
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(previewTop, 700, '编辑区滚动带动预览');
  // 单向同步：在预览（编译）区滚动，编辑区不被反向带动（参考编辑器同款，
  // 消除双向回声拉扯）；预览自己的位置保持不变。
  previewTop = 1050;
  frame.contentWindow.dispatchEvent(new w.Event('scroll'));
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(editorTop, 400, '预览区滚动不反写编辑区');
  assert.equal(previewTop, 1050, '预览滚动位置保持');
  // 触发重新渲染后，预览按编辑区的位置重新对齐，不得跳回最前端。
  field.value = '第一段改了一点\\n\\n第二段\\n\\n第三段';
  field.dispatchEvent(new w.Event('input'));
  await new Promise((resolve) => setTimeout(resolve, 260));
  const renderedDoc = frame.contentDocument;
  if (!renderedDoc.scrollingElement) {
    Object.defineProperty(renderedDoc, 'scrollingElement', { configurable: true, get: () => renderedDoc.documentElement });
  }
  metric(renderedDoc.scrollingElement, 1600, 200, () => previewTop, (value) => { previewTop = value; });
  frame.dispatchEvent(new w.Event('load'));
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(previewTop, 700, '重新渲染后预览按编辑区对齐，不跳回顶部');
  editor.window.close();
});

test('Shift+ArrowUp opens a searchable LaTeX symbol picker and inserts at the saved caret', async () => {
  const editor = new JSDOM(await readFile('source/admin/index.html', 'utf8'), {
    url: 'https://preview.example/admin/', runScripts: 'outside-only',
  });
  const w = editor.window;
  w.scrollTo = () => {};
  w.fetch = () => { throw new Error('LaTeX picker must not fetch'); };
  w.eval(await readFile('source/admin/preview.js', 'utf8'));
  w.eval(await readFile('source/admin/admin.js', 'utf8'));
  const field = w.document.querySelector('#f-body');
  const picker = w.document.querySelector('#latex-picker');
  const search = w.document.querySelector('#latex-symbol-search');
  const openWithShortcut = () => {
    field.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true, cancelable: true }));
  };
  const searchFor = (query) => {
    search.value = query;
    search.dispatchEvent(new w.Event('input', { bubbles: true }));
    return [...w.document.querySelectorAll('#latex-symbol-grid .latex-symbol-card')];
  };

  assert.ok(w.document.querySelector('#insert-latex-symbol'), '工具栏有 LaTeX 符号入口');
  field.value = '公式：$$';
  field.focus();
  field.setSelectionRange(4, 4);
  field.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
  assert.equal(picker.hidden, true, '普通上箭头不打开符号搜索');
  openWithShortcut();
  assert.equal(picker.hidden, false, 'Shift+上箭头打开符号搜索');

  let cards = searchFor('正负');
  assert.equal(w.document.querySelector('#latex-symbol-command').textContent, '\\pm', '中文别名「正负」应找到 \\pm');
  assert.ok(cards.length >= 1);
  search.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  assert.equal(picker.hidden, true, 'Enter 插入后关闭');
  assert.equal(field.value, '公式：$\\pm$', '符号插回打开面板前的光标处');
  assert.deepEqual(JSON.parse(w.localStorage.getItem('minxi:latex-recent')), ['\\pm'], '最近使用会被记住');

  field.setSelectionRange(field.value.length, field.value.length);
  openWithShortcut();
  cards = searchFor('分数');
  assert.equal(w.document.querySelector('#latex-symbol-command').textContent, '\\frac{}{}', '搜「分数」优先给出分式模板');
  search.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  assert.ok(field.value.endsWith('\\frac{}{}$$') || field.value.includes('\\frac{}{}'), '分式模板已插入');
  const fracAt = field.value.indexOf('\\frac{}{}');
  assert.equal(field.selectionStart, fracAt + 6, '插入分式后光标落在第一个花括号里');

  field.value = 'A选中的文字B';
  field.setSelectionRange(1, 6);
  openWithShortcut();
  searchFor('积分');
  assert.equal(w.document.querySelector('#latex-symbol-command').textContent, '\\int_{}^{}', '搜「积分」给出带上下限的积分模板');
  const beforeCancel = field.value;
  search.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(picker.hidden, true, 'Esc 关闭符号搜索');
  assert.equal(field.value, beforeCancel, 'Esc 取消时不修改正文');
  assert.equal(field.selectionStart, 1, '取消后恢复原选区起点');
  assert.equal(field.selectionEnd, 6, '取消后恢复原选区终点');

  // 纯净模式里 Esc 应先关符号面板，不能顺手退出纯净模式。
  w.document.querySelector('[data-editor-mode="zen"]').click();
  field.focus();
  openWithShortcut();
  assert.equal(picker.hidden, false);
  search.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(picker.hidden, true);
  assert.equal(w.document.querySelector('#writing-workspace').dataset.mode, 'zen', '关符号面板后仍留在纯净模式');
  editor.window.close();
});

test('admin writes dragged graph positions back into the matching graph fence', async () => {
  const editor = new JSDOM(await readFile('source/admin/index.html', 'utf8'), {
    url: 'https://preview.example/admin/', runScripts: 'outside-only',
  });
  const w = editor.window;
  w.scrollTo = () => {};
  w.fetch = () => { throw new Error('Graph position commit must not fetch'); };
  w.eval(await readFile('source/admin/preview.js', 'utf8'));
  w.eval(await readFile('source/admin/admin.js', 'utf8'));
  const field = w.document.querySelector('#f-body');
  const frame = w.document.querySelector('#post-preview');
  field.value = [
    '第一段',
    '',
    '```graph',
    'node: A ; x=0 ; y=0',
    'node: B ; x=100 ; y=0',
    'edge: A - B',
    '```',
    '',
    '```graph',
    'node: A ; label=起点 ; color=red',
    'edge: A - C',
    '```',
  ].join('\n');
  field.dispatchEvent(new w.Event('input'));
  await new Promise((resolve) => setTimeout(resolve, 260));
  frame.dispatchEvent(new w.Event('load'));
  const doc = frame.contentDocument;
  const fire = (detail) => {
    doc.dispatchEvent(new frame.contentWindow.CustomEvent('minxi:graph-positions', { detail }));
  };
  fire({ graphIndex: 1, reset: false, positions: { A: { x: 12.5, y: -3 }, C: { x: 40, y: 50 } } });
  assert.match(field.value, /node: A ; label=起点 ; color=red ; x=12\.5 ; y=-3/, '已有 node 行保留其它选项并写回坐标');
  assert.match(field.value, /node: C ; x=40 ; y=50/, '边里隐式出现的点补一行坐标');
  assert.match(field.value, /node: A ; x=0 ; y=0/, '第一张图的源码不被改动');
  fire({ graphIndex: 1, reset: true, positions: {} });
  assert.doesNotMatch(field.value.split('```graph')[2], /x=|y=/, '重置会删掉该图的 x/y 坐标恢复自动布局');
  editor.window.close();
});

test('editor-lead scrolling syncs the preview and re-render does not jump to the top', async () => {
  const editor = new JSDOM(await readFile('source/admin/index.html', 'utf8'), {
    url: 'https://preview.example/admin/', runScripts: 'outside-only',
  });
  const w = editor.window;
  w.scrollTo = () => {};
  w.fetch = () => { throw new Error('Scroll sync must not fetch'); };
  w.eval(await readFile('source/admin/preview.js', 'utf8'));
  w.eval(await readFile('source/admin/admin.js', 'utf8'));
  const field = w.document.querySelector('#f-body');
  const frame = w.document.querySelector('#post-preview');
  field.value = '第一段\n\n第二段\n\n第三段';
  field.dispatchEvent(new w.Event('input'));
  await new Promise((resolve) => setTimeout(resolve, 260));
  frame.dispatchEvent(new w.Event('load'));
  const metric = (element, height, client, get, set) => {
    Object.defineProperties(element, {
      scrollHeight: { configurable: true, get: () => height },
      clientHeight: { configurable: true, get: () => client },
      scrollTop: { configurable: true, get, set },
    });
  };
  let editorTop = 0;
  let previewTop = 0;
  metric(field, 1000, 200, () => editorTop, (value) => { editorTop = value; });
  field.style.paddingBottom = '0px'; // 本用例的几何不含文末留白；留白排除另有专门用例
  const doc = frame.contentDocument;
  if (!doc.scrollingElement) {
    Object.defineProperty(doc, 'scrollingElement', { configurable: true, get: () => doc.documentElement });
  }
  metric(doc.scrollingElement, 1600, 200, () => previewTop, (value) => { previewTop = value; });

  // 在编辑区滚到一半：预览必须被带到对应位置（此前报修编辑侧不起效）。
  editorTop = 400;
  field.dispatchEvent(new w.Event('scroll'));
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(previewTop, 700, '编辑区滚动应带动预览同步到对应位置');

  // 继续输入触发重新渲染：编辑区是主导侧，预览仍停在对应位置，不得跳回最前端。
  field.value = '第一段改了一点\n\n第二段\n\n第三段';
  field.dispatchEvent(new w.Event('input'));
  await new Promise((resolve) => setTimeout(resolve, 260));
  const renderedDoc = frame.contentDocument;
  if (!renderedDoc.scrollingElement) {
    Object.defineProperty(renderedDoc, 'scrollingElement', { configurable: true, get: () => renderedDoc.documentElement });
  }
  metric(renderedDoc.scrollingElement, 1600, 200, () => previewTop, (value) => { previewTop = value; });
  frame.dispatchEvent(new w.Event('load'));
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(previewTop, 700, '编辑区主导时重新渲染后预览不回顶部');
  editor.window.close();
});

test('editor can scroll past the end until the last line reaches the top', async () => {
  const editor = new JSDOM(await readFile('source/admin/index.html', 'utf8'), {
    url: 'https://preview.example/admin/', runScripts: 'outside-only',
  });
  const w = editor.window;
  w.scrollTo = () => {};
  w.fetch = () => { throw new Error('Editor overscroll must not fetch'); };
  w.eval(await readFile('source/admin/preview.js', 'utf8'));
  w.eval(await readFile('source/admin/admin.js', 'utf8'));
  const field = w.document.querySelector('#f-body');
  field.value = '第一行\n最后一行';
  field.style.fontSize = '10px';
  field.style.lineHeight = '20px';
  field.style.paddingTop = '10px';
  Object.defineProperty(field, 'clientHeight', { configurable: true, get: () => 400 });

  w.dispatchEvent(new w.Event('resize'));
  assert.equal(field.style.paddingBottom, '370px', '底部只加显示留白：编辑区高 - 顶部内边距 - 一行高');
  assert.equal(field.value, '第一行\n最后一行', '滑过文末靠留白实现，不往正文里塞空行');

  // 编辑区变矮（切模式/移动端）时留白跟着重算，最后一行始终能到顶部。
  Object.defineProperty(field, 'clientHeight', { configurable: true, get: () => 220 });
  w.dispatchEvent(new w.Event('resize'));
  assert.equal(field.style.paddingBottom, '190px', '高度变化后文末留白同步重算');
  editor.window.close();
});

test('overscroll blank space is excluded from scroll sync percentages', async () => {
  const editor = new JSDOM(await readFile('source/admin/index.html', 'utf8'), {
    url: 'https://preview.example/admin/', runScripts: 'outside-only',
  });
  const w = editor.window;
  w.scrollTo = () => {};
  w.fetch = () => { throw new Error('Scroll sync must not fetch'); };
  w.eval(await readFile('source/admin/preview.js', 'utf8'));
  w.eval(await readFile('source/admin/admin.js', 'utf8'));
  const field = w.document.querySelector('#f-body');
  const frame = w.document.querySelector('#post-preview');
  field.value = '第一段\n\n第二段\n\n第三段';
  field.dispatchEvent(new w.Event('input'));
  await new Promise((resolve) => setTimeout(resolve, 260));
  frame.dispatchEvent(new w.Event('load'));
  const metric = (element, height, client, get, set) => {
    Object.defineProperties(element, {
      scrollHeight: { configurable: true, get: () => height },
      clientHeight: { configurable: true, get: () => client },
      scrollTop: { configurable: true, get, set },
    });
  };
  let editorTop = 0;
  let previewTop = 0;
  // 物理可滚范围 1200 = 正文 830 + 文末留白 370（编辑区高 200 时留白约一屏）。
  metric(field, 1400, 200, () => editorTop, (value) => { editorTop = value; });
  field.style.paddingBottom = '370px';
  const doc = frame.contentDocument;
  if (!doc.scrollingElement) {
    Object.defineProperty(doc, 'scrollingElement', { configurable: true, get: () => doc.documentElement });
  }
  metric(doc.scrollingElement, 1600, 200, () => previewTop, (value) => { previewTop = value; });

  // 正文滚到一半（415 / 830）：预览必须到一半，而不是被留白稀释到 415/1200。
  editorTop = 415;
  field.dispatchEvent(new w.Event('scroll'));
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(previewTop, 700, '百分比按正文范围算，不含文末留白');

  // 继续滑进留白区（正文早已到底）：预览停在底部，不需要把最后一行拉到最顶端才翻完。
  editorTop = 1200;
  field.dispatchEvent(new w.Event('scroll'));
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(previewTop, 1400, '留白行程被钳到文末，预览直接到底');
  editor.window.close();
});

test('fold boxes and graphs align as whole blocks during scroll sync', async () => {
  const editor = new JSDOM(await readFile('source/admin/index.html', 'utf8'), {
    url: 'https://preview.example/admin/', runScripts: 'outside-only',
  });
  const w = editor.window;
  w.scrollTo = () => {};
  w.fetch = () => { throw new Error('Scroll sync must not fetch'); };
  w.eval(await readFile('source/admin/preview.js', 'utf8'));
  w.eval(await readFile('source/admin/admin.js', 'utf8'));
  // 镜像层每行 24px：用行号在兄弟中的序号模拟 offsetTop（JSDOM 无布局）。
  Object.defineProperty(w.HTMLElement.prototype, 'offsetTop', {
    configurable: true,
    get() {
      const parent = this.parentElement;
      if (parent?.getAttribute?.('aria-hidden') === 'true') {
        const index = [...parent.children].indexOf(this);
        if (index >= 0) return index * 24;
      }
      return 0;
    },
  });
  const field = w.document.querySelector('#f-body');
  const frame = w.document.querySelector('#post-preview');
  const md = '段一\n\n:::info[提示]\n内部甲\n\n内部乙\n:::\n\n```graph\nnode: A\nedge: A - A\n```\n\n尾段';
  field.value = md;
  field.dispatchEvent(new w.Event('input'));
  await new Promise((resolve) => setTimeout(resolve, 260));
  const metric = (element, height, client, get, set) => {
    Object.defineProperties(element, {
      scrollHeight: { configurable: true, get: () => height },
      clientHeight: { configurable: true, get: () => client },
      scrollTop: { configurable: true, get, set },
    });
  };
  let editorTop = 0;
  let previewTop = 0;
  metric(field, 336, 100, () => editorTop, (value) => { editorTop = value; });
  field.style.paddingBottom = '0px';
  const doc = frame.contentDocument;
  doc.body.innerHTML = '<h1>未命名文章</h1><p class="article-description"></p><div class="article-content">'
    + '<p data-source-line="1" data-source-end-line="2">段一</p>'
    + '<details class="fold-box" data-source-line="3" data-source-end-line="8"><summary>提示</summary><div class="fold-box-body">'
    + '<p data-source-line="4" data-source-end-line="5">内部甲</p><p data-source-line="6" data-source-end-line="7">内部乙</p></div></details>'
    + '<figure class="md-graph" data-source-line="9" data-source-end-line="13"></figure>'
    + '<p data-source-line="14" data-source-end-line="15">尾段</p></div>';
  if (!doc.scrollingElement) {
    Object.defineProperty(doc, 'scrollingElement', { configurable: true, get: () => doc.documentElement });
  }
  metric(doc.scrollingElement, 1000, 200, () => previewTop, (value) => { previewTop = value; });
  const place = (selector, top, height) => {
    const el = doc.querySelector(selector);
    el.__pv = top; el.__h = height;
    return el;
  };
  place('.article-content > p', 0, 24);
  const fold = place('.fold-box', 48, 56);
  place('.md-graph', 200, 480);
  doc.defaultView.HTMLElement.prototype.getBoundingClientRect = function rect() {
    return {
      top: (this.__pv || 0) - previewTop, bottom: (this.__pv || 0) - previewTop + (this.__h || 0),
      height: this.__h || 0, left: 0, right: 100, width: 100, x: 0, y: (this.__pv || 0) - previewTop, toJSON() {},
    };
  };

  // 编辑位置落在折叠框源码内部（第 5 行）：折叠状态下预览应停在折叠框顶部，
  // 而不是按几十行源码摊到那一行高上慢慢爬。
  editorTop = 96;
  field.dispatchEvent(new w.Event('scroll'));
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(previewTop, 48, '折叠框未展开时整块对齐到块顶');

  // 编辑位置落在 graph 源码内部：预览停在图块顶部，不按源码行快速划过整张图。
  editorTop = 210;
  field.dispatchEvent(new w.Event('scroll'));
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(previewTop, 200, '关系图整块对齐到块顶');

  // 折叠框展开后改用内部块锚点：编辑到内部第一块时对齐到该块。
  fold.open = true;
  fold.__h = 200;
  place('.fold-box-body > p', 104, 40);
  editorTop = 72;
  field.dispatchEvent(new w.Event('scroll'));
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(previewTop, 104, '折叠框展开时按内部块对齐');
  editor.window.close();
});

test('editor guide is folded and visibility uses pin-style toggle buttons', async () => {
  const html = await readFile('source/admin/index.html', 'utf8');
  assert.match(html, /<details class="editor-guide">/, '写作介绍应放进折叠框');
  assert.ok(!/<details class="editor-guide" open/.test(html), '介绍折叠框默认收起');
  assert.equal(html.includes('id="f-visibility"'), false, '可见性不再用下拉框');
  assert.ok(html.includes('data-visibility="public"') && html.includes('data-visibility="private"'), '可见性是公开/私密按钮组');
  const editor = new JSDOM(html, { url: 'https://preview.example/admin/', runScripts: 'outside-only' });
  const w = editor.window;
  w.scrollTo = () => {};
  w.fetch = () => { throw new Error('Visibility toggle must not fetch'); };
  w.eval(await readFile('source/admin/preview.js', 'utf8'));
  w.eval(await readFile('source/admin/admin.js', 'utf8'));
  const priv = w.document.querySelector('[data-visibility="private"]');
  const pub = w.document.querySelector('[data-visibility="public"]');
  assert.equal(pub.getAttribute('aria-pressed'), 'true', '默认公开');
  priv.click();
  assert.equal(priv.getAttribute('aria-pressed'), 'true', '点私密后按钮选中');
  assert.equal(pub.getAttribute('aria-pressed'), 'false');
  assert.match(w.document.querySelector('#visibility-hint').textContent, /私密/, '私密说明跟随按钮状态');
  assert.match(w.document.querySelector('#url-preview').textContent, /私密文章/, '私密时发布地址提示同步更新');
  pub.click();
  assert.equal(pub.getAttribute('aria-pressed'), 'true', '可切回公开');
  editor.window.close();
});
