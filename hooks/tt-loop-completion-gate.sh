#!/usr/bin/env bash
# ThinkTank — completion gate (TaskCompleted).
#
# "Done" must be a checked claim, not a self-assessment. In an unattended run a
# task may only complete once a checker — not the maker — has recorded WHAT it
# verified, BY WHAT MEANS, and WHICH of the four exits fired.
#
# A non-empty file is not enough, because "wrote something" is not "verified
# something". Required lines:
#   EXIT=<verified|ceiling|budget|no-progress>
#   ACCEPTANCE=<the domain condition and the rungs that were run>
#   EVIDENCE=<what was observed: commands, exit codes, URLs, browser verdict>
#
# NO-OP unless CLAUDE_TT_LOOP_MODE=1.
#
# Record path: ${CLAUDE_TT_CHECKER_DIR:-~/.claude/loop-checker}/<run-id>.ok
# <run-id> is $CLAUDE_TT_RUN_ID when the launcher set it, else the session id.
#
# Honest limit: this hook cannot tell the checker from the maker — both run in
# the same process. It raises the cost of a fake record; the maker/checker split
# itself is upheld by the contract and the independent review, not by the file.
#
# Contract: ~/.claude/skills/thinktank/references/delivery-loop.md §6
#           ~/.claude/skills/thinktank/references/loop-engineering.md §3, §4, §6a
set -uo pipefail

[ "${CLAUDE_TT_LOOP_MODE:-0}" = "1" ] || exit 0

payload=$(cat)
dir="${CLAUDE_TT_CHECKER_DIR:-$HOME/.claude/loop-checker}"
id="${CLAUDE_TT_RUN_ID:-}"
[ -n "$id" ] || id=$(printf '%s' "$payload" | jq -r '.session_id // "unknown"')
record="$dir/$id.ok"

fail() {
  echo "ThinkTank completion gate: blocked — $1"
  echo "Required at $record:"
  echo "  EXIT=<verified|ceiling|budget|no-progress>"
  echo "  ACCEPTANCE=<the domain condition and the rungs that were run>"
  echo "  EVIDENCE=<what was observed: commands, exit codes, URLs, browser verdict>"
  echo "The agent that did the work does not decide it is done. A separate checker verifies the stop condition and writes that file."
  echo "If the run is blocked rather than finished, write state, evidence and the named handoff to docs/loop-triage/<run-id>.md and report that instead of completing."
  exit 2
}

[ -s "$record" ] || fail "no checker record at $record."

missing=""
for key in EXIT ACCEPTANCE EVIDENCE; do
  grep -Eq "^[[:space:]]*$key=[[:space:]]*[^[:space:]]" "$record" || missing="$missing $key"
done
[ -z "$missing" ] || fail "the checker record at $record is missing:$missing."

exit_val=$(grep -E '^[[:space:]]*EXIT=' "$record" | head -1 | sed -E 's/^[[:space:]]*EXIT=[[:space:]]*//' | tr -d '[:space:]')
case "$exit_val" in
  verified|ceiling|budget|no-progress) ;;
  *) fail "EXIT='$exit_val' is not one of the four exits (verified, ceiling, budget, no-progress)." ;;
esac

exit 0
