/*
 * 访客端主题（浅色 / 深色）
 * --------------------------------------------------------------
 * 由 tools/build-assets.mjs 打包成 /js/theme.js，在 <head> 里同步加载：
 *
 *   1. 立刻在 <html> 上写好 data-theme（早于样式表解析，不会先闪一下深色）；
 *   2. 页面加载后读取公开的 /appearance.json，取站点的默认主题（auto / light / dark）；
 *   3. 接线顶栏的切换按钮与「外观」里的三选一（跟随系统 / 浅色 / 深色）。
 *
 * 访客的选择只写进自己的 localStorage（键名 minxi.theme）：
 *   - 不产生任何 GitHub 提交，站点文件完全不变；
 *   - 每个访客、每台设备互不影响；
 *   - 没有选择过时跟随站点默认值，站点设为 auto 时再跟随系统偏好，并实时响应系统切换。
 */
import appearance from '../lib/appearance.cjs';
import { appearanceJson, appearanceDataUrl } from './data.js';

const KEY = appearance.THEME_STORAGE_KEY;
const root = document.documentElement;
const media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: light)') : null;
const DARK_COLOR = '#0b0e14';
const LIGHT_COLOR = '#f5f7fa';

const prefersLight = () => Boolean(media && media.matches);

function read() {
  try {
    return appearance.normalizeThemeChoice(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

function write(value) {
  try {
    if (value) localStorage.setItem(KEY, value);
    else localStorage.removeItem(KEY);
  } catch {
    /* 隐私模式 / 存储被禁用时忽略：只是记不住选择，页面照常显示 */
  }
}

let choice = read(); // 'light' | 'dark' | null（null = 没选过，跟随默认值）
let siteDefault = appearance.normalizeTheme(root.dataset.themeDefault || 'auto'); // 站点默认主题

/** 当前应该显示的主题（结合访客选择、站点默认值与系统偏好）。 */
const computeTheme = () => appearance.resolveTheme(choice, siteDefault, prefersLight());

/** 顶栏图标与「外观」里的三选一保持一致，并让按钮在没有脚本时不出现。 */
function paintUi() {
  if (typeof document === 'undefined') return;
  const resolved = root.dataset.theme;
  document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
    button.hidden = false;
    const target = resolved === 'dark' ? '浅色' : '深色';
    const label = `切换到${target}模式`;
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
    button.dataset.themeTarget = resolved === 'dark' ? 'light' : 'dark';
    button.querySelectorAll('[data-theme-icon]').forEach((icon) => {
      icon.hidden = icon.dataset.themeIcon !== resolved;
    });
  });
  document.querySelectorAll('[data-theme-option]').forEach((button) => {
    const active = button.dataset.themeOption === (choice || 'auto');
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

/** 写入 <html data-theme="…">、同步 theme-color，并刷新按钮状态。 */
function apply() {
  const resolved = computeTheme();
  root.dataset.theme = resolved;
  root.dataset.themeChoice = choice || 'auto';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    let background = '';
    try {
      background = getComputedStyle(root).getPropertyValue('--bg').trim();
    } catch {
      background = '';
    }
    meta.setAttribute('content', background || (resolved === 'light' ? LIGHT_COLOR : DARK_COLOR));
  }
  paintUi();
  return resolved;
}

/** 设置主题模式：'auto'（跟随系统）/ 'light' / 'dark'。 */
function set(mode) {
  const normalized = appearance.normalizeTheme(mode);
  choice = normalized === 'auto' ? null : normalized;
  write(choice);
  return apply();
}

/** 顶栏按钮：在浅色 / 深色之间切换（想跟随系统就用「外观」里的「跟随系统」）。 */
function cycle() {
  return set(computeTheme() === 'dark' ? 'light' : 'dark');
}

// 1) 首帧：脚本在 <head> 中同步执行，先定下主题，避免闪一下深色。
apply();

// 2) 跟随系统偏好实时变化（只对「没选过主题」的访客生效）。
if (media) {
  const onChange = () => {
    if (!choice) apply();
  };
  if (typeof media.addEventListener === 'function') media.addEventListener('change', onChange);
  else if (typeof media.addListener === 'function') media.addListener(onChange);
}

// 3) 接线：顶栏切换按钮 + 「外观」里的三选一。
function wire() {
  document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
    button.addEventListener('click', () => cycle());
  });
  document.querySelectorAll('[data-theme-option]').forEach((button) => {
    button.addEventListener('click', () => set(button.dataset.themeOption));
  });
  apply();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
else wire();

// 4) 站点默认主题可能在 HTML 缓存之后被站长改过，加载完成后读一次公开配置再校正。
const syncSiteDefault = () => {
  appearanceJson(appearanceDataUrl()).then((data) => {
    if (!data) return;
    const next = appearance.normalizeTheme(data.theme);
    if (next === siteDefault) return;
    siteDefault = next;
    // 访客自己选过就保持不动，只影响「跟随默认值」的人。
    if (!choice) apply();
  });
};
if (document.readyState === 'complete') syncSiteDefault();
else window.addEventListener('load', syncSiteDefault, { once: true });

window.MinxiTheme = {
  key: KEY,
  modes: appearance.THEME_MODES,
  apply,
  set,
  cycle,
  paintUi,
  current: () => choice || 'auto',
  resolved: () => root.dataset.theme || 'dark',
  siteDefault: () => siteDefault,
  reset: () => set('auto'),
};
