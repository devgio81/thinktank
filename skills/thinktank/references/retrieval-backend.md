# Retrieval Backend — Local Qdrant Map, Routing & Loop Hooks

## The backend is local

Memory runs on `mcp-server-qdrant` against a **local** Qdrant instance at `http://localhost:6333`, using a Docker container with the `qdrant/qdrant:v1.19.0` image (pinned in `docker-compose.yml`; `:latest` would let the engine change under an existing storage volume). The MCP server computes embeddings client-side through fastembed (`sentence-transformers/all-MiniLM-L6-v2`, 384 dimensions, cosine). Nothing leaves the machine: there is no external embedding service, hosted vector database or tunnel to keep alive.

That is a deliberate choice, not a limitation to work around. Engineering memory contains repository specifics, past decisions and hard-won pitfalls. Keeping it local ensures that a memory write can never become an exfiltration path, and the engine continues to work without a network connection.

Start the container before a session that needs memory:

```bash
docker run -d --name qdrant_local \
  -p 6333:6333 -p 6334:6334 \
  -v qdrant_storage:/qdrant/storage \
  qdrant/qdrant:v1.19.0
```

An existing container comes back with `docker start qdrant_local`; `docker ps` confirms it is running.

## Backend map

| MCP server | Collection | Role | Write |
|---|---|---|---|
| `qdrant-thinktank` | `thinktank-memory` | Engine memory and the knowledge-acquisition sync target | yes |
| `qdrant` | `memory` | Cross-project knowledge that was never engine-specific | read; explicit cross-project writes only |

`mcp-server-qdrant` creates collections on the first store, so a fresh container requires no schema step. It also starts empty. During the first sessions against a new instance, nearly every lookup will miss. That is normal for a cold cache and does not indicate a broken backend.

## Configuration

Both servers are ordinary MCP entries. The engine's own memory server:

```json
{
  "mcpServers": {
    "qdrant-thinktank": {
      "command": "uvx",
      "args": ["mcp-server-qdrant"],
      "env": {
        "QDRANT_URL": "http://localhost:6333",
        "COLLECTION_NAME": "thinktank-memory",
        "EMBEDDING_MODEL": "sentence-transformers/all-MiniLM-L6-v2"
      }
    }
  }
}
```

A local instance runs without authentication, so that configuration block needs no API key. If you point the same configuration at a secured instance, put the key in the environment, never in a file that could be committed.

Two operational details can cost time when overlooked. Configuration changes take effect only after an MCP reconnect or an application restart, so editing the file alone does not change the running session. Back up the configuration file before editing it. A timestamped copy alongside the original is enough.

## Read routing

1. Query `qdrant-thinktank` first for every memory query.
2. Use the generic `qdrant` server only for cross-project knowledge that was never specific to this engine.
3. On a miss for a **knowledge-acquisition** query — a definition, a mechanism, a comparison, domain background — escalate to the acquisition lane (see `knowledge-acquisition.md`), and only then to `docs-web`.
4. On a miss for anything else, go to the lane the question actually belongs to: current-repo questions to code search, volatile external facts to docs-web.
5. Never fan one query across every backend by default. Escalation happens on a miss, one step at a time.

Local code truth outranks memory for any question about the current repository. A stored memory describing how a file used to work loses to the file.

## Write routing

- New memories go to `qdrant-thinktank` with `workflow=agentic-engineering`.
- Facts from the acquisition lane go to the same collection, carrying their acquisition provenance (`source=notebooklm`, `notebook_id`, `cited_sources`, `retrieved`, `ai_generated=true`).
- Find-before-store is mandatory. On a near-duplicate, write the consolidated improvement and set `supersedes` on the entry it replaces, rather than adding another fragment beside it.
- Never store secrets, tokens, passwords, raw personal data, customer payloads, confidential content, raw documents, long quotes, or long logs.
- Timeline and legal facts additionally carry their retrieval date and a re-verify note, because they expire.

## Degraded mode

Two independent failure paths, each with its own report line:

**Qdrant down.** Qdrant is down if `curl http://localhost:6333/collections` fails or times out, or if `qdrant-find` returns errors twice in a row. Declare `memory unavailable (local qdrant down)` once, then stop all memory reads and writes for the session. Recovery usually requires `docker start qdrant_local`. The acquisition lane can still answer the current question, but it cannot write back, so queue the acquired facts under `memory capture status: queued (qdrant down)` and report them at the end.

**Acquisition lane unavailable.** The lane is unavailable if it lacks configuration or authentication, has no relevant notebook, or has reached the daily query limit. Record the gap and continue with docs-web and local code truth.

With both down, the engine relies on local code truth and official documentation, and states both gaps explicitly. Never simulate a hit or fabricate an answer or citation to cover a gap. An honest gap is a usable input to the next decision. An invented fact is not.

## Loop hooks

The acquisition lane touches the retrieval state machine in exactly two places. It changes nothing else: the retrieval budget, the one-rewrite-per-query limit, the grading rubric, the groundedness gate, and the evidence ledger all remain the same.

- **ROUTE.** Knowledge-acquisition queries gain a lane, ordered `memory → notebooklm → docs-web`.
- **DECIDE.** A `weak` or `empty` verdict from Qdrant on a knowledge-acquisition query triggers `ACQUIRE → GRADE → SYNC (write-back) → accept into ledger`. This spends the query's single lane escalation. It does not add retrieval rounds.

The write-back is what makes the lane worth having. Without it, every session pays for the same acquisition again. With it, the miss happens once.
