# Retrieval Routing And Degraded Mode

## Backend Map

ThinkTank memory runs `mcp-server-qdrant` against a local Qdrant instance (`http://localhost:6333`, embedding model `sentence-transformers/all-MiniLM-L6-v2`). One MCP server is bound to one collection:

| MCP server | Collection | Role | Write allowed |
|---|---|---|---|
| `qdrant-thinktank` | `thinktank-memory` | ThinkTank memory | yes |

There is no second ThinkTank collection or legacy fallback chain. Everything the engine remembers lives in `thinktank-memory`.

If your environment has a separate generic `qdrant` server, treat it as a different store for cross-project facts that were never specific to ThinkTank. This server is optional. The engine never depends on it.

## Read Routing

1. Query `qdrant-thinktank` for every memory query.
2. On a miss, do not re-run the same query against other stores. Escalate the *lane* instead, in this order: `memory` → `code-search` / `project` → `best-practices` → `docs-web`.
3. For knowledge-acquisition questions (definitions, mechanisms, comparisons, domain background), a miss escalates to the knowledge-acquisition lane before `docs-web`; the acquired fact is then written back so the next read is a hit.
4. Never fan a query out across every configured store by default — escalate only on a miss, and only for critical queries.

Local code truth outranks memory for claims about the current repo. For past decisions and pitfalls, memory outranks intuition.

## Write Routing

- All new ThinkTank memories go to `qdrant-thinktank` with `workflow=agentic-engineering` and `logical_collection=thinktank-memory`.
- Find-before-store is mandatory: query the draft's title and key phrases first; on near-duplicate, store the consolidated improvement with `supersedes: [<old title or id>]`.
- Cross-project, non-ThinkTank facts may go to a generic `qdrant` store instead — never both.
- Never store secrets, tokens, passwords, raw personal data, customer payloads, confidential raw content, raw docs, long quotes, or long logs.

## Degraded Mode

Symptoms of an unreachable backend: `qdrant-find` returns a bare tool error or times out; a request to `http://localhost:6333` gets no TCP connection. The usual cause is that the local Qdrant container is not running.

Rules:

1. On the first failed memory call, try one more query to rule out a transient error.
2. On the second failure, declare `memory unavailable` for the session: no further memory calls, no retries per query.
3. Continue the loop with the remaining lanes (project, code-search, best-practices, docs-web, runtime).
4. Never fabricate or "estimate" memory hits. The evidence ledger records `memory: unavailable (backend unreachable)`.
5. Capture-worthy learnings are written into the final report under `memory capture status: queued (backend unreachable)` so they can be stored in a later session.
6. If the user asks why memory is off, say the local Qdrant instance is not reachable and name the container as the thing to start.

## Embedding Model Note

The collection is bound to `sentence-transformers/all-MiniLM-L6-v2` (384-dim) for compatibility and operational simplicity. If retrieval quality on mixed-language content proves weak in golden-query evaluations, migrate by creating a new collection with a multilingual fastembed model and re-storing consolidated memories — never by changing the model on an existing collection.
