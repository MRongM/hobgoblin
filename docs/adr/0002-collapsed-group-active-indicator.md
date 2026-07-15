# ADR 0002: Collapsed Group Active Repo Indicator

**Status**: Accepted  
**Date**: 2026-07-14  
**Context**: When a repo group is collapsed, member tabs are hidden. If the currently active repo is inside a collapsed group, the user needs visual feedback.

## Decision

When a repo group is collapsed:
- All member repo tabs are hidden from the tabstrip
- Only the group chip (color dot + name + collapse icon) is visible
- **If the active repo is inside the collapsed group**: an additional colored dot appears on the group chip to indicate "active content is here"
- The main content area continues to show the active repo (branches, terminals, etc.) regardless of collapse state
- Clicking the chip expands the group, revealing all member tabs

**Why**: Chrome's behavior is different — when you collapse a group containing the active tab, Chrome automatically switches focus to a tab outside the group. But Hobgoblin's repos represent entire worktree contexts with attached terminals. Auto-switching the active repo would disrupt the user's work (terminals, branch selections, file trees all belong to the current repo context). 

Keeping the active repo stable and adding a visual indicator (dot on chip) is the minimal-surprise approach: the user's work context stays intact, and the chip clearly shows "your active work is in this collapsed group."

## Alternatives Considered

**Auto-expand group when active**: When the user activates a repo in a collapsed group, automatically expand that group.
- Rejected: Defeats the purpose of collapsing (saving space). If every activation expands, the user loses control over which groups stay collapsed.

**Auto-switch active repo on collapse**: When collapsing a group containing the active repo, automatically activate a repo outside the group.
- Rejected: Breaks the user's flow. Switching repos means switching terminal contexts, branch selections, file trees. Users expect collapse to be a pure visual operation, not a context switch.

**Forbid collapsing when active repo inside**: Gray out the collapse action if the active repo is a member.
- Rejected: High friction. Forces users to "switch away then collapse," which is cumbersome and doesn't align with "collapse is just a view toggle."

## Consequences

- Group chip rendering must check if any member repo matches `activeId` and render the indicator dot conditionally.
- The indicator dot should use a distinct color (e.g., `bg-accent`) to stand out from the group's color dot.
- Layout: `[group-color-dot] [group-name] [active-indicator-dot?] [collapse-icon]`.
