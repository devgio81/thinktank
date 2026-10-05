import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, stringify } from 'yaml';
import { configurationOperations } from '../src/installer/platforms.mjs';

for (const platform of ['claude', 'hermes']) {
  test(`${platform}: changed command and moved event are conflicts, explicit migration removes only managed hooks`, () => {
    const options = { platform, home: '/tmp/tt-hook-review', stateDir: '/tmp/state-a', existing: {} };
    const first = configurationOperations(options);
    const existing = Object.fromEntries(first.map(x => [x.path, x.content]));
    const file = first.at(-1).path;
    const decode = x => platform === 'claude' ? JSON.parse(x) : parse(x);
    const encode = x => platform === 'claude' ? JSON.stringify(x) : stringify(x);
    const event = platform === 'claude' ? 'PreToolUse' : 'pre_tool_call';
    const moved = platform === 'claude' ? 'PostToolUse' : 'post_tool_call';
    for (const suffix of ['', ' --locally-edited', '; printf local-edit', '&&printf local-edit', '\t--local', '> /tmp/local']) {
      const config = decode(existing[file]);
      const entries = config.hooks[event];
      if (suffix) {
        const hook = platform === 'claude' ? entries[0].hooks[0] : entries[0];
        hook.command += suffix;
      }
      const unrelated = `printf '%s' '/tmp/state-a/runtime/src/guard/cli.mjs'`;
      const userHook = platform === 'claude'
        ? { matcher: 'Read', hooks: [{ type: 'command', command: unrelated }] }
        : { matcher: 'read_file', command: unrelated };
      config.hooks[moved] = [...entries, userHook];
      delete config.hooks[event];
      const edited = { ...existing, [file]: encode(config) };
      assert.throws(() => configurationOperations({ ...options, existing: edited }), /hook conflict/i);
      const result = configurationOperations({ ...options, existing: edited, stateDir: '/tmp/state-b', replace: true });
      const output = decode(result.at(-1).content);
      assert.deepEqual(output.hooks[moved], [userHook]);
      assert.equal(output.hooks[event].length, 1);
      const managed = platform === 'claude' ? output.hooks[event][0].hooks[0].command : output.hooks[event][0].command;
      assert.ok(managed.includes('/tmp/state-b/'));
      assert.ok(!managed.includes('/tmp/state-a/'));
    }
  });
}
