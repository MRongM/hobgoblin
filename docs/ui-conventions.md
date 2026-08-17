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

- Activating a top-level multi-repository workspace starts at its workspace overview rather than restoring a repository or branch-workspace member. A direct click on its project row or workspace-root row may instead reveal an aggregated root or branch-workspace terminal: prefer the workspace root's own terminal, then the previously selected branch workspace when it still has a viable root terminal, then the first viable branch workspace in sidebar order; never route this parent click to a repository-member worktree terminal. With no viable terminal target, the click keeps the ordinary overview behavior. Hiding the workspace repository list also returns to that overview and collapses the desktop file area; showing the list does not reopen files or restore the prior member context.
- On desktop, double-clicking an ordinary worktree main item toggles the file area. Opening the file area selects the Files tab; double-clicking again closes it.
- In existing context menus for Projects, workspace Repositories, ordinary worktrees, branch workspace roots, and member worktrees, keep **Open file area** as an idempotent action: select the exact row target first, then open Files. Keep the workspace Overview row's equivalent local context menu. Do not add the action to branches without worktrees, terminals, file-tree nodes, or toolbar More menus; keep it visible but disabled on unavailable targets.
- Treat a branch workspace and its member worktrees as one parent scope. Selecting a member must keep the branch workspace active.
- Single-clicking a navigable branch workspace member selects its terminal context and focuses its selected viable internal terminal when the member selection changes. Re-clicking the selected member does not refocus it, and a single click does not open the file area.
- Double-clicking a navigable branch workspace member worktree toggles the desktop file area without changing member-summary expansion; compact presentation opens the files surface.
- Give parent selection, member expansion, drag reordering, and the More menu separate interaction targets. The Chevron explicitly changes expansion without selection; double-clicking the parent item selects its root context through the normal click sequence and toggles the desktop file area without changing member expansion.
- Show exactly one selected row. When a member is selected, use a subtle parent scope marker instead of a second selected state.
- Place actions that affect every member or change membership in the branch workspace item's More menu, keep them grouped together, and label their parent-scope impact explicitly. Adding or removing members opens a branch workspace dialog; do not put removal on an individual member row.
- Reuse the ordinary repository worktree explorer and detail surfaces for a selected member worktree.
- A selected branch workspace item's parent file area exposes Status, Files, Changes, History, Local, and Remote in that order. Its tab bar stays fixed while panel content scrolls. Files browses the branch workspace root. Status, Changes, History, Local, and Remote share a panel-local member repository switcher and mount only the selected member's Git surface, preserving each repository as an independent Git boundary without changing workspace navigation. The Changes tab uses the ordinary worktree attention badge to show the summed exact change count of all resolvable members; while Changes is active, the switcher trigger and each non-zero member option use the same badge for that member's exact worktree count. Opening the parent file area selects Files, and its tab state never replaces a member repository's remembered file-area tab.
- Reuse the ordinary worktree action model for member worktree items. Keep repository-scoped worktree creation and refresh available, but omit drag, checkout, and individual worktree or branch removal. Keep unavailable member actions visible and disabled.
- In Chinese UI copy, use “子工作区” and “成员工作树”; avoid “子仓库”. In English copy, use “branch workspace” and “member worktree”.

## Responsive workspace presentation

- Desktop workspaces use the fixed left/right split. Do not add a user-selectable top/bottom workspace layout.
- Desktop Focus always means explicitly maximizing an internal terminal. It hides navigation/file surfaces until the user explicitly restores the split.
- Keep project, workspace/repository, branch, branch-workspace, and terminal switching reachable from the desktop Focus topbar. Switching to another eligible destination keeps Focus active and routes that destination to its terminal without first restoring the split.
- Keep Desktop Focus as one application-global, restorable preference. Preserve it across project/context navigation and relaunch; if a deleted or unavailable destination has no terminal target, keep the preference latent while rendering the nearest usable fallback.
- Compact workspaces render one focus surface at a time: detail, scope, or files. Do not mount a resizable split for compact workspace composition.
- Keep compact surface selection in component-local state. Responsive changes must not mutate the Desktop Focus preference; returning to an eligible desktop destination reapplies it.
- Preserve terminal-first entry when an internal terminal target exists; otherwise fall back to the nearest navigable scope surface.
- In a branch workspace, compact member navigation must keep the branch workspace active and reuse the ordinary member file and detail surfaces.
- In compact left-side scope lists, omit the inline editor shortcut, keep the internal-terminal shortcut directly clickable, and retain editor access in the item context menu.

## Detached file area windows

- Keep the source file area and its active tab in place when its toolbar is dragged into a detached file area window; detaching creates a live copy of the complete file area rather than moving navigation state. Individual tabs are not draggable.
- Bind the detached window to the active tab, repository, and branch or worktree context captured when the toolbar drag starts. Main-window navigation must not silently retarget it.
- Use the compact context topbar to identify the repository, branch or worktree, current file area panel, and live state. Render the complete native file area, including its tab bar, below that context topbar.
- Keep detached window bounds, internal panel navigation, and open/closed state local and ephemeral. Do not persist or restore them.
- Offer the same drag-out and `Shift+Enter` interaction in Electron and Web. In Web, open a same-origin browser window and show an actionable failure toast when the browser blocks it.
- Never place repository paths or branch names in a detached browser window URL; transfer them through a short-lived, consume-once same-origin handoff.
- Do not call this presentation Focus. Desktop Focus continues to mean maximizing an internal terminal inside the main window.
