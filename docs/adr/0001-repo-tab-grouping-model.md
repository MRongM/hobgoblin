# ADR 0001: Repo Tab Grouping Model

**Status**: Accepted  
**Date**: 2026-07-14  
**Context**: User request to add Chrome-style tab grouping to topbar repo tabs

## Decision

Repo tabs in the topbar support manual grouping with the following model:

### Data Structure

- **Flat order + metadata mapping**: `order: string[]` remains the single source of truth for tab positions. Two new fields track grouping:
  - `repoGroups: Record<groupId, GroupMeta>` — group metadata (id, name, color, collapsed state)
  - `groupOf: Record<repoId, groupId>` — maps each repo to its group
- **Implicit group order**: A group's position in the tabstrip is determined by the first occurrence of its member repos in `order`. Groups have no separate `groupOrder` array.
- **Contiguity constraint**: Repos in the same group must be adjacent in `order`. This constraint is maintained by drag operations — dragging a repo out of sequence updates both its `order` position and its `groupOf` membership.

**Why**: Chrome's tab group implementation uses this same model (adjacent tabs sharing a group id). Alternatives like nested order arrays or tree structures would duplicate positional state, requiring complex synchronization logic when users reorder tabs. The flat + metadata approach is DRY and keeps drag-drop simple.

### Persistence

Group data persists in `SessionState` (same layer as `order` / `openRepos`), classified as **Restorable** state:
- Survives app restarts
- Does not sync across windows
- Stored alongside workspace layout and active repo

**Why**: Groups define the structure of the workspace tab strip, just like `order` does. Splitting them into different persistence layers (e.g., `order` in SessionState but groups in localStorage) would risk inconsistent restore (order loads but groups don't). SessionState is the correct layer for Restorable workspace structure.

### User Model

- **Manual grouping only**: Users explicitly create groups via repo tab right-click menu, then drag repos into groups. No auto-grouping by remote host / organization / directory.
- **Chrome parity**: Group interactions mirror Chrome's tab groups — click chip to collapse/expand, double-click to rename, drag chip to move entire group, right-click for actions (rename, change color, ungroup, close all).
- **Empty groups auto-delete**: When the last repo leaves a group (dragged out or closed), the group is immediately deleted. No "empty group placeholder" state.

**Why**: Chrome's manual model is the reference point the user specified. Auto-grouping would introduce complex rules (group by what attribute? how to handle conflicts?) that weren't requested. Manual groups are simple, predictable, and align with existing user-driven interactions (reorder, close). Empty group deletion matches Chrome and avoids orphaned metadata.

### Small Screen Handling

On small screens (compact mode), grouping is ignored — the dropdown menu shows a flat list of all repos. Group collapse/expand state is preserved but not rendered until the user returns to a larger screen.

**Why**: Small screen mode already has a space-saving mechanism (show only active tab + dropdown). Introducing group structure into the dropdown (nested items, expand/collapse) would complicate the menu for a use case (many open repos on mobile-sized screen) that is uncommon. YAGNI — keep small screen simple, let grouping shine on desktop.

## Consequences

- Drag-drop code must enforce contiguity: dragging a repo between two members of a different group either inserts it into that group or evicts it from its current group.
- Group chip rendering logic derives group boundaries by scanning `order` for runs of repos with the same `groupOf` value.
- Deleting a repo or closing it triggers a check: if the repo was the last member of its group, remove the group from `repoGroups`.
- SessionState schema must be updated to include `repoGroups?: Record<string, GroupMeta>` and `groupOf?: Record<string, string>`.
