# Retrieval — Backend, Routing And Degraded Mode

This is the single source of truth for where memory lives, how a query is routed to it, how it is
written back, and what happens when the backend is unreachable. Nothing else in `references/`
restates these rules.

## The backend is local

Memory runs on `mcp-server-qdrant` against a **local** Qdrant instance at `http://localhost:6333`,
started from the `docker-compose.yml` in the ThinkTank repository. The service is named `qdrant`,
the container is named **`thinktank-qdrant`**, and the image is pinned to `qdrant/qdrant:v1.19.0`
(`:latest` would let the engine change under an existing storage volume). The MCP server computes
embeddings client-side through fastembed (`sentence-transformers/all-MiniLM-L6-v2`, 384 dimensions,
cosine). Nothing leaves the machine: there is no external embedding service, hosted vector database
or tunnel to keep alive.

That is a deliberate choice, not a limitation to work around. Engineering memory contains repository
specifics, past decisions and hard-won pitfalls. Keeping it local ensures that a memory write can
never become an exfiltration path, and the engine continues to work without a network connection.

**The instance requires an API key.** `docker-compose.yml` sets `QDRANT__SERVICE__API_KEY` from
`QDRANT_API_KEY` in `.env` and refuses to start without it; `install.sh` generates the key on first
run and writes `.env` with mode 600. The ports are bound to `127.0.0.1` on purpose — the key is the
second line of defence, not the first. Every REST call therefore carries an `api-key` header, and a
call without one gets `401 Must provide an API key or an Authorization bearer token`, **not** a
connection error.

Start the container from the repository root, where `docker-compose.yml` and `.env` live:

```bash
docker compose up -d          # first start, or after `docker compose down`
docker compose ps             # confirms it is running
```

The service declares `restart: unless-stopped`, so it comes back with the Docker daemon. An existing
container that was stopped by hand restarts with `docker start thinktank-qdrant`. Do not start a
Qdrant of your own beside it: a hand-started container occupies port 6333 and the compose service
then fails.

## Backend map

| MCP server | Collection | Role | Write |
|---|---|---|---|
| `qdrant-thinktank` | `thinktank-memory` | Engine memory and the knowledge-acquisition sync target | yes |

There is no second ThinkTank collection and no legacy fallback chain. Everything the engine
remembers lives in `thinktank-memory`.

`mcp-server-qdrant` creates the collection on the first store, and `scripts/init-collections.sh`
creates it up front with the **named** vector the server expects (`fast-` plus the lowercased model
name). Either way it starts empty. During the first sessions against a new instance, nearly every
lookup will miss. That is normal for a cold cache and does not indicate a broken backend.

## Configuration

The MCP entry runs the repository's launcher rather than `uvx` directly, so the API key never
reaches a command line, a shell history or the MCP configuration file:

```json
{
  "mcpServers": {
    "qdrant-thinktank": {
      "command": "/absolute/path/to/thinktank/scripts/qdrant-mcp-launcher.sh",
      "args": [],
      "env": {
        "QDRANT_URL": "http://localhost:6333",
        "COLLECTION_NAME": "thinktank-memory",
        "EMBEDDING_MODEL": "sentence-transformers/all-MiniLM-L6-v2",
        "THINKTANK_UVX_CMD": "uvx"
      }
    }
  }
}
```

`install.sh` registers exactly this. The absence of `QDRANT_API_KEY` from that block is the point:
the launcher reads the key out of `.env` at server start. Set `THINKTANK_UVX_CMD` to `uv tool run`
when `uvx` is not on the `PATH`. Invoking `uvx mcp-server-qdrant` directly instead of the launcher
works only if you also supply the key yourself — and then it lives in a configuration file, which is
what the launcher exists to avoid.

Two operational details cost time when overlooked. Configuration changes take effect only after an
MCP reconnect or an application restart, so editing the file alone does not change the running
session. And back up the configuration file before editing it; a timestamped copy alongside the
original is enough.

## Read routing

1. Query `qdrant-thinktank` first for every memory query.
2. On a miss, do not re-run the same query against another store. Escalate the *lane* instead, in
   this order: `memory` → `code-search` / `project` → `best-practices` → `docs-web`.
3. On a miss for a **knowledge-acquisition** query — a definition, a mechanism, a comparison, domain
   background — escalate to the acquisition lane (`knowledge-acquisition.md`) *before* `docs-web`,
   and write the acquired fact back so the next read is a hit.
4. On a miss for anything else, go to the lane the question actually belongs to: current-repo
   questions to code search, volatile external facts to docs-web.
5. Never fan one query across every backend by default. Escalation happens on a miss, one step at a
   time, and only for queries that matter.

Local code truth outranks memory for any question about the current repository. A stored memory
describing how a file used to work loses to the file. For past decisions and pitfalls, memory
outranks intuition.

## Write routing

- New memories go to `qdrant-thinktank` with `workflow=agentic-engineering` and the `domain` tag
  matching the kind of knowledge.
- Facts from the acquisition lane go to the same collection, carrying their acquisition provenance
  (`source=notebooklm`, `notebook_id`, `cited_sources`, `retrieved`, `ai_generated=true`).
- Find-before-store is mandatory: query the draft's title and key phrases first. On a near-duplicate,
  write the consolidated improvement and set `supersedes` on the entry it replaces, rather than
  adding another fragment beside it.
- Never store secrets, tokens, passwords, raw personal data, customer payloads, confidential content,
  raw documents, long quotes, or long logs.
- Timeline and legal facts additionally carry their retrieval date and a re-verify note, because they
  expire.

## Degraded mode

Two independent failure paths, each with its own report line.

**Qdrant down.** The probe carries the key, because a keyless call to a healthy instance answers
`401` and would otherwise be misread as an outage:

```bash
curl -sS -H "api-key: $QDRANT_API_KEY" http://localhost:6333/collections
```

Three outcomes, three different conclusions:

| Result | Meaning | Action |
|---|---|---|
| HTTP 200 with a collection list | The backend is healthy | The problem is elsewhere — do not declare memory unavailable |
| HTTP 401 | The instance is **up**; the key is missing or wrong | A configuration fault, not an outage. Check `QDRANT_API_KEY` in `.env` against the container's environment |
| No connection, or a timeout | The container is not running | Declare memory unavailable |

`GET /readyz` answers without a key, so it separates the two cases when the key itself is in doubt: a
`200` from `/readyz` alongside a `401` from `/collections` means the instance is running and only the
credential is wrong.

Qdrant counts as down when the keyed probe gets no connection or times out, or when `qdrant-find`
returns errors twice in a row. Then:

1. On the first failed memory call, try one more query to rule out a transient error.
2. On the second failure, declare `memory unavailable (local qdrant down)` **once**: no further
   memory reads or writes for the session, and no per-query retries.
3. Continue the loop with the remaining lanes (project, code-search, best-practices, docs-web,
   runtime).
4. Never fabricate or "estimate" a memory hit. The evidence ledger records
   `memory: unavailable (backend unreachable)`.
5. Capture-worthy learnings go into the final report under
   `memory capture status: queued (backend unreachable)`, so a later session can store them. The
   acquisition lane can still answer the current question, but it cannot write back, so its facts are
   queued the same way.
6. If the user asks why memory is off, say that the local Qdrant instance is not reachable and name
   the container to start: `docker compose up -d` in the ThinkTank repository, or
   `docker start thinktank-qdrant`.

**Acquisition lane unavailable.** The lane is unavailable if it lacks configuration or
authentication, has no relevant notebook, or has reached the daily query limit. Record the gap and
continue with docs-web and local code truth.

With both down, the engine relies on local code truth and official documentation, and states both
gaps explicitly. Never simulate a hit or fabricate an answer or citation to cover a gap. An honest
gap is a usable input to the next decision. An invented fact is not.

## Loop hooks

The acquisition lane touches the retrieval state machine in exactly two places. It changes nothing
else: the retrieval budget, the one-rewrite-per-query limit, the grading rubric, the groundedness
gate and the evidence ledger all remain the same.

- **ROUTE.** Knowledge-acquisition queries gain a lane, ordered `memory → notebooklm → docs-web`.
- **DECIDE.** A `weak` or `empty` verdict from Qdrant on a knowledge-acquisition query triggers
  `ACQUIRE → GRADE → SYNC (write-back) → accept into ledger`. This spends the query's single lane
  escalation. It does not add retrieval rounds.

The write-back is what makes the lane worth having. Without it, every session pays for the same
acquisition again. With it, the miss happens once.

## Embedding model note

The collection is bound to `sentence-transformers/all-MiniLM-L6-v2` (384-dim) for compatibility and
operational simplicity. If retrieval quality on mixed-language content proves weak in golden-query
evaluations, migrate by creating a new collection with a multilingual fastembed model and re-storing
the consolidated memories (`scripts/migrate-collection.sh`) — never by changing the model on an
existing collection. Re-run `golden-query-evaluation.md` after any such change.
