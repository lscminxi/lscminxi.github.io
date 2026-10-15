"use strict";
/*
 * 博客管理后台（纯前端）
 * --------------------------------------------------------------
 * 这个站点是静态的 GitHub Pages，没有自己的服务器，因此后台不保存任何账号密码：
 * 「登录」= 你在浏览器里提供自己的 GitHub Personal Access Token，
 * 之后所有读写都直接由浏览器调用 https://api.github.com 完成，
 * 以你的身份把改动提交到仓库 main 分支；GitHub Actions 会自动重新生成静态页面并发布。
 *
 * 安全说明：
 *  - 令牌只保存在当前浏览器（sessionStorage，或勾选「记住」后的 localStorage），退出登录即清除。
 *  - 令牌只会发送到 api.github.com，本站没有任何后端，不会上传到别处。
 *  - 真正的权限由 GitHub 判断：没有仓库写权限的令牌无法提交任何改动。
 *    CONFIG.allowedLogins 只是额外的一层界面限制，可按需要增删账号。
 */
(() => {
  const CONFIG = {
    owner: "lscminxi",
    repo: "lscminxi.github.io",
    branch: "main",
    allowedLogins: ["lscminxi"], // 留空数组 [] 表示任何有写权限的账号都可以登录
    api: "https://api.github.com",
    siteUrl: "https://lscminxi.github.io",
    postsDir: "blog/source/_posts",
    imagesDir: "blog/source/images",
    aboutPath: "blog/source/about/index.md",
    maxUploadBytes: 1000000, // GitHub Contents API 单文件上限约 1 MB
    imageExtensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"],
  };

  const TOKEN_KEY = "minxi.admin.token";
  const REMEMBER_KEY = "minxi.admin.remember";

  let token = "";
  let currentUser = "";
  let postIndex = new Map(); // path -> { sha, title, date, categories, tags, description, size }
  let imageIndex = new Map(); // path -> { sha, name, size }
  let editing = null; // { path, sha, isNew }
  let aboutState = { sha: "", text: "" };
  let buildWatch = null;
  let postsRevision = 0;
  const deletingPosts = new Set();

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const el = {
    viewLogin: $("#view-login"),
    viewApp: $("#view-app"),
    viewEditor: $("#view-editor"),
    loginForm: $("#login-form"),
    tokenInput: $("#token-input"),
    rememberInput: $("#remember-input"),
    loginError: $("#login-error"),
    loginButton: $("#login-button"),
    userChip: $("#user-chip"),
    logoutButton: $("#logout-button"),
    repoChip: $("#repo-chip"),
    tabs: $("#tabs"),
    tabPosts: $("#tab-posts"),
    tabMedia: $("#tab-media"),
    tabAbout: $("#tab-about"),
    tabLog: $("#tab-log"),
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

  /* ---------------- 令牌存储 ---------------- */

  function readStoredToken() {
    try {
      return (
        sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || ""
      );
    } catch {
      return "";
    }
  }
  function storeToken(value, remember) {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REMEMBER_KEY);
      if (!value) return;
      (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, value);
      if (remember) localStorage.setItem(REMEMBER_KEY, "1");
      el.rememberInput.checked = Boolean(remember);
    } catch {
      /* 隐私模式下可能不可写，忽略 */
    }
  }

  /* ---------------- GitHub API ---------------- */

  function describeError(error) {
    const status = error.status;
    const apiMessage = error.data?.message;
    if (status === 401)
      return "令牌无效或已过期，请重新登录（401）。" + (apiMessage ? ` ${apiMessage}` : "");
    if (status === 403)
      return `权限不足或触发速率限制（403）。${apiMessage || ""}`.trim();
    if (status === 404)
      return `找不到文件或仓库（404）。请确认令牌能访问 ${CONFIG.owner}/${CONFIG.repo}。${apiMessage || ""}`.trim();
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
    const repo = await api(repoPath(""));
    if (!repo.permissions?.push) {
      throw new Error(
        "这个令牌对该仓库没有写权限。请在 GitHub 上把令牌仓库权限设为 Contents: Read and write。",
      );
    }
    let login = "";
    try {
      login = (await api("/user")).login || "";
    } catch (error) {
      log(`无法读取账号信息（${describeError(error)}），已跳过账号名单检查。`, "err");
    }
    if (login && CONFIG.allowedLogins.length && !CONFIG.allowedLogins.includes(login)) {
      throw new Error(
        `账号 ${login} 不在允许名单内（${CONFIG.allowedLogins.join(", ")}）。如需放行，请修改 admin/admin.js 里的 CONFIG.allowedLogins。`,
      );
    }
    currentUser = login || repo.owner?.login || "已授权账号";
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
    storeToken("", false);
    el.viewLogin.hidden = false;
    el.viewApp.hidden = true;
    el.viewEditor.hidden = true;
    el.userChip.hidden = true;
    el.logoutButton.hidden = true;
    el.tokenInput.value = "";
    if (!silent) log("已退出登录，令牌已从浏览器清除。");
  }

  el.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const value = el.tokenInput.value.trim();
    showError("");
    if (!value) return showError("请粘贴 GitHub 令牌。");
    busy(el.loginButton, true, "正在验证…");
    try {
      await authenticate(value);
      storeToken(value, el.rememberInput.checked);
      el.tokenInput.value = "";
      await enterApp();
      toast(`欢迎回来，@${currentUser}`);
    } catch (error) {
      token = "";
      showError(describeError(error));
      log(`登录失败：${describeError(error)}`, "err");
    } finally {
      busy(el.loginButton, false);
    }
  });

  el.logoutButton.addEventListener("click", async () => {
    const ok = await confirmDialog(
      "退出登录",
      "将从浏览器清除已保存的令牌，未提交的编辑内容会丢失。确定退出吗？",
      "退出登录",
    );
    if (ok) {
      logout();
      toast("已退出登录");
    }
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
      const url = post.date ? postUrl(post.date, fileName(path)) : "";
      meta.textContent = [
        path.replace(`${CONFIG.postsDir}/`, ""),
        post.date,
        post.categories.join(" / "),
        post.tags.map((tag) => `#${tag}`).join(" "),
        post.sample ? "示例文章" : "",
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
    renderImages();
    renderImageSelect();
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
    const ok = await confirmDialog(
      "删除图片",
      `确定删除 ${image.name} 吗？如果还有文章引用它，页面上会出现坏图。`,
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
      const extension = file.name.split(".").pop().toLowerCase();
      if (!CONFIG.imageExtensions.includes(extension)) {
        toast(`跳过 ${file.name}：只支持 ${CONFIG.imageExtensions.join("/")}`, "err");
        log(`上传被跳过（格式不支持）：${file.name}`, "err");
        continue;
      }
      if (file.size > CONFIG.maxUploadBytes) {
        toast(`跳过 ${file.name}：超过 1 MB 限制`, "err");
        log(`上传被跳过（超过 1 MB）：${file.name}`, "err");
        continue;
      }
      const safe =
        slugify(file.name.replace(/\.[^.]+$/, "")) || `image-${Date.now()}`;
      const name = `${safe}.${extension}`;
      const path = `${CONFIG.imagesDir}/${name}`;
      try {
        const base64 = await fileToBase64(file);
        const existing = imageIndex.get(path);
        const result = await putBinary(
          path,
          base64,
          existing?.sha,
          `chore(blog): upload image ${name}`,
        );
        log(`已上传图片：${path}（commit ${result.commit?.sha?.slice(0, 7) || "?"}）`, "ok");
        toast(`已上传 ${name}，正文可用 /images/${name}`);
        imageIndex.set(path, { sha: result.content?.sha || existing?.sha || "", name, size: file.size });
      } catch (error) {
        log(`上传失败 ${file.name}：${describeError(error)}`, "err");
        toast(describeError(error), "err");
      }
    }
    renderImages();
    renderImageSelect();
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
    el.urlPreview.textContent = dateValue && valid ? postUrl(dateValue, slug) : "/…";
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
  let previewScroll = { top: 0, left: 0 };
  const previewFrame = $("#post-preview");
  previewFrame.addEventListener("load", () => {
    // Controlled by the parent: keep the iframe script-free.
    const scroll = previewFrame.contentDocument?.scrollingElement;
    if (scroll) {
      scroll.scrollTop = previewScroll.top;
      scroll.scrollLeft = previewScroll.left;
    }
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
        previewScroll = { top: 0, left: 0 };
      } else {
        const doc = previewFrame.contentDocument;
        // During an in-flight srcdoc load retain the last valid snapshot.
        if (doc?.querySelector('.article-content')) {
          previewOpenFolds = [...doc.querySelectorAll('details.fold-box[open][data-preview-fold-key]')]
            .map((fold) => fold.dataset.previewFoldKey);
          const scroll = doc.scrollingElement;
          previewScroll = { top: scroll?.scrollTop || 0, left: scroll?.scrollLeft || 0 };
        }
      }
      previewFrame.srcdoc = window.MinxiPreview.document({ ...input, openFolds: previewOpenFolds });
      previewSignature = signature;
      previewNeedsReset = false;
      $("#preview-status").textContent = "预览已更新 · Markdown / KaTeX / 可点击折叠框（代码高亮与目录以发布页为准）";
    } catch (error) {
      $("#preview-status").textContent = `预览失败：${error.message}`;
    }
  }
  [el.f.body, el.f.title, el.f.description].forEach((field) => {
    field.addEventListener("input", () => {
      clearTimeout(previewTimer);
      previewTimer = setTimeout(renderPostPreview, 180);
    });
  });
  $$('[data-editor-mode]').forEach((button) => {
    button.addEventListener("click", () => {
      $("#writing-workspace").dataset.mode = button.dataset.editorMode;
      $$('[data-editor-mode]').forEach((item) => {
        item.setAttribute("aria-pressed", String(item === button));
      });
      renderPostPreview();
    });
  });
  $("#insert-math").addEventListener("click", () => {
    insertAtCursor(el.f.body, "\n\n$$\nf(n) = \\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\n$$\n\n");
  });

  $("#insert-fold").addEventListener("change", (event) => {
    const kind = event.target.value;
    if (kind !== "info" && kind !== "success") return;
    insertAtCursor(el.f.body, `\n\n:::${kind}[${kind === "info" ? "提示" : "成功"}]\n\n在这里写内容，支持 **Markdown** 和 $a_i$ 公式。\n\n:::\n\n`);
    event.target.value = "";
  });

  function showEditor() {
    previewNeedsReset = true;
    el.viewApp.hidden = true;
    el.viewEditor.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function hideEditor() {
    editing = null;
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
      el.f.body.value = body.replace(/^\n+/, "");
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
    el.f.body.value = "";
    delete el.f.slug.dataset.touched;
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
        log(
          `${editing.isNew ? "已新建" : "已保存"}：${fields.path}（commit ${
            result.commit?.sha?.slice(0, 7) || "?"
          }）`,
          "ok",
        );
      }
      el.editorTitle.textContent = `编辑：${fields.title}`;
      el.deletePost.hidden = false;
      el.editorStatus.textContent = `已提交。发布地址 ${postUrl(fields.date, fields.slug)}，静态页面约 1–2 分钟后更新。`;
      toast("已提交，GitHub Actions 正在重新生成站点");
      postIndex.set(fields.path, { ...fields, sha: editing.sha, size: markdown.length });
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
  el.cancelEdit.addEventListener("click", hideEditor);
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
      }
    }
  });

  /* ---------------- 个人简介 / 关于页 ---------------- */

  async function loadAbout() {
    el.aboutStatus.textContent = "正在加载…";
    try {
      const file = await getFile(CONFIG.aboutPath);
      aboutState = { sha: file.sha, text: file.text };
      el.aboutEditor.value = file.text;
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
      el.buildNote.textContent = `最近一次：${run.name} · ${run.head_sha.slice(0, 7)} · ${run.display_title || ""}`;
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
    el.tabAbout.hidden = tab !== "about";
    el.tabLog.hidden = tab !== "log";
    if (tab === "about" && !aboutState.sha) await loadAbout();
    if (tab === "media") renderImageSelect();
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

  (async function init() {
    log("后台已就绪。请输入 GitHub 令牌登录。");
    const stored = readStoredToken();
    el.rememberInput.checked = Boolean(localStorage.getItem(REMEMBER_KEY));
    if (!stored) return;
    busy(el.loginButton, true, "正在恢复登录…");
    try {
      await authenticate(stored);
      await enterApp();
      toast(`已恢复登录：@${currentUser}`);
    } catch (error) {
      logout(true);
      showError(`已保存的令牌不可用：${describeError(error)}`);
    } finally {
      busy(el.loginButton, false);
    }
  })();
})();
