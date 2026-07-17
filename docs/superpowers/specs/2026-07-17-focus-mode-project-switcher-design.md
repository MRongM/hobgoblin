# Focus-mode project switcher (design)

Date: 2026-07-17
Status: approved (user adopted the recommended approach; execution authorized)

## Problem

Entering detail focus mode (the sidebar "maximize" button, `PanelLeftClose`)
hides the whole sidebar — including the project switcher in
`SidebarProjectHeader`. The only way to switch projects is to exit focus mode
first. The user wants project switching to stay available after collapsing
the sidebar, as a single-select dropdown list.

## Design

### Placement & trigger

In `BranchDetailToolbar`, inside the existing `isWindowChrome` (focus mode)
block, immediately to the right of the exit-focus button (`PanelLeftOpen`),
render a new `FocusProjectSwitcher`:

- Trigger: ghost `Button` — `FolderGit2` icon + current project name
  (truncated) + `ChevronDown`, visually consistent with the sidebar header's
  project button.
- Renders only in focus mode; no layout change anywhere else.
- Compact UI keeps its own repo tab strip, so this stays desktop-only
  (focus mode chrome is desktop-only already).

### Dropdown content

Standard `DropdownMenu`, one item per open project (store order):

- Row: `FolderGit2` icon + project name + terminal status
  (count badge / bell dot, reusing `ProjectTerminalStatus`), with the
  project location (`path` or `host:path`) as a second line in mono type —
  same information as the sidebar's expanded list.
- Current project is highlighted and skipped on select; selecting another
  item calls `navigation.activateRepo(id)`; focus mode is preserved.
- Unavailable projects render at reduced opacity but stay selectable.
- No close buttons — this is a pure switcher; project management stays in
  the sidebar.

### Code organization

Extract from `SidebarProjectHeader.tsx` into a shared module
`src/web/components/repo-workspace/project-switcher-model.tsx`:

- `projectLocation(repoId)`
- `ProjectSummary` + `projectSummariesEqual`
- `useProjectSummaries()` (the zustand selector over `s.order`/`s.repos`)
- `ProjectTerminalStatus`

`SidebarProjectHeader` keeps its current behavior and imports from the
shared module. New component `FocusProjectSwitcher` (own file under
`repo-workspace/`) composes the same pieces into a dropdown.

### Testing

Component tests for `FocusProjectSwitcher`: renders the current project
name, lists all open projects, selecting one activates it, current project
marked. Toolbar-level check that the switcher appears only in focus mode.

## Out of scope

- Changing the sidebar header's inline expanding list.
- Close/open/clone actions in the dropdown.
