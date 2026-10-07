#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { validatePlan, dependencyLayers } from './orchestration/index.mjs';

// This entry point only validates data and prints task-ID batches. Acceptance
// argv is inert data: no verifier, worker, installer, model or hook runs here.
const usage = 'node scripts/validate-plan.mjs PLAN.json --max-workers N [--allowed-write-root relative/path/** ...]';
const output = value => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
function fail(code, path, message, exitCode = 2) {
  output({ ok: false, valid: false, errors: [{ code, path, message }], schedule: null });
  process.exitCode = exitCode;
}
function parse(argv) {
  if (argv.length === 1 && argv[0] === '--help') return { help: true };
  let planPath; let maxWorkers; const allowedWriteRoots = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--max-workers') {
      if (maxWorkers !== undefined) throw new Error('--max-workers may appear only once');
      const value = argv[++i];
      if (!/^[1-9][0-9]*$/.test(value ?? '') || !Number.isSafeInteger(Number(value))) {
        throw new Error('--max-workers requires a positive safe integer');
      }
      maxWorkers = Number(value);
    } else if (arg === '--allowed-write-root') {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error('--allowed-write-root requires a relative scope');
      allowedWriteRoots.push(value);
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown argument: ${arg}`);
    } else {
      if (planPath !== undefined) throw new Error('Provide exactly one plan JSON path');
      planPath = arg;
    }
  }
  if (!planPath || maxWorkers === undefined) throw new Error(`Plan path and explicit --max-workers required. Usage: ${usage}`);
  return { planPath, options: { maxWorkers, allowedWriteRoots } };
}

let args;
try { args = parse(process.argv.slice(2)); } catch (error) { fail('ARGUMENT', 'argv', error.message); }
if (args?.help) output({ usage, default_write_roots: [], executes_acceptance: false });
else if (args) {
  let source;
  try { source = readFileSync(args.planPath, 'utf8'); } catch (error) { fail('READ', 'plan_file', error.message); }
  if (source !== undefined) {
    let plan;
    try { plan = JSON.parse(source); } catch (error) { fail('JSON', 'plan_file', error.message); }
    if (process.exitCode === undefined) {
      const result = validatePlan(plan, args.options);
      output({ ...result, schedule: result.ok ? dependencyLayers(plan, args.options) : null });
      process.exitCode = result.ok ? 0 : 1;
    }
  }
}
