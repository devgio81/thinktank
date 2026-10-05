import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'yaml';
import { parseArgs } from '../src/cli.mjs';
import { configurationOperations, shellQuote } from '../src/installer/platforms.mjs';
import { applyOperations, assertSafePath } from '../src/installer/files.mjs';
import { planInstall } from '../src/installer/index.mjs';

async function temp(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'thinktank-installer-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

test('CLI validates every user boundary before side effects', () => {
  for (const argv of [['--wat'], ['--platform','x'], ['--port','22'], ['--port','1e4'], ['--collection','../x'], ['--timeout','0'], ['--home'], ['--yes','--yes']]) {
    assert.throws(() => parseArgs(argv));
  }
  assert.equal(parseArgs(['install','--platform','hermes','--port','7777']).port, 7777);
});

test('Claude configuration preserves unrelated keys and installs idempotently', () => {
  const opts = { platform: 'claude', home: '/tmp/tt', stateDir: '/tmp/tt/state', existing: {
    '/tmp/tt/.claude.json': '{"mcpServers":{"other":{"command":"other"}},"theme":"dark"}',
    '/tmp/tt/.claude/settings.json': '{"permissions":{"deny":["Bash(rm:*)"]},"hooks":{"PreToolUse":[{"matcher":"Read","hooks":[{"command":"other"}]}]}}',
  } };
  const result = configurationOperations(opts);
  const config = JSON.parse(result[0].content);
  assert.equal(config.theme, 'dark');
  assert.equal(config.mcpServers.other.command, 'other');
  assert.ok(!JSON.stringify(config).includes('API_KEY'));
  assert.equal(JSON.parse(result[1].content).hooks.PreToolUse.length, 2);
  assert.deepEqual(configurationOperations({ ...opts, existing: Object.fromEntries(result.map(op => [op.path, op.content])) }), result);
});

test('Hermes YAML preserves comments, model, approvals and other MCP servers', () => {
  const opts = { platform: 'hermes', home: '/tmp/tt', stateDir: '/tmp/tt/state', existing: {
    '/tmp/tt/.hermes/config.yaml': '# keep my comment\nmodel:\n  default: mine\napprovals:\n  mode: manual\nmcp_servers:\n  other:\n    command: other\n',
  } };
  const [result] = configurationOperations(opts);
  const config = parse(result.content);
  assert.ok(result.content.includes('# keep my comment'));
  assert.equal(config.model.default, 'mine');
  assert.equal(config.approvals.mode, 'manual');
  assert.equal(config.mcp_servers.other.command, 'other');
  assert.equal(config.hooks.pre_tool_call.length, 1);
  assert.deepEqual(configurationOperations({ ...opts, existing: { [result.path]: result.content } }), [result]);
});

test('invalid and conflicting configurations fail without overwriting', () => {
  const opts = { platform: 'hermes', home: '/tmp/x', stateDir: '/tmp/state' };
  for (const text of ['[]', 'a: [', 'a: 1\na: 2', 'hooks:\n  pre_tool_call: wrong', 'mcp_servers:\n  qdrant-thinktank:\n    command: other']) {
    assert.throws(() => configurationOperations({ ...opts, existing: { '/tmp/x/.hermes/config.yaml': text } }));
  }
});

test('dry-run plan does not create state or profiles', async t => {
  const root = await temp(t);
  const home = path.join(root, 'home');
  const plan = await planInstall({ platform: 'hermes', home, stateDir: path.join(home, '.thinktank') });
  assert.ok(plan.changes.length > 0);
  await assert.rejects(fs.stat(home), { code: 'ENOENT' });
});

test('writes are backed up and a stale preflight causes rollback', async t => {
  const root = await temp(t);
  const a = path.join(root, 'a');
  const b = path.join(root, 'b');
  await fs.writeFile(a, 'old');
  await fs.writeFile(b, 'concurrent');
  await assert.rejects(applyOperations([
    { path: a, before: 'old', content: 'new' },
    { path: b, before: 'expected', content: 'new' },
  ], path.join(root, 'backups')), /Changed since preflight/);
  assert.equal(await fs.readFile(a, 'utf8'), 'old');
  assert.equal(await fs.readFile(b, 'utf8'), 'concurrent');
  assert.equal(await fs.readFile(path.join(root, 'backups/0-a'), 'utf8'), 'old');
});

test('symlink profile escapes fail and shell paths are safely quoted', async t => {
  const root = await temp(t);
  await fs.mkdir(path.join(root, 'outside'));
  await fs.symlink(path.join(root, 'outside'), path.join(root, '.hermes'));
  await assert.rejects(assertSafePath(path.join(root, '.hermes/config.yaml')), /symlink/);
  assert.equal(shellQuote("a'b"), "'a'\\''b'");
});
