# Golden-Query Evaluation

Use this whenever the memory backend, schema, embedding model, collection, retrieval routing, or storage policy changes. Run it once more after the first ~10 memories have been created.

## Backend Under Test

- `qdrant-thinktank`, collection `thinktank-memory`

If the memory backend is not reachable, record `memory unavailable` rather than simulating hits, and re-run when connectivity returns.

## Scoring

Score each query from 0 to 3:

- 3: top result directly answers the query and carries usable metadata.
- 2: a top-3 result is usable but needs manual filtering.
- 1: only generic, weak, or stale results appear.
- 0: no useful hit or wrong domain.

Minimum acceptance:

- Average score >= 2.2
- No critical query scores 0
- At least 80 percent of reusable hits have `workflow=agentic-engineering`, `memoryKind`, `contextLanes`, `language` or `stack`, `sanitized=true`, and `contains_secrets=false`
- False positives are explicitly recorded

## Golden Queries

| ID | Query | Expected strong hit | Must-have signals |
|---|---|---|---|
| TT-001 | ThinkTank agentic RAG engine setup backend collection embedding model | Install/upgrade memory | `qdrant-thinktank` backend, collection name, embedding model |
| TT-002 | agentic retrieval loop plan route retrieve reflect rewrite stop budget | Loop procedure memory | verdicts, 3-round budget, escalation order |
| TT-003 | evidence ledger groundedness gate load-bearing claim assumption | Grounding procedure | grounded/assumption tags, gate before output |
| TT-004 | memory write path find-before-store supersede dedup consolidation | Write-path governance | supersedes metadata, no fragments, sanitation gate |
| TT-005 | retrieval routing lane escalation memory code-search docs-web on miss | Routing memory | lane order, escalate only on miss, single memory collection |
| TT-006 | degraded mode memory unavailable backend unreachable queued capture | Degraded-mode policy | no simulated hits, queued learnings, local backend note |
| TT-007 | detect project language stack package manager validation gates | Stack detection procedure | manifests, lockfiles, CI, confidence |
| TT-008 | web project blueprint domain UX API data security QA handoff | Blueprint workflow | product, UX, API, data, security, verification |
| TT-009 | no secrets memory capture contains_secrets false customer payloads blocked | Safety policy memory | sanitized, contains_secrets=false, hard blocks |
| TT-010 | TypeScript Next.js best practices server client boundary cache validation | Stack-specific best-practice pack | language, framework, validation gates |

Critical queries: TT-001, TT-002, TT-004, TT-006, TT-009.

## Evaluation Record

For each query, record: query ID, backend used, top result title or `none`, score, relevance, reuse value, authority, freshness, conflict, missing metadata, false positives, and required action.

## Pass/Fail Template

```text
ThinkTank Golden-Query Evaluation
Date: YYYY-MM-DD
Backend: <backend or memory unavailable>
Collection: thinktank-memory
Average score: <n.n>
Critical failures: <none|ids>
Metadata coverage: <percent>
Result: <pass|fail|not run>
Actions:
- <migration, cleanup, rewrite, config, or no action>
```

Store only the final evaluation summary. Never store secrets, tokens, personal data, customer payloads, callback URLs, raw docs, or long logs.
