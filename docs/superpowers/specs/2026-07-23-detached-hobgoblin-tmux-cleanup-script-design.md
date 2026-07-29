# Detached Hobgoblin tmux Cleanup Script Design

## Goal

Provide one repository-local command that closes detached Hobgoblin protocol v1 tmux sessions without touching attached sessions or unrelated user-created tmux sessions.

## Scope

- Add an executable Bash script at `scripts/cleanup-detached-hobgoblin-tmux.sh`.
- Match only complete protocol names satisfying `^hobgoblin-v1-[a-f0-9]{24}$`.
- Match only sessions whose `session_attached` count is zero.
- Use tmux session IDs as exact kill targets.
- Recheck the attached count immediately before each kill and skip sessions that acquired a client.
- Print each closed or skipped session and exit successfully when there are no eligible sessions.
- Treat command invocation as the operator's explicit approval; do not add an interactive prompt or automatic/background execution.

## Non-goals

- Cleaning arbitrary detached tmux sessions.
- Cleaning legacy `goblin-*` sessions.
- Remote-host cleanup.
- Adding application UI, package scripts, configuration, scheduling, or automatic garbage collection.
- Executing the cleanup as part of implementation or tests against the user's real tmux server.

## Design

The script asks tmux for detached sessions formatted as session ID plus session name. It applies a second shell-side full protocol-name check, then queries each candidate's current attached count. A candidate is killed only when that second check still returns zero. Session IDs avoid target-name prefix or glob matching. A candidate that disappears during either recheck or kill is treated as an already-clean result; other tmux errors remain fatal.

The script uses `set -euo pipefail`. A missing `tmux` executable or an unexpected tmux command failure is reported and produces a nonzero exit. A missing tmux server is treated as an empty eligible set so repeated cleanup remains harmless.

This is an explicit developer utility. It does not change Hobgoblin's application-level associated-session cleanup semantics or introduce a new domain concept, so `CONTEXT.md` and ADRs remain unchanged.

## Testing

A Vitest integration test runs the real Bash script with a temporary `PATH` containing a deterministic fake `tmux` executable. The fake models the complete command surface consumed by the script: listing detached candidates, rechecking attachment counts, killing by ID, and reporting the no-server case. Tests verify:

- detached `hobgoblin-v1-*` sessions are killed by ID;
- unrelated and attached sessions are not killed;
- a candidate that becomes attached before the recheck is skipped;
- no server is a successful no-op;
- unexpected list failures remain visible and fail the script.

No test connects to or mutates the user's real tmux server.
