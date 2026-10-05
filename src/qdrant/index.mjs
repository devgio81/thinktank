import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { EMBEDDING, IMAGE, MCP_VERSION, fail, collectionName, portNumber, projectName, timeout } from './config.mjs';
import { secureDirectory, stateLock, readState, privateCreate, ensureFile } from './state.mjs';
import { runCommand, composeDocument, composeCommand, dockerEnvironment, localDocker, availablePort, ownedContainer } from './compose.mjs';
import { readiness, ensureCollection, doctorQdrant, smokeQdrant } from './rest.mjs';
import { preflightMcp } from './mcp.mjs';

export { doctorQdrant, smokeQdrant } from './rest.mjs';
export { launchMcp, mcpEnvironment, findExecutable, preflightMcp } from './mcp.mjs';
export { loadQdrantConfig } from './state.mjs';
export { composeCommand, composeDocument, dockerEnvironment } from './compose.mjs';
export { QdrantError, EMBEDDING, IMAGE, MCP_VERSION } from './config.mjs';

/** Production needs only options. Optional second argument injects REST/processes for tests. */
export async function provisionQdrant({ stateDir, port, collection, timeoutMs } = {}, deps = {}) {
  if (port !== undefined) portNumber(port);
  if (collection !== undefined) collectionName(collection);
  if (timeoutMs !== undefined) timeout(timeoutMs);
  await preflightMcp({ ...deps, stateDir });
  const dir = await secureDirectory(stateDir, true);
  const unlock = await stateLock(dir);
  try {
    let config = await readState(dir);
    const existing = config !== null;
    if (existing) {
      if ((port !== undefined && port !== config.port) || (collection !== undefined && collection !== config.collection)) fail('QDRANT_CONFIG', 'Port/Collection widersprechen dem vorhandenen Zustand. Separaten stateDir verwenden; keine automatische Migration.');
    } else {
      const actualPort = await availablePort(port);
      const instanceId = randomBytes(16).toString('hex');
      config = {
        stateVersion: 1, stateDir: dir, instanceId, projectName: projectName(dir, instanceId),
        composeFile: path.join(dir, 'compose.yaml'), envFile: path.join(dir, 'qdrant.env'),
        image: IMAGE, port: actualPort, url: `http://127.0.0.1:${actualPort}`,
        collection: collectionName(collection), ...EMBEDDING,
        apiKey: randomBytes(32).toString('hex'), mcpVersion: MCP_VERSION, timeoutMs: timeout(timeoutMs),
      };
    }
    const run = deps.run ?? runCommand;
    const execution = { env: dockerEnvironment(deps.env ?? process.env), timeoutMs: timeout(timeoutMs ?? config.timeoutMs), cwd: dir };
    // Deadline can change for a retry without changing the persisted identity/key.
    const runtime = { ...config, timeoutMs: execution.timeoutMs };
    await localDocker(run, execution);
    const running = await ownedContainer(config, existing, run, execution);
    if (!running) await availablePort(config.port);
    if (!existing) await privateCreate(path.join(dir, 'qdrant.json'), `${JSON.stringify(config, null, 2)}\n`);
    await ensureFile(config.composeFile, composeDocument(config));
    await ensureFile(config.envFile, `QDRANT_API_KEY=${config.apiKey}\n`);
    if (!running) {
      const command = composeCommand(config, ['up', '-d']);
      await run(command.command, command.args, execution);
    }
    await readiness(runtime, deps);
    await ensureCollection(runtime, deps);
    await smokeQdrant(runtime, deps);
    await doctorQdrant(runtime, deps);
    return runtime;
  } finally { await unlock(); }
}
