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
      const filterValue = button.dataset.filter;
      let visible = 0;
      document.querySelectorAll(".post-card-wrapper").forEach((wrapper) => {
        const card = wrapper.querySelector(".post-card");
        const matches =
          filterValue === "all" || card.dataset.category === filterValue;
        if (matches) {
          wrapper.hidden = false;
          if (loadMoreBtn) wrapper.classList.toggle("post-batch-hidden", visible >= 6);
          visible++;
        } else {
          wrapper.hidden = true;
        }
      });
      document.querySelectorAll(".pinned-block .post-card").forEach((card) => {
        card.hidden = filterValue !== "all" && card.dataset.category !== filterValue;
        if (!card.hidden) visible++;
      });
      const empty = document.querySelector(".filter-empty");
      if (empty) empty.hidden = visible !== 0;
      updateLoadMore();
      // 归档页：没有可见文章的年份标题和置顶区块一并隐藏。
      document.querySelectorAll(".archive-year, .pinned-block").forEach((group) => {
        let count = 0;
        if (group.classList.contains("pinned-block")) {
          count = [...group.querySelectorAll(".post-card")].filter(
            (card) => !card.hidden && !card.closest(".post-batch-hidden"),
          ).length;
        } else {
          for (
            let el = group.nextElementSibling;
            el && !el.classList.contains("archive-year");
            el = el.nextElementSibling
          ) {
            if (
              el.classList.contains("post-card") &&
              !el.hidden &&
              !el.closest(".post-batch-hidden")
            )
              count++;
          }
        }
        group.hidden = count === 0;
      });
    }),
  );

  // 按当前分类统计剩余文章，切换分类后同步按钮状态。
  const loadMoreBtn = document.querySelector("#load-more");
  const loadHint = document.querySelector(".load-hint");
  const remainingPosts = () => [...document.querySelectorAll(".post-card-wrapper.post-batch-hidden")]
    .filter((wrapper) => !wrapper.hidden);
  const updateLoadMore = () => {
    if (!loadMoreBtn) return;
    const remaining = remainingPosts().length;
    loadMoreBtn.hidden = remaining === 0;
    if (remaining) loadMoreBtn.innerHTML = `加载更多 <span aria-hidden="true">↓</span> <small>剩余 ${remaining} 篇</small>`;
    if (loadHint) loadHint.hidden = remaining !== 0;
  };
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener("click", () => {
      remainingPosts().slice(0, 6).forEach((wrapper) => wrapper.classList.remove("post-batch-hidden"));
      updateLoadMore();
    });
    updateLoadMore();
  }

  // 首页浮动标签：点击后在新窗口打开 原神云游
  const floatingTag = document.querySelector("[data-open-yunshi]");
  if (floatingTag) {
    floatingTag.addEventListener("click", () => {
      window.open("https://ys.mihoyo.com/cloud/", "_blank");
    });
  }

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
