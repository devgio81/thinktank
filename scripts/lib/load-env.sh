#!/usr/bin/env bash
#
# load-env.sh - read a .env file without letting it clobber the environment.
#
# Sourced by install.sh, scripts/init-collections.sh and
# scripts/migrate-collection.sh. It defines one function, load_env_file, and
# has no other effect when sourced.
#
# THE CONTRACT
#
#   A variable that is already set when the script starts wins. The .env file
#   only fills in what is not set. That is what makes a single run
#   reparameterisable without editing a file:
#
#     COLLECTION_NAME=scratch ./scripts/init-collections.sh
#
#   "Set" means set, not non-empty. VAR= in the environment is a deliberate
#   empty value and wins over .env exactly as VAR=x would; the caller decides
#   afterwards what an empty value means to it.
#
# WHY NOT `set -a; . .env; set +a`
#
#   Sourcing assigns, so the file overwrites the environment - the precise
#   opposite of the contract above, and the command line in the example was
#   silently ignored. Sourcing also *executes* the file, so a command
#   substitution or a stray command in .env would run. This reader neither
#   executes nor overwrites.
#
# PARSING RULES (a deliberate subset of what a shell would accept)
#
#   - blank lines, and lines whose first non-blank character is '#', are
#     ignored
#   - an optional leading `export ` is ignored
#   - NAME=VALUE splits at the FIRST '=', so a value may contain further '='
#   - NAME must match [A-Za-z_][A-Za-z0-9_]*; anything else is reported on
#     stderr and skipped, never assigned
#   - a value wrapped in matching single or double quotes keeps everything
#     between the quotes verbatim - spaces, '=', '#', the other quote
#     character. Nothing is unescaped and nothing is expanded: $HOME stays the
#     five characters, and $(date) is never executed
#   - an unquoted value ends at the first whitespace-preceded '#' (an inline
#     comment, as a shell would also treat it) and has trailing whitespace
#     trimmed. Quote the value to keep either
#   - a trailing CR is stripped, so a CRLF file works
#   - if the same NAME appears twice in the file, the last line wins, which is
#     what both a sourcing shell and Docker Compose do. That is tracked
#     separately from the environment check, so a repeated line can overwrite
#     an earlier line of the same file but still never overwrite the
#     environment
#
# Everything this function does assign is exported, so child processes see it.

# load_env_file FILE
#
# Returns 0 if the file was read or does not exist. Malformed lines are
# reported on stderr and skipped; they are not fatal, because a single bad
# line in .env should not stop a setup that has already succeeded.
load_env_file() {
  local file="$1"
  local line name value first lineno=0
  # ":NAME:NAME:" of the names this call has assigned, so a repeated line in
  # the file may overwrite an earlier one without ever overwriting the
  # environment. bash 3.2 has no associative arrays; a delimited string does.
  local assigned=":"

  [ -f "${file}" ] || return 0

  # The `|| [ -n "${line}" ]` tail handles a final line without a newline.
  while IFS= read -r line || [ -n "${line}" ]; do
    lineno=$((lineno + 1))

    line="${line%$'\r'}"                          # tolerate CRLF
    line="${line#"${line%%[![:space:]]*}"}"       # strip leading whitespace

    [ -n "${line}" ] || continue
    case "${line}" in '#'*) continue ;; esac

    case "${line}" in
      export[[:space:]]*)
        line="${line#export}"
        line="${line#"${line%%[![:space:]]*}"}"
        ;;
    esac

    case "${line}" in
      *=*) : ;;
      *)
        printf '  [warn] %s line %s: no "=" in this line, ignored.\n' \
          "${file}" "${lineno}" >&2
        continue
        ;;
    esac

    name="${line%%=*}"
    value="${line#*=}"
    name="${name%"${name##*[![:space:]]}"}"       # strip trailing whitespace

    case "${name}" in
      ''|[0-9]*|*[!A-Za-z0-9_]*)
        printf '  [warn] %s line %s: "%s" is not a valid variable name, ignored.\n' \
          "${file}" "${lineno}" "${name}" >&2
        continue
        ;;
    esac

    # The whole point of this file: an already-set variable wins, and .env is
    # not consulted for it at all. The one exception is a name this same call
    # assigned from an earlier line of the same file - that is a duplicate
    # inside .env, not the environment, and there the last line wins.
    if [ -n "${!name+set}" ]; then
      case "${assigned}" in
        *":${name}:"*) : ;;
        *) continue ;;
      esac
    fi

    value="${value#"${value%%[![:space:]]*}"}"    # strip leading whitespace
    first="${value:0:1}"
    if { [ "${first}" = '"' ] || [ "${first}" = "'" ]; } &&
       [ "${#value}" -ge 2 ] && [ "${value:$((${#value} - 1)):1}" = "${first}" ]; then
      value="${value:1:$((${#value} - 2))}"
    else
      case "${value}" in
        *[[:space:]]'#'*) value="${value%%[[:space:]]'#'*}" ;;
      esac
      value="${value%"${value##*[![:space:]]}"}"  # strip trailing whitespace
    fi

    if ! printf -v "${name}" '%s' "${value}"; then
      printf '  [warn] %s line %s: could not set %s, ignored.\n' \
        "${file}" "${lineno}" "${name}" >&2
      continue
    fi
    export "${name}"
    assigned="${assigned}${name}:"
  done < "${file}"
}
