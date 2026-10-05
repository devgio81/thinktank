# V17 Guard — conservative tool policy, not a sandbox

## Registration contract

Register the installed **full runtime**, not a symlink into an npm cache and not
an isolated copy of the Bash wrapper:

```text
node <stateDir>/runtime/src/guard/cli.mjs --platform claude
node <stateDir>/runtime/src/guard/cli.mjs --platform hermes
```

Claude: synchronous `PreToolUse`, `matcher: "*"`, command above.
Hermes: `hooks.pre_tool_call`, `matcher: ".*"`, command above,
`fail_closed: true`, a bounded timeout (e.g. 10 seconds). Do not install this as
a gateway observer or feed it the Python plugin `args` envelope. Do not change
approval settings, `hooks_auto_accept`, or consent allowlists automatically.
Operator consent and actual hook dispatch must be verified on the target host.

Optional completion endpoint: append `--event completion`, register only as
Claude `TaskCompleted` or Hermes `pre_verify`. The parent installer currently
registers only the tool guard; therefore completion enforcement is **not**
installed just because the guard is installed. `pre_verify` is a bounded
continuation mechanism, not a durable human approval/termination barrier.

The Bash wrappers reach the same CLI relative to the package. With no flags they
retain the historical Claude default; Hermes must pass `--platform hermes`.
A wrapper copied alone to `~/.claude/hooks` no longer works: replace the old
registration with the full-runtime command above.

## Activation and authority

Only `CLAUDE_TT_LOOP_MODE=1` or `HERMES_TT_LOOP_MODE=1` activates its selected
platform. Neither flag activates the other platform. Healthy inactive CLI calls
return `{}` without reading stdin, policy files, grants, or the filesystem.
The installer must **not** arm this flag in persistent profile configuration.

For an explicitly gated new process the human launcher also supplies the
absolute `CLAUDE_TT_REPO_PATH` / `HERMES_TT_REPO_PATH`, identifying one existing
repo/worktree containing `.git`. Missing, relative or unresolvable root is a
denial. Never derive it from tool arguments, payload `cwd`, grant content,
agent output, or mutable process working-directory discovery. Launch environment
and registered runtime must remain outside agent control. A newly launched
process with forged environment is not authenticated by this hook.

The real hook process cwd must match payload cwd and remain inside the root.
Hermes `terminal.workdir` may narrow it to an existing in-root directory, not
widen it. Missing payload cwd uses the hook process cwd, which is still checked.
This intentionally blocks remote/container tool backends whose filesystem/cwd
cannot be identified with the hook host: do not claim these are supported.

Protected roots: `$HOME/.hermes`, `$HOME/.claude`, `HERMES_HOME`, `CLAUDE_HOME`,
`CLAUDE_CONFIG_DIR`, both platform `*_TT_GRANT_DIR`, `*_TT_CHECKER_DIR` and
`*_TT_STATE_DIR`. Custom installed profiles/state outside defaults must be named
by those **launcher environment** variables, not tool arguments. Existing
symlink parents and missing leaves are resolved component-by-component before
boundary checks. The current runtime `src/guard` and `hooks` are protected too.

All `.git`, `.hermes`, `.claude`, `.thinktank`, `loop-grants` and `loop-checker`
segments are reserved; linked-worktree gitdir/commondir paths and aliases are
protected. `CLAUDE.md`, `AGENTS.md`, settings files, `.mcp.json` and keybindings
cannot be written. Regular single-link files only: no devices, directories,
hardlinked files, dangling/cyclic symlinks or ambiguous path syntax. Product
`hooks/` and `skills/` inside a separate authorized repository are editable;
these names alone do not imply an installed harness.

## Small allowlist and deliberate incompatibilities

| Platform | Supported operations |
| --- | --- |
| Claude | Scoped `Write`, `Edit`, `MultiEdit`, text `Read`, `Grep`, `Glob`; structurally checked `TodoWrite`; exact `pwd` forms and human-pinned verification; opt-in built-in leaf `Agent` |
| Hermes | Scoped `write_file`, replacement/strict multi-file V4A `patch`, text `read_file`, `search_files`; read-only `skill_view`/`skills_list`, structurally checked `todo`; exact `pwd` forms and human-pinned verification; opt-in leaf `delegate_task` |

Unknown input keys and wrong types are denied. No cross-profile override,
background shell, PTY or sandbox-disabling flag. Rename/Move patches and other
patch formats are unsupported. Non-text document reads are blocked to avoid
implicit converter/plugin execution. Search paths and literal glob prefixes use
the same canonical boundaries. Globs are relative, non-hidden source patterns,
without braces, extglob or traversal; no custom search flags/commands are accepted.
Recursive search requires the trusted host implementation to respect scope,
exclude protected/hidden metadata and not follow symlinks. This preflight cannot
rewrite a host's result set or intercept its traversal. Installed skill content
and the host skill resolver are trusted read-only sources: simple names and
relative references/templates/scripts/assets paths only, never plugin dispatch.
Skill modification and unknown read/search tools remain unsupported.

**All git commands are intentionally denied**, including `status`, `diff` and
`log`: environment, fsmonitor, pager, textconv, aliases, external diff, config
includes and helpers make apparent reads an execution surface. This version
has no trusted executor to sanitize that environment and rewrite argv. The
same applies to arbitrary interpreters, package/release runners and repository scripts.
Tool `write_file`/`patch` implementations themselves can run host lint checks;
those host implementations and binaries are trusted prerequisites, not code
this guard intercepts. The two exact `pwd` forms still assume a trusted shell
without startup hooks, malicious functions or PATH substitutions.

No network/outward tool, browser/desktop tool, MCP (including apparently read-only
MCP), scheduling, subprocess-control, arbitrary `browser_exec`,
`execute_code`, `computer_use`, `setup_mcp`, skill modification or dynamic tool
wrapper is allowed. Unknown names never inherit read permission from a prefix,
verb, claimed action, or description. All historical never-grantable actions
remain denied; stricter denials are intentional.

### Human-pinned verification and leaf delegation

The selected platform's `HERMES_TT_VERIFY_COMMANDS` / `CLAUDE_TT_VERIFY_COMMANDS`
is a human-supplied JSON array of **exact complete commands**, snapshotted from
the hook launch environment; absent or `[]` denies verification by default.
Malformed configuration denies with `TT_GUARD_TRUST_CONFIGURATION`.
Supported grammar: `npm|pnpm|yarn test`, `npm|pnpm|yarn run test|build|check|lint|typecheck`,
or `node --test` optionally followed by literal relative `.js/.mjs/.cjs` paths.
Example value: `["npm test","npm run build","node --test tests/guard.test.mjs"]`.
Only the immutable root is accepted as both process/payload cwd and execution
workdir. No command normalization, globs, env assignment, chaining, wrappers,
path/global flags, background execution, outward verbs or release commands.
Payload/env fields, grant files and the other platform's settings cannot grant
permission. Runtime exports and self-launched tools remain denied.

**This is not a sandbox:** even `npm test` can run arbitrary lifecycle scripts,
and an agent can edit test/build inputs. Human-pinned commands authorize that
execution risk, not the safety of script contents. Require a separately isolated
OS environment with constrained network/credentials/filesystem and trusted
binaries, PATH, startup files and immutable launch settings. Never source pins
from the repository, agent payload, output, mutable config or environment exports.

Delegation additionally requires the exact selected launch flag
`HERMES_TT_ALLOW_DELEGATION=1` / `CLAUDE_TT_ALLOW_DELEGATION=1` (default deny).
Hermes accepts `{goal, role:"leaf", context?, output_schema?}` (bounded object schema data) or a `tasks` array of 1–8 such
objects. Claude accepts only `{prompt, description, subagent_type:"general-purpose"}`;
the built-in host Agent is assumed leaf-only. No tools/toolsets, env, provider,
model, orchestrator role, resume, background, isolation or custom-agent override.
Child hook inheritance, immutable settings and actual host leaf enforcement must
be verified externally before enabling this flag. Prompt text cannot enforce
leafness, and this hook does not authenticate a child or a mutable host runtime.

### Grants and completion — human handoff, not an incomplete green corridor

**No grant release corridor is supported.** This includes feature-branch push,
PR create, PR merge/budgets, local allowlisted deploy commands and workflow
launches; also commits, migrations, registry publication, force operations,
schedules, or any unsupported execution/tool. `TT_GUARD_UNSUPPORTED_EXECUTION`
or `TT_GUARD_UNSUPPORTED_TOOL` names the unsupported class and `HUMAN_HANDOFF`.
A well-formed, future-expiring or purportedly human-signed grant is never read,
and no counter is mutated. Legacy grant files cannot widen the policy.

The completion endpoint always emits `TT_GUARD_UNATTESTED_COMPLETION` while
armed. `EXIT`, `ACCEPTANCE`, `EVIDENCE`, a run ID or a checker-shaped file cannot
prove independent checker identity. This package has no safe attestation
verifier. Request human review outside the gated run; never forge a checker
record or silently disable the guard to finish. This conservative implementation
cannot perform a complete unattended release/completion chain. Pinned tests and
opt-in leaves do not authorize delivery or independently certify completion.

## Wire behavior and error containment

Tool stdin requires one bounded UTF-8 JSON object (1 MiB, 3 seconds) containing
nonempty string `tool_name` and object `tool_input`. Both **shell** protocols use
`tool_input`; Claude tools use `file_path`, Hermes tools use `path`. Optional
`hook_event_name` must be `PreToolUse`/`pre_tool_call`; metadata types and nested
structure are checked. Envelope extension metadata cannot confer authority.

- Normal allow/no-op: `{}`, exit 0, no stderr; never an explicit auto-approval.
- Claude deny, exit 0: `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"TT_GUARD_…: … HUMAN_HANDOFF: …"}}`.
- Hermes deny, exit 0: `{"decision":"block","reason":"TT_GUARD_…: … HUMAN_HANDOFF: …"}`.
- Claude completion deny: exit 2, reason on stderr, empty stdout.
- Hermes completion deny: `decision=block`/`reason` on stdout, exit 0.
- Unknown CLI platform/options: exit 2, generic block JSON and stderr diagnostic.
- Caught policy/import errors: platform denial `TT_GUARD_INTERNAL_ERROR` and
  sanitized stderr. Inputs, commands, grant contents and secrets are not echoed.

A functioning inactive guard stays inert. **A broken guard with Hermes
`fail_closed: true` can block even an interactive, non-loop session**: failure
happens before the guard can report its no-op. Repair or removal is a human
operation, not a tool permission bypass. Older Hermes versions which ignore the
flag are **unverified/unsupported for a fail-closed claim**. Test the actual host
registration and crash path before gated use. Docs describe code-2 blocking and
fail-closed handling, but unregistered/unapproved hooks, safe mode, other plugin
mutations, pre-runtime failures or host regressions remain outside this code's
control. A hook alone is not a sandbox or a cryptographic authorization system.

Filesystem checks are preflight, not atomic capability-enforced writes. Symlink
replacement/rename/mount races between check and use (TOCTOU), a compromised host,
custom tool implementations, future tool schema changes and later host argument
rewrites require external confinement and host-level verification. Credentials,
network and code execution must be constrained outside this policy if strong
isolation is required. No production security certification is claimed.

## Evidence and reproducible gates

Baseline `e660e05654f04c88ab3bb1c475264b7973f0a98b`:
`hooks/tt-loop-guard.sh:38` activated Claude only; `:91-103` checked raw paths;
`:119-129` let unrecognized non-Bash tools through. The old completion gate
`:19-21` acknowledged it could not distinguish checker from maker yet accepted
three record fields. Regression tests replace those assumptions.

Primary protocol references (consulted during implementation):
- https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks#shell-hooks
- https://code.claude.com/docs/en/hooks

```sh
node --test tests/guard*.test.mjs
node --check src/guard/cli.mjs && bash -n hooks/tt-loop-guard.sh && bash -n hooks/tt-loop-completion-gate.sh
git diff --check && git diff --name-only && git ls-files --others --exclude-standard
```

Tests use disposable linked-worktree-shaped fixtures under `tests/`, explicit
isolated HOME/profile paths, real CLI/wrapper subprocesses, both wire formats,
negative paths, unsupported execution and forged authority records. They do not
run adversarial payload commands or install/edit a live user profile. These are
policy/protocol tests, not proof of target-host hook registration or sandboxing.
