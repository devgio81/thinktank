---
name: tt-loop
description: "Use to prepare a bounded V17 unattended delivery proposal."
argument-hint: "<goal> until=<domain condition> [subagents=auto|on|off] [graph=auto|on|off] [rag=vector|graph|auto] [deliver=auto|on|off] [dir=<path>]"
effort: high
---

# /tt-loop — gated V17 run preparation

First load [../thinktank/SKILL.md](../thinktank/SKILL.md), detect the host, and on Hermes load
[../thinktank/references/hermes-adapter.md](../thinktank/references/hermes-adapter.md).
Apply the complete cognitive/evidence/AI-touchpoint/independent-checker contract to `$ARGUMENTS`.
This is a skill workflow, **not an executable npm agent runtime** and not a blanket grant launcher.

## Refuse before launch

- A one-off task, changing subjective goal or absence of real verification stays interactive.
- **Unsupported grant corridors are BLOCKED.** Do not mint a grant that promises unattended
  pushes, merges, workflow dispatch or arbitrary scripts. Historical delivery examples do not
  override the installed guard. Queue unsupported actions for the parent/user.
- No separate process until actual host hook activation, denial behavior and isolated workspace
  are verified. A slash command cannot arm its own session. Never silently alter profiles/hooks.
- A schedule, user-supplied JSON or agent consensus is not authorization. No automatic paid calls.

## Prepare the bounded contract

1. Read repo, stack, tests and deployment evidence. Freeze `until=` verbatim and map every clause
   to exact commands and expected outcomes; name every human-only/embodied verification handoff.
2. Execute the proposed gate before implementation: real failing behavior is a valid red baseline;
   a missing executable/environment is absent evidence, not a pass. If already green, report it
   instead of launching unnecessary work. Do not weaken tests or criteria.
3. Set `subagents=auto|on|off` independently from `graph=auto|on|off`:
   - `subagents=on`: read-only Prompter first, even if it yields one sequential task.
   - `subagents=auto`: delegate only when distinct domain contexts help.
   - `subagents=off`: parent implements; independent human review is still required.
   - Decision Matrix applies **only to graph=auto**; no measured cost baseline means no promotion.
   - `graph=on`: user-forced topology; no forced parallelism or new rights.
   - `graph=off`: sequential dispatch; dependencies remain enforced.
4. Freeze work packages with source pointers, dependencies, exact exclusive ownership and runnable
   acceptance. Domain Prompter returns contracts only. Parent runs `validatePlan` with explicit
   allowed roots, then capacity-bounded `dependencyLayers`; do not confuse validation with dispatch.
5. Prepare Loop Contract in the approved repo: goal, stop condition, progress artifact, budget
   (three correction rounds plus tokens/time), independent checker, addressed escape hatch.
   Triage needs both an artifact and an actual human-facing report/task.
6. For permitted unattended local work, require the operator to establish the host-specific
   launch environment and scope controls documented by the installed guard. If any interception
   or capability limit cannot be verified, **do not launch**; return the exact missing prerequisite.
   Do not translate Claude environment markers into guessed Hermes equivalents.

## Execute only within verified capability and authorization

The parent uses its real host tools: Prompter → plan validation → isolated leaf workers →
deterministic join → parent source/test verification → independent checker. Frozen criteria,
generated prompts, canonical worktree, language and schema must reach each child explicitly.
No child delegates, certifies itself, changes the plan or touches another worker's scope.
Await actual asynchronous results and block descendants of failed prerequisites.

Shipping intent does not release effects. The chain is branch → brief → implementation → rungs →
checker/review → commit → PR → merge → deploy observation → browser verification → checkpoint.
Each unsupported/unauthorized step is a named human handoff, not something to work around.
`deliver=off` stops before shipping. Production, publish, secret/ACL changes, schedules and harness
self-modification remain human-only. Never reword a denied action to evade the guard.

Graph nodes remain typed; functions and tests run as tools, not extra LLM turns. Routes cannot
skip checker, human gates or Art.-5 hard stop. Full fan-out failure permits one bounded sequential
retry, then triage. All branches share the same budget.

## Finish honestly

Four exits: `verified`, `ceiling`, `budget`, `no-progress`. Only independent acceptance plus real
proof can support `verified`; the other exits retain explicit incomplete work. Report triage first,
selected modes, task statuses, real commands/output, checker verdict bound to final artifact,
blocked corridors and their human owner. A dispatched child, trigger receipt, merge or green CI
alone is not completed delivery. Read back external state and verify deployed revision if any
human-authorized delivery occurred. Missing browser evidence stays missing.

Details: [../thinktank/references/subagent-prompt-orchestration.md](../thinktank/references/subagent-prompt-orchestration.md),
[../thinktank/references/loop-engineering.md](../thinktank/references/loop-engineering.md),
[../thinktank/references/delivery-loop.md](../thinktank/references/delivery-loop.md).
