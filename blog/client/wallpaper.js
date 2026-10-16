/*
 * 访客端背景选择器
 * --------------------------------------------------------------
 * 这个文件由 tools/build-assets.mjs 打包成 /js/wallpaper.js，在 <head> 里同步加载：
 *
 *   1. 立刻应用访客上次选的背景（在第一次绘制前，避免先闪一下默认壁纸）；
 *   2. 之后从公开的 /appearance.json 读取管理员维护的壁纸库；
 *   3. 接线「选择背景」对话框，让任何访客都能自由换背景。
 *
 * 访客的选择只写进自己的 localStorage（键名 minxi.wallpaper）：
 *   - 不产生任何 GitHub 提交，静态站点与后端文件完全不变；
 *   - 每个访客、每台设备互不影响；
 *   - 管理员把某张图从壁纸库下架后，选过它的访客会自动回落到站点默认壁纸。
 * 地址校验与站点构建共用 lib/appearance.cjs 的同一套规则。
 */
import appearance from '../lib/appearance.cjs';

const KEY = appearance.VISITOR_STORAGE_KEY;
const root = document.documentElement;

const numberOr = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

// 构建时渲染在 <html> 上的状态（layout.ejs）：恢复「站点默认」时原样还原，不需要联网。
const initial = {
  wallpaper: root.dataset.wallpaper || '',
  blur: root.dataset.wallpaperBlur || '',
};
const server = {
  wallpaper: root.dataset.wallpaperSrc || '',
  dim: numberOr(root.dataset.wallpaperDim, appearance.DEFAULTS.wallpaperDim),
  blur: numberOr(root.dataset.wallpaperBlurpx, appearance.DEFAULTS.wallpaperBlur),
};
// 站点默认外观。读到 /appearance.json 后会用最新值覆盖（HTML 可能来自浏览器缓存）。
const siteDefaults = { wallpaper: server.wallpaper, wallpaperDim: server.dim, wallpaperBlur: server.blur };

let gallery = [];
let galleryReady = false;
let galleryPromise = null;
let current = { mode: 'default', id: '', url: '', label: '', dim: siteDefaults.wallpaperDim, blur: siteDefaults.wallpaperBlur };

/* ---------------- 本地存储 ---------------- */

function readStored() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw; // 旧格式（直接存地址）也能识别
    }
  } catch {
    return null;
  }
}

function writeStored(value) {
  try {
    if (value) localStorage.setItem(KEY, JSON.stringify(value));
    else localStorage.removeItem(KEY);
  } catch {
    /* 隐私模式 / 存储被禁用时忽略：只是记不住选择，页面照常显示 */
  }
}

/* ---------------- 应用到页面 ---------------- */

function clearInline() {
  root.style.removeProperty('--wallpaper-image');
  root.style.removeProperty('--wallpaper-veil');
  root.style.removeProperty('--wallpaper-blur');
}

function restoreServerState() {
  clearInline();
  if (initial.wallpaper) root.dataset.wallpaper = initial.wallpaper;
  else delete root.dataset.wallpaper;
  if (initial.blur) root.dataset.wallpaperBlur = initial.blur;
  else delete root.dataset.wallpaperBlur;
}

function paint() {
  if (
    current.mode === 'default' &&
    current.url === server.wallpaper &&
    current.dim === server.dim &&
    current.blur === server.blur
  ) {
    // 与构建产物一致：直接用服务端渲染的值，不写内联样式。
    restoreServerState();
    return;
  }
  if (!current.url) {
    // 纯色深色背景：关掉整层壁纸（main.css 只在 html[data-wallpaper="on"] 时显示）。
    delete root.dataset.wallpaper;
    delete root.dataset.wallpaperBlur;
    clearInline();
    return;
  }
  root.style.setProperty('--wallpaper-image', appearance.cssImage(current.url));
  root.style.setProperty('--wallpaper-veil', appearance.veilAlpha(current.dim));
  root.style.setProperty('--wallpaper-blur', `${current.blur}px`);
  root.dataset.wallpaper = 'on';
  if (current.blur > 0) root.dataset.wallpaperBlur = 'on';
  else delete root.dataset.wallpaperBlur;
}

/** 按当前壁纸库重新计算并应用一个选择；返回真正生效的状态。 */
function apply(choice, { ready = galleryReady } = {}) {
  current = appearance.resolveVisitorWallpaper(choice, gallery, siteDefaults, { ready });
  paint();
  renderDialog();
  return current;
}

/** 访客做出选择：校验 → 存进本地 → 立即生效。非法地址返回 null，什么都不改。 */
function select(choice) {
  const normalized = appearance.normalizeVisitorChoice(choice);
  if (!normalized) return null;
  // 壁纸库里的图同时记下 id 和地址：id 让「下架」能被识别，地址让首屏无需等网络。
  writeStored(normalized);
  return apply(normalized, { ready: galleryReady });
}

/* ---------------- 壁纸库 ---------------- */

function appearanceDataUrl() {
  const dialog = document.getElementById('wallpaper-dialog');
  return dialog?.dataset.appearance || '/appearance.json';
}

function loadGallery({ force = false } = {}) {
  if (galleryPromise && !force) return galleryPromise;
  const url = appearanceDataUrl();
  galleryPromise = fetch(url, { cache: 'no-cache' })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((data) => {
      const look = appearance.resolveAppearance(data);
      gallery = look.wallpapers;
      galleryReady = true;
      // 最新发布的站点默认值（构建产物与这份 JSON 是同一次构建生成的）。
      siteDefaults.wallpaper = look.wallpaper;
      siteDefaults.wallpaperDim = look.wallpaperDim;
      siteDefaults.wallpaperBlur = look.wallpaperBlur;
      // 壁纸库就绪后重新判断一次：管理员下架的图在这里回落到站点默认壁纸。
      apply(readStored());
      setStatus(gallery.length ? '' : '管理员还没有添加可选背景，你仍然可以使用下面的自定义外链。');
      return gallery;
    })
    .catch(() => {
      galleryPromise = null;
      setStatus('暂时无法读取背景列表（网络或缓存问题）。你仍然可以使用自定义外链或恢复默认。', 'err');
      return gallery;
    });
  return galleryPromise;
}

/* ---------------- 对话框 ---------------- */

const $ = (selector) => (typeof document === 'undefined' ? null : document.querySelector(selector));

function setStatus(message, kind = '') {
  const status = $('#wallpaper-status');
  if (!status) return;
  status.textContent = message || '';
  status.className = `wallpaper-status ${kind}`.trim();
  status.hidden = !message;
}

function tile({ mode, id = '', url = '', label = '' }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'wallpaper-tile';
  button.dataset.mode = mode;
  if (id) button.dataset.id = id;
  if (url) button.dataset.url = url;

  const frame = document.createElement('span');
  frame.className = 'wallpaper-thumb';
  if (url) {
    const image = document.createElement('img');
    image.src = url;
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => {
      image.remove();
      frame.classList.add('wallpaper-thumb--failed');
      frame.textContent = label || '图片无法加载';
    });
    frame.append(image);
  } else {
    frame.classList.add('wallpaper-thumb--plain');
  }

  const name = document.createElement('span');
  name.className = 'wallpaper-name';
  name.textContent = label || (mode === 'default' ? '站点默认' : mode === 'none' ? '不使用图片' : '未命名');
  button.append(frame, name);
  button.addEventListener('click', () => choose({ mode, id, url }));
  return button;
}

/**
 * 把访客自己调过的压暗 / 模糊一起记住。
 * 没调过就不写进本地记录，这样以后站长改默认值时访客能跟着更新。
 */
function withTuning(choice) {
  const tuned = current.dim !== siteDefaults.wallpaperDim || current.blur !== siteDefaults.wallpaperBlur;
  if (tuned) {
    choice.dim = current.dim;
    choice.blur = current.blur;
  }
  return choice;
}

/** 选中一张图：保留访客当前的压暗 / 模糊设置。 */
function choose({ mode, id = '', url = '' }) {
  const next = withTuning({ mode, id, url });
  if (mode === 'gallery' && !url) {
    const entry = gallery.find((item) => item.id === id);
    if (!entry) return;
    next.url = entry.url;
  }
  if (mode === 'default' || mode === 'none') {
    delete next.id;
    delete next.url;
    delete next.dim;
    delete next.blur;
  }
  if (select(next)) {
    setStatus('已保存到你自己的浏览器，只影响这台设备。', 'ok');
  } else {
    setStatus('这个地址不可用，请换一个 https:// 外链或站内 / 路径。', 'err');
  }
}

function renderDialog() {
  const grid = $('#wallpaper-grid');
  if (!grid) return;
  const previous = [...grid.querySelectorAll('.wallpaper-tile')];
  const focusedIndex = previous.indexOf(document.activeElement?.closest?.('.wallpaper-tile'));
  grid.textContent = '';

  if (siteDefaults.wallpaper) {
    grid.append(tile({ mode: 'default', url: siteDefaults.wallpaper, label: '站点默认' }));
  }
  for (const entry of gallery) grid.append(tile({ mode: 'gallery', id: entry.id, url: entry.url, label: entry.label }));
  grid.append(tile({ mode: 'none', label: '纯色背景' }));

  const tiles = [...grid.querySelectorAll('.wallpaper-tile')];
  for (const button of tiles) {
    const active = isActiveTile(button);
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  if (focusedIndex >= 0) tiles[focusedIndex]?.focus();

  const dim = $('#wallpaper-dim');
  const blur = $('#wallpaper-blur');
  if (dim) {
    dim.value = String(current.dim);
    const output = $('#wallpaper-dim-value');
    if (output) output.textContent = `${current.dim}%`;
  }
  if (blur) {
    blur.value = String(current.blur);
    const output = $('#wallpaper-blur-value');
    if (output) output.textContent = `${current.blur}px`;
  }
  const hint = $('#wallpaper-current');
  if (hint) {
    hint.textContent = current.url
      ? `当前背景：${current.label || (current.mode === 'custom' ? current.url : current.mode === 'default' ? '站点默认' : '已选图片')}（仅保存在这台设备）`
      : '当前背景：纯色深色背景（仅保存在这台设备）';
  }
  const url = $('#wallpaper-url');
  if (url) url.value = current.mode === 'custom' ? current.url : '';
}

/** 这张图是不是访客当前正在用的背景（用于高亮）。 */
function isActiveTile(button) {
  const mode = button.dataset.mode;
  if (mode === 'none' || mode === 'default') return current.mode === mode;
  if (mode !== 'gallery' || current.mode !== 'gallery') return false;
  if (button.dataset.id && current.id) return button.dataset.id === current.id;
  return button.dataset.url === current.url;
}

function openDialog() {
  const dialog = $('#wallpaper-dialog');
  if (!dialog) return;
  if (!dialog.open) {
    // 现代浏览器都有 showModal；缺失时退化成普通显示，功能不受影响。
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }
  renderDialog();
  loadGallery();
  $('#close-wallpaper')?.focus();
}

function closeDialog() {
  const dialog = $('#wallpaper-dialog');
  if (!dialog?.open) return;
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}

/** 把滑块（压暗 / 模糊）即时应用到当前背景，并记住。 */
function tune(patch) {
  const dim = patch.dim ?? current.dim;
  const blur = patch.blur ?? current.blur;
  const next = { mode: current.mode, id: current.id, url: current.url, dim, blur };
  if (current.mode === 'default' || current.mode === 'none') {
    delete next.id;
    delete next.url;
    next.dim = dim;
    next.blur = blur;
  }
  select(next);
}

function wireDialog() {
  const dialog = $('#wallpaper-dialog');
  if (!dialog) return;
  renderDialog();
  document.querySelectorAll('[data-open-wallpaper]').forEach((button) => {
    button.hidden = false; // 没有脚本时按钮没有意义，这里才显示
    button.addEventListener('click', () => openDialog());
  });
  $('#close-wallpaper')?.addEventListener('click', closeDialog);
  $('#wallpaper-done')?.addEventListener('click', closeDialog);
  $('#wallpaper-reset')?.addEventListener('click', () => {
    writeStored(null);
    apply(null, { ready: galleryReady });
    setStatus('已恢复站点默认背景。', 'ok');
  });
  $('#wallpaper-url-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = $('#wallpaper-url');
    const value = input?.value.trim() || '';
    if (!value) return setStatus('请先粘贴图片地址。', 'err');
    const chosen = select(withTuning({ mode: 'custom', url: value }));
    if (!chosen) return setStatus('只接受 https:// / http:// 外链或以 / 开头的站内路径，且不能包含引号、括号或空格。', 'err');
    input.value = chosen.url;
    setStatus('已使用你填写的地址，只影响这台设备。', 'ok');
  });
  const dim = $('#wallpaper-dim');
  dim?.addEventListener('input', () => tune({ dim: Number(dim.value) }));
  const blur = $('#wallpaper-blur');
  blur?.addEventListener('input', () => tune({ blur: Number(blur.value) }));
  dialog.addEventListener('click', (event) => {
    const bounds = dialog.getBoundingClientRect();
    if (
      event.target === dialog &&
      (event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom)
    ) {
      closeDialog();
    }
  });
  document.addEventListener('keydown', (event) => {
    // 快捷键 B：打开背景选择（输入框里输入、或搜索框已经打开时不触发）。
    if (event.key !== 'b' && event.key !== 'B') return;
    if (event.ctrlKey || event.metaKey || event.altKey || dialog.open) return;
    if (document.querySelector('#search-dialog')?.open) return;
    if (event.target?.closest?.('input, textarea, [contenteditable="true"]')) return;
    event.preventDefault();
    openDialog();
  });
}

/* ---------------- 启动 ---------------- */

// 1) 先把访客的选择画上去（脚本在 <head> 中同步执行，早于第一次绘制）。
apply(readStored(), { ready: false });

// 2) 页面加载后再读一次壁纸库：管理员下架图片后，这里会自动回落。
const loadWhenIdle = () => loadGallery();
if (document.readyState === 'complete') loadWhenIdle();
else window.addEventListener('load', loadWhenIdle, { once: true });

// 3) 对话框接线。
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireDialog);
else wireDialog();

window.MinxiWallpaper = {
  key: KEY,
  apply,
  select,
  tune,
  readStored,
  writeStored,
  loadGallery,
  openDialog,
  closeDialog,
  current: () => ({ ...current }),
  gallery: () => gallery.map((entry) => ({ ...entry })),
  siteDefaults: () => ({ ...siteDefaults }),
  reset: () => {
    writeStored(null);
    return apply(null, { ready: galleryReady });
  },
};
