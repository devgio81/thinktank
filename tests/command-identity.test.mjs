import test from 'node:test';
import assert from 'node:assert/strict';
import { commandWords } from '../src/installer/command-identity.mjs';
import { shellQuote, configurationOperations } from '../src/installer/platforms.mjs';
import { parse, stringify } from 'yaml';

const executable = '/usr/bin/node';
const script = '/tmp/state-a/runtime/src/guard/cli.mjs';
const prefix = `${shellQuote(executable)} ${shellQuote(script)}`;
const suffixes = [
  ' --locally-edited=$LOCAL', ' --locally-edited="$LOCAL"',
  ' --local=$(printf unused)', ' --local=`printf unused`',
  ' --local=${LOCAL:-fallback}', ' --local=$((1+1))',
  ' --local="unterminated', ' --local=\\',
  '\t$LOCAL', '\n$LOCAL', '; printf "$LOCAL"',
];

test('literal executable/script identity is independent of later arguments', () => {
  for (const suffix of suffixes) {
    assert.deepEqual(commandWords(prefix + suffix).slice(0, 2), [executable, script], suffix);
  }
});

test('expansion inside either identity word is never guessed', () => {
  for (const command of [
    '$NODE ' + shellQuote(script), `${shellQuote(executable)} "$SCRIPT"`,
    `${shellQuote(executable)} ${shellQuote(script)}$SUFFIX`,
    `${shellQuote(executable)} ${shellQuote(script)}"$SUFFIX"`,
    `${shellQuote(executable)} ${shellQuote(script)}$(printf x)`,
    `${shellQuote(executable)} '${script}`,
  ]) assert.ok(commandWords(command).length < 2, command);
  const quoted = '/tmp/a b/it\'s/$literal/cli.mjs';
  assert.deepEqual(commandWords(`${shellQuote(executable)} ${shellQuote(quoted)} ignored`).slice(0, 2), [executable, quoted]);
});

for (const platform of ['claude', 'hermes']) {
  test(`${platform}: expanding suffix conflicts and migrates without deleting foreign hooks`, () => {
    const options = { platform, home: '/tmp/tt-identity', stateDir: '/tmp/state-a', existing: {} };
    const first = configurationOperations(options);
    const original = Object.fromEntries(first.map(op => [op.path, op.content]));
    const file = first.at(-1).path;
    const decode = platform === 'claude' ? JSON.parse : parse;
    const encode = platform === 'claude' ? JSON.stringify : stringify;
    const event = platform === 'claude' ? 'PreToolUse' : 'pre_tool_call';
    const otherEvent = platform === 'claude' ? 'PostToolUse' : 'post_tool_call';
    for (const suffix of suffixes) for (const destination of [event, otherEvent]) {
      const config = decode(original[file]);
      const entry = config.hooks[event][0];
      const hook = platform === 'claude' ? entry.hooks[0] : entry;
      const foreign = structuredClone(entry);
      const foreignHook = platform === 'claude' ? foreign.hooks[0] : foreign;
      foreignHook.command = hook.command.replace('/tmp/state-a/', '/opt/foreign/tmp/state-a/');
      hook.command += suffix;
      delete config.hooks[event];
      config.hooks[destination] = [entry, foreign];
      const existing = { ...original, [file]: encode(config) };
      assert.throws(() => configurationOperations({ ...options, existing }), /hook conflict/i);
      const migrated = configurationOperations({ ...options, existing, replace: true, stateDir: '/tmp/state-b' });
      const next = decode(migrated.at(-1).content);
      const commands = Object.values(next.hooks).flat().flatMap(h => platform === 'claude' ? h.hooks.map(x => x.command) : [h.command]);
      assert.equal(commands.length, 2);
      assert.ok(commands.includes(foreignHook.command));
      assert.ok(commands.some(command => command.includes("'/tmp/state-b/")));
      assert.ok(!commands.includes(hook.command));
    }
  });
}
