'use strict';

/*
 * 访客登录与评论（纯静态站点）
 * --------------------------------------------------------------
 * 唯一站长（后台管理员）与访客共用同一套 GitHub 用户名规则，但权限完全分开：
 *  - 访客登录：GitHub 用户名 + 图形验证码，只在浏览器里建立本地会话，用于评论/点赞的门禁；
 *  - 后台登录：仍然只认 GitHub 令牌经 /user 验证后的账号，且必须在 admin.js 的
 *    allowedLogins 里（目前只有 lscminxi）并拥有仓库写权限。访客登录绝不授予后台权限。
 *
 * 注意：纯静态 GitHub Pages 没有服务器，无法安全保存 OAuth client_secret，
 * 因此访客登录只校验「该 GitHub 用户名真实存在」（GitHub 公开 API），并不索要密码或令牌。
 * 它不能被当作强身份认证；真正有权限边界的是后台（令牌 + 允许名单 + GitHub 写权限）。
 */

const OWNER_LOGIN = 'lscminxi';
const AUTH_STORAGE_KEY = 'minxi.auth.user';
const COMMENTS_STORAGE_KEY = 'minxi.comments.v1';
const MAX_COMMENT_LENGTH = 500;
const CAPTCHA_LENGTH = 4;
// 去掉易混淆字符（0/O、1/I/L）的验证码字符集。
const CAPTCHA_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** GitHub 用户名规则：1–39 位，字母/数字/单个连字符，不能以连字符开头或结尾。 */
function normalizeLogin(value) {
  if (typeof value !== 'string') return '';
  const login = value.trim().replace(/^@+/, '');
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(login)) return '';
  return login;
}

function isOwnerLogin(value) {
  const login = normalizeLogin(value);
  return Boolean(login) && login.toLowerCase() === OWNER_LOGIN;
}

/** 生成图形验证码文本；random 可注入，便于回归测试。 */
function makeCaptchaCode(random = Math.random) {
  let code = '';
  for (let i = 0; i < CAPTCHA_LENGTH; i += 1) {
    const index = Math.min(
      CAPTCHA_ALPHABET.length - 1,
      Math.floor(Math.max(0, Math.min(0.999999, random())) * CAPTCHA_ALPHABET.length),
    );
    code += CAPTCHA_ALPHABET[index];
  }
  return code;
}

function captchaMatches(input, expected) {
  if (typeof input !== 'string' || typeof expected !== 'string' || !expected) return false;
  return input.trim().toUpperCase() === expected.trim().toUpperCase();
}

/** 评论正文：去首尾空白、限制长度；渲染时一律用 textContent，绝不拼 HTML。 */
function normalizeCommentText(value) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, MAX_COMMENT_LENGTH);
}

/** 从一条本地会话记录里取出可信字段，坏数据一律丢弃。 */
function normalizeSession(value) {
  if (!value || typeof value !== 'object') return null;
  const login = normalizeLogin(value.login);
  if (!login) return null;
  const avatarUrl = typeof value.avatarUrl === 'string' && /^https:\/\/[^\s"'<>\\()]+$/.test(value.avatarUrl)
    ? value.avatarUrl
    : `https://github.com/${login}.png?size=80`;
  const name = typeof value.name === 'string' ? value.name.trim().slice(0, 80) : '';
  return { login, avatarUrl, name, loggedInAt: Number(value.loggedInAt) || 0 };
}

module.exports = {
  OWNER_LOGIN,
  AUTH_STORAGE_KEY,
  COMMENTS_STORAGE_KEY,
  MAX_COMMENT_LENGTH,
  CAPTCHA_LENGTH,
  CAPTCHA_ALPHABET,
  normalizeLogin,
  isOwnerLogin,
  makeCaptchaCode,
  captchaMatches,
  normalizeCommentText,
  normalizeSession,
};
