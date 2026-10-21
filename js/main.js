"use strict";
(() => {
  const dialog = document.querySelector("#search-dialog");
  const input = document.querySelector("#search-input");
  const results = document.querySelector("#search-results");
  let searchData;
  let pending;
  let searchVersion = 0;
  let searchOpener;

  const loadSearch = async () => {
    if (searchData) return searchData;
    if (!pending) {
      pending = fetch(dialog.dataset.index)
        .then((response) => {
          if (!response.ok) throw new Error("Search index unavailable");
          return response.json();
        })
        .then((data) => {
          searchData = data;
          return data;
        })
        .catch((error) => {
          pending = null;
          throw error;
        });
    }
    return pending;
  };
  const hint = (message) => {
    const p = document.createElement("p");
    p.className = "search-hint";
    p.textContent = message;
    results.replaceChildren(p);
  };
  // LaTeX 模糊搜索：公式与查询都先「归一化」——去掉反斜杠、花括号、上下标符号、
  // $ 定界符与空白并统一小写，于是 \frac{n}{2}、frac n 2、$n\over2$ 这类写法差异
  // 都能对上；再允许子序列命中（字符按顺序出现即可），输一半命令也能找到。
  const normalizeLatex = (text) =>
    String(text || "")
      .toLocaleLowerCase()
      .replace(/[\s\\{}$^_~]/g, "");
  const isSubsequence = (needle, haystack) => {
    if (!needle) return true;
    let i = 0;
    for (const ch of haystack) {
      if (ch === needle[i]) i += 1;
      if (i >= needle.length) return true;
    }
    return false;
  };
  // 连续子串命中分高，子序列模糊命中分低一些；越短的公式里命中越靠前越相关。
  const fuzzyScore = (termInfo, value, exactScore, fuzzyScoreValue) => {
    const raw = String(value || "").toLocaleLowerCase();
    if (raw.includes(termInfo.raw)) return exactScore;
    const normalized = normalizeLatex(raw);
    if (termInfo.normalized && normalized.includes(termInfo.normalized))
      return exactScore * 0.9;
    if (termInfo.normalized && isSubsequence(termInfo.normalized, normalized))
      return fuzzyScoreValue;
    return 0;
  };
  const scorePost = (post, terms) => {
    let total = 0;
    let bestLatex = "";
    let bestLatexScore = 0;
    for (const term of terms) {
      let termScore = 0;
      termScore = Math.max(termScore, fuzzyScore(term, post.title, 120, 40));
      for (const tag of post.tags || [])
        termScore = Math.max(termScore, fuzzyScore(term, tag, 100, 35));
      termScore = Math.max(termScore, fuzzyScore(term, post.description, 60, 20));
      termScore = Math.max(termScore, fuzzyScore(term, post.content, 30, 8));
      for (const tex of post.latex || []) {
        const score = fuzzyScore(term, tex, 110, 55);
        if (score > bestLatexScore) {
          bestLatexScore = score;
          bestLatex = tex;
        }
        termScore = Math.max(termScore, score);
      }
      if (termScore <= 0) return null; // 每个词都要命中（标题/标签/正文/公式任一处）
      total += termScore;
    }
    return { post, score: total, bestLatex, bestLatexScore };
  };
  const search = async () => {
    const version = ++searchVersion;
    const query = input.value.trim().toLocaleLowerCase();
    if (!query) return hint("输入关键词，或 LaTeX 片段如 \\sum、\\frac{n}{2}");
    hint("正在查找笔记…");
    try {
      const data = await loadSearch();
      if (version !== searchVersion) return;
      const terms = query
        .split(/\s+/)
        .filter(Boolean)
        .map((raw) => ({ raw, normalized: normalizeLatex(raw) }));
      const matches = data
        .map((post) => scorePost(post, terms))
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .slice(0, 30);
      if (!matches.length)
        return hint("没有找到相关笔记，试试「二分」、\\sum 或 \\frac？");
      const nodes = matches.map(({ post, bestLatex, bestLatexScore }) => {
        const link = document.createElement("a");
        link.className = "search-result";
        link.href = post.url;
        const title = document.createElement("strong");
        title.textContent = post.title;
        const description = document.createElement("p");
        description.textContent =
          post.description || post.content.slice(0, 100);
        link.append(title, description);
        // 命中公式时直接亮出那条公式，省得点进去再翻。
        if (bestLatex && bestLatexScore > 0) {
          const code = document.createElement("code");
          code.className = "search-latex";
          code.textContent =
            bestLatex.length > 120 ? `${bestLatex.slice(0, 120)}…` : bestLatex;
          link.append(code);
        }
        return link;
      });
      results.replaceChildren(...nodes);
    } catch {
      if (version === searchVersion)
        hint("搜索索引暂时无法加载，请检查网络后重新输入。");
    }
  };
  const openSearch = () => {
    if (dialog.open) return;
    searchOpener = document.activeElement;
    dialog.showModal();
    document.body.classList.add("search-open");
    input.focus();
    search();
  };
  document
    .querySelectorAll(".search-trigger")
    // 只有搜索按钮才打开搜索框：其它按钮即使复用了样式类也不受影响。
    .forEach((button) => {
      if (button.matches("[data-open-wallpaper], [data-open-search='false']")) return;
      button.addEventListener("click", openSearch);
    });
  document
    .querySelector("#close-search")
    .addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    const bounds = dialog.getBoundingClientRect();
    if (
      event.target === dialog &&
      (event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom)
    )
      dialog.close();
  });
  dialog.addEventListener("close", () => {
    document.body.classList.remove("search-open");
    searchOpener?.focus();
  });
  input.addEventListener("input", search);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && dialog.open) {
      event.preventDefault();
      dialog.close();
      return;
    }
    if (
      event.key === "/" &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !event.target.closest('input, textarea, [contenteditable="true"]')
    ) {
      event.preventDefault();
      openSearch();
    }
  });

  const filters = document.querySelectorAll("[data-filter]");
  filters.forEach((button) =>
    button.addEventListener("click", () => {
      filters.forEach((filter) => {
        const selected = filter === button;
        filter.classList.toggle("active", selected);
        filter.setAttribute("aria-pressed", String(selected));
      });
      let visible = 0;
      document.querySelectorAll(".post-card[data-category]").forEach((card) => {
        const matches =
          button.dataset.filter === "all" ||
          card.dataset.category === button.dataset.filter;
        card.hidden = !matches;
        if (matches) visible++;
      });
      const empty = document.querySelector(".filter-empty");
      if (empty) empty.hidden = visible !== 0;
      // 归档页：没有可见文章的年份标题和置顶区块一并隐藏。
      document.querySelectorAll(".archive-year, .pinned-block").forEach((group) => {
        let count = 0;
        if (group.classList.contains("pinned-block")) {
          count = [...group.querySelectorAll(".post-card")].filter((card) => !card.hidden).length;
        } else {
          for (let el = group.nextElementSibling; el && !el.classList.contains("archive-year"); el = el.nextElementSibling) {
            if (el.classList.contains("post-card") && !el.hidden) count++;
          }
        }
        group.hidden = count === 0;
      });
    }),
  );

  document.querySelectorAll("figure.highlight").forEach((block) => {
    const language =
      [...block.classList].find((name) => name !== "highlight") || "code";
    block.dataset.language = language;
    const copy = document.createElement("button");
    copy.className = "copy-code";
    copy.textContent = "复制代码";
    copy.setAttribute("aria-label", "复制这段代码");
    copy.addEventListener("click", async () => {
      const code = block.querySelector(".code pre")?.innerText || "";
      try {
        await navigator.clipboard.writeText(code);
        copy.textContent = "已复制 ✓";
      } catch {
        const range = document.createRange();
        const node = block.querySelector(".code pre");
        if (node) {
          range.selectNodeContents(node);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
        }
        copy.textContent = "请手动复制选中代码";
      }
      window.setTimeout(() => {
        copy.textContent = "复制代码";
      }, 2500);
    });
    block.append(copy);
  });

  // 头像图片（后台「外观」里配置，可能是外链）加载失败时回落到字母标记。
  document.querySelectorAll(".avatar--image").forEach((frame) => {
    const image = frame.querySelector(".avatar-image");
    const mark = frame.querySelector(".avatar-mark");
    if (!image || !mark) return;
    const fallback = () => {
      frame.classList.add("avatar--failed");
      mark.hidden = false;
    };
    image.addEventListener("error", fallback);
    // 事件可能在脚本执行前就已经触发过，这里补一次判断。
    if (image.complete && image.naturalWidth === 0) fallback();
  });

  const backTop = document.querySelector("#back-top");
  const updateScroll = () => {
    backTop.hidden = window.scrollY < 500;
  };
  window.addEventListener("scroll", updateScroll, { passive: true });
  updateScroll();
  backTop.addEventListener("click", () =>
    window.scrollTo({
      top: 0,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    }),
  );

  const headings = document.querySelectorAll(
    ".article-content h2[id], .article-content h3[id]",
  );
  /* ---------------- 顶栏导航：展开 / 收起 ----------------
     顶栏默认收在屏幕外，鼠标移到页面最上方（或最上面那个小箭头）就滑出来。
     展开状态完全由这里的 .header-open 类控制，CSS 里的 :hover 写法只在没有 JS 时兜底：
     元素快速滑入/滑出时，浏览器可能把 :hover 状态留在旧值上，于是「鼠标只是划过去
     又马上移开，导航栏却一直挂在页面上」。这里改成每次指针移动都按「现在到底在不在
     顶栏上方」重新判断，不再依赖 :hover，所以不会卡住。 */
  const header = document.querySelector(".site-header");
  if (header) {
    const root = document.documentElement;
    const zone = document.querySelector(".header-hover-zone");
    const hint = document.querySelector("[data-open-header]");
    const CLOSE_DELAY = 700; // 指针离开顶栏后停留一会儿再收起
    let closeTimer = 0;
    let inside = false; // 指针当前是否真的在顶栏 / 感应区 / 小箭头上
    let pinned = false; // 触摸屏点开（没有悬停）时固定住，直到点别处
    let lastCheck = 0;
    let pointer = null; // 最后一次看到的指针位置，用于收起前再确认一次

    // 告诉 CSS「交给 JS 了」，:hover 那套兜底规则随之失效
    root.classList.add("header-js");
    const isOpen = () => root.classList.contains("header-open");

    const open = () => {
      window.clearTimeout(closeTimer);
      if (isOpen()) return;
      root.classList.add("header-open");
    };
    const close = () => {
      window.clearTimeout(closeTimer);
      pinned = false;
      inside = false;
      if (isOpen()) root.classList.remove("header-open");
    };
    const scheduleClose = (delay = CLOSE_DELAY) => {
      if (pinned) return;
      window.clearTimeout(closeTimer);
      closeTimer = window.setTimeout(() => {
        if (pinned) return;
        // 收起前再按「此刻」的几何确认一次：顶栏滑出的这 0.6 秒里指针可能已经
        // 停在它上面了（这时不该收起），而这段静止期间不会再有 pointermove。
        if (pointer && overHeader(pointer.x, pointer.y)) {
          inside = true;
          return;
        }
        pointer = null;
        close();
      }, delay);
    };
    // 用实际几何判断（getBoundingClientRect 会算上滑入滑出的 transform）
    const overHeader = (x, y) =>
      [header, zone, hint].some((node) => {
        if (!node) return false;
        const box = node.getBoundingClientRect();
        return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
      });

    for (const node of [zone, hint, header]) {
      node?.addEventListener("pointerenter", (event) => {
        if (event.pointerType === "touch") return; // 触摸没有「悬停」
        if (typeof event.clientX === "number" && typeof event.clientY === "number") {
          pointer = { x: event.clientX, y: event.clientY };
        }
        inside = true;
        open();
      });
    }
    const leave = () => {
      inside = false;
      scheduleClose();
    };
    header.addEventListener("pointerleave", leave);
    zone?.addEventListener("pointerleave", leave);

    // 兜底判断：指针一移动就重新算一次，不依赖 :hover 的旧状态
    document.addEventListener(
      "pointermove",
      (event) => {
        if (event.pointerType === "touch" || !isOpen()) return;
        pointer = { x: event.clientX, y: event.clientY };
        const now = Date.now();
        if (now - lastCheck < 80) return; // 稍微节流，避免每次移动都算
        lastCheck = now;
        const isInside = overHeader(event.clientX, event.clientY);
        if (isInside === inside) return;
        inside = isInside;
        if (isInside) window.clearTimeout(closeTimer);
        else scheduleClose();
      },
      { passive: true },
    );

    // 指针移出窗口（含从浏览器顶边滑出去）：马上收起，别让它悬在那儿
    document.addEventListener("mouseleave", () => {
      pointer = null; // 指针已经不在页面上了，旧坐标不能再用
      if (isOpen()) scheduleClose(120);
    });
    window.addEventListener("blur", () => {
      pointer = null;
      close();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        pointer = null;
        close();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });
    // 点到顶栏以外的地方就收起（点顶栏内部不动，比如正在点导航链接）
    document.addEventListener("pointerdown", (event) => {
      if (!isOpen()) return;
      if (header.contains(event.target)) return;
      if (hint?.contains(event.target) || zone?.contains(event.target)) return;
      close();
    });
    // 点小箭头：收起时点开、展开时点收；触摸 / 键盘触发（没有悬停）就先固定住
    hint?.addEventListener("click", (event) => {
      const touch = event.pointerType === "touch" || event.detail === 0; // 触摸 / 键盘触发
      if (isOpen()) {
        // 触摸屏再点一下收起；鼠标点击通常就是「我要用导航」，保持展开
        if (touch) close();
        else window.clearTimeout(closeTimer);
        return;
      }
      if (touch) pinned = true; // 触摸没有悬停，点开后先固定住
      open();
    });
    // 键盘 Tab 进顶栏也要看得见（CSS 里也有 :focus-within，这里同步一下状态）
    header.addEventListener("focusin", () => {
      pinned = false;
      open();
    });
    header.addEventListener("focusout", () => {
      window.clearTimeout(closeTimer);
      closeTimer = window.setTimeout(() => {
        if (!header.contains(document.activeElement)) close();
      }, 120);
    });

    // 只读状态出口：方便排查问题和回归测试
    window.MinxiHeader = {
      open,
      close,
      isOpen,
      state: () => ({ open: isOpen(), pinned, inside }),
    };
  }

  if ("IntersectionObserver" in window && headings.length) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          document.querySelectorAll(".toc a").forEach((link) => {
            let target;
            try {
              target = decodeURIComponent(link.hash.slice(1));
            } catch {
              target = "";
            }
            link.classList.toggle("active", target === entry.target.id);
          });
        });
      },
      { rootMargin: "-100px 0px -65% 0px" },
    );
    headings.forEach((heading) => observer.observe(heading));
  }
})();
