import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { launchMcp, mcpEnvironment, findExecutable, EMBEDDING, MCP_VERSION } from '../src/qdrant/index.mjs';
import { runCommand } from '../src/qdrant/compose.mjs';

const config = { port: 65001, url: 'http://127.0.0.1:65001', collection: 'thinktank-memory',
  ...EMBEDDING, apiKey: '1'.repeat(64), mcpVersion: MCP_VERSION, timeoutMs: 200 };
function fake() {
  const child = new EventEmitter(), target = new EventEmitter(), calls = [], signals = [];
  child.kill = signal => { signals.push(signal); return true; };
  return { child, target, calls, signals, deps: {
    process: target, env: { PATH: '/test', HOME: '/test/home', INHERITED: 'kept', QDRANT_URL: 'wrong', QDRANT_API_KEY: 'wrong', qdrant_read_only: 'true', embedding_model: 'wrong' },
    findExecutable: async name => name === 'uvx' ? '/test/uvx' : null,
    spawn: (...args) => { calls.push(args); return child; },
  } };
}
async function started() { await new Promise(resolve => setImmediate(resolve)); }

test('MCP pins verified 0.8.1, inherits stdio without shell, sanitizes aliases and waits for child', async () => {
  const f = fake();
  let finished = false;
  const result = launchMcp(config, f.deps).then(value => { finished = true; return value; });
  await started();
  assert.equal(finished, false);
  const [command, args, options] = f.calls[0];
  assert.equal(command, '/test/uvx');
  assert.deepEqual(args, ['mcp-server-qdrant==0.8.1']);
  assert.equal(options.shell, false);
  assert.equal(options.stdio, 'inherit');
  assert.equal(options.env.INHERITED, 'kept');
  assert.equal(options.env.QDRANT_API_KEY, config.apiKey);
  assert.equal(options.env.QDRANT_URL, config.url);
  assert.equal(options.env.EMBEDDING_PROVIDER, 'fastembed');
  assert.equal(options.env.QDRANT_READ_ONLY, 'false');
  assert.equal(options.env.qdrant_read_only, undefined);
  assert.equal(options.env.embedding_model, undefined);
  assert.ok(!JSON.stringify(args).includes(config.apiKey));
  f.child.emit('close', 0, null);
  assert.deepEqual(await result, { exitCode: 0, signal: null });
  assert.equal(f.target.listenerCount('SIGINT'), 0);
});

test('uv tool run fallback and missing prerequisites are explicit', async () => {
  const f = fake();
  f.deps.findExecutable = async name => name === 'uv' ? '/test/uv' : null;
  const promise = launchMcp(config, f.deps);
  await started();
  assert.deepEqual(f.calls[0].slice(0, 2), ['/test/uv', ['tool', 'run', 'mcp-server-qdrant==0.8.1']]);
  f.child.emit('close', 0, null);
  await promise;
  await assert.rejects(launchMcp(config, { ...f.deps, findExecutable: async () => null }), { code: 'QDRANT_DEPENDENCY' });
});

test('local-path and schema/version contracts are checked before any executable lookup or spawn', async () => {
  for (const key of ['QDRANT_LOCAL_PATH', 'qdrant_local_path']) {
    const f = fake();
    f.deps.env[key] = '/never/open';
    f.deps.findExecutable = () => assert.fail('must not look up');
    await assert.rejects(launchMcp(config, f.deps), { code: 'QDRANT_MCP_LOCAL_PATH' });
    assert.equal(f.calls.length, 0);
  }
  for (const changes of [{ mcpVersion: 'latest' }, { dimension: 768 }, { url: 'http://example.com' }]) await assert.rejects(launchMcp({ ...config, ...changes }, fake().deps), { code: 'QDRANT_CONFIG' });
  assert.equal(mcpEnvironment(config, { QDRANT_LOCAL_PATH: '' }).QDRANT_LOCAL_PATH, undefined);
});

test('MCP errors, nonzero exits and signals are preserved without secret-bearing raw exceptions', async () => {
  for (const outcome of ['error', 'exit', 'signal', 'throw']) {
    const f = fake();
    if (outcome === 'throw') f.deps.spawn = () => { throw new Error(config.apiKey); };
    const promise = launchMcp(config, f.deps);
    const assertion = assert.rejects(promise, error => {
      assert.ok(!error.message.includes(config.apiKey));
      assert.equal(error.exitCode, outcome === 'exit' ? 7 : outcome === 'signal' ? 143 : 1);
      return true;
    });
    await started();
    if (outcome === 'error') f.child.emit('error', new Error(config.apiKey));
    if (outcome === 'exit') f.child.emit('close', 7, null);
    if (outcome === 'signal') { f.target.emit('SIGTERM'); assert.deepEqual(f.signals, ['SIGTERM']); f.child.emit('close', null, 'SIGTERM'); }
    await assertion;
    assert.equal(f.target.exitCode, outcome === 'exit' ? 7 : outcome === 'signal' ? 143 : 1);
    assert.equal(f.target.listenerCount('SIGTERM'), 0);
  }
});

test('findExecutable ignores relative PATH entries and resolves absolute executables', async t => {
  const dir = await mkdtemp(path.resolve('tests/.qdrant-bin-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const bin = path.join(dir, 'uvx');
  await writeFile(bin, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
  assert.equal(await findExecutable('uvx', { PATH: `.:relative:${dir}` }), bin);
  assert.equal(await findExecutable('missing', { PATH: dir }), null);
});

test('real subprocess output is captured privately, failures redact output, deadline terminates child', async () => {
  const env = { ...process.env, SYNTHETIC_VALUE: config.apiKey };
  assert.equal((await runCommand(process.execPath, ['-e', 'process.stdout.write("ok")'], { env })).stdout, 'ok');
  await assert.rejects(runCommand(process.execPath, ['-e', 'process.stderr.write(process.env.SYNTHETIC_VALUE);process.exit(9)'], { env }), error => error.exitCode === 9 && !error.message.includes(config.apiKey));
  await assert.rejects(runCommand(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeoutMs: 30 }), { code: 'QDRANT_TIMEOUT' });
  await assert.rejects(runCommand('/definitely/not/an/executable', []), { code: 'QDRANT_DEPENDENCY' });
});

test('standalone launch wrapper forwards only MCP stdout and preserves actual child exit status', async t => {
  const dir = await mkdtemp(path.resolve('tests/.qdrant-mcp-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const binDir = path.join(dir, 'bin');
  await mkdir(binDir);
  await writeFile(path.join(binDir, 'uvx'), `#!${process.execPath}\nif(process.argv[2] !== 'mcp-server-qdrant==0.8.1') process.exit(8); process.stdout.write('{"jsonrpc":"2.0","id":1,"result":{}}\\n'); process.stderr.write('mock MCP diagnostic\\n'); process.exit(7);\n`, { mode: 0o700 });
  const source = `import {launchMcp} from ${JSON.stringify(new URL('../src/qdrant/index.mjs', import.meta.url).href)}; const config=JSON.parse(process.env.MOCK_CONFIG); try { await launchMcp(config); } catch(e) { process.stderr.write(e.code+'\\n'); process.exitCode=e.exitCode??1; }`;
  const output = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', source], { env: { ...process.env, PATH: binDir, MOCK_CONFIG: JSON.stringify(config), QDRANT_LOCAL_PATH: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
  assert.equal(output.code, 7);
  assert.equal(output.stdout, '{"jsonrpc":"2.0","id":1,"result":{}}\n');
  assert.match(output.stderr, /QDRANT_MCP_EXIT/);
  assert.ok(!JSON.stringify(output).includes(config.apiKey));
});
