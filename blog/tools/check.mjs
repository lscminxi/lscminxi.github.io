import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, join } from "node:path";

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
assert(index.includes("？！糖糖"), "Author missing");
assert(!index.includes("example.com"), "Default Hexo URL remains");
const search = JSON.parse(await readFile(join(root, "search.json"), "utf8"));
assert(Array.isArray(search), "Search index must be an array");
assert(search.length > 0, "No posts found in search index");

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
