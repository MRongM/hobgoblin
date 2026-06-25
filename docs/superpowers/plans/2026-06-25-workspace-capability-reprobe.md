# Workspace Capability Reprobe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make manual refresh re-probe an already-open local or SSH workspace so it can switch in place between plain and Git modes.

**Architecture:** Keep `RepoState.isGitRepo` as the single runtime capability flag. Add one repo lifecycle helper that reuses `resolveRepoPath()` and `addResolvedRepo()` for capability changes, then route manual refresh through that helper before Git fetch/snapshot/status work. Keep UI changes narrow: expose the refresh action for plain workspaces without showing Git branch actions.

**Tech Stack:** TypeScript strip-only mode, React, Zustand, Electron renderer/server RPC, Vitest, Bun.

---

## Project Overrides

- Do not add git commit steps. Project instructions explicitly say not to plan or execute git commits unless the user asks.
- Do not create a new git branch or worktree.
- Keep TypeScript strip-only safe: no enums, runtime namespaces, parameter properties, or import aliases.
- Use repo-alias imports with explicit `.ts` / `.tsx` extensions.
- Preserve existing user changes in the working tree.

## File Map

- Modify: `src/web/stores/repos/helpers.ts`
  - Reset Git operations when clearing Git projection so stale branch/snapshot operation views do not survive Git to plain switches.
- Modify: `src/web/stores/repos/lifecycle-write-paths.ts`
  - Mark successful re-resolves available, mark failed reprobes unavailable, rotate tokens on capability/unavailable transitions, and export `reprobeWorkspaceCapability()`.
- Modify: `src/web/stores/repos/refresh.ts`
  - Route `syncAndRefresh()` through `reprobeWorkspaceCapability()` before Git refresh work.
- Modify: `src/web/stores/repos/refresh-test-utils.ts`
  - Add default `repo.probe` and remote target handlers for refresh tests.
- Modify: `src/web/stores/repos/refresh.test.ts`
  - Cover plain to plain, plain to Git, Git to plain, unavailable retry, remote switching, and terminal preservation.
- Modify: `src/web/components/topbar/TopbarRepoControls.tsx`
  - Show `RepoActivityControl` for plain workspaces in the topbar.
- Modify: `src/web/components/repo-toolbar/RepoToolbar.test.tsx`
  - Update non-Git expectations so refresh is visible while Git actions remain hidden.
- Modify: `src/web/components/repo-activity/RepoActivityControl.component.test.tsx`
  - Assert the refresh control renders for plain workspaces.

---

### Task 1: Add Failing Store Tests For Refresh Reprobe

**Files:**
- Modify: `src/web/stores/repos/refresh-test-utils.ts`
- Modify: `src/web/stores/repos/refresh.test.ts`

- [ ] **Step 1: Add default probe handlers to refresh test utilities**

In `src/web/stores/repos/refresh-test-utils.ts`, update `resetRefreshTest()` so refresh tests can call `/api/repo/probe` and remote target resolution:

```ts
export function resetRefreshTest(): void {
  for (const key of Object.keys(rpcHandlers)) delete rpcHandlers[key]
  resetReposStore()
  installGoblinTestBridge(rpcHandlers)
  rpcHandlers['repo.abort'] = async () => false
  rpcHandlers['repo.probe'] = async ({ cwd }: { cwd: string }) => ({
    ok: true,
    root: cwd,
    name: cwd.split('/').at(-1) ?? cwd,
    isGitRepo: true,
  })
  rpcHandlers['remote.resolveTarget'] = async ({ alias, remotePath }: { alias: string; remotePath: string }) => ({
    target: {
      id: `ssh-config://${encodeURIComponent(alias)}${remotePath}`,
      alias,
      host: `${alias}.example.com`,
      user: 'tester',
      port: 22,
      remotePath,
      displayName: `${alias}:${remotePath.split('/').at(-1) || '/'}`,
    },
  })
  rpcHandlers['repo.fetch'] = async () => ({ ok: true, message: 'ok' })
  rpcHandlers['repo.snapshot'] = async () => ({ branches: [], current: '' })
  rpcHandlers['repo.pullRequests'] = async () => []
  rpcHandlers['repo.status'] = async () => []
  rpcHandlers['terminal.create'] = async (input: { kind?: string }) => ({
    ok: true,
    action: input?.kind === 'primary' ? 'reused' : 'created',
    key: input?.kind === 'primary' ? 'repo\0worktree\0terminal-1' : 'repo\0worktree\0terminal-2',
    sessions: [],
  })
  rpcHandlers['terminal.prune'] = async () => ({ pruned: 0, remaining: 0 })
}
```

- [ ] **Step 2: Add local reprobe tests**

In `src/web/stores/repos/refresh.test.ts`, add these tests near the existing non-Git refresh coverage:

```ts
  test('manual refresh reprobes a plain workspace and skips git reads when it remains plain', async () => {
    const token = seedRepoState({
      id: REPO_ID,
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    }).instanceToken
    let probeCount = 0
    let fetchCount = 0
    let snapshotCount = 0
    let statusCount = 0
    rpcHandlers['repo.probe'] = async ({ cwd }: { cwd: string }) => {
      probeCount += 1
      return { ok: true, root: cwd, name: 'plain', isGitRepo: false }
    }
    rpcHandlers['repo.fetch'] = async () => {
      fetchCount += 1
      return { ok: true, message: 'ok' }
    }
    rpcHandlers['repo.snapshot'] = async () => {
      snapshotCount += 1
      return { branches: [branch('main')], current: 'main' }
    }
    rpcHandlers['repo.status'] = async () => {
      statusCount += 1
      return []
    }

    await useReposStore.getState().syncAndRefresh(REPO_ID, { token })

    const repo = useReposStore.getState().repos[REPO_ID]
    expect(probeCount).toBe(1)
    expect(fetchCount).toBe(0)
    expect(snapshotCount).toBe(0)
    expect(statusCount).toBe(0)
    expect(repo?.isGitRepo).toBe(false)
    expect(repo?.data.branches).toEqual([])
    expect(repo?.operations.manualRefresh.phase).toBe('idle')
  })

  test('manual refresh switches a plain local workspace to git and refreshes git data', async () => {
    const token = seedRepoState({
      id: REPO_ID,
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    }).instanceToken
    const calls = { probe: 0, snapshot: 0, status: 0 }
    rpcHandlers['repo.probe'] = async ({ cwd }: { cwd: string }) => {
      calls.probe += 1
      return { ok: true, root: cwd, name: 'repo', isGitRepo: true }
    }
    rpcHandlers['repo.snapshot'] = async () => {
      calls.snapshot += 1
      return { branches: [branch('main')], current: 'main' }
    }
    rpcHandlers['repo.status'] = async () => {
      calls.status += 1
      return []
    }

    await useReposStore.getState().syncAndRefresh(REPO_ID, { token })

    const repo = useReposStore.getState().repos[REPO_ID]
    expect(calls.probe).toBe(1)
    expect(calls.snapshot).toBe(1)
    expect(calls.status).toBe(1)
    expect(repo?.isGitRepo).toBe(true)
    expect(repo?.data.currentBranch).toBe('main')
    expect(repo?.data.branches.map((entry) => entry.name)).toEqual(['main'])
  })

  test('manual refresh switches a git local workspace to plain and clears git projection', async () => {
    const token = seedRepo([branch('main')])
    updateRepoForTest((repo) => {
      repo.data.status = [{ path: REPO_ID, branch: 'main', isMain: true, entries: [{ x: 'M', y: ' ', path: 'README.md' }] }]
      repo.data.statusLoaded = true
      repo.ui.selectedBranch = 'main'
      repo.remote.remotes = ['origin']
      repo.remote.hasRemotes = true
      repo.remote.hasGitHubRemote = true
    })
    let snapshotCount = 0
    let statusCount = 0
    let terminalPruneCount = 0
    rpcHandlers['repo.probe'] = async ({ cwd }: { cwd: string }) => ({ ok: true, root: cwd, name: 'plain', isGitRepo: false })
    rpcHandlers['repo.snapshot'] = async () => {
      snapshotCount += 1
      return { branches: [branch('stale')], current: 'stale' }
    }
    rpcHandlers['repo.status'] = async () => {
      statusCount += 1
      return []
    }
    rpcHandlers['terminal.prune'] = async () => {
      terminalPruneCount += 1
      return { pruned: 0, remaining: 1 }
    }

    await useReposStore.getState().syncAndRefresh(REPO_ID, { token })

    const repo = useReposStore.getState().repos[REPO_ID]
    expect(repo?.isGitRepo).toBe(false)
    expect(repo?.data).toMatchObject({
      branches: [],
      currentBranch: '',
      status: [],
      statusLoaded: false,
      worktreesByPath: {},
    })
    expect(repo?.ui.selectedBranch).toBeNull()
    expect(repo?.remote.hasRemotes).toBe(false)
    expect(snapshotCount).toBe(0)
    expect(statusCount).toBe(0)
    expect(terminalPruneCount).toBe(0)
  })
```

- [ ] **Step 3: Add unavailable and remote reprobe tests**

In the same `describe('repo refresh')` block, add:

```ts
  test('manual refresh marks probe failures unavailable and retry can restore a plain workspace', async () => {
    const token = seedRepo([branch('main')])
    rpcHandlers['repo.probe'] = async () => ({ ok: false, message: 'error.path-not-found' })

    await useReposStore.getState().syncAndRefresh(REPO_ID, { token })

    const unavailable = useReposStore.getState().repos[REPO_ID]
    expect(unavailable?.availability).toMatchObject({ phase: 'unavailable', reason: 'error.path-not-found' })

    const retryToken = unavailable!.instanceToken
    rpcHandlers['repo.probe'] = async ({ cwd }: { cwd: string }) => ({ ok: true, root: cwd, name: 'plain', isGitRepo: false })

    await useReposStore.getState().syncAndRefresh(REPO_ID, { token: retryToken })

    const restored = useReposStore.getState().repos[REPO_ID]
    expect(restored?.availability).toEqual({ phase: 'available' })
    expect(restored?.isGitRepo).toBe(false)
    expect(restored?.data.branches).toEqual([])
  })

  test('manual refresh switches a remote plain workspace to git through the same reprobe path', async () => {
    const remoteId = 'ssh-config://prod/srv/plain'
    const token = seedRepoState({
      id: remoteId,
      name: 'prod:plain',
      isGitRepo: false,
      branches: [],
      selectedBranch: null,
      remote: {
        target: {
          id: remoteId,
          alias: 'prod',
          host: 'prod.example.com',
          user: 'tester',
          port: 22,
          remotePath: '/srv/plain',
          displayName: 'prod:plain',
        },
      },
    }).instanceToken
    rpcHandlers['repo.probe'] = async ({ cwd }: { cwd: string }) => ({
      ok: true,
      root: cwd,
      name: 'prod:plain',
      isGitRepo: true,
    })
    rpcHandlers['repo.snapshot'] = async () => ({ branches: [branch('main')], current: 'main' })
    rpcHandlers['repo.status'] = async () => []

    await useReposStore.getState().syncAndRefresh(remoteId, { token })

    const repo = useReposStore.getState().repos[remoteId]
    expect(repo?.isGitRepo).toBe(true)
    expect(repo?.data.currentBranch).toBe('main')
    expect(repo?.remote.target?.remotePath).toBe('/srv/plain')
  })
```

- [ ] **Step 4: Run the new tests and verify they fail**

Run:

```bash
bun run test src/web/stores/repos/refresh.test.ts
```

Expected before implementation: at least the new reprobe tests fail because `syncAndRefresh()` returns early for `isGitRepo === false` and does not call `repo.probe`.

---

### Task 2: Implement Lifecycle Reprobe State Transitions

**Files:**
- Modify: `src/web/stores/repos/helpers.ts`
- Modify: `src/web/stores/repos/lifecycle-write-paths.ts`

- [ ] **Step 1: Reset operations when Git projection is cleared**

In `src/web/stores/repos/helpers.ts`, update `clearGitProjection()` to reset operation views:

```ts
export function clearGitProjection(repo: Draft<RepoState> | RepoState): void {
  const target = repo.remote.target
  repo.data.branches = []
  repo.data.currentBranch = ''
  repo.data.status = []
  repo.data.statusLoaded = false
  repo.data.worktreesByPath = {}
  repo.resources = emptyRepoResources()
  repo.operations = emptyRepoOperations()
  repo.ui.selectedBranch = null
  repo.ui.worktreePathOrder = []
  repo.projection = { source: 'fresh', savedAt: null }
  repo.remote = {
    ...(target ? { target } : {}),
    remotes: [],
    remoteDetails: [],
    hasRemotes: false,
    hasBrowserRemote: false,
    browserRemoteProvider: undefined,
    remoteProviders: {},
    hasGitHubRemote: false,
    fetchFailed: false,
    fetchError: null,
  }
}
```

- [ ] **Step 2: Import availability helpers in lifecycle write paths**

In `src/web/stores/repos/lifecycle-write-paths.ts`, add:

```ts
import { markRepoAvailable, markRepoUnavailable } from '#/web/stores/repos/availability.ts'
```

- [ ] **Step 3: Make successful re-resolve mark existing repos available**

In `addResolvedRepo()`, update the existing-repo branch so a successful probe is a state change when the repo was unavailable:

```ts
  if (existing) {
    const nextIsGitRepo = resolvedRepo.isGitRepo ?? true
    const targetChanged =
      !!resolvedRepo.target &&
      (!existing.remote.target ||
        existing.remote.target.alias !== resolvedRepo.target.alias ||
        existing.remote.target.host !== resolvedRepo.target.host ||
        existing.remote.target.user !== resolvedRepo.target.user ||
        existing.remote.target.port !== resolvedRepo.target.port ||
        existing.remote.target.remotePath !== resolvedRepo.target.remotePath)
    const capabilityChanged = existing.isGitRepo !== nextIsGitRepo
    const availabilityChanged = existing.availability.phase !== 'available'
    if (!targetChanged && !capabilityChanged && !availabilityChanged) {
      return { repos: s.repos, order: s.order, changed: false }
    }
    const nextRepo = replaceRepo(existing, (draft) => {
      if (capabilityChanged) rotateRepoInstanceToken(draft)
      draft.isGitRepo = nextIsGitRepo
      markRepoAvailable(draft)
      if (!nextIsGitRepo) clearGitProjection(draft)
      if (targetChanged && resolvedRepo.target) draft.remote.target = resolvedRepo.target
    })
    return {
      repos: {
        ...s.repos,
        [id]: nextRepo,
      },
      order: s.order,
      changed: true,
    }
  }
```

- [ ] **Step 4: Add the reprobe result types and session entry helper**

In `src/web/stores/repos/lifecycle-write-paths.ts`, below `interface InitialRepoRefresh`, add:

```ts
export type WorkspaceCapabilityReprobeResult =
  | { kind: 'available'; id: string; token: number; isGitRepo: boolean; changed: boolean }
  | { kind: 'unavailable'; id: string; token: number; message: string }
  | { kind: 'stale' }

function sessionEntryForReprobe(repo: Pick<ReposStore['repos'][string], 'id' | 'remote'>): string | RepoSessionEntry {
  return repo.remote.target ? remoteRepoSessionEntry(repo.remote.target) : repo.id
}
```

- [ ] **Step 5: Add the exported lifecycle reprobe helper**

In `src/web/stores/repos/lifecycle-write-paths.ts`, add this function above `refreshInitialRepoState()`:

```ts
export async function reprobeWorkspaceCapability(
  set: ReposSet,
  get: ReposGet,
  id: string,
  token: number,
): Promise<WorkspaceCapabilityReprobeResult> {
  const current = get().repos[id]
  if (!current || current.instanceToken !== token) return { kind: 'stale' }

  const resolved = await resolveRepoPath(sessionEntryForReprobe(current), undefined, 'error.not-git-repo')

  const fresh = get().repos[id]
  if (!fresh || fresh.instanceToken !== token) return { kind: 'stale' }

  if (!resolved.repo) {
    const message = resolved.reason ?? 'error.failed-read-repo'
    let nextToken = token
    set((s) => {
      const repo = s.repos[id]
      if (!repo || repo.instanceToken !== token) return s
      const nextRepo = replaceRepo(repo, (draft) => {
        rotateRepoInstanceToken(draft)
        markRepoUnavailable(draft, message)
      })
      nextToken = nextRepo.instanceToken
      return { repos: { ...s.repos, [id]: nextRepo } }
    })
    return { kind: 'unavailable', id, token: nextToken, message }
  }

  let next:
    | {
        token: number
        isGitRepo: boolean
        changed: boolean
      }
    | null = null

  set((s) => {
    const repo = s.repos[id]
    if (!repo || repo.instanceToken !== token) return s
    const result = addResolvedRepo(s, resolved.repo)
    const nextRepo = result.repos[resolved.repo.id]
    if (nextRepo) {
      next = {
        token: nextRepo.instanceToken,
        isGitRepo: nextRepo.isGitRepo,
        changed: result.changed,
      }
    }
    return result.changed ? { repos: result.repos, order: result.order } : s
  })

  if (!next) return { kind: 'stale' }
  return {
    kind: 'available',
    id: resolved.repo.id,
    token: next.token,
    isGitRepo: next.isGitRepo,
    changed: next.changed,
  }
}
```

- [ ] **Step 6: Run lifecycle tests**

Run:

```bash
bun run test src/web/stores/repos/lifecycle.test.ts
```

Expected after this task: lifecycle tests pass. The refresh tests from Task 1 may still fail until `syncAndRefresh()` uses the new helper.

---

### Task 3: Route Manual Refresh Through Capability Reprobe

**Files:**
- Modify: `src/web/stores/repos/refresh.ts`

- [ ] **Step 1: Import the reprobe helper**

In `src/web/stores/repos/refresh.ts`, add:

```ts
import { reprobeWorkspaceCapability } from '#/web/stores/repos/lifecycle-write-paths.ts'
```

- [ ] **Step 2: Replace `syncAndRefresh()` with reprobe-aware behavior**

Replace the existing `syncAndRefresh()` implementation with:

```ts
    async syncAndRefresh(id: string, options?: { token?: number }) {
      const resolved = resolveActionToken(get, id, options?.token)
      if (!resolved) return
      const { token } = resolved
      await runExclusiveOperation({
        set,
        get,
        id,
        token,
        lane: 'read',
        priority: 100,
        targets: [{ key: 'manualRefresh', reason: 'manual-refresh' }],
        task: async () =>
          await runWithRepoInvalidationSource('manual', async (sourceToken) => {
            const capability = await reprobeWorkspaceCapability(set, get, id, token)
            if (capability.kind !== 'available') return
            if (!capability.isGitRepo) return
            await runManualSyncPipeline(capability.id, capability.token, sourceToken)
          }),
      })
    },
```

This intentionally removes the early `repoSupportsGitData(repoBefore)` return from `syncAndRefresh()` only. Keep the Git guards in `refreshSnapshot()`, `refreshStatus()`, `refreshPullRequests()`, and `refreshCoreData()`.

- [ ] **Step 3: Run refresh tests**

Run:

```bash
bun run test src/web/stores/repos/refresh.test.ts
```

Expected after this task: the new Task 1 tests pass, and the existing non-Git Git-read guard test still passes for direct `refreshCoreData()`, `refreshSnapshot()`, `refreshStatus()`, and `refreshPullRequests()` calls.

---

### Task 4: Expose Refresh For Plain Workspaces

**Files:**
- Modify: `src/web/components/topbar/TopbarRepoControls.tsx`
- Modify: `src/web/components/repo-toolbar/RepoToolbar.test.tsx`
- Modify: `src/web/components/repo-activity/RepoActivityControl.component.test.tsx`

- [ ] **Step 1: Add failing topbar and activity tests**

In `src/web/components/repo-toolbar/RepoToolbar.test.tsx`, update the first `TopbarRepoControls` test expectation:

```ts
  test('keeps workspace layout and refresh controls for non-git local workspaces while hiding git actions', () => {
    seedRepoState({
      id: REPO_ID,
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })

    renderControls(navigationWith({}))

    expect(container?.querySelector('button[aria-label="action.refresh"]')).not.toBeNull()
    expect(container?.querySelector('button[aria-label="action.create-worktree-title"]')).toBeNull()
    expect(container?.querySelector('button[aria-label="branches.switch"]')).toBeNull()
    expect(container?.querySelector('button[aria-label="action.menu"]')).toBeNull()
    expect(container?.querySelector('[aria-label="workspace.layout-label"]')).not.toBeNull()

    act(() => {
      container?.querySelector<HTMLButtonElement>('button[aria-label="workspace.layout-tooltip.left-right"]')?.click()
    })

    expect(useReposStore.getState().workspaceLayout).toBe('left-right')
  })
```

In `src/web/components/repo-activity/RepoActivityControl.component.test.tsx`, add:

```ts
  test('renders the primary refresh button for plain workspaces', () => {
    seedRepoState({
      id: REPO_ID,
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })

    render(<RepoActivityControl repoId={REPO_ID} />)

    expect(button().disabled).toBe(false)
    expect(button().getAttribute('aria-label')).toBe('action.refresh')
  })
```

- [ ] **Step 2: Run the UI tests and verify the topbar test fails**

Run:

```bash
bun run test src/web/components/repo-toolbar/RepoToolbar.test.tsx src/web/components/repo-activity/RepoActivityControl.component.test.tsx
```

Expected before implementation: the topbar test fails because `TopbarRepoControls` does not render `RepoActivityControl` for plain workspaces.

- [ ] **Step 3: Render refresh in the topbar for plain workspaces**

In `src/web/components/topbar/TopbarRepoControls.tsx`, add the import:

```ts
import { RepoActivityControl } from '#/web/components/repo-activity/RepoActivityControl.tsx'
```

Then update the return block:

```tsx
  return (
    <div className="flex h-full shrink-0 items-center gap-1">
      {isGitRepo && focusMode && <FocusBranchControls repoId={repoId} />}
      {!isGitRepo && <RepoActivityControl repoId={repoId} compact />}
      <WorkspaceLayoutControlConnected repoId={repoId} />
    </div>
  )
```

- [ ] **Step 4: Run the UI tests**

Run:

```bash
bun run test src/web/components/repo-toolbar/RepoToolbar.test.tsx src/web/components/repo-activity/RepoActivityControl.component.test.tsx
```

Expected after this task: both tests pass. Git workspaces still do not get a duplicate topbar refresh button.

---

### Task 5: Verify Terminal Preservation And Workspace UI Switching

**Files:**
- Modify: `src/web/components/RepoView.test.tsx`
- Modify: `src/web/stores/repos/refresh.test.ts`

- [ ] **Step 1: Add a RepoView switching regression test**

In `src/web/components/RepoView.test.tsx`, add:

```ts
  test('switches from plain workspace shell to git workspace shell when repo capability changes', () => {
    seedRepoState({
      id: REPO_ID,
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })
    useReposStore.setState({ workspaceLayout: 'top-bottom', detailCollapsed: false })

    renderRepoView()

    expect(container?.querySelector('[data-testid="branch-detail"]')).toBeNull()

    act(() => {
      useReposStore.setState((state) => {
        const repo = state.repos[REPO_ID]
        if (!repo) return state
        return {
          repos: {
            ...state.repos,
            [REPO_ID]: {
              ...repo,
              isGitRepo: true,
              data: {
                ...repo.data,
                branches: [createRepoBranch('main', { worktree: { path: REPO_ID } })],
                currentBranch: 'main',
              },
              ui: {
                ...repo.ui,
                selectedBranch: 'main',
              },
            },
          },
        }
      })
    })

    expect(container?.querySelector('[data-testid="branch-detail"]')).not.toBeNull()
  })
```

- [ ] **Step 2: Add an explicit terminal no-close assertion to refresh tests**

In `src/web/stores/repos/refresh.test.ts`, extend the Git to plain test from Task 1 with a terminal close counter:

```ts
    let terminalCloseCount = 0
    rpcHandlers['terminal.close'] = async () => {
      terminalCloseCount += 1
      return true
    }
```

Add this assertion at the end of that test:

```ts
    expect(terminalCloseCount).toBe(0)
```

- [ ] **Step 3: Run focused UI and refresh tests**

Run:

```bash
bun run test src/web/components/RepoView.test.tsx src/web/stores/repos/refresh.test.ts
```

Expected after this task: tests pass and confirm UI mode follows `isGitRepo` without terminal close calls during Git to plain switching.

---

### Task 6: Full Verification

**Files:**
- No source edits in this task.

- [ ] **Step 1: Run focused workspace capability tests**

Run:

```bash
bun run test src/web/stores/repos/refresh.test.ts src/web/stores/repos/lifecycle.test.ts src/web/components/repo-toolbar/RepoToolbar.test.tsx src/web/components/repo-activity/RepoActivityControl.component.test.tsx src/web/components/RepoView.test.tsx
```

Expected: all focused tests pass.

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: typecheck passes with no TypeScript strip-only violations.

- [ ] **Step 3: Run full test suite**

Run:

```bash
bun run test
```

Expected: full test suite passes. If unrelated pre-existing failures appear, capture the failing file names and error messages without changing unrelated files.

- [ ] **Step 4: Run architecture guard**

Run:

```bash
bun run check:architecture
```

Expected: architecture guard passes. The change must not introduce imports from `src/web/**` into `src/main/**`, imports from `src/main/**` into `src/web/**`, or Electron imports into `src/server/**` / `src/shared/**`.
