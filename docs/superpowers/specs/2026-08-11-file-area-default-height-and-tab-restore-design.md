# File Area Default Height and Tab Restore Design

## Goal

Refine the File area defaults without changing existing saved project layouts:

- New projects use a 30% default File area height.
- Reopening an existing File area restores its remembered tab.
- A File area without a remembered tab opens Status when that tab is available, otherwise Files.

“Reopening” means expanding the File area after it was collapsed. It does not change detached File area window behavior; detached windows continue to open the specific tab that was dragged out.

## Current Behavior

The shared `DEFAULT_FILE_TREE_PANE_SIZES` value is 66.7. Projects with their own saved pane size override that shared default.

File area tab selection is already stored per project and selected branch in `explorerTabByBranch`. `explorerTabForRepo` already resolves the active tab in this order:

1. selected-branch memory;
2. legacy project-level fallback memory;
3. Status when the selected branch has a worktree;
4. Files when Status is unavailable.

The worktree/project double-click expansion path currently writes Files before expanding the File area. That write replaces a remembered tab and bypasses the existing resolver.

## Design

### Default height

Change `DEFAULT_FILE_TREE_PANE_SIZES['left-right']` from `66.7` to `30`.

The existing default and normalization paths continue to consume this single constant. No schema, setter, or storage path changes are needed.

- New projects without a project-specific pane size use 30%.
- Missing or invalid default layout data falls back to 30% through existing normalization.
- Existing project-specific sizes and valid persisted workspace defaults remain unchanged.
- No migration rewrites saved layout values.

### Tab restoration

Remove the forced Files write from File area item expansion. Let the existing `explorerTabForRepo` resolver select the tab before and after expansion.

The resulting priority is:

1. restore the selected branch's remembered tab;
2. otherwise restore the legacy project fallback tab, when present;
3. otherwise open Status for a selected branch with a worktree;
4. otherwise open Files.

Apply this behavior to both desktop expansion and compact item navigation. Closing the File area does not alter tab memory.

Explicit file navigation remains unchanged. Reveal requests from status, history, or terminal paths continue to select Files because the destination is a file rather than a generic File area reopening.

## State and Persistence

No new state is introduced.

- Project/branch tab memory remains in the existing restorable `explorerTabByBranch` state.
- Per-project File area sizes remain in `repo.ui.fileTreePaneSizes`.
- The workspace-level `fileTreePaneSizes` remains the default for projects without an override.

No runtime-coherent server state, realtime path, or persistence schema changes are required.

## Error and Fallback Behavior

- A missing project or selected branch continues to use existing no-op and Files fallbacks.
- A branch without a worktree cannot present Status and therefore opens Files when it has no remembered tab.
- A remembered valid tab takes precedence even if it is not Status or Files.
- Existing tab validation continues to reject unknown persisted tab identifiers.

## Testing

Use test-first changes to cover:

- the canonical File area default is 30%;
- missing or invalid persisted default pane data falls back to 30%;
- reopening a collapsed File area preserves a remembered tab;
- reopening without memory selects Status when the selected branch has a worktree;
- reopening without memory selects Files when Status is unavailable;
- closing an expanded File area preserves its selected tab;
- explicit file reveal behavior still selects Files.

Run focused tests first, then:

- `bun run typecheck`
- `bun run test`
- `bun run check:architecture`

## Non-Goals

- Do not migrate or overwrite saved project or workspace pane sizes.
- Do not add a separate File area tab-memory store.
- Do not change detached File area window tab capture.
- Do not change tab availability or redesign the File area.

## Design Principles

- KISS: change the canonical default and remove the conflicting override.
- DRY: keep tab fallback policy centralized in `explorerTabForRepo`.
- YAGNI: add no migration, schema, or new state.
- SOLID: expansion controls visibility; the existing resolver owns tab selection.
