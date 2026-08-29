# Agentic Coding Engine

The implementation-side contract. Grounded in an agentic-coding knowledge pack held in the `thinktank-memory` collection under `domain=agentic-coding`, and in lessons captured from hands-on runs. Numbers quoted from that pack are single-source survey estimates, never hard benchmarks.

## 1. Delegation, not assistance

Agentic coding is a shift of responsibility: the human describes a **goal and its acceptance criteria**; the engine plans, acts, verifies, and iterates until the result works or the budget is spent. The engine reacts to the **state of the project** (repo, tests, terminal output), not to a cursor position. The human supervises outcomes and owns the final decision — responsibility never transfers to the machine.

## 2. Eligibility gate (what to delegate)

Delegate fully when the task is **clearly defined and easy to validate**: refactors, dependency upgrades, test generation, documentation updates, repetitive cleanup, mechanical migrations, well-specified features that follow existing conventions.

Keep human-led (engine assists, drafts, verifies): architecture decisions, ambiguous requirements, irreversible or outward-facing actions (deploys, publishing, data deletion), legal/compliance judgments. When acceptance criteria cannot be stated, the task is not delegation-ready — clarify first.

## 3. The loop

1. **PLAN** — restate goal + acceptance criteria; decompose; the plan's load-bearing claims must pass the groundedness gate (evidence ledger, repo truth over memory).
2. **CONTEXT** — explore with the harness primitives (list / grep / read; ripgrep-style search respects ignore files). Read only what the change needs; respect read limits — context blowup is a failure mode, not thoroughness.
3. **ACT** — smallest coherent change set; follow repo conventions; multi-file edits are fine, unrelated drive-by edits are not.
4. **VERIFY (ladder)** — narrowest useful check first, widen only on risk or failure:
   typecheck/lint → unit tests → build → integration → preview/visual (measure, do not eyeball) → live check (cache-busted, verify the concrete change, not just HTTP 200).
   The terminal is part of the loop: run the thing. A slow or flaky verification environment degrades the whole engine — fix or flag it early.
5. **CORRECT** — errors are data, not exceptions: feed the actual message back into the loop and fix. Tool/subagent design mirrors this: return human-readable errors instead of crashing, so the loop can course-correct.
6. **STOP** — hard iteration cap per task (default 3 correction rounds per failing rung, mirroring the round cap in the retrieval loop). On cap: report honestly what failed, never paper over.

## 4. Independent review layer

Self-review is architecturally flawed: the same assumptions, biases, and reasoning patterns that produced the code shape its review — errors confirm themselves and produce false confidence. Verification, not generation, is the bottleneck.

Rules:

- The context that wrote a non-trivial change never solely reviews it. Spawn separate reviewer agents/lenses (correctness, security, performance, a11y, compliance — pick by risk) with **no stake in the output**.
- Findings are adversarially verified before they count: a skeptic context tries to refute each finding; majority-refute kills it. Practice confirms both directions: audits find real issues mechanical gates missed, and adversarial passes refute plausible-but-wrong findings.
- Review agentic output like a junior engineer's PR: architecture, boundaries, side effects, test quality — not syntax.
- Human review remains the last gate for irreversible/outward-facing changes; merges of own PRs require explicit user approval.

## 5. Orchestration guardrails

- Fan out subagents in small batches (4-5); large parallel fan-outs hit server-side rate limits.
- Scope verifier/reviewer prompts narrowly; overly broad verifier mandates stall on long runs.
- Parallel file mutation requires isolation (worktrees); on macOS/Turbopack clone `node_modules` with `cp -Rc`, never symlink.
- Workflow scripts: embed the worklist as a literal (`const ITEMS = [...]`) — the args parameter does not reach the script; generate large scripts to a file and launch via scriptPath.
- Pipeline over barriers; a barrier is only justified when a stage genuinely needs all prior results.
- Every capped or sampled sweep logs what it dropped — silent truncation reads as full coverage.

## 6. Retrieval-maturity ladder (coupling to the knowledge loop)

Match retrieval effort to question complexity — cheapest tier that can answer safely:

| Tier | Mechanism | Use for | Warning |
|---|---|---|---|
| Basic | retrieve-then-generate | throwaway PoC lookups | semantic fragmentation, lost-in-the-middle; not for critical answers |
| Advanced | query transformation + hybrid search (lexical BM25 + vector) + reranking | most doc/support/intranet questions; exact identifiers need the lexical leg | the default sweet spot — start here |
| Agentic | orchestrated loop: decomposition, multi-hop, evaluation, self-correction, tool use | multi-hop, critical, or action-taking questions | 10-30s latency, multiplied token cost; over-engineering for simple lookups |
| Graph | knowledge graph (entities + relations) | when relationships matter more than data points (supply chain, compliance) | requires clearly defined entities/relations |

Inside ThinkTank this maps to: memory/code-search first (Basic/Advanced analog), the full agentic loop only for `critical` queries that earn it, and the same budget discipline (max rounds, one rewrite) either way.

## 7. Calibration lessons (carry into every grader/reviewer prompt)

- A grader that demands literal overlap rejects good evidence and loops to a false "nothing found" — grade on **answerability**, not wording.
- A rewriter that only produces synonyms stays anchored to the surface frame — instruct it to pivot to the **parent topic**.
- Every loop needs a hard round cap and honest abstention ("no evidence found") over fabrication.
