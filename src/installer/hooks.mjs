import { isDeepStrictEqual } from 'node:util';
import { commandWords } from './command-identity.mjs';

// Managed command paths are derived from the old/new MCP registration, never
// guessed from another hook's name. Scan every event so moved hooks cannot linger.
export function reconcileHooks(hooks, { platform, commands, desired, replace }) {
  const expectedEvent = platform === 'claude' ? 'PreToolUse' : 'pre_tool_call';
  const identities = [...commands].map(commandWords).filter(words => words.length >= 2);
  const owned = command => {
    const words = commandWords(command);
    return identities.some(base => words[0] === base[0] && words[1] === base[1]);
  };
  const conflict = () => {
    if (!replace) throw new Error('Managed hook conflict: hook command, event or settings changed. Review before using --replace.');
  };
  const result = { ...hooks };
  for (const [event, entries] of Object.entries(hooks)) {
    // Hermes also uses hooks.outbound, which is outside this managed surface.
    if (!Array.isArray(entries)) {
      if (event === expectedEvent) throw new Error(`${event} hooks must be an array.`);
      continue;
    }
    const kept = [];
    for (const entry of entries) {
      if (platform === 'claude') {
        if (!entry || !Array.isArray(entry.hooks)) {
          if (event === expectedEvent) throw new Error('PreToolUse entry.hooks must be an array.');
          kept.push(entry); continue;
        }
        const own = entry.hooks.filter(h => owned(h.command));
        for (const h of own) {
          const { hooks: ignored, ...settings } = entry;
          if (event !== expectedEvent || !isDeepStrictEqual(settings, { matcher: '*' }) || !isDeepStrictEqual(h, desired.hooks[0])) conflict();
        }
        const remaining = entry.hooks.filter(h => !owned(h.command));
        if (!own.length || remaining.length) kept.push(own.length ? { ...entry, hooks: remaining } : entry);
      } else if (entry && owned(entry.command)) {
        if (event !== expectedEvent || !isDeepStrictEqual(entry, desired)) conflict();
      } else kept.push(entry);
    }
    if (kept.length) result[event] = kept;
    else delete result[event];
  }
  result[expectedEvent] = [...(result[expectedEvent] ?? []), desired];
  return result;
}
