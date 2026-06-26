# Left-Right Terminal Toolbar Controls Design

**Date:** 2026-06-26
**Status:** Draft for review

## Overview

In Git workspaces, the branch detail pane toolbar currently shows both the focus toggle and the detail collapse toggle in left-right layout. The requested behavior is narrower: when the workspace layout is left-right, the terminal/detail toolbar should show only the maximize/minimize focus control and should not show the collapse/expand detail control.

This is a presentation-only change. The existing detail collapse state, keyboard command handling, menu intent handling, and session restore behavior should remain unchanged.

## Goals

- Hide the detail collapse/expand toolbar button in left-right layout.
- Keep the detail maximize/minimize focus button visible in left-right layout.
- Preserve current top-bottom layout controls.
- Avoid changing workspace layout state semantics.
- Keep the change scoped to the branch detail toolbar and its tests.

## Non-Goals

- Do not disable detail collapse in the store.
- Do not change `workspaceLayoutAllowsDetailCollapse()` behavior.
- Do not change keyboard shortcuts, native menu actions, renderer intents, or session restore.
- Do not redesign the toolbar or terminal tabs.
- Do not change non-Git workspace layout behavior.

## Behavior

When the active Git workspace uses `left-right` layout:

- The branch detail toolbar renders terminal tabs as it does today.
- The focus toggle remains visible:
  - maximize icon when focus mode is off
  - minimize icon when focus mode is on
- The collapse/expand detail button is not rendered.
- Existing indirect collapse paths continue to use the current store behavior.

When the active Git workspace uses `top-bottom` layout:

- The toolbar behavior stays unchanged.
- The focus toggle remains visible.
- The collapse/expand detail button remains visible.

## Architecture

The change belongs in the toolbar rendering layer because the requirement is only to hide a button in one layout. The underlying behavior model can still report that detail collapse is allowed for left-right layout, preserving existing command and restore semantics.

Implementation should add a local rendering condition in `BranchDetailToolbar`, for example:

```ts
const showCollapseControl = behavior.detailCollapseAllowed && layout !== 'left-right'
```

The collapse button should render only when `showCollapseControl` is true. The focus button should continue to use `behavior.detailFocusAllowed`.

This keeps responsibility boundaries simple:

- `repoWorkspaceBehavior()` continues to describe effective workspace behavior.
- `BranchDetailToolbar` decides which controls are visible for this toolbar variant.
- Store actions remain the single source of truth for detail collapse state changes.

## Data Flow

1. `RepoView` derives the active workspace layout and detail behavior.
2. `BranchDetail` passes `layout`, `collapsed`, and `detailFocusMode` to `BranchDetailToolbar`.
3. `BranchDetailToolbar` computes toolbar button visibility.
4. In left-right layout, it renders the focus button and omits the collapse button.
5. In top-bottom layout, it renders both controls as before.

No persisted state shape changes are required.

## Error Handling

There is no new error path. If state is restored with `detailCollapsed: true` while the layout is left-right, the rendering behavior should continue to follow the existing effective behavior rules. This spec only removes the toolbar affordance for changing that state in left-right layout.

## Testing

Update `BranchDetailToolbar.test.tsx`:

- Replace the existing left-right control assertion with one that verifies:
  - focus button is rendered
  - collapse button is not rendered
  - clicking focus still enables `detailFocusMode`
- Keep existing terminal tab and navigation tests unchanged.

No store behavior tests should be changed solely to make left-right collapse impossible, because collapse remains supported outside the toolbar affordance.

## Implementation Notes

- Keep imports using repo aliases with explicit `.ts` / `.tsx` extensions.
- Keep the implementation local and KISS: one boolean and one rendering condition.
- Do not add a new component prop unless existing layout data proves insufficient.
- Do not introduce new i18n keys; the hidden control uses existing copy when shown in top-bottom layout.
