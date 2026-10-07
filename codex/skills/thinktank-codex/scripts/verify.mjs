#!/usr/bin/env node
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkMarkdownLinks } from './check-markdown.mjs';

// Fixed local verification only: no plan argv, runtime dispatch or dependencies.
const root = resolve(import.meta.dirname, '..');
if (process.argv.length > 2) {
  process.stderr.write('Usage: node scripts/verify.mjs\n');
  process.exitCode = 2;
} else {
  let links;
  try { links = checkMarkdownLinks(root); }
  catch (error) { links = { ok: false, errors: [{ message: error.message }] }; }
  process.stdout.write(`${JSON.stringify({ check: 'relative-markdown-links', ...links }, null, 2)}\n`);
  const tests = readdirSync(resolve(root, 'tests')).filter(name => name.endsWith('.test.mjs')).sort()
    .map(name => resolve(root, 'tests', name));
  if (!tests.length) {
    process.stderr.write('No local regression tests found.\n');
    process.exitCode = 1;
  } else {
    const result = spawnSync(process.execPath, ['--test', ...tests], { cwd: root, stdio: 'inherit', timeout: 60000 });
    if (result.error) process.stderr.write(`${result.error.message}\n`);
    process.exitCode = result.status ?? 1;
    if (!links.ok && process.exitCode === 0) process.exitCode = 1;
  }
}
