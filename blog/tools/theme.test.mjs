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

// 访客端主题脚本由 npm run assets（tools/build-assets.mjs）从 client/theme.js 打包。
const themeJs = await readFile("themes/minxi/source/js/theme.js", "utf8");
const css = await readFile("themes/minxi/source/css/main.css", "utf8");
const builtPage = await readFile("public/index.html", "utf8");
const dialogMarkup = /<dialog id="wallpaper-dialog"[\s\S]*?<\/dialog>/.exec(builtPage)?.[0] || "";
const triggerMarkup = /<button class="theme-toggle"[\s\S]*?<\/button>/.exec(builtPage)?.[0] || "";
// 构建产物里的 <html> 属性（去掉 data-theme-default，测试要自己指定，避免重复属性）
const htmlAttributes = (/<html ([^>]*)>/.exec(builtPage)?.[1] || "").replace(/\s*data-theme-default="[^"]*"/, "");

const wait = async (predicate, message = "Timed out waiting for UI") => {
  for (let i = 0; i < 300; i++) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.fail(message);
};
const closePage = async (dom) => {
  await new Promise((r) => setTimeout(r, 30));
  dom.window.close();
};

/* ---------------- 共享规则 ---------------- */

test("theme values are normalized and fall back to auto", () => {
  assert.deepEqual(appearance.THEME_MODES, ["auto", "light", "dark"]);
  assert.equal(appearance.THEME_STORAGE_KEY, "minxi.theme");
  assert.equal(appearance.normalizeTheme("LIGHT"), "light");
  assert.equal(appearance.normalizeTheme(" dark "), "dark");
  assert.equal(appearance.normalizeTheme("auto"), "auto");
  for (const value of ["", "nope", "system", 1, null, undefined, {}, []]) {
    assert.equal(appearance.normalizeTheme(value), "auto", String(value));
  }
  // 访客的选择只认 light / dark；auto 与非法值都表示「没选过」
  assert.equal(appearance.normalizeThemeChoice("light"), "light");
  assert.equal(appearance.normalizeThemeChoice("dark"), "dark");
  for (const value of ["auto", "AUTO", "", "x", 0, null, undefined, {}]) {
    assert.equal(appearance.normalizeThemeChoice(value), null, String(value));
  }
  assert.equal(appearance.resolveAppearance({ theme: "LIGHT" }).theme, "light");
  assert.equal(appearance.resolveAppearance({ theme: "evil" }).theme, "auto");
  assert.equal(appearance.resolveAppearance(null).theme, "auto");
});

test("the effective theme combines the visitor choice, the site default and the system", () => {
  // 访客选过 → 一律以访客为准
  assert.equal(appearance.resolveTheme("light", "dark", false), "light");
  assert.equal(appearance.resolveTheme("dark", "light", true), "dark");
  // 没选过 → 站点默认
  assert.equal(appearance.resolveTheme(null, "light", false), "light");
  assert.equal(appearance.resolveTheme(null, "dark", true), "dark");
  assert.equal(appearance.resolveTheme("auto", "light", false), "light");
  // 站点默认 auto → 跟随系统
  assert.equal(appearance.resolveTheme(null, "auto", true), "light");
  assert.equal(appearance.resolveTheme(null, "auto", false), "dark");
  // 坏数据不会抛异常
  assert.equal(appearance.resolveTheme({}, { theme: 1 }, false), "dark");
});

/* ---------------- 访客端脚本 ---------------- */

async function page({ stored = null, siteTheme = "auto", publishedTheme = null, preferLight = false, url = "https://lscminxi.github.io/" } = {}) {
  assert(dialogMarkup && triggerMarkup, "构建产物里应包含主题按钮与背景对话框（先运行 npm run build）");
  const dom = new JSDOM(
    `<!doctype html><html ${htmlAttributes} data-theme-default="${siteTheme}"><head><meta name="theme-color" content="#0b0e14"></head><body>
      <div class="header-actions">${triggerMarkup}</div>
      ${dialogMarkup}
    </body></html>`,
    { url, runScripts: "outside-only", pretendToBeVisual: true },
  );
  const w = dom.window;
  // 系统偏好：始终返回同一个对象，测试里可以直接改 matches 再触发监听
  const listeners = [];
  const media = {
    matches: preferLight,
    media: "(prefers-color-scheme: light)",
    addEventListener: (type, fn) => listeners.push(fn),
    removeEventListener: () => {},
    addListener: (fn) => listeners.push(fn),
  };
  w.matchMedia = (query) => (query.includes("prefers-color-scheme: light") ? media : { matches: false, media: query, addEventListener: () => {}, addListener: () => {} });
  // jsdom 在同一个 origin 下会共享 localStorage，这里先清掉，保证用例互不影响
  try {
    w.localStorage.removeItem(appearance.THEME_STORAGE_KEY);
  } catch {}
  if (stored !== null) w.localStorage.setItem(appearance.THEME_STORAGE_KEY, stored);
  const state = { requests: [] };
  w.fetch = async (url_) => {
    state.requests.push(String(url_));
    return { ok: true, json: async () => ({ theme: publishedTheme ?? siteTheme }) };
  };
  w.eval(themeJs);
  const $ = (selector) => w.document.querySelector(selector);
  const setSystemLight = (value) => {
    media.matches = value;
    listeners.forEach((fn) => fn());
  };
  return { dom, w, $, state, listeners, media, setSystemLight };
}

test("the theme is applied in the head, before the first paint, without a flash", async () => {
  // 访客选了浅色：脚本一执行就要确定 data-theme，且不提交任何东西
  const light = await page({ stored: "light", preferLight: false });
  try {
    assert.equal(light.w.document.documentElement.dataset.theme, "light");
    assert.equal(light.w.document.documentElement.dataset.themeChoice, "light");
    assert.equal(light.$('meta[name="theme-color"]').getAttribute("content"), "#f5f7fa", "meta 会由 apply() 换成当前主题的底色");
  } finally {
    await closePage(light.dom);
  }
  // 没选过 + 站点默认 auto + 系统浅色 → 浅色
  const system = await page({ preferLight: true });
  try {
    assert.equal(system.w.document.documentElement.dataset.theme, "light");
    assert.equal(system.w.document.documentElement.dataset.themeChoice, "auto");
  } finally {
    await closePage(system.dom);
  }
  // 站点默认深色，系统浅色 → 仍然深色
  const forced = await page({ siteTheme: "dark", preferLight: true });
  try {
    assert.equal(forced.w.document.documentElement.dataset.theme, "dark");
  } finally {
    await closePage(forced.dom);
  }
  // 存了坏值 → 按默认值处理，不会崩
  const broken = await page({ stored: "rainbow" });
  try {
    assert.equal(broken.w.document.documentElement.dataset.theme, "dark");
  } finally {
    await closePage(broken.dom);
  }
});

test("the toggle button switches the theme and remembers it locally", async () => {
  const { dom, w, $ } = await page({ siteTheme: "dark" });
  try {
    const button = $(".theme-toggle");
    assert.equal(button.hidden, false, "脚本运行后按钮才出现");
    assert.equal(w.document.documentElement.dataset.theme, "dark");
    assert.equal(button.dataset.themeTarget, "light");
    assert(button.getAttribute("aria-label").includes("浅色"));

    button.click();
    assert.equal(w.document.documentElement.dataset.theme, "light");
    assert.equal(w.localStorage.getItem(appearance.THEME_STORAGE_KEY), "light");
    assert.equal(button.dataset.themeTarget, "dark");
    // 图标跟着切换
    assert.equal(button.querySelector('[data-theme-icon="light"]').hidden, false);
    assert.equal(button.querySelector('[data-theme-icon="dark"]').hidden, true);

    button.click();
    assert.equal(w.document.documentElement.dataset.theme, "dark");
    assert.equal(w.localStorage.getItem(appearance.THEME_STORAGE_KEY), "dark");

    // 只用键盘/点击就够了：状态也写在 html 上，方便排查
    assert.equal(w.document.documentElement.dataset.themeChoice, "dark");
  } finally {
    await closePage(dom);
  }
});

test("the system preference keeps working until the visitor picks a theme", async () => {
  const { dom, w, $, listeners, setSystemLight } = await page({ preferLight: false, siteTheme: "auto" });
  try {
    const element = w.document.documentElement;
    await wait(() => listeners.length === 1, "注册了系统偏好监听");
    assert.equal(element.dataset.theme, "dark");
    // 系统切到浅色：没选过的访客跟着变
    setSystemLight(true);
    assert.equal(element.dataset.theme, "light", "跟随系统偏好实时切换");
    setSystemLight(false);
    assert.equal(element.dataset.theme, "dark");

    // 一旦访客自己选过，就不再被系统偏好影响
    $(".theme-toggle").click(); // current=dark → light
    assert.equal(element.dataset.theme, "light");
    setSystemLight(false);
    assert.equal(element.dataset.theme, "light", "访客的选择优先");
  } finally {
    await closePage(dom);
  }
});

test("a site default changed after the page was cached still wins for followers", async () => {
  // HTML（可能被浏览器缓存）说是 auto，但公开配置已经改成 light
  const { dom, w } = await page({ siteTheme: "auto", publishedTheme: "light", preferLight: false });
  try {
    assert.equal(w.document.documentElement.dataset.theme, "dark");
    await wait(() => w.document.documentElement.dataset.theme === "light", "加载完成后按最新的公开配置校正");
    assert.equal(w.MinxiTheme.siteDefault(), "light");
  } finally {
    await closePage(dom);
  }
});

test("theme.js and wallpaper.js share a single /appearance.json request", async () => {
  const wallpaperJs = await readFile("themes/minxi/source/js/wallpaper.js", "utf8");
  assert(dialogMarkup && triggerMarkup);
  const dom = new JSDOM(
    `<!doctype html><html ${htmlAttributes} data-theme-default="auto"><head></head><body>${dialogMarkup}</body></html>`,
    { url: "https://lscminxi.github.io/", runScripts: "outside-only", pretendToBeVisual: true },
  );
  const w = dom.window;
  w.matchMedia = (query) => ({ matches: false, media: query, addEventListener: () => {}, addListener: () => {} });
  const state = { requests: [] };
  w.fetch = async (url) => {
    state.requests.push(String(url));
    // 让两个脚本都拿到同一份数据
    return { ok: true, json: async () => ({ theme: "auto", wallpapers: [{ id: "a", url: "/images/a.png", label: "A" }] }) };
  };
  w.eval(themeJs);
  w.eval(wallpaperJs);
  try {
    await wait(() => w.MinxiWallpaper.gallery().length === 1);
    await wait(() => w.MinxiTheme.siteDefault() === "auto");
    const appearanceRequests = state.requests.filter((url) => url.includes("appearance.json"));
    assert.equal(appearanceRequests.length, 1, "两个脚本共用一次请求");
  } finally {
    await closePage(dom);
  }
});

/* ---------------- 样式 ---------------- */

test("light mode is a scoped override: dark stays the untouched default", () => {
  // 深色规则一行没改：:root 仍然是原来的深色值
  const root = /:root \{[\s\S]*?\}/.exec(css)[0];
  for (const [name, value] of [
    ["--bg", "#0b0e14"], ["--panel", "#11151d"], ["--line", "#252b36"],
    ["--text", "#e6eaf0"], ["--accent", "#5ce0c4"],
  ]) {
    assert(new RegExp(`${name}:\\s*${value}`).test(root), `深色令牌 ${name} 不能被改动`);
  }
  // 浅色覆盖必须全部带作用域，且给出与深色对应的令牌（令牌块 + 覆盖块）
  const scoped = css.split("html[data-theme=\"light\"]").slice(1)
    .map((part) => part.slice(0, part.indexOf("{")) + part.slice(0, 400))
    .join("\n");
  assert(scoped.includes("color-scheme: light"));
  assert(/--bg:\s*#f[0-9a-f]{5}/.test(css), "浅色 --bg 必须存在");
  assert(/--text:\s*#1[0-9a-f]{5}/.test(css), "浅色 --text 必须存在");
  assert(/--accent:\s*#[0-9a-f]{6}/.test(css));
  assert(/--purple:\s*#[0-9a-f]{6}/.test(css));
  assert(/--line:\s*#[0-9a-f]{6}/.test(css));
  assert(/--muted:\s*#[0-9a-f]{6}/.test(css));
  assert(/--dim:\s*#[0-9a-f]{6}/.test(css));
  assert(/--panel:\s*#[0-9a-f]{6}/.test(css));
  assert(css.includes('html[data-theme="light"] .site-header'));
  assert(css.includes('html[data-theme="light"] .post-card'));
  assert(css.includes('html[data-theme="light"] .theme-toggle'));
  // 壁纸层两套底色：深色压暗 / 浅色提亮（浅色只剩对话框遮罩等在用）
  assert(/--veil-rgb:\s*11, 14, 20/.test(css));
  assert(/--veil-rgb:\s*245, 247, 250/.test(css));
  // 深浅色都保留壁纸雾面：深色压暗 / 浅色提亮，浅色不许再关掉 body::after
  assert(
    !/html\[data-theme="light"\]\[data-wallpaper="on"\] body::after\s*\{\s*background-image:\s*none/.test(css),
    "light theme must keep the wallpaper veil (brightening layer)",
  );
  assert(
    /html\[data-wallpaper="on"\] body::after\s*\{[^}]*rgba\(var\(--veil-rgb\), var\(--wallpaper-veil/.test(css),
    "wallpaper veil must use the theme-aware veil color and the dim setting",
  );
  // 代码行号对齐：行号列与代码同字号同行高、两列顶对齐
  const gutterPre = /\.highlight \.gutter pre\s*\{([^}]*)\}/.exec(css)?.[1] || "";
  assert(/font-size:\s*inherit/.test(gutterPre), "gutter must inherit the code font-size");
  assert(!/font-size:\s*11px/.test(gutterPre), "gutter must not shrink below the code font-size");
  assert(/\.highlight td\s*\{[^}]*vertical-align:\s*top/.test(css), "highlight cells must align at the top");
});

test("post-card hover keeps a same-structure gradient so it cannot flash (issue #18)", () => {
  const pick = (selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`${escaped} \\{([^}]*)\\}`).exec(css)?.[1] || "";
  };
  // 触发闪动的组合：默认态渐变 + 悬停态纯色 + transition: background。
  // background 里的渐变层不可与“无渐变”平滑插值，只能在过渡中离散翻转，
  // 鼠标移上去就会闪一下。深浅两套主题的悬停态都必须是与默认态同角度、
  // 同色标数的渐变，过渡才能平滑插值。
  for (const [baseSelector, hoverSelector] of [
    [".post-card", ".post-card:hover"],
    ['html[data-theme="light"] .post-card', 'html[data-theme="light"] .post-card:hover'],
  ]) {
    const base = pick(baseSelector);
    const hover = pick(hoverSelector);
    assert.match(base, /background:\s*linear-gradient\(120deg,/, `${baseSelector} 默认态应为渐变`);
    assert.match(hover, /background:\s*linear-gradient\(120deg,/, `${hoverSelector} 悬停态也必须是同结构渐变，不能写纯色`);
    assert.doesNotMatch(hover, /background:\s*#[0-9a-f]{6}\s*;/i, `${hoverSelector} 悬停态写纯色会让渐变层离散翻转、产生闪动`);
  }
});

test("the whole post card is inside the article link hit area", () => {
  // 整卡可点用标题链接的 stretched-link 伪元素实现：卡片提供定位上下文，
  // 伪元素铺满整卡；标签链接单独抬高，保证点标签不会误进文章。
  assert.match(css, /\.post-card \{[^}]*position:\s*relative;/, "卡片要成为整卡链接的定位上下文");
  assert.match(
    css,
    /\.post-card h3 > a::after \{[^}]*position:\s*absolute;[^}]*inset:\s*0;/,
    "标题链接的伪元素要铺满整张卡片",
  );
  assert.match(
    css,
    /\.post-card \.post-tags \{[^}]*position:\s*relative;[^}]*z-index:\s*2;/,
    "卡片内标签链接要压在整卡覆盖层之上",
  );
  const card = /<article class="post-card"[\s\S]*?<\/article>/.exec(builtPage)?.[0] || "";
  assert.match(card, /<h3><a href="[^"]+">/, "卡片仍以标题作为真实文章链接");
  assert.match(card, /class="post-tags"/, "卡片内的标签链接仍保留");
});

test("no dark-only color escapes into the light overrides", () => {
  // 覆盖块里不允许出现深色底（#0b0e14、#121924 之类的面板色）
  const forbidden = ["#0b0e14", "#0d151e", "#11151d", "#111822", "#111925", "#121720", "#121924", "#14251f", "#1b2430", "#121820"];
  const lightRules = css.split("html[data-theme=\"light\"]").slice(1);
  const offenders = [];
  for (const rule of lightRules) {
    const body = rule.slice(rule.indexOf("{") + 1, rule.indexOf("}"));
    for (const color of forbidden) {
      // 只关心背景/边框这类「底色」，文字色可能恰好重用就跳过（这里用严格判断）
      if (new RegExp(`background[^;]*${color}`).test(body)) offenders.push(`${color}: ${body.slice(0, 60)}`);
    }
  }
  assert.deepEqual(offenders, []);
});

/* 浅色覆盖的完整性：深色里出现过的每一处硬编码颜色，浅色侧都要有对应覆盖，
   顺序是「深色规则 → 浅色同名规则」，所以这里可以用选择器 + 属性分组来比对。 */
function parseCss(source) {
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const body = stripped
    .split("\n")
    .reduce((acc, line) => {
      if (/^\s*@media/.test(line)) return { ...acc, depth: 1 };
      if (acc.depth > 0) {
        const depth = acc.depth + (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
        return { ...acc, depth: Math.max(depth, 0) };
      }
      return { ...acc, lines: acc.lines.concat(line) };
    }, { depth: 0, lines: [] })
    .lines.join("\n");
  return [...body.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selectors: match[1].split(",").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean),
    rule: match[2],
  }));
}
const GROUP = {
  background: "bg", "background-color": "bg", "background-image": "bg",
  color: "fg", "caret-color": "fg",
  border: "border", "border-color": "border", "border-top": "border", "border-bottom": "border",
  "border-left": "border", "border-right": "border", "border-top-color": "border",
  "border-bottom-color": "border", "border-left-color": "border", "border-right-color": "border",
  "box-shadow": "shadow", "text-shadow": "shadow", fill: "fg", stroke: "fg",
};
const lightBlocks = (rules) => {
  const dark = new Map();
  const light = new Map();
  for (const { selectors, rule } of rules) {
    const isLight = selectors.some((s) => s.includes('data-theme="light"'));
    const props = [...rule.matchAll(/([a-zA-Z-]+)\s*:\s*([^;]+)/g)];
    for (const selector of selectors) {
      // 深色侧跳过 :root / 壁纸层 / 主题规则；浅色侧的选择器本身就带作用域前缀
      if (selector === ":root" || selector.includes("data-wallpaper")) continue;
      if (!isLight && (selector.includes("data-theme") || selector.includes("data-wallpaper"))) continue;
      const target = isLight ? light : dark;
      for (const [, prop, value] of props) {
        const key = prop.toLowerCase();
        if (!GROUP[key] || key.startsWith("--")) continue;
        // 只有硬编码的颜色需要覆盖：走 var(--…) 的交给浅色令牌
        if (!/#[0-9a-f]{3,8}|rgba?\(/i.test(value)) continue;
        if (!isLight && /var\(/.test(value)) continue;
        const name = isLight ? selector.replace(/\s*\[data-theme="light"\]\s*/, " ").replace(/^html\s+/, "").trim() : selector;
        if (!name) continue;
        if (!target.has(name)) target.set(name, new Set());
        target.get(name).add(GROUP[key]);
      }
    }
  }
  return { dark, light };
};

const coverageGaps = (source) => {
  const { dark, light } = lightBlocks(parseCss(source));
  const gaps = [];
  for (const [selector, groups] of dark) {
    const covered = light.get(selector) || new Set();
    const missing = [...groups].filter((group) => !covered.has(group));
    if (missing.length) gaps.push(`${selector} → ${missing.join(", ")}`);
  }
  return { gaps, dark, light };
};

test("every hard-coded dark color has a scoped light override", () => {
  const rules = parseCss(css);
  const { dark, light } = lightBlocks(rules);
  const gaps = [];
  for (const [selector, groups] of dark) {
    const covered = light.get(selector) || new Set();
    const missing = [...groups].filter((group) => !covered.has(group));
    if (missing.length) gaps.push(`${selector} → ${missing.join(", ")}`);
  }
  assert.deepEqual(gaps, [], `浅色缺少这些覆盖（选择器 → 属性）：\n${gaps.join("\n")}`);
  // 解析器的自检：两边都应该解析出足够多的规则，否则是工具本身坏了
  assert(dark.size > 100, `解析到的深色规则太少（${dark.size}），检查工具本身`);
  assert(light.size > 100, `解析到的浅色规则太少（${light.size}），检查工具本身`);
});

test("the admin panel gets light overrides too", async () => {
  const adminCss = await readFile("source/admin/admin.css", "utf8");
  const { gaps, dark } = coverageGaps(adminCss);
  assert.deepEqual(gaps, [], `后台浅色缺少这些覆盖：\n${gaps.join("\n")}`);
  assert(dark.size > 25, `后台解析到的深色规则太少（${dark.size}）`);
  // 后台顶栏的主题三选一必须真的能改主题：三个按钮 + 主题脚本
  const adminHtml = await readFile("source/admin/index.html", "utf8");
  assert(/data-theme-option="auto"/.test(adminHtml) && /data-theme-option="light"/.test(adminHtml) && /data-theme-option="dark"/.test(adminHtml));
  assert(adminHtml.includes("/js/theme.js?v="), "后台也要加载主题脚本，三选一才会生效");
  assert(/admin\.css\?v=[\w.-]+/.test(adminHtml) && /admin\.js\?v=[\w.-]+/.test(adminHtml), "后台静态资源必须带版本号");
});

test("no light-mode panel is still a dark panel", () => {
  const rules = parseCss(css);
  const luminance = (value) => {
    const uses = [...value.matchAll(/#([0-9a-f]{3,8})/gi)].map((m) => m[1]);
    if (!uses.length) return null;
    return Math.max(...uses.map((hex) => {
      const full = hex.length < 6 ? hex.slice(0, 3).split("").map((c) => c + c).join("") : hex.slice(0, 6);
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
      return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }));
  };
  const dark = new Map();
  const light = new Map();
  for (const { selectors, rule } of rules) {
    const isLight = selectors.some((s) => s.includes('data-theme="light"'));
    const values = [...rule.matchAll(/(?:^|;)\s*(background|background-color)\s*:\s*([^;]+)/g)].map((m) => luminance(m[2]));
    for (const selector of selectors) {
      if (selector.includes("data-wallpaper")) continue;
      if (!isLight && selector.includes("data-theme")) continue;
      const name = isLight ? selector.replace(/\s*\[data-theme="light"\]\s*/, " ").replace(/^html\s+/, "").trim() : selector;
      const target = isLight ? light : dark;
      for (const value of values) {
        if (value === null) continue;
        const key = `${name}::${target === dark ? "dark" : "light"}`;
        const store = target === dark ? dark : light;
        if (!store.has(key)) store.set(key, 0);
        store.set(key, Math.max(store.get(key), value));
      }
    }
  }
  const offenders = [];
  for (const [key, darkValue] of dark) {
    if (darkValue > 0.35) continue; // 只关心深色面板
    const lightValue = light.get(key.replace("::dark", "::light"));
    if (lightValue !== undefined && lightValue < 0.35) offenders.push(`${key} dark=${darkValue.toFixed(2)} light=${lightValue.toFixed(2)}`);
  }
  assert.deepEqual(offenders, [], `浅色下仍是深色面板：\n${offenders.join("\n")}`);
});

/* 对比度：浅色模式下的正文与代码配色要符合 WCAG AA（4.5:1），
   这条测试直接从 main.css 里读实际取值，改配色后如果对比度不够会立刻失败。 */
function contrast(a, b) {
  const parse = (value) => {
    const [r, g, bl] = value.match(/[0-9a-f]{2}/gi).slice(0, 3).map((h) => parseInt(h, 16));
    return [r, g, bl];
  };
  const luminance = (values) => {
    const [r, g, b] = values.map((c) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [a1, b1] = [luminance(parse(a)), luminance(parse(b))].sort((x, y) => y - x);
  return (a1 + 0.05) / (b1 + 0.05);
}
const lightValue = (selector, prop) => {
  for (const { selectors, rule } of parseCss(css)) {
    if (!selectors.some((s) => s.includes('data-theme="light"'))) continue;
    const matches = selectors.some((s) => s.replace(/\s*\[data-theme="light"\]\s*/, " ").replace(/^html\s+/, "").trim() === selector);
    if (!matches) continue;
    const match = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*(#[0-9a-f]{6})`, "i").exec(rule);
    if (match) return match[1];
  }
  return null;
};

test("light mode stays readable: body and code text pass WCAG AA", () => {
  const token = (name) => {
    const block = /html\[data-theme="light"\] \{([\s\S]*?)\n\}/.exec(css)[1];
    return new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "i").exec(block)[1];
  };
  const pairs = [
    ["主文字 / 页面底色", token("--text"), token("--bg"), 7],
    ["主文字 / 卡片底色", token("--text"), token("--panel"), 7],
    ["次级文字 / 卡片底色", token("--muted"), token("--panel"), 4.5],
    ["次级文字 / 抬升底色", token("--muted"), token("--panel-raised"), 4.5],
  ];
  for (const [name, fg, bg, min] of pairs) {
    const value = contrast(fg, bg);
    assert(value >= min, `${name}: ${fg} on ${bg} 仅 ${value.toFixed(2)}:1（需要 ${min}:1）`);
  }
  // 代码块：前景从样式里读，并对代码块可能用到的几种底色都校验
  const codeBackgrounds = [
    lightValue(".article-content .highlight", "background") || "#f8fafd",
    lightValue(".article-content pre", "background") || "#f6f9fc",
    lightValue(".article-content code", "background") || "#f1f5f9",
    lightValue(".highlight .gutter", "background") || "#f1f5fa",
  ];
  const selectors = [
    ".highlight .code", ".highlight .comment", ".highlight .string", ".highlight .number",
    ".highlight .keyword", ".highlight .title", ".highlight .type", ".highlight .gutter", ".highlight:before",
  ];
  for (const selector of selectors) {
    const color = lightValue(selector, "color");
    assert(color, `${selector} 缺少浅色覆盖`);
    for (const background of codeBackgrounds) {
      const value = contrast(color, background);
      assert(value >= 4.5, `${selector}: ${color} on ${background} 仅 ${value.toFixed(2)}:1（需要 4.5:1）`);
    }
  }
  // 主按钮：浅色下用深一号的强调色，白字仍然清晰
  const accent = token("--accent");
  assert(contrast("#ffffff", accent) >= 4.5, `主按钮白字 / ${accent} 对比度不足`);
});

/* ---------------- 管理后台 ---------------- */

async function adminPage() {
  const adminHtml = await readFile("source/admin/index.html", "utf8");
  const dom = new JSDOM(adminHtml, { url: "https://lscminxi.github.io/admin/", runScripts: "outside-only" });
  const w = dom.window;
  w.scrollTo = () => {};
  w.matchMedia = (query) => ({ matches: false, media: query, addEventListener: () => {}, addListener: () => {} });
  w.fetch = async () => ({ ok: true, json: async () => ({ theme: "auto" }) });
  w.eval(themeJs);
  await new Promise((r) => setTimeout(r, 10));
  return { dom, w, $: (selector) => w.document.querySelector(selector) };
}

test("the admin page offers auto / light / dark and highlights the visitor choice", async () => {
  const { dom, w, $ } = await adminPage();
  try {
    const buttons = [...w.document.querySelectorAll("[data-theme-option]")].map((b) => b.dataset.themeOption);
    assert.deepEqual(buttons, ["auto", "light", "dark"]);
    assert.equal($('[data-theme-option="auto"]').getAttribute("aria-pressed"), "true");

    $('[data-theme-option="light"]').click();
    assert.equal(w.document.documentElement.dataset.theme, "light");
    assert.equal(w.localStorage.getItem(appearance.THEME_STORAGE_KEY), "light");
    assert.equal($('[data-theme-option="light"]').classList.contains("active"), true);
    assert.equal($('[data-theme-option="auto"]').getAttribute("aria-pressed"), "false");

    $('[data-theme-option="dark"]').click();
    assert.equal(w.document.documentElement.dataset.theme, "dark");
    $('[data-theme-option="auto"]').click();
    assert.equal(w.localStorage.getItem(appearance.THEME_STORAGE_KEY), null, "跟随系统时清掉本地选择");
    assert.equal(w.document.documentElement.dataset.theme, "dark", "本机系统偏好是深色");
  } finally {
    await closePage(dom);
  }
});

test("the admin appearance panel edits the site-wide default theme", async () => {
  const adminJs = await readFile("source/admin/admin.js", "utf8");
  const adminHtml = await readFile("source/admin/index.html", "utf8");
  const dom = new JSDOM(adminHtml, { url: "https://lscminxi.github.io/admin/", runScripts: "outside-only" });
  const w = dom.window;
  w.scrollTo = () => {};
  w.TextEncoder = TextEncoder;
  w.TextDecoder = TextDecoder;
  w.MinxiPreview = { document: () => "<!doctype html><html></html>" };
  w.setInterval = () => 0;
  w.clearInterval = () => {};
  w.setTimeout = () => 0;
  w.clearTimeout = () => {};
  w.matchMedia = (query) => ({ matches: false, media: query, addEventListener: () => {}, addListener: () => {} });
  const files = new Map([
    ["blog/source/_data/appearance.json", { sha: "appearance-sha", text: JSON.stringify({ ...appearance.DEFAULTS, wallpapers: [], theme: "light" }) }],
  ]);
  const state = { writes: [], appearance: null };
  const reply = (status, data) => ({ ok: status < 400, status, text: async () => JSON.stringify(data), json: async () => data });
  w.fetch = async (url, opts = {}) => {
    const uri = new URL(url);
    const suffix = decodeURIComponent(uri.pathname.replace("/repos/lscminxi/lscminxi.github.io", ""));
    if (suffix === "/appearance.json") return reply(200, { theme: "light", wallpapers: [] });
    if (suffix === "/user") return reply(200, { login: "lscminxi" });
    if (!suffix) return reply(200, { permissions: { push: true }, owner: { login: "lscminxi" } });
    if (suffix.startsWith("/actions/runs")) return reply(200, { workflow_runs: [] });
    if (suffix.startsWith("/git/trees/")) return reply(200, { tree: [...files].map(([path, file]) => ({ path, sha: file.sha, size: file.text.length, type: "blob" })) });
    if (suffix.startsWith("/contents/")) {
      const filePath = suffix.slice("/contents/".length);
      if (opts.method === "PUT") {
        const body = JSON.parse(opts.body);
        const decoded = Buffer.from(body.content, "base64").toString();
        state.writes.push({ path: filePath, decoded });
        state.appearance = JSON.parse(decoded);
        return reply(200, { content: { sha: "saved" }, commit: { sha: "commit-1" } });
      }
      const file = files.get(filePath);
      return file ? reply(200, { sha: file.sha, size: file.text.length, encoding: "base64", content: Buffer.from(file.text).toString("base64") }) : reply(404, { message: "Not Found" });
    }
    throw new Error(`Unexpected API ${suffix}`);
  };
  w.eval(await readFile("source/admin/appearance.js", "utf8"));
  w.sessionStorage.setItem("minxi.admin.oauth-token", "test-token");
  w.eval(adminJs);
  const $ = (selector) => w.document.querySelector(selector);
  try {
    await wait(() => $("#post-list"));
    [...$("#tabs").querySelectorAll(".tab")].find((tab) => tab.dataset.tab === "appearance").click();
    await wait(() => $("#appearance-status").textContent.includes("已加载"));
    assert.equal($("#a-theme").value, "light", "回填站点默认主题");

    $("#a-theme").value = "dark";
    $("#a-theme").dispatchEvent(new w.Event("input"));
    $("#appearance-save").click();
    await wait(() => state.writes.length === 1);
    assert.equal(state.appearance.theme, "dark");
    assert.equal(state.writes[0].path, "blog/source/_data/appearance.json");
    await wait(() => $("#appearance-status").textContent.includes("已提交"));
  } finally {
    await closePage(dom);
  }
});

/* ---------------- 构建产物 ---------------- */

test("a hostile theme value cannot break the build and falls back to auto", async () => {
  const temp = await mkdtemp(join(tmpdir(), "minxi-theme-"));
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
      JSON.stringify({ ...appearance.DEFAULTS, wallpapers: [], theme: '"><script>alert(1)</script>' }),
    );
    await exec("npm", ["run", "build"], { cwd: join(temp, "blog"), timeout: 120000 });
    const built = await readFile(join(temp, "blog/public/index.html"), "utf8");
    assert(!built.includes("alert(1)"), "非法主题值不会写进页面");
    assert(built.includes('data-theme-default="auto"'), "非法值回落到 auto");
    const published = JSON.parse(await readFile(join(temp, "blog/public/appearance.json"), "utf8"));
    assert.equal(published.theme, "auto");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("the checked-in appearance.json keeps a valid theme and survives cleaning", async () => {
  const configured = JSON.parse(await readFile("source/_data/appearance.json", "utf8"));
  assert(appearance.THEME_MODES.includes(configured.theme), `Invalid theme: ${configured.theme}`);
  assert.deepEqual(appearance.resolveAppearance(configured), configured);
});
