// Read only the first two complete literal words (executable and script).
// Later arguments cannot invalidate an established identity. Expansion within
// either identity word is refused. Never execute or evaluate shell syntax.
export function commandWords(command) {
  if (typeof command !== 'string') return [];
  const words = []; let word = '', quote = null, started = false;
  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (quote === "'") {
      if (char === "'") quote = null; else word += char;
    } else if (quote === '"') {
      if (char === '"') quote = null;
      else if (char === '\\') { word += command[++i] ?? ''; }
      else if (char === '$' || char === '`') return [];
      else word += char;
    } else if (char === "'" || char === '"') { quote = char; started = true; }
    else if (char === '\\') { word += command[++i] ?? ''; started = true; }
    else if (';&|<>\n'.includes(char)) { break; }
    else if (/\s/.test(char)) {
      if (started) {
        words.push(word);
        if (words.length === 2) return words;
        word = ''; started = false;
      }
    } else {
      if (char === '$' || char === '`') return [];
      word += char; started = true;
    }
  }
  if (quote) return [];
  if (started) words.push(word);
  return words;
}
