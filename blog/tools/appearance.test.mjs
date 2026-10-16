import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, cp, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { JSDOM } from "jsdom";
import appearance from "../lib/appearance.cjs";

const exec = promisify(execFile);
const html = await readFile("source/admin/index.html", "utf8");
const adminJs = await readFile("source/admin/admin.js", "utf8");
// 由 npm run assets（tools/build-assets.mjs）从 lib/appearance.cjs + client/appearance.js 生成。
const appearanceJs = await readFile("source/admin/appearance.js", "utf8");

const appearancePath = "blog/source/_data/appearance.json";
const imagePath = "blog/source/images/avatar.png";
const postPath = "blog/source/_posts/test.md";
const aboutPath = "blog/source/about/index.md";
const defaultData = {
  avatar: "https://cdn.example.com/avatar.png",
  wallpaper: "/images/avatar.png",
  favicon: "https://cdn.example.com/icon.png",
  wallpaperDim: 40,
  wallpaperBlur: 6,
};

const wait = async (predicate) => {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.fail("Timed out waiting for UI");
};
const decode = (value) => value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

async function setup({ fileText = JSON.stringify(defaultData), publicAppearance = defaultData, publicStatus = 200, login = true } = {}) {
  const dom = new JSDOM(html, { url: "https://preview.example/admin/", runScripts: "outside-only" });
  const w = dom.window;
  w.scrollTo = () => {};
  w.TextEncoder = TextEncoder;
  w.TextDecoder = TextDecoder;
  w.MinxiPreview = { document: () => "<!doctype html><html></html>" };
  // 提交后 watchBuild() 会起一个 10 秒轮询、toast 会起一个 3.6 秒定时器；
  // 测试在断言后立刻关闭 window，先屏蔽这些长定时器，避免窗口关闭后才回调。
  w.setInterval = () => 0;
  w.clearInterval = () => {};
  w.setTimeout = () => 0;
  w.clearTimeout = () => {};
  const files = new Map([
    [appearancePath, { sha: "appearance-sha", text: fileText }],
    [imagePath, { sha: "image-sha", text: "binary" }],
    [postPath, { sha: "post-sha", text: "---\ntitle: 测试文章\ndate: 2026-01-01 10:00:00\n---\n正文" }],
    [aboutPath, { sha: "about-sha", text: "---\ntitle: 关于我\nlayout: page\n---\n你好" }],
  ]);
  const state = { writes: [], requests: [] };
  const reply = (status, data) => ({
    ok: status < 400,
    status,
    text: async () => JSON.stringify(data),
    json: async () => data,
  });
  w.fetch = async (url, opts = {}) => {
    const uri = new URL(url);
    const suffix = decodeURIComponent(uri.pathname.replace("/repos/lscminxi/lscminxi.github.io", ""));
    state.requests.push({ suffix, method: opts.method });
    if (suffix === "/appearance.json") return reply(publicStatus, publicAppearance);
    if (suffix === "/user") return reply(200, { login: "lscminxi" });
    if (!suffix) return reply(200, { permissions: { push: true }, owner: { login: "lscminxi" } });
    if (suffix.startsWith("/actions/runs")) return reply(200, { workflow_runs: [] });
    if (suffix.startsWith("/git/trees/")) {
      return reply(200, { tree: [...files].map(([path, file]) => ({ path, sha: file.sha, size: file.text.length, type: "blob" })) });
    }
    if (suffix.startsWith("/contents/")) {
      const filePath = suffix.slice("/contents/".length);
      if (opts.method === "PUT") {
        const body = JSON.parse(opts.body);
        state.writes.push({ path: filePath, ...body, decoded: Buffer.from(body.content, "base64").toString() });
        files.set(filePath, { sha: "saved-sha", text: state.writes.at(-1).decoded });
        return reply(200, { content: { sha: "saved-sha" }, commit: { sha: "save-commit" } });
      }
      const file = files.get(filePath);
      return file
        ? reply(200, { sha: file.sha, size: file.text.length, encoding: "base64", content: Buffer.from(file.text).toString("base64") })
        : reply(404, { message: "Not Found" });
    }
    throw new Error(`Unexpected API ${suffix}`);
  };
  w.eval(appearanceJs);
  w.eval(adminJs);
  const $ = (selector) => w.document.querySelector(selector);
  if (!login) return { dom, w, $, files, state };
  $("#token-input").value = "test-token-not-real";
  $("#login-form").dispatchEvent(new w.Event("submit", { cancelable: true }));
  await wait(() => $("#post-list .row"));
  await wait(() => !$("#refresh-button").disabled);
  return { dom, w, $, files, state };
}

const openAppearanceTab = async ($) => {
  [...$("#tabs").querySelectorAll(".tab")].find((tab) => tab.dataset.tab === "appearance").click();
  await wait(() => $("#appearance-status").textContent.includes("已加载"));
};

// 提交后会有一次构建状态查询；等它结束再关闭 window。
const settleBuild = async ($) => {
  await wait(() => $("#build-chip").textContent !== "构建状态：未知");
};

// 登录与保存都会触发一次不等待的构建状态查询，先让它跑完再关闭 window，
// 否则回调会在窗口关闭之后访问 document。
const teardown = async (dom) => {
  await new Promise((resolve) => setTimeout(resolve, 120));
  dom.window.close();
};

/* ---------------- 共享规则（前后台一致） ---------------- */

test("missing, malformed or hostile appearance data always falls back to safe defaults", () => {
  const fallback = { avatar: "", wallpaper: "", favicon: "/images/favicon.svg", wallpaperDim: 62, wallpaperBlur: 0, wallpapers: [], theme: "auto" };
  for (const input of [null, undefined, 0, "", "nope", [], true]) {
    assert.deepEqual(appearance.resolveAppearance(input), fallback);
  }
  const hostile = appearance.resolveAppearance({
    avatar: "javascript:alert(1)",
    wallpaper: "data:image/svg+xml,<svg onload=alert(1)>",
    favicon: '"/><script>alert(1)</script>',
    wallpaperDim: "999",
    wallpaperBlur: -4,
    wallpapers: [{ url: "javascript:alert(2)" }, { url: "https://ok/x.png", id: "ok" }],
  });
  assert.deepEqual(hostile, {
    avatar: "", wallpaper: "", favicon: "/images/favicon.svg", wallpaperDim: 95, wallpaperBlur: 0,
    wallpapers: [{ id: "ok", url: "https://ok/x.png", label: "" }], theme: "auto",
  });
});

test("only http(s) links and root-relative site paths are accepted", () => {
  for (const value of ["https://cdn.luogu.com.cn/upload/usericon/1549479.png", "http://example.com/a.webp", "/images/a.png", "/images/a.png?v=2&x=1"]) {
    assert.equal(appearance.isSafeImageUrl(value), true, value);
    assert(appearance.isSafeImageUrl(value.trim()), value);
  }
  for (const value of [
    "javascript:alert(1)", "JavaScript:alert(1)", "data:image/png;base64,AAAA", "vbscript:msgbox(1)", "file:///etc/passwd",
    "//evil.example/a.png", "  ", "", "/", "/images/a b.png", "https://example.com/a.png\" onload=x", "url(https://x/a.png)",
    "https://example.com/a.png\");background:red", "https://example.com/\\a.png", "https://example.com/a.png\nX: y", 12, null, {},
  ]) {
    assert.equal(appearance.isSafeImageUrl(value), false, String(value));
  }
  assert.equal(appearance.cssImage("https://cdn.example.com/a.webp"), 'url("https://cdn.example.com/a.webp")');
  assert.equal(appearance.cssImage("javascript:alert(1)"), "none");
  assert.equal(appearance.cssImage(""), "none");
  assert.equal(appearance.veilAlpha(62), "0.62");
  assert.equal(appearance.veilAlpha(1000), "0.95");
});

test("favicon type is derived from the file extension and omitted when unknown", () => {
  assert.equal(appearance.faviconType("https://cdn.example.com/i.png"), "image/png");
  assert.equal(appearance.faviconType("/images/favicon.svg"), "image/svg+xml");
  assert.equal(appearance.faviconType("/images/a.webp?x=1"), "image/webp");
  assert.equal(appearance.faviconType("/images/a.jpeg"), "image/jpeg");
  assert.equal(appearance.faviconType("/images/a.ico"), "image/x-icon");
  assert.equal(appearance.faviconType("https://cdn.example.com/icon"), "");
  assert.equal(appearance.faviconType("javascript:alert(1)"), "");
});

/* ---------------- 后台「外观」面板 ---------------- */

test("admin uses the published wallpaper on the login page and after login", async () => {
  const draft = { ...defaultData, wallpaper: "https://cdn.example.com/unpublished.webp" };
  const { dom, w, $, state } = await setup({ fileText: JSON.stringify(draft), login: false });
  try {
    const root = w.document.documentElement;
    await wait(() => root.dataset.wallpaper === "on");
    assert.equal($("#view-login").hidden, false, "Wallpaper is loaded before authentication");
    assert.equal($("#view-app").hidden, true);
    assert.equal(root.style.getPropertyValue("--wallpaper-image"), appearance.cssImage(defaultData.wallpaper));
    assert.equal(root.style.getPropertyValue("--wallpaper-veil"), "0.40");
    assert.equal(root.style.getPropertyValue("--wallpaper-blur"), "6px");
    assert.equal(root.dataset.wallpaperBlur, "on");
    assert.equal($("#admin-favicon").getAttribute("href"), defaultData.favicon);
    assert.equal(state.requests[0].suffix, "/appearance.json", "Public appearance is fetched without a GitHub token");

    $("#token-input").value = "test-token-not-real";
    $("#login-form").dispatchEvent(new w.Event("submit", { cancelable: true }));
    await wait(() => !$("#view-app").hidden);
    await openAppearanceTab($);
    assert.equal($("#a-wallpaper").value, draft.wallpaper);
    assert.equal(root.dataset.wallpaper, "on", "Switching admin views preserves the background");
    assert.equal(root.style.getPropertyValue("--wallpaper-image"), appearance.cssImage(defaultData.wallpaper), "The background uses the published value, not an unsaved draft");
  } finally {
    await teardown(dom);
  }
});

test("admin keeps a solid background when the published wallpaper is empty, unsafe or unavailable", async () => {
  for (const wallpaper of ["", "javascript:alert(1)"]) {
    const { dom, w, $ } = await setup({ publicAppearance: { ...defaultData, wallpaper }, login: false });
    try {
      await wait(() => $("#admin-favicon").getAttribute("href") === defaultData.favicon);
      assert.equal(w.document.documentElement.hasAttribute("data-wallpaper"), false);
      assert.equal(w.document.documentElement.style.getPropertyValue("--wallpaper-image"), "");
    } finally {
      await teardown(dom);
    }
  }
  const { dom, w, state } = await setup({ publicStatus: 503, login: false });
  try {
    await wait(() => state.requests.length > 0);
    assert.equal(w.document.documentElement.hasAttribute("data-wallpaper"), false);
  } finally {
    await teardown(dom);
  }
});

test("article table of contents text is white except for the active/hover accent", async () => {
  const css = await readFile("themes/minxi/source/css/main.css", "utf8");
  for (const selector of [".toc-sidebar h2", ".toc a", ".toc-back"]) {
    assert.match(css, new RegExp(`${selector.replaceAll(".", "\\.")}\\s*\\{[^}]*color:\\s*#fff;`));
  }
  assert.match(css, /\.toc a:hover,\s*\.toc a.active\s*\{[^}]*color:\s*var\(--accent\);/);
});

test("admin sees the current avatar/wallpaper/icon and its live preview", async () => {
  const { dom, $, w } = await setup();
  try {
    await openAppearanceTab($);
    assert.equal($("#a-avatar").value, defaultData.avatar);
    assert.equal($("#a-wallpaper").value, defaultData.wallpaper);
    assert.equal($("#a-favicon").value, defaultData.favicon);
    assert.equal($("#a-dim").value, "40");
    assert.equal($("#a-blur").value, "6");
    assert.equal($("#a-dim-value").textContent, "40%");
    assert.equal($("#a-blur-value").textContent, "6px");
    assert.equal($("#appearance-preview .preview-avatar-image").getAttribute("src"), defaultData.avatar);
    assert.equal($("#preview-favicon-image").getAttribute("src"), defaultData.favicon);
    assert.equal($("#appearance-preview .preview-wallpaper").style.backgroundImage, 'url("/images/avatar.png")');
    assert.equal($("#appearance-preview .preview-wallpaper").style.filter, "blur(6px)");
    assert.equal($("#appearance-preview .preview-veil").style.background, "linear-gradient(rgba(11,14,20,0.40), rgba(11,14,20,0.40))");
    assert.equal($("#appearance-preview-note").className, "small ok");
    // 顶栏图标跟随公开的 /appearance.json
    await wait(() => $("#admin-favicon").getAttribute("href") === defaultData.favicon);
    assert.equal(w.MinxiAppearance.isSafeImageUrl("javascript:alert(1)"), false);
  } finally {
    await teardown(dom);
  }
});

test("saving commits sanitized JSON to source/_data/appearance.json with the file sha and branch", async () => {
  const { dom, $, state, files } = await setup();
  try {
    await openAppearanceTab($);
    $("#a-avatar").value = "  https://cdn.example.com/new-avatar.png  ";
    $("#a-wallpaper").value = "";
    $("#a-favicon").value = "/images/avatar.png";
    $("#a-dim").value = "88";
    $("#a-blur").value = "14";
    for (const field of ["#a-avatar", "#a-wallpaper", "#a-favicon", "#a-dim", "#a-blur"]) {
      $(field).dispatchEvent(new dom.window.Event("input"));
    }
    assert.equal($("#appearance-preview .preview-wallpaper").style.backgroundImage, "none");
    $("#appearance-save").click();
    await wait(() => state.writes.length === 1);
    const write = state.writes[0];
    assert.equal(write.path, appearancePath);
    assert.equal(write.branch, "main");
    assert.equal(write.sha, "appearance-sha");
    assert.equal(write.message, "feat(blog): update appearance (avatar / wallpaper / wallpapers)");
    assert.deepEqual(JSON.parse(write.decoded), {
      avatar: "https://cdn.example.com/new-avatar.png",
      wallpaper: "",
      favicon: "/images/avatar.png",
      wallpaperDim: 88,
      wallpaperBlur: 14,
      wallpapers: [],
      theme: "auto",
    });
    await wait(() => files.get(appearancePath).text === write.decoded);
    await wait(() => $("#appearance-status").textContent.includes("已提交"));
    assert($("#appearance-status").textContent.includes("save-co"), "Commit id is reported to the admin");
    await settleBuild($);
  } finally {
    await teardown(dom);
  }
});

test("javascript:/data:/breaking-out addresses are rejected before any commit", async () => {
  const { dom, $, state } = await setup();
  try {
    await openAppearanceTab($);
    for (const value of ["javascript:alert(1)", "data:image/png;base64,AAAA", "/images/a.png\");background:red", "//evil.example/a.png"]) {
      $("#a-avatar").value = value;
      $("#a-avatar").dispatchEvent(new dom.window.Event("input"));
      assert($("#appearance-preview-note").textContent.includes("不合法"), value);
      assert.equal($("#appearance-preview-note").className, "small err");
      $("#appearance-save").click();
      await new Promise((r) => setTimeout(r, 20));
      assert.equal(state.writes.length, 0, `No commit for ${value}`);
    }
    assert($("#appearance-status").textContent.includes("不合法"));
    assert.equal($("#a-favicon").value, defaultData.favicon, "Rejected input never silently rewrites other fields");
  } finally {
    await teardown(dom);
  }
});

test("root paths that are not uploaded images warn and require a confirmation", async () => {
  const { dom, $, state } = await setup();
  try {
    await openAppearanceTab($);
    $("#a-wallpaper").value = "/images/not-uploaded.webp";
    $("#a-wallpaper").dispatchEvent(new dom.window.Event("input"));
    assert($("#appearance-preview-note").textContent.includes("不在已上传的图片列表"));
    $("#appearance-save").click();
    await wait(() => !$("#modal").hidden);
    assert.equal($("#modal-title").textContent, "确认保存");
    assert($("#modal-text").textContent.includes("/images/not-uploaded.webp"));
    $("#modal-cancel").click();
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(state.writes.length, 0);
    $("#appearance-save").click();
    await wait(() => !$("#modal").hidden);
    $("#modal-ok").click();
    await wait(() => state.writes.length === 1);
    assert.equal(JSON.parse(state.writes[0].decoded).wallpaper, "/images/not-uploaded.webp");
    await settleBuild($);
  } finally {
    await teardown(dom);
  }
});

test("defaults and the uploaded-image picker fill the form without saving", async () => {
  const { dom, $, state } = await setup();
  try {
    await openAppearanceTab($);
    const picker = $("#a-image");
    assert([...picker.options].some((option) => option.value === "/images/avatar.png"), "Uploaded images are offered");
    picker.value = "/images/avatar.png";
    [...$("#tab-appearance").querySelectorAll("[data-appearance-fill]")]
      .find((button) => button.dataset.appearanceFill === "favicon").click();
    assert.equal($("#a-favicon").value, "/images/avatar.png");
    $("#appearance-defaults").click();
    assert.equal($("#a-avatar").value, "");
    assert.equal($("#a-wallpaper").value, "");
    assert.equal($("#a-favicon").value, "/images/favicon.svg");
    assert.equal($("#a-dim").value, "62");
    assert.equal($("#a-blur").value, "0");
    assert.equal(state.writes.length, 0);
    // 默认值（无壁纸）下预览层不显示壁纸
    assert.equal($("#appearance-preview .preview-wallpaper").style.backgroundImage, "none");
    assert($("#appearance-preview .preview-avatar").classList.contains("preview-avatar--failed"));
    assert.equal($("#appearance-preview .preview-avatar-mark").hidden, false);
  } finally {
    await teardown(dom);
  }
});

test("a missing or malformed config file still lets the admin create it", async () => {
  const { dom, $, state } = await setup({ fileText: "{ 这不是 JSON" });
  try {
    [...$("#tabs").querySelectorAll(".tab")].find((tab) => tab.dataset.tab === "appearance").click();
    await wait(() => $("#appearance-status").textContent.includes("不是合法 JSON"));
    assert.equal($("#a-favicon").value, "/images/favicon.svg");
    $("#appearance-save").click();
    await wait(() => state.writes.length === 1);
    assert.equal(state.writes[0].sha, "appearance-sha", "Repairs the existing file instead of creating a new one");
    assert.deepEqual(JSON.parse(state.writes[0].decoded), { avatar: "", wallpaper: "", favicon: "/images/favicon.svg", wallpaperDim: 62, wallpaperBlur: 0, wallpapers: [], theme: "auto" });
    await settleBuild($);
  } finally {
    await teardown(dom);
  }
});

test("Ctrl/Cmd+S saves while the appearance tab is open, like the other tabs", async () => {
  const { dom, $, w, state } = await setup();
  try {
    await openAppearanceTab($);
    $("#a-avatar").value = "https://cdn.example.com/via-shortcut.png";
    $("#a-avatar").dispatchEvent(new w.Event("input"));
    w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "s", ctrlKey: true }));
    await wait(() => state.writes.length === 1);
    assert.equal(JSON.parse(state.writes[0].decoded).avatar, "https://cdn.example.com/via-shortcut.png");
    await settleBuild($);
  } finally {
    await teardown(dom);
  }
});

test("reopening the appearance tab keeps loaded values and does not re-read GitHub", async () => {
  const { dom, $, state } = await setup();
  try {
    const reads = () =>
      state.requests.filter((r) => r.suffix.startsWith("/contents/") && r.suffix.endsWith("appearance.json")).length;
    await openAppearanceTab($);
    assert.equal(reads(), 1);
    [...$("#tabs").querySelectorAll(".tab")].find((tab) => tab.dataset.tab === "posts").click();
    await openAppearanceTab($);
    assert.equal(reads(), 1, "Values already loaded are not fetched again");
    assert.equal($("#a-wallpaper").value, defaultData.wallpaper);
  } finally {
    await teardown(dom);
  }
});

test("the published site falls back to the letter avatar when the image cannot load", async () => {
  // 头像外链被防盗链拦住时，前台 main.js 必须显示字母标记，而不是破图。
  const siteJs = await readFile("themes/minxi/source/js/main.js", "utf8");
  const markup = `<!doctype html><html><body>
    <dialog id="search-dialog" data-index="/search.json"><button id="close-search"></button><input id="search-input"><div id="search-results"></div></dialog>
    <button id="back-top" hidden></button>
    <div class="avatar avatar--image"><img class="avatar-image" src="https://cdn.example.com/broken.png"><span class="avatar-mark" hidden>m<span>_</span></span></div>
  </body></html>`;
  const dom = new JSDOM(markup, { url: "https://lscminxi.github.io/", runScripts: "outside-only" });
  const w = dom.window;
  const frame = w.document.querySelector(".avatar");
  const image = w.document.querySelector(".avatar-image");
  const mark = w.document.querySelector(".avatar-mark");
  w.eval(siteJs);
  assert.equal(mark.hidden, true, "A loadable image keeps the letter mark hidden");
  image.dispatchEvent(new w.Event("error"));
  assert(frame.classList.contains("avatar--failed"));
  assert.equal(mark.hidden, false);
  dom.window.close();

  // 图片在脚本执行前就已经失败（complete + 无自然宽度）时同样回落。
  const late = new JSDOM(markup, { url: "https://lscminxi.github.io/", runScripts: "outside-only" });
  const lateImage = late.window.document.querySelector(".avatar-image");
  Object.defineProperty(lateImage, "complete", { value: true });
  Object.defineProperty(lateImage, "naturalWidth", { value: 0 });
  late.window.eval(siteJs);
  assert(late.window.document.querySelector(".avatar").classList.contains("avatar--failed"));
  assert.equal(late.window.document.querySelector(".avatar-mark").hidden, false);
  late.window.close();
});

/* ---------------- 构建产物 ---------------- */

test("a hostile appearance.json cannot inject markup or CSS into the built site", async () => {
  const temp = await mkdtemp(join(tmpdir(), "minxi-appearance-"));
  const source = resolve(".");
  try {
    await cp(source, join(temp, "blog"), {
      recursive: true,
      filter: (path) => {
        const relative = path.slice(source.length + 1);
        return !["node_modules", "public", "db.json"].some((p) => relative === p || relative.startsWith(p + "/"));
      },
    });
    await symlink(join(source, "node_modules"), join(temp, "blog/node_modules"), "dir");
    await writeFile(
      join(temp, "blog/source/_data/appearance.json"),
      JSON.stringify({
        avatar: '"><script>alert(1)</script>',
        wallpaper: "javascript:alert(1)",
        favicon: "data:text/html,<script>alert(1)</script>",
        wallpaperDim: 1000,
        wallpaperBlur: "abc",
      }),
    );
    await exec("npm", ["run", "build"], { cwd: join(temp, "blog"), timeout: 120000 });
    const built = await readFile(join(temp, "blog/public/index.html"), "utf8");
    assert(!built.includes("<script>alert(1)</script>"), "No injected script element");
    assert(!/javascript:/i.test(built), "No javascript: URL");
    assert(!/data:text\/html/i.test(built), "No data: URL");
    assert(!built.includes("data-wallpaper"), "Invalid wallpaper disables the wallpaper layer");
    assert(!built.includes("--wallpaper-image"), "No wallpaper CSS variable is emitted");
    assert(built.includes('<link rel="icon" type="image/svg+xml" href="/images/favicon.svg">'), "Falls back to the bundled favicon");
    assert(built.includes('<span class="avatar-mark">m<span>_</span></span>'), "Falls back to the letter avatar");
    assert(!built.includes("avatar-image"));
    const published = JSON.parse(await readFile(join(temp, "blog/public/appearance.json"), "utf8"));
    assert.deepEqual(published, { avatar: "", wallpaper: "", favicon: "/images/favicon.svg", wallpaperDim: 95, wallpaperBlur: 0, wallpapers: [], theme: "auto" });
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

/* ---------------- 未保存的修改（防误触） ----------------
   后台在「编辑好但没保存」时关闭标签页 / 刷新，浏览器要能弹出确认框。
   这里用 beforeunload 事件 + window.MinxiAdmin.unsavedWork() 来验证行为与文案。 */

const unloadProbe = (w) => {
  const event = new w.Event("beforeunload", { cancelable: true });
  w.dispatchEvent(event);
  return { blocked: event.defaultPrevented, pending: [...w.MinxiAdmin.unsavedWork()] };
};

test("unsaved appearance edits block the page from closing silently", async () => {
  const { dom, $, w, state } = await setup();
  try {
    [...$("#tabs").querySelectorAll(".tab")].find((tab) => tab.dataset.tab === "appearance").click();
    await wait(() => $("#appearance-status").textContent.includes("已加载"));

    // 刚加载完：干净，不该拦
    assert.deepEqual(unloadProbe(w).pending, [], "刚加载完不应算未保存");
    assert.equal(unloadProbe(w).blocked, false, "干净时不能弹提示");

    // 改个地址 → 拦
    $("#a-avatar").value = "https://cdn.example.com/new.png";
    $("#a-avatar").dispatchEvent(new w.Event("input"));
    const edited = unloadProbe(w);
    assert.equal(edited.blocked, true, "有未保存修改时必须拦下关闭");
    assert.deepEqual(edited.pending, ["「外观」里的设置"]);

    // 改回去 → 又变干净（快照比对的是内容，不是「有没有点过」）
    $("#a-avatar").value = defaultData.avatar;
    $("#a-avatar").dispatchEvent(new w.Event("input"));
    assert.equal(unloadProbe(w).blocked, false, "改回原样后不再提示");

    // 调整壁纸库顺序同样算未保存
    $("#a-wallpaper").value = "https://cdn.example.com/other.png";
    $("#a-wallpaper").dispatchEvent(new w.Event("input"));
    assert.equal(unloadProbe(w).blocked, true);

    // 保存成功后解除提醒
    $("#appearance-save").click();
    await wait(() => state.writes.length === 1);
    await wait(() => unloadProbe(w).blocked === false, "保存成功后必须解除提醒");
    assert.equal(unloadProbe(w).blocked, false, "保存成功后必须解除提醒");
    assert.deepEqual(unloadProbe(w).pending, []);
  } finally {
    await new Promise((r) => setTimeout(r, 30));
    dom.window.close();
  }
});

test("unsaved article edits block the page from closing until they are saved", async () => {
  const { dom, $, w, state } = await setup();
  try {
    // 打开一篇文章：刚加载算干净
    const row = [...$("#post-list").querySelectorAll(".row")].find((item) => item.textContent.includes("test"));
    [...row.querySelectorAll("button")].find((button) => button.textContent === "编辑").click();
    await wait(() => !$("#view-editor").hidden && $("#f-body").value.includes("正文"));
    assert.equal(unloadProbe(w).blocked, false, "刚打开的文章不该算未保存");

    // 改正文 → 拦，并说明是哪一篇
    $("#f-body").value += "\n新写的一段";
    $("#f-body").dispatchEvent(new w.Event("input"));
    const edited = unloadProbe(w);
    assert.equal(edited.blocked, true, "有未保存的文章修改时必须拦下关闭");
    assert.deepEqual(edited.pending, ["文章「测试文章」"]);

    // 标题也会跟着变（提示里用最新的标题）
    $("#f-title").value = "改过的标题";
    $("#f-title").dispatchEvent(new w.Event("input"));
    assert.deepEqual(unloadProbe(w).pending, ["文章「改过的标题」"]);

    // 保存成功后解除提醒
    $("#save-post").click();
    await wait(() => state.writes.some((write) => write.path.endsWith(".md")));
    await wait(() => unloadProbe(w).blocked === false);
    assert.deepEqual(unloadProbe(w).pending, []);

    // 「← 返回列表」关掉编辑器后也不再提醒（有改动时先确认，见下一个用例）
    $("#f-body").value += "\n又改了一下";
    $("#f-body").dispatchEvent(new w.Event("input"));
    assert.equal(unloadProbe(w).blocked, true);
    $("#cancel-edit").click();
    await wait(() => !$("#modal").hidden);
    assert.equal(unloadProbe(w).blocked, true, "确认框还开着时草稿仍在，仍要拦关闭");
    $("#modal-ok").click();
    await wait(() => unloadProbe(w).blocked === false, "确认放弃后应真的离开编辑器");
    assert.equal(unloadProbe(w).blocked, false, "离开编辑器后不该再拦");
  } finally {
    await new Promise((r) => setTimeout(r, 30));
    dom.window.close();
  }
});

test("leaving the editor with unsaved changes asks before throwing the draft away", async () => {
  const { dom, $, w } = await setup();
  const body = () => $("#f-body");
  try {
    // 干净的文章：点「← 返回列表」直接走，不打扰
    const row = [...$("#post-list").querySelectorAll(".row")].find((item) => item.textContent.includes("test"));
    [...row.querySelectorAll("button")].find((button) => button.textContent === "编辑").click();
    await wait(() => !$("#view-editor").hidden && body().value.includes("正文"));
    $("#cancel-edit").click();
    await wait(() => $("#view-editor").hidden);
    assert.equal($("#modal").hidden, true, "没有改动时不该弹确认框");

    // 改一下正文再返回：先弹确认（要等「已加载」，否则编辑的是上一篇留下的旧文本）
    [...row.querySelectorAll("button")].find((button) => button.textContent === "编辑").click();
    await wait(() => $("#editor-status").textContent.includes("已加载"));
    body().value += "\n还没保存的一段";
    body().dispatchEvent(new w.Event("input"));
    $("#cancel-edit").click();
    await wait(() => !$("#modal").hidden, "有未保存改动时返回列表必须先确认");
    assert.equal($("#modal-title").textContent, "还有未保存的修改");
    assert($("#modal-text").textContent.includes("测试文章"), `确认框应点名是哪一篇：${$("#modal-text").textContent}`);
    assert($("#modal-text").textContent.includes("返回列表后会丢失"));
    assert.equal($("#modal-ok").textContent, "放弃修改");

    // 点「取消」→ 留在编辑器，草稿一个字都不能少
    $("#modal-cancel").click();
    await wait(() => $("#modal").hidden);
    assert.equal($("#view-editor").hidden, false, "取消后必须留在编辑器里");
    assert(body().value.includes("还没保存的一段"), "取消后草稿必须还在");

    // 再点返回 →「放弃修改」→ 回列表
    $("#cancel-edit").click();
    await wait(() => !$("#modal").hidden);
    $("#modal-ok").click();
    await wait(() => $("#view-editor").hidden, "确认放弃后应回到列表");
    assert.equal($("#view-editor").hidden, true);

    // 新建文章（还没填标题）也一样，文案改用「这篇新建的文章」
    $("#new-post-button").click();
    await wait(() => !$("#view-editor").hidden && $("#editor-title").textContent === "新建文章");
    $("#f-title").value = "";
    body().value = "刚起的草稿";
    body().dispatchEvent(new w.Event("input"));
    $("#cancel-edit").click();
    await wait(() => !$("#modal").hidden);
    assert(
      $("#modal-text").textContent.includes("新建的文章"),
      `新建文章未填标题时文案要说得通：${$("#modal-text").textContent}`,
    );
    $("#modal-cancel").click();
    await wait(() => $("#modal").hidden);
    assert.equal($("#view-editor").hidden, false);

    // 填上标题：确认框里带上标题
    $("#f-title").value = "半截稿子";
    $("#f-title").dispatchEvent(new w.Event("input"));
    $("#cancel-edit").click();
    await wait(() => !$("#modal").hidden);
    assert($("#modal-text").textContent.includes("「半截稿子」"), $("#modal-text").textContent);
    $("#modal-ok").click();
    await wait(() => $("#view-editor").hidden);

    // 保存成功后返回不弹框（快照已经刷新）
    [...row.querySelectorAll("button")].find((button) => button.textContent === "编辑").click();
    await wait(() => $("#editor-status").textContent.includes("已加载"));
    $("#save-post").click();
    await wait(() => $("#editor-status").textContent.includes("已提交"));
    $("#cancel-edit").click();
    await wait(() => $("#view-editor").hidden);
    assert.equal($("#modal").hidden, true, "保存后再返回不该再问");
  } finally {
    await new Promise((r) => setTimeout(r, 30));
    dom.window.close();
  }
});

test("leaving the editor while the post is still loading is quiet and safe", async () => {
  const { dom, $, w } = await setup();
  try {
    // 卡住读文件的那次请求，模拟慢网络
    let release = () => {};
    const gate = new Promise((resolve) => (release = resolve));
    const realFetch = w.fetch;
    w.fetch = async (...args) => {
      const isRead = (args[1]?.method || "GET") === "GET" && String(args[0]).includes("/contents/");
      if (isRead) await gate;
      return realFetch(...args);
    };

    const row = [...$("#post-list").querySelectorAll(".row")].find((item) => item.textContent.includes("test"));
    [...row.querySelectorAll("button")].find((button) => button.textContent === "编辑").click();
    await wait(() => $("#editor-status").textContent.includes("正在读取"));

    // 还没读完就返回：没有内容可丢，所以不该弹确认框，也不该报错
    $("#cancel-edit").click();
    await wait(() => $("#view-editor").hidden);
    assert.equal($("#modal").hidden, true, "还没读出来时返回不该弹确认框");

    // 迟到的响应落回来时，不能写进已经关掉的编辑器
    release();
    await new Promise((r) => setTimeout(r, 80));
    assert.equal($("#view-editor").hidden, true, "迟到的响应不该把编辑器又打开");
    assert.equal($("#editor-status").textContent, "", "迟到响应后状态栏不该被写脏");
    assert.equal(unloadProbe(w).blocked, false, "此时不该拦关闭页面");
    assert.deepEqual(unloadProbe(w).pending, []);

    // 之后再打开同一篇仍然正常
    [...row.querySelectorAll("button")].find((button) => button.textContent === "编辑").click();
    await wait(() => $("#editor-status").textContent.includes("已加载"));
    assert($("#f-body").value.includes("正文"), "重新打开必须能正常读到内容");
  } finally {
    await new Promise((r) => setTimeout(r, 30));
    dom.window.close();
  }
});

test("unsaved about-page edits and clean sessions behave the same way", async () => {
  const { dom, $, w } = await setup();
  try {
    // 没打开过任何面板 → 干净
    assert.equal(unloadProbe(w).blocked, false);

    [...$("#tabs").querySelectorAll(".tab")].find((tab) => tab.dataset.tab === "about").click();
    await wait(() => $("#about-status").textContent.includes("已加载"));
    assert.equal(unloadProbe(w).blocked, false, "刚加载完的简介不算未保存");

    $("#about-editor").value += "\n再写一句";
    $("#about-editor").dispatchEvent(new w.Event("input"));
    const edited = unloadProbe(w);
    assert.equal(edited.blocked, true);
    assert.deepEqual(edited.pending, ["「个人简介」"]);
  } finally {
    await new Promise((r) => setTimeout(r, 30));
    dom.window.close();
  }
});

test("the checked-in appearance.json survives a round trip unchanged", async () => {
  // 仓库里正式使用的配置：解析后必须原样通过清洗（npm run check 会再校验构建产物）。
  const configured = JSON.parse(await readFile("source/_data/appearance.json", "utf8"));
  const value = appearance.resolveAppearance(configured);
  assert.deepEqual(value, configured);
  for (const key of ["avatar", "wallpaper", "favicon"]) {
    assert(appearance.isSafeImageUrl(configured[key]), `${key} must be a safe URL`);
  }
});
