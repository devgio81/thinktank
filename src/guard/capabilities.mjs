// Positive argument grammars only; these checks do not sandbox trusted host tools.
const fail = (code, message) => { throw Object.assign(new Error(message), { guardCode: code }); };
const str = x => typeof x === 'string';
const text = x => str(x) && x.length > 0 && x.length <= 65536;
const bool = x => typeof x === 'boolean';
const num = x => Number.isSafeInteger(x) && x >= 0;
const member = values => x => values.includes(x);
function shape(value, required = {}, optional = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(k => !Object.hasOwn(required, k) && !Object.hasOwn(optional, k)) ||
      Object.entries(required).some(([k, test]) => !Object.hasOwn(value, k) || !test(value[k])) ||
      Object.entries(optional).some(([k, test]) => Object.hasOwn(value, k) && !test(value[k])))
    fail('INVALID_INPUT', 'Unsupported capability fields or field types.');
}
const reserved = /^(?:\.git|\.hermes|\.claude|\.thinktank|loop-grants|loop-checker)$/i;
function glob(value) {
  // No extglob, braces, negation, dot segments, absolute paths or option injection.
  if (!text(value) || !/^[a-zA-Z0-9_.*?/-]+$/.test(value) || value.startsWith('/') ||
      value.startsWith('-') || value.split('/').some(s => !s || s === '.' || s === '..' ||
        s.startsWith('.') || reserved.test(s)))
    fail('PATH_BOUNDARY', 'Only relative non-hidden source glob patterns are supported.');
}
function skills(t, a) {
  const name = x => str(x) && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(x);
  if (t === 'skills_list') shape(a, {}, { category: name });
  else {
    shape(a, { name }, { file_path: text });
    if (a.file_path !== undefined &&
        !/^(?:references|templates|scripts|assets)\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/.test(a.file_path))
      fail('PATH_BOUNDARY', 'Skill support files must be plain relative paths in a known support directory.');
  }
}
export function capability(t, a, { platform, cwd, checkPath, env }) {
  const c = platform === 'claude';
  if ((!c && t === 'search_files') || (c && ['Grep', 'Glob'].includes(t))) {
    if (!c) shape(a, { pattern: text }, { target: member(['content', 'files']), path: text,
      file_glob: text, limit: num, offset: num, context: num,
      output_mode: member(['content', 'files_only', 'count']) });
    else if (t === 'Glob') shape(a, { pattern: text }, { path: text });
    else shape(a, { pattern: text }, { path: text, glob: text, type: x => str(x) && /^[a-z0-9]+$/.test(x),
      output_mode: member(['content', 'files_with_matches', 'count']), '-A': num, '-B': num,
      '-C': num, context: num, '-n': bool, '-i': bool, head_limit: num, offset: num, multiline: bool });
    checkPath(a.path ?? '.', cwd, 'search');
    const scopedGlob = value => {
      glob(value);
      const prefix = value.split('/').filter((s, i, parts) =>
        parts.slice(0, i + 1).every(p => !/[?*]/.test(p))).join('/');
      if (prefix) checkPath(prefix, a.path === undefined ? cwd : checkPath(a.path, cwd, 'search'), 'search');
    };
    if (t === 'Glob' || a.target === 'files') scopedGlob(a.pattern);
    if (a.file_glob !== undefined) scopedGlob(a.file_glob);
    if (a.glob !== undefined) scopedGlob(a.glob);
    // A content pattern is data, never a command/flag; reject leading options conservatively.
    if (a.pattern.startsWith('-')) fail('INVALID_INPUT', 'Search patterns cannot be command options.');
  } else if (!c && ['skill_view', 'skills_list'].includes(t)) {
    skills(t, a);
  } else if (t === (c ? 'TodoWrite' : 'todo')) {
    const list = x => Array.isArray(x) && x.length <= 500;
    if (c) shape(a, { todos: list });
    else shape(a, {}, { todos: list, merge: bool });
    for (const item of a.todos ?? []) {
      if (c) shape(item, { content: text, activeForm: text,
        status: member(['pending', 'in_progress', 'completed']) });
      else shape(item, { id: text, content: text,
        status: member(['pending', 'in_progress', 'completed', 'cancelled']) });
    }
  } else if (t === (c ? 'Agent' : 'delegate_task')) {
    if (env[`${platform.toUpperCase()}_TT_ALLOW_DELEGATION`] !== '1')
      fail('UNSUPPORTED_TOOL', 'Leaf delegation requires an immutable human launch opt-in.');
    if (c) {
      // Only the built-in general-purpose leaf. Custom agents may have wider permissions.
      shape(a, { prompt: text, description: text, subagent_type: x => x === 'general-purpose' });
    } else {
      const leaf = x => {
        const schema = value => value && typeof value === 'object' && !Array.isArray(value)
          && value.type === 'object' && JSON.stringify(value).length <= 32768;
        shape(x, { goal: text, role: x => x === 'leaf' }, { context: text, output_schema: schema });
      };
      if (Object.hasOwn(a, 'tasks')) {
        shape(a, { tasks: x => Array.isArray(x) && x.length > 0 && x.length <= 8 });
        a.tasks.forEach(leaf);
      } else leaf(a);
    }
  } else return false;
  return true;
}
export function verification(command, { platform, env, cwd, root, workdir, checkPath }) {
  const raw = env[`${platform.toUpperCase()}_TT_VERIFY_COMMANDS`];
  let commands = [];
  if (raw !== undefined) {
    try { commands = JSON.parse(raw); } catch { fail('TRUST_CONFIGURATION', 'Verification allowlist must be a JSON string array.'); }
    if (!Array.isArray(commands) || commands.length > 100 || commands.some(x => !text(x)))
      fail('TRUST_CONFIGURATION', 'Verification allowlist must be a bounded JSON string array.');
  }
  if (!commands.includes(command)) return false;
  if (/[^a-zA-Z0-9_./ -]/.test(command)) return false;
  if (cwd !== root || workdir !== root) fail('PATH_BOUNDARY', 'Pinned verification runs only at the immutable repository root.');
  // Exact positive forms; no global flags, env assignments, wrappers, chaining or release verbs.
  if (/^(?:npm|pnpm|yarn) (?:test|run (?:test|build|check|lint|typecheck))$/.test(command)) return true;
  if (/^node --test(?: [a-zA-Z0-9_./-]+)*$/.test(command)) {
    const files = command.split(' ').slice(2);
    for (const file of files) {
      if (!/^(?:[a-zA-Z0-9_][a-zA-Z0-9_-]*\/)*[a-zA-Z0-9_][a-zA-Z0-9_.-]*\.(?:mjs|cjs|js)$/.test(file) ||
          file.split('/').includes('..')) return false;
      checkPath(file, root, 'read');
    }
    return true;
  }
  return false;
}
