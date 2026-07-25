#!/usr/bin/env bash
set -euo pipefail

readonly SESSION_FORMAT=$'name=#{session_name}\twindows=#{session_windows}\tattached=#{session_attached}\tmouse=#{mouse}\tinit_path=#{@hobgoblin_init_path}\tterminal_number=#{@hobgoblin_terminal_number}'

usage() {
  printf '%s\n' \
    'Usage:' \
    "  ${0##*/} [--list]" \
    "  ${0##*/} --kill <server-name>" \
    "  ${0##*/} --kill-all" \
    "  ${0##*/} --help"
}

fail() {
  printf 'list-tmux-servers: %s\n' "$*" >&2
  exit 1
}

usage_error() {
  usage >&2
  exit 2
}

is_missing_server_error() {
  case "$1" in
    *'no server running'* | *'failed to connect to server'* | *'no sessions'* | \
      *'Connection refused'* | *'connection refused'* | *'No such file or directory'*)
      return 0
      ;;
    *) return 1 ;;
  esac
}

print_sessions() {
  local session_output="$1"
  if [[ -z "${session_output}" ]]; then
    printf '  No sessions.\n'
    return
  fi
  while IFS= read -r session; do
    printf '  %s\n' "${session}"
  done <<<"${session_output}"
}

mode='list'
requested_server=''
case "$#" in
  0) ;;
  1)
    case "$1" in
      --list) ;;
      --kill-all) mode='kill-all' ;;
      --help)
        usage
        exit 0
        ;;
      *) usage_error ;;
    esac
    ;;
  2)
    if [[ "$1" != '--kill' || -z "$2" || "$2" == */* || "$2" == '.' || "$2" == '..' ]]; then
      usage_error
    fi
    mode='kill-one'
    requested_server="$2"
    ;;
  *) usage_error ;;
esac

if ! tmux_bin="$(command -v tmux)"; then
  fail 'tmux not found in PATH'
fi

export LC_ALL=C
readonly socket_directory="${TMUX_TMPDIR:-/tmp}/tmux-$(id -u)"
socket_candidates=()
if [[ -d "${socket_directory}" ]]; then
  shopt -s nullglob dotglob
  socket_candidates=("${socket_directory}"/*)
  shopt -u nullglob dotglob
fi

running_server_names=()
running_socket_paths=()
running_session_outputs=()
scan_failed=0
socket_candidate_count="${#socket_candidates[@]}"
for ((candidate_index = 0; candidate_index < socket_candidate_count; candidate_index += 1)); do
  socket_path="${socket_candidates[${candidate_index}]}"
  [[ -S "${socket_path}" ]] || continue
  server_name="${socket_path##*/}"
  if sessions="$("${tmux_bin}" -S "${socket_path}" -u list-sessions -F "${SESSION_FORMAT}" 2>&1)"; then
    index="${#running_socket_paths[@]}"
    running_server_names[${index}]="${server_name}"
    running_socket_paths[${index}]="${socket_path}"
    running_session_outputs[${index}]="${sessions}"
  elif ! is_missing_server_error "${sessions}"; then
    scan_failed=1
    printf 'Unable to query server %s (%s): %s\n' \
      "${server_name}" "${socket_path}" "${sessions:-unknown tmux error}" >&2
  fi
done

server_count="${#running_socket_paths[@]}"
if [[ "${mode}" == 'list' ]]; then
  if ((server_count == 0)); then
    printf 'No running tmux servers found in %s.\n' "${socket_directory}"
  fi
  for ((index = 0; index < server_count; index += 1)); do
    printf 'Server: %s\nSocket: %s\n' "${running_server_names[${index}]}" "${running_socket_paths[${index}]}"
    print_sessions "${running_session_outputs[${index}]}"
    printf '\n'
  done
  exit "${scan_failed}"
fi

close_server() {
  local server_name="$1"
  local socket_path="$2"
  local close_output
  if close_output="$("${tmux_bin}" -S "${socket_path}" kill-server 2>&1)"; then
    printf 'Closed server: %s\n' "${server_name}"
    return 0
  fi
  if is_missing_server_error "${close_output}"; then
    printf 'Server already stopped: %s\n' "${server_name}"
    return 0
  fi
  printf 'Unable to stop server %s (%s): %s\n' \
    "${server_name}" "${socket_path}" "${close_output:-unknown tmux error}" >&2
  return 1
}

operation_failed="${scan_failed}"
if [[ "${mode}" == 'kill-one' ]]; then
  target_index=''
  for ((index = 0; index < server_count; index += 1)); do
    if [[ "${running_server_names[${index}]}" == "${requested_server}" ]]; then
      target_index="${index}"
      break
    fi
  done
  if [[ -z "${target_index}" ]]; then
    printf 'No running tmux server named %s.\n' "${requested_server}" >&2
    exit 1
  fi
  if ! close_server "${running_server_names[${target_index}]}" "${running_socket_paths[${target_index}]}"; then
    operation_failed=1
  fi
  exit "${operation_failed}"
fi

if ((server_count == 0)); then
  printf 'No running tmux servers found in %s.\n' "${socket_directory}"
fi
for ((index = 0; index < server_count; index += 1)); do
  if ! close_server "${running_server_names[${index}]}" "${running_socket_paths[${index}]}"; then
    operation_failed=1
  fi
done
exit "${operation_failed}"
