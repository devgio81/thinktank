# Installing ThinkTank V17

## Before starting

Node.js **20.19+** and an installed **Hermes One**, **Claude Code** or **Codex** are required.
For Hermes/Claude, ThinkTank auto-detects a single installed target, installs missing uv privately from a pinned,
SHA-256-verified official release, starts existing Docker Desktop on macOS, and installs missing
Docker Desktop through an existing Homebrew installation. It then provisions Qdrant and the host
integration without additional commands or manual config edits.

OS/admin and Docker first-run prompts remain human-controlled. On Linux, Docker Engine with Compose v2
must be installed and running with access for the current user. Node, Homebrew and host-app login are
not installed or modified silently.

**npm package:** [@devgio81/thinktank](https://www.npmjs.com/package/@devgio81/thinktank), release 17.1.0.
No repository clone, local build, global CLI installation or npm account is needed.
All end-user CLI examples below run the public package directly through `npx`.

## One-command installation

**Hermes One:**

```bash
npx --yes @devgio81/thinktank --platform hermes --yes
```

**Claude Code:**

```bash
npx --yes @devgio81/thinktank --platform claude --yes
```

**Codex:**

```bash
npx --yes @devgio81/thinktank --platform codex --yes
```

Codex installs the self-contained `$thinktank-codex` skill and uses existing host
settings and MCP/memory. It does not provision Docker/uv or install foreign hooks.
See [Codex installation](install-codex.md).

The first `--yes` approves downloading the package through **npx**. The final `--yes`
approves **ThinkTank's installation plan**, without overriding conflicts or OS permissions.
After installation, restart the target application and invoke `/thinktank` for
Hermes/Claude or `$thinktank-codex` for Codex.

**Interactive assistant:**

```bash
npx --yes @devgio81/thinktank
```

A single installed application is detected automatically. If the target is ambiguous, the assistant
asks you to choose; it then shows the plan for confirmation. In a non-interactive terminal, supply
`--platform hermes`, `--platform claude` or `--platform codex` if detection is ambiguous and `--yes` to approve installation.
For a version-pinned setup, replace `@devgio81/thinktank` with `@devgio81/thinktank@17.1.0` in any command.
Reinstallation uses the same one-command entry point.

Both platforms can share the default `~/.thinktank` memory instance. Each receives its own skill and hook registration.
The wizard never adopts a pre-existing Qdrant instance or migrates an old collection implicitly.

## Preview or isolate

```bash
npx --yes @devgio81/thinktank install --platform hermes --dry-run
npx --yes @devgio81/thinktank install --platform claude --home /absolute/path/to/test-home --dry-run
npx --yes @devgio81/thinktank install --platform hermes --port 7333 --collection thinktank-memory --yes
```

`--home` selects **all** profile paths, including Claude's `.claude.json`. The default state directory
is `<home>/.thinktank`; `--state-dir` overrides it. This is not a switch to an existing named Hermes
profile. Only point it at a profile/layout you intentionally manage.

ThinkTank's `--dry-run` does not write profile/state files, start containers or provision services.
`npx` may still download the package and populate its own cache before running the preview.
Omitted ports are chosen automatically at installation time. An explicitly occupied port produces an error, not a takeover.
Use `--timeout 240` for a slower Docker startup (valid range: 10–600 seconds).

## Files and configuration

| Target | Managed locations |
|---|---|
| Common runtime | `<state-dir>/runtime/` |
| Qdrant connection and private key | `<state-dir>/qdrant.json`, private Compose key file `qdrant.env` |
| Qdrant Compose project | Under `<state-dir>`; volume scoped to this installation |
| Backups | `<state-dir>/backups/` |
| Claude Code | `<home>/.claude/skills/`, `.claude/agents/`, `.claude/settings.json`, `.claude.json` |
| Hermes One | `<home>/.hermes/skills/`, `.hermes/config.yaml` |

MCP registration points to the persistent runtime, **not the repository or npm cache**.
The runtime includes its own YAML dependency; deleting the npm cache does not break it.
The API key is not written into MCP registration or command arguments. A generated private key protects
a service that binds only to `127.0.0.1`. Existing application configuration is parsed and merged;
unrelated providers, MCP servers, permissions and hooks are preserved. Hermes YAML comments are preserved.

The installer refuses malformed JSON/YAML, symlink profile paths, conflicting registrations and locally
modified managed files. It never silently resets approvals or globally enables hooks.

## Reinstall and recover

Rerunning the same install is idempotent. To deliberately replace conflicting managed files:

```bash
npx --yes @devgio81/thinktank install --platform hermes --replace --yes
```

Read the preview first. Previous file contents are backed up before replacement. Profile writes are
rolled back on a later write failure where no concurrent edit intervened. Qdrant is retained on a
profile failure so recovery does not lose memory. Rerun after correcting the reported problem.

An `install.lock` prevents competing installers. If a process was terminated, inspect running processes
before removing a stale `<state-dir>/install.lock`; do not remove a lock held by an active installer.

```bash
npx --yes @devgio81/thinktank doctor --platform hermes
npx --yes @devgio81/thinktank doctor --platform claude
```

Doctor verifies installed files, effective managed configuration and Qdrant availability/schema.
It does not prove that an already-running app has reloaded those settings or that an LLM followed a prompt.

| Error | Action |
|---|---|
| Docker command or Compose missing | Install Docker with Compose v2. |
| Docker daemon unreachable | Start Docker Desktop/service, then retry. |
| uv download blocked | Allow GitHub release downloads and rerun the same command; no shell profile editing is needed. |
| Port occupied | Omit `--port` to choose an isolated port, or select another. |
| Existing registration differs | Review it. Use `--replace` only for an intentional migration. |
| Incompatible vector schema | Keep existing data; use a different collection/state directory or plan an explicit migration. |
| MCP first start is slow | uv downloads the pinned MCP package and a local embedding model; allow network access for those downloads. |
| Skill absent in app | Restart/reload skills in the selected application and confirm the correct home/profile. |

## Validate a generated plan

```bash
npx --yes @devgio81/thinktank validate-plan --plan /absolute/path/plan.json --write-root 'src/**' --write-root 'tests/**' --max-workers 3
```

Write access defaults to **none**. The parent supplies allowed roots explicitly; a plan cannot grant
its own authority. Invalid plans print structured errors and exit nonzero. Validation and layer
calculation do not execute models or acceptance commands.

## Data retention

Use the generated Compose file and project identity from the selected state directory, not an
unrelated checkout's `docker-compose.yml`. `docker compose down` for that project stops it but retains
its named volume. `down -v` **deletes the memory volume**: use it only for explicitly disposable test installations or intentional erasure.
Keep the state directory and private key with the volume; deleting only the key can make retained data
inaccessible to the registered client. Back up both before migration. Do not point two state directories
at the same fixed volume or rename a state directory without a migration plan.

The local Qdrant web UI can be opened at the URL printed by installation with `/dashboard` appended.
No cloud database account or embedding API key is required. Retrieved memories still enter the configured
LLM context; local storage is not a promise that data never reaches a model provider.

## Unattended work and hooks

The installed guard uses the host's native protocol: Claude `PreToolUse`, Hermes `pre_tool_call`.
It is inert unless the corresponding loop marker is set. Installation does **not** arm a run.
The V17 guard's supported and unsupported corridors are explicit; see [guard contract](../src/guard/README.md).
For an isolated, operator-approved unattended process, the operator fixes the platform's
`*_TT_REPO_PATH`, `*_TT_VERIFY_COMMANDS` (JSON list of supported exact test/build commands), and
optionally `*_TT_ALLOW_DELEGATION=1` in its launch environment. These are never persisted by the
installer or taken from agent output. On Hermes, actual hook consent/registration must also be
established by the operator. See the guard contract for platform-specific names and limitations.

Interactive `/thinktank` supports the full host toolset under normal user approvals. The conservative
unattended guard intentionally does **not** support release commands, arbitrary MCP/web access or
cryptographic completion attestation. `/tt-loop` prepares a governed proposal; it is not a promise
of automatic release. Skills and domain prompts do not replace the host model or its permission system.
No grant file, checker record or subagent consensus is a substitute for actual human authorization.
Do not copy a Claude hook response into Hermes configuration: their denial formats differ.

## Release verification

```bash
npm ci
npm run build
npm test
npm run test:integration
npm run test:package
npm pack
```

These commands are for contributors preparing a release, not for installing the published package.
`npm pack` creates a local installable artifact. Publishing a new version with `npm publish` remains
a separate maintainer-authorized release step, not part of setup or tests. The repository's old shell
helper scripts remain legacy utilities; the V17 entry point is the npm CLI and `install.sh` forwards to it.

## Codex

The same npm/npx executable supports `--platform codex` from release 17.1.0. See
[Codex installation](install-codex.md) for the local tarball command, discovery roots,
existing memory behavior and independent validation. Earlier releases predate this change.
