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
const css = await readFile(join(root, "css", "main.css"), "utf8");
assert(css.includes('html[data-theme="light"]'), "Light theme styles are missing");
assert(css.includes("rgba(var(--veil-rgb)"), "Wallpaper veil must be theme aware");
assert(css.includes('html[data-theme="light"] .article-content'), "Light overrides for articles are missing");

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
