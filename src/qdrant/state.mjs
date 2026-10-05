import path from 'node:path';
import { constants } from 'node:fs';
import { lstat, mkdir, open, unlink, link, readlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { fail, statePath, validateState } from './config.mjs';

async function info(file) {
  try { return await lstat(file); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
export async function secureDirectory(input, create = false) {
  let dir = statePath(input);
  // macOS os.tmpdir() commonly begins /var, a root-owned system alias.
  // Only these exact OS aliases are canonicalized; arbitrary symlinks fail.
  if (process.platform === 'darwin') {
    for (const alias of ['/var', '/tmp']) {
      if (dir === alias || dir.startsWith(`${alias}/`)) {
        const meta = await info(alias);
        if (meta?.isSymbolicLink() && meta.uid === 0 && await readlink(alias) === `private${alias}`) dir = `/private${dir}`;
      }
    }
  }
  let cursor = path.parse(dir).root;
  const segments = dir.slice(cursor.length).split(path.sep).filter(Boolean);
  for (let i = 0; i < segments.length; i++) {
    cursor = path.join(cursor, segments[i]);
    let meta = await info(cursor);
    if (!meta && create) {
      try { await mkdir(cursor, { mode: 0o700 }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
      meta = await info(cursor);
    }
    const stickySystemAncestor = meta && i < segments.length - 1 && meta.uid === 0 && (meta.mode & 0o1000);
    if (!meta || !meta.isDirectory() || meta.isSymbolicLink() || ((meta.mode & 0o022) && !stickySystemAncestor)) fail('QDRANT_STATE', 'Zustandspfad fehlt, ist schreibbar für Dritte oder enthält einen Symlink.');
    if (process.getuid && meta.uid !== 0 && meta.uid !== process.getuid()) fail('QDRANT_STATE', 'Zustandspfad gehört einem fremden Benutzer.');
    if (i === segments.length - 1 && ((meta.mode & 0o777) !== 0o700 || (process.getuid && meta.uid !== process.getuid()))) fail('QDRANT_STATE', 'stateDir muss dem aktuellen Benutzer gehören und Modus 0700 haben.');
  }
  if (!segments.length) fail('QDRANT_STATE', 'Root-Verzeichnis ist kein zulässiger stateDir.');
  return dir;
}
export async function privateRead(file) {
  const meta = await info(file);
  if (!meta) return null;
  if (!meta.isFile() || meta.isSymbolicLink() || meta.nlink !== 1 || (meta.mode & 0o777) !== 0o600 || (process.getuid && meta.uid !== process.getuid())) fail('QDRANT_STATE', 'Zustandsdatei muss eine private reguläre Datei mit Modus 0600 sein.');
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const current = await handle.stat();
    if (current.ino !== meta.ino || current.dev !== meta.dev || current.nlink !== 1 || (current.mode & 0o777) !== 0o600) fail('QDRANT_STATE', 'Zustandsdatei wurde während des Lesens ausgetauscht.');
    return await handle.readFile('utf8');
  } finally { await handle.close(); }
}
// Exclusive hard-link publication is atomic and never replaces an existing file.
export async function privateCreate(file, content) {
  const temp = `${file}.${randomBytes(12).toString('hex')}.tmp`;
  let handle;
  try {
    handle = await open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    await handle.writeFile(content);
    await handle.sync();
    await handle.close();
    handle = null;
    await link(temp, file);
  } catch {
    fail('QDRANT_STATE', 'Private Zustandsdatei konnte nicht exklusiv und atomar angelegt werden.');
  } finally {
    await handle?.close();
    await unlink(temp).catch(() => {});
  }
}
export async function ensureFile(file, expected) {
  const existing = await privateRead(file);
  if (existing === null) await privateCreate(file, expected);
  else if (existing !== expected) fail('QDRANT_STATE', 'Vorhandene Compose-/Umgebungsdatei widerspricht dem privaten Zustand; keine automatische Überschreibung.');
}
export async function stateLock(dir) {
  const file = path.join(dir, '.qdrant.lock');
  let handle;
  try { handle = await open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); }
  catch { fail('QDRANT_STATE', 'Qdrant-Zustand ist gesperrt. Parallelen Installer beenden; verwaiste .qdrant.lock nur nach Prozessprüfung entfernen.'); }
  return async () => { await handle.close(); await unlink(file); };
}
export async function readState(dir) {
  const text = await privateRead(path.join(dir, 'qdrant.json'));
  if (text === null) return null;
  let config;
  try { config = JSON.parse(text); } catch { fail('QDRANT_STATE', 'qdrant.json ist kein gültiger JSON-Zustand.'); }
  return validateState(config, dir);
}
export async function loadQdrantConfig(stateDir) {
  const dir = await secureDirectory(stateDir);
  const config = await readState(dir);
  if (!config) fail('QDRANT_STATE', 'qdrant.json fehlt; zuerst den Installationsassistenten ausführen.');
  return config;
}
