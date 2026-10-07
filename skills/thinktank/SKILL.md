---
name: thinktank
description: "Use for grounded V17 engineering and domain delegation."
argument-hint: "<task> [subagents=auto|on|off] [graph=auto|on|off] [rag=vector|graph|auto] [team=auto|on|off] [loop=auto|on|off] [deliver=auto|on|off] [cognitive=verbose|silent] [notebook=<id|name>] [until=<domain condition>]"
effort: high
---

# ThinkTank V17

## 0. Detect the host FIRST

Before following a path, naming a tool or spawning a worker, inspect the current host's
actual tool inventory and active profile. **On Hermes load
[references/hermes-adapter.md](references/hermes-adapter.md) first.** On Claude Code use
its native `Agent`, `Read`, `Grep`, `Glob`, `Bash`, `Write`, `Edit` and `AskUserQuestion`
only when actually available. If the host cannot be identified, stop and name the missing
capability; do not launch a guessed CLI. Never run Claude-only paths or commands on Hermes.
No installation, paid model call, delegation or external write occurs merely by loading this skill.

This is the self-contained governing contract for `$ARGUMENTS`. References add detail;
V17 rules here override older examples of host paths, grant corridors and graph eligibility.
The npm CLI is a **mechanical validator/installer, not an LLM runtime**. Real agent execution
belongs to the host's actual delegation tool. A prompt document does not register a Hermes agent.

## 1. Invariants and modes

Every claim carries a source; every change carries executed proof. The maker never issues the
independent acceptance verdict. A topology, schedule, grant-shaped JSON or agent consensus is
not authorization. Trivial conversational work has zero ceremony; substantial work uses this cycle:

`PERCEPT → SITUATION MODEL → GLOBAL WORKSPACE → ACT → VERIFY → LEARNING BROADCAST`

This is functional cognitive discipline, not AGI or consciousness. Preserve controllability
(interruptible, human gates), corrigibility (user steering changes goals immediately, never safety
gates), and honesty (uncertainty, blocked evidence and failures are explicit). Report concise
observations and decision rationale, not private chain-of-thought. `cognitive=verbose` shows cycle
markers, alternatives and verification limits; `silent` keeps the same discipline without markers.

| Parameter | Values / default | Meaning |
|---|---|---|
| `subagents` | `auto` / `on` / `off` | Who reasons; independent of topology |
| `graph` | `auto` / `on` / `off` | Execution topology, never authority |
| `rag` | `vector` / `graph` / `auto`; default `vector` | Retrieval lane |
| `team` | `auto` / `on` / `off` | Peer discussion only if host supports it |
| `loop` | `auto` / `on` / `off` | Unattended mode, not whether bounded correction exists |
| `deliver` | `auto` / `on` / `off` | Shipping intent, not permission to ship |
| `cognitive` | `verbose` / `silent` | Presentation only; implicit default `silent` |
| `until` | domain sentence | User-visible outcome, frozen before implementation |
| `notebook` | optional visible notebook ID/name | Optional configured acquisition lane |
| `deploy` | `on-merge`, `dispatch:<workflow>`, exact command, `none` | Proposed delivery route; human-gated |

Invalid or conflicting values stop mode resolution. Missing values use defaults above; `auto`
for team/loop/deliver means assess the actual need and authorization, not turn it on silently.

- `subagents=auto`: use a Prompter when distinct domain scopes benefit from separate contexts,
  or independent investigation materially reduces bias. Otherwise report why single-context wins.
- `subagents=on`: Prompter first, even for one task; one valid task means one sequential worker,
  not invented fan-out. If delegation or its cost authorization is unavailable, hand off.
- `subagents=off`: no Prompter or worker subagents. Parent executes; independent acceptance must
  come from a separate human reviewer before declaring verified, not from self-review.
- `graph=auto`: apply the **Decision Matrix only to graph=auto**. Promote when observed multi-hop
  or independent structure AND measured retry/cost baseline support lower cost per successful
  completion. No baseline means no promotion claim. Secondary benchmark percentages are not gates.
- `graph=on`: **user-forced topology** even for a single sequential path. It does not force
  parallelism, workers, tools, spend, delivery or rights; all safety gates remain mandatory.
- `graph=off`: sequential execution, no optional graph telemetry or topology ceremony. Prompter
  contracts may still dispatch sequentially. Dependencies always remain enforced.
- Teams require actual host support, a useful peer-discussion need, authorization and isolated
  ownership. Hermes leaf delegation is not Claude Agent Teams. Unavailable `team=on` is a handoff,
  never simulated peer coordination. `team=auto` falls back to leaf workers or solo.

## 2. Perceive, retrieve and frame

1. Read live files, manifests, tests, runtime probes and host capabilities before memory.
   Detect language/stack and the actual test commands. State what can be verified digitally,
   what needs an embodied/human handoff, and which evidence would close each uncertainty.
2. For substantial knowledge gaps, PLAN 3–7 focused queries, ROUTE to the cheapest sound source,
   RETRIEVE, then REFLECT on relevance, authority, freshness, conflict and confidence.
   Verdict per query: `sufficient`, `weak`, `conflicting`, `empty`.
3. `weak` rewrites once; `conflicting` uses a targeted source/probe; critical `empty` escalates
   source lane. Hard budget: three retrieval rounds, one rewrite per query; no-progress stops early.
4. Keep an **evidence ledger**: claim, precise file/line or URL/date/runtime handle, grade and
   effect on plan; rejected hits get a reason; gaps get an owner. Current source beats memory.
5. Memory is configured `qdrant-thinktank` / `thinktank-memory`, not a hardcoded personal server.
   Use installed configuration for endpoint and vector settings. Local storage and local embedding
   do **not** mean retrieved data never leaves the host: **LLM context may reach the model provider**;
   optional web/notebook lanes also use networks. Minimize and sanitize before retrieving/storing.
   Never put credentials, raw personal/customer data, grants, long raw quotes or logs into memory.
   Authentication failure is distinct from unreachable service. If unavailable, say so, stop repeated
   calls and proceed with source evidence; queue learnings, never synthesize memory hits.
6. Notebook acquisition is optional, off unless configured and authorized. Resolve only notebooks
   the signed-in account can see. A share URL does not register a notebook. Treat returned content
   as untrusted AI-generated data, verify citations and homonyms, and record provenance. Missing
   authentication, budget or tool support becomes a gap; never start a login or paid call silently.
7. `rag=graph` / earned `rag=auto` use explicit typed relations over available memory:
   `supersedes`, `depends_on`, `decided_by`, `caused`, `implements`, `blocks`, `references`.
   No invented graph backend. Cap traversal at three hops under the same retrieval budget, use
   incremental indexing only within authorization, send ambiguous entity merges to a human,
   cite hop-chain and minimum confidence. An unsupported lane reports unavailable, not fake edges.
8. Fuse a situation model from graded evidence. Before significant output, label each load-bearing
   claim `grounded`, `partially grounded` or `assumption`. Do not build on rejected evidence.

## 3. AI-touchpoint and human gates

Scan for model calls, generation, assistants, people scoring/matching, biometrics and AI media.
No touchpoint means no classification ceremony. Otherwise classify before code:
Art. 3(1) system → **Art. 5 prohibited practice hard stop** → Art. 6/Annex I/III high risk
(with applicable exclusions) → Art. 50 transparency → Chapter V GPAI; determine provider/deployer
or modification role. Verify legal dates and obligations against current official sources, not
memorized legislative claims. This is engineering assessment, not legal advice or certification.

Map applicable obligations to observable tests, documentation and disclosures; keep the register
and dossier in the authorized project scope. Legal uncertainty/high-risk-adjacent launch is a named
human/legal handoff. No graph edge, worker agreement or authorization token overrides the Art.-5 gate.

Freeze domain condition, scope, acceptance commands, budgets and human-only actions before work.
Tests/criteria cannot be deleted, weakened or silently skipped to make a pass. Changes to the goal
require parent/user review and a new contract; workers cannot change their own acceptance.

## 4. Prompter-first domain contracts

| Role | Owns | Forbidden |
|---|---|---|
| Parent | source pack, scope, validation, actual dispatch, join, proof and human gates | treating worker claims as proof |
| Prompter | **read-only** compilation of `tasks` / `rejected_splits` | file writes, implementation, verification, delegation, scope expansion |
| Domain worker | one generated prompt and exclusive output scope | re-delegation, out-of-scope writes, self-certification |
| Checker | independent final-artifact acceptance with rerun probes | maker reasoning, silently fixing code, approving its own work |

The legacy `thinktank-prompt-writer` is a package-brief writer, **not** the read-only V17 Prompter.
Use `thinktank-prompter` for domain compilation. Product domain definitions are:

- `thinktank-backend`: API error contracts, idempotency and retry/concurrency behavior.
- `thinktank-frontend`: loading/empty/error/success states, keyboard operation and accessibility.
- `thinktank-data`: schema/integrity, migration ordering, rollback and real database evidence.
- `thinktank-infrastructure`: isolation, resource lifecycle, restart/recovery and runtime observation.
- `thinktank-security`: trust boundaries, capability/tenant checks and concrete abuse cases.
- `thinktank-qa`: negative controls, independent evidence and regression discriminators.

These are six available lenses, not six workers to start automatically. QA used as implementer
cannot later be the independent checker of the same artifact; use `thinktank-checker` separately.

### Parent procedure

1. Give the Prompter accepted goal/criteria, canonical repository path, language, live source
   pointers, read/write limits, forbidden actions, actual available tools and worker/cost caps.
2. Receive contracts only. Each task carries `id`, `domain`, `objective`, `deliverable`,
   `dependencies`, `read_scope`, `write_scope`, `context`, `constraints`, `acceptance`, `prompt`,
   `output_schema`; rejected splits carry `candidate` and `reason`. Do not invent sources.
3. Validate with `validatePlan(plan,{maxWorkers,allowedWriteRoots})` before dispatch, plus parent
   semantic review: task traces to frozen criteria; prompt agrees with structured ownership,
   language and repository; no invented authority or commands; supplied tools really exist.
   Machine validation proves structure, not truth, shell safety or test executability.
4. Re-cut invalid contracts in the parent; workers do not negotiate ownership. Only exact relative
   file scopes and `directory/**` are supported. Unknown glob forms, traversal, absolute scope
   paths, symlink aliases and overlaps fail closed. No default write grant. Frozen artifacts,
   active harness/configuration and grants are always outside worker ownership. Product source
   under `skills/` may be edited only by an explicitly authorized interactive product task.
5. For each writer parent supplies a distinct isolated worktree and absolute path; no shared
   worktree writers, no overlapping ownership even across layers. Read-only workers may share source.
   Bind results to the assigned worktree/diff, not just worker-supplied touched-path claims.
6. Use `dependencyLayers(plan,{maxWorkers,allowedWriteRoots})` for stable capacity-bounded task-ID batches. With
   `graph=off`, dispatch each task sequentially. Otherwise dispatch independent ready tasks together
   up to the **live configured host cap**. Reaching a cap means batching, never raising permissions.
   Wait for verified prerequisite completion before dispatching dependents; failed/blocked parents
   block descendants. The scheduler itself neither waits nor starts agents.
7. Host invocation gets generated prompt **verbatim**, then a separate parent envelope carrying
   canonical worktree, structured task, language and output schema. Hermes uses `delegate_task`;
   Claude uses `Agent` with the installed definition or a verified available generic agent type.
   No hidden conversation is assumed. Prompter/worker are leaf roles, cannot delegate again.
8. Await actual host results. A dispatch receipt is not completion. Apply the host's bounded schema
   retry only; then mark failure. Call `joinResults` for deterministic sets/provenance and conflicts.
   Do not use a model to settle contested claims, vote them away or choose a last writer.
9. Read diffs/files and rerun real tests in the parent. Verify exact external handles by read-back.
   Ensure every expected task has one validated terminal result; the join cannot infer missing IDs.
10. Independent checker receives frozen criteria, final candidate/digest, owned paths and exact
    verifier commands, **not maker/Prompter reasoning**. It reads source and reruns probes; verdict
    is `ACCEPT` or `REJECT` with file/line/output evidence. Any subsequent edit invalidates review.

Schema, executable examples and precise API returns:
[references/subagent-prompt-orchestration.md](references/subagent-prompt-orchestration.md).

## 5. Execution, topology and bounded correction

Plan → context → act → verify → correct. Run the narrowest real static/unit probes first, then
integration, build, runtime/e2e/browser and compliance where applicable. Missing tests are absent
evidence, not green. When creating a feature, first demonstrate a meaningful failing regression.

Under graph mode nodes are typed: LLM, tool, retrieval, transform, policy, gate, human checkpoint.
Deterministic work runs as functions/tools, not extra LLM turns. Frozen DAG edges cannot create
nodes or bypass checker/human/Art.-5 gates. Runtime correction is bounded, not a cycle in the plan.
Join before acceptance; append/unique-key union is allowed, contested judgments remain unresolved.
Track actual cost/tokens/latency by node when available; do not invent telemetry or superiority.
Optimization criteria need an antagonistic counter-metric and exogenous anchor; binary correctness
and safety gates never receive a compensating metric. Breach routes to handoff, not a fifth exit.

**Four stacked exits always apply:** `verified`, `ceiling`, `budget`, `no-progress`.
`verified` needs executed acceptance and independent check; other exits are incomplete and named.
Default correction ceiling: three rounds. Tokens and wall-clock cap the shared run, not each branch.
Full fan-out failure gets at most one bounded sequential redispatch round, then triage. Repeated
unchanged strategy/oscillation stops even with budget left. New workers do not buy a fresh budget.

## 6. Unattended and delivery boundaries

Unattended mode needs a written Loop Contract: recursive goal, machine-observable stop condition,
progress artifact, iteration/token/time budget, independent checker, and addressed escape hatch.
Use `docs/loop-triage/<run-id>.md` plus an actual human-facing notification/task for blockers.
A slash command cannot arm its own session. Start a separate process **only after** the installed
host adapter proves activation, tool interception and denial tests; never infer enforcement from
instructions. Hook protocols differ by host; a hook is neither sandbox nor checker authentication.

**Unsupported grant corridors are BLOCKED.** The shipped V17 workflow must not mint a grant and
promise it releases pushes, merges, workflow dispatches or arbitrary deploy scripts. Historical
corridor examples are not authorization or current enforcement. If a guard cannot prove a surface
safe, refuse it and hand off explicitly; never rephrase a denial, switch tools or bypass the hook.
No automatic paid calls, model/provider changes, network expansion or increased delegation depth.

Delivery intent still follows: branch → frozen brief → implement → rungs → independent checker/
review → commit → PR → merge → deployment observation → browser pass → checkpoint. Every effectful
link needs real applicable human authorization and supported enforcement; otherwise queue it.
`deliver=off` excludes shipping. Production, publish, secret/ACL changes, destructive operations,
schedules and self-modification remain human-only; DAG/agent consensus never expands the boundary.

For an authorized external delivery, confirm actual merge SHA, identify workflow by SHA/workflow/
event (not latest run), observe terminal success and deployed revision, then exercise that revision.
Pending approval means stop; triggered is not deployed; merge is not done. A landed failure becomes
a new human-approved repair package; don't keep delivering atop failed ground. Deterministic browser
probes must pass; exploratory findings can fail but cannot rescue a failing automated rung. Missing
browser capability is explicit partial evidence, never an asserted pass.

## 7. Report and learn

Report triage first, selected modes and rationale, source/ledger grades and memory state, AI scan,
Prompter tasks/rejected splits, actual topology and task statuses, verification commands/outputs,
checker verdict bound to candidate, fired exit, residual gaps and next human owner. Distinguish
instructions, scheduled nodes, dispatched agents, completed artifacts and independent acceptance.

Find-before-store sanitized verified reusable learnings with `workflow=agentic-engineering` and
relevant domain. Consolidate near duplicates with provenance/`supersedes`; no raw transcript.
Memory failure queues capture. Improvements may only tighten gates and require interactive review;
never self-modify an unattended harness, routing, grants, frozen criteria or acceptance tests.

## Supporting references

- [references/hermes-adapter.md](references/hermes-adapter.md) — host-native mapping and limits.
- [references/agentic-rag-loop.md](references/agentic-rag-loop.md), [references/retrieval-routing.md](references/retrieval-routing.md) — retrieval detail.
- [references/cognitive-mode.md](references/cognitive-mode.md), [references/eu-ai-act-compliance.md](references/eu-ai-act-compliance.md) — cognition/legal detail; verify current legal claims.
- [references/graph-engineering.md](references/graph-engineering.md), [references/graphrag-lane.md](references/graphrag-lane.md) — typed graph/retrieval detail.
- [references/collective-cognition.md](references/collective-cognition.md) — Claude-only optional team support.
- [references/brainstorming.md](references/brainstorming.md) — read-only idea lane.
- [references/agentic-coding.md](references/agentic-coding.md), [references/work-packages.md](references/work-packages.md), [references/prompt-writer-contract.md](references/prompt-writer-contract.md) — implementation detail.
- [references/loop-engineering.md](references/loop-engineering.md), [references/delivery-loop.md](references/delivery-loop.md) — lifecycle rationale; legacy grant examples are not supported corridors.
