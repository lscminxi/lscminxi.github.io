import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, copyFile, cp, symlink, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { JSDOM } from 'jsdom';
const exec = promisify(execFile);
const html = await readFile('source/admin/index.html', 'utf8');
const js = await readFile('source/admin/admin.js', 'utf8');
const path = 'blog/source/_posts/test.md';
const text = '---\ntitle: 测试文章\ndate: 2026-01-01 10:00:00\n---\n正文';
const wait = async (predicate) => {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await new Promise(r => setTimeout(r, 5));
  }
  assert.fail('Timed out waiting for UI');
};
async function setup() {
  const dom = new JSDOM(html, { url: 'https://preview.example/admin/', runScripts: 'outside-only' });
  const w = dom.window;
  w.scrollTo = () => {};
  w.TextEncoder = TextEncoder;
  w.TextDecoder = TextDecoder;
  w.MinxiPreview = { document: () => '<!doctype html><html></html>' };
  const files = new Map([[path, { sha: 'sha1', text }]]);
  const state = { deletes: [], requests: [], deleteStatus: 0, failTree: false, runConclusion: 'success' };
  const reply = (status, data) => ({ ok: status < 400, status, text: async () => JSON.stringify(data) });
  w.fetch = async (url, opts = {}) => {
    const uri = new URL(url);
    const suffix = decodeURIComponent(uri.pathname.replace('/repos/lscminxi/lscminxi.github.io', ''));
    state.requests.push({ suffix, method: opts.method, cache: opts.cache });
    if (suffix === '/user') return reply(200, { login: 'lscminxi' });
    if (!suffix) return reply(200, { permissions: { push: true }, owner: { login: 'lscminxi' } });
    if (suffix.startsWith('/actions/runs')) return reply(200, { workflow_runs: [{ name: 'Build and deploy blog', head_sha: 'old-commit', status: 'completed', conclusion: state.runConclusion, updated_at: '2026-01-01', html_url: 'https://github.com/test', display_title: 'Old build' }] });
    if (suffix.startsWith('/git/trees/')) {
      if (state.failTree) return reply(500, { message: 'Tree unavailable' });
      return reply(200, { tree: [...files].map(([path, file]) => ({ path, sha: file.sha, size: file.text.length, type: 'blob' })) });
    }
    if (suffix.startsWith('/contents/')) {
      const filePath = suffix.slice('/contents/'.length);
      if (opts.method === 'DELETE') {
        const body = JSON.parse(opts.body);
        state.deletes.push({ path: filePath, ...body });
        if (state.deleteStatus) return reply(state.deleteStatus, { message: 'Delete denied' });
        if (!files.has(filePath)) return reply(404, { message: 'Not Found' });
        if (files.get(filePath).sha !== body.sha) return reply(409, { message: 'Conflict' });
        files.delete(filePath);
        return reply(200, { commit: { sha: 'delete-commit' } });
      }
      if (opts.method === 'PUT') {
        const body = JSON.parse(opts.body);
        files.set(filePath, { sha: 'saved-sha', text: Buffer.from(body.content, 'base64').toString() });
        return reply(200, { content: { sha: 'saved-sha' }, commit: { sha: 'save-commit' } });
      }
      const file = files.get(filePath);
      return file ? reply(200, { sha: file.sha, size: file.text.length, encoding: 'base64', content: Buffer.from(file.text).toString('base64') }) : reply(404, { message: 'Not Found' });
    }
    throw new Error(`Unexpected API ${suffix}`);
  };
  w.eval(js);
  const $ = (s) => w.document.querySelector(s);
  $('#token-input').value = 'test-token-not-real';
  $('#login-form').dispatchEvent(new w.Event('submit', { cancelable: true }));
  await wait(() => $('#post-list .row'));
  await wait(() => !$('#refresh-button').disabled);
  return { dom, w, $, files, state };
}
const listButton = ($, label) => [...$('#post-list').querySelectorAll('button')].find(b => b.textContent === label);

for (const source of ['list', 'editor']) {
  test(`confirmed deletion from ${source} submits correct SHA/branch and removes the last row`, async () => {
    const { dom, $, files, state } = await setup();
    try {
      if (source === 'editor') {
        listButton($, '编辑').click();
        await wait(() => $('#editor-status').textContent.includes('已加载'));
        $('#delete-post').click();
      } else listButton($, '删除').click();
      await wait(() => !$('#modal').hidden);
      $('#modal-ok').click();
      await wait(() => $('#posts-count').textContent === '0');
      assert(!files.has(path));
      assert.equal(state.deletes.length, 1);
      assert.equal(state.deletes[0].sha, 'sha1');
      assert.equal(state.deletes[0].branch, 'main');
      assert($('#view-editor').hidden);
      assert(state.requests.every(r => r.cache === 'no-store'));
      await wait(() => $('#build-chip').textContent.includes('等待本次提交'));
      assert(!$('#build-chip').textContent.includes('构建完成'), 'Do not treat an old run as this delete being published');
    } finally { dom.window.close(); }
  });
}
test('cancel and Escape preserve unsaved editor content and make no DELETE request', async () => {
  const { dom, w, $, state } = await setup();
  try {
    listButton($, '编辑').click();
    await wait(() => $('#editor-status').textContent.includes('已加载'));
    $('#f-body').value = '未保存的正文';
    for (const escape of [false, true]) {
      $('#delete-post').click();
      await wait(() => !$('#modal').hidden);
      if (escape) w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
      else $('#modal-cancel').click();
      await new Promise(r => setTimeout(r, 10));
      assert.equal($('#f-body').value, '未保存的正文');
      assert.equal($('#view-editor').hidden, false);
      assert.equal(state.deletes.length, 0);
    }
  } finally { dom.window.close(); }
});
test('stale SHA requires a second explicit confirmation before deleting a newer revision', async () => {
  const { dom, $, files, state } = await setup();
  try {
    files.set(path, { sha: 'new-sha', text: 'new version' });
    listButton($, '删除').click(); $('#modal-ok').click();
    await wait(() => $('#modal-title').textContent === '文章已被修改');
    assert.equal(state.deletes.length, 0);
    $('#modal-cancel').click();
    await new Promise(r => setTimeout(r, 10));
    assert(files.has(path));
    listButton($, '删除').click(); $('#modal-ok').click();
    await wait(() => !$('#modal').hidden && $('#modal-title').textContent === '文章已被修改');
    $('#modal-ok').click();
    await wait(() => $('#posts-count').textContent === '0');
    assert.equal(state.deletes[0].sha, 'new-sha');
  } finally { dom.window.close(); }
});
for (const status of [403, 409]) {
  test(`HTTP ${status} shows a failure and keeps the draft/row, with no automatic destructive retry`, async () => {
    const { dom, $, state } = await setup();
    try {
      state.deleteStatus = status;
      listButton($, '编辑').click();
      await wait(() => $('#editor-status').textContent.includes('已加载'));
      $('#f-body').value = '保留草稿';
      $('#delete-post').click(); $('#modal-ok').click();
      await wait(() => $('#editor-status').textContent.includes('删除失败'));
      assert.equal($('#posts-count').textContent, '1');
      assert.equal($('#f-body').value, '保留草稿');
      assert.equal(state.deletes.length, 1);
      await wait(() => !$('#delete-post').disabled && !$('#save-post').disabled);
    } finally { dom.window.close(); }
  });
}
test('a failed workflow explains why the public homepage still shows deleted source', async () => {
  const { dom, $, state } = await setup();
  try {
    state.runConclusion = 'failure';
    $('#build-refresh').click();
    await wait(() => $('#build-chip').textContent.includes('failure'));
    assert($('#build-note').textContent.includes('公开首页仍是上一次成功发布的版本'));
    assert($('#build-note').textContent.includes('后台列表显示的是已提交的最新源码'));
  } finally { dom.window.close(); }
});

test('already deleted on GitHub synchronizes locally without sending a DELETE', async () => {
  const { dom, $, files, state } = await setup();
  try {
    files.delete(path);
    listButton($, '删除').click(); $('#modal-ok').click();
    await wait(() => $('#posts-count').textContent === '0');
    assert.equal(state.deletes.length, 0);
  } finally { dom.window.close(); }
});
test('a newly saved article remains deletable when list refresh fails', async () => {
  const { dom, $, files, state } = await setup();
  try {
    $('#new-post-button').click();
    $('#f-title').value = '新文章'; $('#f-slug').value = 'new-post';
    $('#f-date').value = '2026-01-01T10:00'; $('#f-body').value = '正文';
    state.failTree = true;
    $('#save-post').click();
    await wait(() => !$('#save-post').disabled && !$('#delete-post').hidden);
    $('#delete-post').click(); $('#modal-ok').click();
    await wait(() => state.deletes.length === 1);
    assert.equal(state.deletes[0].path, 'blog/source/_posts/new-post.md');
    assert.equal(state.deletes[0].sha, 'saved-sha');
    await wait(() => !files.has('blog/source/_posts/new-post.md'));
  } finally { dom.window.close(); }
});
test('double clicking delete creates one confirmation and one request', async () => {
  const { dom, $, state } = await setup();
  try {
    const button = listButton($, '删除'); button.click(); button.click();
    $('#modal-ok').click();
    await wait(() => $('#posts-count').textContent === '0');
    assert.equal(state.deletes.length, 1);
  } finally { dom.window.close(); }
});
test('an isolated last-post deletion builds/checks/exports an empty blog and removes managed stale HTML', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'minxi-empty-'));
  const source = resolve('.');
  const repo = resolve('..');
  try {
    await cp(source, join(temp, 'blog'), { recursive: true, filter: (path) => {
      const relative = path.slice(source.length + 1);
      return !['node_modules', 'public', 'source/_posts', 'db.json'].some(p => relative === p || relative.startsWith(p + '/'));
    } });
    await symlink(join(source, 'node_modules'), join(temp, 'blog/node_modules'), 'dir');
    const managed = JSON.parse(await readFile(join(repo, '.blog-output.json'), 'utf8'));
    await copyFile(join(repo, '.blog-output.json'), join(temp, '.blog-output.json'));
    for (const file of managed) {
      await mkdir(dirname(join(temp, file)), { recursive: true });
      await copyFile(join(repo, file), join(temp, file));
    }
    await exec('npm', ['run', 'publish:prepare'], { cwd: join(temp, 'blog'), timeout: 60000 });
    assert.deepEqual(JSON.parse(await readFile(join(temp, 'search.json'), 'utf8')), []);
    await stat(join(temp, 'archives/index.html'));
    await stat(join(temp, 'index.html'));
    for (const file of managed.filter(p => /^\d{4}\//.test(p))) {
      await assert.rejects(stat(join(temp, file)), { code: 'ENOENT' });
    }
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('renamed articles are deleted at the new path even when the list cannot refresh', async () => {
  const { dom, $, files, state } = await setup();
  try {
    listButton($, '编辑').click();
    await wait(() => $('#editor-status').textContent.includes('已加载'));
    $('#f-slug').value = 'renamed';
    state.failTree = true;
    $('#save-post').click();
    await wait(() => !$('#save-post').disabled && files.has('blog/source/_posts/renamed.md') && !files.has(path));
    $('#delete-post').click(); $('#modal-ok').click();
    await wait(() => state.deletes.length === 2);
    assert.equal(state.deletes[1].path, 'blog/source/_posts/renamed.md');
    assert.equal(state.deletes[1].sha, 'saved-sha');
    await wait(() => !files.has('blog/source/_posts/renamed.md'));
  } finally { dom.window.close(); }
});
