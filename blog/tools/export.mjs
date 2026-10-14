// Export only managed static files to the existing GitHub Pages branch root.
// Never recursively delete directories or touch Git/source/configuration files.
import assert from 'node:assert/strict';
import { copyFile, lstat, mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(root, 'blog/public');
const manifestPath = join(root, '.blog-output.json');
const allowed = /\.(html|css|js|json|svg|png|jpe?g|webp|gif|ico|xml|txt|woff2?|ttf|pdf)$/i;
function validate(path) {
  assert.equal(typeof path, 'string');
  assert(path && !path.includes('\\') && !path.startsWith('/'), `Invalid output: ${path}`);
  assert(path.split('/').every(part => part && !part.startsWith('.')), `Hidden/parent path: ${path}`);
  assert(!['blog', 'node_modules'].includes(path.split('/')[0]), `Reserved output: ${path}`);
  assert(allowed.test(path), `Unsupported static output: ${path}`);
  return join(root, path);
}
async function ensureNoSymlink(path) {
  let current = root;
  for (const part of path.split('/')) {
    current = join(current, part);
    try { assert(!(await lstat(current)).isSymbolicLink(), `Symlink not allowed: ${current}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
async function walk(dir, prefix = '') {
  const files = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = prefix + item.name;
    assert(!item.isSymbolicLink(), `Symlink not allowed: ${path}`);
    if (item.isDirectory()) files.push(...await walk(join(dir, item.name), path + '/'));
    else files.push(path);
  }
  return files;
}
const files = (await walk(publicDir)).sort();
assert(files.includes('index.html') && files.includes('search.json'), 'Build the blog before exporting');
const previous = JSON.parse(await readFile(manifestPath, 'utf8'));
assert(Array.isArray(previous));
for (const path of new Set([...files, ...previous])) {
  validate(path);
  await ensureNoSymlink(path);
}
// Refuse to overwrite a new unmanaged path; existing managed files are safe to refresh.
const managed = new Set(previous);
for (const path of files.filter(path => !managed.has(path))) {
  try {
    await lstat(validate(path));
    throw new Error(`Refusing to overwrite unmanaged file: ${path}`);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
for (const path of files) {
  const destination = validate(path);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(join(publicDir, path), destination);
}
for (const path of previous.filter(path => !files.includes(path))) {
  try { await unlink(validate(path)); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
await ensureNoSymlink('.nojekyll');
await writeFile(join(root, '.nojekyll'), '');
await writeFile(manifestPath, JSON.stringify(files, null, 2) + '\n');
console.log(`✓ Exported ${files.length} static files to the Pages root. Commit them together with the source changes.`);
