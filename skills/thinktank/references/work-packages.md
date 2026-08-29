# Work-Package Engine

The unit of iteration in delivery mode is the **work package**, not the turn or the conversation. A package is the smallest slice of the goal that can be branched, proven, shipped, and driven in a browser on its own. This file defines how a project or feature becomes an ordered set of packages, where their state lives, and how a run resumes from a plan it did not write.

## 1. When to decompose

Decompose when **any** of these conditions applies: the goal needs more than one branch to land safely; the work spans layers (schema, API, UI) that require different verification; the goal will outlive one context window; or the requester described a project rather than a change.

Do **not** decompose a single-file change, a bug with one obvious cause, or work whose shape will remain unknown until the first exploration lands. In the last case, make *the exploration* the first package and let it produce the plan for the rest. A plan invented before anyone reads the code is intent debt with a schedule attached (`loop-engineering.md` §9).

## 2. Package contract

Each package carries these fields. Write them before implementation. From `in_progress` onward, the acceptance criteria are **frozen** (see §5).

| Field | Requirement |
|---|---|
| **id** | short, stable, branch-safe (`wp-03-guest-checkout`) — it names the branch, the PR and the Qdrant record |
| **title** | what a colleague would call it |
| **domain slice** | the clause of the run's domain condition this package satisfies; every clause must be covered by at least one package |
| **depends on** | package ids that must be `done` first. No cycles. |
| **touches** | the files/modules expected to change — a scope statement the checker can hold the diff against (`loop-engineering.md` §8) |
| **acceptance criteria** | observable, each with a proof command and the rung it belongs to (`prompt-writer-contract.md` §4) |
| **rungs** | which Acceptance-Gate rungs apply to this package, including any that are *absent* and why |
| **state** | §4 |
| **evidence** | filled as the chain runs: rung results, commit, PR url, deploy, browser verdict |

## 3. Decomposition rules

1. **Independently shippable.** If merging package N alone would break the branch or expose a user-visible half-feature, it is not a package. Either fold it into its neighbour or put the user-visible switch behind a flag and make the flag flip its own package.
2. **One verification story each.** A package that needs three unrelated kinds of proof is three packages.
3. **Ordered by dependency, then by risk.** Make schema and contract changes before writing the code that assumes them. Schedule the riskiest package early, while the budget and the human's attention remain intact.
4. **Sized to one context.** If a package cannot be briefed, implemented and verified within one working context, an agent that has forgotten why it started will finish it (`loop-engineering.md` §7).
5. **Bounded count.** Human review bandwidth sets the ceiling for safe parallelism (`loop-engineering.md` §9, orchestration tax). Landing more than a handful of packages without anyone reading them is not throughput.
6. **The plan is shown before the first branch** and remains a proposal until the human has seen it in an interactive session, or until the grant's `domain_condition` covers it.

## 4. State machine

```
planned ──▶ briefed ──▶ in_progress ──▶ gated ──▶ checked ──▶ merged ──▶ verified ──▶ done
   │           │            │             │          │           │           │
   └───────────┴────────────┴─────────────┴──────────┴───────────┴───────────┴──▶ blocked
                                                                 └──▶ failed (browser red after merge)
```

- `blocked` and `failed` are terminal **for that package** and stop the queue. Both write the state, the evidence and a named handoff to `docs/loop-triage/<run-id>.md`. No later package starts while either state remains outstanding — later packages build on verified ground or not at all.
- Stopping the queue does not end the run. Remediation is permitted, but only through a **new package** that depends on the failed one and travels the whole chain (own branch, own PR). If the grant does not cover that chain, or if the failure is a hard blocker under `delivery-loop.md` §5.3, the run ends and hands over. Repairing the failed package in place is never permitted, because it erases the record of what broke.
- **`merged` is not `done`.** Only a green browser pass moves a package to `verified`, and only a written checkpoint moves it to `done`.
- A package may **never** move backwards to hide a failure. Remediation requires a new package that depends on the failed one.

## 5. Persistence: two stores, one truth

| Store | Role | Why |
|---|---|---|
| **`.thinktank/work-packages.md` in the repo** | **the source of truth** | it is versioned, diffable, reviewable in the PR, and survives every context reset. The agent forgets; the repo does not. |
| **Qdrant (`qdrant-thinktank`, collection `thinktank-memory`, `domain=autonomous-delivery`)** | **cross-run recall** | semantic memory: why this decomposition, which rung compilation worked for this stack, what the browser pass caught last time. Retrieved at plan time via the agentic RAG loop. |

### 5.1 The file format (fixed, because resumption has to parse it back)

A source of truth nobody specified is a source of truth nobody can read. Use one `##` block per package, one `key: value` line per field, and a numbered list for criteria. The format is stable enough to grep and plain enough to review in a PR:

```markdown
# Work packages — run tt-20260801-101500-4711
domain_condition: a customer can check out as a guest and receives the confirmation mail
gate: static=`npm run typecheck` unit=`npm test -- checkout` integration=ABSENT e2e=`npx playwright test` browser=`npx playwright test --project=staging`

## wp-01-guest-checkout-api
state: done
depends_on: —
domain_slice: the order is created without an account
touches: src/api/checkout/**, src/lib/order.ts
rungs: 0,1,3,4
acceptance:
  1. [unit] POST /api/checkout without a session creates an order — `npm test -- checkout`
  2. [e2e] the guest flow reaches the confirmation page — `npx playwright test guest-checkout`
  3. [scope] the diff stays inside `touches` — `git diff --name-only <base>...HEAD`
  4. [regression] existing suites stay green — `npm test`
evidence: rungs 0,1,3 green 2026-08-01T11:12Z · PR #412 · merged into dev · run 18273641 success · staging probe 200 (build sha a41503f) · browser 7/7, console clean
```

`state` is the only field a later run may change, and only forwards along the state machine. `acceptance` is frozen from `in_progress` onward and is what the checker compares against `.thinktank/briefs/<id>.md`.

### 5.2 Persisting a state change after the merge

The awkward moment goes unnoticed until it happens: once a package's branch is merged, that branch is gone, so the `merged → verified → done` transitions have nowhere to be committed. The rule:

- Write the transition to the file **immediately**, in the local working tree. The run must never carry package state only in its context.
- **Commit the file on the next package's branch**, so that it becomes part of that PR and receives the same review as everything else.
- If the run ends before the next package exists, leave the file modified and uncommitted, and **state this explicitly in the report**, with the exact `git status` line. A resumed run treats the uncommitted state file as authoritative over the committed one because it is newer, but re-verifies it under §6.

**Qdrant is not the state store. Treating it as one is a design error.** Retrieval is approximate and ranked. A resumption that asks "which package was I on?" and gets a *similar* answer will redo or skip work. Read the repo file for state. Read Qdrant for judgment. Never write a grant, a token, a URL with credentials, customer data, or raw logs into either.

**Write triggers during a run:** the plan when it is first agreed (Qdrant: the decomposition and its reasoning, not the file), and each `done` package's recipe if it taught something reusable. Find-before-store, always; consolidate near-duplicates with `supersedes`.

## 6. Resumption

A run that starts against an existing `.thinktank/work-packages.md`:

1. **Reads the file first**, before any retrieval. For questions about the current repository, the repo outranks memory.
2. **Re-verifies rather than trusts**, using commands rather than confidence. For every package the file marks `done`: `gh pr view <n> --json state,mergedAt,mergeCommit` (did it really merge?), `git log --oneline <target> | grep <sha>` (is it on the target?), and a re-run of the package's own decisive rung (does it still pass?). Treat "prior progress exists, therefore the job is done" as an explicit failure mode (`loop-engineering.md` §8).
3. **Reconciles honestly.** If the file marks a package `merged` but its PR was closed without merging, report the discrepancy instead of quietly correcting it.
4. **Never re-plans silently.** If the code has changed enough that the plan no longer fits, treat that as a finding: stop, show the delta, and let a human re-cut the plan.

## 7. Context hygiene per package

- Each package starts from a **clean brief**, not from the accumulated transcript of earlier packages (`loop-engineering.md` §7).
- A finished package contributes a **distilled checkpoint** (~1–2k tokens: what shipped, what proved it, what surprised), never its full context.
- Sub-agents (prompt-writer, coder, checker) return summaries, not transcripts.
- Compact before reaching the limit, not after. If a single package requires compaction twice, it was too large — record that as a lesson for future decomposition.

## 8. Antipatterns

| Antipattern | What it looks like |
|---|---|
| **Plan fiction** | a decomposition written before anyone read the code, defended afterwards because it exists |
| **Qdrant as truth** | resuming from a semantic recall of the plan instead of the file, silently redoing or skipping a package |
| **Backwards state** | a failed package quietly reset to `in_progress` so the run can keep looking successful |
| **Dependency denial** | starting package N+1 while N is `failed`, because N+1 "doesn't really depend on it" |
| **Checkpoint drift** | the repo file and reality disagree and nobody notices because nothing re-verifies |
| **Package sprawl** | so many packages that no human reads any of them (`loop-engineering.md` §9, orchestration tax) |
