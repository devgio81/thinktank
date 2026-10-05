import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const cli = path.join(packageRoot, 'src/guard/cli.mjs');
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(packageRoot, 'tests/guard-fixture-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const repo = path.join(dir, 'repo');
  const home = path.join(dir, 'home');
  const outside = path.join(dir, 'repo-sibling');
  for (const p of [repo, home, outside, `${repo}/src`, `${dir}/metadata/worktrees/guard`])
    fs.mkdirSync(p, { recursive: true });
  // A linked-worktree fixture, with metadata intentionally outside the write root.
  fs.writeFileSync(`${repo}/.git`, `gitdir: ${dir}/metadata/worktrees/guard\n`);
  fs.writeFileSync(`${dir}/metadata/worktrees/guard/commondir`, '../..\n');
  fs.writeFileSync(`${repo}/src/a.txt`, 'before\n');
  fs.symlinkSync(outside, `${repo}/escape`);
  fs.symlinkSync(`${dir}/metadata`, `${repo}/meta-alias`);
  fs.symlinkSync(`${repo}/src`, `${repo}/inside`);
  return { dir, repo, home, outside };
}
function invoke(f, platform, tool, input, options = {}) {
  const prefix = platform.toUpperCase();
  const env = { PATH: process.env.PATH, HOME: f.home,
    [`${prefix}_TT_LOOP_MODE`]: '1', [`${prefix}_TT_REPO_PATH`]: f.repo,
    HERMES_HOME: `${f.home}/.hermes`, CLAUDE_HOME: `${f.home}/.claude`,
    ...options.env };
  const payload = { hook_event_name: platform === 'claude' ? 'PreToolUse' : 'pre_tool_call',
    tool_name: tool, tool_input: input, cwd: f.repo, session_id: 'fixture', ...options.payload };
  return spawnSync(process.execPath, [cli, '--platform', platform, ...(options.flags || [])], {
    cwd: options.cwd || f.repo, env, input: options.raw ?? JSON.stringify(payload),
    encoding: 'utf8', timeout: 5000,
  });
}
function denied(result, platform, code) {
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  let reason;
  if (platform === 'claude') {
    assert.deepEqual(Object.keys(output), ['hookSpecificOutput']);
    assert.deepEqual(Object.keys(output.hookSpecificOutput).sort(),
      ['hookEventName', 'permissionDecision', 'permissionDecisionReason'].sort());
    assert.equal(output.hookSpecificOutput.hookEventName, 'PreToolUse');
    assert.equal(output.hookSpecificOutput.permissionDecision, 'deny');
    reason = output.hookSpecificOutput.permissionDecisionReason;
  } else {
    assert.deepEqual(Object.keys(output).sort(), ['decision', 'reason']);
    assert.equal(output.decision, 'block');
    reason = output.reason;
  }
  assert.match(reason, /^TT_GUARD_[A-Z_]+:/);
  assert.match(reason, /HUMAN_HANDOFF/);
  if (code) assert.match(reason, new RegExp(`^TT_GUARD_${code}:`));
  return reason;
}
function allowed(result) {
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {});
  assert.equal(result.stderr, '');
}
for (const platform of ['claude', 'hermes']) {
  const write = platform === 'claude' ? 'Write' : 'write_file';
  const read = platform === 'claude' ? 'Read' : 'read_file';
  const shell = platform === 'claude' ? 'Bash' : 'terminal';
  const target = (p, extra = {}) => ({ [platform === 'claude' ? 'file_path' : 'path']: p,
    content: 'after\n', ...extra });
  test(`${platform}: inactive is a side-effect-free no-op, only exact selected flag arms`, t => {
    const f = fixture(t);
    for (const mode of ['', '0', 'true', '01']) allowed(invoke(f, platform, write, {}, {
      raw: 'not JSON', env: { [`${platform.toUpperCase()}_TT_LOOP_MODE`]: mode,
        [`${platform.toUpperCase()}_TT_REPO_PATH`]: '',
        [`${platform === 'claude' ? 'HERMES' : 'CLAUDE'}_TT_LOOP_MODE`]: '1' },
    }));
    assert.equal(fs.readFileSync(`${f.repo}/src/a.txt`, 'utf8'), 'before\n');
  });
  test(`${platform}: malformed JSON and complete payload type validation`, t => {
    const f = fixture(t);
    for (const raw of ['', '{', 'null', '[]', '42', 'true', '"x"', '{}',
      '{"tool_name":null,"tool_input":{}}', '{"tool_name":"Write","tool_input":[]}',
      '{"tool_name":"Write","tool_input":"{}"}', '{"tool_name":[],"tool_input":{}}'])
      denied(invoke(f, platform, '', {}, { raw }), platform, 'INVALID_PAYLOAD');
    for (const payload of [{ cwd: 9 }, { session_id: {} }, { tool_input: null },
      { hook_event_name: 'wrong' }, { args: { command: 'pwd' } }, { extra: [] }])
      denied(invoke(f, platform, shell, { command: 'pwd' }, { payload }), platform, 'INVALID_PAYLOAD');
    denied(invoke(f, platform, shell, { command: 2 }), platform, 'INVALID_INPUT');
    denied(invoke(f, platform, shell, { command: 'pwd', env: {} }), platform, 'INVALID_INPUT');
    denied(invoke(f, platform, write, target('a.txt', { content: {} })), platform, 'INVALID_INPUT');
  });
  test(`${platform}: trusted root cannot come from request, cwd, grant or another platform`, t => {
    const f = fixture(t);
    denied(invoke(f, platform, write, target(`${f.repo}/ok.txt`), {
      env: { [`${platform.toUpperCase()}_TT_REPO_PATH`]: '' },
      payload: { repo_path: f.repo, grant: { repo_path: f.repo } },
    }), platform);
    denied(invoke(f, platform, write, target('ok.txt'), {
      env: { [`${platform.toUpperCase()}_TT_REPO_PATH`]: 'relative' },
    }), platform, 'TRUST_CONFIGURATION');
    denied(invoke(f, platform, write, target(`${f.outside}/x`), {
      payload: { cwd: f.outside },
    }), platform, 'PATH_BOUNDARY');
    denied(invoke(f, platform, write, target('x'), {
      payload: { cwd: `${f.repo}/escape` },
    }), platform, 'PATH_BOUNDARY');
  });
  test(`${platform}: permitted repo file operations, not broad hooks/skills name blocks`, t => {
    const f = fixture(t);
    for (const p of ['src/a.txt', `${f.repo}/new/file.txt`, 'hooks/new.sh', 'skills/demo/SKILL.md',
      'src/../ok.txt', 'inside/new.txt', 'not.git/hooks/a.txt'])
      allowed(invoke(f, platform, write, target(p)));
    allowed(invoke(f, platform, read,
      { [platform === 'claude' ? 'file_path' : 'path']: `${f.repo}/src/a.txt` }));
    allowed(invoke(f, platform, shell, { command: 'pwd' }));
    allowed(invoke(f, platform, shell, { command: 'pwd -P' }));
  });
  test(`${platform}: traversal, sibling-prefix, symlink and special path attacks`, t => {
    const f = fixture(t);
    fs.symlinkSync(`${f.outside}/missing`, `${f.repo}/dangling`);
    fs.linkSync(`${f.repo}/src/a.txt`, `${f.repo}/hardlink`);
    fs.symlinkSync('loop', `${f.repo}/loop`);
    for (const p of ['../repo-sibling/x', `${f.outside}/x`, 'escape/new/deep.txt',
      'escape/../x', 'dangling/file', 'loop/file', 'hardlink', '', '.', 'src',
      '~/x', 'a\u0000b', 'a\nb', 'file:///tmp/x'])
      denied(invoke(f, platform, write, target(p)), platform);
    denied(invoke(f, platform, shell, { command: 'pwd', workdir: f.outside }), platform);
    if (platform === 'hermes') {
      allowed(invoke(f, platform, shell, { command: 'pwd', workdir: `${f.repo}/src` }));
      denied(invoke(f, platform, shell, { command: 'pwd', workdir: `${f.repo}/escape` }), platform);
    }
  });
  test(`${platform}: git metadata, harness, configured profile and authority files protected`, t => {
    const f = fixture(t);
    for (const p of ['.git', '.git/hooks/pre-commit', '.GIT/hooks/x', 'src/.git/config',
      'meta-alias/hooks/pre-commit', `${f.dir}/metadata/config`,
      '.claude/hooks/a.sh', '.hermes/config.yaml', 'CLAUDE.md', 'AGENTS.md',
      'settings.json', 'settings.local.json', '.mcp.json', 'keybindings.json',
      'loop-grants/fake.json', 'loop-checker/fake.ok', '.thinktank/authority.json'])
      denied(invoke(f, platform, write, target(p)), platform);
    for (const key of ['HERMES_HOME', 'CLAUDE_HOME', 'CLAUDE_CONFIG_DIR',
      'HERMES_TT_GRANT_DIR', 'CLAUDE_TT_CHECKER_DIR', 'HERMES_TT_STATE_DIR']) {
      const protectedDir = `${f.repo}/custom-${key}`;
      denied(invoke(f, platform, write, target(`${protectedDir}/new.txt`), {
        env: { [key]: protectedDir },
      }), platform, 'PROTECTED_PATH');
    }
    denied(invoke(f, platform, write, target(`${packageRoot}/hooks/tt-loop-guard.sh`)), platform);
  });
  test(`${platform}: unknown, execution, browser, desktop, scheduling, MCP and outward deny`, t => {
    const f = fixture(t);
    for (const tool of ['UnknownTool', 'browser_exec', 'execute_code', 'computer_use', 'setup_mcp',
      'tool_call', 'tool_describe', 'mcp__bank__transfer_funds', 'mcp__qdrant__find',
      'CronCreate', 'CronDelete', 'ScheduleWakeup', 'cronjob', 'SendMessage', 'send_message',
      'SendUserFile', 'RemoteTrigger', 'Artifact', 'delegate_task', 'process',
      'drive_preview', 'open_preview', 'skill_manage', 'TaskUpdate', 'NotebookEdit'])
      denied(invoke(f, platform, tool, { action: 'read', code: 'pass' }), platform, 'UNSUPPORTED_TOOL');
    denied(invoke(f, platform, platform === 'claude' ? 'write_file' : 'Write', target('x')),
      platform, 'UNSUPPORTED_TOOL');
  });
  test(`${platform}: positive shell grammar rejects every unverified form and git helper route`, t => {
    const f = fixture(t);
    for (const command of ['pwd; touch /tmp/x', 'pwd\ntouch /tmp/x', 'pwd && pwd', 'pwd | cat',
      'pwd > /tmp/x', 'pwd $(touch /tmp/x)', 'pwd `id`', 'pwd &', 'pwd # comment',
      '"pwd"', 'pwd -L', 'pwd --help', ' pwd', 'pwd ', '/bin/pwd', 'env pwd', 'command pwd',
      'bash -c pwd', 'sh script', 'python3 -c x', 'node x.mjs', 'npm test', 'npx test', './deploy.sh',
      'cp src/a.txt /tmp/x', 'touch /tmp/x', 'tee /tmp/x', 'rm -rf /',
      'git status', 'git --no-pager status', 'git diff --no-ext-diff', 'git log --no-pager',
      'git -c core.pager=evil log', 'git --exec-path=/tmp status', 'git config core.hooksPath /tmp',
      'git reset --hard', 'git push --force origin main', 'git commit -m x',
      'curl https://example.test', 'curl -d x https://example.test', 'npm publish',
      'gh api -X POST /foo', 'crontab -l', 'launchctl list', 'at now', 'terraform destroy',
      'kubectl delete x', 'php artisan migrate'])
      denied(invoke(f, platform, shell, { command }), platform, 'UNSUPPORTED_EXECUTION');
  });
  test(`${platform}: all grant corridors explicitly unsupported, forged valid-looking files do not authorize`, t => {
    const f = fixture(t);
    const grants = `${f.dir}/grants`;
    fs.mkdirSync(grants);
    fs.writeFileSync(`${grants}/fake.json`, JSON.stringify({ signed_by: 'human', expires_at: '9999-01-01T00:00:00Z',
      repo_path: f.repo, branch_prefix: 'feat/', merge_targets: ['develop'], max_merges: 100,
      deploy_commands: ['./deploy.sh staging'], deploy_workflows: ['deploy.yml'] }));
    for (const command of ['git push origin feat/test', 'gh pr create --base develop',
      'gh pr merge 1 --squash', 'gh workflow run deploy.yml --ref develop', './deploy.sh staging'])
      denied(invoke(f, platform, shell, { command }, { env: {
        [`${platform.toUpperCase()}_TT_GRANT_DIR`]: grants,
        [`${platform.toUpperCase()}_TT_RUN_ID`]: 'fake',
      } }), platform, 'UNSUPPORTED_EXECUTION');
    assert.deepEqual(fs.readdirSync(grants), ['fake.json']);
  });
  test(`${platform}: completion cannot be certified by a checker-shaped file`, t => {
    const f = fixture(t);
    const checker = `${f.dir}/checker`;
    fs.mkdirSync(checker);
    fs.writeFileSync(`${checker}/fake.ok`, 'EXIT=verified\nACCEPTANCE=everything\nEVIDENCE=trust me\n');
    const result = invoke(f, platform, null, null, { flags: ['--event', 'completion'],
      payload: { hook_event_name: platform === 'claude' ? 'TaskCompleted' : 'pre_verify' },
      env: { [`${platform.toUpperCase()}_TT_CHECKER_DIR`]: checker,
        [`${platform.toUpperCase()}_TT_RUN_ID`]: 'fake' } });
    if (platform === 'claude') {
      assert.equal(result.status, 2);
      assert.equal(result.stdout, '');
      assert.match(result.stderr, /TT_GUARD_UNATTESTED_COMPLETION:.*HUMAN_HANDOFF/);
    } else {
      assert.equal(result.status, 0);
      assert.equal(JSON.parse(result.stdout).decision, 'block');
      assert.match(JSON.parse(result.stdout).reason, /^TT_GUARD_UNATTESTED_COMPLETION:/);
    }
  });
}
test('Hermes replace and multi-file V4A patches inspect every target', t => {
  const f = fixture(t);
  const run = input => invoke(f, 'hermes', 'patch', input);
  allowed(run({ mode: 'replace', path: 'src/a.txt', old_string: 'before', new_string: 'after' }));
  for (const p of ['.git/hooks/x', 'escape/new.txt', '../repo-sibling/x', '.hermes/config.yaml']) {
    denied(run({ mode: 'replace', path: p, old_string: 'a', new_string: 'b' }), 'hermes');
    denied(run({ mode: 'patch', patch: `*** Begin Patch\n*** Update File: src/a.txt\n@@\n-a\n+b\n*** Add File: ${p}\n+evil\n*** End Patch` }), 'hermes');
  }
  allowed(run({ mode: 'patch', patch: '*** Begin Patch\n*** Update File: src/a.txt\n@@\n-before\n+after\n*** Add File: hooks/demo.sh\n+true\n*** End Patch' }));
  for (const patch of ['diff --git a/x b/x', '*** Begin Patch\n*** End Patch',
    '*** Begin Patch\n*** Update File: src/a.txt\n*** Move to: .git/hooks/x\n@@\n-a\n+b\n*** End Patch',
    '*** Begin Patch\n*** Add File: ok\n+ok\n*** End Patch\n*** Add File: .git/x\n+x'])
    denied(run({ mode: 'patch', patch }), 'hermes', 'UNSUPPORTED_PATCH');
  denied(run({ mode: 'replace', path: 'src/a.txt', old_string: 'a', new_string: 'b', cross_profile: true }), 'hermes');
});
test('Claude Edit and MultiEdit validate edits and target', t => {
  const f = fixture(t);
  allowed(invoke(f, 'claude', 'Edit', { file_path: 'src/a.txt', old_string: 'before', new_string: 'after' }));
  allowed(invoke(f, 'claude', 'MultiEdit', { file_path: 'src/a.txt', edits: [{ old_string: 'before', new_string: 'after' }] }));
  denied(invoke(f, 'claude', 'MultiEdit', { file_path: '.git/hooks/x', edits: [{ old_string: 'a', new_string: 'b' }] }), 'claude');
  denied(invoke(f, 'claude', 'MultiEdit', { file_path: 'src/a.txt', edits: [{ old_string: 'a', new_string: {} }] }), 'claude');
});
test('invalid CLI platform/options cannot look like allow', t => {
  const f = fixture(t);
  for (const flags of [[], ['--platform', 'other'], ['--platform', 'hermes', '--repo', f.repo],
    ['--platform', 'hermes', '--platform', 'claude']]) {
    const result = spawnSync(process.execPath, [cli, ...flags], { cwd: f.repo,
      env: { PATH: process.env.PATH, HOME: f.home }, input: '{}', encoding: 'utf8' });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /TT_GUARD_INVALID_CLI:/);
    assert.equal(JSON.parse(result.stdout).decision, 'block');
  }
});
test('capability-preserving scoped reads, skills and task planning', t => {
  const f = fixture(t);
  for (const args of [{ pattern: 'needle' }, { pattern: '*.mjs', target: 'files', path: `${f.repo}/src`, limit: 10 }])
    allowed(invoke(f, 'hermes', 'search_files', args));
  for (const args of [{ pattern: 'x', path: f.outside }, { pattern: 'x', command: 'bad' },
    { pattern: {}, path: f.repo }]) denied(invoke(f, 'hermes', 'search_files', args), 'hermes');
  allowed(invoke(f, 'claude', 'Grep', { pattern: 'needle', path: f.repo, output_mode: 'content', '-n': true }));
  allowed(invoke(f, 'claude', 'Glob', { pattern: '**/*.mjs', path: f.repo }));
  denied(invoke(f, 'claude', 'Glob', { pattern: '../../*', path: f.repo }), 'claude');
  allowed(invoke(f, 'hermes', 'skill_view', { name: 'thinktank-v17', file_path: 'references/contract.md' }));
  allowed(invoke(f, 'hermes', 'skills_list', {}));
  denied(invoke(f, 'hermes', 'skill_view', { name: '../../evil' }), 'hermes');
  denied(invoke(f, 'hermes', 'skill_view', { name: 'thinktank-v17', file_path: '../config.yaml' }), 'hermes');
  allowed(invoke(f, 'hermes', 'todo', { todos: [{ id: 'a', content: 'Implement', status: 'in_progress' }], merge: false }));
  denied(invoke(f, 'hermes', 'todo', { todos: [{ id: 'a', content: 'Ship', status: 'complete', command: 'x' }] }), 'hermes');
  allowed(invoke(f, 'claude', 'TodoWrite', { todos: [{ content: 'Implement', activeForm: 'Implementing', status: 'in_progress' }] }));
});
test('human-supplied verification commands are exact, root-scoped and never release grants', t => {
  const f = fixture(t);
  for (const platform of ['claude', 'hermes']) {
    const shell = platform === 'claude' ? 'Bash' : 'terminal';
    const key = `${platform.toUpperCase()}_TT_VERIFY_COMMANDS`;
    const commands = ['node --test tests/guard.test.mjs', 'npm test', 'npm run build'];
    for (const command of commands) allowed(invoke(f, platform, shell, { command }, {
      env: { [key]: JSON.stringify(commands) } }));
    denied(invoke(f, platform, shell, { command: 'npm run check' }, {
      env: { [key]: JSON.stringify(commands) } }), platform);
    for (const command of ['git push origin feat/x', 'gh pr create', 'npm publish', 'npm run deploy',
      'node --test tests/guard.test.mjs && npm publish', 'env X=1 npm test', 'npm --prefix /tmp test',
      'npm test -- --env=x', 'node -e evil', 'python -c evil', './deploy.sh', 'npm run prepublish'])
      denied(invoke(f, platform, shell, { command }, { env: { [key]: JSON.stringify([command]) } }), platform);
    for (const value of ['not JSON', '{}', '[7]']) denied(invoke(f, platform, shell,
      { command: 'npm test' }, { env: { [key]: value } }), platform, 'TRUST_CONFIGURATION');
    denied(invoke(f, platform, shell, { command: 'npm test' }, {
      env: { [key]: '["npm test"]' }, cwd: `${f.repo}/src`, payload: { cwd: `${f.repo}/src` } }), platform);
  }
});
test('new read/planning capabilities reject expansion and boundary escapes', t => {
  const f = fixture(t);
  for (const [platform, tool, args] of [
    ['hermes', 'search_files', { pattern: 'x', path: 'escape' }],
    ['hermes', 'search_files', { pattern: 'escape/*.txt', target: 'files' }],
    ['hermes', 'search_files', { pattern: 'x', file_glob: '../*' }],
    ['hermes', 'search_files', { pattern: 'x', env: {} }],
    ['hermes', 'search_files', { pattern: 'x', path: 'meta-alias' }],
    ['claude', 'Grep', { pattern: 'x', path: '.git' }],
    ['claude', 'Grep', { pattern: 'x', glob: '/etc/*' }],
    ['claude', 'Grep', { pattern: 'x', '-L': true }],
    ['claude', 'Glob', { pattern: 'escape/*.txt' }],
    ['claude', 'Glob', { pattern: '{src,../}/*' }],
    ['claude', 'Glob', { pattern: 'meta-alias/*' }],
    ['claude', 'Glob', { pattern: '.git/*' }],
    ['hermes', 'skills_list', { category: '../secrets' }],
    ['hermes', 'skills_list', { action: 'install' }],
    ['hermes', 'skill_view', { name: 'thinktank-v17', file_path: '/etc/passwd' }],
    ['hermes', 'skill_view', { name: 'thinktank-v17', file_path: 'scripts/../../config.yaml' }],
    ['hermes', 'todo', { todos: [{ id: 'a', content: 'x', status: 'pending', env: {} }] }],
    ['claude', 'TodoWrite', { todos: [{ content: 'x', status: 'pending', activeForm: 1 }] }],
  ]) denied(invoke(f, platform, tool, args), platform);
  allowed(invoke(f, 'hermes', 'search_files', { pattern: 'x', path: 'src/a.txt', output_mode: 'count' }));
  allowed(invoke(f, 'hermes', 'todo', {}));
});
test('verification launch pins cannot be self-granted, widened or used for releases', t => {
  const f = fixture(t);
  for (const platform of ['claude', 'hermes']) {
    const shell = platform === 'claude' ? 'Bash' : 'terminal';
    const key = `${platform.toUpperCase()}_TT_VERIFY_COMMANDS`;
    const options = { env: { [key]: '["npm test"]' } };
    for (const payload of [{ env: { [key]: '["npm test"]' } },
      { verify_commands: ['npm test'] }, { extra: { [key]: '["npm test"]' } }])
      denied(invoke(f, platform, shell, { command: 'npm test' }, { payload }), platform);
    denied(invoke(f, platform, shell, { command: 'npm test' }, {
      env: { [`${platform === 'claude' ? 'HERMES' : 'CLAUDE'}_TT_VERIFY_COMMANDS`]: '["npm test"]' } }), platform);
    for (const command of ['npm test ', ' npm test', 'npm test\n', 'npm test; pwd',
      'npm run test -- --config=/tmp/evil', 'npm --global test', '/usr/bin/npm test',
      'node --test ../evil.js', 'node --test escape/evil.js', 'node --test --import=evil',
      'npm run release', 'pnpm publish', 'yarn run deploy', 'npm run pretest'])
      denied(invoke(f, platform, shell, { command }, { env: { [key]: JSON.stringify([command]) } }), platform);
    const extra = platform === 'claude' ? { run_in_background: true } : { background: true };
    denied(invoke(f, platform, shell, { command: 'npm test', ...extra }, options), platform);
    denied(invoke(f, platform, shell, { command: 'npm test', env: {} }, options), platform);
    if (platform === 'hermes') denied(invoke(f, platform, shell,
      { command: 'npm test', workdir: `${f.repo}/src` }, options), platform);
    for (const raw of ['[]', '["npm run build"]']) denied(invoke(f, platform, shell,
      { command: 'npm test' }, { env: { [key]: raw } }), platform);
  }
});
test('delegation is immutable-opt-in and structurally leaf-only on both hosts', t => {
  const f = fixture(t);
  for (const platform of ['claude', 'hermes']) {
    const tool = platform === 'claude' ? 'Agent' : 'delegate_task';
    const key = `${platform.toUpperCase()}_TT_ALLOW_DELEGATION`;
    const a = platform === 'claude' ? { prompt: 'Review source', description: 'Review', subagent_type: 'general-purpose' }
      : { goal: 'Review source', context: 'Do not delegate', role: 'leaf' };
    const options = { env: { [key]: '1' } };
    allowed(invoke(f, platform, tool, a, options));
    for (const value of ['', '0', 'true', '01']) denied(invoke(f, platform, tool, a,
      { env: { [key]: value }, payload: { allow_delegation: true, env: { [key]: '1' } } }), platform);
    denied(invoke(f, platform, tool, a, { env: {
      [`${platform === 'claude' ? 'HERMES' : 'CLAUDE'}_TT_ALLOW_DELEGATION`]: '1' } }), platform);
    for (const expansion of [{ env: {} }, { toolsets: ['all'] }, { tools: ['Agent'] },
      { provider: 'other' }, { model: 'other' }, { role: 'orchestrator' },
      { run_in_background: true }, { resume: 'foreign-session' }, { isolation: 'worktree' }])
      denied(invoke(f, platform, tool, { ...a, ...expansion }, options), platform);
    if (platform === 'hermes') {
      allowed(invoke(f, platform, tool, { tasks: [a, a] }, options));
      allowed(invoke(f, platform, tool, { ...a, output_schema: { type: 'object', properties: { status: { type: 'string' } } } }, options));
      denied(invoke(f, platform, tool, { ...a, output_schema: 'bad' }, options), platform);
      denied(invoke(f, platform, tool, { tasks: [a, { ...a, provider: 'other' }] }, options), platform);
      denied(invoke(f, platform, tool, { tasks: [] }, options), platform);
      denied(invoke(f, platform, tool, { goal: 'default role forbidden' }, options), platform);
    } else denied(invoke(f, platform, tool, { ...a, subagent_type: 'custom-agent' }, options), platform);
  }
});
test('lexical normalization cannot disagree with symlink walking at a boundary', t => {
  const f = fixture(t);
  fs.mkdirSync(`${f.repo}/src/deep`);
  fs.symlinkSync(`${f.repo}/src/deep`, `${f.repo}/deep-alias`);
  denied(invoke(f, 'hermes', 'write_file', { path: 'deep-alias/../../repo-sibling/x', content: '' }), 'hermes');
  fs.symlinkSync(`${f.repo}/src/a.txt`, `${f.repo}/CLAUDE.md`);
  denied(invoke(f, 'hermes', 'write_file', { path: 'CLAUDE.md', content: '' }), 'hermes');
  denied(invoke(f, 'hermes', 'patch', { mode: 'patch',
    patch: '*** Begin Patch\n*** Add File:  .git/hooks/x\n+evil\n*** End Patch' }), 'hermes');
});
test('caught module and filesystem errors remain denials; inactive never imports policy', t => {
  const f = fixture(t);
  const copy = `${f.dir}/runtime/src/guard`;
  fs.mkdirSync(copy, { recursive: true });
  fs.copyFileSync(cli, `${copy}/cli.mjs`); // Missing policy module is a real loader failure.
  for (const platform of ['claude', 'hermes']) {
    const env = { PATH: process.env.PATH, HOME: f.home,
      [`${platform.toUpperCase()}_TT_LOOP_MODE`]: '1' };
    const result = spawnSync(process.execPath, [`${copy}/cli.mjs`, '--platform', platform], {
      cwd: f.repo, env, input: '{}', encoding: 'utf8' });
    denied(result, platform, 'INTERNAL_ERROR');
    assert.match(result.stderr, /TT_GUARD_INTERNAL_ERROR/);
    allowed(spawnSync(process.execPath, [`${copy}/cli.mjs`, '--platform', platform], {
      cwd: f.repo, env: { ...env, [`${platform.toUpperCase()}_TT_LOOP_MODE`]: '0' },
      input: 'bad JSON', encoding: 'utf8' }));
    const result2 = invoke(f, platform, platform === 'claude' ? 'Write' : 'write_file', {
      [platform === 'claude' ? 'file_path' : 'path']: 'src/a.txt/child', content: '' });
    denied(result2, platform, 'INTERNAL_ERROR');
  }
});
test('oversize, non-UTF8, deeply nested and ambiguous JSON are refused', t => {
  const f = fixture(t);
  for (const platform of ['claude', 'hermes']) {
    for (const raw of ['x'.repeat(1024 * 1024 + 1), Buffer.from([0xff, 0xfe]),
      '{"tool_name":"Read","tool_input":{},"extra":' + '['.repeat(40) + '0' + ']'.repeat(40) + '}',
      '{"tool_name":"Read","tool_input":{},"__proto__":{}}'])
      denied(invoke(f, platform, '', {}, { raw }), platform, 'INVALID_PAYLOAD');
    denied(invoke(f, platform, platform === 'claude' ? 'Read' : 'read_file', {
      [platform === 'claude' ? 'file_path' : 'path']: 'file.docx' }), platform, 'UNSUPPORTED_READ');
  }
});
test('protect aliases into custom profiles, canonical roots and ordinary git directories', t => {
  const f = fixture(t);
  fs.symlinkSync(f.repo, `${f.dir}/root-alias`);
  fs.mkdirSync(`${f.repo}/profile`);
  fs.symlinkSync(`${f.repo}/profile`, `${f.repo}/profile-alias`);
  allowed(invoke(f, 'hermes', 'write_file', { path: 'ok.txt', content: '' }, {
    env: { HERMES_TT_REPO_PATH: `${f.dir}/root-alias` } }));
  denied(invoke(f, 'hermes', 'write_file', { path: 'profile-alias/x', content: '' }, {
    env: { HERMES_HOME: `${f.repo}/profile` } }), 'hermes', 'PROTECTED_PATH');
  fs.unlinkSync(`${f.repo}/.git`);
  fs.mkdirSync(`${f.repo}/.git`);
  allowed(invoke(f, 'hermes', 'write_file', { path: 'ok.txt', content: '' }));
  denied(invoke(f, 'hermes', 'patch', { mode: 'replace', path: '.git/hooks/x',
    old_string: 'a', new_string: 'b' }), 'hermes');
});
test('wrapper reaches packaged CLI for each platform and completion', t => {
  const f = fixture(t);
  for (const platform of ['claude', 'hermes']) {
    const env = { PATH: process.env.PATH, HOME: f.home,
      [`${platform.toUpperCase()}_TT_LOOP_MODE`]: '1', [`${platform.toUpperCase()}_TT_REPO_PATH`]: f.repo };
    const result = spawnSync('bash', [`${packageRoot}/hooks/tt-loop-guard.sh`, '--platform', platform], {
      cwd: f.repo, env, input: JSON.stringify({ tool_name: 'unknown', tool_input: {}, cwd: f.repo }), encoding: 'utf8' });
    denied(result, platform, 'UNSUPPORTED_TOOL');
    const complete = spawnSync('bash', [`${packageRoot}/hooks/tt-loop-completion-gate.sh`, '--platform', platform], {
      cwd: f.repo, env, input: '{}', encoding: 'utf8' });
    assert.equal(complete.status, platform === 'claude' ? 2 : 0);
    assert.match(complete.stderr + complete.stdout, /UNATTESTED_COMPLETION/);
  }
});
