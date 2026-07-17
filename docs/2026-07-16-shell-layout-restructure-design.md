# Shell layout restructure — design spec

Date: 2026-07-16
Branch: design
Revised: same day, after mockup feedback (full-height sidebar shell).

## Brief

Match the provided mockup: a full-height left sidebar that owns the window's
top-left corner (macOS traffic lights sit inside it), a right pane whose
terminal tab strip forms the window's top edge, no full-width topbar — while
keeping a project list and a bottom status bar.

## Target shell (desktop / left-right)

```
┌────────────────────┬─────────────────────────────────┐
│ ⚫🟡🟢               │ [zsh ×][+]           [QR][max]  │ ← detail toolbar = right pane top
│ 📁 HOBGOBLIN ▾ + ⧉ │─────────────────────────────────│
│  (▾ = flat list)   │                                 │
│────────────────────│                                 │
│ 分支                │       Terminal / detail         │
│  main 默认          │      (full window height)       │
│  design            │                                 │
│────────────────────│                                 │
│ files/changes      │                                 │
│────────────────────│                                 │
│ [⚙][🎨]    branch  │ ← status bar inside the sidebar │
└────────────────────┴─────────────────────────────────┘
```

The split is pure left-right: the terminal column owns the window's full
height (no bar above or below it). ⧉ is the sidebar collapse control — it
maximizes the terminal via the existing detail focus mode; focus mode
mirrors a PanelLeftOpen control at the toolbar's left edge to restore the
sidebar. Clicking the project name toggles a flat inline project list
(styled like the branch rows) instead of a dropdown.

## Decisions

- **No global topbar on desktop while a repo is open.** The sidebar's project
  header and the detail toolbar together form the window's top edge. The
  `Topbar` component survives for two cases: compact UI (classic RepoTabs
  strip) and the desktop empty state (plain drag-region strip + wordmark).
- **Sidebar project header = window chrome + project switcher.** A
  `.topbar`-classed row (drag region; its padding rules already clear the
  macOS traffic lights) showing the current repository name. Its dropdown is
  the project list: every open project (activate on click, hover-reveal close)
  plus the Open local / Open remote / Clone entries.
- **Terminal tabs live in the detail toolbar** (`BranchDetailToolbar`), which
  in the left-right layout is visually the right pane's top bar — exactly the
  mockup. In focus mode the sidebar is gone, so the toolbar takes the `topbar`
  class and becomes the drag region; the focus-mode branch switcher
  (`TopbarRepoControls`) renders in its right-hand cluster.
- **Status bar** (28 px) reuses the `topbar` token family so the window is
  framed by one chrome band top and bottom. Left: settings + project theme.
  Right: activity (plain workspaces) + repository · branch.
- **Branch section eyebrow** ("分支" / tab.branches) above the branch rows,
  styled like the existing detached-worktrees list label.
- **Web and Electron render the identical shell.** The layout is decided only
  by viewport (default vs compact), never by runtime kind — the old web-only
  focus-mode special cases (hidden status bar, hidden compact topbar) were
  unified. The only runtime differences left are native window chrome: the
  `.topbar` CSS pads past macOS traffic lights / Windows overlay controls on
  Electron, while the browser supplies its own chrome on web.
- **Compact (mobile) unchanged**: RepoTabs topbar (hidden in focus mode on
  both runtimes), terminal tabs in the detail toolbar, no status bar, no
  sidebar header.
- **Empty state keeps real Open actions** (local / remote / clone); `empty.body`
  no longer references the removed tab strip (updated in all four dictionaries).
- **i18n reuse over new keys**: `repo-tabs.*`, `topbar.open`, `topbar.settings`,
  `tab.branches`, `repo-unavailable.title` all keep their meaning. No new keys.

## Component map

| Piece                   | File                                                         | Change                                           |
| ----------------------- | ------------------------------------------------------------ | ------------------------------------------------ |
| Status bar              | `src/web/components/StatusBar.tsx`                           | new                                              |
| Sidebar project header  | `src/web/components/repo-workspace/SidebarProjectHeader.tsx` | new (project list dropdown + drag region)        |
| Overlay actions context | `src/web/shell-overlay-actions.tsx`                          | new                                              |
| Topbar                  | `src/web/components/Topbar.tsx`                              | compact + empty-state only; no settings button   |
| Topbar repo controls    | `src/web/components/topbar/TopbarRepoControls.tsx`           | focus/non-git only; rendered from detail toolbar |
| Detail toolbar          | `src/web/components/branch-detail/BranchDetailToolbar.tsx`   | hosts terminal tabs; drag region in focus mode   |
| Sidebar                 | `src/web/components/repo-workspace/RepoExplorerPane.tsx`     | project header on top, branch eyebrow above rows |
| Shell                   | `src/web/App.tsx`                                            | wire all of the above                            |
