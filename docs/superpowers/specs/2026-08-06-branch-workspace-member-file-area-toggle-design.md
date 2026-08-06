# Branch Workspace Member File Area Toggle

## Goal

Make a branch workspace member worktree behave like the other workspace scope rows: double-clicking its main row opens or collapses the file area without changing the branch workspace member-list expansion.

## Design

- Add an optional file-area toggle callback to `BranchWorkspaceMemberRow` and attach it only to the row's main button.
- Forward the owning pane's current desktop file-area collapsed state through `WorkspaceRepositoryRail` and `BranchWorkspaceList` to each member row.
- Snapshot that collapsed state on the first mouse-down in a double-click sequence. Member clicks continue opening the selected member immediately; the double-click handler then preserves that open result when the sequence started collapsed, or invokes the existing toggle callback when it started expanded.
- Keep the owning pane responsible for the actual presentation:
  - Desktop toggles the local collapsed state.
  - Compact UI opens the files surface, matching existing compact scope-row behavior.
- Keep ordinary click navigation unchanged. The native click sequence continues to select the member before the double-click toggle is handled.
- Keep editor, terminal, More-menu, and inline-panel controls isolated from row double-click propagation through the existing shared list-item behavior.
- Keep unavailable or busy member rows disabled; they do not gain a separate toggle path.

## State and Boundaries

No new render or persisted state is introduced. File-area visibility remains component-local presentation state in the owning pane; a member row uses only a transient ref to remember the interaction-start state across the native click sequence. No store, server, realtime, or persistence changes are needed.

## Verification

- A component test expands a branch workspace and dispatches the complete native mouse double-click sequence on a navigable member row.
- The test verifies collapsed-to-open and open-to-collapsed transitions while member-summary expansion remains unchanged.
- Owner and rail tests verify that the desktop collapsed state reaches the member list.
- Existing member selection, nested action, branch workspace root double-click, compact navigation, and pane toggle tests remain green.

## Non-goals

- Changing single-click member navigation.
- Changing branch workspace member-summary expansion behavior.
- Adding a separate file-area state for each member.
