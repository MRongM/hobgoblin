# Member Worktree Click Terminal Focus Design

## Goal

Make a branch workspace member worktree item follow the ordinary worktree main-item interaction:

- A single click selects the member worktree and focuses its selected internal terminal when the member changes.
- A double click follows the normal click sequence, then toggles the desktop file area; compact presentation opens the files surface.
- Re-clicking an already selected member does not force an additional terminal focus, matching ordinary worktree behavior.

## Current behavior

`BranchWorkspaceMemberRow` currently sends a single click through `onOpenRepositoryMember`, which selects the member and opens the file area. Its double-click handler records the file-area state at mouse-down and conditionally toggles the area to compensate for the first click opening files.

Ordinary worktrees instead select the branch on click. `TerminalSessionProvider` observes a selected worktree change, focuses that worktree's selected terminal, and restores the terminal detail tab when a terminal exists. Their double-click handler independently toggles the file area. A branch workspace member is different architecturally: the application's visible repository identity remains the parent workspace root, so that provider effect does not observe the member repository's selected branch.

## Chosen design

Reuse the ordinary worktree result while respecting the parent workspace identity model:

1. Rename the member activation callback to express terminal-focused selection.
2. In `WorkspaceRepositoryRail`, resolve the member target, detect whether that exact member is already selected, select its checked-out branch, select the terminal detail tab, keep the owning branch workspace active, and reveal the detail surface in compact presentation.
3. When the member changed, read that member worktree's existing terminal snapshot and call the terminal registry's existing focus command for its selected terminal when the selected session is neither closed nor failed. Do not create a terminal, select an arbitrary replacement, or refocus an already selected member.
4. Make the row double-click handler call the existing file-area toggle directly.
5. Remove `fileAreaCollapsed`, `onMouseDown`, and the interaction-start ref from the member row/list contract because the click no longer opens the file area.

This keeps terminal session ownership and DOM focus in the existing terminal registry, adds only the member-specific routing that the parent workspace identity requires, and removes member-only double-click compensation.

## Interaction flow

For a navigable member that is not selected:

1. The click resolves the exact member worktree and selects its checked-out branch.
2. The member's terminal detail tab becomes active.
3. The branch workspace remains the active parent scope and records the member selection.
4. The rail asks the terminal registry to focus the member worktree's selected viable terminal when one exists and the member selection changed.

A browser double click emits its ordinary click sequence first, so the member is selected through the same flow before the file area toggles. The Chevron remains the only member-summary expansion control. Action-dock and context-menu interactions retain their existing event isolation.

Unavailable or unresolved members remain disabled and perform neither navigation nor file-area changes.

## State and architecture

No new persisted, runtime-coherent, or server state is introduced. The change only adjusts renderer-local event routing while continuing to use the existing repo selection, branch workspace context, detail-tab, file-area, and terminal registry owners.

No new abstraction or ADR is needed. The interaction is local and reversible.

## Testing

- `BranchWorkspaceMemberRow.test.tsx`: single click invokes only terminal-focused member activation; double click invokes normal activation and toggles the file area from both collapsed and expanded starting states; unavailable members remain inert.
- `BranchWorkspaceList.test.tsx`: member callback and file-area toggle are forwarded without the obsolete collapsed-state prop.
- `WorkspaceRepositoryRail.test.tsx`: member activation selects the exact checked-out branch, selects the terminal detail tab, preserves the branch workspace parent scope, reveals the compact detail surface, focuses the selected viable member terminal, does not open the file area, and does not refocus an already selected member or a failed/closed terminal.
- Existing `TerminalSessionProvider.test.tsx` coverage remains the authority for ordinary worktree focus behavior; the rail test covers the branch-workspace identity exception.

Run focused tests first, then `bun run typecheck`, `bun run test`, and `bun run check:architecture`.

## Documentation

Update `CONTEXT.md` and `docs/ui-conventions.md` so the canonical member-worktree interaction describes terminal-focused single click and file-area double click. This changes an existing interaction rule but introduces no new domain term.
