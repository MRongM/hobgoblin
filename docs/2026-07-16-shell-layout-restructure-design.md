# Shell layout restructure — design spec

Date: 2026-07-16
Branch: design

## Brief

1. Desktop web layout uses the left-right workspace split.
2. Add a bottom status bar.
3. Move the topbar project list into a new project-list section above the
   branch area in the sidebar; move theme + settings into the bottom-left
   of the status bar.
4. Move the terminal tabs from the detail toolbar directly into the topbar.

## Target shell (desktop / left-right)

```
┌──────────────────────────────────────────────────────────┐
│ TOPBAR   Hobgoblin  [term-tab][term-tab][+]    [actions] │  drag region, 40px
├──────────────┬───────────────────────────────────────────┤
│ REPOSITORIES │                                           │
│  ● hobgoblin │                                           │
│    website   │            Detail pane                    │
│  [+ Open ▾]  │        (terminal / status)                │
│──────────────│                                           │
│ BRANCHES     │                                           │
│  main        │                                           │
│──────────────│                                           │
│ files/changes│                                           │
├──────────────┴───────────────────────────────────────────┤
│ [⚙][🎨 theme]                   repo · branch            │  28px status bar
└──────────────────────────────────────────────────────────┘
```

## Decisions

- **Chrome band symmetry.** The status bar reuses the `topbar` theme-token
  family (`bg-topbar`, `border-topbar-border`, `text-topbar-*`) so the window
  reads as one framed surface top and bottom. No new theme-contract variables:
  every theme CSS file keeps passing the contract tests unchanged.
- **Project list = sidebar section, not a second tab strip.** A slim vertical
  list with an uppercase eyebrow header ("Repositories"), active-row highlight
  via the existing `bg-selected` token, hover-reveal close buttons, and a `+`
  dropdown carrying the previous Open local / Open remote / Clone actions.
- **Terminal tabs in the topbar** only on desktop. The wiring
  (create/select/close/reorder against the terminal session context) is
  extracted from `BranchDetailToolbar` into `TopbarTerminalTabs`.
- **Compact (mobile) mode is unchanged**: repo tabs stay in the topbar,
  terminal tabs stay in the detail toolbar, no status bar. The web focus mode
  (topbar hidden) also keeps terminal tabs in the detail toolbar so sessions
  stay reachable.
- **Empty state gains real Open actions** (local / remote / clone) because the
  topbar strip — the previous home of "Open" — no longer exists on desktop.
  `empty.body` copy is updated in all four dictionaries.
- **i18n reuse over new keys**: `repo-tabs.repos`, `repo-tabs.open-*`,
  `topbar.open`, `topbar.settings`, `repo-tabs.close-named` all keep their
  meaning in the new placements. No new dictionary keys.

## Component map

| Piece                   | File                                                       | Change                                    |
| ----------------------- | ---------------------------------------------------------- | ----------------------------------------- |
| Status bar              | `src/web/components/StatusBar.tsx`                         | new                                       |
| Project list section    | `src/web/components/repo-workspace/ProjectListSection.tsx` | new                                       |
| Topbar terminal tabs    | `src/web/components/topbar/TopbarTerminalTabs.tsx`         | new                                       |
| Overlay actions context | `src/web/shell-overlay-actions.tsx`                        | new                                       |
| Topbar                  | `src/web/components/Topbar.tsx`                            | drop settings button                      |
| Topbar repo controls    | `src/web/components/topbar/TopbarRepoControls.tsx`         | drop theme menu                           |
| Detail toolbar          | `src/web/components/branch-detail/BranchDetailToolbar.tsx` | terminal tabs only in compact / web-focus |
| Sidebar                 | `src/web/components/repo-workspace/RepoExplorerPane.tsx`   | project list above branch area            |
| Shell                   | `src/web/App.tsx`                                          | wire all of the above                     |
