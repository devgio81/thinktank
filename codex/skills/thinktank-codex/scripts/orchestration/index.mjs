import { ID, text, record, strings, keys, issue, invalid, compare, validOutputSchema } from './contracts.mjs';
import { parseScope, protectedScope, contains, overlaps, repository, inspectScope, cwdAllowed } from './scopes.mjs';
export { WORKER_OUTPUT_SCHEMA } from './contracts.mjs';
export { joinResults } from './join.mjs';

const taskKeys = ['id', 'domain', 'objective', 'deliverable', 'dependencies', 'read_scope', 'write_scope',
  'context', 'constraints', 'acceptance', 'prompt', 'output_schema'];
const modes = { subagents: ['auto', 'on', 'off'], graph: ['auto', 'on', 'off'], rag: ['vector', 'graph', 'auto'],
  team: ['auto', 'on', 'off'], loop: ['auto', 'on', 'off'], deliver: ['auto', 'on', 'off'], cognitive: ['verbose', 'silent'] };
const headings = ['ROLE', 'OBJECTIVE', 'REPOSITORY AND EVIDENCE', 'OWNERSHIP', 'CONSTRAINTS', 'WORK', 'ACCEPTANCE', 'RETURN CONTRACT'];
function validPrompt(prompt) {
  if (!text(prompt)) return false;
  const positions = headings.map(h => prompt.search(new RegExp(`(?:^|\\n)${h}\\n`)));
  return positions.every((p, i) => p >= 0 && (i === 0 || p > positions[i - 1])) &&
    headings.every((h, i) => text(prompt.slice(prompt.indexOf(h, positions[i]) + h.length, positions[i + 1])));
}
function acceptance(value, repo) {
  if (!Array.isArray(value) || !value.length) return false;
  const ids = new Set();
  return value.every(a => {
    if (!record(a) || !text(a.id) || !ID.test(a.id) || ids.has(a.id) || !text(a.criterion)) return false;
    ids.add(a.id);
    if (a.type === 'handoff') return keys(a, ['id', 'criterion', 'type', 'recipient', 'action']) && text(a.recipient) && text(a.action);
    if (a.type !== 'command' || !keys(a, ['id', 'criterion', 'type', 'argv', 'cwd', 'expected_exit']) ||
      !strings(a.argv, true) || !Number.isInteger(a.expected_exit) || a.expected_exit < 0 || a.expected_exit > 255) return false;
    try { return cwdAllowed(a.cwd, repo); } catch { return false; }
  });
}
function layers(tasks, maxWorkers) {
  const done = new Set(); const output = [];
  while (done.size < tasks.length) {
    const ready = tasks.filter(t => !done.has(t.id) && t.dependencies.every(d => done.has(d))).sort((a, b) => compare(a.id, b.id));
    if (!ready.length) return null;
    // Freeze the whole logical dependency layer before capacity splitting; no early unlock.
    for (let i = 0; i < ready.length; i += maxWorkers) output.push(ready.slice(i, i + maxWorkers).map(t => t.id));
    ready.forEach(t => done.add(t.id));
  }
  return output;
}

/** Total validator for JSON data. No commands, models, delegation or writes run here. */
export function validatePlan(plan, options = {}) {
  const errors = [];
  const add = (code, path, message) => errors.push(issue(code, path, message));
  if (!record(options)) { add('OPTIONS', 'options', 'Expected options object'); options = {}; }
  if (Object.keys(options).some(k => !['maxWorkers', 'allowedWriteRoots'].includes(k))) add('OPTIONS', 'options', 'Unknown option');
  const maxWorkers = options.maxWorkers === undefined ? 3 : options.maxWorkers;
  if (!Number.isSafeInteger(maxWorkers) || maxWorkers < 1) add('OPTIONS', 'options.maxWorkers', 'Expected positive safe integer');
  const roots = [];
  if (options.allowedWriteRoots !== undefined && !strings(options.allowedWriteRoots)) add('OPTIONS', 'options.allowedWriteRoots', 'Expected path array');
  else for (const root of options.allowedWriteRoots ?? []) {
    try { roots.push(parseScope(root)); } catch (e) { add('SCOPE', 'options.allowedWriteRoots', e.message); }
  }
  if (!keys(plan, ['repo_path', 'tasks', 'rejected_splits'], ['modes'])) {
    add('SCHEMA', 'plan', 'Expected repo_path, tasks, rejected_splits and optional modes only');
    return { ok: false, valid: false, errors };
  }
  let repo;
  try { repo = repository(plan.repo_path); } catch (e) { add('REPOSITORY', 'repo_path', e.message); }
  if (plan.modes !== undefined) {
    if (!record(plan.modes)) add('MODE', 'modes', 'Expected modes object');
    else for (const [key, value] of Object.entries(plan.modes)) {
      if (!Object.hasOwn(modes, key) || !modes[key].includes(value)) add('MODE', `modes.${key}`, 'Unknown mode or invalid value');
    }
  }
  if (!Array.isArray(plan.rejected_splits) || !plan.rejected_splits.every(s => keys(s, ['candidate', 'reason']) && text(s.candidate) && text(s.reason))) {
    add('SCHEMA', 'rejected_splits', 'Expected {candidate, reason} objects with non-empty strings');
  }
  if (!Array.isArray(plan.tasks) || !plan.tasks.length) {
    add('SCHEMA', 'tasks', 'Expected non-empty tasks array'); return { ok: false, valid: false, errors };
  }
  const ids = new Set(); const writes = []; const schedulable = [];
  plan.tasks.forEach((t, i) => {
    const at = `tasks[${i}]`;
    if (!keys(t, taskKeys)) { add('SCHEMA', at, 'Missing task fields or unknown fields'); return; }
    if (!text(t.id) || !ID.test(t.id)) add('ID', `${at}.id`, 'Expected lowercase stable ID, max 64 characters');
    if (ids.has(t.id)) add('DUPLICATE_ID', `${at}.id`, 'Duplicate task ID');
    ids.add(t.id);
    for (const field of ['domain', 'objective', 'deliverable']) if (!text(t[field])) add('SCHEMA', `${at}.${field}`, 'Expected non-empty string');
    for (const field of ['context', 'constraints']) if (!strings(t[field], true)) add('SCHEMA', `${at}.${field}`, 'Expected non-empty string array');
    if (!strings(t.dependencies) || !t.dependencies.every(d => ID.test(d)) || new Set(t.dependencies).size !== t.dependencies.length) {
      add('DEPENDENCY', `${at}.dependencies`, 'Expected unique dependency IDs');
    } else schedulable.push(t);
    if (!validPrompt(t.prompt)) add('PROMPT', `${at}.prompt`, 'Required ordered prompt headings absent');
    if (!validOutputSchema(t.output_schema)) add('OUTPUT_SCHEMA', `${at}.output_schema`, 'Use exported WORKER_OUTPUT_SCHEMA exactly');
    if (!acceptance(t.acceptance, repo)) add('ACCEPTANCE', `${at}.acceptance`, 'Expected unique executable criteria or named human handoffs');
    for (const field of ['read_scope', 'write_scope']) {
      if (!strings(t[field], field === 'read_scope')) { add('SCHEMA', `${at}.${field}`, 'Expected canonical path array'); continue; }
      t[field].forEach((value, j) => {
        const location = `${at}.${field}[${j}]`;
        try {
          const scope = parseScope(value);
          if (field === 'write_scope') {
            if (protectedScope(scope)) add('PROTECTED', location, 'Harness/control path is never worker-owned');
            if (!roots.some(root => contains(root, scope))) add('WRITE_ROOT', location, 'Outside explicit allowedWriteRoots (default: no writes)');
            for (const prior of writes) if (overlaps(prior.scope, scope)) add('OVERLAP', location, `Overlaps ${prior.location}`);
            writes.push({ scope, location });
          }
          if (repo) inspectScope(repo, scope, field === 'write_scope');
        } catch (e) { add('SCOPE', location, e.message); }
      });
    }
  });
  for (const t of schedulable) for (const d of t.dependencies) {
    if (!ids.has(d)) add('DEPENDENCY', `tasks.${t.id}.dependencies`, `Unknown dependency: ${d}`);
  }
  if (schedulable.length === plan.tasks.length && !errors.some(e => ['ID', 'DUPLICATE_ID', 'DEPENDENCY'].includes(e.code)) && !layers(schedulable, 1)) {
    add('CYCLE', 'tasks', 'Dependency graph contains a cycle');
  }
  return { ok: errors.length === 0, valid: errors.length === 0, errors };
}

/** Sorted task-ID batches, not executable workers; the explicit ownership envelope is preserved. */
export function dependencyLayers(plan, options = {}) {
  const result = validatePlan(plan, options);
  if (!result.ok) throw invalid('INVALID_PLAN', result.errors);
  return layers(plan.tasks, options.maxWorkers ?? 3);
}
