# Codex runtime adapter

Read actual tool schemas before use. Capabilities can change between chats. This skill is
installed under `~/.agents/skills/thinktank-codex` by default. `--skills-dir` selects another
explicit discovery root, including `~/.codex/skills` on older Codex installations.
References resolve relative to that folder. Do not use Hermes home or Claude hook paths.

## Actual operations

| Need | Codex capability | Boundary |
|---|---|---|
| Local source search/read | `functions.exec` → `tools.exec_command`, `rg` first | Read only authorized relevant source |
| Local edit | `tools.apply_patch` or appropriate file tool | Current filesystem permissions apply |
| Real verifier | `tools.exec_command` or purpose-built tool | Inspect argv, cwd and effects before execution |
| Subagent | `collaboration.spawn_agent` | Direct tool call; not inside `functions.exec` |
| Coordination | `send_message`, `followup_task`, `list_agents`, `wait_agent` | Real messages/results, no inferred completion |
| Interruption | `collaboration.interrupt_agent` | Applies to delegated agents; user steering remains authoritative |
| Clarification | `functions.request_user_input_async` when available | Required answers stay pending; silence is not approval |
| Git worktree | available managed worktree tools or authorized local Git | Confirm resulting absolute path before assignment |
| Browser | available browser/computer-use tool and actual automation | Interactive observations cannot substitute for executable browser evidence |
| Memory/NotebookLM | discover actual MCP tools in inventory | Check schema, backend and provenance; no guessed calls |

Use available agent types, e.g. `default`, `explorer`, `worker`, relevant specialist. A file
named `thinktank-prompter.md` is prompt data, not a new registered `agent_type`.

## Fresh contexts and ownership

Start Prompter, domain worker and final checker with `fork_turns: "none"`, a self-contained
prompt and bounded evidence envelope. Default spawning inherits the conversation and therefore
violates the checker's separation from maker reasoning. Do not override the selected model
unless the user or applicable instructions require it.

For example, a Prompter uses `agent_type: "default"`, a stable `task_name`, `fork_turns: "none"`
and the supplied role prompt + exact evidence. After its result, parent validates the plan
and dispatches workers. Final checker also uses a fresh `default`/appropriate reviewer context;
avoid an agent that authored any candidate content or acceptance tests.

The current spawn API has no per-child tool allowlist, enforced read-only flag, JSON-output
schema or guaranteed leaf-depth setting. State no-writes/no-delegation as role instructions,
inspect actual artifacts and respect the shared sandbox. Do not call those instructions a
mechanical sandbox. A validator is a snapshot, not effect-time permission enforcement.

Default agents share the current filesystem. For concurrent writers, create distinct worktrees
when the repository supports them, assign exact absolute paths and disjoint scopes, and verify
those paths. Managed worktree creation can be asynchronous; wait for registration before use.
Never claim `create_worktree` copies uncommitted changes. Parent owns integration and reruns
checks on the final combined candidate. If isolation is unavailable, parent writes while
read-only specialists help. Explicit shared-workspace user choices take precedence; reflect
their actual weaker isolation and use disjoint ownership rather than claiming worktree isolation.

Every worker prompt states: "You are not alone in the codebase. Preserve others' edits,
adapt to concurrent changes, and edit only your assigned ownership. Do not delegate again."
Ownership changes require a new parent-approved contract, never a worker negotiation.

## Capacity and waiting

Read the current concurrency limit and active agents. Account for the parent and other live
children. The current session has four total slots, hence at most three children when none
else is active; this is observed configuration, not a portable permanent default.
Pass current capacity explicitly to validation/scheduling and batch larger plans. Reaching
the cap is not permission to raise it. Do not invent concurrency from sequential completion.

Spawning returns an identity, not completed work. Continue independent work, process actual
messages/final results, and await outstanding required agents before final reporting. Avoid
long blocking tool waits that prevent progress updates; use bounded waits and the current
communication requirements. A blocked prerequisite withholds its descendants.

## Authorization and unattended limits

User authorization persists within the task. Routine reversible local edits and review may
proceed within that scope. External messaging requires the user's explicit instruction under
the active session rules. Native app automation, schedules, publishing, force-push, destructive
operations and deployment use their actual approval and tool policies. Loading this skill is
not permission for any of them.

This bundle supplies neither a Codex launcher nor a proven tool-interception/completion hook.
Hermes `pre_tool_call` and Claude `PreToolUse` protocols are not Codex protocols. A grant file
does not create a supported corridor. Do not start an unattended run until actual host-specific
activation/interception/denial evidence exists, and never bypass a denial with another tool.
Prepare `.thinktank`/triage proposals only in the authorized project; no runtime/settings changes
are implied. Creating this skill interactively at the user's request is authorized skill work,
not an unattended self-modification exception.
