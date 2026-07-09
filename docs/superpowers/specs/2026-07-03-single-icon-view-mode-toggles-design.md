# Single Icon View Mode Toggles Design

## Goal

Replace the branch-area branch view switcher, the Changes tab file-list switcher, and the History tab file-list switcher with single icon buttons that cycle between their two existing modes.

This scope intentionally excludes the previously discussed file-area bottom status/action bar and moving top-right layout/settings controls.

## Current Behavior

The relevant controls are implemented as two-item `ToggleGroup`s:

- `BranchViewModeControl` switches between all branches and worktree branches.
- `FileListViewModeControl` switches between file list and file tree modes.
- `ProjectChangesPanel` uses `FileListViewModeControl` for changed files.
- `ProjectHistoryPanel` uses `FileListViewModeControl` for commit file changes.

The state model is already two-valued for the controls in this scope:

- branch view mode uses `all` and `worktrees`
- file list view mode uses `list` and `tree`

## Requirements

- Show a single icon button for each view-mode switcher.
- The icon must represent the current mode.
- The tooltip and `aria-label` must describe the action that will happen on click, for example switching from tree view to list view.
- Clicking the button must cycle to the other mode.
- Disabled branch view controls must remain disabled and must not call `onChange`.
- Existing callers should keep their current props and state ownership.
- Existing list/tree rendering behavior must not change.

## Non-Goals

- Do not add the file-area bottom status/action bar.
- Do not move workspace layout or Settings controls.
- Do not change repository layout, tab behavior, branch filtering state, or file-list state persistence.
- Do not add support for more than the current two modes.
- Do not introduce a new generic abstraction unless the implementation becomes meaningfully duplicated.

## UX

Each control renders one icon-only `Button` wrapped in `Tip`.

The button shows the current state:

- branch mode `all`: show the all-branches/list-tree icon
- branch mode `worktrees`: show the worktree/folder-tree icon
- file mode `tree`: show the folder-tree icon
- file mode `list`: show the list icon

The tooltip and accessible label describe the next action:

- current `all` -> label uses the worktrees tooltip text
- current `worktrees` -> label uses the all-branches tooltip text
- current `tree` -> label uses the list-view text
- current `list` -> label uses the tree-view text

This makes the current mode visible while keeping the click target's action clear.

## Component Design

`BranchViewModeControl` keeps the existing public interface:

```ts
interface Props {
  value: BranchViewMode
  disabled?: boolean
  onChange: (viewMode: BranchViewMode) => void
}
```

Internally it computes:

- `nextValue`: `value === 'all' ? 'worktrees' : 'all'`
- `Icon`: icon for `value`
- `label`: tooltip key for `nextValue`

It renders a single `Button` with `type="button"`, `variant="outline"`, `size="icon-sm"` or the nearest local compact icon size, and calls `onChange(nextValue)` when enabled.

`FileListViewModeControl` keeps the existing public interface:

```ts
interface FileListViewModeControlProps {
  value: FileListViewMode
  onChange: (mode: FileListViewMode) => void
}
```

Internally it computes:

- `nextValue`: `value === 'tree' ? 'list' : 'tree'`
- `Icon`: icon for `value`
- `label`: label key for `nextValue`

`FileListViewToolbar`, `ProjectChangesPanel`, and `ProjectHistoryPanel` continue to use `FileListViewModeControl` without changing their local state.

## Data Flow

Branch view:

1. `BranchFilterControls` reads `repo.ui.branchViewMode`.
2. `BranchViewModeControl` renders the icon for the current mode.
3. User clicks the button.
4. The control calls `setBranchViewMode(repoId, nextValue)` through the existing `onChange`.
5. `BranchList` continues to derive visible branches from the existing store state.

File view:

1. `ProjectChangesPanel` or `CommitDetailPane` owns local `fileViewMode`.
2. `FileListViewModeControl` renders the icon for the current mode.
3. User clicks the button.
4. The control calls the existing state setter with the other mode.
5. `StatusList` or `CommitFileList` receives the updated mode as it does today.

## Accessibility

The button must use a real `button` element through the shared `Button` component.

The `aria-label` must match the action label, not the current state label. The visible icon communicates current state, while the accessible name and tooltip communicate the click action.

The disabled branch view control must use the native disabled button state.

## Error Handling

No new error states are introduced.

If an unexpected value reaches either control, TypeScript should continue to restrict the allowed union values. Runtime fallback behavior is not needed because values originate from typed store/local state.

## Testing

Focused component tests should cover:

- `BranchViewModeControl` renders one button and switches `all -> worktrees`.
- `BranchViewModeControl` switches `worktrees -> all`.
- `BranchViewModeControl` does not call `onChange` while disabled.
- `FileListViewModeControl` renders one button and switches `tree -> list`.
- `FileListViewModeControl` switches `list -> tree`.

Integration-level tests should update existing expectations that currently look for two toggle items:

- branch toolbar tests should expect the single branch view switch action instead of both `all` and `worktrees` buttons.
- Changes panel tests should still verify file view mode changes when the control is clicked.
- History panel tests should still verify file view mode changes when the control is clicked.

Verification commands:

- `bun run test src/web/components/repo-toolbar/RepoToolbar.test.tsx src/web/components/repo-workspace/ProjectChangesPanel.test.tsx src/web/components/repo-workspace/ProjectHistoryPanel.test.tsx`
- `bun run typecheck`
- `bun run test`

## Design Principles

KISS: convert each existing two-state switcher directly to one button with local next-mode computation.

YAGNI: do not introduce a general cycle-button abstraction while only two simple controls need it.

DRY: keep shared file-list behavior in `FileListViewModeControl`, so Changes and History stay aligned.

SOLID: retain the existing component boundaries. Controls own presentation and next-state calculation; callers own state updates.
