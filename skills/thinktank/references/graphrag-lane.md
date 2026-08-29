# GraphRAG Lane

The retrieval delta: **the "Graph" rung named on the maturity ladder stops being a label and
becomes a lane.** The retrieval-maturity rule defines the ladder as *Basic →
Advanced/hybrid+rerank → Agentic → Graph*, but the actual backend uses pure vector RAG
(`sentence-transformers/all-MiniLM-L6-v2`, 384-dim, over a local Qdrant at
`http://localhost:6333`). It has no knowledge graph, entity extraction, community summaries,
or traversal. This reference builds that top rung as a **payload overlay over the existing
Qdrant points, with no graph database**. It also gates the lane so vector-first remains the
default, while graph retrieval is opt-in, earned, and subject to demotion. Everything not
redefined here comes from the agentic-RAG loop and the knowledge-acquisition lane.

**Terms, kept apart.** **Vector RAG** is top-k semantic retrieval over embeddings. It remains
the default and the only appropriate lane for most single-hop lookups. **GraphRAG** retrieves
over a typed-edge knowledge graph, using entity and relationship structures, community
summaries, and multi-hop traversal. It is reserved for genuinely multi-hop, global, or
relational questions. Trivial and single-lookup turns incur **zero overhead** because the
graph lane loads nothing.

## 0. Provenance and honesty clause (read first)

- **GraphRAG is an emerging technique, not a settled win.** This clause draws on work about
  graph database architectures and GNN integration: the Microsoft *"From Local to Global: A
  GraphRAG Approach to Query-Focused Summarization"* line, Neo4j / PuppyGraph / DataCamp
  implementation guides, GraphRAG-Bench, and the deliberately retained contrarian view that
  *"you probably don't need a graph database for your knowledge graph."* That source remains
  because it keeps this lane honest.
- **Unverified secondary numbers, used only as directional evidence.** GraphRAG-Bench reports
  **53.4% vs 42.9%** for graph vs vector on multi-hop reasoning, with graphs winning on cost
  only above a **~50% pass-rate-per-cycle break-even**. These are **secondary benchmark
  figures, not independently reproduced here.** They inform the routing gate: graphs win
  multi-hop queries, lose lookups, and cost more per cycle. They are never presented as
  settled fact. When a routing decision depends on them, re-verify them against a primary
  source.
- **The honest scope.** The sources identify GraphRAG's real costs: expensive corpus-wide
  entity extraction that requires many LLM calls, **entity-resolution accuracy is the
  make-or-break** of trustworthy traversal, ongoing re-index maintenance, and higher token
  cost. This lane addresses each cost with a specific mechanism (§3, §5, §6) instead of
  hiding it.

## 1. What this lane is, and is not

- **It is** a typed-edge knowledge graph built as a **payload overlay over the existing local
  Qdrant MiniLM points**, with no new server or graph database. It uses the agentic loop's
  `ROUTE → DECIDE` seam, the same escalation seam used by the knowledge-acquisition lane.
- **It is not** a replacement for vector RAG, a mandatory index, or a reason to deploy
  Neo4j/FalkorDB/TigerGraph. The contrarian source ("you probably don't need a graph
  database") is taken at its word: a knowledge graph does **not** require a graph DB. If a
  future workload genuinely outgrows a Qdrant-payload overlay, moving to new infrastructure
  requires a separate, human-gated decision. This lane never provisions that infrastructure
  on its own.

## 2. The typed-edge overlay over Qdrant (no graph DB)

- **The edges.** The engine currently ships exactly two typed-edge fragments: `supersedes`
  (the memory-consolidation edge) and `depends_on` (work-package ordering). This lane expands
  them into the closed **seven-relation set**: **`supersedes / depends_on / decided_by /
  caused / implements / blocks / references`**. Edges remain **payload metadata on the MiniLM
  points**, not a separate execution path.
- **The untyped edge is banned.** A `related_to` edge provides no basis for reasoning.
  "ADR-007 *supersedes* ADR-003" records a decision, while "ADR-007 *is related to* ADR-003"
  says nothing useful. Every stored edge must use one of the seven types. Otherwise, it is
  not stored.
- **Inherited write-path gates, restated because a graph invites each failure.**
  Find-before-store remains mandatory. The no-secrets write rule also remains unchanged: **no
  secrets, PII, raw payloads, or long quotes become nodes**. Entities are references, not
  stored content. Degraded mode is unchanged: **Qdrant unreachable → "memory unavailable",
  never a fabricated edge.**

## 3. The anti-hype routing gate: vector-first, graph only when earned

The default lane is **vector**. This gate does not reinvent the discipline the engine already
has. It **anchors to it** and adds only three genuinely new elements.

- **Pre-existing (do not re-claim):** the retrieval-maturity rule ("match retrieval effort to
  question complexity / simple lookups never enter the agentic loop"), and the `PLAN`
  classifier's mandatory / useful / unnecessary grading. Vector-first defaulting and opt-in
  escalation already exist.
- **Genuinely new (the delta):**
  1. **A vector-vs-graph query-shape classifier at `ROUTE`/`DECIDE`.** Multi-hop / relational
     / "connect-the-dots" / corpus-wide-sensemaking questions route to the graph lane;
     single-hop lookups stay vector. Shape, not topic, decides.
  2. **Cost-per-successful-completion as the success metric.** The engine otherwise tracks
     only a wall-clock/token budget *exit*. This lane tracks whether the graph lane returns a
     *usable, grounded* answer per token spent, which the engine does not currently measure.
  3. **An auto-demotion signal.** If the graph lane underperforms vector on
     cost-per-successful-completion for a class of query, the signal demotes that class back
     to vector.
- **The hard limit on demotion.** Auto-demotion **may never self-modify the routing gate
  during an unattended run.** It emits a **tighten-only recipe** through the write-path recipe
  channel (loop engineering §12). That recipe is applied **interactively as an approved
  diff**, so a scheduled run can never rewrite the lane-selection policy that governs the next
  run. The gate only ever *tightens* the retrieval-maturity rule; it never loosens it.

## 4. Local vs global search + multi-hop traversal

- **Local search** uses entity-neighborhood retrieval for specific facts: find the entity,
  follow its typed edges for one or two hops, and return the grounded neighborhood. This is
  the common graph-lane query.
- **Global search** uses map-reduce over **community summaries** (§6) for corpus-wide
  "sensemaking" or query-focused summarization (Microsoft *From Local to Global*). It handles
  questions whose answers are distributed across many documents and their relationships,
  which vector top-k cannot assemble structurally.
- **Multi-hop traversal** is **capped at 3 hops.** The lane **inherits the agentic-RAG
  max-3-round budget unchanged. It adds no rounds.**
- **Groundedness is not weakened.** A multi-hop synthesis **must cite its hop-chain into the
  evidence ledger** (which entity, which typed edge, and which destination entity at each hop)
  or be **flagged as an assumption.** A traversal that cannot show its chain does not support
  a grounded claim.

## 5. The entity-resolution confidence gate

- **Why it is first-class.** Both the contrarian source and the graph literature identify
  **entity-resolution accuracy** as the deciding factor in trustworthy multi-hop traversal. If
  `Apollo` the mission and `Apollo` the vendor mistakenly resolve to the same node, every hop
  through that node is poisoned. Resolution accuracy therefore appears as a **propagated
  confidence** value, calculated as the **minimum along the hop-chain**. One weak link caps
  the confidence of the entire chain.
- **Advisory to grading, never an upgrade path.** Confidence extends the `REFLECT` rubric and
  the groundedness gate. It can **downgrade** a hit to an assumption, but it can **never
  upgrade** a weak hit to "sufficient."
- **Ambiguous entities are never silently auto-merged.** A resolution below the threshold
  enters a **human-review queue**, consistent with the engine's gates for merging and
  irreversible actions. It never triggers a silent merge. An unresolvable entity is reported
  as **"unresolved"**, never as a guessed link.

## 6. Incremental, budgeted community-summary indexing

- **What it builds.** Community detection (e.g. Leiden) runs over the typed-edge graph,
  followed by **LLM-generated community summaries**. This is the construction step that
  supplies §4's global search.
- **How it confronts the cost, rather than hiding it.** Indexing is **lazy / per-write /
  on-demand / stale-only**, **never an eager full-corpus sweep.** A summary is built or
  rebuilt when a query needs it and its inputs have changed, not on a schedule that repeatedly
  processes the corpus.
- **Every pass rides the budget exit.** Summarization consumes the token and wall-clock budget
  and **aborts on breach.** An aborted summarization degrades to **"summaries stale."** It
  never serves a half-built summary as complete. **Qdrant down → no indexing.**

## 7. Degraded mode + write path

- **Degraded mode (inherited, unchanged).** Qdrant unreachable → **"memory unavailable"**,
  never a fabricated edge, guessed hop, or simulated summary. The lane declares the gap and
  continues with the remaining retrieval lanes under the agentic-RAG degraded-mode rules.
- **Write path.** Collection `thinktank-memory` via the `qdrant-thinktank` MCP server;
  `workflow=agentic-engineering`, `domain=graph-engineering`; find-before-store; consolidate
  near-duplicates with `supersedes`. **Graph recipes only tighten** (§3). Store GraphRAG
  win/lose calls **with their break-even evidence** so the next run inherits a calibrated
  routing gate rather than re-deriving it. Never store secrets, transcripts, raw payloads, or
  raw traces.
