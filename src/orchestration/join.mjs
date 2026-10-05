import { ID, STATUSES, text, keys, strings, issue, invalid, stable, compare } from './contracts.mjs';
import { parseScope } from './scopes.mjs';
const fields = ['evidence', 'commands_run', 'touched_paths', 'unresolved', 'handoff'];
const required = ['task_id', 'status', 'summary', ...fields];
const sorted = values => [...new Set(values)].sort(compare);
function check(result, path) {
  const errors = [];
  const add = message => errors.push(issue('RESULT', path, message));
  if (!keys(result, required, ['findings'])) { add('Missing or unknown result fields'); return errors; }
  if (!text(result.task_id) || !ID.test(result.task_id) || !STATUSES.includes(result.status) || !text(result.summary)) add('Invalid identity, status or summary');
  for (const field of fields) if (!strings(result[field])) add(`Invalid ${field}`);
  if (errors.length) return errors;
  for (const value of result.touched_paths) {
    try { if (parseScope(value).tree) add('Touched paths must be exact paths, not trees'); } catch { add('Noncanonical touched path'); }
  }
  if (result.status === 'completed' && (!result.evidence.length || result.unresolved.length || result.handoff.length)) add('Completed requires evidence and no unresolved/handoff items');
  if (result.status !== 'completed' && !result.unresolved.length && !result.handoff.length) {
    // Status alone may signal a blocked node; parent must investigate instead of promoting it.
  }
  if (result.findings !== undefined && (!Array.isArray(result.findings) || !result.findings.every(f =>
    keys(f, ['id', 'claim', 'evidence']) && text(f.id) && ID.test(f.id) && text(f.claim) && strings(f.evidence, true)))) add('Invalid findings');
  return errors;
}
function normalize(result) {
  return { ...result, ...Object.fromEntries(fields.map(f => [f, sorted(result[f])])),
    ...(result.findings === undefined ? {} : { findings: result.findings.map(f => ({ ...f, evidence: sorted(f.evidence) })).sort((a, b) => compare(stable(a), stable(b))) }) };
}
function union(results, field) {
  const values = new Map();
  for (const r of results) for (const value of r[field]) {
    if (!values.has(value)) values.set(value, new Set());
    values.get(value).add(r.task_id);
  }
  return [...values].sort(([a], [b]) => compare(a, b)).map(([value, ids]) => ({ value, task_ids: sorted(ids) }));
}

/** Deterministic evidence aggregation, never an acceptance verdict or semantic LLM merge. */
export function joinResults(input) {
  if (!Array.isArray(input) || !input.length) throw invalid('INVALID_RESULTS', [issue('RESULT', 'results', 'Expected non-empty result array')]);
  const errors = input.flatMap((r, i) => check(r, `results[${i}]`));
  if (errors.length) throw invalid('INVALID_RESULTS', errors);
  const byTask = new Map();
  for (const raw of input) {
    const r = normalize(raw);
    if (byTask.has(r.task_id) && stable(byTask.get(r.task_id)) !== stable(r)) {
      throw invalid('INVALID_RESULTS', [issue('DUPLICATE_RESULT', `results.${r.task_id}`, 'Conflicting replays for one task ID')]);
    }
    byTask.set(r.task_id, r);
  }
  const results = [...byTask.values()].sort((a, b) => compare(a.task_id, b.task_id));
  const groups = new Map();
  for (const r of results) for (const f of r.findings ?? []) {
    if (!groups.has(f.id)) groups.set(f.id, new Map());
    const variants = groups.get(f.id);
    if (!variants.has(f.claim)) variants.set(f.claim, { id: f.id, claim: f.claim, evidence: new Set(), task_ids: new Set() });
    const variant = variants.get(f.claim); variant.task_ids.add(r.task_id); f.evidence.forEach(e => variant.evidence.add(e));
  }
  const findings = []; const conflicts = [];
  for (const [id, variants] of [...groups].sort(([a], [b]) => compare(a, b))) {
    const items = [...variants.values()].sort((a, b) => compare(a.claim, b.claim)).map(v => ({ ...v, evidence: sorted(v.evidence), task_ids: sorted(v.task_ids) }));
    findings.push(...items);
    if (items.length > 1) conflicts.push({ id, variants: items, route: 'checker-or-human' });
  }
  return {
    status: results.every(r => r.status === 'completed') && !conflicts.length ? 'completed' : 'needs_handoff',
    results, ...Object.fromEntries(fields.map(f => [f, union(results, f)])), findings, conflicts,
  };
}
