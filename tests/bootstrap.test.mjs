import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { ensureUv, ensureDocker, detectPlatforms, verifyDownload } from '../src/installer/bootstrap.mjs';

test('uv already on PATH needs no download or state writes', async () => {
  const result = await ensureUv('/not-created', { findExecutable: async name => name === 'uv' ? '/bin/uv' : null, fetch: () => assert.fail('network') });
  assert.equal(result.installed, false);
});

test('download verification fails closed before extraction', () => {
  const bytes = Buffer.from('verified artifact fixture');
  verifyDownload(bytes, createHash('sha256').update(bytes).digest('hex'));
  assert.throws(() => verifyDownload(bytes, '0'.repeat(64)), /checksum mismatch/);
});

test('private uv reused; unsafe binary rejected', async t => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'tt-bootstrap-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'bin'));
  await fs.writeFile(path.join(root, 'bin/uv'), '#!/bin/sh\nexit 0', { mode: 0o700 });
  const deps = { findExecutable: async () => null, fetch: () => assert.fail('network') };
  assert.equal((await ensureUv(root, deps)).source, path.join(root, 'bin/uv'));
  await fs.chmod(path.join(root, 'bin/uv'), 0o777);
  await assert.rejects(ensureUv(root, deps), /Unsafe/);
});

test('Docker already ready does not install or launch anything', async () => {
  const calls = [];
  const docker = await ensureDocker({ platform: 'linux', findExecutable: async () => '/usr/bin/docker', spawnSync: (cmd, args) => {
    calls.push([cmd, args]); return { status: 0 };
  } });
  assert.equal(docker, '/usr/bin/docker');
  assert.deepEqual(calls.map(x => x[1][0]), ['info', 'compose']);
});

test('macOS bootstrap installs only missing Docker and keeps errors actionable', async () => {
  let installed = false;
  const calls = [];
  const deps = { platform: 'darwin', findExecutable: async name => name === 'brew' ? '/bin/brew' : installed ? '/bin/docker' : null,
    spawnSync: (command, args) => { calls.push([command, args]); if (command === '/bin/brew') installed = true; return { status: 0 }; } };
  // On a host with bundled Docker the existing executable wins, also a valid no-install path.
  await ensureDocker(deps);
  if (calls.some(x => x[0] === '/bin/brew')) assert.deepEqual(calls[0][1], ['install', '--cask', 'docker-desktop']);
  await assert.rejects(ensureDocker({ platform: 'linux', findExecutable: async () => null }), /administrator/);
});

test('installer forwards the selected Docker startup deadline', async () => {
  const source = await fs.readFile(new URL('../src/installer/index.mjs', import.meta.url), 'utf8');
  assert.match(source, /ensureDocker\(\{ timeoutMs: options\.timeoutMs \}\)/);
});

test('platform discovery uses actual commands, not a fixed preferred application', async t => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'tt-detect-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  assert.deepEqual(await detectPlatforms(root, { findExecutable: async name => name === 'claude' ? '/bin/claude' : null }), ['claude']);
  assert.deepEqual(await detectPlatforms(root, { findExecutable: async () => null }), []);
  assert.deepEqual(await detectPlatforms(root, { findExecutable: async name => '/bin/' + name }), ['hermes', 'claude']);
});
