import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { WORKER_OUTPUT_SCHEMA } from '../src/orchestration/index.mjs';

test('CLI honors validator result and explicit parent write boundaries', async t => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'tt-cli-plan-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'src'));
  const task = {
    id: 'api', domain: 'backend', objective: 'Preserve API behavior', deliverable: 'Patch', dependencies: [],
    read_scope: ['src/**'], write_scope: ['src/api/**'], context: ['Source inspected'], constraints: ['No external writes'],
    acceptance: [{ id: 'tests', criterion: 'Tests pass', type: 'command', argv: ['node', '--test'], cwd: '.', expected_exit: 0 }],
    prompt: 'ROLE\nBackend.\nOBJECTIVE\nImplement.\nREPOSITORY AND EVIDENCE\nKnown source.\nOWNERSHIP\nOnly declared.\nCONSTRAINTS\nNo external writes.\nWORK\nPatch.\nACCEPTANCE\nTests.\nRETURN CONTRACT\nJSON.',
    output_schema: WORKER_OUTPUT_SCHEMA,
  };
  const plan = { repo_path: root, tasks: [task], rejected_splits: [] };
  const file = path.join(root, 'plan.json');
  await fs.writeFile(file, JSON.stringify(plan));
  const run = extra => spawnSync(process.execPath, [path.resolve('src/cli.mjs'), 'validate-plan', '--plan', file, ...extra], { encoding: 'utf8' });
  const denied = run([]);
  assert.equal(denied.status, 1);
  assert.equal(JSON.parse(denied.stdout).valid, false);
  assert.match(denied.stdout, /WRITE_ROOT/);
  const allowed = run(['--write-root', 'src/**', '--max-workers', '1']);
  assert.equal(allowed.status, 0, allowed.stderr);
  assert.deepEqual(JSON.parse(allowed.stdout), { valid: true, layers: [['api']] });
  task.dependencies = ['missing'];
  await fs.writeFile(file, JSON.stringify(plan));
  const malformed = run(['--write-root', 'src/**']);
  assert.equal(malformed.status, 1);
  assert.equal(JSON.parse(malformed.stdout).valid, false);
});
