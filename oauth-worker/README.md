# GitHub OAuth 小后端（Cloudflare Worker）部署说明

作用：博客是纯静态站，GitHub OAuth 换令牌必须用 `client_secret`、且 GitHub 的换令牌接口不允许浏览器跨域。这个 Worker 只负责把一次性的 `code` 换成令牌并当场返回浏览器，**不存储、不记录令牌**。密钥只放在 Cloudflare 里，不进仓库。免费额度完全够用。

预计耗时 5 分钟，全部在网页上点完（也可以用文末的命令行方式）。

## 第 1 步：在 GitHub 创建 OAuth App

1. 打开 <https://github.com/settings/developers> → **OAuth Apps** → **New OAuth App**。
2. 这样填：
   - **Application name**：`Minxi 的 blog 登录`（随便起，访客在授权页会看到）
   - **Homepage URL**：`https://lscminxi.github.io`
   - **Authorization callback URL**：`https://lscminxi.github.io/auth/callback/`（**必须与这一字不差**，博客的回调页就在这个地址）
3. 点 **Register application**。在打开的页面里记下 **Client ID**（形如 `Iv1.xxxxx` 或 `Ov23li...`）。
4. 点 **Generate a new client secret**，复制生成的密钥（只显示一次）。**这个密钥不要发给任何人、不要提交到仓库**，下一步贴进 Cloudflare 就行。

## 第 2 步：在 Cloudflare 部署 Worker

1. 打开 <https://dash.cloudflare.com>（没有账号就免费注册）→ 左侧 **Workers & Pages** → **Create** → **Create Worker**。
2. 名字填 `minxi-github-auth` → **Deploy**（先部署默认模板，没关系）。
3. 点 **Edit code**，把模板内容全部删掉，粘贴本目录 [`worker.js`](./worker.js) 的全部内容 → **Deploy**。
4. 回到这个 Worker 的 **Settings → Variables and Secrets**，添加三个变量：
   | 名称 | 类型 | 值 |
   | --- | --- | --- |
   | `GITHUB_CLIENT_ID` | Text | 第 1 步的 Client ID |
   | `GITHUB_CLIENT_SECRET` | **Secret** | 第 1 步生成的密钥 |
   | `ALLOWED_ORIGINS` | Text | `https://lscminxi.github.io` |
5. 记下 Worker 的访问地址，形如 `https://minxi-github-auth.<你的子域>.workers.dev`。
   自检：浏览器打开 `https://…workers.dev/health` 能看到 `{"ok":true}` 就对了（看到这串说明 Worker 活着）。

## 第 3 步：告诉博客启用 OAuth

编辑 `blog/themes/minxi/_config.yml`：

```yaml
auth:
  provider: oauth
  oauth:
    client_id: "第1步的 Client ID"
    worker_url: "https://minxi-github-auth.<你的子域>.workers.dev"
    scope: "read:user"
```

然后在 `blog/` 目录跑 `npm run publish:prepare`，把源码与根目录静态文件一起提交、合并到 `main`。

> 本地预览（localhost / Arena 预览地址）里不要指望 OAuth 能跳通：GitHub 只认登记过的回调域名，本地点 OAuth 会被 GitHub 拒绝。本地会自动保留「用户名＋验证码」的备用登录，互不影响。

## 完成后的效果

- 访客点顶栏「登录」→ 跳到 GitHub 官方授权页 → 点 Authorize → 自动跳回博客并保持登录，可评论/点赞。
- 登录只申请 `read:user`（读公开资料拿用户名和头像），令牌用完即弃、不保存；将来访客可在 GitHub **Settings → Applications** 里随时撤销授权。
- 后台不变：OAuth 登录也不授予后台权限，进 `/admin/` 仍要站长令牌；非站长依旧只会看到「你无权限进入」。

## 命令行部署（可选，替代第 2 步）

```bash
cd oauth-worker
npx wrangler login
npx wrangler secret put GITHUB_CLIENT_SECRET   # 按提示粘贴第 1 步的密钥
# 先把 wrangler.toml 里的 GITHUB_CLIENT_ID 填好，再：
npx wrangler deploy
```

## 常见问题

- **授权后跳回显示登录失败 / `origin_not_allowed`**：Worker 的 `ALLOWED_ORIGINS` 没包含当前站点来源（正式站必须是 `https://lscminxi.github.io`，不要多写路径或斜杠）。
- **GitHub 报错 `The redirect_uri is not associated with this application`**：OAuth App 的 Authorization callback URL 与 `https://lscminxi.github.io/auth/callback/` 不完全一致（注意结尾斜杠、http/https）。
- **换令牌失败 `bad_verification_code`**：code 已被用过或过期（10 分钟），重新点一次登录即可，别刷新回调页重复提交。
- **博客上还是验证码登录、没有 GitHub 按钮**：`provider` 没改成 `oauth`，或 `client_id` / `worker_url` 没填全（缺一会自动回落到本地登录保底），或改完没跑 `npm run publish:prepare` 重新发布。
