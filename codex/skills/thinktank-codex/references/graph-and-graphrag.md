# Graph topology and GraphRAG

These are independent options: graph topology structures execution; GraphRAG traverses evidence.
Ordinary subagents and dependency ordering do not imply an executable graph. Default is ordinary
bounded execution and vector retrieval. This port supplies contract validators, not a graph runtime.

## Eligibility under current AGENTS rules

For `graph=auto` and `graph=on`, first prove genuinely multi-hop or independent work, measured
cycle pass rate above the applicable break-even and projected lower cost per successful completion.
No local measurements means no promotion claim. The user's policy mentions roughly 50% as a
directional break-even: do not turn old secondary benchmark percentages into evidence for this run.
Verify load-bearing cost assumptions with current measurements. Explicit on does not waive the gate.

Record structure/evidence/cost decision compactly. A denied escalation continues useful ordinary
execution; do not block the whole user task or fabricate metrics just to use a graph.

## Typed plan and bounded runtime

Freeze node IDs, kinds, typed state and permitted edges before execution. Node kinds include LLM,
retrieval, deterministic transform, policy check and verifier. Deterministic work is a function/tool
call. Shared-field reducers are deterministic append-by-ID, unique-key merge and stable union;
retain conflicting variants with provenance for independent evidence review. No majority/last-writer
truth selection or LLM-judged merge of contested fields.

Plan is acyclic. Bounded correction is outside the frozen DAG; no backward goto that creates a
cycle or new target. Routing may only use existing frozen targets and cannot bypass checker,
human checkpoint or the prohibited-use stop. A human approval can be represented as a *waiting
checkpoint placeholder*; the actual response is external, never an auto-satisfiable agent node.
Production deploys, force-push, publishes, schedules and active harness modification are not nodes.

Parallel branches share budget and join before acceptance. Full fan-out failure gets one bounded
redispatch then triage; partial failure withholds dependent tasks. Record observed per-node cost/
tokens/latency when available, never invented superiority. Optimization criteria pair a counter-
metric with an external anchor. Binary correctness/safety gates cannot be offset by another score.

## GraphRAG

Use typed edges over existing local Qdrant, not an invented graph database. Relevant relations:
supersedes, depends_on, decided_by, caused, implements, blocks, references. Use local entity
neighborhoods and supported global community summaries only when actually indexed.

Maximum three hops within the inherited three-round retrieval budget. An ambiguous entity merge
is a human-review gap, never a silent ID conflation. Cite the hop chain and confidence/source for
every multi-hop synthesis. Unsupported indexing/traversal reports unavailable; vector/source
retrieval can continue with the remaining gap. Index only within authorized memory operations.
