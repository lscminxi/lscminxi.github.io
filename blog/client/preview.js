import { Marked } from 'marked';
import katex from 'katex';
import markedKatex from 'marked-katex-extension';
import DOMPurify from 'dompurify';
import foldContainers from '../lib/fold-containers.cjs';
import plotExtensions from '../lib/plots.cjs';
import options from '../lib/math-options.cjs';
// 函数图像交互（拖动/缩放/坐标读数）。注意：预览 iframe 本身仍然零脚本
// （sandbox 不带 allow-scripts，绝不能加），交互是由后台父页面把监听器
// 挂到 iframe 的文档上完成的，见下面的 enhance()。
import './plot.js';

const markdown = new Marked({ gfm: true, breaks: true }, markedKatex(options), foldContainers(), plotExtensions());
const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);

// 增量更新时图块的「源码签名」：交互层（工具栏/读数/缩放状态）会改动 figure
// 内部 DOM，不能拿 outerHTML 直接比。用 WeakMap 在增强前记下每个 figure 的
// 原始签名，源码没变就整块保留，连拖到一半的点位、缩放范围都不会被刷新掉。
const figureSignatures = new WeakMap();
const figureSignature = (figure) => {
  const clone = figure.cloneNode(true);
  [...clone.attributes]
    .filter((attr) => attr.name.startsWith('data-view-'))
    .forEach((attr) => clone.removeAttribute(attr.name));
  clone.querySelectorAll('[data-preview-viewbox]')
    .forEach((node) => node.removeAttribute('data-preview-viewbox'));
  return clone.outerHTML;
};
const registerFigureSignatures = (root) => {
  root.querySelectorAll('.md-plot, .md-graph').forEach((figure) => {
    if (!figureSignatures.has(figure)) {
      try { figureSignatures.set(figure, figureSignature(figure)); } catch { /* 忽略 */ }
    }
  });
};

window.MinxiPreview = {
  // 把 Markdown 渲染成可插入的 DOM 片段（document 全页与 patch 增量共用）。
  buildFragment({ body = '', openFolds = [], plotViews = [], graphViews = [] } = {}) {
    // Sanitize before inserting. The sandboxed iframe also blocks scripts, forms
    // and all active content. Same-origin is allowed only for local CSS/fonts;
    // NEVER add allow-scripts to the iframe sandbox.
    const fragment = DOMPurify.sanitize(markdown.parse(body), {
      RETURN_DOM_FRAGMENT: true,
      ADD_TAGS: ['annotation'], FORBID_TAGS: ['style', 'iframe', 'form', 'input'],
      FORBID_ATTR: ['id', 'name'],
    });
    // 给每个块标上它在 Markdown 源码里的起止行号，供后台编辑器做「源码行 ↔
    // 预览块」的块级滚动同步：普通块、折叠框（展开时含内部块）、函数图与
    // 关系图都按块内行位置比例映射到渲染高度，滚动时缓慢下移对齐。
    try {
      // 按 token 标注行号有两个坑，都不能靠「第几个 token 对第几个元素」硬对：
      // 1) 有些 token 不产生 DOM（被净化掉的 HTML、注释），占下标会让后面全错位；
      // 2) 链接定义会被 lexer 整段吞掉、不出现在任何 token.raw 里，靠累加
      //    raw 的行数会少算。所以：行号 = 在原文里顺序定位 token.raw 出现
      //    位置数出来的行；每个 token 实际产出了几个顶层元素，就标几个。
      const producedCountCache = new Map();
      const producedCount = (token) => {
        const raw = token.raw || '';
        if (producedCountCache.has(raw)) return producedCountCache.get(raw);
        let count = 1;
        try {
          const sub = DOMPurify.sanitize(markdown.parse(raw), {
            RETURN_DOM_FRAGMENT: true,
            ADD_TAGS: ['annotation'],
            FORBID_TAGS: ['style', 'iframe', 'form', 'input'],
            FORBID_ATTR: ['id', 'name'],
          });
          count = (sub.children ? [...sub.children] : [...sub.childNodes].filter((node) => node.nodeType === 1)).length;
        } catch { /* 退回按 1 个元素标 */ }
        if (producedCountCache.size > 400) producedCountCache.clear();
        producedCountCache.set(raw, count);
        return count;
      };
      const stampTokenBlocks = (elements, tokens, sourceText, firstLine) => {
        let index = 0;
        let cursor = 0;
        let cursorLine = firstLine;
        for (const token of tokens) {
          const raw = token.raw || '';
          if (!raw) continue;
          const at = sourceText.indexOf(raw, cursor);
          const startLine = at >= 0
            ? firstLine + ((sourceText.slice(0, at).match(/\n/g) || []).length)
            : cursorLine;
          if (at >= 0) { cursor = at + raw.length; cursorLine = startLine + ((raw.match(/\n/g) || []).length); }
          if (token.type === 'space' || token.type === 'def') continue;
          const occupied = Math.max(1, raw.split('\n').length - (raw.endsWith('\n') ? 1 : 0));
          const count = producedCount(token);
          for (let k = 0; k < count; k += 1) {
            const el = elements[index];
            index += 1;
            if (!el) break;
            el.dataset.sourceLine = String(startLine);
            el.dataset.sourceEndLine = String(startLine + occupied);
            if (k === 0 && token.type === 'foldContainer' && Array.isArray(token.tokens)) {
              const bodyEl = el.querySelector(':scope > .fold-box-body');
              if (bodyEl) stampTokenBlocks([...bodyEl.children], token.tokens, raw, startLine);
            }
          }
        }
      };
      stampTokenBlocks([...fragment.children], markdown.lexer(body), body, 1);
    } catch { /* 行号只是同步辅助，标不上不影响预览本身 */ }
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
    // 把上次预览里每张函数图的视图（范围 + 坐标/交点开关）写回去，
    // 使实时重渲染后平移/缩放状态不丢失；第几张图对第几个视图，按出现顺序。
    fragment.querySelectorAll('.md-plot').forEach((figure, index) => {
      const view = plotViews[index];
      if (!view) return;
      const set = (name, value) => { if (value !== undefined && value !== null && value !== '') figure.setAttribute(name, String(value)); };
      set('data-view-x-min', view.xMin); set('data-view-x-max', view.xMax);
      set('data-view-y-min', view.yMin); set('data-view-y-max', view.yMax);
      set('data-view-coords', view.coords); set('data-view-intersections', view.intersections);
    });
    fragment.querySelectorAll('.md-graph > svg, .md-graph svg').forEach((svg, index) => {
      if (graphViews[index]) svg.setAttribute('data-preview-viewbox', graphViews[index]);
    });
    // 后台预览专属：图节点可拖动调整，松手后由父页面把坐标写回源码。
    // 这里只打标记，正式文章页没有 data-graph-editable，读者侧不会开启调整。
    fragment.querySelectorAll('.md-graph').forEach((figure, index) => {
      figure.setAttribute('data-graph-editable', 'true');
      figure.setAttribute('data-graph-index', String(index));
    });
    return fragment;
  },
  document({ title = '', description = '', body = '', openFolds = [], plotViews = [], graphViews = [] }) {
    const fragment = window.MinxiPreview.buildFragment({ body, openFolds, plotViews, graphViews });
    const wrapper = document.createElement('div');
    wrapper.append(fragment);
    const content = wrapper.innerHTML;
    // 预览跟随后台当前主题（深/浅），网格等主题变量随之切换，与正式页一致。
    const themeAttr = document.documentElement?.dataset?.theme === 'light' ? ' data-theme="light"' : '';
    return `<!doctype html><html lang="zh-CN"${themeAttr}><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src https: data:;">
      <base href="${escape(location.origin)}/">
      <link rel="stylesheet" href="/css/main.css?v=graph-sync-2">
      <link rel="stylesheet" href="/vendor/katex/katex.min.css">
      <style>body{padding:24px;background:var(--bg);overflow-wrap:anywhere}h1{font-size:33px;line-height:1.55;margin:0 0 12px}.article-content{font-size:16px!important;line-height:2;min-width:0}.article-description{margin-bottom:24px}.preview-empty{color:var(--muted)}</style>
      <title>文章预览</title></head><body>
      <h1>${escape(title || '未命名文章')}</h1>
      <p class="article-description">${escape(description)}</p>
      <div class="article-content">${content || '<p class="preview-empty">在左侧输入正文，即可看到预览。</p>'}</div>
      </body></html>`;
  },
  // 增量更新（照参考编辑器 React 协调的思路）：不重灌整个 iframe 文档，
  // 只按顶层块逐块比对——没变的块原样保留 DOM 节点，变了的块只换它自己
  // 的内容，图块源码没变时整块保留（含交互状态）。这样编辑时预览不闪、
  // 不重载样式与公式字体、滚动位置也天然保留。
  patch(doc, { title = '', description = '', body = '', openFolds = [], plotViews = [], graphViews = [] } = {}) {
    const content = doc?.querySelector?.('.article-content');
    if (!doc || !content) return false;
    const heading = doc.querySelector('h1');
    const nextTitle = title || '未命名文章';
    if (heading && heading.textContent !== nextTitle) heading.textContent = nextTitle;
    const desc = doc.querySelector('.article-description');
    if (desc && desc.textContent !== description) desc.textContent = description;
    const fragment = window.MinxiPreview.buildFragment({ body, openFolds, plotViews, graphViews });
    const fresh = [...fragment.children].map((node) => doc.importNode(node, true));
    if (!fresh.length) {
      if (!content.querySelector('.preview-empty') || content.children.length !== 1) {
        content.innerHTML = '<p class="preview-empty">在左侧输入正文，即可看到预览。</p>';
      }
      return true;
    }
    const morphBlock = (oldEl, newEl) => {
      for (const attr of [...oldEl.attributes]) {
        if (!newEl.hasAttribute(attr.name)) oldEl.removeAttribute(attr.name);
      }
      for (const attr of newEl.attributes) oldEl.setAttribute(attr.name, attr.value);
      if (oldEl.innerHTML !== newEl.innerHTML) oldEl.innerHTML = newEl.innerHTML;
    };
    const live = [...content.children];
    const count = Math.max(live.length, fresh.length);
    for (let i = 0; i < count; i++) {
      const oldEl = live[i];
      const newEl = fresh[i];
      if (!oldEl && newEl) { content.append(newEl); continue; }
      if (oldEl && !newEl) { oldEl.remove(); continue; }
      const isFigure = (el) => el.classList?.contains('md-plot') || el.classList?.contains('md-graph');
      if (isFigure(oldEl) || isFigure(newEl)) {
        // 图块：源码签名一致就整块保留（交互状态不丢），否则只换这张图。
        if (isFigure(oldEl) && isFigure(newEl)
          && figureSignatures.has(oldEl)
          && figureSignatures.get(oldEl) === figureSignature(newEl)) continue;
        oldEl.replaceWith(newEl);
        continue;
      }
      if (oldEl.tagName !== newEl.tagName) { oldEl.replaceWith(newEl); continue; }
      if (oldEl.outerHTML !== newEl.outerHTML) morphBlock(oldEl, newEl);
    }
    return true;
  },
  // 由后台父页面在预览 iframe 每次加载后调用：iframe 内部不执行任何脚本，
  // 拖动/缩放/读数的监听器全部由父页面挂到 iframe 文档上（同源才可访问）。
  enhance(root) {
    if (!root) return;
    registerFigureSignatures(root);
    window.MinxiPlots?.initPlots(root);
  },
  // 后台 LaTeX 符号选择器用：只渲染内置符号目录里的单个公式片段。
  renderLatex(tex) {
    try {
      return katex.renderToString(String(tex || ''), { throwOnError: false, displayMode: false });
    } catch {
      return '';
    }
  },
};
