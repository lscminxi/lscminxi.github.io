import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, mkdir, writeFile, cp, symlink, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { JSDOM } from "jsdom";

const exec = promisify(execFile);
const html = await readFile("source/admin/index.html", "utf8");
const js = await readFile("source/admin/admin.js", "utf8");
const postPath = "blog/source/_posts/test.md";

const wait = async (predicate) => {
  for (let i = 0; i < 250; i++) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.fail("Timed out waiting for UI");
};

const postText = (publishedLine = "") =>
  [
    "---",
    "title: 测试文章",
    "date: 2026-01-01 10:00:00",
    "categories:",
    "  - 学习笔记",
    "tags:",
    "  - 测试",
    ...(publishedLine ? [publishedLine] : []),
    "---",
    "正文",
    "",
  ].join("\n");

async function setup(initialText) {
  const dom = new JSDOM(html, { url: "https://preview.example/admin/", runScripts: "outside-only" });
  const w = dom.window;
  w.scrollTo = () => {};
  w.TextEncoder = TextEncoder;
  w.TextDecoder = TextDecoder;
  w.MinxiPreview = { document: () => "<!doctype html><html></html>" };
  const files = new Map([[postPath, { sha: "sha1", text: initialText }]]);
  const reply = (status, data) => ({ ok: status < 400, status, text: async () => JSON.stringify(data) });
  w.fetch = async (url, opts = {}) => {
    const uri = new URL(url);
    const suffix = decodeURIComponent(uri.pathname.replace("/repos/lscminxi/lscminxi.github.io", ""));
    if (suffix === "/user") return reply(200, { login: "lscminxi" });
    if (!suffix) return reply(200, { permissions: { push: true }, owner: { login: "lscminxi" } });
    if (suffix.startsWith("/actions/runs")) {
      return reply(200, {
        workflow_runs: [{
          name: "Build and deploy blog",
          head_sha: "old-commit",
          status: "completed",
          conclusion: "success",
          updated_at: "2026-01-01",
          html_url: "https://github.com/test",
          display_title: "Old build",
        }],
      });
    }
    if (suffix.startsWith("/git/trees/")) {
      return reply(200, {
        tree: [...files].map(([path, file]) => ({ path, sha: file.sha, size: file.text.length, type: "blob" })),
      });
    }
    if (suffix.startsWith("/contents/")) {
      const filePath = suffix.slice("/contents/".length);
      if (opts.method === "PUT") {
        const body = JSON.parse(opts.body);
        files.set(filePath, { sha: "saved-sha", text: Buffer.from(body.content, "base64").toString() });
        return reply(200, { content: { sha: "saved-sha" }, commit: { sha: "save-commit" } });
      }
      const file = files.get(filePath);
      return file
        ? reply(200, { sha: file.sha, size: file.text.length, encoding: "base64", content: Buffer.from(file.text).toString("base64") })
        : reply(404, { message: "Not Found" });
    }
    throw new Error(`Unexpected API ${suffix}`);
  };
  w.sessionStorage.setItem("minxi.admin.oauth-token", "test-token-not-real");
  w.eval(js);
  const $ = (s) => w.document.querySelector(s);
  await wait(() => $("#post-list .row"));
  await wait(() => !$("#refresh-button").disabled);
  return { dom, w, $, files };
}

const listButton = ($, label) =>
  [...$("#post-list").querySelectorAll("button")].find((b) => b.textContent === label);

test("admin marks a published:false post as private and gives it no public view link", async () => {
  const { dom, $ } = await setup(postText("published: false"));
  try {
    assert.match($("#post-list").textContent, /私密（仅后台可见）/);
    const view = [...$("#post-list").querySelectorAll("a")].find((a) => a.textContent === "查看");
    assert.equal(view, undefined, "私密文章没有公开页面，列表不能给一个会 404 的「查看」链接");
  } finally {
    dom.window.close();
  }
});

test("admin editor round-trips public/private through published:false", async () => {
  const { dom, $, files } = await setup(postText());
  try {
    listButton($, "编辑").click();
    await wait(() => $("#editor-status").textContent.includes("已加载"));
    assert.equal($("#f-visibility").value, "public", "没有 published:false 时默认是公开");

    $("#f-visibility").value = "private";
    $("#save-post").click();
    await wait(() => files.get(postPath).text.includes("published: false") && !$("#save-post").disabled);
    assert.match($("#editor-status").textContent, /私密文章/);
    assert.match($("#post-list").textContent, /私密（仅后台可见）/);

    $("#f-visibility").value = "public";
    $("#save-post").click();
    await wait(() => !files.get(postPath).text.includes("published:") && !$("#save-post").disabled);
    assert.match($("#editor-status").textContent, /发布地址/);
  } finally {
    dom.window.close();
  }
});

test("a private post is absent from the built site, archives and search index", async () => {
  const temp = await mkdtemp(join(tmpdir(), "minxi-visibility-"));
  const source = resolve(".");
  try {
    await cp(source, join(temp, "blog"), {
      recursive: true,
      filter: (path) => {
        const relative = path.slice(source.length + 1);
        return !["node_modules", "public", "source/_posts", "db.json"].some(
          (p) => relative === p || relative.startsWith(p + "/"),
        );
      },
    });
    await symlink(join(source, "node_modules"), join(temp, "blog/node_modules"), "dir");
    const postsDir = join(temp, "blog/source/_posts");
    await mkdir(postsDir, { recursive: true });
    await writeFile(
      join(postsDir, "public-post.md"),
      [
        "---",
        "title: 公开测试文章",
        "date: 2026-01-02 10:00:00",
        "categories:",
        "  - 学习笔记",
        "---",
        "公开正文。",
        "",
      ].join("\n"),
    );
    await writeFile(
      join(postsDir, "private-post.md"),
      [
        "---",
        "title: 私密测试文章",
        "date: 2026-01-03 10:00:00",
        "categories:",
        "  - 私密分类",
        "published: false",
        "---",
        "这段私密正文不应该进入公开站点。",
        "",
      ].join("\n"),
    );

    await exec("npm", ["run", "build"], { cwd: join(temp, "blog"), timeout: 120000 });
    const pub = join(temp, "blog/public");
    await stat(join(pub, "2026/01/02/public-post/index.html"));
    await assert.rejects(stat(join(pub, "2026/01/03/private-post/index.html")), { code: "ENOENT" });
    await assert.rejects(stat(join(pub, "categories/私密分类/index.html")), { code: "ENOENT" });

    const index = await readFile(join(pub, "index.html"), "utf8");
    const archives = await readFile(join(pub, "archives/index.html"), "utf8");
    const search = JSON.parse(await readFile(join(pub, "search.json"), "utf8"));
    assert(index.includes("公开测试文章"));
    assert(!index.includes("私密测试文章"));
    assert(!archives.includes("私密测试文章"));
    assert.deepEqual(search.map((item) => item.title), ["公开测试文章"]);
    assert(!JSON.stringify(search).includes("这段私密正文"));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
