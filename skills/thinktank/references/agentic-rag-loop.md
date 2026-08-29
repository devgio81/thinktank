# Agentic RAG Loop

The loop is inspired by Self-RAG and CRAG: the model controls retrieval, grades its own evidence, and gates generation on groundedness. It must terminate — budgets are hard limits, not suggestions.

## State Machine

```text
PLAN ──> ROUTE ──> RETRIEVE ──> REFLECT ──┬─ sufficient ──> LEDGER ──> GENERATE ──> GROUND ──> CAPTURE
                       ^                  ├─ weak ────────> REWRITE (once per query) ──> RETRIEVE
                       │                  ├─ conflicting ─> CONFLICT QUERY or local verification ──> RETRIEVE
                       │                  └─ empty+critical> ESCALATE LANE ──> RETRIEVE
                       └────────────── round budget: max 3 total rounds ──> STOP with recorded gaps
```

## PLAN

- Restate goal, stack, likely layers, constraints, output shape, and risk level.
- Classify retrieval need: `mandatory` (non-trivial, risk-bearing, or memory-relevant), `useful`, or `unnecessary` (trivial edits — skip the loop).
- Decompose compound tasks into sub-questions before writing queries. One query answers one question.
- Build 3–7 compact queries. Shapes:
  - problem: symptom + task type + stack
  - solution: affirmative wording of the desired fix or pattern
  - architecture: subsystem, boundaries, data flow
  - validation: tests, gates, rollout checks
  - pitfall: prior regressions, secrets, caching, permissions
  - freshness: current official behavior of volatile dependencies
  - conflict: memory-vs-repo contradictions to settle
- Mark each query `critical` or `supporting`. Critical = the plan is wrong without an answer.

## ROUTE

For each query, choose the least costly lane that can answer safely:

1. `memory` — prior decisions, pitfalls, validations, best-practice packs (see retrieval-routing.md)
2. `code-search` / `project` — current repo truth; always consulted for anything the repo can answer
3. `best-practices` — stored packs, then official docs
4. `docs-web` — volatile or external facts; prefer official/primary sources
5. `tickets` / `runtime` — when issue context or live state matters

Local code truth outranks memory for statements about the current repo. Memory outranks intuition for past decisions and pitfalls.

## REFLECT

Grade every hit using the standard rubric: relevance (high/medium/low/false positive), reuse value, authority, freshness, conflict, actionability, confidence.

Then issue one verdict for each query:

- `sufficient` — a high/medium hit answers the question with acceptable authority and freshness
- `weak` — only generic, low, or stale hits
- `conflicting` — credible hits disagree with each other or with the repo
- `empty` — nothing usable

## DECIDE

- `sufficient` → accept into the ledger, done with this query.
- `weak` → rewrite the query once (different vocabulary, narrower scope, or affirmative phrasing). A second weak verdict means accept the gap.
- `conflicting` → one targeted conflict query OR verify locally (repo, runtime, official doc). Repo truth settles repo questions; the newer dated source settles doc questions. Record the loser as superseded.
- `empty` on a critical query → escalate the lane: memory → code-search → docs-web. Empty on a supporting query → drop it.
- **Stop conditions** (any one): all critical queries resolved; 3 total rounds spent; a round produced no plan-changing evidence. On stop, list remaining gaps explicitly — gaps are stated, never papered over.

## EVIDENCE LEDGER

Use one compact table or list. For each accepted item:

```text
[E3] claim: Next.js revalidatePath does not clear client router cache for dynamic routes
     source: docs-web — nextjs.org caching docs, seen 2026-06-10
     grade: relevance high, authority source-of-truth, freshness current
     effect: plan step 4 uses router.refresh() after the server action
```

Per rejected item one line: `[R1] memory hit "pages router auth" — false positive, repo uses app router.`

## GROUNDEDNESS GATE

Before producing substantial output (plan, blueprint, implementation summary, research answer):

1. List the load-bearing claims — anything that, if wrong, breaks the plan.
2. Tag each: `grounded [En]`, `partially grounded`, or `assumption`.
3. Load-bearing assumptions must be verified (one more targeted retrieval or local check) or surfaced to the user as explicit risk — never silently shipped.
4. The final report names its grounding status.

## Budgets

- Max 3 retrieval rounds total (initial + 2 follow-ups).
- Max 1 rewrite per query.
- Max 7 active queries at a time; merge or drop the rest.
- Specialist calls do not reset budgets; they inherit the ledger instead of re-retrieving.

## Anti-Patterns

- Re-querying with synonyms after two weak rounds — accept the gap.
- Simulating memory hits when the backend is down — state `memory unavailable`.
- Stuffing the context pack with everything retrieved — only plan-changing evidence enters.
- Treating a single stale memory as authority over current repo code.
- Skipping the gate because "the plan looks right" — looking right is not grounded.
