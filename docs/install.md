# Installing ThinkTank

ThinkTank is an engineering engine for Claude Code: a set of skills, subagent definitions and two shell hooks that live in `~/.claude/` and replace the default "plan a little, then write code" behaviour with a disciplined loop. It gathers evidence before it plans, records what it accepted and rejected, and never lets the context that did the work decide that the work is finished. It is not a library you build against. Installing it means copying instruction files into place and running one local service.

The installation puts four things on your machine:

- the skills, agents and hooks, copied into `~/.claude/`
- a Qdrant container that stores the memory the engine reads and writes
- an MCP server registration that gives Claude Code access to that memory
- a hook block in your `settings.json`, the only part the installer does not add for you

This page provides the full instructions and stands on its own. The [README](../README.md) contains the short quick start and links to this page.

## Quick start

```bash
git clone https://github.com/devgio81/thinktank.git
cd thinktank
./install.sh
```

Clone the repository somewhere permanent. The MCP registration points to `scripts/qdrant-mcp-launcher.sh` within this directory, and `docker compose` also requires the compose file stored here. If you later move the clone or delete it during a cleanup, the memory backend will stop starting.

The installer accepts no options except `--help`. Configure everything else in `.env`. You can safely run the installer again. It creates anything that is missing, preserves anything already in place, and backs up any file before overwriting it.

## Requirements

Each entry identifies what requires it, so you can decide what to leave out.

### Required

- **Claude Code**, recent enough to support skills, subagents and hooks. Nothing here is useful without it. Claude Code reads the skills at startup from `~/.claude/skills/` and calls the hooks only when `settings.json` lists them. Step 7 also uses the `claude` CLI to register the MCP server. If the CLI is missing, the installer prints the registration block for you to paste instead.
- **bash 3.2 or newer.** Every script uses `#!/usr/bin/env bash` and requires bash rather than POSIX `sh`. The scripts use arrays (`local blocked=()` in `scripts/lib/preflight.sh`), process substitution (`done < <(find ...)` in `install.sh`), `[[ ]]` in `hooks/tt-loop-guard.sh`, `read -r -a` in `scripts/qdrant-mcp-launcher.sh`, and `printf -v` in `scripts/lib/load-env.sh`. macOS still ships version 3.2, which these scripts target, so they do not require a newer bash release.
- **Docker**, with a **running daemon** and the **Compose v2 plugin**. The Qdrant container in `docker-compose.yml` provides the memory backend. Step 1 runs `docker info`, not just `command -v docker`, because finding the CLI on `PATH` does not confirm that the daemon is running. The installer accepts the standalone v1 `docker-compose` with a warning, but the compose file targets v2.
- **curl.** Every interaction with Qdrant uses HTTP, including the readiness poll in step 4, the collection check and creation in `scripts/init-collections.sh`, and the entire smoke test in step 9. Step 1 stops if curl is missing.
- **jq, required and not optional.** `hooks/tt-loop-guard.sh` uses jq to read the tool name and shell command from a JSON payload, and it checks for jq before doing anything else. Without jq, the guard cannot read the payload, so it denies every gated action instead of allowing one through. An installation without jq has no usable loop mode. The installer also uses jq to read the container name from `docker compose config --format json`.
- **uv or uvx.** The memory MCP server runs through uv's tool runner. `scripts/qdrant-mcp-launcher.sh` ends with `exec uvx mcp-server-qdrant --transport stdio`. Either command is sufficient. If only `uv` is on `PATH`, the installer records `uv tool run` instead of `uvx`. These strings are not interchangeable, because recording `uvx` when only `uv` exists registers a nonexistent command.
- **The standard POSIX text tools**: `sed`, `grep`, `find`, `sort`, `head`, `tr`, `cmp`, `mktemp`, `stat`, `date`, `hostname`, `wc`, `awk`. The scripts use `cmp -s` to compare files, `stat` to read modes, and `sed` to parse JSON responses where jq is not guaranteed. Every macOS and Linux system supported here ships these tools. The scripts do not assume either `stat` variant: they try BSD `stat -f` first, then GNU `stat -c`.

### Required for delivery mode only

- **`gh`, the GitHub CLI.** The loop guard uses `gh pr view --json baseRefName` to resolve a pull request's actual base branch instead of trusting the command line. If gh is unavailable at that point, the guard denies the merge rather than allowing it. Delivery mode also requires the end-to-end runner that the target repository uses for the browser rung.

### Optional

- **`openssl`**, for the generated API key. Step 2 calls `openssl rand -hex 24` when openssl is available and falls back to `/dev/urandom` when it is not.
- **`uuidgen`**, for the smoke-test point id in step 9. It uses the same `/dev/urandom` fallback.
- **`lsof`**, used only to identify the process occupying a port. Without it, the installer still detects and reports the port collision, but the message cannot identify the process holding the port.

## What install.sh does, step by step

The nine steps run in the following order. The output announces each one as `== N/9 ... ==`.

### 1/9 Prerequisites

Checks that `docker`, `curl` and `jq` exist, that a Docker daemon responds, that either `docker compose` or `docker-compose` is available, and that `uvx` or `uv` is on `PATH`. It then checks whether step 6 can write the required files to `~/.claude/skills`, `~/.claude/agents` and `~/.claude/hooks`.

That final check deliberately happens five steps early. In one real run, asking during the copy left the installation half-finished: skills and agents were installed, hooks and the MCP registration were missing, and only a raw `mv: ... Permission denied` explained what had happened.

The check compares before it blocks. It reads each tree file by file and asks not "is this directory writable" but "does anything in it need to be written at all". If a read-only directory already contains exactly the files shipped with this kit, the installer announces and skips it, then continues the run. Step 6 reports that tree as skipped, never as installed. The run stops only when a directory needs to receive a missing or changed file. See [Permission denied while copying the hooks](#permission-denied-while-copying-the-hooks).

### 2/9 Environment file

Creates `.env` from `.env.example`, adds a newly generated API key and sets mode 600. It leaves an existing `.env` unchanged and never rotates a key already stored there, because rotation would leave the running container authenticating against the old value. If `.env` exists without a key, the installer generates one and leaves the rest of the file alone.

The installer then reads the file without sourcing it. `scripts/lib/load-env.sh` never executes the file and sets only variables that are not already defined. As a result, a variable from your environment takes precedence, and `COLLECTION_NAME=thinktank-scratch ./install.sh` directs one run elsewhere without requiring an edit.

This step also validates both host ports and compares `QDRANT_URL` with `QDRANT_HOST_PORT`. It does not derive either value from the other. `QDRANT_URL` is a complete address and may legitimately point to a Qdrant instance that this compose file does not manage. Rewriting its port from a local compose setting would silently redirect a deliberate choice. When both values refer to this machine but disagree, the step fails and reports both.

### 3/9 Starting Qdrant

Examines both published host ports before it starts anything, then runs `docker compose up -d`. A port held by a container from this same compose project is fine, because `up -d` is idempotent against its own container. A port held by anything else is a hard stop: the installer will not displace a service you depend on. See [Port 6333 is already in use](#port-6333-is-already-in-use).

The installer reads the container name from the rendered compose file instead of assuming it. This prevents an edited `container_name:` line from producing a success message that names a nonexistent container.

### 4/9 Waiting for readiness

Polls `GET /readyz` for up to 60 seconds. That endpoint returns 503 until the collections and their shards have loaded, which directly answers the readiness question. `/healthz` and `/` return 200 as soon as the HTTP socket is bound, so the installer uses them only when `/readyz` is genuinely unavailable, indicated by HTTP 404 on an older Qdrant version. The output explicitly reports that downgrade. If Qdrant never becomes ready, the step prints the final 30 lines of the container log before failing.

### 5/9 Collection

Runs `scripts/init-collections.sh`, which creates the collection specified by `COLLECTION_NAME` if it does not exist and leaves an existing collection untouched. It never deletes or recreates a collection, and it never changes vector parameters on one that already contains points.

Two values are derived from `EMBEDDING_MODEL` rather than hard-coded. The vector size comes from a table of the models fastembed can load; an unknown model is a hard stop, because a guessed dimension produces a collection that reports success and then rejects the first write with `Vector dimension error`. The vector name is `fast-` plus the lowercased last path segment of the model id, so `sentence-transformers/all-MiniLM-L6-v2` becomes `fast-all-minilm-l6-v2`. A collection created with an unnamed vector answers every REST request correctly and fails on the first store with `Not existing vector name error`.

### 6/9 Installing skills, agents and hooks

Copies `skills/`, `agents/` and `hooks/` into `~/.claude/`. The installer skips files that are already byte-identical and counts them as "already current". If a file differs, the installer first renames it to `<name>.bak.<timestamp>`, ensuring that it never overwrites a file without preserving a copy. It explicitly sets permissions to 0644 for skills and agents and 0700 for hooks, because a hook that gates irreversible actions should not be readable by every local user.

A single failure does not end the step. The installer records each file it cannot install, along with the reason, and continues the walk. As a result, the inventory printed afterwards covers every file, not just those processed before the first problem. If any file fails, the step stops the run and states plainly that steps 7, 8 and 9 did not run.

This step also reports files left over from an earlier version of the kit. It does not delete them. See [Leftovers from an earlier installation](#leftovers-from-an-earlier-installation).

### 7/9 MCP server registration

Uses `claude mcp add` to register `qdrant-thinktank` at user scope and points it to `scripts/qdrant-mcp-launcher.sh` in this repository. If a server with that exact name is already registered, the installer leaves it unchanged.

The registration deliberately includes no API key. Using `claude mcp add --env "QDRANT_API_KEY=<key>"` would place the key in the process's argv, where `ps -ef` or `/proc/<pid>/cmdline` would expose it to other local processes. The command would also write the key verbatim to your MCP configuration. Instead, the launcher reads the key from `.env` when the server starts, so the key exists in exactly one place on disk. If the `claude` CLI is missing or the command fails, the installer prints the block for you to merge manually.

### 8/9 Hook wiring in settings.json

Prints the hook block and writes nothing. See [Wiring the hooks into settings.json](#wiring-the-hooks-into-settingsjson).

### 9/9 Smoke test

Writes a point, reads it back by id, searches the named vector, and deletes the point again. "HTTP 200 on `GET /collections/<name>`" is not a test: a collection with the wrong vector shape answers that request perfectly and still fails on the first store and the first search. The search is the decisive rung. The test point carries a random id so it cannot collide with a real memory, and it is removed even when a later assertion fails.

## Wiring the hooks into settings.json

The two hooks make unattended runs safe, and Claude Code runs only the hooks listed in `settings.json`. The installer prints this block but never edits the file. Your `settings.json` contains your own hooks, permissions and environment. A script that rewrites the file either clobbers those settings or attempts a JSON merge in bash, where a bad merge can break the entire configuration.

Merge the `"hooks"` key into your `~/.claude/settings.json`. If the file already contains a `"hooks"` key, merge the matchers into it instead of replacing the object. If the file does not exist yet, create it and wrap the block in braces:

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

Three details in that block are load-bearing.

`PreToolUse` uses the matcher `*` because the guard must see every tool call, not only Bash calls. An MCP call then reaches it just as a shell command does.

`TaskCompleted` has no matcher because it is not a tool event, so there is nothing to match.

The paths use `$HOME` rather than a tilde. The command runs through a shell, which expands the variable reliably. A tilde that remains unexpanded points to a directory that does not exist. The hook then fails to start, and a hook that never runs gates nothing while looking exactly like one that does.

Both hooks exit immediately unless the process environment contains `CLAUDE_TT_LOOP_MODE=1`, so they do not affect interactive sessions. Never add that variable to the `env` block of `settings.json`. Doing so would arm the gates for every session and break normal interactive work.

## Registering the MCP server by hand

Step 7 handles this when the `claude` CLI is available. To do it yourself, merge the entry below into your existing `mcpServers` object. Do not paste the whole block over your configuration, or its other servers will disappear:

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

The block omits `QDRANT_API_KEY` on purpose. When the server starts, the launcher reads the key from `.env` (mode 600), keeping it out of your configuration file, shell history and process list. Set `THINKTANK_UVX_CMD` to `uv tool run` if `uvx` is not on your `PATH`.

If you prefer not to use the launcher, replace the `"command"` field with your own uvx invocation (`uvx mcp-server-qdrant --transport stdio`) and add `"QDRANT_API_KEY": "<the value from .env>"` to the env block yourself. Never put a real key in a file you share.

## Where the API key lives, and where it deliberately does not

The key exists in one file: `.env` in the repository root, mode 600, generated once by step 2
and never rotated afterwards. `.gitignore` covers `.env` and the temporary and backup forms the
installer writes while updating it, so none of them can be committed.

Two paths could have leaked it into a place other local processes can read, and both are closed:

**The MCP registration.** `claude mcp add --env "QDRANT_API_KEY=<key>"` would put the key into
the process's argv, readable through `ps -ef`, and write it verbatim into your MCP configuration.
The installer registers `scripts/qdrant-mcp-launcher.sh` instead; the launcher reads `.env` when
the server starts and passes the key through the environment.

**Every curl call.** The installer, `init-collections.sh` and `migrate-collection.sh` all talk to
Qdrant over HTTP and all need the `api-key` header. Passing it as `-H "api-key: $KEY"` puts it in
argv for the lifetime of each request — measured with `ps -ww` during a run, the key was visible
in clear text in fifty of fifty sampled curl processes. The header now comes from a mode-0600
configuration file passed with `-K`, removed by a trap on exit, interrupt and termination. A
sample of a full installer run found the key in none of a hundred and twenty curl processes.

One honest limit, stated in `scripts/lib/curl-auth.sh` itself: `SIGKILL` cannot be trapped. Kill a
run with `kill -9` and the temporary file survives, still mode 0600. The file's own comment names
the cleanup command.

## Migrating an existing collection

`scripts/migrate-collection.sh` copies points from a collection you name into `thinktank-memory`.
The source is a required argument — there is no default, because guessing at somebody else's
collection name is how data ends up in the wrong place.

```bash
./scripts/migrate-collection.sh --help          # also shows how to list your collections
./scripts/migrate-collection.sh my-old-memory --dry-run
./scripts/migrate-collection.sh my-old-memory
```

`--dry-run` reads and counts without writing anything. The script refuses to run when the source
and target vector parameters differ, since mixing embeddings from two models poisons every later
search. Matching size and metric do not prove the same model produced them, so the check rules out
gross mismatches only.

## Restart Claude Code

The MCP server, skills and hooks load at startup. They will not appear in a session that is already running, so restart before trying anything.

Then use `/thinktank <task>` for interactive engineering work, `/tt-loop <goal> until=<domain condition>` to start a gated unattended run, or `/tt-brainstorm <topic>` for the brainstorming lane.

## Troubleshooting

### Permission denied while copying the hooks

Step 1 stops and displays the following message:

```
[fail] Cannot install into /Users/you/.claude - a directory that has to receive a
       file is not writable.

         /Users/you/.claude/hooks   mode 500   not writable
```

The directory is read-only, and that is very probably deliberate. This kit recommends the hardening itself: see *Filesystem hardening* in `skills/thinktank/references/delivery-loop.md`. Taking the write bit off `~/.claude/hooks` is what stops an unattended agent renaming or replacing the guard hook that gates its own irreversible actions. Renaming an entry needs write permission on the **directory**, not on the file, which is exactly what the installer's backup step does.

The installer never removes that protection for you. Unlocking the guard directory to overwrite the guard is precisely what the hardening prevents, and a lock that any installer can open protects nothing. Run the three commands yourself, using the mode reported in the failure message:

```bash
chmod u+w ~/.claude/hooks
./install.sh
chmod 500 ~/.claude/hooks    # lock it again
```

Keeping your existing hooks and installing nothing is also a legitimate answer.

If you instead see a warning that the directory is read-only and "nothing needs writing there", nothing is wrong. Every file the kit provides for that tree is already byte-identical, so the installer skips the tree and continues.

### Port 6333 is already in use

Step 3 stops with one of two messages, depending on what holds the port:

```
[fail] Host port 6333 (REST) is already published by a container that is not
       part of this installation: my-qdrant (a1b2c3d4e5f6)
```

```
[fail] Host port 6333 (REST) is already in use by a process on this machine
```

The installer will not take the port. This is not caution for its own sake. Port 6333 is the Qdrant default, and anyone installing a RAG engineering kit is unusually likely to run a separate Qdrant instance. Taking the port would stop the previous container and point every MCP server already configured for `localhost:6333` to a new, empty instance with a different API key. The old data remains on disk, but the memory disappears from the session without any explanation.

Move ThinkTank instead of freeing the port. Set both lines in `.env` in the same edit:

```
QDRANT_HOST_PORT=6343
QDRANT_URL=http://localhost:6343
```

The first setting changes the port that `docker-compose.yml` publishes. The second specifies the address that the installer and MCP server use to connect. Inside the container, Qdrant still listens on 6333, and the compose healthcheck still checks 6333 because it runs inside the container. `QDRANT_GRPC_HOST_PORT` (default 6334) moves the gRPC port in the same way.

If you change only one of the two, step 2 stops with `QDRANT_URL and QDRANT_HOST_PORT disagree` and names both numbers.

### The Docker daemon is not running

Step 1 stops and displays the following message:

```
[fail] The Docker CLI is installed, but no Docker daemon is reachable.
```

Start Docker Desktop on macOS or Windows, or start the service on Linux (`sudo systemctl start docker`). Wait until `docker info` succeeds on its own, then run `./install.sh` again.

### jq is missing

Step 1 stops with `Missing required command(s): jq`. Install jq with `brew install jq`, `apt-get install jq` or `dnf install jq`.

Do not treat this as a formality. In loop mode the guard reads its decision out of a JSON payload, and it checks for jq before anything else:

```
Loop mode: jq is not installed, so this guard cannot parse the tool payload and
cannot decide whether this action is permitted. A guard that cannot decide DENIES
rather than allows.
```

An unattended run on a machine without jq therefore cannot proceed at all. That is the intended direction of failure, and it is still a stopped run.

### Leftovers from an earlier installation

Step 6 reports any leftovers but never deletes them:

```
[warn] These files are left over from a previous install. This kit no longer
       ships them, and they were not created by this script:
```

It then prints a ready-made `rm -f` command with the exact paths. You decide whether to run it. The destination is your own `~/.claude`, and those directories also contain your agents and notes. An installer that silently deletes files it does not recognise poses a much greater risk than a few stale files.

There are two limits. The check examines only directories that the kit writes to, and only one level deep. It therefore misses an entire directory from an older version if the kit no longer uses that directory name. In `~/.claude/agents` and `~/.claude/hooks`, which you share with the kit, it claims only names within the kit's namespaces: `thinktank-*` and `tt-loop-*`.

### The repository was moved after installation

The MCP registration stores an absolute path to `scripts/qdrant-mcp-launcher.sh` in this repository. If you move or delete the clone, that path points to nothing. The memory server no longer starts, so the session has no memory tools. `docker compose down` also requires this directory because it contains the compose file.

If the launcher remains in place but cannot find `.env`, it reports the problem on stderr:

```
qdrant-mcp-launcher: no QDRANT_API_KEY in the environment, and none found in <path>/.env
```

In either case, fix the issue by registering the server again with the new location.

```bash
claude mcp remove qdrant-thinktank --scope user
cd /new/path/to/thinktank && ./install.sh
```

## Removing ThinkTank

None of these steps runs automatically. Follow the order below. Check every command against your machine before running it, because several of these directories belong to you rather than the kit.

**1. Stop the container.** From the repository directory:

```bash
docker compose down        # keeps the stored memories
docker compose down -v     # deletes the volume, and with it every stored memory
```

The volume is named `thinktank-qdrant-storage` and deliberately survives a plain `down`.

**2. Unregister the MCP server.**

```bash
claude mcp remove qdrant-thinktank --scope user
```

**3. Remove the hook block from `~/.claude/settings.json`.** Delete the `PreToolUse` and `TaskCompleted` entries that point to `tt-loop-guard.sh` and `tt-loop-completion-gate.sh`, but leave the rest of the file unchanged. Once you remove the block, Claude Code never calls the hooks, regardless of what remains on disk.

**4. Remove the copied files.** This includes everything the installer placed in `~/.claude/`:

```bash
rm -rf ~/.claude/skills/thinktank ~/.claude/skills/tt-loop ~/.claude/skills/tt-brainstorm
rm -f  ~/.claude/agents/thinktank-*.md
rm -f  ~/.claude/hooks/tt-loop-guard.sh ~/.claude/hooks/tt-loop-completion-gate.sh
```

If hardening left `~/.claude/hooks` read-only, unlock it first, then lock it again afterwards, exactly as described in the troubleshooting entry above.

**5. Remove any backups created by the installer.** Their names end with `.bak.<timestamp>`:

```bash
find ~/.claude -name '*.bak.[0-9]*-[0-9]*'
```

Review the list before deleting anything. The pattern matches files by name, so it could include one of your own files.

**6. Delete the clone.** The `.env` file containing the API key sits in the repository root, so deleting the directory removes it too. Steps 2 and 3 already removed the MCP registration and the hook block. Beyond those entries, the installer wrote only to `~/.claude/`, the container and its volume.

## Related

- [README](../README.md). The README explains what the engine does and what it does not do.
- `skills/thinktank/references/delivery-loop.md`. This reference covers the delivery loop, the Autonomy Grant, and the filesystem hardening this page refers to.
