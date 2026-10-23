"use strict";
/*
 * 博客管理后台（纯前端）
 * --------------------------------------------------------------
 * 这个站点是静态的 GitHub Pages，没有自己的服务器，因此后台不保存任何账号密码：
 * 「登录」有两种方式，验证标准相同：① 站长点击按钮走 GitHub OAuth 授权
 * （经 oauth-worker 换取授权令牌）；② 站长粘贴自己的 GitHub Personal Access Token。
 * 之后所有读写都直接由浏览器调用 https://api.github.com 完成，
 * 以站长的身份把改动提交到仓库 main 分支；GitHub Actions 会自动重新生成静态页面并发布。
 *
 * 安全说明：
 *  - 授权/令牌默认只保存在当前标签页的 sessionStorage，退出登录或关闭标签页即清除；
 *    只有粘贴令牌时勾选了「记住此设备」，才会把令牌写进这台设备的 localStorage。
 *  - 令牌只会发送到 api.github.com，本站没有任何后端，不会上传到别处。
 *  - 真正的写权限由 GitHub 判断；此外，必须通过 /user 确认授权对应的账号，且账号在允许名单中。
 *  - 身份接口失败、账号信息缺失或允许名单为空时一律拒绝登录（fail closed）。
 */
(() => {
  const CONFIG = {
    owner: "lscminxi",
    repo: "lscminxi.github.io",
    branch: "main",
    allowedLogins: ["lscminxi"], // 仅允许名单中的账号；留空或配置错误时拒绝所有人
    api: "https://api.github.com",
    siteUrl: "https://lscminxi.github.io",
    postsDir: "blog/source/_posts",
    imagesDir: "blog/source/images",
    aboutPath: "blog/source/about/index.md",
    appearancePath: "blog/source/_data/appearance.json",
    maxUploadBytes: 1000000, // GitHub Contents API 单文件上限约 1 MB
    imageExtensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"],
  };

  const TOKEN_KEY = "minxi.admin.oauth-token"; // 当前标签页会话里的授权/令牌（仅 sessionStorage）
  const REMEMBERED_TOKEN_KEY = "minxi.admin.token"; // 勾选「记住此设备」的粘贴令牌（localStorage，仅本设备）
  const LEGACY_TOKEN_KEYS = ["minxi.admin.remember"]; // 已废弃的旧键，启动时清掉

  let token = "";
  let currentUser = "";
  let postIndex = new Map(); // path -> { sha, title, date, categories, tags, description, size }
  let imageIndex = new Map(); // path -> { sha, name, size }
  let editing = null; // { path, sha, isNew }
  let aboutState = { sha: "", text: "" };
  let appearanceState = { sha: "", loaded: false };
  // 「可选背景」列表草稿：改动先留在页面里，点「保存并提交」才写进 appearance.json。
  let wallpaperDraft = [];
  // 「可选背景」列表里点选后只影响右侧大预览，不写进配置、不影响保存内容。
  let wallpaperPreview = null;
  let buildWatch = null;
  let postsRevision = 0;
  const deletingPosts = new Set();

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const el = {
    viewLogin: $("#view-login"),
    viewNoAccess: $("#view-noaccess"),
    noAccessText: $("#noaccess-text"),
    noAccessOwner: $("#noaccess-owner"),
    viewApp: $("#view-app"),
    viewEditor: $("#view-editor"),
    loginError: $("#login-error"),
    loginButton: $("#login-button"),
    tokenForm: $("#token-form"),
    tokenInput: $("#token-input"),
    tokenRemember: $("#token-remember"),
    tokenLoginButton: $("#token-login-button"),
    userChip: $("#user-chip"),
    logoutButton: $("#logout-button"),
    repoChip: $("#repo-chip"),
    tabs: $("#tabs"),
    tabPosts: $("#tab-posts"),
    tabMedia: $("#tab-media"),
    tabAppearance: $("#tab-appearance"),
    tabAbout: $("#tab-about"),
    tabLog: $("#tab-log"),
    appearancePreview: $("#appearance-preview"),
    previewTagline: $("#appearance-preview-tagline"),
    previewTag: $("#appearance-preview-tag"),
    previewReset: $("#appearance-preview-reset"),
    appearanceStatus: $("#appearance-status"),
    appearanceSave: $("#appearance-save"),
    appearanceReload: $("#appearance-reload"),
    appearanceDefaults: $("#appearance-defaults"),
    appearanceNote: $("#appearance-preview-note"),
    appearancePicker: $("#a-image"),
    wallpaperList: $("#wallpaper-list"),
    wallpaperCount: $("#wallpaper-count"),
    wallpaperMax: $("#wallpaper-max"),
    wallpaperNote: $("#wallpaper-note"),
    wallpaperImage: $("#wallpaper-image"),
    wallpaperUrl: $("#wallpaper-url"),
    wallpaperLabel: $("#wallpaper-label"),
    wallpaperAdd: $("#wallpaper-add"),
    wallpaperUpload: $("#wallpaper-upload"),
    a: {
      avatar: $("#a-avatar"),
      wallpaper: $("#a-wallpaper"),
      favicon: $("#a-favicon"),
      dim: $("#a-dim"),
      blur: $("#a-blur"),
      theme: $("#a-theme"),
      dimValue: $("#a-dim-value"),
      blurValue: $("#a-blur-value"),
    },
    postList: $("#post-list"),
    postsCount: $("#posts-count"),
    newPostButton: $("#new-post-button"),
    refreshButton: $("#refresh-button"),
    mediaList: $("#media-list"),
    mediaCount: $("#media-count"),
    uploadInput: $("#upload-input"),
    aboutEditor: $("#about-editor"),
    aboutSave: $("#about-save"),
    aboutReload: $("#about-reload"),
    aboutStatus: $("#about-status"),
    logList: $("#log-list"),
    clearLog: $("#clear-log"),
    buildChip: $("#build-chip"),
    buildNote: $("#build-note"),
    buildRefresh: $("#build-refresh"),
    actionsLink: $("#actions-link"),
    editorTitle: $("#editor-title"),
    cancelEdit: $("#cancel-edit"),
    savePost: $("#save-post"),
    deletePost: $("#delete-post"),
    editorStatus: $("#editor-status"),
    urlPreview: $("#url-preview"),
    slugWarning: $("#slug-warning"),
    insertImage: $("#insert-image"),
    insertMore: $("#insert-more"),
    toast: $("#toast"),
    modal: $("#modal"),
    modalTitle: $("#modal-title"),
    modalText: $("#modal-text"),
    modalOk: $("#modal-ok"),
    modalCancel: $("#modal-cancel"),
    f: {
      title: $("#f-title"),
      slug: $("#f-slug"),
      date: $("#f-date"),
      categories: $("#f-categories"),
      tags: $("#f-tags"),
      accent: $("#f-accent"),
      description: $("#f-description"),
      sample: $("#f-sample"),
      body: $("#f-body"),
    },
  };

  /* ---------------- 工具 ---------------- */

  const pad = (n) => String(n).padStart(2, "0");

  function toBase64Bytes(bytes) {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }
  const toBase64Text = (text) =>
    toBase64Bytes(new TextEncoder().encode(String(text)));
  const fromBase64Text = (value) => {
    const binary = atob(value || "");
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  };
  const fileToBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(toBase64Bytes(new Uint8Array(reader.result)));
      reader.onerror = () => reject(new Error("读取文件失败"));
      reader.readAsArrayBuffer(file);
    });

  /* ---------------- 上传准备：格式检查 + 大图自动压缩 ----------------
   * GitHub Contents API 单文件上限约 1 MB，而壁纸/照片动辄好几 MB。
   * 浏览器能解码的位图（jpg/png/webp）会先等比缩小并重新编码，再上传压缩后的版本；
   * 动图（gif）与矢量图（svg）没有可靠的压缩方式，仍然按原样提示超限。
   */
  const SHRINKABLE = ["png", "jpg", "jpeg", "webp", "avif"];
  const MAX_IMAGE_SIDE = 2400; // 超过这个边长就等比缩小，保证清晰度足够又明显省体积

  async function shrinkImage(file, extension) {
    if (typeof createImageBitmap !== "function") return null;
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width || 1, bitmap.height || 1));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round((bitmap.width || 1) * scale));
      canvas.height = Math.max(1, Math.round((bitmap.height || 1) * scale));
      const context = typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
      if (!context || typeof canvas.toBlob !== "function") return null;
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close?.();
      // PNG 可能带透明通道，保留 PNG；其余统一转成更小的 WebP。
      const type = extension === "png" ? "image/png" : "image/webp";
      const nextExtension = type === "image/png" ? "png" : "webp";
      for (const quality of [0.92, 0.85, 0.78, 0.7, 0.62, 0.55, 0.45]) {
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
        if (blob && blob.size <= CONFIG.maxUploadBytes) {
          return { blob, extension: nextExtension, size: blob.size };
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /** 返回 { name, blob, compressed } 或 { error }；调用方负责提示与提交。 */
  async function prepareUpload(file) {
    const extension = file.name.split(".").pop().toLowerCase();
    if (!CONFIG.imageExtensions.includes(extension)) {
      return { error: `只支持 ${CONFIG.imageExtensions.join("/")}` };
    }
    const safe = slugify(file.name.replace(/\.[^.]+$/, "")) || `image-${Date.now()}`;
    if (file.size <= CONFIG.maxUploadBytes) {
      return { name: `${safe}.${extension}`, blob: file, compressed: false };
    }
    if (!SHRINKABLE.includes(extension)) {
      return { error: "超过 1 MB，且这种格式无法自动压缩（动图/矢量图请先自行压缩）" };
    }
    const shrunk = await shrinkImage(file, extension);
    if (!shrunk) return { error: "超过 1 MB，且在本地压缩失败（可换 JPG/PNG/WebP 再试一次）" };
    return {
      name: `${safe}.${shrunk.extension}`,
      blob: shrunk.blob,
      compressed: true,
      originalSize: file.size,
      size: shrunk.size,
    };
  }

  const encodePath = (path) =>
    path.split("/").map(encodeURIComponent).join("/");

  function log(message, kind = "") {
    const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    const line = document.createElement("div");
    const stamp = document.createElement("span");
    stamp.className = "t";
    stamp.textContent = `[${time}] `;
    const text = document.createElement("span");
    if (kind) text.className = kind;
    text.textContent = message;
    line.append(stamp, text);
    el.logList.prepend(line);
    while (el.logList.children.length > 200) el.logList.lastChild.remove();
  }

  let toastTimer;
  function toast(message, kind = "") {
    el.toast.textContent = message;
    el.toast.className = `toast ${kind}`.trim();
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.toast.hidden = true), 3600);
  }

  let modalResolver = null;
  function confirmDialog(title, text, okLabel = "确认") {
    if (modalResolver) return Promise.resolve(false);
    el.modalTitle.textContent = title;
    el.modalText.textContent = text;
    el.modalOk.textContent = okLabel;
    el.modal.hidden = false;
    el.modalOk.focus();
    return new Promise((resolve) => {
      modalResolver = resolve;
    });
  }
  function closeModal(result) {
    el.modal.hidden = true;
    const resolve = modalResolver;
    modalResolver = null;
    if (resolve) resolve(result);
  }
  el.modalOk.addEventListener("click", () => closeModal(true));
  el.modalCancel.addEventListener("click", () => closeModal(false));
  el.modal.addEventListener("click", (event) => {
    if (event.target === el.modal) closeModal(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !el.modal.hidden) closeModal(false);
  });

  const busy = (button, on, label) => {
    if (!button) return;
    if (on) {
      button.dataset.label = button.textContent;
      button.classList.add("loading");
      button.disabled = true;
      if (label) button.textContent = label;
    } else {
      button.classList.remove("loading");
      button.disabled = false;
      if (button.dataset.label) button.textContent = button.dataset.label;
    }
  };

  /* ---------------- 授权存储（仅当前标签页会话） ---------------- */

  function clearLegacyTokenStorage() {
    try {
      for (const key of LEGACY_TOKEN_KEYS) {
        sessionStorage.removeItem(key);
        localStorage.removeItem(key);
      }
    } catch {
      /* 忽略 */
    }
  }

  function readStoredToken() {
    clearLegacyTokenStorage();
    try {
      return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(REMEMBERED_TOKEN_KEY) || "";
    } catch {
      return "";
    }
  }
  function storeToken(value, { remember = false } = {}) {
    clearLegacyTokenStorage();
    try {
      if (!value) {
        sessionStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REMEMBERED_TOKEN_KEY);
      } else if (remember) {
        localStorage.setItem(REMEMBERED_TOKEN_KEY, value);
        sessionStorage.removeItem(TOKEN_KEY);
      } else {
        sessionStorage.setItem(TOKEN_KEY, value);
        localStorage.removeItem(REMEMBERED_TOKEN_KEY);
      }
    } catch {
      /* 隐私模式下可能不可写，忽略 */
    }
  }

  /* ---------------- GitHub API ---------------- */

  function describeError(error) {
    const status = error.status;
    const apiMessage = error.data?.message;
    if (status === 401)
      return "GitHub 授权无效或已过期，请重新登录（401）。" + (apiMessage ? ` ${apiMessage}` : "");
    if (status === 403)
      return `权限不足或触发速率限制（403）。${apiMessage || ""}`.trim();
    if (status === 404)
      return `找不到文件或仓库（404）。请确认这次 GitHub 授权能访问 ${CONFIG.owner}/${CONFIG.repo}。${apiMessage || ""}`.trim();
    if (status === 409)
      return "文件已被其他提交更新（409），请点「刷新文件列表」后重试。";
    if (status === 422)
      return `GitHub 拒绝了这次提交（422）：${apiMessage || "内容或路径不合法"}`;
    if (status) return `请求失败（${status}）：${apiMessage || error.message}`;
    return error.message || "网络错误";
  }

  async function api(path, { method = "GET", body } = {}) {
    const response = await fetch(CONFIG.api + path, {
      method,
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const raw = await response.text();
    let data = null;
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        data = { message: raw.slice(0, 200) };
      }
    }
    if (!response.ok) {
      const error = new Error(describeError({ status: response.status, data }));
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  const repoPath = (suffix = "") =>
    `/repos/${CONFIG.owner}/${CONFIG.repo}${suffix}`;

  async function getFile(path) {
    const data = await api(repoPath(`/contents/${encodePath(path)}?ref=${CONFIG.branch}`));
    if (Array.isArray(data)) throw new Error(`${path} 是目录，不是文件`);
    return {
      sha: data.sha,
      size: data.size || 0,
      text: data.encoding === "base64" ? fromBase64Text(data.content) : data.content || "",
    };
  }

  async function putFile(path, text, sha, message) {
    return api(repoPath(`/contents/${encodePath(path)}`), {
      method: "PUT",
      body: {
        message,
        content: toBase64Text(text),
        branch: CONFIG.branch,
        ...(sha ? { sha } : {}),
      },
    });
  }

  async function putBinary(path, base64, sha, message) {
    return api(repoPath(`/contents/${encodePath(path)}`), {
      method: "PUT",
      body: { message, content: base64, branch: CONFIG.branch, ...(sha ? { sha } : {}) },
    });
  }

  async function deleteFile(path, sha, message) {
    return api(repoPath(`/contents/${encodePath(path)}`), {
      method: "DELETE",
      body: { message, sha, branch: CONFIG.branch },
    });
  }

  /* ---------------- Markdown front matter ---------------- */

  const stripQuotes = (value) =>
    /^".*"$/.test(value) || /^'.*'$/.test(value) ? value.slice(1, -1) : value;

  function parseFrontMatter(text) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
    if (!match) return { data: {}, body: text };
    const data = {};
    let key = null;
    for (const line of match[1].split(/\r?\n/)) {
      if (!line.trim() || /^\s*#/.test(line)) continue;
      const item = /^\s+-\s+(.*)$/.exec(line);
      if (item && key) {
        if (!Array.isArray(data[key])) data[key] = [];
        data[key].push(stripQuotes(item[1].trim()));
        continue;
      }
      const pair = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
      if (!pair) continue;
      key = pair[1];
      const value = pair[2].trim();
      data[key] = value === "" ? [] : stripQuotes(value);
    }
    return { data, body: text.slice(match[0].length) };
  }

  const needsQuotes = (value) =>
    /[:#\[\]{}&*!|>'"%@`]|^\s|\s$|^-/.test(value);
  const yamlString = (value) =>
    needsQuotes(String(value)) ? JSON.stringify(String(value)) : String(value);
  const asList = (value) =>
    Array.isArray(value) ? value : value === "" || value == null ? [] : [String(value)];

  // 置顶按钮：二选一，状态保存在 pinned 变量里，写入 front matter 时为 sticky: 1。
  let pinned = false;
  const pinButtons = document.querySelectorAll("[data-pin]");
  const pinHint = document.querySelector("#pin-hint");
  function setPinned(value) {
    pinned = Boolean(value);
    pinButtons.forEach((button) => {
      const on = (button.dataset.pin === "on") === pinned;
      button.classList.toggle("active", on);
      button.setAttribute("aria-pressed", String(on));
    });
    if (pinHint)
      pinHint.textContent = pinned
        ? "保存后会排在首页和归档的最前面，并显示「置顶」标记。"
        : "普通文章，按日期排序。";
  }
  pinButtons.forEach((button) =>
    button.addEventListener("click", () => setPinned(button.dataset.pin === "on")),
  );

  // 可见性按钮：与置顶一样二选一，状态保存在 visibility 变量里，
  // 写入 front matter 时 private 对应 published: false。
  let visibility = "public";
  const visibilityButtons = document.querySelectorAll("[data-visibility]");
  const visibilityHint = document.querySelector("#visibility-hint");
  function setVisibility(value) {
    visibility = value === "private" ? "private" : "public";
    visibilityButtons.forEach((button) => {
      const on = button.dataset.visibility === visibility;
      button.classList.toggle("active", on);
      button.setAttribute("aria-pressed", String(on));
    });
    if (visibilityHint)
      visibilityHint.textContent = visibility === "private"
        ? "私密：不生成公开页面，也不进首页、归档与搜索（不是密码保护，源码仍在仓库中）。"
        : "公开：保存并构建后发布到站点。";
  }
  visibilityButtons.forEach((button) =>
    button.addEventListener("click", () => {
      setVisibility(button.dataset.visibility);
      updatePreview();
    }),
  );
  setVisibility("public");

  function buildMarkdown(fields) {
    const lines = ["---"];
    lines.push(`title: ${yamlString(fields.title)}`);
    lines.push(`date: ${fields.date}`);
    if (fields.categories.length) {
      lines.push("categories:");
      fields.categories.forEach((item) => lines.push(`  - ${yamlString(item)}`));
    }
    if (fields.tags.length) {
      lines.push("tags:");
      fields.tags.forEach((item) => lines.push(`  - ${yamlString(item)}`));
    }
    if (fields.description) lines.push(`description: ${yamlString(fields.description)}`);
    if (fields.accent) lines.push(`accent: ${fields.accent}`);
    if (fields.sample) lines.push("sample: true");
    if (fields.pinned) lines.push("sticky: 1");
    if (fields.visibility === "private") lines.push("published: false");
    lines.push("---", "");
    return `${lines.join("\n")}${fields.body.replace(/^\s+/, "")}\n`;
  }

  const splitList = (value) =>
    String(value || "")
      .split(/[,，]/)
      .map((item) => item.trim())
      .filter(Boolean);

  function toDatetimeLocal(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
      date.getHours(),
    )}:${pad(date.getMinutes())}`;
  }
  function fromDateInput(value) {
    if (!value) return "";
    const [datePart, timePart = "00:00"] = String(value).split("T");
    const [y, m, d] = datePart.split("-");
    const [hh, mm] = timePart.split(":");
    if (!y || !m || !d) return "";
    return `${y}-${pad(m)}-${pad(d)} ${pad(hh || 0)}:${pad(mm || 0)}:00`;
  }
  const postUrl = (dateValue, slug) => {
    const [y, m, d] = String(dateValue).slice(0, 10).split("-");
    return `/${y}/${m}/${d}/${slug}/`;
  };
  const slugify = (value) =>
    String(value)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);

  /* ---------------- 登录 ---------------- */

  function showError(message) {
    el.loginError.textContent = message;
    el.loginError.hidden = !message;
  }

  async function authenticate(value) {
    token = value;

    // /user 是唯一可信的授权身份来源。网络/API 出错时不能退回到仓库所有者，
    // 否则任意有仓库写权限的账号都可能绕过 allowedLogins 检查。
    let identity;
    try {
      identity = await api("/user");
    } catch (error) {
      throw new Error(`无法验证 GitHub 登录身份，已拒绝访问。${describeError(error)}`);
    }
    const login = typeof identity?.login === "string" ? identity.login.trim() : "";
    if (!login) {
      throw new Error("GitHub 未返回有效的登录账号，已拒绝访问。请重新登录后重试。");
    }

    const allowedLogins = Array.isArray(CONFIG.allowedLogins)
      ? CONFIG.allowedLogins
          .filter((name) => typeof name === "string")
          .map((name) => name.trim())
          .filter(Boolean)
      : [];
    if (!allowedLogins.length) {
      throw new Error("管理后台没有配置允许登录的账号，已拒绝访问。");
    }
    if (!allowedLogins.some((name) => name.toLowerCase() === login.toLowerCase())) {
      throw new Error(
        `你无权限进入后台：账号 @${login} 不是站长。仅允许 @${allowedLogins.join(", @")} 登录。`,
      );
    }

    const repo = await api(repoPath(""));
    if (!repo.permissions?.push) {
      throw new Error(
        "这次 GitHub 授权对该仓库没有写权限。请重新进入后台并在 GitHub 授权页确认授权。",
      );
    }
    currentUser = login;
    el.repoChip.textContent = `${CONFIG.owner}/${CONFIG.repo} · ${CONFIG.branch}`;
    el.actionsLink.href = `https://github.com/${CONFIG.owner}/${CONFIG.repo}/actions`;
    return repo;
  }

  async function enterApp() {
    el.viewLogin.hidden = true;
    el.viewApp.hidden = false;
    el.viewEditor.hidden = true;
    el.userChip.textContent = `@${currentUser}`;
    el.userChip.hidden = false;
    el.logoutButton.hidden = false;
    log(`已登录：@${currentUser}`, "ok");
    await refreshAll();
    refreshBuildStatus();
  }

  function logout(silent) {
    token = "";
    currentUser = "";
    postsRevision++;
    postIndex.clear();
    imageIndex.clear();
    editing = null;
    aboutState = { sha: "", text: "" };
    clearInterval(buildWatch);
    storeToken("");
    el.viewLogin.hidden = false;
    el.viewApp.hidden = true;
    el.viewEditor.hidden = true;
    snapshots.editor = null;
    snapshots.appearance = null;
    snapshots.about = null;
    el.userChip.hidden = true;
    el.logoutButton.hidden = true;
    if (!silent) log("已退出登录，浏览器里保存的授权/令牌已清除。");
  }

  /* 站长 GitHub OAuth：跳 GitHub 授权（带仓库写权限）→ /auth/callback/ 换授权 →
     回到 /admin/ 后 init 用会话中的授权自动确认站长身份并进入，不再粘贴令牌。 */
  async function startAdminOAuth() {
    showError("");
    let config = null;
    try {
      const response = await fetch("/auth-config.json", { cache: "no-cache" });
      if (response.ok) config = await response.json();
    } catch {
      config = null;
    }
    const clientId = config?.oauth?.client_id || "";
    const workerUrl = config?.oauth?.worker_url || "";
    if (!clientId || !workerUrl) {
      showError("GitHub 登录尚未配置完成，暂时无法进入后台。");
      return;
    }
    const bytes = new Uint8Array(16);
    try {
      crypto.getRandomValues(bytes);
    } catch {
      for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    }
    const state = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    try {
      sessionStorage.setItem("minxi.oauth.state", state);
      sessionStorage.setItem("minxi.oauth.return", `${location.origin}/admin/`);
      sessionStorage.setItem("minxi.oauth.admin", "1");
    } catch {
      showError("浏览器会话存储不可用，无法完成 GitHub 登录。");
      return;
    }
    const scopes = new Set(String(config.oauth.scope || "read:user").split(/\s+/).filter(Boolean));
    scopes.add("public_repo");
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${location.origin}/auth/callback/`,
      scope: [...scopes].join(" "),
      state,
      allow_signup: "true",
    });
    location.href = `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  el.loginButton?.addEventListener("click", () => {
    void startAdminOAuth();
  });

  /* 方式二：粘贴 GitHub 令牌。验证标准与 OAuth 完全相同（authenticate 查 /user
     是否在允许名单、且对仓库有写权限），不通过不保存、不进入。 */
  el.tokenForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const value = el.tokenInput.value.trim();
    if (!value) {
      showError("请先粘贴 GitHub 令牌，再点「验证令牌并进入」。");
      el.tokenInput.focus();
      return;
    }
    if (/\s/.test(value)) {
      showError("令牌里不能有空格或换行，请确认粘贴完整。");
      el.tokenInput.focus();
      return;
    }
    showError("");
    busy(el.tokenLoginButton, true, "正在验证令牌…");
    try {
      await authenticate(value);
      storeToken(value, { remember: Boolean(el.tokenRemember?.checked) });
      el.tokenInput.value = "";
      await enterApp();
      toast(`欢迎回来，@${currentUser}`);
    } catch (error) {
      token = "";
      currentUser = "";
      showError(error.message || "令牌验证失败，请重试。");
    } finally {
      busy(el.tokenLoginButton, false);
    }
  });

  el.logoutButton.addEventListener("click", async () => {
    const ok = await confirmDialog(
      "退出登录",
      "将清除浏览器里保存的授权/令牌，未提交的编辑内容会丢失。确定退出吗？",
      "退出登录",
    );
    if (ok) {
      logout();
      toast("已退出登录");
    }
  });

  /* 前台 GitHub OAuth 登录的本地会话：所有人可登录，但只有站长能进后台。
     在这里读到非站长访客时，直接展示「你无权限进入」（站长可点按钮用 GitHub 重新登录）。 */
  function visitorLogin() {
    try {
      const data = JSON.parse(localStorage.getItem("minxi.auth.user") || "null");
      const login = typeof data?.login === "string" ? data.login.trim().replace(/^@+/, "") : "";
      return /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(login) ? login : "";
    } catch {
      return "";
    }
  }

  function showNoAccess(login) {
    if (el.noAccessText) {
      el.noAccessText.textContent = login
        ? `你当前以前台访客 @${login} 的身份登录。你无权限进入后台，只有站长 @${CONFIG.allowedLogins.join(", @")} 才能进入。`
        : `你无权限进入后台，只有站长 @${CONFIG.allowedLogins.join(", @")} 才能进入。`;
    }
    el.viewLogin.hidden = true;
    if (el.viewNoAccess) el.viewNoAccess.hidden = false;
    el.viewApp.hidden = true;
    el.viewEditor.hidden = true;
  }

  el.noAccessOwner?.addEventListener("click", () => {
    if (el.viewNoAccess) el.viewNoAccess.hidden = true;
    el.viewLogin.hidden = false;
    void startAdminOAuth();
  });

  /* ---------------- 文件列表 ---------------- */

  async function loadTree() {
    const data = await api(repoPath(`/git/trees/${CONFIG.branch}?recursive=1`));
    if (data.truncated) log("仓库文件过多，列表可能被截断。", "err");
    const blobs = (data.tree || []).filter((item) => item.type === "blob");
    const posts = blobs.filter(
      (item) => item.path.startsWith(`${CONFIG.postsDir}/`) && item.path.endsWith(".md"),
    );
    const images = blobs.filter(
      (item) =>
        item.path.startsWith(`${CONFIG.imagesDir}/`) &&
        CONFIG.imageExtensions.includes(item.path.split(".").pop().toLowerCase()),
    );
    return { posts, images };
  }

  async function mapLimit(items, limit, worker) {
    const results = [];
    let cursor = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await worker(items[index], index);
      }
    });
    await Promise.all(runners);
    return results;
  }

  async function refreshPosts() {
    const revision = ++postsRevision;
    const { posts } = await loadTree();
    if (revision !== postsRevision) return;
    const nextIndex = new Map();
    el.postList.textContent = "";
    if (!posts.length) {
      postIndex = nextIndex;
      el.postList.append(Object.assign(document.createElement("p"), { className: "muted", textContent: "还没有文章，点右上角「新建文章」。" }));
      el.postsCount.textContent = "0";
      return;
    }
    el.postList.append(
      Object.assign(document.createElement("p"), { className: "muted small", textContent: `正在读取 ${posts.length} 篇文章的信息…` }),
    );
    await mapLimit(posts, 4, async (item) => {
      try {
        const file = await getFile(item.path);
        const { data } = parseFrontMatter(file.text);
        nextIndex.set(item.path, {
          sha: file.sha,
          size: item.size || file.size,
          title: String(data.title || item.path.split("/").pop()),
          date: String(data.date || ""),
          categories: asList(data.categories),
          tags: asList(data.tags),
          description: String(data.description || ""),
          sample: String(data.sample || "") === "true",
          sticky: Number(data.sticky) > 0,
          published: String(data.published || "") !== "false",
        });
      } catch (error) {
        if (error.status === 404) return; // File removed while the tree was loading.
        nextIndex.set(item.path, {
          sha: item.sha,
          size: item.size,
          title: item.path.split("/").pop(),
          date: "",
          categories: [],
          tags: [],
          description: `读取失败：${describeError(error)}`,
          sample: false,
          sticky: false,
          published: true,
        });
      }
    });
    if (revision !== postsRevision) return;
    postIndex = nextIndex;
    renderPosts();
  }

  function renderPosts() {
    el.postList.textContent = "";
    const entries = [...postIndex.entries()].sort((a, b) =>
      (b[1].date || "").localeCompare(a[1].date || ""),
    );
    el.postsCount.textContent = String(entries.length);
    for (const [path, post] of entries) {
      const row = document.createElement("div");
      row.className = "row";
      const main = document.createElement("div");
      main.className = "row-main";
      const title = document.createElement("strong");
      title.className = "row-title";
      title.textContent = post.title;
      const meta = document.createElement("div");
      meta.className = "row-meta";
      const isPrivate = post.published === false;
      const url = !isPrivate && post.date ? postUrl(post.date, fileName(path)) : "";
      meta.textContent = [
        path.replace(`${CONFIG.postsDir}/`, ""),
        post.date,
        post.categories.join(" / "),
        post.tags.map((tag) => `#${tag}`).join(" "),
        post.sample ? "示例文章" : "",
        post.sticky ? "置顶" : "",
        isPrivate ? "私密（仅后台可见）" : "",
        url ? `→ ${url}` : "",
      ]
        .filter(Boolean)
        .join("  ·  ");
      main.append(title, meta);

      const actions = document.createElement("div");
      actions.className = "row-actions";
      if (url) {
        const view = document.createElement("a");
        view.className = "btn ghost small";
        view.href = url;
        view.target = "_blank";
        view.rel = "noopener noreferrer";
        view.textContent = "查看";
        actions.append(view);
      }
      const edit = document.createElement("button");
      edit.className = "btn small";
      edit.type = "button";
      edit.textContent = "编辑";
      edit.addEventListener("click", () => openEditor(path));
      const remove = document.createElement("button");
      remove.className = "btn danger small";
      remove.type = "button";
      remove.textContent = "删除";
      remove.addEventListener("click", () => removePost(path, remove));
      actions.append(edit, remove);
      row.append(main, actions);
      el.postList.append(row);
    }
  }

  const fileName = (path) => path.split("/").pop().replace(/\.md$/, "");

  async function removePost(path, button = el.deletePost) {
    if (deletingPosts.has(path)) return false;
    if (editing?.path === path && el.savePost.disabled) {
      toast("正在保存文章，请等保存完成后再删除。", "err");
      return false;
    }
    const editor = editing?.path === path ? editing : null;
    const post = postIndex.get(path) || (editor ? { title: el.f.title.value || fileName(path), sha: editor.sha } : null);
    if (!post) {
      toast("文章列表已变化，请刷新后重试。", "err");
      return false;
    }
    deletingPosts.add(path);
    let started = false;
    try {
      const ok = await confirmDialog(
        "删除文章",
        `确定删除「${post.title}」（${path}）吗？这会提交删除到 ${CONFIG.branch} 分支；公开页面需要等待自动构建和 Pages 发布完成后才会消失。此操作只能通过 Git 历史恢复。`,
        "删除并提交",
      );
      if (!ok) return false;
      started = true;
      busy(button, true, "删除中…");
      if (editor) {
        busy(el.savePost, true);
        el.editorStatus.textContent = "正在删除文章并提交到 GitHub…";
      }
      // Revalidate after confirmation. Never silently delete a newer revision.
      let file;
      try {
        file = await getFile(path);
      } catch (error) {
        if (error.status !== 404) throw error;
      }
      let result;
      if (file) {
        const expectedSha = editor?.sha || post.sha;
        if (expectedSha && file.sha !== expectedSha) {
          const confirmed = await confirmDialog(
            "文章已被修改",
            "该文章在列表加载后被更新过。确定删除 GitHub 上的最新版本吗？取消可保留你的编辑内容。",
            "删除最新版本",
          );
          if (!confirmed) return false;
        }
        result = await deleteFile(path, file.sha, `chore(blog): delete post ${fileName(path)}`);
        log(`已删除文章：${path}（commit ${result.commit?.sha?.slice(0, 7) || "?"}）`, "ok");
        toast("源码已删除；公开页面需等待自动发布完成。");
      } else {
        log(`文章已不存在：${path}，已同步移除列表。`, "ok");
        toast("文章源码已不存在，已更新列表。");
      }
      postsRevision++; // Invalidate refreshes begun before the delete.
      postIndex.delete(path);
      renderPosts();
      if (editing?.path === path) hideEditor();
      watchBuild(result?.commit?.sha || "");
      return true;
    } catch (error) {
      const message = `删除失败：${describeError(error)}`;
      log(message, "err");
      toast(message, "err");
      if (editing?.path === path) el.editorStatus.textContent = message;
      return false; // Keep the editor/draft intact on error or cancellation.
    } finally {
      deletingPosts.delete(path);
      if (started) {
        busy(button, false);
        if (editor) {
          busy(el.savePost, false);
          if (editing?.path === path && el.editorStatus.textContent === "正在删除文章并提交到 GitHub…") {
            el.editorStatus.textContent = "删除已取消，编辑内容已保留。";
          }
        }
      }
    }
  }

  async function refreshImages() {
    const { images } = await loadTree();
    imageIndex = new Map(
      images.map((item) => [
        item.path,
        { sha: item.sha, name: item.path.split("/").pop(), size: item.size || 0 },
      ]),
    );
    refreshKnownLocalImages();
    renderImages();
    renderImageSelect();
    renderAppearancePicker();
    renderWallpaperPicker();
    renderWallpaperLibrary();
    renderAppearancePreview();
  }

  function renderImages() {
    el.mediaList.textContent = "";
    el.mediaCount.textContent = String(imageIndex.size);
    if (!imageIndex.size) {
      el.mediaList.append(
        Object.assign(document.createElement("p"), { className: "muted", textContent: "还没有图片。" }),
      );
      return;
    }
    for (const [path, image] of [...imageIndex.entries()].sort((a, b) =>
      a[1].name.localeCompare(b[1].name),
    )) {
      const row = document.createElement("div");
      row.className = "row";
      const thumb = document.createElement("span");
      thumb.className = "thumb";
      if (image.name.toLowerCase().endsWith(".svg") === false) {
        thumb.style.backgroundImage = `url("https://raw.githubusercontent.com/${CONFIG.owner}/${CONFIG.repo}/${CONFIG.branch}/${encodePath(path)}")`;
      } else {
        thumb.textContent = "SVG";
        thumb.style.display = "flex";
        thumb.style.alignItems = "center";
        thumb.style.justifyContent = "center";
        thumb.style.font = "9px var(--mono)";
        thumb.style.color = "var(--muted)";
      }
      const main = document.createElement("div");
      main.className = "row-main";
      const name = document.createElement("strong");
      name.className = "row-title";
      name.textContent = image.name;
      const meta = document.createElement("div");
      meta.className = "row-meta";
      meta.textContent = `${path} · ${(image.size / 1024).toFixed(1)} KB · 引用写法 /images/${image.name}`;
      main.append(name, meta);

      const actions = document.createElement("div");
      actions.className = "row-actions";
      const copy = document.createElement("button");
      copy.className = "btn ghost small";
      copy.type = "button";
      copy.textContent = "复制路径";
      copy.addEventListener("click", async () => {
        const text = `/images/${image.name}`;
        try {
          await navigator.clipboard.writeText(text);
          toast(`已复制 ${text}`);
        } catch {
          toast(text, "err");
        }
      });
      const insert = document.createElement("button");
      insert.className = "btn small";
      insert.type = "button";
      insert.textContent = "插入到正文";
      insert.addEventListener("click", () => {
        if (el.viewEditor.hidden) {
          toast("请先打开一篇文章的编辑器", "err");
          return;
        }
        insertAtCursor(el.f.body, `![${image.name}](/images/${image.name})`);
      });
      const remove = document.createElement("button");
      remove.className = "btn danger small";
      remove.type = "button";
      remove.textContent = "删除";
      remove.addEventListener("click", () => removeImage(path));
      actions.append(copy, insert, remove);
      row.append(thumb, main, actions);
      el.mediaList.append(row);
    }
  }

  // 已上传图片的公开地址（/images/…），用于「外观」里校验站内路径。
  const builtinLocalImages = ["/images/favicon.svg"];
  const knownLocalImages = new Set(builtinLocalImages);
  function refreshKnownLocalImages() {
    knownLocalImages.clear();
    for (const value of builtinLocalImages) knownLocalImages.add(value);
    for (const path of imageIndex.keys()) knownLocalImages.add(`/${path.replace(/^blog\/source\//, "")}`);
  }

  function renderAppearancePicker() {
    const select = el.appearancePicker;
    if (!select) return;
    const current = select.value;
    select.textContent = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = imageIndex.size ? "从已上传的图片选择…" : "（先在「图片」里上传）";
    select.append(placeholder);
    for (const [path, image] of [...imageIndex.entries()].sort((a, b) =>
      a[1].name.localeCompare(b[1].name),
    )) {
      const option = document.createElement("option");
      option.value = `/${path.replace(/^blog\/source\//, "")}`;
      option.textContent = image.name;
      select.append(option);
    }
    select.value = current && [...select.options].some((option) => option.value === current) ? current : "";
  }

  function renderImageSelect() {
    const current = el.insertImage.value;
    el.insertImage.textContent = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = imageIndex.size ? "插入图片…" : "（还没有图片）";
    el.insertImage.append(placeholder);
    for (const [path, image] of [...imageIndex.entries()].sort((a, b) =>
      a[1].name.localeCompare(b[1].name),
    )) {
      const option = document.createElement("option");
      option.value = path;
      option.textContent = image.name;
      el.insertImage.append(option);
    }
    el.insertImage.value = imageIndex.has(current) ? current : "";
  }

  async function removeImage(path) {
    const image = imageIndex.get(path);
    if (!image) return;
    const publicPath = `/${path.replace(/^blog\/source\//, "")}`;
    const used = [
      el.a.wallpaper?.value.trim() === publicPath ? "站点默认壁纸" : "",
      wallpaperDraft.some((item) => item.url === publicPath) ? "可选背景（访客自选）" : "",
    ].filter(Boolean);
    const ok = await confirmDialog(
      "删除图片",
      `确定删除 ${image.name} 吗？如果还有文章引用它，页面上会出现坏图。${
        used.length ? `\n\n注意：它正被用作${used.join("、")}，删除后访客会看到坏图或回落到默认值。` : ""
      }`,
      "删除并提交",
    );
    if (!ok) return;
    try {
      const result = await deleteFile(path, image.sha, `chore(blog): delete image ${image.name}`);
      log(`已删除图片：${path}（commit ${result.commit?.sha?.slice(0, 7) || "?"}）`, "ok");
      toast("图片已删除");
      imageIndex.delete(path);
      renderImages();
      renderImageSelect();
      watchBuild();
    } catch (error) {
      log(`删除图片失败：${describeError(error)}`, "err");
      toast(describeError(error), "err");
    }
  }

  el.uploadInput.addEventListener("change", async () => {
    const files = [...el.uploadInput.files];
    el.uploadInput.value = "";
    if (!files.length) return;
    for (const file of files) {
      const prepared = await prepareUpload(file);
      if (prepared.error) {
        toast(`跳过 ${file.name}：${prepared.error}`, "err");
        log(`上传被跳过：${file.name}（${prepared.error}）`, "err");
        continue;
      }
      const { name, blob, compressed } = prepared;
      const path = `${CONFIG.imagesDir}/${name}`;
      try {
        const base64 = await fileToBase64(blob);
        const existing = imageIndex.get(path);
        const result = await putBinary(
          path,
          base64,
          existing?.sha,
          `chore(blog): upload image ${name}`,
        );
        log(
          `已上传图片：${path}（${Math.round(blob.size / 1024)} KB${compressed ? `，已从 ${Math.round(file.size / 1024)} KB 压缩` : ""}，commit ${result.commit?.sha?.slice(0, 7) || "?"}）`,
          "ok",
        );
        toast(compressed ? `已压缩并上传 ${name}，正文可用 /images/${name}` : `已上传 ${name}，正文可用 /images/${name}`);
        imageIndex.set(path, { sha: result.content?.sha || existing?.sha || "", name, size: blob.size });
      } catch (error) {
        log(`上传失败 ${file.name}：${describeError(error)}`, "err");
        toast(describeError(error), "err");
      }
    }
    refreshKnownLocalImages();
    renderImages();
    renderImageSelect();
    renderWallpaperPicker();
    refreshBuildStatus().catch(() => {});
    watchBuild();
  });

  /* ---------------- 编辑器 ---------------- */

  function insertAtCursor(textarea, text) {
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
    updatePreview();
  }

  function updatePreview() {
    renderPostPreview();
    const slug = el.f.slug.value.trim();
    const dateValue = fromDateInput(el.f.date.value);
    const valid = /^[a-z0-9][a-z0-9-]*$/.test(slug);
    el.urlPreview.textContent = visibility === "private"
      ? "私密文章（不会生成公开页面）"
      : dateValue && valid ? postUrl(dateValue, slug) : "/…";
    const taken = [...postIndex.entries()].some(
      ([path]) => fileName(path) === slug && path !== editing?.path,
    );
    el.slugWarning.hidden = !(slug && (!valid || taken));
    el.slugWarning.textContent = !valid
      ? " 文件名只能用小写字母、数字和连字符。"
      : taken
        ? " 这个文件名已被另一篇文章使用。"
        : "";
  }

  // Debounce typing; never call GitHub or save when generating a preview.
  let previewTimer;
  let previewSignature = "";
  let previewNeedsReset = true;
  let previewOpenFolds = [];
  let previewPlotViews = [];
  let previewGraphViews = [];
  // 滚动同步（照参考编辑器 blog-apa.pages.dev 的单向行锚点法）：只由编辑区
  // 滚动驱动预览，预览滚动不反写编辑区——程序赋值不会再产生「回声滚动」，
  // 也就没有左右来回拉扯、被带回最前端的问题。编辑区一侧用隐藏镜像层量出
  // 每一行的像素位置（自动换行也准），预览块带源码行号 data-source-line，
  // 两侧按锚点分段插值对齐内容，而不是按总高度百分比硬拉；没有锚点时才
  // 退回比例。重新渲染后同样按编辑区当前的位置重新对齐，编辑区停在哪一
  // 段，预览就停在哪一段，不会跳回最前端。锚点只依赖镜像层：内容/尺寸变
  // 化时标脏，停笔约 200ms 空闲时提前重建，下一次滚动不用现算。
  let scrollAnchorsDirty = true;
  let lineMirror = null;
  let syncRaf = 0;
  let mirrorIdleTimer = 0;
  let previewLoadPending = false;
  const previewFrame = $("#post-preview");
  const scheduleFrame = (callback) => (window.requestAnimationFrame ? window.requestAnimationFrame(callback) : setTimeout(callback, 16));
  // 像洛谷编辑器一样允许「滑过文末」：不往正文里塞空行，只给 textarea 加
  // 一块随编辑区高度计算的底部留白。这样滚到尽头时，最后一行正好停在
  // 编辑区顶部，写结尾时不用一直贴着底部看字。
  const updateEditorOverscroll = () => {
    const ta = el.f.body;
    if (!ta) return;
    const style = window.getComputedStyle(ta);
    const fontSize = parseFloat(style.fontSize) || 12.5;
    const lineHeight = parseFloat(style.lineHeight) || fontSize * 1.9;
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const height = Number.isFinite(ta.clientHeight) ? ta.clientHeight : 0;
    const bottom = height > 0
      ? Math.max(lineHeight, height - paddingTop - lineHeight)
      : lineHeight;
    ta.style.paddingBottom = `${Math.round(bottom)}px`;
    scrollAnchorsDirty = true;
  };
  const ensureLineMirror = () => {
    if (lineMirror) return lineMirror;
    const mirror = document.createElement("div");
    mirror.setAttribute("aria-hidden", "true");
    mirror.style.cssText = "position:absolute;left:-10000px;top:0;visibility:hidden;pointer-events:none;";
    document.body.append(mirror);
    lineMirror = mirror;
    return mirror;
  };
  const rebuildLineMirror = () => {
    const ta = el.f.body;
    const mirror = ensureLineMirror();
    const style = window.getComputedStyle(ta);
    mirror.style.width = `${ta.clientWidth}px`;
    mirror.style.font = style.font;
    mirror.style.lineHeight = style.lineHeight;
    mirror.style.letterSpacing = style.letterSpacing;
    mirror.style.padding = style.padding;
    mirror.style.border = "0";
    mirror.style.boxSizing = "border-box";
    mirror.style.whiteSpace = style.whiteSpace || "pre-wrap";
    mirror.style.overflowWrap = style.overflowWrap || "break-word";
    mirror.style.wordBreak = style.wordBreak || "normal";
    mirror.textContent = "";
    for (const line of ta.value.split("\n")) {
      const div = document.createElement("div");
      div.textContent = line || "\u200b";
      mirror.append(div);
    }
  };
  // 每次同步都按当前文档现算块级锚点（仿洛谷编辑器的按块对齐）：锚点记下
  // 每个块的源码起止行与预览上下沿。普通文本块在块内按行插值；折叠框、
  // 函数图、关系图、独立图片这类「源码行数与渲染高度不成比例」的块整块
  // 对齐——编辑光标落在块源码范围内时预览就停在块顶，不按行数硬摊比例。
  // 折叠框展开时改用其内部块的锚点逐块对齐；未展开时内部块一律跳过。
  const collectScrollAnchors = (doc, scroll) => {
    if (scrollAnchorsDirty) {
      try { rebuildLineMirror(); } catch { /* 镜像不可用时退回比例同步 */ }
      scrollAnchorsDirty = false;
    }
    const anchors = [];
    if (!lineMirror?.children?.length) return anchors;
    const mirrorLineTop = (lineNo) => {
      const kids = lineMirror.children;
      if (lineNo <= 1) return kids[0].offsetTop || 0;
      if (lineNo <= kids.length) return kids[lineNo - 1].offsetTop || 0;
      const last = kids[kids.length - 1];
      return (last.offsetTop || 0) + (last.offsetHeight || 0);
    };
    const isAtomicBlock = (block) => {
      if (block.classList?.contains('md-plot') || block.classList?.contains('md-graph')) return true;
      if (block.classList?.contains('fold-box')) return !block.open;
      if (block.querySelector?.(':scope > img')) return true;
      return false;
    };
    for (const block of doc.querySelectorAll("[data-source-line]")) {
      const parentFold = block.parentElement?.closest?.('details.fold-box');
      if (parentFold && !parentFold.open) continue;
      if (!block.classList?.contains('fold-box')
        && block.parentElement?.closest?.('[data-source-line]') && !parentFold) continue;
      const line = Number(block.dataset.sourceLine);
      if (!Number.isInteger(line) || line < 1 || !lineMirror.children[line - 1]) continue;
      const endLine = Number(block.dataset.sourceEndLine) || line + 1;
      const rect = block.getBoundingClientRect();
      const ta = mirrorLineTop(line);
      const pv = rect.top + (scroll.scrollTop || 0);
      if (!Number.isFinite(ta) || !Number.isFinite(pv)) continue;
      const prev = anchors[anchors.length - 1];
      if (prev && (ta <= prev.ta || pv <= prev.pv)) continue;
      anchors.push({
        ta,
        taEnd: Math.max(mirrorLineTop(endLine), ta),
        pv,
        pvBottom: pv + Math.max(0, rect.height || 0),
        atomic: isAtomicBlock(block),
      });
    }
    return anchors;
  };
  const syncPreviewScroll = () => {
    const ta = el.f.body;
    const doc = previewFrame.contentDocument;
    const scroll = doc?.scrollingElement;
    if (!doc || !scroll) return;
    if ($("#writing-workspace")?.dataset.mode === "edit") return;
    const maxPv = scroll.scrollHeight - scroll.clientHeight;
    if (!(maxPv > 0)) return;
    // 文末留白（滑过文末的 padding-bottom）不能算进同步行程：同步只按正文
    // 本身的可滚范围算百分比与锚点尾段，否则必须把最后一行拉到编辑区最
    // 顶端、滑完整段空白，预览才肯翻到底。留白行程内的滚动一律钳到文末。
    const overscrollBottom = parseFloat(window.getComputedStyle(ta).paddingBottom) || 0;
    const maxTa = Math.max(0, (ta.scrollHeight - ta.clientHeight) - overscrollBottom);
    if (!(maxTa > 0)) {
      // 正文短到本身不用滚：预览直接对齐顶部。
      if (scroll.style) scroll.style.scrollBehavior = "auto";
      scroll.scrollTop = 0;
      return;
    }
    const anchors = collectScrollAnchors(doc, scroll);
    const y = Math.min(ta.scrollTop || 0, maxTa);
    let target;
    if (!anchors.length) {
      // 没有可用锚点时退回按正文总高度比例同步（同样不含文末留白）。
      target = (y / maxTa) * maxPv;
    } else if (y < anchors[0].ta) {
      target = anchors[0].ta > 0 ? (y / anchors[0].ta) * anchors[0].pv : anchors[0].pv;
    } else {
      let i = anchors.length - 1;
      while (i > 0 && anchors[i].ta > y) i -= 1;
      const a = anchors[i];
      if (y < a.taEnd) {
        // 块内部：整块对齐的块停在块顶；普通块按行位置摊到块的渲染高度。
        if (a.atomic) {
          target = a.pv;
        } else {
          const span = a.taEnd - a.ta;
          target = span > 0 ? a.pv + ((y - a.ta) / span) * (a.pvBottom - a.pv) : a.pv;
        }
      } else if (i + 1 < anchors.length) {
        // 块之间的空行区：从上一块下沿过渡到下一块上沿。
        const b = anchors[i + 1];
        const span = b.ta - a.taEnd;
        target = span > 0 ? a.pvBottom + ((y - a.taEnd) / span) * (b.pv - a.pvBottom) : b.pv;
      } else {
        // 最后一块之后：平滑过渡到两侧同时见底。
        const span = maxTa - a.taEnd;
        target = span > 0.5
          ? a.pvBottom + ((y - a.taEnd) / span) * (maxPv - a.pvBottom)
          : (y >= maxTa - 0.5 ? maxPv : a.pvBottom);
      }
    }
    // 预览文档继承了站点的 smooth 滚动；程序对齐必须直接落位，不能播放
    // 一段从旧位置滚到目标位置的物理滚动动画。
    if (scroll.style) scroll.style.scrollBehavior = "auto";
    scroll.scrollTop = Math.max(0, Math.min(maxPv, target));
  };
  const queuePreviewSync = () => {
    if (syncRaf) return;
    syncRaf = scheduleFrame(() => { syncRaf = 0; syncPreviewScroll(); });
  };
  el.f.body.addEventListener("scroll", queuePreviewSync, { passive: true });
  updateEditorOverscroll();
  try { document.fonts?.ready?.then(() => updateEditorOverscroll()); } catch { /* 字体接口不可用时忽略 */ }
  window.addEventListener("resize", () => {
    scrollAnchorsDirty = true;
    updateEditorOverscroll();
  });
  // 预览里拖动图节点后，把坐标写回第 graphIndex 个 ```graph 块的 node 行：
  // 已有 node 行保留 label/color/size 等其它选项，只替换 x/y；边里隐式出现的点
  // 补一行 node: ID ; x=.. ; y=..。positions 为 null 表示重置（删掉所有 x/y）。
  const formatGraphCoord = (value) => String(Number(Number(value).toFixed(2)));
  const rewriteGraphBlockPositions = (markdown, graphIndex, positions) => {
    const lines = String(markdown).split("\n");
    const graphNodeId = /^[A-Za-z0-9_\-\u4e00-\u9fa5]+$/;
    let current = -1;
    for (let i = 0; i < lines.length; i++) {
      if (!/^```graph\s*$/.test(lines[i].trim())) continue;
      current += 1;
      let end = i + 1;
      while (end < lines.length && !/^```\s*$/.test(lines[end].trim())) end += 1;
      if (current !== graphIndex) { i = end; continue; }
      if (end >= lines.length) return null;
      const seen = new Set();
      const bodyLines = lines.slice(i + 1, end).map((line) => {
        const match = /^(\s*(?:node|点|顶点)\s*[:：]\s*)([^;]+?)\s*(?:;\s*(.*))?$/.exec(line);
        if (!match) return line;
        const id = match[2].trim();
        if (!graphNodeId.test(id)) return line;
        seen.add(id);
        const options = (match[3] || "")
          .split(";")
          .map((item) => item.trim())
          .filter(Boolean)
          .filter((item) => !/^(x|y)\s*=/i.test(item));
        const pos = positions?.[id];
        if (pos && Number.isFinite(Number(pos.x)) && Number.isFinite(Number(pos.y))) {
          options.push(`x=${formatGraphCoord(pos.x)}`, `y=${formatGraphCoord(pos.y)}`);
        }
        return options.length ? `${match[1]}${id} ; ${options.join(" ; ")}` : `${match[1]}${id}`;
      });
      if (positions) {
        for (const [id, pos] of Object.entries(positions)) {
          if (seen.has(id) || !graphNodeId.test(id)) continue;
          if (!pos || !Number.isFinite(Number(pos.x)) || !Number.isFinite(Number(pos.y))) continue;
          bodyLines.push(`node: ${id} ; x=${formatGraphCoord(pos.x)} ; y=${formatGraphCoord(pos.y)}`);
        }
      }
      return [...lines.slice(0, i + 1), ...bodyLines, ...lines.slice(end)].join("\n");
    }
    return null;
  };
  const handleGraphPositions = (event) => {
    const detail = event.detail || {};
    const graphIndex = Number(detail.graphIndex || 0);
    const positions = detail.reset ? null : detail.positions;
    if (!detail.reset && (!positions || typeof positions !== "object")) return;
    const next = rewriteGraphBlockPositions(el.f.body.value, graphIndex, positions);
    if (next === null || next === el.f.body.value) return;
    const cursor = Math.min(el.f.body.selectionStart ?? next.length, next.length);
    el.f.body.value = next;
    el.f.body.selectionStart = el.f.body.selectionEnd = cursor;
    el.f.body.dispatchEvent(new window.Event("input", { bubbles: true }));
    updatePreview();
    $("#preview-status").textContent = detail.reset
      ? "图点位已重置为自动布局（改动在源码里，记得保存文章）"
      : "图点位已写回源码（记得保存文章）";
  };
  previewFrame.addEventListener("load", () => {
    previewLoadPending = false;
    // Controlled by the parent: keep the iframe script-free. The plot/graph
    // interactions are attached by this parent page onto the iframe document
    // (same-origin), so the sandboxed iframe itself still runs no scripts.
    // 先把锚点标记为过期：同步要按新文档的块位置与新镜像层重算。
    scrollAnchorsDirty = true;
    try { window.MinxiPreview?.enhance?.(previewFrame.contentDocument); } catch { /* 预览组件未就绪时忽略 */ }
    try { previewFrame.contentDocument?.addEventListener("minxi:graph-positions", handleGraphPositions); } catch { /* 预览未就绪时忽略 */ }
    // 新文档先保持隐藏，对齐完成后再显示，避免用户先看到最前端、再被滚到目标位置。
    // 后续两次校准都已关闭平滑滚动，只会直接落位，不产生物理滚动特效。
    syncPreviewScroll();
    const revealAlignedPreview = () => {
      syncPreviewScroll();
      previewFrame.style.visibility = "";
    };
    if (window.requestAnimationFrame) window.requestAnimationFrame(revealAlignedPreview);
    else revealAlignedPreview();
    setTimeout(() => syncPreviewScroll(), 120);
    try {
      previewFrame.contentDocument?.fonts?.ready?.then(() => {
        scrollAnchorsDirty = true;
        syncPreviewScroll();
      });
    } catch { /* 字体接口不可用时忽略 */ }
  });
  function renderPostPreview() {
    clearTimeout(previewTimer);
    try {
      if (!window.MinxiPreview) throw new Error("预览组件未加载，请刷新页面。");
      const input = {
        title: el.f.title.value,
        description: el.f.description.value,
        body: el.f.body.value,
      };
      const signature = JSON.stringify(input);
      // Switching edit/split/preview modes must not reload a working preview.
      if (!previewNeedsReset && signature === previewSignature) return;
      if (previewNeedsReset) {
        previewOpenFolds = [];
        previewPlotViews = [];
        previewGraphViews = [];
        scrollAnchorsDirty = true;
      } else {
        const doc = previewFrame.contentDocument;
        // During an in-flight srcdoc load retain the last valid snapshot.
        if (doc?.querySelector('.article-content')) {
          previewOpenFolds = [...doc.querySelectorAll('details.fold-box[open][data-preview-fold-key]')]
            .map((fold) => fold.dataset.previewFoldKey);
          // 保存每张函数图当前的平移/缩放范围与显示开关，重渲染后恢复（按出现顺序）。
          previewPlotViews = [...doc.querySelectorAll('.md-plot')].map((figure) => ({
            xMin: figure.dataset.viewXMin, xMax: figure.dataset.viewXMax,
            yMin: figure.dataset.viewYMin, yMax: figure.dataset.viewYMax,
            coords: figure.dataset.viewCoords, intersections: figure.dataset.viewIntersections,
          }));
          previewGraphViews = [...doc.querySelectorAll('.md-graph svg')]
            .map((svg) => svg.getAttribute('data-preview-viewbox') || '');
        }
      }
      // 增量更新：文档已经有正文时只逐块 patch（没变的块保留原 DOM 节点），
      // 不重灌 srcdoc、不隐藏重显，编辑时预览不再一闪一闪；只有首次打开、
      // 切换文章或主题变化才整页灌入。主题写在文档根上，增量路径改不了，
      // 所以主题不一致时回退整页。
      const liveDoc = previewFrame.contentDocument;
      const frameTheme = liveDoc?.documentElement?.getAttribute("data-theme") === "light" ? "light" : "dark";
      const adminTheme = document.documentElement?.dataset?.theme === "light" ? "light" : "dark";
      if (!previewNeedsReset && liveDoc?.querySelector(".article-content")
        && frameTheme === adminTheme && window.MinxiPreview.patch) {
        let patched = false;
        try { patched = window.MinxiPreview.patch(liveDoc, { ...input, openFolds: previewOpenFolds, plotViews: previewPlotViews, graphViews: previewGraphViews }); } catch { patched = false; }
        if (patched) {
          try { window.MinxiPreview.enhance(liveDoc); } catch { /* 预览组件未就绪时忽略 */ }
          previewSignature = signature;
          scrollAnchorsDirty = true;
          syncPreviewScroll();
          $("#preview-status").textContent = "预览已更新 · Markdown / KaTeX / 可点击折叠框 / 函数图可拖动缩放（代码高亮与目录以发布页为准）";
          return;
        }
      }
      previewLoadPending = true;
      previewFrame.style.visibility = "hidden";
      previewFrame.srcdoc = window.MinxiPreview.document({ ...input, openFolds: previewOpenFolds, plotViews: previewPlotViews, graphViews: previewGraphViews });
      previewSignature = signature;
      previewNeedsReset = false;
      $("#preview-status").textContent = "预览已更新 · Markdown / KaTeX / 可点击折叠框 / 函数图可拖动缩放（代码高亮与目录以发布页为准）";
    } catch (error) {
      $("#preview-status").textContent = `预览失败：${error.message}`;
    }
  }
  [el.f.body, el.f.title, el.f.description].forEach((field) => {
    field.addEventListener("input", () => {
      scrollAnchorsDirty = true;
      clearTimeout(previewTimer);
      previewTimer = setTimeout(renderPostPreview, 180);
      // 停笔约 200ms 后提前重建行镜像，下一次滚动不用现算（参考编辑器同款）。
      clearTimeout(mirrorIdleTimer);
      mirrorIdleTimer = setTimeout(() => {
        if (!scrollAnchorsDirty) return;
        if ($("#writing-workspace")?.dataset.mode === "edit") return;
        try { rebuildLineMirror(); scrollAnchorsDirty = false; } catch { /* 镜像不可用时忽略 */ }
      }, 200);
    });
  });
  const setEditorMode = (mode) => {
    $("#writing-workspace").dataset.mode = mode;
    // 纯净（专注）模式：只留正文编辑区，其余后台面板靠 body.zen-editing 的样式隐藏。
    // 编辑区还是同一个 textarea，所以切换模式不会丢未保存内容，也不会触发重渲染。
    document.body.classList.toggle("zen-editing", mode === "zen");
    $$('[data-editor-mode]').forEach((item) => {
      item.setAttribute("aria-pressed", String(item.dataset.editorMode === mode));
    });
    updateEditorOverscroll();
    renderPostPreview();
    if (!previewLoadPending) previewFrame.style.visibility = "";
    // 从纯编辑切回带预览的模式时，按编辑区当前滚动位置把预览对齐过来，
    // 不能让预览从最前端开始；布局刚变，行锚点与文末留白也要重算。
    scrollAnchorsDirty = true;
    scheduleFrame(() => {
      updateEditorOverscroll();
      syncPreviewScroll();
    });
    if (mode === "zen") el.f.body.focus();
  };
  $$('[data-editor-mode]').forEach((button) => {
    button.addEventListener("click", () => setEditorMode(button.dataset.editorMode));
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("zen-editing")) {
      setEditorMode("split");
    }
  });
  /* ---------------- 编辑区 LaTeX 符号搜索（Shift + ↑） ---------------- */
  const latexCategories = [
    ["structures", "结构"],
    ["greek", "希腊字母"],
    ["operators", "运算"],
    ["relations", "关系"],
    ["sets-logic", "集合与逻辑"],
    ["arrows", "箭头"],
    ["big-operators", "大型运算符"],
    ["functions", "函数"],
    ["misc", "其他"],
  ];
  const latexCategoryName = (id) => latexCategories.find(([key]) => key === id)?.[1] || id;
  const latexAutoPreview = (insert) => {
    const fillers = ["a", "b", "c"];
    let used = 0;
    return insert.replace(/\[\]/g, "[n]").replace(/\{\}/g, () => `{${fillers[Math.min(used++, fillers.length - 1)]}}`);
  };
  const latexSymbols = [];
  const addLatexSymbol = (category, command, aliases, options = {}) => {
    if (latexSymbols.some((symbol) => symbol.command === command)) return;
    const insert = options.insert ?? command;
    let cursor = options.cursor;
    if (!cursor && options.cursorAfter) {
      const at = insert.indexOf(options.cursorAfter);
      const pos = at === -1 ? insert.length : at + options.cursorAfter.length;
      cursor = [pos, pos];
    }
    if (!cursor) {
      const braces = insert.indexOf("{}");
      cursor = braces === -1 ? [insert.length, insert.length] : [braces + 1, braces + 1];
    }
    latexSymbols.push({
      category,
      command,
      aliases,
      insert,
      preview: options.preview ?? latexAutoPreview(insert),
      glyph: options.glyph || "",
      cursor,
    });
  };
  const addLatexGroup = (category, entries) => {
    entries.forEach(([command, aliases, options]) => addLatexSymbol(category, command, aliases, options || {}));
  };

  addLatexGroup("structures", [
    ["\\frac{}{}", ["分数", "分式", "除", "分数线", "fraction"]],
    ["\\dfrac{}{}", ["大分数", "显示分数", "分数", "分式"]],
    ["\\tfrac{}{}", ["小分数", "分数", "分式"]],
    ["\\cfrac{}{}", ["连分数", "分数", "分式"]],
    ["\\sqrt{}", ["根号", "平方根", "开方", "根式", "sqrt", "root"]],
    ["\\sqrt[n]{}", ["n次根", "立方根", "根号", "开方"], { insert: "\\sqrt[]{}", cursorAfter: "\\sqrt[", preview: "\\sqrt[3]{x}" }],
    ["^{}", ["上标", "次方", "幂", "指数", "平方", "superscript", "power"], { preview: "x^{2}" }],
    ["_{}", ["下标", "角标", "序号", "subscript"], { preview: "a_{n}" }],
    ["\\binom{}{}", ["组合数", "二项式系数", "组合", "binomial", "choose"]],
    ["\\overline{}", ["上划线", "线段", "共轭", "平均值"]],
    ["\\underline{}", ["下划线"]],
    ["\\hat{}", ["帽", "估计值", "单位向量"]],
    ["\\widehat{}", ["宽帽", "角", "弧"]],
    ["\\bar{}", ["平均值", "均值", "共轭"]],
    ["\\vec{}", ["向量", "箭头", "vector"]],
    ["\\overrightarrow{}", ["向量", "长箭头"]],
    ["\\dot{}", ["一阶导数", "上点", "求导"]],
    ["\\ddot{}", ["二阶导数", "两点"]],
    ["\\tilde{}", ["波浪号", "近似号"]],
    ["\\widetilde{}", ["宽波浪"]],
    ["\\overbrace{}", ["上大括号", "上括号", "brace"]],
    ["\\underbrace{}", ["下大括号", "下括号", "brace"]],
    ["\\overset{}{}", ["上方标注", "上标符号"]],
    ["\\underset{}{}", ["下方标注", "下标符号"]],
    ["\\boxed{}", ["方框", "答案框", "框选"]],
    ["\\cancel{}", ["约去", "划掉", "斜线删除"]],
    ["\\left(\\right)", ["自适应括号", "大圆括号", "圆括号"], { insert: "\\left(\\right)", cursorAfter: "\\left(", preview: "\\left(\\dfrac{a}{b}\\right)" }],
    ["\\left[\\right]", ["自适应方括号", "大方括号", "方括号"], { insert: "\\left[\\right]", cursorAfter: "\\left[", preview: "\\left[\\dfrac{a}{b}\\right]" }],
    ["\\left\\{\\right\\}", ["自适应花括号", "花括号", "集合括号"], { insert: "\\left\\{\\right\\}", cursorAfter: "\\left\\{", preview: "\\left\\{\\dfrac{a}{b}\\right\\}" }],
    ["\\left|\\right|", ["绝对值", "模", "自适应竖线", "absolute"], { insert: "\\left|\\right|", cursorAfter: "\\left|", preview: "\\left|x\\right|" }],
    ["\\langle\\rangle", ["内积", "尖括号", "角括号"], { insert: "\\langle\\rangle", cursorAfter: "\\langle", preview: "\\langle u,v\\rangle" }],
    ["\\lfloor\\rfloor", ["向下取整", "地板", "高斯取整", "floor"], { insert: "\\lfloor\\rfloor", cursorAfter: "\\lfloor", preview: "\\lfloor x\\rfloor" }],
    ["\\lceil\\rceil", ["向上取整", "天花板", "ceil"], { insert: "\\lceil\\rceil", cursorAfter: "\\lceil", preview: "\\lceil x\\rceil" }],
    ["\\begin{matrix}…\\end{matrix}", ["矩阵", "无括号矩阵", "matrix"], { insert: "\\begin{matrix}\n\n\\end{matrix}", cursorAfter: "\\begin{matrix}\n", preview: "\\begin{matrix}a&b\\\\c&d\\end{matrix}" }],
    ["\\begin{pmatrix}…\\end{pmatrix}", ["圆括号矩阵", "矩阵", "matrix"], { insert: "\\begin{pmatrix}\n\n\\end{pmatrix}", cursorAfter: "\\begin{pmatrix}\n", preview: "\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}" }],
    ["\\begin{bmatrix}…\\end{bmatrix}", ["方括号矩阵", "矩阵", "matrix"], { insert: "\\begin{bmatrix}\n\n\\end{bmatrix}", cursorAfter: "\\begin{bmatrix}\n", preview: "\\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}" }],
    ["\\begin{vmatrix}…\\end{vmatrix}", ["行列式", "竖线矩阵", "determinant"], { insert: "\\begin{vmatrix}\n\n\\end{vmatrix}", cursorAfter: "\\begin{vmatrix}\n", preview: "\\begin{vmatrix}a&b\\\\c&d\\end{vmatrix}" }],
    ["\\begin{cases}…\\end{cases}", ["分段函数", "方程组", "大括号分段", "cases"], { insert: "\\begin{cases}\n\n\\end{cases}", cursorAfter: "\\begin{cases}\n", preview: "\\begin{cases}x,&x>0\\\\0,&x=0\\end{cases}" }],
    ["\\begin{aligned}…\\end{aligned}", ["对齐", "多行公式", "等式链", "aligned"], { insert: "\\begin{aligned}\n\n\\end{aligned}", cursorAfter: "\\begin{aligned}\n", preview: "\\begin{aligned}a&=b+c\\\\&=d\\end{aligned}" }],
    ["\\text{}", ["文本", "文字", "中文", "text"]],
    ["\\mathrm{}", ["正体", "直立体", "罗马体", "单位"]],
    ["\\mathbf{}", ["粗体", "黑体", "向量粗体", "bold"]],
    ["\\boldsymbol{}", ["粗斜体", "加粗符号"]],
    ["\\mathbb{}", ["黑板粗体", "数集字母", "空心字母", "blackboard"]],
    ["\\mathcal{}", ["花体", "书法体", "calligraphic"]],
    ["\\mathfrak{}", ["哥特体", "德文尖角体", "fraktur"]],
    ["\\operatorname{}", ["算子名", "函数名", "正体名称"]],
    ["\\\\", ["换行", "新行", "分行"], { insert: "\\\\", preview: "a\\\\b" }],
    ["\\,", ["小空格", "窄空格", "间距"], { preview: "a\\,b" }],
    ["\\quad", ["空格", "大间距", "quad"], { preview: "a\\quad b" }],
    ["\\qquad", ["大空格", "双倍间距"], { preview: "a\\qquad b" }],
  ]);

  addLatexGroup("greek", [
    ["\\alpha", ["阿尔法", "alpha"], { glyph: "α" }], ["\\beta", ["贝塔", "beta"], { glyph: "β" }],
    ["\\gamma", ["伽马", "gamma"], { glyph: "γ" }], ["\\Gamma", ["伽马大写", "伽马函数", "Gamma"], { glyph: "Γ" }],
    ["\\delta", ["德尔塔", "小增量", "delta"], { glyph: "δ" }], ["\\Delta", ["增量", "判别式", "差", "Delta"], { glyph: "Δ" }],
    ["\\epsilon", ["艾普西龙", "小量", "epsilon"], { glyph: "ϵ" }], ["\\varepsilon", ["任意小", "正数", "varepsilon"], { glyph: "ε" }],
    ["\\zeta", ["泽塔", "zeta"], { glyph: "ζ" }], ["\\eta", ["伊塔", "效率", "eta"], { glyph: "η" }],
    ["\\theta", ["西塔", "角度", "theta"], { glyph: "θ" }], ["\\Theta", ["西塔大写", "Theta"], { glyph: "Θ" }],
    ["\\iota", ["约塔", "iota"], { glyph: "ι" }], ["\\kappa", ["卡帕", "曲率", "kappa"], { glyph: "κ" }],
    ["\\lambda", ["拉姆达", "波长", "特征值", "lambda"], { glyph: "λ" }], ["\\Lambda", ["拉姆达大写", "Lambda"], { glyph: "Λ" }],
    ["\\mu", ["缪", "微", "期望", "mu"], { glyph: "μ" }], ["\\nu", ["纽", "频率", "nu"], { glyph: "ν" }],
    ["\\xi", ["克西", "介值点", "xi"], { glyph: "ξ" }], ["\\Xi", ["克西大写", "Xi"], { glyph: "Ξ" }],
    ["\\pi", ["派", "圆周率", "pi"], { glyph: "π" }], ["\\Pi", ["派大写", "Pi"], { glyph: "Π" }],
    ["\\rho", ["柔", "密度", "rho"], { glyph: "ρ" }], ["\\sigma", ["西格玛", "标准差", "sigma"], { glyph: "σ" }],
    ["\\Sigma", ["西格玛大写", "Sigma"], { glyph: "Σ" }], ["\\tau", ["陶", "tau"], { glyph: "τ" }],
    ["\\phi", ["斐", "角度", "欧拉函数", "phi"], { glyph: "ϕ" }], ["\\Phi", ["斐大写", "磁通量", "Phi"], { glyph: "Φ" }],
    ["\\varphi", ["斐异体", "角度", "varphi"], { glyph: "φ" }], ["\\chi", ["卡方", "chi"], { glyph: "χ" }],
    ["\\psi", ["普赛", "波函数", "psi"], { glyph: "ψ" }], ["\\Psi", ["普赛大写", "Psi"], { glyph: "Ψ" }],
    ["\\omega", ["欧米伽", "角速度", "omega"], { glyph: "ω" }], ["\\Omega", ["欧姆", "全集", "样本空间", "Omega"], { glyph: "Ω" }],
  ]);

  addLatexGroup("operators", [
    ["\\pm", ["正负", "加减", "正负号", "plus minus"], { glyph: "±" }], ["\\mp", ["负正", "减加"], { glyph: "∓" }],
    ["\\times", ["乘号", "乘", "叉乘", "times"], { glyph: "×" }], ["\\div", ["除号", "除以", "除"], { glyph: "÷" }],
    ["\\cdot", ["点乘", "内积", "点"], { glyph: "⋅" }], ["\\cdots", ["省略号", "中间省略"], { glyph: "⋯" }],
    ["\\ldots", ["省略号", "低省略"], { glyph: "…" }], ["\\vdots", ["竖省略号"], { glyph: "⋮" }],
    ["\\ddots", ["斜省略号"], { glyph: "⋱" }], ["\\ast", ["星号", "星运算"], { glyph: "∗" }],
    ["\\star", ["星", "star"], { glyph: "⋆" }], ["\\circ", ["复合", "函数复合", "圆圈"], { glyph: "∘" }],
    ["\\bullet", ["实心圆点", "项目点"], { glyph: "•" }], ["\\oplus", ["异或", "直和", "圆加", "xor"], { glyph: "⊕" }],
    ["\\ominus", ["圆减"], { glyph: "⊖" }], ["\\otimes", ["张量积", "圆乘"], { glyph: "⊗" }],
    ["\\odot", ["圆点"], { glyph: "⊙" }], ["\\cap", ["交集", "帽子"], { glyph: "∩" }],
    ["\\cup", ["并集", "杯子"], { glyph: "∪" }], ["\\wedge", ["合取", "逻辑与", "楔形"], { glyph: "∧" }],
    ["\\vee", ["析取", "逻辑或"], { glyph: "∨" }], ["\\setminus", ["差集", "去掉"], { glyph: "∖" }],
  ]);

  addLatexGroup("relations", [
    ["\\leq", ["小于等于", "不大于", "less equal"], { glyph: "≤" }], ["\\geq", ["大于等于", "不小于"], { glyph: "≥" }],
    ["\\neq", ["不等于", "不等"], { glyph: "≠" }], ["\\approx", ["约等于", "近似"], { glyph: "≈" }],
    ["\\equiv", ["恒等", "同余", "等价"], { glyph: "≡" }], ["\\sim", ["相似", "分布", "波浪"], { glyph: "∼" }],
    ["\\simeq", ["近似相等", "相似等"], { glyph: "≃" }], ["\\cong", ["全等", "同构"], { glyph: "≅" }],
    ["\\propto", ["正比", "成比例"], { glyph: "∝" }], ["\\ll", ["远小于"], { glyph: "≪" }],
    ["\\gg", ["远大于"], { glyph: "≫" }], ["\\prec", ["先于", "小于关系"], { glyph: "≺" }],
    ["\\succ", ["后于", "大于关系"], { glyph: "≻" }], ["\\preceq", ["先于等于"], { glyph: "⪯" }],
    ["\\succeq", ["后于等于"], { glyph: "⪰" }], ["\\parallel", ["平行"], { glyph: "∥" }],
    ["\\nparallel", ["不平行"], { glyph: "∦" }], ["\\perp", ["垂直"], { glyph: "⊥" }],
    ["\\mid", ["整除", "竖线", "条件"], { glyph: "∣" }], ["\\nmid", ["不整除"], { glyph: "∤" }],
    ["\\models", ["模型", "推出"], { glyph: "⊨" }], ["\\vdash", ["证明", "推出"], { glyph: "⊢" }],
    ["\\dashv", ["被推出"], { glyph: "⊣" }],
  ]);

  addLatexGroup("sets-logic", [
    ["\\in", ["属于", "元素"], { glyph: "∈" }], ["\\notin", ["不属于"], { glyph: "∉" }],
    ["\\ni", ["包含元素", "含于反向"], { glyph: "∋" }], ["\\subset", ["真子集", "包含于"], { glyph: "⊂" }],
    ["\\subseteq", ["子集", "包含于等于"], { glyph: "⊆" }], ["\\supset", ["真超集"], { glyph: "⊃" }],
    ["\\supseteq", ["超集"], { glyph: "⊇" }], ["\\emptyset", ["空集"], { glyph: "∅" }],
    ["\\varnothing", ["空集"], { glyph: "∅" }], ["\\forall", ["任意", "对于所有", "全称"], { glyph: "∀" }],
    ["\\exists", ["存在", "存在量词"], { glyph: "∃" }], ["\\nexists", ["不存在"], { glyph: "∄" }],
    ["\\neg", ["非", "否定", "not"], { glyph: "¬" }], ["\\land", ["逻辑与", "并且", "and"], { glyph: "∧" }],
    ["\\lor", ["逻辑或", "或者", "or"], { glyph: "∨" }], ["\\Rightarrow", ["推出", "蕴含", "箭头"], { glyph: "⇒" }],
    ["\\Leftarrow", ["反推出", "被推出"], { glyph: "⇐" }], ["\\Leftrightarrow", ["等价", "充要", "当且仅当"], { glyph: "⇔" }],
    ["\\top", ["真", "顶"], { glyph: "⊤" }], ["\\bot", ["假", "底", "矛盾"], { glyph: "⊥" }],
    ["\\therefore", ["所以", "因此"], { glyph: "∴" }], ["\\because", ["因为"], { glyph: "∵" }],
    ["\\aleph", ["阿列夫", "基数"], { glyph: "ℵ" }],
  ]);

  addLatexGroup("arrows", [
    ["\\leftarrow", ["左箭头"], { glyph: "←" }], ["\\rightarrow", ["右箭头", "趋向", "映射"], { glyph: "→" }],
    ["\\leftrightarrow", ["双向箭头"], { glyph: "↔" }], ["\\Leftarrow", ["左粗箭头", "推出"], { glyph: "⇐" }],
    ["\\Rightarrow", ["右粗箭头", "推出"], { glyph: "⇒" }], ["\\Leftrightarrow", ["双向粗箭头", "等价"], { glyph: "⇔" }],
    ["\\uparrow", ["上箭头"], { glyph: "↑" }], ["\\downarrow", ["下箭头"], { glyph: "↓" }],
    ["\\mapsto", ["映射到", "对应"], { glyph: "↦" }], ["\\longmapsto", ["长映射到"], { glyph: "⟼" }],
    ["\\longrightarrow", ["长右箭头", "趋向"], { glyph: "⟶" }], ["\\longleftarrow", ["长左箭头"], { glyph: "⟵" }],
    ["\\longleftrightarrow", ["长双向箭头"], { glyph: "⟷" }], ["\\hookrightarrow", ["钩箭头", "嵌入"], { glyph: "↪" }],
    ["\\twoheadrightarrow", ["双头箭头", "满射"], { glyph: "↠" }], ["\\rightarrowtail", ["尾箭头", "单射"], { glyph: "↣" }],
  ]);

  addLatexGroup("big-operators", [
    ["\\sum_{}^{}", ["求和", "总和", "累加", "sum"], { insert: "\\sum_{}^{}", cursorAfter: "\\sum_{", preview: "\\sum_{i=1}^{n}" }],
    ["\\prod_{}^{}", ["连乘", "求积", "product"], { insert: "\\prod_{}^{}", cursorAfter: "\\prod_{", preview: "\\prod_{i=1}^{n}" }],
    ["\\coprod_{}^{}", ["余积", "coproduct"], { insert: "\\coprod_{}^{}", cursorAfter: "\\coprod_{", preview: "\\coprod_{i=1}^{n}" }],
    ["\\int_{}^{}", ["积分", "定积分", "integral"], { insert: "\\int_{}^{}", cursorAfter: "\\int_{", preview: "\\int_{a}^{b} f(x)\\,\\mathrm{d}x" }],
    ["\\int", ["积分", "不定积分", "integral"], { preview: "\\int f(x)\\,\\mathrm{d}x" }],
    ["\\iint", ["二重积分", "double integral"], { preview: "\\iint_D f" }],
    ["\\iiint", ["三重积分", "triple integral"], { preview: "\\iiint_V f" }],
    ["\\oint", ["曲线积分", "环路积分", "contour"], { preview: "\\oint_C f" }],
    ["\\bigcup_{}^{}", ["大并集", "并集求和"], { insert: "\\bigcup_{}^{}", cursorAfter: "\\bigcup_{", preview: "\\bigcup_{i=1}^{n} A_i" }],
    ["\\bigcap_{}^{}", ["大交集"], { insert: "\\bigcap_{}^{}", cursorAfter: "\\bigcap_{", preview: "\\bigcap_{i=1}^{n} A_i" }],
    ["\\bigoplus_{}^{}", ["大直和", "异或和"], { insert: "\\bigoplus_{}^{}", cursorAfter: "\\bigoplus_{", preview: "\\bigoplus_{i=1}^{n} V_i" }],
    ["\\bigotimes_{}^{}", ["大张量积"], { insert: "\\bigotimes_{}^{}", cursorAfter: "\\bigotimes_{", preview: "\\bigotimes_{i=1}^{n} V_i" }],
    ["\\lim_{}", ["极限", "趋于", "limit"], { insert: "\\lim_{}", preview: "\\lim_{x\\to\\infty}" }],
    ["\\limsup_{}", ["上极限"], { insert: "\\limsup_{}", preview: "\\limsup_{n\\to\\infty}" }],
    ["\\liminf_{}", ["下极限"], { insert: "\\liminf_{}", preview: "\\liminf_{n\\to\\infty}" }],
  ]);

  addLatexGroup("functions", [
    ["\\sin", ["正弦", "sine"]], ["\\cos", ["余弦", "cosine"]], ["\\tan", ["正切", "tangent"]],
    ["\\cot", ["余切"]], ["\\sec", ["正割"]], ["\\csc", ["余割"]],
    ["\\arcsin", ["反正弦"]], ["\\arccos", ["反余弦"]], ["\\arctan", ["反正切"]],
    ["\\sinh", ["双曲正弦"]], ["\\cosh", ["双曲余弦"]], ["\\tanh", ["双曲正切"]],
    ["\\ln", ["自然对数", "log"]], ["\\log_{}", ["对数", "log"], { insert: "\\log_{}", preview: "\\log_{2} n" }],
    ["\\lg", ["常用对数"]], ["\\exp", ["指数函数", "e的幂"]],
    ["\\max", ["最大值", "max"]], ["\\min", ["最小值", "min"]], ["\\sup", ["上确界"]],
    ["\\inf", ["下确界"]], ["\\det", ["行列式", "determinant"]], ["\\dim", ["维数", "dimension"]],
    ["\\gcd", ["最大公约数", "gcd"]], ["\\ker", ["核", "零空间", "kernel"]],
    ["\\deg", ["次数", "度", "degree"]], ["\\Pr", ["概率", "probability"]],
    ["\\bmod", ["取模", "取余", "mod"]], ["\\pmod{}", ["同余模", "模", "modulo"], { insert: "\\pmod{}", preview: "a\\equiv b\\pmod{m}" }],
  ]);

  addLatexGroup("misc", [
    ["\\infty", ["无穷", "无限", "infinity"], { glyph: "∞" }], ["\\partial", ["偏导数", "偏微分", "partial"], { glyph: "∂" }],
    ["\\nabla", ["梯度", "散度", "旋度", "倒三角", "nabla"], { glyph: "∇" }], ["'", ["导数", "撇", "一阶导"], { insert: "'", preview: "f'(x)" }],
    ["^\\circ", ["度", "角度单位", "度数", "degree"], { insert: "^\\circ", preview: "90^\\circ", glyph: "°" }],
    ["^\\top", ["转置", "矩阵转置", "transpose"], { insert: "^\\top", preview: "A^\\top" }],
    ["\\angle", ["角", "角度符号", "angle"], { glyph: "∠" }], ["\\triangle", ["三角形", "triangle"], { glyph: "△" }],
    ["\\square", ["正方形", "方框", "证毕"], { glyph: "□" }], ["\\blacksquare", ["实心方", "证毕", "qed"], { glyph: "■" }],
    ["\\checkmark", ["对勾", "勾选", "正确"], { glyph: "✓" }], ["\\hbar", ["约化普朗克"], { glyph: "ℏ" }],
    ["\\ell", ["手写l", "小写L"], { glyph: "ℓ" }], ["\\Re", ["实部"], { glyph: "ℜ" }],
    ["\\Im", ["虚部"], { glyph: "ℑ" }], ["\\%", ["百分号", "百分比"], { glyph: "%" }],
    ["\\$", ["美元", "钱"], { glyph: "$" }], ["\\&", ["和号", "连接符"], { glyph: "&" }],
    ["\\#", ["井号", "编号"], { glyph: "#" }], ["\\_", ["下划线符号"], { glyph: "_" }],
    ["\\{", ["左花括号", "集合"], { glyph: "{" }], ["\\}", ["右花括号", "集合"], { glyph: "}" }],
  ]);

  const latexPicker = $("#latex-picker");
  const latexSearchInput = $("#latex-symbol-search");
  const latexGrid = $("#latex-symbol-grid");
  const latexTabs = $("#latex-category-tabs");
  const latexCommandDetail = $("#latex-symbol-command");
  const latexSymbolDetail = $("#latex-symbol-detail");
  const latexPreviewCache = new Map();
  let latexPickerSelection = null;
  let latexPickerCategory = "all";
  let latexPickerActive = 0;
  let latexPickerResults = [];
  const latexRecentKey = "minxi:latex-recent";
  const readLatexRecent = () => {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(latexRecentKey) || "[]");
      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
    } catch {
      return [];
    }
  };
  const recordLatexRecent = (symbol) => {
    try {
      const next = [symbol.command, ...readLatexRecent().filter((item) => item !== symbol.command)].slice(0, 18);
      window.localStorage.setItem(latexRecentKey, JSON.stringify(next));
    } catch { /* 本地存储不可用时不影响插入 */ }
  };
  const recentLatexSymbols = () => readLatexRecent()
    .map((command) => latexSymbols.find((symbol) => symbol.command === command))
    .filter(Boolean);
  const latexSubsequence = (needle, haystack) => {
    if (!needle) return true;
    let index = 0;
    for (const char of haystack) {
      if (char === needle[index]) index += 1;
      if (index >= needle.length) return true;
    }
    return false;
  };
  const scoreLatexSymbol = (symbol, query) => {
    const command = symbol.command.toLocaleLowerCase();
    const bare = command.replace(/^\\+/, "");
    const aliases = symbol.aliases.map((alias) => alias.toLocaleLowerCase());
    if (bare === query || command === query || command === `\\${query}`) return 0;
    if (bare.startsWith(query)) return 1;
    if (symbol.glyph === query || aliases.some((alias) => alias === query)) return 2;
    if (aliases.some((alias) => alias.startsWith(query))) return 3;
    if (bare.includes(query)) return 4;
    if (aliases.some((alias) => alias.includes(query))) return 5;
    if (latexSubsequence(query, bare)) return 6;
    if (aliases.some((alias) => latexSubsequence(query, alias))) return 7;
    return Number.POSITIVE_INFINITY;
  };
  const currentLatexResults = () => {
    const query = latexSearchInput.value.trim().toLocaleLowerCase().replace(/^\\+/, "");
    if (query) {
      return latexSymbols
        .map((symbol, index) => ({ symbol, index, score: scoreLatexSymbol(symbol, query) }))
        .filter((item) => Number.isFinite(item.score))
        .sort((a, b) => a.score - b.score || a.index - b.index)
        .map((item) => item.symbol);
    }
    if (latexPickerCategory === "recent") return recentLatexSymbols();
    if (latexPickerCategory === "all") return [...latexSymbols];
    return latexSymbols.filter((symbol) => symbol.category === latexPickerCategory);
  };
  const latexPreviewHtml = (symbol) => {
    if (!latexPreviewCache.has(symbol.command)) {
      latexPreviewCache.set(symbol.command, window.MinxiPreview?.renderLatex?.(symbol.preview) || "");
    }
    return latexPreviewCache.get(symbol.command);
  };
  const setLatexPickerActive = (index, scroll = false) => {
    if (!latexPickerResults.length) return;
    latexPickerActive = Math.min(Math.max(index, 0), latexPickerResults.length - 1);
    [...latexGrid.querySelectorAll("[data-latex-index]")].forEach((button) => {
      button.classList.toggle("active", Number(button.dataset.latexIndex) === latexPickerActive);
    });
    const symbol = latexPickerResults[latexPickerActive];
    latexCommandDetail.textContent = symbol.command;
    latexSymbolDetail.textContent = `${latexCategoryName(symbol.category)} · ${symbol.aliases.join(" · ")}`;
    if (scroll) latexGrid.querySelector(`[data-latex-index="${latexPickerActive}"]`)?.scrollIntoView({ block: "nearest" });
  };
  const renderLatexTabs = () => {
    const tabs = [{ id: "all", name: "全部" }];
    if (recentLatexSymbols().length) tabs.push({ id: "recent", name: "最近" });
    tabs.push(...latexCategories.map(([id, name]) => ({ id, name })));
    latexTabs.replaceChildren(...tabs.map((tab) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = tab.name;
      button.dataset.latexCategory = tab.id;
      button.classList.toggle("active", !latexSearchInput.value.trim() && latexPickerCategory === tab.id);
      button.setAttribute("aria-pressed", String(latexPickerCategory === tab.id));
      return button;
    }));
  };
  const renderLatexResults = () => {
    latexPickerResults = currentLatexResults();
    latexPickerActive = 0;
    renderLatexTabs();
    if (!latexPickerResults.length) {
      const empty = document.createElement("p");
      empty.className = "latex-picker-empty";
      empty.textContent = latexSearchInput.value.trim() ? "没有匹配的符号，换个命令或中文叫法试试。" : "还没有用过的符号，搜一个插入后会出现在这里。";
      latexGrid.replaceChildren(empty);
      latexCommandDetail.textContent = "没有匹配的符号";
      latexSymbolDetail.textContent = "可搜 \\pm、正负、积分、分数等";
      return;
    }
    const nodes = latexPickerResults.map((symbol, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "latex-symbol-card";
      button.dataset.latexIndex = String(index);
      button.title = `${symbol.command}（${symbol.aliases.join(" · ")}）`;
      button.setAttribute("aria-label", `插入 ${symbol.command}，${symbol.aliases.join("、")}`);
      const preview = document.createElement("span");
      preview.className = "latex-symbol-preview";
      // 矩阵/分段/对齐等宽预览加 is-wide，CSS 缩小一号完整显示。
      if (!symbol.glyph && String(symbol.preview || "").length > 22) preview.classList.add("is-wide");
      if (symbol.glyph) preview.textContent = symbol.glyph;
      else {
        const html = latexPreviewHtml(symbol);
        if (html) preview.innerHTML = html;
        else preview.textContent = symbol.preview;
      }
      const command = document.createElement("span");
      command.className = "latex-symbol-name";
      command.textContent = symbol.command;
      button.append(preview, command);
      return button;
    });
    latexGrid.replaceChildren(...nodes);
    setLatexPickerActive(0);
  };
  const restoreLatexEditorFocus = (selection = latexPickerSelection) => {
    el.f.body.focus({ preventScroll: true });
    if (!selection) return;
    const start = Math.min(selection.start, el.f.body.value.length);
    const end = Math.min(selection.end, el.f.body.value.length);
    el.f.body.selectionStart = start;
    el.f.body.selectionEnd = end;
  };
  const openLatexPicker = () => {
    latexPickerSelection = {
      start: el.f.body.selectionStart ?? el.f.body.value.length,
      end: el.f.body.selectionEnd ?? el.f.body.value.length,
    };
    latexPickerCategory = "all";
    latexSearchInput.value = "";
    latexPicker.hidden = false;
    renderLatexResults();
    setTimeout(() => latexSearchInput.focus(), 0);
  };
  const closeLatexPicker = (restoreFocus = true) => {
    if (latexPicker.hidden) return;
    latexPicker.hidden = true;
    if (restoreFocus) restoreLatexEditorFocus();
  };
  const insertLatexSymbol = (symbol) => {
    if (!symbol) return;
    recordLatexRecent(symbol);
    const saved = latexPickerSelection || {
      start: el.f.body.selectionStart ?? el.f.body.value.length,
      end: el.f.body.selectionEnd ?? el.f.body.value.length,
    };
    const start = Math.min(saved.start, el.f.body.value.length);
    const end = Math.min(saved.end, el.f.body.value.length);
    el.f.body.value = el.f.body.value.slice(0, start) + symbol.insert + el.f.body.value.slice(end);
    latexPicker.hidden = true;
    el.f.body.focus({ preventScroll: true });
    el.f.body.selectionStart = start + symbol.cursor[0];
    el.f.body.selectionEnd = start + symbol.cursor[1];
    el.f.body.dispatchEvent(new window.Event("input", { bubbles: true }));
    updatePreview();
  };
  latexTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-latex-category]");
    if (!button) return;
    latexPickerCategory = button.dataset.latexCategory;
    latexSearchInput.value = "";
    renderLatexResults();
    latexSearchInput.focus();
  });
  latexGrid.addEventListener("mouseover", (event) => {
    const button = event.target.closest("[data-latex-index]");
    if (button) setLatexPickerActive(Number(button.dataset.latexIndex));
  });
  latexGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-latex-index]");
    if (button) insertLatexSymbol(latexPickerResults[Number(button.dataset.latexIndex)]);
  });
  latexSearchInput.addEventListener("input", renderLatexResults);
  latexSearchInput.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      closeLatexPicker();
      return;
    }
    if (!latexPickerResults.length) return;
    const columns = Math.max(1, (window.getComputedStyle(latexGrid).gridTemplateColumns || "").split(" ").filter(Boolean).length || 6);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setLatexPickerActive(latexPickerActive + columns, true);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setLatexPickerActive(latexPickerActive - columns, true);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      const collapsed = latexSearchInput.selectionStart === latexSearchInput.selectionEnd;
      const atBoundary = event.key === "ArrowLeft"
        ? collapsed && latexSearchInput.selectionStart === 0
        : collapsed && latexSearchInput.selectionStart === latexSearchInput.value.length;
      if (atBoundary) {
        event.preventDefault();
        setLatexPickerActive(latexPickerActive + (event.key === "ArrowLeft" ? -1 : 1), true);
      }
    } else if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      insertLatexSymbol(latexPickerResults[latexPickerActive]);
    }
  });
  $("#close-latex-picker").addEventListener("click", () => closeLatexPicker());
  $("#latex-picker-backdrop").addEventListener("click", () => closeLatexPicker());
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !latexPicker.hidden) {
      event.preventDefault();
      event.stopPropagation();
      closeLatexPicker();
    }
  }, true);
  el.f.body.addEventListener("keydown", (event) => {
    if (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && event.key === "ArrowUp" && !event.isComposing) {
      event.preventDefault();
      openLatexPicker();
    }
  });
  $("#insert-latex-symbol").addEventListener("click", openLatexPicker);

  $("#insert-math").addEventListener("click", () => {
    insertAtCursor(el.f.body, "\n\n$$\nf(n) = \\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\n$$\n\n");
  });

  $("#insert-fold").addEventListener("change", (event) => {
    const kind = event.target.value;
    if (kind !== "info" && kind !== "success") return;
    insertAtCursor(el.f.body, `\n\n:::${kind}[${kind === "info" ? "提示" : "成功"}]\n\n在这里写内容，支持 **Markdown** 和 $a_i$ 公式。\n\n:::\n\n`);
    event.target.value = "";
  });

  $("#insert-plot").addEventListener("click", () => {
    insertAtCursor(el.f.body, "\n\n```plot\ntitle: 函数图像\nf: x^2 - 2x + 1 ; color=red\nf: -x + 3 ; color=green\npoints: (1, 0), (3, 2) ; connect=true ; color=blue\nx: -3, 5\ncoords: on\nintersections: on\n```\n\n");
  });

  $("#insert-graph").addEventListener("change", (event) => {
    const mode = ["reader", "none", "components", "bridges", "mst", "bipartite", "vbcc", "ebcc", "dfs"].includes(event.target.value) ? event.target.value : "";
    if (!mode) return;
    insertAtCursor(el.f.body, "\n\n```graph\ntitle: 示例图\nalgo: " + mode + "\ndirected: true\nnode: A ; label=起点 ; color=red\nnode: B\nnode: C\nedge: A -> B ; label=一步 ; weight=1\nedge: B -> C ; weight=2\nedge: C -- A ; weight=5\n```\n\n");
    event.target.value = "";
  });

  function showEditor() {
    previewNeedsReset = true;
    el.viewApp.hidden = true;
    el.viewEditor.hidden = false;
    updateEditorOverscroll();
    scheduleFrame(() => updateEditorOverscroll());
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function hideEditor() {
    editing = null;
    snapshots.editor = null; // 已经离开编辑器，不再提醒
    el.viewEditor.hidden = true;
    el.viewApp.hidden = false;
    el.editorStatus.textContent = "";
  }

  async function openEditor(path) {
    const known = postIndex.get(path);
    el.editorTitle.textContent = `编辑：${known?.title || fileName(path)}`;
    editing = { path, sha: known?.sha || "", isNew: false };
    el.deletePost.hidden = false;
    el.editorStatus.textContent = "正在读取…";
    showEditor();
    try {
      const file = await getFile(path);
      // 读取期间可能已经点了「← 返回列表」或换去编辑另一篇；这时不能再往回填，
      // 否则会写进一个已经关掉的编辑器（editing 已为 null）。
      if (!editing || editing.path !== path) return;
      editing.sha = file.sha;
      const { data, body } = parseFrontMatter(file.text);
      el.f.title.value = String(data.title || "");
      el.f.slug.value = fileName(path);
      el.f.date.value = data.date
        ? String(data.date).replace(" ", "T").slice(0, 16)
        : toDatetimeLocal(new Date());
      el.f.categories.value = asList(data.categories).join(", ");
      el.f.tags.value = asList(data.tags).join(", ");
      el.f.description.value = String(data.description || "");
      el.f.accent.value = String(data.accent || "");
      el.f.sample.checked = String(data.sample || "") === "true";
      setVisibility(String(data.published || "") === "false" ? "private" : "public");
      setPinned(Number(data.sticky) > 0);
      el.f.body.value = body.replace(/^\n+/, "");
      snapshots.editor = editorSnapshotValue();
      el.editorStatus.textContent = `已加载 ${path}（${(file.size / 1024).toFixed(1)} KB）`;
      log(`打开编辑：${path}`);
      updatePreview();
    } catch (error) {
      el.editorStatus.textContent = describeError(error);
      log(`打开失败：${describeError(error)}`, "err");
    }
  }

  function openNewPost() {
    editing = { path: "", sha: "", isNew: true };
    el.editorTitle.textContent = "新建文章";
    el.deletePost.hidden = true;
    el.f.title.value = "";
    el.f.slug.value = "";
    el.f.date.value = toDatetimeLocal(new Date());
    el.f.categories.value = "学习笔记";
    el.f.tags.value = "";
    el.f.description.value = "";
    el.f.accent.value = "";
    el.f.sample.checked = false;
    setVisibility("public");
    setPinned(false);
    el.f.body.value = "";
    delete el.f.slug.dataset.touched;
    snapshots.editor = editorSnapshotValue();
    el.editorStatus.textContent = "填写后点「保存并提交」。";
    showEditor();
    el.f.title.focus();
    updatePreview();
  }

  function readForm() {
    const title = el.f.title.value.trim();
    const slug = el.f.slug.value.trim();
    const dateValue = fromDateInput(el.f.date.value);
    const errors = [];
    if (!title) errors.push("标题不能为空");
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug))
      errors.push("文件名只能用小写字母、数字和连字符（例如 binary-search）");
    if (!dateValue) errors.push("日期不能为空");
    const clash = [...postIndex.entries()].find(
      ([path]) => fileName(path) === slug && path !== editing?.path,
    );
    if (clash) errors.push(`文件名 ${slug} 已被 ${clash[0]} 使用`);
    return {
      errors,
      title,
      slug,
      date: dateValue,
      categories: splitList(el.f.categories.value),
      tags: splitList(el.f.tags.value),
      description: el.f.description.value.trim(),
      accent: el.f.accent.value,
      sample: el.f.sample.checked,
      visibility,
      pinned,
      body: el.f.body.value,
      path: `${CONFIG.postsDir}/${slug}.md`,
    };
  }

  async function savePost() {
    if (el.savePost.disabled || deletingPosts.size) return;
    const fields = readForm();
    if (fields.errors.length) {
      el.editorStatus.textContent = fields.errors.join("；");
      toast(fields.errors[0], "err");
      return;
    }
    if (new Date(fields.date.replace(" ", "T")) > new Date()) {
      const ok = await confirmDialog(
        "日期在未来",
        "站点配置 future: false，日期晚于当前时间的文章不会被发布。仍要保存吗？",
        "仍然保存",
      );
      if (!ok) return;
    }
    const markdown = buildMarkdown(fields);
    busy(el.savePost, true, "提交中…");
    el.editorStatus.textContent = "正在提交到 GitHub…";
    try {
      let submittedSha = "";
      const renamed = !editing.isNew && editing.path && editing.path !== fields.path;
      if (renamed) {
        const created = await putFile(fields.path, markdown, "", `feat(blog): rename post to ${fields.slug}`);
        const removed = await deleteFile(editing.path, editing.sha, `chore(blog): remove renamed post ${fileName(editing.path)}`);
        submittedSha = removed.commit?.sha || "";
        postIndex.delete(editing.path);
        editing = { path: fields.path, sha: created.content?.sha || "", isNew: false };
        snapshots.editor = editorSnapshotValue();
        log(`已重命名：${editing.path} → ${fields.path}（两次提交，commit ${created.commit?.sha?.slice(0, 7) || "?"}）`, "ok");
      } else {
        const result = await putFile(
          fields.path,
          markdown,
          editing.isNew ? "" : editing.sha,
          editing.isNew
            ? `feat(blog): add post ${fields.slug}`
            : `docs(blog): update post ${fields.slug}`,
        );
        submittedSha = result.commit?.sha || "";
        editing = { path: fields.path, sha: result.content?.sha || "", isNew: false };
        snapshots.editor = editorSnapshotValue();
        log(
          `${editing.isNew ? "已新建" : "已保存"}：${fields.path}（commit ${
            result.commit?.sha?.slice(0, 7) || "?"
          }）`,
          "ok",
        );
      }
      el.editorTitle.textContent = `编辑：${fields.title}`;
      el.deletePost.hidden = false;
      el.editorStatus.textContent = fields.visibility === "private"
        ? "已提交为私密文章。公开站点不会生成这篇文章，之后可在后台继续编辑。"
        : `已提交。发布地址 ${postUrl(fields.date, fields.slug)}，静态页面约 1–2 分钟后更新。`;
      toast("已提交，GitHub Actions 正在重新生成站点");
      postIndex.set(fields.path, { ...fields, published: fields.visibility !== "private", sha: editing.sha, size: markdown.length });
      await refreshPosts().catch(() => {});
      if (editing?.path) editing.sha = postIndex.get(editing.path)?.sha || editing.sha;
      watchBuild(submittedSha);
    } catch (error) {
      el.editorStatus.textContent = describeError(error);
      log(`保存失败：${describeError(error)}`, "err");
      toast(describeError(error), "err");
    } finally {
      busy(el.savePost, false);
    }
  }

  el.newPostButton.addEventListener("click", openNewPost);
  el.savePost.addEventListener("click", savePost);
  /** 「← 返回列表」会把编辑器里的草稿丢掉，所以有改动时先问一句。
     这是唯一「站内离开编辑器」的入口（删除文章那条路径自己也确认过）。 */
  async function leaveEditor() {
    if (editorDirty()) {
      const title = el.f.title.value.trim();
      const label = title ? `「${title}」` : editing?.isNew ? "这篇新建的文章" : "当前文章";
      const ok = await confirmDialog(
        "还有未保存的修改",
        `${label}的改动还没提交，返回列表后会丢失。确定要放弃吗？`,
        "放弃修改",
      );
      if (!ok) return; // 留在编辑器里，草稿还在
    }
    hideEditor();
  }
  el.cancelEdit.addEventListener("click", leaveEditor);
  el.f.date.addEventListener("input", updatePreview);
  el.f.title.addEventListener("input", () => {
    if (editing?.isNew && !el.f.slug.dataset.touched) {
      el.f.slug.value = slugify(el.f.title.value);
      updatePreview();
    }
  });
  el.f.slug.addEventListener("input", () => {
    el.f.slug.dataset.touched = "1";
    updatePreview();
  });
  el.insertMore.addEventListener("click", () => insertAtCursor(el.f.body, "\n<!-- more -->\n"));
  el.insertImage.addEventListener("change", () => {
    const path = el.insertImage.value;
    if (!path) return;
    const image = imageIndex.get(path);
    insertAtCursor(el.f.body, `![${image?.name || path}](/images/${image?.name || path})`);
    el.insertImage.value = "";
  });
  el.deletePost.addEventListener("click", async () => {
    if (!editing?.path) return;
    await removePost(editing.path, el.deletePost);
  });
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      if (!el.viewEditor.hidden) {
        event.preventDefault();
        savePost();
      } else if (!el.tabAbout.hidden && !el.viewApp.hidden) {
        event.preventDefault();
        saveAbout();
      } else if (!el.tabAppearance.hidden && !el.viewApp.hidden) {
        event.preventDefault();
        saveAppearance();
      }
    }
  });

  /* ---------------- 未保存的修改（防误触：关闭 / 刷新前提醒） ----------------
     三个可编辑的地方各自记住「最后一次读取或保存成功时的内容」，
     离开页面时只要有一处对不上，就弹出浏览器自带的确认框（离开 / 取消）。
     主题按钮、图片预览这类只影响本机的操作不写进快照，因此不会误报。 */

  const snapshots = { editor: null, appearance: null, about: null };

  function editorSnapshotValue() {
    return JSON.stringify({
      title: el.f.title.value,
      slug: el.f.slug.value,
      date: el.f.date.value,
      categories: el.f.categories.value,
      tags: el.f.tags.value,
      accent: el.f.accent.value,
      description: el.f.description.value,
      sample: el.f.sample.checked,
      visibility,
      pinned,
      body: el.f.body.value,
    });
  }

  function appearanceSnapshotValue() {
    try {
      return JSON.stringify(readAppearanceForm());
    } catch {
      return null;
    }
  }

  const aboutSnapshotValue = () => (el.aboutEditor ? el.aboutEditor.value : null);

  /** 编辑器里的内容是否和「最后一次读取或保存成功时」不一样。 */
  function editorDirty() {
    return (
      !el.viewEditor.hidden &&
      !!editing &&
      snapshots.editor !== null &&
      editorSnapshotValue() !== snapshots.editor
    );
  }

  /** 有未保存内容时返回简短说明（例如「文章「二分查找笔记」」），没有则返回空数组。 */
  function unsavedWork() {
    const pending = [];
    if (editorDirty()) {
      const name = el.f.title.value.trim() || fileName(editing.path || "");
      pending.push(editing.isNew ? `新建的文章${name ? `「${name}」` : ""}` : `文章「${name}」`);
    }
    if (snapshots.appearance !== null && appearanceSnapshotValue() !== snapshots.appearance) {
      pending.push("「外观」里的设置");
    }
    if (snapshots.about !== null && aboutSnapshotValue() !== snapshots.about) {
      pending.push("「个人简介」");
    }
    return pending;
  }

  window.addEventListener("beforeunload", (event) => {
    const pending = unsavedWork();
    if (!pending.length) return undefined;
    // 现代浏览器只显示自带的提示语（"更改可能不会保存"），但两个字段都要设：
    // preventDefault() 是标准做法，returnValue 兼容旧浏览器。
    const message = `你有未保存的修改（${pending.join("、")}），离开或关闭页面后会丢失，确定要离开吗？`;
    event.preventDefault();
    event.returnValue = message;
    return message;
  });

  /* ---------------- 个人简介 / 关于页 ---------------- */

  async function loadAbout() {
    el.aboutStatus.textContent = "正在加载…";
    try {
      const file = await getFile(CONFIG.aboutPath);
      aboutState = { sha: file.sha, text: file.text };
      el.aboutEditor.value = file.text;
      snapshots.about = aboutSnapshotValue();
      el.aboutStatus.textContent = `已加载（${(file.size / 1024).toFixed(1)} KB）`;
      log(`读取 ${CONFIG.aboutPath}`);
    } catch (error) {
      el.aboutStatus.textContent = describeError(error);
      log(`读取关于页失败：${describeError(error)}`, "err");
    }
  }

  async function saveAbout() {
    const text = el.aboutEditor.value;
    if (!/^---\r?\n[\s\S]*?\r?\n---/.test(text)) {
      const ok = await confirmDialog(
        "缺少元信息",
        "文件开头没有 --- 包裹的元信息（title / layout / description）。缺少 layout: page 可能导致页面显示异常。仍要保存吗？",
        "仍然保存",
      );
      if (!ok) return;
    }
    busy(el.aboutSave, true, "提交中…");
    el.aboutStatus.textContent = "正在提交…";
    try {
      const result = await putFile(
        CONFIG.aboutPath,
        text,
        aboutState.sha,
        "docs(blog): update about page",
      );
      aboutState = { sha: result.content?.sha || aboutState.sha, text };
      snapshots.about = aboutSnapshotValue();
      el.aboutStatus.textContent = `已提交（commit ${result.commit?.sha?.slice(0, 7) || "?"}），约 1–2 分钟后生效。`;
      log(`已保存 ${CONFIG.aboutPath}`, "ok");
      toast("个人简介已提交");
      watchBuild();
    } catch (error) {
      el.aboutStatus.textContent = describeError(error);
      log(`保存关于页失败：${describeError(error)}`, "err");
      toast(describeError(error), "err");
    } finally {
      busy(el.aboutSave, false);
    }
  }

  el.aboutSave.addEventListener("click", saveAbout);
  el.aboutReload.addEventListener("click", loadAbout);

  /* ---------------- 外观：头像 / 壁纸 / 网页图标 ---------------- */

  // 与前台共用 lib/appearance.cjs（经 tools/build-assets.mjs 打包成 appearance.js）。
  function appearanceApi() {
    const api = window.MinxiAppearance;
    if (!api || typeof api.isSafeImageUrl !== "function") {
      throw new Error("外观模块（appearance.js）没有加载成功，请刷新页面后重试。");
    }
    return api;
  }

  const appearancePreviewFailures = { avatar: false, favicon: false };

  function readAppearanceForm() {
    return {
      avatar: el.a.avatar.value.trim(),
      wallpaper: el.a.wallpaper.value.trim(),
      favicon: el.a.favicon.value.trim(),
      wallpaperDim: Number(el.a.dim.value),
      wallpaperBlur: Number(el.a.blur.value),
      wallpapers: wallpaperDraft.map((item) => ({ ...item })),
      theme: el.a.theme.value,
    };
  }

  function fillAppearanceForm(value) {
    // 重新加载 / 填入默认值：预览也回到「站点默认」，避免停留在上一张可选背景上。
    wallpaperPreview = null;
    el.a.avatar.value = value.avatar;
    el.a.wallpaper.value = value.wallpaper;
    el.a.favicon.value = value.favicon;
    el.a.dim.value = String(value.wallpaperDim);
    el.a.blur.value = String(value.wallpaperBlur);
    el.a.theme.value = value.theme;
    wallpaperDraft = value.wallpapers.map((item) => ({ ...item }));
    appearancePreviewFailures.avatar = false;
    appearancePreviewFailures.favicon = false;
    renderWallpaperLibrary();
    renderAppearancePreview();
  }

  // 地址分两类：errors 会阻止提交，warnings 只是提醒（可在确认后继续）。
  function inspectAppearanceDraft(draft, api) {
    const errors = [];
    const warnings = [];
    const fields = [
      ["avatar", "头像"],
      ["wallpaper", "壁纸"],
      ["favicon", "网页图标"],
    ];
    for (const [key, label] of fields) {
      const value = draft[key];
      if (!value) {
        if (key === "favicon") errors.push("网页图标不能留空（默认值 /images/favicon.svg）。");
        continue;
      }
      if (!api.isSafeImageUrl(value)) {
        errors.push(
          `${label}地址不合法：只能是以 https:// 开头的外链或以 / 开头的站内路径，且不能包含引号、括号、空格、反斜杠等字符。`,
        );
      } else if (value.startsWith("/") && !knownLocalImages.has(value)) {
        warnings.push(
          `${label}指向站内路径 ${value}，但它不在已上传的图片列表里；构建检查会因为找不到这个文件而失败。`,
        );
      }
    }
    // 可选背景：地址同样必须在保存前是合法的；数量上限与解析规则一致。
    const gallery = api.resolveWallpaperGallery(draft.wallpapers);
    if (gallery.length > api.MAX_WALLPAPERS) {
      errors.push(`可选背景最多 ${api.MAX_WALLPAPERS} 张，请先下架一些。`);
    }
    if (gallery.length !== (draft.wallpapers || []).length) {
      warnings.push("有背景地址不合法或重复，保存时会被丢弃。");
    }
    for (const item of gallery) {
      if (item.url.startsWith("/") && !knownLocalImages.has(item.url)) {
        warnings.push(`可选背景 ${item.url} 不在已上传的图片列表里，发布后会显示为坏图。`);
      }
    }
    return { errors, warnings };
  }

  /* ---------------- 外观：可选背景（壁纸库） ---------------- */

  const wallpaperImageUrl = (path) =>
    `https://raw.githubusercontent.com/${CONFIG.owner}/${CONFIG.repo}/${CONFIG.branch}/${encodePath(path)}`;

  /** 当前正在预览的是不是这一条。 */
  const isPreviewing = (item) =>
    Boolean(wallpaperPreview && item && wallpaperPreview.url === item.url);

  /** 列表里点选一张：只改右侧大预览，不动「页面壁纸」字段，也不写配置。 */
  function previewWallpaper(item) {
    if (!item) return;
    wallpaperPreview = { url: item.url, label: item.label || "" };
    renderWallpaperLibrary();
    renderAppearancePreview();
    noteWallpaper(
      `正在右侧预览「${item.label || item.url}」——访客选中它时首页大致的模样。想把它设成站点默认背景，请点「设为默认壁纸」。`,
    );
  }

  /** 回到「站点默认壁纸」的预览（列表里没有任何一张处于预览中）。 */
  function clearWallpaperPreview({ note = "" } = {}) {
    if (!wallpaperPreview) {
      if (note) noteWallpaper(note);
      return false;
    }
    wallpaperPreview = null;
    renderWallpaperLibrary();
    renderAppearancePreview();
    if (note) noteWallpaper(note);
    return true;
  }

  /** 预览标签：标出正在预览哪一张，并提供「回到站点默认预览」。 */
  function renderPreviewTagline() {
    if (!el.previewTagline) return;
    if (!wallpaperPreview) {
      el.previewTagline.hidden = true;
      if (el.previewTag) el.previewTag.textContent = "";
      return;
    }
    el.previewTagline.hidden = false;
    if (el.previewTag) {
      el.previewTag.textContent = `预览中：${wallpaperPreview.label || wallpaperPreview.url}`;
    }
  }

  function renderWallpaperLibrary() {
    if (!el.wallpaperList) return;
    let max = 48;
    try {
      max = appearanceApi().MAX_WALLPAPERS;
    } catch {
      /* 模块没加载时只影响上限提示 */
    }
    if (el.wallpaperMax) el.wallpaperMax.textContent = String(max);
    el.wallpaperCount.textContent = String(wallpaperDraft.length);
    el.wallpaperList.textContent = "";
    if (!wallpaperDraft.length) {
      el.wallpaperList.append(
        Object.assign(document.createElement("p"), {
          className: "muted",
          textContent: "还没有可选背景。添加后，访客可以在「背景」里自选。",
        }),
      );
      return;
    }
    wallpaperDraft.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "row";
      const thumb = document.createElement("button");
      thumb.type = "button";
      thumb.className = "thumb thumb-button";
      thumb.title = "点一下预览这张背景";
      thumb.setAttribute("aria-label", `预览背景：${item.label || item.url}`);
      const labelForThumb = () => {
        thumb.style.backgroundImage = "";
        thumb.classList.add("thumb-label");
        thumb.textContent = item.label || "无法预览";
      };
      if (/\.svg$/i.test(item.url)) {
        thumb.textContent = "SVG";
        thumb.classList.add("thumb-label");
      } else {
        // 站内图片走 raw 地址预览；外链可能被防盗链拦住，失败时显示名称而不是空白方块。
        const preview = item.url.startsWith("/") ? wallpaperImageUrl(item.url.replace(/^\//, "")) : item.url;
        const probe = new Image();
        probe.addEventListener("error", labelForThumb);
        probe.src = preview;
        thumb.style.backgroundImage = `url("${preview}")`;
      }
      // 缩略图本身就是按钮：点一下就在右侧大预览里看这张背景（纯预览，不改配置）。
      thumb.addEventListener("click", () => previewWallpaper(item));
      const main = document.createElement("div");
      main.className = "row-main";
      const title = document.createElement("strong");
      title.className = "row-title";
      title.textContent = item.label || `未命名背景 ${index + 1}`;
      const meta = document.createElement("div");
      meta.className = "row-meta";
      meta.textContent = `${item.url}  ·  id ${item.id}${item.url === el.a.wallpaper.value.trim() ? "  ·  当前站点默认壁纸" : ""}`;
      main.append(title, meta);

      const actions = document.createElement("div");
      actions.className = "row-actions";
      const move = (label, delta, disabled) => {
        const button = document.createElement("button");
        button.className = "btn ghost small";
        button.type = "button";
        button.textContent = label;
        button.disabled = disabled;
        button.addEventListener("click", () => {
          const next = index + delta;
          if (next < 0 || next >= wallpaperDraft.length) return;
          const [entry] = wallpaperDraft.splice(index, 1);
          wallpaperDraft.splice(next, 0, entry);
          renderWallpaperLibrary();
          noteWallpaper("顺序已调整，点「保存并提交」后访客看到的顺序才会更新。");
        });
        return button;
      };
      const previewAction = document.createElement("button");
      previewAction.className = "btn ghost small";
      previewAction.type = "button";
      previewAction.textContent = "预览";
      previewAction.setAttribute("aria-pressed", String(isPreviewing(item)));
      previewAction.addEventListener("click", () => previewWallpaper(item));
      const useAsDefault = document.createElement("button");
      useAsDefault.className = "btn ghost small";
      useAsDefault.type = "button";
      useAsDefault.textContent = "设为默认壁纸";
      useAsDefault.addEventListener("click", () => {
        el.a.wallpaper.value = item.url;
        // 站点默认壁纸已改成这一张，预览回到「站点默认」，不必再标某一张为预览中。
        wallpaperPreview = null;
        renderAppearancePreview();
        renderWallpaperLibrary();
        noteWallpaper("已填入「页面壁纸」作为站点默认背景，点「保存并提交」后生效。");
      });
      const remove = document.createElement("button");
      remove.className = "btn danger small";
      remove.type = "button";
      remove.textContent = "下架";
      remove.addEventListener("click", async () => {
        const ok = await confirmDialog(
          "下架背景",
          `确定把「${item.label || item.url}」从可选背景里移除吗？\n\n已经选过它的访客会自动回到站点默认壁纸。图片文件本身不会被删除，可以随时重新加入。`,
          "下架并保存",
        );
        if (!ok) return;
        wallpaperDraft = wallpaperDraft.filter((entry) => entry.id !== item.id || entry.url !== item.url);
        if (isPreviewing(item)) wallpaperPreview = null;
        renderWallpaperLibrary();
        noteWallpaper("已从列表移除，点「保存并提交」后正式下架。");
      });
      actions.append(
        move("上移", -1, index === 0),
        move("下移", 1, index === wallpaperDraft.length - 1),
        previewAction,
        useAsDefault,
        remove,
      );
      if (isPreviewing(item)) row.className = "row row-previewing";
      row.append(thumb, main, actions);
      el.wallpaperList.append(row);
    });
  }

  function noteWallpaper(message, kind = "") {
    if (!el.wallpaperNote) return;
    el.wallpaperNote.textContent = message || "";
    el.wallpaperNote.className = `small ${kind}`.trim();
  }

  /** 供「外观」里的图片库下拉使用（与正文插图的下拉分开，避免互相覆盖选择）。 */
  function renderWallpaperPicker() {
    if (!el.wallpaperImage) return;
    const current = el.wallpaperImage.value;
    el.wallpaperImage.textContent = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = imageIndex.size ? "从已上传的图片选择…" : "（先在「图片」里上传）";
    el.wallpaperImage.append(placeholder);
    for (const [path, image] of [...imageIndex.entries()].sort((a, b) =>
      a[1].name.localeCompare(b[1].name),
    )) {
      const option = document.createElement("option");
      option.value = `/${path.replace(/^blog\/source\//, "")}`;
      option.textContent = image.name;
      el.wallpaperImage.append(option);
    }
    el.wallpaperImage.value = [...el.wallpaperImage.options].some((option) => option.value === current)
      ? current
      : "";
  }

  /** 把一张（已清洗的）背景加入草稿列表；重复地址会被拒绝。 */
  function addWallpaper(url, label = "") {
    const api = appearanceApi();
    const next = api.resolveWallpaperGallery([{ url, label }]);
    if (!next.length) {
      noteWallpaper("地址不合法：只接受 https:// 外链或 /images/… 站内路径。", "err");
      return false;
    }
    const entry = next[0];
    if (wallpaperDraft.some((item) => item.url === entry.url)) {
      noteWallpaper("这张图已经在可选背景里了。", "err");
      return false;
    }
    if (wallpaperDraft.length >= api.MAX_WALLPAPERS) {
      noteWallpaper(`最多 ${api.MAX_WALLPAPERS} 张，请先下架一些。`, "err");
      return false;
    }
    wallpaperDraft.push(entry);
    renderWallpaperLibrary();
    return true;
  }

  el.wallpaperAdd?.addEventListener("click", () => {
    const typed = el.wallpaperUrl.value.trim();
    const url = typed || el.wallpaperImage.value;
    if (!url) {
      noteWallpaper("请选择一张已上传的图片，或填一个外链地址。", "err");
      return;
    }
    const fallbackLabel = fileName(url).replace(/\.[a-z0-9]+$/i, "");
    if (addWallpaper(url, el.wallpaperLabel.value.trim() || fallbackLabel)) {
      el.wallpaperUrl.value = "";
      el.wallpaperLabel.value = "";
      el.wallpaperImage.value = "";
      noteWallpaper("已加入列表，点「保存并提交」后访客就能看到这张背景。");
    }
  });
  el.wallpaperImage?.addEventListener("change", () => {
    if (el.wallpaperImage.value) noteWallpaper(`已选择 ${el.wallpaperImage.value}，可填个名称再点「用上面的地址加入」。`);
  });

  // 上传多张背景图片：图片文件立即提交到 images/，列表改动等「保存并提交」。
  el.wallpaperUpload?.addEventListener("change", async () => {
    const files = [...el.wallpaperUpload.files];
    el.wallpaperUpload.value = "";
    if (!files.length) return;
    let added = 0;
    let compressed = 0;
    for (const file of files) {
      const prepared = await prepareUpload(file);
      if (prepared.error) {
        noteWallpaper(`跳过 ${file.name}：${prepared.error}`, "err");
        continue;
      }
      const { name, blob } = prepared;
      const path = `${CONFIG.imagesDir}/${name}`;
      try {
        const base64 = await fileToBase64(blob);
        const existing = imageIndex.get(path);
        const result = await putBinary(path, base64, existing?.sha, `chore(blog): upload wallpaper ${name}`);
        imageIndex.set(path, { sha: result.content?.sha || existing?.sha || "", name, size: blob.size });
        if (prepared.compressed) compressed++;
        log(
          `已上传背景图片：${path}（${Math.round(blob.size / 1024)} KB${prepared.compressed ? `，已从 ${Math.round(file.size / 1024)} KB 压缩` : ""}，commit ${result.commit?.sha?.slice(0, 7) || "?"}）`,
          "ok",
        );
        if (addWallpaper(`/images/${name}`, file.name.replace(/\.[^.]+$/, ""))) added++;
      } catch (error) {
        log(`上传失败 ${file.name}：${describeError(error)}`, "err");
        noteWallpaper(`上传失败：${describeError(error)}`, "err");
      }
    }
    // 刚上传的图片要立刻算进「已上传列表」，否则保存外形时会被误判为找不到文件。
    refreshKnownLocalImages();
    renderImages();
    renderImageSelect();
    renderWallpaperPicker();
    renderAppearancePicker();
    if (added) {
      noteWallpaper(
        `已上传 ${added} 张并加入列表${compressed ? `（其中 ${compressed} 张超过 1 MB，已自动压缩）` : ""}，点「保存并提交」后访客即可选择。`,
      );
    }
    watchBuild();
  });

  function renderAppearancePreview() {
    if (!el.appearancePreview || !el.a.avatar) return;
    if (el.tabAppearance && el.tabAppearance.hidden) return;
    let api;
    try {
      api = appearanceApi();
    } catch (error) {
      el.appearanceNote.textContent = error.message;
      el.appearanceNote.className = "small err";
      return;
    }
    const draft = readAppearanceForm();
    const { errors, warnings } = inspectAppearanceDraft(draft, api);
    el.a.dimValue.textContent = `${draft.wallpaperDim}%`;
    el.a.blurValue.textContent = `${draft.wallpaperBlur}px`;

    const safe = (value) => (api.isSafeImageUrl(value) ? value : "");
    // 预览的壁纸优先级：列表里点选的那张 > 「页面壁纸」字段。
    const wallpaper = safe(wallpaperPreview ? wallpaperPreview.url : draft.wallpaper);
    const avatar = safe(draft.avatar);
    const favicon = safe(draft.favicon);

    const wallpaperLayer = el.appearancePreview.querySelector(".preview-wallpaper");
    wallpaperLayer.style.backgroundImage = wallpaper ? `url("${wallpaper}")` : "none";
    wallpaperLayer.style.filter =
      wallpaper && draft.wallpaperBlur > 0 ? `blur(${Math.min(20, draft.wallpaperBlur)}px)` : "";
    const veil = el.appearancePreview.querySelector(".preview-veil");
    const alpha = api.veilAlpha(draft.wallpaperDim);
    veil.style.background = `linear-gradient(rgba(11,14,20,${alpha}), rgba(11,14,20,${alpha}))`;

    const avatarFrame = el.appearancePreview.querySelector(".preview-avatar");
    const avatarImage = el.appearancePreview.querySelector(".preview-avatar-image");
    const avatarMark = el.appearancePreview.querySelector(".preview-avatar-mark");
    if (avatar) {
      if (avatarImage.getAttribute("src") !== avatar) avatarImage.src = avatar;
      avatarFrame.classList.add("preview-avatar--image");
      if (appearancePreviewFailures.avatar) {
        avatarFrame.classList.add("preview-avatar--failed");
        avatarMark.hidden = false;
      } else {
        avatarFrame.classList.remove("preview-avatar--failed");
        avatarMark.hidden = true;
      }
    } else {
      avatarImage.removeAttribute("src");
      avatarFrame.classList.remove("preview-avatar--image");
      avatarFrame.classList.add("preview-avatar--failed");
      avatarMark.hidden = false;
    }

    const faviconImage = document.getElementById("preview-favicon-image");
    if (faviconImage) {
      if (favicon && faviconImage.getAttribute("src") !== favicon) faviconImage.src = favicon;
      if (!favicon) faviconImage.removeAttribute("src");
      faviconImage.dataset.broken = String(!favicon || appearancePreviewFailures.favicon);
    }

    renderPreviewTagline();

    if (errors.length) {
      el.appearanceNote.textContent = `⚠ ${errors.join(" ")}`;
      el.appearanceNote.className = "small err";
    } else if (warnings.length) {
      el.appearanceNote.textContent = `⚠ ${warnings.join(" ")}`;
      el.appearanceNote.className = "small warn";
    } else if (appearancePreviewFailures.avatar || appearancePreviewFailures.favicon) {
      const names = [
        appearancePreviewFailures.avatar ? "头像" : "",
        appearancePreviewFailures.favicon ? "网页图标" : "",
      ].filter(Boolean).join("、");
      el.appearanceNote.textContent = `⚠ ${names}图片在当前网络下加载失败（外链可能禁止跨站引用）。可以把它上传到「图片」后改填站内路径。`;
      el.appearanceNote.className = "small warn";
    } else {
      el.appearanceNote.textContent = "✓ 地址格式正常，预览即为首页侧边栏与页面背景的大致效果；保存后约 1–2 分钟发布。";
      el.appearanceNote.className = "small ok";
    }
  }

  async function loadAppearance() {
    el.appearanceStatus.textContent = "正在加载…";
    let api;
    try {
      api = appearanceApi();
    } catch (error) {
      el.appearanceStatus.textContent = error.message;
      log(error.message, "err");
      return;
    }
    try {
      const file = await getFile(CONFIG.appearancePath);
      appearanceState = { sha: file.sha, loaded: true };
      let raw = null;
      let broken = "";
      try {
        raw = JSON.parse(file.text);
      } catch {
        broken = "配置文件不是合法 JSON：保存会用当前表单内容覆盖它。";
      }
      fillAppearanceForm(api.resolveAppearance(raw));
      snapshots.appearance = appearanceSnapshotValue();
      el.appearanceStatus.textContent =
        broken || `已加载（${file.size} B）· 保存后约 1–2 分钟发布`;
      if (broken) log(broken, "err");
      log(`读取 ${CONFIG.appearancePath}`);
    } catch (error) {
      if (error.status === 404) {
        appearanceState = { sha: "", loaded: true };
        fillAppearanceForm(api.resolveAppearance(null));
        snapshots.appearance = appearanceSnapshotValue();
        el.appearanceStatus.textContent = "配置文件还不存在，保存时会新建。";
        log(`${CONFIG.appearancePath} 不存在，将按默认值创建。`);
        return;
      }
      el.appearanceStatus.textContent = describeError(error);
      log(`读取外观设置失败：${describeError(error)}`, "err");
    }
  }

  async function saveAppearance() {
    let api;
    try {
      api = appearanceApi();
    } catch (error) {
      el.appearanceStatus.textContent = error.message;
      toast(error.message, "err");
      return;
    }
    const draft = readAppearanceForm();
    const { errors, warnings } = inspectAppearanceDraft(draft, api);
    if (errors.length) {
      el.appearanceStatus.textContent = errors.join(" ");
      toast("地址不合法，没有提交", "err");
      log(`外观设置未提交：${errors.join(" ")}`, "err");
      return;
    }
    if (warnings.length) {
      const ok = await confirmDialog("确认保存", `${warnings.join("\n")}\n\n仍然保存吗？`, "仍然保存");
      if (!ok) return;
    }
    const value = api.resolveAppearance(draft);
    busy(el.appearanceSave, true, "提交中…");
    el.appearanceStatus.textContent = "正在提交…";
    try {
      const result = await putFile(
        CONFIG.appearancePath,
        JSON.stringify(value, null, 2) + "\n",
        appearanceState.sha,
        "feat(blog): update appearance (avatar / wallpaper / wallpapers)",
      );
      appearanceState = { sha: result.content?.sha || appearanceState.sha, loaded: true };
      el.appearanceStatus.textContent = `已提交（commit ${result.commit?.sha?.slice(0, 7) || "?"}），约 1–2 分钟后生效。`;
      // 回填清洗后的列表：不合法的地址或重复项在这里消失，页面与仓库保持一致。
      wallpaperDraft = value.wallpapers.map((item) => ({ ...item }));
      wallpaperPreview = null; // 保存后回到「站点默认」的预览
      renderWallpaperLibrary();
      snapshots.appearance = appearanceSnapshotValue();
      noteWallpaper(
        `可选背景已更新为 ${value.wallpapers.length} 张（commit ${result.commit?.sha?.slice(0, 7) || "?"}）。访客端列表约 1–2 分钟后更新；访客自己的选择不受影响。`,
        "ok",
      );
      log(`已保存 ${CONFIG.appearancePath}`, "ok");
      toast("头像 / 壁纸 / 可选背景已提交");
      watchBuild();
    } catch (error) {
      el.appearanceStatus.textContent = describeError(error);
      log(`保存外观设置失败：${describeError(error)}`, "err");
      toast(describeError(error), "err");
    } finally {
      busy(el.appearanceSave, false);
    }
  }

  el.appearanceSave.addEventListener("click", saveAppearance);
  el.appearanceReload.addEventListener("click", loadAppearance);
  el.appearanceDefaults.addEventListener("click", () => {
    let api;
    try {
      api = appearanceApi();
    } catch (error) {
      el.appearanceStatus.textContent = error.message;
      return;
    }
    fillAppearanceForm(api.resolveAppearance(null));
    el.appearanceStatus.textContent =
      "已填入默认值（默认图标 /images/favicon.svg，无壁纸，可选背景清空）；点「保存并提交」后生效。";
  });
  for (const input of [el.a.avatar, el.a.favicon, el.a.dim, el.a.blur, el.a.theme]) {
    input.addEventListener("input", renderAppearancePreview);
  }
  // 手改「页面壁纸」= 想看的站点默认背景变了，预览跟随它，不再停留在某张可选背景上。
  el.a.wallpaper.addEventListener("input", () => {
    if (wallpaperPreview) {
      wallpaperPreview = null;
      renderWallpaperLibrary();
    }
    renderAppearancePreview();
  });
  el.previewReset?.addEventListener("click", () =>
    clearWallpaperPreview({ note: "预览已回到站点默认壁纸。" }),
  );
  el.appearancePicker.addEventListener("change", () => {
    if (el.appearancePicker.value) toast(`已选择 ${el.appearancePicker.value}，点右侧按钮填入对应字段`);
  });
  $$("[data-appearance-fill]").forEach((button) => {
    button.addEventListener("click", () => {
      const value = el.appearancePicker.value;
      if (!value) {
        toast("先在左边选择一个已上传的图片", "err");
        return;
      }
      el.a[button.dataset.appearanceFill].value = value;
      renderAppearancePreview();
      toast(`已填入 ${value}，确认后点「保存并提交」`);
    });
  });
  // 图片加载失败时更新提示（外链可能因为防盗链打不开）。
  const previewAvatarImage = el.appearancePreview?.querySelector(".preview-avatar-image");
  previewAvatarImage?.addEventListener("error", () => {
    appearancePreviewFailures.avatar = true;
    renderAppearancePreview();
  });
  previewAvatarImage?.addEventListener("load", () => {
    appearancePreviewFailures.avatar = false;
    renderAppearancePreview();
  });
  document.getElementById("preview-favicon-image")?.addEventListener("error", () => {
    appearancePreviewFailures.favicon = true;
    renderAppearancePreview();
  });
  document.getElementById("preview-favicon-image")?.addEventListener("load", () => {
    appearancePreviewFailures.favicon = false;
    renderAppearancePreview();
  });

  /* ---------------- 构建状态 ---------------- */

  async function refreshBuildStatus(expectedSha = "") {
    try {
      const data = await api(repoPath(`/actions/runs?branch=${CONFIG.branch}&per_page=20`));
      const runs = data.workflow_runs || [];
      const run = expectedSha
        ? runs.find((item) => item.head_sha === expectedSha && (item.path === ".github/workflows/deploy.yml" || item.name === "Build and deploy blog"))
        : runs[0];
      if (!run && expectedSha) {
        el.buildChip.className = "chip run";
        el.buildChip.textContent = "构建状态：等待本次提交的发布任务";
        el.buildNote.textContent = `源码已提交 ${expectedSha.slice(0, 7)}，尚未检测到对应工作流。请确认 main 上已启用自动发布。`;
        return null;
      }
      if (!run) {
        el.buildChip.className = "chip";
        el.buildChip.textContent = "构建状态：还没有工作流记录";
        return run;
      }
      const when = new Date(run.updated_at || run.created_at).toLocaleString("zh-CN", { hour12: false });
      if (run.status !== "completed") {
        el.buildChip.className = "chip run";
        el.buildChip.textContent = `构建状态：${run.status === "queued" ? "排队中" : "正在构建"}（${when}）`;
      } else if (run.conclusion === "success") {
        el.buildChip.className = "chip ok";
        el.buildChip.textContent = `构建状态：构建完成 ✓ · Pages 发布稍后生效（${when}）`;
      } else {
        el.buildChip.className = "chip err";
        el.buildChip.textContent = `构建状态：${run.conclusion || "失败"}（${when}）`;
      }
      el.buildNote.textContent = run.status === "completed" && run.conclusion !== "success"
        ? `本次发布失败，公开首页仍是上一次成功发布的版本；后台列表显示的是已提交的最新源码。请打开 Actions 查看原因或重试。`
        : `最近一次：${run.name} · ${run.head_sha.slice(0, 7)} · ${run.display_title || ""}`;
      el.actionsLink.href = run.html_url;
      return run;
    } catch (error) {
      el.buildChip.className = "chip err";
      el.buildChip.textContent = "构建状态：读取失败";
      log(`读取构建状态失败：${describeError(error)}`, "err");
      return null;
    }
  }

  function watchBuild(expectedSha = "") {
    clearInterval(buildWatch);
    refreshBuildStatus(expectedSha);
    let tries = 0;
    buildWatch = setInterval(async () => {
      tries += 1;
      const run = await refreshBuildStatus(expectedSha);
      if (tries > 18 || (run && run.status === "completed")) clearInterval(buildWatch);
    }, 10000);
  }

  el.buildRefresh.addEventListener("click", () => refreshBuildStatus());

  /* ---------------- 标签页 ---------------- */

  el.tabs.addEventListener("click", async (event) => {
    const button = event.target.closest(".tab");
    if (!button) return;
    const tab = button.dataset.tab;
    $$(".tab").forEach((item) => {
      const active = item === button;
      item.classList.toggle("active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    el.tabPosts.hidden = tab !== "posts";
    el.tabMedia.hidden = tab !== "media";
    el.tabAppearance.hidden = tab !== "appearance";
    el.tabAbout.hidden = tab !== "about";
    el.tabLog.hidden = tab !== "log";
    if (tab === "about" && !aboutState.sha) await loadAbout();
    if (tab === "media") {
      renderImageSelect();
      renderAppearancePicker();
    }
    if (tab === "appearance") {
      if (!appearanceState.loaded) await loadAppearance();
      else {
        // 期间可能在「图片」里上传或删除了图片，回到这一页时重绘列表与预览。
        renderWallpaperLibrary();
        renderWallpaperPicker();
        renderAppearancePreview();
      }
    }
  });

  async function refreshAll() {
    busy(el.refreshButton, true, "加载中…");
    el.postList.textContent = "";
    try {
      await refreshPosts();
      await refreshImages();
      log(`已同步文件列表：${postIndex.size} 篇文章，${imageIndex.size} 张图片。`);
    } catch (error) {
      log(`同步失败：${describeError(error)}`, "err");
      toast(describeError(error), "err");
      if (error.status === 401) {
        logout(true);
        showError(describeError(error));
      }
    } finally {
      busy(el.refreshButton, false);
    }
  }

  el.refreshButton.addEventListener("click", refreshAll);
  el.clearLog.addEventListener("click", () => {
    el.logList.textContent = "";
    log("日志已清空。");
  });

  /* ---------------- 启动 ---------------- */

  // 登录页与后台各标签页共用前台已发布的壁纸；只读取公开的配置，不使用 GitHub 授权。
  // main.css 的壁纸层由 html[data-wallpaper="on"] 和这三个 CSS 变量控制。
  async function refreshAdminAppearance() {
    try {
      const response = await fetch(`${location.origin}/appearance.json`, { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      const api = appearanceApi();
      const look = api.resolveAppearance(data);
      const link = document.getElementById("admin-favicon");
      if (link && api.isSafeImageUrl(data?.favicon)) link.href = look.favicon;
      if (!look.wallpaper) return; // 没有壁纸或地址不安全时保持纯色背景。

      const root = document.documentElement;
      root.style.setProperty("--wallpaper-image", api.cssImage(look.wallpaper));
      root.style.setProperty("--wallpaper-veil", api.veilAlpha(look.wallpaperDim));
      root.style.setProperty("--wallpaper-blur", `${look.wallpaperBlur}px`);
      root.dataset.wallpaper = "on";
      if (look.wallpaperBlur > 0) root.dataset.wallpaperBlur = "on";
    } catch {
      // 公开配置不可用时保留默认图标与纯色背景，不影响登录/编辑。
    }
  }

  // 用会话里暂存的 GitHub OAuth 授权自动确认站长身份（授权从 /auth/callback/ 回来时写入）。
  async function restoreOAuthSession() {
    const stored = readStoredToken();
    if (!stored) return false;
    busy(el.loginButton, true, "正在确认站长身份…");
    try {
      await authenticate(stored);
      await enterApp();
      toast(`欢迎回来，@${currentUser}`);
      return true;
    } catch (error) {
      logout(true);
      showError(`已保存的 GitHub 授权/令牌不可用：${describeError(error)}`);
      return false;
    } finally {
      busy(el.loginButton, false);
    }
  }

  // 状态出口：排查问题和回归测试用，不影响任何行为。
  window.MinxiAdmin = { unsavedWork, restoreOAuthSession };

  (async function init() {
    log("后台已就绪。可用 GitHub 授权或粘贴令牌登录（仅站长可进入）。");
    refreshAdminAppearance();
    clearLegacyTokenStorage();
    const visitor = visitorLogin();
    const isOwnerVisitor = visitor && CONFIG.allowedLogins.some((name) => name.toLowerCase() === visitor.toLowerCase());
    if (visitor && !isOwnerVisitor) {
      // 非站长访客试图进后台：直接显示无权限，不尝试任何授权恢复。
      showNoAccess(visitor);
      return;
    }
    await restoreOAuthSession();
  })();
})();
