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

window.MinxiPreview = {
  document({ title = '', description = '', body = '', openFolds = [], plotViews = [], graphViews = [] }) {
    // Sanitize before inserting. The sandboxed iframe also blocks scripts, forms
    // and all active content. Same-origin is allowed only for local CSS/fonts;
    // NEVER add allow-scripts to the iframe sandbox.
    const fragment = DOMPurify.sanitize(markdown.parse(body), {
      RETURN_DOM_FRAGMENT: true,
      ADD_TAGS: ['annotation'], FORBID_TAGS: ['style', 'iframe', 'form', 'input'],
      FORBID_ATTR: ['id', 'name'],
    });
    // 给每个顶层块标上它在 Markdown 源码里的起始行号，供后台编辑器做
    // 「源码行 ↔ 预览块」的锚点滚动同步（参考行锚点同步法：两边按内容对齐，
    // 而不是按总高度百分比硬拉，所以长图/表格/代码块也不会错位抖动）。
    try {
      const sourceLines = [];
      let line = 1;
      for (const token of markdown.lexer(body)) {
        const raw = token.raw || '';
        if (token.type !== 'space' && token.type !== 'def') sourceLines.push(line);
        line += (raw.match(/\n/g) || []).length;
      }
      [...fragment.children].forEach((el, index) => {
        if (sourceLines[index]) el.dataset.sourceLine = String(sourceLines[index]);
      });
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
    const wrapper = document.createElement('div');
    wrapper.append(fragment);
    const content = wrapper.innerHTML;
    // 预览跟随后台当前主题（深/浅），网格等主题变量随之切换，与正式页一致。
    const themeAttr = document.documentElement?.dataset?.theme === 'light' ? ' data-theme="light"' : '';
    return `<!doctype html><html lang="zh-CN"${themeAttr}><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src https: data:;">
      <base href="${escape(location.origin)}/">
      <link rel="stylesheet" href="/css/main.css?v=graph-adjust-2">
      <link rel="stylesheet" href="/vendor/katex/katex.min.css">
      <style>body{padding:24px;background:var(--bg);overflow-wrap:anywhere}h1{font-size:28px;line-height:1.4;margin:0 0 12px}.article-content{min-width:0}.article-description{margin-bottom:24px}.preview-empty{color:var(--muted)}</style>
      <title>文章预览</title></head><body>
      <h1>${escape(title || '未命名文章')}</h1>
      <p class="article-description">${escape(description)}</p>
      <div class="article-content">${content || '<p class="preview-empty">在左侧输入正文，即可看到预览。</p>'}</div>
      </body></html>`;
  },
  // 由后台父页面在预览 iframe 每次加载后调用：iframe 内部不执行任何脚本，
  // 拖动/缩放/读数的监听器全部由父页面挂到 iframe 文档上（同源才可访问）。
  enhance(root) {
    if (root) window.MinxiPlots?.initPlots(root);
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
