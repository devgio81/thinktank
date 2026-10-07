import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, realpathSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { validatePlan, dependencyLayers, WORKER_OUTPUT_SCHEMA } from '../scripts/orchestration/index.mjs';

const cli = resolve(import.meta.dirname, '../scripts/validate-plan.mjs');
function fixture(t) {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), 'thinktank-v17-cli-')));
  mkdirSync(join(repo, 'src')); mkdirSync(join(repo, 'tests'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  return repo;
}
function task(id, dependencies = [], write_scope = [`src/${id}/**`]) {
  return { id, dependencies, domain: 'backend', objective: 'Fix a regression', deliverable: 'Verified regression',
    read_scope: ['src/**'], write_scope, context: ['Verified local source'], constraints: ['Preserve ownership'],
    acceptance: [{ id: 'test', criterion: 'Regression passes', type: 'command', argv: ['node', '--test'], cwd: '.', expected_exit: 0 }],
    prompt: 'ROLE\nWorker\nOBJECTIVE\nFix regression\nREPOSITORY AND EVIDENCE\nVerified source\nOWNERSHIP\nScoped paths\nCONSTRAINTS\nNo external writes\nWORK\nImplement\nACCEPTANCE\nVerify\nRETURN CONTRACT\nStructured JSON',
    output_schema: structuredClone(WORKER_OUTPUT_SCHEMA) };
}
function plan(repo, tasks = [task('a')]) { return { repo_path: repo, tasks, rejected_splits: [] }; }
function run(repo, p, args = ['--max-workers', '2', '--allowed-write-root', 'src/**']) {
  const file = join(repo, 'plan.json');
  writeFileSync(file, typeof p === 'string' ? p : JSON.stringify(p));
  const result = spawnSync(process.execPath, [cli, file, ...args], { encoding: 'utf8', cwd: repo, timeout: 5000 });
  assert.ifError(result.error); assert.equal(result.stderr, '');
  return { ...result, json: JSON.parse(result.stdout), file };
}
function fails(result, code, status = 1) {
  assert.equal(result.status, status); assert.equal(result.json.ok, false); assert.equal(result.json.valid, false);
  assert.equal(result.json.schedule, null); assert(result.json.errors.some(e => e.code === code), result.stdout);
}

test('CLI prints bounded deterministic schedules and leaves the input unchanged', t => {
  const repo = fixture(t); const p = plan(repo, [task('z'), task('b'), task('a'), task('c', ['a'])]);
  const result = run(repo, p);
  assert.equal(result.status, 0); assert.equal(result.json.ok, true);
  assert.deepEqual(result.json.schedule, [['a', 'b'], ['z'], ['c']]);
  assert.deepEqual(JSON.parse(readFileSync(result.file, 'utf8')), p);
  assert.equal(run(repo, { ...p, tasks: [...p.tasks].reverse() }).stdout, result.stdout);
  for (const cap of ['1', '2', '3']) {
    const r = run(repo, p, ['--max-workers', cap, '--allowed-write-root', 'src/**']);
    assert.equal(r.status, 0); assert(r.json.schedule.every(batch => batch.length <= Number(cap)));
  }
});

test('CLI fails on cycles, writer overlap, protected controls and malformed input', t => {
  const repo = fixture(t);
  fails(run(repo, plan(repo, [task('a', ['b']), task('b', ['a'])])), 'CYCLE');
  fails(run(repo, plan(repo, [task('a', [], ['src/shared/**']), task('b', [], ['src/shared/a.mjs'])])), 'OVERLAP');
  fails(run(repo, plan(repo, [task('a', [], ['.codex/**'])]), ['--max-workers', '1', '--allowed-write-root', '.codex/**']), 'PROTECTED');
  fails(run(repo, '{'), 'JSON', 2);
  fails(run(repo, 'null'), 'SCHEMA');
  fails(run(repo, plan(repo, [task('a', ['unknown'])])), 'DEPENDENCY');
  const p = plan(repo); p.tasks[0].acceptance[0].cwd = 'missing';
  fails(run(repo, p), 'ACCEPTANCE');
});

test('explicit caps and write envelope are required; no plan claim creates authority', t => {
  const repo = fixture(t); const p = plan(repo);
  fails(run(repo, p, ['--max-workers', '1']), 'WRITE_ROOT');
  assert.equal(validatePlan(p).ok, false);
  assert.throws(() => dependencyLayers(p), e => e.code === 'INVALID_PLAN' && e.errors.some(x => x.code === 'WRITE_ROOT'));
  const readonly = plan(repo, [task('a', [], [])]);
  assert.equal(run(repo, readonly, ['--max-workers', '1']).status, 0);
  assert.deepEqual(dependencyLayers(readonly), [['a']]);
  for (const args of [[], ['--allowed-write-root', 'src/**'], ['--max-workers', '0'], ['--max-workers', '-1'],
    ['--max-workers', '1.2'], ['--max-workers', 'Infinity'], ['--max-workers', '9007199254740992'],
    ['--max-workers'], ['--max-workers', '1', '--max-workers', '2'], ['--max-workers', '1', '--surprise'],
    ['--max-workers', '1', 'extra.json'], ['--max-workers', '1', '--allowed-write-root']]) {
    fails(run(repo, p, args), 'ARGUMENT', 2);
  }
});

test('acceptance argv is inert data and cannot execute a command during validation', t => {
  const repo = fixture(t); const p = plan(repo); const sentinel = join(repo, 'sentinel');
  p.tasks[0].acceptance[0].argv = [process.execPath, '-e', `require('node:fs').writeFileSync(${JSON.stringify(sentinel)}, 'executed')`];
  assert.equal(run(repo, p).status, 0); assert.equal(existsSync(sentinel), false);
});

test('CLI read errors are structured and nonzero', t => {
  const repo = fixture(t);
  const r = spawnSync(process.execPath, [cli, join(repo, 'missing.json'), '--max-workers', '1'], { encoding: 'utf8', cwd: repo, timeout: 5000 });
  assert.ifError(r.error); assert.equal(r.stderr, ''); fails({ ...r, json: JSON.parse(r.stdout) }, 'READ', 2);
});
