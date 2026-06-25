# Branch Toolbar Actions Design

**Date:** 2026-06-25  
**Status:** Approved design; implementation not started

## Overview

The repo UI should move repo-level Git actions closer to the branch list. The global/top repo chrome should stop carrying the sync and create-worktree controls, while the branch area toolbar should expose those controls on its right edge.

The branch view mode switch should be simplified for users: only "all branches" and "worktree branches" remain visible. The existing internal `no-worktree` mode stays in the data model for compatibility with persisted state, tests, and older cached sessions.

## Goals

- Move sync and create-worktree actions from the repo/top toolbar area into the branch area toolbar.
- Keep those actions visually aligned to the branch area toolbar's right side.
- Keep branch search and branch view mode controls on the branch area toolbar's left side.
- Show only two branch view mode options in the UI: `all` and `worktrees`.
- Preserve internal compatibility for existing `no-worktree` state.
- Keep non-Git workspace behavior unchanged: Git-only actions stay hidden.

## Non-Goals

- Do not remove the `no-worktree` type, persistence schema, or selection logic.
- Do not migrate existing persisted workspace snapshots.
- Do not redesign branch rows, branch detail, file tabs, or workspace layout controls.
- Do not add new branch actions.
- Do not change sync, fetch, or worktree creation behavior.

## Current Context

`RepoToolbarActions` currently owns repo-level Git actions:

- `RepoActivityControl` for refresh/sync activity.
- `CreateWorktreeAction` for creating worktrees.

`RepoToolbar` currently renders `RepoToolbarActions` beside `WorkspaceLayoutControl`. `TopbarRepoControls` also renders `RepoToolbarActions` in the global topbar.

The branch area is rendered in `RepoExplorerPane` through `BranchArea`. Its toolbar currently contains `BranchFilterControls`, which combines:

- `BranchViewModeControl`
- `BranchSearchInput`

`BranchViewModeControl` renders options from `BRANCH_VIEW_MODE_OPTIONS`, currently including:

- `all`
- `worktrees`
- `no-worktree`

## Design

### Topbar And Repo Toolbar

For Git repositories:

- Remove `RepoToolbarActions` from `TopbarRepoControls`.
- Remove `RepoToolbarActions` from the right side of `RepoToolbar`.
- Keep `WorkspaceLayoutControl` where it is today.
- Keep focus-mode branch switcher and branch action menu behavior unchanged.

For non-Git workspaces:

- Continue hiding Git-specific actions.
- Continue showing layout controls where they are already supported.

### Branch Area Toolbar

`BranchArea` should render a two-sided toolbar:

- Left side:
  - `BranchFilterControls`
  - branch view mode switch
  - branch search
- Right side:
  - `RepoToolbarActions`

The toolbar should preserve the existing `h-9` detail-toolbar height and avoid layout shifts. Search should retain a constrained width so action buttons remain reachable in narrow branch panes.

### Branch View Mode Options

The visible branch view mode options should be limited to:

- `all`
- `worktrees`

The internal `BranchViewMode` union remains:

- `all`
- `worktrees`
- `no-worktree`

If existing persisted state restores `no-worktree`, the app should remain safe. The control should keep the actual store value, render no selected item for the hidden mode, and let the user click `all` or `worktrees` to return to a visible mode. It should not silently mutate persisted state during render.

## Component Boundaries

### `RepoToolbarActions`

Keep this component as the source of repo-level Git action buttons. Reuse it inside `BranchArea` instead of duplicating sync or create-worktree button logic.

### `RepoToolbar`

Owns repo/body chrome and layout control placement. It should no longer own sync or create-worktree placement.

### `TopbarRepoControls`

Owns global compact chrome. It should no longer show sync or create-worktree buttons. Focus-mode branch-specific controls stay unchanged.

### `BranchArea`

Owns branch-list-local controls. It becomes the placement point for `RepoToolbarActions`.

### `BranchViewModeControl`

Owns visible branch filter choices. It should render only the supported visible options while preserving compatibility with the broader `BranchViewMode` type.

## Error Handling And Edge Cases

- If repo state is missing, existing null rendering behavior should remain.
- If the repo is non-Git, `RepoToolbarActions` should continue returning `null`.
- If branch action state is busy, create-worktree should keep the existing disabled behavior.
- If sync/fetch is busy, `RepoActivityControl` should keep the existing busy behavior.
- If branch count is zero, branch filter and search should stay disabled as they do today.
- If restored state is `no-worktree`, the app should not crash and the user must be able to switch back to `all` or `worktrees`.

## Testing

Update focused UI tests:

- `TopbarRepoControls` no longer renders sync or create-worktree controls for a Git repo.
- `RepoToolbar` no longer renders sync or create-worktree controls for a Git repo.
- `RepoToolbar` still renders layout controls for Git and non-Git repos.
- `RepoExplorerPane` branch toolbar renders sync and create-worktree controls above the branch list.
- Branch toolbar preserves existing height and ordering above the branch list.
- Branch view mode UI renders only `all` and `worktrees`, not `no-worktree`.

Run the standard verification commands after implementation:

- `bun run typecheck`
- `bun run test`

## Engineering Principles

- **KISS:** Reuse `RepoToolbarActions` and move placement rather than creating duplicate button implementations.
- **YAGNI:** Hide the `no-worktree` UI entry without deleting internal compatibility paths.
- **DRY:** Keep sync/worktree button behavior centralized in the existing action component.
- **SOLID:** Keep repo action behavior, branch filter UI, and toolbar placement responsibilities separated.
