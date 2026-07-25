# Android Terminal Item Reconnect Design

## Goal

Expose a direct Reconnect action on every retained terminal item in both the Android Terminals tab and the Project terminal list.

## Product behavior

- Every terminal item renders `Reconnect` as its first lifecycle shortcut.
- Reconnect is enabled for `Exited`, `Failed`, and `Disconnected` records.
- Reconnect remains visible but disabled for `Starting` and `Running` records.
- Clicking Reconnect restarts the existing retained session in place. It does not create a second list item, navigate to the terminal page, change manual order, or alter Close/Delete behavior.
- A retained tmux identity is passed back through the existing reconnect path, so an eligible tmux-backed terminal reattaches to the same remote tmux session.
- Missing or stale session ids are safe no-ops. A missing Host prevents reconnection rather than constructing an incomplete SSH target.

## Architecture

- `TerminalInteractionState.kt` owns the pure record-status availability policy shared by both lists.
- `TerminalsScreen.kt` and `RepositorySetupScreen.kt` render the shortcut and emit the selected `TerminalSessionRecord` without constructing connection parameters.
- `HobgoblinAndroidApp.kt` owns one reusable reconnect orchestration function. It resolves the current retained record and Host, reconstructs `RemoteTarget`, invokes `TerminalSessionManager.reconnect` on the IO dispatcher, and synchronizes the foreground bridge.
- Existing `TerminalSessionManager.reconnect` remains the lifecycle source of truth; no new session-manager API or persistence shape is introduced.

## Error and safety handling

- UI availability prevents ordinary duplicate reconnect requests for active sessions.
- The app boundary re-reads the record before reconnecting to avoid using stale Item data.
- The manager already treats a concurrently active session idempotently and preserves the retained terminal id, display name, output snapshot, repository root, and valid tmux identity.
- The feature performs no deletion, remote tmux cleanup, routing, or Git operation.

## Verification

- Unit tests cover status availability for all retained session statuses.
- Source contracts verify both Item surfaces render Reconnect and pass the same callback.
- App wiring tests verify reconnect resolves the retained record and uses `TerminalSessionManager.reconnect`.
- Run Android unit tests plus the repository typecheck, test, and architecture commands.
