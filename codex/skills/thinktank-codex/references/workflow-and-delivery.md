# Work packages, bounded loops and delivery

Loop discipline always applies: verifier, correction ceiling, token/time budget and no-progress.
Unattended loop mode and externally effectful delivery require actual host support and applicable
human authorization. This skill supplies no Codex interception hooks or launch process.

## Frozen packages and repository state

For multi-context/multi-slice work, record ordered independently reviewable packages in
`.thinktank/work-packages.md`. Each has stable ID, domain slice, dependencies, touched scopes,
frozen criteria/rungs, state, evidence and handoffs. Current repository state outranks memory.
Qdrant stores reusable recipes, not task status. Small obvious work needs no package scaffolding.

Use a fresh package-brief context before implementation when repo state has evolved. This is
different from the read-only V17 Prompter: parent persists the accepted brief under
`.thinktank/briefs/<id>.md`. Give implementer goal, current source, exact actions, observable
acceptance and boundaries. Criteria carry actual argv/cwd/expected outcome or human handoff;
derive from domain goal, repo conventions and relevant obligations. Freeze before writing code.
Changing a criterion needs a new reviewed package, never an in-place path to green.

Keep immutable scope/criteria distinct from mutable state and appended evidence. Normal dependency
means prerequisite independently accepted (`done`) before execution. A failed package remains failed;
a repair package records `remediates: <failed-id>` as a separate relation, not an impossible ordinary
dependency requiring that failed package to become done. New remediation is deliberate parent/user
work within the current scope; externally effectful forward-fix/revert still needs applicable approval.

Implementation-only states may be planned → briefed → in_progress → gated → checked → done.
With delivery in scope, checked is followed by commit/PR/merge/deploy/browser evidence; done means
the complete agreed outcome, not merely merged. blocked/failed retain evidence and stop dependent
execution. Append local checkpoints promptly; report uncommitted state instead of pretending it is
persisted upstream. Resume by reading and re-verifying claims, never by ranked memory alone.

## Acceptance ladder and independent decision

Use actual project commands for applicable static, unit, integration, e2e, browser and compliance
rungs. Missing capability is absent evidence, never a pass. Before a behavior change, show a
meaningful regression failure when applicable. Don't add tests that merely mirror a reversible
low-impact edit. Preserve tests and requested boundaries; no weakening/skipping for green.

Parent integrates owned diffs and reruns narrow relevant probes. An independent checker receives
frozen criteria and final candidate, not maker rationale. Any subsequent change invalidates
review. Correction is capped at three rounds and shared budget; change strategy after recoverable
failure, stop hard blockers/no-progress and report actual incomplete evidence.

## Interactive delivery

Delivery intent follows branch → frozen brief → implementation → gate → independent checker →
authorized commit/PR/merge → deployment observation → browser pass → checkpoint. Shipping is
never implied by loading a skill, generated prompts, a schedule, graph or grant-shaped JSON.
`deliver=off` leaves shipping with the human. A new versioned skill does not update an existing
alias or AGENTS policy unless requested. Attach created/relevant PRs using actual app tooling.

For authorized merge/deploy observation:

1. Confirm real merged state and non-null merge commit. Queue/auto-merge receipts are not a merge.
2. Resolve workflow by commit SHA + exact workflow + trigger event, never recency. For a PR-triggered
   run use the actual PR head identity and relevant filtering; don't assume target-branch lookup works.
3. Require an unambiguous run; poll compact status/conclusion with an explicit elapsed-time bound.
   Pending is not deployed. completed + success is pipeline evidence; waiting/action_required is
   a human gate. Do not rerun/cancel failed pipelines under inherited unattended rules.
4. Probe the serving staging/local revision separately. A green run doesn't prove that new code serves.
5. Run actual automated browser acceptance against that revision. Exploration can report failure,
   never rescue a red/missing automated rung. Missing browser means an explicit evidence gap.

A landed pipeline/browser failure remains failed and stops later delivery. Deliberate repair/revert
is a new package/handoff. Do not keep shipping atop a failed revision.

## Unattended boundary

Before a proposed unattended run, show a six-field Loop Contract: goal, observable stop, persistent
progress artifact, shared iteration/token/time limits, independent checker and addressed escape hatch.
Queue irreversible/outward actions in `docs/loop-triage/<run-id>.md` plus a real human-facing task or
authorized notification. Do not send external messages without applicable explicit authorization.

Actual host activation/tool-interception/denial tests must exist before launch. A slash command
cannot arm its own session; neither imported Hermes markers nor Claude hooks enforce Codex.
No supported corridor is included here. Unsupported grant-based actions stay blocked/queued;
never mint a grant and promise it releases tools, reword a denial or switch tools to bypass it.
Schedules, production, force-push, publishes, destructive operations and active harness remain
outside autonomous nodes. Current explicit interactive user authorization is handled by real
session permission/tool policy, not widened by this contract.
