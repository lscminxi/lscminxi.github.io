import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const auth = require("../lib/auth.cjs");
const layout = await readFile("themes/minxi/layout/layout.ejs", "utf8");
const header = await readFile("themes/minxi/layout/_partial/header.ejs", "utf8");
const postTpl = await readFile("themes/minxi/layout/post.ejs", "utf8");
const adminHtml = await readFile("source/admin/index.html", "utf8");
const adminJs = await readFile("source/admin/admin.js", "utf8");
const authBundle = await readFile("themes/minxi/source/js/auth.js", "utf8");
const workerJs = await readFile("../oauth-worker/worker.js", "utf8");
const callbackHtml = await readFile("source/auth/callback/index.html", "utf8");

const waitFor = async (predicate) => {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail("Timed out waiting for auth UI");
};

/* 与 layout.ejs / post.ejs 相同标记的最小页面（脚本逻辑用它驱动）。 */
const pageHtml = `<!DOCTYPE html><html lang="zh-CN"><head><title>t</title></head><body>
<button class="auth-trigger" type="button" data-auth-login>登录</button>
<button class="auth-user" type="button" data-auth-account hidden><img data-auth-avatar alt=""><span data-auth-name></span></button>
<section data-comments data-comments-provider="local" data-post-key="/2026/01/01/demo/">
  <span data-comment-count>0</span>
  <button type="button" data-like-button aria-pressed="false"><span data-like-label>点赞</span> <span data-like-count>0</span></button>
  <div data-giscus-target></div>
  <div data-local-comments><p data-comment-user-hint></p>
  <form data-comment-form><textarea data-comment-input rows="3"></textarea><p data-comment-error hidden></p><button type="submit">发表评论</button></form>
  <div data-comment-list></div></div>
</section>
<dialog id="auth-dialog"><div id="auth-login-panel"><div id="auth-oauth-panel" hidden><button id="auth-oauth-button" type="button">使用 GitHub 登录</button></div><form id="auth-form">
<input id="auth-username"><canvas id="auth-captcha" width="120" height="44"></canvas>
<button id="auth-refresh" type="button">换一张</button><input id="auth-code">
<p id="auth-error" hidden></p><button id="auth-submit" type="submit">验证并登录</button></form></div>
<div id="auth-account-panel" hidden><p id="auth-account-info"></p>
<button id="auth-admin" type="button">进入后台</button><button id="auth-logout" type="button">退出登录</button>
<button id="auth-account-close" type="button">关闭</button></div>
<button id="auth-close" type="button">×</button></dialog>
<dialog id="auth-required-dialog"><p id="auth-required-text"></p>
<button id="auth-required-go" type="button">去登录</button><button id="auth-required-cancel" type="button">取消</button></dialog>
<dialog id="auth-noaccess-dialog"><p id="auth-noaccess-text"></p><button id="auth-noaccess-close" type="button">知道了</button></dialog>
</body></html>`;

async function setup({ storedUser = null } = {}) {
  const dom = new JSDOM(pageHtml, { url: "https://preview.example/2026/01/01/demo/", runScripts: "outside-only" });
  const w = dom.window;
  if (storedUser) w.localStorage.setItem(auth.AUTH_STORAGE_KEY, JSON.stringify(storedUser));
  w.fetch = async (url) => {
    const name = decodeURIComponent(String(url).split("/users/")[1] || "");
    if (!name || name === "no-such-user-xyz") {
      return { ok: false, status: 404, json: async () => ({ message: "Not Found" }) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ login: name, name: "", avatar_url: `https://avatars.githubusercontent.com/${name}` }),
    };
  };
  w.eval(authBundle);
  // jsdom 里脚本是以 eval 方式注入的（readyState 还是 loading），等 DOMContentLoaded 让 init() 跑完
  await new Promise((resolve) => setTimeout(resolve, 30));
  return { dom, w, $: (s) => w.document.querySelector(s) };
}

async function loginAs(w, $, login) {
  w.MinxiAuth.openLogin();
  $("#auth-username").value = login;
  $("#auth-code").value = w.MinxiAuth.getCaptchaCode();
  $("#auth-form").dispatchEvent(new w.Event("submit", { cancelable: true }));
  await waitFor(() => Boolean(w.MinxiAuth.getUser()));
}

test("templates expose a visible login button, dialogs and per-post comments", () => {
  assert.match(header, /data-auth-login/);
  assert.match(header, />登录</);
  assert.match(layout, /id="auth-dialog"/);
  assert.match(layout, /id="auth-captcha"/);
  assert.match(layout, /id="auth-required-dialog"/);
  assert.match(layout, /请先登录/);
  assert.match(layout, /id="auth-noaccess-dialog"/);
  assert.match(layout, /你无权限进入/);
  assert.match(layout, /\/js\/auth\.js/);
  assert.match(layout, /id="auth-oauth-button"/);
  assert.match(layout, /data-oauth-client-id/);
  assert.match(postTpl, /data-comments/);
  assert.match(postTpl, /data-like-button/);
  assert.match(postTpl, /data-comment-form/);
});

test("shared auth rules: owner, GitHub username and captcha", () => {
  assert.equal(auth.OWNER_LOGIN, "lscminxi");
  assert.equal(auth.isOwnerLogin("LSCMinxi"), true);
  assert.equal(auth.isOwnerLogin("someone-else"), false);
  assert.equal(auth.normalizeLogin("@good-name1"), "good-name1");
  assert.equal(auth.normalizeLogin("-bad"), "");
  assert.equal(auth.normalizeLogin("bad name"), "");
  const code = auth.makeCaptchaCode(() => 0);
  assert.equal(code.length, auth.CAPTCHA_LENGTH);
  assert.equal(auth.captchaMatches(code.toLowerCase(), code), true);
  assert.equal(auth.captchaMatches("XXXX", code), false);
  assert.equal(auth.normalizeCommentText("  hi  "), "hi");
  assert.equal(auth.normalizeCommentText("x".repeat(999)).length, auth.MAX_COMMENT_LENGTH);
});

test("liking or commenting while logged out opens the login reminder and stores nothing", async () => {
  const { dom, w, $ } = await setup();
  try {
    $("[data-like-button]").click();
    const dialog = $("#auth-required-dialog");
    assert.equal(dialog.hasAttribute("open") || dialog.open, true);
    assert.match($("#auth-required-text").textContent, /登录后才能点赞/);
    assert.equal(w.localStorage.getItem(auth.COMMENTS_STORAGE_KEY), null);
    $("[data-comment-input]").dispatchEvent(new w.Event("focus"));
    assert.match($("#auth-required-text").textContent, /登录后才能评论/);
  } finally {
    dom.window.close();
  }
});

test("GitHub username + captcha logs in, then comment and like work and persist locally", async () => {
  const { dom, w, $ } = await setup();
  try {
    // 验证码错了不能登录
    w.MinxiAuth.openLogin();
    $("#auth-username").value = "visitor-one";
    $("#auth-code").value = "XXXX";
    $("#auth-form").dispatchEvent(new w.Event("submit", { cancelable: true }));
    await waitFor(() => !$("#auth-error").hidden);
    assert.match($("#auth-error").textContent, /验证码不正确/);
    assert.equal(w.MinxiAuth.getUser(), null);

    await loginAs(w, $, "visitor-one");
    assert.equal(w.MinxiAuth.getUser().login, "visitor-one");
    assert.equal($("[data-auth-login]").hidden, true);
    assert.equal($("[data-auth-account]").hidden, false);

    $("[data-comment-input]").value = "第一条评论 <script>alert(1)</script>";
    $("[data-comment-form]").dispatchEvent(new w.Event("submit", { cancelable: true }));
    assert.match($("[data-comment-list]").textContent, /第一条评论/);
    // 评论按纯文本渲染，绝不能变成真的 script 元素
    assert.equal($("[data-comment-list] script"), null);
    assert.equal($("[data-comment-count]").textContent, "1");

    $("[data-like-button]").click();
    assert.equal($("[data-like-count]").textContent, "1");
    assert.equal($("[data-like-button]").getAttribute("aria-pressed"), "true");
    $("[data-like-button]").click();
    assert.equal($("[data-like-count]").textContent, "0");
    const stored = JSON.parse(w.localStorage.getItem(auth.COMMENTS_STORAGE_KEY));
    assert.equal(stored["/2026/01/01/demo/"].comments.length, 1);
  } finally {
    dom.window.close();
  }
});

test("a nonexistent GitHub user cannot log in", async () => {
  const { dom, w, $ } = await setup();
  try {
    w.MinxiAuth.openLogin();
    $("#auth-username").value = "no-such-user-xyz";
    $("#auth-code").value = w.MinxiAuth.getCaptchaCode();
    $("#auth-form").dispatchEvent(new w.Event("submit", { cancelable: true }));
    await waitFor(() => !$("#auth-error").hidden);
    assert.match($("#auth-error").textContent, /不存在/);
    assert.equal(w.MinxiAuth.getUser(), null);
  } finally {
    dom.window.close();
  }
});

test("a non-owner visitor trying to enter the admin area sees 你无权限进入", async () => {
  const { dom, w, $ } = await setup({ storedUser: { login: "visitor-one", avatarUrl: "https://github.com/visitor-one.png" } });
  try {
    assert.equal(w.MinxiAuth.isOwner(), false);
    w.MinxiAuth.enterAdmin();
    const dialog = $("#auth-noaccess-dialog");
    assert.equal(dialog.hasAttribute("open") || dialog.open, true);
    assert.match($("#auth-noaccess-text").textContent, /你无权限进入后台/);
    assert.match($("#auth-noaccess-text").textContent, /@visitor-one/);
    assert.equal(w.location.pathname, "/2026/01/01/demo/");
  } finally {
    dom.window.close();
  }
});

test("admin page itself shows 你无权限进入 to a logged-in non-owner visitor", async () => {
  const dom = new JSDOM(adminHtml, { url: "https://preview.example/admin/", runScripts: "outside-only" });
  const w = dom.window;
  try {
    w.localStorage.setItem(auth.AUTH_STORAGE_KEY, JSON.stringify({ login: "visitor-one" }));
    w.scrollTo = () => {};
    w.fetch = async () => ({ ok: false, status: 404, text: async () => "{}", json: async () => ({}) });
    w.eval(adminJs);
    await waitFor(() => !w.document.querySelector("#view-noaccess").hidden);
    assert.equal(w.document.querySelector("#view-login").hidden, true);
    assert.equal(w.document.querySelector("#view-app").hidden, true);
    assert.match(w.document.querySelector("#noaccess-text").textContent, /你无权限进入后台/);
    assert.match(w.document.querySelector("#noaccess-text").textContent, /@visitor-one/);
    // 站长仍可切回令牌登录，不会被访客会话锁死
    w.document.querySelector("#noaccess-owner").click();
    assert.equal(w.document.querySelector("#view-login").hidden, false);
  } finally {
    dom.window.close();
  }
});

test("admin source keeps the token allowlist as the real backend gate", () => {
  assert.match(adminJs, /allowedLogins:\s*\["lscminxi"\]/);
  assert.match(adminJs, /你无权限进入后台：账号/);
  assert.match(adminHtml, /id="view-noaccess"/);
});

test("OAuth helpers build the GitHub authorize URL and callback URI", () => {
  assert.equal(
    auth.oauthRedirectUri("https://lscminxi.github.io/"),
    "https://lscminxi.github.io/auth/callback/",
  );
  const url = new URL(auth.buildAuthorizeUrl({
    clientId: "Iv1.test",
    redirectUri: auth.oauthRedirectUri("https://lscminxi.github.io"),
    state: "state-123",
  }));
  assert.equal(url.origin + url.pathname, "https://github.com/login/oauth/authorize");
  assert.equal(url.searchParams.get("client_id"), "Iv1.test");
  assert.equal(url.searchParams.get("redirect_uri"), "https://lscminxi.github.io/auth/callback/");
  assert.equal(url.searchParams.get("state"), "state-123");
  assert.equal(url.searchParams.get("scope"), "read:user");
  assert.equal(auth.buildAuthorizeUrl({ clientId: "", redirectUri: "x", state: "y" }), "");
  assert.equal(auth.makeOAuthState(() => [0, 15, 255]), "000fff");
});

test("startOAuth stores a CSRF state and hands off to GitHub when configured", async () => {
  const { dom, w, $ } = await setup();
  try {
    const dialog = $("#auth-dialog");
    dialog.dataset.oauthClientId = "Iv1.test";
    dialog.dataset.oauthWorkerUrl = "https://auth.example.workers.dev";
    const config = w.MinxiAuth.oauthConfig();
    assert.equal(config.clientId, "Iv1.test");
    assert.equal(config.workerUrl, "https://auth.example.workers.dev");
    assert.equal(config.scope, "read:user");
    w.MinxiAuth.openLogin();
    assert.equal($("#auth-oauth-panel").hidden, false);
    assert.equal(w.MinxiAuth.startOAuth(), true);
    assert.match(w.sessionStorage.getItem(auth.OAUTH_STATE_KEY), /^[0-9a-f]{32}$/);
    assert.ok(w.sessionStorage.getItem(auth.OAUTH_RETURN_KEY));
  } finally {
    dom.window.close();
  }
});

test("OAuth callback exchanges the code via the worker, verifies identity and stores the session", async () => {
  const dom = new JSDOM(
    `<!DOCTYPE html><html lang="zh-CN"><head><title>正在登录</title></head><body><p id="oauth-status"></p></body></html>`,
    { url: "https://lscminxi.github.io/auth/callback/?code=code-123&state=state-xyz", runScripts: "outside-only" },
  );
  const w = dom.window;
  try {
    w.sessionStorage.setItem(auth.OAUTH_STATE_KEY, "state-xyz");
    w.sessionStorage.setItem(auth.OAUTH_RETURN_KEY, "https://lscminxi.github.io/2026/01/01/demo/");
    const calls = [];
    w.fetch = async (input, options = {}) => {
      const url = String(input);
      calls.push(url);
      if (url === "/auth-config.json") {
        return { ok: true, json: async () => ({ provider: "oauth", oauth: { client_id: "Iv1.test", worker_url: "https://auth.example.workers.dev", scope: "read:user" } }) };
      }
      if (url === "https://auth.example.workers.dev/exchange") {
        assert.equal(JSON.parse(options.body).code, "code-123");
        return { ok: true, json: async () => ({ access_token: "token-not-real", token_type: "bearer" }) };
      }
      if (url === "https://api.github.com/user") {
        assert.equal(options.headers.Authorization, "Bearer token-not-real");
        return { ok: true, json: async () => ({ login: "oauth-visitor", avatar_url: "https://avatars.githubusercontent.com/x" }) };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };
    w.eval(authBundle);
    await waitFor(() => Boolean(w.localStorage.getItem(auth.AUTH_STORAGE_KEY)));
    const session = JSON.parse(w.localStorage.getItem(auth.AUTH_STORAGE_KEY));
    assert.equal(session.login, "oauth-visitor");
    // 令牌用完即弃：任何存储里都不许留 access token
    assert.equal(JSON.stringify(session).includes("token-not-real"), false);
    assert.equal(w.sessionStorage.getItem("token-not-real"), null);
    assert.equal(calls.filter((u) => u.includes("/exchange")).length, 1);
    assert.match(w.document.querySelector("#oauth-status").textContent, /oauth-visitor/);
  } finally {
    dom.window.close();
  }
});

test("OAuth callback rejects a mismatched state without calling the worker", async () => {
  const dom = new JSDOM(
    `<!DOCTYPE html><html lang="zh-CN"><head><title>正在登录</title></head><body><p id="oauth-status"></p></body></html>`,
    { url: "https://lscminxi.github.io/auth/callback/?code=code-123&state=wrong", runScripts: "outside-only" },
  );
  const w = dom.window;
  try {
    w.sessionStorage.setItem(auth.OAUTH_STATE_KEY, "state-xyz");
    let fetched = false;
    w.fetch = async () => { fetched = true; throw new Error("should not fetch"); };
    w.eval(authBundle);
    await waitFor(() => /state 不一致/.test(w.document.querySelector("#oauth-status").textContent));
    assert.equal(fetched, false);
    assert.equal(w.localStorage.getItem(auth.AUTH_STORAGE_KEY), null);
  } finally {
    dom.window.close();
  }
});

test("worker source keeps the secret server-side and only exchanges codes", () => {
  assert.match(workerJs, /GITHUB_CLIENT_SECRET/);
  assert.match(workerJs, /env\.GITHUB_CLIENT_SECRET/);
  assert.match(workerJs, /\/exchange/);
  assert.match(workerJs, /ALLOWED_ORIGINS/);
  assert(!/client_secret\s*[:=]\s*["'][A-Za-z0-9]/.test(workerJs.replace(/client_secret: env\.GITHUB_CLIENT_SECRET/, "")),
    "worker must not hardcode a client secret value");
  assert.match(callbackHtml, /id="oauth-status"/);
  assert.match(callbackHtml, /\/js\/auth\.js/);
});
