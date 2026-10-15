"use strict";

hexo.extend.helper.register("read_minutes", function (post) {
  const text = String(post.content || "").replace(/<[^>]*>/g, "");
  return Math.max(1, Math.ceil(text.length / 500));
});

hexo.extend.generator.register("search-index", function (locals) {
  const posts = locals.posts
    .sort("-date")
    .toArray()
    .map((post) => ({
      title: post.title,
      url: hexo.config.root + post.path,
      description: post.description || "",
      tags: post.tags.map((tag) => tag.name),
      content: String(post.content || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .slice(0, 15000),
    }));
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
