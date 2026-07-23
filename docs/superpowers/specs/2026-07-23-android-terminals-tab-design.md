# Android Terminals Tab Design

**Date:** 2026-07-23

**Status:** Approved for autonomous inline implementation

## Summary

Add a third `Terminals` destination to the Android bottom navigation. It is a read-only overview of every retained Android terminal session, including Host temporary terminals and Project terminals, and opens the selected existing session directly.

## Goals

- Make existing Android terminal sessions reachable from the main navigation in one tap.
- Show Host temporary terminals and Project terminals together.
- Include every retained session status: starting, running, exited, failed, and disconnected.
- Return to the `Terminals` tab after leaving a session opened from that tab.
- Preserve the existing lifecycle distinction: leaving a Host temporary terminal still closes that temporary session, while leaving a Project terminal keeps it retained.

## Non-goals

- Creating, reconnecting, renaming, or deleting terminals from the overview.
- Changing terminal persistence, SSH behavior, tmux behavior, or foreground-service ownership.
- Adding filters, search, grouping, badges, or a new dependency.
- Changing the desktop/web terminal tab model.

## Approaches Considered

### 1. Dedicated main-navigation destination — selected

Add `MainTab.Terminals` and `AppRoute.Terminals`, then render a focused `TerminalsScreen`. This matches the requested interaction, covers both terminal sources, and keeps the overview independent from Host and Project screens.

### 2. Projects-only shortcut

Add a terminal shortcut inside `Projects`. This is smaller but cannot naturally represent Host temporary terminals and is slower to reach.

### 3. Reuse the repository terminal panel globally

Lift the existing repository-specific terminal panel into the application shell. That panel owns worktree selection, creation, tmux actions, and deletion, so reusing it would couple a read-only global overview to repository-only behavior.

## Navigation Model

The Android main-tab order becomes `Hosts`, `Projects`, `Terminals`. Existing horizontal swipe navigation follows the same order in both directions.

`AppRoute.Terminals` represents the overview. `AppRoute.Terminal` gains a `returnToTerminals` navigation hint. Only sessions opened from the overview set it. Notification/deep-link, Host, Diagnostics, and Project entry paths retain their current destinations.

When leaving a terminal opened from the overview:

- A Host temporary terminal is closed using the existing temporary-session behavior, then navigation returns to `AppRoute.Terminals`.
- A Project terminal remains retained and navigation returns to `AppRoute.Terminals`.
- Switching between global Project terminals inside `TerminalScreen` preserves the return hint.

The hint is local route state, not persisted domain state.

## Session List

The overview consumes the existing `terminalSessions` snapshot already observed by `HobgoblinAndroidApp`. It does not own another observer or query layer.

Sessions are ordered using the existing terminal-workspace priority:

1. starting and running sessions;
2. exited, failed, and disconnected sessions;
3. within each group, most recent `lastActivityAt`, falling back to `openedAt`;
4. deterministic timestamp/id tie-breakers.

Each row shows:

- the retained display name, terminal number fallback, or `Host terminal` fallback;
- the existing target label and remote path context;
- the existing lowercase status presentation;
- an `Open` action, with the whole card also clickable.

An empty list shows `No terminals` with explanatory text. It intentionally has no creation action.

## Components and Ownership

- `MainTabBar.kt` owns the third main-tab label, terminal icon, and tab switching.
- `MainTabShell.kt` owns top-bar title/actions, the third retained tab pane, and three-way swipe behavior.
- `TerminalsScreen.kt` owns read-only overview presentation.
- `TerminalInteractionState.kt` owns pure ordering because it already owns terminal-session list projections.
- `AppRoute.kt` owns the overview route and terminal return hint.
- `HobgoblinAndroidApp.kt` composes the observed session snapshot with navigation callbacks.

No server, desktop renderer, shared TypeScript, storage, or terminal transport code changes.

## Error and Edge Cases

- If the list is empty, render the empty state.
- If a session disappears between composition and click, ignore the stale click rather than creating a replacement.
- If a selected session references a missing Host, the existing terminal-route guard redirects to `Hosts`.
- Live session updates recompose the overview through the existing `observeSessions` subscription.
- Failed and disconnected sessions remain visible because they can still be reopened and reconnected in the existing terminal screen.

## Testing

- `MainTabBarTest` covers the third tab, terminal icon kind, selection behavior, and three-way swipe projection.
- `AppRouteTest` covers the overview route and opt-in return hint.
- `TerminalInteractionStateTest` covers all-status inclusion and active-first/recent-first ordering.
- `TerminalsScreenStateTest` covers title fallback and secondary text without Compose instrumentation.
- Focused Android unit tests run first, followed by `:app:testDebugUnitTest`, `:app:lintDebug`, and `:app:assembleDebug`.
- Root `bun run typecheck`, `bun run test`, and `bun run check:architecture` verify no cross-platform regression.

## Safety and Compatibility

- No session mutation is exposed from the new tab.
- No schema or dependency changes are required.
- Existing entry paths and Host temporary terminal cleanup semantics remain unchanged.
- The change is confined to Android navigation and presentation.
