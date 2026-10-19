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
  storedToken = "",
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
  if (storedToken) w[storage].setItem("minxi.admin.token", storedToken);

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

async function submitLogin({ $, w }, token = "test-token-not-real") {
  $("#token-input").value = token;
  $("#login-form").dispatchEvent(new w.Event("submit", { cancelable: true }));
  await waitFor(() => !$("#login-button").disabled);
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
    assert.equal(w.sessionStorage.getItem("minxi.admin.token"), "test-token-not-real");
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
    assert.equal(w.sessionStorage.getItem("minxi.admin.token"), null);
    assert.equal(w.localStorage.getItem("minxi.admin.token"), null);
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
    assert.equal(w.sessionStorage.getItem("minxi.admin.token"), null);
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
    assert.equal(w.sessionStorage.getItem("minxi.admin.token"), null);
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

test("a remembered token for another account cannot restore an admin session", async () => {
  const { dom, w, $, requests } = await setup({
    login: "another-user",
    storedToken: "remembered-token",
    storage: "localStorage",
  });
  try {
    await waitFor(() => !$("#login-button").disabled);
    assert.equal($("#view-app").hidden, true);
    assert.match($("#login-error").textContent, /@another-user/);
    assert.equal(w.localStorage.getItem("minxi.admin.token"), null);
    assert(!requests.some((request) => request.pathname === apiRoot));
  } finally {
    dom.window.close();
  }
});
