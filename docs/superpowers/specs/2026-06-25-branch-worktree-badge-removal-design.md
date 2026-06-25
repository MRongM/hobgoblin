# Branch Worktree Badge Removal Design

**Date:** 2026-06-25  
**Status:** Approved design; implementation not started

## Overview

The branch list currently marks linked worktree rows with both a folder-tree icon and a neutral `branches.worktree` badge. The badge duplicates the row icon and the secondary worktree directory line, making the branch area visually heavier without adding new state.

Remove only the neutral worktree badge from branch rows. Keep status badges and terminal indicators that carry actionable state.

## Goals

- Remove the neutral `branches.worktree` badge from linked worktree branch rows.
- Keep the folder-tree icon for worktree identification.
- Keep the secondary worktree directory line.
- Keep the dirty worktree badge.
- Keep terminal count and unread terminal indicators.
- Keep detached worktree rows unchanged.

## Non-Goals

- Do not change worktree ordering, filtering, or drag behavior.
- Do not change branch selection, branch action menus, or double-click behavior.
- Do not change detached worktree presentation.
- Do not remove status badges such as `branches.dirty`, `branches.default`, `branches.gone`, ahead, or behind.
- Do not change terminal session state or terminal badges.

## Current Context

`BranchList` renders branch rows through `BranchRow`, and each row delegates its summary content to `BranchSummaryInline`.

`BranchSummaryInline` currently shows worktree information in several places:

- folder-tree icon when `branch.worktree.path` exists
- terminal count badge when the worktree has open terminal sessions
- terminal unread marker when the worktree has a bell state
- neutral `branches.worktree` badge for non-current clean worktree branches
- attention `branches.dirty` badge for dirty worktrees
- second-line worktree directory text

The redundant element is the neutral `branches.worktree` badge. The dirty badge and terminal indicators are not redundant because they report dynamic state.

## Design

### Branch Row Summary

In `BranchSummaryInline`, remove the clean-worktree fallback branch that renders:

```tsx
<Badge variant="outline" className="gap-1 text-muted-foreground">
  <FolderTree size={10} />
  {t('branches.worktree')}
</Badge>
```

Keep the dirty worktree branch intact:

```tsx
{hasWorktree && worktreeDirty ? (
  <Badge variant="attention" className="gap-1">
    <FolderTree size={10} />
    {t('branches.dirty')}
  </Badge>
) : null}
```

The `isWorktree` local should be removed if it becomes unused.

### Row Title

Keep `branches.worktree` in the row `title` text for accessible hover context. This is not a visible badge and still helps users understand the row when only the title text is available.

### Detached Worktrees

Leave `DetachedWorktreeRow` unchanged. Detached rows are a separate list section and use their badge to communicate that the row is detached rather than a normal branch-linked worktree.

## Component Boundaries

### `BranchSummaryInline`

Owns visible branch summary badges. This is the only production component expected to change.

### `BranchRow`

Keeps row layout, click behavior, action menu placement, drag handle integration, and inline action panel behavior unchanged.

### `BranchList`

Keeps filtering, sorting, drag ordering, and detached worktree rendering unchanged.

## Error Handling And Edge Cases

- Clean linked worktree branch rows still show the folder-tree icon and directory line.
- Dirty linked worktree branch rows still show the `branches.dirty` attention badge.
- Current branch rows with a worktree still show the folder-tree icon and directory line, but no neutral worktree badge.
- Rows with terminal sessions still show the terminal count badge.
- Rows with terminal unread state still show the unread marker.
- Detached worktree rows still show their existing detached or dirty badge.

## Testing

Update focused component tests in `BranchRow.test.tsx`:

- Clean linked worktree rows should not render visible `branches.worktree` badge text.
- Clean linked worktree rows should still render the branch name and worktree directory line.
- Dirty worktree rows should still render `branches.dirty`.
- Linked worktree rows with open terminals should still render `terminal-count-badge`.

Run standard verification after implementation:

```text
bun run typecheck
bun run test
```

## Engineering Principles

- **KISS:** Remove the redundant visible element at its single render point.
- **YAGNI:** Do not add configuration or new visual states.
- **DRY:** Keep worktree identification represented by the existing icon and directory line instead of duplicating it with a badge.
- **SOLID:** Keep badge presentation inside `BranchSummaryInline`; do not change list state or row interaction responsibilities.
