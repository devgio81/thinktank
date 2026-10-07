import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, rmSync, realpathSync, linkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { validatePlan, dependencyLayers, joinResults, WORKER_OUTPUT_SCHEMA } from '../scripts/orchestration/index.mjs';

// Regression fixtures are isolated from both the port and the imported source.
const repo = realpathSync(mkdtempSync(join(tmpdir(), 'thinktank-v17-regression-')));
mkdirSync(join(repo, 'src'));
mkdirSync(join(repo, 'tests'));
after(() => rmSync(repo, { recursive: true, force: true }));
const task = (id, dependencies = [], write_scope = [`src/${id}/**`]) => ({
  id, domain: 'backend', objective: 'Preserve API error behavior', deliverable: 'API and regression',
  dependencies, read_scope: ['src/**'], write_scope,
  context: ['src/api.mjs:1 — verified route entry'], constraints: ['No delegation; no external writes'],
  acceptance: [{ id: 'regression', criterion: 'Regression exits successfully', type: 'command',
    argv: ['node', '--test', 'tests/api.test.mjs'], cwd: '.', expected_exit: 0 }],
  prompt: 'ROLE\nBackend specialist; respond in de.\nOBJECTIVE\nImplement the contract.\nREPOSITORY AND EVIDENCE\nUse supplied repository and source.\nOWNERSHIP\nUse only supplied ownership.\nCONSTRAINTS\nNo delegation.\nWORK\nImplement with regression tests.\nACCEPTANCE\nRun supplied acceptance.\nRETURN CONTRACT\nReturn only schema-conforming JSON.',
  output_schema: structuredClone(WORKER_OUTPUT_SCHEMA),
});
const plan = (tasks = [task('api')]) => ({ repo_path: repo, tasks, rejected_splits: [] });
const options = { maxWorkers: 2, allowedWriteRoots: ['src/**', 'tests/**'] };
const valid = (p, opts = options) => assert.deepEqual(validatePlan(p, opts), { ok: true, valid: true, errors: [] });
const invalid = (p, code, opts = options) => {
  const r = validatePlan(p, opts);
  assert.equal(r.ok, false); assert.equal(r.valid, false);
  assert(r.errors.some(e => e.code === code), JSON.stringify(r));
  for (const e of r.errors) assert.equal(typeof e.path + typeof e.message, 'stringstring');
};
const result = (id, overrides = {}) => ({ task_id: id, status: 'completed', summary: 'Implemented',
  evidence: ['test output'], commands_run: ['node --test'], touched_paths: [`src/${id}/a.mjs`],
  unresolved: [], handoff: [], ...overrides });

test('complete plan; no mutation; exported schema reusable', () => {
  const p = plan(); const copy = structuredClone(p); valid(p); assert.deepEqual(p, copy);
  valid(plan([task('qa', [], [])]), { maxWorkers: 1, allowedWriteRoots: [] });
});

test('requires complete task and rejected split contracts', () => {
  for (const field of Object.keys(task('api'))) {
    const p = plan(); delete p.tasks[0][field]; invalid(p, 'SCHEMA');
  }
  for (const rejected_splits of [null, [{}], [{ candidate: 'api', reason: '' }]]) {
    invalid({ ...plan(), rejected_splits }, 'SCHEMA');
  }
  valid({ ...plan(), rejected_splits: [{ candidate: 'shared schema', reason: 'Same-file ownership' }] });
  for (const p of [null, {}, [], { ...plan(), surprise: true }]) invalid(p, 'SCHEMA');
  invalid({ ...plan(), tasks: [] }, 'SCHEMA');
  const p = plan(); p.tasks[0].output_schema = {}; invalid(p, 'OUTPUT_SCHEMA');
});

test('IDs, duplicate dependencies, unknown dependencies and DAG cycle fail closed', () => {
  invalid(plan([task('api'), task('api')]), 'DUPLICATE_ID');
  invalid(plan([task('bad id')]), 'ID');
  invalid(plan([task('__proto__')]), 'ID');
  invalid(plan([task('api', ['unknown'])]), 'DEPENDENCY');
  invalid(plan([task('api', ['api'])]), 'CYCLE');
  invalid(plan([task('api', ['db']), task('db', ['api'])]), 'CYCLE');
  invalid(plan([task('api', ['db', 'db']), task('db')]), 'DEPENDENCY');
});

test('acceptance must be executable shape or named human handoff', () => {
  for (const acceptance of [[], ['looks good'], [{ id: 'a', criterion: 'good', type: 'command', argv: [], cwd: '.', expected_exit: 0 }],
    [{ id: 'a', criterion: 'good', type: 'handoff', recipient: '', action: 'approve' }]]) {
    const p = plan(); p.tasks[0].acceptance = acceptance; invalid(p, 'ACCEPTANCE');
  }
  const p = plan(); p.tasks[0].acceptance = [{ id: 'review', criterion: 'Physical device check',
    type: 'handoff', recipient: 'project owner', action: 'Run keyboard test on target device' }]; valid(p);
  p.tasks[0].acceptance.push(p.tasks[0].acceptance[0]); invalid(p, 'ACCEPTANCE');
});

test('explicit independent modes and invalid enums', () => {
  for (const graph of ['auto', 'on', 'off']) for (const subagents of ['auto', 'on', 'off']) {
    valid({ ...plan(), modes: { graph, subagents, rag: 'vector', team: 'off', loop: 'off', deliver: 'off', cognitive: 'silent' } });
  }
  for (const [key, value] of [['graph', 'yes'], ['subagents', false], ['rag', 'off'], ['team', 'maybe'], ['unknown', 'on']]) {
    invalid({ ...plan(), modes: { [key]: value } }, 'MODE');
  }
});

test('scope syntax rejects absolute, traversal, ambiguous globs and escapes', () => {
  for (const scope of ['/etc/passwd', '../src/a', 'src/../a', 'src//a', './src/a', 'src/a/',
    'src/*.mjs', 'src/**/a', 'src/a?', 'src/{a,b}', 'src/[ab]', 'src/\\a', 'src/%2e%2e/a', 'src/…/a']) {
    invalid(plan([task('a', [], [scope])]), 'SCOPE');
  }
  invalid(plan([task('a', [], ['src-other/**'])]), 'WRITE_ROOT');
  invalid(plan([task('a')]), 'WRITE_ROOT', { maxWorkers: 1 });
  for (const root of ['.git/**', '.claude/**', '.hermes/**', 'CLAUDE.md', '.mcp.json']) {
    invalid(plan([task('a', [], [root])]), 'PROTECTED', { maxWorkers: 1, allowedWriteRoots: [root] });
  }
  const p = plan(); p.tasks[0].read_scope = ['src/*.mjs']; invalid(p, 'SCOPE');
  p.tasks[0].read_scope = ['src/**']; p.tasks[0].acceptance[0].cwd = '../'; invalid(p, 'ACCEPTANCE');
});

test('canonical segment boundaries and all writer overlaps, even across dependency layers', () => {
  valid(plan([task('a', [], ['src/api/**']), task('b', [], ['src/api-v2/**'])]));
  for (const [a, b] of [['src/api/**', 'src/api/x.mjs'], ['src/a', 'src/a'],
    ['src/api/**', 'src/API/**'], ['src/api', 'src/api/**']]) {
    invalid(plan([task('a', [], [a]), task('b', ['a'], [b])]), 'OVERLAP');
  }
  invalid(plan([task('a', [], ['src/api/**', 'src/api/x'])]), 'OVERLAP');
});

test('write capabilities require exact spelling for absent paths while collisions remain case-folded', () => {
  const opts = { maxWorkers: 1, allowedWriteRoots: ['review-uppercase-cap/**'] };
  valid(plan([task('a', [], ['review-uppercase-cap/new.mjs'])]), opts);
  invalid(plan([task('a', [], ['REVIEW-UPPERCASE-CAP/new.mjs'])]), 'WRITE_ROOT', opts);
  invalid(plan([task('a', [], ['review-uppercase-cap-other/new.mjs'])]), 'WRITE_ROOT', opts);
  valid(plan([task('a', [], ['review-uppercase-cap/new.mjs'])]),
    { maxWorkers: 1, allowedWriteRoots: ['review-uppercase-cap/new.mjs'] });
  invalid(plan([task('a', [], ['review-uppercase-cap/NEW.mjs'])]), 'WRITE_ROOT',
    { maxWorkers: 1, allowedWriteRoots: ['review-uppercase-cap/new.mjs'] });
  invalid(plan([task('a', [], ['review-uppercase-cap/a.mjs']), task('b', [], ['REVIEW-UPPERCASE-CAP/A.mjs'])]),
    'OVERLAP', { maxWorkers: 2, allowedWriteRoots: ['review-uppercase-cap/**', 'REVIEW-UPPERCASE-CAP/**'] });
});

test('filesystem scopes reject symlink ancestors, nested symlinks and hardlink aliases', () => {
  const base = mkdtempSync(resolve(repo, 'tests/orchestration-fixture-'));
  try {
    mkdirSync(resolve(base, 'src/real'), { recursive: true });
    symlinkSync(resolve(base, 'src/real'), resolve(base, 'src/alias'));
    let p = { ...plan([task('a', [], ['src/alias/new'])]), repo_path: base }; invalid(p, 'SCOPE');
    p.tasks[0].write_scope = ['src/**']; invalid(p, 'SCOPE');
    rmSync(resolve(base, 'src/alias'));
    writeFileSync(resolve(base, 'src/real/a'), 'fixture'); linkSync(resolve(base, 'src/real/a'), resolve(base, 'src/b'));
    p.tasks[0].write_scope = ['src/b']; invalid(p, 'SCOPE');
    p.repo_path = resolve(base, 'absent'); invalid(p, 'REPOSITORY');
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('stable dependency layers are bounded by capacity, not total task count', () => {
  const p = plan([task('z'), task('b'), task('a'), task('c', ['a']), task('d', ['c', 'z'])]);
  valid(p); assert.deepEqual(dependencyLayers(p, { ...options, maxWorkers: 2 }), [['a', 'b'], ['z'], ['c'], ['d']]);
  assert.deepEqual(dependencyLayers({ ...p, tasks: [...p.tasks].reverse() }, { ...options, maxWorkers: 2 }), dependencyLayers(p, { ...options, maxWorkers: 2 }));
  assert(dependencyLayers(p, { ...options, maxWorkers: 1 }).every(layer => layer.length === 1));
  for (const cap of [0, -1, 1.2, '2', Infinity]) {
    invalid(p, 'OPTIONS', { ...options, maxWorkers: cap });
    assert.throws(() => dependencyLayers(p, { ...options, maxWorkers: cap }), e => e.code === 'INVALID_PLAN' && e.errors.length > 0);
  }
  assert.throws(() => dependencyLayers(plan([task('a', ['a'])]), { ...options, maxWorkers: 1 }), { code: 'INVALID_PLAN' });
});

test('join is deterministic, deduplicates exact replays and preserves provenance', () => {
  const a = result('a', { findings: [{ id: 'latency', claim: 'under limit', evidence: ['probe A'] }] });
  const b = result('b', { findings: [{ id: 'latency', claim: 'under limit', evidence: ['probe B'] }] });
  const before = structuredClone([a, b]); const joined = joinResults([b, a, a]);
  assert.deepEqual(joined, joinResults([a, b])); assert.deepEqual([a, b], before);
  assert.equal(joined.status, 'completed'); assert.deepEqual(joined.evidence, [{ value: 'test output', task_ids: ['a', 'b'] }]);
  assert.deepEqual(joined.findings[0].task_ids, ['a', 'b']);
  assert.deepEqual(joined.findings[0].evidence, ['probe A', 'probe B']);
  assert.deepEqual(joined.conflicts, []);
});

test('conflicts cannot be voted away; blocked/failed/handoff cannot become completed', () => {
  const a = result('a', { findings: [{ id: 'security', claim: 'safe', evidence: ['A'] }] });
  const b = result('b', { findings: [{ id: 'security', claim: 'unsafe', evidence: ['B'] }] });
  const j = joinResults([a, b]); assert.equal(j.status, 'needs_handoff');
  assert.equal(j.conflicts.length, 1); assert.equal(j.conflicts[0].variants.length, 2);
  assert.equal(j.findings.length, 2);
  for (const status of ['blocked', 'failed', 'needs_handoff']) assert.equal(joinResults([result('a', { status })]).status, 'needs_handoff');
});

test('malformed results rejected, not partly joined', () => {
  for (const results of [null, [], [{}], [result('a', { status: 'ACCEPT' })],
    [result('a', { evidence: [] })], [result('a', { unresolved: ['missing verification'] })],
    [result('a', { touched_paths: ['../escape'] })], [result('a', { unknown: true })],
    [result('a'), result('a', { summary: 'contradictory replay' })],
    [result('a', { findings: [{ id: 'f', claim: '', evidence: [] }] })]]) {
    assert.throws(() => joinResults(results), e => e.code === 'INVALID_RESULTS' && Array.isArray(e.errors));
  }
});
