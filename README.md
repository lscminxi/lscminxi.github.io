# Minxi 的 blog

> 一个幼儿园小班水平的 Oier · lsc_minxi 的 OI 学习记录

基于 **Hexo 8 + 自定义 Minxi 深色主题 + GitHub Pages**。无需数据库，文章使用 Markdown 编写。主题本身不依赖外部字体或前端框架；头像、壁纸和网页图标在 `/admin/` 的「外观」里配置，可以填外链，也可以先用后台的「图片」上传再填 `/images/文件名`。此外，站点右上角的「背景」按钮让**任何访客**都能从站长维护的壁纸库里挑一张背景；旁边的主题按钮可以在**浅色 / 深色**之间切换（默认跟随系统偏好）。这些选择只存在访客自己的浏览器里，不影响别人，也不会提交到仓库。

## 本地预览

需要 Node.js 22 或更新的兼容版本。

```bash
cd blog
npm ci
npm run dev
```

本机打开 `http://localhost:4000`。开发服务器监听 `0.0.0.0`，也支持 Arena 的代理预览地址。不要把开发服务器当作生产服务器。

## 写一篇文章

在 `blog/` 目录执行：

```bash
npm run new -- "my-first-solution"
```

编辑 `blog/source/_posts/my-first-solution.md`：

```markdown
---
title: 我的第一篇题解
date: 2026-10-14 22:00:00
categories:
  - 题解
tags:
  - 二分
  - C++
description: 用一句话介绍题目和核心思路。
---

写下题目背景和思考过程。

<!-- more -->

## 思路

## 实现

## 复杂度
```

- 文件名建议使用英文短名称；标题可以使用中文。
- 使用代码围栏（例如三个反引号后加 `cpp`）获得语法高亮、行号与复制按钮。
- 主题会自动生成文章目录、分类、标签、阅读时长和全文搜索索引。
- 首页每页 6 篇，筛选作用于当前页；标签、分类页面和搜索支持全站查找。
- 写草稿：`npx hexo new draft "draft-name"`；预览草稿：`npm run dev -- --draft`；发布草稿：`npx hexo publish "draft-name"`。
- 日期按 `Asia/Shanghai` 处理，未来时间的文章不会发布。文章时间也决定 URL；发布后尽量不改文件名和日期。
- 初始 4 篇文章都带 `sample: true`，页面会显示「示例文章」。可直接修改、删除，发布自己的内容时移除该字段。
- 删除示例后，也可删除或改写关于页里关于示例文章的说明。
- 文章支持 KaTeX 数学公式：`$...$` 行内公式与 `$$...$$` 独立公式，构建时渲染，样式和字体由本站提供。

## 在线管理后台（`/admin/`）

后台页面地址：**https://lscminxi.github.io/admin/**。导航里没有入口，页面也带 `noindex`，不会出现在搜索结果里。

> 维护提示：`/admin/` 的静态资源都带 `?v=` 版本号（`index.html` 里的 `admin.css` / `admin.js` / `appearance.js`，主题里的 `main.css` / `wallpaper.js` / `theme.js` 同理）。**改动这些文件后请顺手把版本号 +1**（例如 `?v=wallpaper-2`），否则浏览器会继续使用缓存里的旧脚本，页面上会出现「新功能不生效 / 面板是空的」之类的假故障。

站点是纯静态的 GitHub Pages，没有自己的服务器，所以后台**不保存任何账号密码**：

1. **登录**：粘贴你自己的 GitHub Fine-grained Personal Access Token（Repository access 只选 `lscminxi/lscminxi.github.io`，权限 `Contents: Read and write`）。浏览器直接用它调用 `api.github.com` 校验仓库写权限，并检查账号是否在 `admin.js` 的 `CONFIG.allowedLogins` 名单里（默认只有 `lscminxi`）。
2. **文章**：列出 `blog/source/_posts/` 下全部文章，可新建、在线编辑（标题、文件名、日期、分类、标签、描述、强调色、示例标记、Markdown 正文）、实时删除。编辑器支持「编辑 / 分屏 / 预览」，正文输入后自动更新预览，无需保存；提供「插入公式」按钮。预览在本地浏览器中生成，不调用 GitHub；预览用沙箱和 HTML 清洗阻止脚本执行。代码高亮与目录以发布页为准。改文件名会自动「新建 + 删除旧文件」。
3. **图片**：上传到 `blog/source/images/`（GitHub Contents API 单文件上限约 1 MB），可复制 `/images/xxx.png` 写法、插入正文或删除。超过 1 MB 的 JPG / PNG / WebP / AVIF 会在浏览器里先等比缩小（长边 ≤ 2400）并重新编码，再上传压缩后的版本（照片转 WebP，PNG 保留透明）；GIF / SVG 无法可靠压缩，仍会提示超限。
4. **个人简介**：直接编辑 `blog/source/about/index.md`。
5. **外观**：修改**头像**、**页面壁纸（站点默认）**、**网页图标**和**站点默认主题**（`auto` / `light` / `dark`，访客随时能自己切换），可调壁纸压暗程度与模糊半径，并有实时预览；下面的「可选背景」列表就是访客能自选的壁纸库，可以**一次上传多张图片**、填外链、调整顺序、**设为默认壁纸**或**下架**；**点缩略图或「预览」就能在右侧大预览里看这张壁纸的实际效果**（纯预览：不改动配置，也不影响保存），右上角会标出正在预览哪一张，点「回到站点默认预览」即可还原。设置写入 `blog/source/_data/appearance.json`，同样是「只有 admin 能改」：写权限由 GitHub 判断，账号还要在 `CONFIG.allowedLogins` 名单里，普通访客看到的只是构建好的静态页面，无法改动。访客的挑选只写进他们自己的 `localStorage`，不产生任何提交。详见「[头像、壁纸与网页图标](#头像壁纸与网页图标外观)」和「[访客自选背景](#访客自选背景wallpapers)」。
6. **构建状态**：显示 GitHub Actions 结果；删除/保存文章后跟踪本次提交，避免把旧任务误报为成功。构建完成后仍需等待 Pages 发布，源码删除不等于公开网页已下线。

每次保存都以你的身份提交到 `main`。`.github/workflows/deploy.yml` 里的 `publish-root` 任务会自动构建、检查并把生成的静态文件提交回仓库（提交信息带 `[skip ci]`，不会循环触发），分支发布模式下会显式请求 Pages 重建（因为 `GITHUB_TOKEN` 的提交不会自动触发新工作流），通常几分钟后生效。也就是说：**用后台写完文章不需要再手动跑 `publish:prepare`**；在本地改源码时仍然建议手动跑一次，方便先检查。

令牌安全：

- 令牌只保存在当前浏览器（默认 `sessionStorage`，关掉标签页就失效；勾选「记住」才写入 `localStorage`），点「退出登录」立即清除。
- 令牌只会发送到 `api.github.com`。本站没有后端，不存在第三方收集或统计。
- 真正的写权限由 GitHub 判断，没有仓库写权限的令牌改不了任何文件；账号名单只是界面上的额外一层限制。
- 建议为这个站点单独生成一个只对该仓库生效的细粒度令牌、设置较短有效期，不用时在 GitHub 上撤销。

### 删除文章说明

列表和编辑器都可删除文章，确认后才调用 GitHub DELETE API。取消/失败保留草稿；删除前校验文件版本，若文章被别人改过，会再次询问是否删除最新版本。连续点击不会重复提交；文件已不存在时同步清理列表。成功后列表立即更新，公开文章页、归档、标签和搜索结果要等自动构建、导出和 Pages 发布完成才会消失。删除最后一篇文章也是有效操作：首页、归档和空搜索索引仍可构建。

**自动发布工作流必须已合并到 `main`**：只在预览分支有修复，无法使旧 `main` 工作流更新根目录发布文件。工作流需要 `contents: write` 和 `pages: write`；构建状态里看到旧任务成功并不能证明本次删除已经发布。

删除回归测试：`cd blog && npm run test:delete`。使用模拟 API，不会删除真实仓库中的文章；包含隔离临时目录里的「删空博客 → 构建 → 检查 → 导出 → 清除旧静态页」测试。

### 防误触：没保存就关闭时会先提醒

在后台**编辑但还没保存**时，直接关闭标签页、刷新或点「返回站点」离开，浏览器会弹出自己的确认框（「离开网站吗？／你所做的更改可能未保存」），选取消就留在页面继续编辑。三处编辑都会触发提醒：

- 文章编辑器（改标题、正文、标签、置顶等任意字段；新建但未保存的文章算「新建的文章」）；
- 「外观」里的设置（含可选背景的增删与排序；只是**预览**某张背景不算改动）；
- 「个人简介」。

提醒靠「和最后一次读取／保存成功时的内容比对」判断，所以改完再改回原样、或保存成功后都不会再提醒；主题切换、背景预览这类只影响本机浏览器的操作也不会触发。**提示语本身由浏览器决定**：现代浏览器只显示自带的固定文案，网页无法自定义这句话，能自定义的只是「要不要提醒」。

回归测试：`cd blog && npm run test:appearance`（未保存时拦截、干净时放行、保存后解除，以及「只是预览一张背景不算改动」）。例如把 `?v=` 版本号忘掉时，浏览器会跑缓存里的旧 `admin.js`，这个功能就会「不生效」——版本号维护提示见上面。

## 头像、壁纸与网页图标（外观）

站点外观由**一个**数据文件决定：`blog/source/_data/appearance.json`。

```json
{
  "avatar": "https://cdn.luogu.com.cn/upload/usericon/1549479.png",
  "wallpaper": "https://cdn.luogu.com.cn/upload/image_hosting/b6e3lyp1.png",
  "favicon": "https://cdn.luogu.com.cn/upload/usericon/1549479.png",
  "wallpaperDim": 48,
  "wallpaperBlur": 0,
  "theme": "auto",
  "wallpapers": [
    {
      "id": "b6e3lyp1-116s2ku",
      "url": "https://cdn.luogu.com.cn/upload/image_hosting/b6e3lyp1.png",
      "label": "站点默认壁纸"
    }
  ]
}
```

| 字段 | 作用 |
| --- | --- |
| `avatar` | 个人卡片左上角的头像。留空则回到字母标记 `m_`。 |
| `wallpaper` | 站点默认壁纸（没挑过的访客看到的背景）。留空表示不使用壁纸（纯色深色背景）。 |
| `favicon` | 浏览器标签页图标；`type` 由扩展名推断，`.png` 时额外输出 `apple-touch-icon`。 |
| `wallpaperDim` | 壁纸压暗程度（0–95），数值越大壁纸越暗、正文越清晰。 |
| `wallpaperBlur` | 壁纸模糊半径（0–20 px）。0 表示不模糊。 |
| `theme` | 站点默认主题：`auto`（跟随系统偏好）/ `light`（浅色）/ `dark`（深色）。任何访客都能在页面上自己切换，详见「浅色模式」一节。 |

改法有两种：

1. **在线后台（推荐）**：`/admin/` →「外观」→ 填地址、拖滑块 →「保存并提交」。地址会先按下面的规则校验，不合法时直接拒绝提交；站内路径如果不在已上传的图片列表里，会先弹窗确认。**只有登录后台（拥有仓库写权限、且在 `allowedLogins` 名单里）的 admin 能改。**
2. **直接改源码**：编辑上面的 JSON，然后运行 `npm run publish:prepare`。手写 `wallpapers` 时只填 `url`（可再加 `label`）即可，`id` 会按地址自动推导；顺序就是访客看到的顺序。

### 访客自选背景（`wallpapers`）

站点右上角有一个「背景」按钮（快捷键 <kbd>B</kbd>），**所有访客**都能打开它换背景，入口不需要登录：

- **可选背景**：按钮里列出的就是 `wallpapers` 里的图片，由站长维护，访客点一下就换。
- **自定义外链**：访客也可以自己粘贴一个图片地址（`https://…` 外链或 `/images/…` 站内路径），同样只对自己生效。
- **压暗 / 模糊**：每个访客可以自己微调这两项，不影响别人。
- **纯色背景 / 恢复默认**：一键关掉壁纸或回到站点默认壁纸。

关键点是**只在访客自己的浏览器里生效**：选择保存在 `localStorage`（键名 `minxi.wallpaper`），

- 不会产生任何 GitHub 提交，`blog/` 源码和发布出来的静态文件都不变，其他人看到的站点也完全不受影响；
- 同一台设备换页面、刷新、下次再访问都会保持自己的选择；
- 清空浏览器数据或点「恢复站点默认」即可回到默认背景；
- 站长「下架」某张图后，选过它的访客会自动回到站点默认壁纸（他们的本地记录仍保留，图片重新上架就恢复）。

只有登录后台的 admin 能**上传**（一次可以选多张，超过 1 MB 的照片会在浏览器里自动压缩后上传）或**下架**：名单之外的访客连 GitHub 写权限都没有，改不了 `appearance.json`，也就改不了别人的可选列表。

实现上：`blog/client/wallpaper.js` 由 `npm run assets` 打包成 `/js/wallpaper.js`，在 `<head>` 里同步加载，因此访客上次选的背景会在第一次绘制前就应用，不会先闪一下默认壁纸；可选列表来自公开的只读文件 `/appearance.json`（`wallpapers` 字段）。页面加载完后会再读一次该文件，用来处理「图片被下架」的情况。地址校验与构建、后台共用 `blog/lib/appearance.cjs` 的同一套规则。

回归测试：`cd blog && npm run test:wallpaper`（清洗规则与 id 稳定性、访客端选择 / 恢复 / 下架回落 / 恶意标签与地址、后台加入·排序·下架·多图上传、以及恶意 `wallpapers` 的构建产物检查）。`npm run build && npm run check` 还会校验公开 JSON 与源码一致、站内路径确实存在，以及页面里有选择器的标记和脚本。

地址规则（前后台共用 `blog/lib/appearance.cjs` 的同一套代码）：只接受 `https://` / `http://` 外链或以 `/` 开头的站内路径；拒绝 `javascript:`、`data:`、协议相对地址 `//…` 以及含引号、括号、空白、反斜杠的字符串。渲染时地址只会出现在 HTML 属性（EJS 转义）和 `url("…")` 里，所以坏数据不可能变成可执行的样式或标记；即使把 JSON 改坏、写进恶意内容，构建也只会回落到默认值（回归测试见下）。

另外：

- 构建时会生成一份只读副本 `/appearance.json`（已清洗、无时间戳，避免无意义的提交差异），后台用它让管理页的图标与站点保持一致，访客端背景选择器也用它读取可选背景列表。
- 内置的默认图标仍是主题自带的 `/images/favicon.svg`，删掉配置或地址非法时自动回落到它。
- 头像是外链时可能被 CDN 防盗链拦住（图片打不开时卡片会自动显示字母标记 `m_`）。稳妥做法：在后台「图片」里上传图片（超 1 MB 的照片会自动压缩），再用「外观」里的「图片库」按钮填 `/images/文件名`。
- 壁纸只在配置了图片时才生效：`layout.ejs` 输出 `html[data-wallpaper="on"]` 与 `--wallpaper-image` / `--wallpaper-veil` / `--wallpaper-blur` 变量，样式在 `main.css` 结尾；页面顶栏会变得更透明，压暗层和暗角保证正文对比度。
- 外观相关回归测试：`cd blog && npm run test:appearance`（共享校验规则、后台面板、保存时的 SHA/分支/内容、拒绝恶意地址、以及「恶意 JSON → 构建产物无注入」）。`npm run build && npm run check` 还会校验构建产物与 `appearance.json` 一致。

### 浅色模式

深色仍然是默认外观（原有配色一行未改，两套主题互不干扰）。任何访客都能切换浅色：

- **顶栏按钮**：站点右上角多了一个小图标（太阳 / 月亮），点一下就在浅色和深色之间切换；按钮在没有 JavaScript 时不会出现，因此不会留下点不动的空按钮。
- **跟随系统**：没有主动选过的访客会跟随**站点默认主题**；站点默认值设为 `auto` 时再跟随系统的浅色 / 深色偏好，并在系统切换时实时跟着变。
- **管理后台**：`/admin/` 顶栏有「跟随系统 / 浅色 / 深色」三选一，同样只影响你自己的浏览器；想改全站默认值用「外观」里的**站点默认主题**（写入 `appearance.json` 的 `theme` 字段）。

关键点和背景选择一致：**只写访客自己的 `localStorage`（键名 `minxi.theme`）**——不提交、不影响其他访客、不需要登录。清掉这个键（或点「跟随系统」）就回到站点默认值。

实现上：`blog/client/theme.js` 由 `npm run assets` 打包成 `/js/theme.js`，在 `<head>` 中**先于样式表**同步加载，因此在第一帧就写好了 `html[data-theme]`，不会先闪一下深色；`<meta name="theme-color">` 也会跟着当前主题换成对应的底色。取自系统的偏好通过 `matchMedia('(prefers-color-scheme: light)')` 读取；页面加载完成后会再读一次公开的 `/appearance.json`，用来校正「站长改了默认值但访客的 HTML 仍是缓存版本」的情况。浅色样式是 `main.css` 结尾一个**带作用域**的覆盖块（`html[data-theme="light"] …`）加一组语义化令牌（`--bg` / `--panel` / `--line` / `--text` / `--accent`…），深色规则保持原样；壁纸的压暗层走 `--veil-rgb` 变量，浅色下换成提亮层，正文对比度仍然有保障。

回归测试：`cd blog && npm run test:theme`（主题值清洗与回落、访客选择 / 跟随系统 / 站点默认值三级优先级、首次绘制不闪烁、后台三选一与 `theme` 字段写回、恶意 `theme` 值的构建产物检查）。此外还守着两件事：**深色里每一处硬编码颜色都必须有对应的浅色覆盖**，以及**浅色下不允许残留深色面板**——改动配色后如果漏了覆盖，测试会直接列出缺哪一条。

## 数学公式与实时预览

在 `/admin/` 中新建或编辑文章，默认左侧写 Markdown、右侧看实时预览。小屏幕分屏会改为上下排列，也可以点击「预览」只看渲染结果。预览不会提交内容；仍需点击「保存并提交」才会发布。

行内公式（中文前后不必留空格）：

```markdown
时间复杂度是 $O(n \log n)$，第 $i$ 项为 $a_i$。
```

独立公式建议前后留一个空行，`$$` 各占一行：

```markdown
$$
\sum_{i=1}^{n} i = \frac{n(n+1)}{2}
$$
```

代码块和行内代码中的 `$` 不会当成公式。公式语法错误会显示错误内容，不会中断写作或构建；不支持的命令需要改成 KaTeX 支持的写法。KaTeX 的危险 HTML/URL 命令未启用。

预览使用 `marked` + `marked-katex-extension`，正式页通过同一公式扩展接入原来的 Hexo Markdown 渲染器，保留代码高亮和目录。公式选项统一在 `blog/lib/math-options.cjs` 中维护。`npm run build` / `npm run dev` 会自动生成预览脚本和本地字体，不需要手动下载 CDN 文件。

回归测试：`cd blog && npm run test:preview`（公式、代码块、错误语法、HTML 清洗、真实编辑器交互及 Hexo 完整渲染流程）。

## Markdown 折叠框

支持类似洛谷的 `:::info[标题]` 和 `:::success[标题]` 写法。蓝色 info 提示框与绿色 success 成功框默认折叠，点击标题或用键盘 Enter / 空格展开，再点击即可收起，不需要 JavaScript。

```markdown
:::info[思路提示]

这里可以写 **加粗**、列表、图片、代码块和 $O(n \log n)$ 公式。

:::

:::success[结论]

这道题已经 AC 了！

:::
```

方括号必须保留；`:::info[]` / `:::success[]` 的默认标题分别为「提示」/「成功」。开头与结尾各占一行，结尾都是 `:::`。支持嵌套折叠框。代码块中的这些符号不会被转换；漏写结尾时保留原文，不吞掉后续内容。标题作为普通文字显示，不执行 HTML。

后台编辑器有「插入折叠框…」菜单，支持即时预览与点击展开。预览和正式文章共用 `blog/lib/fold-containers.cjs`，样式随主题深色配色。实时预览中点击标题即可展开/收起；修改正文或文章标题时保留已有折叠框的展开状态与预览滚动位置，切换视图不会重载预览。打开另一篇文章会重置状态；修改折叠框自身的标题时，该框按新折叠框处理。

## 构建与检查

```bash
cd blog
npm run build
npm run check
```

构建输出为 `blog/public/`，已被 Git 忽略。检查涵盖页面标题、站点信息、内部链接、搜索索引，以及外观配置与构建产物（图标、头像、壁纸变量、可选背景列表）的一致性——包括站内壁纸路径确实存在，以及页面里有「背景」选择器的标记与脚本。`npm run build` 会先清理旧输出，避免删除文章后残留旧页面。

## 正式网站发布

网站地址：**https://lscminxi.github.io/**。

目前沿用仓库已经开启的 **Deploy from a branch → main → / (root)**。当前 GitHub 集成无权修改 Pages 设置，因此直接将生成的静态页面随源码一起提交，由 GitHub 内置 Pages 工作流发布，不需要额外的令牌或设置。

### 发布新文章或修改主题

修改 `blog/` 下的源码，然后运行：

```bash
cd blog
npm run publish:prepare
```

这条命令会构建、检查，并将静态文件同步到仓库根目录。将**源码和根目录的生成文件一起提交**，通过 PR 合并到 `main`，GitHub Pages 会自动发布。

如果只提交了源码而忘记导出，`main` 上的 `publish-root` 工作流也会自动构建并把生成文件补提交一次（见「在线管理后台」）。

- 不要直接编辑根目录的 HTML、CSS、JS；下次构建会覆盖它们。
- `.blog-output.json` 记录受管理的生成文件，供脚本清理被删除的文章和旧资源使用。不要手动篡改清单。
- 导出脚本只清理清单中的静态文件，不递归删除目录，不碰源码或 `.git`。
- `.nojekyll` 告诉 GitHub Pages 直接发布静态页面，无需再使用 Jekyll 处理。
- **仅修改 Markdown 而未执行 `publish:prepare`，不会更新当前根目录发布的正式页面。**

### 可选：以后切换为纯源码自动部署

如果希望写文章后不再手动导出，仓库管理员可打开 **Settings → Pages → Source**，选择 **GitHub Actions**。接着在 **Actions → Build and deploy blog** 中选择 `main`，点击 **Run workflow**。

工作流会自动检测 Pages 的发布模式：

- PR：构建与检查，不部署。
- `main` + 分支发布模式：构建与检查；正式发布交给 GitHub 内置 Pages 工作流。
- `main` + GitHub Actions 模式：构建、检查并直接部署 `blog/public/`。
- 其他分支手动运行：只构建，不部署。

启用 GitHub Actions 模式后，可以只提交源码，无需再运行 `publish:prepare`。工作流使用 GitHub 自动提供的令牌，不需要个人令牌。

原示例文章 `/2026/09/05/hello-world/` 的地址已保留。

## 目录结构

```text
.github/workflows/deploy.yml   # 构建、检查、自动导出静态文件、Pages 发布
blog/
  _config.yml                 # 名称、作者、网址、语言等
  package.json                # 命令与依赖
  package-lock.json           # 可重复安装的锁定版本
  scaffolds/post.md           # 新文章模板
  lib/                        # 折叠框、公式选项与外观规则（Hexo 与浏览器共用）
  client/                     # 浏览器端入口：后台 preview/appearance、访客端 wallpaper/theme
  tools/check.mjs             # 构建产物检查
  tools/export.mjs            # 同步静态产物到现有 Pages 根目录
  tools/appearance.test.mjs   # 外观（头像 / 壁纸 / 图标）回归测试
  tools/wallpaper.test.mjs    # 访客自选背景（壁纸库、上传 / 下架）回归测试
  tools/theme.test.mjs        # 深浅主题（切换、覆盖完整性、后台默认值）回归测试
  source/
    _posts/                   # Markdown 文章
    _data/appearance.json     # 头像 / 壁纸 / 网页图标 / 可选背景（后台「外观」写入）
    about/index.md            # 关于我（个人简介）
    admin/                    # 在线管理后台：index.html / admin.css / admin.js
                              # （注意：admin 目录被 skip_render 跳过，页面里不要写 EJS 标签）
    tags/index.md             # 标签入口
    404.md                    # 自定义 404
  themes/minxi/
    _config.yml               # GitHub 个人主页链接
    layout/                   # EJS 页面模板
    scripts/helpers.js        # 阅读时长与搜索索引
    scripts/appearance.js     # 读取 _data/appearance.json：注入图标/头像/壁纸并生成 /appearance.json
    source/css/main.css       # 主题与响应式样式
    source/js/main.js          # 搜索、筛选、复制、目录、返回顶部
    source/js/wallpaper.js     # 访客端背景选择器（npm run assets 生成，勿手改）
    source/js/theme.js         # 访客端深浅主题（npm run assets 生成，勿手改）
    source/images/favicon.svg
```

修改名称、简介、署名：`blog/_config.yml`。修改个人介绍：`blog/source/about/index.md`，或者直接在 `/admin/` 后台的「个人简介」里改。修改头像、壁纸、网页图标、访客可选背景：`blog/source/_data/appearance.json`，或者直接在 `/admin/` 后台的「外观」里改。修改主题色：`main.css` 中的 `:root` 变量（深色）与紧随其后 `html[data-theme="light"]` 的浅色令牌。修改站点默认主题：`appearance.json` 的 `theme` 字段，或者后台「外观」→「站点默认主题」。修改后台允许的账号、仓库或分支：`blog/source/admin/admin.js` 顶部的 `CONFIG`。

## 安全与隐私

站点是纯静态页面，无账号系统、无统计追踪。头像、壁纸、网页图标和访客可选背景列表同样只能由 `/admin/` 的 admin 修改（写权限由 GitHub 判定）。访客可以自选背景和深浅主题，但这些选择只写进自己浏览器的 `localStorage`，不会上传、不会提交、不会影响其他访客——站点的公开文件始终保持不变。全文搜索下载公开的 `search.json`，不要在已发布文章中写私密信息。代码复制优先使用 HTTPS 下的 Clipboard API，不可用时会选中代码并提示手动复制。`/admin/` 后台同样没有账号系统：它只在你自己的浏览器里持有 GitHub 令牌并直接调用 `api.github.com`，详见「在线管理后台」一节。

2026-10-14 的 `npm audit` 检测到 Hexo 上游构建依赖的 9 条报告（7 high、2 moderate），对应 `braces` / `sprintf-js` 的拒绝服务问题及其依赖链。`npm audit fix` 无法在当前兼容版本下消除；工具建议的 `--force` 会把 Hexo 降级到旧主版本，因此未执行。依赖仅运行于本地或 CI 构建，未打包进公开页面，但不要使用不可信的模板、插件或配置；来自外部的 PR 应在隔离的 GitHub runner 中构建，且不能获得发布权限。后续升级 Hexo 后请重新运行审计。
