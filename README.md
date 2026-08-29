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
  lib/load-env.sh     reads .env without executing it, and without letting it
                      overwrite variables already set in the environment
docs/                 setup notes
install.sh            copies skills/, agents/ and hooks/ into ~/.claude/
docker-compose.yml    the local Qdrant service
.env.example          template for .env, which install.sh creates
LICENSE               MIT
```

## Requirements

- **Claude Code**, recent enough to support skills, subagents and hooks.
- **Docker**, to run Qdrant locally.
- **uv / uvx**, to run the Qdrant MCP server without a global install.
- **jq**, which both hooks use to read their payload.
- Optional: the **`gh` CLI** for delivery mode, and whatever e2e runner the target repo uses for the browser rung.

## Installation

```bash
git clone https://github.com/devgio81/thinktank.git
cd thinktank
./install.sh
```

`install.sh` runs nine steps: it checks the prerequisites, writes a `.env` with a freshly
generated API key, starts Qdrant through `docker-compose.yml`, waits for the instance to
report ready, creates the `thinktank-memory` collection, copies the skills, agents and hooks
into `~/.claude/`, registers the MCP server, prints the hook block for your `settings.json`,
and finishes with a smoke test that writes a point, reads it back and deletes it again.

Do not start Qdrant yourself beforehand. The script brings up the container defined in
`docker-compose.yml`, and a container you started by hand occupies port 6333 and makes that
step fail.

Two things the script deliberately leaves to you: it never edits your `settings.json`, and it
never overwrites an existing `.env`, so a second run will not rotate your key.

`install.sh` already registers the memory backend. To do it by hand, add this to your MCP configuration:

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
          { "type": "command", "command": "~/.claude/hooks/tt-loop-guard.sh" }
        ]
      }
    ],
    "TaskCompleted": [
      {
        "hooks": [
          { "type": "command", "command": "~/.claude/hooks/tt-loop-completion-gate.sh" }
        ]
      }
    ]
  }
}
```

Both hooks are a no-op unless `CLAUDE_TT_LOOP_MODE=1` is set in the process environment, so interactive sessions are untouched. Never put that variable into `settings.json` — a slash command must not be able to arm loop mode for its own session.

Then: `/thinktank <task>` for interactive engineering work, `/tt-loop <goal> until=<domain condition>` to start a gated unattended run, `/tt-brainstorm <topic>` for the brainstorming lane.

## What is not included, and what does not work

This section matters more than the feature list.

- **The loop guard is a string matcher, not a security mechanism.** It reads a single command line and makes a decision. It cannot parse a shell, resolve variables or follow redirects, so commands assembled from separate pieces bypass it. Real protection comes from filesystem permissions and from running the loop in an environment that cannot access anything you care about. Treat the guard as a seatbelt that protects against an agent's mistakes, not as a defence against an attacker.
- **MCP tools do not pass through the guard.** The guard controls the Bash tool and blocks a named list of outward-facing tools. It does not cover anything accessed through an MCP server available to the session.
- **No hook can tell the maker from the checker.** Both run in the same process. The completion gate makes a fake record harder to create, but the contract and independent review enforce the maker/checker split. A file on disk cannot.
- **Agent teams are an experimental Claude Code feature.** They require a feature flag and may break without warning. When the flag is unset, the engine runs without them.
- **The NotebookLM lane is optional and requires a Google login.** It remains unavailable without an authenticated session, and the engine reports that gap rather than inventing an answer. The free tier allows roughly 50 questions per day.
- **The EU AI Act dates are volatile.** Deadlines and interpretations of individual articles can change. Recheck official sources whenever a date affects the outcome. The engine produces an engineering assessment. A lawyer or data protection officer remains responsible for legal and launch decisions.
- **The Decision Matrix numbers are directional.** The break-even figures used to decide whether a graph outperforms a loop come from published comparisons, not from benchmarks of this repository. Measure them again before relying on them.
- **Delivery mode requires a real staging environment.** Without an environment where the browser pass can run, the engine records that rung as absent. It cannot prove a package that depends on the missing pass.
- **Production is never grantable.** No Autonomy Grant, configuration flag or graph edge permits production deployments, force-pushes, publishing, scheduling or changes to the harness itself. If you need any of these actions, perform them yourself.

## Cognitive Mode

Cognitive Mode is a functional emulation. The engine follows an explicit cognitive cycle, states its capability limits before acting and commits to Controllability, Corrigibility and Honesty. This structure guides an agent's reasoning. It makes no claim about machine consciousness, general intelligence or anything similar. The alignment triad reinforces the human gates but never replaces them.

## Who built this

Martin Tomczak, Senior KI-Softwareentwickler. He works with B2B companies in the DACH region on AI software, RAG systems and process automation. Learn more at https://tomczak.dev.

## License

MIT. See [LICENSE](LICENSE).
