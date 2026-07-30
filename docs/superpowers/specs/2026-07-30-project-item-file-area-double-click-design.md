# Project Item File Area Double-Click Design

## Goal

Allow both top-level Project list items and repository items inside a multi-repository workspace to toggle the current File area on double-click, matching the existing ordinary worktree item interaction.

## Interaction contract

- A single click keeps its existing responsibility: select the Project or workspace Repository.
- A double-click follows the normal click sequence and toggles the selected context's File area.
- On desktop, opening a collapsed repository File area selects the Files tab first; closing an expanded File area preserves its selected tab.
- In compact UI, the interaction opens the Files surface and does not mutate the desktop collapsed preference.
- Drag handles, action buttons, menus, and context menus retain their existing event isolation and do not toggle the File area.

## Architecture

File area visibility remains component-local presentation state owned by `RepoView` or `BranchWorkspacePane`. List components only emit an optional double-click intent; they do not read or persist File area state.

`RepoExplorerPane` reuses its existing worktree double-click handler for the top-level Project list and workspace Repository list. `BranchWorkspacePane` similarly reuses its branch-workspace-item handler. The callbacks flow through `SidebarProjectHeader`, `SidebarProjectList`, `PlainWorkspacePane`, `WorkspaceRepositoryRail`, and `WorkspaceRepositoryList` without introducing a Store action or server contract.

## Testing

- Component tests prove Project and workspace Repository main rows emit the callback exactly once.
- Integration tests prove the callback is forwarded through the Project header and workspace Repository rail.
- Existing worktree tests continue to define collapsed/expanded and compact behavior because all three item types share the same owning-pane handler.

## Domain and decision records

The existing glossary definitions of Project, Project list, Repository, and File area already cover the concepts used here. No new domain term or hard-to-reverse architectural decision is introduced, so neither `CONTEXT.md` nor an ADR changes.
