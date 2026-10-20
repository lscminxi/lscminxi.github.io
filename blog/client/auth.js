/*
 * 访客登录（GitHub OAuth）+ 评论 / 点赞
 * --------------------------------------------------------------
 * 由 tools/build-assets.mjs 打包成 /js/auth.js（所有页面 defer 加载）。
 *
 * 唯一的登录方式：GitHub OAuth。
 *   点击「使用 GitHub 登录」→ 跳转 GitHub 官方授权页 → 回调 /auth/callback/ →
 *   经 oauth-worker 用一次性 code 换令牌 → 向 GitHub 确认身份 → 建立本地会话
 *   （localStorage：minxi.auth.user）。本站不索要密码，令牌用完即弃、不保存。
 *   若 OAuth 尚未配置，登录弹窗只提示暂不可用，不提供任何绕过授权的备用登录。
 *
 * 权限边界（重要）：
 *   - 所有人都可以登录，然后评论、点赞；
 *   - 只有站长 lscminxi 能进后台。访客点「进入后台」且不是站长时，直接显示「你无权限进入」；
 *   - /admin/ 本身仍然只认 GitHub 令牌验证（令牌账号必须在允许名单里且有仓库写权限），
 *     访客登录不会、也不能绕过那一层。
 *
 * 评论数据的现实限制：站点是纯静态 GitHub Pages，没有服务器/数据库，未登录拦截与
 * 评论渲染都在浏览器完成。当前评论与点赞保存在访客自己的 localStorage（仅本机可见）；
 * 若要全站共享，站长可按 README 启用 Giscus（GitHub Discussions），届时把
 * 主题 _config.yml 的 comments.provider 改成 giscus 并填好参数即可切换，本文件会自动接线。
 */
import auth from '../lib/auth.cjs';

const OWNER = auth.OWNER_LOGIN;
const dialogOf = (id) => document.querySelector(id);

function openDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.showModal === 'function') {
    if (!dialog.open) dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
  }
}
function closeDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.close === 'function' && dialog.open) dialog.close();
  else dialog.removeAttribute('open');
}

/* ---------------- 会话 ---------------- */

function readUser() {
  try {
    const raw = localStorage.getItem(auth.AUTH_STORAGE_KEY);
    return raw ? auth.normalizeSession(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
function writeUser(user) {
  try {
    if (user) localStorage.setItem(auth.AUTH_STORAGE_KEY, JSON.stringify(user));
    else localStorage.removeItem(auth.AUTH_STORAGE_KEY);
  } catch {
    /* 存储不可用时只是记不住登录状态 */
  }
}
let currentUser = readUser();
const getUser = () => currentUser;
const isOwner = (user = currentUser) => Boolean(user) && auth.isOwnerLogin(user.login);

/* ---------------- 弹窗：未登录提醒 / 无权限 ---------------- */

let pendingFeature = '';
function requireLogin(feature = '此功能') {
  if (currentUser) return true;
  pendingFeature = feature;
  const dialog = dialogOf('#auth-required-dialog');
  const text = dialogOf('#auth-required-text');
  if (text) text.textContent = `你还没有登录，登录后才能${feature}。点「使用 GitHub 登录」通过 GitHub 官方授权后即可使用。`;
  openDialog(dialog);
  return false;
}
function showNoAccess(login = currentUser?.login || '') {
  const dialog = dialogOf('#auth-noaccess-dialog');
  const text = dialogOf('#auth-noaccess-text');
  if (text) {
    text.textContent = login
      ? `你当前登录的是 @${login}。你无权限进入后台，只有站长 @${OWNER} 才能进入。`
      : `你无权限进入后台，只有站长 @${OWNER} 才能进入。`;
  }
  openDialog(dialog);
}
function enterAdmin() {
  if (!currentUser) return requireLogin('进入后台');
  if (!isOwner()) return showNoAccess();
  let hasAdminToken = false;
  try {
    hasAdminToken = Boolean(sessionStorage.getItem(auth.ADMIN_TOKEN_STORAGE_KEY));
  } catch { /* 忽略 */ }
  if (hasAdminToken) {
    window.location.href = '/admin/';
    return true;
  }
  // 站长第一次进后台：再走一次 GitHub 授权（这次带仓库写权限），回来直接进后台，不再粘贴令牌。
  if (startAdminOAuth()) return true;
  window.location.href = '/admin/';
  return true;
}

/* ---------------- GitHub OAuth（真登录，需小后端换令牌） ----------------
 * 配置来自主题 _config.yml 的 auth.oauth，经 layout 写在 #auth-dialog 的 data-* 上。
 * 未配置时 oauthConfig() 返回 null，登录弹窗只提示 GitHub 登录暂不可用。
 * 流程：拼授权地址跳转 GitHub → 回调 /auth/callback/ 校验 state →
 *       POST worker /exchange 换令牌 → GET api.github.com/user 确认身份 → 写会话跳回原页。
 * 令牌只在回调处理期间存在于内存，拿到身份后即丢弃，不写任何存储。 */

function oauthConfig() {
  const dialog = dialogOf('#auth-dialog');
  const clientId = dialog?.dataset.oauthClientId || '';
  const workerUrl = (dialog?.dataset.oauthWorkerUrl || '').replace(/\/+$/, '');
  if (!clientId || !workerUrl) return null;
  return { clientId, workerUrl, scope: dialog.dataset.oauthScope || 'read:user' };
}

function randomState() {
  try {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return auth.makeOAuthState(() => [...bytes]);
  } catch {
    return auth.makeOAuthState();
  }
}

function beginOAuth(admin) {
  const config = oauthConfig();
  if (!config) return false;
  const state = randomState();
  const scopes = new Set(String(config.scope || 'read:user').split(/\s+/).filter(Boolean));
  // 只有站长点「进入后台」时才追加仓库写权限；普通访客登录永远只有 read:user。
  if (admin) scopes.add('public_repo');
  try {
    sessionStorage.setItem(auth.OAUTH_STATE_KEY, state);
    sessionStorage.setItem(
      auth.OAUTH_RETURN_KEY,
      admin ? `${window.location.origin}/admin/` : window.location.href,
    );
    if (admin) sessionStorage.setItem(auth.OAUTH_ADMIN_KEY, '1');
    else sessionStorage.removeItem(auth.OAUTH_ADMIN_KEY);
  } catch {
    /* 存储不可用时 state 校验必然失败，回调会给出明确报错 */
  }
  const url = auth.buildAuthorizeUrl({
    clientId: config.clientId,
    redirectUri: auth.oauthRedirectUri(window.location.origin),
    state,
    scope: [...scopes].join(' '),
  });
  if (!url) return false;
  window.location.href = url;
  return true;
}

function startOAuth() {
  return beginOAuth(false);
}

function startAdminOAuth() {
  return beginOAuth(true);
}

const isOAuthCallback = () => /\/auth\/callback\/?$/.test(window.location.pathname);

async function handleOAuthCallback() {
  const status = dialogOf('#oauth-status');
  const say = (message) => {
    if (status) status.textContent = message;
  };
  const params = new URLSearchParams(window.location.search);
  const fail = (message) => {
    say(`${message} 正在返回首页…`);
    try {
      sessionStorage.removeItem(auth.OAUTH_STATE_KEY);
      sessionStorage.removeItem(auth.OAUTH_RETURN_KEY);
      sessionStorage.removeItem(auth.OAUTH_ADMIN_KEY);
    } catch { /* 忽略 */ }
    window.setTimeout(() => { window.location.href = '/'; }, 1800);
  };
  if (params.get('error')) return fail(`GitHub 授权未完成（${params.get('error')}）。`);
  const code = params.get('code') || '';
  let expectedState = '';
  try {
    expectedState = sessionStorage.getItem(auth.OAUTH_STATE_KEY) || '';
  } catch { /* 忽略 */ }
  if (!code) return fail('没有收到 GitHub 的授权码，登录失败。');
  if (!expectedState || params.get('state') !== expectedState) {
    return fail('登录校验失败（state 不一致），请重新点「登录」。');
  }
  const config = oauthConfig() || (await fetchAuthConfig());
  if (!config) return fail('站点还没有配置 OAuth 小后端，暂时无法完成 GitHub 登录。');
  say('已收到 GitHub 授权，正在确认身份…');
  try {
    const exchange = await fetch(`${config.workerUrl}/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const exchanged = await exchange.json().catch(() => ({}));
    if (!exchange.ok || !exchanged.access_token) {
      return fail(`换取登录令牌失败（${exchanged.error || exchange.status}），请重新登录。`);
    }
    // 普通登录的令牌确认身份后立即丢弃；只有站长进入后台的这次授权，
    // 才把令牌暂存在当前标签页会话里供后台调用 GitHub API 发布文章。
    let wantsAdmin = false;
    try {
      wantsAdmin = sessionStorage.getItem(auth.OAUTH_ADMIN_KEY) === '1';
      if (wantsAdmin) sessionStorage.setItem(auth.ADMIN_TOKEN_STORAGE_KEY, exchanged.access_token);
    } catch { /* 忽略 */ }
    const profile = await fetch('https://api.github.com/user', {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${exchanged.access_token}` },
    });
    if (!profile.ok) return fail('GitHub 身份确认失败，请重新登录。');
    const data = await profile.json();
    const session = auth.normalizeSession({
      login: data.login || '',
      avatarUrl: data.avatar_url || '',
      name: data.name || '',
      loggedInAt: Date.now(),
    });
    if (!session) return fail('GitHub 返回的账号信息不完整，登录失败。');
    currentUser = session;
    writeUser(session);
    let back = '/';
    try {
      back = sessionStorage.getItem(auth.OAUTH_RETURN_KEY) || '/';
      sessionStorage.removeItem(auth.OAUTH_STATE_KEY);
      sessionStorage.removeItem(auth.OAUTH_RETURN_KEY);
      sessionStorage.removeItem(auth.OAUTH_ADMIN_KEY);
    } catch { /* 忽略 */ }
    say(`欢迎，@${session.login}！正在跳回原来的页面…`);
    window.setTimeout(() => { window.location.href = back; }, 450);
    return undefined;
  } catch {
    return fail('网络出问题了，GitHub 登录没完成，请重新登录。');
  }
}

/* 回调页是独立静态页，没有 #auth-dialog：改读构建时生成的公开 /auth-config.json。 */
async function fetchAuthConfig() {
  try {
    const response = await fetch('/auth-config.json', { cache: 'no-cache' });
    if (!response.ok) return null;
    const data = await response.json();
    const clientId = data?.oauth?.client_id || '';
    const workerUrl = String(data?.oauth?.worker_url || '').replace(/\/+$/, '');
    return clientId && workerUrl
      ? { clientId, workerUrl, scope: data.oauth.scope || 'read:user' }
      : null;
  } catch {
    return null;
  }
}

/* ---------------- 登录 / 账号面板 ---------------- */

function paintAuthUi() {
  document.querySelectorAll('[data-auth-login]').forEach((button) => {
    button.hidden = Boolean(currentUser);
  });
  document.querySelectorAll('[data-auth-account]').forEach((button) => {
    button.hidden = !currentUser;
    if (!currentUser) return;
    const name = button.querySelector('[data-auth-name]');
    const avatar = button.querySelector('[data-auth-avatar]');
    if (name) name.textContent = currentUser.login;
    if (avatar) avatar.src = currentUser.avatarUrl;
  });
  const oauthPanel = dialogOf('#auth-oauth-panel');
  if (oauthPanel) oauthPanel.hidden = !oauthConfig();
  const unconfigured = dialogOf('#auth-unconfigured');
  if (unconfigured) unconfigured.hidden = Boolean(oauthConfig());
  const loginPanel = dialogOf('#auth-login-panel');
  const accountPanel = dialogOf('#auth-account-panel');
  if (loginPanel) loginPanel.hidden = Boolean(currentUser);
  if (accountPanel) accountPanel.hidden = !currentUser;
  if (currentUser) {
    const info = dialogOf('#auth-account-info');
    if (info) info.textContent = `已登录 @${currentUser.login}${isOwner() ? '（站长）' : ''}，可以评论和点赞了。`;
  }
  document.dispatchEvent(new CustomEvent('minxi:auth-changed', { detail: { user: currentUser } }));
}

function openLogin() {
  const dialog = dialogOf('#auth-dialog');
  paintAuthUi();
  openDialog(dialog);
  if (!currentUser) dialogOf('#auth-oauth-button')?.focus();
}

function wireAuthDialog() {
  const dialog = dialogOf('#auth-dialog');
  if (!dialog) return;
  const error = dialogOf('#auth-error');
  const setError = (message) => {
    if (error) {
      error.textContent = message;
      error.hidden = !message;
    }
  };
  dialogOf('#auth-oauth-button')?.addEventListener('click', () => {
    if (!startOAuth()) setError('GitHub 登录还没有配置好，暂时无法登录。');
  });
  dialogOf('#auth-logout')?.addEventListener('click', () => {
    currentUser = null;
    writeUser(null);
    closeDialog(dialog);
    paintAuthUi();
    paintComments();
  });
  dialogOf('#auth-admin')?.addEventListener('click', () => {
    closeDialog(dialog);
    enterAdmin();
  });
  dialogOf('#auth-close')?.addEventListener('click', () => closeDialog(dialog));
  dialogOf('#auth-account-close')?.addEventListener('click', () => closeDialog(dialog));
}

/* ---------------- 评论与点赞（本地模式） ---------------- */

function readStore() {
  try {
    const data = JSON.parse(localStorage.getItem(auth.COMMENTS_STORAGE_KEY) || '{}');
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}
function writeStore(store) {
  try {
    localStorage.setItem(auth.COMMENTS_STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* 存储不可用时评论只在本次页面内存里 */
  }
}
function postState(store, key) {
  if (!store[key] || typeof store[key] !== 'object') store[key] = { likes: { count: 0, users: [] }, comments: [] };
  if (!store[key].likes) store[key].likes = { count: 0, users: [] };
  if (!Array.isArray(store[key].likes.users)) store[key].likes.users = [];
  if (!Array.isArray(store[key].comments)) store[key].comments = [];
  return store[key];
}

function renderComments(section, state) {
  const list = section.querySelector('[data-comment-list]');
  const count = section.querySelector('[data-comment-count]');
  const likeCount = section.querySelector('[data-like-count]');
  const likeButton = section.querySelector('[data-like-button]');
  if (count) count.textContent = String(state.comments.length);
  if (likeCount) likeCount.textContent = String(state.likes.count || 0);
  const liked = Boolean(currentUser) && state.likes.users.some((name) => String(name).toLowerCase() === currentUser.login.toLowerCase());
  if (likeButton) {
    likeButton.classList.toggle('is-liked', liked);
    likeButton.setAttribute('aria-pressed', String(liked));
    const label = likeButton.querySelector('[data-like-label]');
    if (label) label.textContent = liked ? '已点赞' : '点赞';
  }
  if (!list) return;
  if (!state.comments.length) {
    const empty = document.createElement('p');
    empty.className = 'comments-empty';
    empty.textContent = '还没有评论，来写第一条吧。';
    list.replaceChildren(empty);
    return;
  }
  const nodes = [...state.comments].reverse().map((comment) => {
    const item = document.createElement('article');
    item.className = 'comment-item';
    const head = document.createElement('div');
    head.className = 'comment-head';
    const avatar = document.createElement('img');
    avatar.src = comment.avatarUrl || `https://github.com/${encodeURIComponent(comment.login)}.png?size=64`;
    avatar.alt = '';
    avatar.width = 32;
    avatar.height = 32;
    avatar.loading = 'lazy';
    const author = document.createElement('strong');
    author.textContent = `@${comment.login}`;
    if (auth.isOwnerLogin(comment.login)) {
      const badge = document.createElement('span');
      badge.className = 'comment-owner';
      badge.textContent = '站长';
      author.append(' ', badge);
    }
    const time = document.createElement('time');
    const date = new Date(comment.createdAt || 0);
    time.dateTime = date.toISOString();
    time.textContent = Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN', { hour12: false });
    head.append(avatar, author, time);
    if (currentUser && String(comment.login).toLowerCase() === currentUser.login.toLowerCase()) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'comment-delete';
      remove.textContent = '删除';
      remove.addEventListener('click', () => {
        const store = readStore();
        const fresh = postState(store, section.dataset.postKey);
        fresh.comments = fresh.comments.filter((itemComment) => itemComment.id !== comment.id);
        writeStore(store);
        renderComments(section, fresh);
      });
      head.append(remove);
    }
    const body = document.createElement('p');
    body.className = 'comment-body';
    body.textContent = comment.text;
    item.append(head, body);
    return item;
  });
  list.replaceChildren(...nodes);
}

function paintComments() {
  document.querySelectorAll('[data-comments]').forEach((section) => {
    const key = section.dataset.postKey || window.location.pathname;
    section.dataset.postKey = key;
    renderComments(section, postState(readStore(), key));
    const hint = section.querySelector('[data-comment-user-hint]');
    if (hint) hint.textContent = currentUser ? `以 @${currentUser.login} 的身份评论` : '登录后才能评论或点赞';
  });
}

/* ---------------- Giscus（可选的全站共享模式） ---------------- */

function wireGiscus(section) {
  const repo = section.dataset.giscusRepo;
  const repoId = section.dataset.giscusRepoId;
  const categoryId = section.dataset.giscusCategoryId;
  if (!repo || !repoId || !categoryId) return false;
  const script = document.createElement('script');
  script.src = 'https://giscus.app/client.js';
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.setAttribute('data-repo', repo);
  script.setAttribute('data-repo-id', repoId);
  script.setAttribute('data-category', section.dataset.giscusCategory || 'Announcements');
  script.setAttribute('data-category-id', categoryId);
  script.setAttribute('data-mapping', 'pathname');
  script.setAttribute('data-reactions-enabled', '1');
  script.setAttribute('data-emit-metadata', '0');
  script.setAttribute('data-input-position', 'top');
  script.setAttribute('data-theme', document.documentElement.dataset.theme === 'light' ? 'light' : 'dark_dimmed');
  script.setAttribute('data-lang', 'zh-CN');
  const target = section.querySelector('[data-giscus-target]');
  if (target) target.replaceChildren(script);
  section.querySelector('[data-local-comments]')?.setAttribute('hidden', '');
  return true;
}

/* ---------------- 初始化 ---------------- */

function init() {
  if (isOAuthCallback()) {
    void handleOAuthCallback();
    return;
  }
  paintAuthUi();
  wireAuthDialog();
  document.querySelectorAll('[data-auth-login]').forEach((button) => button.addEventListener('click', openLogin));
  document.querySelectorAll('[data-auth-account]').forEach((button) => button.addEventListener('click', openLogin));
  dialogOf('#auth-required-go')?.addEventListener('click', () => {
    closeDialog(dialogOf('#auth-required-dialog'));
    openLogin();
  });
  dialogOf('#auth-required-cancel')?.addEventListener('click', () => closeDialog(dialogOf('#auth-required-dialog')));
  dialogOf('#auth-noaccess-close')?.addEventListener('click', () => closeDialog(dialogOf('#auth-noaccess-dialog')));
  document.querySelectorAll('[data-comments]').forEach((section) => {
    if (section.dataset.commentsProvider === 'giscus' && wireGiscus(section)) return;
    wireCommentsFor(section);
  });
  paintComments();
}

// 按区块接线评论与点赞。
function wireCommentsFor(section) {
  const key = section.dataset.postKey || window.location.pathname;
  section.dataset.postKey = key;
  section.querySelector('[data-like-button]')?.addEventListener('click', () => {
    if (!requireLogin('点赞')) return;
    const store = readStore();
    const state = postState(store, key);
    const index = state.likes.users.findIndex((name) => String(name).toLowerCase() === currentUser.login.toLowerCase());
    if (index >= 0) {
      state.likes.users.splice(index, 1);
      state.likes.count = Math.max(0, (state.likes.count || 0) - 1);
    } else {
      state.likes.users.push(currentUser.login);
      state.likes.count = (state.likes.count || 0) + 1;
    }
    writeStore(store);
    renderComments(section, state);
  });
  const input = section.querySelector('[data-comment-input]');
  input?.addEventListener('focus', () => {
    if (!currentUser) {
      input.blur();
      requireLogin('评论');
    }
  });
  section.querySelector('[data-comment-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!requireLogin('评论')) return;
    const text = auth.normalizeCommentText(input?.value || '');
    const error = section.querySelector('[data-comment-error]');
    if (!text) {
      if (error) {
        error.textContent = '评论不能为空。';
        error.hidden = false;
      }
      return;
    }
    if (error) error.hidden = true;
    const store = readStore();
    const state = postState(store, key);
    state.comments.push({
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      login: currentUser.login,
      avatarUrl: currentUser.avatarUrl,
      text,
      createdAt: Date.now(),
    });
    writeStore(store);
    if (input) input.value = '';
    renderComments(section, state);
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

window.MinxiAuth = {
  getUser,
  isOwner,
  requireLogin,
  openLogin,
  enterAdmin,
  showNoAccess,
  logout: () => {
    currentUser = null;
    writeUser(null);
    paintAuthUi();
    paintComments();
  },
  startOAuth,
  startAdminOAuth,
  oauthConfig,
  owner: OWNER,
};
window.MinxiComments = { paint: paintComments };
