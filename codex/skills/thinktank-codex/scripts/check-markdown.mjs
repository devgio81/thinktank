import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, relative, dirname, sep } from 'node:path';

// Small, conservative resource-link check, not a full Markdown parser. It checks
// inline links and reference definitions outside fenced code; it does not resolve
// anchors or validate remote URLs. No referenced file is executed or modified.
export function checkMarkdownLinks(root) {
  const errors = []; let files = 0; let references = 0;
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) { pending.push(path); continue; }
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      files++;
      const source = readFileSync(path, 'utf8');
      let fence; const lines = source.split('\n').map(line => {
        const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
        if (marker) {
          if (!fence) fence = { character: marker[1][0], length: marker[1].length };
          else if (marker[1][0] === fence.character && marker[1].length >= fence.length) fence = undefined;
          return '';
        }
        return fence ? '' : line;
      });
      for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        const targets = [...line.matchAll(/!?\[[^\]]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\s*\)/g)].map(match => match[1]);
        const reference = line.match(/^\s{0,3}\[[^\]]+\]:\s*(<[^>]+>|\S+)/);
        if (reference) targets.push(reference[1]);
        for (let target of targets) {
          target = target.replace(/^<|>$/g, '');
          if (/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(target)) continue;
          target = target.split(/[?#]/, 1)[0].replace(/:\d+$/, '');
          if (!target) continue;
          references++;
          const location = `${relative(root, path).split(sep).join('/')}:${index + 1}`;
          let resolved;
          try { resolved = resolve(dirname(path), decodeURIComponent(target)); }
          catch { errors.push({ path: location, target, message: 'Invalid percent encoding in relative resource link' }); continue; }
          const within = relative(root, resolved);
          if (within === '..' || within.startsWith(`..${sep}`)) {
            errors.push({ path: location, target, message: 'Relative resource link escapes the skill directory' }); continue;
          }
          try { statSync(resolved); }
          catch { errors.push({ path: location, target, message: 'Relative resource link target is absent' }); }
        }
      }
    }
  }
  return { ok: errors.length === 0, markdown_files: files, relative_references: references, errors };
}
