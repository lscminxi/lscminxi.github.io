"use strict";

/*
 * 访客登录的公开配置：构建时生成 /auth-config.json。
 * 只有公开字段（OAuth 的 client_id 本来就是公开的、会出现在授权地址里；
 * client_secret 绝不在站点任何文件里，只放在 Cloudflare Worker 的机密变量中）。
 * OAuth 回调页是独立静态页（source/auth/callback/），读不到模板变量，
 * 就靠这份公开 JSON 找到 worker 地址完成换令牌。
 */

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function publicAuthConfig(hexo) {
  const auth = (hexo.theme && hexo.theme.config && hexo.theme.config.auth) || {};
  const oauth = auth.oauth || {};
  const clientId = clean(oauth.client_id);
  const workerUrl = clean(oauth.worker_url).replace(/\/+$/, "");
  const scope = clean(oauth.scope) || "read:user";
  // GitHub 的 Client ID 形如 Iv1.xxxx（带点），校验要允许点。
  const ready =
    auth.provider === "oauth" &&
    /^[A-Za-z0-9_.-]+$/.test(clientId) &&
    /^https:\/\/[^\s"'<>\\()]+$/.test(workerUrl);
  return {
    provider: ready ? "oauth" : "local",
    oauth: ready ? { client_id: clientId, worker_url: workerUrl, scope } : { client_id: "", worker_url: "", scope },
  };
}

hexo.extend.generator.register("auth-config-data", function () {
  return {
    path: "auth-config.json",
    data: JSON.stringify(publicAuthConfig(hexo), null, 2) + "\n",
  };
});

// 供测试与模板复用（不是 Hexo 概念，只是把清洗逻辑挂出来）。
hexo.extend.helper.register("site_auth_config", function () {
  return publicAuthConfig(hexo);
});
