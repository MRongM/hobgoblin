# Mobile Branch Workspace Terminal Dropdown

## Goal

Make the branch workspace root terminal use the same compact terminal-session switcher as a Git repository on Mobile Web. At the compact breakpoint, the selected terminal becomes a dropdown trigger instead of rendering every terminal session in a horizontal row.

## Scope

- Change only the branch workspace root terminal panel.
- Use the existing compact breakpoint exposed by `useIsCompactUi`.
- Keep desktop terminal tabs horizontal.
- Keep branch workspace member worktrees unchanged because they already reuse the ordinary Git repository terminal surface.
- Preserve terminal creation, selection, close, reorder, focus, and session ownership behavior.

## Considered Approaches

### 1. Pass the existing compact state to `TerminalTabs` from the branch workspace terminal panel

Read `useIsCompactUi` in `BranchWorkspaceTerminalPanel` and pass its value through `responsiveCompact`. This matches `BranchDetailToolbar` and `PlainWorkspaceTerminalPanel` directly and changes only the missing caller.

This is the selected approach because it is the smallest parity fix and keeps responsive presentation local to the renderer component that composes the terminal toolbar.

### 2. Pass compact state down from `BranchWorkspacePane`

Add a prop to `BranchWorkspaceTerminalPanel` and forward the parent component's compact state. This would work but duplicates an existing responsive source across component boundaries without adding policy or testability.

### 3. Make `TerminalTabs` detect compact mode itself

Move breakpoint detection into the shared terminal-tabs component. This would silently change every caller and remove the current explicit choice between horizontal and collapsed presentation, making the change broader than requested.

## Design

`BranchWorkspaceTerminalPanel` will read the existing renderer-local compact UI state and pass it to `TerminalTabs.responsiveCompact`. `TerminalTabs` already owns the dropdown rendering and all terminal-session actions, so no new UI primitive, state, translation, server route, or terminal-session behavior is required.

The responsive value is presentation-only local state. It is not persisted or synchronized, consistent with the responsive workspace and state-ownership guidance.

## Error Handling

No new failure path is introduced. Existing terminal selection, creation, and close handlers remain unchanged and continue to use the shared terminal-session context.

## Testing

- Add a focused component regression test that supplies compact UI state and verifies `BranchWorkspaceTerminalPanel` enables `TerminalTabs.responsiveCompact`.
- Run that test once before implementation and confirm it fails for the missing behavior.
- Implement the minimal prop wiring and confirm the focused test passes.
- Run the complete typecheck, test suite, and architecture-boundary check.

## Success Criteria

- Mobile Web shows one selected branch workspace root terminal as a dropdown trigger, with other sessions in the dropdown.
- The terminal sessions are not rendered as a horizontal tab row at the compact breakpoint.
- Desktop behavior and branch workspace member terminal behavior remain unchanged.
