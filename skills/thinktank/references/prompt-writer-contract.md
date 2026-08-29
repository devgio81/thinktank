# Prompt-Writer Contract

Between planning and coding sits one agent whose only output is a **brief**: the implementation prompt for a single work package, based on the repo as it stands now, with acceptance criteria derived automatically and frozen before anyone writes a single line of code.

The reason it exists: a plan is written once, at the start, when the code is in one state. The coder for package 7 works in a different state, several merges later. Handing that coder the original plan text causes the loop to drift, because it implements against a repository that no longer exists. The prompt-writer re-reads the repo for each package and turns the relevant slice of the plan into instructions that fit the current state.

Agent definition: `~/.claude/agents/thinktank-prompt-writer.md`.

## 1. Role and boundary

- **Writes prompts. Never writes code, never runs the delivery chain.** It may write only to `.thinktank/briefs/<id>.md` and the package's entry in `.thinktank/work-packages.md`. It holds `Write`/`Edit` because it must update that entry. This contract plus the checker's scope criterion provide the containment, not a tool restriction — which is more honest than a `disallowedTools` line that blocks the one file the agent must touch while leaving the rest open.
- **Is not the coder and is not the checker.** These are three distinct contexts. Adding a briefer does not affect the maker/checker split (`loop-engineering.md` §4).
- **Grounded, not inventive.** Every statement in a brief comes from the repo or the evidence ledger, or is explicitly marked as an assumption. An invented file path or a guessed convention costs the coder a full correction round.
- **Reports "underspecified" rather than guessing.** If the agent cannot turn the package slice into provable criteria, it reports that finding to the human instead of writing a prompt anyway.

## 2. Inputs

1. The work package (`work-packages.md` §2) and the run's domain condition.
2. The Acceptance Gate: which rungs exist in this repo and the exact command for each.
3. **Current repo state**, read rather than assumed: the modules the package touches, the conventions used there (naming, error handling, test layout, i18n, styling), the closest existing analogue to the planned build, and anything merged by earlier packages in this run.
4. The evidence-ledger slice for this package, including any compliance obligations already compiled into requirements.
5. Prior Qdrant delivery recipes for this stack, if any.

## 3. The brief envelope

A brief has exactly these sections, in this order. Anything else is noise that consumes the coder's context.

```
## Ziel            one paragraph: what exists after this package, in domain terms
## Kontext         the repo facts the coder would otherwise have to rediscover —
                   file paths, the analogue to follow, the convention that applies,
                   what earlier packages already changed
## Auftrag         the concrete change, in the order it should be made
## Akzeptanzkriterien   §4 — numbered, each with its proof command. NON-NEGOTIABLE.
## Grenzen         what must not be touched: files, patterns, scope. Explicitly:
                   no test may be deleted, weakened or skipped; the diff stays
                   inside `touches`
## Rückgabe        what the coder returns: the diff summary, each criterion with
                   its command output, and anything it could not satisfy
```

The envelope uses the language of the surrounding codebase and the requester; the section names above may be localized to match, but the order and content of the six sections are fixed. Long enough to remove guesswork, short enough that the coder's context is spent on code (`loop-engineering.md` §7).

## 4. Deriving acceptance criteria

Derive the criteria rather than copying them. Each one must satisfy all four:

1. **Observable**: states an outcome someone could check, not an activity. *"Guest checkout completes and the confirmation mail is queued"*, not *"implement guest checkout properly"*.
2. **Provable**: includes the exact command that proves it and identifies its rung. A criterion with no command is a wish. Either find the command, write the test that becomes the command, or move the criterion to the human.
3. **Bounded**: can be falsified by a specific failing case. If nothing could fail it, it says nothing.
4. **Traceable**: maps back to a clause of the domain condition, a compliance obligation, or a repo convention. A criterion traceable to nothing is scope creep with a checkbox.

**Derive from four sources, in this order:** the domain condition's clauses → the repo's existing conventions and analogous tests → the EU-AI-Act obligations for this feature (transparency, logging, deletion paths) → the non-functional floor the project already holds itself to (a11y, error states, i18n, mobile width). The floor is what catches "the coder forgot the empty state" before it is written.

**Unless the package genuinely cannot affect them, always include** the regression criterion (existing suites stay green) and the scope criterion (the diff stays inside `touches`). For anything user-facing, include one criterion per rung 4 flow, so the browser pass has something specific to drive.

## 5. Freezing and tamper detection

- Once the package moves to `in_progress`, **the acceptance criteria are frozen**. The coder implements against them. It does not negotiate them.
- **Changing a criterion requires a new work package**, decided by a human. Editing criteria mid-flight creates the reward-hacking path that the whole gate exists to close (`loop-engineering.md` §8): the cheapest way to pass a test is to change the test.
- Write the frozen block into both `.thinktank/work-packages.md` and the brief. **The checker compares both copies with the frozen criteria it was handed.** Any divergence is a hard fail for the package and is reported as tampering, not as a mismatch, regardless of how reasonable the new wording appears.
- A criterion that turns out to be *wrong*, not merely inconvenient, is still not edited in place. The package fails with that finding, and the human re-cuts it. Being right about a bad criterion does not authorize rewriting it silently.

## 6. Handoff

- The brief goes to the implementing agent (a specialist agent, an `Agent` call, or a teammate) as its complete instruction set. **The coder does not get the plan, the transcript, or the other packages.** It gets only this brief and the repo.
- Write the brief to `.thinktank/briefs/<package-id>.md` so reviewers can inspect it in the PR: what the coder was told is part of what a reviewer needs.
- The coder returns the materials specified in §3 `Rückgabe`. Treat a return that claims success without command output as a failed round, not a passed one (`loop-engineering.md` §8).
- The checker receives the **frozen criteria and the diff**, never the brief's reasoning — a checker that reads the maker's justification starts agreeing with it.

## 7. Antipatterns

| Antipattern | What it looks like |
|---|---|
| **Plan echo** | the brief restates the plan slice without reading the current repo — drift ships |
| **Criterion inflation** | twenty criteria, half unprovable, so the coder optimizes the checkable ones |
| **Unprovable criterion** | "code is clean and maintainable" — nothing runs, so nothing is enforced |
| **Negotiated criteria** | the coder reports a criterion as "not applicable" and the loop accepts it |
| **Context dump** | the whole transcript pasted in as "context", spending the coder's window on noise |
| **Invented repo facts** | a path, hook or convention the writer never verified, costing a full round |
