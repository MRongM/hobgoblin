#!/usr/bin/env bash
set -euo pipefail

readonly DETACHED_FILTER='#{==:#{session_attached},0}'
readonly SESSION_FORMAT=$'#{session_id}\t#{session_name}'
readonly HOBGOBLIN_SESSION_PATTERN='^hobgoblin-v1-[a-f0-9]{24}$'

fail() {
  printf 'cleanup-detached-hobgoblin-tmux: %s\n' "$*" >&2
  exit 1
}

is_missing_session_error() {
  [[ "$1" == *"can't find session"* ]]
}

if ! tmux_bin="$(command -v tmux)"; then
  fail 'tmux not found in PATH'
fi
if ! sessions="$(
  LC_ALL=C "${tmux_bin}" list-sessions -f "${DETACHED_FILTER}" -F "${SESSION_FORMAT}" 2>&1
)"; then
  if [[ "${sessions}" == *'no server running'* || "${sessions}" == *'no sessions'* ]]; then
    printf 'No detached Hobgoblin tmux sessions.\n'
    exit 0
  fi
  fail "unable to list detached sessions: ${sessions}"
fi

matched_session=0
while IFS=$'\t' read -r session_id session_name; do
  [[ -n "${session_id}" ]] || continue
  [[ "${session_name}" =~ ${HOBGOBLIN_SESSION_PATTERN} ]] || continue
  matched_session=1

  if ! attached_count="$(
    LC_ALL=C "${tmux_bin}" display-message -p -t "${session_id}" '#{session_attached}' 2>&1
  )"; then
    if is_missing_session_error "${attached_count}"; then
      printf 'Skipped %s (%s): session no longer exists\n' "${session_name}" "${session_id}"
      continue
    fi
    fail "unable to recheck ${session_name} (${session_id}): ${attached_count}"
  fi
  if [[ ! "${attached_count}" =~ ^[0-9]+$ ]]; then
    fail "invalid attached count for ${session_name} (${session_id}): ${attached_count}"
  fi
  if ((attached_count > 0)); then
    printf 'Skipped %s (%s): attached by %s client(s)\n' \
      "${session_name}" "${session_id}" "${attached_count}"
    continue
  fi

  if ! kill_result="$(LC_ALL=C "${tmux_bin}" kill-session -t "${session_id}" 2>&1)"; then
    if is_missing_session_error "${kill_result}"; then
      printf 'Skipped %s (%s): session no longer exists\n' "${session_name}" "${session_id}"
      continue
    fi
    fail "unable to close ${session_name} (${session_id}): ${kill_result}"
  fi
  printf 'Closed %s (%s)\n' "${session_name}" "${session_id}"
done <<<"${sessions}"

if ((matched_session == 0)); then
  printf 'No detached Hobgoblin tmux sessions.\n'
fi
