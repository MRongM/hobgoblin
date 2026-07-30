# Project Item File Area Double-Click Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Project list items, multi-repository workspace Repository items, and the workspace main-directory (`./` / Overview) row toggle the current File area on double-click, with ordinary worktree behavior.

**Architecture:** Keep File area visibility in its existing local owner. Add optional intent callbacks to the two list components and workspace main-directory row, then forward the existing owning-pane double-click handlers through the Project header, plain workspace pane, and workspace Repository rail.

**Tech Stack:** React 19, TypeScript 6 strip-only mode, Vitest, Bun.

## Global Constraints

- Preserve the current single-click selection, drag, action-button, menu, and context-menu behavior.
- Reuse `RepoExplorerPane` and `BranchWorkspacePane` File area handlers; do not add shared, persisted, or server-owned state.
- Use repo-alias imports with explicit `.ts`/`.tsx` extensions and no unsupported TypeScript runtime syntax.
- Preserve all pre-existing user changes in the worktree.
- Do not create a Git commit or perform any network Git operation.

---

### Task 1: Emit double-click intent from both list item types

**Files:**

- Modify: `src/web/components/repo-workspace/SidebarProjectList.test.tsx`
- Modify: `src/web/components/repo-workspace/SidebarProjectList.tsx`
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryList.test.tsx`
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryList.tsx`

**Interfaces:**

- Produces: optional `onToggleFileArea: () => void` list prop, attached only to each main row's `onDoubleClick`.

- [x] **Step 1: Write failing row tests**

Add one test per list that dispatches a bubbling `dblclick` event on the main row and expects `onToggleFileArea` exactly once while preserving the existing activation assertion.

- [x] **Step 2: Verify RED**

Run:

```sh
bun run test src/web/components/repo-workspace/SidebarProjectList.test.tsx src/web/components/repo-workspace/WorkspaceRepositoryList.test.tsx
```

Expected: FAIL because neither list accepts or invokes `onToggleFileArea`.

- [x] **Step 3: Implement the minimal row callback**

Add the optional prop to each list, forward it into the sortable row, and attach it as:

```tsx
buttonProps={{
  onClick: () => onActivate(item.id),
  onDoubleClick: onToggleFileArea,
}}
```

- [x] **Step 4: Verify GREEN**

Run the Task 1 command again. Expected: both suites pass except any documented pre-existing unrelated failure.

### Task 2: Wire both item types to existing File area owners

**Files:**

- Modify: `src/web/components/repo-workspace/SidebarProjectHeader.tsx`
- Modify: `src/web/components/repo-workspace/PlainWorkspacePane.tsx`
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.tsx`
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.test.tsx`
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.tsx`
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspacePane.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspacePane.test.tsx`

**Interfaces:**

- Consumes: `onToggleFileArea: () => void` from Task 1.
- Produces: optional `onFileAreaItemDoubleClick: () => void` on header/plain-pane boundaries while retaining `WorkspaceRepositoryRail.onToggleFileArea` as its existing owner callback.

- [x] **Step 1: Write failing forwarding and integration tests**

Extend the mocked Project header and Repository list with a double-click trigger. Assert that a collapsed Project File area opens on Files, a workspace Repository item forwards the owner callback, and a Branch workspace Project item toggles its local File area.

- [x] **Step 2: Verify RED**

Run:

```sh
bun run test src/web/components/repo-workspace/RepoExplorerPane.test.tsx src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx src/web/components/repo-workspace/BranchWorkspacePane.test.tsx
```

Expected: FAIL because the new callback is not yet forwarded.

- [x] **Step 3: Implement the callback chain**

Pass the existing owning-pane handlers through the narrow component boundaries:

```tsx
<SidebarProjectHeader onFileAreaItemDoubleClick={handleWorktreeDoubleClick} />
<WorkspaceRepositoryRail onToggleFileArea={handleWorktreeDoubleClick} />
```

For plain and Branch workspace surfaces, forward the equivalent existing handler rather than duplicating collapse logic.

- [x] **Step 4: Verify GREEN**

Run the Task 2 command again. Expected: all three suites pass.

### Task 3: Regression verification

**Files:** No additional production files.

- [x] **Step 1: Run focused suites**

```sh
bun run test src/web/components/repo-workspace/SidebarProjectList.test.tsx src/web/components/repo-workspace/WorkspaceRepositoryList.test.tsx src/web/components/repo-workspace/RepoExplorerPane.test.tsx src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx src/web/components/repo-workspace/BranchWorkspacePane.test.tsx
```

- [x] **Step 2: Run project quality gates**

```sh
bun run typecheck
bun run test
bun run check:architecture
```

Expected: all commands exit successfully. If unrelated pre-existing worktree changes fail a gate, record the exact failing test and keep this feature's focused suites green.

### Task 4: Extend the interaction to the workspace main directory

**Files:**

- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.tsx`

- [x] **Step 1: Write and verify the failing main-directory test**

Dispatch `dblclick` on the rendered `./` row and expect the owning pane's `onToggleFileArea` callback exactly once. Verify RED because `ManifestRow` only handles single-click activation.

- [x] **Step 2: Forward the existing toggle intent**

Pass `WorkspaceRepositoryRail.onToggleFileArea` into `ManifestRow` and attach it to the row's `onDoubleClick`, without changing `onClick` or introducing state.

- [x] **Step 3: Verify the focused suite**

```sh
bun run test src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx
```

Expected: all 53 tests pass.
