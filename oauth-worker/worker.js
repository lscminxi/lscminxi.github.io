/*
 * Minxi 博客 · GitHub OAuth 换令牌小后端（Cloudflare Worker）
 * ---------------------------------------------------------------------------
 * 为什么需要它：站点是纯静态 GitHub Pages，而 GitHub OAuth 网页流程换令牌时
 * 必须出示 client_secret，且 github.com/login/oauth/access_token 不允许浏览器跨域。
 * 这个 Worker 只做一件事：替浏览器把一次性 code 换成令牌，并立刻返回给浏览器
 * （不存储、不记录令牌），密钥只存在 Cloudflare 的环境变量里，绝不进仓库。
 *
 * 需要在 Cloudflare 里配置的环境变量：
 *   GITHUB_CLIENT_ID      GitHub OAuth App 的 Client ID（也可以写进 wrangler.toml 的 vars）
 *   GITHUB_CLIENT_SECRET  GitHub OAuth App 的 Client Secret（务必用 Secret 类型，不要提交到仓库）
 *   ALLOWED_ORIGINS       允许调用本站点来源，逗号分隔，如：
 *                         https://lscminxi.github.io,http://localhost:8000
 *
 * 接口：
 *   GET  /health    → { ok: true }
 *   POST /exchange  body: { "code": "..." } → { access_token, token_type, scope }
 *
 * 部署步骤见同目录 README.md。
 */

const TOKEN_URL = "https://github.com/login/oauth/access_token";

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const headers = {
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (allowed.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return { origin, allowed, headers };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}

export default {
  async fetch(request, env) {
    const { origin, allowed, headers } = corsHeaders(request, env);
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }
    if (url.pathname === "/health") {
      return json({ ok: true }, 200, headers);
    }
    if (url.pathname !== "/exchange") {
      return json({ error: "not_found" }, 404, headers);
    }
    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405, headers);
    }
    if (!allowed.includes(origin)) {
      return json({ error: "origin_not_allowed" }, 403, headers);
    }
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
      return json({ error: "worker_not_configured" }, 500, headers);
    }

    let code = "";
    try {
      const body = await request.json();
      code = typeof body?.code === "string" ? body.code.trim() : "";
    } catch {
      code = "";
    }
    if (!code || code.length > 512) {
      return json({ error: "missing_code" }, 400, headers);
    }

    // 用密钥向 GitHub 换令牌（服务器到服务器，不受浏览器跨域限制）。
    const upstream = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok || data.error || !data.access_token) {
      // 只把 GitHub 的错误码透传给前端，不泄露任何密钥或上游细节。
      return json(
        { error: data.error || "token_exchange_failed", error_description: data.error_description || "" },
        401,
        headers,
      );
    }
    return json(
      { access_token: data.access_token, token_type: data.token_type || "bearer", scope: data.scope || "" },
      200,
      headers,
    );
  },
};
