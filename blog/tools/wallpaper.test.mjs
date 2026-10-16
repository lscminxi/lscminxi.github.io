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

// 访客端脚本由 npm run assets（tools/build-assets.mjs）从 client/wallpaper.js 打包。
const visitorJs = await readFile("themes/minxi/source/js/wallpaper.js", "utf8");
const adminHtml = await readFile("source/admin/index.html", "utf8");
const adminJs = await readFile("source/admin/admin.js", "utf8");
// 访客页面（构建产物）里的对话框与顶栏按钮；测试直接使用真实标记，避免与模板脱节。
const builtPage = await readFile("public/index.html", "utf8");
const dialogMarkup = /<dialog id="wallpaper-dialog"[\s\S]*?<\/dialog>/.exec(builtPage)?.[0];
const triggerMarkup = /<button class="wallpaper-trigger"[\s\S]*?<\/button>/.exec(builtPage)?.[0];
const htmlAttributes = /<html ([^>]*)>/.exec(builtPage)?.[1] || "";

const appearancePath = "blog/source/_data/appearance.json";
const imagePath = "blog/source/images/old.png";

// 构建时写进页面的站点默认壁纸；测试里的 /appearance.json 使用同一份值，
// 就像真实构建那样（HTML 与 appearance.json 是同一次构建的产物）。
const siteWallpaper = /data-wallpaper-src="([^"]+)"/.exec(builtPage)?.[1] || "";
const siteDim = Number(/data-wallpaper-dim="(\d+)"/.exec(builtPage)?.[1] ?? 62);
const siteBlur = Number(/data-wallpaper-blurpx="(\d+)"/.exec(builtPage)?.[1] ?? 0);

const gallery = [
  { id: "first-1", url: "https://cdn.example.com/first.png", label: "第一张" },
  { id: "second-2", url: "/images/old.png", label: "第二张" },
];
const fileData = {
  avatar: "",
  wallpaper: siteWallpaper,
  favicon: "/images/favicon.svg",
  wallpaperDim: siteDim,
  wallpaperBlur: siteBlur,
  wallpapers: gallery,
};

const wait = async (predicate, message = "Timed out waiting for UI") => {
  for (let i = 0; i < 300; i++) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.fail(message);
};
const tick = () => new Promise((r) => setTimeout(r, 10));

/* ================= 共享规则（构建、后台、访客端共用同一份） ================= */

test("the wallpaper gallery drops unsafe, malformed and duplicate entries", () => {
  const value = appearance.resolveWallpaperGallery([
    null,
    "https://x/a.png",
    [],
    42,
    { url: "https://x/a.png" }, // 正常
    { url: "https://x/a.png" }, // 重复地址
    { url: "javascript:alert(1)" },
    { url: "data:image/png;base64,AAAA" },
    { url: "/images/a b.png" },
    { url: "//evil.example/a.png" },
    { url: "/images/b.png", label: "  两\u0000  个   空格  " },
    { image: "/images/c.png" }, // 手写 JSON 里的别名
    { url: "/images/d.png", id: 'bad id"></script>' },
    { url: "/images/e.png", id: "same" },
    { url: "/images/f.png", id: "same" },
  ]);
  assert.deepEqual(value.map((item) => item.url), [
    "https://x/a.png",
    "/images/b.png",
    "/images/c.png",
    "/images/d.png",
    "/images/e.png",
    "/images/f.png",
  ]);
  assert.equal(value[0].label, "");
  assert.equal(value[1].label, "两 个 空格");
  assert.match(value[3].id, /^[a-z0-9_-]+$/, "非法字符的 id 会被规范化，不会破坏标记");
  assert.notEqual(value[4].id, value[5].id, "重复 id 会自动区分");
  for (const item of value) assert(appearance.isSafeImageUrl(item.url), item.url);
  assert.deepEqual(appearance.resolveWallpaperGallery("nope"), []);
  assert.deepEqual(appearance.resolveWallpaperGallery(null), []);
  const many = appearance.resolveWallpaperGallery(
    Array.from({ length: appearance.MAX_WALLPAPERS + 20 }, (_, i) => ({ url: `/images/${i}.png` })),
  );
  assert.equal(many.length, appearance.MAX_WALLPAPERS, "壁纸库有上限，避免页面被塞满");
});

test("wallpaper ids are stable per address so visitor choices survive re-adding", () => {
  const id = appearance.wallpaperId("https://cdn.example.com/upload/星空 hero.png");
  assert.equal(id, appearance.wallpaperId("https://cdn.example.com/upload/星空 hero.png"));
  assert.notEqual(id, appearance.wallpaperId("https://cdn.example.com/upload/other.png"));
  assert.match(id, /^[a-z0-9_-]+$/);
  assert.match(appearance.wallpaperId(""), /^wallpaper-[a-z0-9]+$/);
});

test("visitor choices are normalized: unknown modes, hostile urls and out-of-range values", () => {
  assert.deepEqual(appearance.normalizeVisitorChoice({ mode: "gallery", id: " First-1 " }), {
    mode: "gallery",
    id: "first-1",
  });
  assert.deepEqual(appearance.normalizeVisitorChoice("https://x/a.png"), {
    mode: "custom",
    url: "https://x/a.png",
  });
  assert.equal(appearance.normalizeVisitorChoice({ mode: "custom", url: "javascript:alert(1)" }), null);
  assert.equal(appearance.normalizeVisitorChoice({ mode: "custom" }), null);
  assert.equal(appearance.normalizeVisitorChoice({ mode: "gallery" }), null);
  assert.equal(appearance.normalizeVisitorChoice(null), null);
  assert.equal(appearance.normalizeVisitorChoice([1, 2]), null);
  const tuned = appearance.normalizeVisitorChoice({ mode: "gallery", id: "first-1", dim: "999", blur: -8 });
  assert.deepEqual(tuned, { mode: "gallery", id: "first-1", dim: 95, blur: 0 });
  assert.deepEqual(appearance.normalizeVisitorChoice({ mode: "none", url: "https://x/a.png", dim: "abc" }), {
    mode: "none",
    url: "https://x/a.png",
  });
});

test("resolving a visitor choice follows the gallery, the site default and removals", () => {
  const site = { wallpaper: "https://cdn.example.com/default.png", wallpaperDim: 48, wallpaperBlur: 2 };
  // 选中壁纸库里的一张：用列表里的最新地址（管理员改了地址也跟随）。
  const moved = appearance.resolveVisitorWallpaper({ mode: "gallery", id: "first-1" }, [
    { id: "first-1", url: "https://cdn.example.com/first-v2.png", label: "第一张" },
  ], site);
  assert.deepEqual(moved, {
    mode: "gallery",
    id: "first-1",
    url: "https://cdn.example.com/first-v2.png",
    label: "第一张",
    dim: 48,
    blur: 2,
  });
  // 下架（列表里没有这个 id）→ 自动回到站点默认壁纸。
  assert.equal(appearance.resolveVisitorWallpaper({ mode: "gallery", id: "gone" }, [], site).mode, "default");
  assert.equal(appearance.resolveVisitorWallpaper({ mode: "gallery", id: "gone" }, [], site).url, site.wallpaper);
  // 壁纸库还没加载完（首屏）→ 先用本地记下的地址，不闪默认壁纸。
  const early = appearance.resolveVisitorWallpaper(
    { mode: "gallery", id: "first-1", url: "https://cdn.example.com/first.png" },
    [],
    site,
    { ready: false },
  );
  assert.equal(early.url, "https://cdn.example.com/first.png");
  assert.equal(early.mode, "gallery");
  // 壁纸库加载完但 id 已失效 → 回落。
  assert.equal(
    appearance.resolveVisitorWallpaper(
      { mode: "gallery", id: "gone", url: "https://cdn.example.com/first.png" },
      [],
      site,
      { ready: true },
    ).mode,
    "default",
  );
  // 访客自己填的外链、纯色模式、以及被改坏的存储内容。
  assert.equal(appearance.resolveVisitorWallpaper({ mode: "custom", url: "/images/mine.png" }, [], site).url, "/images/mine.png");
  assert.equal(appearance.resolveVisitorWallpaper({ mode: "none" }, [], site).url, "");
  assert.equal(appearance.resolveVisitorWallpaper({ mode: "custom", url: "javascript:alert(1)" }, [], site).url, site.wallpaper);
  assert.equal(appearance.resolveVisitorWallpaper("nonsense", [], site).url, site.wallpaper);
  // 站点没有默认壁纸时，「默认」等价于纯色背景。
  assert.equal(appearance.resolveVisitorWallpaper({ mode: "default" }, [], { wallpaper: "" }).mode, "none");
});

/* ================= 访客端（构建产物 + 打包脚本） ================= */

async function visitor({ stored = null, galleryData = fileData, fetchStatus = 200, html = null } = {}) {
  assert(dialogMarkup && triggerMarkup, "构建产物里应包含背景选择对话框（先运行 npm run build）");
  const page = html ?? `<!doctype html><html ${htmlAttributes}><head></head><body><div class="header-actions">${triggerMarkup}</div>${dialogMarkup}</body></html>`;
  const dom = new JSDOM(page, { url: "https://lscminxi.github.io/", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  if (stored !== null) w.localStorage.setItem(appearance.VISITOR_STORAGE_KEY, typeof stored === "string" ? stored : JSON.stringify(stored));
  const state = { fetches: [] };
  w.fetch = async (url) => {
    state.fetches.push(String(url));
    return {
      ok: fetchStatus < 400,
      status: fetchStatus,
      json: async () => galleryData,
    };
  };
  w.eval(visitorJs);
  return { dom, w, state, $: (selector) => w.document.querySelector(selector) };
}

const cssVar = (w, name) => w.document.documentElement.style.getPropertyValue(name);

// 图片加载/失败等事件是异步的，等它们结束后再关闭窗口，避免回调访问已销毁的 document。
const closeVisitor = async (dom) => {
  await new Promise((resolve) => setTimeout(resolve, 30));
  dom.window.close();
};

test("a stored visitor wallpaper is applied before the page paints", async () => {
  const { dom, w } = await visitor({ stored: { mode: "gallery", id: "first-1", url: "https://cdn.example.com/first.png", dim: 40, blur: 6 } });
  try {
    const root = w.document.documentElement;
    // 构建时渲染了站点默认壁纸，脚本必须把它换成访客自己的选择。
    assert.equal(root.dataset.wallpaper, "on");
    assert.equal(cssVar(w, "--wallpaper-image"), 'url("https://cdn.example.com/first.png")');
    assert.equal(cssVar(w, "--wallpaper-veil"), "0.40");
    assert.equal(cssVar(w, "--wallpaper-blur"), "6px");
    assert.equal(root.dataset.wallpaperBlur, "on");
  } finally {
    await closeVisitor(dom);
  }
});

test("no stored choice keeps the site default, hostile values are ignored", async () => {
  for (const stored of [null, "javascript:alert(1)", { mode: "custom", url: 'https://x/a.png");background:red' }, { mode: "gallery", id: "gone" }]) {
    const { dom, w } = await visitor({ stored });
    try {
      assert.equal(cssVar(w, "--wallpaper-image"), "", `No inline override for ${JSON.stringify(stored)}`);
      assert.equal(w.document.documentElement.dataset.wallpaper, "on", "构建时渲染的默认壁纸保持不动");
    } finally {
      dom.window.close();
    }
  }
});

test("any visitor can open the picker and choose a background from the gallery", async () => {
  const { dom, w, $, state } = await visitor();
  try {
    await wait(() => !$(".wallpaper-trigger").hidden, "没有脚本时按钮隐藏，脚本运行后才出现");
    $(".wallpaper-trigger").click();
    await wait(() => $("#wallpaper-grid .wallpaper-tile[data-id='second-2']") || $("#wallpaper-grid .wallpaper-tile"));
    await wait(() => w.document.querySelectorAll("#wallpaper-grid .wallpaper-tile").length === gallery.length + 2);
    assert.equal($("#wallpaper-dialog").open, true);
    assert(state.fetches.some((url) => url.includes("/appearance.json")), "列表来自公开的 /appearance.json");

    const names = [...w.document.querySelectorAll(".wallpaper-tile .wallpaper-name")].map((node) => node.textContent);
    assert.deepEqual(names, ["站点默认", "第一张", "第二张", "纯色背景"]);

    $("#wallpaper-grid .wallpaper-tile[data-id='second-2']").click();
    assert.equal(cssVar(w, "--wallpaper-image"), 'url("/images/old.png")');
    // 选中后列表会重建（保持键盘焦点），所以重新查询当前高亮项
    assert.equal($("#wallpaper-grid .wallpaper-tile[data-id='second-2']").getAttribute("aria-pressed"), "true");
    assert.equal($("#wallpaper-current").textContent.includes("第二张"), true);
    const saved = JSON.parse(w.localStorage.getItem(appearance.VISITOR_STORAGE_KEY));
    assert.deepEqual(saved, { mode: "gallery", id: "second-2", url: "/images/old.png" });

    // 访客自己的外链
    $("#wallpaper-url").value = "  https://cdn.example.com/mine.webp  ";
    $("#wallpaper-url-form").dispatchEvent(new w.Event("submit", { cancelable: true }));
    assert.equal(cssVar(w, "--wallpaper-image"), 'url("https://cdn.example.com/mine.webp")');
    assert.equal(JSON.parse(w.localStorage.getItem(appearance.VISITOR_STORAGE_KEY)).mode, "custom");

    // 非法地址被拒绝，且不会覆盖已经生效的背景
    $("#wallpaper-url").value = "javascript:alert(1)";
    $("#wallpaper-url-form").dispatchEvent(new w.Event("submit", { cancelable: true }));
    assert.equal($("#wallpaper-status").className.includes("err"), true);
    assert.equal(cssVar(w, "--wallpaper-image"), 'url("https://cdn.example.com/mine.webp")');

    // 压暗 / 模糊只改自己的显示
    $("#wallpaper-dim").value = "80";
    $("#wallpaper-dim").dispatchEvent(new w.Event("input"));
    assert.equal(cssVar(w, "--wallpaper-veil"), "0.80");
    assert.equal($("#wallpaper-dim-value").textContent, "80%");
    assert.equal(JSON.parse(w.localStorage.getItem(appearance.VISITOR_STORAGE_KEY)).dim, 80);

    // 恢复站点默认：清掉本地记录并还原构建时的样式
    $("#wallpaper-reset").click();
    assert.equal(w.localStorage.getItem(appearance.VISITOR_STORAGE_KEY), null);
    assert.equal(cssVar(w, "--wallpaper-image"), "");
    assert.equal(w.document.documentElement.dataset.wallpaper, "on");

    // 纯色背景：关掉壁纸层
    $("#wallpaper-grid .wallpaper-tile[data-mode='none']").click();
    assert.equal(w.document.documentElement.hasAttribute("data-wallpaper"), false);
    assert.equal(JSON.parse(w.localStorage.getItem(appearance.VISITOR_STORAGE_KEY)).mode, "none");
  } finally {
    await closeVisitor(dom);
  }
});

test("the picker re-checks the gallery on load and after removals fall back to the default", async () => {
  const removed = { ...fileData, wallpapers: [gallery[1]] }; // 管理员下架了「第一张」
  const { dom, w, $ } = await visitor({ stored: { mode: "gallery", id: "first-1", url: "https://cdn.example.com/first.png" }, galleryData: removed });
  try {
    await wait(() => w.MinxiWallpaper.gallery().length === 1, "页面加载后会读取一次壁纸库");
    assert.equal(w.MinxiWallpaper.current().mode, "default", "被下架的选择自动回落");
    assert.equal(cssVar(w, "--wallpaper-image"), "");
    assert.equal(w.document.documentElement.dataset.wallpaper, "on", "回落后仍是站点默认壁纸，而不是纯色");
    assert.equal(w.MinxiWallpaper.current().url, siteWallpaper);
    const stored = JSON.parse(w.localStorage.getItem(appearance.VISITOR_STORAGE_KEY));
    assert.equal(stored.mode, "gallery", "本地记录保持不变：图片重新上架后访客的选择会回来");
    $("#wallpaper-grid .wallpaper-tile[data-mode='default']").click();
    assert.equal(JSON.parse(w.localStorage.getItem(appearance.VISITOR_STORAGE_KEY)).mode, "default");
  } finally {
    await closeVisitor(dom);
  }
});

test("the freshly published default wallpaper wins over a cached page", async () => {
  const updated = { ...fileData, wallpaper: "https://cdn.example.com/new-default.png", wallpaperDim: 20, wallpaperBlur: 3 };
  const { dom, w } = await visitor({ galleryData: updated });
  try {
    await wait(() => w.MinxiWallpaper.siteDefaults().wallpaper === updated.wallpaper);
    assert.equal(w.MinxiWallpaper.current().url, updated.wallpaper);
    assert.equal(cssVar(w, "--wallpaper-image"), 'url("https://cdn.example.com/new-default.png")');
    assert.equal(cssVar(w, "--wallpaper-veil"), "0.20");
  } finally {
    await closeVisitor(dom);
  }
});

test("gallery labels are never rendered as markup and a failed list degrades gracefully", async () => {
  const hostile = {
    ...fileData,
    wallpapers: [
      { id: "evil-1", url: "https://cdn.example.com/evil.png", label: "<img src=x onerror=alert(1)>" },
      { id: "evil-2", url: "javascript:alert(1)", label: "坏地址" },
    ],
  };
  const { dom, w, $ } = await visitor({ galleryData: hostile });
  try {
    await wait(() => w.MinxiWallpaper.gallery().length === 1);
    $(".wallpaper-trigger").click();
    await wait(() => $("#wallpaper-grid .wallpaper-tile[data-id='evil-1']"));
    assert.equal($("#wallpaper-grid img[src='x']"), null, "标签只作为纯文本");
    assert.equal(
      $("#wallpaper-grid .wallpaper-tile[data-id='evil-1'] .wallpaper-name").textContent,
      "<img src=x onerror=alert(1)>",
    );
    assert.equal($("#wallpaper-grid .wallpaper-tile[data-id='evil-2']"), null, "危险地址不会进入列表");
  } finally {
    dom.window.close();
  }

  // 列表读取失败：访客仍可恢复默认或用自己的外链，页面不受影响。
  const failed = await visitor({ fetchStatus: 503 });
  try {
    await wait(() => failed.$("#wallpaper-status").textContent.includes("无法读取背景列表"));
    failed.$(".wallpaper-trigger").click();
    failed.$("#wallpaper-url").value = "https://cdn.example.com/mine.png";
    failed.$("#wallpaper-url-form").dispatchEvent(new failed.w.Event("submit", { cancelable: true }));
    assert.equal(cssVar(failed.w, "--wallpaper-image"), 'url("https://cdn.example.com/mine.png")');
  } finally {
    await closeVisitor(failed.dom);
  }
});

test("clicking the wallpaper button must never open the search dialog", async () => {
  // 回归：wallpaper 按钮曾经复用了 .search-trigger 类，而 main.js 会给所有
  // .search-trigger 绑定「打开搜索」，于是每次点「背景」都会弹出搜索框。
  const siteJs = await readFile("themes/minxi/source/js/main.js", "utf8");
  const css = await readFile("themes/minxi/source/css/main.css", "utf8");
  assert(dialogMarkup && triggerMarkup, "构建产物里应包含背景选择对话框（先运行 npm run build）");

  assert(!/class="[^"]*\bsearch-trigger\b[^"]*"[^>]*data-open-wallpaper/.test(triggerMarkup), "背景按钮不能带 search-trigger 类");
  assert(triggerMarkup.includes('class="wallpaper-trigger"'));
  for (const selector of [".search-trigger", ".wallpaper-trigger"]) {
    assert(css.includes(selector + " {") || css.includes(selector + ","), `${selector} 需要自己的样式`);
  }
  // 没有脚本时按钮不该出现（作者样式不能盖掉 [hidden]）
  assert(css.includes(".wallpaper-trigger[hidden]"), "[hidden] 时必须隐藏背景按钮");

  const page = `<!doctype html><html ${htmlAttributes}><head></head><body>
    <div class="header-actions">
      <button class="search-trigger" aria-label="搜索文章"><span>搜索</span></button>
      ${triggerMarkup}
    </div>
    <dialog id="search-dialog" data-index="/search.json"><button id="close-search"></button><input id="search-input" type="search"><div id="search-results"></div></dialog>
    ${dialogMarkup}
    <button id="back-top" hidden></button>
  </body></html>`;
  const dom = new JSDOM(page, { url: "https://lscminxi.github.io/", runScripts: "outside-only" });
  const w = dom.window;
  w.fetch = async () => ({ ok: true, json: async () => [] });
  const search = w.document.querySelector("#search-dialog");
  let opened = 0;
  search.showModal = () => { opened += 1; Object.defineProperty(search, "open", { value: true, configurable: true }); };
  w.eval(siteJs); // 前台脚本先跑
  w.eval(visitorJs); // 再跑背景选择器
  try {
    w.document.querySelector(".wallpaper-trigger").dispatchEvent(new w.Event("click", { bubbles: true }));
    assert.equal(opened, 0, "点「背景」不能打开搜索");
    assert.notEqual(search.open, true, "搜索框保持关闭");
    w.document.querySelector(".search-trigger").dispatchEvent(new w.Event("click", { bubbles: true }));
    assert.equal(opened, 1, "搜索按钮本身仍然有效");
  } finally {
    await closeVisitor(dom);
  }
});

test("admin assets are versioned so a new panel cannot be hidden behind the browser cache", async () => {
  // 回归：admin.css 曾经没有版本号、admin.js 的版本号也没有随功能更新，
  // 浏览器会继续用缓存里的旧脚本，于是「可选背景」列表看起来是空的、按钮也没反应。
  for (const asset of ["admin.css", "admin.js", "appearance.js"]) {
    const pattern = new RegExp(`(?:href|src)="(?:\\./)?${asset.replace(".", "\\.")}\\?v=[^"]+"`);
    assert(pattern.test(adminHtml), `${asset} 必须带版本号`);
  }
  assert(!adminHtml.includes("admin.js?v=pin-3"), "admin.js 的版本号必须随本次改动更新");
  assert(builtPage.includes("/css/main.css?v="), "主题样式必须带版本号");
  assert(builtPage.includes("/js/wallpaper.js?v="), "访客端脚本必须带版本号");
});

/* ================= 管理后台（只有 admin 能上传 / 下架） ================= */

async function setupAdmin({ fileText = JSON.stringify(fileData), login = true } = {}) {
  const dom = new JSDOM(adminHtml, { url: "https://preview.example/admin/", runScripts: "outside-only" });
  const w = dom.window;
  w.scrollTo = () => {};
  w.TextEncoder = TextEncoder;
  w.TextDecoder = TextDecoder;
  w.MinxiPreview = { document: () => "<!doctype html><html></html>" };
  w.setInterval = () => 0;
  w.clearInterval = () => {};
  w.setTimeout = () => 0;
  w.clearTimeout = () => {};
  const files = new Map([
    [appearancePath, { sha: "appearance-sha", text: fileText }],
    [imagePath, { sha: "image-sha", text: "binary" }],
  ]);
  const state = { writes: [], blobs: [], commits: [] };
  const reply = (status, data) => ({
    ok: status < 400,
    status,
    text: async () => JSON.stringify(data),
    json: async () => data,
  });
  w.fetch = async (url, opts = {}) => {
    const uri = new URL(url);
    const suffix = decodeURIComponent(uri.pathname.replace("/repos/lscminxi/lscminxi.github.io", ""));
    if (suffix === "/appearance.json") return reply(200, fileData);
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
        const decoded = Buffer.from(body.content, "base64").toString();
        state.writes.push({ path: filePath, ...body, decoded });
        if (filePath.endsWith(".json")) files.set(filePath, { sha: "saved-sha", text: decoded });
        else state.blobs.push({ path: filePath, bytes: Buffer.from(body.content, "base64").length });
        state.commits.push(body.message);
        return reply(200, { content: { sha: "saved-sha" }, commit: { sha: "save-commit" } });
      }
      const file = files.get(filePath);
      return file
        ? reply(200, { sha: file.sha, size: file.text.length, encoding: "base64", content: Buffer.from(file.text).toString("base64") })
        : reply(404, { message: "Not Found" });
    }
    if (suffix.startsWith("/contents")) return reply(200, []);
    throw new Error(`Unexpected API ${suffix}`);
  };
  w.eval(await readFile("source/admin/appearance.js", "utf8"));
  w.eval(adminJs);
  const $ = (selector) => w.document.querySelector(selector);
  const api = { dom, w, $, files, state };
  if (!login) return api;
  $("#token-input").value = "test-token-not-real";
  $("#login-form").dispatchEvent(new w.Event("submit", { cancelable: true }));
  await wait(() => $("#post-list"));
  await wait(() => !$("#refresh-button").disabled);
  [...$("#tabs").querySelectorAll(".tab")].find((tab) => tab.dataset.tab === "appearance").click();
  await wait(() => $("#appearance-status").textContent.includes("已加载"));
  return api;
}

const teardown = async (dom) => {
  await new Promise((r) => setTimeout(r, 120));
  dom.window.close();
};

test("the admin panel lists the gallery and can add, reorder, default and retire entries", async () => {
  const { dom, $, state, w } = await setupAdmin();
  try {
    assert.equal($("#wallpaper-count").textContent, "2");
    assert.equal($("#wallpaper-max").textContent, String(appearance.MAX_WALLPAPERS));
    const titles = () => [...$("#wallpaper-list").querySelectorAll(".row-title")].map((node) => node.textContent);
    assert.deepEqual(titles(), ["第一张", "第二张"]);

    // 用外链 + 名称加入
    $("#wallpaper-url").value = "https://cdn.example.com/third.png";
    $("#wallpaper-label").value = "第三张";
    $("#wallpaper-add").click();
    assert.deepEqual(titles(), ["第一张", "第二张", "第三张"]);
    assert($("#wallpaper-note").textContent.includes("点「保存并提交」"), "改动需要管理员确认后才提交");
    assert.equal(state.writes.length, 0, "加入列表本身不会立刻提交");

    // 重复地址 / 非法地址
    $("#wallpaper-url").value = "https://cdn.example.com/third.png";
    $("#wallpaper-label").value = "";
    $("#wallpaper-add").click();
    assert($("#wallpaper-note").textContent.includes("已经在可选背景里"));
    $("#wallpaper-url").value = "javascript:alert(1)";
    $("#wallpaper-add").click();
    assert($("#wallpaper-note").textContent.includes("地址不合法"));
    assert.equal($("#wallpaper-count").textContent, "3");

    // 从已上传的图片里选
    assert(
      [...$("#wallpaper-image").options].some((option) => option.value === "/images/old.png"),
      "已上传的图片会出现在下拉里",
    );

    // 上移 / 下移
    const rows = () => [...$("#wallpaper-list").querySelectorAll(".row")];
    [...rows()[2].querySelectorAll("button")].find((button) => button.textContent === "上移").click();
    assert.deepEqual(titles(), ["第一张", "第三张", "第二张"]);

    // 设为默认壁纸：填入「页面壁纸」字段
    [...rows()[1].querySelectorAll("button")].find((button) => button.textContent === "设为默认壁纸").click();
    assert.equal($("#a-wallpaper").value, "https://cdn.example.com/third.png");

    // 保存：壁纸库随 appearance.json 一起提交
    $("#appearance-save").click();
    await wait(() => state.writes.length === 1);
    const saved = JSON.parse(state.writes[0].decoded);
    assert.equal(state.writes[0].path, appearancePath);
    assert.equal(state.writes[0].branch, "main");
    assert.equal(state.writes[0].sha, "appearance-sha");
    assert.equal(saved.wallpaper, "https://cdn.example.com/third.png");
    assert.deepEqual(saved.wallpapers.map((item) => item.url), [
      "https://cdn.example.com/first.png",
      "https://cdn.example.com/third.png",
      "/images/old.png",
    ]);
    assert.deepEqual(saved.wallpapers.map((item) => item.label), ["第一张", "第三张", "第二张"]);
    assert.equal(saved.wallpapers[1].id, appearance.wallpaperId("https://cdn.example.com/third.png"));
    await wait(() => $("#wallpaper-note").textContent.includes("2 张") === false);

    // 下架：确认后从列表移除，保存后生效
    [...rows()[2].querySelectorAll("button")].find((button) => button.textContent === "下架").click();
    await wait(() => !$("#modal").hidden);
    assert($("#modal-text").textContent.includes("会自动回到站点默认壁纸"));
    $("#modal-cancel").click();
    await tick();
    assert.deepEqual(titles(), ["第一张", "第三张", "第二张"], "取消不会移除");
    [...rows()[2].querySelectorAll("button")].find((button) => button.textContent === "下架").click();
    await wait(() => !$("#modal").hidden);
    $("#modal-ok").click();
    await wait(() => $("#wallpaper-count").textContent === "2");
    assert.deepEqual(titles(), ["第一张", "第三张"]);
    $("#appearance-save").click();
    await wait(() => state.writes.length === 2);
    assert.deepEqual(
      JSON.parse(state.writes[1].decoded).wallpapers.map((item) => item.url),
      ["https://cdn.example.com/first.png", "https://cdn.example.com/third.png"],
    );
    assert.equal(w.document.querySelector("#wallpaper-list .thumb").style.backgroundImage.includes("https://cdn.example.com/first.png"), true);
    // 保存的提示可能晚于点击到达；先等它写完，后面的上传提示才不会被它覆盖。
    await wait(() => $("#wallpaper-note").textContent.includes("已更新为"));
  } finally {
    await teardown(dom);
  }
});

test("the admin uploads several background images at once and they join the gallery", async () => {
  const { dom, $, state, w } = await setupAdmin();
  try {
    const input = $("#wallpaper-upload");
    const make = (name, bytes) => {
      const file = new w.File([new Uint8Array(bytes)], name, { type: "image/png" });
      return file;
    };
    const files = [make("星空.png", 2048), make("forest.png", 1024), make("bad.txt", 10)];
    Object.defineProperty(input, "files", { value: files, configurable: true });
    input.dispatchEvent(new w.Event("change"));
    await wait(() => state.blobs.length === 2, "只上传受支持的图片");
    // 上传是异步的：等这一轮处理完全结束（提示写完）再做下一步，避免提示互相覆盖。
    await wait(() => $("#wallpaper-note").textContent.includes("已上传 2 张"));
    const uploaded = state.blobs.map((blob) => blob.path).sort();
    assert.equal(uploaded[0], "blog/source/images/forest.png");
    // 中文文件名在 URL 里不安全，会回落到 image-<时间戳>，但列表里的名称仍是原文。
    assert.match(uploaded[1], /^blog\/source\/images\/image-\d+\.png$/);
    assert(state.commits.every((message) => message.includes("upload wallpaper")));
    assert.equal($("#wallpaper-count").textContent, "4", "上传后的图片直接进入列表草稿");
    assert($("#wallpaper-note").textContent.includes("点「保存并提交」"));
    const urls = [...$("#wallpaper-list").querySelectorAll(".row-meta")].map((node) => node.textContent);
    assert(urls.some((text) => text.includes("/images/forest.png")));
    assert(
      [...$("#wallpaper-list").querySelectorAll(".row-title")].some((node) => node.textContent === "星空"),
      "中文名称会保留为访客看到的标签",
    );
    assert($("#wallpaper-note").textContent.includes("跳过 bad.txt") === false, "提示以最后一次操作为准");
    // 图片文件（putBinary）也会出现在 state.writes 里，这里只看外观配置文件。
    const appearanceWrites = () => state.writes.filter((write) => write.path === appearancePath);
    assert(appearanceWrites().length === 0, "只有图片文件被提交，列表要等「保存并提交」");

    $("#appearance-save").click();
    await wait(() => appearanceWrites().length === 1);
    await wait(() => $("#wallpaper-note").textContent.includes("已更新为"));
    const saved = JSON.parse(appearanceWrites()[0].decoded);
    assert.equal(saved.wallpapers.length, 4);
    assert(saved.wallpapers.some((item) => item.url === "/images/forest.png"));

    // 超过 1 MB 的文件会被跳过
    const big = new w.File([new Uint8Array(1)], "huge.png", { type: "image/png" });
    Object.defineProperty(big, "size", { value: 2_000_000 });
    Object.defineProperty(input, "files", { value: [big], configurable: true });
    input.dispatchEvent(new w.Event("change"));
    await wait(() => $("#wallpaper-note").textContent.includes("超过 1 MB"));
    assert.equal(state.blobs.length, 2, "超限文件不会上传");
  } finally {
    await teardown(dom);
  }
});

test("oversized photos are compressed in the browser before upload (1 MB API limit)", async () => {
  const { dom, $, state, w } = await setupAdmin();
  try {
    // 模拟浏览器：解码位图 + canvas 重新编码
    const drawn = [];
    w.createImageBitmap = async () => ({ width: 4000, height: 3000, close() {} });
    w.HTMLCanvasElement.prototype.getContext = function () {
      return { drawImage: (...args) => drawn.push(args) };
    };
    w.HTMLCanvasElement.prototype.toBlob = function (callback) {
      callback(new w.Blob([new Uint8Array(500 * 1024)], { type: "image/webp" }));
    };
    const input = $("#wallpaper-upload");
    const big = new w.File([new Uint8Array(10)], "photo.jpg", { type: "image/jpeg" });
    Object.defineProperty(big, "size", { value: 4_000_000 });
    Object.defineProperty(input, "files", { value: [big], configurable: true });
    input.dispatchEvent(new w.Event("change"));
    await wait(() => state.blobs.length === 1, "大图会被压缩后上传，而不是被跳过");
    assert.equal(state.blobs[0].path, "blog/source/images/photo.webp", "照片压缩后转成 WebP");
    assert(state.blobs[0].bytes < 1_000_000, "上传的内容必须低于 Contents API 的 1 MB 限制");
    assert.equal(drawn.length, 1);
    assert.deepEqual(drawn[0].slice(1), [0, 0, 2400, 1800], "长边限制在 2400，等比缩小");
    await wait(() => $("#wallpaper-note").textContent.includes("已自动压缩"));
    assert.equal($("#wallpaper-count").textContent, "3", "原有 2 张 + 新上传的 1 张");

    $("#appearance-save").click();
    await wait(() => state.writes.filter((write) => write.path === appearancePath).length === 1);
    const saved = JSON.parse(state.writes.find((write) => write.path === appearancePath).decoded);
    assert.equal(saved.wallpapers.at(-1).url, "/images/photo.webp");

    // 「图片」标签页的上传走同一套准备逻辑
    [...$("#tabs").querySelectorAll(".tab")].find((tab) => tab.dataset.tab === "media").click();
    const mediaInput = $("#upload-input");
    const another = new w.File([new Uint8Array(10)], "big-photo.jpg", { type: "image/jpeg" });
    Object.defineProperty(another, "size", { value: 2_500_000 });
    Object.defineProperty(mediaInput, "files", { value: [another], configurable: true });
    mediaInput.dispatchEvent(new w.Event("change"));
    await wait(() => state.blobs.length === 2);
    assert.equal(state.blobs[1].path, "blog/source/images/big-photo.webp");
    assert($("#media-list").textContent.includes("big-photo.webp"));

    // 动图 / 矢量图没有可靠的压缩方式：仍然明确提示超限，不会静默失败
    const gif = new w.File([new Uint8Array(10)], "anim.gif", { type: "image/gif" });
    Object.defineProperty(gif, "size", { value: 3_000_000 });
    Object.defineProperty(input, "files", { value: [gif], configurable: true });
    input.dispatchEvent(new w.Event("change"));
    await wait(() => $("#wallpaper-note").textContent.includes("无法自动压缩"));
    assert.equal(state.blobs.length, 2, "gif 不会被上传");
  } finally {
    await teardown(dom);
  }
});

test("non-admin visitors cannot change the gallery: saving needs a token with write access", async () => {
  const { dom, $, state } = await setupAdmin({ login: false });
  try {
    assert.equal($("#view-app").hidden, true, "没有登录时看不到管理界面");
    assert.equal(state.writes.length, 0);
    $("#token-input").value = "";
    $("#login-form").dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
    await tick();
    assert($("#login-error").textContent.includes("请粘贴"), "必须提供令牌");
    assert.equal(state.writes.length, 0);
  } finally {
    await teardown(dom);
  }
});

test("removing an image that the gallery uses warns the admin first", async () => {
  const { dom, $ } = await setupAdmin();
  try {
    [...$("#tabs").querySelectorAll(".tab")].find((tab) => tab.dataset.tab === "media").click();
    const row = [...$("#media-list").querySelectorAll(".row")].find((item) => item.textContent.includes("old.png"));
    [...row.querySelectorAll("button")].find((button) => button.textContent === "删除").click();
    await wait(() => !$("#modal").hidden);
    assert($("#modal-text").textContent.includes("可选背景"), "删除会提示它正被用作可选背景");
    $("#modal-cancel").click();
    await tick();
    assert.equal($("#modal").hidden, true);
  } finally {
    await teardown(dom);
  }
});

test("a hand-edited appearance.json without a gallery keeps the panel working", async () => {
  const { dom, $ } = await setupAdmin({
    fileText: JSON.stringify({ avatar: "", wallpaper: "", favicon: "/images/favicon.svg", wallpaperDim: 48, wallpaperBlur: 0 }),
  });
  try {
    assert.equal($("#wallpaper-count").textContent, "0");
    assert($("#wallpaper-list").textContent.includes("还没有可选背景"));
    $("#wallpaper-url").value = "https://cdn.example.com/new.png";
    $("#wallpaper-add").click();
    assert.equal($("#wallpaper-count").textContent, "1");
  } finally {
    await teardown(dom);
  }
});

/* ================= 构建产物 ================= */

test("a hostile wallpaper list cannot inject markup or CSS into the built site", async () => {
  const temp = await mkdtemp(join(tmpdir(), "minxi-wallpapers-"));
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
        avatar: "",
        wallpaper: "/images/broken.png",
        favicon: "/images/favicon.svg",
        wallpaperDim: 48,
        wallpaperBlur: 0,
        wallpapers: [
          { id: '"><script>alert(1)</script>', url: '/images/a.png" onload="alert(1)', label: "<script>alert(2)</script>" },
          { url: "javascript:alert(3)" },
          { url: "data:image/svg+xml,<svg onload=alert(4)>" },
          { url: "/images/ok.png", label: "正常" },
        ],
      }),
    );
    await exec("npm", ["run", "build"], { cwd: join(temp, "blog"), timeout: 120000 });
    const published = JSON.parse(await readFile(join(temp, "blog/public/appearance.json"), "utf8"));
    assert.deepEqual(published.wallpapers, [
      { id: appearance.wallpaperId("/images/ok.png"), url: "/images/ok.png", label: "正常" },
    ]);
    const built = await readFile(join(temp, "blog/public/index.html"), "utf8");
    assert(!built.includes("alert(1)"), "壁纸库不会写进 HTML：访客端只读公开 JSON");
    assert(!built.includes("onload"), "被拒绝的地址不会出现在属性里");
    assert(built.includes('data-wallpaper-src="/images/broken.png"'), "默认壁纸按原样转义输出");
    const bundle = await readFile(join(temp, "blog/public/js/wallpaper.js"), "utf8");
    assert(bundle.includes("wallpaper-dialog"), "访客端脚本随主题一起发布");
    assert(!/javascript:/i.test(published.wallpapers.map((item) => item.url).join("")), "危险地址不会进入公开配置");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("the checked-in appearance.json exposes a usable gallery for every visitor", async () => {
  const configured = JSON.parse(await readFile("source/_data/appearance.json", "utf8"));
  const value = appearance.resolveAppearance(configured);
  assert.deepEqual(value, configured, "仓库里的正式配置必须原样通过清洗");
  for (const item of value.wallpapers) {
    assert(appearance.isSafeImageUrl(item.url), `${item.url} must be safe`);
    assert.match(item.id, /^[a-z0-9_-]+$/);
    assert.equal(item.id, appearance.wallpaperId(item.url), "id 由地址推导，重命名标签不会让访客的选择失效");
  }
  if (value.wallpapers.length) {
    assert(value.wallpaper, "有可选背景时站点也应有一个默认壁纸");
  }
});
