# Graph Engineering Engine

The contract: **the loop stops being the only executable shape and becomes one member of a
small, gated family. It remains a graph drawn as a line, while the engine may draw that line
as a directed topology when, and only when, a task proves it needs one.** Everything not
redefined here comes from the delivery loop, the work-package engine, and loop-engineering
discipline. The engine already implements the governance half of "Graph Engineering":
timescale separation, exogenous anchors, operational safety limits, context isolation, and a
fail-closed edge-policy hook. This reference adds only the structural half and the retrieval
lane. It preserves every gate that makes the structure safe.

**Terms, kept apart throughout.** A **loop** is sequential ordered execution, and it remains
the default. A **graph topology** is an explicit directed graph of heterogeneous typed nodes,
with a typed state object flowing along its edges. **Loop discipline** (the four stacked exits,
maker/checker, anti-reward-hacking) applies to *both*. A graph does not escape any exit.
Trivial and conversational turns carry **zero overhead**: no Decision Matrix, no topology,
no counter-metric.

## 0. Provenance and honesty clause (read first)

- **"Graph Engineering" is an emerging, contested community framing (~July 2026), not a
  specification, and explicitly not a successor to loop engineering.** A cluster of sources
  frames it as the next paradigm after the single-agent loop: Flowtivity ("From Loops to
  Graphs: The Next Paradigm in AI Agent Engineering"), "Graph Engineering vs Loop
  Engineering: What Actually Changed", Analytics Vidhya ("Graph Engineering for AI Agents:
  Beyond the Single-Agent Loop"), TrueFoundry ("Graph Engineering for Multi-Agent Systems"),
  and a systems-engineering survey. That "successor" thread directly challenges this engine's
  foundations, and the engine rebuts it with evidence: **graph orchestration and agent loops
  are complementary. Not every node is an agent, and not every task needs a graph** (the
  conclusion the sources themselves reach). A claim that "loops are obsolete" would dissolve
  the four stacked exits and the maker/checker split. Under the hill-climbing guard (loop
  engineering §12), that claim is therefore the *failure signal*, not a design input. Treat
  the *name* as framing and the *substance* as engineering. The engine already ships much of
  that substance.
- **Sources.** This reference draws on work about graph database architectures and GNN
  integration, checked against the successor-framing cluster above, a GraphRAG cluster
  (Microsoft *From Local to Global*, Neo4j, PuppyGraph, DataCamp, GraphRAG-Bench), and a
  deliberately retained contrarian source ("you probably don't need a graph database").
  Every rule traces back to those cited sources.
- **Unverified secondary numbers, admitted only as directional.** GraphRAG-Bench reports
  **53.4% vs 42.9%** for graph vs vector on multi-hop reasoning, and a **~50% pass-rate-per-
  cycle break-even** below which a graph costs *more* per successful completion than a loop.
  These are **secondary benchmark figures, not independently reproduced here**. They shape
  the Decision Matrix: graphs win multi-hop tasks, lose simple lookups, and cost more tokens
  per cycle. Do not quote them as settled fact. When a load-bearing decision depends on them,
  verify them against a primary source.
- **The honest scope of this reference.** The engine already implements timescale separation,
  exogenous anchors, operational safety limits, and context isolation. It also implements part
  of the edge policy. This reference does **not** recreate those features. It cites them and
  adds only what is absent: concurrency-as-topology, typed shared state plus deterministic
  reducers, DAG-bounded routing, node-level cost observability, paired counter-metrics, the
  GraphRAG lane, and the decision framework that gates all of it.

## 1. The shift this engine encodes

- **Line vs topology.** The delivery chain is a sequence of heterogeneous typed links. Each
  has a precondition and runs in strict dependency order (delivery loop §2; work packages
  §4/§5.2: "no later package starts while one is outstanding"). That chain is a directed graph
  constrained to a single path. A topology conditionally removes the single-path constraint.
  It may fan out, cycle under control, and route errors along dedicated edges. The sequential
  loop remains the default and the fallback.
- **Node vs agent.** The load-bearing correction to the hype is simple: **not every node is an
  agent.** A gate rung, policy check, file transform, retrieval, or DB query is a
  **deterministic node that runs as a plain function or tool call**, not as another LLM turn.
  A graph becomes cheaper than a loop only when it reserves agent turns for nodes that
  genuinely need judgment.
- **This is harder than sequencing, not easier.** A topology creates more ways for a run to
  slip past a gate: a concurrent branch writes an irreversible action, a router computes a
  `goto` around the checker, or a reducer "merges" a contested judgment. The topology now
  controls execution, but judgment remains. Every hard limit in §8 exists because a graph
  node must **never** provide a route around a human-gate.

## 2. Execution model: typed nodes, edges, and the work/improvement mapping

- **Node kinds (the taxonomy).** A node is one of: `llm-call`, `tool-call`, `transform`
  (deterministic function), `retrieval`, `policy-check`, `gate-rung`, `human-approval`, or
  `subgraph`. The **deterministic kinds** (`transform`, `policy-check`, `gate-rung`) run as
  function or tool calls, never as agent turns. This makes the "not every node is an agent"
  rule mechanical. A `subgraph` node is a nested topology presented to its parent as a single
  node with a typed input/output contract.
- **Edges are permitted transitions.** An edge names a legal control-flow move and carries
  the typed state object (§3). The set of edges forms the **frozen plan DAG**, declared before
  the first node runs. The plan contains no cycles. Controlled runtime cycles belong to §4
  and remain bounded by the exits.
- **What is genuinely new here.** (a) the typed-node taxonomy, with deterministic kinds
  implemented as function or tool calls; (b) subgraph nodes; (c) the extension of typed nodes
  beyond the fixed delivery chain into arbitrary topology. **What is NOT new** and must not
  be claimed again: the coder, checker, independent reviewer, and prompt-writer are *already*
  four distinct nodes in the delivery chain (see `prompt-writer-contract.md`). This reference
  names them; it does not "de-monolithize" them.
- **Work-graph vs improvement-graph is a vocabulary mapping, non-load-bearing.** The
  "work/task graph" is the per-run topology above. The "improvement graph" relabels the
  existing stacked loops (loop engineering §5) and hill-climbing (§12). It adds no capability
  and appears here only to map the two-layer vocabulary onto existing machinery.
- **Hard limits (inherited, restated because a topology tempts each).** Node typing may change
  *how* a step runs. It may **never** delete the checker node, make the human-checkpoint
  optional for an irreversible link, or demote a gate rung from a real exit-code command to a
  soft check. The improvement graph may only **tighten** (loop engineering §12,
  non-learnable) and may **never** rewrite frozen acceptance criteria.

## 3. Typed shared state + deterministic reducers + context isolation

- **The state object.** In a topology, an in-run **typed shared-state object** flows along
  edges beside the durable `.thinktank/work-packages.md` file. The file remains the
  **source of truth**; the object serves as working memory. The "Qdrant/object is not the state
  store" discipline remains unchanged.
- **Context isolation (inherited, the one graph claim the engine already met).** Each node
  reads only the fields it needs and returns only the fields it owns (delivery loop §2b: the
  checker "receives … That is all"). No node may read the checker's justification inputs. A
  node that reads the maker's reasoning starts agreeing with it.
- **State reducers (genuinely new, required by §4 fan-out).** When two concurrent branches
  write the **same field**, a **deterministic reducer** resolves it: `append` (lists),
  `merge` (dicts), `latest` (last writer, only where order is defined), or a named `custom`
  function. **Reducers must be deterministic.** An LLM-judged merge of a contested field is
  **forbidden** because it reintroduces self-grading (loop engineering §9). A model asked to
  "reconcile" two branch outputs is grading them. When branches genuinely conflict over a
  judgment, no reducer handles the field. Instead, the field routes to the checker or the
  human-approval node.
- **Partition stays the default for repo files.** For **repository** files, disjoint-file
  partition (collective cognition §7, the #1 partition rule) remains the default. Reducers
  govern the in-run state object, not concurrent edits to the same source file.

## 4. Parallel-as-topology + the compound-cost guard

- **The pattern.** Planner → Worker → [Security · Logic · Style reviewers in parallel] →
  Synthesizer → pass/fail gate. Independent reviewers run concurrently, producing the ~3×
  wall-clock reduction compared with a sequential review chain.
- **The synthesizer-before-gate rule.** A fan-out **must** join at a Synthesizer node before
  the Acceptance Gate. An unmerged fan-out may never skip the pass/fail gate.
- **The compound-cost guard (genuinely new).** If **all** parallel branches fail, re-running
  the worker and re-dispatching every reviewer can consume **more tokens than a sequential
  loop would have**. Therefore, re-dispatch after a full-fan-out failure is **capped at one
  sequential round**. The engine then **queues the item for triage**. It never permits
  unbounded parallel re-dispatch.
- **Budget and reviewers.** Fan-out spends **one shared budget exit** (loop engineering §3).
  Parallelism does **not** increase the budget. Reviewers are **checkers, never the maker**
  (maker/checker split, non-learnable, loop engineering §12). Worktree isolation is mandatory
  (collective cognition §7). **Human review bandwidth sets the ceiling on safe parallelism**
  (loop engineering §9, "orchestration tax"). More parallel branches than a human can review
  do not create throughput. They create comprehension debt.

## 5. DAG-bounded dynamic routing

- **The primitive.** A node may return `Command{state-update, goto:target}` to compute its
  successor at runtime instead of following a static conditional edge — the routing mechanism
  the literature names, and the shape that makes error-recovery routes first-class.
- **Why this is the highest-risk element, and the limits that make it safe.** A router that
  "computes the next step at runtime" is exactly the shape that could bypass a human-gate.
  Therefore:
  1. **`goto` targets must already exist in the frozen plan DAG.** Routing chooses among
     **pre-declared** edges; it can never invent a node, a new merge target, or a new
     acceptance criterion at runtime. A new criterion still requires a **new work package**
     (frozen-criteria rule); merge targets stay those the **Autonomy Grant** names.
  2. **`goto` may never route around** the checker node, the human-checkpoint, or the Art. 5
     prohibited-practice hard stop.
  3. **In an unattended run, routing may not reach any irreversible link the grant does not
     name** — those stay queued.
  4. **Controlled cycles are bounded** by the iteration ceiling and no-progress detection
     (loop engineering §3); a **fixer cycle** (evaluator vetoes → routes state back to a
     designated fixer node) is charged against the **three-correction-round budget**, so
     routing-back can never spin unbounded.
- If any of those four clauses is softened, this section becomes a **cut**, not a revise —
  the routing primitive is only admissible while every escape stays closed.

## 6. Node-level observability

- **Identity.** A run already carries `run_id` (`CLAUDE_TT_RUN_ID`) and a coarse
  package-id-as-node. A topology adds **`graph_id`** and a fine **`node_id`**, propagated as
  stable metadata on every node's work.
- **Bifurcated trace planes.** The **ORCHESTRATOR** plane is the source of truth for topology
  and state transitions. A separate **LEDGER/GATEWAY evidence sidecar** collects per-node
  **cost, tokens, latency, and policy outcome**. Cost was previously tracked only as a *budget
  exit*; here it is tracked as **attribution**.
- **What the attribution buys.** Node-level cost lets the engine route an expensive node to a
  cheaper model, semantic-cache a repeated sub-task, and fall back a flaky endpoint — and it
  makes **cost-per-successful-completion** (§7) measurable per node. Debugging becomes
  observability work, not "vibes".
- **Honest limits (stated, not assumed away).** This is **observability only** — it is
  explicitly **not** an enforcement gateway. The guard remains a **string matcher**, and
  **MCP tools bypass it**; there is a real node-level *attribution* gap wherever a tool routes
  around the guard, and this reference states it rather than pretending the sidecar closes it.
  It records **metadata, never judgment content** — the checker's §2b isolation holds. Per-node
  numbers sit **under** the four stacked exits as attribution, **never** a fifth exit. Acting
  on the attribution (cheaper-model routing, caching) is a **hill-climbing proposal** that
  lands interactively; self-modification stays never-grantable.
- **Activation-gated.** Zero overhead on trivial, single-package, or `graph=off` turns —
  node telemetry engages only for genuinely multi-node runs.

## 7. The Decision Matrix + the 5-stage method + typed edges

### 7a. The Graph-vs-Loop Decision Matrix (the entry gate)

The **default answer is NO GRAPH**; the burden of proof is on graphing. Three tests, all
required:

1. **Shape.** Is the work **multi-hop / relational**, or does it have **genuinely independent
   units** to parallelize? Graphs win multi-hop (GraphRAG-Bench 53.4% vs 42.9%, directional);
   they **lose** on simple lookups and single-path work.
2. **Break-even.** Is the measured **pass rate per cycle above ~50%**? Graphs cost **more
   tokens per cycle**; below break-even a graph costs **more per successful completion** than
   the loop. (These are secondary numbers — §0.)
3. **Metric.** Track **cost-per-successful-completion**, not wall-clock. A 3× wall-clock
   collapse that triples token cost and halves pass rate is a **loss**.

Fail any test → the graph is a **denied escalation**, reported with its reason, and the run
stays a loop. This only *raises* the bar over the operating rule "match retrieval effort to
question complexity"; it never loosens a human-gate.

### 7b. The 5-stage graph adoption method

**Audit → Identify → Design → Implement → Type.**

1. **Audit** — baseline the sequential loop: steps, retry rate, latency, token cost. **No
   measured baseline → the graph is rejected** (the anti-hype posture, mechanical).
2. **Identify** — find genuinely independent operations to parallelize. **If none exist, halt
   to a loop** — there is nothing to make concurrent.
3. **Design** — topology, routes, and **error-recovery paths designed in from the start**
   (loop engineering §1a: "designed in, not bolted on").
4. **Implement** — async runtime, under the four stacked exits.
5. **Type** — add typed relationship edges (§7c). The graph still terminates in the **same
   runnable Acceptance Gate rungs** as the loop.

### 7c. Typed edges (the reasoning vocabulary)

The closed seven-relation set: **`supersedes / depends_on / decided_by / caused / implements
/ blocks / references`**. An **untyped "related to" edge is banned** — it is useless for
reasoning and forbidden. The engine already ships two of these as fragments: `supersedes`
(the memory-consolidation edge) and `depends_on` (work-package ordering); the Type stage
completes the vocabulary. Entity-resolution accuracy (graphrag lane §5) determines whether
multi-hop traversal over these edges is trustworthy.

## 8. The never-graphable surface (hard limits on topology)

This is the single most important section: it **ports the never-grantable surface and the
four stacked exits onto graph topology**, closing the laundering paths a graph opens. It only
ever **tightens**.

1. **A human-gate is never a node.** No topology may represent a human approval as an
   auto-satisfiable node, route a `goto` around it, or let a concurrent branch proceed past
   it. "The graph did it" is **not an audit answer.**
2. **Exogenous anchors propagate values in but are never modifiable nodes or optimization
   targets.** Frozen acceptance criteria, the signed grant, and human checkpoints feed the
   topology; no edge writes back to them.
3. **The compound-cost abort (§4) is absolute** — no configuration lifts the one-round
   re-dispatch cap on a fully-failed fan-out.
4. **A node-transition cap sits UNDER the four stacked exits.** A ~10–25 transition ceiling
   bounds a topology *in addition to* the iteration ceiling, budget, and no-progress
   detection — never in place of them.
5. **Never-graphable, whatever the edge.** Production deploys (including a merge into any
   target whose pipeline reaches production), force-push, `reset --hard`, publishes,
   destructive deletes, schedules, pipeline rerun/cancel, and **every part of the harness
   itself** (skills, hooks, agents, `CLAUDE.md`, `settings.json`, `.mcp.json`, the grant file)
   stay never-grantable whether reached by a delivery link **or a graph edge**. No topology
   widens the grant; the guard fails closed.

## 9. Paired antagonistic counter-metrics (the Goodhart rung)

- **The rung (genuinely new).** When an Acceptance Gate carries an **optimization target** —
  "make X faster / cheaper / higher / lower" — that target must **not travel alone**: it is
  **paired** with an **antagonistic counter-metric** (one that degrades as the primary is
  optimized) and grounded against an **ungameable anchor**. The checker then asks not only
  "does this meet the criterion?" but "**did optimizing X degrade counter-metric Y past its
  anchor?**" — defeating the Goodhart case (the bot that closes tickets by deflecting them).
- **Hard limits that keep it from diluting anything.**
  - **Never pair a counter-metric to a binary correctness or safety gate.** Tests pass,
    compiles, no Art. 5 violation — those stay **absolute**. The rung augments *optimization*
    targets only; it never softens a pass/fail rung or the Art. 5 hard stop.
  - **The counter-metric must be a measurable exit-code probe** wherever one exists. A
    model-judgment counter-metric is permitted **only** as a sub-agent checker, **never** the
    maker (maker/checker + §2b isolation intact).
  - **The anchor must be one of the existing non-modifiable exogenous anchors** — a frozen
    held-out check, a physical measurement, a human checkpoint — so a counter-metric can never
    become "another optimizable node in the same echo chamber."
  - **Declaring, re-pairing, or dropping a counter-metric is target-setting**, owned by the
    **slower interactive cycle** (timescale separation). An unattended run may only
    **measure, report, and queue** — never re-pair in-run. Hill-climbing may **add**
    counter-metrics, never remove them.
  - **A counter-metric breach routes to the escape hatch** as an honest terminal signal —
    **never a gameable fifth exit, never overriding the four.**
- **Dormant by default.** Pure-correctness, trivial, and no-optimization-metric turns carry no
  counter-metric. The rung engages only when a "make X better" target exists — precisely the
  Goodhart-risk surface.

## 10. Write path

Collection `thinktank-memory` via the `qdrant-thinktank` MCP server;
`workflow=agentic-engineering`; graph knowledge carries `domain=graph-engineering`.
Find-before-store; consolidate near-duplicates with `supersedes`. Additional write trigger:
**graph recipes** — topology decompositions that beat the sequential loop on
cost-per-successful-completion, reducer choices that held, GraphRAG win/lose calls with
break-even evidence, counter-metric pairings that caught a real drift, node-cost
attributions. Never store secrets, transcripts, raw payloads, or raw traces. Guard: recipes
may only **tighten** gates; the four stacked exits, the maker/checker split, the human-gates,
and the never-graphable surface are **not learnable**, and an unattended run may never
self-modify the routing gate or the lane-selection policy (§8; graphrag lane §3).
