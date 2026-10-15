"use strict";

/*
 * Hexo 的 highlight.js 渲染器只能全局开启或关闭行号。这里保留渲染器的
 * 行号，再根据 Markdown 围栏后的精确标记 `line-numbers` 做最后整理：
 *
 *   ```cpp line-numbers  -> 显示行号
 *   ```cpp               -> 不显示行号
 *
 * hexo-renderer-marked 会把围栏后的附加文字生成为 <figcaption>，因此无需
 * 改写 Markdown 解析器，也不会影响语法高亮。
 */
hexo.extend.filter.register("after_post_render", function (data) {
  if (!data || typeof data.content !== "string") return data;

  data.content = data.content.replace(
    /<figure\b([^>]*\bhighlight\b[^>]*)>([\s\S]*?)<\/figure>/gi,
    (figure, attributes, inner) => {
      const caption = inner.match(/<figcaption>\s*<span>([\s\S]*?)<\/span>[\s\S]*?<\/figcaption>/i);
      const option = caption
        ? caption[1].replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim()
        : "";
      const showLineNumbers = option === "line-numbers";

      // “line-numbers” 是渲染选项，不应该作为可见的代码标题出现。
      if (showLineNumbers && caption) inner = inner.replace(caption[0], "");

      if (!showLineNumbers) {
        inner = inner.replace(/<td\b[^>]*class=(['"])gutter\1[^>]*>[\s\S]*?<\/td>/i, "");
      }

      return `<figure${attributes}>${inner}</figure>`;
    },
  );

  return data;
});
