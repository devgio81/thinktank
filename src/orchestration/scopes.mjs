import { lstatSync, realpathSync, readdirSync } from 'node:fs';
import { isAbsolute, resolve, join, sep } from 'node:path';

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
  return scope.key.split('/').some(p => ['.git', '.claude', '.hermes', 'loop-grants', 'loop-checker'].includes(p)) ||
    ['claude.md', 'agents.md', '.mcp.json'].includes(scope.key.split('/').at(-1));
}
export function contains(root, child) {
  return root.key === child.key && (root.tree || !child.tree) || root.tree && child.key.startsWith(`${root.key}/`);
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
      const info = lstatSync(current);
      if (info.isSymbolicLink() || info.isFile() && info.nlink > 1) throw new Error('Tree contains a symlink or hardlink alias');
      if (!info.isDirectory() && !info.isFile()) throw new Error('Tree contains a special file');
      if (info.isDirectory()) for (const name of readdirSync(current).sort()) pending.push(join(current, name));
    }
  }
}
export function cwdAllowed(value, repo) {
  if (value === '.') return true;
  const scope = parseScope(value);
  if (scope.tree) throw new Error('cwd must be a relative directory or .');
  inspectScope(repo, { ...scope, tree: true });
  return true;
}
