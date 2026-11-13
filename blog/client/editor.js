/*
 * 公开 Markdown 编辑器（所有人可用，保存仅在本地）
 * --------------------------------------------------------------
 * 这个编辑器不对任何人开放写入站点仓库的权限：
 * - 输入内容自动保存到当前浏览器的 localStorage（键 minxi.public.editor.draft）
 * - 关闭/刷新页面后再次打开会恢复草稿
 * - 点「下载 .md」可把源码保存到本地文件
 * - 不会调用 GitHub API，不需要登录，不上传任何内容
 *
 * 预览使用后台同一套 MinxiPreview.buildFragment（window.MinxiPreview），
 * 支持 $$ 公式、```plot 函数图、```graph 关系图、:::info 折叠框等语法。
 *
 * 滚动同步：编辑区与预览区双向按块级锚点分段插值对齐，
 * 仿洛谷编辑器，块内按源码行位置比例缓慢下移，不钉块顶，不跳回。
 */

(() => {
  'use strict';

  const STORAGE_KEY = 'minxi.public.editor.draft';
  const AUTO_SAVE_MS = 800;

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  // ---------------- DOM 元素 ----------------
  const body = $('#public-f-body');
  const previewFrame = $('#public-post-preview');
  const writingWorkspace = $('#public-writing-workspace');
  const saveStatus = $('#editor-save-status');
  const stats = $('#public-editor-stats');
  const toast = $('#public-editor-toast');
  const downloadBtn = $('#editor-download-md');
  const clearBtn = $('#editor-clear-local');
  const saveBtn = $('#public-save-post');

  // ---------------- LaTeX 符号搜索（Shift + ↑） ----------------
  const latexPicker = $('#public-latex-picker');
  const latexPickerBackdrop = $('#public-latex-picker-backdrop');
  const latexSearchInput = $('#public-latex-symbol-search');
  const latexCategoryTabs = $('#public-latex-category-tabs');
  const latexSymbolGrid = $('#public-latex-symbol-grid');
  const latexCommandDisplay = $('#public-latex-symbol-command');
  const latexDetailDisplay = $('#public-latex-symbol-detail');

  const latexCategories = [
    ['structures', '结构'],
    ['greek', '希腊字母'],
    ['operators', '运算'],
    ['relations', '关系'],
    ['sets-logic', '集合与逻辑'],
    ['arrows', '箭头'],
    ['big-operators', '大型运算符'],
    ['functions', '函数'],
    ['misc', '其他'],
  ];

  const latexCategoryName = (id) => latexCategories.find(([key]) => key === id)?.[1] || id;

  const latexAutoPreview = (insert) => {
    const fillers = ['a', 'b', 'c'];
    let used = 0;
    return insert.replace(/\[\]/g, '[n]').replace(/\{\}/g, () => `{${fillers[Math.min(used++, fillers.length - 1)]}}`);
  };

  const latexSymbols = [];
  const addLatexSymbol = (category, command, aliases, options = {}) => {
    if (latexSymbols.some((symbol) => symbol.command === command)) return;
    const insert = options.insert ?? command;
    let cursor = options.cursor;
    if (!cursor && options.cursorAfter) {
      const at = insert.indexOf(options.cursorAfter);
      const pos = at === -1 ? insert.length : at + options.cursorAfter.length;
      cursor = [pos, pos];
    }
    if (!cursor) {
      const braces = insert.indexOf('{}');
      cursor = braces === -1 ? [insert.length, insert.length] : [braces + 1, braces + 1];
    }
    latexSymbols.push({
      category,
      command,
      aliases,
      insert,
      preview: options.preview ?? latexAutoPreview(insert),
      glyph: options.glyph || '',
      cursor,
    });
  };

  const addLatexGroup = (category, entries) => {
    entries.forEach(([command, aliases, options]) => addLatexSymbol(category, command, aliases, options || {}));
  };

  addLatexGroup('structures', [
    ['\\frac{}', ['分数', '分式', '除', '分数线', 'fraction']],
    ['\\dfrac{}', ['大分数', '显示分数', '分数', '分式']],
    ['\\tfrac{}', ['小分数', '分数', '分式']],
    ['\\cfrac{}', ['连分数', '分数', '分式']],
    ['\\sqrt{}', ['根号', '平方根', '开方', '根式', 'sqrt', 'root']],
    ['\\sqrt[n]{}', ['n次根', '立方根', '根号', '开方'], { insert: '\\sqrt[]{}', cursorAfter: '\\sqrt[', preview: '\\sqrt[3]{x}' }],
    ['^{}', ['上标', '次方', '幂', '指数', '平方', 'superscript', 'power'], { preview: 'x^{2}' }],
    ['_{}', ['下标', '角标', '序号', 'subscript'], { preview: 'a_{n}' }],
    ['\\left( \\right)', ['左括号', '圆括号', '括号', '括弧'], { preview: '\\left( x \\right)' }],
    ['\\left[ \\right]', ['方括号', '中括号', '括号'], { preview: '\\left[ x \\right]' }],
    ['\\left\\{ \\right\\}', ['花括号', '大括号', '括号'], { preview: '\\left\\{ x \\right\\}' }],
    ['\\begin{matrix} \\end{matrix}', ['矩阵', '矩阵阵列'], { preview: '\\begin{matrix} a & b \\\\ c & d \\end{matrix}' }],
    ['\\begin{cases} \\end{cases}', ['分段函数', '分段'], { preview: '\\begin{cases} x & \\text{条件} \\\\ y & \\text{条件} \\end{cases}' }],
  ]);

  addLatexGroup('greek', [
    ['\\alpha', ['阿尔法', 'α', 'alpha']],
    ['\\beta', ['贝塔', 'β', 'beta']],
    ['\\gamma', ['伽马', 'γ', 'gamma']],
    ['\\delta', ['德尔塔', 'δ', 'delta']],
    ['\\epsilon', ['艾普西龙', 'ε', 'epsilon']],
    ['\\zeta', ['泽塔', 'ζ', 'zeta']],
    ['\\eta', ['伊塔', 'η', 'eta']],
    ['\\theta', ['西塔', 'θ', 'theta']],
    ['\\iota', ['约塔', 'ι', 'iota']],
    ['\\kappa', ['卡帕', 'κ', 'kappa']],
    ['\\lambda', ['兰姆达', 'λ', 'lambda']],
    ['\\mu', ['缪', 'μ', 'mu']],
    ['\\nu', ['纽', 'ν', 'nu']],
    ['\\xi', ['克西', 'ξ', 'xi']],
    ['\\pi', ['派', 'π', 'pi']],
    ['\\rho', ['罗', 'ρ', 'rho']],
    ['\\sigma', ['西格玛', 'σ', 'sigma']],
    ['\\tau', ['陶', 'τ', 'tau']],
    ['\\upsilon', ['乌普西龙', 'υ', 'upsilon']],
    ['\\phi', ['菲', 'φ', 'phi']],
    ['\\chi', ['卡', 'χ', 'chi']],
    ['\\psi', ['普西', 'ψ', 'psi']],
    ['\\omega', ['欧米伽', 'ω', 'omega']],
    ['\\Alpha', ['大写阿尔法', 'Α', 'Alpha']],
    ['\\Beta', ['大写贝塔', 'Β', 'Beta']],
    ['\\Gamma', ['大写伽马', 'Γ', 'Gamma']],
    ['\\Delta', ['大写德尔塔', 'Δ', 'Delta']],
    ['\\Theta', ['大写西塔', 'Θ', 'Theta']],
    ['\\Lambda', ['大写兰姆达', 'Λ', 'Lambda']],
    ['\\Xi', ['大写克西', 'Ξ', 'Xi']],
    ['\\Pi', ['大写派', 'Π', 'Pi']],
    ['\\Sigma', ['大写西格玛', 'Σ', 'Sigma']],
    ['\\Phi', ['大写菲', 'Φ', 'Phi']],
    ['\\Psi', ['大写普西', 'Ψ', 'Psi']],
    ['\\Omega', ['大写欧米伽', 'Ω', 'Omega']],
  ]);

  addLatexGroup('operators', [
    ['\\pm', ['正负', '正负号', 'plusminus']],
    ['\\mp', ['负正', 'mp']],
    ['\\times', ['乘号', '乘', 'times']],
    ['\\div', ['除号', '除', 'div']],
    ['\\cdot', ['点乘', '点号', 'cdot']],
    ['\\ast', ['星号', '乘号', 'ast']],
    ['\\circ', ['圆点', '圆圈', 'circ']],
    ['\\bullet', ['实心点', 'bullet']],
    ['\\oplus', ['直和', 'oplus']],
    ['\\otimes', ['张量积', 'otimes']],
    ['\\propto', ['成正比', 'propto']],
    ['\\simeq', ['约等于', 'simeq']],
    ['\\approx', ['约等于', 'approx']],
    ['\\cong', ['全等', 'cong']],
    ['\\equiv', ['恒等于', 'equiv']],
  ]);

  addLatexGroup('relations', [
    ['\\leq', ['小于等于', 'leq']],
    ['\\geq', ['大于等于', 'geq']],
    ['\\ll', ['远小于', 'll']],
    ['\\gg', ['远大于', 'gg']],
    ['\\prec', ['preceding', 'prec']],
    ['\\succ', ['succeeding', 'succ']],
    ['\\sim', ['相似', 'sim']],
    ['\\perp', ['垂直', 'perp']],
    ['\\parallel', ['平行', 'parallel']],
    ['\\mid', ['整除', 'mid']],
    ['\\nmid', ['不整除', 'nmid']],
  ]);

  addLatexGroup('sets-logic', [
    ['\\in', ['属于', 'in', '元素']],
    ['\\notin', ['不属于', 'notin']],
    ['\\subset', ['真子集', 'subset']],
    ['\\subseteq', ['子集', 'subseteq']],
    ['\\supset', ['真父集', 'supset']],
    ['\\supseteq', ['父集', 'supseteq']],
    ['\\cup', ['并集', 'cup', ' union']],
    ['\\cap', ['交集', 'cap', ' intersection']],
    ['\\emptyset', ['空集', 'emptyset', '空集符号']],
    ['\\forall', ['全称量词', 'forall', '对任意']],
    ['\\exists', ['存在量词', 'exists', '存在']],
    ['\\nexists', ['不存在', 'nexists']],
    ['\\land', ['逻辑与', 'and', 'wedge']],
    ['\\lor', ['逻辑或', 'or', 've']],
    ['\\lnot', ['逻辑非', 'not', 'neg']],
    ['\\implies', ['蕴含', 'implies', '如果那么']],
    ['\\iff', ['当且仅当', 'iff', 'equivalent']],
  ]);

  addLatexGroup('arrows', [
    ['\\to', ['箭头', 'to', 'rightarrow']],
    ['\\rightarrow', ['右箭头', 'rightarrow']],
    ['\\leftarrow', ['左箭头', 'leftarrow']],
    ['\\Rightarrow', ['蕴含箭头', 'Rightarrow']],
    ['\\Leftarrow', ['左蕴含', 'Leftarrow']],
    ['\\leftrightarrow', ['双向箭头', 'leftrightarrow']],
    ['\\Leftrightarrow', ['等价箭头', 'Leftrightarrow']],
    ['\\mapsto', ['映射', 'mapsto']],
    ['\\uparrow', ['上箭头', 'uparrow']],
    ['\\downarrow', ['下箭头', 'downarrow']],
    ['\\updownarrow', ['上下箭头', 'updownarrow']],
  ]);

  addLatexGroup('big-operators', [
    ['\\sum', ['求和', 'sigma', 'summation']],
    ['\\prod', ['连乘', 'product', 'prod']],
    ['\\int', ['积分', 'integral', 'int']],
    ['\\iint', ['二重积分', 'iint']],
    ['\\iiint', ['三重积分', 'iiint']],
    ['\\oint', ['闭合积分', 'oint']],
    ['\\bigcap', ['大交集', 'bigcap']],
    ['\\bigcup', ['大并集', 'bigcup']],
    ['\\bigwedge', ['大合取', 'bigwedge']],
    ['\\bigvee', ['大析取', 'bigvee']],
  ]);

  addLatexGroup('functions', [
    ['\\sin', ['正弦', 'sin']],
    ['\\cos', ['余弦', 'cos']],
    ['\\tan', ['正切', 'tan']],
    ['\\arcsin', ['反正弦', 'arcsin']],
    ['\\arccos', ['反余弦', 'arccos']],
    ['\\arctan', ['反正切', 'arctan']],
    ['\\sinh', ['双曲正弦', 'sinh']],
    ['\\cosh', ['双曲余弦', 'cosh']],
    ['\\tanh', ['双曲正切', 'tanh']],
    ['\\exp', ['指数函数', 'exp']],
    ['\\ln', ['自然对数', 'ln', 'log']],
    ['\\log', ['对数', 'log']],
    ['\\lim', ['极限', 'lim']],
    ['\\partial', ['偏导数', 'partial']],
    ['\\nabla', ['纳布拉', 'nabla', '梯度']],
  ]);

  addLatexGroup('misc', [
    ['\\infty', ['无穷大', 'infty', '无限']],
    ['\\aleph', [' aleph', 'aleph']],
    ['\\prime', ['素数', 'prime', '派生']],
    ['\\nabla', ['倒三角', 'nabla']],
    ['\\angle', ['角度', 'angle']],
    ['\\measuredangle', ['测量角', 'measuredangle']],
    ['\\degree', ['度数', '度']],
    ['\\neg', ['否定', 'neg']],
    ['\\top', ['真', 'top']],
    ['\\bot', ['假', 'bottom', 'bot']],
  ]);

  let latexPickerSelection = null;
  let latexPickerCategory = 'all';
  let latexPickerActive = 0;
  let latexPickerResults = [];

  const currentLatexResults = () => {
    if (latexPickerCategory === 'recent') return [];
    if (latexPickerCategory === 'all') return [...latexSymbols];
    return latexSymbols.filter((symbol) => symbol.category === latexPickerCategory);
  };

  const renderLatexPicker = () => {
    latexCategoryTabs.innerHTML = '';
    const seenCategories = new Set();
    latexSymbols.forEach((symbol) => {
      const category = symbol.category;
      if (seenCategories.has(category)) return;
      seenCategories.add(category);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'category-tab';
      btn.textContent = latexCategoryName(symbol.category);
      btn.dataset.category = category;
      if (category === latexPickerCategory) {
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
      } else {
        btn.setAttribute('aria-pressed', 'false');
      }
      btn.addEventListener('click', () => {
        latexPickerCategory = category;
        renderLatexPicker();
        renderLatexGrid();
      });
      latexCategoryTabs.append(btn);
    });
  };

  const renderLatexGrid = () => {
    latexPickerResults = currentLatexResults();
    latexPickerActive = 0;
    const q = latexSearchInput.value.trim().toLowerCase();
    let filtered = latexPickerResults;
    if (q) {
      filtered = latexPickerResults.filter((symbol) =>
        symbol.command.toLowerCase().includes(q) ||
        symbol.aliases.some((a) => a.toLowerCase().includes(q))
      );
    }
    latexSymbolGrid.innerHTML = '';
    if (!filtered.length) {
      latexSymbolGrid.className = 'latex-picker-empty';
      latexSymbolGrid.textContent = '没有匹配的符号。';
      return;
    }
    latexSymbolGrid.className = 'latex-symbol-grid';
    filtered.forEach((symbol, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'latex-symbol-btn';
      btn.dataset.latexIndex = index;
      if (index === latexPickerActive) btn.classList.add('active');
      btn.innerHTML = `<div class="latex-command">${escapeHtml(symbol.command)}</div><div class="latex-aliases">${symbol.aliases.slice(0, 3).join(' · ')}</div>`;
      btn.title = symbol.command + ' · ' + symbol.aliases.join(', ');
      btn.addEventListener('click', () => insertLatexSymbol(symbol));
      latexSymbolGrid.append(btn);
    });
    latexCommandDisplay.textContent = filtered[latexPickerActive]?.command || '选择一个符号';
    latexDetailDisplay.textContent = '方向键选择，Enter 或点击插入';
  };

  const escapeHtml = (text) => String(text).replace(/[&<>\"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // ---------------- 辅助：在光标处插入文本 ----------------
  const insertAtCursor = (text) => {
    const start = body.selectionStart ?? body.value.length;
    const end = body.selectionEnd ?? body.value.length;
    const before = body.value.slice(0, start);
    const after = body.value.slice(end);
    body.value = before + text + after;
    const cursorPos = start + text.length;
    body.selectionStart = cursorPos;
    body.selectionEnd = cursorPos;
    body.focus();
    body.dispatchEvent(new window.Event('input', { bubbles: true }));
  };

  const insertLatexSymbol = (symbol) => {
    const start = body.selectionStart ?? body.value.length;
    const end = body.selectionEnd ?? body.value.length;
    const before = body.value.slice(0, start);
    const after = body.value.slice(end);
    body.value = before + symbol.insert + after;
    const cursorPos = start + symbol.cursor[0];
    body.selectionStart = cursorPos;
    body.selectionEnd = start + symbol.cursor[1];
    body.focus();
    body.dispatchEvent(new window.Event('input', { bubbles: true }));
    closeLatexPicker();
  };

  const openLatexPicker = () => {
    latexPickerSelection = {
      start: body.selectionStart ?? body.value.length,
      end: body.selectionEnd ?? body.value.length,
    };
    latexPickerCategory = 'all';
    latexSearchInput.value = '';
    renderLatexPicker();
    renderLatexGrid();
    latexPicker.hidden = false;
    latexPickerBackdrop.hidden = false;
    latexSearchInput.focus();
  };

  const closeLatexPicker = () => {
    latexPicker.hidden = true;
    latexPickerBackdrop.hidden = true;
    body.focus();
  };

  // ---------------- 自动保存 ----------------
  let draftTimer = 0;
  let draftSavedAt = '';

  const loadDraft = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && typeof data.text === 'string') {
          body.value = data.text;
          draftSavedAt = data.savedAt || '';
          return true;
        }
      }
    } catch { /* 忽略 */ }
    return false;
  };

  const saveDraft = () => {
    const text = body.value;
    const data = { text, savedAt: new Date().toISOString() };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      draftSavedAt = data.savedAt;
      saveStatus.textContent = `本地草稿已自动保存（${new Date(data.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}）`;
      saveStatus.hidden = false;
    } catch { /* localStorage 不可用时忽略 */ }
  };

  const scheduleSave = () => {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(saveDraft, AUTO_SAVE_MS);
    updateStats();
  };

  const clearDraft = () => {
    localStorage.removeItem(STORAGE_KEY);
    body.value = '';
    draftSavedAt = '';
    saveStatus.hidden = true;
    updateStats();
    showToast('本地草稿已清除');
  };

  const showToast = (message) => {
    toast.textContent = message;
    toast.hidden = false;
    setTimeout(() => { toast.hidden = true; }, 2500);
  };

  // ---------------- 插入按钮事件 ----------------
  $('#public-insert-math')?.addEventListener('click', () => {
    insertAtCursor("\n\n$$\n\f(n) = \sum_{i=1}^{n} i = \frac{n(n+1)}{2}\n$$\n\n");
  });

  $('#public-insert-latex-symbol')?.addEventListener('click', openLatexPicker);

  $('#public-insert-fold')?.addEventListener('change', (event) => {
    const kind = event.target.value;
    if (kind !== 'info' && kind !== 'success') return;
    const label = kind === 'info' ? '提示' : '成功';
    insertAtCursor("\n\n:::" + kind + "[" + label + "]\n\n在这里写内容，支持 **Markdown** 和 $a_i$ 公式。\n\n:::\n\n");
    event.target.value = '';
  });

  $('#public-insert-plot')?.addEventListener('click', () => {
    insertAtCursor("\n\n```plot\ntitle: 函数图像\nf: x^2 - 2x + 1 ; color=red\nf: -x + 3 ; color=green\npoints: (1, 0), (3, 2) ; connect=true ; color=blue\nx: -3, 5\ncoords: on\nintersections: on\n```\n\n");
  });

  $('#public-insert-graph')?.addEventListener('change', (event) => {
    const mode = ['reader', 'none', 'components', 'bridges', 'mst', 'bipartite', 'vbcc', 'ebcc', 'dfs'].includes(event.target.value) ? event.target.value : '';
    if (!mode) return;
    insertAtCursor("\n\n```graph\ntitle: 示例图\nalgo: " + mode + "\ndirected: true\nnode: A ; label=起点 ; color=red ; weight=6\nnode: B\nnode: C\nedge: A -> B ; label=一步 ; weight=1\nedge: B -> C ; weight=2\nedge: C -[5]- A\n```\n\n");
    event.target.value = '';
  });

  $('#public-insert-image')?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    showToast('公开编辑器不支持图片上传，请手动输入 Markdown 图片语法');
    event.target.value = '';
  });

  $('#public-insert-more')?.addEventListener('click', () => {
    insertAtCursor("\n\n<!-- more -->\n\n");
  });

  // ---------------- 模式切换（编辑 / 分屏 / 预览 / 纯净） ----------------
  const setEditorMode = (mode) => {
    writingWorkspace.dataset.mode = mode;
    document.body.classList.toggle('zen-editing', mode === 'zen');
    $$('[data-editor-mode]').forEach((item) => {
      item.setAttribute('aria-pressed', String(item.dataset.editorMode === mode));
    });
    updateEditorOverscroll();
    queuePreview();
    scrollAnchorsDirty = true;
    scheduleFrame(() => {
      updateEditorOverscroll();
      syncPreviewScroll();
    });
    if (mode === 'zen') body.focus();
  };

  $$('[data-editor-mode]').forEach((button) => {
    button.addEventListener('click', () => setEditorMode(button.dataset.editorMode));
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.body.classList.contains('zen-editing')) {
      setEditorMode('split');
    }
  });



  const updateStats = () => {
    const text = body.value;
    const chars = text.length;
    const lines = text.split('\n').length;
    stats.textContent = `共 ${chars} 字 · ${lines} 行`;
  };

  // ---------------- 滚动同步（双向，仿洛谷编辑器） ----------------
  let scrollAnchorsDirty = true;
  let lineMirror = null;
  let syncRaf = 0;
  let editorSyncRaf = 0;
  let mirrorIdleTimer = 0;
  let syncingPreview = false;
  let syncingEditor = false;
  let previewLoadPending = false;

  const scheduleFrame = (callback) => (window.requestAnimationFrame ? window.requestAnimationFrame(callback) : setTimeout(callback, 16));

  // 允许「滑过文末”：给 textarea 加底部留白，滚到尽头时最后一行正好停在编辑区顶部。
  const updateEditorOverscroll = () => {
    const ta = body;
    if (!ta) return;
    const style = window.getComputedStyle(ta);
    const fontSize = parseFloat(style.fontSize) || 12.5;
    const lineHeight = parseFloat(style.lineHeight) || fontSize * 1.9;
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const height = Number.isFinite(ta.clientHeight) ? ta.clientHeight : 0;
    const bottom = height > 0
      ? Math.max(lineHeight, height - paddingTop - lineHeight)
      : lineHeight;
    ta.style.paddingBottom = `${Math.round(bottom)}px`;
    scrollAnchorsDirty = true;
  };

  const ensureLineMirror = () => {
    if (lineMirror) return lineMirror;
    const mirror = document.createElement('div');
    mirror.setAttribute('aria-hidden', 'true');
    mirror.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;pointer-events:none;';
    document.body.append(mirror);
    lineMirror = mirror;
    return mirror;
  };

  const rebuildLineMirror = () => {
    const ta = body;
    const mirror = ensureLineMirror();
    const style = window.getComputedStyle(ta);
    mirror.style.width = `${ta.clientWidth}px`;
    mirror.style.tabSize = style.tabSize || '2';
    mirror.style.font = style.font;
    mirror.style.lineHeight = style.lineHeight;
    mirror.style.letterSpacing = style.letterSpacing;
    mirror.style.padding = style.padding;
    mirror.style.border = '0';
    mirror.style.boxSizing = 'border-box';
    mirror.style.whiteSpace = style.whiteSpace || 'pre-wrap';
    mirror.style.overflowWrap = style.overflowWrap || 'break-word';
    mirror.style.wordBreak = style.wordBreak || 'normal';
    mirror.textContent = '';
    for (const line of ta.value.split('\n')) {
      const div = document.createElement('div');
      div.textContent = line || '\u200b';
      mirror.append(div);
    }
  };

  const collectScrollAnchors = (doc, scroll) => {
    if (scrollAnchorsDirty) {
      try { rebuildLineMirror(); } catch { /* 镜像不可用时退回比例同步 */ }
      scrollAnchorsDirty = false;
    }
    const anchors = [];
    if (!lineMirror?.children?.length) return anchors;
    const mirrorLineTop = (lineNo) => {
      const kids = lineMirror.children;
      if (lineNo <= 1) return kids[0].offsetTop || 0;
      if (lineNo <= kids.length) return kids[lineNo - 1].offsetTop || 0;
      const last = kids[kids.length - 1];
      return (last.offsetTop || 0) + (last.offsetHeight || 0);
    };
    const mirrorBaseTop = mirrorLineTop(1);
    const isAtomicBlock = (block) => {
      // 独立图片没有可对应的源码内部进度，仍整块对齐。
      return Boolean(block.querySelector?.(':scope > img'));
    };
    for (const block of doc.querySelectorAll('[data-source-line]')) {
      const parentFold = block.parentElement?.closest?.('details.fold-box');
      if (parentFold && !parentFold.open) continue;
      if (!block.classList?.contains('fold-box')
        && block.parentElement?.closest?.('[data-source-line]') && !parentFold) continue;
      const line = Number(block.dataset.sourceLine);
      if (!Number.isInteger(line) || line < 1 || !lineMirror.children[line - 1]) continue;
      const endLine = Number(block.dataset.sourceEndLine) || line + 1;
      const rect = block.getBoundingClientRect();
      const ta = Math.max(0, mirrorLineTop(line) - mirrorBaseTop);
      const pv = rect.top + (scroll.scrollTop || 0);
      if (!Number.isFinite(ta) || !Number.isFinite(pv)) continue;
      const prev = anchors[anchors.length - 1];
      if (prev && (ta <= prev.ta || pv <= prev.pv)) continue;
      anchors.push({
        ta,
        taEnd: Math.max(mirrorLineTop(endLine) - mirrorBaseTop, ta),
        pv,
        pvBottom: pv + Math.max(0, rect.height || 0),
        atomic: isAtomicBlock(block),
      });
    }
    return anchors;
  };

  const syncPreviewScroll = () => {
    if (syncingPreview) return;
    syncingPreview = true;
    try {
      const ta = body;
      const doc = previewFrame.contentDocument;
      const scroll = doc?.scrollingElement;
      if (!doc || !scroll) return;
      if (writingWorkspace?.dataset.mode === 'edit') return;
      const maxPv = scroll.scrollHeight - scroll.clientHeight;
      if (!(maxPv > 0)) return;

      const overscrollBottom = parseFloat(window.getComputedStyle(ta).paddingBottom) || 0;
      const physicalMaxTa = Math.max(0, ta.scrollHeight - ta.clientHeight);
      const effectiveMaxTa = Math.max(0, physicalMaxTa - overscrollBottom);
      if (!(physicalMaxTa > 0)) {
        if (scroll.style) scroll.style.scrollBehavior = 'auto';
        scroll.scrollTop = 0;
        return;
      }

      const anchors = collectScrollAnchors(doc, scroll);
      const rawY = ta.scrollTop || 0;
      // 只在有效滚动行程内计算（扣除文末留白），避免编辑区滚入留白区域时
      // 预览被错误地映射到底部，导致「编辑区下滑一点直接跳到底部」的缺陷。
      const y = Math.min(rawY, effectiveMaxTa);
      let target;

      if (!anchors.length) {
        target = effectiveMaxTa > 0 ? (y / effectiveMaxTa) * maxPv : maxPv;
      } else if (rawY >= physicalMaxTa - 0.5) {
        // 编辑区真正到底：预览必须同时到底。
        target = maxPv;
      } else if (y < anchors[0].ta) {
        target = anchors[0].ta > 0 ? (y / anchors[0].ta) * anchors[0].pv : anchors[0].pv;
      } else {
        let i = anchors.length - 1;
        while (i > 0 && anchors[i].ta > y) i -= 1;
        const a = anchors[i];
        if (y < a.taEnd) {
          if (a.atomic) {
            target = a.pv;
          } else {
            const span = a.taEnd - a.ta;
            target = span > 0 ? a.pv + ((y - a.ta) / span) * (a.pvBottom - a.pv) : a.pv;
          }
        } else if (i + 1 < anchors.length) {
          const b = anchors[i + 1];
          const span = b.ta - a.taEnd;
          target = span > 0 ? a.pvBottom + ((y - a.taEnd) / span) * (b.pv - a.pvBottom) : b.pv;
        } else {
          // 最后一块之后：在有效行程内过渡，避免留白区域导致预览跳到底部。
          const span = effectiveMaxTa - a.taEnd;
          target = span > 0.5
            ? a.pvBottom + ((y - a.taEnd) / span) * (maxPv - a.pvBottom)
            : (y >= effectiveMaxTa - 0.5 ? maxPv : a.pvBottom);
        }
      }

      if (scroll.style) scroll.style.scrollBehavior = 'auto';
      scroll.scrollTop = Math.max(0, Math.min(maxPv, target));
    } finally {
      syncingPreview = false;
    }
  };

  const syncEditorScroll = () => {
    if (syncingEditor) return;
    syncingEditor = true;
    try {
      const doc = previewFrame.contentDocument;
      const scroll = doc?.scrollingElement;
      if (!doc || !scroll) return;
      const anchors = collectScrollAnchors(doc, scroll);
      if (!anchors.length) return;
      const ta = body;
      const maxPv = scroll.scrollHeight - scroll.clientHeight;
      const physicalMaxTa = Math.max(0, ta.scrollHeight - ta.clientHeight);
      if (!(physicalMaxTa > 0)) return;
      const pv = scroll.scrollTop || 0;

      let targetTa;
      if (pv <= anchors[0].pv) {
        targetTa = anchors[0].ta > 0 ? (pv / anchors[0].pv) * anchors[0].ta : 0;
      } else if (pv >= maxPv - 0.5) {
        // 预览真正到底：编辑区只映射到最后一行源码位置（有效底部），
        // 不被强制滚到包含留白的物理最底部，避免底部出现一堆空白空格。
        const overscrollBottom = parseFloat(window.getComputedStyle(body).paddingBottom) || 0;
        targetTa = Math.max(0, physicalMaxTa - overscrollBottom);
      } else {
        let i = anchors.length - 1;
        while (i > 0 && anchors[i].pv > pv) i -= 1;
        const a = anchors[i];
        if (pv <= a.pvBottom) {
          if (a.atomic) {
            targetTa = a.ta;
          } else {
            const pvSpan = a.pvBottom - a.pv;
            const taSpan = a.taEnd - a.ta;
            targetTa = pvSpan > 0 ? a.ta + ((pv - a.pv) / pvSpan) * taSpan : a.ta;
          }
        } else if (i + 1 < anchors.length) {
          const b = anchors[i + 1];
          const pvSpan = b.pv - a.pvBottom;
          const taSpan = b.ta - a.taEnd;
          targetTa = pvSpan > 0 ? a.taEnd + ((pv - a.pvBottom) / pvSpan) * taSpan : a.taEnd;
        } else {
          // 最后一块之后：平滑过渡到编辑区有效底部（扣除文末留白）。
          const span = maxPv - a.pvBottom;
          const overscrollBottom = parseFloat(window.getComputedStyle(body).paddingBottom) || 0;
          const effectiveMaxTa = Math.max(0, physicalMaxTa - overscrollBottom);
          targetTa = span > 0
            ? a.taEnd + ((pv - a.pvBottom) / span) * (effectiveMaxTa - a.taEnd)
            : effectiveMaxTa;
        }
      }
      ta.scrollTop = Math.max(0, Math.min(physicalMaxTa, targetTa));
    } finally {
      syncingEditor = false;
    }
  };

  let lastScrollTime = 0;
  const SCROLL_THROTTLE_MS = 16;
  const queuePreviewSync = () => {
    const now = performance.now();
    if (now - lastScrollTime < SCROLL_THROTTLE_MS && syncRaf) return;
    lastScrollTime = now;
    if (syncRaf) return;
    syncRaf = scheduleFrame(() => { syncRaf = 0; syncPreviewScroll(); });
  };

  const queueEditorSync = () => {
    if (editorSyncRaf) return;
    editorSyncRaf = scheduleFrame(() => { editorSyncRaf = 0; syncEditorScroll(); });
  };

  // ---------------- 预览渲染 ----------------
  let previewRaf = 0;
  const queuePreview = () => {
    if (previewRaf) return;
    previewRaf = window.requestAnimationFrame(() => {
      previewRaf = 0;
      renderPreview();
    });
  };

  const renderPreview = () => {
    const doc = previewFrame.contentDocument;
    if (!doc) return;
    if (typeof window.MinxiPreview === 'undefined' || !window.MinxiPreview.buildFragment) {
      if (previewReadyRetries < MAX_PREVIEW_READY_RETRIES) {
        previewReadyRetries++;
        setTimeout(() => renderPreview(), 100);
      }
      return;
    }
    const text = body.value;
    let fragment;
    try {
      fragment = window.MinxiPreview.buildFragment({ body: text });
    } catch (error) {
      doc.body.innerHTML = `<div class="muted small">预览渲染出错：${escapeHtml(error.message)}</div>`;
      return;
    }
    doc.body.innerHTML = '';
    doc.body.appendChild(fragment);
    doc.querySelectorAll('pre code[class*="language-\"]').forEach((code) => {
      const pre = code.parentElement;
      if (pre) pre.classList.add('highlight');
    });
    // 渲染完成后标脏锚点，下次滚动时重新收集
    scrollAnchorsDirty = true;
  };

  // ---------------- 下载 .md ----------------
  const downloadMd = () => {
    const text = body.value;
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date();
    const ts = now.toISOString().slice(0, 16).replace(/:/g, '-');
    a.href = url;
    a.download = `草稿-${ts}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('已下载 Markdown 源码');
  };

  const saveToLocal = () => {
    saveDraft();
    showToast('已保存到本地草稿');
  };

  // ---------------- 初始化 ----------------
  let previewReadyRetries = 0;
  const MAX_PREVIEW_READY_RETRIES = 50;

  const waitForPreviewReady = (callback) => {
    if (typeof window.MinxiPreview !== 'undefined' && window.MinxiPreview.buildFragment) {
      callback();
      return;
    }
    if (previewReadyRetries++ >= MAX_PREVIEW_READY_RETRIES) {
      const doc = previewFrame.contentDocument;
      if (doc) {
        doc.body.innerHTML = '<div class="muted small">预览组件加载失败，请刷新页面重试。</div>';
      }
      return;
    }
    setTimeout(() => waitForPreviewReady(callback), 100);
  };

  const init = () => {
    if (!body || !previewFrame) return;

    loadDraft();
    updateStats();

    body.addEventListener('input', () => {
      scheduleSave();
      queuePreview();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowUp' && event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
        if (latexPicker.hidden === false) return;
        event.preventDefault();
        openLatexPicker();
      }
      if (event.key === 'Escape' && latexPicker.hidden === false) {
        closeLatexPicker();
      }
    });

    latexSearchInput.addEventListener('input', renderLatexGrid);
    latexSearchInput.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        latexPickerActive = Math.min(latexPickerActive + 1, latexPickerResults.length - 1);
        renderLatexGrid();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        latexPickerActive = Math.max(latexPickerActive - 1, 0);
        renderLatexGrid();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const symbol = latexPickerResults[latexPickerActive];
        if (symbol) insertLatexSymbol(symbol);
      }
    });

    $('#public-close-latex-picker')?.addEventListener('click', closeLatexPicker);
    latexPickerBackdrop?.addEventListener('click', closeLatexPicker);

    downloadBtn?.addEventListener('click', downloadMd);
    clearBtn?.addEventListener('click', clearDraft);
    saveBtn?.addEventListener('click', saveToLocal);

    // 编辑区滚动 → 预览跟随
    body.addEventListener('scroll', queuePreviewSync, { passive: true });

    window.addEventListener('resize', () => {
      scrollAnchorsDirty = true;
      updateEditorOverscroll();
    });

    document.fonts?.ready?.then(() => {
      updateEditorOverscroll();
      scrollAnchorsDirty = true;
      syncPreviewScroll();
    });

    updateEditorOverscroll();

    // 预览 iframe 加载完成后：绑定预览滚动→编辑区的反向同步，
    // 并做初始对齐与多次校准（参考后台编辑器），避免 iframe 未就绪时
    // 监听器绑定失败导致预览滚动不跟随编辑区。
    previewFrame.addEventListener('load', () => {
      scrollAnchorsDirty = true;
      try { window.MinxiPreview?.enhance?.(previewFrame.contentDocument); } catch { /* 预览组件未就绪时忽略 */ }
      try {
        previewFrame.contentDocument?.addEventListener('scroll', () => {
          if (syncingPreview) return;
          if (editorSyncRaf) return;
          editorSyncRaf = scheduleFrame(() => { editorSyncRaf = 0; syncEditorScroll(); });
        }, { passive: true });
      } catch { /* 预览滚动监听器绑定失败时忽略 */ }
      syncPreviewScroll();
      const revealAlignedPreview = () => {
        syncPreviewScroll();
        previewFrame.style.visibility = '';
      };
      if (window.requestAnimationFrame) window.requestAnimationFrame(revealAlignedPreview);
      else revealAlignedPreview();
      setTimeout(() => syncPreviewScroll(), 120);
      try {
        previewFrame.contentDocument?.fonts?.ready?.then(() => {
          scrollAnchorsDirty = true;
          syncPreviewScroll();
        });
      } catch { /* 字体接口不可用时忽略 */ }
    });

    waitForPreviewReady(() => {
      renderPreview();
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.MinxiPublicEditor = {
    getDraft: () => body.value,
    saveDraft,
    clearDraft,
    downloadMd,
  };
})();
