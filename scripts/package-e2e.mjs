import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { parse } from 'yaml';
import { probeMcp } from './mcp-probe.mjs';
import { composeCommand, dockerEnvironment } from '../src/qdrant/index.mjs';

const repo = path.resolve(import.meta.dirname, '..');
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'tt-package-e2e-')));
const home = path.join(root, 'home');
const stateDir = path.join(home, '.thinktank');
const cache = path.join(root, 'npm-cache');
const env = { ...process.env, npm_config_cache: cache, npm_config_update_notifier: 'false' };
let config;
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, env, encoding: 'utf8', timeout: 300000, ...options });
  assert.equal(result.status, 0, `${command} failed: ${result.stderr || result.error || result.stdout}`);
  return result.stdout;
}
try {
  await fs.mkdir(path.join(root, 'archives'));
  run('npm', ['pack', '--pack-destination', path.join(root, 'archives')], { cwd: repo });
  const archives = await fs.readdir(path.join(root, 'archives'));
  assert.equal(archives.length, 1);
  const archive = path.join(root, 'archives', archives[0]);
  const prefix = ['--yes', '--package', archive, 'thinktank'];
  assert.match(run('npx', [...prefix, '--help']), /ThinkTank V17/);
  assert.match(run('npx', [...prefix, '--version']), /17\.0\.0/);
  console.log('PASS packed npm bin via real npx: help and version');
  for (const platform of ['hermes', 'claude']) {
    const args = [...prefix, 'install', '--platform', platform, '--home', home, '--yes'];
    const result = run('npx', args);
    assert.match(result, /Installation verified/);
    config = JSON.parse(await fs.readFile(path.join(stateDir, 'qdrant.json'), 'utf8'));
    if (process.env.THINKTANK_TEST_PRIVATE_UV === '1') {
      assert.ok((await fs.stat(path.join(stateDir, 'bin/uv'))).isFile(), 'uv must have been bootstrapped privately');
      console.log('PASS automatic private uv bootstrap without global uv');
    }
    assert.match(run('npx', args), /"changed": 0/);
    const profile = platform === 'hermes'
      ? parse(await fs.readFile(path.join(home, '.hermes/config.yaml'), 'utf8'))
      : JSON.parse(await fs.readFile(path.join(home, '.claude/settings.json'), 'utf8'));
    const command = platform === 'hermes' ? profile.hooks.pre_tool_call[0].command : profile.hooks.PreToolUse[0].hooks[0].command;
    const payload = JSON.stringify({ tool_name: platform === 'hermes' ? 'terminal' : 'Bash', tool_input: { command: 'npm publish' } });
    assert.deepEqual(JSON.parse(run('/bin/sh', ['-c', command], { input: payload })), {});
    const denied = JSON.parse(run('/bin/sh', ['-c', command], { input: payload, env: { ...env, [`${platform.toUpperCase()}_TT_LOOP_MODE`]: '1' } }));
    assert.ok(platform === 'hermes' ? denied.decision === 'block' : denied.hookSpecificOutput.permissionDecision === 'deny');
    console.log(`PASS ${platform}: real npx install/reinstall and installed hook invocation`);
  }
  // Remove every transient package copy. Only the managed runtime may remain.
  await fs.rm(cache, { recursive: true, force: true });
  await fs.rm(path.join(root, 'archives'), { recursive: true, force: true });
  const cli = path.join(stateDir, 'runtime/src/cli.mjs');
  for (const platform of ['hermes', 'claude']) {
    const diagnosis = JSON.parse(run(process.execPath, [cli, 'doctor', '--platform', platform, '--home', home]));
    assert.deepEqual(diagnosis.errors, []);
  }
  console.log('PASS persistent doctor for both hosts after npm-cache and tarball removal');
  const mcp = await probeMcp(process.execPath, [cli, 'mcp', '--state-dir', stateDir]);
  assert.equal(mcp.recalled, true);
  console.log('PASS persistent installed MCP: initialize/list/store/find with real embeddings');
} finally {
  if (!config) {
    try { config = JSON.parse(await fs.readFile(path.join(stateDir, 'qdrant.json'), 'utf8')); } catch {}
  }
  if (config && config.composeFile.startsWith(root + path.sep)) {
    const command = composeCommand(config, ['down', '--volumes', '--remove-orphans']);
    const result = spawnSync(command.command, command.args, { env: dockerEnvironment(), timeout: 60000, encoding: 'utf8' });
    assert.equal(result.status, 0, `Cleanup failed; retain test state ${root}`);
    const left = spawnSync('docker', ['ps', '-aq', '--filter', `label=com.docker.compose.project=${config.projectName}`], { encoding: 'utf8' });
    assert.equal(left.stdout.trim(), '');
    console.log('PASS disposable package-test Compose cleanup');
  }
  await fs.rm(root, { recursive: true, force: true });
}
