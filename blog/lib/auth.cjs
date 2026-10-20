'use strict';

/*
 * 访客登录与评论（纯静态站点）
 * --------------------------------------------------------------
 * 唯一站长（后台管理员）与访客共用同一套 GitHub 用户名规则，但权限完全分开：
 *  - 访客登录：GitHub OAuth 授权（经 oauth-worker 用一次性 code 换令牌后向 GitHub 确认身份），
 *    在浏览器里建立本地会话，用于评论/点赞的门禁；
 *  - 后台登录：仍然只认 GitHub 令牌经 /user 验证后的账号，且必须在 admin.js 的
 *    allowedLogins 里（目前只有 lscminxi）并拥有仓库写权限。访客登录绝不授予后台权限。
 *
 * 注意：纯静态 GitHub Pages 无法安全保存 OAuth client_secret，因此换令牌由
 * oauth-worker（Cloudflare Worker）完成；本站不索要、也不保存访客的 GitHub 密码或令牌。
 * 真正有权限边界的是后台（令牌 + 允许名单 + GitHub 写权限），OAuth 登录不授予后台权限。
 */

const OWNER_LOGIN = 'lscminxi';
const AUTH_STORAGE_KEY = 'minxi.auth.user';
const COMMENTS_STORAGE_KEY = 'minxi.comments.v1';
const MAX_COMMENT_LENGTH = 500;

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

const OAUTH_STATE_KEY = 'minxi.oauth.state';
const OAUTH_RETURN_KEY = 'minxi.oauth.return';
const OAUTH_ADMIN_KEY = 'minxi.oauth.admin';
const ADMIN_TOKEN_STORAGE_KEY = 'minxi.admin.oauth-token';

/** 生成 OAuth state（防 CSRF）。randomBytes 可注入便于测试；默认用 Math.random 兜底。 */
function makeOAuthState(randomBytes) {
  const bytes = typeof randomBytes === 'function' ? randomBytes(16) : null;
  if (bytes && bytes.length) {
    return [...bytes].map((b) => Number(b).toString(16).padStart(2, '0')).join('');
  }
  let out = '';
  for (let i = 0; i < 32; i += 1) out += Math.floor(Math.random() * 16).toString(16);
  return out;
}

/** 拼 GitHub OAuth 授权地址（网页版流程第一步，浏览器直接跳转，无需密钥）。 */
function buildAuthorizeUrl({ clientId, redirectUri, state, scope = 'read:user' } = {}) {
  const id = typeof clientId === 'string' ? clientId.trim() : '';
  if (!id || !redirectUri || !state) return '';
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri,
    scope,
    state,
    allow_signup: 'true',
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

/** 回调地址：固定为站点根下的 /auth/callback/，需与 OAuth App 里登记的完全一致。 */
function oauthRedirectUri(origin) {
  return `${String(origin || '').replace(/\/+$/, '')}/auth/callback/`;
}

module.exports = {
  OWNER_LOGIN,
  AUTH_STORAGE_KEY,
  COMMENTS_STORAGE_KEY,
  MAX_COMMENT_LENGTH,
  normalizeLogin,
  isOwnerLogin,
  normalizeCommentText,
  normalizeSession,
  OAUTH_STATE_KEY,
  OAUTH_RETURN_KEY,
  OAUTH_ADMIN_KEY,
  ADMIN_TOKEN_STORAGE_KEY,
  makeOAuthState,
  buildAuthorizeUrl,
  oauthRedirectUri,
};
