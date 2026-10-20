import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const html = await readFile("source/admin/index.html", "utf8");
const adminJs = await readFile("source/admin/admin.js", "utf8");
const apiRoot = "/repos/lscminxi/lscminxi.github.io";

const waitFor = async (predicate) => {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail("Timed out waiting for admin login UI");
};

function reply(status, data) {
  return {
    ok: status < 400,
    status,
    text: async () => (data == null ? "" : JSON.stringify(data)),
    json: async () => data,
  };
}

async function setup({
  login = "lscminxi",
  userStatus = 200,
  userData = { login },
  repoWritable = true,
  storedToken = "test-token-not-real",
  storage = "sessionStorage",
  script = adminJs,
} = {}) {
  const dom = new JSDOM(html, {
    url: "https://preview.example/admin/",
    runScripts: "outside-only",
  });
  const w = dom.window;
  const requests = [];
  w.scrollTo = () => {};
  // Keep tests fast and prevent callbacks from firing after the jsdom window closes.
  w.setTimeout = () => 0;
  w.clearTimeout = () => {};
  w.setInterval = () => 0;
  w.clearInterval = () => {};
  // 两种验证方式：sessionStorage 暂存 OAuth 授权/未记住的令牌；localStorage 只存勾选「记住此设备」的令牌。恢复时都要走完整验证。
  if (storedToken) {
    if (storage === "localStorage") w.localStorage.setItem("minxi.admin.token", storedToken);
    else w.sessionStorage.setItem("minxi.admin.oauth-token", storedToken);
  }

  w.fetch = async (input, options = {}) => {
    const url = new URL(input, w.location.origin);
    requests.push({ origin: url.origin, pathname: url.pathname, method: options.method || "GET" });
    if (url.pathname === "/appearance.json") return reply(404, { message: "Not Found" });
    if (url.origin === "https://api.github.com" && url.pathname === "/user") {
      return reply(userStatus, userData);
    }
    if (url.origin !== "https://api.github.com") return reply(404, { message: "Not Found" });
    if (url.pathname === apiRoot) {
      return reply(200, {
        permissions: { push: repoWritable },
        owner: { login: "lscminxi" },
      });
    }
    if (url.pathname === `${apiRoot}/git/trees/main`) return reply(200, { tree: [] });
    if (url.pathname === `${apiRoot}/actions/runs`) return reply(200, { workflow_runs: [] });
    return reply(404, { message: "Not Found" });
  };

  w.eval(script);
  const $ = (selector) => w.document.querySelector(selector);
  return { dom, w, $, requests };
}

async function submitLogin({ $ }) {
  // 不再有令牌表单：setup 时放入会话的 OAuth 授权会在 init 中自动验证并进入/被拒。
  await waitFor(() => !$("#login-button").disabled && (!$("#view-app").hidden || Boolean($("#login-error").textContent)));
}

test("the allowlisted account can log in only after GitHub confirms its identity and write access", async () => {
  const { dom, w, $, requests } = await setup();
  try {
    await submitLogin({ $, w });
    await waitFor(() => !$("#refresh-button").disabled);
    assert.equal($("#view-app").hidden, false);
    assert.equal($("#user-chip").textContent, "@lscminxi");
    assert(requests.some((request) => request.pathname === "/user"));
    assert(requests.some((request) => request.pathname === apiRoot));
    assert.equal(w.sessionStorage.getItem("minxi.admin.oauth-token"), "test-token-not-real");
  } finally {
    dom.window.close();
  }
});

test("a different GitHub account is rejected before the repository API is accessed", async () => {
  const { dom, w, $, requests } = await setup({ login: "another-user" });
  try {
    await submitLogin({ $, w });
    assert.equal($("#view-login").hidden, false);
    assert.equal($("#view-app").hidden, true);
    assert.match($("#login-error").textContent, /@another-user/);
    assert.match($("#login-error").textContent, /@lscminxi/);
    assert.deepEqual(
      requests.filter((request) => request.origin === "https://api.github.com").map((request) => request.pathname),
      ["/user"],
    );
    assert.equal(w.sessionStorage.getItem("minxi.admin.oauth-token"), null);
    assert.equal(w.localStorage.getItem("minxi.admin.oauth-token"), null);
  } finally {
    dom.window.close();
  }
});

test("an unavailable GitHub identity endpoint fails closed instead of trusting the repository owner", async () => {
  const { dom, w, $, requests } = await setup({
    userStatus: 503,
    userData: { message: "Service temporarily unavailable" },
  });
  try {
    await submitLogin({ $, w });
    assert.equal($("#view-app").hidden, true);
    assert.match($("#login-error").textContent, /无法验证 GitHub 登录身份/);
    assert(!requests.some((request) => request.pathname === apiRoot));
    assert.equal(w.sessionStorage.getItem("minxi.admin.oauth-token"), null);
  } finally {
    dom.window.close();
  }
});

test("a successful identity response without a login is rejected", async () => {
  const { dom, w, $, requests } = await setup({ userData: {} });
  try {
    await submitLogin({ $, w });
    assert.equal($("#view-app").hidden, true);
    assert.match($("#login-error").textContent, /未返回有效的登录账号/);
    assert(!requests.some((request) => request.pathname === apiRoot));
  } finally {
    dom.window.close();
  }
});

test("an allowlisted account without repository write permission is rejected", async () => {
  const { dom, w, $, requests } = await setup({ repoWritable: false });
  try {
    await submitLogin({ $, w });
    assert.equal($("#view-app").hidden, true);
    assert.match($("#login-error").textContent, /没有写权限/);
    assert(requests.some((request) => request.pathname === apiRoot));
    assert.equal(w.sessionStorage.getItem("minxi.admin.oauth-token"), null);
  } finally {
    dom.window.close();
  }
});

test("an empty allowlist rejects everyone rather than granting access to every writer", async () => {
  const emptyAllowlistScript = adminJs.replace(
    /allowedLogins:\s*\["lscminxi"\]/,
    "allowedLogins: []",
  );
  assert.notEqual(emptyAllowlistScript, adminJs, "Test must replace the configured allowlist");
  const { dom, w, $, requests } = await setup({ script: emptyAllowlistScript });
  try {
    await submitLogin({ $, w });
    assert.equal($("#view-app").hidden, true);
    assert.match($("#login-error").textContent, /没有配置允许登录的账号/);
    assert(!requests.some((request) => request.pathname === apiRoot));
  } finally {
    dom.window.close();
  }
});

test("a remembered token in localStorage restores the session only after the same full verification", async () => {
  const { dom, w, $, requests } = await setup({
    storedToken: "remembered-token",
    storage: "localStorage",
  });
  try {
    await waitFor(() => !$("#view-app").hidden);
    assert.equal($("#user-chip").textContent, "@lscminxi");
    assert(requests.some((request) => request.pathname === "/user"), "记住的令牌也要先确认账号身份");
    assert(requests.some((request) => request.pathname === apiRoot), "还要确认仓库写权限");
    assert.equal(w.localStorage.getItem("minxi.admin.token"), "remembered-token", "验证通过才保留记住的令牌");
  } finally {
    dom.window.close();
  }
});

test("a remembered token belonging to another account is rejected and cleared", async () => {
  const { dom, w, $ } = await setup({
    login: "another-user",
    storedToken: "remembered-token",
    storage: "localStorage",
  });
  try {
    await submitLogin({ $, w });
    assert.equal($("#view-app").hidden, true);
    assert.match($("#login-error").textContent, /@another-user/);
    assert.equal(w.localStorage.getItem("minxi.admin.token"), null, "验证不通过必须清掉记住的令牌");
    assert.equal(w.sessionStorage.getItem("minxi.admin.oauth-token"), null);
  } finally {
    dom.window.close();
  }
});

async function submitTokenForm({ w, $ }, value, remember = false) {
  await waitFor(() => $("#token-input"));
  $("#token-input").value = value;
  $("#token-remember").checked = remember;
  $("#token-form").dispatchEvent(new w.Event("submit", { cancelable: true }));
}

test("pasting a valid owner token logs in (method 2) and stores it for this tab only by default", async () => {
  const { dom, w, $, requests } = await setup({ storedToken: "" });
  try {
    await submitTokenForm({ w, $ }, "pasted-token-123");
    await waitFor(() => !$("#view-app").hidden);
    assert.equal($("#user-chip").textContent, "@lscminxi");
    assert(requests.some((request) => request.pathname === "/user"));
    assert(requests.some((request) => request.pathname === apiRoot));
    assert.equal(w.sessionStorage.getItem("minxi.admin.oauth-token"), "pasted-token-123");
    assert.equal(w.localStorage.getItem("minxi.admin.token"), null, "不勾记住就不能写 localStorage");
    assert.equal($("#token-input").value, "", "进入后清空输入框");
  } finally {
    dom.window.close();
  }
});

test("pasting a token with remember-me stores it in localStorage for this device", async () => {
  const { dom, w, $ } = await setup({ storedToken: "" });
  try {
    await submitTokenForm({ w, $ }, "remembered-paste", true);
    await waitFor(() => !$("#view-app").hidden);
    assert.equal(w.localStorage.getItem("minxi.admin.token"), "remembered-paste");
    assert.equal(w.sessionStorage.getItem("minxi.admin.oauth-token"), null);
  } finally {
    dom.window.close();
  }
});

test("pasting another account's token is rejected and nothing is stored", async () => {
  const { dom, w, $ } = await setup({ login: "another-user", storedToken: "" });
  try {
    await submitTokenForm({ w, $ }, "not-owner-token", true);
    await waitFor(() => Boolean($("#login-error").textContent));
    assert.equal($("#view-app").hidden, true);
    assert.match($("#login-error").textContent, /不是站长/);
    assert.equal(w.localStorage.getItem("minxi.admin.token"), null);
    assert.equal(w.sessionStorage.getItem("minxi.admin.oauth-token"), null);
  } finally {
    dom.window.close();
  }
});

test("an empty token paste is rejected locally without calling GitHub", async () => {
  const { dom, w, $, requests } = await setup({ storedToken: "" });
  try {
    await submitTokenForm({ w, $ }, "   ");
    await waitFor(() => Boolean($("#login-error").textContent));
    assert.match($("#login-error").textContent, /请先粘贴/);
    assert(!requests.some((request) => request.origin === "https://api.github.com"));
  } finally {
    dom.window.close();
  }
});
