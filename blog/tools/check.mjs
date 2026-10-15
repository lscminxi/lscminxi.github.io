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
// 非内置图标（例如后台填的外链）必须带 data-fallback-icon：加载失败时 js/main.js 靠它换回本地图标。
const iconTag = /<link rel="icon"[^>]*>/.exec(index)[0];
const customIcon = look.favicon !== appearance.DEFAULTS.favicon;
assert.equal(
  iconTag.includes("data-fallback-icon="),
  customIcon,
  "Only a non-default favicon carries data-fallback-icon",
);
if (customIcon) {
  assert(
    iconTag.includes(`data-fallback-icon="${appearance.DEFAULTS.favicon}"`),
    "The icon fallback must point at the bundled favicon.svg",
  );
}
const avatar = /<img class="avatar-image" src="([^"]+)"/.exec(index);
if (look.avatar) {
  assert(avatar, "Configured avatar must be rendered in the sidebar");
  assert.equal(decoded(avatar[1]), look.avatar, "Avatar must match appearance.json");
} else {
  assert(!avatar, "No avatar image is rendered when none is configured");
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
