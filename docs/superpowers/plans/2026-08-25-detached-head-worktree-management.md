# Detached-HEAD Worktree Management Implementation Plan

> **Execution mode:** Inline execution in the current worktree. Steps use checkbox syntax for tracking; no sub-agent, Git commit, or branch creation is part of this plan.

**Goal:** Make every authoritative, non-primary detached-HEAD Git worktree a selectable Hobgoblin work context with ordinary file/status/history/terminal access and safe exact-path cleanup.

**Architecture:** Keep branch selection and detached-HEAD selection distinct: `selectedBranch` remains the branch identity while a renderer-local `selectedDetachedWorktreePath` identifies a detached worktree by an exact path already present in `worktreesByPath`. A focused selector module projects either kind into one worktree context for files, status, history, terminals, and navigation. Existing repository write orchestration performs removal and pruning; no synthetic branch, database migration, or new persistence contract is introduced.

**Tech Stack:** TypeScript in Node.js strip-only mode, React, Zustand/Immer, Vitest, Bun, existing Git repository backend and renderer/server intent flow.

## Global Constraints

- Do not add or change a database schema, package dependency, or durable session codec.
- Do not create a synthetic local branch for a detached-HEAD worktree.
- Accept a detached worktree path only when the authoritative `worktreesByPath` entry is detached, non-primary, and exact-path matched.
- Locked worktrees remain browseable but not removable; prunable registrations expose prune instead of directory removal.
- Removing a live detached worktree never deletes a local or remote branch. Dirty removal requires the existing explicit force approval.
- Keep repository path identity, remote/WSL execution, invalidation, and operation queue behavior in existing layers.
- Use repo-alias imports with explicit `.ts`/`.tsx` extensions and avoid strip-only-incompatible TypeScript syntax.
- Do not run or plan `git commit`, branch creation, push, reset, or other Git history mutations.

---

### Task 1: Model and select a detached-HEAD worktree context

**Files:**

- Create: `src/web/stores/repos/worktree-selection.ts`
- Create: `src/web/stores/repos/worktree-selection.test.ts`
- Modify: `src/web/stores/repos/types.ts`
- Modify: `src/web/stores/repos/helpers.ts`
- Modify: `src/web/stores/repos/selection.ts`
- Modify: `src/web/stores/repos/selection.test.ts`
- Modify: `src/web/stores/repos/refresh-state.ts`
- Modify: `src/web/stores/repos/refresh.test.ts`
- Modify: `src/web/stores/repos/refresh.ts`
- Modify: `src/web/stores/repos/worktree-state.ts`
- Modify: `src/web/stores/repos/worktree-state.test.ts`
- Modify: `src/web/main-window-navigation-actions.ts`
- Modify: `src/web/main-window-navigation-actions.test.ts`

**Interfaces:**

- Produces: `SelectedRepoWorktreeContext`, `selectedRepoWorktree(repo)`, `selectedWorktreeTabKey(repo)`, `detachedHeadTerminalLabel(worktree)`.
- Produces: `RepoUiState.selectedDetachedWorktreePath: string | null` and `ReposStore.selectDetachedWorktree(id, worktreePath)`.
- Produces: `MainWindowNavigationActions.selectRepoDetachedWorktree(...)` and `showRepoDetachedWorktreeDetailTab(...)`.

- [x] **Step 1: Write failing selector and selection-action tests**

```ts
test('projects an authoritative detached worktree without inventing a branch', () => {
  const repo = detachedRepo('/repo', '/outside/task', 'abc1234')
  repo.ui.selectedBranch = null
  repo.ui.selectedDetachedWorktreePath = '/outside/task'

  expect(selectedRepoWorktree(repo)).toMatchObject({
    kind: 'detached',
    branch: null,
    worktreePath: '/outside/task',
    historyRef: 'abc1234',
  })
})

test('selectDetachedWorktree clears branch selection and rejects unknown paths', () => {
  seedDetachedRepo()
  useReposStore.getState().selectDetachedWorktree(REPO_ID, DETACHED_PATH)
  expect(useReposStore.getState().repos[REPO_ID]?.ui).toMatchObject({
    selectedBranch: null,
    selectedDetachedWorktreePath: DETACHED_PATH,
  })

  useReposStore.getState().selectDetachedWorktree(REPO_ID, '/unknown')
  expect(useReposStore.getState().repos[REPO_ID]?.ui.selectedDetachedWorktreePath).toBe(DETACHED_PATH)
})
```

- [x] **Step 2: Run the focused tests and verify RED**

Run: `bun run test src/web/stores/repos/worktree-selection.test.ts src/web/stores/repos/selection.test.ts src/web/stores/repos/refresh-state.test.ts src/web/main-window-navigation-actions.test.ts`

Expected: FAIL because the selector, UI field, selection action, and navigation methods do not exist.

- [x] **Step 3: Implement the minimal selection projection**

```ts
export interface SelectedRepoWorktreeContext {
  kind: 'branch' | 'detached'
  branch: RepoBranchState | null
  worktree: RepoWorktreeState
  worktreePath: string
  historyRef: string | null
  terminalLabel: string
}

export function selectedRepoWorktree(repo: RepoSelectionSource): SelectedRepoWorktreeContext | null {
  const detachedPath = repo.ui.selectedDetachedWorktreePath
  const detached = detachedPath ? repo.data.worktreesByPath[detachedPath] : undefined
  if (detached && detached.isDetached && !detached.isMain && !detached.isPrunable) {
    return {
      kind: 'detached',
      branch: null,
      worktree: detached,
      worktreePath: detached.path,
      historyRef: detached.head ?? null,
      terminalLabel: detachedHeadTerminalLabel(detached),
    }
  }
  const branch = repo.data.branches.find((candidate) => candidate.name === repo.ui.selectedBranch)
  if (!branch?.worktree?.path) return null
  const worktree = repo.data.worktreesByPath[branch.worktree.path]
  if (!worktree) return null
  return {
    kind: 'branch',
    branch,
    worktree,
    worktreePath: worktree.path,
    historyRef: branch.name,
    terminalLabel: branch.name,
  }
}
```

`selectDetachedWorktree` must verify the exact map entry, set `selectedBranch = null`, set the detached path, and normalize the detail tab as a worktree tab. `selectBranch` must clear the detached path. Snapshot refresh may preserve the detached path while status is transiently unavailable; authoritative status application must remove stale detached entries, retain the selection only while its live non-primary detached entry remains, and otherwise clear it and use the existing selected-branch fallback.

- [x] **Step 4: Implement navigation methods and detached tab keys**

```ts
selectRepoDetachedWorktree(repoId, worktreePath) {
  if (repoId !== activeId) setActive(repoId)
  selectDetachedWorktree(repoId, worktreePath)
},
showRepoDetachedWorktreeDetailTab(repoId, worktreePath, tab) {
  if (repoId !== activeId) setActive(repoId)
  selectDetachedWorktree(repoId, worktreePath)
  setDetailTab(repoId, tab)
},
```

Use `detached:<exact-path>` as the existing explorer-tab map key, without adding it to the restorable selection schema.

- [x] **Step 5: Run focused tests and verify GREEN**

Run: `bun run test src/web/stores/repos/worktree-selection.test.ts src/web/stores/repos/selection.test.ts src/web/stores/repos/refresh-state.test.ts src/web/main-window-navigation-actions.test.ts`

Expected: PASS.

---

### Task 2: Generalize exact-path worktree removal without a branch identity

**Files:**

- Modify: `src/web/stores/repos/branch-action-types.ts`
- Modify: `src/web/stores/repos/types.ts`
- Modify: `src/web/stores/repos/persistence.ts`
- Modify: `src/web/stores/repos/branch-actions.ts`
- Modify: `src/web/stores/repos/branch-actions.test.ts`
- Modify: `src/web/repo-client.ts`
- Modify: `src/server/routes/repo.ts`
- Modify: `src/server/modules/repo-write-paths.ts`
- Modify: `src/server/modules/repo-backend.ts`
- Modify: `src/server/modules/repo.test.ts`

**Interfaces:**

- Changes: exact-path `removeWorktree` and `cleanupWorktree` actions accept `branch?: string`; `branch` is required by runtime validation only when `alsoDeleteBranch === true`.
- Preserves: exact-path backend revalidation, locked/primary/dirty safety, remote backend support, operation serialization, snapshot invalidation, and action history.

- [x] **Step 1: Write failing detached removal orchestration tests**

```ts
test('runs detached worktree removal without a branch placeholder', async () => {
  const result = await store.runBranchAction(REPO_ID, {
    kind: 'removeWorktree',
    worktreePath: DETACHED_PATH,
    alsoDeleteBranch: false,
  })

  expect(result?.ok).toBe(true)
  expect(serverCalls['repo.removeWorktree']).toMatchObject({
    cwd: REPO_ID,
    worktreePath: DETACHED_PATH,
    alsoDeleteBranch: false,
  })
  expect(serverCalls['repo.removeWorktree']).not.toHaveProperty('branch')
})

test('rejects branch deletion when no branch identity is supplied', async () => {
  await expect(
    removeRepositoryWorktree('/repo', {
      worktreePath: '/outside/task',
      alsoDeleteBranch: true,
    }),
  ).resolves.toEqual({ ok: false, message: 'error.invalid-arguments' })
})
```

- [x] **Step 2: Run removal tests and verify RED**

Run: `bun run test src/web/stores/repos/branch-actions.test.ts src/server/modules/repo.test.ts`

Expected: FAIL because the current types and client/server payload require a branch string.

- [x] **Step 3: Implement the optional-branch removal contract**

```ts
if (input.alsoDeleteBranch && !input.branch) {
  return { ok: false, message: 'error.invalid-arguments' }
}
const removable = resolveRemovableWorktree(
  worktrees,
  input.alsoDeleteBranch ? input.branch : undefined,
  input.worktreePath,
  repoId,
)
```

Use `action.branch ?? action.worktreePath` as the operation target. Persist `branch` only when present. The existing backend must continue resolving and removing by authoritative exact path.

- [x] **Step 4: Run removal tests and verify GREEN**

Run: `bun run test src/web/stores/repos/branch-actions.test.ts src/server/modules/repo.test.ts src/system/ssh/git.test.ts`

Expected: PASS, including existing branch-owned removal tests.

---

### Task 3: Render actionable detached worktree rows with safe cleanup

**Files:**

- Modify: `src/web/components/BranchList.tsx`
- Modify: `src/web/components/BranchList.test.tsx`

**Interfaces:**

- Consumes: selection/navigation methods from Task 1 and optional-branch removal from Task 2.
- Produces: selectable exact-path rows plus direct remove/prune actions. Project-level editor and terminal controls consume the selected context in Task 4.

- [x] **Step 1: Write failing row interaction and cleanup tests**

```tsx
test('selects and opens a live detached worktree by exact path', () => {
  seedDetachedRepo({ path: DETACHED_PATH, head: 'abc1234' })
  renderList({ onWorktreeDoubleClick })

  const row = screen.getByRole('button', { name: /abc1234/ })
  fireEvent.click(row)
  expect(navigationState.selectRepoDetachedWorktree).toHaveBeenCalledWith(REPO_ID, DETACHED_PATH)

  fireEvent.doubleClick(row)
  expect(onWorktreeDoubleClick).toHaveBeenCalledTimes(1)
})

test('removes a detached worktree without offering branch deletion', async () => {
  openDetachedMenuAndChoose('action.remove-worktree')
  expect(screen.queryByText('action.confirm-remove-worktree-also-delete-branch')).toBeNull()
  await confirmDialog()
  expect(runBranchAction).toHaveBeenCalledWith(
    REPO_ID,
    {
      kind: 'removeWorktree',
      worktreePath: DETACHED_PATH,
      alsoDeleteBranch: false,
      forceRemoveWorktree: false,
    },
    expect.anything(),
  )
})

test('offers prune instead of removal for a prunable detached registration', () => {
  seedDetachedRepo({ path: DETACHED_PATH, isPrunable: true })
  expect(detachedMenuLabels()).toContain('action.cleanup-invalid-worktree')
  expect(detachedMenuLabels()).not.toContain('action.remove-worktree')
})
```

- [x] **Step 2: Run row tests and verify RED**

Run: `bun run test src/web/components/BranchList.test.tsx`

Expected: FAIL because detached rows are static and expose no exact-path action.

- [x] **Step 3: Implement focused exact-path actions in the detached row**

Reuse `runBranchAction` and the existing confirmation copy. The removal confirmation contains only the exact formatted path plus the force-removal checkbox; it never renders branch/upstream deletion choices.

```ts
await dispatchRepoBranchAction(
  repo.id,
  repo.instanceToken,
  {
    kind: 'removeWorktree',
    worktreePath: worktree.path,
    alsoDeleteBranch: false,
    forceRemoveWorktree,
  },
  runBranchAction,
)
```

For `isPrunable`, dispatch `{ kind: 'cleanupWorktree', worktreePath }` only through the existing prune path; for locked or primary entries expose no enabled destructive operation.

- [x] **Step 4: Implement the row using the shared workspace-list frame**

Use `WorkspaceListItemFrame`. The main button selects the exact worktree context, double-click opens files, and the direct row action exposes removal for live entries or prune for prunable registrations. Keep the existing hash, dirty-count, path, and detached badge presentation. Locked entries remain selectable while their destructive action stays disabled.

- [x] **Step 5: Run row tests and verify GREEN**

Run: `bun run test src/web/components/BranchList.test.tsx`

Expected: PASS.

---

### Task 4: Project detached selection through files, status, history, and terminals

**Files:**

- Modify: `src/web/components/RepoView.tsx`
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.tsx`
- Modify: `src/web/components/repo-workspace/RepoWorktreeExplorer.tsx`
- Modify: `src/web/components/repo-workspace/ProjectStatusPanel.tsx`
- Modify: `src/web/components/repo-workspace/ProjectChangesPanel.tsx`
- Modify: `src/web/components/repo-workspace/ProjectHistoryPanel.tsx`
- Modify: `src/web/components/file-tree/ProjectFileTree.tsx`
- Modify: `src/web/components/branch-detail/model.ts`
- Modify: `src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.tsx`
- Modify: `src/web/components/terminal/terminal-repo-index.ts`
- Modify: `src/web/commands/workspace-commands.ts`
- Modify: `src/web/hooks/useProjectInternalTerminalAction.ts`
- Modify: `src/web/hooks/useProjectExternalOpenActions.ts`
- Modify: `src/web/hooks/renderer-effect-intent-plans.ts`
- Modify: `src/web/hooks/renderer-effect-intent-handlers.ts`
- Modify: matching focused `*.test.ts` and `*.test.tsx` files beside these modules.

**Interfaces:**

- Consumes: `selectedRepoWorktree(repo)` from Task 1.
- Changes: files, status, changes, history, terminal creation/recovery, editor/external-terminal opening, terminal bells, and deep links resolve the same exact selected worktree context.
- Preserves: branch-only pull/push/upstream/merge controls and auxiliary detached-window handoff remain unavailable when no real branch is selected.

- [x] **Step 1: Write failing surface projection tests**

```ts
test('uses the detached path for files and changed-file counts', () => {
  const repo = selectedDetachedRepo(DETACHED_PATH)
  expect(selectedRepoWorktree(repo)?.worktreePath).toBe(DETACHED_PATH)
  expect(repo.data.status.find((entry) => entry.path === DETACHED_PATH)?.entries).toHaveLength(2)
})

test('uses detached HEAD as the history ref', () => {
  expect(projectHistoryView(selectedDetachedRepo(DETACHED_PATH, 'abc1234'))).toEqual({
    branchName: 'abc1234',
    worktreePath: DETACHED_PATH,
  })
})

test('indexes detached worktrees for terminal recovery', () => {
  expect(repoIndexFromRepos({ [REPO_ID]: selectedDetachedRepo(DETACHED_PATH, 'abc1234') })).toMatchObject({
    [REPO_ID]: { branchByWorktreePath: { [DETACHED_PATH]: 'HEAD@abc1234' } },
  })
})

test('routes a detached terminal deep link by exact worktree path', () => {
  runTerminalDeepLinkCommand(detachedTarget)
  expect(navigation.showRepoDetachedWorktreeDetailTab).toHaveBeenCalledWith(REPO_ID, DETACHED_PATH, 'terminal')
})
```

- [x] **Step 2: Run focused surface tests and verify RED**

Run: `bun run test src/web/components/repo-workspace/RepoExplorerPane.test.tsx src/web/components/repo-workspace/ProjectStatusPanel.test.tsx src/web/components/repo-workspace/ProjectChangesPanel.test.tsx src/web/components/repo-workspace/ProjectHistoryPanel.test.tsx src/web/components/file-tree/ProjectFileTree.test.tsx src/web/components/terminal/terminal-repo-index.test.ts src/web/commands/workspace-commands.test.ts`

Expected: FAIL because each surface currently resolves only `selectedBranch`.

- [x] **Step 3: Project the detached context without enabling branch actions**

```ts
const context = selectedRepoWorktree(repo)
const selectedStatus = context ? repo.data.status.find((status) => status.path === context.worktreePath) : undefined
```

Render a detached status summary with folder, project, detached-HEAD identity, exact worktree path, dirty/locked state, and commit hash. Omit upstream, sync, created-from, and branch-role rows.

- [x] **Step 4: Route file and history reads to the selected worktree context**

Use `context.worktreePath` for file-tree operations, status lookup, change discard, patch/editor targeting, and change counts. Use `context.historyRef` for history reads. Disable auxiliary detached-file-area handoff when `context.branch` is null because its existing descriptor requires a real branch.

- [x] **Step 5: Route terminal creation, recovery, cycling, bells, and deep links by exact path**

Index live detached worktrees with `detachedHeadTerminalLabel`; use that as terminal presentation metadata only. Use `showRepoDetachedWorktreeDetailTab` whenever terminal navigation resolves an authoritative detached path. Track previous selected worktree keys rather than previous branch names when deciding whether to focus an existing terminal.

- [x] **Step 6: Run focused surface tests and verify GREEN**

Run: `bun run test src/web/components/repo-workspace/RepoExplorerPane.test.tsx src/web/components/repo-workspace/ProjectStatusPanel.test.tsx src/web/components/repo-workspace/ProjectChangesPanel.test.tsx src/web/components/repo-workspace/ProjectHistoryPanel.test.tsx src/web/components/file-tree/ProjectFileTree.test.tsx src/web/components/RepoView.test.tsx src/web/components/terminal/terminal-repo-index.test.ts src/web/commands/workspace-commands.test.ts src/web/hooks/useProjectInternalTerminalAction.test.tsx src/web/hooks/useProjectExternalOpenActions.test.tsx src/web/hooks/renderer-effect-intent-plans.test.ts src/web/hooks/useRendererEffectIntentRouter.test.tsx`

Expected: PASS.

---

### Task 5: Verify the complete feature and documentation contract

**Files:**

- Modify: `CONTEXT.md` only if implementation reveals a terminology correction.
- Modify: this plan only to check completed steps; do not add implementation notes to the glossary.

**Interfaces:**

- Verifies all earlier task outputs and project architecture boundaries.

- [x] **Step 1: Run focused detached-worktree tests**

Run: `bun run test src/web/stores/repos/worktree-selection.test.ts src/web/stores/repos/selection.test.ts src/web/stores/repos/refresh.test.ts src/web/components/BranchList.test.tsx src/web/components/terminal/terminal-repo-index.test.ts src/web/commands/workspace-commands.test.ts src/server/modules/repo.test.ts src/server/routes/repo.test.ts src/system/ssh/git.test.ts`

Expected: PASS.

- [x] **Step 2: Run project verification gates**

Run: `bun run typecheck`

Expected: exit code 0.

Run: `bun run check:architecture`

Expected: exit code 0.

Run: `bun run test`

Expected: all test files pass with no test failures.

- [x] **Step 3: Inspect the final diff and requirement coverage**

Run: `git diff --check && git status --short && git diff --stat`

Expected: no whitespace errors; only detached-worktree management code, tests, `CONTEXT.md`, and this plan are changed.

Confirm manually from tests and code that:

- every live non-primary detached worktree is selectable by exact path;
- files, status, changes, history, and internal/external terminals use that exact path;
- branch-only actions are absent;
- live removal never requests branch deletion;
- dirty removal requires force approval;
- prunable entries expose prune;
- locked and primary worktrees cannot be removed;
- removal invalidation clears stale detached selection and returns to an ordinary branch context;
- no database, dependency, or Git history mutation was introduced.

## Self-Review

- Spec coverage: selection, management actions, minimum cleanup, files/status/history/terminal context, safety boundaries, remote support, and disappearance fallback each map to a task.
- Placeholder scan: every implementation and error path is concrete; no deferred or unspecified step remains.
- Type consistency: all later tasks consume `SelectedRepoWorktreeContext`, `selectedDetachedWorktreePath`, `selectDetachedWorktree`, and detached navigation names defined in Task 1; exact-path removal and pruning omit `branch`, while branch deletion still requires it.
- Scope control: database persistence, branch creation, branch workflows, auxiliary detached file-area handoff, and package changes are explicitly excluded.
