# ThinkTank V17 – acceptance contract

## Scope

Upgrade `devgio81/thinktank` from baseline `e660e05654f04c88ab3bb1c475264b7973f0a98b` on `feat/thinktank-v17`.
The existing checkout and installed user profiles are outside the write scope.
No commit, push, PR, merge, registry publication or production deployment is authorized.

## Domain condition

A user can install ThinkTank V17 for Hermes One or Claude Code using one npm CLI wizard, obtain an isolated authenticated local Qdrant with persistent storage, and use grounded domain-specific delegation contracts with verifiable validation and clear safety limits.

## Frozen criteria

1. **Package:** an npm tarball contains the CLI and every runtime/skill/agent dependency; `npm run build`, `npm test`, `npm pack` and local `npx --package <tarball> thinktank --help` succeed. Publication is a separate human handoff, not implied by local packaging.
2. **Wizard:** interactive platform choice and confirmation; explicit unattended flags; unknown/invalid options fail before writes; `--dry-run` is non-mutating. A supplied `--home` isolates every profile write.
3. **Profile installation:** Claude and Hermes formats are distinct. Existing unrelated configuration is preserved, modifications are backed up, repeated installs are idempotent, conflicting managed registrations/files require explicit replacement. No secrets in argv or printed configuration; no dependency on the npm cache surviving.
4. **Qdrant:** Docker Compose starts a project-scoped instance, binds only loopback, uses a generated private API key and persistent volume, avoids existing containers/ports, initializes and validates a compatible named vector, and proves write/read/query/delete against the real service. Missing Docker/uv and timeouts produce actionable failures. Unit tests do not substitute for the real service gate.
5. **V17:** Prompter-first domain contracts, mode semantics including user-forced `graph=on`, dependency-layer scheduling and deterministic joins. Reject invalid IDs, dependencies, cycles, ownership escapes/overlap and malformed results; include negative regression tests. Domain worker definitions have distinct backend/frontend/data/infrastructure/security/QA lenses. Claims of agent execution must distinguish instructions from executable host orchestration.
6. **Safety:** Claude/Hermes hook protocols tested separately; interactive no-op; gated malformed inputs and unrecognized effectful surfaces fail closed; canonical write scopes protect traversal/symlink/harness paths. Unsupported grant corridors must be explicitly blocked and documented, never silently approved. A hook is not a sandbox or cryptographic checker identity.
7. **Docs:** short Quickstart, platform and prerequisites, defaults, reinstall/recovery, doctor, data retention, source installation and honest npm-publication status. Audit findings link to source or reproductions and remediation tests.
8. **Independent review:** a non-author checker reads the final source and runs relevant tests. Must-fixes are repaired and rechecked before an acceptance claim.

## Execution modes

`subagents=auto`: three independent domain scopes benefit from separate contexts.
`graph=auto`: no measured cost baseline; no promotion claim. Dependency layers are used for worker scheduling without claiming graph-cost superiority.
`rag=vector`, `team=auto` (leaf workers, no agent team), `loop=off` (interactive work), `deliver=off` (local implementation and verification only), `cognitive=silent`.

## Work ownership

- Parent: npm manifest/lock, CLI, installer/platform adapters, documentation, build/CI, integration.
- Engine worker, isolated worktree: `skills/`, `agents/`, `src/orchestration/`, `tests/orchestration*.test.mjs`.
- Qdrant worker, isolated worktree: `src/qdrant/`, `tests/qdrant*.test.mjs`.
- Guard worker, isolated worktree: `src/guard/`, `hooks/`, `tests/guard*.test.mjs`.

## Initial evidence

- Baseline has no package.json or tests directory (live repository check).
- Baseline installer is Claude-specific and requires retaining its clone for MCP startup.
- Baseline README and graph contract apply the cost matrix even to explicit `graph=on`.
- Baseline Compose has fixed container and volume names; existing host Qdrant is outside this task.
- AI touchpoints: coding-assistant delegation and local text embeddings. No people-scoring, biometric, prohibited-use or consequential automated decision feature is requested. Engineering assessment only; no certification claim.
