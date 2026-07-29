# Android Terminal Close, Delete, and Background Swipe Design

## Goal

Give Android terminal lists distinct Close and Delete lifecycle actions, and move an open terminal into the retained background with a rightward swipe.

## Product behavior

### Close without deleting

Every item in the Android terminals tab and every terminal item inside a Project shows an explicit `Close` action. Close opens a confirmation dialog because it may stop a running shell.

Confirmation explains that the Android terminal connection will stop while its retained record and list item remain available for reconnection. For tmux-backed terminals it also states that the remote tmux session continues running. Confirming performs an Android retained terminal close:

- stop an active Android terminal controller;
- mark the retained record as user-closed/exited;
- preserve the retained device-local record, list item, and manual order;
- synchronize the terminal foreground service notification state.

Cancel leaves the session unchanged. Close is idempotent for an already user-closed terminal.

### Delete from terminal lists

Every item in the Android terminals tab also shows `Delete`. Delete requires confirmation, stops the Android controller when active, removes the retained device-local session record, and removes only that id from the persisted terminal manual order. A tmux-backed Terminals-tab deletion leaves the remote tmux session running.

The Project terminal list keeps its existing Delete action and optional exact tmux-session cleanup. Adding Close does not alter its swipe-to-delete behavior, confirmation flow, or tmux checkbox.

### Rightward background swipe

The terminal page exposes a narrow swipe region along its left content edge. Dragging right past the threshold navigates to the Android terminals tab without closing, disconnecting, or removing the selected session.

This is distinct from the existing Back path. In particular, Back may close a Host temporary terminal, while the rightward background swipe always retains it. The gesture also works in terminal focus mode and does not change terminal appearance, command-deck, or focus persistence rules.

The edge-only gesture avoids taking horizontal terminal scrolling and text-selection gestures away from the viewport.

## Architecture

- `TerminalsScreen.kt` owns separate Close and Delete confirmation presentation. Only Delete changes manual order.
- `RepositorySetupScreen.kt` owns the Project terminal Close confirmation alongside its existing Delete flow.
- `HobgoblinAndroidApp.kt` executes Close through `TerminalSessionManager.close`, Delete through `TerminalSessionManager.removeSession`, synchronizes `TerminalForegroundBridge`, and routes background navigation to `AppRoute.Terminals`.
- `TerminalScreen.kt` owns the transient swipe distance and invokes a separate `onBackground` callback. It does not reuse `onBack`.
- `TerminalInteractionState.kt` exposes a pure swipe-threshold decision for unit testing.
- No SSH protocol, tmux cleanup, session persistence format, dependency, desktop, web, or server changes are required.

## Error and safety handling

- Close and Delete require explicit confirmation because an ordinary native terminal shell may be terminated.
- Callbacks resolve current session ids through the manager; a session that disappeared becomes a safe no-op.
- Close never changes manual order. Delete removes only the confirmed session id and preserves every other relative position.
- A short, leftward, or cancelled swipe does nothing.
- Closing a tmux-backed Android item never invokes remote tmux cleanup.
- Terminals-tab Delete never invokes remote tmux cleanup; Project Delete retains its existing explicit opt-in cleanup.

## Verification

- Unit tests cover Close-versus-Delete copy, Delete-only order cleanup, Project Close exposure, and right-swipe direction/threshold behavior.
- Contract tests verify both list surfaces expose Close, the Terminals tab exposes Delete, callbacks remain distinct, and the terminal page uses a separate background callback.
- Run `./gradlew :app:testDebugUnitTest` from `android/`.
- Run `bun run typecheck`, `bun run test`, and `bun run check:architecture` from the repository root.
