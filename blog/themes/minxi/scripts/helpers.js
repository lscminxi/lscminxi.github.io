"use strict";

hexo.extend.helper.register("read_minutes", function (post) {
  const text = String(post.content || "").replace(/<[^>]*>/g, "");
  return Math.max(1, Math.ceil(text.length / 500));
});

hexo.extend.generator.register("search-index", function (locals) {
  const posts = locals.posts
    .sort("-date")
    .toArray()
    .map((post) => {
      const html = String(post.content || "");
      // 结构化公式索引：从 KaTeX 的 TeX 注解里抽出原始公式，让前台搜索能按
      // 命令/下标/括号片段模糊匹配公式，而不只是翻去标签后的正文纯文本。
      // 去重并封顶条数与单条长度，避免公式多的文章把索引撑爆。
      const latex = [];
      const seenLatex = new Set();
      for (const match of html.matchAll(/<annotation encoding="application\/x-tex">([\s\S]*?)<\/annotation>/g)) {
        const tex = match[1]
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;|&apos;/g, "'")
          .replace(/&amp;/g, "&")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 300);
        if (tex && !seenLatex.has(tex)) {
          seenLatex.add(tex);
          latex.push(tex);
          if (latex.length >= 120) break;
        }
      }
      return {
        title: post.title,
        url: hexo.config.root + post.path,
        description: post.description || "",
        tags: post.tags.map((tag) => tag.name),
        content: html
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .slice(0, 15000),
        latex,
      };
    });
  return { path: "search.json", data: JSON.stringify(posts) };
});

// Hexo's index/archive generators omit pages when the final post is deleted.
// Keep navigation and the empty blog build valid.
hexo.extend.generator.register("empty-archives", function (locals) {
  if (locals.posts.length) return [];
  return [
    {
      path: "index.html",
      layout: ["index"],
      data: { posts: locals.posts, total: 1, current: 1, __index: true },
    },
    {
      path: "archives/index.html",
      layout: ["archive"],
      data: { posts: locals.posts, total: 1, archive: true },
    },
  ];
});
