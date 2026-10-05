import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { findExecutable } from '../qdrant/mcp.mjs';
import { assertSafePath } from './files.mjs';

// Official release asset digests from astral-sh/uv 0.10.10. No remote script execution.
export const UV_VERSION = '0.10.10';
export const UV_ASSETS = Object.freeze({
  'darwin-arm64': ['aarch64-apple-darwin', '8a09f0ef51ee7f7170731b4cb8bde5bf9ba6da5304f49a7df6cdab42a1f37b5d'],
  'darwin-x64': ['x86_64-apple-darwin', 'dd18420591d625f9b4ca2b57a7a6fe3cce43910f02e02d90e47a4101428de14a'],
  'linux-arm64': ['aarch64-unknown-linux-gnu', '2b80457b950deda12e8d5dc3b9b7494ac143eae47f1fb11b1c6e5a8495a6421e'],
  'linux-x64': ['x86_64-unknown-linux-gnu', '3e1027f26ce8c7e4c32e2277a7fed2cb410f2f1f9320d3df97653d40e21f415b'],
});

export function verifyDownload(bytes, hash) {
  if (createHash('sha256').update(bytes).digest('hex') !== hash) throw new Error('uv download checksum mismatch; nothing executed.');
}

export async function ensureUv(stateDir, deps = {}) {
  const find = deps.findExecutable ?? findExecutable;
  if (await find('uvx') || await find('uv')) return { installed: false, source: 'PATH' };
  const bin = path.join(stateDir, 'bin');
  await assertSafePath(bin);
  const local = path.join(bin, 'uv');
  try {
    const info = await fs.lstat(local);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || (info.mode & 0o022)) throw new Error('Unsafe private uv executable.');
    await fs.access(local, fs.constants.X_OK);
    return { installed: false, source: local };
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const asset = UV_ASSETS[`${deps.platform ?? process.platform}-${deps.arch ?? process.arch}`];
  if (!asset) throw new Error('Automatic uv setup supports macOS and glibc Linux x64/arm64; this platform needs a supported uv on PATH.');
  const tar = await find('tar');
  if (!tar) throw new Error('System tar is required to unpack the verified uv binary.');
  const [target, hash] = asset;
  const url = `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-${target}.tar.gz`;
  const response = await (deps.fetch ?? fetch)(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`uv download failed (HTTP ${response.status}); rerun the same install command.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  verifyDownload(bytes, hash);
  await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });
  const scratch = path.join(stateDir, `.uv-${randomUUID()}`);
  await fs.mkdir(scratch, { mode: 0o700 });
  try {
    const archive = path.join(scratch, 'uv.tar.gz');
    await fs.writeFile(archive, bytes, { mode: 0o600, flag: 'wx' });
    const result = (deps.spawnSync ?? spawnSync)(tar, ['-xzf', archive, '-C', scratch, `uv-${target}/uv`, `uv-${target}/uvx`], { encoding: 'utf8', timeout: 30000 });
    if (result.status !== 0) throw new Error('Verified uv archive could not be unpacked.');
    await fs.mkdir(bin, { mode: 0o700, recursive: true });
    for (const name of ['uv', 'uvx']) {
      const source = path.join(scratch, `uv-${target}`, name);
      const info = await fs.lstat(source);
      if (!info.isFile() || info.isSymbolicLink()) throw new Error('Unexpected uv archive entry.');
      await fs.chmod(source, 0o700);
      // Exclusive publication avoids overwriting a concurrent install or local binary.
      await fs.link(source, path.join(bin, name));
    }
    return { installed: true, source: local, version: UV_VERSION };
  } finally { await fs.rm(scratch, { recursive: true, force: true }); }
}

export async function ensureDocker(deps = {}) {
  const find = deps.findExecutable ?? findExecutable;
  const run = deps.spawnSync ?? spawnSync;
  const platform = deps.platform ?? process.platform;
  let docker = await find('docker');
  if (!docker && (deps.platform ?? process.platform) === 'darwin') {
    const bundled = '/Applications/Docker.app/Contents/Resources/bin/docker';
    try { await fs.access(bundled, fs.constants.X_OK); docker = bundled; } catch {}
  }
  if (!docker && platform === 'darwin') {
    const brew = await find('brew');
    if (brew) {
      const installed = run(brew, ['install', '--cask', 'docker-desktop'], { stdio: 'inherit', timeout: 600000 });
      if (installed.status !== 0) throw new Error('Docker Desktop installation stopped. Complete any OS approval, then rerun the same command.');
      docker = await find('docker');
    }
  }
  if (!docker) throw new Error('Docker is required. Automatic macOS setup needs Homebrew. On Linux install Docker Engine/Compose using the OS administrator; rerun this same command afterwards.');
  const probe = () => run(docker, ['info', '--format', '{{.ServerVersion}}'], { encoding: 'utf8', timeout: 5000 }).status === 0;
  if (!probe()) {
    if ((deps.platform ?? process.platform) !== 'darwin' || process.env.DOCKER_HOST || process.env.DOCKER_CONTEXT) {
      throw new Error('Docker daemon unavailable. Start the selected Docker service/context and rerun the same command.');
    }
    const open = run('/usr/bin/open', ['-g', '-a', 'Docker'], { encoding: 'utf8', timeout: 10000 });
    if (open.status !== 0) throw new Error('Docker Desktop could not start. Open it and finish any OS consent, then rerun.');
    const deadline = Date.now() + (deps.timeoutMs ?? 120000);
    while (!probe()) {
      if (Date.now() >= deadline) throw new Error('Docker Desktop is not ready. Complete its first-run permissions, then rerun the same command.');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  if (run(docker, ['compose', 'version'], { encoding: 'utf8', timeout: 10000 }).status !== 0) throw new Error('Docker Compose v2 is missing from the selected Docker installation.');
  return docker;
}

export async function detectPlatforms(home, deps = {}) {
  const found = [];
  const find = deps.findExecutable ?? findExecutable;
  for (const platform of ['hermes', 'claude']) {
    let present = Boolean(await find(platform));
    if (!present) {
      const config = path.join(home, platform === 'hermes' ? '.hermes/config.yaml' : '.claude/settings.json');
      try { present = (await fs.stat(config)).isFile(); } catch {}
    }
    if (present) found.push(platform);
  }
  return found;
}
