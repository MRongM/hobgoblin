# Non-Git Workspace Layout Separation Design

**Date:** 2026-06-25  
**Status:** Draft for implementation  
**Supersedes:** `docs/superpowers/specs/2026-06-24-non-git-plain-workspace-terminal-design.md`

## Overview

Non-Git workspaces already open and run. The remaining issue is presentation: the file browser and terminal currently share one area, which forces the user to switch between them. The workspace should instead show both areas at the same time, with a layout toggle that switches between left-right and top-bottom arrangements.

The outer workspace layout is per-workspace, not global. Each workspace remembers its last chosen layout. The default for a newly opened non-Git workspace is left-right.

The terminal area keeps its existing multi-terminal tab behavior. This change only separates the outer workspace layout; it does not remove terminal session tabs, reorder support, or terminal selection behavior inside the terminal area.

## Goals

- Show files and terminal in separate visible areas at the same time for non-Git workspaces.
- Support switching the outer layout between left-right and top-bottom.
- Default a new non-Git workspace to left-right.
- Remember the outer layout per workspace.
- Keep the existing terminal multi-tab experience inside the terminal area.
- Keep the file area independent from terminal session state.

## Non-Goals

- Do not redesign Git workspace behavior.
- Do not remove or simplify the terminal's internal multi-session tabs.
- Do not add new terminal session types or terminal routing rules.
- Do not change remote no-Git detection or workspace probing.
- Do not add new file-tree features.

## Behavior

### Outer Workspace Layout

For a non-Git workspace:

- The workspace shell always renders two simultaneous areas:
  - a file area
  - a terminal area
- The outer layout can be switched between:
  - `left-right`
  - `top-bottom`
- `left-right` is the default when a non-Git workspace opens for the first time.
- The chosen layout is stored per `repoId` and restored when the same workspace is reopened.

The layout control applies only to the outer shell. It does not change terminal session selection or file tree content.

### File Area

The file area keeps the existing file tree experience:

- directory browsing
- reveal requests from terminal actions
- file selection and navigation

It remains visible while the terminal area is visible.

### Terminal Area

The terminal area keeps the existing terminal session model:

- multiple terminal sessions
- terminal tabs
- selecting a tab
- creating a new session
- closing and reordering sessions

The terminal area may auto-create the first terminal session when appropriate, but that behavior remains inside the terminal subsystem. It is not represented as an outer workspace tab.

### Top-Level Chrome

Non-Git workspaces keep hiding Git-specific controls:

- branch list controls
- branch detail controls
- create worktree
- branch actions

The outer layout toggle stays visible because it is still meaningful for a non-Git workspace.

## State Model

The outer layout state must be stored per `repoId` as part of the workspace state associated with that workspace. The implementation should make the per-workspace layout the canonical source of truth rather than keeping a single global layout that all workspaces share.

Rules:

- layout state is persisted per workspace
- default is `left-right`
- switching one workspace does not change other workspaces
- reopening the same workspace restores its last layout

## Data Flow

1. User opens a readable non-Git local directory or remote non-Git workspace.
2. Workspace state marks it as non-Git.
3. The outer workspace shell renders both file and terminal areas at once.
4. The current workspace layout determines whether the split is horizontal or vertical.
5. The terminal area renders its internal terminal tabs from the existing session model.
6. User switches the outer layout.
7. The layout choice is written to the current workspace state.
8. Later reopen of the same workspace restores the saved layout.

## Error Handling

- If a workspace has no terminal sessions yet, the terminal area should use the existing terminal bootstrap or empty-state behavior for that area.
- Layout switching should not depend on terminal session availability.
- File area failures should not hide the terminal area, and terminal failures should not hide the file area.
- A layout change should not reset the current terminal tab selection unless the existing terminal subsystem already requires it.

## Testing

UI tests:

- Non-Git workspace renders file area and terminal area simultaneously.
- Default layout is left-right for a new non-Git workspace.
- Switching to top-bottom updates the outer shell layout.
- Reopening the same workspace restores the last chosen layout.
- No outer file/terminal tabs are rendered for non-Git workspaces.
- Terminal area still renders multi-terminal tabs when multiple sessions exist.

Store tests:

- layout changes are stored per repoId
- workspace A layout changes do not affect workspace B
- default state is left-right for a new non-Git workspace

Integration tests:

- the file area still receives reveal requests while the terminal area remains visible
- terminal session creation and selection continue to work inside the terminal area after layout switches

## Implementation Notes

- Keep repo-alias imports with explicit `.ts`/`.tsx` extensions.
- Keep the change scoped to the non-Git workspace shell and the existing workspace layout state.
- Do not introduce a separate layout store if the current workspace state can hold the setting cleanly.
- Preserve the existing terminal tabs implementation inside the terminal area.
