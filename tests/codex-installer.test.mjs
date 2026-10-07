import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { planInstall, install, doctor } from '../src/installer/index.mjs';
import { parseArgs } from '../src/cli.mjs';
import { detectPlatforms } from '../src/installer/bootstrap.mjs';

const repo = path.resolve(import.meta.dirname, '..');
async function fixture(t) {
  const home = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'tt-codex-')));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  return { platform: 'codex', home, stateDir: path.join(home, '.thinktank') };
}
function cli(args, home) {
  const result = spawnSync(process.execPath, [path.join(repo, 'src/cli.mjs'), ...args], {
    cwd: repo, env: { ...process.env, HOME: home, PATH: path.dirname(process.execPath) }, encoding: 'utf8', timeout: 30000,
  });
  assert.ifError(result.error);
  return result;
}

test('Codex is a real CLI target and auto-detected by command or profile', async t => {
  const options = await fixture(t);
  assert.equal(parseArgs(['--platform', 'codex']).platform, 'codex');
  assert.throws(() => parseArgs(['--platform', 'codex', '--port', '6333']), /existing host memory/);
  assert.throws(() => parseArgs(['--platform', 'claude', '--skills-dir', '/tmp/skills']), /only supported for Codex/);
  assert.deepEqual(await detectPlatforms(options.home, { findExecutable: async name => name === 'codex' ? '/bin/codex' : null }), ['codex']);
  await fs.mkdir(path.join(options.home, '.codex'));
  await fs.writeFile(path.join(options.home, '.codex/config.toml'), 'model = "existing"\n');
  assert.deepEqual(await detectPlatforms(options.home, { findExecutable: async () => null }), ['codex']);
});

test('same CLI installs Codex without Docker/uv, preserves settings and repeated install is unchanged', async t => {
  const options = await fixture(t);
  await fs.mkdir(path.join(options.home, '.codex'));
  const config = path.join(options.home, '.codex/config.toml');
  const before = 'model = "existing"\n[mcp_servers.qdrant-thinktank-v9]\ncommand = "existing"\n';
  await fs.writeFile(config, before);
  const args = ['install', '--platform', 'codex', '--home', options.home, '--yes'];
  const first = cli(args, options.home);
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /Installation verified/);
  assert.match(first.stdout, /\$thinktank-codex/);
  assert.equal(await fs.readFile(config, 'utf8'), before);
  assert.deepEqual((await fs.readdir(options.stateDir)).sort(), ['installed-codex.json']);
  assert.match(cli(args, options.home).stdout, /"changed": 0/);
  const report = await doctor(options);
  assert.equal(report.installed, true);
  assert.deepEqual(report.errors, []);
  assert.equal(cli(['doctor', '--platform', 'codex', '--home', options.home], options.home).status, 0);
  assert.equal((await planInstall(options)).changes.length, 0);
});

test('dry-run creates nothing and uses the selected legacy skills directory', async t => {
  const options = await fixture(t);
  const skillsDir = path.join(options.home, '.codex/skills');
  const args = ['install', '--platform', 'codex', '--home', options.home, '--skills-dir', skillsDir, '--dry-run'];
  assert.equal(cli(args, options.home).status, 0);
  assert.deepEqual(await fs.readdir(options.home), []);
  const installed = await install({ ...options, skillsDir });
  assert.equal(installed.skillDir, path.join(skillsDir, 'thinktank-codex'));
  assert.equal((await doctor({ ...options, skillsDir })).installed, true);
});

test('edited skills conflict, explicit replacement backs up, doctor detects drift', async t => {
  const options = await fixture(t);
  const first = await install(options);
  const skill = path.join(first.skillDir, 'SKILL.md');
  await fs.appendFile(skill, '\nUser customization\n');
  assert.equal((await doctor(options)).installed, false);
  await assert.rejects(install(options), /Existing or edited file/);
  const replaced = await install({ ...options, replace: true });
  const index = JSON.parse(await fs.readFile(path.join(replaced.backupDir, 'index.json'), 'utf8'));
  const saved = index.find(entry => entry.target === skill);
  assert.match(await fs.readFile(saved.backup, 'utf8'), /User customization/);
  const manifest = JSON.parse(await fs.readFile(path.join(options.stateDir, 'installed-codex.json'), 'utf8'));
  assert.match(manifest.files['SKILL.md'], /^[a-f0-9]{64}$/);
});

test('unsafe aliases, lock contention and differently targeted manifests fail closed', async t => {
  const options = await fixture(t);
  await fs.mkdir(path.join(options.home, 'outside'));
  await fs.symlink(path.join(options.home, 'outside'), path.join(options.home, '.agents'));
  await assert.rejects(install(options), /symlink/);
  await fs.unlink(path.join(options.home, '.agents'));
  await fs.mkdir(options.stateDir);
  await fs.writeFile(path.join(options.stateDir, 'install.lock'), 'active');
  await assert.rejects(install(options), /Installation already active/);
  await fs.unlink(path.join(options.stateDir, 'install.lock'));
  await install(options);
  await assert.rejects(planInstall({ ...options, skillsDir: path.join(options.home, 'other') }), /differently targeted/);
  await assert.rejects(planInstall({ ...options, stateDir: path.join(options.home, '.agents/skills/thinktank-codex/state') }), /outside the installed skill/);
});

test('installed Codex validation remains self-contained and protects inert acceptance', async t => {
  const options = await fixture(t);
  const { skillDir } = await install(options);
  const result = spawnSync(process.execPath, [path.join(skillDir, 'scripts/verify.mjs')], {
    cwd: options.home, env: { ...process.env, HOME: options.home }, encoding: 'utf8', timeout: 60000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /"ok": true/);
});
