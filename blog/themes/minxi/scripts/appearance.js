"use strict";

/*
 * 外观设置：构建时把 source/_data/appearance.json 渲染进页面。
 * 同时生成 /appearance.json（已清洗的公开副本），供在线后台读取“线上生效值”。
 */

const { resolveAppearance, cssImage, faviconType, veilAlpha, DEFAULTS } = require("../../../lib/appearance.cjs");

function rawAppearance(hexo, locals) {
  const site = locals && locals.site;
  if (site && site.data && site.data.appearance) return site.data.appearance;
  const data = hexo.locals.get("data");
  return (data && data.appearance) || {};
}

// 模板里调用 site_appearance() 得到一个已清洗、字段齐全的对象：
//   avatar / wallpaper / favicon / wallpaperDim / wallpaperBlur
// 另外附带 faviconType、wallpaperImage（CSS 值）、wallpaperVeil（透明度字符串）。
hexo.extend.helper.register("site_appearance", function () {
  const value = resolveAppearance(rawAppearance(hexo, this));
  return Object.assign({}, value, {
    faviconType: faviconType(value.favicon),
    wallpaperImage: cssImage(value.wallpaper),
    wallpaperVeil: veilAlpha(value.wallpaperDim),
    hasWallpaper: Boolean(value.wallpaper),
    hasWallpaperBlur: Boolean(value.wallpaper) && value.wallpaperBlur > 0,
  });
});

hexo.extend.helper.register("appearance_default_favicon", () => DEFAULTS.favicon);

// 公开的只读副本：/appearance.json
// 不包含时间戳，避免每次构建产生无意义的提交差异。
hexo.extend.generator.register("appearance-data", function (locals) {
  const value = resolveAppearance(rawAppearance(hexo, locals));
  return {
    path: "appearance.json",
    data: JSON.stringify(
      {
        avatar: value.avatar,
        wallpaper: value.wallpaper,
        favicon: value.favicon,
        wallpaperDim: value.wallpaperDim,
        wallpaperBlur: value.wallpaperBlur,
      },
      null,
      2,
    ) + "\n",
  };
});
