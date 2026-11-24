import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const wait = (ms = 80) => new Promise(resolve => setTimeout(resolve, ms));
async function editor(draft, setup) {
  const html = await readFile('public/editor/index.html', 'utf8');
  const dom = new JSDOM(html, { url: 'https://example.test/editor/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.fetch = () => { throw new Error('Editor must not upload drafts'); };
  w.confirm = () => true;
  setup?.(w);
  if (draft) w.localStorage.setItem('minxi.public.editor.draft', JSON.stringify(draft));
  w.eval(await readFile('source/admin/preview.js', 'utf8'));
  w.eval(await readFile('themes/minxi/source/js/editor.js', 'utf8'));
  await wait();
  return dom;
}
function loadPreview(w) {
  const frame = w.document.querySelector('#public-post-preview');
  assert(frame.srcdoc.includes('article-content'));
  frame.contentDocument.open(); frame.contentDocument.write(frame.srcdoc); frame.contentDocument.close();
  frame.dispatchEvent(new w.Event('load'));
  return frame.contentDocument;
}
test('local editor restores legacy drafts, previews formatted content and keeps local metadata', async () => {
  const dom = await editor({ text: '旧草稿', savedAt: '2020-01-01' });
  const w = dom.window, d = w.document;
  assert.equal(d.querySelector('#public-f-body').value, '旧草稿');
  let doc = loadPreview(w);
  assert(doc.querySelector('.article-content').textContent.includes('旧草稿'));
  d.querySelector('#public-f-title').value = '新标题';
  d.querySelector('#public-f-title').dispatchEvent(new w.Event('input'));
  d.querySelector('#public-f-description').value = '摘要';
  const body = d.querySelector('#public-f-body');
  body.value = '设 $B=\n\\begin{bmatrix}\n1&1\\\\\n1&0\n\\end{bmatrix}$。\n\n:::info[提示]\n内容\n:::';
  body.dispatchEvent(new w.Event('input'));
  await wait();
  doc = d.querySelector('#public-post-preview').contentDocument;
  assert.equal(doc.querySelectorAll('.katex-error').length, 0);
  assert(doc.querySelector('.katex'));
  assert(doc.querySelector('details.fold-box'));
  assert.equal(doc.querySelector('h1').textContent, '新标题');
  assert.equal(doc.querySelector('.article-description').textContent, '摘要');
  d.querySelector('#public-save-post').click();
  const saved = JSON.parse(w.localStorage.getItem('minxi.public.editor.draft'));
  assert.equal(saved.text, body.value); assert.equal(saved.title, '新标题'); assert.equal(saved.description, '摘要');
  assert.equal(d.querySelector('#public-post-preview').getAttribute('sandbox'), 'allow-same-origin');
  dom.window.close();
});
test('insert tools, modes, graph writeback, and clearing draft work without network', async () => {
  const dom = await editor(); const w = dom.window, d = w.document;
  loadPreview(w);
  const body = d.querySelector('#public-f-body');
  d.querySelector('#public-insert-math').click();
  assert(body.value.includes('\\sum')); assert(body.value.includes('\\frac'));
  d.querySelector('[data-editor-mode="edit"]').click();
  assert.equal(d.querySelector('#public-writing-workspace').dataset.mode, 'edit');
  const graph = d.querySelector('#public-insert-graph'); graph.value = 'reader'; graph.dispatchEvent(new w.Event('change'));
  await wait();
  const doc = d.querySelector('#public-post-preview').contentDocument;
  assert(doc.querySelector('.md-graph'));
  doc.dispatchEvent(new w.CustomEvent('minxi:graph-positions', { detail: { graphIndex: 0, positions: { A: { x: 12, y: 23 } } } }));
  assert.match(body.value, /node: A[^\n]*x=12 ; y=23/);
  d.querySelector('#public-save-post').click();
  assert(w.localStorage.getItem('minxi.public.editor.draft').includes('x=12'));
  d.querySelector('#editor-clear-local').click(); await wait();
  assert.equal(body.value, ''); assert.equal(w.localStorage.getItem('minxi.public.editor.draft'), null);
  assert(doc.querySelector('.preview-empty'));
  dom.window.close();
});

test('LaTeX picker filters, navigates and inserts at the saved selection', async () => {
  const dom = await editor(); const w = dom.window, d = w.document;
  loadPreview(w);
  const body = d.querySelector('#public-f-body');
  body.value = '前后'; body.setSelectionRange(1, 1); body.focus();
  body.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true }));
  assert.equal(d.querySelector('#public-latex-picker').hidden, false);
  const search = d.querySelector('#public-latex-symbol-search');
  search.value = 'alpha'; search.dispatchEvent(new w.Event('input'));
  assert(d.querySelector('.latex-symbol-card .katex'));
  search.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.equal(body.value, '前\\alpha后');
  assert.equal(d.querySelector('#public-latex-picker').hidden, true);
  dom.window.close();
});

test('storage failures are reported rather than claiming a successful save', async () => {
  const dom = await editor(); const w = dom.window, d = w.document;
  Object.defineProperty(w.Storage.prototype, 'setItem', { configurable: true, value() { throw new Error('quota'); } });
  d.querySelector('#public-save-post').click();
  assert.match(d.querySelector('#editor-save-status').textContent, /保存失败/);
  dom.window.close();
});

test('public editor has the same adjustable end-of-document overscroll as admin', async () => {
  const dom = await editor(); const w = dom.window, d = w.document;
  const field = d.querySelector('#public-f-body');
  field.value = '第一行\n最后一行';
  field.style.fontSize = '10px'; field.style.lineHeight = '20px'; field.style.paddingTop = '10px';
  Object.defineProperty(field, 'clientHeight', { configurable: true, get: () => 400 });
  w.dispatchEvent(new w.Event('resize'));
  assert.equal(field.style.paddingBottom, '370px');
  assert.equal(field.value, '第一行\n最后一行');
  Object.defineProperty(field, 'clientHeight', { configurable: true, get: () => 220 });
  w.dispatchEvent(new w.Event('resize'));
  assert.equal(field.style.paddingBottom, '190px');
  dom.window.close();
});


test('overscroll recalculates when the editor changes size without a window resize', async () => {
  let notify;
  const dom = await editor(null, (w) => {
    w.ResizeObserver = class { constructor(callback) { notify = callback; } observe() {} };
  });
  const field = dom.window.document.querySelector('#public-f-body');
  field.style.fontSize = '10px'; field.style.lineHeight = '20px'; field.style.paddingTop = '10px';
  Object.defineProperty(field, 'clientHeight', { configurable: true, get: () => 300 });
  notify();
  assert.equal(field.style.paddingBottom, '270px');
  dom.window.close();
});

test('preview scroll cannot pull the public editor into the bottom padding', async () => {
  const dom = await editor(); const w = dom.window, d = w.document;
  const doc = loadPreview(w), field = d.querySelector('#public-f-body');
  field.value = '第一行\n第二行';
  doc.querySelector('.article-content').innerHTML = '<p data-source-line="1" data-source-end-line="2">内容</p>';
  if (!doc.scrollingElement) Object.defineProperty(doc, 'scrollingElement', { configurable: true, get: () => doc.documentElement });
  let editorTop = 200, previewTop = 200;
  Object.defineProperties(field, { scrollHeight: { configurable: true, get: () => 1400 }, clientHeight: { configurable: true, get: () => 400 }, scrollTop: { configurable: true, get: () => editorTop, set: v => { editorTop = v; } } });
  Object.defineProperties(doc.scrollingElement, { scrollHeight: { configurable: true, get: () => 600 }, clientHeight: { configurable: true, get: () => 400 }, scrollTop: { configurable: true, get: () => previewTop, set: v => { previewTop = v; } } });
  field.style.paddingBottom = '350px';
  doc.dispatchEvent(new w.Event('scroll'));
  await wait(100);
  assert.equal(editorTop, 200);
  dom.window.close();
});
