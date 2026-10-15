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
});

const MAX_URL_LENGTH = 2000;

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
  wallpaper: '页面壁纸地址。留空表示不使用壁纸，恢复纯色深色背景。',
  favicon: '浏览器标签页图标地址。默认 /images/favicon.svg。',
  wallpaperDim: '壁纸压暗程度：数值越大壁纸越暗、正文越清晰。0 表示完全不压暗。',
  wallpaperBlur: '壁纸模糊半径（px）。0 表示不模糊；数值较大时更柔和但更耗性能。',
});

module.exports = {
  DEFAULTS,
  FIELD_HINTS,
  isSafeImageUrl,
  resolveAppearance,
  faviconType,
  cssImage,
  veilAlpha,
};
