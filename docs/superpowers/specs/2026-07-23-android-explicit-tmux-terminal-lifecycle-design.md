# Android Explicit tmux Terminal Lifecycle Design

**Date:** 2026-07-23

**Status:** Approved for autonomous inline implementation

## Summary

Align Android repository terminals with Hobgoblin's current tmux protocol. Creating a terminal is an explicit per-request choice between a native SSH shell and tmux-if-available. A tmux-backed record retains the exact current-protocol session name and normalized initial path. Deleting that record offers an unchecked option to close the remote tmux session and revalidates both retained identity fields against live tmux state before deletion.

## Goals

- Make the ordinary Android “New terminal” action create a native SSH shell without probing tmux.
- Add a separate “New terminal with tmux” action beside the ordinary action.
- Generate `hobgoblin-v1-<24 lowercase hexadecimal characters>` from the same descriptor and path-normalization protocol as desktop Hobgoblin.
- Launch explicitly requested tmux terminals with the existing attach-or-create and mouse command sequence.
- Persist the exact tmux name and normalized initial path on the Android terminal record.
- Let users optionally close the exact associated tmux session when deleting a tmux-backed Android terminal.
- Require both the retained name and live `session_path` to match before issuing `kill-session`.

## Non-goals

- Remembering a default launch mode.
- Automatically choosing tmux from host capabilities, terminal history, or existing sessions.
- Migrating, attaching to, or deleting legacy Android `hobgoblin-<22 hex>` sessions.
- Adding arbitrary tmux browsing or cleanup UI.
- Changing external Termux launch behavior.
- Closing a tmux session when the user only closes the Android terminal view or leaves the terminal screen.

## Domain Model

`TerminalLaunchMode` is per-create-request intent:

```kotlin
enum class TerminalLaunchMode {
    Native,
    TmuxIfAvailable,
}
```

It is not a preference and is not persisted. Missing intent defaults to `Native`.

`TmuxSessionIdentity` is retained only when a terminal was explicitly launched through the current tmux protocol:

```kotlin
data class TmuxSessionIdentity(
    val sessionName: String,
    val initialPath: String,
)
```

The identity is valid only when the name matches `^hobgoblin-v1-[a-f0-9]{24}$` and the path is an absolute, lexically normalized POSIX path. The pair is indivisible: neither field alone authorizes deletion.

## Identity and Launch Protocol

Android uses the same descriptor as desktop Hobgoblin:

```text
projectRoot       = normalized repository remote path
workingDirectory = normalized selected worktree path
terminalNumber   = positive terminal-N slot number
```

The UTF-8 serialization is:

```text
hobgoblin-terminal-session-v1<NUL>projectRoot<NUL>workingDirectory<NUL>terminalNumber
```

The session name is `hobgoblin-v1-` plus the first 24 lowercase hexadecimal characters of SHA-256. The desktop reference vector must produce `hobgoblin-v1-aebf050981ac829e36100020` on Android.

An ordinary native launch changes to the selected directory and starts the native login shell without evaluating `command -v tmux`.

An explicitly requested tmux launch uses the current desktop behavior: check availability only because tmux was explicitly selected, then execute the equivalent of:

```sh
tmux new-session -A \
  -s "<sessionName>" \
  -c "<workingDirectory>" \
  \; set-option -t "=<sessionName>:" mouse on
```

No tmux `session_id` is supplied. If tmux is absent, the explicit action falls back to the native login shell, matching desktop `tmux-if-available` behavior. A native launch never performs the check.

## State and Persistence

`TerminalSessionRecord` gains an optional `tmuxIdentity`. The record is created with this identity before the SSH shell opens, and reconnect retains the same identity. Native and temporary terminals keep it null.

The terminal-session codec appends the name and path as a new record version. Existing 11-, 12-, 13-, and 15-field records remain readable and decode with no current tmux identity. This deliberately prevents legacy Android names from becoming eligible for current-protocol deletion.

## UI

The repository terminal panel exposes two explicit actions:

- “New terminal” creates `Native`.
- “New terminal with tmux” creates `TmuxIfAvailable`.

No selection is remembered. Both actions create and open a new terminal using the existing loading and error flow.

The existing terminal-delete dialog remains the only deletion confirmation. For a tmux-backed terminal it additionally shows an unchecked “Also close the tmux session” checkbox and a warning that processes and other attached clients will be disconnected. Opening a different delete target or dismissing the dialog resets the checkbox.

## Exact Close Flow

When the checkbox is unchecked, Android closes the managed SSH channel and removes the terminal record exactly as today.

When checked, the application:

1. Reloads the server-owned terminal record by ID and requires a current-protocol `TmuxSessionIdentity`.
2. Lists remote sessions using `tmux list-sessions -F '#{session_name}\t#{session_path}'` through the trusted SSH command boundary.
3. Parses every line strictly and lexically normalizes each live `session_path` with the shared protocol rules.
4. Finds a live entry whose name equals the retained name and whose path equals the retained initial path.
5. Treats no tmux server or an absent exact pair as already closed.
6. Kills only the exact validated name using `tmux kill-session -t '=<sessionName>'`.
7. Removes the Android terminal record only after success or already-missing classification.

Malformed list output, tmux unavailability, host-key failure, SSH failure, or kill failure leaves the Android terminal record intact and keeps the confirmation available for retry.

## Architecture

- A focused pure Android terminal protocol module owns POSIX path normalization, deterministic name generation, validation, list parsing, and command construction.
- A focused remote tmux adapter owns trusted SSH list/kill execution and result classification.
- `TerminalSessionManager` continues to own record allocation, persistence, reconnect, and PTY lifecycle; it accepts launch intent and retains the generated identity.
- `HobgoblinAndroidApp` remains the composition/write boundary that runs optional remote tmux close before calling the existing record removal method.
- `RepositoryWorkspaceScreen` owns only the local launch choice and delete-checkbox state.

No renderer-like UI layer constructs arbitrary shell commands or supplies a tmux name to the close adapter.

## Testing

- Protocol tests cover the desktop reference vector, lexical normalization, invalid inputs, exact command fields, strict list parsing, and name-plus-path matching.
- SSH adapter tests cover exact match, wrong path, wrong name, no server, malformed output, kill success, kill already missing, and command failure.
- Session-manager tests prove native default, explicit tmux metadata, reconnect preservation, temporary-terminal exclusion, and legacy-session behavior.
- Codec tests prove new-field round trips and backward compatibility.
- UI/state tests prove the two explicit launch modes and checkbox eligibility/reset semantics.
- Repository verification runs Android unit tests, Android lint/build checks available in the project, root typecheck/tests, and the architecture guard.

## Safety and Compatibility

- The client-visible delete choice is only a boolean; the retained identity remains authoritative.
- Both name and initial path must match live state before deletion.
- Newly reused names with a different path are not killed.
- Legacy or arbitrary names are rejected.
- Checked close is fail-closed and never silently degrades to deleting only the Android record.
- No dependency or schema migration outside the backward-compatible codec extension is required.
