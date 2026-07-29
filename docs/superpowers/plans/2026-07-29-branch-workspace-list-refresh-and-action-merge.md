# Branch Workspace List Refresh and Action Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one always-available branch-workspace refresh that reloads the latest list and member change counts, remove the redundant item-level change refresh, and merge branch-workspace actions into the status bar when the workspace repository list is hidden.

**Architecture:** `WorkspaceRepositoryRail` remains the owner of branch-workspace queries, action state, and dialogs. `StatusBar` exposes a presentation-only portal host, and `BranchWorkspacePane` wires that host to the Rail so hidden-list actions move without lifting business orchestration.

**Tech Stack:** React 19, React DOM portal, Zustand, TanStack Query, Vitest/jsdom, TypeScript strip-only mode.

## Global Constraints

- Use repo-alias imports with explicit `.ts`/`.tsx` extensions.
- Do not add packages, persistence fields, server APIs, polling, realtime events, or Git writes.
- Keep “配置工作区” and “重新扫描仓库” exclusive to the visible workspace repository header.
- Reuse `workspace.branch-workspace.reload` and the existing `branchQuery.refresh()` flow.
- After a successful list read, refresh Git status only for distinct, available repositories referenced by the returned latest snapshot.
- Remove `workspace.branch-workspace.refresh-changes` from each branch-workspace More menu and delete its Rail/List callback state.
- Use Chinese “子工作区” and “成员工作树”; do not introduce “子仓库”.
- Do not commit: repository instructions prohibit Git writes unless explicitly requested.

---

### Task 1: Add a presentation-only action host to StatusBar

**Files:**
- Modify: `src/web/components/StatusBar.tsx`
- Test: `src/web/components/StatusBar.test.tsx`

**Interfaces:**
- Produces: optional `workspaceActionsHostRef?: RefCallback<HTMLDivElement>` prop.
- Produces: `[data-testid="statusbar-workspace-actions"]` portal target with `className="contents"`.

- [x] **Step 1: Write the failing host-ref test**

```tsx
test('exposes a layout-neutral host for workspace actions', () => {
  let actionHost: HTMLDivElement | null = null
  act(() =>
    root!.render(<StatusBar repoId={REPO_ID} workspaceActionsHostRef={(element) => (actionHost = element)} />),
  )

  expect(actionHost).toBe(container?.querySelector('[data-testid="statusbar-workspace-actions"]'))
  expect(actionHost?.className).toContain('contents')
})
```

- [x] **Step 2: Run RED**

Run `bun run test src/web/components/StatusBar.test.tsx`.

Expected: assertion failure because the ref is never called and no action host exists.

- [x] **Step 3: Add the minimal host**

Add `import type { RefCallback } from 'react'`, add
`workspaceActionsHostRef?: RefCallback<HTMLDivElement>` to `Props`, destructure it in `StatusBar`, and insert this
element immediately before the existing `min-w-0 flex-1` spacer:

```tsx
<div ref={workspaceActionsHostRef} className="contents" data-testid="statusbar-workspace-actions" />
```

- [x] **Step 4: Run GREEN**

Run `bun run test src/web/components/StatusBar.test.tsx` and expect all tests in the file to pass without warnings.

---

### Task 2: Add manual list refresh and split visible/hidden actions

**Files:**
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.tsx`
- Test: `src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`
- Test: `src/web/theme/font-contract.test.ts`

**Interfaces:**
- Consumes: `statusBarActionHost?: HTMLDivElement | null` from `BranchWorkspacePane`.
- Consumes: existing `branchQuery.refresh(): Promise<unknown>`.
- Produces: list-refresh button labelled `workspace.branch-workspace.reload`.
- Produces: hidden-list portal actions labelled `workspace.branch-workspace.create`, `workspace.pull-all`, and `workspace.repositories.show`.

- [x] **Step 1: Write the failing manual-refresh test**

```tsx
test('manually reloads the branch workspace list and guards duplicate requests', async () => {
  let finishRefresh: (() => void) | undefined
  branchWorkspaceState.refresh.mockReturnValueOnce(new Promise<void>((resolve) => (finishRefresh = resolve)))
  renderRail({ currentRepoId: ROOT })
  const refresh = container?.querySelector<HTMLButtonElement>(
    'section[aria-label="workspace.branch-workspace.list"] [aria-label="workspace.branch-workspace.reload"]',
  )

  act(() => {
    refresh?.click()
    refresh?.click()
  })
  expect(branchWorkspaceState.refresh).toHaveBeenCalledTimes(1)
  expect(rescanWorkspace).not.toHaveBeenCalled()
  await act(async () => finishRefresh?.())
})
```

- [x] **Step 2: Write the failing hidden-action placement test**

Create and pass a `statusBarActionHost`, hide the repository list through the existing action, then assert:

```tsx
expect(branchHeader?.querySelector('[aria-label="workspace.branch-workspace.reload"]')).not.toBeNull()
expect(branchHeader?.querySelector('[aria-label="workspace.configure"]')).toBeNull()
expect(branchHeader?.querySelector('[aria-label="workspace.rescan"]')).toBeNull()
expect(statusBarActionHost.querySelector('[aria-label="workspace.branch-workspace.create"]')).not.toBeNull()
expect(statusBarActionHost.querySelector('[aria-label="workspace.pull-all"]')).not.toBeNull()
expect(statusBarActionHost.querySelector('[aria-label="workspace.repositories.show"]')).not.toBeNull()
expect(statusBarActionHost.querySelector('[aria-label="workspace.configure"]')).toBeNull()
expect(statusBarActionHost.querySelector('[aria-label="workspace.rescan"]')).toBeNull()
```

- [x] **Step 3: Run RED**

Run `bun run test src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`.

Expected: the successful-list refresh button and `statusBarActionHost` interface are missing, while hidden actions remain in the branch header.

- [x] **Step 4: Implement minimal action projection**

Import `createPortal` from `react-dom`, add `statusBarActionHost?: HTMLDivElement | null` to `Props`, and replace
`headerActions` with these exact projections:

```tsx
const branchWorkspacePrimaryActions = (
  <>
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={t('workspace.branch-workspace.create')}
      title={t('workspace.branch-workspace.create')}
      disabled={!batchReady || reorderPending}
      onClick={() => openBranchDialog('create', null)}
    >
      <FolderPlus aria-hidden="true" />
    </Button>
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={t('workspace.pull-all')}
      title={t('workspace.pull-all')}
      disabled={!batchReady || reorderPending}
      onClick={openPull}
    >
      <Download aria-hidden="true" />
    </Button>
  </>
)

const workspaceRepositoryOnlyActions = (
  <>
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={t('workspace.configure')}
      title={t('workspace.configure')}
      disabled={scanning || reorderPending}
      onClick={() => void openConfiguration()}
    >
      <Settings2 aria-hidden="true" />
    </Button>
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={t('workspace.rescan')}
      title={t('workspace.rescan')}
      disabled={scanning}
      onClick={() => void rescanWorkspace(workspaceRootId)}
    >
      {scanning ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
    </Button>
  </>
)

const repositoryListToggleAction = (
  <Button
    type="button"
    variant="ghost"
    size="icon-sm"
    aria-label={t(repositoryListVisible ? 'workspace.repositories.hide' : 'workspace.repositories.show')}
    title={t(repositoryListVisible ? 'workspace.repositories.hide' : 'workspace.repositories.show')}
    onClick={() => toggleRepositoryList(workspaceRootId)}
  >
    {repositoryListVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
  </Button>
)

const repositoryHeaderActions = (
  <>{branchWorkspacePrimaryActions}{workspaceRepositoryOnlyActions}{repositoryListToggleAction}</>
)
const hiddenRepositoryActions = <>{branchWorkspacePrimaryActions}{repositoryListToggleAction}</>
const branchListRefreshAction = (
  <Button
    type="button"
    variant="ghost"
    size="icon-sm"
    disabled={branchReloadPending}
    aria-label={t('workspace.branch-workspace.reload')}
    title={t('workspace.branch-workspace.reload')}
    onClick={() => void reloadBranchWorkspaces()}
  >
    {branchReloadPending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
  </Button>
)
```

Render `repositoryHeaderActions` only in `WorkspaceRepositoryListPane`, always render only `branchListRefreshAction`
in the branch list header, and project hidden actions with:

```tsx
{!repositoryListVisible && statusBarActionHost
  ? createPortal(hiddenRepositoryActions, statusBarActionHost)
  : null}
```

When `statusBarActionHost` is absent, render `hiddenRepositoryActions` after `branchListRefreshAction` as the accessibility
fallback. Keep the error-row button on the same `reloadBranchWorkspaces()` function and `branchReloadPending` state.

- [x] **Step 5: Run GREEN**

Run the targeted Rail test and the font contract test; expect both files to pass without warnings. Update the Rail's
expected `icon-sm` count from `5` to `6` because the manual list refresh adds one project-titlebar action.

---

### Task 3: Wire BranchWorkspacePane and verify the contract

**Files:**
- Modify: `src/web/components/repo-workspace/BranchWorkspacePane.tsx`
- Test: `src/web/components/repo-workspace/BranchWorkspacePane.test.tsx`

**Interfaces:**
- Consumes: `StatusBar.workspaceActionsHostRef`.
- Consumes: `WorkspaceRepositoryRail.statusBarActionHost`.
- Produces: one component-local `HTMLDivElement | null` connection with no persistence or server state.

- [x] **Step 1: Write the failing wiring test**

Extend the Rail mock to capture `statusBarActionHost`. Extend the StatusBar mock to invoke
`workspaceActionsHostRef` with a real element. Render the desktop pane and assert:

```tsx
expect(branchWorkspacePaneState.statusBarActionHost).toBe(branchWorkspacePaneState.statusBarHostElement)
```

- [x] **Step 2: Run RED**

Run `bun run test src/web/components/repo-workspace/BranchWorkspacePane.test.tsx`.

Expected: neither mocked component receives the new host/ref prop.

- [x] **Step 3: Add component-local wiring**

```tsx
const [statusBarActionHost, setStatusBarActionHost] = useState<HTMLDivElement | null>(null)
```

Pass `statusBarActionHost={statusBarActionHost}` to each mounted `WorkspaceRepositoryRail`. Pass
`workspaceActionsHostRef={setStatusBarActionHost}` to the matching desktop and compact-scope `StatusBar`; status bars
rendered without a Rail do not receive the ref.

- [x] **Step 4: Run targeted and full verification**

```bash
bun run test src/web/components/StatusBar.test.tsx src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx src/web/components/repo-workspace/BranchWorkspacePane.test.tsx
bun run typecheck
bun run check:architecture
bun run test
```

Expected: every command exits `0`; Vitest reports zero failed tests and no unhandled errors.

- [x] **Step 5: Review the final diff**

```bash
git diff --check
git diff -- src/web/components/StatusBar.tsx src/web/components/StatusBar.test.tsx src/web/components/repo-workspace/WorkspaceRepositoryRail.tsx src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx src/web/components/repo-workspace/BranchWorkspacePane.tsx src/web/components/repo-workspace/BranchWorkspacePane.test.tsx docs/superpowers/specs/2026-07-29-branch-workspace-list-refresh-and-action-merge-design.md docs/superpowers/plans/2026-07-29-branch-workspace-list-refresh-and-action-merge.md
```

Expected: no whitespace errors; the scoped hunks are limited to the documented UI, tests, design, and plan files.
The worktree also contains pre-existing/concurrent repository-dependency changes, which are preserved and excluded
from this task's review boundary.

---

### Task 4: Consolidate list and change-count refresh

**Files:**
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceList.tsx`
- Test: `src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`
- Test: `src/web/components/repo-workspace/BranchWorkspaceList.test.tsx`

**Interfaces:**
- Consumes: `branchQuery.refresh(): Promise<BranchWorkspaceReadResult>`.
- Consumes: `useReposStore.getState().refreshStatus(repositoryId, { token })`.
- Removes: `BranchWorkspaceListProps.onRefreshChanges` and `refreshingChangeIds`.
- Produces: one titlebar refresh transaction covering the latest list and its distinct available member repositories.

- [x] **Step 1: Write failing consolidation tests**

Update the Rail manual-refresh test so the query resolves with a fresh snapshot whose members differ from the stale
rendered snapshot. Assert that only distinct, non-removed, available repositories from the returned snapshot receive
`refreshStatus`, the button remains disabled until every status request settles, and a second click does not start a
new list read. Assert that the mocked `BranchWorkspaceList` receives neither `onRefreshChanges` nor
`refreshingChangeIds`.

Update the real `BranchWorkspaceList` menu expectations to omit `workspace.branch-workspace.refresh-changes` in ready
and drifted states. Delete the obsolete busy-menu test and callback assertions.

- [x] **Step 2: Run RED**

Run:

```bash
bun run test src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx src/web/components/repo-workspace/BranchWorkspaceList.test.tsx
```

Expected: Rail does not call `refreshStatus`, still passes item-level refresh props, and the real list still exposes the
menu action.

- [x] **Step 3: Implement the minimal combined refresh**

Make `reloadBranchWorkspaces()` await the successful read result, derive unique configured repository IDs from
`result.items`, skip removed and unavailable members, and await `Promise.allSettled` around `refreshStatus`. Keep the
existing synchronous duplicate guard around the whole sequence.

Delete `refreshingBranchChangesRef`, `refreshingBranchChanges`, `refreshBranchWorkspaceChanges`, the two props passed
from Rail, and the matching `BranchWorkspaceList` props, icon, action construction, and menu projection.

- [ ] **Step 4: Run GREEN and full verification**

Run:

```bash
bun run test src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx src/web/components/repo-workspace/BranchWorkspaceList.test.tsx
bun run typecheck
bun run check:architecture
bun run test
git diff --check
```

Expected: every command exits `0`, with no failed tests or architecture violations.

Current evidence: the scoped suite passes `80/80`, architecture and `git diff --check` pass, and typecheck passed after
the implementation fix. A later full-suite rerun is temporarily blocked by concurrent, out-of-scope
`WorktreeBootstrapSourcePicker` / `CreateWorktreeDialog` RED tests in the shared worktree; do not alter those files here.

- [x] **Step 5: Review the scoped diff**

Confirm the only behavioral expansion is Git status refresh after a successful latest-list read, and the only removed
capability is the duplicate item-level menu entry. Preserve all unrelated concurrent worktree changes.
