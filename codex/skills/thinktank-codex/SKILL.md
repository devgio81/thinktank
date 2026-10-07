---
name: thinktank-codex
description: "Grounded engineering with Prompter-first domain delegation, deterministic plan validation and independent review. Use for substantial cross-domain implementation, debugging, architecture or explicit ThinkTank V17 requests."
metadata:
  version: "17.1.0-codex.1"
  source: "@devgio81/thinktank 17.1.0; Codex adapter"
  harness: "codex"
---

# ThinkTank V17 for Codex

V17 preserves evidence-led retrieval, the cognitive cycle, AI-touchpoint assessment,
bounded correction, independent acceptance, work packages and graph safeguards. Its addition
is a **read-only Prompter** that compiles accepted goals and live source evidence into precise
domain-worker contracts before implementation delegation.

This is a self-contained Codex port. Read [the Codex adapter](references/codex-adapter.md)
before delegation or delivery. Supporting documents are instructions and prompt data;
they do not register agent types, install hooks, enable a runtime or grant authority.
Apply the current user/repository rules and actual tool schemas ahead of older source examples.
Loading the skill does not start agents or an unattended process.

## Modes and proportionality

Trivial edits and conversation have zero ceremony. Engage for substantial cross-domain work,
ambiguous debugging, architecture, migrations, security, performance, complex web work or
explicit V17 requests. Run only the parts needed to prove the requested outcome.

Supported invocation: `$thinktank-codex <task>` with optional parameters below. These are
instructions parsed from the request, not a separately registered slash-command runtime.

| Parameter | Default | Meaning |
|---|---|---|
| `subagents=auto|on|off` | `auto` | Prompter and implementation delegation |
| `graph=auto|on|off` | `auto` | Optional executable topology; eligibility still required |
| `rag=vector|graph|auto` | `vector` | Evidence retrieval lane |
| `team=auto|on|off` | `auto` | Useful peer coordination when the actual host supports it |
| `loop=auto|on|off` | `auto` | Unattended mode, never ordinary bounded correction |
| `deliver=auto|on|off` | `auto` | Delivery intent, never permission to ship |
| `cognitive=verbose|silent` | `silent` | Presentation only |
| `until=<condition>` | derive from request | Observable user outcome |
| `notebook=<id|name|url>` | configured library | Per-invocation acquisition source |
| `deploy=on-merge|dispatch:<workflow>|<exact command>|none` | assess project | Proposed delivery route |

Reject invalid/conflicting explicit values before dependent work. Existing authorization
persists; ask only when missing information or approval is actually needed.

- `subagents=auto`: Prompter first when distinct domain scopes benefit from context isolation
  or independent investigation materially reduces bias. One useful task is allowed; do not
  invent fan-out. Otherwise execute in the parent without delegation ceremony.
- `subagents=on`: invoke the Prompter first, then dispatch each valid task. One task is sequential.
  An empty/invalid plan is a handoff or bounded correction, never an invented worker.
- `subagents=off`: parent performs implementation; no Prompter or domain workers. An independent
  checker still reviews non-trivial work. If the user prohibits *all* subagents, a human reviewer
  must supply that independent decision; report the evidence as incomplete until then.
- `graph=on` requests eligibility assessment; it cannot override the current AGENTS Decision
  Matrix. Both `on` and `auto` require proven structure, measured pass/cost evidence and projected
  lower cost per successful completion. Missing baseline means ordinary execution. `off` omits
  an explicit graph but still enforces task dependencies and supports useful ordinary subagents.
- `team=auto` uses real Codex collaboration when useful. Do not equate it with Claude's team
  runtime. An unavailable explicit mode is a named capability gap, never simulated execution.
- `loop=auto` and `deliver=auto` assess intent and capabilities. Neither starts unattended work,
  creates a schedule, broadens permissions or ships code by itself.

## Evidence, scope and classification

Use `PERCEPT → SITUATION MODEL → GLOBAL WORKSPACE → ACT → VERIFY → LEARNING BROADCAST` as
functional discipline, without claims of AGI or consciousness. Report observations, uncertainty,
alternatives when useful and verification limits; keep private reasoning private. User steering
updates goals immediately. Preserve interruptibility, truthful evidence and authorization gates.

1. Read live source, manifests, lockfiles, tests, CI/deployment files and runtime probes first.
   Detect the actual language, framework, package manager, verifier and deployment target.
2. Frame the goal, scope, acceptance evidence and human-only handoffs. For complex web products
   produce a domain/UX/API/data/security/performance/QA blueprint before coder handoff, using
   available specialists when appropriate.
3. Retrieve only relevant evidence. Use [retrieval](references/retrieval.md) for the graded RAG
   loop, local V9 memory hierarchy and optional NotebookLM lane. Keep a compact ledger of
   accepted source-backed claims, rejected false positives and explicit gaps. Current source
   outranks memory; current primary sources resolve volatile claims.
4. Run the AI-touchpoint scan. For created/changed model capabilities, classify intended use and
   roles before implementation using [the AI assessment](references/ai-assessment.md). Do not
   classify ordinary use of an assistant to edit a non-AI product as a new product AI feature.
5. Freeze acceptance and scope before implementation. Every criterion has an exact executable
   probe or a named human handoff. A handoff is missing evidence until answered. Do not weaken,
   delete or skip tests to make a pass, or extend the requested diff.

## Prompter-first implementation

Read [the orchestration contract](references/subagent-prompt-orchestration.md) and use
[the Prompter prompt](references/domains/thinktank-prompter.md). The Prompter compiles contracts;
the parent owns their semantic review, dispatch, join, proof and every human gate.

1. Give a fresh Prompter context the accepted objective, canonical repo, language, source pack,
   frozen criteria, read/write limits, actual tools and shared concurrency/cost bounds.
2. It returns `repo_path`, `tasks`, `rejected_splits`, optional `modes`. Tasks contain exact
   objective, deliverable, dependencies, ownership, context, constraints, structured acceptance,
   generated prompt and the supplied `WORKER_OUTPUT_SCHEMA`. No implementation or verification.
3. Run `scripts/validate-plan.mjs` with trusted explicit allowed roots and the live child cap.
   It validates IDs, dependencies, DAG, canonical scopes, overlaps, output shape and protected
   controls. Parent additionally verifies source pointers, commands, language, goal traceability,
   permissions and agreement between prompt and structure. Structural validity is not truth.
4. Correct invalid contracts before dispatch within the shared ceiling. If no safe task exists,
   retain rejected splits, report the gap and stop dependent execution. Workers do not negotiate
   scope or rewrite frozen acceptance.
5. Assign each concurrent writer disjoint ownership in a distinct verified worktree; read-only
   agents may share source. If isolation is unavailable, parent implements and delegates read-only
   investigation/review. One integration owner controls shared manifests and lockfiles. Import
   reviewed diffs deliberately; default Codex agents share a filesystem.
6. Schedule ready tasks in capacity-bounded batches, await actual results and verify prerequisites
   before dependents. No slot is implied by total plan size. Generated prompt reaches the child
   verbatim, followed by a separate parent envelope with actual worktree, language and output schema.
7. Workers are leaf roles and may edit only their owned output. Validate their typed return; schema
   correction is parent-managed and bounded because the current spawn API does not enforce JSON.
8. Join using `joinResults`, retaining stable IDs/provenance and contested variants. Check every
   expected task ID and actual changed path separately. Neither aggregate `completed` nor agent
   consensus is an acceptance verdict; unresolved conflicts go to independent evidence review.
9. Parent reruns relevant probes on integrated artifacts, then supplies frozen criteria, final
   candidate/digest and exact verifier commands to a fresh independent checker. Use
   [the checker prompt](references/domains/thinktank-checker.md); no maker or Prompter reasoning.
   The checker inspects and executes safe probes without silently repairing. Later edits invalidate
   its acceptance. Correct and recheck at most three rounds, then report incomplete evidence.

Optional domain prompts: [backend](references/domains/thinktank-backend.md),
[frontend](references/domains/thinktank-frontend.md), [data](references/domains/thinktank-data.md),
[infrastructure](references/domains/thinktank-infrastructure.md),
[security](references/domains/thinktank-security.md), [QA](references/domains/thinktank-qa.md).
Use only relevant lenses; these names do not imply registered Codex agents.

## Verification, graph and delivery

Every loop shares four exits: `verified`, `ceiling`, `budget`, `no-progress`. Default correction
ceiling is three rounds; token/time caps cover the whole run, including fan-out. Change strategy
after recoverable failure. Stop unchanged/oscillating work; exhausted budget is never completion.
`verified` needs appropriate executed acceptance plus independent review for non-trivial changes.
Full fan-out failure gets at most one bounded redispatch, then triage.

Use [graph and GraphRAG](references/graph-and-graphrag.md) only after eligibility. Deterministic
functions are tool calls, not extra agents. Frozen DAG edges cannot invent targets or bypass the
checker, a human checkpoint or the Art.-5 stop. Optimization targets need a paired counter-metric
and external anchor; binary correctness/safety gates cannot be traded off.

Use [work packages and delivery](references/workflow-and-delivery.md) for multi-package work or
shipping. Repository artifacts are state; Qdrant holds reusable judgment. Missing static/unit/
integration/e2e/browser rungs are absent evidence. A merge is not done: verify serving revision
and the automated browser pass where applicable. Exploratory clicking can fail, never pass, a rung.

This port does not install or claim an enforcing Codex unattended launcher or grant corridor.
Without proven host interception, activation and denial tests, unattended mode is unavailable;
prepare the proposal and human triage instead. Interactive local engineering continues within
the user's scope. Never import Hermes/Claude hooks as working Codex enforcement.

## Report, learn and validate this skill

Report material triage first, outcome, selected modes, evidence and gaps, real worker statuses,
probe results, independent verdict and fired exit. Scale detail to task complexity. Do not report
required workers as finished while their work is outstanding. Capture sanitized verified reusable
learnings with find-before-store to V9, `workflow=agentic-engineering`, `version=17`; provenance
and domain accompany facts. Queue learnings if memory is unavailable. No secrets or raw transcripts.
Never self-modify an unattended harness, routing, grants or acceptance criteria.

For read-only ideation, use [brainstorming](references/brainstorming.md).
The dependency-free mechanical helpers require Node.js 20.19 or newer. If that runtime is absent,
report mechanical validation unavailable; do not install dependencies merely by loading the skill.
To validate this installed bundle, run `node <skill-dir>/scripts/verify.mjs`.
This verifies files and deterministic contract behavior, not Codex registration, legal compliance,
live model behavior, hooks or delivery authorization.
