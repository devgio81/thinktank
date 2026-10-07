# Read-only brainstorming

Use for complex idea-space exploration, not routine factual answers. Conductor owns user questions,
scope and result synthesis; researchers inspect one lens and return ideas, sources and candidate
questions without implementing, writing, deciding or asking the user directly.

Frame goal/audience/constraints from available context. Ask only critical missing preferences via
the actual question tool and its limits. Required answers remain pending; silence is not approval.
With `subagents=on`/useful auto, Prompter first creates read-only lens contracts; parent validates
then dispatches capacity-bounded researchers. `subagents=off` keeps investigation in the parent.
Graph requests still follow the current AGENTS Decision Matrix; ideation is not a cost baseline.

Default at most two research rounds, hard cap three, plus shared token/time and no-progress bounds.
No fixed five-worker fan-out: use live child capacity and batch. Preserve source provenance and
deduplicate exact/stable IDs deterministically; semantic disagreements remain side by side for
source review or user decision. Don't ask a model to vote a contested assessment true.

Without user response, one useful research round may finish under stated assumptions; stop before
dependent preference-sensitive work. A user's "enough" closes ideation by user judgment, not proof
that ideas are correct or engineering acceptance passed. Record that distinction in the report.
Write a requested dossier in authorized project scope; store only sanitized reusable results to
the configured V9 memory after find-before-store. No automatic publishing or external messages.
