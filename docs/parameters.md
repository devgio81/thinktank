# ThinkTank V17 parameter guide

**Use slash-command parameters to describe the agent's work. Use CLI flags to install, inspect or validate the toolkit.** They are different interfaces.

[Back to the overview](../README.md) · [Installation and recovery](install.md)

**[Individual examples for every parameter and mode →](parameter-examples.md)**
Use this companion when you want one setting per example rather than combined configurations.

## Choose the right interface

| Interface | Where to use it | Purpose |
|---|---|---|
| `/thinktank <task> ...` | Hermes One or Claude Code chat | Investigate, implement or review a scoped task |
| `/tt-brainstorm <topic> ...` | Host chat | Explore ideas without starting implementation |
| `/tt-loop <goal> until=...` | Host chat | Prepare a bounded unattended-work proposal |
| `npx --yes @devgio81/thinktank ...` | Terminal | Install, run doctor, start the configured MCP transport or validate plan structure |

The public package installs `/thinktank` as the V17 engine. A separately installed versioned skill
such as `/thinktank-v17` may have a different contract; this guide describes this repository's distribution.
The slash-command options are interpreted through the skill by your host agent. They are not a
strict shell parser and are not accepted as installer flags.

Write a specific task followed by options. Use each option once. Invalid values or contradictory
combinations require clarification rather than a guessed setting. Quotes around multi-word values
help readability in chat; they do not turn the skill into a shell command. Put a long `until=`
condition last to make its boundary clear. Replace example notebook names, paths and workflows with
ones that actually exist in your environment.

```text
/thinktank fix duplicate webhook processing subagents=auto deliver=off until=replaying an event leaves exactly one business transaction
```

`<task>` is required context, not a literal placeholder to type. Describe the desired behavior,
relevant repository and limits. "Improve everything" does not define a checkable outcome.
The examples here are requests, not claims that a feature, notebook or deployment already exists.

## Main /thinktank parameters

### subagents — who performs the reasoning

**Values:** `auto`, `on`, `off`. **Default:** `auto`.

- `auto`: use a read-only Prompter when distinct domains benefit from separate contexts or an
  independent investigation reduces bias. Otherwise the parent does the work in one context.
- `on`: require the Prompter before domain workers. One valid task means one sequential worker;
  it does not justify inventing parallel work. Missing delegation capability or authorization is a handoff.
- `off`: no Prompter or worker subagents. The parent executes the task. Independent acceptance
  then needs a separate human reviewer; the parent cannot certify its own work.

```text
/thinktank implement the agreed API and settings screen subagents=on deliver=off
/thinktank explain this validation function subagents=off deliver=off
```

Specialists still need explicit scopes, evidence and result schemas. This option neither selects
an arbitrary model nor changes your host's concurrency limit or spending permissions.

### graph — how steps depend on each other

**Values:** `auto`, `on`, `off`. **Default:** `auto`.

- `auto`: promote from sequential work only when the task has useful multi-hop or independent
  structure and measured retry/cost evidence supports the change. No baseline means no promotion.
- `on`: request an explicit typed dependency graph. A single sequential path is valid when no
  parallel work exists. Missing comparison metrics are reported, not invented.
- `off`: execute sequentially without optional graph telemetry or topology overhead. Dependencies
  still apply, and Prompter-generated tasks can still run one after another.

```text
/thinktank review API behavior and security boundaries graph=on subagents=on deliver=off
/thinktank perform the agreed refactor graph=off subagents=on deliver=off
```

A graph can contain tools and tests as well as agents. `graph=on` does not imply concurrent agents,
GraphRAG, additional permissions or an automatic graph execution server.

### rag — how knowledge is retrieved

**Values:** `vector`, `graph`, `auto`. **Default:** `vector`.

- `vector`: use semantic similarity for memory retrieval. Current code is still inspected directly;
  this setting does not force every question through Qdrant.
- `graph`: request explicit knowledge relationships for relational or multi-hop questions. The
  necessary relations and retrieval capabilities must exist. Traversal is capped at three hops.
- `auto`: choose the appropriate available retrieval approach based on the question and evidence;
  vector-first remains the starting point, and graph retrieval must justify its additional work.

```text
/thinktank find prior lessons about safe migrations rag=vector deliver=off
/thinktank trace which decision replaced the old retry policy and which modules depend on it rag=graph deliver=off
/thinktank investigate the causes and dependencies of this regression rag=auto deliver=off
```

The installer provisions vector memory, not a populated knowledge graph or automatic graph indexer.
Unavailable GraphRAG means a recorded gap and available-source fallback, never invented edges.
`rag=graph` and `graph=on` control different things: evidence retrieval versus execution structure.

### team — whether specialists discuss with peers

**Values:** `auto`, `on`, `off`. **Default:** `auto`.

- `auto`: assess whether peer discussion helps and the host supports it; otherwise use leaf
  workers or one context.
- `on`: request supported team coordination. If unavailable, return a handoff instead of
  simulating teammate messages.
- `off`: do not use the optional peer-team workflow. This does not itself turn off ordinary workers.

```text
/thinktank compare two migration strategies team=on subagents=on deliver=off
/thinktank review the implementation team=off subagents=auto deliver=off
```

Hermes leaf delegation is not Claude Agent Teams. A team cannot grant authority, increase
concurrency or remove worktree isolation. Avoid `team=on subagents=off`: the intentions conflict.

### loop — whether unattended execution is intended

**Values:** `auto`, `on`, `off`. **Default:** `auto`.

- `auto`: assess the need and authorization for unattended work. Do not silently start it.
- `on`: request the governed unattended path. A written contract, observable stop condition,
  budgets, isolation and verified host hook behavior are prerequisites.
- `off`: stay interactive. Normal bounded implement-test-correct cycles still operate.

```text
/thinktank investigate the failing test loop=off deliver=off
/thinktank prepare the agreed migration loop=on deliver=off until=all existing records pass the integrity checks
```

A chat option cannot arm its own session or schedule a run. `/tt-loop` is the dedicated preparation
command. Its guarded mode does not support automatic release commands; a denial is a handoff,
not an invitation to try another tool.

### deliver — whether shipping is part of the goal

**Values:** `auto`, `on`, `off`. **Default:** `auto`.

- `auto`: infer whether the task includes delivery and check the actual authorization.
- `on`: include the delivery chain in the intended outcome: branch, brief, implementation,
  tests, independent review, commit, PR, merge, deployment observation and browser verification.
- `off`: exclude shipping. Local code changes and local tests are still allowed within the
  agreed scope; use an explicit "read-only" task when no edits are wanted.

```text
/thinktank implement the agreed fix and verify it locally deliver=off
/thinktank prepare the agreed feature for delivery deliver=on until=the authorized staging flow passes its browser checks
```

`deliver=on` is intent, not permission to commit, push, merge or deploy. Every effectful step needs
applicable human authorization and supported controls. Production and package publication remain human-only.

### cognitive — how much process summary you see

**Values:** `verbose`, `silent`. **Default:** `silent`.

- `verbose`: show concise cycle markers, observed facts, alternatives, decisions and verification limits.
- `silent`: omit the markers while retaining the same evidence and verification discipline.

```text
/thinktank diagnose the intermittent timeout cognitive=verbose deliver=off
/thinktank review this small change cognitive=silent deliver=off
```

This affects presentation, not model capability, safety rules or private chain-of-thought disclosure.
`silent` does not hide failures or unresolved questions.

### notebook — which optional NotebookLM source to consult

**Value:** a visible notebook ID or name. **Default:** unset; no mandatory notebook selection.

Use this when relevant domain knowledge is in a notebook your configured integration can access.
A unique name or verified ID identifies the source. Ambiguous or inaccessible selections require
clarification. With no selection, an enabled integration may resolve a relevant visible notebook;
that does not make notebooks mandatory for every task.

```text
/thinktank compare our documented migration approaches notebook="Architecture decisions" deliver=off
```

NotebookLM must already be configured and authorized. This option does not install an integration,
start login, create a notebook, add sources or make an inaccessible share link available. Returned
answers need citation checks; they do not outrank current repository source or official documentation.

### until — the observable condition for completion

**Value:** a domain-level sentence. **Default:** no explicit condition supplied.

Describe what must be true, not how many times the agent should try. The parent maps every clause
to real tests/probes or a named human handoff and freezes the criteria before implementation.
A subjective phrase such as "until everything is perfect" needs clarification.

```text
/thinktank fix webhook retries deliver=off until=replaying a valid event produces exactly one transaction and invalid signatures are rejected
/thinktank improve the search query deliver=off until=the agreed latency target passes without changing the result set
```

The agreed budget, correction ceiling and no-progress exit still apply. `until=` cannot guarantee
success or force endless retries. If the goal is already proven, the agent should report that rather
than make unnecessary changes.

### deploy — advanced delivery-route proposal

**Values:** `on-merge`, `dispatch:<workflow>`, an exact command, or `none`.
**Default:** not specified by the current V17 contract; resolve the route from the task and repository.

This field appears in the governing skill's mode table, although it is absent from the short slash
argument hint. Treat it as a **host-level proposal**, not an executable CLI switch or supported grant.

| Value | Meaning | Example context |
|---|---|---|
| `on-merge` | Observe the existing pipeline associated with an authorized merge | A repository whose staging pipeline already runs after merge |
| `dispatch:<workflow>` | Propose a named workflow dispatch, subject to approval and supported tools | An existing manually triggered staging workflow |
| Exact command | Name the proposed deployment command for review | An existing script whose effects have been inspected |
| `none` | Do not perform a deployment | Local work or PR-only delivery |

```text
/thinktank prepare the agreed feature deliver=on deploy=on-merge
/thinktank prepare staging delivery deliver=on deploy=dispatch:staging.yml
/thinktank review the deployment plan deliver=on deploy="npm run deploy:staging"
/thinktank implement and test locally deliver=off deploy=none
```

The workflow/script names are illustrative; confirm them in the repository first. These options
are not executed merely because they are named. The shipped unattended guard does not support
release corridors. `deliver=off` combined with a request to deploy needs clarification, not execution.

## /tt-brainstorm parameters

Use `/tt-brainstorm <topic>` for research and options, not implementation. It supports `subagents`
and `graph` with the same separation described above; the following controls apply to brainstorming.

### depth — research breadth

**Values:** `quick`, `standard`, `deep`. **Default:** `standard`.

- `quick`: suggests two useful research perspectives.
- `standard`: suggests four perspectives, typically problem/user, market, feasibility and contrarian.
- `deep`: suggests five perspectives, adding one appropriate to the topic.

These are suggestions within capability, authorization and budget, not fixed automatic agent counts.

```text
/tt-brainstorm simplify account setup depth=quick
/tt-brainstorm alternatives to our current onboarding depth=deep subagents=auto
```

### rounds — maximum discussion rounds

**Values:** integers `1` through `3`. **Default:** `2`; **hard cap:** `3`.

This limits brainstorming rounds, not coding correction rounds or GraphRAG hops. Budget and
no-progress can stop the workflow earlier. Without a responding user, it does one bounded round
and records open questions instead of manufacturing feedback.

```text
/tt-brainstorm reduce onboarding friction depth=standard rounds=1
```

### lenses — selected research perspectives

**Value:** a comma-separated list. **Default:** the useful perspectives selected for the topic/depth.

Name distinct questions the research should cover. Perspective names guide prompts; they do not
install specialist agents or guarantee a matching host agent type. Custom lenses must fit the task.

```text
/tt-brainstorm simplify onboarding lenses=user,accessibility,feasibility,contrarian rounds=2 subagents=auto
```

You receive sourced options, clearly labeled deductions, trade-offs and unresolved questions.
The result is not authorization to build the chosen idea.

## /tt-loop parameters

Use `/tt-loop <goal> until=<domain condition>` to prepare a bounded proposal. Its documented arguments
are `subagents`, `graph`, `rag`, `deliver`, `until` and the additional `dir` selector below. The
shared arguments retain their meanings. Unlike an ordinary `/thinktank` request, preparation needs
an explicit stop condition.

### dir — the target repository

**Value:** the intended repository path. **Default:** no explicit override in the argument hint;
the current repository must be resolved and confirmed by the host.

```text
/tt-loop prepare the agreed migration dir=/absolute/path/to/repository subagents=auto graph=off deliver=off until=existing records pass the integrity checks
```

This is context for the host, not a shell `cd`, permission grant or substitute for canonical scope
checks. It cannot move an armed run outside its operator-established repository. The path must exist
and belong to the authorized task. Preparation does not automatically launch a process or a schedule.

## Terminal CLI commands and flags

```bash
npx --yes @devgio81/thinktank --help
```

| Command | Purpose |
|---|---|
| `install` | Plan and install ThinkTank; the default when no subcommand is supplied |
| `doctor` | Inspect installed files/configuration and Qdrant availability/schema |
| `mcp` | Start the stdio MCP transport using the saved Qdrant configuration; normally started by the host |
| `validate-plan` | Validate a supplied JSON task plan and print dependency batches; does not run workers/tests |

The parser accepts the flags below. Use each flag with the command it affects: for example,
`--dry-run` protects the install path, not arbitrary subcommands, and `--max-workers` configures
plan validation rather than your host's live agent limit. Unknown options, missing required values
and invalid values fail. Duplicate flags fail except for repeatable `--write-root`.

### Installation and location flags

| Flag | Default / accepted values | Meaning and boundary | Example argument |
|---|---|---|---|
| `--platform` | Auto-detect one installed target; `hermes` or `claude` | Select the application to configure or inspect. Ambiguity prompts interactively or requires an explicit flag | `--platform hermes` |
| `--home` | Current OS user's home; path | Select all managed host profile locations, including Claude's `.claude.json`. This is not a named Hermes profile switch | `--home /absolute/path/to/test-home` |
| `--state-dir` | `<home>/.thinktank`; path | Select persistent runtime, backups and Qdrant configuration identity. Keep the same location for later doctor/MCP calls; this does not migrate old state | `--state-dir /absolute/path/to/thinktank-state` |
| `--port` | Automatically choose an available port; `1024`–`65535` | Set the local Qdrant REST port during installation. An occupied explicit port is refused, not taken over | `--port 7333` |
| `--collection` | `thinktank-memory` | Name the Qdrant collection. 1–128 letters/digits/underscores/hyphens; first character must be a letter or digit | `--collection engineering-memory` |
| `--timeout` | `120` seconds; `10`–`600` | Set the installer startup deadline. Not an agent task or token budget | `--timeout 240` |
| `--yes` | Off | Confirm the installation plan without an interactive prompt. Does not bypass local-edit conflicts or OS permissions | `--yes` |
| `--replace` | Off | Explicitly permit replacing conflicting managed files with backups. Preview and inspect before using it | `--replace` |
| `--dry-run` | Off | Preview installation changes without writing profile/state files, starting Docker or provisioning services. The outer `npx` can still download/cache the package | `--dry-run` |

An isolated preview using all location options (illustrative paths):

```bash
npx --yes @devgio81/thinktank install --platform hermes --home /absolute/path/to/test-home --state-dir /absolute/path/to/thinktank-state --port 7333 --collection engineering-memory --timeout 240 --dry-run
```

Normal installation and inspection:

```bash
npx --yes @devgio81/thinktank install --platform hermes --yes
npx --yes @devgio81/thinktank doctor --platform hermes
npx --yes @devgio81/thinktank doctor --platform claude --home /absolute/path/to/test-home --state-dir /absolute/path/to/thinktank-state
```

The first `--yes`, before the package name, belongs to **npx** and approves package acquisition.
The final `--yes` belongs to **ThinkTank** and confirms installation. Neither supplies model
credentials or changes approval policies. To intentionally replace managed local edits, preview first:

```bash
npx --yes @devgio81/thinktank install --platform hermes --replace --dry-run
npx --yes @devgio81/thinktank install --platform hermes --replace --yes
```

### Plan-validation flags

| Flag | Default / accepted values | Meaning and boundary | Example argument |
|---|---|---|---|
| `--plan` | Required for `validate-plan`; JSON file path | Read the generated task plan. Its contents must satisfy the plan schema | `--plan /absolute/path/to/plan.json` |
| `--write-root` | None; repeatable canonical scope | Allow listed plan write scopes during validation. Supports exact relative file paths or `directory/**`; grants no actual tool permission | `--write-root 'src/**'` |
| `--max-workers` | `3`; integer `1`–`64` | Capacity for the computed plan batches. Does not start workers or increase the host's actual concurrency cap | `--max-workers 3` |

```bash
npx --yes @devgio81/thinktank validate-plan --plan /absolute/path/to/plan.json --write-root 'src/**' --write-root 'tests/**' --max-workers 3
```

Quote wildcard scopes so your shell does not expand them. A plan has no write allowance by default.
It cannot grant itself access to protected controls. Structural validity does not prove that a test
command is safe, runnable or meaningful. Use the exported worker schema and the documented plan format:
[orchestration contract](../skills/thinktank/references/subagent-prompt-orchestration.md).

### Information flags and MCP transport

| Flag | Default | Meaning | Example argument |
|---|---|---|---|
| `--help`, `-h` | Off | Print CLI help and exit without installing or starting a model | `--help` |
| `--version` | Off | Print the package version and exit | `--version` |

```bash
npx --yes @devgio81/thinktank --version
npx --yes @devgio81/thinktank -h
npx --yes @devgio81/thinktank mcp --state-dir /absolute/path/to/thinktank-state
```

`mcp` is a transport process, not a diagnostic command: it reads existing state and waits for a
client over stdio. The host normally launches the registered persistent runtime directly. It does
not accept a secret/API-key flag; installation generates and stores the private Qdrant key.

## Combining parameters without changing their meaning

| Goal | Example settings | Important boundary |
|---|---|---|
| Single-context local work | `subagents=off graph=off deliver=off` | Human independent review is still required for accepted completion |
| Sequential specialist work | `subagents=on graph=off team=off` | Prompter first; workers run sequentially, not as a peer team |
| Independent reviews in a graph | `subagents=on graph=on deliver=off` | Only independent tasks may overlap; join before acceptance |
| Relationship-based research | `rag=graph graph=off deliver=off` | Evidence relationships do not require parallel execution; GraphRAG must be available |
| Observable delivery proposal | `deliver=on deploy=on-merge until=...` | Approval, CI and deployment/browser evidence remain separate gates |

No parameter bypasses safety, supplies credentials, changes providers or makes an unsupported
capability available. Use explicit task language for read-only scope, model constraints or budgets;
do not invent flags such as `--autonomous-release`, `--api-key` or `--tokens`.

## Source of truth

- [Main skill and defaults](../skills/thinktank/SKILL.md)
- [Brainstorming contract](../skills/tt-brainstorm/SKILL.md)
- [Loop preparation contract](../skills/tt-loop/SKILL.md)
- [CLI parser and help](../src/cli.mjs)
- [Graph execution contract](../skills/thinktank/references/graph-engineering.md)
- [GraphRAG prerequisites](../skills/thinktank/references/graphrag-lane.md)
- [Installed guard boundaries](../src/guard/README.md)
