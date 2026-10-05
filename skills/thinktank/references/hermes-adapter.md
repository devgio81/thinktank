# Hermes / Claude native adapter — V17

Read this before operating a product skill on Hermes. Host identity comes from the actual current
tool inventory/profile, never from a product filename or old `~/.claude` example. No tool becomes
available because these instructions mention it. Source of truth for Hermes capabilities:
https://hermes-agent.nousresearch.com/docs/user-guide/features/delegation and
https://hermes-agent.nousresearch.com/docs/reference/tools-reference . Check live docs/schema
when a field matters; do not hardcode a default worker count from an old example.

## Mapping

| Intent | Claude Code | Hermes |
|---|---|---|
| Load main engine | installed `skills/thinktank/SKILL.md` | `skill_view(name='thinktank')`, or active profile skill path |
| Read/search | `Read`, `Grep`, `Glob` | `read_file`, `search_files` |
| Execute verifier | `Bash` | `terminal` with explicit workdir |
| Edit owned artifact | `Write`, `Edit` | `write_file`, `patch` |
| Search evidence | `WebSearch`, `WebFetch` | `web_search`, `web_extract` if enabled |
| Domain worker | `Agent` with registered definition | real `delegate_task` with generated prompt/context/schema |
| Clarify | `AskUserQuestion` | actual clarification tool if present, otherwise chat |
| Progress | native task tools | available todo/task tools; do not invent TaskCreate |
| Review | separately spawned read-only checker | separately spawned leaf checker or independent human |

Claude `agents/*.md` definitions use its native frontmatter. Hermes has **no native Claude agents
registry**: installer copies those definitions as `skills/thinktank/references/domains/*.md`.
The parent reads the selected definition as **prompt data**, translates tool constraints to actual
available tools and performs the real delegation. `subagent_type: thinktank-backend` is not a
Hermes registration. Do not call `claude -p` or use Claude settings as the Hermes default.
Repository source definitions live in `agents/`; installed Hermes references preserve the filenames.

## Real delegation, not a pretend scheduler

The parent must verify `delegate_task` is actually exposed and authorized. Discover its current
schema; do not fabricate an invocation if absent. Typical native mapping when supported:

```text
delegate_task(tasks=[{
  goal: <task.prompt VERBATIM>,
  context: <structured task + canonical isolated worktree + language + budgets>,
  output_schema: <WORKER_OUTPUT_SCHEMA>,
  toolsets: <verified least-privilege host subset>
}])
```

This is an adapter sketch, not runnable JavaScript/Python and not an npm CLI capability. Only use
fields accepted by the live schema. Use the host's leaf role (no further delegation) and configured
cap. If the host cannot enforce tool restrictions, do not claim that the prompt is a sandbox.
Use a genuinely constrained session/container or refuse the unsafe assignment.

Prompter must be read-only: no terminal/code execution, file writers, delegation, skill editing or
mutating MCP capability. Toolset groups may be coarser than individual tools: if a host's `file`
group includes writes and cannot be narrowed, provide a frozen evidence pack and **no tools**
rather than claiming read-only enforcement. Workers get only task-needed capabilities. Broad
shell access is not constrained by a declared path list; isolated worktrees prevent collisions,
not escape from the host. Use OS-level isolation where the threat model requires it.

Native top-level Hermes delegation is asynchronous: retain handles, wait for final results, then
validate and verify. Failed/blocked prerequisites block dependent dispatch. Do not leave children
outstanding while claiming completion. Duplicate completion deliveries are possible; `joinResults`
deduplicates exact normalized replays, rejects contradictory replays. Children should finish bounded
background commands before returning; a process ID does not transfer process ownership to parent.

`validatePlan` and `dependencyLayers` only inspect a JSON contract and filesystem path shapes;
they do **not** call models, spawn agents, enforce permissions or execute acceptance commands.
`thinktank validate-plan --plan FILE` is mechanical validation, not an LLM run command.
The parent owns missing-result checks, semantic scope/goal review, actual dispatch and independent
acceptance. No automatic paid calls; host/model costs require existing user authorization.

## Profiles, hooks and unsupported corridors

Resolve active profile paths from the host/installer, including a supplied isolated home. Never
copy a user's installed personal skill or modify another live profile. Product source is distinct
from an active harness: an explicitly authorized interactive source edit does not authorize live
skill/config/hook edits. Paths in older references beginning `~/.claude` are Claude examples only.

Claude and Hermes hook protocols differ. Do not assume Claude `PreToolUse`, completion payloads or
`CLAUDE_TT_*` markers activate Hermes. Read the installed adapter and run its negative controls in
an isolated fixture before any unattended session. If activation/environment requirements or
interception coverage are unknown, stop and hand off — never guess marker names.

**Unsupported grant corridors are BLOCKED** on either host: no unattended push/merge/deploy/script
release merely because a grant document lists it. A refusal goes to the human with action, reason,
repo and verifier evidence. Do not rephrase, wrap or send via another tool to evade it. Interactive
human authorization is still subject to actual host controls, not converted into a bypass.
No schedule, increased depth/cap, secrets, network, spend or provider change can be added by a child.

Hooks are not OS sandboxes and not cryptographic checker identity. A checker record or `completed`
status is not proof of independence; parent verifies the actual separate context, final candidate
and executed evidence. Unknown effectful surfaces stay denied in unattended mode. If coverage
cannot be proved, there is no unattended launch. This reference promises no unimplemented corridor.

## Data boundary

Qdrant storage/embedding may be local, but retrieved text becomes **LLM context** and may reach
an external model provider. Web/notebook retrieval and model downloads also use networks.
Sanitize/minimize context, don't include grants/credentials/private customer data, and don't claim
that memory can never be an exfiltration path. Changing local model/storage policy is a human choice.
