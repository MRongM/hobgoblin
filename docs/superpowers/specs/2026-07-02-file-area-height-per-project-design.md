# File Area Height Per Project Design

## Goal

Make the file area split height independent per project. Resizing the file area in one project must not change the file area height in another project.

The file area height must survive app restart. The settings page keeps a height control, but its meaning changes to a default for new projects rather than an override for every opened project.

## Current Behavior

`RepoExplorerPane` reads `state.fileTreePaneSizes[layout]` and writes through `setFileTreePaneSize(layout, size)`. That state is workspace-level and keyed only by layout:

- `top-bottom`
- `left-right`

As a result, resizing the file area in one project changes every project that uses the same workspace layout.

The outer workspace layout is already per project through `repo.ui.workspaceLayout`, so the current file area height behavior is inconsistent with the surrounding project-level layout model.

## Requirements

- Store file area pane sizes per project.
- Keep separate values for `top-bottom` and `left-right`.
- Persist project-specific file area pane sizes across restart.
- Use the global `fileTreePaneSizes` state as the default for projects that do not yet have a project-specific value.
- Change the file area settings control to mean "new project default height ratio".
- Do not let resizing one project affect another project.
- Do not add a separate storage system for this feature.

## Non-Goals

- Do not redesign the file tree, explorer tabs, or branch list.
- Do not change the outer workspace layout behavior.
- Do not add a UI for clearing a single project's custom file area height.
- Do not migrate or rewrite existing user session files.
- Do not introduce per-branch or per-worktree file area heights.

## State Model

Add optional project-level file area pane sizes to `RepoUiState`:

```ts
fileTreePaneSizes?: WorkspaceDetailPaneSizes
```

The effective file area size for a project is:

```ts
repo.ui.fileTreePaneSizes?.[layout] ?? state.fileTreePaneSizes[layout]
```

`state.fileTreePaneSizes` remains a restorable workspace field, but its semantic role becomes "default file area pane sizes for projects without an override".

This keeps the model simple:

- project UI state owns project-specific layout choices
- workspace/session state owns defaults
- rendering uses a single effective-size lookup

## Behavior

When a user resizes the file area split in `RepoExplorerPane`, the app writes the normalized size into the active repo's `repo.ui.fileTreePaneSizes[layout]`.

When a user changes the file area height control in settings, the app writes only `state.fileTreePaneSizes[layout]`. Existing projects with project-level file area sizes keep their values. Projects without project-level values use the updated default.

When a project is opened for the first time, it has no project-level file area size. It therefore uses the current default for the active layout. Once the user resizes that project's file area, the project gains its own value.

`resetLayout()` keeps its current scope: it resets workspace-level layout defaults, including `state.fileTreePaneSizes`, but does not bulk-clear project-level file area sizes from every cached project. This avoids surprising cross-project changes from a generic layout reset.

## Persistence

Persist `repo.ui.fileTreePaneSizes` in `RestorableRepoSnapshot.ui`, beside the existing per-project `workspaceLayout`.

Restore it through the same snapshot path used by other project UI fields:

- `restorableRepoSnapshotFromRepo`
- `RestorableRepoSnapshotSchema`
- `normalizeRestorableRepoSnapshotEntry`
- `restoreProjectionFromSnapshot`

The field is optional for compatibility. Existing cached project snapshots without the field keep working and fall back to `state.fileTreePaneSizes`.

`SessionState.fileTreePaneSizes` stays in place and continues to be restored through `applySessionLayoutState`, now as default pane sizes.

## Components

`RepoExplorerPane` should select:

- the active repo's project-level pane sizes
- the workspace default pane sizes
- the current layout

It should pass the effective size to `SplitPane`.

The resize handler should call a project-level action, for example:

```ts
setRepoFileTreePaneSize(repoId, layout, size)
```

The settings page should call a default-level action, for example:

```ts
setDefaultFileTreePaneSize(layout, size)
```

This split avoids a double-meaning setter and keeps call sites self-documenting.

## Settings Copy

Update the file area settings row so the label and hint communicate default semantics.

Suggested English copy:

- Label: `New project default height ratio`
- Hint: `Sets the file area height for projects that do not have their own saved size.`

Existing localized dictionaries should get equivalent copy. If a language-specific translation is not available during implementation, use a clear direct translation consistent with the existing dictionary style.

## Data Flow

1. User opens project A.
2. Project A has no project-level file area size.
3. `RepoExplorerPane` renders using `state.fileTreePaneSizes[layout]`.
4. User drags the file area split in project A.
5. The resize handler writes `repoA.ui.fileTreePaneSizes[layout]`.
6. The repo snapshot cache persists project A's UI state.
7. User switches to project B.
8. Project B renders from its own project-level size, or from the default if it has no override.
9. Restart restores project A's saved size from `restorableRepoCache`.

## Error Handling

Invalid or out-of-range pane sizes continue to use the existing normalization helpers:

- `normalizeFileTreePaneSize`
- `normalizeFileTreePaneSizes`

If a cached project snapshot has no `fileTreePaneSizes` field, the effective-size lookup falls back to `state.fileTreePaneSizes`.

If a cached project snapshot has a `fileTreePaneSizes` object with an invalid value for one layout, normalize that layout with `normalizeFileTreePaneSize`. This matches existing pane-size behavior and prevents invalid persisted values from reaching `SplitPane`.

If a resize event arrives for a repo that no longer exists, the setter is a no-op.

## Testing

Store tests:

- resizing project A stores `repoA.ui.fileTreePaneSizes` and does not change project B
- effective file tree pane size falls back to `state.fileTreePaneSizes` when the repo has no override
- project-level sizes are normalized per layout
- default file tree pane size updates only `state.fileTreePaneSizes`
- `resetLayout()` resets default file tree sizes without clearing project-level sizes

Persistence tests:

- `RestorableRepoSnapshot` includes project-level `fileTreePaneSizes`
- restoring a snapshot restores project-level file tree pane sizes
- old snapshots without `fileTreePaneSizes` remain valid and use defaults
- invalid cached project sizes are normalized

Component/settings tests:

- `RepoExplorerPane` passes the project effective size to `SplitPane`
- resizing in `RepoExplorerPane` calls the project-level setter with `repoId`, `layout`, and normalized size
- `FileAreaSettings` displays and updates the default size, not the current project's override
- settings copy reflects new-project default semantics

Verification:

- `bun run test src/web/stores/repos/selection.test.ts src/web/stores/repos/persistence.test.ts src/web/components/repo-workspace/RepoExplorerPane.test.tsx src/web/components/SettingsSurface.test.tsx`
- `bun run typecheck`
- `bun run test`

## Design Principles

KISS: keep a direct fallback chain instead of a new layout subsystem.

YAGNI: do not add per-worktree heights or a reset-custom-height UI.

DRY: reuse `WorkspaceDetailPaneSizes` and existing normalization helpers.

SOLID: keep default-setting behavior and project-specific resize behavior in separate actions so each call site has one clear responsibility.
