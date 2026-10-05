import { spawn as nodeSpawn } from 'node:child_process';
import { access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { constants as osConstants } from 'node:os';
import { MCP_VERSION, QdrantError, fail, validateConfig } from './config.mjs';

export async function findExecutable(name, env = process.env) {
  for (const dir of (env.PATH ?? '').split(path.delimiter).filter(p => path.isAbsolute(p))) {
    const file = path.join(dir, name);
    try { await access(file, constants.X_OK); if ((await stat(file)).isFile()) return file; } catch { /* continue search */ }
  }
  return null;
}
export function mcpEnvironment(config, inherited = process.env) {
  validateConfig(config);
  const env = { ...inherited };
  for (const [key, value] of Object.entries(env)) {
    const upper = key.toUpperCase();
    if (upper === 'QDRANT_LOCAL_PATH' && value) fail('QDRANT_MCP_LOCAL_PATH', 'QDRANT_LOCAL_PATH widerspricht dem isolierten Server. Variable entfernen; kein lokaler Fallback.');
    // Pydantic aliases are case-insensitive; remove duplicates before setting them.
    if (upper.startsWith('QDRANT_') || upper.startsWith('EMBEDDING_') || upper === 'COLLECTION_NAME' || upper === 'FASTMCP_DEBUG' || upper === 'FASTMCP_LOG_LEVEL') delete env[key];
  }
  return { ...env, QDRANT_URL: config.url, QDRANT_API_KEY: config.apiKey,
    COLLECTION_NAME: config.collection, EMBEDDING_PROVIDER: 'fastembed',
    EMBEDDING_MODEL: config.embeddingModel, QDRANT_READ_ONLY: 'false',
    QDRANT_ALLOW_ARBITRARY_FILTER: 'false', FASTMCP_DEBUG: 'false', FASTMCP_LOG_LEVEL: 'WARNING' };
}
// Version and aliases audited against PyPI's 0.8.1 wheel; no network at launch.
// The pinned wheel's main.py defaults to stdio, so no server CLI flags needed.
export async function preflightMcp(deps = {}) {
  const env = deps.env ?? process.env;
  for (const [key, value] of Object.entries(env)) if (key.toUpperCase() === 'QDRANT_LOCAL_PATH' && value) fail('QDRANT_MCP_LOCAL_PATH', 'QDRANT_LOCAL_PATH widerspricht dem isolierten Server. Variable entfernen; kein lokaler Fallback.');
  const find = deps.findExecutable ?? findExecutable;
  let command = await find('uvx', env);
  let args = [`mcp-server-qdrant==${MCP_VERSION}`];
  if (!command) {
    command = await find('uv', env);
    args = ['tool', 'run', ...args];
  }
  if (!command && deps.stateDir) {
    const privateEnv = { ...env, PATH: path.join(deps.stateDir, 'bin') };
    command = await find('uv', privateEnv);
    args = ['tool', 'run', `mcp-server-qdrant==${MCP_VERSION}`];
  }
  if (!command) fail('QDRANT_DEPENDENCY', 'uvx/uv fehlt. Den ThinkTank-Installationsbefehl erneut ausführen; er richtet uv privat ein.');
  return { command, args };
}
export async function launchMcp(config, deps = {}) {
  const target = deps.process ?? process;
  const spawn = deps.spawn ?? nodeSpawn;
  const env = mcpEnvironment(config, deps.env ?? process.env);
  const { command, args } = await preflightMcp({ ...deps, env, stateDir: config.stateDir });
  return new Promise((resolve, reject) => {
    let child, settled = false;
    const signals = new Map();
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      for (const [signal, handler] of signals) target.removeListener(signal, handler);
      if (error) {
        target.exitCode = error.exitCode ?? 1;
        reject(error);
      } else resolve(result);
    };
    const startError = () => finish(new QdrantError('QDRANT_MCP_START', 'MCP konnte nicht gestartet werden; uv-Ausführbarkeit und Paketauflösung prüfen.', { exitCode: 1 }));
    try { child = spawn(command, args, { env, shell: false, stdio: 'inherit' }); }
    catch { startError(); return; }
    child.once('error', startError);
    child.once('close', (code, signal) => {
      if (code === 0 && !signal) finish(null, { exitCode: 0, signal: null });
      else finish(new QdrantError('QDRANT_MCP_EXIT', signal ? `MCP durch ${signal} beendet.` : `MCP mit Exitcode ${Number(code)} beendet.`,
        { exitCode: code || 128 + (osConstants.signals[signal] ?? 1), signal }));
    });
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
      const handler = () => { child.kill(signal); };
      signals.set(signal, handler);
      target.on(signal, handler);
    }
  });
}
