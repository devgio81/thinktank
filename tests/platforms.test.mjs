import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { configurationOperations } from '../src/installer/platforms.mjs';
import { applyOperations } from '../src/installer/files.mjs';
import { planInstall } from '../src/installer/index.mjs';

async function temp(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'thinktank-platform-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

test('both host installations are isolated, idempotent and conflict-aware', async t => {
  const home = await temp(t);
  const stateDir = path.join(home, 'state');
  for (const platform of ['claude', 'hermes']) {
    const options = { platform, home, stateDir };
    const first = await planInstall(options);
    assert.ok(first.changes.length > 0);
    await applyOperations(first.operations, path.join(home, `backup-${platform}`));
    const second = await planInstall(options);
    assert.equal(second.changes.length, 0);
    for (const op of first.operations) assert.ok(op.path.startsWith(`${home}/`));
    const skill = path.join(home, platform === 'claude' ? '.claude' : '.hermes', 'skills/thinktank/SKILL.md');
    await fs.appendFile(skill, '\nLocal edit\n');
    await assert.rejects(planInstall(options), /Existing or edited file/);
    const replaced = await planInstall({ ...options, replace: true });
    const backup = path.join(home, `replaced-${platform}`);
    await applyOperations(replaced.operations, backup);
    const index = JSON.parse(await fs.readFile(path.join(backup, 'index.json'), 'utf8'));
    const saved = index.find(entry => entry.target === skill);
    assert.ok(saved);
    assert.match(await fs.readFile(saved.backup, 'utf8'), /Local edit/);
  }
});

test('a managed hook grouped with another hook does not delete the other', () => {
  const options = { platform: 'claude', home: '/tmp/x', stateDir: '/tmp/x/state', existing: {} };
  const first = configurationOperations(options);
  const settings = JSON.parse(first[1].content);
  settings.hooks.PreToolUse[0].hooks.push({ command: 'user-hook', type: 'command' });
  const result = configurationOperations({ ...options, existing: {
    [first[0].path]: first[0].content,
    [first[1].path]: JSON.stringify(settings),
  } });
  assert.ok(JSON.parse(result[1].content).hooks.PreToolUse.some(entry => entry.hooks.some(h => h.command === 'user-hook')));
});

test('CLI help and negative options need no target profile writes', async t => {
  const home = await temp(t);
  const cli = path.resolve('src/cli.mjs');
  const result = spawnSync(process.execPath, [cli, '--help'], { env: { ...process.env, HOME: home }, encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Hermes One/);
  const bad = spawnSync(process.execPath, [cli, '--platform', 'hermes'], { env: { ...process.env, HOME: home }, encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /--yes/);
  assert.deepEqual(await fs.readdir(home), []);
});
