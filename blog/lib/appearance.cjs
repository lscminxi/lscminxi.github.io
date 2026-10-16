'use strict';

/*
 * 外观设置（头像 / 壁纸 / 网页图标）
 * --------------------------------------------------------------
 * 唯一数据源：source/_data/appearance.json
 *  - 构建时（Hexo 模板 / 生成器）读取它，写入页面 <link rel="icon">、头像 <img> 与壁纸 CSS 变量；
 *  - 在线后台（/admin/）通过 GitHub Contents API 编辑它，因此只有拥有仓库写权限的 admin 能修改；
 *  - 这个模块同时被主题脚本（Node）和后台页面（浏览器，经 esbuild 打包）使用，
 *    保证前台渲染与后台校验使用同一套规则。
 *
 * 这里的 URL 会被写进 HTML 属性和 CSS 的 url("…")，所以必须做严格校验：
 * 只接受 http(s) 绝对地址或站内根路径（/images/…），拒绝 javascript:、data:、引号、
 * 括号、反斜杠、空白与控制字符，从而杜绝样式/标记注入。
 */

const DEFAULTS = Object.freeze({
  avatar: '',
  wallpaper: '',
  favicon: '/images/favicon.svg',
  wallpaperDim: 62, // 0–95：壁纸压暗程度（百分比），保证深色主题下的可读性
  wallpaperBlur: 0, // 0–20：壁纸模糊半径（px）
  wallpapers: Object.freeze([]), // 访客可自选的壁纸库；站点默认壁纸由 wallpaper 决定
});

const MAX_URL_LENGTH = 2000;
const MAX_WALLPAPERS = 48; // 壁纸库上限：访客端一次最多展示这么多张
const MAX_LABEL_LENGTH = 48;
const MAX_ID_LENGTH = 64;

// 访客自己选择的背景只保存在浏览器里（localStorage），不提交任何东西到仓库。
const VISITOR_STORAGE_KEY = 'minxi.wallpaper';
const VISITOR_MODES = Object.freeze(['default', 'none', 'gallery', 'custom']);

const FAVICON_TYPES = Object.freeze({
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
});

/**
 * 是否是可以安全写进 HTML / CSS 的图片地址。
 * 允许：https://… / http://… 以及站内根路径 /…（不含协议相对地址 //…）。
 */
function isSafeImageUrl(value) {
  if (typeof value !== 'string') return false;
  const url = value.trim();
  if (!url || url.length > MAX_URL_LENGTH) return false;
  // 空白、引号、尖括号、括号、反斜杠、控制字符一律拒绝（CSS/HTML 注入风险）。
  if (/[\s"'<>\\()]/.test(url)) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(url)) return false;
  if (url.startsWith('//')) return false;
  if (url.startsWith('/')) return url.length > 1;
  return /^https?:\/\/[^\s]+$/i.test(url);
}

const normalizeUrl = (value) => (isSafeImageUrl(value) ? value.trim() : '');

function clampNumber(value, min, max, fallback) {
  const number = typeof value === 'string' ? Number(value.trim()) : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

/* ------------------------------------------------------------------
   壁纸库（可选背景）
   ------------------------------------------------------------------
   管理员在「外观」里维护一个列表，访客可以在页面上自由挑一张当背景。
   选择只写进访客自己的 localStorage，因此：
     - 每个访客的页面可以不一样，互相不影响；
     - 不会产生任何 GitHub 提交，静态站点保持不变；
     - 管理员「下架」一张（从列表删除）后，选过它的访客会自动回落到站点默认壁纸。
   ------------------------------------------------------------------ */

/** 由地址推导出稳定的壁纸 id：同一张图重复加入时 id 不变，访客的选择因此可以保留。 */
function wallpaperId(url) {
  const clean = typeof url === 'string' ? url.trim() : '';
  const base = (clean.split(/[?#]/)[0].split('/').pop() || '').replace(/\.[a-z0-9]+$/i, '');
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  let hash = 5381;
  for (let index = 0; index < clean.length; index += 1) {
    hash = ((hash * 33) ^ clean.charCodeAt(index)) >>> 0;
  }
  return `${slug || 'wallpaper'}-${hash.toString(36)}`;
}

/** 名称只作为纯文本显示，这里去掉控制字符、折叠空白并限制长度。 */
function cleanLabel(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LABEL_LENGTH);
}

/** id 会写进 HTML 属性并用于比较，限制在 [a-z0-9_-]。 */
function cleanId(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_ID_LENGTH);
}

/**
 * 清洗壁纸库：丢掉非法地址、重复地址与畸形条目，补齐缺失的 id。
 * 手写 JSON 只填 url（甚至只填 label+url）也能正常工作。
 */
function resolveWallpaperGallery(input, options = {}) {
  const max = clampNumber(options.max, 1, MAX_WALLPAPERS, MAX_WALLPAPERS);
  const list = Array.isArray(input) ? input : [];
  const out = [];
  const seenUrls = new Set();
  const seenIds = new Set();
  for (const item of list) {
    if (out.length >= max) break;
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const url = normalizeUrl(item.url ?? item.image ?? item.src);
    if (!url || seenUrls.has(url)) continue;
    seenUrls.add(url);
    let id = cleanId(item.id) || wallpaperId(url);
    if (seenIds.has(id)) id = wallpaperId(url); // 手工填了重复 id 时按地址重新推导
    if (seenIds.has(id)) {
      id = `${id}-${out.length}`;
    }
    seenIds.add(id);
    out.push({ id, url, label: cleanLabel(item.label ?? item.title ?? item.name) });
  }
  return out;
}

/** 去掉访客选择里的多余字段，并保证地址合法；非法返回 null（等价于恢复默认）。 */
function normalizeVisitorChoice(input) {
  if (typeof input === 'string') input = { mode: 'custom', url: input };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const mode = VISITOR_MODES.includes(input.mode)
    ? input.mode
    : normalizeUrl(input.url)
      ? 'custom'
      : 'default';
  const choice = { mode };
  const id = cleanId(input.id);
  if (mode === 'gallery' && id) choice.id = id;
  const url = normalizeUrl(input.url);
  if (url) choice.url = url;
  if (mode === 'custom' && !url) return null;
  if (mode === 'gallery' && !id && !url) return null;
  // 压暗 / 模糊允许访客自己微调；没填就跟随站点默认值。
  for (const [key, min, max] of [
    ['dim', 0, 95],
    ['blur', 0, 20],
  ]) {
    const value = input[key];
    if (value === undefined || value === null || value === '') continue;
    const number = Number(value);
    if (!Number.isFinite(number)) continue;
    choice[key] = Math.min(max, Math.max(min, Math.round(number)));
  }
  return choice;
}

/**
 * 计算访客此刻真正应该看到的背景。
 * @param {unknown} stored  localStorage 里保存的选择（可能是旧格式或被手工改坏）
 * @param {Array} gallery  当前壁纸库（已清洗）
 * @param {{wallpaper?: string, wallpaperDim?: number, wallpaperBlur?: number}} site 站点默认外观
 * @param {{ready?: boolean}} [options] ready=false 表示壁纸库还没读到（首屏），
 *        这时仍然使用访客本地记下的地址，避免先闪一下默认壁纸。
 * @returns {{mode: string, id: string, url: string, label: string, dim: number, blur: number}}
 *  mode: default（站点默认壁纸）/ none（纯色深色背景）/ gallery（壁纸库）/ custom（访客自己填的外链）
 *  站点没有配置壁纸时，default 等价于 none（url 为空）。
 */
function resolveVisitorWallpaper(stored, gallery = [], site = {}, options = {}) {
  const ready = options.ready !== false;
  const list = Array.isArray(gallery) ? gallery : [];
  const dim = clampNumber(site.wallpaperDim, 0, 95, DEFAULTS.wallpaperDim);
  const blur = clampNumber(site.wallpaperBlur, 0, 20, DEFAULTS.wallpaperBlur);
  const fallback = normalizeUrl(site.wallpaper);
  const siteDefault = () =>
    fallback
      ? { mode: 'default', id: '', url: fallback, label: '', dim, blur }
      : { mode: 'none', id: '', url: '', label: '', dim, blur };
  const choice = normalizeVisitorChoice(stored) || { mode: 'default' };

  if (choice.mode === 'gallery') {
    const entry =
      list.find((item) => item && item.id === choice.id) ||
      (!choice.id && choice.url ? list.find((item) => item && item.url === choice.url) : null);
    if (entry) {
      return {
        mode: 'gallery',
        id: entry.id,
        url: entry.url,
        label: entry.label || '',
        dim: choice.dim ?? dim,
        blur: choice.blur ?? blur,
      };
    }
    // 壁纸库还没加载完（脚本在 <head> 中先跑）：先用本地记下的地址。
    if (!ready) {
      const url = normalizeUrl(choice.url);
      if (url) {
        return { mode: 'gallery', id: choice.id || '', url, label: '', dim: choice.dim ?? dim, blur: choice.blur ?? blur };
      }
    }
    // 已被管理员下架（或 id 失效）：回落到站点默认壁纸。
    return siteDefault();
  }

  if (choice.mode === 'custom') {
    return { mode: 'custom', id: '', url: choice.url, label: '', dim: choice.dim ?? dim, blur: choice.blur ?? blur };
  }

  if (choice.mode === 'none') {
    return { mode: 'none', id: '', url: '', label: '', dim, blur };
  }

  // 站点默认壁纸：允许访客只调压暗 / 模糊，不换图。
  const base = siteDefault();
  return { ...base, dim: choice.dim ?? base.dim, blur: choice.blur ?? base.blur };
}

/**
 * 把任意（可能被手工改坏、甚至恶意构造的）输入整理成可信的外观设置。
 * 缺失或不合法的字段会回落到默认值，绝不抛出异常，保证构建永远可用。
 */
function resolveAppearance(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const avatar = normalizeUrl(source.avatar);
  const wallpaper = normalizeUrl(source.wallpaper);
  const favicon = normalizeUrl(source.favicon) || DEFAULTS.favicon;
  return {
    avatar,
    wallpaper,
    favicon,
    wallpaperDim: clampNumber(source.wallpaperDim, 0, 95, DEFAULTS.wallpaperDim),
    wallpaperBlur: clampNumber(source.wallpaperBlur, 0, 20, DEFAULTS.wallpaperBlur),
    wallpapers: resolveWallpaperGallery(source.wallpapers),
  };
}

/** 由文件扩展名推断 <link rel="icon"> 的 type；无法判断时返回空字符串（浏览器自行判断）。 */
function faviconType(url) {
  if (!isSafeImageUrl(url)) return '';
  const match = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(url.trim());
  return match ? FAVICON_TYPES[match[1].toLowerCase()] || '' : '';
}

/** 生成 CSS 的 background-image 值；地址始终放在引号里，且已在 isSafeImageUrl 中排除引号。 */
function cssImage(url) {
  return isSafeImageUrl(url) ? `url("${url.trim()}")` : 'none';
}

/** 壁纸压暗层的透明度（保留两位小数，写进 CSS 变量）。 */
function veilAlpha(dim) {
  return (clampNumber(dim, 0, 95, DEFAULTS.wallpaperDim) / 100).toFixed(2);
}

/** 后台 / 文档里用于展示的字段说明。 */
const FIELD_HINTS = Object.freeze({
  avatar: '头像图片地址。可以填 https:// 外链，也可以先用「图片」标签页上传，再填 /images/文件名。',
  wallpaper: '页面壁纸地址（站点默认壁纸）。留空表示不使用壁纸，恢复纯色深色背景。',
  favicon: '浏览器标签页图标地址。默认 /images/favicon.svg。',
  wallpaperDim: '壁纸压暗程度：数值越大壁纸越暗、正文越清晰。0 表示完全不压暗。',
  wallpaperBlur: '壁纸模糊半径（px）。0 表示不模糊；数值较大时更柔和但更耗性能。',
  wallpapers: '访客可自选的背景列表。只有登录后台的 admin 能增删；访客的选择只存在自己的浏览器里。',
});

module.exports = {
  DEFAULTS,
  FIELD_HINTS,
  MAX_WALLPAPERS,
  MAX_LABEL_LENGTH,
  VISITOR_STORAGE_KEY,
  VISITOR_MODES,
  isSafeImageUrl,
  resolveAppearance,
  resolveWallpaperGallery,
  normalizeVisitorChoice,
  resolveVisitorWallpaper,
  wallpaperId,
  faviconType,
  cssImage,
  veilAlpha,
};
