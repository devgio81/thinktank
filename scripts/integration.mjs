import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse } from 'yaml';
import { install, doctor, planInstall } from '../src/installer/index.mjs';
import { probeMcp } from './mcp-probe.mjs';

const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'thinktank-real-integration-')));
const stateDir = path.join(root, 'state');
const started = Date.now();
let config;
try {
  for (const platform of ['claude', 'hermes']) {
    const options = { platform, home: root, stateDir, collection: 'thinktank-memory', timeoutMs: 180000 };
    const result = await install(options);
    config = JSON.parse(await fs.readFile(path.join(stateDir, 'qdrant.json'), 'utf8'));
    assert.equal(result.collection, 'thinktank-memory');
    const healthy = await doctor(options);
    assert.deepEqual(healthy.errors, []);
    const second = await install(options);
    assert.equal(second.changed, 0, 'Repeat install must be idempotent');
    assert.equal((await planInstall(options)).changes.length, 0);
    const profile = platform === 'claude'
      ? JSON.parse(await fs.readFile(path.join(root, '.claude.json'), 'utf8')).mcpServers['qdrant-thinktank']
      : parse(await fs.readFile(path.join(root, '.hermes/config.yaml'), 'utf8')).mcp_servers['qdrant-thinktank'];
    assert.ok(profile.args[0].startsWith(stateDir));
    assert.ok(!JSON.stringify(profile).includes(config.apiKey));
    console.log(`PASS ${platform}: installation, profile read-back, doctor, unchanged reinstall`);
  }
  // Inspect the real service's Docker isolation, not only the generated YAML.
  const { composeCommand, dockerEnvironment } = await import('../src/qdrant/index.mjs');
  const composeArgs = composeCommand(config, []).args;
  const env = dockerEnvironment();
  const ps = spawnSync('docker', [...composeArgs, 'ps', '-q', 'qdrant'], { encoding: 'utf8', env });
  assert.equal(ps.status, 0, ps.stderr);
  const id = ps.stdout.trim();
  assert.ok(id);
  const inspection = spawnSync('docker', ['inspect', id], { encoding: 'utf8' });
  assert.equal(inspection.status, 0);
  const container = JSON.parse(inspection.stdout)[0];
  const ports = Object.values(container.NetworkSettings.Ports).flat().filter(Boolean);
  assert.ok(ports.length > 0 && ports.every(port => port.HostIp === '127.0.0.1'));
  assert.equal(container.Config.Labels['com.docker.compose.project'], config.projectName);
  const unauthenticated = await fetch(`${config.url}/collections`);
  assert.ok([401,403].includes(unauthenticated.status));
  const authenticated = await fetch(`${config.url}/collections/${config.collection}`, { headers: { 'api-key': config.apiKey } });
  assert.equal(authenticated.status, 200);
  const collection = await authenticated.json();
  assert.equal(collection.result.config.params.vectors[config.vectorName].size, config.dimension);
  assert.equal(collection.result.points_count, 0, 'REST smoke point must be cleaned');
  console.log('PASS real Qdrant: authenticated, loopback-only, owned project, schema and smoke cleanup');
  const mcp = await probeMcp(process.execPath, [path.join(stateDir, 'runtime/src/cli.mjs'), 'mcp', '--state-dir', stateDir]);
  console.log(`PASS real MCP: ${mcp.tools.join(', ')}; local embedding store/find round trip`);
  const result = await fetch(`${config.url}/collections/${config.collection}/points/scroll`, {
    method: 'POST', headers: { 'api-key': config.apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({ limit: 10, with_payload: true, with_vector: false }),
  });
  assert.equal(result.status, 200);
  const points = (await result.json()).result.points;
  assert.ok(JSON.stringify(points).includes(mcp.marker));
  console.log(`PASS stored MCP marker independently read from Qdrant REST (${points.length} point)`);
  console.log(JSON.stringify({ verified: true, platforms: ['claude','hermes'], mcp: true, seconds: Math.round((Date.now()-started)/1000) }));
} finally {
  // Scope cleanup to the random test root only. Never touch a real installation.
  if (!config) {
    try { config = JSON.parse(await fs.readFile(path.join(stateDir, 'qdrant.json'), 'utf8')); } catch {}
  }
  if (config?.projectName && config?.composeFile?.startsWith(root + path.sep)) {
    const { composeCommand, dockerEnvironment } = await import('../src/qdrant/index.mjs');
    const cleanup = composeCommand(config, ['down', '--volumes', '--remove-orphans']);
    const result = spawnSync(cleanup.command, cleanup.args, {
      env: dockerEnvironment(), encoding: 'utf8', timeout: 60000,
    });
    if (result.status !== 0) {
      console.error(`Disposable project cleanup failed: ${config.projectName}. State retained at ${root}`);
      process.exitCode = 1;
    } else {
      console.log(`Cleaned disposable Compose project ${config.projectName}`);
      await fs.rm(root, { recursive: true, force: true });
    }
  } else if (!config) await fs.rm(root, { recursive: true, force: true });
}
