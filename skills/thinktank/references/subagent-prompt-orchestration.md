# V17 orchestration API and domain contract

## Responsibility boundary

Source: `src/orchestration/index.mjs` (Node ESM, standard library only).
Exports `validatePlan`, `dependencyLayers`, `joinResults`, `WORKER_OUTPUT_SCHEMA`.
These functions inspect data, not agents: **no LLM runtime, no dispatch, no shell execution**.
CLI integration: `thinktank validate-plan --plan FILE`; host parent still owns real delegation,
semantic review, safe verifier execution, worktree isolation and independent checker acceptance.
No validation result authorizes a tool call or proves a stated source pointer is true.

## Plan shape

Root has exactly `repo_path`, `tasks`, `rejected_splits`, optional `modes`.
`repo_path` is an existing canonical absolute directory; no normalization of malformed input.
`tasks` is non-empty; every task contains exactly:

| Field | Type / constraint |
|---|---|
| `id` | lowercase `/^[a-z][a-z0-9_-]{0,63}$/`, globally unique |
| `domain`, `objective`, `deliverable` | non-empty strings, actual domain boundary |
| `dependencies` | unique existing task IDs; no cycles/self-edges |
| `read_scope` | non-empty canonical scopes |
| `write_scope` | canonical scopes; empty means read-only |
| `context` | non-empty array of verified source pointers/context strings |
| `constraints` | non-empty array including forbidden effects and no delegation |
| `acceptance` | non-empty array of criteria below, unique IDs per task |
| `prompt` | complete string with ordered headings below |
| `output_schema` | exactly exported `WORKER_OUTPUT_SCHEMA`; key order immaterial |

`rejected_splits` is an array (may be empty) of exactly `{candidate,reason}`, both non-empty
strings. Unknown fields fail closed. `modes` only accepts `subagents`, `graph`, `team`, `loop`,
`deliver` = auto/on/off; `rag` = vector/graph/auto; `cognitive` = verbose/silent. These are independent
mode declarations; validator does not dispatch a worker even when `subagents=on`.

Acceptance criteria are **one of**:

```json
{"id":"unit","criterion":"Duplicate request cannot emit twice","type":"command","argv":["node","--test","tests/api.test.mjs"],"cwd":".","expected_exit":0}
```

```json
{"id":"device","criterion":"Keyboard works on target device","type":"handoff","recipient":"project owner","action":"Run the specified keyboard walkthrough on the physical target"}
```

`argv` is a non-empty non-blank string array; `cwd` is `.` or canonical repository-relative
directory (no globs/escape/alias); expected exit is integer 0..255. A command criterion is an
executable **shape**, not proof the executable exists or that the command is safe. Parent must
inspect/run safe commands and verify they actually discriminate acceptance. Handoff is not a pass.
Semantic matching of objective, frozen criteria, context, language and complete prompt is parent
review, not a pretend NLP check in this module.

Prompt ordered headings, each on its own line with body:
`ROLE`, `OBJECTIVE`, `REPOSITORY AND EVIDENCE`, `OWNERSHIP`, `CONSTRAINTS`, `WORK`, `ACCEPTANCE`,
`RETURN CONTRACT`. Generated prompt reaches child verbatim. A separate parent envelope binds
language, actual worktree, task object and output schema; child inherits no conversation implicitly.

## Scope grammar and filesystem limits

- Only exact relative file paths (`src/api.mjs`) or a subtree suffix (`src/api/**`). Each segment
  uses ASCII letters, digits, `_`, `-`, `.`; no empty, `.` or `..` segment. No leading/trailing
  slash, absolute path, backslash, wildcard elsewhere, bracket/brace/question glob or encoding.
- An existing directory requires `/**`; an existing file cannot use `/**`.
- Containment uses full segment boundaries: `src/api/**` never grants `src/api-other/**`.
  Conservative case-folded comparisons reject potential case-insensitive collisions.
- Every writer must be covered by `allowedWriteRoots`; omitted roots default to **no writes**.
  Roots are explicit capabilities supplied by the parent, not inferred by `validatePlan`.
- Every pair of write scopes, including a task's redundant overlaps and dependencies in later
  layers, must be disjoint. Serialize by a new parent-approved contract if ownership must move.
- `.git`, `.claude`, `.hermes`, loop-grants/checker segments, and CLAUDE.md/AGENTS.md/.mcp.json
  are denied write targets. Parent must additionally exclude frozen plan/criteria and any custom
  active harness location; arbitrary installed paths cannot be inferred from names alone.
- Repository and scope ancestors must be canonical. Symlinks, hardlink files and special files
  are unsupported; write subtrees are scanned (10,000-entry cap, then reject/narrow scope).
  Read paths check ancestors but do not recursively enumerate broad read trees.
- This is a filesystem **snapshot**, not a race-proof sandbox. Creating a symlink after validation,
  writing from arbitrary shell, mount aliases and runtime mutations need effect-time OS/tool
  enforcement. Revalidate actual targets and changed files before effects/acceptance. Do not
  describe a hook, tree scan, or path contract as complete isolation.

## Exact returns and errors

`validatePlan(plan, {maxWorkers=3, allowedWriteRoots=[]}={})` returns:

```json
{"ok":true,"valid":true,"errors":[]}
```

or `{ok:false,valid:false,errors:[{code,path,message},...]}`. `ok` and `valid` are equivalent
for CLI compatibility. Error codes: OPTIONS, SCHEMA, REPOSITORY, MODE, ID, DUPLICATE_ID,
DEPENDENCY, CYCLE, PROMPT, OUTPUT_SCHEMA, ACCEPTANCE, SCOPE, PROTECTED, WRITE_ROOT, OVERLAP.
`path` is an input location; `message` is diagnostic, not a stable protocol string.
Use normal JSON input (no cyclic JS objects/getters); function does not mutate the input.
`maxWorkers` must be a positive safe integer. It caps simultaneous work, **not total plan size**.

`dependencyLayers(plan,maxWorkers=3)` returns arrays of task IDs, lexical ASCII order within each
logical topological layer, split into batches at most maxWorkers wide. Whole logical layer freezes
before capacity splitting, so no dependent jumps ahead of remaining peers. It revalidates internal
consistency but infers roots from declared scopes **only for scheduling**; it does not validate the
parent's authorization. Always call validatePlan with trusted allowed roots first. Invalid input
throws `Error` with `code='INVALID_PLAN'`, `errors=[{code,path,message},...]`.

Parent executes returned batches, awaits real verified results and withholds descendants after any
failed/blocked prerequisite. For graph=off parent serializes each task. Scheduler does not wait,
retry, unlock on success, enforce concurrency against other runs or start a host agent.

`joinResults(results)` requires a non-empty array of worker results. Each result has:
`task_id,status,summary,evidence,commands_run,touched_paths,unresolved,handoff`;
optional `findings:[{id,claim,evidence}]`. Status is completed/blocked/failed/needs_handoff.
All other base fields except task_id/summary are arrays of non-blank strings. Completed requires
non-empty evidence and empty unresolved/handoff. Touched paths are canonical exact relative paths.
Findings require valid IDs, non-empty claims/evidence. Unknown fields fail closed.
`WORKER_OUTPUT_SCHEMA` is the deeply frozen schema for this shape; semantic completion/path checks
are performed by join in addition to JSON shape checks. Parent must check expected/missing task IDs
and compare reported paths against actual artifact/plan; join has no plan argument.

Join returns:

```text
{
  status: 'completed' | 'needs_handoff',
  results: <normalized unique task results sorted by task_id>,
  evidence/commands_run/touched_paths/unresolved/handoff:
    [{value: <exact string>, task_ids: <sorted contributing IDs>}],
  findings: [{id,claim,evidence:<sorted strings>,task_ids:<sorted IDs>}],
  conflicts: [{id,variants:<all finding variants>,route:'checker-or-human'}]
}
```

Exact normalized duplicate deliveries collapse; unequal returns for one task ID throw rather
than choosing a latest writer. Findings with same ID+claim union provenance/evidence; same ID with
different claims retains **all variants** and sets needs_handoff. Different IDs are not semantically
reconciled; parent/checker notices semantic contradictions. Any non-completed result also sets
needs_handoff, preserving original statuses. Completed is aggregate reporting, not checker ACCEPT.
Arrays and keys are deterministically sorted; input/result ordering cannot pick a winning claim.
Malformed input throws `Error` with `code='INVALID_RESULTS'`, `errors=[{code,path,message},...]`.
Result codes include RESULT and DUPLICATE_RESULT. No partial join on malformed data.

## Runnable smoke example (repository root)

```sh
node --input-type=module -e "import {validatePlan,dependencyLayers,joinResults} from './src/orchestration/index.mjs'; for (const f of [validatePlan,dependencyLayers,joinResults]) if(typeof f!=='function') process.exit(1)"
node --test tests/orchestration*.test.mjs
```

The regression file constructs full schema-valid example plans and results. The library never
claims those fixtures were actual model outputs. Host-native mapping is in
[hermes-adapter.md](hermes-adapter.md); domain prompt definitions are product `agents/` files,
copied by the Hermes installer into `references/domains/`. Workers never delegate; Prompter never
writes; checker never authors; parent alone validates, dispatches, verifies and owns human gates.
