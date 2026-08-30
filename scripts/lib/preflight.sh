#!/usr/bin/env bash
#
# preflight.sh - the checks that have to run BEFORE the installer writes
# anything, plus the two small URL/port helpers step 3 needs.
#
# Sourced by install.sh. Defines functions and has no other effect when
# sourced, so it can also be sourced by a test.
#
# WHY THIS FILE EXISTS
#
#   Step 6 copies into ~/.claude/{skills,agents,hooks}. It used to discover a
#   directory it could not write only once it was standing in front of it, in
#   the middle of the copy, with skills and agents already installed. The user
#   saw a raw `mv: ... Permission denied` and was left with half an
#   installation: skills and agents in place, hooks and the MCP registration
#   missing, and nothing saying so.
#
#   The failure was not exotic. A read-only ~/.claude/hooks is a hardening
#   ThinkTank itself recommends (skills/thinktank/references/delivery-loop.md,
#   "3.2b Filesystem hardening"): take the write bit off the directory so an
#   unattended agent cannot rename or replace the guard hook that gates its own
#   irreversible actions. Renaming an entry needs write permission on the
#   DIRECTORY, not on the file - which is exactly what the installer's backup
#   step does, and exactly what the hardening is meant to stop.
#
#   So the installer walks into the protection the engine advises. The fix is
#   to find out first and stop with an explanation, never to remove the
#   protection.
#
#   BUT: "not writable" is not the question. The question is "not writable AND
#   something has to be written there". The first version of this check asked
#   only the first half, and that was a regression against the code it
#   replaced. On a machine with a current installation and hooks at 0500 -
#   both hook files byte-identical to the ones in the kit - it refused to run,
#   although step 6 would not have written a single byte there: install_file
#   compares with `cmp -s` first and returns through the "unchanged" branch
#   without ever calling mv or cp. The old code walked straight through.
#
#   The people that hit were exactly the people who had followed this kit's own
#   hardening advice. They could no longer re-run the installer at all - not to
#   smoke-test the backend, not to catch up a missing MCP registration, not for
#   anything. So the check now compares each tree first and only blocks on a
#   directory that genuinely has to receive a file. A read-only tree that is
#   already complete is reported, skipped, and the run continues.
#
#   Reading is enough for that comparison and reading still works: the
#   recommended mode is dr-x------, which keeps the owner's read and search
#   bits, so `cmp` can open both sides. Only creating, renaming and deleting
#   entries is gone - which is the whole point of the hardening.

# path_mode PATH
#
# Prints the numeric mode ("0500", "700", ...) or "?" when neither stat flavour
# answers. BSD/macOS uses `stat -f`, GNU/Linux `stat -c`; each rejects the
# other's flag, so trying both is the portable way and the failure is silent on
# purpose.
path_mode() {
  local p="$1" m=""
  m="$(stat -f '%OLp' "${p}" 2>/dev/null || true)"
  if [ -z "${m}" ]; then
    m="$(stat -c '%a' "${p}" 2>/dev/null || true)"
  fi
  if [ -z "${m}" ]; then
    printf '?'
  else
    printf '%s' "${m}"
  fi
}

# dir_is_writable DIR
#
# 0 = an entry can be created in DIR, 1 = it cannot, 2 = DIR is not a directory.
#
# This creates and removes a probe file instead of asking `[ -w "${dir}" ]`.
# `-w` calls access(2), which returns a permission verdict; the question here is
# whether the write will succeed, and those two are only usually the same thing.
# They were measured to agree on macOS 15 for mode 0500 and for a `chflags uchg`
# directory, so this is not a claim that `-w` is broken. It is a claim about
# what the check is for: creating an entry is exactly what step 6 does when it
# renames a file to <file>.bak.<stamp>, so the probe fails under whatever makes
# step 6 fail - a read-only mount, a filtering sandbox, a container layer, an
# ACL an older access() does not model - without this file having to enumerate
# those cases correctly in advance. The cost is one file created and removed.
dir_is_writable() {
  local dir="$1" probe
  [ -d "${dir}" ] || return 2
  probe="${dir}/.thinktank-write-probe.$$"
  # `2>/dev/null` has to come FIRST. Redirections are applied left to right, so
  # with `>"${probe}" 2>/dev/null` the failing redirection reports "Permission
  # denied" to a stderr that is not silenced yet, and the check prints a raw
  # shell error while returning its verdict.
  if : 2>/dev/null >"${probe}"; then
    rm -f "${probe}" 2>/dev/null || true
    return 0
  fi
  rm -f "${probe}" 2>/dev/null || true
  return 1
}

# nearest_existing_ancestor PATH
#
# Prints the closest existing directory at or above PATH. A target the
# installer will create with `mkdir -p` is only as writable as the deepest
# directory that already exists, so that is the one to test.
nearest_existing_ancestor() {
  local p="$1"
  while [ -n "${p}" ] && [ "${p}" != "/" ] && [ ! -d "${p}" ]; do
    p="$(dirname "${p}")"
  done
  printf '%s' "${p}"
}

# files_needing_write SRC_DIR DEST_DIR
#
# Prints, one per line, the destination path of every file the copy would
# actually have to write: missing at the destination, or present with different
# content. A file that is already byte-identical prints nothing, because
# install_file's `cmp -s` branch returns before it reaches mv or cp.
#
# This mirrors install_file's decision deliberately. Any other rule here - a
# timestamp comparison, a size check, "the directory exists so assume it is
# current" - would be a second, differently-wrong opinion about what step 6 is
# going to do, and the two would drift apart on the first change to either.
#
# A missing SRC_DIR prints nothing: copy_tree skips such a tree with its own
# message, so there is nothing for this check to block on.
files_needing_write() {
  local src_dir="$1" dest_dir="$2" src rel dest
  [ -d "${src_dir}" ] || return 0
  while IFS= read -r src; do
    rel="${src#"${src_dir}/"}"
    dest="${dest_dir}/${rel}"
    if [ -f "${dest}" ] && cmp -s "${src}" "${dest}"; then
      continue
    fi
    printf '%s\n' "${dest}"
  done < <(find "${src_dir}" -type f ! -name '.DS_Store')
}

# PREFLIGHT_SKIPPED_TREES - the trees check_install_targets_writable decided to
# skip: read-only, and already holding every file the kit would put there. Step
# 6 reads this so that a skipped tree appears in its inventory as skipped, and
# never as installed.
PREFLIGHT_SKIPPED_TREES=""

# preflight_tree_skipped LABEL - 0 when that tree was skipped.
preflight_tree_skipped() {
  case "
${PREFLIGHT_SKIPPED_TREES}" in
    *"
$1
"*) return 0 ;;
  esac
  return 1
}

# check_install_targets_writable CLAUDE_HOME REPO_ROOT
#
# Returns 0 when every directory step 6 has to write into can actually be
# written to, and 1 otherwise - after printing what is blocked, why it is
# probably blocked on purpose, and the three commands that resolve it.
#
# "Has to write into" is the load-bearing phrase. A read-only directory whose
# contents are already exactly what the kit ships is not an obstacle to
# anything; it is recorded in PREFLIGHT_SKIPPED_TREES, announced, and stepped
# over.
#
# THIS FUNCTION NEVER CHANGES A MODE, AND NEITHER DOES THE INSTALLER.
#
#   An installer that runs `chmod u+w ~/.claude/hooks` on its own would be
#   removing the protection around the security hook a fraction of a second
#   before overwriting that hook - the exact sequence the hardening exists to
#   make impossible, performed by the tool the user trusted to respect it. That
#   the operation is convenient is not an argument; a lock that any installer
#   opens is not a lock. Unlocking is a human decision, taken with the reason in
#   view, and the user can also decide to leave the old hooks in place instead.
check_install_targets_writable() {
  local claude_home="$1" repo_root="$2"
  local d target label src_dir dest_dir dest mode rc seen="" need n_files
  local blocked=()
  local notdir=()

  PREFLIGHT_SKIPPED_TREES=""

  # A plain file, or a symlink pointing at one, where a directory belongs:
  # `mkdir -p` fails on it and the copy has nowhere to go. Worth its own
  # message, because no chmod fixes it, and checked for every target including
  # ~/.claude itself.
  for target in "${claude_home}" "${claude_home}/skills" "${claude_home}/agents" "${claude_home}/hooks"; do
    if [ -e "${target}" ] && [ ! -d "${target}" ]; then
      notdir+=("${target}")
    fi
  done

  # ~/.claude itself. `mkdir -p` only has to create something when one of the
  # three subdirectories is missing; on an existing directory it is a no-op and
  # needs no write permission at all. So a read-only ~/.claude whose three
  # subdirectories are already there is not a problem, and used to be reported
  # as one.
  for target in "${claude_home}/skills" "${claude_home}/agents" "${claude_home}/hooks"; do
    [ -d "${target}" ] && continue
    d="$(nearest_existing_ancestor "${target}")"
    [ -n "${d}" ] || continue
    case "${seen}" in *"[${d}]"*) continue ;; esac
    seen="${seen}[${d}]"
    rc=0
    dir_is_writable "${d}" || rc=$?
    # rc 2 means nothing at or above the target is a directory. At worst / is
    # one, so this is close to impossible - but reporting it beats reporting a
    # pass that was never established.
    [ "${rc}" -eq 0 ] || blocked+=("${d}")
  done

  # The three trees, each judged on what it actually needs.
  for label in skills agents hooks; do
    src_dir="${repo_root}/${label}"
    dest_dir="${claude_home}/${label}"
    [ -d "${src_dir}" ] || continue

    need="$(files_needing_write "${src_dir}" "${dest_dir}")"

    if [ -z "${need}" ]; then
      # Nothing in this tree has to be written. Whether the directory would
      # accept a write is then simply not a question this installer has to
      # answer - but if it would not, that is worth a line, because the run is
      # about to walk past a directory it is not going to touch.
      if [ -d "${dest_dir}" ] && ! dir_is_writable "${dest_dir}"; then
        PREFLIGHT_SKIPPED_TREES="${PREFLIGHT_SKIPPED_TREES}${label}
"
        n_files="$(find "${src_dir}" -type f ! -name '.DS_Store' | wc -l | tr -d ' ')"
        printf '\n  [warn] %s/ is read-only (mode %s); nothing needs writing there,\n' \
          "${dest_dir}" "$(path_mode "${dest_dir}")" >&2
        printf '         skipping it. All %s file(s) the kit ships for %s are already\n' \
          "${n_files}" "${label}" >&2
        printf '         byte-identical, so step 6 would have compared them and returned\n' >&2
        printf '         without renaming or copying anything. The run continues; step 6\n' >&2
        printf '         reports this tree as skipped rather than as installed.\n\n' >&2
      fi
      continue
    fi

    # Something does have to be written. Test the directory that would have to
    # accept each new entry - which is the file's own parent, not the top of
    # the tree: ~/.claude/skills can be read-only while
    # ~/.claude/skills/thinktank is not, and only the one being written to
    # decides.
    while IFS= read -r dest; do
      [ -n "${dest}" ] || continue
      d="$(nearest_existing_ancestor "$(dirname "${dest}")")"
      [ -n "${d}" ] || continue
      case "${seen}" in *"[${d}]"*) continue ;; esac
      seen="${seen}[${d}]"
      rc=0
      dir_is_writable "${d}" || rc=$?
      [ "${rc}" -eq 0 ] || blocked+=("${d}")
    done <<EOF
${need}
EOF
  done

  if [ "${#notdir[@]}" -gt 0 ]; then
    printf '\n  [fail] Cannot install into %s - a target exists but is not a directory.\n\n' "${claude_home}" >&2
    for d in "${notdir[@]}"; do
      printf '           %s\n' "${d}" >&2
    done
    printf '\n         Nothing has been copied. Move or remove that path, then run\n         ./install.sh again.\n\n' >&2
    return 1
  fi

  [ "${#blocked[@]}" -gt 0 ] || return 0

  printf '\n  [fail] Cannot install into %s - a directory that has to receive a\n         file is not writable.\n\n' "${claude_home}" >&2
  for d in "${blocked[@]}"; do
    mode="$(path_mode "${d}")"
    printf '           %s   mode %s   not writable\n' "${d}" "${mode}" >&2
  done

  printf '%s\n' "
         Nothing has been copied. This check runs before the first write on
         purpose: a failure discovered halfway through step 6 leaves skills and
         agents installed while the hooks and the MCP registration are missing,
         and that half state is not visible from the outside.

         Every directory named above was compared first. It is listed because
         a file that belongs in it is missing or differs, not merely because
         the write bit is off - a read-only directory that already holds
         exactly what this kit ships is skipped, not reported here.

         A read-only hooks directory is very probably DELIBERATE. ThinkTank
         recommends it itself - see 'Filesystem hardening' in
         skills/thinktank/references/delivery-loop.md: take the write bit off
         the directory so an unattended agent cannot rename or replace the guard
         hook that gates its own irreversible actions. Renaming an entry needs
         write permission on the DIRECTORY, not on the file, which is why the
         installer's backup step (mv <file> <file>.bak.<stamp>) is stopped by it.

         This installer does not lift that protection for you, and will not do
         so in a later version. Unlocking the guard directory in order to
         overwrite the guard is precisely what the hardening is meant to
         prevent, and a lock any installer can open protects nothing. It is your
         decision - including the decision to keep the hooks you already have
         and install nothing.

         To go ahead, run these three yourself:" >&2

  for d in "${blocked[@]}"; do
    mode="$(path_mode "${d}")"
    printf '\n           chmod u+w %s\n' "${d}" >&2
    printf '           ./install.sh\n' >&2
    if [ "${mode}" = "?" ]; then
      printf '           chmod u-w %s      # lock it again\n' "${d}" >&2
    else
      printf '           chmod %s %s      # lock it again (its mode right now)\n' "${mode}" "${d}" >&2
    fi
  done
  printf '\n' >&2

  return 1
}

# url_port URL
#
# Prints the port a URL addresses: the explicit one, or the scheme default
# (443 for https, otherwise 80). Prints nothing for an unparseable input.
# Handles userinfo (user:pw@host) and bracketed IPv6 ([::1]:6333).
url_port() {
  local url="$1" scheme rest port
  [ -n "${url}" ] || return 0

  case "${url}" in
    *://*) scheme="${url%%://*}"; rest="${url#*://}" ;;
    *)     scheme="http";         rest="${url}" ;;
  esac

  rest="${rest%%/*}"        # drop path, query, fragment
  rest="${rest%%\?*}"
  rest="${rest##*@}"        # drop userinfo

  case "${rest}" in
    \[*\]*)
      port="${rest#*\]}"
      port="${port#:}"
      ;;
    *:*)
      port="${rest##*:}"
      ;;
    *)
      port=""
      ;;
  esac

  if [ -z "${port}" ]; then
    # Lowercased first. Schemes are case-insensitive (RFC 3986 §3.1), so
    # "HTTPS://qdrant.example" would otherwise fall through to the default 80
    # and the consistency check below would compare against the wrong number.
    scheme="$(printf '%s' "${scheme}" | tr '[:upper:]' '[:lower:]')"
    case "${scheme}" in
      https) port=443 ;;
      *)     port=80 ;;
    esac
  fi

  case "${port}" in
    ''|*[!0-9]*) return 0 ;;
  esac
  printf '%s' "${port}"
}

# url_host URL
#
# Prints the host, without brackets for IPv6, or nothing if there is none.
url_host() {
  local url="$1" rest host
  [ -n "${url}" ] || return 0

  case "${url}" in
    *://*) rest="${url#*://}" ;;
    *)     rest="${url}" ;;
  esac

  rest="${rest%%/*}"
  rest="${rest%%\?*}"
  rest="${rest##*@}"

  case "${rest}" in
    \[*\]*)
      host="${rest#\[}"
      host="${host%%\]*}"
      ;;
    *)
      host="${rest%%:*}"
      ;;
  esac
  printf '%s' "${host}"
}

# host_is_local HOST
#
# 0 when HOST names this machine's loopback in one of the spellings a compose
# port binding of 127.0.0.1 would actually serve.
#
# Lowercased before comparing, because host names are case-insensitive and the
# resolver treats LOCALHOST, Localhost and localhost as one name. Matching the
# literal spelling was not a harmless nicety: with
#
#   QDRANT_URL=http://LOCALHOST:6399   and   QDRANT_HOST_PORT=6343
#
# this returned 1, the installer took the "not this machine" branch, and the
# hard consistency failure that exists precisely to stop that combination
# degraded into a warning. The container then came up on 6343, step 4 polled
# 6399 for 60 seconds and the run died there - the exact outcome the failure
# message describes and is meant to prevent.
host_is_local() {
  local h rest self
  h="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"

  case "${h}" in
    localhost|127.0.0.1|::1|0.0.0.0|"") return 0 ;;
  esac

  # A real octet test, not a "127.*" glob. The glob also matched
  # 127.0.0.1.evil.com, so a genuinely remote host whose name merely began with
  # "127." was hard-failed instead of warned.
  case "${h}" in
    127.*.*.*)
      rest="${h#127.}"
      case "${rest}" in
        *[!0-9.]*) : ;;
        *) return 0 ;;
      esac
      ;;
  esac

  # This machine's own name is served by a 127.0.0.1 binding exactly as
  # localhost is - measured: http://<hostname>.local:6333/healthz answers 200
  # against a container published on 127.0.0.1 only. Treating it as remote left
  # the same 62-second readiness timeout this function exists to prevent, just
  # spelled differently.
  self="$(hostname 2>/dev/null | tr '[:upper:]' '[:lower:]')"
  if [ -n "${self}" ]; then
    [ "${h}" = "${self}" ] && return 0
    [ "${h}" = "${self%%.*}" ] && return 0
    [ "${h}" = "${self%%.*}.local" ] && return 0
  fi

  return 1
}

# valid_port VALUE - 0 for an integer in 1..65535.
valid_port() {
  case "$1" in
    ''|*[!0-9]*) return 1 ;;
  esac
  [ "$1" -ge 1 ] && [ "$1" -le 65535 ]
}
