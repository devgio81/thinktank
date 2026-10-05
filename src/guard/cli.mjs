#!/usr/bin/env node
// Protocol boundary only. No user command, grant or checker code is executed.
function reason(code, detail) {
  return `TT_GUARD_${code}: ${detail} HUMAN_HANDOFF: queue for interactive human review; no grant file can override this denial.`;
}
function emit(platform, event, message) {
  if (event === 'completion' && platform === 'claude') {
    process.stderr.write(`${message}\n`);
    process.exitCode = 2;
  } else if (platform === 'claude') {
    process.stdout.write(`${JSON.stringify({ hookSpecificOutput: {
      hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: message,
    } })}\n`);
  } else {
    process.stdout.write(`${JSON.stringify({ decision: 'block', reason: message })}\n`);
  }
}
function options(argv) {
  if (![2, 4].includes(argv.length) || argv[0] !== '--platform' ||
      !['claude', 'hermes'].includes(argv[1]) ||
      (argv.length === 4 && (argv[2] !== '--event' || argv[3] !== 'completion')))
    throw new Error('Use --platform claude|hermes [--event completion].');
  return { platform: argv[1], event: argv[3] || 'tool' };
}
async function readPayload() {
  const chunks = [];
  let bytes = 0;
  const timer = setTimeout(() => process.stdin.destroy(new Error('stdin timeout')), 3000);
  try {
    for await (const chunk of process.stdin) {
      bytes += chunk.length;
      if (bytes > 1024 * 1024) throw new Error('payload too large');
      chunks.push(chunk);
    }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
    return JSON.parse(text);
  } finally { clearTimeout(timer); }
}
async function main() {
  let config;
  try { config = options(process.argv.slice(2)); } catch {
    const message = reason('INVALID_CLI', 'Use --platform claude|hermes [--event completion].');
    // Unknown platform cannot choose a wire dialect: nonzero + generic block.
    emit('hermes', 'tool', message);
    process.stderr.write(`${message}\n`);
    process.exitCode = 2;
    return;
  }
  const { platform, event } = config;
  const env = Object.freeze({ ...process.env });
  if (env[`${platform.toUpperCase()}_TT_LOOP_MODE`] !== '1') {
    process.stdout.write('{}\n');
    return; // No stdin, filesystem inspection or policy import while inactive.
  }
  let payload;
  try { payload = await readPayload(); } catch {
    emit(platform, event, reason('INVALID_PAYLOAD', 'Expected bounded UTF-8 JSON object on stdin.'));
    return;
  }
  try {
    // Dynamic import ensures dependency/load errors become protocol denials too.
    const { check } = await import('./policy.mjs');
    check(payload, { platform, event, env });
    process.stdout.write('{}\n'); // No explicit approval: other host gates still apply.
  } catch (error) {
    const known = typeof error.guardCode === 'string';
    emit(platform, event, reason(known ? error.guardCode : 'INTERNAL_ERROR',
      known ? error.message : 'Guard could not decide. Repair the installation before continuing.'));
    if (!known) process.stderr.write('TT_GUARD_INTERNAL_ERROR: policy evaluation failed.\n');
  }
}
await main();
