import path from 'node:path';
import { parseDocument, isMap } from 'yaml';
import { isDeepStrictEqual } from 'node:util';
import { reconcileHooks } from './hooks.mjs';

export function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function object(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object; fix configuration before installing.`);
  }
  return value;
}

export function configurationOperations({ platform, home, stateDir, existing, replace = false }) {
  const runtime = path.join(stateDir, 'runtime');
  const guard = `${shellQuote(process.execPath)} ${shellQuote(path.join(runtime, 'src/guard/cli.mjs'))} --platform ${platform}`;
  const server = {
    command: process.execPath,
    args: [path.join(runtime, 'src/cli.mjs'), 'mcp', '--state-dir', stateDir],
  };
  const same = isDeepStrictEqual;
  function managedCommands(old) {
    const commands = new Set([guard]);
    commands.paths = new Set([path.join(runtime, 'src/guard/cli.mjs')]);
    // Identify the prior hook only from the exact MCP registration we replace.
    if (old && typeof old.command === 'string' && Array.isArray(old.args)
        && old.args.length === 4 && old.args[1] === 'mcp' && old.args[2] === '--state-dir'
        && typeof old.args[3] === 'string' && path.isAbsolute(old.args[3])
        && old.args[0] === path.join(old.args[3], 'runtime/src/cli.mjs')) {
      commands.paths.add(path.join(old.args[3], 'runtime/src/guard/cli.mjs'));
      commands.add(`${shellQuote(old.command)} ${shellQuote(path.join(old.args[3], 'runtime/src/guard/cli.mjs'))} --platform ${platform}`);
    }
    return commands;
  }
  const conflict = (old) => {
    if (old && !same(old, server) && !replace) {
      throw new Error('qdrant-thinktank registration already differs. Review it, then use --replace if intended.');
    }
  };
  if (platform === 'claude') {
    const configPath = path.join(home, '.claude.json');
    const settingsPath = path.join(home, '.claude', 'settings.json');
    const config = object(JSON.parse(existing[configPath] ?? '{}'), configPath);
    config.mcpServers ??= {};
    object(config.mcpServers, 'mcpServers');
    const managed = managedCommands(config.mcpServers['qdrant-thinktank']);
    conflict(config.mcpServers['qdrant-thinktank']);
    config.mcpServers['qdrant-thinktank'] = server;
    const settings = object(JSON.parse(existing[settingsPath] ?? '{}'), settingsPath);
    settings.hooks ??= {};
    object(settings.hooks, 'hooks');
    settings.hooks = reconcileHooks(settings.hooks, { platform, commands: managed, replace,
      desired: { matcher: '*', hooks: [{ type: 'command', command: guard, timeout: 10 }] } });
    return [
      { path: configPath, content: JSON.stringify(config, null, 2) + '\n' },
      { path: settingsPath, content: JSON.stringify(settings, null, 2) + '\n' },
    ];
  }
  if (platform !== 'hermes') throw new Error(`Unsupported platform: ${platform}`);
  const configPath = path.join(home, '.hermes', 'config.yaml');
  const doc = parseDocument(existing[configPath] ?? '{}\n', { uniqueKeys: true });
  if (doc.errors.length) throw new Error(`Invalid YAML: ${doc.errors[0].message}`);
  if (!isMap(doc.contents)) throw new Error('Hermes configuration must be a mapping.');
  const current = doc.toJS();
  object(current.mcp_servers ?? {}, 'mcp_servers');
  const managed = managedCommands(current.mcp_servers?.['qdrant-thinktank']);
  conflict(current.mcp_servers?.['qdrant-thinktank']);
  doc.setIn(['mcp_servers', 'qdrant-thinktank'], server);
  object(current.hooks ?? {}, 'hooks');
  const previousHooks = current.hooks ?? {};
  const reconciled = reconcileHooks(previousHooks, { platform, commands: managed, replace,
    desired: { command: guard, matcher: '.*', timeout: 10, fail_closed: true } });
  for (const event of Object.keys(previousHooks)) if (!(event in reconciled)) doc.deleteIn(['hooks', event]);
  for (const [event, value] of Object.entries(reconciled)) {
    if (!same(previousHooks[event], value)) doc.setIn(['hooks', event], value);
  }
  return [{ path: configPath, content: doc.toString() }];
}

export function profilePaths(platform, home) {
  if (platform === 'claude') return [path.join(home, '.claude.json'), path.join(home, '.claude/settings.json')];
  if (platform === 'hermes') return [path.join(home, '.hermes/config.yaml')];
  throw new Error(`Unsupported platform: ${platform}`);
}
