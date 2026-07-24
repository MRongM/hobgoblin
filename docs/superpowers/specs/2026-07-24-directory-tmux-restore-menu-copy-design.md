# Detached Directory tmux Restore Menu Design

## Goal

Keep the existing `tmux terminal` action unchanged and add a separate `Restore tmux terminals` action to worktree, member-worktree, and branch-workspace item menus and context menus. The new action scans the selected directory and batch-opens only existing detached associated Hobgoblin tmux sessions.

## Decision

The two actions have distinct intents:

- `tmux terminal` creates one internal terminal with `launchMode: 'tmux-if-available'`. It uses the ordinary terminal creation request and preserves the existing shell fallback when tmux is unavailable.
- `Restore tmux terminals` runs the explicit `open-tmux-sessions` batch request. It never creates a tmux session and returns a successful zero-count result when no eligible session exists.

The tmux session list includes `session_attached`. A recovery candidate must satisfy all existing v1 identity checks, have an initial path exactly equal to the selected item directory after lexical normalization, and report an attached-client count of exactly zero. Attached associated sessions, arbitrary tmux sessions, legacy sessions, descendant paths, and malformed rows are ignored.

Recovery also depends on attach-or-create persisting the two v1 identity options. Every generated `set-option` command therefore uses the exact target-pane syntax `=<session>:`. Omitting the trailing colon fails on tmux 3.6a after session creation and makes the otherwise live session undiscoverable.

Rejected alternatives:

- Keep routing `tmux terminal` through batch recovery: this changes creation semantics and cannot represent an empty successful scan.
- Filter attached sessions only in the renderer: tmux discovery and directory association are server-owned security boundaries.
- Treat attached count as advisory after opening: the eligibility decision must be based on the explicit scan; the server still attaches by exact validated session name.

## UI projection

- The terminal registry exposes separate `createTerminal` and `restoreTmuxSessions` commands. Restore reconciles the full server catalog and reports the number of tmux sessions opened.
- The ordinary branch action model contains both menu-only actions, allowing ordinary and member worktree projections to share labels, disabled state, navigation, and callbacks.
- `WorkspaceItemContextMenu` renders both actions in stable order: internal terminal, tmux terminal, restore tmux terminals, then close actions.
- The branch-workspace root item directly supplies both actions and reuses the same terminal registry commands.

When recovery finds zero candidates, the UI remains stable and no terminal is created. Existing terminal selection and native/tmux creation behavior remain unchanged.

## Localization and testing

Add the restore key in English, Simplified Chinese, Japanese, and Korean while leaving `terminal.new-with-tmux` unchanged. Tests cover four-field tmux parsing, attached-session exclusion, detached-only server batch opening, empty-scan no-op, ordinary tmux creation, renderer reconciliation, and both menu entries on all requested directory item surfaces. A real isolated tmux-server test verifies that generated attach-or-create commands actually persist the identity options instead of checking only command text.

## Scope check

This changes the realtime result shape and tmux discovery metadata but adds no persistence, settings, dependencies, background scan, or new transport channel. The server remains authoritative, so no ADR is warranted; `CONTEXT.md` records the new detached recovery terminology.
