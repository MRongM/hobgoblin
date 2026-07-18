# Project List Memory and Plain Workspace Browser Access Design

Date: 2026-07-18  
Status: approved for autonomous implementation

## Goal

- Remember whether the sidebar project list is expanded as one global preference shared by every project.
- Restore that preference after relaunch.
- Make the existing “Open this workspace in the browser” action available for plain workspaces as well as Git workspaces.

## Scope

In scope:

- Persist one global `projectListExpanded` boolean in the existing restorable session state.
- Restore the value during the boot-only session hydration path.
- Read and update the value through the repos store from `SidebarProjectHeader`.
- Resolve terminal browser-link targets for plain local and remote workspaces with their existing workspace path and synthetic terminal branch.
- Cover persistence, restoration, component behavior, and plain-workspace browser URLs with tests.

Out of scope:

- Per-project project-list expansion preferences.
- Runtime synchronization of this preference between multiple browser clients.
- A new browser-opening API or route.
- Changes to Git remote browser actions.
- Git commits or pushes.

## State Model

`projectListExpanded` is restorable state: it survives relaunch but does not require live cross-client convergence. It belongs in `SessionState` beside the existing global workspace chrome preferences.

The value defaults to `false`. All projects read the same store field, so switching the active project does not reset it. Session persistence writes it through the existing renderer-to-server settings path, and boot hydration restores it before normal session persistence begins.

## Browser Access Model

`TerminalStatusActions` already owns browser and LAN deep links for the active terminal target. Its target selector currently requires a Git branch with a worktree, which makes the component return `null` for plain workspaces.

Extend that selector with the existing plain-workspace capability model:

- Git workspace: selected/current branch plus its worktree path.
- Plain workspace: `repoPlainWorkspacePath(repo)` plus `NON_GIT_WORKSPACE_TERMINAL_BRANCH`.

Both paths then use the same terminal key, selected-session lookup, deep-link builder, browser opener, and QR dialog. No server or native-shell change is required.

## Alternatives Considered

### Dedicated persisted localStorage store

This is mechanically small, but it creates a second persistence path for workspace chrome and bypasses the documented `SessionState` boundary. Rejected.

### Runtime-coherent server setting

This would synchronize expansion changes across active clients, but the project state model explicitly treats relaunch-only UI preferences as restorable. Rejected as unnecessary complexity.

### Plain-workspace-only browser button

Adding a second button in `PlainWorkspacePane` would duplicate URL construction and drift from the shared status-bar action. Rejected.

## Error Handling

- Missing or invalid persisted `projectListExpanded` values normalize to `false`.
- If a workspace or target path cannot be resolved, terminal status actions remain hidden as they do today.
- If LAN information is unavailable, the browser button remains disabled through the existing behavior.
- Browser-open failures continue through the existing `openExternalUrl` result path.

## Testing

- `defaultSessionState()` and server normalization default invalid/missing expansion state to `false` and preserve valid booleans.
- restorable workspace mapping serializes and restores `projectListExpanded`.
- app bootstrap applies the saved expansion state.
- session persistence saves changes to the expansion state.
- `SidebarProjectHeader` reads the global state and toggles the store action instead of component-local state.
- switching the rendered project preserves the expanded list.
- `StatusBar` exposes the browser action for a plain local workspace and opens a deep link using the workspace path and synthetic branch.
- existing Git workspace browser behavior remains unchanged.

## Principles

- KISS: extend the two existing ownership paths instead of adding stores or APIs.
- YAGNI: do not add live synchronization or per-project configuration.
- DRY: share one terminal target and URL construction path for Git and plain workspaces.
- SOLID: session persistence owns restorable state; capability selection owns workspace differences; UI components only render and dispatch actions.
