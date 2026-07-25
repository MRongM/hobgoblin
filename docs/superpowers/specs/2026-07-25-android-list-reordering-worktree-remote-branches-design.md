# Android List Reordering and Worktree Remote Branches Design

**Date:** 2026-07-25

**Status:** Approved for autonomous inline implementation

## Summary

Add durable drag reordering to Android Host, Project, Terminal, and Project Worktree items; remove the repository `Branches` tab; and allow the Worktree branch selector to create a worktree from a remote-tracking branch without leaving it detached.

## Goals

- Reorder the four requested Android item lists through a dedicated drag handle.
- Restore manual order after application restart.
- Scope Worktree order independently to each Project.
- Append newly saved or discovered items after retained ordered items.
- Remove the repository `Branches` tab and make `Worktrees` the initial Git Project tab.
- List local and remote-tracking branches in the Worktree selector.
- Create a local tracking branch when a remote-tracking branch is selected.

## Non-goals

- Changing Git's own worktree enumeration order or writing order metadata to the SSH host.
- Synchronizing Android order between devices.
- Automatically fetching remotes when the repository screen opens.
- Retaining the removed branch creation, checkout, or deletion UI elsewhere.
- Redesigning existing Material 3 cards, typography, palette, or navigation.

## Approaches Considered

### 1. Shared order source and shared drag interaction — selected

Use one small Android `SharedPreferences` source for ordered stable IDs, with global Host, Project, and Terminal scopes and one Worktree scope per Project. Use one Compose reorder state and one drag-handle component across all four surfaces. This keeps persistence policy and gesture behavior consistent while leaving domain records unchanged.

### 2. Add order fields to every existing store

Host, Project, and Terminal stores could persist their own list order, with a separate Worktree store. This spreads the same ordering policy across four owners and would couple presentation order to otherwise unrelated domain codecs.

### 3. Component-local ordering only

Each screen could reorder its current list without persistence. This is smaller but loses order on restart and does not meet the confirmed requirement.

## Domain and State Ownership

`Android manual item order` is Restorable State. Its source stores only non-sensitive item IDs or Worktree paths. Applying a saved order keeps known items in saved order, drops missing IDs from the projection, and appends unseen items in source order.

The order source exposes focused scopes rather than persisting whole Host, Project, Terminal, or repository snapshots. Reordering never changes SSH or Git state.

Remote-tracking branch candidates remain repository snapshot data. They are read from existing local remote refs; opening or refreshing the screen does not run `git fetch`.

## Drag Interaction

Every requested card gains a trailing drag handle with a clear `contentDescription`. A long press on the handle starts vertical reordering. The dragged card receives elevation and translation feedback; crossing another visible item's midpoint moves it immediately. Releasing persists the final stable-ID sequence.

The handle is a separate target so card navigation, Terminal opening, deletion, and Worktree actions keep their current behavior. The implementation uses Compose Foundation already present in the app and adds no dependency.

## Repository Navigation

Git Projects expose `Worktrees` and `Terminals`. Plain workspaces continue to expose only `Terminals`. `Worktrees` becomes the initial Git Project tab, and tab-index fallback also targets `Worktrees`.

The removed `Branches` panel is not relocated. Its branch creation, checkout, and deletion dialogs and callbacks leave the repository workspace composition. The underlying SSH service may remain source-compatible if deleting it would create unrelated churn.

## Remote Branch Worktree Creation

The repository snapshot reads:

- local branches from `refs/heads/`;
- remote-tracking branches from `refs/remotes/`, excluding symbolic `*/HEAD` aliases.

The Worktree selector labels candidate kind and preserves the full remote ref, such as `origin/feature-x`.

Creation follows these rules:

1. A local selection runs `git worktree add -- <path> <local-branch>`.
2. A remote selection derives `feature-x` from `origin/feature-x`.
3. If that local branch already exists, creation uses the existing local branch.
4. Otherwise creation runs `git worktree add -b <local-branch> --track -- <path> <remote-ref>`.

This avoids detached HEAD worktrees and matches the desktop/web worktree semantics already documented in the repository.

## Error Handling

- Malformed stored order entries are ignored; source order remains usable.
- A missing dragged item or target is a no-op.
- Remote `HEAD` aliases never enter the selector.
- Invalid remote refs or Git races surface the existing repository action error and trigger no optimistic snapshot mutation.
- Successful Worktree creation and removal refresh the authoritative SSH snapshot, then reapply the device-local order projection.

## Testing

- Pure ordering-policy tests cover restoration, unseen append, stale-ID removal, scoped Worktree keys, and move behavior.
- Compose-adjacent state tests cover handle-driven move projections for all four list consumers without relying on timing-sensitive instrumentation.
- Navigation tests prove Git Projects expose only `Worktrees` and `Terminals` and initially select `Worktrees`.
- Snapshot parser and script tests cover remote refs and `*/HEAD` filtering.
- Worktree creation tests cover local, new remote-tracking, and existing-local fallback commands.
- Focused Android tests run during each red-green cycle, followed by `:app:testDebugUnitTest`, `:app:lintDebug`, and `:app:assembleDebug`.
- Root `bun run typecheck`, `bun run test`, and `bun run check:architecture` guard cross-platform boundaries.

## Architecture Check

- KISS: one small persistent order source and one reusable drag implementation.
- DRY: ordering projection, move policy, persistence, and gesture handling are shared.
- YAGNI: no fetch button, cross-device sync, arbitrary ref mode, or new dependency.
- SOLID: persistence, pure ordering policy, Compose interaction, SSH snapshot reads, and Git mutation commands retain separate responsibilities.
- State model: manual order is Restorable; repository branches and worktrees remain authoritative SSH snapshot data.
- Realtime: no new realtime path is needed because Android order is device-local and repository changes already reconcile through explicit snapshot refresh.
