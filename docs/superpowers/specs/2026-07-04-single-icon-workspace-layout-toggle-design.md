# Single Icon Workspace Layout Toggle Design

**Date:** 2026-07-04  
**Status:** Approved for implementation  

## Overview

The workspace layout control currently renders as a two-item segmented control for `top-bottom` and `left-right`. The requested change is to make the top-right layout switcher a single icon button. The button should show the current layout icon and toggle to the other layout when clicked.

This is a presentation change only. It keeps the existing workspace layout state, per-repository persistence, responsive hiding behavior, and call sites.

## Goals

- Replace the two-button segmented workspace layout control with one icon button.
- Show the icon for the current layout:
  - `left-right` uses `PanelLeft`
  - `top-bottom` uses `PanelTop`
- Toggle to the other layout on click.
- Keep the existing `WorkspaceLayoutControl` `value` and `onChange` props so current callers remain unchanged.
- Keep the control hidden in compact mode through the existing connected wrappers.

## Non-Goals

- Do not change the workspace layout state model.
- Do not add a menu, popover, or third layout option.
- Do not change keyboard shortcuts or menu commands.
- Do not redesign repo toolbar or topbar placement.

## Behavior

`WorkspaceLayoutControl` renders one outline icon button. The visible icon represents the current layout. Clicking the button computes the next layout and calls `onChange(nextLayout)`.

The toggle mapping is:

- current `left-right` -> next `top-bottom`
- current `top-bottom` -> next `left-right`

The accessible label and tooltip should describe the action, not only the current state. For example, when the current layout is `left-right`, the label should use the existing top-bottom tooltip because the button will switch to top-bottom.

## Component Design

Keep `WorkspaceLayoutControl` as the shared component used by:

- `src/web/components/repo-toolbar/RepoToolbar.tsx`
- `src/web/components/topbar/TopbarRepoControls.tsx`

Internally it should:

- derive `nextLayout` from `value`
- select the current layout icon from the existing icon map
- render a single `Button` wrapped in `Tip`
- call `onChange(nextLayout)` on click

This keeps responsibilities narrow: connected wrappers decide when to show the control, while `WorkspaceLayoutControl` only renders and toggles layout.

## Testing

Update existing toolbar tests to verify:

- only one workspace layout button is rendered
- clicking the button toggles from the current layout to the other layout
- compact mode still hides the layout control
- non-Git and Git workspace call sites keep rendering the control where they do today

The tests should not depend on visual styling classes beyond accessible labels and rendered button count.

## Implementation Notes

- Keep repo-alias imports with explicit `.ts`/`.tsx` extensions.
- Use the existing Lucide icons.
- Remove `ToggleGroup` usage from this control if it is no longer needed.
- Do not add a new component unless the existing `WorkspaceLayoutControl` becomes harder to read.
