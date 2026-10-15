# Minxi 的 blog

> 一个幼儿园小班水平的 Oier · lsc_minxi 的 OI 学习记录

基于 **Hexo 8 + 自定义 Minxi 深色主题 + GitHub Pages**。无需数据库，文章使用 Markdown 编写。主题不依赖外部字体、图片 CDN 或前端框架。

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
- 题解中的数学表达当前使用普通文本或代码排版；未启用 LaTeX 渲染器。

## 在线管理后台（`/admin/`）

后台页面地址：**https://lscminxi.github.io/admin/**。导航里没有入口，页面也带 `noindex`，不会出现在搜索结果里。

站点是纯静态的 GitHub Pages，没有自己的服务器，所以后台**不保存任何账号密码**：

1. **登录**：粘贴你自己的 GitHub Fine-grained Personal Access Token（Repository access 只选 `lscminxi/lscminxi.github.io`，权限 `Contents: Read and write`）。浏览器直接用它调用 `api.github.com` 校验仓库写权限，并检查账号是否在 `admin.js` 的 `CONFIG.allowedLogins` 名单里（默认只有 `lscminxi`）。
2. **文章**：列出 `blog/source/_posts/` 下全部文章，可新建、在线编辑（标题、文件名、日期、分类、标签、描述、强调色、示例标记、Markdown 正文）、实时删除。改文件名会自动「新建 + 删除旧文件」。
3. **图片**：上传到 `blog/source/images/`（单文件 ≤ 1 MB，GitHub Contents API 的限制），可复制 `/images/xxx.png` 写法、插入正文或删除。
4. **个人简介**：直接编辑 `blog/source/about/index.md`。
5. **构建状态**：显示最近一次 GitHub Actions 结果，保存后每 10 秒自动刷新到发布完成。

每次保存都以你的身份提交到 `main`。`.github/workflows/deploy.yml` 里的 `publish-root` 任务会自动构建、检查并把生成的静态文件提交回仓库（提交信息带 `[skip ci]`，不会循环触发），GitHub Pages 随后发布，通常 1–2 分钟生效。也就是说：**用后台写完文章不需要再手动跑 `publish:prepare`**；在本地改源码时仍然建议手动跑一次，方便先检查。

令牌安全：

- 令牌只保存在当前浏览器（默认 `sessionStorage`，关掉标签页就失效；勾选「记住」才写入 `localStorage`），点「退出登录」立即清除。
- 令牌只会发送到 `api.github.com`。本站没有后端，不存在第三方收集或统计。
- 真正的写权限由 GitHub 判断，没有仓库写权限的令牌改不了任何文件；账号名单只是界面上的额外一层限制。
- 建议为这个站点单独生成一个只对该仓库生效的细粒度令牌、设置较短有效期，不用时在 GitHub 上撤销。

## 构建与检查

```bash
cd blog
npm run build
npm run check
```

构建输出为 `blog/public/`，已被 Git 忽略。检查涵盖页面标题、站点信息、内部链接和搜索索引。`npm run build` 会先清理旧输出，避免删除文章后残留旧页面。

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
  tools/check.mjs             # 构建产物检查
  tools/export.mjs            # 同步静态产物到现有 Pages 根目录
  source/
    _posts/                   # Markdown 文章
    about/index.md            # 关于我（个人简介）
    admin/                    # 在线管理后台：index.html / admin.css / admin.js
    tags/index.md             # 标签入口
    404.md                    # 自定义 404
  themes/minxi/
    _config.yml               # GitHub 个人主页链接
    layout/                   # EJS 页面模板
    scripts/helpers.js        # 阅读时长与搜索索引
    source/css/main.css       # 主题与响应式样式
    source/js/main.js          # 搜索、筛选、复制、目录、返回顶部
    source/images/favicon.svg
```

修改名称、简介、署名：`blog/_config.yml`。修改个人介绍：`blog/source/about/index.md`，或者直接在 `/admin/` 后台的「个人简介」里改。修改主题色：`main.css` 中的 `:root` 变量。修改后台允许的账号、仓库或分支：`blog/source/admin/admin.js` 顶部的 `CONFIG`。

## 安全与隐私

站点是纯静态页面，无账号系统、无统计追踪。全文搜索下载公开的 `search.json`，不要在已发布文章中写私密信息。代码复制优先使用 HTTPS 下的 Clipboard API，不可用时会选中代码并提示手动复制。`/admin/` 后台同样没有账号系统：它只在你自己的浏览器里持有 GitHub 令牌并直接调用 `api.github.com`，详见「在线管理后台」一节。

2026-10-14 的 `npm audit` 检测到 Hexo 上游构建依赖的 9 条报告（7 high、2 moderate），对应 `braces` / `sprintf-js` 的拒绝服务问题及其依赖链。`npm audit fix` 无法在当前兼容版本下消除；工具建议的 `--force` 会把 Hexo 降级到旧主版本，因此未执行。依赖仅运行于本地或 CI 构建，未打包进公开页面，但不要使用不可信的模板、插件或配置；来自外部的 PR 应在隔离的 GitHub runner 中构建，且不能获得发布权限。后续升级 Hexo 后请重新运行审计。
