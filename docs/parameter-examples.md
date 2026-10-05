# ThinkTank V17: one parameter at a time

**Each example below isolates one parameter and explains its expected effect.** Run each code block
as a separate request; do not paste alternative values into the same request.

[Overview](../README.md) · [Full parameter definitions and defaults](parameters.md)

## How to use these examples

Unspecified parameters keep their documented defaults. A single explicit parameter does not disable
other features. Read-only requests below prevent edits through the task wording, without adding a
second parameter. These are requests and expected behaviors, not recorded execution results.

Two necessary exceptions are labeled: `/tt-loop` requires `until`, and plan-validation modifiers
require `--plan`. Terminal previews also retain `--platform hermes --dry-run` as a fixed safety baseline;
only the parameter being demonstrated changes. Never remove a prerequisite just to shorten an example.

Replace illustrative repository paths, notebook identifiers, collection names and workflow/script
names with existing, authorized targets. No example authorizes a release, bypasses approval or adds
a missing capability. Slash commands belong in host chat; `npx` commands belong in a terminal.

## subagents

### subagents=auto
```text
/thinktank review this API and its settings screen without editing files subagents=auto
```
Expected: use a Prompter and separate domain workers only if isolated contexts help; otherwise work in one context.

### subagents=on
```text
/thinktank review this API and its settings screen without editing files subagents=on
```
Expected: run a read-only Prompter first, validate its contracts, then dispatch valid workers. A single useful task may remain sequential.

### subagents=off
```text
/thinktank review this API and its settings screen without editing files subagents=off
```
Expected: the parent performs the work without Prompter or worker subagents. Independent acceptance needs a separate human reviewer.

## graph

### graph=auto
```text
/thinktank investigate this regression without editing files graph=auto
```
Expected: retain sequential execution unless useful task structure and measured retry/cost evidence justify a graph.

### graph=on
```text
/thinktank investigate this regression without editing files graph=on
```
Expected: declare an explicit typed dependency graph. A linear graph is valid; parallel agents and GraphRAG are not implied.

### graph=off
```text
/thinktank investigate this regression without editing files graph=off
```
Expected: execute sequentially without optional graph overhead. Dependencies and independent review still apply.

## rag

### rag=vector
```text
/thinktank find prior decisions about retry handling without editing files rag=vector
```
Expected: use semantic memory retrieval where appropriate, while current repository questions still use direct source inspection.

### rag=graph
```text
/thinktank trace which retry decision superseded the old policy without editing files rag=graph
```
Expected: follow available typed knowledge relationships and cite the chain, up to three hops. Missing graph prerequisites become explicit gaps.

### rag=auto
```text
/thinktank trace which retry decision superseded the old policy without editing files rag=auto
```
Expected: start vector-first and assess whether available graph retrieval is justified. Do not invent relations or provision a graph backend.

## team

### team=auto
```text
/thinktank compare two migration strategies without editing files team=auto
```
Expected: assess whether peer discussion is useful and supported; otherwise use leaf workers or one context.

### team=on
```text
/thinktank compare two migration strategies without editing files team=on
```
Expected: request real supported team coordination. If the host cannot provide it, return a handoff rather than simulated teammate messages.

### team=off
```text
/thinktank compare two migration strategies without editing files team=off
```
Expected: avoid optional peer teams. Ordinary scoped subagents may still be selected by their unchanged default.

## loop

### loop=auto
```text
/thinktank assess how to repair the failing tests without editing files or starting processes loop=auto
```
Expected: assess whether unattended work would help, but do not start it. The read-only task remains the scope.

### loop=on
```text
/thinktank prepare a proposal to repair the failing tests; do not edit or launch anything loop=on
```
Expected: prepare the unattended-work requirements, including an agreed stop condition, budgets, isolation and verified hooks. Do not arm this chat session.

### loop=off
```text
/thinktank investigate the failing tests without editing files loop=off
```
Expected: remain interactive. Normal bounded correction is not disabled for future authorized implementation.

## deliver

### deliver=auto
```text
/thinktank assess the agreed feature and its verification plan without editing or releasing anything deliver=auto
```
Expected: determine whether delivery belongs in the intended plan, while respecting the explicit assessment-only scope.

### deliver=on
```text
/thinktank prepare a delivery plan for the agreed feature; do not implement or release it deliver=on
```
Expected: include the delivery chain and its human handoffs in the plan. This setting does not authorize commit, push, merge or deployment.

### deliver=off
```text
/thinktank implement the agreed fix and run local checks deliver=off
```
Expected: allow scoped implementation and local verification but stop before shipping. This is not a read-only setting.

## cognitive

### cognitive=verbose
```text
/thinktank diagnose this timeout without editing files cognitive=verbose
```
Expected: show concise cycle summaries, observed evidence, alternatives and verification limits, not private chain-of-thought.

### cognitive=silent
```text
/thinktank diagnose this timeout without editing files cognitive=silent
```
Expected: omit cycle markers while retaining verification and reporting failures or gaps.

## notebook

### notebook by name
```text
/thinktank compare our documented migration approaches without editing files notebook="Architecture decisions"
```
Expected: resolve that visible notebook through an already configured, authorized integration and verify its citations. Ambiguity requires clarification.

### notebook by ID
```text
/thinktank compare our documented migration approaches without editing files notebook=<visible-notebook-id>
```
Expected: validate the supplied ID before querying. Replace the placeholder with a real accessible ID; this does not create or import a notebook.

## until

### until with one observable condition
```text
/thinktank implement the agreed webhook retry fix locally; do not ship until=replaying one valid event leaves exactly one business transaction
```
Expected: translate the condition into a real acceptance check before implementation. Budget, ceiling and no-progress exits can still stop the task incomplete.

### until with multiple requirements
```text
/thinktank implement the agreed webhook retry fix locally; do not ship until=replaying a valid event creates one transaction and invalid signatures are rejected
```
Expected: map both clauses to checks. Passing only the replay check does not satisfy the whole condition.

## deploy

These advanced options propose a route; none executes it or unlocks an unattended release corridor.
The task wording deliberately asks for a plan rather than permission to release.

### deploy=on-merge
```text
/thinktank document the proposed staging delivery route without releasing anything deploy=on-merge
```
Expected: inspect the existing merge-triggered pipeline and plan observation of an authorized merge. A production-triggering merge remains human-only.

### deploy=dispatch
```text
/thinktank document the proposed staging delivery route without releasing anything deploy=dispatch:staging.yml
```
Expected: confirm that the named workflow exists and record the approval needed to dispatch it. `staging.yml` is illustrative.

### deploy with an exact command
```text
/thinktank document the proposed staging delivery route without releasing anything deploy="npm run deploy:staging"
```
Expected: inspect the actual script and record its proposed use and approval boundary. Do not execute it merely because it appears in the request.

### deploy=none
```text
/thinktank implement the agreed change locally; do not publish or merge deploy=none
```
Expected: exclude deployment. `deploy=none` alone would not exclude commits or PRs; this request separately limits the work to local changes.

## depth

### depth=quick
```text
/tt-brainstorm simplify onboarding depth=quick
```
Expected: suggest two useful research perspectives, subject to the available tools and budget.

### depth=standard
```text
/tt-brainstorm simplify onboarding depth=standard
```
Expected: suggest four research perspectives. This is breadth guidance, not a fixed automatic worker count.

### depth=deep
```text
/tt-brainstorm simplify onboarding depth=deep
```
Expected: suggest five appropriate perspectives while preserving the same safety and budget boundaries.

## rounds

### rounds=1
```text
/tt-brainstorm simplify onboarding rounds=1
```
Expected: perform at most one brainstorming round and report remaining questions.

### rounds=2
```text
/tt-brainstorm simplify onboarding rounds=2
```
Expected: allow at most two rounds. Without user feedback, stop after one bounded round instead of inventing answers.

### rounds=3
```text
/tt-brainstorm simplify onboarding rounds=3
```
Expected: allow at most three rounds, the hard cap. Budget or no progress may stop the workflow earlier.

## lenses

### selected lenses
```text
/tt-brainstorm simplify onboarding lenses=user,accessibility,feasibility,contrarian
```
Expected: cover these distinct research perspectives. Names guide the research; they do not install agents or force parallel execution.

## dir

### repository selector with required stop condition
```text
/tt-loop prepare a local migration proposal without launching it dir=/absolute/path/to/repository until=existing records pass the integrity checks
```
Expected: resolve and confirm the selected repository. `until` is a required companion for `/tt-loop`, not another optional demonstration. The path grants no access by itself.

## CLI flags: one change per example

For install previews the fixed baseline is `install --platform hermes --dry-run`. Each example
changes or adds only its named flag. `--platform` is shown for both supported hosts. The outer
`npx --yes` only approves package acquisition; it is not ThinkTank's installation confirmation.

Preview examples do not install anything. **The `--yes` example is intentionally effectful** and
clearly marked. All `/absolute/path/...` values are placeholders; plan validation needs a real plan.

### --platform: Hermes
```bash
npx --yes @devgio81/thinktank install --platform hermes --dry-run
```
Expected: preview installation for Hermes only; do not provision services or modify the profile.

### --platform: Claude Code
```bash
npx --yes @devgio81/thinktank install --platform claude --dry-run
```
Expected: preview installation for Claude Code instead of Hermes. No host application is installed by this preview.

### --home
```bash
npx --yes @devgio81/thinktank install --platform hermes --dry-run --home /absolute/path/to/test-home
```
Expected: preview managed files under the supplied home, with default state under that home. This does not select an existing named Hermes profile.

### --state-dir
```bash
npx --yes @devgio81/thinktank install --platform hermes --dry-run --state-dir /absolute/path/to/thinktank-state
```
Expected: preview a custom runtime/data location while retaining the current home for profile targets. This does not migrate an existing installation.

### --port
```bash
npx --yes @devgio81/thinktank install --platform hermes --dry-run --port 7333
```
Expected: include port 7333 in the proposal. A later real installation must check availability; the preview is not proof that the port is free.

### --collection
```bash
npx --yes @devgio81/thinktank install --platform hermes --dry-run --collection engineering-memory
```
Expected: propose `engineering-memory` instead of the default collection. No existing collection is adopted or renamed by the preview.

### --timeout
```bash
npx --yes @devgio81/thinktank install --platform hermes --dry-run --timeout 240
```
Expected: accept a 240-second startup allowance for the proposed installation. Preview starts no service, so it neither waits for startup nor proves startup success.

### --yes
```bash
npx --yes @devgio81/thinktank install --platform hermes --yes
```
Expected: **perform installation**, accepting ThinkTank's plan without its confirmation prompt. This intentionally replaces the preview baseline's `--dry-run`; conflicts and OS permissions still require resolution.

### --replace
```bash
npx --yes @devgio81/thinktank install --platform hermes --dry-run --replace
```
Expected: preview deliberate replacement of conflicting managed files. No replacement or backup is written during preview; actual replacement requires an authorized install without `--dry-run`.

### --dry-run
```bash
npx --yes @devgio81/thinktank install --platform hermes --dry-run
```
Expected: show the installation plan only. The outer npx command may download/cache the package; this flag is not a no-network switch for npx or a sandbox for other subcommands.

### --plan
```bash
npx --yes @devgio81/thinktank validate-plan --plan /absolute/path/to/plan.json
```
Expected: validate an existing read-only task plan with no allowed write roots. A plan requesting writes fails until appropriate roots are explicitly supplied.

### --write-root
```bash
npx --yes @devgio81/thinktank validate-plan --plan /absolute/path/to/plan.json --write-root 'src/**'
```
Expected: allow declared plan writes under `src/**` during structural validation. `--plan` is required; quote the wildcard so the shell cannot expand it. No actual tool permission is granted.

### --max-workers
```bash
npx --yes @devgio81/thinktank validate-plan --plan /absolute/path/to/plan.json --max-workers 2
```
Expected: compute capacity-bounded batches of at most two tasks for a valid read-only plan. `--plan` is required; the flag neither starts workers nor changes host concurrency.

### --help
```bash
npx --yes @devgio81/thinktank --help
```
Expected: print CLI help and exit. No application setup or model run starts.

### -h
```bash
npx --yes @devgio81/thinktank -h
```
Expected: print the same help as `--help`; this is its short alias.

### --version
```bash
npx --yes @devgio81/thinktank --version
```
Expected: print the fetched package's version and exit. This does not inspect which version your host has already installed.

## What these examples do not prove

A request is not a completed run. Valid option syntax does not establish accessible notebooks,
meaningful tests, a working deployment or host support. Every actual run still needs source checks,
applicable authorization, real verification and an honest report of missing evidence.

See the [parameter guide](parameters.md) for defaults, limits and source links.
