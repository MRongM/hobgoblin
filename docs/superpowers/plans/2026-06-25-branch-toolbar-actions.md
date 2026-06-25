# Branch Toolbar Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move repo-level sync and create-worktree controls into the branch area toolbar, and reduce the visible branch filter choices to all/worktree branches.

**Architecture:** Reuse the existing `RepoToolbarActions` component as the single source for sync and create-worktree behavior. Change only placement and visible filter options; keep `no-worktree` in the store model for persisted-state compatibility.

**Tech Stack:** React 19, TypeScript strip-only mode, Zustand, Vitest/jsdom, lucide-react, existing shadcn-style UI primitives.

---

## Repository Constraints

- Do not create a git branch or git worktree for this task unless the user explicitly asks.
- Do not include git commit steps; the repository instructions say not to plan or execute git commits unless requested.
- Keep imports on repo aliases with explicit `.ts`/`.tsx` extensions.
- Do not use TypeScript enums, namespaces with runtime code, constructor parameter properties, or import aliases.

## File Structure

- Modify `src/web/components/topbar/TopbarRepoControls.tsx`
  - Responsibility: global topbar repo controls. Remove repo-level sync/create-worktree placement here.
- Modify `src/web/components/repo-toolbar/RepoToolbar.tsx`
  - Responsibility: repo body toolbar and layout control. Remove repo-level sync/create-worktree placement here.
- Modify `src/web/components/repo-workspace/RepoExplorerPane.tsx`
  - Responsibility: branch area and explorer pane layout. Add `RepoToolbarActions` to the branch area toolbar's right side.
- Modify `src/web/components/repo-toolbar/branch-view-mode-options.ts`
  - Responsibility: visible branch view mode options. Remove `no-worktree` from the rendered options list while preserving the wider `BranchViewMode` type.
- Modify `src/web/components/repo-toolbar/BranchViewModeControl.tsx`
  - Responsibility: rendering the branch view segmented control. Remove the unused `GitBranch` icon mapping after `no-worktree` is removed from the options list.
- Modify `src/web/components/repo-toolbar/RepoToolbar.test.tsx`
  - Responsibility: topbar and repo-toolbar placement regression coverage.
- Modify `src/web/components/repo-workspace/RepoExplorerPane.test.tsx`
  - Responsibility: branch toolbar placement and visible branch filter option coverage.

## Task 1: Update Topbar And Repo Toolbar Tests

**Files:**
- Modify: `src/web/components/repo-toolbar/RepoToolbar.test.tsx:79-113`
- Modify: `src/web/components/repo-toolbar/RepoToolbar.test.tsx:171-185`

- [ ] **Step 1: Change the active topbar repo test to expect no sync/create-worktree buttons**

Replace the test at `src/web/components/repo-toolbar/RepoToolbar.test.tsx:79` with:

```tsx
  test('keeps topbar repo controls focused on layout for an active repo', () => {
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('main'), createRepoBranch('feature/a')],
      currentBranch: 'main',
      selectedBranch: 'feature/a',
    })

    renderControls(navigationWith({}))

    expect(container?.querySelector('button[aria-label="action.refresh"]')).toBeNull()
    expect(container?.querySelector('button[aria-label="action.create-worktree-title"]')).toBeNull()
    expect(container?.querySelector('[aria-label="workspace.layout-label"]')).not.toBeNull()
    expect(container?.querySelector('[aria-label="branches.filter-label"]')).toBeNull()
    expect(container?.querySelector('[aria-label="branches.search-label"]')).toBeNull()
  })
```

- [ ] **Step 2: Remove the obsolete ordering test**

Delete the whole `places repo controls before workspace layout` test block at `src/web/components/repo-toolbar/RepoToolbar.test.tsx:98-113`.

- [ ] **Step 3: Remove obsolete ordering helpers**

Delete these helpers from the bottom of `src/web/components/repo-toolbar/RepoToolbar.test.tsx`:

```tsx
function requiredElement(selector: string): Element {
  const element = container?.querySelector(selector)
  if (!element) throw new Error(`Missing element: ${selector}`)
  return element
}

function isBefore(a: Element, b: Element): boolean {
  return !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
}
```

- [ ] **Step 4: Change the Git repo toolbar test to expect layout and branch filters only**

Replace the Git-capable repo toolbar test at `src/web/components/repo-toolbar/RepoToolbar.test.tsx:171` with:

```tsx
  test('keeps body toolbar branch filters and layout for git-capable repositories', () => {
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('main')],
      currentBranch: 'main',
      selectedBranch: 'main',
    })

    renderWithProviders(<RepoToolbar repoId={REPO_ID} />, navigationWith({}))

    expect(container?.querySelector('[aria-label="branches.filter-label"]')).not.toBeNull()
    expect(container?.querySelector('[aria-label="branches.search-label"]')).not.toBeNull()
    expect(container?.querySelector('button[aria-label="action.refresh"]')).toBeNull()
    expect(container?.querySelector('button[aria-label="action.create-worktree-title"]')).toBeNull()
    expect(container?.querySelector('[aria-label="workspace.layout-label"]')).not.toBeNull()
  })
```

- [ ] **Step 5: Run the focused toolbar test and confirm it fails before implementation**

Run:

```bash
bun run test -- src/web/components/repo-toolbar/RepoToolbar.test.tsx
```

Expected before implementation: FAIL because `TopbarRepoControls` and `RepoToolbar` still render `RepoToolbarActions`.

## Task 2: Remove Repo Action Placement From Topbar And Repo Toolbar

**Files:**
- Modify: `src/web/components/topbar/TopbarRepoControls.tsx:11`
- Modify: `src/web/components/topbar/TopbarRepoControls.tsx:39-43`
- Modify: `src/web/components/repo-toolbar/RepoToolbar.tsx:12`
- Modify: `src/web/components/repo-toolbar/RepoToolbar.tsx:46-48`

- [ ] **Step 1: Remove the topbar `RepoToolbarActions` import**

In `src/web/components/topbar/TopbarRepoControls.tsx`, delete:

```tsx
import { RepoToolbarActions } from '#/web/components/repo-toolbar/RepoToolbarActions.tsx'
```

- [ ] **Step 2: Remove topbar sync/create-worktree rendering**

In `TopbarRepoControls`, change the returned markup to:

```tsx
  return (
    <div className="flex h-full shrink-0 items-center gap-1">
      {isGitRepo && focusMode && <FocusBranchControls repoId={repoId} />}
      <WorkspaceLayoutControlConnected repoId={repoId} />
    </div>
  )
```

- [ ] **Step 3: Remove the repo toolbar `RepoToolbarActions` import**

In `src/web/components/repo-toolbar/RepoToolbar.tsx`, delete:

```tsx
import { RepoToolbarActions } from '#/web/components/repo-toolbar/RepoToolbarActions.tsx'
```

- [ ] **Step 4: Keep only layout control in the repo toolbar right side**

In `RepoToolbar`, change the right-side block to:

```tsx
      <div className="flex shrink-0 items-center gap-2">
        <WorkspaceLayoutControlConnected repoId={repoId} />
      </div>
```

- [ ] **Step 5: Run the focused toolbar test**

Run:

```bash
bun run test -- src/web/components/repo-toolbar/RepoToolbar.test.tsx
```

Expected after implementation: PASS for the updated topbar/repo-toolbar placement tests.

## Task 3: Add Branch Area Toolbar Placement Tests

**Files:**
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.test.tsx:240-264`

- [ ] **Step 1: Expand the branch toolbar test to cover action placement**

Replace the test at `src/web/components/repo-workspace/RepoExplorerPane.test.tsx:240` with:

```tsx
  test('places branch filters and repo actions above the branch list', async () => {
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('main'), createRepoBranch('feature/a')],
      currentBranch: 'main',
      selectedBranch: 'main',
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="top-bottom" showActions />)
    })

    const branchToolbar = container.querySelector('[data-testid="branch-area-toolbar"]')
    const branchList = container.querySelector('[data-testid="branch-list"]')
    const filter = branchToolbar?.querySelector('[aria-label="branches.filter-label"]')
    const search = branchToolbar?.querySelector('[aria-label="branches.search-label"]')
    const refresh = branchToolbar?.querySelector('button[aria-label="action.refresh"]')
    const createWorktree = branchToolbar?.querySelector('button[aria-label="action.create-worktree-title"]')
    expect(branchToolbar).toBeTruthy()
    expect(branchToolbar?.className).toContain('h-9')
    expect(branchToolbar?.className).not.toContain('h-8')
    expect(filter).toBeTruthy()
    expect(search).toBeTruthy()
    expect(refresh).toBeTruthy()
    expect(createWorktree).toBeTruthy()
    expect(filter!.compareDocumentPosition(refresh!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(search!.compareDocumentPosition(createWorktree!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(branchList).toBeTruthy()
    expect(branchToolbar!.compareDocumentPosition(branchList!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await act(async () => root.unmount())
  })
```

- [ ] **Step 2: Run the focused explorer test and confirm it fails before implementation**

Run:

```bash
bun run test -- src/web/components/repo-workspace/RepoExplorerPane.test.tsx
```

Expected before implementation: FAIL because `BranchArea` does not render `RepoToolbarActions`.

## Task 4: Move Repo Actions Into BranchArea

**Files:**
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.tsx:12-13`
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.tsx:102-111`

- [ ] **Step 1: Import `RepoToolbarActions` into `RepoExplorerPane`**

Add this import beside the existing repo-toolbar imports:

```tsx
import { RepoToolbarActions } from '#/web/components/repo-toolbar/RepoToolbarActions.tsx'
```

- [ ] **Step 2: Render branch filters on the left and repo actions on the right**

Replace `BranchArea` in `src/web/components/repo-workspace/RepoExplorerPane.tsx` with:

```tsx
function BranchArea({ repoId, showActions }: { repoId: string; showActions: boolean }) {
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <Toolbar data-testid="branch-area-toolbar" className="px-2" variant="detail">
        <BranchFilterControls
          repoId={repoId}
          className="h-full min-w-0 flex-1 gap-1"
          searchClassName="max-w-[calc(100%_-_5.5rem)]"
        />
        <div className="flex shrink-0 items-center gap-1">
          <RepoToolbarActions repoId={repoId} compact />
        </div>
      </Toolbar>
      <BranchList repoId={repoId} showActions={showActions} />
    </section>
  )
}
```

- [ ] **Step 3: Run the focused explorer test**

Run:

```bash
bun run test -- src/web/components/repo-workspace/RepoExplorerPane.test.tsx
```

Expected after implementation: PASS for the branch toolbar placement test.

## Task 5: Add Visible Branch View Mode Coverage

**Files:**
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.test.tsx:240-264`

- [ ] **Step 1: Add assertions for the visible branch filter options**

Inside the updated branch toolbar test, after the `createWorktree` query, add:

```tsx
    const allBranchesFilter = branchToolbar?.querySelector('[aria-label="branches.filter-tooltip.all"]')
    const worktreesFilter = branchToolbar?.querySelector('[aria-label="branches.filter-tooltip.worktrees"]')
    const noWorktreeFilter = branchToolbar?.querySelector('[aria-label="branches.filter-tooltip.no-worktree"]')
```

Then add these assertions after `expect(createWorktree).toBeTruthy()`:

```tsx
    expect(allBranchesFilter).toBeTruthy()
    expect(worktreesFilter).toBeTruthy()
    expect(noWorktreeFilter).toBeNull()
```

- [ ] **Step 2: Run the focused explorer test and confirm it fails before option implementation**

Run:

```bash
bun run test -- src/web/components/repo-workspace/RepoExplorerPane.test.tsx
```

Expected before implementation: FAIL because `BranchViewModeControl` still renders the `no-worktree` option.

## Task 6: Hide The `no-worktree` Filter Option

**Files:**
- Modify: `src/web/components/repo-toolbar/branch-view-mode-options.ts:1-10`
- Modify: `src/web/components/repo-toolbar/BranchViewModeControl.tsx:1`
- Modify: `src/web/components/repo-toolbar/BranchViewModeControl.tsx:14-18`

- [ ] **Step 1: Remove `no-worktree` from visible options**

Replace `src/web/components/repo-toolbar/branch-view-mode-options.ts` with:

```ts
import type { BranchViewMode } from '#/web/stores/repos/types.ts'

export const BRANCH_VIEW_MODE_OPTIONS = [
  { id: 'all', labelKey: 'branches.filter.all', tooltipKey: 'branches.filter-tooltip.all' },
  { id: 'worktrees', labelKey: 'branches.filter.worktrees', tooltipKey: 'branches.filter-tooltip.worktrees' },
] satisfies readonly { id: BranchViewMode; labelKey: string; tooltipKey: string }[]
```

- [ ] **Step 2: Remove the unused `GitBranch` icon import and mapping**

In `src/web/components/repo-toolbar/BranchViewModeControl.tsx`, change the import to:

```tsx
import { FolderTree, ListTree, type LucideIcon } from 'lucide-react'
```

Then change the icon mapping to:

```tsx
const BRANCH_VIEW_MODE_ICONS = {
  all: ListTree,
  worktrees: FolderTree,
} satisfies Record<(typeof BRANCH_VIEW_MODE_OPTIONS)[number]['id'], LucideIcon>
```

This keeps `BranchViewModeControl` accepting the full `BranchViewMode` value type while rendering only visible option ids. When `value` is `no-worktree`, none of the visible options is selected and the user can choose `all` or `worktrees`.

- [ ] **Step 3: Run the focused explorer test**

Run:

```bash
bun run test -- src/web/components/repo-workspace/RepoExplorerPane.test.tsx
```

Expected after implementation: PASS for visible branch filter option assertions.

## Task 7: Run Full Verification

**Files:**
- No source edits in this task.

- [ ] **Step 1: Run focused tests together**

Run:

```bash
bun run test -- src/web/components/repo-toolbar/RepoToolbar.test.tsx src/web/components/repo-workspace/RepoExplorerPane.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run the full test suite**

Run:

```bash
bun run test
```

Expected: PASS.

- [ ] **Step 4: Inspect changed files**

Run:

```bash
git diff -- src/web/components/topbar/TopbarRepoControls.tsx src/web/components/repo-toolbar/RepoToolbar.tsx src/web/components/repo-workspace/RepoExplorerPane.tsx src/web/components/repo-toolbar/branch-view-mode-options.ts src/web/components/repo-toolbar/BranchViewModeControl.tsx src/web/components/repo-toolbar/RepoToolbar.test.tsx src/web/components/repo-workspace/RepoExplorerPane.test.tsx
```

Expected: Diff only contains the planned placement, visible option, and test updates.

## Self-Review

- Spec coverage: covered topbar removal, repo-toolbar removal, branch area placement, visible filter options, `no-worktree` compatibility, non-Git behavior via existing `RepoToolbarActions` null behavior, and verification.
- Placeholder scan: no deferred sections or vague implementation steps.
- Type consistency: `RepoToolbarActions`, `BranchFilterControls`, `BranchViewMode`, and `BRANCH_VIEW_MODE_OPTIONS` names match existing source files.
