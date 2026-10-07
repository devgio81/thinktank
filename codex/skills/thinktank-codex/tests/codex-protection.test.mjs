import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseScope, protectedScope, inspectScope, cwdAllowed } from '../scripts/orchestration/scopes.mjs';

function fixture(t) {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), 'thinktank-v17-codex-')));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  return repo;
}

test('Codex controls are protected in any nested or case-varied path', () => {
  for (const path of ['.codex/**', '.agents/**', 'nested/.CoDeX/hooks/**', 'nested/.AGENTS/skills/**',
    'settings.json', 'nested/SETTINGS.json', 'AGENTS.md', '.mcp.json', '.git/config',
    '.claude/**', '.hermes/**', 'loop-grants/a.json', 'loop-checker/a.ok']) {
    assert.equal(protectedScope(parseScope(path)), true, path);
  }
  for (const path of ['skills/**', 'src/skills/search.mjs', 'agents/**', 'docs/codex-notes.md',
    'src/settings.mjs', 'src/agents.md.txt', 'loop-grants-extra/**']) {
    assert.equal(protectedScope(parseScope(path)), false, path);
  }
});

test('broad write trees reject existing protected controls without scanning read trees', t => {
  const repo = fixture(t);
  mkdirSync(join(repo, 'product/.codex'), { recursive: true });
  writeFileSync(join(repo, 'product/.codex/config.toml'), 'fixture');
  assert.throws(() => inspectScope(repo, parseScope('product/**'), true), /protected harness\/control/);
  assert.doesNotThrow(() => inspectScope(repo, parseScope('product/**'), false));
  mkdirSync(join(repo, 'safe/skills'), { recursive: true });
  writeFileSync(join(repo, 'safe/skills/editor.mjs'), 'fixture');
  assert.doesNotThrow(() => inspectScope(repo, parseScope('safe/**'), true));
});

test('acceptance cwd must exist as a directory and repository must be valid', t => {
  const repo = fixture(t);
  mkdirSync(join(repo, 'tests'));
  writeFileSync(join(repo, 'file'), 'fixture');
  assert.equal(cwdAllowed('.', repo), true);
  assert.equal(cwdAllowed('tests', repo), true);
  assert.throws(() => cwdAllowed('missing', repo), /existing directory/);
  assert.throws(() => cwdAllowed('file', repo));
  assert.throws(() => cwdAllowed('tests/**', repo), /cwd must be/);
  assert.throws(() => cwdAllowed('.', join(repo, 'missing')));
  assert.throws(() => cwdAllowed('.', undefined));
});
