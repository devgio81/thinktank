import { lstatSync, realpathSync, readdirSync } from 'node:fs';
import { isAbsolute, resolve, join, relative, sep } from 'node:path';

// Deliberately not a glob library. Only exact relative paths and suffix /** exist.
export function parseScope(value) {
  if (typeof value !== 'string') throw new Error('Scope must be a string');
  const tree = value.endsWith('/**');
  const base = tree ? value.slice(0, -3) : value;
  const parts = base.split('/');
  if (!base || parts.some(p => !/^[A-Za-z0-9_.-]+$/.test(p) || p === '.' || p === '..')) {
    throw new Error('Use a canonical relative path or directory/**; other glob syntax is unsupported');
  }
  return { base, tree, key: base.toLowerCase() };
}
export function protectedScope(scope) {
  return scope.key.split('/').some(p => ['.git', '.claude', '.hermes', '.codex', '.agents', '.thinktank', 'loop-grants', 'loop-checker'].includes(p)) ||
    ['claude.md', 'agents.md', '.mcp.json', 'settings.json', 'settings.local.json', 'keybindings.json'].includes(scope.key.split('/').at(-1));
}
export function contains(root, child) {
  // Capability membership must preserve spelling even for not-yet-created targets.
  // Case folding is only a conservative collision test in overlaps(), never a grant.
  return root.base === child.base && (root.tree || !child.tree) || root.tree && child.base.startsWith(`${root.base}/`);
}
export function overlaps(a, b) {
  // An exact directory-like token and directory/** must not evade ownership checks.
  return a.key === b.key || a.key.startsWith(`${b.key}/`) || b.key.startsWith(`${a.key}/`);
}
function stat(path) {
  try { return lstatSync(path); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
export function repository(path) {
  if (typeof path !== 'string' || !isAbsolute(path) || resolve(path) !== path || realpathSync(path) !== path || !lstatSync(path).isDirectory()) {
    throw new Error('repo_path must be an existing canonical absolute directory (no symlink alias)');
  }
  return path;
}
export function inspectScope(repo, scope, scanTree = false) {
  let path = repo;
  for (const part of scope.base.split('/')) {
    path = join(path, part);
    const s = stat(path);
    if (s?.isSymbolicLink()) throw new Error('Symlink scopes or ancestors are unsupported');
    if (s && !s.isDirectory() && !s.isFile()) throw new Error('Only regular files and directories are supported');
    if (s?.isFile() && s.nlink > 1) throw new Error('Hardlink aliases are unsupported');
    if (s && realpathSync(path) !== path) throw new Error('Noncanonical filesystem alias');
  }
  if (!path.startsWith(repo + sep)) throw new Error('Path escapes repository');
  const s = stat(path);
  if (s?.isDirectory() && !scope.tree) throw new Error('Existing directory scope requires /**');
  if (s?.isFile() && scope.tree) throw new Error('Tree scope points to a file');
  if (scanTree && scope.tree && s) {
    const pending = [path]; let count = 0;
    while (pending.length) {
      const current = pending.pop();
      if (++count > 10000) throw new Error('Tree inspection limit exceeded; narrow ownership');
      // A broad ownership tree must not hide an existing harness/control descendant.
      if (protectedScope({ key: relative(repo, current).split(sep).join('/').toLowerCase() })) {
        throw new Error('Write tree contains a protected harness/control path; narrow ownership');
      }
      const info = lstatSync(current);
      if (info.isSymbolicLink() || info.isFile() && info.nlink > 1) throw new Error('Tree contains a symlink or hardlink alias');
      if (!info.isDirectory() && !info.isFile()) throw new Error('Tree contains a special file');
      if (info.isDirectory()) for (const name of readdirSync(current).sort()) pending.push(join(current, name));
    }
  }
}
export function cwdAllowed(value, repo) {
  repository(repo);
  if (value === '.') return true;
  const scope = parseScope(value);
  if (scope.tree) throw new Error('cwd must be a relative directory or .');
  inspectScope(repo, { ...scope, tree: true });
  const info = stat(join(repo, scope.base));
  if (!info?.isDirectory()) throw new Error('cwd must name an existing directory');
  return true;
}
