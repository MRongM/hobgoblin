# Directory tmux Restore Menu Copy Design

## Goal

Make the existing directory-scoped tmux recovery action discoverable from worktree, member-worktree, and branch-workspace item menus and context menus by labeling it as “Restore tmux sessions in folder”.

## Decision

The existing `tmux terminal` action already calls the server-owned `open-tmux-sessions` operation. That operation restores every verified Hobgoblin tmux session whose initial path exactly matches the selected item directory, and creates one tmux-backed terminal only when no associated session exists.

Use a new localized label for this existing action on directory item surfaces. Keep the generic `tmux terminal` copy in the terminal topbar, where the action is presented as a terminal creation choice rather than a directory operation.

Rejected alternatives:

- Change `terminal.new-with-tmux` globally: this would alter terminal-topbar copy outside the requested surfaces.
- Add a second menu action with the same callback: duplicate entries would claim different behavior while invoking the same batch operation.
- Add a renderer or server recovery path: recovery already has one authoritative server-owned path.

## UI projection

- `projectWorktreeListItemActions` accepts an optional localized label override for its tmux menu-only action. Ordinary worktree and member-worktree callers provide the directory-restore label.
- `WorkspaceItemContextMenu` accepts an optional localized tmux label. Targeted directory item callers provide the override; unrelated project/repository callers retain the current default.
- The branch-workspace root item uses the new translation key in its More menu and the localized override in its context menu.

The action icon, enabled/busy state, callback, item selection behavior, terminal reconciliation, and error handling remain unchanged.

## Localization and testing

Add the key in English, Simplified Chinese, Japanese, and Korean. Component tests assert the new label on both More and context menus and continue to verify that selection reaches the existing `tmux-if-available` launch path. Translation dictionary parity remains enforced by the existing dictionary test.

## Scope check

No protocol, persistence, state ownership, domain terminology, or architecture boundary changes are required. No ADR or `CONTEXT.md` update is warranted.
