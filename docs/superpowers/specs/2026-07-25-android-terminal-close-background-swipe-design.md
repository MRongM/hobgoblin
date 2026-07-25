# Android Terminal Close and Background Swipe Design

## Goal

Allow users to close retained terminal sessions directly from the Android terminals tab and move an open terminal into the retained background with a rightward swipe.

## Product behavior

### Close from a terminal item

Every item in the Android terminals tab shows `Close` and `Open` actions, with `Open` remaining the rightmost primary action. `Close` uses the error color and opens a confirmation dialog rather than changing state immediately.

Confirmation explains that the Android terminal connection will stop and the item will be removed. For tmux-backed terminals it also states that the remote tmux session will continue running. Confirming performs an Android retained terminal close:

- stop an active Android terminal controller;
- detach its emulator projection;
- remove its retained device-local session record;
- remove its id from the persisted Android terminal manual order;
- synchronize the terminal foreground service notification state.

Cancel leaves the session and list unchanged. The action is available for running and inactive retained sessions.

### Rightward background swipe

The terminal page exposes a narrow swipe region along its left content edge. Dragging right past the threshold navigates to the Android terminals tab without closing, disconnecting, or removing the selected session.

This is distinct from the existing Back path. In particular, Back may close a Host temporary terminal, while the rightward background swipe always retains it. The gesture also works in terminal focus mode and does not change terminal appearance, command-deck, or focus persistence rules.

The edge-only gesture avoids taking horizontal terminal scrolling and text-selection gestures away from the viewport.

## Architecture

- `TerminalsScreen.kt` owns confirmation presentation and manual-order cleanup, and emits an explicit close callback after confirmation.
- `HobgoblinAndroidApp.kt` executes the close through `TerminalSessionManager.removeSession`, synchronizes `TerminalForegroundBridge`, and routes background navigation to `AppRoute.Terminals`.
- `TerminalScreen.kt` owns the transient swipe distance and invokes a separate `onBackground` callback. It does not reuse `onBack`.
- `TerminalInteractionState.kt` exposes a pure swipe-threshold decision for unit testing.
- No SSH protocol, tmux cleanup, session persistence format, dependency, desktop, web, or server changes are required.

## Error and safety handling

- Close requires explicit confirmation because an ordinary native terminal shell may be terminated.
- The close callback resolves the current session by id; an item that disappeared before confirmation becomes a safe no-op.
- Manual order removes only the confirmed session id and preserves the relative order of every other retained terminal.
- A short, leftward, or cancelled swipe does nothing.
- Closing a tmux-backed Android item never invokes remote tmux cleanup.

## Verification

- Unit tests cover confirmation copy, tmux-specific copy, manual-order cleanup, and right-swipe direction/threshold behavior.
- Contract tests verify the list item exposes confirmed Close and the terminal page uses a separate background callback.
- Run `./gradlew :app:testDebugUnitTest` from `android/`.
- Run `bun run typecheck`, `bun run test`, and `bun run check:architecture` from the repository root.

