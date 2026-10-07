import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const repo = path.resolve(import.meta.dirname, '..');
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'tt-codex-package-')));
const home = path.join(root, 'home');
const cache = path.join(root, 'npm-cache');
const archives = path.join(root, 'archives');
const env = { ...process.env, npm_config_cache: cache, npm_config_update_notifier: 'false',
  npm_config_audit: 'false', npm_config_fund: 'false' };
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: 120000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${command} ${args.join(' ')}: ${result.stderr || result.stdout}`);
  return result.stdout;
}
try {
  await fs.mkdir(archives);
  run('npm', ['pack', '--pack-destination', archives], repo);
  const names = await fs.readdir(archives);
  assert.equal(names.length, 1);
  const archive = path.join(archives, names[0]);
  const prefix = ['--yes', '--package', archive, 'thinktank'];
  assert.match(run('npx', [...prefix, '--help']), /hermes\|claude\|codex/);
  const args = [...prefix, 'install', '--platform', 'codex', '--home', home, '--yes'];
  assert.match(run('npx', args), /Installation verified/);
  assert.match(run('npx', args), /"changed": 0/);
  const diagnosis = run('npx', [...prefix, 'doctor', '--platform', 'codex', '--home', home]);
  assert.equal(JSON.parse(diagnosis).installed, true);
  assert.deepEqual(JSON.parse(diagnosis).errors, []);
  const skillDir = path.join(home, '.agents/skills/thinktank-codex');
  await fs.access(path.join(skillDir, 'SKILL.md'));
  await fs.rm(cache, { recursive: true, force: true });
  await fs.rm(archives, { recursive: true, force: true });
  // Installed helper execution uses only bundled resources after npx/cache removal.
  const verification = run(process.execPath, [path.join(skillDir, 'scripts/verify.mjs')], home);
  assert.match(verification, /"ok": true/);
  assert.deepEqual(await fs.readdir(path.join(home, '.thinktank')), ['installed-codex.json']);
  console.log('PASS real packed npx: Codex install, unchanged reinstall, doctor and standalone validation after cache/tarball removal.');
  console.log('PASS Codex provisioning: no Docker/uv, Qdrant state or foreign hooks.');
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
