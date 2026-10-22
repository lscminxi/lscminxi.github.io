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
  metric(previewScroll, 1600, 200, () => previewTop, (value) => { previewTop = value; });

  // 预览块带源码行号，编辑区按行锚点同步（无锚点时才退回比例）。
  const stamped = preview('# 标题\n\n第一段\n\n第二段');
  assert.deepEqual([...stamped.querySelectorAll('.article-content > [data-source-line]')].map((el) => el.dataset.sourceLine), ['1', '3', '5'], '预览顶层块标有源码起始行');
  const adminJs = await readFile('source/admin/admin.js', 'utf8');
  assert.ok(adminJs.includes('buildScrollAnchors') && adminJs.includes('isSyncEcho'), '同步走行锚点并忽略程序赋值的回声滚动');
  assert.ok(adminJs.includes('runQueuedSync') && adminJs.includes('syncFallback'), '编辑侧同步有 rAF + 定时兜底队列，不会丢帧');

  field.dispatchEvent(new w.Event('scroll'));
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(previewTop, 700, '编辑区滚到一半时预览按比例对齐到一半（同步经 rAF 合并）');

  frame.dispatchEvent(new w.Event('load'));
  await new Promise((resolve) => setTimeout(resolve, 90));
  previewTop = 1050;
  frame.contentWindow.dispatchEvent(new w.Event('scroll'));
  await new Promise((resolve) => setTimeout(resolve, 90));
  assert.equal(editorTop, 600, '预览滚动时编辑区也按比例对齐');

  // 重新渲染后按比例恢复预览位置，不回到头。
  previewTop = 1050;
  field.value = '改了一点正文，触发重新渲染';
  field.dispatchEvent(new w.Event('input'));
  await new Promise((resolve) => setTimeout(resolve, 260));
  const renderedDoc = frame.contentDocument;
  if (!renderedDoc.scrollingElement) {
    Object.defineProperty(renderedDoc, 'scrollingElement', { configurable: true, get: () => renderedDoc.documentElement });
  }
  metric(renderedDoc.scrollingElement, 1600, 200, () => previewTop, (value) => { previewTop = value; });
  frame.dispatchEvent(new w.Event('load'));
  assert.equal(previewTop, 1050, '重新渲染后预览停在原来的相对位置，不回头');
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
  assert.match(css, /\.writing-workspace\[data-mode="zen"\] #post-preview \{[^}]*display: none/, '纯净模式隐藏预览区');
  w.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(w.document.querySelector('#writing-workspace').dataset.mode, 'split', 'Esc 退回分屏');
  assert.ok(!w.document.body.classList.contains('zen-editing'));
  assert.equal(field.value, '纯净模式里写的草稿', '退出纯净模式也不丢内容');
  editor.window.close();
});

test('scrolling the preview (compile side) drives the editor and re-render keeps the place', async () => {
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
  const doc = frame.contentDocument;
  if (!doc.scrollingElement) {
    Object.defineProperty(doc, 'scrollingElement', { configurable: true, get: () => doc.documentElement });
  }
  metric(doc.scrollingElement, 1600, 200, () => previewTop, (value) => { previewTop = value; });
  // 在预览（编译）区滚到 75%：编辑区必须被带动到对应位置。
  previewTop = 1050;
  frame.contentWindow.dispatchEvent(new w.Event('scroll'));
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(editorTop, 600, '预览区滚动应带动编辑区同步');
  // 触发重新渲染后，预览仍停在原来的相对位置，不得跳回最前端。
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
  assert.equal(previewTop, 1050, '重新渲染后预览不跳回顶部');
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
