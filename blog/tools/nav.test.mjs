import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { JSDOM } from "jsdom";

// main.js 是主题里手写的脚本（不经过打包），产物 public/index.html 里有真实的顶栏标记。
const page = await readFile("public/index.html", "utf8");
const mainJs = await readFile("themes/minxi/source/js/main.js", "utf8");
const css = await readFile("themes/minxi/source/css/main.css", "utf8");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function setup(searchPosts = []) {
  const dom = new JSDOM(page, { url: "https://lscminxi.github.io/", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  w.scrollTo = () => {};
  w.fetch = async () => ({ ok: true, json: async () => searchPosts });
  w.eval(mainJs);
  return { dom, w, $: (selector) => w.document.querySelector(selector), close: async () => dom.window.close() };
}

test("navigation remains visible and usable without hover or JavaScript", () => {
  const dom = new JSDOM(page);
  const doc = dom.window.document;
  const header = doc.querySelector('.site-header');
  assert(header?.querySelector('nav[aria-label="主导航"] a[href="/"]'));
  assert(header.querySelector('nav a[href="/toolbox/"]'));
  assert(!doc.querySelector('.header-hint, .header-hover-zone'));
  const rule = /\.site-header\s*\{([^}]*)\}/.exec(css)?.[1] || '';
  assert.match(rule, /position:\s*sticky/);
  assert.match(rule, /top:\s*0/);
  assert.doesNotMatch(rule, /transform\s*:/);
  assert.match(page, /js\/main\.js\?v=/);
  assert.match(page, /css\/main\.css\?v=/);
  dom.window.close();
});

test("scrolling, pointer events and Escape never hide the navigation", () => {
  const env = setup();
  const { w, $ } = env;
  const header = $('.site-header');
  for (const type of ['scroll', 'pointerleave', 'mouseleave', 'blur', 'visibilitychange']) {
    w.dispatchEvent(new w.Event(type));
    w.document.dispatchEvent(new w.Event(type));
    header.dispatchEvent(new w.Event(type));
  }
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert(!w.document.documentElement.classList.contains('header-js'));
  assert(!w.document.documentElement.classList.contains('header-open'));
  assert.equal(header.hidden, false);
  assert.equal(header.style.transform, '');
  env.dom.window.close();
});

test("search finds articles by LaTeX fragments with fuzzy matching", async () => {
  const env = setup([
    {
      title: "等差数列求和",
      url: "/posts/sum/",
      description: "求和公式推导",
      tags: ["数列"],
      content: "今天推导求和公式，并练习若干例题。",
      latex: ["f(n)=\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}"],
    },
    {
      title: "二分查找",
      url: "/posts/binary-search/",
      description: "在有序数组里折半查找",
      tags: ["二分"],
      content: "二分查找模板与边界处理。",
      latex: [],
    },
  ]);
  try {
    const { w, $ } = env;
    const input = $("#search-input");
    const type = async (value) => {
      input.value = value;
      input.dispatchEvent(new w.Event("input", { bubbles: true }));
      await sleep(30);
      return [...w.document.querySelectorAll("#search-results .search-result")];
    };
    // 精确命令、大小写与花括号写法差异、去掉反斜杠分词、输一半的子序列模糊，都应命中同一篇。
    for (const query of ["\\sum", "SUM_{i=1}", "frac n 2", "\\su", "sm"]) {
      const found = await type(query);
      assert.equal(found.length, 1, `查询 ${query} 应只命中含公式的文章`);
      assert.equal(found[0].getAttribute("href"), "/posts/sum/");
    }
    const withFormula = await type("\\frac{n(n+1)}{2}");
    assert.match(withFormula[0].querySelector(".search-latex")?.textContent || "", /frac/, "结果里应亮出命中的公式片段");
    const plain = await type("二分");
    assert.equal(plain.length, 1);
    assert.equal(plain[0].getAttribute("href"), "/posts/binary-search/", "普通关键词搜索保持原行为");
    const none = await type("\\int_0^1");
    assert.equal(none.length, 0, "没有对应公式时不乱报命中");
  } finally {
    await env.close();
  }
});

test('百宝箱 is reachable from the main navigation and contains the local editor', async () => {
  const { JSDOM } = await import('jsdom');
  const home = new JSDOM(await readFile('public/index.html', 'utf8')).window.document;
  const toolbox = new JSDOM(await readFile('public/toolbox/index.html', 'utf8')).window.document;
  const editor = new JSDOM(await readFile('public/editor/index.html', 'utf8')).window.document;
  const link = home.querySelector('nav[aria-label="主导航"] a[href="/toolbox/"]');
  assert.equal(link?.textContent, '百宝箱');
  assert.equal(toolbox.querySelector('nav a[href="/toolbox/"]')?.getAttribute('aria-current'), 'page');
  assert(editor.querySelector('nav a[href="/toolbox/"]')?.classList.contains('active'));
  const card = toolbox.querySelector('a.toolbox-card[href="/editor/"]');
  assert(card?.textContent.includes('Markdown 编辑器'));
  assert(card.textContent.includes('浏览器'));
  assert(editor.querySelector('#public-f-body'));
});

test('hero code window links to the cloud game without affecting the floating tag', async () => {
  assert.match(css, /\.code-window:hover/);
  assert.match(css, /\.code-window:focus-visible/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*?\.code-window/);
  const pages = await readdir('public/page', { withFileTypes: true }).catch(() => []);
  const paths = ['public/index.html', ...pages.filter((entry) => entry.isDirectory()).map((entry) => `public/page/${entry.name}/index.html`)];
  for (const path of paths) {
    const dom = new JSDOM(await readFile(path, 'utf8'));
    const doc = dom.window.document;
    const link = doc.querySelector('a.code-window');
    assert(link, `${path}: code window must be a native link`);
    assert.equal(link.getAttribute('href'), 'https://mc.kurogames.com/cloud/index.html#/');
    assert.equal(link.getAttribute('target'), '_blank');
    assert.match(link.getAttribute('rel'), /noopener/);
    assert.match(link.getAttribute('aria-label'), /鸣潮/);
    assert.equal(link.hasAttribute('title'), false, 'do not show a hover tooltip');
    assert(link.querySelector('.hero-code'));
    assert(doc.querySelector('.floating-tag[data-open-yunshi]'));
    assert(!link.contains(doc.querySelector('.floating-tag')), 'existing floating tag stays independent');
    dom.window.close();
  }
});
