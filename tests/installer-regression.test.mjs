import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse, stringify } from 'yaml';
import { configurationOperations } from '../src/installer/platforms.mjs';
import { applyOperations } from '../src/installer/files.mjs';
import { planInstall } from '../src/installer/index.mjs';

async function temp(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'tt-regression-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}
const run = (args, cwd) => spawnSync(process.execPath, args, { cwd, encoding: 'utf8', timeout: 30000 });

test('CLI executes when invoked through npm-style symlink and system alias', async t => {
  const root = await temp(t);
  const cli = path.join(root, 'cli.mjs');
  await fs.copyFile(path.resolve('src/cli.mjs'), cli);
  const link = path.join(root, 'thinktank');
  await fs.symlink(cli, link);
  const result = run([link, '--help']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ThinkTank V17/);
  if (process.platform === 'darwin') {
    const alias = await fs.mkdtemp('/tmp/tt-cli-alias-');
    t.after(() => fs.rm(alias, { recursive: true, force: true }));
    await fs.copyFile(cli, path.join(alias, 'cli.mjs'));
    assert.match(run([path.join(alias, 'cli.mjs'), '--help']).stdout, /ThinkTank V17/);
  }
});

test('persisted runtime includes dependencies and supports install and doctor outside npm tree', async t => {
  const home = await temp(t);
  const stateDir = path.join(home, 'state');
  const plan = await planInstall({ platform: 'hermes', home, stateDir });
  await applyOperations(plan.operations, path.join(home, 'backup'));
  const cli = path.join(stateDir, 'runtime/src/cli.mjs');
  const preview = run([cli, '--platform', 'hermes', '--home', path.join(home, 'other'), '--dry-run'], home);
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(preview.stdout, /"dryRun": true/);
  const doctor = run([cli, 'doctor', '--platform', 'hermes', '--home', home, '--state-dir', stateDir], home);
  assert.ok(!doctor.stderr.includes('Cannot find package'), doctor.stderr);
  assert.equal(JSON.parse(doctor.stdout).installed, true);
});

for (const platform of ['claude', 'hermes']) {
  const decode = text => platform === 'claude' ? JSON.parse(text) : parse(text);
  const encode = value => platform === 'claude' ? JSON.stringify(value) : stringify(value);
  const hooks = config => platform === 'claude' ? config.hooks.PreToolUse : config.hooks.pre_tool_call;
  const timeout = hook => platform === 'claude' ? hook.hooks[0].timeout : hook.timeout;
  const options = { platform, home: '/tmp/tt-fixture', stateDir: '/tmp/tt-state-a', existing: {} };
  test(`${platform}: locally edited managed hooks require explicit replacement`, () => {
    const first = configurationOperations(options);
    const existing = Object.fromEntries(first.map(op => [op.path, op.content]));
    const file = first.at(-1).path;
    const config = decode(existing[file]);
    hooks(config)[0].matcher = 'Read';
    if (platform === 'claude') hooks(config)[0].hooks[0].timeout = 99;
    else hooks(config)[0].timeout = 99;
    existing[file] = encode(config);
    assert.throws(() => configurationOperations({ ...options, existing }), /hook.*conflict|hook.*changed/i);
    const replaced = configurationOperations({ ...options, existing, replace: true });
    assert.equal(timeout(hooks(decode(replaced.at(-1).content))[0]), 10);
  });
  test(`${platform}: deliberate state migration replaces own old hook and keeps unrelated hooks`, () => {
    const first = configurationOperations(options);
    const existing = Object.fromEntries(first.map(op => [op.path, op.content]));
    const file = first.at(-1).path;
    const config = decode(existing[file]);
    hooks(config).push(platform === 'claude'
      ? { matcher: 'Read', hooks: [{ command: 'user-hook', type: 'command' }] }
      : { command: 'user-hook', matcher: 'read_file', timeout: 5 });
    existing[file] = encode(config);
    const migrated = configurationOperations({ ...options, existing, stateDir: '/tmp/tt-state-b', replace: true });
    const all = hooks(decode(migrated.at(-1).content));
    const commands = all.flatMap(h => platform === 'claude' ? h.hooks.map(x => x.command) : [h.command]);
    assert.equal(commands.length, 2);
    assert.ok(commands.includes('user-hook'));
    assert.ok(commands.some(x => x.includes('/tmp/tt-state-b/')));
    assert.ok(!commands.some(x => x.includes('/tmp/tt-state-a/')));
  });
}

test('backup index failure rolls back already replaced files', async t => {
  const root = await temp(t);
  const target = path.join(root, 'target');
  const backup = path.join(root, 'backups');
  await fs.writeFile(target, 'ORIGINAL');
  await fs.mkdir(path.join(backup, 'index.json'), { recursive: true });
  await assert.rejects(applyOperations([{ path: target, before: 'ORIGINAL', content: 'REPLACEMENT' }], backup));
  assert.equal(await fs.readFile(target, 'utf8'), 'ORIGINAL');
});
