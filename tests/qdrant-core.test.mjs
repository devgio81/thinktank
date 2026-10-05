import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, stat, chmod, symlink, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { provisionQdrant, doctorQdrant, smokeQdrant, loadQdrantConfig, composeCommand } from '../src/qdrant/index.mjs';
import { secureDirectory } from '../src/qdrant/state.mjs';
import { tmpdir } from 'node:os';

const root = path.resolve('tests');
async function fixture(t) {
  const dir = await mkdtemp(path.join(root, '.qdrant-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return path.join(dir, 'state');
}
function backend() {
  const calls = [], commands = [], points = new Map();
  let schema, created = 0, ownership = [], volume = [];
  const reply = (status, data) => new Response(JSON.stringify(data), { status });
  const fetch = async (url, options) => {
    const pathname = new URL(url).pathname;
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ pathname, method: options.method, body, headers: options.headers });
    if (pathname === '/readyz') return new Response('ok');
    if (/\/collections\/[^/]+$/.test(pathname)) {
      if (options.method === 'PUT') { schema = body.vectors; created++; return reply(200, { result: true }); }
      return schema ? reply(200, { result: { config: { params: { vectors: schema } } } }) : reply(404, {});
    }
    const id = pathname.split('/').at(-1);
    if (options.method === 'GET') return points.has(id) ? reply(200, { result: points.get(id) }) : reply(404, {});
    if (id === 'points') { for (const p of body.points) points.set(p.id, p); return reply(200, { result: { status: 'completed' } }); }
    if (id === 'query') return reply(200, { result: { points: [...points.values()].filter(p => body.filter.must[0].has_id.includes(p.id)).map(p => ({ ...p, score: 1 })) } });
    if (id === 'delete') { for (const id of body.points) points.delete(id); return reply(200, { result: { status: 'completed' } }); }
    return reply(500, {});
  };
  const run = async (command, args, options) => {
    commands.push({ command, args, options });
    if (args[0] === 'ps') return { stdout: ownership.map(x => x.id).join('\n') };
    if (args[0] === 'inspect') return { stdout: JSON.stringify(ownership[0]) };
    if (args[0] === 'volume' && args[1] === 'ls') return { stdout: volume.map(v => v.Name).join('\n') };
    if (args[0] === 'volume' && args[1] === 'inspect') return { stdout: JSON.stringify(volume[0]) };
    if (args[0] === 'context') return { stdout: '"unix:///test/docker.sock"' };
    return { stdout: '' };
  };
  return { fetch, run, findExecutable: async () => '/test/uvx', calls, commands, points, get created() { return created; }, set schema(x) { schema = x; }, set ownership(x) { ownership = x; }, set volume(x) { volume = x; } };
}

test('provision repeats without key rotation; schema, private files and Compose are isolated', async t => {
  const stateDir = await fixture(t), fake = backend();
  const first = await provisionQdrant({ stateDir }, fake);
  const second = await provisionQdrant({ stateDir }, fake);
  assert.deepEqual(first, second);
  assert.equal(first.collection, 'thinktank-memory');
  assert.match(first.url, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(first.vectorName, 'fast-all-minilm-l6-v2');
  assert.equal(first.dimension, 384);
  assert.equal(first.embeddingModel, 'sentence-transformers/all-MiniLM-L6-v2');
  assert.match(first.apiKey, /^[a-f0-9]{64}$/);
  assert.equal(fake.created, 1);
  assert.equal(fake.points.size, 0);
  assert.deepEqual(await loadQdrantConfig(stateDir), first);
  for (const file of ['qdrant.json', 'qdrant.env', 'compose.yaml']) assert.equal((await stat(path.join(stateDir, file))).mode & 0o777, 0o600);
  assert.equal((await stat(stateDir)).mode & 0o777, 0o700);
  const text = await readFile(first.composeFile, 'utf8'), compose = JSON.parse(text);
  assert.ok(!text.includes(first.apiKey));
  assert.equal(compose.services.qdrant.image, 'qdrant/qdrant:v1.19.0');
  assert.equal(compose.services.qdrant.container_name, undefined);
  assert.deepEqual(compose.services.qdrant.ports, [`127.0.0.1:${first.port}:6333`]);
  assert.deepEqual(compose.volumes.storage, { labels: { 'dev.thinktank.instance': first.instanceId } });
  assert.ok(!JSON.stringify(fake.commands).includes(first.apiKey));
  const other = await provisionQdrant({ stateDir: await fixture(t) }, backend());
  assert.notEqual(other.projectName, first.projectName);
  assert.notEqual(other.apiKey, first.apiKey);
  const cleanup = composeCommand(first, ['down', '-v']);
  assert.equal(cleanup.command, 'docker');
  assert.ok(cleanup.args.includes(first.projectName));
  assert.ok(cleanup.args.includes(first.composeFile));
  assert.deepEqual(cleanup.args.slice(-2), ['down', '-v']);
});

test('doctor is read-only and mismatch refuses all point or schema changes', async t => {
  const fake = backend(), config = await provisionQdrant({ stateDir: await fixture(t) }, fake);
  fake.calls.length = 0;
  assert.equal((await doctorQdrant(config, fake)).ok, true);
  assert.ok(fake.calls.every(c => c.method === 'GET'));
  for (const vectors of [{ size: 384, distance: 'Cosine' }, { [config.vectorName]: { size: 768, distance: 'Cosine' } }, { [config.vectorName]: { size: 384, distance: 'Dot' } }]) {
    fake.schema = vectors;
    fake.calls.length = 0;
    await assert.rejects(provisionQdrant({ stateDir: config.stateDir }, fake), { code: 'QDRANT_SCHEMA' });
    assert.ok(fake.calls.every(c => c.method === 'GET'));
  }
});

test('auth failures and HTTP/body errors are secret-safe and redirects are refused', async t => {
  const fake = backend(), config = await provisionQdrant({ stateDir: await fixture(t) }, fake);
  for (const status of [401, 403, 500]) {
    await assert.rejects(doctorQdrant(config, { fetch: async (_u, opts) => {
      assert.equal(opts.redirect, 'error');
      return new Response(config.apiKey, { status });
    } }), e => !e.message.includes(config.apiKey) && e.code === (status === 500 ? 'QDRANT_HTTP' : 'QDRANT_AUTH'));
  }
  await assert.rejects(doctorQdrant(config, { fetch: async () => { throw new Error(config.apiKey); } }), e => e.code === 'QDRANT_NETWORK' && !e.message.includes(config.apiKey));
});

test('hard REST deadline covers fetch and body even if the injected implementation ignores abort', async t => {
  const config = await provisionQdrant({ stateDir: await fixture(t) }, backend());
  for (const fetch of [() => new Promise(() => {}), async () => ({ status: 200, text: () => new Promise(() => {}) })]) {
    await assert.rejects(doctorQdrant({ ...config, timeoutMs: 25 }, { fetch }), { code: 'QDRANT_TIMEOUT' });
  }
});

test('explicit occupied port refuses without Docker up or state adoption', async t => {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const fake = backend(), stateDir = await fixture(t);
  await assert.rejects(provisionQdrant({ stateDir, port: server.address().port }, fake), { code: 'QDRANT_PORT' });
  assert.ok(!fake.commands.some(c => c.args.includes('up')));
  await assert.rejects(readFile(path.join(stateDir, 'qdrant.json')), { code: 'ENOENT' });
});

test('unsafe state and symlinks are rejected without touching their targets', async t => {
  const stateDir = await fixture(t), parent = path.dirname(stateDir);
  await mkdir(stateDir, { mode: 0o755 });
  await assert.rejects(provisionQdrant({ stateDir }, backend()), { code: 'QDRANT_STATE' });
  await chmod(stateDir, 0o700);
  const victim = path.join(parent, 'victim');
  await writeFile(victim, 'unchanged');
  await symlink(victim, path.join(stateDir, 'qdrant.json'));
  await assert.rejects(provisionQdrant({ stateDir }, backend()), { code: 'QDRANT_STATE' });
  assert.equal(await readFile(victim, 'utf8'), 'unchanged');
  const link = path.join(parent, 'linked');
  await symlink(stateDir, link);
  await assert.rejects(provisionQdrant({ stateDir: link }, backend()), { code: 'QDRANT_STATE' });
});

test('invalid inputs fail before writes; saved config conflicts do not rotate state', async t => {
  const stateDir = await fixture(t), fake = backend();
  for (const options of [{ port: 0 }, { port: '6333' }, { collection: '../escape' }, { timeoutMs: -1 }]) await assert.rejects(provisionQdrant({ stateDir, ...options }, fake), { code: 'QDRANT_CONFIG' });
  await assert.rejects(stat(stateDir), { code: 'ENOENT' });
  const config = await provisionQdrant({ stateDir }, fake);
  const before = await readFile(path.join(stateDir, 'qdrant.json'));
  await assert.rejects(provisionQdrant({ stateDir, collection: 'other' }, fake), { code: 'QDRANT_CONFIG' });
  assert.deepEqual(await readFile(path.join(stateDir, 'qdrant.json')), before);
  await chmod(path.join(stateDir, 'qdrant.json'), 0o644);
  await assert.rejects(loadQdrantConfig(stateDir), { code: 'QDRANT_STATE' });
  assert.ok(config.apiKey);
});

test('missing uv or conflicting local path fail before creating state or spawning Docker', async t => {
  const stateDir = await fixture(t), fake = backend();
  fake.findExecutable = async () => null;
  await assert.rejects(provisionQdrant({ stateDir }, fake), { code: 'QDRANT_DEPENDENCY' });
  await assert.rejects(stat(stateDir), { code: 'ENOENT' });
  assert.equal(fake.commands.length, 0);
  await assert.rejects(provisionQdrant({ stateDir }, { ...backend(), env: { QDRANT_LOCAL_PATH: '/never' } }), { code: 'QDRANT_MCP_LOCAL_PATH' });
});

test('macOS system tmp alias is recognized without creating out-of-worktree fixtures', async () => {
  const actual = await secureDirectory(tmpdir());
  assert.ok(path.isAbsolute(actual));
  if (process.platform === 'darwin' && tmpdir().startsWith('/var/')) assert.ok(actual.startsWith('/private/var/'));
});

test('owned running container skips up while foreign identity or same-name foreign volume is refused', async t => {
  const fake = backend(), config = await provisionQdrant({ stateDir: await fixture(t) }, fake);
  const labels = { 'dev.thinktank.instance': config.instanceId, 'com.docker.compose.project': config.projectName, 'com.docker.compose.service': 'qdrant' };
  const own = { id: 'a'.repeat(64), Config: { Labels: labels, Image: config.image },
    HostConfig: { PortBindings: { '6333/tcp': [{ HostIp: '127.0.0.1', HostPort: String(config.port) }] } },
    Mounts: [{ Type: 'volume', Name: `${config.projectName}_storage`, Destination: '/qdrant/storage' }], State: { Running: true } };
  fake.ownership = [own];
  fake.commands.length = 0;
  await provisionQdrant({ stateDir: config.stateDir }, fake);
  assert.ok(!fake.commands.some(c => c.args.includes('up')));
  for (const changed of [
    { ...own, Config: { ...own.Config, Labels: { ...labels, 'dev.thinktank.instance': 'foreign' } } },
    { ...own, HostConfig: { PortBindings: { '6333/tcp': [{ HostIp: '0.0.0.0', HostPort: String(config.port) }] } } },
    { ...own, Mounts: [{ Type: 'volume', Name: 'qdrant_local', Destination: '/qdrant/storage' }] },
  ]) {
    fake.ownership = [changed];
    fake.calls.length = 0;
    await assert.rejects(provisionQdrant({ stateDir: config.stateDir }, fake), { code: 'QDRANT_OWNERSHIP' });
    assert.equal(fake.calls.length, 0);
  }
  fake.ownership = [];
  fake.volume = [{ Name: `${config.projectName}_storage`, Labels: { ...labels, 'dev.thinktank.instance': 'foreign' } }];
  await assert.rejects(provisionQdrant({ stateDir: config.stateDir }, fake), { code: 'QDRANT_OWNERSHIP' });
});

test('retry after Docker failure preserves identity/key and serializes concurrent installers', async t => {
  const stateDir = await fixture(t), fake = backend(), run = fake.run;
  fake.run = async (...args) => { if (args[1].includes('up')) throw new Error('synthetic Docker failure'); return run(...args); };
  await assert.rejects(provisionQdrant({ stateDir }, fake));
  const before = await loadQdrantConfig(stateDir);
  fake.run = run;
  const after = await provisionQdrant({ stateDir }, fake);
  assert.deepEqual(before, after);
  let release, entered;
  const gate = new Promise(resolve => { entered = resolve; });
  fake.run = async (...args) => {
    if (args[1][0] === 'context') { entered(); await new Promise(resolve => { release = resolve; }); }
    return run(...args);
  };
  const first = provisionQdrant({ stateDir }, fake);
  await gate;
  await assert.rejects(provisionQdrant({ stateDir }, backend()), { code: 'QDRANT_STATE' });
  release();
  await first;
});

test('smoke only removes its marked UUID, including after query failure, and verifies deletion', async t => {
  const fake = backend(), config = await provisionQdrant({ stateDir: await fixture(t) }, fake);
  const foreign = { id: 'foreign', payload: { user: 'do not touch' } };
  fake.points.set('foreign', foreign);
  const fetch = fake.fetch;
  await assert.rejects(smokeQdrant(config, { fetch: async (url, opts) => url.endsWith('/query') ? new Response('failure', { status: 500 }) : fetch(url, opts) }), { code: 'QDRANT_HTTP' });
  assert.deepEqual([...fake.points.values()], [foreign]);
  await assert.rejects(smokeQdrant(config, { fetch: async (url, opts) => url.includes('/delete') ? new Response('{"result":true}') : fetch(url, opts) }), { code: 'QDRANT_SMOKE_CLEANUP' });
  assert.equal(fake.points.get('foreign'), foreign);
  assert.ok(fake.calls.filter(c => c.pathname.endsWith('/delete')).every(c => c.body.points.length === 1 && c.body.points[0] !== 'foreign'));
});

test('remote Docker context is refused and local environment cannot override managed key or Compose', async t => {
  const fake = backend(), stateDir = await fixture(t), run = fake.run;
  fake.run = async (...args) => args[1][0] === 'context' ? { stdout: '"ssh://remote"' } : run(...args);
  await assert.rejects(provisionQdrant({ stateDir }, fake), { code: 'QDRANT_DOCKER_REMOTE' });
  fake.run = run;
  fake.env = { PATH: '/fake', QDRANT_API_KEY: 'wrong', COMPOSE_FILE: '/foreign/compose.yaml', COMPOSE_PROJECT_NAME: 'foreign' };
  await provisionQdrant({ stateDir }, fake);
  for (const call of fake.commands) {
    assert.equal(call.options.env.QDRANT_API_KEY, undefined);
    assert.equal(call.options.env.COMPOSE_FILE, undefined);
    assert.equal(call.options.env.COMPOSE_PROJECT_NAME, undefined);
  }
});
