# File Area Default Height and Tab Restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. The user selected inline execution; do not dispatch subagents.

**Goal:** Set the new-project File area height default to 30% and preserve remembered File area tabs when the area is reopened, with the existing Status-then-Files fallback.

**Architecture:** Keep both policies at their existing canonical boundaries. The shared workspace-layout constant owns the default pane size, while `explorerTabForRepo` continues to own tab-memory and fallback resolution; expansion handlers only change visibility and must not overwrite the selected tab.

**Tech Stack:** TypeScript 6 in Node.js strip-only mode, React 19, Zustand, Vitest, Bun.

## Global Constraints

- Preserve valid persisted workspace defaults and project-specific File area sizes; do not add a migration.
- Preserve per-project/per-branch `explorerTabByBranch` memory and the existing Status-then-Files fallback.
- Explicit file reveal actions continue to select Files.
- Use repo-alias imports with explicit `.ts`/`.tsx` extensions.
- Do not add dependencies or unsupported TypeScript syntax.
- Do not modify unrelated dirty-worktree files.
- Do not run `git commit`; the project requires explicit user authorization for commits.

---

### Task 1: Change the canonical File area height default

**Files:**

- Modify: `src/shared/workspace-layout.test.ts`
- Modify: `src/server/modules/settings-source.test.ts`
- Modify: `src/shared/workspace-layout.ts`

**Interfaces:**

- Consumes: `DEFAULT_FILE_TREE_PANE_SIZES: WorkspaceDetailPaneSizes`
- Produces: the same constant and normalization API with `left-right` defaulting to `30`

- [x] **Step 1: Change the default-value assertions before production code**

In `src/shared/workspace-layout.test.ts`, replace the first test with:

```ts
test('defaults to left-right layout with the file area taking thirty percent', () => {
  expect(WORKSPACE_LAYOUTS).toEqual(['left-right'])
  expect(DEFAULT_WORKSPACE_LAYOUT).toBe('left-right')
  expect(DEFAULT_FILE_TREE_PANE_SIZES).toEqual({ 'left-right': 30 })
})
```

In `src/server/modules/settings-source.test.ts`, change the missing-size fallback assertion to:

```ts
expect(saved.fileTreePaneSizes).toEqual({ 'left-right': 30 })
```

- [x] **Step 2: Run the focused tests and verify RED**

Run:

```sh
bun run test src/shared/workspace-layout.test.ts src/server/modules/settings-source.test.ts
```

Expected: FAIL because the current canonical value and missing-session fallback are `66.7`, not `30`.

- [x] **Step 3: Make the minimal production change**

In `src/shared/workspace-layout.ts`, change only the canonical constant:

```ts
export const DEFAULT_FILE_TREE_PANE_SIZES: WorkspaceDetailPaneSizes = { 'left-right': 30 }
```

- [x] **Step 4: Run the focused tests and verify GREEN**

Run:

```sh
bun run test src/shared/workspace-layout.test.ts src/server/modules/settings-source.test.ts
```

Expected: PASS.

### Task 2: Restore remembered tabs when reopening the File area

**Files:**

- Modify: `src/web/components/repo-workspace/RepoExplorerPane.test.tsx`
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.tsx`

**Interfaces:**

- Consumes: `explorerTabForRepo(repo): ExplorerTab`, `setExplorerTab(repoId, tab)`, and existing File area visibility callbacks
- Produces: unchanged component props; item expansion no longer mutates explorer-tab memory

- [x] **Step 1: Change the desktop reopening tests before production code**

Rename the collapsed-worktree test to `restores a remembered tab when a collapsed worktree File area is reopened` and change its final tab assertion to:

```ts
expect(explorerTabForRepo(useReposStore.getState().repos[REPO_ID]!)).toBe('changes')
```

Replace the collapsed-project test setup with a selected worktree that has no remembered tab:

```ts
seedRepoState({
  id: REPO_ID,
  branches: [createRepoBranch('main', { worktree: { path: REPO_ID } })],
  currentBranch: 'main',
  selectedBranch: 'main',
})
```

Rename that test to `keeps the Status fallback when a collapsed project File area has no remembered tab`, remove its `setExplorerTab(..., 'changes')` call, and assert `status` after double-click:

```ts
expect(explorerTabForRepo(useReposStore.getState().repos[REPO_ID]!)).toBe('status')
```

The existing `switches the local explorer area between file, changes, and status tabs` test continues to cover the Files fallback for a branch without a worktree.

- [x] **Step 2: Add a compact-navigation regression test before production code**

Add this focused test beside the desktop reopening tests:

```tsx
test('restores a remembered tab when compact worktree navigation opens the File area', async () => {
  compactUi = true
  const onShowCompactFiles = vi.fn()
  useReposStore.getState().setExplorerTab(REPO_ID, 'changes')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(
      <RepoExplorerPane
        repoId={REPO_ID}
        layout="left-right"
        showActions
        compactSurface="scope"
        onShowCompactFiles={onShowCompactFiles}
      />,
    )
  })
  await act(async () => {
    container
      .querySelector<HTMLButtonElement>('[data-testid="mock-double-click-worktree"]')
      ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 }))
  })

  expect(explorerTabForRepo(useReposStore.getState().repos[REPO_ID]!)).toBe('changes')
  expect(onShowCompactFiles).toHaveBeenCalledTimes(1)
  await act(async () => root.unmount())
})
```

- [x] **Step 3: Run the component test and verify RED**

Run:

```sh
bun run test src/web/components/repo-workspace/RepoExplorerPane.test.tsx
```

Expected: FAIL in the new/updated reopening tests because `handleWorktreeDoubleClick` currently writes `files` before opening.

- [x] **Step 4: Remove the conflicting tab override**

Change `handleWorktreeDoubleClick` in `src/web/components/repo-workspace/RepoExplorerPane.tsx` to:

```ts
const handleWorktreeDoubleClick = useCallback(() => {
  if (compact) {
    onShowCompactFiles?.()
    return
  }
  onToggleFileArea?.()
}, [compact, onShowCompactFiles, onToggleFileArea])
```

Do not change `handleTabChange`, `RepoWorktreeExplorer` reveal handling, or external reveal effects; those are explicit file-navigation paths.

- [x] **Step 5: Run the component test and verify GREEN**

Run:

```sh
bun run test src/web/components/repo-workspace/RepoExplorerPane.test.tsx
```

Expected: PASS, including remembered-tab, Status fallback, Files fallback, close-preserves-tab, and file-reveal coverage.

### Task 3: Final verification

**Files:**

- Verify only; no planned production edits

**Interfaces:**

- Consumes: all Task 1 and Task 2 changes
- Produces: verification evidence for behavior, typing, tests, and architecture boundaries

- [x] **Step 1: Run all directly related tests together**

```sh
bun run test src/shared/workspace-layout.test.ts src/server/modules/settings-source.test.ts src/web/components/repo-workspace/RepoExplorerPane.test.tsx
```

Expected: PASS.

- [x] **Step 2: Run static verification**

```sh
bun run typecheck
bun run check:architecture
```

Expected: both commands exit successfully.

- [x] **Step 3: Run the full test suite**

```sh
bun run test
```

Expected: PASS with no new warnings or failures.

- [x] **Step 4: Review the final diff**

Run read-only checks:

```sh
git diff --check
git diff -- src/shared/workspace-layout.ts src/shared/workspace-layout.test.ts src/server/modules/settings-source.test.ts src/web/components/repo-workspace/RepoExplorerPane.tsx src/web/components/repo-workspace/RepoExplorerPane.test.tsx docs/superpowers/specs/2026-08-11-file-area-default-height-and-tab-restore-design.md docs/superpowers/plans/2026-08-11-file-area-default-height-and-tab-restore.md
```

Expected: no whitespace errors; the diff contains only the approved design, plan, default-value change, tab-expansion change, and their tests.
