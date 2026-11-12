/*
 * 公开 Markdown 编辑器（功能与后台编辑器一致，保存仅在本地）
 * --------------------------------------------------------------
 * 这个编辑器对所有人开放，无需登录，所有功能与后台编辑器一致：
 * 表单字段、Markdown 前置元信息、实时预览、LaTeX 符号搜索、
 * 分类/标签多选、折叠框、函数图、关系图、图片插入等。
 *
 * 唯一区别：保存只写入当前浏览器的 localStorage，不调用任何
 * GitHub API，不上传任何内容到服务器。点「保存到本地」即可
 * 把当前草稿（含前置元信息和正文）持久化到本地；刷新或重新
 * 打开页面会自动恢复最近的草稿。
 */

(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const STORAGE_KEY = 'minxi.public.editor.draft';
  const AUTO_SAVE_MS = 800;

  // ---------------- DOM 元素 ----------------
  const body = $('#f-body');
  const previewFrame = $('#post-preview');
  const editorStatus = $('#editor-status');
  const editorStats = $('#editor-stats');
  const saveStatus = $('#editor-save-status');
  const toastEl = $('#toast');
  const modal = $('#modal');
  const modalTitle = $('#modal-title');
  const modalText = $('#modal-text');
  const modalOk = $('#modal-ok');
  const modalCancel = $('#modal-cancel');

  const f = {
    title: $('#f-title'),
    slug: $('#f-slug'),
    date: $('#f-date'),
    categories: $('#f-categories'),
    tags: $('#f-tags'),
    accent: $('#f-accent'),
    description: $('#f-description'),
    sample: $('#f-sample'),
    body,
  };

  const saveLocalBtn = $('#save-local');
  const deleteLocalBtn = $('#delete-local');
  const downloadBtn = $('#editor-download-md');
  const clearBtn = $('#editor-clear-local');
  const backBtn = $('#editor-back-list');
  const urlPreview = $('#url-preview');
  const slugWarning = $('#slug-warning');

  const writingWorkspace = $('#writing-workspace');

  // 状态
  let editing = { path: '__new__', sha: '', isNew: true };
  let visibility = 'public';
  let pinned = false;
  let draftTimer = 0;
  let draftSavedAt = '';
  let previewTimer = 0;
  let previewSignature = '';
  let previewRaf = 0;
  let previewNeedsReset = true;
  let previewOpenFolds = [];
  let previewPlotViews = [];
  let previewGraphViews = [];

  // ---------------- 工具 ----------------
  const pad = (n) => String(n).padStart(2, '0');

  const toDatetimeLocal = (date) =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

  const fromDateInput = (value) => {
    if (!value) return '';
    const [datePart, timePart = '00:00'] = String(value).split('T');
    const [y, m, d] = datePart.split('-');
    const [hh, mm] = timePart.split(':');
    if (!y || !m || !d) return '';
    return `${y}-${pad(m)}-${pad(d)} ${pad(hh || 0)}:${pad(mm || 0)}:00`;
  };

  const postUrl = (dateValue, slug) => {
    const [y, m, d] = String(dateValue).slice(0, 10).split('-');
    return `/${y}/${m}/${d}/${slug}/`;
  };

  const fileName = (path) => path.split('/').pop().replace(/\.md$/, '');

  const splitList = (value) =>
    String(value || '').split(/[,，]/).map((item) => item.trim()).filter(Boolean);

  const needsQuotes = (value) =>
    /[:#\[\]{}&*!|>'"%@`]|^\s|\s$|^-/.test(value);
  const yamlString = (value) =>
    needsQuotes(String(value)) ? JSON.stringify(String(value)) : String(value);

  const escapeHtml = (text) =>
    String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const toast = (message, kind = '') => {
    toastEl.textContent = message;
    toastEl.className = `toast ${kind}`.trim();
    toastEl.hidden = false;
    clearTimeout(toastEl._timer);
    toastEl._timer = setTimeout(() => (toastEl.hidden = true), 3600);
  };

  const confirmDialog = (title, text, okLabel = '确认') => {
    if (modal._busy) return Promise.resolve(false);
    modalTitle.textContent = title;
    modalText.textContent = text;
    modalOk.textContent = okLabel;
    modal.hidden = false;
    modalOk.focus();
    return new Promise((resolve) => {
      modal._busy = true;
      const finish = (result) => {
        modal.hidden = true;
        modal._busy = false;
        resolve(result);
      };
      modalOk.onclick = () => finish(true);
      modalCancel.onclick = () => finish(false);
      modal.onclick = (event) => { if (event.target === modal) finish(false); };
    });
  };

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) {
      modal.hidden = true;
      modal._busy = false;
    }
  });

  const busy = (button, on, label) => {
    if (!button) return;
    if (on) {
      button.dataset.label = button.textContent;
      button.classList.add('loading');
      button.disabled = true;
      if (label) button.textContent = label;
    } else {
      button.classList.remove('loading');
      button.disabled = false;
      if (button.dataset.label) button.textContent = button.dataset.label;
    }
  };

  // ---------------- 置顶 / 可见性 ----------------
const setPinned = (value) => {
  pinned = Boolean(value);
  $$('[data-pin]').forEach((button) => {
    const on = (button.dataset.pin === 'on') === pinned;
    button.classList.toggle('active', on);
    button.setAttribute('aria-pressed', String(on));
  });
  $('#pin-hint').textContent = pinned
    ? '保存后会排在首页和归档的最前面，并显示「置顶」标记。'
    : '普通文章，按日期排序。';
};

const setVisibility = (value) => {
  visibility = value === 'private' ? 'private' : 'public';
  $$('[data-visibility]').forEach((button) => {
    const on = button.dataset.visibility === visibility;
    button.classList.toggle('active', on);
    button.setAttribute('aria-pressed', String(on));
  });
  $('#visibility-hint').textContent = visibility === 'private'
    ? '私密：不生成公开页面，也不进首页、归档与搜索（不是密码保护，源码仍在本地）。'
    : '公开：保存到本地后，可下载 .md 文件或手动复制到后台编辑器提交。';
};

// ---------------- 前置元信息构建 ----------------
  const buildMarkdown = (fields) => {
    const lines = ['---'];
    lines.push(`title: ${yamlString(fields.title)}`);
    lines.push(`date: ${fields.date}`);
    if (fields.categories.length) {
      lines.push('categories:');
      fields.categories.forEach((item) => lines.push(`  - ${yamlString(item)}`));
    }
    if (fields.tags.length) {
      lines.push('tags:');
      fields.tags.forEach((item) => lines.push(`  - ${yamlString(item)}`));
    }
    if (fields.description) lines.push(`description: ${yamlString(fields.description)}`);
    if (fields.accent) lines.push(`accent: ${fields.accent}`);
    if (fields.sample) lines.push('sample: true');
    if (fields.pinned) lines.push('sticky: 1');
    if (fields.visibility === 'private') lines.push('published: false');
    lines.push('---', '');
    return `${lines.join('\n')}${fields.body.replace(/^\s+/, '')}\n`;
  };

  // ---------------- 表单读取 ----------------
  const readForm = () => {
    const title = f.title.value.trim();
    const slug = f.slug.value.trim();
    const dateValue = fromDateInput(f.date.value);
    const errors = [];
    if (!title) errors.push('标题不能为空');
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug))
      errors.push('文件名只能用小写字母、数字和连字符（例如 binary-search）');
    if (!dateValue) errors.push('日期不能为空');
    return {
      errors,
      title,
      slug,
      date: dateValue,
      categories: splitList(f.categories.value),
      tags: splitList(f.tags.value),
      description: f.description.value.trim(),
      accent: f.accent.value,
      sample: f.sample.checked,
      visibility,
      pinned,
      body: f.body.value,
    };
  };

  // ---------------- 预览 ----------------
  const updatePreview = () => {
    renderPreview();
    const slug = f.slug.value.trim();
    const dateValue = fromDateInput(f.date.value);
    const valid = /^[a-z0-9][a-z0-9-]*$/.test(slug);
    urlPreview.textContent = visibility === 'private'
      ? '私密文章（不会生成公开页面）'
      : dateValue && valid ? postUrl(dateValue, slug) : '/…';
    slugWarning.hidden = !(slug && (!valid));
    slugWarning.textContent = !valid ? ' 文件名只能用小写字母、数字和连字符。' : '';
  };

  const renderPreview = () => {
    clearTimeout(previewTimer);
    try {
      if (!window.MinxiPreview) throw new Error('预览组件未加载，请刷新页面。');
      const input = {
        title: f.title.value,
        description: f.description.value,
        body: f.body.value,
      };
      const signature = JSON.stringify(input);
      if (!previewNeedsReset && signature === previewSignature) return;

      if (previewNeedsReset) {
        previewOpenFolds = [];
        previewPlotViews = [];
        previewGraphViews = [];
      } else {
        const doc = previewFrame.contentDocument;
        if (doc?.querySelector('.article-content')) {
          previewOpenFolds = [...doc.querySelectorAll('details.fold-box[open][data-preview-fold-key]')]
            .map((fold) => fold.dataset.previewFoldKey);
          previewPlotViews = [...doc.querySelectorAll('.md-plot')].map((figure) => ({
            xMin: figure.dataset.viewXMin, xMax: figure.dataset.viewXMax,
            yMin: figure.dataset.viewYMin, yMax: figure.dataset.viewYMax,
            coords: figure.dataset.viewCoords, intersections: figure.dataset.viewIntersections,
          }));
          previewGraphViews = [...doc.querySelectorAll('.md-graph svg')]
            .map((svg) => svg.getAttribute('data-preview-viewbox') || '');
        }
      }

      const liveDoc = previewFrame.contentDocument;
      const frameTheme = liveDoc?.documentElement?.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
      const pageTheme = document.documentElement?.dataset?.theme === 'light' ? 'light' : 'dark';

      if (!previewNeedsReset && liveDoc?.querySelector('.article-content')
        && frameTheme === pageTheme && window.MinxiPreview.patch) {
        let patched = false;
        try { patched = window.MinxiPreview.patch(liveDoc, { ...input, openFolds: previewOpenFolds, plotViews: previewPlotViews, graphViews: previewGraphViews }); } catch { patched = false; }
        if (patched) {
          try { window.MinxiPreview.enhance(liveDoc); } catch { /* 忽略 */ }
          previewSignature = signature;
          $('#preview-status').textContent = '预览已更新';
          return;
        }
      }

      previewFrame.style.visibility = 'hidden';
      previewFrame.srcdoc = window.MinxiPreview.document({ ...input, openFolds: previewOpenFolds, plotViews: previewPlotViews, graphViews: previewGraphViews });
      previewSignature = signature;
      previewNeedsReset = false;
      $('#preview-status').textContent = '预览已更新';
    } catch (error) {
      const doc = previewFrame.contentDocument;
      if (doc) doc.body.innerHTML = `<div class="muted small">预览渲染出错：${escapeHtml(error.message)}</div>`;
    }
  };

  const queuePreview = () => {
    if (previewRaf) return;
    previewRaf = window.requestAnimationFrame(() => {
      previewRaf = 0;
      updatePreview();
    });
  };

  // ---------------- 本地保存 ----------------
  const editorSnapshotValue = () => JSON.stringify({
    title: f.title.value,
    slug: f.slug.value,
    date: f.date.value,
    categories: f.categories.value,
    tags: f.tags.value,
    accent: f.accent.value,
    description: f.description.value,
    sample: f.sample.checked,
    visibility,
    pinned,
    body: f.body.value,
  });

  const editorDirty = () =>
    snapshots.editor !== null && editorSnapshotValue() !== snapshots.editor;

  let snapshots = { editor: null };

  const saveToLocal = () => {
    const key = STORAGE_KEY;
    try {
      const snapshot = editorSnapshotValue();
      if (snapshots.editor !== null && snapshot === snapshots.editor) {
        // 和已保存内容一致，不需要保留草稿
        draftSavedAt = '';
      } else {
        const savedAt = new Date().toISOString();
        window.localStorage.setItem(key, JSON.stringify({ savedAt, snapshot }));
        draftSavedAt = new Date(savedAt).toLocaleTimeString('zh-CN', { hour12: false });
      }
    } catch { /* localStorage 不可用时忽略 */ }
    updateStats();
    saveStatus.textContent = draftSavedAt
      ? `本地草稿已自动保存（${draftSavedAt}）`
      : '本地草稿已同步';
    saveStatus.hidden = false;
  };

  const scheduleSave = () => {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(saveToLocal, AUTO_SAVE_MS);
    updateStats();
  };

  const loadFromLocal = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && typeof data.snapshot === 'string') {
          const snap = JSON.parse(data.snapshot);
          f.title.value = String(snap.title ?? '');
          f.slug.value = String(snap.slug ?? '');
          f.date.value = String(snap.date ?? '');
          f.categories.value = String(snap.categories ?? '');
          f.tags.value = String(snap.tags ?? '');
          f.accent.value = String(snap.accent ?? '');
          f.description.value = String(snap.description ?? '');
          f.sample.checked = Boolean(snap.sample);
          setVisibility(snap.visibility);
          setPinned(snap.pinned);
          f.body.value = String(snap.body ?? '');
          draftSavedAt = data.savedAt ? new Date(data.savedAt).toLocaleTimeString('zh-CN', { hour12: false }) : '';
          snapshots.editor = editorSnapshotValue();
          return true;
        }
      }
    } catch { /* 忽略 */ }
    return false;
  };

  const clearLocal = () => {
    localStorage.removeItem(STORAGE_KEY);
    f.title.value = '';
    f.slug.value = '';
    f.date.value = toDatetimeLocal(new Date());
    f.categories.value = '';
    f.tags.value = '';
    f.accent.value = '';
    f.description.value = '';
    f.sample.checked = false;
    setVisibility('public');
    setPinned(false);
    f.body.value = '';
    draftSavedAt = '';
    snapshots.editor = editorSnapshotValue();
    saveStatus.hidden = true;
    updateStats();
    toast('本地草稿已清除');
    updatePreview();
  };

  const downloadMd = () => {
    const fields = readForm();
    if (fields.errors.length) {
      toast(fields.errors[0], 'err');
      return;
    }
    const markdown = buildMarkdown(fields);
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const ts = now.toISOString().slice(0, 16).replace(/:/g, '-');
    const a = document.createElement('a');
    a.href = url;
    a.download = `草稿-${ts}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('已下载 Markdown 源码');
  };

  const deleteLocalDraft = async () => {
    const ok = await confirmDialog('删除本地草稿', '确定删除当前的本地草稿吗？此操作不可恢复。', '删除');
    if (!ok) return;
    clearLocal();
  };

  const saveLocal = async () => {
    const fields = readForm();
    if (fields.errors.length) {
      editorStatus.textContent = fields.errors.join('；');
      toast(fields.errors[0], 'err');
      return;
    }
    const markdown = buildMarkdown(fields);
    busy(saveLocalBtn, true, '保存中…');
    try {
      // 只写入本地 localStorage，不调用 GitHub API
      const key = STORAGE_KEY;
      const savedAt = new Date().toISOString();
      window.localStorage.setItem(key, JSON.stringify({ savedAt, snapshot: markdown }));
      snapshots.editor = editorSnapshotValue();
      draftSavedAt = new Date(savedAt).toLocaleTimeString('zh-CN', { hour12: false });
      editorStatus.textContent = `已保存到本地（${draftSavedAt}）。内容仅留在本浏览器，不会上传到 GitHub。`;
      toast('已保存到本地');
      updateStats();
    } catch (error) {
      editorStatus.textContent = `保存失败：${error.message}`;
      toast(`保存失败：${error.message}`, 'err');
    } finally {
      busy(saveLocalBtn, false);
    }
  };

  // ---------------- 统计 ----------------
  const updateStats = () => {
    const text = f.body.value || '';
    const chars = [...text.replace(/\s/g, '')].length;
    const lines = text ? text.split('\n').length : 0;
    const note = draftSavedAt ? ` · 已自动保存 ${draftSavedAt}` : '';
    editorStats.textContent = `正文共 ${chars.toLocaleString('zh-CN')} 字 · ${lines} 行${note}`;
  };

  // ---------------- 分类/标签多选器 ----------------
  const taxonomyPicker = $('#taxonomy-picker');
  const taxonomyPickerBackdrop = $('#taxonomy-picker-backdrop');
  const taxonomySearch = $('#taxonomy-search');
  const taxonomyTitle = $('#taxonomy-picker-title');
  const taxonomyOptionsBox = $('#taxonomy-options');
  const taxonomySelectedBox = $('#taxonomy-selected');
  const taxonomyCount = $('#taxonomy-count');
  const taxonomyCreate = $('#taxonomy-create');

  const taxonomyFields = {
    categories: { input: f.categories, control: $('#f-categories-control'), label: '分类' },
    tags: { input: f.tags, control: $('#f-tags-control'), label: '标签' },
  };
  let taxonomyTarget = null;
  let taxonomySelection = [];

  const uniqueTaxonomy = (values) => {
    const seen = new Set();
    const result = [];
    for (const raw of values || []) {
      const name = String(raw || '').trim().replace(/\s+/g, ' ');
      if (!name || seen.has(name)) continue;
      seen.add(name);
      result.push(name);
    }
    return result;
  };

  const taxonomyValues = (target) => uniqueTaxonomy(taxonomyFields[target].input.value);

  const syncTaxonomyControl = (target) => {
    const field = taxonomyFields[target];
    const vals = taxonomyValues(target);
    field.control.innerHTML = '';
    for (const name of vals) {
      const chip = document.createElement('span');
      chip.className = 'taxonomy-chip';
      chip.textContent = name;
      field.control.append(chip);
    }
  };

  const syncTaxonomyControls = () => {
    Object.keys(taxonomyFields).forEach(syncTaxonomyControl);
  };

  const setTaxonomyValues = (target, values) => {
    const field = taxonomyFields[target];
    field.input.value = uniqueTaxonomy(values).join(', ');
    syncTaxonomyControl(target);
    field.input.dispatchEvent(new window.Event('input', { bubbles: true }));
    field.input.dispatchEvent(new window.Event('change', { bubbles: true }));
  };

  const taxonomyOptions = (target) => {
    // 公开编辑器没有后台文章列表，这里返回空，用户可自行新建
    return [];
  };

  const renderTaxonomyPicker = () => {
    if (!taxonomyTarget) return;
    const field = taxonomyFields[taxonomyTarget];
    const query = taxonomySearch.value.trim().replace(/\s+/g, ' ');
    const folded = query.toLocaleLowerCase();
    taxonomySelectedBox.replaceChildren();
    const selectedLabel = document.createElement('span');
    selectedLabel.textContent = taxonomySelection.length ? `已选 ${taxonomySelection.length} 个${field.label}：` : `尚未选择${field.label}`;
    taxonomySelectedBox.append(selectedLabel);
    for (const name of taxonomySelection) {
      const chip = document.createElement('span');
      chip.className = 'taxonomy-chip';
      chip.textContent = name;
      taxonomySelectedBox.append(chip);
    }
    taxonomyOptionsBox.replaceChildren();
    if (!query) {
      const empty = document.createElement('p');
      empty.className = 'taxonomy-empty';
      empty.textContent = `在上方输入${field.label}名称后按 Enter 新建。`;
      taxonomyOptionsBox.append(empty);
    } else {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'taxonomy-option';
      btn.textContent = `新建「${query}」`;
      taxonomyOptionsBox.append(btn);
      taxonomyCreate.hidden = false;
      taxonomyCreate.onclick = () => {
        taxonomySelection.push(query);
        taxonomySearch.value = '';
        renderTaxonomyPicker();
      };
    }
    taxonomyCount.textContent = `已选 ${taxonomySelection.length} 个`;
  };

  const openTaxonomyPicker = (target) => {
    taxonomyTarget = target;
    const field = taxonomyFields[target];
    taxonomyTitle.textContent = `选择${field.label}`;
    taxonomySelection = uniqueTaxonomy(taxonomyValues(target));
    taxonomySearch.value = '';
    renderTaxonomyPicker();
    taxonomyPicker.hidden = false;
    taxonomyPickerBackdrop.hidden = false;
    taxonomySearch.focus();
  };

  const closeTaxonomyPicker = () => {
    taxonomyPicker.hidden = true;
    taxonomyPickerBackdrop.hidden = true;
    taxonomySearch.value = '';
  };

  const doneTaxonomyPicker = () => {
    if (taxonomyTarget) {
      setTaxonomyValues(taxonomyTarget, taxonomySelection);
    }
    closeTaxonomyPicker();
  };

  // ---------------- 预览模式切换 ----------------
  const setEditorMode = (mode) => {
    writingWorkspace.dataset.mode = mode;
    $$('[data-editor-mode]').forEach((btn) => {
      const on = btn.dataset.editorMode === mode;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', String(on));
    });
    previewNeedsReset = true;
    queuePreview();
  };

  // ---------------- LaTeX 符号搜索 ----------------
  const latexPicker = $('#latex-picker');
  const latexPickerBackdrop = $('#latex-picker-backdrop');
  const latexSearchInput = $('#latex-symbol-search');
  const latexCategoryTabs = $('#latex-category-tabs');
  const latexSymbolGrid = $('#latex-symbol-grid');
  const latexCommandDisplay = $('#latex-symbol-command');
  const latexDetailDisplay = $('#latex-symbol-detail');

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
      category, command, aliases, insert,
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
    ['\\sqrt{}', ['根号', '平方根', '开方', 'sqrt', 'root']],
    ['\\sum', ['求和', 'sigma', 'summation']],
    ['\\int', ['积分', 'integral', 'int']],
    ['\\alpha', ['阿尔法', 'α', 'alpha']],
    ['\\beta', ['贝塔', 'β', 'beta']],
  ]);

  let latexPickerSelection = null;
  let latexPickerCategory = 'all';
  let latexPickerActive = 0;
  let latexPickerResults = [];

  const currentLatexResults = () => {
    if (latexPickerCategory === 'all') return [...latexSymbols];
    return latexSymbols.filter((symbol) => symbol.category === latexPickerCategory);
  };

  const renderLatexPicker = () => {
    latexCategoryTabs.innerHTML = '';
    latexCategories.forEach(([key, name]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'category-tab';
      btn.textContent = name;
      btn.dataset.category = key;
      if (key === latexPickerCategory) {
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
      } else {
        btn.setAttribute('aria-pressed', 'false');
      }
      btn.addEventListener('click', () => {
        latexPickerCategory = key;
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

  const insertLatexSymbol = (symbol) => {
    const start = f.body.selectionStart ?? f.body.value.length;
    const end = f.body.selectionEnd ?? f.body.value.length;
    const before = f.body.value.slice(0, start);
    const after = f.body.value.slice(end);
    f.body.value = before + symbol.insert + after;
    const cursorPos = start + symbol.cursor[0];
    f.body.selectionStart = cursorPos;
    f.body.selectionEnd = start + symbol.cursor[1];
    f.body.focus();
    f.body.dispatchEvent(new window.Event('input', { bubbles: true }));
    closeLatexPicker();
  };

  const openLatexPicker = () => {
    latexPickerSelection = {
      start: f.body.selectionStart ?? f.body.value.length,
      end: f.body.selectionEnd ?? f.body.value.length,
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
    f.body.focus();
  };

  // ---------------- 插入功能 ----------------
  const insertAtCursor = (text) => {
    const start = f.body.selectionStart ?? f.body.value.length;
    const end = f.body.selectionEnd ?? f.body.value.length;
    const before = f.body.value.slice(0, start);
    const after = f.body.value.slice(end);
    f.body.value = before + text + after;
    f.body.selectionStart = start + text.length;
    f.body.selectionEnd = start + text.length;
    f.body.focus();
    f.body.dispatchEvent(new window.Event('input', { bubbles: true }));
  };

  const insertMath = () => insertAtCursor('$$\n\n$$');
  const insertFold = (type) => {
    const title = type === 'info' ? '标题' : '标题';
    insertAtCursor(`:::${type}[${title}]\n\n:::`);
  };
  const insertMore = () => insertAtCursor('\n\n<!-- more -->\n\n');

  // ---------------- 未保存提示 ----------------
  const unsavedWork = () => {
    const pending = [];
    if (editorDirty()) {
      const name = f.title.value.trim() || '未命名文章';
      pending.push(`新建的文章「${name}」`);
    }
    return pending;
  };

  window.addEventListener('beforeunload', (event) => {
    if (editorDirty()) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

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

    // 恢复本地草稿
    loadFromLocal();
    updateStats();

    // 表单字段变化：自动保存 + 预览
    const schedule = () => { scheduleSave(); queuePreview(); };
    f.title.addEventListener('input', schedule);
    f.slug.addEventListener('input', schedule);
    f.date.addEventListener('input', schedule);
    f.categories.addEventListener('input', schedule);
    f.tags.addEventListener('input', schedule);
    f.accent.addEventListener('input', schedule);
    f.description.addEventListener('input', schedule);
    f.sample.addEventListener('change', schedule);
    f.body.addEventListener('input', () => { scheduleSave(); queuePreview(); });

    // 置顶 / 可见性
    $$('[data-pin]').forEach((btn) => {
      btn.addEventListener('click', () => {
        setPinned(btn.dataset.pin === 'on');
        schedule();
        queuePreview();
      });
    });
    $$('[data-visibility]').forEach((btn) => {
      btn.addEventListener('click', () => {
        setVisibility(btn.dataset.visibility);
        schedule();
        queuePreview();
      });
    });

    // 预览模式
    $$('[data-editor-mode]').forEach((btn) => {
      btn.addEventListener('click', () => setEditorMode(btn.dataset.editorMode));
    });

    // 插入功能
    $('#insert-math')?.addEventListener('click', insertMath);
    $('#insert-latex-symbol')?.addEventListener('click', openLatexPicker);
    $('#insert-fold')?.addEventListener('change', (event) => {
      const val = event.target.value;
      if (val) { insertFold(val); event.target.value = ''; }
    });
    $('#insert-plot')?.addEventListener('click', () => {
      insertAtCursor('\n```plot\ntitle: 新函数图\nf: x^2\n```\n');
    });
    $('#insert-graph')?.addEventListener('change', (event) => {
      const val = event.target.value;
      if (val) {
        insertAtCursor(`\n\`\`\`graph\ntitle: 新关系图\nalgo: ${val}\nnode: A\nnode: B\nedge: A -- B\n\`\`\`\n`);
        event.target.value = '';
      }
    });
    $('#insert-more')?.addEventListener('click', insertMore);

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

    $('#close-latex-picker')?.addEventListener('click', closeLatexPicker);
    latexPickerBackdrop?.addEventListener('click', closeLatexPicker);

    // 分类/标签选择器
    taxonomyFields.categories.control?.addEventListener('click', () => openTaxonomyPicker('categories'));
    taxonomyFields.tags.control?.addEventListener('click', () => openTaxonomyPicker('tags'));
    $('#close-taxonomy-picker')?.addEventListener('click', closeTaxonomyPicker);
    taxonomyPickerBackdrop?.addEventListener('click', closeTaxonomyPicker);
    taxonomySearch.addEventListener('input', renderTaxonomyPicker);
    taxonomySearch.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        const q = taxonomySearch.value.trim();
        if (q) {
          taxonomySelection.push(q);
          taxonomySearch.value = '';
          renderTaxonomyPicker();
        }
      }
    });
    $('#cancel-taxonomy-picker')?.addEventListener('click', closeTaxonomyPicker);
    $('#done-taxonomy-picker')?.addEventListener('click', doneTaxonomyPicker);

    // 按钮
    backBtn?.addEventListener('click', () => {
      if (editorDirty()) {
        const name = f.title.value.trim() || '未命名文章';
        const ok = confirmDialog('有未保存的内容', `文章「${name}」有未保存的修改，确定离开吗？`, '离开');
        if (!ok) return;
      }
      window.location.href = '/';
    });
    downloadBtn?.addEventListener('click', downloadMd);
    clearBtn?.addEventListener('click', clearLocal);
    deleteLocalBtn?.addEventListener('click', deleteLocalDraft);
    saveLocalBtn?.addEventListener('click', saveLocal);

    // 模态框
    $('#modal-cancel')?.addEventListener('click', () => { modal.hidden = true; modal._busy = false; });
    $('#modal-ok')?.addEventListener('click', () => { modal.hidden = true; modal._busy = false; });

    // 初始化状态
    setVisibility('public');
    setPinned(false);
    f.date.value = toDatetimeLocal(new Date());

    // 等待预览组件就绪
    waitForPreviewReady(() => {
      updatePreview();
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 暴露给 window，方便调试
  window.MinxiPublicEditor = {
    getDraft: () => f.body.value,
    saveToLocal,
    clearLocal,
    downloadMd,
  };
})();
