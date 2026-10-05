import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { exists, readOptional, treeFiles, assertSafePath, atomicWrite, applyOperations } from './files.mjs';
import { configurationOperations, profilePaths } from './platforms.mjs';

export const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function planInstall(options) {
  const { platform, home, stateDir, replace = false } = options;
  if (!['claude', 'hermes'].includes(platform)) throw new Error('Choose --platform claude or hermes.');
  await assertSafePath(home);
  await assertSafePath(stateDir);
  const profile = path.join(home, platform === 'claude' ? '.claude' : '.hermes');
  const manifestPath = path.join(stateDir, `installed-${platform}.json`);
  const previousText = await readOptional(manifestPath);
  const previous = previousText ? JSON.parse(previousText) : { files: {} };
  const operations = [];
  const add = async (target, content, managed = true, mode = 0o600) => {
    await assertSafePath(target);
    const before = await readOptional(target);
    if (managed && before !== null && before !== content && previous.files?.[target] !== before && !replace) {
      throw new Error(`Existing or edited file: ${target}. Review and pass --replace to back up and replace.`);
    }
    operations.push({ path: target, before, content, mode });
  };
  for (const root of ['src', 'skills', 'agents', 'hooks']) {
    if (!await exists(path.join(packageRoot, root))) continue;
    for (const name of await treeFiles(path.join(packageRoot, root))) {
      const content = await fs.readFile(path.join(packageRoot, root, name), 'utf8');
      await add(path.join(stateDir, 'runtime', root, name), content);
      if (root === 'skills') await add(path.join(profile, root, name), content);
      if (root === 'agents' && platform === 'claude') await add(path.join(profile, root, name), content);
      if (root === 'agents' && platform === 'hermes') {
        // Hermes has no Claude agent-file registry; workers load these as skill references.
        await add(path.join(profile, 'skills/thinktank/references/domains', name), content);
      }
    }
  }
  // Ship the dependency itself; installed runtime must survive npm-cache deletion.
  const require = createRequire(import.meta.url);
  const yamlRoot = path.dirname(require.resolve('yaml/package.json'));
  for (const name of await treeFiles(yamlRoot)) {
    await add(path.join(stateDir, 'runtime/node_modules/yaml', name), await fs.readFile(path.join(yamlRoot, name), 'utf8'));
  }
  await add(path.join(stateDir, 'runtime/package.json'), await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8'));
  const existing = {};
  for (const file of profilePaths(platform, home)) {
    await assertSafePath(file);
    existing[file] = await readOptional(file);
  }
  for (const op of configurationOperations({ platform, home, stateDir, existing, replace })) {
    await add(op.path, op.content, false);
  }
  const manifest = { version: 17, platform, home, stateDir, files: {} };
  for (const op of operations) {
    if (!profilePaths(platform, home).includes(op.path)) manifest.files[op.path] = op.content;
  }
  await add(manifestPath, JSON.stringify(manifest, null, 2) + '\n', false);
  return { platform, home, stateDir, operations, changes: operations.filter(op => op.before !== op.content).map(op => op.path) };
}

export async function install(options) {
  // Validate every profile file and configuration before Docker/network side effects.
  const plan = await planInstall(options);
  if (options.dryRun) return { ...plan, operations: undefined, dryRun: true };
  await fs.mkdir(options.stateDir, { recursive: true, mode: 0o700 });
  await assertSafePath(path.join(options.stateDir, 'install.lock'));
  const lock = await fs.open(path.join(options.stateDir, 'install.lock'), 'wx', 0o600).catch(error => {
    if (error.code === 'EEXIST') throw new Error('Installation already active (install.lock). Remove a stale lock only after checking no installer runs.');
    throw error;
  });
  try {
    const { ensureDocker, ensureUv } = await import('./bootstrap.mjs');
    const docker = await ensureDocker({ timeoutMs: options.timeoutMs });
    process.env.PATH = `${path.dirname(docker)}${path.delimiter}${process.env.PATH ?? ''}`;
    await ensureUv(options.stateDir);
    const { provisionQdrant } = await import('../qdrant/index.mjs');
    const qdrant = await provisionQdrant({ stateDir: options.stateDir, port: options.port, collection: options.collection, timeoutMs: options.timeoutMs });
    const backupDir = path.join(options.stateDir, 'backups', randomUUID());
    const changed = await applyOperations(plan.operations, backupDir);
    // Verify the exact profile targets before reporting success.
    for (const op of plan.operations) {
      if (await readOptional(op.path) !== op.content) throw new Error(`Read-back failed: ${op.path}`);
    }
    return { platform: options.platform, changed, stateDir: options.stateDir, backupDir, url: qdrant.url, collection: qdrant.collection, restartRequired: true };
  } finally {
    await lock.close();
    await fs.rm(path.join(options.stateDir, 'install.lock'), { force: true });
  }
}

export async function doctor(options) {
  const report = { platform: options.platform, installed: false, configuration: false, qdrant: false, errors: [] };
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(options.stateDir, `installed-${options.platform}.json`), 'utf8'));
    for (const [file, content] of Object.entries(manifest.files)) {
      if (await readOptional(file) !== content) throw new Error(`Installed file missing or changed: ${file}`);
    }
    report.installed = true;
    const existing = {};
    for (const file of profilePaths(options.platform, options.home)) existing[file] = await readOptional(file);
    const expected = configurationOperations({ ...options, existing });
    report.configuration = expected.every(op => op.content === existing[op.path]);
    if (!report.configuration) report.errors.push('Managed configuration or hook missing; rerun install.');
  } catch (error) { report.errors.push(error.message); }
  try {
    const config = JSON.parse(await fs.readFile(path.join(options.stateDir, 'qdrant.json'), 'utf8'));
    const { doctorQdrant } = await import('../qdrant/index.mjs');
    await doctorQdrant(config);
    report.qdrant = true;
  } catch (error) { report.errors.push(error.message); }
  return report;
}
