import * as fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export async function exists(file) {
  try { await fs.lstat(file); return true; } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

export async function readOptional(file) {
  try { return await fs.readFile(file, 'utf8'); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function assertSafePath(file) {
  const absolute = path.resolve(file);
  let current = absolute;
  while (current !== path.dirname(current)) {
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) {
        // macOS exposes these immutable system aliases in os.tmpdir().
        const systemAlias = process.platform === 'darwin' && ['/var', '/tmp', '/etc'].includes(current)
          && await fs.realpath(current) === `/private${current}`;
        if (!systemAlias) throw new Error(`Refusing symlink target: ${current}`);
        current = path.dirname(current);
        continue;
      }
      if (current !== absolute && !stat.isDirectory()) throw new Error(`Not a directory: ${current}`);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    current = path.dirname(current);
  }
}

export async function treeFiles(root, relative = '') {
  const entries = await fs.readdir(path.join(root, relative), { withFileTypes: true });
  const result = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const name = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Package contains symlink: ${name}`);
    if (entry.isDirectory()) result.push(...await treeFiles(root, name));
    else if (entry.isFile()) result.push(name);
  }
  return result;
}

export async function atomicWrite(file, content, mode = 0o600) {
  await assertSafePath(file);
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.tmp-${randomUUID()}`;
  try {
    await fs.writeFile(temporary, content, { mode, flag: 'wx' });
    await fs.rename(temporary, file);
  } finally { await fs.rm(temporary, { force: true }); }
}

export async function applyOperations(operations, backupDir) {
  const applied = [];
  try {
    for (const op of operations) {
      await assertSafePath(op.path);
      const old = await readOptional(op.path);
      // A concurrent editor must not be silently overwritten after the preview.
      if (old !== op.before) throw new Error(`Changed since preflight: ${op.path}; rerun installer.`);
      if (old === op.content) continue;
      if (old !== null) {
        const backup = path.join(backupDir, `${applied.length}-${path.basename(op.path)}`);
        await atomicWrite(backup, old);
      }
      await atomicWrite(op.path, op.content, op.mode ?? 0o600);
      applied.push({ ...op, backup: old !== null ? path.join(backupDir, `${applied.length}-${path.basename(op.path)}`) : null });
    }
    if (applied.some(op => op.backup)) {
      await atomicWrite(path.join(backupDir, 'index.json'), JSON.stringify(
        applied.filter(op => op.backup).map(op => ({ target: op.path, backup: op.backup })), null, 2) + '\n');
    }
  } catch (error) {
    for (const op of applied.reverse()) {
      if (await readOptional(op.path) !== op.content) continue;
      if (op.before === null) await fs.rm(op.path);
      else await atomicWrite(op.path, op.before);
    }
    throw error;
  }
  return applied.length;
}
