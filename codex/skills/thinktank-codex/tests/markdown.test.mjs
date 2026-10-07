import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { checkMarkdownLinks } from '../scripts/check-markdown.mjs';

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'thinktank-v17-markdown-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'references'));
  writeFileSync(join(root, 'references', 'contract.md'), 'Contract\n');
  return root;
}

test('relative Markdown resource links and definitions are checked without writes', t => {
  const root = fixture(t);
  const source = '[Contract](references/contract.md#scope)\n[Alias][contract]\n[contract]: references/contract.md\n';
  const skill = join(root, 'SKILL.md'); writeFileSync(skill, source);
  assert.deepEqual(checkMarkdownLinks(root), { ok: true, markdown_files: 2, relative_references: 2, errors: [] });
  assert.equal(readFileSync(skill, 'utf8'), source);
});

test('absent targets, escapes and invalid encodings fail with locations', t => {
  const root = fixture(t);
  writeFileSync(join(root, 'SKILL.md'), '[Missing](references/missing.md)\n[Escape](../outside.md)\n[Encoding](%zz.md)\n');
  const result = checkMarkdownLinks(root); assert.equal(result.ok, false); assert.equal(result.errors.length, 3);
  assert.deepEqual(result.errors.map(e => e.path), ['SKILL.md:1', 'SKILL.md:2', 'SKILL.md:3']);
});

test('remote URLs, local anchors and fenced examples do not become resource checks', t => {
  const root = fixture(t);
  writeFileSync(join(root, 'SKILL.md'), '[Web](https://example.com)\n[Anchor](#scope)\n```md\n[Example](absent.md)\n```\n');
  assert.equal(checkMarkdownLinks(root).relative_references, 0);
  assert.equal(checkMarkdownLinks(root).ok, true);
});
