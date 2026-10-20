import { Marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import DOMPurify from 'dompurify';
import foldContainers from '../lib/fold-containers.cjs';
import plotExtensions from '../lib/plots.cjs';
import options from '../lib/math-options.cjs';

const markdown = new Marked({ gfm: true, breaks: true }, markedKatex(options), foldContainers(), plotExtensions());
const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);

window.MinxiPreview = {
  document({ title = '', description = '', body = '', openFolds = [] }) {
    // Sanitize before inserting. The sandboxed iframe also blocks scripts, forms
    // and all active content. Same-origin is allowed only for local CSS/fonts;
    // NEVER add allow-scripts to the iframe sandbox.
    const fragment = DOMPurify.sanitize(markdown.parse(body), {
      RETURN_DOM_FRAGMENT: true,
      ADD_TAGS: ['annotation'], FORBID_TAGS: ['style', 'iframe', 'form', 'input'],
      FORBID_ATTR: ['id', 'name'],
    });
    // Native <details> remains clickable in the script-free iframe. Give each
    // fold a stable key so the editor can preserve its state across live updates.
    const opened = new Set(openFolds);
    const occurrences = new Map();
    fragment.querySelectorAll('details.fold-box').forEach((fold) => {
      const label = fold.querySelector(':scope > summary')?.textContent || '';
      const identity = JSON.stringify([fold.className, label]);
      const occurrence = occurrences.get(identity) || 0;
      occurrences.set(identity, occurrence + 1);
      const key = JSON.stringify([identity, occurrence]);
      fold.dataset.previewFoldKey = key;
      if (opened.has(key)) fold.open = true;
    });
    const wrapper = document.createElement('div');
    wrapper.append(fragment);
    const content = wrapper.innerHTML;
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src https: data:;">
      <base href="${escape(location.origin)}/">
      <link rel="stylesheet" href="/css/main.css?v=nav-3">
      <link rel="stylesheet" href="/vendor/katex/katex.min.css">
      <style>body{padding:24px;background:var(--bg);overflow-wrap:anywhere}h1{font-size:28px;line-height:1.4;margin:0 0 12px}.article-content{min-width:0}.article-description{margin-bottom:24px}.preview-empty{color:var(--muted)}</style>
      <title>文章预览</title></head><body>
      <h1>${escape(title || '未命名文章')}</h1>
      <p class="article-description">${escape(description)}</p>
      <div class="article-content">${content || '<p class="preview-empty">在左侧输入正文，即可看到预览。</p>'}</div>
      </body></html>`;
  },
};
