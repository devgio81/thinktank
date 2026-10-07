# Codex installation

Codex uses the same `thinktank` npm executable as Hermes One and Claude Code:

```bash
npx --yes @devgio81/thinktank --platform codex --yes
```

Codex support starts with release 17.1.0. Earlier published releases do not accept
`--platform codex`. To pin the version, use `@devgio81/thinktank@17.1.0`.
Contributors can test a packed release through the same installer using its absolute path:

```bash
npx --yes --package /absolute/path/devgio81-thinktank-17.1.0.tgz thinktank --platform codex --yes
```

Preview and diagnose with that same executable:

```bash
npx --yes @devgio81/thinktank install --platform codex --dry-run
npx --yes @devgio81/thinktank doctor --platform codex
```

The installer detects an unambiguous Codex executable/profile and offers Codex as the
third interactive target. `--home` controls the home used for both discovery and installation.
`--skills-dir` selects an explicit alternate skill root. The default is
`HOME/.agents/skills/thinktank-codex`; older installations can select `HOME/.codex/skills`.
Keep the chosen root the same for install and doctor. A different skill root requires a
separate `--state-dir`, so one manifest cannot silently adopt another installation.

The installed skill is invoked with `$thinktank-codex`. Codex detects new local skills;
restart if the skill does not appear. The distinct name preserves an existing `thinktank`
alias or `thinktank-v17` port. The bundle includes domain prompts, references, deterministic
plan validation and tests. These are prompt data and mechanical checks, not registered
custom agent types or a new autonomous runtime.

Codex installation uses the host's existing memory/MCP configuration. It preserves
`config.toml`, model/permission settings and existing skills. It does not provision Docker,
uv, a second Qdrant, or Claude/Hermes hooks. `--port` and `--collection` are therefore not
Codex install options. If memory is unavailable, the skill reports the gap and uses source
evidence. Installing a skill is not evidence of a working memory backend.

Each managed file is tracked by SHA-256 in `STATE/installed-codex.json`, with state defaulting
to `HOME/.thinktank`. Repeat installation is unchanged. User-edited files cause an explicit
conflict; `--replace` backs them up before replacement. Dry-run creates no files, starts no
processes and makes no network requests inside ThinkTank (npx itself may fetch the package).
Doctor reads file integrity only; it does not certify Codex discovery, model adherence,
memory health or unattended enforcement.

Verify the installed bundle independently of npm cache and the source checkout:

```bash
node ~/.agents/skills/thinktank-codex/scripts/verify.mjs
```

This adapter does not claim an enforcing unattended Codex launcher or grant corridor.
Interactive engineering remains available within the user's permissions. Publishing a
release, merging and deploying are separate maintainer actions.

Source: [official OpenAI skill documentation](https://learn.chatgpt.com/docs/build-skills),
retrieved 2026-10-06. It documents `SKILL.md`, invocation, current discovery roots and refresh
behavior. [Review and optimization proposals](review-codex.md) record remaining gaps.
