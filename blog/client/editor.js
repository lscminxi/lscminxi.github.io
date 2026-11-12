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
 */

(() => {
  'use strict';

  const STORAGE_KEY = 'minxi.public.editor.draft';
  const AUTO_SAVE_MS = 800;

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const body = $('#public-editor-body');
  const previewFrame = $('#public-post-preview');
  const saveStatus = $('#editor-save-status');
  const stats = $('#public-editor-stats');
  const toast = $('#public-editor-toast');
  const downloadBtn = $('#editor-download-md');
  const clearBtn = $('#editor-clear-local');

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
    latexSymbols.forEach((symbol) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'category-tab';
      btn.textContent = latexCategoryName(symbol.category);
      btn.dataset.category = symbol.category;
      if (symbol.category === latexPickerCategory) {
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
      } else {
        btn.setAttribute('aria-pressed', 'false');
      }
      btn.addEventListener('click', () => {
        latexPickerCategory = symbol.category;
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

  const updateStats = () => {
    const text = body.value;
    const chars = text.length;
    const lines = text.split('\n').length;
    stats.textContent = `共 ${chars} 字 · ${lines} 行`;
  };

  // ---------------- 预览 ----------------
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
    // 给代码块加语言类名（供主题样式）
    doc.querySelectorAll('pre code[class*="language-"]').forEach((code) => {
      const pre = code.parentElement;
      if (pre) pre.classList.add('highlight');
    });
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

  // ---------------- 初始化 ----------------
  const init = () => {
    if (!body || !previewFrame) return;

    // 恢复草稿
    loadDraft();
    updateStats();

    // 输入事件：自动保存 + 预览
    body.addEventListener('input', () => {
      scheduleSave();
      queuePreview();
    });

    // LaTeX 符号搜索：Shift + ↑
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

    // LaTeX 搜索输入
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

    // 下载按钮
    downloadBtn?.addEventListener('click', downloadMd);
    clearBtn?.addEventListener('click', clearDraft);

    // 首次渲染预览
    renderPreview();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 暴露给 window，方便调试
  window.MinxiPublicEditor = {
    getDraft: () => body.value,
    saveDraft,
    clearDraft,
    downloadMd,
  };
})();
