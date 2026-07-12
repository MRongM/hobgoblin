# Branch Area Toolbar Quick Actions

**Date:** 2026-07-12

## Overview

Add two quick-access icon buttons — Editor and Terminal — to the branch area toolbar. These buttons activate the currently selected worktree, providing one-click access without navigating to the branch detail panel.

## Location

The branch area toolbar is the `Toolbar` inside `BranchArea` in `RepoExplorerPane.tsx`. It currently contains:
- Left: `BranchFilterControls` (search/filter)
- Right: `RepoToolbarActions` (create worktree, refresh)

The new buttons are inserted **between** the filter controls and `RepoToolbarActions`, or immediately to the left of `RepoToolbarActions`.

## Components

### `BranchAreaQuickActions` (new internal component in `RepoExplorerPane.tsx`)

A new sub-component of `BranchArea`. Subscribes to the store to read:
- `repo.ui.selectedBranch` — which branch is selected
- The selected branch's `worktree?.path` — whether a worktree exists
- `useRuntimeExternalAppSettings` — editor/terminal app availability

Uses `useBranchActionItems` to obtain the `editor` and `terminal` action items (with their `onSelect` handlers, icons, and disabled state), then renders them as icon-only `AsyncButton`s.

## Button Behavior

| State | Editor button | Terminal button |
|---|---|---|
| Selected branch has worktree, apps available | Enabled | Enabled |
| Selected branch has no worktree | Disabled | Disabled |
| No branch selected | Disabled | Disabled |
| Editor app not configured | Disabled | — |
| Terminal not available | — | Disabled |

Both buttons are always rendered (never hidden), matching the "A" requirement from design discussion.

## Icons

Reuse existing `EditorAppIcon` and `TerminalAppIcon` components, consistent with the branch detail panel icons.

## Data Flow

```
useReposStore → selectedBranch → branch.worktree?.path
                                        ↓
                            useBranchActionItems(repo, branch)
                                        ↓
                            actions.editor.onSelect
                            actions.terminal.onSelect
```

## Files Changed

- `src/web/components/repo-workspace/RepoExplorerPane.tsx` — add `BranchAreaQuickActions` inside `BranchArea`

## Files Not Changed

- `useBranchActionItems.ts` — reused as-is
- `BranchActionControls.tsx` — not touched
- `RepoToolbarActions.tsx` — not touched
