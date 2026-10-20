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

1. **登录（仅站长，两种验证方式）**：方式一，GitHub 授权：站长在前台用 GitHub OAuth 登录后点「进入后台」（或直接打开 `/admin/` 点「使用 GitHub 登录进入后台」），会再走一次 GitHub 授权——这一次才申请公共仓库写权限（`public_repo`），普通访客登录只有 `read:user`；授权经 oauth-worker 换取后暂存于当前标签页的 `sessionStorage`。方式二，粘贴令牌：在 `/admin/` 登录页粘贴站长自己的 GitHub Personal Access Token（经典令牌勾 `repo`，或细粒度令牌给本仓库 Contents 读写）；不勾「记住此设备」时只存当前标签页会话，勾选后写进本设备 `localStorage`（键名 `minxi.admin.token`）下次自动验证。**两种方式的验证标准完全相同**：后台都通过 GitHub API `/user` 确认账号在允许名单里（目前只允许 `lscminxi`，大小写不敏感），然后检查该授权/令牌是否有仓库写权限。不是站长的账号在前台点「进入后台」或直接访问 `/admin/` 都会看到「你无权限进入」。身份接口不可用、账号信息缺失或 `CONFIG.allowedLogins` 为空时都会拒绝，不会回退到仓库所有者账号。
2. **文章**：列出 `blog/source/_posts/` 下全部文章，可新建、在线编辑（标题、文件名、日期、分类、标签、描述、强调色、示例标记、Markdown 正文）、实时删除。编辑器支持「编辑 / 分屏 / 预览」，正文输入后自动更新预览，无需保存；提供「插入公式」按钮。预览在本地浏览器中生成，不调用 GitHub；预览用沙箱和 HTML 清洗阻止脚本执行。代码高亮与目录以发布页为准。改文件名会自动「新建 + 删除旧文件」。
3. **图片**：上传到 `blog/source/images/`（GitHub Contents API 单文件上限约 1 MB），可复制 `/images/xxx.png` 写法、插入正文或删除。超过 1 MB 的 JPG / PNG / WebP / AVIF 会在浏览器里先等比缩小（长边 ≤ 2400）并重新编码，再上传压缩后的版本（照片转 WebP，PNG 保留透明）；GIF / SVG 无法可靠压缩，仍会提示超限。
4. **个人简介**：直接编辑 `blog/source/about/index.md`。
5. **外观**：修改**头像**、**页面壁纸（站点默认）**、**网页图标**和**站点默认主题**（`auto` / `light` / `dark`，访客随时能自己切换），可调壁纸压暗程度与模糊半径，并有实时预览；下面的「可选背景」列表就是访客能自选的壁纸库，可以**一次上传多张图片**、填外链、调整顺序、**设为默认壁纸**或**下架**；**点缩略图或「预览」就能在右侧大预览里看这张壁纸的实际效果**（纯预览：不改动配置，也不影响保存），右上角会标出正在预览哪一张，点「回到站点默认预览」即可还原。设置写入 `blog/source/_data/appearance.json`，同样是「只有 admin 能改」：写权限由 GitHub 判断，账号还要在 `CONFIG.allowedLogins` 名单里，普通访客看到的只是构建好的静态页面，无法改动。访客的挑选只写进他们自己的 `localStorage`，不产生任何提交。详见「[头像、壁纸与网页图标](#头像壁纸与网页图标外观)」和「[访客自选背景](#访客自选背景wallpapers)」。
6. **构建状态**：显示 GitHub Actions 结果；删除/保存文章后跟踪本次提交，避免把旧任务误报为成功。构建完成后仍需等待 Pages 发布，源码删除不等于公开网页已下线。

每次保存都以你的身份提交到 `main`。`.github/workflows/deploy.yml` 里的 `publish-root` 任务会自动构建、检查并把生成的静态文件提交回仓库（提交信息带 `[skip ci]`，不会循环触发），分支发布模式下会显式请求 Pages 重建（因为 `GITHUB_TOKEN` 的提交不会自动触发新工作流），通常几分钟后生效。也就是说：**用后台写完文章不需要再手动跑 `publish:prepare`**；在本地改源码时仍然建议手动跑一次，方便先检查。

授权安全：

- 后台授权默认只保存在当前标签页的 `sessionStorage`（键名 `minxi.admin.oauth-token`），关掉标签页或点「退出登录」立即清除；只有用粘贴令牌方式并勾选「记住此设备」时，才会把令牌写入本设备 `localStorage`（键名 `minxi.admin.token`），退出登录同样会清掉。普通前台登录的授权确认身份后立即丢弃，不保存。
- 授权只会发送到 `api.github.com`。本站没有后端，不存在第三方收集或统计；访客随时可在 GitHub 的 Applications 设置里撤销本站授权。
- 管理后台只接受 `CONFIG.allowedLogins` 中的 GitHub 账号（当前仅 `lscminxi`），并要求这次授权具备该仓库的写权限；身份验证失败时一律拒绝。
- **权限边界说明**：GitHub Pages 是纯静态站点，账号名单是后台登录页的访问门槛，不是服务端授权系统。已拥有仓库写权限的人仍可绕过网页直接调用 GitHub API 或在 GitHub 上提交；若要取消他们的实际写权限，需要在 GitHub 仓库设置中移除对应的协作者/组织写权限。

### 删除文章说明

列表和编辑器都可删除文章，确认后才调用 GitHub DELETE API。取消/失败保留草稿；删除前校验文件版本，若文章被别人改过，会再次询问是否删除最新版本。连续点击不会重复提交；文件已不存在时同步清理列表。成功后列表立即更新，公开文章页、归档、标签和搜索结果要等自动构建、导出和 Pages 发布完成才会消失。删除最后一篇文章也是有效操作：首页、归档和空搜索索引仍可构建。

**自动发布工作流必须已合并到 `main`**：只在预览分支有修复，无法使旧 `main` 工作流更新根目录发布文件。工作流需要 `contents: write` 和 `pages: write`；构建状态里看到旧任务成功并不能证明本次删除已经发布。

删除回归测试：`cd blog && npm run test:delete`。使用模拟 API，不会删除真实仓库中的文章；包含隔离临时目录里的「删空博客 → 构建 → 检查 → 导出 → 清除旧静态页」测试。

后台权限回归测试：`cd blog && npm run test:admin-auth`。使用模拟 GitHub API，验证只有允许的账号且这次 GitHub 授权有仓库写权限时能进入；其他账号、身份接口失败/缺失、空名单、无写权限都会被拒绝，且 localStorage 里的旧令牌键会被忽略并清除、绝不能恢复会话。该测试也会在 GitHub Actions 的构建检查中自动运行。

### 防误触：没保存就关闭时会先提醒

在后台**编辑但还没保存**时，直接关闭标签页、刷新或点「返回站点」离开，浏览器会弹出自己的确认框（「离开网站吗？／你所做的更改可能未保存」），选取消就留在页面继续编辑。三处编辑都会触发提醒：

- 文章编辑器（改标题、正文、标签、置顶等任意字段；新建但未保存的文章算「新建的文章」）；
- 「外观」里的设置（含可选背景的增删与排序；只是**预览**某张背景不算改动）；
- 「个人简介」。

提醒靠「和最后一次读取／保存成功时的内容比对」判断，所以改完再改回原样、或保存成功后都不会再提醒；主题切换、背景预览这类只影响本机浏览器的操作也不会触发。**提示语本身由浏览器决定**：现代浏览器只显示自带的固定文案，网页无法自定义这句话，能自定义的只是「要不要提醒」。

编辑器左上角的「← 返回列表」是唯一一处**站内**会丢掉草稿的操作，所以它有自己的一层确认：有未保存改动时先弹「还有未保存的修改」（写明是哪一篇），点「放弃修改」才真的回到列表，点「取消」就留在编辑器、草稿一个字都不会少；没有改动时不会多问一句。如果某篇文章还没读完就点了返回，因为这时候没有内容可丢，不会弹框，迟到的响应也会被丢弃（不会填进已经关掉的编辑器）。

回归测试：`cd blog && npm run test:appearance`（未保存时拦截、干净时放行、保存后解除，「只是预览一张背景不算改动」，以及「← 返回列表」的取消/放弃/无改动/新建文章/读取中离开五种情形）。例如把 `?v=` 版本号忘掉时，浏览器会跑缓存里的旧 `admin.js`，这个功能就会「不生效」——版本号维护提示见上面。

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
- **保存壁纸（登录后）**：用 GitHub 登录后，点「保存当前壁纸」可以把当前图片连同压暗 / 模糊存进「我保存的壁纸」（最多 24 张），之后点缩略图即可再次使用，也可单独删除。未登录点保存会先弹出登录提醒。

关键点是**只在访客自己的浏览器里生效**：未登录时选择保存在 `localStorage`（键名 `minxi.wallpaper`）；登录后，当前选择与保存列表按 GitHub 账号小写名分键保存（`minxi.wallpaper.user.<账号>`、`minxi.wallpaper.saved.<账号>`），同一设备换账号不会串号。本站是静态站点、没有账号后端，所以这里的「账号保存」不会跨设备同步，也不会上传任何内容。

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

### 顶部导航栏（小箭头与自动展开）

站点顶栏平时收在页面外面，靠**指针位置**自动滑出：

- **顶部 14px 的感应区**：鼠标移到页面最上方就会拉出顶栏，指针离开后约 0.7 秒自动收起（留一点缓冲，方便顺着滑进顶栏）。指针停在顶栏上时保持展开。
- **最上方的小箭头**：顶栏收起时页面正中间最上沿有一个半透明的小箭头（56×16、只有箭头本身，没有底衬／色块；颜色跟随主题强调色，悬停时更亮、也会更「探出来」一点），提示「上面还有导航栏」。鼠标悬停即可展开；触摸设备点一下展开并保持，再点一下收起。顶栏展开时它会淡出，不会挡住内容。
- **键盘 / 触摸**：<kbd>Tab</kbd> 焦点进入顶栏会自动滑出，<kbd>Esc</kbd> 收起；点顶栏以外的位置、指针移出窗口、页面切到后台都会立即收起。

展开状态由 `main.js` 在 `html` 上切换 `header-open` 类，而**不是**用 CSS 的 `:hover` 判断：元素滑入滑出时浏览器不一定及时更新 `:hover`，之前的写法会因此「鼠标快速划过一下就卡住不收起」。`:hover` 只保留在 `html:not(.header-js)`（即没有 JavaScript 时）作为兜底，`:focus-within` 则始终有效。改这两处前请先读一下测试里的说明。

回归测试：`cd blog && npm run test:nav`（用 jsdom 复现「快速划过触发位置」「指针静止停在顶栏上」「没有 `pointermove` 事件」「鼠标点箭头」「触摸点箭头」等场景，并检查样式表确实由类驱动、小箭头是**不带底衬的裸箭头**（回归时会失败）、尊重 `prefers-reduced-motion`）。`npm run build && npm run check` 也会校验构建产物里有小箭头与版本号，并**拒绝任何未加 `html:not(.header-js)` 限定的顶栏 `:hover` 规则**。


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

## 函数图像与可视化图

两种围栏代码块，构建时先生成静态 SVG 作为无脚本回退，正式文章和后台实时预览里都能看到；正式文章页与后台编辑预览都可交互（拖动平移、滚轮/双指缩放），后台编辑器有「插入函数图像 / 插入可视化图」按钮。每行一条指令，写错的行会被忽略，不会让文章构建失败。

**函数图像**（` ```plot `）：画函数曲线、标点、连点成线。

    ```plot
    title: 抛物线与正弦
    f: x^2 - 2x + 1 ; color=red ; label=抛物线
    f: sin(x) ; color=#0f7a6a
    points: (1, 0), (2, 1) ; connect=true ; color=blue ; label=数据点
    x: -3, 5
    y: -2, 10
    grid: on
    ```

- `f:` 一行一个函数（最多 8 个，没写颜色自动轮换配色）。表达式只支持 `x`、数字、`+ - * / ^`、括号、隐式乘法（`2x`、`2(x+1)`）和 `sin cos tan asin acos atan sqrt abs exp ln log log10 floor ceil round`，常量 `pi / e / tau`。用手写解析器求值、绝不用 `eval`，写错的表达式整行跳过。不连续的函数（如 `1/x`）会自动在间断处断线。
- `points:` 描点（`(x, y)` 可写多个）；加 `connect=true` 连成折线；`line:` 是简写（默认连线、不画点，除非再写 `size=4`）。
- 可选项都跟在 `; ` 后面：`color=`（英文/中文颜色名或 `#rrggbb`）、`label=`、`width=`（曲线粗细）、`dash=true`（虚线）。
- `x:` / `y:` 定坐标范围（不写 `y:` 时按曲线自动）；`grid: off` 关网格；`title:` 显示图注。
- 点坐标、交点和方程默认显示：明确写出的点旁有带圆角背景框的 `(x, y)` 坐标标签；曲线之间、曲线/线段之间、线段之间以及与坐标轴的交点用黄色圆点标出（描点同为圆点，悬停/点击选中时圆点会微微放大，坐标按固定基准求解，放大、缩小、平移前后同一点坐标不变）；图下方列出函数方程和每段连线的方程（竖直线写成 `x = …`）。可用 `coords: off`、`intersections: off`、`equations: off` 分别关闭，也可在图上方的工具栏里临时开关。
- 正式文章页可交互：抓着画布拖动平移（内容跟随指针方向），滚轮、双指或工具栏按钮缩放，双击或「重置」恢复初始范围；指针移到点、交点、曲线或线段上，跟随鼠标的坐标显示框与底部读数框会显示坐标与方程，鼠标落在直线上时对应直线会微微加粗；聚焦图像后可用方向键平移、`+` / `-` 缩放、`0` 重置。`interactive: off` 可关闭交互（仍保留静态图）。后台编辑预览同样可拖动/缩放/开关坐标交点方程：预览 iframe 本身保持零脚本（沙箱不带 `allow-scripts`），交互监听器由后台父页面挂到同源 iframe 文档上（`MinxiPreview.enhance`），且改稿重渲染时会按顺序恢复每张图的平移/缩放范围与开关状态；预览配色跟随后台当前深/浅主题。

**可视化图**（` ```graph `）：点和边，适合画图论、状态机、流程关系。

    ```graph
    title: 示例图
    directed: true
    node: A ; label=起点 ; color=red
    node: B ; x=120 ; y=40
    node: C
    edge: A -> B ; label=一步 ; color=blue
    edge: B -> C
    edge: C -- A ; dash=true
    ```

- `directed: true` 开有向图（默认无向）。`edge: A -> B` 是有向边（带箭头），`edge: A -- B` 是无向边；也可以把 `A -> B` 单独写一行。同一对点连多条边会自动用弧线错开，自环（`A -> A`）画在点上方。
- `node: 点名 ; label=显示名 ; color=颜色 ; x= ; y= ; size=` 建点染色（点默认半径 20，`size=` 可调 10–34；函数图的描点默认半径 5）。**不写 x/y 的点自动按圆环布局**，边里引用到未声明的点会自动建点，最多 60 个点 / 120 条边。
- 点和边的标注、标题都按纯文字转义输出，不会执行 HTML。
- 正式文章页同样可拖动平移、滚轮/双指/按钮缩放和双击重置；顶点为深色描边圆点，悬停/选中时出现外圈，边在悬停/选中时加粗；把指针移到顶点上只显示点名、不显示坐标，移到边上会显示边的端点与标注。

实现上：`blog/lib/plots.cjs` 是正式渲染（`blog/scripts/katex.js`）与实时预览（`blog/client/preview.js`）共用的一份 Marked 扩展；正式文章页的交互在 `blog/client/plot.js`（打包为主题 `js/plot.js`），它用同一份解析器按当前视图范围重绘曲线、重算交点；样式在 `main.css` 的 `.md-plot / .md-graph`，网格/坐标轴走专用的 `--plot-grid / --plot-axis` 主题变量，深浅色都保持清楚可见。回归测试：`cd blog && npm run test:plots`（表达式安全与求值、曲线断线、坐标/交点/方程、缩放/平移交互、箭头/自环/自动布局、两处渲染一致、标注转义、未闭合围栏保留原文）。

## 访客登录与评论 / 点赞

站点右上角现在常驻一个 **「登录」** 按钮（登录后显示 GitHub 头像与用户名），所有人都能用，不再藏着：

### 登录（GitHub OAuth，唯一方式）

1. 点「登录」→「使用 GitHub 登录」；
2. 在 GitHub 官方授权页点 Authorize（只申请 `read:user`，读取用户名与头像）；
3. 自动跳回博客并保持登录，随后可以评论和点赞。

本站不接触访客的 GitHub 密码，换到的令牌用完即弃、不保存；会话只写进访客自己浏览器的 `localStorage`（键名 `minxi.auth.user`）。点头像可打开账号面板，可退出登录或尝试「进入后台」。

> 已删除早期的「GitHub 用户名 + 图形验证码、仅查账号是否存在」备用登录：它证明不了账号归属，现在登录只有 GitHub OAuth 一条路。若 OAuth 配置缺失，弹窗只会提示「GitHub 登录尚未配置完成，暂时无法登录」，不会退回任何弱校验方式。

### GitHub OAuth 是怎么接上的（免费小后端）

静态站无法保管 OAuth 的 `client_secret`（也不能直连 GitHub 的换令牌接口），所以仓库备了一个几十行的 Cloudflare Worker（`oauth-worker/`，免费、不存令牌）替站点换令牌。配置三步（详细图文版见 [`oauth-worker/README.md`](oauth-worker/README.md)；本站已配置完成，此节备查）：

1. GitHub 建 OAuth App（回调地址填 `https://lscminxi.github.io/auth/callback/`），拿到 Client ID 与 Client Secret；
2. Cloudflare 部署 `oauth-worker/worker.js`，把 Client ID、Client Secret（用 Secret 类型）、`ALLOWED_ORIGINS=https://lscminxi.github.io` 填进环境变量，记下 `*.workers.dev` 地址并打开 `/health` 看到 `{"ok":true}`；
3. `blog/themes/minxi/_config.yml` 的 `auth.provider` 为 `oauth` 且填好 `client_id` 与 `worker_url`，再 `npm run publish:prepare` 发布。配置没填全时登录暂不可用（见上），不会回落到弱校验登录；本地/预览域名因回调地址不匹配同样无法完成 OAuth，请到正式站验收。

### 谁能进后台

- **只有站长 `lscminxi` 能进后台**：站长可用两种方式进入：点「进入后台」走一次带仓库写权限的 GitHub 授权，或在 `/admin/` 粘贴自己的 GitHub 令牌；两者都由 `/admin/` 经 `/user` 确认账号在 `allowedLogins` 名单里、且有仓库写权限才放行；普通访客的只读登录不授予任何后台权限。
- 非站长访客在前台点「进入后台」，或已用访客身份登录后直接打开 `/admin/`，都会看到 **「你无权限进入」**（后台会写明当前访客账号与只有站长能进）。站长本人若先用别的访客名登录，可在该页点「我是站长，使用 GitHub 登录」重新授权，不会被锁死。
- 授权确认时若账号不在名单里，错误信息同样以「你无权限进入后台：账号 @… 不是站长」开头。

> 安全说明：访客身份由 GitHub OAuth 授权确认（经 oauth-worker 换令牌后向 GitHub 核实），但它只用于评论/点赞署名，不是权限边界——真正的权限边界只有后台那一层（带写权限的 GitHub 授权 + 允许名单 + GitHub 仓库写权限），这也是它保持不变的原因。

### 每篇文章的评论与点赞

- 每篇文章底部都有 **点赞** 按钮和 **评论区**：登录后可点赞（再点一次取消，只有自己点过的才算数）、发表评论（纯文本、最多 500 字，始终按纯文本渲染，不会执行 HTML）、删除自己的评论；站长的评论带「站长」标记。
- **未登录时点点赞、点评论框或提交评论，会弹出「请先登录」提醒**，点「去登录」直接打开上面的 GitHub 登录；登录成功后可继续评论。
- 当前默认是 **本地模式**：评论与点赞保存在访客自己的浏览器（`localStorage` 键名 `minxi.comments.v1`，按文章地址分开），仅本机可见、不上传、不产生 GitHub 提交——这是静态站点零配置下能做到的范围，页面上也会如实标注。

### 想要全站共享评论时：启用 Giscus（可选）

评论要让所有访客互相看见，需要一个外部托管。推荐 Giscus（基于 GitHub Discussions，访客在 Giscus 里用 GitHub 账号登录评论，点赞即 GitHub 的 reaction）：

1. 仓库 **Settings → General → Features** 勾选 **Discussions**；
2. 打开 https://github.com/apps/giscus 安装到 `lscminxi/lscminxi.github.io`；
3. 打开 https://giscus.app 按页面提示选好仓库与分类，取得 `data-repo-id` 与 `data-category-id`；
4. 把 `blog/themes/minxi/_config.yml` 的 `comments.provider` 改成 `giscus`，并填好 `comments.giscus.repo_id` / `category_id`（`repo` 已预填本站仓库）；
5. 重新构建发布（`npm run publish:prepare`）。没填全时主题会自动回落到本地模式，不会显示坏掉的评论区。

回归测试：`cd blog && npm run test:auth`（OAuth 授权地址与防伪造 state、回调换令牌全流程、验证码/用户名弱登录已被移除、无配置时不给备用登录、未登录弹窗拦截、登录后评论/点赞与防注入渲染、非站长在前台与 `/admin/` 的无权限提示、站长令牌后门不受访客会话影响）。`npm run build && npm run check` 还会校验每页都有登录按钮与三个弹窗、文章页有评论区、后台有无权限页，并断言构建产物里不存在验证码登录的标记。

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
  tools/nav.test.mjs          # 顶栏自动展开 / 小箭头（含「滑过就卡住」回归）测试
  tools/plots.test.mjs        # 函数图像 / 可视化图（表达式安全、SVG 生成）回归测试
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

修改名称、简介、署名：`blog/_config.yml`。修改个人介绍：`blog/source/about/index.md`，或者直接在 `/admin/` 后台的「个人简介」里改。修改头像、壁纸、网页图标、访客可选背景：`blog/source/_data/appearance.json`，或者直接在 `/admin/` 后台的「外观」里改。修改主题色：`main.css` 中的 `:root` 变量（深色）与紧随其后 `html[data-theme="light"]` 的浅色令牌。修改站点默认主题：`appearance.json` 的 `theme` 字段，或者后台「外观」→「站点默认主题」。修改后台允许的账号、仓库或分支：`blog/source/admin/admin.js` 顶部的 `CONFIG`（当前仅允许 `lscminxi`；允许名单为空时会拒绝所有人登录）。

## 安全与隐私

站点是纯静态页面，无统计追踪；访客可用 GitHub OAuth 登录后评论/点赞（详见「访客登录与评论 / 点赞」），后台仍只有站长能进。头像、壁纸、网页图标和访客可选背景列表同样只能由 `/admin/` 的 admin 修改（后台只接受允许名单中的 GitHub 账号，且进入后台的那次授权必须有仓库写权限）。访客可以自选背景和深浅主题，但这些选择只写进自己浏览器的 `localStorage`，不会上传、不会提交、不会影响其他访客——站点的公开文件始终保持不变。全文搜索下载公开的 `search.json`，不要在已发布文章中写私密信息。代码复制优先使用 HTTPS 下的 Clipboard API，不可用时会选中代码并提示手动复制。`/admin/` 没有服务端账号系统：它只在当前标签页会话里持有进入后台时取得的 GitHub 授权并直接调用 `api.github.com`。账号名单能限制网页后台登录，但不能取代 GitHub 仓库协作者权限；详见「在线管理后台」一节。

2026-10-14 的 `npm audit` 检测到 Hexo 上游构建依赖的 9 条报告（7 high、2 moderate），对应 `braces` / `sprintf-js` 的拒绝服务问题及其依赖链。`npm audit fix` 无法在当前兼容版本下消除；工具建议的 `--force` 会把 Hexo 降级到旧主版本，因此未执行。依赖仅运行于本地或 CI 构建，未打包进公开页面，但不要使用不可信的模板、插件或配置；来自外部的 PR 应在隔离的 GitHub runner 中构建，且不能获得发布权限。后续升级 Hexo 后请重新运行审计。
