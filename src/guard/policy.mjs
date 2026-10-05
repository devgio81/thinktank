import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { capability, verification } from './capabilities.mjs';

function fail(code, message) { throw Object.assign(new Error(message), { guardCode: code }); }
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const string = x => typeof x === 'string';
const number = x => Number.isSafeInteger(x) && x >= 0;
const boolean = x => typeof x === 'boolean';
function shape(value, required, optional = {}, code = 'INVALID_INPUT') {
  if (!object(value) || Object.keys(value).some(k => !Object.hasOwn(required, k) && !Object.hasOwn(optional, k)) ||
      Object.entries(required).some(([k, predicate]) => !Object.hasOwn(value, k) || !predicate(value[k])) ||
      Object.entries(optional).some(([k, predicate]) => Object.hasOwn(value, k) && !predicate(value[k])))
    fail(code, 'Unsupported fields, missing fields or invalid field types.');
}
function tree(value, depth = 0) {
  if (depth > 32) fail('INVALID_PAYLOAD', 'JSON nesting exceeds supported depth.');
  if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(k)) fail('INVALID_PAYLOAD', 'Unsafe JSON key.');
    tree(v, depth + 1);
  }
}
function payloadShape(payload, platform, event) {
  if (!object(payload)) fail('INVALID_PAYLOAD', 'Expected a JSON object.');
  tree(payload);
  if (Object.hasOwn(payload, 'args')) fail('INVALID_PAYLOAD', 'Shell hooks use tool_input, not plugin args.');
  for (const k of ['cwd', 'session_id', 'profile', 'hook_event_name', 'tool_use_id', 'transcript_path', 'permission_mode'])
    if (Object.hasOwn(payload, k) && !string(payload[k])) fail('INVALID_PAYLOAD', 'Invalid envelope metadata.');
  if (Object.hasOwn(payload, 'extra') && !object(payload.extra)) fail('INVALID_PAYLOAD', 'extra must be an object.');
  const expected = event === 'completion' ? (platform === 'claude' ? 'TaskCompleted' : 'pre_verify') :
    (platform === 'claude' ? 'PreToolUse' : 'pre_tool_call');
  if (payload.hook_event_name !== undefined && payload.hook_event_name !== expected)
    fail('INVALID_PAYLOAD', 'Unexpected hook event for this endpoint.');
  if (event !== 'completion' && (!string(payload.tool_name) || !payload.tool_name || !object(payload.tool_input)))
    fail('INVALID_PAYLOAD', 'tool_name and tool_input must be a nonempty string and an object.');
}
function pathText(raw) {
  if (!string(raw) || !raw || raw.startsWith('~') || raw.split('/').some(s => s !== s.trim()) ||
      /[\x00-\x1f\x7f\\:]/.test(raw))
    fail('PATH_BOUNDARY', 'Unsupported path syntax.');
}
function stat(p) {
  try { return fs.lstatSync(p); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
// Walk before collapsing '..': resolve symlink parents, including missing leaves.
function canonical(raw, base = '/') {
  pathText(raw);
  const parts = (path.isAbsolute(raw) ? raw : `${base}/${raw}`).split('/');
  let current = '/';
  let missing = false;
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (missing) fail('PATH_BOUNDARY', 'Traversal after a missing parent is ambiguous.');
      current = path.dirname(current);
      continue;
    }
    const next = path.join(current, part);
    const info = stat(next);
    if (info?.isSymbolicLink()) {
      try { current = fs.realpathSync(next); }
      catch { fail('PATH_BOUNDARY', 'Dangling or cyclic symlink is not verifiable.'); }
    } else { current = next; }
    missing ||= !info;
  }
  return current;
}
const folded = p => p.normalize('NFC').toLowerCase();
const within = (p, root) => p === root || p.startsWith(root.endsWith('/') ? root : `${root}/`);
const reserved = new Set(['.git', '.claude', '.hermes', '.thinktank', 'loop-grants', 'loop-checker']);
const harnessFiles = new Set(['claude.md', 'agents.md', 'settings.json', 'settings.local.json', '.mcp.json', 'keybindings.json']);
function scope(env, platform) {
  const raw = env[`${platform.toUpperCase()}_TT_REPO_PATH`];
  if (!raw || !path.isAbsolute(raw)) fail('TRUST_CONFIGURATION', 'Launch with an absolute, immutable platform TT_REPO_PATH.');
  const root = canonical(raw);
  if (root === '/' || !stat(root)?.isDirectory()) fail('TRUST_CONFIGURATION', 'Repo root must be an existing non-root directory.');
  const home = env.HOME;
  if (!home || !path.isAbsolute(home)) fail('TRUST_CONFIGURATION', 'HOME must be an absolute trusted path.');
  const protectedPaths = [`${home}/.hermes`, `${home}/.claude`];
  for (const key of ['HERMES_HOME', 'CLAUDE_HOME', 'CLAUDE_CONFIG_DIR',
    'HERMES_TT_GRANT_DIR', 'CLAUDE_TT_GRANT_DIR', 'HERMES_TT_CHECKER_DIR', 'CLAUDE_TT_CHECKER_DIR',
    'HERMES_TT_STATE_DIR', 'CLAUDE_TT_STATE_DIR']) {
    if (env[key]) {
      if (!path.isAbsolute(env[key])) fail('TRUST_CONFIGURATION', 'Protected directories must be absolute.');
      protectedPaths.push(env[key]);
    }
  }
  // Protect code actually executing, not every product directory named hooks/skills.
  const runtime = fileURLToPath(new URL('../../', import.meta.url));
  protectedPaths.push(`${runtime}/src/guard`, `${runtime}/hooks`);
  const marker = `${root}/.git`;
  const info = stat(marker);
  if (!info) fail('TRUST_CONFIGURATION', 'Repo root requires a .git directory or linked-worktree marker.');
  let gitdir = marker;
  if (info.isFile()) {
    if (info.size > 16384) fail('TRUST_CONFIGURATION', 'Invalid worktree marker.');
    const match = /^gitdir: ([^\r\n]+)\r?\n?$/.exec(fs.readFileSync(marker, 'utf8'));
    if (!match) fail('TRUST_CONFIGURATION', 'Invalid worktree marker.');
    gitdir = canonical(match[1], root);
  } else gitdir = canonical(marker);
  if (!stat(gitdir)?.isDirectory()) fail('TRUST_CONFIGURATION', 'Unresolvable git metadata.');
  protectedPaths.push(gitdir);
  const common = `${gitdir}/commondir`;
  if (stat(common)) {
    const commonStat = stat(common);
    if (!commonStat.isFile() || commonStat.size > 16384) fail('TRUST_CONFIGURATION', 'Invalid common git directory marker.');
    protectedPaths.push(canonical(fs.readFileSync(common, 'utf8').trim(), gitdir));
  }
  const protectedRoots = protectedPaths.map(p => folded(canonical(p)));
  function checkPath(rawPath, base, kind) {
    pathText(rawPath);
    const target = canonical(rawPath, base);
    const lexicalTarget = canonical(path.resolve(base, rawPath));
    if (target !== lexicalTarget) fail('PATH_BOUNDARY', 'Lexical and physical path resolution disagree.');
    if (!within(target, root)) fail('PATH_BOUNDARY', 'Path/workdir escapes immutable repository root.');
    if ([rawPath, target].some(p => p.split('/').some(s => reserved.has(folded(s)))) ||
        protectedRoots.some(p => within(folded(target), p)) ||
        (kind === 'write' && [rawPath, target].some(p => harnessFiles.has(folded(path.basename(p))))))
      fail('PROTECTED_PATH', 'Git metadata, installed harness, grant, checker or authority path is protected.');
    const info = stat(target);
    if (kind === 'directory' && !info?.isDirectory()) fail('PATH_BOUNDARY', 'Workdir must exist and be a directory.');
    if (kind === 'search' && info?.isDirectory()) return target;
    if (kind !== 'directory' && info && (!info.isFile() || info.nlink > 1))
      fail('PATH_BOUNDARY', 'Only regular single-link files are supported.');
    return target;
  }
  return { root, checkPath };
}
function editShape(input) {
  shape(input, { old_string: string, new_string: string }, { replace_all: boolean });
}
function patchTargets(text) {
  const bad = () => fail('UNSUPPORTED_PATCH', 'Only complete V4A Add/Update/Delete patches are supported; no Move/rename or alternate syntax.');
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines.shift() !== '*** Begin Patch' || lines.pop() !== '*** End Patch') bad();
  const targets = [];
  let kind = null;
  for (const line of lines) {
    const header = /^\*\*\* (Add|Update|Delete) File: (.+)$/.exec(line);
    if (header) { kind = header[1]; targets.push(header[2]); continue; }
    if (!kind || line.startsWith('***') ||
        (kind === 'Add' && !line.startsWith('+')) || kind === 'Delete' ||
        (kind === 'Update' && !/^(?:[ +\-]|@@)/.test(line))) bad();
  }
  if (!targets.length || new Set(targets).size !== targets.length) bad();
  return targets;
}
const textExtension = /\.(?:txt|md|mjs|cjs|js|jsx|ts|tsx|json|yaml|yml|toml|py|sh|css|html|xml|csv|log|sql|php|rb|rs|go|java|c|h|cpp|vue|svelte)$/i;
export function check(payload, { platform, event, env }) {
  payloadShape(payload, platform, event);
  if (event === 'completion') fail('UNATTESTED_COMPLETION',
    'No independent checker identity/attestation verifier is installed. Checker-shaped files never prove completion.');
  const { root, checkPath } = scope(env, platform);
  const cwd = checkPath(payload.cwd ?? process.cwd(), root, 'directory');
  // The process and wire cwd must agree, otherwise relative tool paths are ambiguous.
  if (canonical(process.cwd()) !== cwd) fail('PATH_BOUNDARY', 'Hook process cwd and payload cwd disagree.');
  const a = payload.tool_input;
  const t = payload.tool_name;
  const c = platform === 'claude';
  const field = c ? 'file_path' : 'path';
  const write = p => checkPath(p, cwd, 'write');
  if (t === (c ? 'Write' : 'write_file')) {
    shape(a, { [field]: string, content: string }, c ? {} : { cross_profile: boolean });
    if (a.cross_profile) fail('PROTECTED_PATH', 'Cross-profile writes are forbidden.');
    write(a[field]);
  } else if (c && (t === 'Edit' || t === 'MultiEdit')) {
    if (t === 'Edit') {
      shape(a, { file_path: string, old_string: string, new_string: string }, { replace_all: boolean });
    } else {
      shape(a, { file_path: string, edits: x => Array.isArray(x) && x.length > 0 });
      for (const edit of a.edits) editShape(edit);
    }
    write(a.file_path);
  } else if (!c && t === 'patch') {
    if (a.mode === 'patch') {
      shape(a, { mode: x => x === 'patch', patch: string }, { cross_profile: boolean });
      if (a.cross_profile) fail('PROTECTED_PATH', 'Cross-profile writes are forbidden.');
      for (const target of patchTargets(a.patch)) write(target);
    } else {
      shape(a, { path: string, old_string: string, new_string: string },
        { mode: x => x === 'replace', replace_all: boolean, cross_profile: boolean });
      if (a.cross_profile) fail('PROTECTED_PATH', 'Cross-profile writes are forbidden.');
      write(a.path);
    }
  } else if (t === (c ? 'Read' : 'read_file')) {
    shape(a, { [field]: string }, { offset: number, limit: number });
    const p = checkPath(a[field], cwd, 'read');
    if (!textExtension.test(p)) fail('UNSUPPORTED_READ', 'Only plain source/text files: no document conversion or plugins.');
  } else if (t === (c ? 'Bash' : 'terminal')) {
    shape(a, { command: string }, c ? { timeout: number, description: string, run_in_background: boolean,
      dangerouslyDisableSandbox: boolean } : { timeout: number, workdir: string, background: boolean,
      pty: boolean, notify_on_complete: boolean });
    const workdir = a.workdir === undefined ? cwd : checkPath(a.workdir, cwd, 'directory');
    const pinned = verification(a.command, { platform, env, cwd, root, workdir, checkPath });
    if (a.background || a.run_in_background || a.pty || a.dangerouslyDisableSandbox ||
        (!['pwd', 'pwd -P'].includes(a.command) && !pinned)) fail('UNSUPPORTED_EXECUTION',
      'Only exact pwd forms or human-pinned root-scoped test/build commands are supported. Git, arbitrary scripts, shell writes and release corridors require human execution.');
  } else if (capability(t, a, { platform, cwd, checkPath, env })) {
    // Known read/planning tools and explicitly enabled leaf delegation only.
  } else {
    fail('UNSUPPORTED_TOOL', 'Tool is not in this platform allowlist. Execution, unknown MCP, outward, scheduling, browser/desktop and grant corridors are unsupported.');
  }
}
