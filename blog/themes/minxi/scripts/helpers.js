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
