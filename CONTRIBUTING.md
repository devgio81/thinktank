# Contributing

The most useful contribution to this repository is not a feature. It is a report of a case where
the engine claimed something it had not proven.

## What this repository is

ThinkTank is instructions, agent definitions and two shell hooks. There is no library to extend and
no plugin interface. A change here is one of four things:

- **prose** in `skills/` — the contract the engine follows;
- **an agent definition** in `agents/`;
- **shell** in `install.sh`, `hooks/` or `scripts/`;
- **documentation** in `README.md` or `docs/`.

The first two are the engine. Treat a wording change in `skills/` as a behaviour change, because
that is exactly what it is.

## Before you open a pull request

Two things are worth knowing up front, because their absence changes what a review can check.

**There is no test suite and no CI.** Nothing runs automatically when you push. Whatever you claim
about your change, you claim on your own evidence, and the pull request has to carry that evidence
in text.

**The engine's own rule applies to the engine.** A reported exit code is a claim; a self-produced
one is evidence. Say which commands you ran and what they printed. "Works on my machine" is not a
result, and neither is a description of what the change is supposed to do.

## Verifying a change

### Shell — `install.sh`, `hooks/`, `scripts/`

Run `shellcheck` over what you touched. The sources already carry `# shellcheck source=` directives,
so the directives are there to be used:

```bash
shellcheck install.sh hooks/*.sh scripts/*.sh scripts/lib/*.sh
```

Then run the installer into a throwaway directory instead of your real one. `CLAUDE_HOME` overrides
the target:

```bash
CLAUDE_HOME="$(mktemp -d)/claude" ./install.sh
```

This isolates the skills, agents, hooks and `settings.json` that step 6 writes. **It does not
isolate everything.** The MCP registration goes through `claude mcp add --scope user`, which writes
to your real user configuration regardless of `CLAUDE_HOME`, and the Qdrant container is shared.
Know which parts of your run were isolated before you describe the result.

For a hook, the honest check is a negative one: construct the call the hook is supposed to deny and
confirm it is denied. A hook that has never refused anything has not been tested.

### Skills and agent definitions

These are read by a model, not executed, so there is nothing to run. Instead:

- read the reference file your change touches, in full, before editing it — the contracts
  cross-reference each other and a rule changed in one place usually has a twin somewhere else;
- keep the existing register: state what the rule is, then what it costs, then where it does not
  hold. A rule without its limit is the failure mode this repository exists to prevent.

### Documentation

`README.md` has a section called **"What is not included, and what does not work."** If your change
removes a limitation listed there, remove it from that section in the same pull request. If your
change introduces one, add it. That section going stale is worse than it being long.

## The rule that gets pull requests declined

**Gates may only tighten.** A change that widens what the loop guard permits, removes a human
checkpoint, makes one of the four exits easier to satisfy, lets a `goto` route around the checker,
or turns absent evidence into a passing check will be declined regardless of how well it is
implemented.

This is not a style preference. Every one of those gates exists because something got past a check
that looked green. If you believe a gate is wrong, open an issue and argue the case in the open
before writing the code — that conversation is cheap and the pull request is not.

The same applies to the never-grantable surface: production deploys, force-push, `reset --hard`,
publishes, pipeline reruns, destructive deletes, schedules, and any write to the installed harness.
No pull request makes those grantable.

## Reporting a gap in the guard

The loop guard is a string matcher, not a security mechanism, and `README.md` says so. A report that
a specific command or a specific MCP tool passes through it is welcome and useful — open a normal
issue with the exact command line or tool name.

Please do not open an issue arguing that the guard is bypassable in general. That is documented, not
disputed.

## Commits and pull requests

Commit subjects here are full sentences that say what changed and why, without a prefix or a tag:

```
Validate the MCP registration instead of trusting its name
Make the loop guard fail closed, and stop the README overclaiming
Read .env without sourcing it, and let the environment win
```

Not `fix: mcp` and not `chore(hooks): update`. Write the sentence you would say to someone reading
the diff a year from now.

One concern per pull request. A description that has to enumerate several unrelated changes is
telling you it should have been several pull requests.

## Questions

Open an issue. There is no chat, no Discord and no roadmap board — the repository is the whole
project surface.
