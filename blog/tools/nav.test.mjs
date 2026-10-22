import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

// main.js 是主题里手写的脚本（不经过打包），产物 public/index.html 里有真实的顶栏标记。
const page = await readFile("public/index.html", "utf8");
const mainJs = await readFile("themes/minxi/source/js/main.js", "utf8");
const css = await readFile("themes/minxi/source/css/main.css", "utf8");

const hintMarkup = /<button class="header-hint"[\s\S]*?<\/button>/.exec(page)?.[0] || "";
const zoneMarkup = /<div class="header-hover-zone"[^>]*><\/div>/.exec(page)?.[0] || "";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// 收起计时 700ms + 一点点余量
const CLOSE_WAIT = 950;

/**
 * 起一个「像真的那样」的顶栏环境：
 * 顶栏默认收在屏幕外（top: -84），展开（html.header-open）时占 [0, 83]；
 * 顶部感应区是 [0, 14]；小箭头在顶部居中 [500, 556] × [0, 16]。
 * jsdom 不会做样式计算，所以这里用 getBoundingClientRect + 真实类名把几何喂给脚本，
 * 脚本里「按几何判断指针在哪」的逻辑就能被真实验证。
 */
function setup(searchPosts = []) {
  const dom = new JSDOM(page, { url: "https://lscminxi.github.io/", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  w.scrollTo = () => {};
  w.fetch = async () => ({ ok: true, json: async () => searchPosts });
  const root = w.document.documentElement;
  const isOpen = () => root.classList.contains("header-open");
  const box = (node) => {
    if (node.classList?.contains("header-hint")) return { left: 500, right: 556, top: 0, bottom: isOpen() ? 16 : 16 };
    if (node.classList?.contains("header-hover-zone")) return { left: 0, right: 1366, top: 0, bottom: 14 };
    if (node.classList?.contains("site-header")) return { left: 0, right: 1366, top: isOpen() ? 0 : -84, bottom: isOpen() ? 83 : -1 };
    return { left: 0, right: 0, top: 0, bottom: 0 };
  };
  w.Element.prototype.getBoundingClientRect = function () {
    const b = box(this);
    return { ...b, width: b.right - b.left, height: b.bottom - b.top, x: b.left, y: b.top };
  };
  w.eval(mainJs);
  const $ = (selector) => w.document.querySelector(selector);
  const fire = (node, type, init = {}) => {
    const event = new w.Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, init);
    node.dispatchEvent(event);
  };
  const api = {
    dom,
    w,
    root,
    $,
    isOpen,
    state: () => w.MinxiHeader.state(),
    enter: (node, x, y) => fire(node, "pointerenter", { pointerType: "mouse", clientX: x, clientY: y }),
    move: (x, y) => fire(w.document, "pointermove", { pointerType: "mouse", clientX: x, clientY: y }),
    leave: (node) => fire(node, "pointerleave", { pointerType: "mouse" }),
    click: (node, init = {}) => fire(node, "click", { pointerType: "mouse", detail: 1, ...init }),
    close: async () => {
      await sleep(30);
      dom.window.close();
    },
  };
  return api;
}

test("the hint arrow exists and the header opens on hover of the top strip", async () => {
  assert(hintMarkup, "构建产物里应有页面最上方的小箭头（header-hint）");
  assert(zoneMarkup, "构建产物里应有顶部感应区（header-hover-zone）");
  const env = setup();
  try {
    const { $, enter, isOpen, root } = env;
    // 有 JS 时给 <html> 加标记，CSS 里的 :hover 兜底规则随之失效（这是防卡住的关键）
    assert(root.classList.contains("header-js"), "main.js 应当接管顶栏（html.header-js）");
    assert(!isOpen(), "默认收起");
    enter($(".header-hover-zone"), 700, 5);
    assert(isOpen(), "鼠标移到页面最上方 → 顶栏滑出");
    enter($("[data-open-header]"), 528, 8);
    assert(isOpen(), "鼠标移到小箭头上也展开");
  } finally {
    await env.close();
  }
});

/* 报修的 bug：鼠标移到触发位置后快速移走，顶栏会一直挂在页面上（浏览器 :hover 状态没跟上）。
   现在收起由 JS 计时 + 几何判断决定，不再看 :hover。 */
test("moving the pointer to the trigger and leaving quickly does not leave the header stuck", async () => {
  const env = setup();
  try {
    const { $, enter, leave, move, isOpen } = env;
    enter($(".header-hover-zone"), 700, 5);
    assert(isOpen(), "先展开");
    leave($(".header-hover-zone"));
    move(700, 500);
    await sleep(120);
    move(700, 800); // 快速移走
    assert(isOpen(), "刚移开时还在（留了短暂缓冲）");
    await sleep(CLOSE_WAIT);
    assert(!isOpen(), "缓冲结束后必须自动收起，不能卡住");
  } finally {
    await env.close();
  }
});

test("the header stays open while the pointer rests on it, and closes after leaving", async () => {
  const env = setup();
  try {
    const { $, enter, leave, move, isOpen, state } = env;
    // 指针从顶部感应区滑进顶栏：收起计时到点时按「此刻」的几何再确认一次，
    // 所以即使这段时间没有 pointermove 也不会误收起。
    enter($(".header-hover-zone"), 700, 5);
    leave($(".header-hover-zone"));
    move(700, 40);
    await sleep(CLOSE_WAIT + 100);
    assert(isOpen(), "指针停在顶栏上时必须保持展开");
    assert.equal(state().inside, true, "状态里应记下指针在顶栏上");

    leave($(".site-header"));
    move(700, 900);
    await sleep(CLOSE_WAIT);
    assert(!isOpen(), "离开顶栏后收起");
  } finally {
    await env.close();
  }
});

test("the header stays open when the pointer rests without further movement", async () => {
  const env = setup();
  try {
    const { $, enter, leave, move, isOpen } = env;
    enter($(".header-hover-zone"), 700, 5);
    leave($(".header-hover-zone"));
    move(700, 10); // 停在顶部感应区里，之后不再移动
    await sleep(CLOSE_WAIT);
    assert(isOpen(), "静止期间不该误收起");
  } finally {
    await env.close();
  }
});

test("the hint arrow opens the header on touch and stays open until tapped again", async () => {
  const env = setup();
  try {
    const { $, click, move, isOpen, state } = env;
    click($("[data-open-header]"), { pointerType: "touch" });
    assert(isOpen(), "触摸点一下箭头 → 展开");
    assert(state().pinned, "触摸没有悬停，点开后先固定住");
    move(700, 900);
    await sleep(CLOSE_WAIT);
    assert(isOpen(), "指针（手指）离开也保持展开");
    click($("[data-open-header]"), { pointerType: "touch" });
    assert(!isOpen(), "再点一下 → 收起");
  } finally {
    await env.close();
  }
});

test("a mouse click on the arrow does not immediately close the header it just opened", async () => {
  const env = setup();
  try {
    const { $, enter, click, isOpen } = env;
    enter($("[data-open-header]"), 528, 8);
    assert(isOpen(), "悬停小箭头即展开");
    click($("[data-open-header]"));
    assert(isOpen(), "鼠标点一下箭头不该反过来把它收起来");
  } finally {
    await env.close();
  }
});

test("keyboard focus, Escape, outside clicks and pointer leaving the window all behave", async () => {
  const env = setup();
  try {
    const { w, $, move, isOpen } = env;
    assert(!isOpen());
    // 键盘：焦点进入顶栏
    $(".site-header").dispatchEvent(new w.Event("focusin", { bubbles: true }));
    assert(isOpen(), "Tab 进顶栏时自动滑出");

    w.document.dispatchEvent(Object.assign(new w.Event("keydown", { bubbles: true }), { key: "Escape" }));
    assert(!isOpen(), "Escape 收起");

    w.MinxiHeader.open();
    const outside = Object.assign(new w.Event("pointerdown", { bubbles: true, cancelable: true }), {
      pointerType: "mouse",
      clientX: 400,
      clientY: 400,
    });
    $("#main").dispatchEvent(outside);
    assert(!isOpen(), "点顶栏以外的位置收起");

    w.MinxiHeader.open();
    move(700, 40); // 先把指针记在顶栏上
    await sleep(60);
    w.document.dispatchEvent(new w.Event("mouseleave"));
    await sleep(200);
    assert(!isOpen(), "指针移出窗口立刻收起（旧的指针坐标不能顶住）");
  } finally {
    await env.close();
  }
});

test("the stylesheet drives the header from a class, not from :hover", () => {
  // 展开状态：JS 加的类
  assert(/html\.header-open \.site-header \{/.test(css), "展开状态应由 html.header-open 控制");
  assert(/html\.header-open \.header-hint \{/.test(css), "展开后小箭头应当淡出");
  // :hover 只作为「没有 JS」时的兜底：逐条选择器检查，不能有一条漏掉限定。
  // （这正是「鼠标快速划过就卡住」的根源：:hover 的状态浏览器不保证及时更新。）
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, " "); // 注释里也有大括号和选择器，先剥掉
  const individual = [...bare.matchAll(/([^{}]+)\{/g)]
    .flatMap((match) => match[1].split(","))
    .map((selector) => selector.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  // 「用悬停展开顶栏」的规则有三条：感应区悬停、小箭头悬停、顶栏自身悬停。
  // 它们全部都必须限定在「没有 JS」时才生效。
  // 用悬停展开顶栏的选择器：复合选择器最右边是顶栏本身（`.site-header` 或 `.site-header:hover`）
  const hoverOpeners = individual.filter(
    (selector) => /:hover/.test(selector) && /(\.site-header|\.site-header:hover)$/.test(selector),
  );
  assert(hoverOpeners.length >= 3, `应当有 3 条 :hover 兜底规则，实际找到 ${hoverOpeners.length} 条`);
  const unqualified = hoverOpeners.filter((selector) => !selector.startsWith("html:not(.header-js)"));
  assert.deepEqual(unqualified, [], `这些 :hover 规则没有加 html:not(.header-js) 限定：${unqualified.join(" / ")}`);
  // 顶栏自己也不再靠 transition-delay 硬拖时间（收起时机交给 JS）
  const base = /\.site-header \{[\s\S]*?\n\}/.exec(css)?.[0] || "";
  assert(base, "缺少 .site-header 基础规则");
  // 一段 transition 里出现两个时间值 = 后者是延迟。基础规则里不该有延迟，
  // 否则收起会拖到 2 秒之后（旧的一份内容就卡在这里）。
  const delayed = [...base.matchAll(/transition:\s*([^;]+);/g)].flatMap((match) =>
    match[1]
      .split(",")
      .map((part) => part.trim())
      .filter((part) => [...part.matchAll(/\b\d+(?:\.\d+)?m?s\b/g)].length > 1),
  );
  assert.deepEqual(delayed, [], `顶栏基础规则的 transition 里不该有延迟：${delayed.join(" / ")}`);
  // 键盘焦点始终有效（不依赖 JS）
  assert(/\.site-header:focus-within \{/.test(css), "键盘焦点仍要能展开顶栏");
});

test("the hint arrow is a bare, subtle chevron that respects reduced motion", () => {
  const hint = /\.header-hint \{[\s\S]*?\n\}/.exec(css)?.[0] || "";
  assert(hint, "缺少 .header-hint 样式");
  assert(/opacity: 0\.\d/.test(hint), "半透明（opacity 小于 1）");
  assert(/color: var\(--accent\)/.test(hint), "颜色跟随主题强调色（深浅自动跟着变）");
  // 只有箭头本身：不带底衬／绿幕／模糊层
  assert(!/background:(?!\s*none)/.test(hint), `小箭头不该有底色：${hint.match(/background:[^;]+/)?.[0]}`);
  assert(!/backdrop-filter/.test(hint), "小箭头不该有毛玻璃底衬");
  assert(!/background-image|linear-gradient|rgba\(\s*\d/.test(hint), "小箭头不该有渐变或半透明色块");
  assert(/pointer-events: none/.test(css), "展开后小箭头不应挡住点击");
  assert(/prefers-reduced-motion: reduce[\s\S]*?header-hint-icon[\s\S]*?animation: none/.test(css), "尊重「减少动态效果」");
  // 底衬用的令牌不该再留着（留着就说明还有别处在画那块绿）
  assert(!/--hint-bg/.test(css), "已经没有底衬了，--hint-bg 令牌不该再存在");
});

test("the page ships the arrow, the script version and the trigger markup", () => {
  assert(page.includes('class="header-hint"'), "页面里要有小箭头");
  assert(page.includes("data-open-header"), "小箭头要能被脚本识别");
  assert(/js\/main\.js\?v=/.test(page), "main.js 必须带版本号，否则浏览器会用旧缓存");
  assert(/css\/main\.css\?v=/.test(page), "main.css 必须带版本号");
  assert(page.includes('class="header-hover-zone"'), "顶部感应区仍要在（顶部 14px 都能触发）");
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
