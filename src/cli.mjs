#!/usr/bin/env node
import path from 'node:path';
import os from 'node:os';
import * as fs from 'node:fs/promises';
import readline from 'node:readline/promises';
import { pathToFileURL } from 'node:url';

export const help = `ThinkTank V17 — Hermes One / Claude Code

Usage: thinktank [install|doctor|mcp|validate-plan] [options]

  --platform hermes|claude   Target app (auto-detected when only one is installed)
  --home PATH               User home; defaults to the current user's home
  --state-dir PATH          Persistent runtime/data; default HOME/.thinktank
  --port PORT               Local Qdrant REST port (automatic if omitted)
  --collection NAME         Default: thinktank-memory
  --timeout SECONDS         Startup deadline, 10–600 (default 120)
  --yes                     Accept install plan without a prompt
  --replace                 Explicitly replace conflicting files (with backup)
  --dry-run                 Preview only: no files, Docker, or network changes
  --plan FILE               Plan JSON for validate-plan
  --write-root PATH         Explicit allowed write scope; repeatable
  --max-workers N           Plan layer capacity, 1–64 (default 3)
  --help                    Show this help
  --version                 Show package version

Requires Node.js >=20.19 and Hermes One or Claude Code.
Missing uv is installed privately; macOS Docker Desktop is installed via existing
Homebrew if missing and started automatically. Linux requires a running Docker service.
Docker/OS first-run permissions remain with the user.
No credentials are requested. A local Qdrant API key is generated privately.
Install never publishes, commits, changes permissions policies or starts AI runs.
`;

export function parseArgs(argv) {
  const options = { command: 'install', home: os.homedir(), collection: 'thinktank-memory', timeoutMs: 120000 };
  const commands = new Set(['install', 'doctor', 'mcp', 'validate-plan']);
  let commandSeen = false;
  const bools = new Map([['--yes','yes'], ['--replace','replace'], ['--dry-run','dryRun'], ['--help','help'], ['-h','help'], ['--version','version']]);
  const strings = new Map([['--platform','platform'], ['--home','home'], ['--state-dir','stateDir'], ['--collection','collection'], ['--port','port'], ['--timeout','timeout'], ['--plan','plan'], ['--max-workers','maxWorkers']]);
  const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (commands.has(token) && !commandSeen) { options.command = token; commandSeen = true; continue; }
    if (token === '--write-root') {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error('Missing --write-root value.');
      (options.allowedWriteRoots ??= []).push(value);
      continue;
    }
    if (seen.has(token)) throw new Error(`Duplicate option: ${token}`);
    seen.add(token);
    if (bools.has(token)) { options[bools.get(token)] = true; continue; }
    if (!strings.has(token)) throw new Error(`Unknown option or command: ${token}`);
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${token}`);
    options[strings.get(token)] = value;
  }
  if (options.platform && !['hermes','claude'].includes(options.platform)) throw new Error('--platform must be hermes or claude.');
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(options.collection)) throw new Error('Invalid collection name. Use letters, digits, _ and -.');
  if (options.port !== undefined) {
    if (!/^\d+$/.test(options.port) || +options.port < 1024 || +options.port > 65535) throw new Error('--port must be 1024–65535.');
    options.port = Number(options.port);
  }
  if (options.timeout !== undefined) {
    if (!/^\d+$/.test(options.timeout) || +options.timeout < 10 || +options.timeout > 600) throw new Error('--timeout must be 10–600 seconds.');
    options.timeoutMs = Number(options.timeout) * 1000;
  }
  if (options.maxWorkers !== undefined && (!/^\d+$/.test(options.maxWorkers) || +options.maxWorkers < 1 || +options.maxWorkers > 64)) throw new Error('--max-workers must be 1–64.');
  options.maxWorkers = Number(options.maxWorkers ?? 3);
  options.home = path.resolve(options.home);
  options.stateDir = path.resolve(options.stateDir ?? path.join(options.home, '.thinktank'));
  return options;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) { console.log(help); return; }
  if (options.version) { console.log('17.0.0'); return; }
  if (options.command === 'mcp') {
    const { launchMcp, loadQdrantConfig } = await import('./qdrant/index.mjs');
    const config = await loadQdrantConfig(options.stateDir);
    await launchMcp(config);
    return;
  }
  if (options.command === 'validate-plan') {
    if (!options.plan) throw new Error('validate-plan needs --plan FILE.');
    const { validatePlan, dependencyLayers } = await import('./orchestration/index.mjs');
    const plan = JSON.parse(await fs.readFile(path.resolve(options.plan), 'utf8'));
    const checked = validatePlan(plan, { maxWorkers: options.maxWorkers, allowedWriteRoots: options.allowedWriteRoots ?? [] });
    if (!checked.valid) {
      console.log(JSON.stringify(checked, null, 2));
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify({ valid: true, layers: dependencyLayers(plan, options.maxWorkers) }, null, 2));
    return;
  }
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const prompt = interactive ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null;
  try {
    if (!options.platform) {
      const { detectPlatforms } = await import('./installer/bootstrap.mjs');
      const found = await detectPlatforms(options.home);
      if (found.length === 1) options.platform = found[0];
    }
    if (!options.platform) {
      if (!prompt) throw new Error('Target is ambiguous; include --platform hermes|claude in the same command.');
      const answer = (await prompt.question('Install for [1] Hermes One or [2] Claude Code? [1] ')).trim().toLowerCase();
      if (!['','1','2','hermes','claude'].includes(answer)) throw new Error('Choose 1 or 2; nothing installed.');
      options.platform = ['2','claude'].includes(answer) ? 'claude' : 'hermes';
    }
    const { planInstall, install, doctor } = await import('./installer/index.mjs');
    if (options.command === 'doctor') {
      const result = await doctor(options);
      console.log(JSON.stringify(result, null, 2));
      if (result.errors.length) process.exitCode = 1;
      return;
    }
    const plan = await planInstall(options);
    console.log(`ThinkTank V17 → ${options.platform === 'hermes' ? 'Hermes One' : 'Claude Code'}`);
    console.log(`Home: ${options.home}\nState: ${options.stateDir}\nQdrant: loopback:${options.port ?? 'automatic'}, collection ${options.collection}`);
    console.log(`${plan.changes.length} file changes. Existing edits require --replace; replacements are backed up.`);
    if (options.dryRun) { console.log(JSON.stringify({ dryRun: true, changes: plan.changes }, null, 2)); return; }
    if (!options.yes) {
      if (!prompt) throw new Error('Use --yes to confirm or --dry-run to preview. Nothing installed.');
      const yes = await prompt.question('Install ThinkTank and missing uv, start Docker/Qdrant, configure the selected app? [y/N] ');
      if (!/^y(es)?$/i.test(yes.trim())) { console.log('Cancelled. Nothing installed.'); return; }
    }
    const result = await install(options);
    console.log(JSON.stringify(result, null, 2));
    console.log('Installation verified. Restart the target application, then use /thinktank.');
    console.log('Hooks are inert in interactive sessions. Unattended delivery remains human-gated.');
  } finally { prompt?.close(); }
}

const entry = process.argv[1] ? await fs.realpath(process.argv[1]).catch(() => null) : null;
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main().catch(error => { console.error(`ThinkTank: ${error.message}`); process.exitCode = 1; });
}
