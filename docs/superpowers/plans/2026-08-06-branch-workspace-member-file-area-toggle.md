# Branch Workspace Member File Area Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users double-click a navigable branch workspace member worktree to open or collapse the owning pane's file area.

**Architecture:** Reuse the existing `BranchWorkspaceList.onToggleFileArea` presentation callback while forwarding the owning pane's collapsed state to member rows. A member row snapshots that state at the start of the native mouse sequence so immediate single-click opening does not erase the double-click intent; the owning pane continues to own desktop collapse state and compact files-surface navigation.

**Tech Stack:** React 19, TypeScript, Vitest, Tailwind CSS 4.

## Global Constraints

- Keep single-click member navigation unchanged.
- Keep member-list expansion controlled only by the branch workspace Chevron.
- Keep file-area visibility in the existing owning-pane local state.
- Do not introduce dependencies, persistence, server calls, or realtime state.
- Do not commit or push unless the user explicitly requests it.

---

### Task 1: Member Worktree Double-click Toggle

**Files:**

- Modify: `src/web/components/repo-workspace/BranchWorkspaceList.test.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspacePane.test.tsx`
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceMemberRow.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceList.tsx`
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspacePane.tsx`
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.tsx`
- Modify: `src/web/components/repo-workspace/PlainWorkspacePane.tsx`
- Modify: `CONTEXT.md`
- Modify: `docs/ui-conventions.md`

**Interfaces:**

- Consumes: `BranchWorkspaceListProps.onToggleFileArea?: (item: BranchWorkspaceSnapshot) => void`
- Produces: `BranchWorkspaceListProps.fileAreaCollapsed?: boolean`
- Produces: `BranchWorkspaceMemberRowProps.fileAreaCollapsed?: boolean` and `onToggleFileArea?: () => void`

- [x] **Step 1: Write the failing list interaction test**

Add a stateful test harness that renders one branch workspace with one navigable member and opens the file area from `onOpenRepositoryMember`. Expand the member list, dispatch the complete `mousedown`, `mouseup`, `click`, `mousedown`, `mouseup`, `click`, and `dblclick` sequence on `branch-workspace-member-api`, then assert both transitions:

```tsx
expect(container.querySelector('[data-testid="member-file-area-collapsed"]')?.textContent).toBe('false')
dispatchMouseDoubleClickSequence(memberButton)
expect(container.querySelector('[data-testid="member-file-area-collapsed"]')?.textContent).toBe('true')
expect(container.querySelector('[data-testid="branch-workspace-member-list"]')).not.toBeNull()
```

The render must pass:

```tsx
fileAreaCollapsed={fileAreaCollapsed}
getMemberPresentation={() => ({ dirty: false, changeCount: null, navigable: true })}
onOpenRepositoryMember={() => setFileAreaCollapsed(false)}
onToggleFileArea={() => setFileAreaCollapsed((collapsed) => !collapsed)}
```

- [x] **Step 2: Run the test and verify RED**

Run:

```bash
bun run test src/web/components/repo-workspace/BranchWorkspaceList.test.tsx
```

Expected: the first transition fails because the two native clicks open the file area before the simple double-click toggle closes it again.

- [x] **Step 3: Add the minimal member-row callback**

Forward `fileAreaCollapsed?: boolean` from each owning pane through `WorkspaceRepositoryRail` and `BranchWorkspaceList`. Extend `BranchWorkspaceMemberRowProps`:

```tsx
fileAreaCollapsed?: boolean
onToggleFileArea?: () => void
```

Snapshot `fileAreaCollapsed` on the first `mousedown`, then attach the resolved behavior only to the main row button:

```tsx
onMouseDown: (event) => {
  if (event.detail <= 1) fileAreaCollapsedAtInteractionStart.current = fileAreaCollapsed
},
onClick: () => onOpenRepositoryMember?.(item, member),
onDoubleClick: () => {
  const startedCollapsed = fileAreaCollapsedAtInteractionStart.current ?? fileAreaCollapsed
  fileAreaCollapsedAtInteractionStart.current = undefined
  if (startedCollapsed !== true) onToggleFileArea?.()
},
```

When rendering each member from `BranchWorkspaceList`, bind the existing parent callback:

```tsx
onToggleFileArea={onToggleFileArea ? () => onToggleFileArea(item) : undefined}
```

- [x] **Step 4: Run the focused tests and verify GREEN**

Run:

```bash
bun run test src/web/components/repo-workspace/BranchWorkspaceList.test.tsx src/web/components/repo-workspace/BranchWorkspaceMemberRow.test.tsx
```

Expected: both files pass, including existing row-action propagation tests.

- [x] **Step 5: Record the resolved interaction convention**

Update the existing `Branch workspace member summary` entry in `CONTEXT.md` and the branch-workspace scope-navigation section in `docs/ui-conventions.md` to state that double-clicking a member worktree toggles the desktop file area while compact UI opens the files surface, without changing member-summary expansion.

- [x] **Step 6: Run relevant regression and static checks**

Run:

```bash
bun run test src/web/components/repo-workspace/BranchWorkspaceList.test.tsx src/web/components/repo-workspace/BranchWorkspaceMemberRow.test.tsx src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx src/web/components/repo-workspace/BranchWorkspacePane.test.tsx
bun run check:architecture
```

Then run Prettier check on every modified implementation, test, and documentation file plus `git diff --check`. Expected: all scoped checks pass; any repository-wide failures must be reported separately and must not be repaired outside this feature.
