import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { assertSafePath, readOptional, treeFiles, applyOperations } from './files.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const bundle = path.join(root, 'codex/skills/thinktank-codex');
const digest = content => createHash('sha256').update(content).digest('hex');

function targets(options) {
  const home = path.resolve(options.home);
  const stateDir = path.resolve(options.stateDir ?? path.join(home, '.thinktank'));
  const skillsDir = path.resolve(options.skillsDir ?? path.join(home, '.agents/skills'));
  const skillDir = path.join(skillsDir, 'thinktank-codex');
  // Keep bookkeeping outside the installed skill and its resource tree.
  const relative = path.relative(skillDir, stateDir);
  if (!relative || relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) {
    throw new Error('Codex state directory must be outside the installed skill.');
  }
  return { home, stateDir, skillsDir, skillDir, manifestPath: path.join(stateDir, 'installed-codex.json') };
}

function manifest(text, locations) {
  if (text === null) return { files: {} };
  const value = JSON.parse(text);
  if (value?.schema !== 1 || value.platform !== 'codex' || value.skillDir !== locations.skillDir ||
      !value.files || typeof value.files !== 'object' || Array.isArray(value.files)) {
    throw new Error('Invalid or differently targeted Codex installation manifest. Use a separate state directory.');
  }
  for (const [name, hash] of Object.entries(value.files)) {
    if (path.isAbsolute(name) || name.split(/[\\/]/).some(part => !part || part === '.' || part === '..') ||
        typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) throw new Error('Invalid Codex manifest file entry.');
  }
  return value;
}

export async function planCodexInstall(options) {
  const locations = targets(options);
  for (const target of [locations.home, locations.stateDir, locations.skillDir, locations.manifestPath]) await assertSafePath(target);
  const previousText = await readOptional(locations.manifestPath);
  const previous = manifest(previousText, locations);
  const operations = [];
  const files = {};
  for (const name of await treeFiles(bundle)) {
    const target = path.join(locations.skillDir, name);
    await assertSafePath(target);
    const content = await fs.readFile(path.join(bundle, name), 'utf8');
    const before = await readOptional(target);
    const hash = digest(content);
    if (before !== null && before !== content && previous.files[name] !== digest(before) && !options.replace) {
      throw new Error(`Existing or edited file: ${target}. Review and pass --replace to back up and replace.`);
    }
    files[name] = hash;
    operations.push({ path: target, before, content, mode: 0o600 });
  }
  const content = JSON.stringify({ schema: 1, platform: 'codex', version: '17.1.0-codex.1',
    skillDir: locations.skillDir, files }, null, 2) + '\n';
  operations.push({ path: locations.manifestPath, before: previousText, content, mode: 0o600 });
  return { platform: 'codex', ...locations, operations,
    changes: operations.filter(op => op.before !== op.content).map(op => op.path) };
}

export async function installCodex(options) {
  // Pure preflight, then exclusive locking and a new plan while holding the lock.
  const preview = await planCodexInstall(options);
  if (options.dryRun) return { ...preview, operations: undefined, dryRun: true };
  const { stateDir } = preview;
  await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });
  const lockPath = path.join(stateDir, 'install.lock');
  await assertSafePath(lockPath);
  const lock = await fs.open(lockPath, 'wx', 0o600).catch(error => {
    if (error.code === 'EEXIST') throw new Error('Installation already active (install.lock). Check the active installer before removing a stale lock.');
    throw error;
  });
  try {
    const plan = await planCodexInstall(options);
    const backupDir = path.join(stateDir, 'backups', randomUUID());
    const changed = await applyOperations(plan.operations, backupDir);
    const checked = await doctorCodex(options);
    if (checked.errors.length) throw new Error(`Codex read-back failed: ${checked.errors.join('; ')}`);
    return { platform: 'codex', changed, stateDir, skillDir: plan.skillDir, backupDir,
      memory: 'existing host configuration', hooksInstalled: false, unattended: 'unavailable',
      invocation: '$thinktank-codex', restartRequired: false };
  } finally {
    await lock.close();
    await fs.rm(lockPath, { force: true });
  }
}

export async function doctorCodex(options) {
  const report = { platform: 'codex', installed: false, configuration: 'preserved',
    memory: 'existing host configuration; not probed', unattended: 'unavailable', errors: [] };
  try {
    const locations = targets(options);
    await assertSafePath(locations.manifestPath);
    const text = await readOptional(locations.manifestPath);
    if (text === null) throw new Error('Codex installation manifest missing. Run install first.');
    const current = manifest(text, locations);
    if (!Object.hasOwn(current.files, 'SKILL.md') || !Object.hasOwn(current.files, 'scripts/verify.mjs')) throw new Error('Incomplete Codex manifest.');
    for (const [name, hash] of Object.entries(current.files)) {
      const target = path.join(locations.skillDir, name);
      await assertSafePath(target);
      const content = await readOptional(target);
      if (content === null || digest(content) !== hash) throw new Error(`Installed file missing or changed: ${target}`);
    }
    report.installed = true;
    report.skillDir = locations.skillDir;
  } catch (error) { report.errors.push(error.message); }
  return report;
}
