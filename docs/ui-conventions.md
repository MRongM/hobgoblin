# UI and Copy

Use this doc for UI language and presentation rules.

- Use Title Case for native menu items.
- Use sentence case for buttons, actions, headings, and help text.
- Use lowercase for status chips such as `open`, `dirty`, and `no upstream`.
- Preserve official casing such as `GitHub`, `VS Code`, and `PR`.
- Preserve raw git and status data such as `M`, `A`, `??`, branch names, and paths.
- Prefer shadcn/ui primitives in `src/web/components/ui/`.
- Reuse shared field primitives for forms.
- Show home-relative paths with `~` via existing `tildify` helpers.

## Branch workspace scope navigation

- Treat a branch workspace and its member worktrees as one parent scope. Selecting a member must keep the branch workspace active.
- Give parent selection, member expansion, drag reordering, and the More menu separate interaction targets. The Chevron explicitly changes expansion without selection; double-clicking the parent item selects its root context through the normal click sequence and toggles member expansion.
- Show exactly one selected row. When a member is selected, use a subtle parent scope marker instead of a second selected state.
- Place actions that affect every member or change membership in the branch workspace item's More menu, keep them grouped together, and label their parent-scope impact explicitly. Adding or removing members opens a branch workspace dialog; do not put removal on an individual member row.
- Reuse the ordinary repository worktree explorer and detail surfaces for a selected member worktree.
- Reuse the ordinary worktree action model for member worktree items, but omit drag, checkout, worktree creation or refresh, and individual worktree or branch removal. Keep unavailable member actions visible and disabled.
- In Chinese UI copy, use “子工作区” and “成员工作树”; avoid “子仓库”. In English copy, use “branch workspace” and “member worktree”.

## Responsive workspace presentation

- Desktop workspaces use the fixed left/right split. Do not add a user-selectable top/bottom workspace layout.
- Desktop Focus always means explicitly maximizing an internal terminal. It hides navigation/file surfaces and must exit when a non-terminal detail tab is selected.
- Keep project, workspace/repository, branch, branch-workspace, and terminal switching reachable from the desktop Focus topbar. Selecting another destination or deleting the active branch workspace restores the split because Focus is local to the current destination.
- Keep all Desktop Focus state component-local and temporary. Never restore it from session state; project/context navigation, responsive-mode changes, and relaunch all return to the left/right split.
- Compact workspaces render one focus surface at a time: detail, scope, or files. Do not mount a resizable split for compact workspace composition.
- Keep compact surface selection in component-local state. Responsive changes must not persist either compact selection or Desktop Focus; returning to desktop starts in the left/right split.
- Preserve terminal-first entry when an internal terminal target exists; otherwise fall back to the nearest navigable scope surface.
- In a branch workspace, compact member navigation must keep the branch workspace active and reuse the ordinary member file and detail surfaces.

## Detached file area windows

- Keep the source file area tab in place when it is dragged into a detached file area window; detaching creates a live copy rather than moving navigation state.
- Bind the detached window to the repository and branch or worktree context captured when the drag starts. Main-window navigation must not silently retarget it.
- Use the compact context topbar to identify the repository, branch or worktree, current file area panel, and live state. Do not repeat the full file area tab bar inside a one-panel window.
- Keep detached window bounds, internal panel navigation, and open/closed state local and ephemeral. Do not persist or restore them.
- Offer the same drag-out and `Shift+Enter` interaction in Electron and Web. In Web, open a same-origin browser window and show an actionable failure toast when the browser blocks it.
- Never place repository paths or branch names in a detached browser window URL; transfer them through a short-lived, consume-once same-origin handoff.
- Do not call this presentation Focus. Desktop Focus continues to mean maximizing an internal terminal inside the main window.
