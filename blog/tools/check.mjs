import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import appearance from "../lib/appearance.cjs";

const root = resolve("public");
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else files.push(path);
  }
}
await walk(root);
assert(files.length > 0, "Build output is empty; run npm run build first");
const index = await readFile(join(root, "index.html"), "utf8");
assert(index.includes("Minxi 的 blog"), "Site title missing");
assert(index.includes("幼儿园小班水平"), "Profile missing");
assert(index.includes("lsc_minxi"), "Author missing");
const about = await readFile(join(root, "about", "index.html"), "utf8");
// 「关于」页保留但不在主导航里：导航区块不许出现 /about/，首页其它位置（个人卡片/首屏）仍要能点进去。
const navBlock = /<nav class="desktop-nav"[\s\S]*?<\/nav>/.exec(index)?.[0] || "";
assert(navBlock, "Main navigation is missing");
assert(!navBlock.includes("/about/"), "About page must not be linked from the main navigation");
assert(!navBlock.includes(">关于<"), "About link must not appear in the main navigation");
assert(index.includes('href="/about/"'), "About page must still be reachable from elsewhere on the home page");

assert(about.includes("？！糖糖"), "About page bio missing");
assert(!index.includes("example.com"), "Default Hexo URL remains");
const search = JSON.parse(await readFile(join(root, "search.json"), "utf8"));
assert(Array.isArray(search), "Search index must be an array");

// 外观（头像 / 壁纸 / 网页图标）必须和 source/_data/appearance.json 一致：
// 后台写入的地址经过同一套清洗规则，构建产物里不允许出现可注入的 URL。
const look = appearance.resolveAppearance(JSON.parse(await readFile(join(root, "appearance.json"), "utf8")));
const decoded = (value) => value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
for (const key of ["avatar", "wallpaper", "favicon"]) {
  assert(look[key] === "" || appearance.isSafeImageUrl(look[key]), `Unsafe ${key} URL: ${look[key]}`);
}
const icon = /<link rel="icon"[^>]*href="([^"]+)"/.exec(index);
assert(icon, "Missing favicon link");
assert.equal(decoded(icon[1]), look.favicon, "Favicon must match appearance.json");
const avatar = /<img class="avatar-image" src="([^"]+)"/.exec(index);
if (look.avatar) {
  assert(avatar, "Configured avatar must be rendered in the sidebar");
  assert.equal(decoded(avatar[1]), look.avatar, "Avatar must match appearance.json");
} else {
  assert(!avatar, "No avatar image is rendered when none is configured");
}
// 访客可自选背景（wallpapers）：公开 JSON 必须与源码一致，
// 站内路径必须真实存在，并且页面里要有「背景」选择器的标记与脚本。
const configured = appearance.resolveAppearance(
  JSON.parse(await readFile(join("source", "_data", "appearance.json"), "utf8")),
);
assert.deepEqual(look, configured, "public/appearance.json must match source/_data/appearance.json");
assert(index.includes('id="wallpaper-dialog"'), "Background picker dialog is missing");
assert(index.includes("/js/wallpaper.js"), "Background picker script is missing");
assert(index.includes("data-open-wallpaper"), "Background picker trigger is missing");
for (const id of ["wallpaper-save-current", "wallpaper-saved-grid", "wallpaper-saved-note", "wallpaper-saved-empty"]) {
  assert(index.includes(`id="${id}"`), `Logged-in wallpaper saving UI is missing: #${id}`);
}
assert(index.includes("/js/wallpaper.js?v=wallpaper-2"), "Wallpaper script must use the saved-wallpaper cache version");
const defaultSrc = /data-wallpaper-src="([^"]*)"/.exec(index);
assert.equal(
  decoded(defaultSrc?.[1] ?? ""),
  look.wallpaper,
  "The picker must be able to read the default wallpaper from the page",
);
for (const item of look.wallpapers) {
  assert.match(item.id, /^[a-z0-9_-]+$/, `Invalid wallpaper id: ${item.id}`);
  assert(appearance.isSafeImageUrl(item.url), `Unsafe wallpaper URL: ${item.url}`);
  assert(typeof item.label === "string" && item.label.length <= appearance.MAX_LABEL_LENGTH);
  if (item.url.startsWith("/")) {
    await stat(join(root, "." + decodeURIComponent(item.url.split(/[?#]/)[0])));
  }
}
assert(look.wallpapers.length <= appearance.MAX_WALLPAPERS, "Too many wallpapers in the gallery");

// 主题：默认值必须写进页面，浅色样式与脚本都要随构建产物发布。
assert(["auto", "light", "dark"].includes(look.theme), `Invalid theme: ${look.theme}`);
const themeDefault = /data-theme-default="([^"]*)"/.exec(index);
assert.equal(themeDefault?.[1], look.theme, "Theme default must match appearance.json");
assert(index.includes("/js/theme.js"), "Theme script is missing");
assert(index.includes("data-theme-toggle"), "Theme toggle button is missing");
// 访客登录与评论：每个页面都要有可见的登录按钮、登录/未登录提醒/无权限弹窗与脚本；
// 文章页还要有评论区（评论 + 点赞）。后台只允许站长，访客进入时显示「你无权限进入」。
assert(index.includes("/js/auth.js"), "Auth script is missing");
assert(index.includes("data-auth-login"), "Visible login button is missing");
assert(index.includes('id="auth-dialog"'), "Login dialog is missing");
assert(!index.includes("auth-captcha"), "Captcha login must not be shipped");
assert(!index.includes("图形验证码"), "Captcha login UI must not be shipped");
assert(!index.includes('id="auth-form"'), "Username-only login form must not be shipped");
assert(index.includes('id="auth-required-dialog"'), "Login-required dialog is missing");
assert(index.includes('id="auth-noaccess-dialog"'), "No-access dialog is missing");
const aPost = search[0];
if (aPost) {
  const postHtml = await readFile(join(root, "." + decodeURIComponent(aPost.url), "index.html"), "utf8");
  assert(postHtml.includes("data-comments"), "Post comment section is missing");
  assert(postHtml.includes("data-like-button"), "Post like button is missing");
  assert(postHtml.includes("data-comment-form"), "Post comment form is missing");
}
// GitHub OAuth：公开配置与回调页必须随构建发布（client_secret 永不出现在构建产物里）。
const authConfig = JSON.parse(await readFile(join(root, "auth-config.json"), "utf8"));
assert(["local", "oauth"].includes(authConfig.provider), `Invalid auth provider: ${authConfig.provider}`);
assert(!JSON.stringify(authConfig).includes("client_secret"), "client_secret must never be published");
const callbackHtml = await readFile(join(root, "auth", "callback", "index.html"), "utf8");
assert(callbackHtml.includes('id="oauth-status"'), "OAuth callback page is missing its status element");
assert(callbackHtml.includes("/js/auth.js"), "OAuth callback page must load auth.js");
assert(index.includes('id="auth-oauth-button"'), "GitHub OAuth login button is missing");
assert(!index.includes("client_secret"), "client_secret must never appear in pages");

const adminHtml = await readFile(join(root, "admin", "index.html"), "utf8");
assert(adminHtml.includes('id="view-noaccess"'), "Admin no-access view is missing");
assert(adminHtml.includes("你无权限进入"), "Admin no-access message is missing");
const adminJsOut = await readFile(join(root, "admin", "admin.js"), "utf8");
assert(adminJsOut.includes("allowedLogins"), "Admin allowlist guard is missing");
assert(!adminHtml.includes('id="token-input"'), "Admin must not offer a paste-a-token login");
assert(!adminHtml.includes('id="login-form"'), "Admin token form must be removed");
assert(adminHtml.includes("使用 GitHub 登录进入后台"), "Admin GitHub OAuth entry is missing");

const css = await readFile(join(root, "css", "main.css"), "utf8");
assert(css.includes('html[data-theme="light"]'), "Light theme styles are missing");
assert(css.includes("rgba(var(--veil-rgb)"), "Wallpaper veil must be theme aware");
// 深浅色都保留壁纸雾面：深色压暗 / 浅色提亮（走 --veil-rgb 与 --wallpaper-veil），
// 浅色不许再用 background-image: none 把 body::after 的雾面关掉。
assert(
  !/html\[data-theme="light"\]\[data-wallpaper="on"\] body::after\s*\{\s*background-image:\s*none/.test(css),
  "Light theme must keep the wallpaper veil (brightening layer)",
);
assert(
  /html\[data-wallpaper="on"\] body::after\s*\{[^}]*rgba\(var\(--veil-rgb\), var\(--wallpaper-veil/.test(css),
  "Wallpaper veil must use the theme-aware veil color and the dim setting",
);
// 行号与代码对齐：gutter 必须与代码同字号同行高，且两列顶部对齐。
const gutterPre = /\.highlight \.gutter pre\s*\{([^}]*)\}/.exec(css)?.[1] || "";
assert(/font-size:\s*inherit/.test(gutterPre), "Gutter font-size must match the code (inherit)");
assert(!/font-size:\s*11px/.test(gutterPre), "Gutter must not use a smaller font-size than the code");
assert(/\.highlight td\s*\{[^}]*vertical-align:\s*top/.test(css), "Highlight cells must align at the top");
assert(css.includes('html[data-theme="light"] .article-content'), "Light overrides for articles are missing");

// 顶栏：展开状态由 main.js 判断后加类，靠 :hover 会卡住（详见 tools/nav.test.mjs）
assert(index.includes('class="header-hint"'), "Top hint arrow is missing");
assert(index.includes("data-open-header"), "Top hint arrow trigger is missing");
assert(index.includes('class="header-hover-zone"'), "Header hover zone is missing");
assert(/js\/main\.js\?v=/.test(index), "Header script must be cache-busted");
assert(/css\/main\.css\?v=/.test(index), "Header stylesheet must be cache-busted");
assert(css.includes("html.header-open .site-header"), "Header open state must be class driven");
const bareCss = css.replace(/\/\*[\s\S]*?\*\//g, " "); // 注释里也有选择器，先剥掉
const hoverOpeners = [...bareCss.matchAll(/([^{}]+)\{/g)]
  .flatMap((match) => match[1].split(","))
  .map((selector) => selector.replace(/\s+/g, " ").trim())
  .filter((selector) => /:hover/.test(selector) && /(\.site-header|\.site-header:hover)$/.test(selector));
assert(hoverOpeners.length >= 3, `Header hover fallback rules are missing (${hoverOpeners.length})`);
for (const selector of hoverOpeners) {
  assert(selector.startsWith("html:not(.header-js)"), `Header opens from bare :hover, it will stick: ${selector}`);
}

const wallpaperRule = /--wallpaper-image:\s*([^;]+);/.exec(index);
if (look.wallpaper) {
  assert.equal(index.includes('data-wallpaper="on"'), true, "Wallpaper layer must be enabled");
  assert(wallpaperRule, "Wallpaper CSS variable is missing");
  assert.equal(wallpaperRule[1].trim(), appearance.cssImage(look.wallpaper), "Wallpaper must match appearance.json");
} else {
  assert(!index.includes("data-wallpaper"), "Wallpaper layer must stay off when no wallpaper is configured");
  assert(!index.includes("--wallpaper-image"), "No wallpaper CSS variable without a wallpaper");
}
for (const rule of [wallpaperRule?.[1] || "", icon[1], avatar?.[1] || ""]) {
  assert(!/(?:javascript|vbscript|data)\s*:/i.test(rule), `Forbidden scheme in appearance value: ${rule}`);
}
// An empty blog is valid, including after deleting the last post.

const errors = [];
const checked = new Set();
for (const file of files.filter((file) => file.endsWith(".html"))) {
  const html = await readFile(file, "utf8");
  assert(html.includes('lang="zh-CN"'), `Missing document language: ${file}`);
  assert(/<title>.+<\/title>/.test(html), `Missing title: ${file}`);
  for (const [, encoded] of html.matchAll(/(?:href|src)="([^"#]*)"/g)) {
    if (!encoded.startsWith("/") || encoded.startsWith("//")) continue;
    const url = decodeURIComponent(encoded.split(/[?#]/)[0]);
    if (checked.has(url)) continue;
    checked.add(url);
    let path = resolve(root, "." + url);
    assert(
      path.startsWith(root + "/") || path === root,
      `Unsafe output path: ${url}`,
    );
    try {
      if ((await stat(path)).isDirectory()) path = join(path, "index.html");
      await stat(path);
    } catch {
      errors.push(`${url} linked in ${file.slice(root.length)}`);
    }
  }
}
for (const post of search) {
  assert.equal(typeof post.title, "string");
  assert.equal(typeof post.content, "string");
  assert(Array.isArray(post.tags));
  await stat(resolve(root, "." + decodeURIComponent(post.url), "index.html"));
}
await stat(join(root, "404.html"));
assert.equal(errors.length, 0, `Broken local links:\n${errors.join("\n")}`);
console.log(
  `✓ ${files.filter((file) => file.endsWith(".html")).length} HTML pages, ${checked.size} local links, ${search.length} indexed posts checked.`,
);
