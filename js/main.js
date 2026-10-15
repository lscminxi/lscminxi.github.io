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
  const search = async () => {
    const version = ++searchVersion;
    const query = input.value.trim().toLocaleLowerCase();
    if (!query) return hint("输入关键词以搜索");
    hint("正在查找笔记…");
    try {
      const data = await loadSearch();
      if (version !== searchVersion) return;
      const terms = query.split(/\s+/);
      const matches = data
        .filter((post) => {
          const haystack = [
            post.title,
            post.description,
            ...post.tags,
            post.content,
          ]
            .join(" ")
            .toLocaleLowerCase();
          return terms.every((term) => haystack.includes(term));
        })
        .slice(0, 30);
      if (!matches.length)
        return hint("没有找到相关笔记，试试「二分」或「C++」？");
      const nodes = matches.map((post) => {
        const link = document.createElement("a");
        link.className = "search-result";
        link.href = post.url;
        const title = document.createElement("strong");
        title.textContent = post.title;
        const description = document.createElement("p");
        description.textContent =
          post.description || post.content.slice(0, 100);
        link.append(title, description);
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
    .forEach((button) => button.addEventListener("click", openSearch));
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

  // 站点图标同样可能是外链（后台「外观」里配置）。加载失败就换回 data-fallback-icon
  // 指向的内置 favicon.svg，否则浏览器标签页会变成空白图标。
  const siteIcon = document.querySelector('link[rel~="icon"][data-fallback-icon]');
  if (siteIcon) {
    const restoreDefaultIcon = () => {
      siteIcon.href = siteIcon.dataset.fallbackIcon;
      siteIcon.type = "image/svg+xml";
    };
    const iconProbe = new Image();
    iconProbe.referrerPolicy = "no-referrer";
    iconProbe.addEventListener("error", restoreDefaultIcon);
    iconProbe.src = siteIcon.href;
  }

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
