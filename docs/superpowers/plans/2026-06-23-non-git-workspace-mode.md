# Non-Git Workspace Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let readable non-Git local directories open as plain workspaces with files and terminal, while hiding branch/Git features and allowing remote test/import without Git checks.

**Architecture:** Keep `RepoState.isGitRepo` as the single capability flag. Gate Git read/write flows in the repo store, route non-Git local UI through a dedicated plain workspace pane, and use a small terminal compatibility boundary where the opened directory is both `repoRoot` and `worktreePath`. Remote diagnostics still validate SSH, shell, and path access, but mark Git/repo checks as skipped instead of blockers.

**Tech Stack:** TypeScript, React, Zustand, Hono/server modules, Vitest, xterm terminal session model.

---

## Safety Note

This repository's `AGENTS.md` says not to plan or execute Git commits unless the user explicitly requests them. This plan intentionally omits commit steps. After implementation and verification, ask for explicit confirmation before any `git commit`.

Deleting `src/web/components/repo-workspace/NonGitRepoPlaceholder.tsx` is part of this plan because the approved design removes Git initialization UI. During execution, confirm deletion before removing the file.

## File Map

- Modify `src/system/ssh/diagnostics.ts`: remote diagnostics skip Git availability and Git repository checks.
- Modify `src/system/ssh/diagnostics.test.ts`: coverage for path-only remote diagnostics.
- Create `src/web/stores/repos/capabilities.ts`: centralized `isGitRepo` capability helpers and non-Git operation result.
- Modify `src/web/stores/repos/refresh.ts`: no-op Git refreshes for non-Git repos.
- Modify `src/web/stores/repos/branch-actions.ts`: reject hidden branch actions for non-Git repos before scheduling RPC work.
- Modify `src/web/stores/repos/test-utils.ts`: allow tests to seed `isGitRepo: false`.
- Modify `src/web/stores/repos/refresh.test.ts`: non-Git refresh gating tests.
- Modify `src/web/stores/repos/branch-actions.test.ts`: non-Git branch action gating tests.
- Modify `src/shared/terminal.ts`: add the internal non-Git workspace terminal branch label.
- Modify `src/server/terminal/terminal-catalog.ts`: create local non-Git terminal sessions without worktree lookup.
- Modify `src/server/terminal/terminal.test.ts`: server terminal creation coverage for non-Git local workspaces.
- Modify `src/web/components/terminal/terminal-repo-index.ts`: expose a synthetic terminal worktree mapping for non-Git repos.
- Create `src/web/components/terminal/terminal-repo-index.test.ts`: renderer terminal index coverage.
- Create `src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.tsx`: terminal tab content for plain workspaces.
- Create `src/web/components/repo-workspace/PlainWorkspacePane.tsx`: Files/Terminal-only plain workspace pane.
- Modify `src/web/components/repo-workspace/RepoExplorerPane.tsx`: route non-Git local repos to `PlainWorkspacePane`.
- Modify `src/web/components/repo-workspace/RepoExplorerPane.test.tsx`: plain workspace tab/layout tests.
- Modify `src/web/components/RepoView.tsx`: avoid rendering branch detail for non-Git local workspaces.
- Modify `src/web/components/RepoView.test.tsx`: assert branch detail is not mounted for non-Git workspaces.
- Modify `src/web/components/repo-toolbar/RepoToolbar.tsx`: hide branch toolbar for non-Git repos.
- Modify `src/web/components/repo-toolbar/RepoToolbarActions.tsx`: hide create-worktree/activity controls for non-Git repos.
- Modify `src/web/components/topbar/TopbarRepoControls.tsx`: hide topbar repo controls for non-Git repos.
- Modify `src/web/components/repo-toolbar/RepoToolbar.test.tsx`: non-Git topbar controls tests.
- Modify `src/web/components/RepoTabs.tsx`: pass `isGitRepo` and non-Git terminal worktree path to repo tab summaries.
- Modify `src/web/components/repo-tabs/types.ts`: add `isGitRepo` to `RepoTabSummary`.
- Modify `src/web/components/repo-tabs/RepoTab.tsx`: use a plain folder icon/data attribute for non-Git local workspaces.
- Modify `src/web/components/repo-tabs/RepoTabStrip.test.tsx`: repo kind data attribute coverage.
- Delete `src/web/components/repo-workspace/NonGitRepoPlaceholder.tsx`: obsolete Git-init placeholder.

---

### Task 1: Remote Diagnostics Skip Git Checks

**Files:**
- Modify: `src/system/ssh/diagnostics.test.ts`
- Modify: `src/system/ssh/diagnostics.ts`

- [ ] **Step 1: Write failing remote diagnostics tests**

Replace the import at the top of `src/system/ssh/diagnostics.test.ts` with:

```ts
import { describe, expect, test } from 'vitest'
import { classifySshFailure, testRemoteRepository } from '#/system/ssh/diagnostics.ts'
import type { RemoteCommandKind, RemoteCommandResult } from '#/system/ssh/commands.ts'
import type { RemoteRepoTarget } from '#/shared/remote-repo.ts'
```

Append these helpers and tests after the existing `classifySshFailure` block:

```ts
const target: RemoteRepoTarget = {
  id: 'ssh-config://prod/srv/app',
  alias: 'prod',
  host: 'example.com',
  user: 'alice',
  port: 22,
  remotePath: '/srv/app',
  displayName: 'prod:app',
}

function ok(stdout = 'ok'): RemoteCommandResult {
  return { ok: true, stdout, stderr: '', message: 'ok', timedOut: false }
}

function fail(message: string): RemoteCommandResult {
  return { ok: false, stdout: '', stderr: message, message, timedOut: false }
}

describe('testRemoteRepository', () => {
  test('passes when ssh, shell, and directory path checks pass without running git checks', async () => {
    const calls: RemoteCommandKind['type'][] = []

    const result = await testRemoteRepository(target, {
      run: async (command) => {
        calls.push(command.type)
        switch (command.type) {
          case 'checkShell':
            return ok('ok')
          case 'testDirectory':
            return ok('')
          case 'checkGit':
          case 'revParseTopLevel':
          case 'listDirectories':
          case 'printHome':
            throw new Error(`unexpected command: ${command.type}`)
        }
      },
    })

    expect(result.ok).toBe(true)
    expect(calls).toEqual(['checkShell', 'testDirectory'])
    expect(result.stages).toEqual([
      { name: 'ssh', label: 'ssh', status: 'passed' },
      { name: 'shell', label: 'shell', status: 'passed' },
      { name: 'git', label: 'git', status: 'skipped' },
      { name: 'path', label: 'path', status: 'passed' },
      { name: 'repo', label: 'repo', status: 'skipped' },
    ])
  })

  test('fails on missing remote directory without running git checks', async () => {
    const calls: RemoteCommandKind['type'][] = []

    const result = await testRemoteRepository(target, {
      run: async (command) => {
        calls.push(command.type)
        switch (command.type) {
          case 'checkShell':
            return ok('ok')
          case 'testDirectory':
            return fail('missing')
          case 'checkGit':
          case 'revParseTopLevel':
          case 'listDirectories':
          case 'printHome':
            throw new Error(`unexpected command: ${command.type}`)
        }
      },
    })

    expect(result.ok).toBe(false)
    expect(result.category).toBe('path-missing')
    expect(calls).toEqual(['checkShell', 'testDirectory'])
    expect(result.stages[2]).toEqual({ name: 'git', label: 'git', status: 'skipped' })
    expect(result.stages[3]).toMatchObject({ name: 'path', status: 'failed', category: 'path-missing' })
    expect(result.stages[4]).toEqual({ name: 'repo', label: 'repo', status: 'skipped' })
  })
})
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
bun run test src/system/ssh/diagnostics.test.ts
```

Expected: the new tests fail because `testRemoteRepository` still calls `checkGit` and `revParseTopLevel`.

- [ ] **Step 3: Replace `testRemoteRepository` with path-only diagnostics**

In `src/system/ssh/diagnostics.ts`, replace the full `testRemoteRepository` function with:

```ts
export async function testRemoteRepository(
  target: RemoteRepoTarget,
  options: { signal?: AbortSignal; run?: DiagnosticsRunner } = {},
): Promise<RemoteDiagnosticsResult> {
  const run: DiagnosticsRunner = options.run ?? ((command, t, runOptions) => runRemoteCommand(t, command, runOptions))
  const stages = createStages()
  const fail = (
    index: number,
    category: RemoteDiagnosticCategory,
    result: RemoteCommandResult,
  ): RemoteDiagnosticsResult => {
    stages[index] = {
      ...stages[index]!,
      status: 'failed',
      category,
      message: category,
      details: detailsFromResult(result),
    }
    for (let i = index + 1; i < stages.length; i += 1) stages[i] = { ...stages[i]!, status: 'skipped' }
    return {
      target,
      ok: false,
      category,
      message: category,
      details: detailsFromResult(result),
      stages,
    }
  }

  const shell = await run({ type: 'checkShell' }, target, { signal: options.signal })
  if (!shell.ok) return fail(0, classifySshFailure(shell), shell)
  stages[0] = { ...stages[0]!, status: 'passed' }
  if (shell.stdout.trim() !== 'ok') return fail(1, 'shell-failed', { ...shell, message: 'shell-failed' })
  stages[1] = { ...stages[1]!, status: 'passed' }
  stages[2] = { ...stages[2]!, status: 'skipped' }

  const path = await run({ type: 'testDirectory', path: target.remotePath }, target, { signal: options.signal })
  if (!path.ok) return fail(3, classifyCommandFailure(path, 'path-missing'), path)
  stages[3] = { ...stages[3]!, status: 'passed' }
  stages[4] = { ...stages[4]!, status: 'skipped' }

  return { target, ok: true, stages }
}
```

- [ ] **Step 4: Run the focused test and confirm it passes**

Run:

```bash
bun run test src/system/ssh/diagnostics.test.ts
```

Expected: all tests in `diagnostics.test.ts` pass.

---

### Task 2: Gate Git Refreshes And Branch Actions For Non-Git Repos

**Files:**
- Create: `src/web/stores/repos/capabilities.ts`
- Modify: `src/web/stores/repos/test-utils.ts`
- Modify: `src/web/stores/repos/refresh.ts`
- Modify: `src/web/stores/repos/branch-actions.ts`
- Modify: `src/web/stores/repos/refresh.test.ts`
- Modify: `src/web/stores/repos/branch-actions.test.ts`

- [ ] **Step 1: Write failing store tests**

In `src/web/stores/repos/refresh.test.ts`, append this test inside `describe('remote fetch timestamps', () => { ... })`:

```ts
  test('non-git repositories skip git refresh and manual sync paths', async () => {
    seedRepoState({
      id: REPO_ID,
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })
    let fetchCount = 0
    let snapshotCount = 0
    let statusCount = 0
    rpcHandlers['repo.fetch'] = async () => {
      fetchCount += 1
      return { ok: true, message: 'ok' }
    }
    rpcHandlers['repo.snapshot'] = async () => {
      snapshotCount += 1
      return { branches: [branch('feature/a')], current: 'feature/a' }
    }
    rpcHandlers['repo.status'] = async () => {
      statusCount += 1
      return []
    }

    await useReposStore.getState().refreshCoreData(REPO_ID, { token: 1 })
    await useReposStore.getState().syncAndRefresh(REPO_ID, { token: 1 })
    await useReposStore.getState().refreshPullRequests(REPO_ID, ['feature/a'], { token: 1 })

    expect(fetchCount).toBe(0)
    expect(snapshotCount).toBe(0)
    expect(statusCount).toBe(0)
    expect(useReposStore.getState().repos[REPO_ID]?.data.branches).toEqual([])
    expect(useReposStore.getState().repos[REPO_ID]?.resources.snapshot.phase).toBe('idle')
    expect(useReposStore.getState().repos[REPO_ID]?.resources.status.phase).toBe('idle')
  })
```

In `src/web/stores/repos/branch-actions.test.ts`, append this test inside `describe('runBranchAction', () => { ... })`:

```ts
  test('rejects branch actions for non-git repositories before rpc scheduling', async () => {
    let checkoutCount = 0
    installGoblinTestBridge({
      'repo.checkout': async () => {
        checkoutCount += 1
        return { ok: true, message: 'ok' }
      },
    })
    updateRepoForTest((repo) => {
      repo.isGitRepo = false
    })

    const result = await useReposStore
      .getState()
      .runBranchAction(REPO_ID, { kind: 'checkout', branch: 'feature/a' }, { token: 1 })

    expect(result).toEqual({ ok: false, message: 'error.not-git-repo' })
    expect(checkoutCount).toBe(0)
    expect(useReposStore.getState().repos[REPO_ID]?.operations.branchAction.phase).toBe('idle')
    expect(useReposStore.getState().repos[REPO_ID]?.events.at(-1)).toMatchObject({
      kind: 'result',
      result: { ok: false, message: 'error.not-git-repo' },
    })
  })
```

- [ ] **Step 2: Run focused tests and confirm they fail**

Run:

```bash
bun run test src/web/stores/repos/refresh.test.ts src/web/stores/repos/branch-actions.test.ts
```

Expected: TypeScript or runtime failures because `seedRepoState` does not accept `isGitRepo`, refresh still calls Git RPCs, and branch actions still schedule Git RPCs.

- [ ] **Step 3: Add repo capability helpers**

Create `src/web/stores/repos/capabilities.ts`:

```ts
import type { ExecResult } from '#/web/types.ts'
import type { RepoState } from '#/web/stores/repos/types.ts'

export const NON_GIT_REPO_OPERATION_RESULT: ExecResult = {
  ok: false,
  message: 'error.not-git-repo',
}

export function repoSupportsGitData(repo: Pick<RepoState, 'isGitRepo'> | null | undefined): boolean {
  return !!repo && repo.isGitRepo !== false
}
```

- [ ] **Step 4: Allow tests to seed non-Git repo state**

In `src/web/stores/repos/test-utils.ts`, add `isGitRepo?: boolean` to the `seedRepoState` options type:

```ts
  isGitRepo?: boolean
```

In the `repo: RepoState = { ... }` object inside `seedRepoState`, add:

```ts
    isGitRepo: options.isGitRepo ?? base.isGitRepo,
```

Place it directly after `instanceToken`.

- [ ] **Step 5: Gate refresh actions**

In `src/web/stores/repos/refresh.ts`, add:

```ts
import { repoSupportsGitData } from '#/web/stores/repos/capabilities.ts'
```

Then add a non-Git guard after each `resolveActionToken` call in `refreshSnapshot`, `refreshPullRequests`, `refreshStatus`, `refreshCoreData`, and `syncAndRefresh`.

For `refreshSnapshot`, use this shape:

```ts
      const resolved = resolveActionToken(get, id, options?.token)
      if (!resolved) return
      const { repo: repoBefore, token } = resolved
      if (!repoSupportsGitData(repoBefore)) return
```

For `refreshPullRequests`, keep the existing `repoBefore` variable and add:

```ts
      if (!repoSupportsGitData(repoBefore)) return
```

For `refreshStatus`, `refreshCoreData`, and `syncAndRefresh`, use the same `repoBefore` pattern as `refreshSnapshot` so each function returns before starting resources or scheduling operations.

- [ ] **Step 6: Gate branch actions**

In `src/web/stores/repos/branch-actions.ts`, add:

```ts
import { NON_GIT_REPO_OPERATION_RESULT, repoSupportsGitData } from '#/web/stores/repos/capabilities.ts'
```

In `runBranchAction`, directly after the availability check:

```ts
      if (repoBefore.availability.phase === 'unavailable') {
        return { ok: false, message: repoBefore.availability.reason }
      }
      if (!repoSupportsGitData(repoBefore)) {
        const result = NON_GIT_REPO_OPERATION_RESULT
        get().setLastResult(id, result, token)
        return result
      }
```

- [ ] **Step 7: Run focused tests and confirm they pass**

Run:

```bash
bun run test src/web/stores/repos/refresh.test.ts src/web/stores/repos/branch-actions.test.ts
```

Expected: both test files pass.

---

### Task 3: Support Non-Git Local Workspace Terminals

**Files:**
- Modify: `src/shared/terminal.ts`
- Modify: `src/server/terminal/terminal-catalog.ts`
- Modify: `src/server/terminal/terminal.test.ts`
- Modify: `src/web/components/terminal/terminal-repo-index.ts`
- Create: `src/web/components/terminal/terminal-repo-index.test.ts`

- [ ] **Step 1: Write failing terminal tests**

In `src/server/terminal/terminal.test.ts`, add this import:

```ts
import { NON_GIT_WORKSPACE_TERMINAL_BRANCH } from '#/shared/terminal.ts'
import { getWorktrees } from '#/system/git/worktrees.ts'
```

Append this test inside `describe('server terminal sessions', () => { ... })`:

```ts
  test('creates non-git local workspace terminal without resolving git worktrees', async () => {
    vi.mocked(getWorktrees).mockRejectedValueOnce(new Error('not a git repo'))

    const result = await createServerTerminal('client_1', {
      repoRoot: '/plain-project',
      branch: NON_GIT_WORKSPACE_TERMINAL_BRANCH,
      worktreePath: '/plain-project',
      kind: 'additional',
      cols: 120,
      rows: 40,
    })

    expect(result.ok).toBe(true)
    expect(getWorktrees).not.toHaveBeenCalled()
    expect(spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({
        cwd: '/plain-project',
        cols: 120,
        rows: 40,
      }),
    )
    if (!result.ok) return
    expect(result.key).toBe('/plain-project\u0000/plain-project\u0000terminal-1')
  })
```

Create `src/web/components/terminal/terminal-repo-index.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { NON_GIT_WORKSPACE_TERMINAL_BRANCH } from '#/shared/terminal.ts'
import { emptyRepo } from '#/web/stores/repos/helpers.ts'
import { repoIndexFromRepos, branchForTerminalWorktree } from '#/web/components/terminal/terminal-repo-index.ts'
import type { ReposStore } from '#/web/stores/repos/types.ts'

describe('terminal repo index', () => {
  test('maps non-git local workspace root to the internal workspace branch', () => {
    const repo = emptyRepo('/plain-project', 'plain-project')
    repo.isGitRepo = false
    const repos: ReposStore['repos'] = { [repo.id]: repo }

    const index = repoIndexFromRepos(repos)

    expect(index['/plain-project']?.branchByWorktreePath).toEqual({
      '/plain-project': NON_GIT_WORKSPACE_TERMINAL_BRANCH,
    })
    expect(branchForTerminalWorktree(index, '/plain-project', '/plain-project')).toBe(
      NON_GIT_WORKSPACE_TERMINAL_BRANCH,
    )
  })
})
```

- [ ] **Step 2: Run focused tests and confirm they fail**

Run:

```bash
bun run test src/server/terminal/terminal.test.ts src/web/components/terminal/terminal-repo-index.test.ts
```

Expected: failures because the constant and non-Git terminal mapping do not exist, and the server still calls `getWorktrees()`.

- [ ] **Step 3: Add the shared terminal branch label**

In `src/shared/terminal.ts`, add near the top after `TERMINAL_SCROLLBACK_LINES`:

```ts
export const NON_GIT_WORKSPACE_TERMINAL_BRANCH = 'workspace'
```

- [ ] **Step 4: Add non-Git direct-local terminal creation**

In `src/server/terminal/terminal-catalog.ts`, update the shared terminal import to include:

```ts
  NON_GIT_WORKSPACE_TERMINAL_BRANCH,
```

Add this helper above `class TerminalCatalog`:

```ts
function isNonGitLocalWorkspaceTerminal(input: Pick<EnsureTerminalCatalogInput, 'repoRoot' | 'branch' | 'worktreePath'>): boolean {
  return (
    !isRemoteRepoId(input.repoRoot) &&
    input.branch === NON_GIT_WORKSPACE_TERMINAL_BRANCH &&
    path.resolve(input.repoRoot) === path.resolve(input.worktreePath)
  )
}
```

In `ensureLocal`, replace the first four lines with:

```ts
    const worktreePath = path.resolve(input.worktreePath)

    if (!isNonGitLocalWorkspaceTerminal(input)) {
      const worktrees = await getWorktrees(input.repoRoot, { includeStatus: false })
      const resolved = resolveKnownWorktree(worktrees, input.worktreePath, input.branch)
      if (!resolved.ok) return { ok: false, message: resolved.message }
      return await this.ensureLocalSession(clientId, input, context, path.resolve(resolved.path))
    }

    return await this.ensureLocalSession(clientId, input, context, worktreePath)
```

Then extract the remaining `manager.ensureSession` body into a private method below `ensureLocal`:

```ts
  private async ensureLocalSession(
    clientId: string,
    input: EnsureTerminalCatalogInput,
    context: {
      cols: number
      rows: number
      targetSessionKey: string
      action: TerminalCatalogAction
    },
    worktreePath: string,
  ): Promise<EnsureTerminalCatalogResult> {
    const repoRoot = path.resolve(input.repoRoot)
    const result = this.options.manager.ensureSession({
      ownerId: clientId,
      scope: repoRoot,
      key: context.targetSessionKey,
      cwd: worktreePath,
      cols: context.cols,
      rows: context.rows,
      attachmentId: input.attachmentId,
      attachmentConnected: this.options.attachmentIsConnected(clientId, input.attachmentId),
      forceNew: context.action === 'created',
    })
    if (!result.ok) return { ok: false, message: result.message }
    this.options.broadcastSessionsChanged(input.repoRoot)
    return toEnsureResult(context.targetSessionKey, context.action, await this.options.withSessionSnapshot(result))
  }
```

The resulting `ensureLocal` should contain only the non-Git branch, the Git worktree resolution branch, and calls to `ensureLocalSession`.

- [ ] **Step 5: Map non-Git repos in the renderer terminal index**

In `src/web/components/terminal/terminal-repo-index.ts`, add:

```ts
import { NON_GIT_WORKSPACE_TERMINAL_BRANCH } from '#/shared/terminal.ts'
```

Inside `repoIndexFromRepos`, before the branch loop, add:

```ts
    if (repo.isGitRepo === false) {
      branchByWorktreePath[repoRoot] = NON_GIT_WORKSPACE_TERMINAL_BRANCH
    } else {
      for (const branch of repo.data.branches) {
        const worktreePath = branch.worktree?.path
        if (worktreePath) branchByWorktreePath[worktreePath] = branch.name
      }
    }
```

Remove the original unconditional `for (const branch of repo.data.branches)` loop so Git repos still map real worktrees and non-Git repos map only the opened directory.

- [ ] **Step 6: Run focused tests and confirm they pass**

Run:

```bash
bun run test src/server/terminal/terminal.test.ts src/web/components/terminal/terminal-repo-index.test.ts
```

Expected: both test files pass.

---

### Task 4: Render Plain Workspace Files And Terminal Tabs

**Files:**
- Create: `src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.tsx`
- Create: `src/web/components/repo-workspace/PlainWorkspacePane.tsx`
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.tsx`
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.test.tsx`
- Modify: `src/web/components/RepoView.tsx`
- Modify: `src/web/components/RepoView.test.tsx`
- Delete after confirmation: `src/web/components/repo-workspace/NonGitRepoPlaceholder.tsx`

- [ ] **Step 1: Write failing plain workspace UI tests**

In `src/web/components/repo-workspace/RepoExplorerPane.test.tsx`, add this mock near the existing workspace panel mocks:

```ts
vi.mock('#/web/components/repo-workspace/PlainWorkspaceTerminalPanel.tsx', () => ({
  PlainWorkspaceTerminalPanel: ({ repoId }: { repoId: string }) => (
    <div data-testid="plain-workspace-terminal" data-repo-id={repoId} />
  ),
}))
```

Append this test inside `describe('RepoExplorerPane', () => { ... })`:

```ts
  test('renders non-git local workspaces as files and terminal only without a branch pane', async () => {
    seedRepoState({
      id: REPO_ID,
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="top-bottom" showActions />)
    })

    expect(container.querySelector('[data-testid="split-pane"]')).toBeNull()
    expect(container.querySelector('[data-testid="branch-list"]')).toBeNull()
    expect(container.querySelector('[data-testid="branch-area-toolbar"]')).toBeNull()

    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    expect(tabs.map((tab) => tab.textContent)).toEqual(['file-tree.title', 'terminal.label'])
    expect(container.querySelector('[data-testid="project-file-tree"])).toBeTruthy()
    expect(container.querySelector('[data-testid="project-changes-panel"]')).toBeNull()
    expect(container.querySelector('[data-testid="project-status-panel"]')).toBeNull()
    expect(container.querySelector('[data-testid="project-ports-panel"]')).toBeNull()

    await act(async () => {
      tabs[1]?.click()
    })

    expect(container.querySelector('[data-testid="project-file-tree"]')).toBeNull()
    expect(container.querySelector('[data-testid="plain-workspace-terminal"]')?.getAttribute('data-repo-id')).toBe(REPO_ID)
    await act(async () => root.unmount())
  })
```

In `src/web/components/RepoView.test.tsx`, append this test inside `describe('RepoView', () => { ... })`:

```ts
  test('does not mount branch detail for non-git local workspaces', () => {
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
    expect(container?.querySelector('[data-testid="repo-explorer-pane"]')).not.toBeNull()
  })
```

- [ ] **Step 2: Run focused tests and confirm they fail**

Run:

```bash
bun run test src/web/components/repo-workspace/RepoExplorerPane.test.tsx src/web/components/RepoView.test.tsx
```

Expected: failures because non-Git workspaces still use the split Git workspace shape or the old placeholder path.

- [ ] **Step 3: Create `PlainWorkspaceTerminalPanel`**

Create `src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.tsx`:

```tsx
import { useCallback, useMemo } from 'react'
import { NON_GIT_WORKSPACE_TERMINAL_BRANCH } from '#/shared/terminal.ts'
import { EmptyState, Toolbar } from '#/web/components/Layout.tsx'
import { TerminalSlot } from '#/web/components/terminal/TerminalSlot.tsx'
import { EMPTY_TERMINAL_TAB_FOCUS_KEY, TerminalTabs } from '#/web/components/terminal/TerminalTabs.tsx'
import { useTerminalSessionContext } from '#/web/components/terminal/terminal-session-context.ts'
import { worktreeTerminalKey } from '#/web/components/terminal/terminal-session-keys.ts'
import { useWorktreeTerminalSnapshot } from '#/web/components/terminal/terminal-session-store.ts'
import { useFocusRegistry } from '#/web/components/tab-strip/useFocusRegistry.ts'
import { useT } from '#/web/stores/i18n.ts'
import type { TerminalSessionBase } from '#/web/components/terminal/types.ts'

interface PlainWorkspaceTerminalPanelProps {
  repoId: string
}

const DETAIL_ID = 'plain-workspace-terminal'

export function PlainWorkspaceTerminalPanel({ repoId }: PlainWorkspaceTerminalPanelProps) {
  const t = useT()
  const terminalWorktreeKey = worktreeTerminalKey(repoId, repoId)
  const snapshot = useWorktreeTerminalSnapshot(terminalWorktreeKey)
  const terminalTabFocusRegistry = useFocusRegistry<string, HTMLButtonElement>()
  const {
    createTerminal,
    selectTerminal,
    scrollToBottom,
    closeTerminalAndDismissDetailIfLast,
    reorderSessions,
  } = useTerminalSessionContext()

  const terminalBase = useMemo<TerminalSessionBase>(
    () => ({
      repoRoot: repoId,
      branch: NON_GIT_WORKSPACE_TERMINAL_BRANCH,
      worktreePath: repoId,
    }),
    [repoId],
  )

  const handleNewTerminal = useCallback(() => {
    void createTerminal(terminalBase)
  }, [createTerminal, terminalBase])

  const handleSelectTerminal = useCallback(
    (key: string) => {
      selectTerminal(terminalWorktreeKey, key)
    },
    [selectTerminal, terminalWorktreeKey],
  )

  const handleCloseTerminal = useCallback(
    (key: string) => {
      closeTerminalAndDismissDetailIfLast(key, terminalBase)
    },
    [closeTerminalAndDismissDetailIfLast, terminalBase],
  )

  const handleReorderTerminals = useCallback(
    (worktreeKey: string, orderedKeys: string[]) => {
      void reorderSessions(worktreeKey, orderedKeys)
    },
    [reorderSessions],
  )

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-background">
      <Toolbar variant="detail">
        <div className="flex h-full min-w-0 items-center gap-1 overflow-hidden">
          <TerminalTabs
            worktreeTerminalKey={terminalWorktreeKey}
            sessions={snapshot.sessions}
            detailId={DETAIL_ID}
            panelActive
            focusRegistry={terminalTabFocusRegistry}
            emptyFocusKey={EMPTY_TERMINAL_TAB_FOCUS_KEY}
            onNew={handleNewTerminal}
            onSelect={(_worktreeKey, key) => handleSelectTerminal(key)}
            onScrollToBottom={scrollToBottom}
            onClose={handleCloseTerminal}
            onReorder={handleReorderTerminals}
          />
        </div>
      </Toolbar>
      <div className="flex min-h-0 flex-1 flex-col">
        {snapshot.selectedDescriptor ? (
          <TerminalSlot
            repoRoot={repoId}
            branch={snapshot.selectedDescriptor.branch}
            worktreePath={repoId}
          />
        ) : (
          <EmptyState title={t('terminal.label')} body={t('terminal.new')} />
        )}
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Create `PlainWorkspacePane`**

Create `src/web/components/repo-workspace/PlainWorkspacePane.tsx`:

```tsx
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Button } from '#/web/components/ui/button.tsx'
import { Toolbar } from '#/web/components/Layout.tsx'
import { ProjectFileTree } from '#/web/components/file-tree/ProjectFileTree.tsx'
import { PlainWorkspaceTerminalPanel } from '#/web/components/repo-workspace/PlainWorkspaceTerminalPanel.tsx'
import { ToolbarTabStrip, ToolbarTabStripBody } from '#/web/components/tab-strip/ToolbarTabStrip.tsx'
import { cn } from '#/web/lib/cn.ts'
import { useRuntimeFontSettings } from '#/web/runtime-settings-fonts.ts'
import { useT } from '#/web/stores/i18n.ts'
import type { FileTreeRevealRequest } from '#/web/components/repo-workspace/RepoExplorerPane.tsx'

type PlainWorkspaceTab = 'files' | 'terminal'

interface PlainWorkspacePaneProps {
  repoId: string
  revealRequest?: FileTreeRevealRequest | null
}

export function PlainWorkspacePane({ repoId, revealRequest: externalRevealRequest }: PlainWorkspacePaneProps) {
  const t = useT()
  const { fileTreeTopbarFontSize } = useRuntimeFontSettings()
  const [activeTab, setActiveTab] = useState<PlainWorkspaceTab>('files')
  const [revealRequest, setRevealRequest] = useState<FileTreeRevealRequest | null>(null)
  const toolbarStyle = {
    '--goblin-file-tree-topbar-font-size': `${fileTreeTopbarFontSize}px`,
  } as CSSProperties
  const tabs = [
    { id: 'files' as const, label: t('file-tree.title') },
    { id: 'terminal' as const, label: t('terminal.label') },
  ] satisfies { id: PlainWorkspaceTab; label: string }[]

  useEffect(() => {
    if (!externalRevealRequest) return
    setActiveTab('files')
    setRevealRequest(externalRevealRequest)
  }, [externalRevealRequest])

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
      <Toolbar data-testid="plain-workspace-toolbar" className="px-2" variant="detail" style={toolbarStyle}>
        <ToolbarTabStrip
          compact={false}
          compactContent={null}
          scrollContent={
            <ToolbarTabStripBody
              scroll
              role="tablist"
              aria-label={t('file-tree.title')}
              aria-orientation="horizontal"
            >
              {tabs.map((tab) => {
                const selected = activeTab === tab.id
                return (
                  <Button
                    key={tab.id}
                    type="button"
                    variant="ghost"
                    role="tab"
                    aria-selected={selected}
                    aria-controls={`plain-workspace-${tab.id}-panel`}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'h-7 gap-1.5 border px-2.5 text-[length:var(--goblin-file-tree-topbar-font-size)] font-normal',
                      selected
                        ? 'border-transparent bg-selected text-selected-foreground'
                        : 'border-separator text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                    )}
                  >
                    {tab.label}
                  </Button>
                )
              })}
            </ToolbarTabStripBody>
          }
        />
      </Toolbar>
      <div id={`plain-workspace-${activeTab}-panel`} role="tabpanel" className="flex min-h-0 flex-1 flex-col">
        {activeTab === 'files' ? (
          <ProjectFileTree repoId={repoId} revealRequest={revealRequest} />
        ) : (
          <PlainWorkspaceTerminalPanel repoId={repoId} />
        )}
      </div>
    </section>
  )
}
```

- [ ] **Step 5: Route non-Git local repos through `PlainWorkspacePane`**

In `src/web/components/repo-workspace/RepoExplorerPane.tsx`:

Remove:

```ts
import { NonGitRepoPlaceholder } from '#/web/components/repo-workspace/NonGitRepoPlaceholder.tsx'
```

Add:

```ts
import { PlainWorkspacePane } from '#/web/components/repo-workspace/PlainWorkspacePane.tsx'
```

Inside `RepoExplorerPane`, add this selector near the other store selector:

```ts
  const isPlainLocalWorkspace = useReposStore((s) => {
    const repo = s.repos[repoId]
    return !!repo && repo.isGitRepo === false && !isRemoteRepoId(repoId)
  })
```

Before the existing `return (` that renders `SplitPane`, add:

```tsx
  if (isPlainLocalWorkspace) {
    return (
      <div data-file-tree-layout={layout} className="flex min-h-0 min-w-0 flex-1">
        <PlainWorkspacePane repoId={repoId} revealRequest={revealRequest ?? null} />
      </div>
    )
  }
```

In `BranchArea`, remove the `isGitRepo` selector and the `NonGitRepoPlaceholder` branch so it always renders the Git branch toolbar/list. `RepoExplorerPane` is now responsible for bypassing `BranchArea` for non-Git local workspaces.

- [ ] **Step 6: Avoid branch detail in `RepoView` for non-Git local workspaces**

In `src/web/components/RepoView.tsx`, add:

```ts
import { isRemoteRepoId } from '#/shared/remote-repo.ts'
```

After `compactLeftRight`, add:

```ts
  const isPlainLocalWorkspace = repo.isGitRepo === false && !isRemoteRepoId(repoId)
```

Before `const detailPane = (`, add:

```tsx
  if (isPlainLocalWorkspace) {
    return (
      <section className="relative flex min-w-0 flex-1 flex-col">
        <RepoWorkspacePane>
          <RepoExplorerPane repoId={repoId} layout={layout} showActions={false} revealRequest={terminalRevealRequest} />
        </RepoWorkspacePane>
      </section>
    )
  }
```

- [ ] **Step 7: Remove obsolete Git-init placeholder after confirmation**

After confirming deletion is allowed, delete:

```text
src/web/components/repo-workspace/NonGitRepoPlaceholder.tsx
```

Also remove any import that references it. The only expected import was in `RepoExplorerPane.tsx`.

- [ ] **Step 8: Run focused UI tests and confirm they pass**

Run:

```bash
bun run test src/web/components/repo-workspace/RepoExplorerPane.test.tsx src/web/components/RepoView.test.tsx
```

Expected: both test files pass.

---

### Task 5: Hide Non-Git Topbar Git Controls And Mark Plain Repo Tabs

**Files:**
- Modify: `src/web/components/repo-toolbar/RepoToolbar.tsx`
- Modify: `src/web/components/repo-toolbar/RepoToolbarActions.tsx`
- Modify: `src/web/components/topbar/TopbarRepoControls.tsx`
- Modify: `src/web/components/repo-toolbar/RepoToolbar.test.tsx`
- Modify: `src/web/components/RepoTabs.tsx`
- Modify: `src/web/components/repo-tabs/types.ts`
- Modify: `src/web/components/repo-tabs/RepoTab.tsx`
- Modify: `src/web/components/repo-tabs/RepoTabStrip.test.tsx`

- [ ] **Step 1: Write failing topbar and tab tests**

In `src/web/components/repo-toolbar/RepoToolbar.test.tsx`, append this test inside `describe('TopbarRepoControls', () => { ... })`:

```ts
  test('hides repo controls for non-git local workspaces', () => {
    seedRepoState({
      id: REPO_ID,
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })

    renderControls(navigationWith({}))

    expect(container?.querySelector('button[aria-label="action.refresh"]')).toBeNull()
    expect(container?.querySelector('button[aria-label="action.create-worktree-title"]')).toBeNull()
    expect(container?.querySelector('[aria-label="workspace.layout-label"]')).toBeNull()
    expect(container?.querySelector('button[aria-label="branches.switch"]')).toBeNull()
    expect(container?.querySelector('button[aria-label="action.menu"]')).toBeNull()
  })
```

In `src/web/components/repo-tabs/RepoTabStrip.test.tsx`, update the `repo` helper signature:

```ts
function repo(name: string, id: string, options: { worktreePaths?: string[]; isGitRepo?: boolean } = {}): RepoTabSummary {
  return {
    id,
    name,
    remoteDetails: [],
    worktreePaths: options.worktreePaths ?? [],
    isGitRepo: options.isGitRepo ?? true,
  } as RepoTabSummary
}
```

Append this test inside `describe('RepoTabStrip', () => { ... })`:

```ts
  test('marks plain local workspace tabs separately from git and remote tabs', () => {
    render(
      <RepoTabStrip
        repos={[
          repo('plain', '/tmp/plain', { isGitRepo: false }),
          repo('git', '/tmp/git', { isGitRepo: true }),
          repo('remote', 'ssh-config://prod/srv/repo', { isGitRepo: true }),
        ]}
        activeId="/tmp/plain"
        labels={labels}
        onActivate={() => {}}
        onClose={() => {}}
        onReorder={() => {}}
        onOpenLocal={() => {}}
        onOpenRemote={() => {}}
        onClone={() => {}}
      />,
    )

    expect(document.body.querySelector('[data-repo-tab-id="/tmp/plain"]')?.getAttribute('data-repo-kind')).toBe('plain')
    expect(document.body.querySelector('[data-repo-tab-id="/tmp/git"]')?.getAttribute('data-repo-kind')).toBe('git')
    expect(document.body.querySelector('[data-repo-tab-id="ssh-config://prod/srv/repo"]')?.getAttribute('data-repo-kind')).toBe(
      'remote',
    )
  })
```

- [ ] **Step 2: Run focused tests and confirm they fail**

Run:

```bash
bun run test src/web/components/repo-toolbar/RepoToolbar.test.tsx src/web/components/repo-tabs/RepoTabStrip.test.tsx
```

Expected: failures because topbar controls are still visible and repo tabs do not expose `data-repo-kind`.

- [ ] **Step 3: Gate `RepoToolbarActions`**

In `src/web/components/repo-toolbar/RepoToolbarActions.tsx`, inside `RepoToolbarActions`, add:

```ts
  const isGitRepo = useReposStore((s) => s.repos[repoId]?.isGitRepo ?? true)
  if (!isGitRepo) return null
```

Place it before the `return (` so create worktree and activity controls are not mounted for non-Git repos.

- [ ] **Step 4: Gate `RepoToolbar`**

In `src/web/components/repo-toolbar/RepoToolbar.tsx`, replace the `exists` selector with:

```ts
  const view = useReposStore((s) => {
    const repo = s.repos[repoId]
    return { exists: !!repo, isGitRepo: repo?.isGitRepo ?? true }
  })
  if (!view.exists || !view.isGitRepo) return null
```

Remove the old `if (!exists) return null`.

- [ ] **Step 5: Gate `TopbarRepoControls`**

In `src/web/components/topbar/TopbarRepoControls.tsx`, replace:

```ts
  const exists = useReposStore((s) => !!s.repos[repoId])
```

with:

```ts
  const view = useReposStore((s) => {
    const repo = s.repos[repoId]
    return { exists: !!repo, isGitRepo: repo?.isGitRepo ?? true }
  })
```

Replace:

```ts
  if (!exists) return null
```

with:

```ts
  if (!view.exists || !view.isGitRepo) return null
```

- [ ] **Step 6: Pass `isGitRepo` into tab summaries**

In `src/web/components/repo-tabs/types.ts`, add to `RepoTabSummary`:

```ts
  isGitRepo?: boolean
```

In `src/web/components/RepoTabs.tsx`, add `isGitRepo: r.isGitRepo` to the summary object:

```ts
                isGitRepo: r.isGitRepo,
```

Update `repoTerminalWorktreePaths` signature and body:

```ts
function repoTerminalWorktreePaths(repo: {
  id: string
  isGitRepo: boolean
  data: {
    branches: Array<{ worktree?: { path?: string } }>
    worktreesByPath: Record<string, unknown>
  }
}): string[] {
  if (repo.isGitRepo === false) return [repo.id]
  return Array.from(
    new Set([
      ...Object.keys(repo.data.worktreesByPath),
      ...repo.data.branches.map((branch) => branch.worktree?.path).filter((path): path is string => !!path),
    ]),
  ).sort()
}
```

- [ ] **Step 7: Mark and icon plain repo tabs**

In `src/web/components/repo-tabs/RepoTab.tsx`, replace the icon import:

```ts
import { AlertCircle, Folder, FolderGit2, Server } from 'lucide-react'
```

Inside `RepoTab`, before `return`, add:

```ts
  const repoKind = isRemoteRepoId(repo.id) ? 'remote' : repo.isGitRepo === false ? 'plain' : 'git'
```

In `buttonProps`, add:

```ts
        'data-repo-kind': repoKind,
```

Replace the icon rendering with:

```tsx
      {repoKind === 'remote' ? (
        <Server size={13} className={toolbarTabIconClassName(isActive)} />
      ) : repoKind === 'plain' ? (
        <Folder size={13} className={toolbarTabIconClassName(isActive)} />
      ) : (
        <FolderGit2 size={13} className={toolbarTabIconClassName(isActive)} />
      )}
```

- [ ] **Step 8: Run focused tests and confirm they pass**

Run:

```bash
bun run test src/web/components/repo-toolbar/RepoToolbar.test.tsx src/web/components/repo-tabs/RepoTabStrip.test.tsx
```

Expected: both test files pass.

---

### Task 6: Final Verification

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run all focused tests from the plan**

Run:

```bash
bun run test \
  src/system/ssh/diagnostics.test.ts \
  src/web/stores/repos/refresh.test.ts \
  src/web/stores/repos/branch-actions.test.ts \
  src/server/terminal/terminal.test.ts \
  src/web/components/terminal/terminal-repo-index.test.ts \
  src/web/components/repo-workspace/RepoExplorerPane.test.tsx \
  src/web/components/RepoView.test.tsx \
  src/web/components/repo-toolbar/RepoToolbar.test.tsx \
  src/web/components/repo-tabs/RepoTabStrip.test.tsx
```

Expected: all listed tests pass.

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: typecheck completes successfully.

- [ ] **Step 3: Run architecture guard**

Run:

```bash
bun run check:architecture
```

Expected: architecture guard completes successfully.

- [ ] **Step 4: Run the full test suite**

Run:

```bash
bun run test
```

Expected: all tests pass.

- [ ] **Step 5: Inspect final worktree state**

Run:

```bash
git status --short
```

Expected: only intended source, test, spec, and plan files are changed. No commit is made unless the user explicitly confirms it.
