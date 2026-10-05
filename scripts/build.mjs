import * as fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse } from 'yaml';
import { treeFiles } from '../src/installer/files.mjs';

const root = path.resolve(import.meta.dirname, '..');
let count = 0;
for (const directory of ['src', 'scripts', 'tests']) {
  for (const relative of await treeFiles(path.join(root, directory))) {
    if (!relative.endsWith('.mjs')) continue;
    const file = path.join(root, directory, relative);
    const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status ?? 1);
    const lines = (await fs.readFile(file, 'utf8')).split('\n').length;
    if (lines > 500) throw new Error(`${file} exceeds 500 lines.`);
    count++;
  }
}
for (const directory of ['skills', 'agents']) for (const relative of await treeFiles(path.join(root, directory))) {
  if (!(relative.endsWith('SKILL.md') || directory === 'agents')) continue;
  const content = await fs.readFile(path.join(root, directory, relative), 'utf8');
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatter) throw new Error(`Missing frontmatter: ${relative}`);
  const metadata = parse(frontmatter[1]);
  if (!metadata.name || !metadata.description) throw new Error(`Invalid skill: ${relative}`);
}
const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
for (const binary of Object.values(manifest.bin)) await fs.access(path.join(root, binary));
console.log(`Build verified: ${count} JavaScript modules; skill frontmatter and package bin valid.`);
