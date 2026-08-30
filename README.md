# ThinkTank

An engineering engine for Claude Code.

Built by Martin Tomczak — https://tomczak.dev

## What this is

ThinkTank is a set of skills, subagents and hooks that replaces Claude Code's default "plan a little, then write code" behaviour with a disciplined engineering loop. It gathers evidence before planning, records what it accepted and rejected, and never declares its own work finished. In delivery mode, it carries a change through commit, pull request, merge, deploy and a browser check before it marks a work package as done.

This is not a framework to build against. It consists of instructions, agent definitions and two shell hooks that live in `~/.claude/` and change the agent's behaviour.

## What the engine does

- **Agentic retrieval against a local Qdrant.** The engine plans each query, routes it to the cheapest lane capable of answering it, and grades the results for relevance, authority, freshness and conflict. It records every accepted claim, rejected hit and remaining gap in an evidence ledger. Before producing substantial output, a groundedness gate checks load-bearing claims against that ledger. Memory lives at `http://localhost:6333` in a collection named `thinktank-memory`. A governed write path requires find-before-store, consolidation with `supersedes`, and a sanitation gate that blocks secrets and personal data.
- **A delivery loop with an Acceptance Gate.** The agent states the stop condition in domain terms, such as "a customer can complete checkout", and compiles it into named rungs that run real commands and return real exit codes: static, unit, integration, e2e, browser. If the repository lacks a rung, the agent reports absent evidence rather than a passed check. The work package, not the turn, is the unit of iteration. Package state lives in `.thinktank/work-packages.md` in the repository, and the agent freezes acceptance criteria before implementation begins.
- **Four stacked exits.** Every loop respects a verifier, an iteration ceiling, a token and wall-clock budget, and no-progress detection. Each exit reports the evidence behind it. None silently becomes "done".
- **Maker/checker separation.** The agent that performs the work never decides whether the work is finished. A separate checker reruns the rungs instead of trusting reported exit codes. Non-trivial changes also receive an independent review from a context with no stake in the output.
- **An EU AI Act rung.** Every task undergoes an AI-touchpoint scan. The agent classifies a touchpoint by risk before writing code. It then compiles the applicable obligations into acceptance criteria and a compliance rung on the verify ladder, with a dedicated lens in the independent review. Prohibited practices under Art. 5 trigger a hard stop, not a warning. If no touchpoint exists, there is no compliance overhead.
- **Optional graph topology.** If a task can prove that it is multi-hop or contains genuinely independent parallel units, the engine can promote the sequential loop to an explicit directed graph of typed nodes. A typed shared-state object flows along the edges. Reducers must be deterministic. An LLM-judged merge of a contested field is forbidden because it reintroduces self-grading. `goto` routing can target only nodes already included in the frozen plan, and it can never bypass the checker or the hard stop. A Decision Matrix determines whether the task earns promotion. By default, it does not use a graph.
- **Optional agent teams.** If a task offers separable parallel value, such as review lenses, competing hypotheses or cross-layer features, the work can expand from one context to several teammates. They share a task list and challenge one another's findings before any claim enters the ledger.
- **Optional NotebookLM knowledge lane.** When a knowledge question produces a memory miss, the engine can consult a NotebookLM notebook. It grades the response as untrusted AI-generated data against the cited sources, then syncs the sanitized fact back into Qdrant so the next read produces a hit.

## Repository layout

```
skills/
  thinktank/          the engine contract plus its references
  tt-loop/            launcher for a gated, unattended delivery run
  tt-brainstorm/      structured brainstorming lane
agents/               five subagent definitions
hooks/                the two loop-mode shell hooks
scripts/
  init-collections.sh creates the thinktank-memory collection (install.sh
                      fails without this file)
  migrate-collection.sh
                      copies a collection you name into thinktank-memory
  qdrant-mcp-launcher.sh
                      starts the MCP server with the API key read from .env,
                      so the key never reaches a command line
                      (install.sh fails without this file)
  lib/load-env.sh     reads .env without executing it, and without letting it
                      overwrite variables already set in the environment
                      (install.sh fails without this file)
  lib/preflight.sh    step 1's checks: whether every ~/.claude directory step 6
                      actually has to write into can be written to, and the URL
                      and port helpers step 2 uses
                      (install.sh fails without this file)
  lib/curl-auth.sh    passes the API key to curl through a mode-0600 config
                      file, so it never appears in a command line
                      (install.sh, init-collections.sh and
                      migrate-collection.sh fail without this file)
docs/                 setup notes
install.sh            copies skills/, agents/ and hooks/ into ~/.claude/
docker-compose.yml    the local Qdrant service
.env.example          template for .env, which install.sh creates
LICENSE               MIT
```

## Requirements

- **Claude Code**, recent enough to support skills, subagents and hooks.
- **bash 3.2 or newer.** Every script here is bash, not POSIX `sh`: they use arrays, `[[ ]]` and process substitution. Version 3.2 is what macOS still ships and what these scripts are tested against, so no newer bash is needed.
- **Docker** with the **Compose v2 plugin**, to run Qdrant locally. Step 1 checks that the daemon answers, not merely that the CLI is installed. The standalone v1 `docker-compose` is accepted with a warning.
- **curl.** The installer communicates with Qdrant over HTTP for the readiness poll, the collection check, and the entire smoke test. Step 1 of 9 stops if curl is missing.
- **uv / uvx**, to run the Qdrant MCP server without a global install. Either one is enough: where only `uv` is on `PATH`, the installer records `uv tool run` instead of `uvx`.
- **jq — required, not optional.** Both hooks use it to read their payloads, and the loop guard extracts the tool name and shell command from that payload before deciding what to do. Without jq, the guard denies every tool call in loop mode, including harmless ones. When it cannot decide, it refuses the call rather than letting it through. An unattended run on a machine without jq therefore cannot start at all, and step 1 of the installer refuses to continue without it.
- **`gh` CLI** — required for delivery mode, optional otherwise. The guard also uses it to resolve a pull request's actual base branch instead of trusting the command line. If gh is missing, the guard denies an otherwise permitted merge rather than waving it through. Delivery mode additionally needs whatever e2e runner the target repository uses for the browser rung.
- `openssl` and `uuidgen` are used when available, but neither is required. The installer falls back to `/dev/urandom` for both the API key and the smoke-test id.

## Installation

```bash
git clone https://github.com/devgio81/thinktank.git
cd thinktank
./install.sh
```

Clone it somewhere it can remain. The MCP registration points to
`scripts/qdrant-mcp-launcher.sh` inside this directory, and `docker compose` also needs the
file. If you later move the clone or delete it during a tidy-up, the memory backend stops
starting. No error message explains why. The memory tools simply disappear from the session.

`install.sh` runs nine steps: it checks the prerequisites, writes a `.env` with a freshly
generated API key, starts Qdrant through `docker-compose.yml`, waits for the instance to
report ready, creates the `thinktank-memory` collection, copies the skills, agents and hooks
into `~/.claude/`, registers the MCP server, and prints the hook block for your
`settings.json`.

Step 9 ends with a smoke test that writes a point, reads it back by id, searches against the
named vector, and then deletes the point. The search is the decisive rung. A collection built
with an unnamed vector handles every other request correctly. It fails only here, during the
first real recall.

You do not need to start Qdrant first. Step 3 starts the container defined in
`docker-compose.yml`. Once `.env` exists, you can also start it yourself from this directory
with `docker compose up -d`.

If port 6333 is already taken, do not free it — move ThinkTank instead. 6333 is the Qdrant
default, and anyone installing a RAG engineering kit is likely to have a Qdrant of their own
on it already. Set both of these in `.env`, in the same edit:

```
QDRANT_HOST_PORT=6343
QDRANT_URL=http://localhost:6343
```

The first moves the port `docker-compose.yml` publishes; the second is the address the
installer and the MCP server connect to. Inside the container Qdrant still listens on 6333,
and the compose healthcheck still checks 6333, because that check runs inside the container.
`QDRANT_GRPC_HOST_PORT` (default 6334) moves the gRPC port the same way.

The installer does not derive one setting from the other — `QDRANT_URL` may legitimately name
a host this compose file does not manage, and rewriting its port from a local compose setting
would silently redirect a deliberate choice. Step 2 compares the two instead and stops, naming
both values, if a local `QDRANT_URL` disagrees with `QDRANT_HOST_PORT`.

Step 1 also checks that every `~/.claude` directory step 6 actually has to write into can be
written to, before step 6 copies anything. A read-only `~/.claude/hooks` is a hardening this
engine recommends itself (see *Filesystem hardening* in
`skills/thinktank/references/delivery-loop.md`): without the write bit on the directory, no
one can rename or replace the guard hook — including this installer, whose backup step is a
rename.

The check compares before it blocks, and the difference matters if you have applied that
hardening. It reads each tree file by file — reading still works at `dr-x------` — and asks
not "is this directory writable" but "does anything in it have to be written". A read-only
directory that already holds exactly the files this kit ships is announced, skipped, and the
run continues; step 6 then reports that tree as **skipped**, never as installed. Only a
directory that has to receive a missing or changed file stops the run. Without that
distinction, following the hardening advice would lock you out of your own installer — you
could not re-run it to smoke-test the backend or to catch up a missing MCP registration.

When it does stop, it names the directory and its mode, and prints the three commands
(unlock, install, lock again) for you to run. It never lifts the protection itself.

The API key never reaches a command line anywhere in this repository. `claude mcp add` is
called without it (the launcher reads it from `.env` at startup), and every `curl` call in
`install.sh`, `init-collections.sh` and `migrate-collection.sh` takes it from a mode-0600
config file via `-K` rather than from `-H "api-key: …"` — an argument is visible to any local
process in `ps` for as long as the call runs. See `scripts/lib/curl-auth.sh`.

The script deliberately leaves two things to you. It never edits your `settings.json`, and it
never rotates an API key already stored in `.env`. As a result, a second run cannot cut the
running container off from its own key. If `.env` exists but contains no key, the installer
adds one and leaves the rest of the file unchanged.

`install.sh` already registers the memory backend. To do it by hand, merge the entry below into
the `mcpServers` object you already have — do not paste the whole block over your configuration,
or the other servers in it disappear:

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

There is no `QDRANT_API_KEY` in that block on purpose. The launcher reads the key from `.env` (mode 600) when the server starts, so it stays out of your configuration file, out of your shell history and out of the process list. Set `THINKTANK_UVX_CMD` to `uv tool run` if `uvx` is not on your `PATH`.

The collection uses a **named** vector — `fast-` plus the lowercased model name, so `fast-all-minilm-l6-v2` for the default model. That is what `mcp-server-qdrant` reads and writes. A collection created with an unnamed vector answers every REST request correctly and then fails on the first store with `Not existing vector name error`. `scripts/init-collections.sh` creates the right shape, and step 9 of `install.sh` proves it with a real write, search and delete.

## After installing: wire the hooks

The two hooks are what make unattended runs safe, and Claude Code only runs hooks that are listed in `settings.json`. Merge this into `~/.claude/settings.json` — merge it, do not overwrite the file:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "$HOME/.claude/hooks/tt-loop-guard.sh" }
        ]
      }
    ],
    "TaskCompleted": [
      {
        "hooks": [
          { "type": "command", "command": "$HOME/.claude/hooks/tt-loop-completion-gate.sh" }
        ]
      }
    ]
  }
}
```

Two details in that block are load-bearing. `PreToolUse` carries `"matcher": "*"`, because the
guard has to see every tool call, not only Bash. `TaskCompleted` carries no matcher, because it
is not a tool event and there is nothing to match on. And the paths are written with `$HOME`
rather than `~`: the command runs through a shell, which expands the variable reliably, whereas
a tilde that survives unexpanded points at a directory that does not exist. The hook then fails
to start, and a hook that never runs gates nothing while looking exactly like one that does.

Both hooks are a no-op unless `CLAUDE_TT_LOOP_MODE=1` is set in the process environment, so interactive sessions are untouched. Never put that variable into `settings.json` — a slash command must not be able to arm loop mode for its own session.

Now restart Claude Code. The MCP server, the new skills and the hooks are all read at startup,
so none of them appear in a session that was already running.

Then: `/thinktank <task>` for interactive engineering work, `/tt-loop <goal> until=<domain condition>` to start a gated unattended run, `/tt-brainstorm <topic>` for the brainstorming lane.

## What is not included, and what does not work

This section matters more than the feature list.

- **The loop guard is a string matcher, not a security mechanism.** It reads a single command line and makes a decision. It cannot parse a shell, resolve variables or follow redirects, so commands assembled from separate pieces bypass it. Real protection comes from filesystem permissions and from running the loop in an environment that cannot access anything you care about. Treat the guard as a seatbelt that protects against an agent's mistakes, not as a defence against an attacker.
- **The guard sees every tool call, but what it recognises depends on two lists.** Because it uses the matcher `"*"`, an MCP call reaches it in exactly the same way as a Bash call. Beyond the shell command line, the guard judges tools by name. A fixed list blocks tools for publishing, remote triggers, messaging, scheduling, cloud deploys, and access to the operator's real Chrome and desktop. A heuristic also blocks any MCP tool whose name contains a mutating verb such as create, update, delete, publish, send, upload, deploy or merge. Both methods rely on enumeration. A mutating tool passes straight through if its name appears in neither list, and the gap is wider than it sounds: a sweep of one ordinary session found sixteen of twenty-five mutating tools passing. Among them an ad-platform apply step (`confirm_and_apply`), a search-console call (`submit_sitemap`), a notebook tool that makes a notebook publicly readable (`notebook_share_public`), and cloud tools whose single name hides full resource CRUD (`azure__storage`, `azure__sql`). Extend both lists for every server you connect. Never assume a server is covered simply because it is dangerous.
- **No hook can tell the maker from the checker.** Both run in the same process. The completion gate makes a fake record harder to create, but the contract and independent review enforce the maker/checker split. A file on disk cannot.
- **Agent teams are an experimental Claude Code feature, and the kit ships no roster.** They require a feature flag and may break without warning. When the flag is unset, the engine runs without them. Beyond the flag, teammates are spawned from subagent definitions by name, and the five definitions in `agents/` are the engine's own — a review team needs definitions you write yourself.
- **The NotebookLM lane is optional, and turning it on is your job.** It needs the `gemini-notebook-mcp` server connected to your session and an authenticated Google account (`nlm login`). Neither is part of `install.sh`. Without them the lane stays unavailable and the engine reports the gap rather than inventing an answer. The free tier allows roughly 50 questions per day.
- **The EU AI Act dates are volatile.** Deadlines and interpretations of individual articles can change. Recheck official sources whenever a date affects the outcome. The engine produces an engineering assessment. A lawyer or data protection officer remains responsible for legal and launch decisions.
- **The Decision Matrix numbers are directional.** The break-even figures used to decide whether a graph outperforms a loop come from published comparisons, not from benchmarks of this repository. Measure them again before relying on them.
- **Delivery mode requires a real staging environment.** Without an environment where the browser pass can run, the engine records that rung as absent. It cannot prove a package that depends on the missing pass.
- **Force-pushes, publishes and schedules are blocked. "Production" requires human judgement.** The never-grantable list is real and testable: the guard denies `git push --force`, `npm publish`, `crontab`, `gh release`, `gh run rerun`, the scheduling tools, and every write to the installed harness under `~/.claude/`, whether or not a grant is in force. A production deployment is different in kind. A grant identifies its merge targets by branch name, but no hook can see where a branch's pipeline ships. A grant that lists `dev` allows a merge into `dev` even when that pipeline deploys to production. The grant records the destination in `merge_targets_deploy_to`, but that field serves as a declaration for the person reading the grant, not as an input to the guard. This promise depends on the care of the person who signs the grant, not on the code.

## Cognitive Mode

Cognitive Mode is a functional emulation. The engine follows an explicit cognitive cycle, states its capability limits before acting and commits to Controllability, Corrigibility and Honesty. This structure guides an agent's reasoning. It makes no claim about machine consciousness, general intelligence or anything similar. The alignment triad reinforces the human gates but never replaces them.

## Who built this

Martin Tomczak, Senior KI-Softwareentwickler. He works with B2B companies in the DACH region on AI software, RAG systems and process automation. Learn more at https://tomczak.dev.

## License

MIT. See [LICENSE](LICENSE).
