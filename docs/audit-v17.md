# ThinkTank V17 audit

## Baseline and method

Reviewed baseline: `e660e05654f04c88ab3bb1c475264b7973f0a98b` from `devgio81/thinktank`.
The existing developer checkout was dirty and was not changed. Implementation uses a separate clone
and branch `feat/thinktank-v17`. Source inspection, executable negative controls, unit tests and a
separate disposable integration gate are kept distinct.

## Confirmed baseline findings

| Priority | Finding | Baseline evidence | V17 remediation |
|---|---|---|---|
| High | Unrecognized effectful MCP calls pass the loop guard | `hooks/tt-loop-guard.sh:119–129`; payload `mcp__demo__confirm_and_apply` yielded empty stdout (allow) | Conservative tool classification; negative guard tests |
| High | File writes are not confined to the worktree; `.git/hooks` is writable | `hooks/tt-loop-guard.sh:91–103`; `Write /tmp/elsewhere.txt` and `Write /tmp/repo/.git/hooks/pre-commit` both allowed | Canonical scope checks and protected paths |
| High | Empty but valid JSON payload is allowed | `hooks/tt-loop-guard.sh:60–63,129`; `{}` yielded empty stdout | Payload shape/type validation; fail closed |
| Medium | Distribution supports only Claude Code | `install.sh:41,103–174,1059–1236`; Claude settings/registration only | Native Hermes/Claude adapters |
| Medium | Installer registration depends on retaining the checkout | `README.md:138`; shell launcher absolute repo path | Copy runtime into persistent installation state |
| Medium | Isolated Claude-home test can still change real user MCP registration | `CONTRIBUTING.md:42–52` explicitly warns about this | One `--home` controls all profile targets, including `.claude.json` |
| Medium | Fixed Docker container and volume names prevent isolated installations | `docker-compose.yml:22,70–72` | Per-state-directory Compose project/volume; no adoption of existing memory |
| Medium | Explicit `graph=on` can be vetoed by an automatic cost matrix | `README.md:86–90`; `skills/tt-loop/SKILL.md:64` | Separate explicit selection from `auto` promotion |
| Medium | Skill frontmatter is not strict YAML | `skills/thinktank/SKILL.md:4`, unquoted repeated `[...]`; new build produced `YAMLParseError` | Valid frontmatter and build regression gate |
| Medium | “Nothing leaves the host” is stronger than the architecture supports | `skills/thinktank/SKILL.md:227–228`; retrieved text enters model context | Explicit storage/embedding versus provider-context distinction |
| Medium | No executable regression suite or npm distribution | No package.json/tests in baseline; `CONTRIBUTING.md:23` | npm package, Node tests, build and CI definitions |

Negative guard probes only supplied JSON to the baseline hook; no forbidden operation was executed.

## Development-review findings and regression coverage

The V17 candidate review also found and corrected: npm symlink entry not executing `main`,
missing persistent YAML dependency, overwritten local hook edits, stale hooks after state migration,
backup-index failure outside rollback, and ignored `validatePlan(false)` results. Hooks moved to
another event or carrying appended command arguments are also covered. See
`tests/installer-regression.test.mjs`, `tests/hooks-regression.test.mjs`, and `tests/cli-plan.test.mjs`.

Real local acceptance includes the packed `npx` bin, install/reinstall for both platforms,
installed hook invocation, doctor and MCP after npm-cache/tarball removal, actual authenticated
Docker Qdrant, local text embedding store/find, and independent REST read-back. The integration
scripts delete only their disposable test Compose projects.

A local Hermes-source probe (`scripts/hermes-host-probe.py`) additionally loads the skills through
Hermes's real scanner/loader and invokes its real shell-hook callback in an isolated `HERMES_HOME`.
This proves adapter compatibility, not that a model followed every prompt or that all host versions
are compatible. No paid model run or existing live profile was used.

## One-command installation

The installer detects an unambiguous host application and supports explicit `--platform` plus
`--yes` for a non-interactive, single-command setup. It downloads missing uv 0.10.10 from official
GitHub release assets, verifies a pinned SHA-256, and installs it under the private state directory.
No downloaded shell script is executed. Existing macOS Docker Desktop is started; a missing Docker
Desktop can be installed through existing Homebrew. OS prompts and Linux Docker prerequisites remain
explicit human boundaries. The public npm command becomes available only after an authorized publish.

The macOS package gate was also run with global uv removed from PATH and
`THINKTANK_TEST_PRIVATE_UV=1`; it asserted the private uv executable exists, installed both hosts,
removed npm cache/tarball and completed a real embedding store/find roundtrip.

## Important limits

- Prompt instructions do not prove an LLM follows the orchestration protocol. Mechanical validation,
  host execution, parent checks and independent review are distinct layers.
- A guard is not OS isolation. The repository does not claim a trusted checker identity from a file.
- The conservative V17 guard may reject historical grant-driven release commands. Such actions remain
  human handoffs rather than silently weakening policy for compatibility.
- Hermes installs its pre-tool hook with `fail_closed: true`, as documented by the current official
  host docs. A missing/broken guard can therefore also block interactive tool calls. Older hosts that
  ignore the flag require separate verification; the installer never changes global approvals.
- AI touchpoints are coding assistance, specialist prompt generation and local embeddings. No
  prohibited-use feature, person scoring or legal certification is introduced by this distribution.
- Unit and REST-smoke evidence alone do not establish embedding/MCP operation. The integration gate
  includes a real stdio initialize/tools-list/store/find round trip.
- npm publication, remote CI, merge and release are outside this implementation authorization.

## Reproduce verification

```bash
npm ci
npm run build
npm test
npm run test:integration
npm run test:package
npm pack
```

The integration gate owns and cleans only its disposable Compose project, records profile installation
read-backs, and exercises the installed runtime rather than relying on the source checkout.
See the delivery report for the actual run outcomes and any remaining gaps.

## Primary interface references

- [Hermes skills](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills)
- [Hermes MCP](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp)
- [Hermes hooks](https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks)
- [Claude settings](https://code.claude.com/docs/en/settings)
- [Claude subagents](https://code.claude.com/docs/en/sub-agents)
