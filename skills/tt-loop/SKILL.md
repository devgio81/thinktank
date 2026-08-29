---
name: tt-loop
description: Start a gated ThinkTank delivery run — an unattended loop that decomposes the goal into work packages and carries each through branch, brief, implementation, acceptance gate, commit, PR, merge, staging deploy and an autonomous browser pass, and that may promote a package to an explicit graph topology when it PROVES multi-hop or parallel structure. Compiles the domain stop condition into runnable rungs, mints a human-signed Autonomy Grant scoping exactly which irreversible links the run may perform, launches the gated process, and reports the triage queue before anything it shipped. Use when work should run unattended until a stated domain condition holds. Graph is default-off and earned by a decision matrix; graph=off runs the plain sequential delivery loop.
argument-hint: <goal> until=<domain condition> [graph=auto|on|off] [rag=vector|graph|auto] [merge-into=<branch>] [deploy=on-merge|dispatch:<workflow>|<exact command>|none] [max=<packages>] [hours=<grant lifetime>] [dir=<path>]
effort: high
---

# /tt-loop — start a gated delivery run

Launch an unattended ThinkTank delivery loop for:

$ARGUMENTS

A slash command cannot arm the loop-mode hooks for its own session because `CLAUDE_TT_LOOP_MODE` is part of the process environment and fixed at spawn. This command therefore prepares everything interactively, then starts a **new, gated process**.

## 0. Load the engine (not just these steps)

This file is the launcher, not the engine. Before step 1, load and follow:

- `../thinktank/SKILL.md` (the authoritative contract)
- `../thinktank/references/delivery-loop.md` (acceptance gates, delivery chain, Autonomy Grant, browser lane)
- `../thinktank/references/work-packages.md` and `../thinktank/references/prompt-writer-contract.md`
- `../thinktank/references/loop-engineering.md` (four stacked exits, maker/checker, triage queue, anti-reward-hacking)
- `../thinktank/references/graph-engineering.md` (topology, typed nodes, deterministic reducers, routing, fan-out plus the compound-cost guard, node observability, counter-metrics, the Decision Matrix, the never-graphable surface) and `../thinktank/references/graphrag-lane.md` (the `rag=` lane) whenever graph mode is in play

and the inherited references as the contract directs. The launching session runs the full engine: the evidence ledger, groundedness gate, AI-touchpoint scan, and independent review. It does not run only the mechanics below.

## 1. Refuse the wrong shape first

Decline, in one sentence, when the loop-engineering reference §10 applies (genuinely one-off work · "done" is a shifting judgment call · nothing can mechanically observe success), or when delivery mode's own preconditions fail:

- **no runnable rung** to build an Acceptance Gate from — then the first work is writing tests, not looping;
- **no staging environment and no local runtime** that can stand in for one — a browser pass needs somewhere to run;
- **a single-package goal** — an interactive session ships it faster than this ceremony.

## 2. Compile the domain condition into an Acceptance Gate

Take `until=` verbatim as the **domain sentence**. Resolve any ambiguity with the user *now*, not mid-run. Then compile the sentence into named rungs with real commands, detected from the repo (`package.json` scripts, CI config, test dirs, `playwright.config.*`):

```
rung 0 static       <typecheck/lint/build command>
rung 1 unit         <unit command, scoped>
rung 2 integration  <command>            ← mark ABSENT if the repo has none
rung 3 e2e          <command>
rung 4 browser      <playwright command against staging> + exploratory pass
```

**Pre-check the gate.** Every present rung must execute, and the gate as a whole must currently **fail**. A gate that is already green means there is nothing to do. A gate that errors can never terminate successfully. Report either condition instead of launching. Show absent rungs explicitly because they represent missing evidence, not passed checks.

## 3. Decompose into work packages

Read the repo, then produce the ordered package plan per `../thinktank/references/work-packages.md` §2–§3, write it to `<dir>/.thinktank/work-packages.md`, and show it. At least one package must cover every clause of the domain sentence. State the dependency order and the risk order. This plan is a proposal. The user sees it before the grant is signed.

## 3a. Decide graph mode — before decomposition is finalized

- **`graph=off` → run the plain sequential loop.** Skip the rest of this section; the launch prompt carries no topology.
- **`graph=auto` (default) / `graph=on` → apply the Decision Matrix** (`../thinktank/references/graph-engineering.md` §7a) to the goal and to each package: promote to a topology **only** when the work is multi-hop or has genuinely independent parallel units, the measured pass rate clears the ~50% break-even, and cost-per-successful-completion is projected to fall. **The default answer is loop.** A package that fails the matrix stays a sequential work package, and the report says why the escalation was denied.
- **Record the topology next to the plan.** For every package promoted to a graph, write its **frozen plan DAG** (node kinds, edges, which fields each deterministic reducer owns) into `<dir>/.thinktank/work-packages.md` alongside the package. No cycles in the plan; controlled runtime cycles are bounded by the exits. Show it before the grant is signed.
- **`rag=`** selects the retrieval lane for the run (`vector` default · `auto` lets the query-shape classifier escalate multi-hop or global queries · `graph` forces the GraphRAG lane and pays the indexing cost).

## 3b. Determine how this repository deploys — before asking for anything

Do not ask the user for a deploy command until you have looked. Read `.github/workflows/*.yml` (and `azure-pipelines.yml`, `.gitlab-ci.yml`, `vercel.json`, `netlify.toml`) and establish two things:

1. **Which workflows trigger on a push/merge to the candidate merge target** — `on: push: branches: [...]`, `on: pull_request: types: [closed]`, `environment:` blocks. If one exists, the mode is **`on-merge`**: the loop initiates nothing at link 8, it observes.
2. **Where each of those pipelines actually deploys.** This is the question the whole grant turns on, and it is a human judgment — say what you found and ask the user to confirm it, per merge target: *"merging into `dev` runs `deploy-staging.yml`, which deploys to staging — correct?"* A target whose pipeline reaches production is **never grantable**, whatever the branch is called.

   Record two more things per target while you are in the workflow file, because link 8 cannot resolve its run without them: **which workflow is the deploy** (`merge_targets_deploy_workflow`) and **which event triggers it** (`merge_targets_deploy_trigger`: `push` or `pull_request`). The trigger changes where the run is filed — a `pull_request`-triggered workflow files its run under the PR head branch, so filtering on the merge target returns nothing at all. **Refuse to sign an `on-merge` grant that does not name the deploy workflow**: one merge commit routinely carries many runs, and an unnamed one makes link 8 unverifiable. That is a refusal, not a default.

   If the target requires a **merge queue**, it is not deliverable unattended — `gh pr merge` exits 0 without a merge commit there, and the run would believe it merged. Refuse the target and say why.

Then fix the mode: `on-merge` (default when a merge-triggered workflow exists) · `dispatch:<workflow>` (a `workflow_dispatch` the loop may trigger) · an exact local command · `none`. Take an explicit `deploy=` from the user over your detection, but say so when the two disagree — a user pointing at a deploy command in a repo that already auto-deploys on merge would otherwise ship twice.

Also capture the **staging URL** the browser pass will run against, and verify it currently responds. Without it, rung 4 has nowhere to go and is recorded as absent (§1.1 of the engine reference).

And settle **which half of rung 4 the run can actually perform**: the deterministic half needs the project's e2e runner, the exploratory half needs the Browser-pane tools, which an unattended `claude -p` process usually lacks. Check both and say so in the launch report — a rung whose exploratory half cannot run is reported as partial evidence, never as a full pass.

## 4. Mint the Autonomy Grant (interactive, explicit, expiring)

Derive the run id:

```
RUN_ID="tt-$(date +%Y%m%d-%H%M%S)-$RANDOM"
```

Then show the user the exact grant you intend to write and **wait for a clear yes**. Do not pre-fill it from guesses: `merge-into=` and the deploy fields come from the user or from §3b confirmed by the user, and an absent field means that link stays denied and queued. **A topology never widens the grant** — the grant gains no fields when a package runs as a graph.

```json
{
  "run_id": "<RUN_ID>",
  "granted_by": "<user>",
  "granted_at": "<now, ISO-8601 UTC>",
  "expires_at": "<now + hours=, default 6h>",
  "repo_path": "<dir, absolute>",
  "branch_prefix": "feat/tt-",
  "remote": "origin",
  "merge_targets": ["<merge-into>"],
  "merge_targets_deploy_to": { "<merge-into>": "<staging|…, confirmed in §3b>" },
  "merge_targets_deploy_workflow": { "<merge-into>": "<deploy-staging.yml>" },
  "merge_targets_deploy_trigger": { "<merge-into>": "<push|pull_request>" },
  "deploy_mode": "on-merge",
  "deploy_commands": [],
  "deploy_workflows": [],
  "staging_url": "<url the browser pass runs against>",
  "max_merges": <max, default 4>,
  "domain_condition": "<the sentence>"
}
```

Fill exactly one deploy path, and **validate that before writing the file**: `on-merge` leaves both arrays empty (the pipeline does it); `dispatch` puts the workflow file in `deploy_workflows`; a local command goes into `deploy_commands` verbatim, matched exactly at runtime. Two filled paths mean a double deploy — refuse and ask. The guard acts on the arrays, not on `deploy_mode`, so this validation is the only place the mode label and reality are reconciled.

Write it to `~/.claude/loop-grants/<RUN_ID>.json` (create the directory, `chmod 600`). Then state, in the launch report, **what the grant does not permit** — production deploys, force-push, `reset --hard`, publishes, re-running or cancelling a pipeline (`gh run rerun|cancel`), mutating API calls (`gh api -X POST|PUT|PATCH|DELETE`, `curl -X …`), destructive deletes, schedules, and every part of the harness are never grantable and stay denied regardless of this file. Tell the user the kill switch: deleting the grant file stops every gated action at the next attempt.

Never put a protected branch (`main`, `master`, `production`, `release/*`) in `merge_targets`. If the user asks for one, that is a human-gated merge — decline the grant field, keep the PR link in the report, and say so.

## 5. Write the Loop Contract

The six fields, to `<dir>/docs/loop-triage/<RUN_ID>.md` (create the directory), then show them: recursive goal · stop condition (the domain sentence **and** its compiled rungs) · progress artifact (`.thinktank/work-packages.md`) · budget (`max=` packages, three correction rounds per failing rung, plus a wall-clock cap matching the grant) · checker (a separate subagent, never the maker) · escape hatch (this same file). The same file is the triage queue.

## 6. Launch

In `<dir>`, in the background when the budget exceeds a couple of minutes:

```
CLAUDE_TT_LOOP_MODE=1 CLAUDE_TT_RUN_ID="$RUN_ID" claude -p "<prompt>"
```

The nested run inherits none of this conversation, so the prompt must be self-contained and state:

- **first, that it runs under the ThinkTank engine** — instruct it by path to read `~/.claude/skills/thinktank/SKILL.md` and the delivery references plus `~/.claude/skills/thinktank/references/loop-engineering.md`, and to operate under that contract. Paths are deterministic; a slash-command name or a `CLAUDE.md` preference is only a nudge;
- the domain sentence, the compiled rungs with their exact commands, and that **rung 4 decides a package** — a merge does not;
- the path to the work-package file and that it is the source of truth for state, Qdrant only for judgment;
- **how link 8 works in this repo**, spelled out because three plausible-looking commands are wrong: it initiates nothing in `on-merge` mode. It first **confirms the merge** (`gh pr view <n> --json state,mergedAt,mergeCommit` — only `MERGED` plus a real `mergeCommit.oid` counts; `--auto` and merge queues exit 0 without merging). Then it resolves the run by **identity, not recency**: `gh run list --commit <sha> --workflow <the grant's deploy workflow> --event <the grant's trigger>`, where the sha is the merge commit for a `push` trigger and the *PR head* for a `pull_request` trigger (whose runs are filed under the PR head branch, so `--branch <target>` returns nothing) — and for `pull_request`, only runs created after `mergedAt`. Exactly one row must match; zero after a bounded poll, or two or more, are both hard blockers. Then it **polls** `gh run view <id> --json status,conclusion` in short calls counting elapsed time itself (`gh run watch` has no timeout flag, and `gh run view --exit-status` returns 0 for a *pending* run — never use it as the verifier), accepts only `completed`+`success`, and probes `staging_url` for the new build before rung 4. **`waiting`/`action_required`/`requested` means a human approval gate — stop immediately, queue the run URL and the pending environment, never wait it out and never approve it.** A red or timed-out pipeline is a hard blocker: queue it with the run id and the log excerpt and stop — `gh run rerun` is never grantable, and the change is already merged, so §5.2 of the engine reference applies;
- **the grant's contents, restated in full** — repo, branch prefix, merge targets and what each deploys to, deploy mode and its allowlisted workflow or command, staging URL, merge ceiling, expiry. The run **cannot read the grant file** (the guard denies all shell access to `loop-grants`), so if you do not tell it, it does not know its own limits;
- that each package is briefed by the `thinktank-prompt-writer` subagent, that the criteria it freezes are immutable, and that the coder is bound to them;
- that a **separate checker** runs at link 5 of every package under the spawn contract in the engine reference §2b — it receives the frozen criteria, the diff, the rung commands and `touches`, and **not** the brief's reasoning or the coder's explanation; it re-runs the rungs itself rather than trusting a reported exit code; and non-trivial packages additionally get the independent review at link 5b, which the checker does not replace;
- that a **separate checker** verifies each package and the termination decision, and writes `~/.claude/loop-checker/$CLAUDE_TT_RUN_ID.ok` containing the three required lines — `EXIT=`, `ACCEPTANCE=`, `EVIDENCE=` — or completion stays blocked;
- that the grant at `~/.claude/loop-grants/$CLAUDE_TT_RUN_ID.json` defines the only permitted irreversible actions, that everything else is **queued** into `docs/loop-triage/$CLAUDE_TT_RUN_ID.md` and never performed, and that a guard denial is a signal to queue and continue — **never** to retry, reword, split or wrap the command;
- **the exact command form gated actions must take** (engine reference §3.2a), because the guard enforces it and a run that does not know it will be denied on the happy path: one plain command per tool call, starting with the verb, with no `&&`/`;`/`|`/backticks/`$( )`/redirects, no `cd` prefix and no `git -C`; `git push -u origin <feature-branch>` with exactly those two positional arguments; `gh pr create --base <granted target> --title … --body …`; `gh pr merge <number> --squash --delete-branch`; `gh workflow run <allowlisted workflow> --ref <covered branch>` with no `--field` inputs. Reading (`gh run list/view/watch`, `gh pr view`, `git status/log/diff`) is never gated;
- that it must honor the four stacked exits (verified · ceiling · budget · no-progress) and report which one fired;
- that it must never delete, weaken or skip a test, never let a diff exceed its package's `touches`, and never edit skills, `CLAUDE.md`, hooks, schedules or its own grant;
- that a blocked run reports state, evidence and the named handoff instead of a completion.

### 6a. What the launch prompt must additionally state when graph mode is in play

Append these, so the nested run knows the graph rules it will be held to:

- that **graph mode is default-off and earned** — a package runs as a sequential loop unless its recorded plan DAG says otherwise, and "it would be more elegant as a graph" is not a reason;
- that **reducers must be deterministic** — an LLM-judged merge of a contested field is forbidden (self-grading); disjoint-file partition stays the default for repo files;
- that **`goto` routing may target only nodes already in the frozen plan DAG**, and may **never** route around the checker, the human-checkpoint, or the Art. 5 hard stop; a fixer cycle is charged against the three-correction-round budget;
- that a **parallel fan-out joins at a synthesizer before the Acceptance Gate**, spends **one** shared budget exit, and obeys the **compound-cost guard** — a fully-failed fan-out re-dispatches at most **once**, then the item is queued to triage;
- that **node-level telemetry** (`graph_id`/`node_id`, per-node cost/tokens/latency, cost-per-successful-completion) is attribution **under** the four stacked exits — **never a fifth exit** — and records metadata, never the checker's judgment inputs;
- that a **paired counter-metric** attaches only to an optimization target, never to a binary correctness or safety rung, its counter is an exit-code probe where one exists, its anchor is an existing exogenous anchor, and a breach routes to the escape hatch (never a gameable exit); declaring or re-pairing a counter is target-setting the unattended run may only measure and queue;
- for the **GraphRAG lane**: multi-hop traversal is capped at 3 hops on the inherited retrieval budget; ambiguous entities go to a human-review queue, never a silent merge; a multi-hop synthesis cites its hop-chain into the evidence ledger or is flagged an assumption; Qdrant down means memory unavailable, never a fabricated edge;
- that the **never-graphable surface is absolute** — no topology, edge, or `goto` widens the grant or turns a human-gate into an auto-satisfiable node; "the graph did it" is not an audit answer;
- that graph **recipes may only tighten**, and the run may **never** self-modify the routing gate, the lane-selection policy, skills, `CLAUDE.md`, hooks, schedules, or its own grant.

## 7. Report back

**Triage queue first**, before anything the run shipped. Then: which exit fired; per package its state, the rung that proved it, the PR link and the deploy run it waited on; what the checker verified and by what means; packages against `max_merges`; the grant that was in force, what each merge target deploys to, and what the grant excluded; and the checker record's contents. If the completion gate blocked the run, show the gate's message plainly — that is the mechanism working, not a defect.

Where graph mode was in play, add: the **Decision Matrix** verdict per package (graph, or why the escalation was denied); for each graph package the node-level telemetry summary (cost-per-successful-completion, the most expensive node, any cheaper-model or semantic-cache routing applied); and, where a Goodhart rung was active, the paired counter-metric and its anchor with each optimization target. A graph that beat the loop on cost-per-successful-completion is a graph recipe worth storing (`workflow=agentic-engineering`, `domain=graph-engineering`).

A merged package whose browser pass failed is reported as **failed**. Never present the run's own "done" as verified without the checker record: "done" is a claim, not a proof.
