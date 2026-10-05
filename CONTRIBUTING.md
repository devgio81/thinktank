# Contributing

ThinkTank V17 combines host instructions with executable Node.js installation, plan validation and guards.
Treat changes to `skills/` and `agents/` as behavioral changes, not cosmetic copy edits.

## Layout

- `src/installer/`, `src/cli.mjs`: wizard, platform configuration and persistent installation.
- `src/orchestration/`: validation, dependency layers and deterministic joins.
- `src/qdrant/`: local memory lifecycle and MCP bridge.
- `src/guard/`, `hooks/`: host-specific pre-tool decisions.
- `skills/`, `agents/`: user commands, references and specialist contracts.
- `tests/`: deterministic behavior and regression tests.
- `scripts/integration.mjs`: disposable real-service verification.

## Verify before handoff

```bash
npm ci
npm run build
npm test
npm run test:integration
npm pack
```

Node.js 20.19+, Docker Compose v2 with a running daemon, and uv/uvx are required for integration.
Unit tests use isolated fixtures; the integration script uses an independent state directory and
Compose project. Never aim a test at an installed user profile or an existing memory collection.
Report actual commands, exits and missing evidence. A passing mock is not a real MCP handshake.

Keep new files below 500 lines. Read existing code before changing it. One writer per worktree;
shared manifests and lockfiles have one integration owner. Never commit keys or state directories.

## Contract changes

- Preserve the four exits, independent checker, evidence ledger and human authorization.
- `subagents=on` means Prompter-first even for one worker. `off` means no workers.
- `graph=on` selects an explicit DAG; the comparison matrix applies only to `auto`.
- New scopes and result types need positive and negative tests.
- A guard is not a sandbox; unsupported actions are denied and documented.
- The installer must preserve unrelated settings and must not lower approval policies.
- Changes to runtime paths must preserve operation after the npm cache or source clone is removed.

## Review and release

An independent checker receives frozen criteria, source/diff and exact test commands, not the maker's
reasoning. Bind the verdict to the final artifact; edits invalidate an earlier approval.

Do not commit, push, merge, publish npm packages or deploy without the repository owner's explicit
release authorization. `npm pack` is local packaging, not publishing.

Commit subjects describe what changed and why. No automatic co-author trailer.
Include bug reproductions and evidence in PRs, with known limitations kept in README/docs.
