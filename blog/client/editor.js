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
 * 滚动同步：编辑区单向带动预览区，按块级锚点分段插值对齐，
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
  const title = $('#public-f-title');
  const description = $('#public-f-description');
  const previewStatus = $('#public-preview-status');
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

  const insertAtCursor = (text) => {
    const start = body.selectionStart ?? body.value.length;
    const end = body.selectionEnd ?? body.value.length;
    body.value = body.value.slice(0, start) + text + body.value.slice(end);
    body.selectionStart = body.selectionEnd = start + text.length;
    body.focus();
    body.dispatchEvent(new window.Event('input', { bubbles: true }));
  };

  const latexPreviewCache = new Map();
  let latexPickerSelection = null;
  let latexPickerCategory = "all";
  let latexPickerActive = 0;
  let latexPickerResults = [];
  const latexRecentKey = "minxi:latex-recent";
  const readLatexRecent = () => {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(latexRecentKey) || "[]");
      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
    } catch {
      return [];
    }
  };
  const recordLatexRecent = (symbol) => {
    try {
      const next = [symbol.command, ...readLatexRecent().filter((item) => item !== symbol.command)].slice(0, 18);
      window.localStorage.setItem(latexRecentKey, JSON.stringify(next));
    } catch { /* 本地存储不可用时不影响插入 */ }
  };
  const recentLatexSymbols = () => readLatexRecent()
    .map((command) => latexSymbols.find((symbol) => symbol.command === command))
    .filter(Boolean);
  const latexSubsequence = (needle, haystack) => {
    if (!needle) return true;
    let index = 0;
    for (const char of haystack) {
      if (char === needle[index]) index += 1;
      if (index >= needle.length) return true;
    }
    return false;
  };
  const scoreLatexSymbol = (symbol, query) => {
    const command = symbol.command.toLocaleLowerCase();
    const bare = command.replace(/^\\+/, "");
    const aliases = symbol.aliases.map((alias) => alias.toLocaleLowerCase());
    if (bare === query || command === query || command === `\\${query}`) return 0;
    if (bare.startsWith(query)) return 1;
    if (symbol.glyph === query || aliases.some((alias) => alias === query)) return 2;
    if (aliases.some((alias) => alias.startsWith(query))) return 3;
    if (bare.includes(query)) return 4;
    if (aliases.some((alias) => alias.includes(query))) return 5;
    if (latexSubsequence(query, bare)) return 6;
    if (aliases.some((alias) => latexSubsequence(query, alias))) return 7;
    return Number.POSITIVE_INFINITY;
  };
  const currentLatexResults = () => {
    const query = latexSearchInput.value.trim().toLocaleLowerCase().replace(/^\\+/, "");
    if (query) {
      return latexSymbols
        .map((symbol, index) => ({ symbol, index, score: scoreLatexSymbol(symbol, query) }))
        .filter((item) => Number.isFinite(item.score))
        .sort((a, b) => a.score - b.score || a.index - b.index)
        .map((item) => item.symbol);
    }
    if (latexPickerCategory === "recent") return recentLatexSymbols();
    if (latexPickerCategory === "all") return [...latexSymbols];
    return latexSymbols.filter((symbol) => symbol.category === latexPickerCategory);
  };
  const latexPreviewHtml = (symbol) => {
    if (!latexPreviewCache.has(symbol.command)) {
      latexPreviewCache.set(symbol.command, window.MinxiPreview?.renderLatex?.(symbol.preview) || "");
    }
    return latexPreviewCache.get(symbol.command);
  };
  const setLatexPickerActive = (index, scroll = false) => {
    if (!latexPickerResults.length) return;
    latexPickerActive = Math.min(Math.max(index, 0), latexPickerResults.length - 1);
    [...latexSymbolGrid.querySelectorAll("[data-latex-index]")].forEach((button) => {
      button.classList.toggle("active", Number(button.dataset.latexIndex) === latexPickerActive);
    });
    const symbol = latexPickerResults[latexPickerActive];
    latexCommandDisplay.textContent = symbol.command;
    latexDetailDisplay.textContent = `${latexCategoryName(symbol.category)} · ${symbol.aliases.join(" · ")}`;
    if (scroll) latexSymbolGrid.querySelector(`[data-latex-index="${latexPickerActive}"]`)?.scrollIntoView({ block: "nearest" });
  };
  const renderLatexTabs = () => {
    const tabs = [{ id: "all", name: "全部" }];
    if (recentLatexSymbols().length) tabs.push({ id: "recent", name: "最近" });
    tabs.push(...latexCategories.map(([id, name]) => ({ id, name })));
    latexCategoryTabs.replaceChildren(...tabs.map((tab) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = tab.name;
      button.dataset.latexCategory = tab.id;
      button.classList.toggle("active", !latexSearchInput.value.trim() && latexPickerCategory === tab.id);
      button.setAttribute("aria-pressed", String(latexPickerCategory === tab.id));
      return button;
    }));
  };
  const renderLatexResults = () => {
    latexPickerResults = currentLatexResults();
    latexPickerActive = 0;
    renderLatexTabs();
    if (!latexPickerResults.length) {
      const empty = document.createElement("p");
      empty.className = "latex-picker-empty";
      empty.textContent = latexSearchInput.value.trim() ? "没有匹配的符号，换个命令或中文叫法试试。" : "还没有用过的符号，搜一个插入后会出现在这里。";
      latexSymbolGrid.replaceChildren(empty);
      latexCommandDisplay.textContent = "没有匹配的符号";
      latexDetailDisplay.textContent = "可搜 \\pm、正负、积分、分数等";
      return;
    }
    const nodes = latexPickerResults.map((symbol, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "latex-symbol-card";
      button.dataset.latexIndex = String(index);
      button.title = `${symbol.command}（${symbol.aliases.join(" · ")}）`;
      button.setAttribute("aria-label", `插入 ${symbol.command}，${symbol.aliases.join("、")}`);
      const preview = document.createElement("span");
      preview.className = "latex-symbol-preview";
      // 矩阵/分段/对齐等宽预览加 is-wide，CSS 缩小一号完整显示。
      if (!symbol.glyph && String(symbol.preview || "").length > 22) preview.classList.add("is-wide");
      if (symbol.glyph) preview.textContent = symbol.glyph;
      else {
        const html = latexPreviewHtml(symbol);
        if (html) preview.innerHTML = html;
        else preview.textContent = symbol.preview;
      }
      const command = document.createElement("span");
      command.className = "latex-symbol-name";
      command.textContent = symbol.command;
      button.append(preview, command);
      return button;
    });
    latexSymbolGrid.replaceChildren(...nodes);
    setLatexPickerActive(0);
  };
  const restoreLatexEditorFocus = (selection = latexPickerSelection) => {
    body.focus({ preventScroll: true });
    if (!selection) return;
    const start = Math.min(selection.start, body.value.length);
    const end = Math.min(selection.end, body.value.length);
    body.selectionStart = start;
    body.selectionEnd = end;
  };
  const openLatexPicker = () => {
    latexPickerSelection = {
      start: body.selectionStart ?? body.value.length,
      end: body.selectionEnd ?? body.value.length,
    };
    latexPickerCategory = "all";
    latexSearchInput.value = "";
    latexPicker.hidden = false;
    renderLatexResults();
    setTimeout(() => latexSearchInput.focus(), 0);
  };
  const closeLatexPicker = (restoreFocus = true) => {
    if (latexPicker.hidden) return;
    latexPicker.hidden = true;
    if (restoreFocus) restoreLatexEditorFocus();
  };
  const insertLatexSymbol = (symbol) => {
    if (!symbol) return;
    recordLatexRecent(symbol);
    const saved = latexPickerSelection || {
      start: body.selectionStart ?? body.value.length,
      end: body.selectionEnd ?? body.value.length,
    };
    const start = Math.min(saved.start, body.value.length);
    const end = Math.min(saved.end, body.value.length);
    body.value = body.value.slice(0, start) + symbol.insert + body.value.slice(end);
    latexPicker.hidden = true;
    body.focus({ preventScroll: true });
    body.selectionStart = start + symbol.cursor[0];
    body.selectionEnd = start + symbol.cursor[1];
    body.dispatchEvent(new window.Event("input", { bubbles: true }));
  };
  latexCategoryTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-latex-category]");
    if (!button) return;
    latexPickerCategory = button.dataset.latexCategory;
    latexSearchInput.value = "";
    renderLatexResults();
    latexSearchInput.focus();
  });
  latexSymbolGrid.addEventListener("mouseover", (event) => {
    const button = event.target.closest("[data-latex-index]");
    if (button) setLatexPickerActive(Number(button.dataset.latexIndex));
  });
  latexSymbolGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-latex-index]");
    if (button) insertLatexSymbol(latexPickerResults[Number(button.dataset.latexIndex)]);
  });
  latexSearchInput.addEventListener("input", renderLatexResults);
  latexSearchInput.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      closeLatexPicker();
      return;
    }
    if (!latexPickerResults.length) return;
    const columns = Math.max(1, (window.getComputedStyle(latexSymbolGrid).gridTemplateColumns || "").split(" ").filter(Boolean).length || 6);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setLatexPickerActive(latexPickerActive + columns, true);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setLatexPickerActive(latexPickerActive - columns, true);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      const collapsed = latexSearchInput.selectionStart === latexSearchInput.selectionEnd;
      const atBoundary = event.key === "ArrowLeft"
        ? collapsed && latexSearchInput.selectionStart === 0
        : collapsed && latexSearchInput.selectionStart === latexSearchInput.value.length;
      if (atBoundary) {
        event.preventDefault();
        setLatexPickerActive(latexPickerActive + (event.key === "ArrowLeft" ? -1 : 1), true);
      }
    } else if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      insertLatexSymbol(latexPickerResults[latexPickerActive]);
    }
  });
  $("#public-close-latex-picker").addEventListener("click", () => closeLatexPicker());
  $("#public-latex-picker-backdrop").addEventListener("click", () => closeLatexPicker());
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !latexPicker.hidden) {
      event.preventDefault();
      event.stopPropagation();
      closeLatexPicker();
    }
  }, true);
  body.addEventListener("keydown", (event) => {
    if (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && event.key === "ArrowUp" && !event.isComposing) {
      event.preventDefault();
      openLatexPicker();
    }
  });
  $("#public-insert-latex-symbol").addEventListener("click", openLatexPicker);


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
          title.value = typeof data.title === 'string' ? data.title : '';
          description.value = typeof data.description === 'string' ? data.description : '';
          draftSavedAt = data.savedAt || '';
          return true;
        }
      }
    } catch { /* 忽略 */ }
    return false;
  };

  const saveDraft = () => {
    clearTimeout(draftTimer);
    draftTimer = 0;
    const data = { text: body.value, title: title.value, description: description.value, savedAt: new Date().toISOString() };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      draftSavedAt = data.savedAt;
      saveStatus.textContent = `本地草稿已保存（${new Date(data.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}）`;
      return true;
    } catch {
      saveStatus.textContent = '本地保存失败，请下载 Markdown 备份';
      return false;
    }
  };

  const scheduleSave = () => {
    clearTimeout(draftTimer);
    saveStatus.textContent = '等待保存到本地…';
    draftTimer = setTimeout(saveDraft, AUTO_SAVE_MS);
    updateStats();
  };

  const clearDraft = () => {
    if (!window.confirm('确定清除当前浏览器中的草稿吗？此操作无法撤销。')) return;
    clearTimeout(draftTimer);
    draftTimer = 0;
    try { localStorage.removeItem(STORAGE_KEY); } catch {
      saveStatus.textContent = '无法清除本地草稿，请检查浏览器存储权限';
      return;
    }
    body.value = ''; title.value = ''; description.value = '';
    draftSavedAt = '';
    saveStatus.textContent = '本地草稿已清除';
    updateStats();
    queuePreview();
    showToast('本地草稿已清除');
  };

  const showToast = (message) => {
    toast.textContent = message;
    toast.hidden = false;
    setTimeout(() => { toast.hidden = true; }, 2500);
  };

  // ---------------- 插入按钮事件 ----------------
  $('#public-insert-math')?.addEventListener('click', () => {
    insertAtCursor("\n\n$$\nf(n) = \\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\n$$\n\n");
  });

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

  $('#public-insert-image')?.addEventListener('click', () => {
    insertAtCursor('![图片说明](https://)');
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

  // ---------------- 滚动同步（编辑区带动预览，仿洛谷编辑器） ----------------
  let scrollAnchorsDirty = true;
  let lineMirror = null;
  let syncRaf = 0;
  let syncingPreview = false;
  let previewLoadPending = false;

  const scheduleFrame = (callback) => (window.requestAnimationFrame ? window.requestAnimationFrame(callback) : setTimeout(callback, 16));

  // 与后台一致：用视觉留白让最后一行可滚到编辑区顶部，不改变草稿正文。
  const updateEditorOverscroll = () => {
    const ta = body;
    if (!ta) return;
    const style = window.getComputedStyle(ta);
    const fontSize = parseFloat(style.fontSize) || 12.5;
    const lineHeight = parseFloat(style.lineHeight) || fontSize * 1.9;
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const height = Number.isFinite(ta.clientHeight) ? ta.clientHeight : 0;
    const bottom = height > 0 ? Math.max(lineHeight, height - paddingTop - lineHeight) : lineHeight;
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
    // 锚点的编辑区坐标以第一行行首为 0：textarea 的 scrollTop 同样以第一行
    // 能滚到的位置为基准，直接拿镜像的绝对 offsetTop 会多出顶部内边距。
    const mirrorBaseTop = mirrorLineTop(1);
    const isAtomicBlock = (block) => {
      // 函数图/关系图不再整块钉在顶部：和折叠框一样按块内进度缓慢下移。
      // 独立图片没有可对应的源码内部进度，仍整块对齐。
      return Boolean(block.querySelector?.(':scope > img'));
    };
    for (const block of doc.querySelectorAll("[data-source-line]")) {
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
    if (writingWorkspace?.dataset.mode === "edit") return;
    const maxPv = scroll.scrollHeight - scroll.clientHeight;
    if (!(maxPv > 0)) return;
    // 编辑区的可滚行程以物理行程为准：底部留白正是让最后一行能继续滚到
    // 编辑区顶部的那段距离，锚点坐标也按完整行程计算。若在这里先把位置
    // 钳到「扣除留白后的行程」，滚到最后约一屏时位置会被提前冻住，预览
    // 还没到底就不再跟随。只有完全没有锚点、退回百分比同步时，才按扣除
    // 留白后的行程算，避免留白把百分比稀释。
    const overscrollBottom = parseFloat(window.getComputedStyle(ta).paddingBottom) || 0;
    const physicalMaxTa = Math.max(0, ta.scrollHeight - ta.clientHeight);
    const effectiveMaxTa = Math.max(0, physicalMaxTa - overscrollBottom);
    if (!(physicalMaxTa > 0)) {
      // 正文短到本身不用滚：预览直接对齐顶部。
      if (scroll.style) scroll.style.scrollBehavior = "auto";
      scroll.scrollTop = 0;
      return;
    }
    const anchors = collectScrollAnchors(doc, scroll);
    const rawY = ta.scrollTop || 0;
    const y = Math.min(rawY, anchors.length ? physicalMaxTa : effectiveMaxTa);
    let target;
    if (!anchors.length) {
      // 没有可用锚点时退回按正文总高度比例同步（不含文末留白）。
      target = effectiveMaxTa > 0 ? (y / effectiveMaxTa) * maxPv : maxPv;
    } else if (rawY >= physicalMaxTa - 0.5) {
      // 编辑区真正到底：预览必须同时到底，不能停在最后一块的内部映射上。
      target = maxPv;
    } else if (y < anchors[0].ta) {
      target = anchors[0].ta > 0 ? (y / anchors[0].ta) * anchors[0].pv : anchors[0].pv;
    } else {
      let i = anchors.length - 1;
      while (i > 0 && anchors[i].ta > y) i -= 1;
      const a = anchors[i];
      if (y < a.taEnd) {
        // 块内部：独立图片停在块顶；其余块（含图与折叠框）按行位置
        // 比例摊到当前渲染高度，随编辑滚动缓慢下移。
        if (a.atomic) {
          target = a.pv;
        } else {
          const span = a.taEnd - a.ta;
          target = span > 0 ? a.pv + ((y - a.ta) / span) * (a.pvBottom - a.pv) : a.pv;
        }
      } else if (i + 1 < anchors.length) {
        // 块之间的空行区：从上一块下沿过渡到下一块上沿。
        const b = anchors[i + 1];
        const span = b.ta - a.taEnd;
        target = span > 0 ? a.pvBottom + ((y - a.taEnd) / span) * (b.pv - a.pvBottom) : b.pv;
      } else {
        // 最后一块之后：平滑过渡到两侧同时见底。
        const span = physicalMaxTa - a.taEnd;
        target = span > 0.5
          ? a.pvBottom + ((y - a.taEnd) / span) * (maxPv - a.pvBottom)
          : (y >= physicalMaxTa - 0.5 ? maxPv : a.pvBottom);
      }
    }
    // 预览文档继承了站点的 smooth 滚动；程序对齐必须直接落位，不能播放
    // 一段从旧位置滚到目标位置的物理滚动动画。
    if (scroll.style) scroll.style.scrollBehavior = "auto";
    scroll.scrollTop = Math.max(0, Math.min(maxPv, target));
    } finally {
      syncingPreview = false;
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


  const formatGraphCoord = (value) => String(Number(Number(value).toFixed(2)));
  const rewriteGraphBlockPositions = (markdown, graphIndex, positions) => {
    const lines = String(markdown).split("\n");
    const graphNodeId = /^[A-Za-z0-9_\-\u4e00-\u9fa5]+$/;
    let current = -1;
    for (let i = 0; i < lines.length; i++) {
      if (!/^```graph\s*$/.test(lines[i].trim())) continue;
      current += 1;
      let end = i + 1;
      while (end < lines.length && !/^```\s*$/.test(lines[end].trim())) end += 1;
      if (current !== graphIndex) { i = end; continue; }
      if (end >= lines.length) return null;
      const seen = new Set();
      const bodyLines = lines.slice(i + 1, end).map((line) => {
        const match = /^(\s*(?:node|点|顶点)\s*[:：]\s*)([^;]+?)\s*(?:;\s*(.*))?$/.exec(line);
        if (!match) return line;
        const idSegment = match[2].trim();
        // 点名后可能跟点权（A[5] / A(5)）：识别真实点名，写回时原样保留这一段。
        const idMatch = /^([A-Za-z0-9_\-\u4e00-\u9fa5]+)(?:\s*(?:\[[^\]]+\]|\([^)]+\)))?$/.exec(idSegment);
        const id = idMatch?.[1] || '';
        if (!graphNodeId.test(id)) return line;
        seen.add(id);
        const options = (match[3] || "")
          .split(";")
          .map((item) => item.trim())
          .filter(Boolean)
          .filter((item) => !/^(x|y)\s*=/i.test(item));
        const pos = positions?.[id];
        if (pos && Number.isFinite(Number(pos.x)) && Number.isFinite(Number(pos.y))) {
          options.push(`x=${formatGraphCoord(pos.x)}`, `y=${formatGraphCoord(pos.y)}`);
        }
        return options.length ? `${match[1]}${idSegment} ; ${options.join(" ; ")}` : `${match[1]}${idSegment}`;
      });
      if (positions) {
        for (const [id, pos] of Object.entries(positions)) {
          if (seen.has(id) || !graphNodeId.test(id)) continue;
          if (!pos || !Number.isFinite(Number(pos.x)) || !Number.isFinite(Number(pos.y))) continue;
          bodyLines.push(`node: ${id} ; x=${formatGraphCoord(pos.x)} ; y=${formatGraphCoord(pos.y)}`);
        }
      }
      return [...lines.slice(0, i + 1), ...bodyLines, ...lines.slice(end)].join("\n");
    }
    return null;
  };
  const formatGraphWeight = (value) => String(Number(Number(value).toFixed(4)));
  const rewriteGraphBlockNodeWeight = (markdown, graphIndex, nodeId, weight) => {
    if (!/^[A-Za-z0-9_\-\u4e00-\u9fa5]+$/.test(String(nodeId || ''))) return null;
    if (weight !== null && !Number.isFinite(Number(weight))) return null;
    const lines = String(markdown).split("\n");
    let current = -1;
    for (let i = 0; i < lines.length; i++) {
      if (!/^```graph\s*$/.test(lines[i].trim())) continue;
      current += 1;
      let end = i + 1;
      while (end < lines.length && !/^```\s*$/.test(lines[end].trim())) end += 1;
      if (current !== graphIndex) { i = end; continue; }
      if (end >= lines.length) return null;
      let seen = false;
      const bodyLines = lines.slice(i + 1, end).map((line) => {
        const match = /^(\s*(?:node|点|顶点)\s*[:：]\s*)([^;]+?)\s*(?:;\s*(.*))?$/.exec(line);
        if (!match) return line;
        const idSegment = match[2].trim();
        const idMatch = /^([A-Za-z0-9_\-\u4e00-\u9fa5]+)(?:\s*(?:\[[^\]]+\]|\([^)]+\)))?$/.exec(idSegment);
        const id = idMatch?.[1] || '';
        if (id !== nodeId) return line;
        seen = true;
        const options = (match[3] || "")
          .split(";")
          .map((item) => item.trim())
          .filter(Boolean)
          .filter((item) => !/^(weight|w|点权|权重)\s*(?:=|[:：])/i.test(item));
        if (weight !== null) options.push(`weight=${formatGraphWeight(weight)}`);
        return options.length ? `${match[1]}${id} ; ${options.join(" ; ")}` : `${match[1]}${id}`;
      });
      if (!seen && weight !== null) {
        bodyLines.push(`node: ${nodeId} ; weight=${formatGraphWeight(weight)}`);
      }
      return [...lines.slice(0, i + 1), ...bodyLines, ...lines.slice(end)].join("\n");
    }
    return null;
  };
  const handleGraphNodeWeight = (event) => {
    const detail = event.detail || {};
    const graphIndex = Number(detail.graphIndex || 0);
    const weight = detail.weight === null ? null : Number(detail.weight);
    if (detail.weight !== null && !Number.isFinite(weight)) return;
    const next = rewriteGraphBlockNodeWeight(body.value, graphIndex, detail.nodeId, weight);
    if (next === null || next === body.value) return;
    const cursor = Math.min(body.selectionStart ?? next.length, next.length);
    body.value = next;
    body.selectionStart = body.selectionEnd = cursor;
    body.dispatchEvent(new window.Event("input", { bubbles: true }));
    previewStatus.textContent = weight === null
      ? "图点权已从源码清除（将自动保存到本地草稿）"
      : "图点权已写回源码（将自动保存到本地草稿）";
  };
  const handleGraphPositions = (event) => {
    const detail = event.detail || {};
    const graphIndex = Number(detail.graphIndex || 0);
    const positions = detail.reset ? null : detail.positions;
    if (!detail.reset && (!positions || typeof positions !== "object")) return;
    const next = rewriteGraphBlockPositions(body.value, graphIndex, positions);
    if (next === null || next === body.value) return;
    const cursor = Math.min(body.selectionStart ?? next.length, next.length);
    body.value = next;
    body.selectionStart = body.selectionEnd = cursor;
    body.dispatchEvent(new window.Event("input", { bubbles: true }));
    previewStatus.textContent = detail.reset
      ? "图点位已重置为自动布局（改动将自动保存到本地）"
      : "图点位已写回源码（将自动保存到本地草稿）";
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

  let previewSignature = '';
  const renderPreview = () => {
    if (!window.MinxiPreview?.document) return;
    const input = { body: body.value, title: title.value, description: description.value };
    const theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    const signature = JSON.stringify([input, theme]);
    if (signature === previewSignature || previewLoadPending) return;
    try {
      const doc = previewFrame.contentDocument;
      const hasContent = !!doc?.querySelector('.article-content');
      const openFolds = hasContent ? [...doc.querySelectorAll('details.fold-box[open][data-preview-fold-key]')].map((fold) => fold.dataset.previewFoldKey) : [];
      const plotViews = hasContent ? [...doc.querySelectorAll('.md-plot')].map((figure) => ({
        xMin: figure.dataset.viewXMin, xMax: figure.dataset.viewXMax,
        yMin: figure.dataset.viewYMin, yMax: figure.dataset.viewYMax,
        coords: figure.dataset.viewCoords, intersections: figure.dataset.viewIntersections,
      })) : [];
      const graphViews = hasContent ? [...doc.querySelectorAll('.md-graph svg')].map((svg) => svg.getAttribute('data-preview-viewbox') || '') : [];
      const options = { ...input, openFolds, plotViews, graphViews };
      const frameTheme = doc?.documentElement?.dataset.theme === 'light' ? 'light' : 'dark';
      if (!previewLoadPending && hasContent && frameTheme === theme && window.MinxiPreview.patch(doc, options)) {
        window.MinxiPreview.enhance(doc);
        scrollAnchorsDirty = true;
        syncPreviewScroll();
      } else {
        previewLoadPending = true;
        previewFrame.srcdoc = window.MinxiPreview.document(options);
      }
      previewSignature = signature;
      previewStatus.textContent = '预览已更新 · Markdown / KaTeX / 折叠框 / 可交互图表（代码高亮与目录以发布页为准）';
    } catch (error) {
      previewStatus.textContent = `预览失败：${error.message}`;
    }
  };

  // ---------------- 下载 .md ----------------
  const downloadMd = () => {
    const metadata = [];
    if (title.value) metadata.push(`title: ${JSON.stringify(title.value)}`);
    if (description.value) metadata.push(`description: ${JSON.stringify(description.value)}`);
    const text = (metadata.length ? `---\n${metadata.join('\n')}\n---\n\n` : '') + body.value;
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
    if (saveDraft()) showToast('已保存到本地草稿');
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

    [body, title, description].forEach((field) => field.addEventListener('input', () => {
      scrollAnchorsDirty = true;
      scheduleSave();
      queuePreview();
    }));
    window.addEventListener('pagehide', () => { if (draftTimer) saveDraft(); });
    new MutationObserver(() => queuePreview()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    downloadBtn?.addEventListener('click', downloadMd);
    clearBtn?.addEventListener('click', clearDraft);
    saveBtn?.addEventListener('click', saveToLocal);

    // 编辑区滚动 → 预览跟随
    body.addEventListener('scroll', queuePreviewSync, { passive: true });

    window.addEventListener('resize', () => {
      scrollAnchorsDirty = true;
      updateEditorOverscroll();
    });
    // The workspace can change size without a window resize (responsive layout,
    // mode changes or font loading). Recalculate once its actual height changes.
    if (window.ResizeObserver) {
      let lastHeight = -1;
      const observer = new ResizeObserver(() => {
        const height = body.clientHeight;
        if (height > 0 && height !== lastHeight) {
          lastHeight = height;
          updateEditorOverscroll();
        }
      });
      observer.observe(body);
    }

    document.fonts?.ready?.then(() => {
      updateEditorOverscroll();
      scrollAnchorsDirty = true;
      syncPreviewScroll();
    });

    updateEditorOverscroll();

    // 预览 iframe 加载完成后做初始对齐与多次校准。
    previewFrame.addEventListener('load', () => {
      previewLoadPending = false;
      scrollAnchorsDirty = true;
      try { previewFrame.contentDocument?.addEventListener('minxi:graph-positions', handleGraphPositions);
        previewFrame.contentDocument?.addEventListener('minxi:graph-node-weight', handleGraphNodeWeight); } catch { /* iframe 尚未就绪 */ }
      try { window.MinxiPreview?.enhance?.(previewFrame.contentDocument); } catch { /* 预览组件未就绪时忽略 */ }
      if (previewSignature !== JSON.stringify([{ body: body.value, title: title.value, description: description.value }, document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'])) queuePreview();
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
