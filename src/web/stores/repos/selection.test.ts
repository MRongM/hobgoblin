import { beforeEach, describe, expect, test } from 'vitest'
import { emptyRepo, replaceRepo } from '#/web/stores/repos/helpers.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import type { DetailTab } from '#/web/stores/repos/types.ts'
import {
  createRepoBranch as branch,
  installGoblinTestBridge,
  resetReposStore,
  seedRepoState,
} from '#/web/stores/repos/test-utils.ts'
import type { BranchSnapshotInfo } from '#/web/types.ts'
import { DEFAULT_DETAIL_PANE_SIZES, DEFAULT_FILE_TREE_PANE_SIZES } from '#/shared/workspace-layout.ts'
import { mainWindowQueryClient } from '#/web/main-window-queries.ts'
import { branchWorkspaceQueryKey } from '#/web/branch-workspace-query-cache.ts'
const REPO_ID = '/tmp/gbl-selection-test-repo'
const REPO_B_ID = '/tmp/gbl-selection-test-repo-b'
const rpcHandlers: Record<string, (input: any) => unknown> = {}

function seedRepo(options: {
  selectedBranch?: string | null
  currentBranch?: string
  detailTab?: DetailTab
  branches?: BranchSnapshotInfo[]
}) {
  seedRepoState({
    id: REPO_ID,
    branches: options.branches ?? [
      branch('main', { worktree: { path: '/repo' } }),
      branch('feature/worktree', { worktree: { path: '/tmp/feature-worktree' } }),
      branch('feature/plain'),
    ],
    currentBranch: options.currentBranch ?? 'main',
    selectedBranch: options.selectedBranch ?? 'feature/plain',
    detailTab: options.detailTab ?? 'status',
    remote: {
      remotes: ['origin'],
      hasRemotes: true,
      hasBrowserRemote: true,
      browserRemoteProvider: 'github',
      remoteProviders: { origin: 'github' },
      hasGitHubRemote: true,
    },
  })
}

async function flushAsyncWork() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  for (const key of Object.keys(rpcHandlers)) delete rpcHandlers[key]
  resetReposStore()
  installGoblinTestBridge(rpcHandlers)
  rpcHandlers['repo.status'] = async () => []
})

describe('setExplorerTab', () => {
  test('updates and persists only the requested repo', () => {
    seedRepo({ selectedBranch: 'main' })
    const repoB = emptyRepo(REPO_B_ID, 'repo-b')
    useReposStore.setState((state) => ({
      repos: { ...state.repos, [REPO_B_ID]: repoB },
      order: [REPO_ID, REPO_B_ID],
    }))

    useReposStore.getState().setExplorerTab(REPO_ID, 'history')

    expect(useReposStore.getState().repos[REPO_ID]?.ui.explorerTabByBranch.main).toBe('history')
    expect(useReposStore.getState().repos[REPO_B_ID]?.ui.explorerTabByBranch).toEqual({})
    expect(useReposStore.getState().restorableRepoCache[REPO_ID]?.ui.explorerTabByBranch).toEqual({ main: 'history' })
    expect(useReposStore.getState().restorableRepoCache[REPO_B_ID]).toBeUndefined()
  })

  test('remembers explorer tab per branch and restores it on branch switch', () => {
    seedRepo({ selectedBranch: 'main' })

    useReposStore.getState().setExplorerTab(REPO_ID, 'history')
    useReposStore.getState().selectBranch(REPO_ID, 'feature/plain')
    useReposStore.getState().setExplorerTab(REPO_ID, 'changes')

    expect(useReposStore.getState().repos[REPO_ID]?.ui.explorerTabByBranch).toEqual({
      main: 'history',
      'feature/plain': 'changes',
    })

    useReposStore.getState().selectBranch(REPO_ID, 'main')
    expect(useReposStore.getState().repos[REPO_ID]?.ui.selectedBranch).toBe('main')
    expect(useReposStore.getState().repos[REPO_ID]?.ui.explorerTabByBranch.main).toBe('history')
  })

  test('does not rewrite state for the current value or a missing repo', () => {
    seedRepo({ selectedBranch: 'main' })
    const beforeRepo = useReposStore.getState().repos[REPO_ID]

    // main 分支有工作树，所以默认 tab 是 'status'
    useReposStore.getState().setExplorerTab(REPO_ID, 'status')
    useReposStore.getState().setExplorerTab('/missing', 'changes')

    expect(useReposStore.getState().repos[REPO_ID]).toBe(beforeRepo)
    expect(useReposStore.getState().repos['/missing']).toBeUndefined()
    expect(useReposStore.getState().restorableRepoCache[REPO_ID]).toBeUndefined()
  })
})

describe('reorderWorktrees', () => {
  test('moves worktree paths and persists repo cache', () => {
    seedRepo({
      selectedBranch: 'main',
      branches: [
        branch('main', { worktree: { path: '/repo' } }),
        branch('feature/a', { worktree: { path: '/tmp/worktree-a' } }),
        branch('feature/b', { worktree: { path: '/tmp/worktree-b' } }),
        branch('feature/plain'),
      ],
    })

    useReposStore.getState().reorderWorktrees(REPO_ID, '/tmp/worktree-b', '/repo')

    expect(useReposStore.getState().repos[REPO_ID]?.ui.worktreePathOrder).toEqual([
      '/tmp/worktree-b',
      '/repo',
      '/tmp/worktree-a',
    ])
    expect(useReposStore.getState().restorableRepoCache[REPO_ID]?.ui.worktreePathOrder).toEqual([
      '/tmp/worktree-b',
      '/repo',
      '/tmp/worktree-a',
    ])
  })

  test('ignores stale worktree paths', () => {
    seedRepo({ selectedBranch: 'main' })
    const before = useReposStore.getState().repos[REPO_ID]

    useReposStore.getState().reorderWorktrees(REPO_ID, '/missing', '/repo')

    expect(useReposStore.getState().repos[REPO_ID]).toBe(before)
    expect(useReposStore.getState().restorableRepoCache[REPO_ID]).toBeUndefined()
  })
})

describe('selectBranch', () => {
  test('ignores a branch that is not in the current snapshot', () => {
    seedRepo({ selectedBranch: 'feature/plain' })

    useReposStore.getState().selectBranch(REPO_ID, 'missing')

    const repo = useReposStore.getState().repos[REPO_ID]
    expect(repo?.ui.selectedBranch).toBe('feature/plain')
  })

  test('does not rewrite state when selecting the already-selected branch', () => {
    seedRepo({ selectedBranch: 'feature/plain' })
    const before = useReposStore.getState().repos[REPO_ID]

    useReposStore.getState().selectBranch(REPO_ID, 'feature/plain')

    expect(useReposStore.getState().repos[REPO_ID]).toBe(before)
  })

  test('falls back from terminal when selecting a branch without a worktree', () => {
    seedRepo({ selectedBranch: 'feature/worktree', detailTab: 'terminal' })

    useReposStore.getState().selectBranch(REPO_ID, 'feature/plain')

    const repo = useReposStore.getState().repos[REPO_ID]
    expect(repo?.ui.selectedBranch).toBe('feature/plain')
    expect(repo?.ui.detailTab).toBe('status')
    expect(useReposStore.getState().restorableRepoCache[REPO_ID]?.ui.detailTab).toBe('status')
  })

  test('clears a detached worktree selection', () => {
    seedRepo({ selectedBranch: 'main' })
    useReposStore.setState((state) => {
      const repo = state.repos[REPO_ID]!
      return {
        repos: {
          ...state.repos,
          [REPO_ID]: replaceRepo(repo, (draft) => {
            draft.ui.selectedBranch = null
            draft.ui.selectedDetachedWorktreePath = '/tmp/detached-worktree'
          }),
        },
      }
    })

    useReposStore.getState().selectBranch(REPO_ID, 'feature/plain')

    expect(useReposStore.getState().repos[REPO_ID]?.ui).toMatchObject({
      selectedBranch: 'feature/plain',
      selectedDetachedWorktreePath: null,
    })
  })
})

describe('selectDetachedWorktree', () => {
  test('selects an exact live detached worktree and clears branch identity', () => {
    seedRepo({ selectedBranch: 'main', detailTab: 'terminal' })
    useReposStore.setState((state) => {
      const repo = state.repos[REPO_ID]!
      return {
        repos: {
          ...state.repos,
          [REPO_ID]: replaceRepo(repo, (draft) => {
            draft.data.worktreesByPath['/tmp/detached-worktree'] = {
              path: '/tmp/detached-worktree',
              head: 'abc1234',
              isDetached: true,
              isMain: false,
            }
          }),
        },
      }
    })

    useReposStore.getState().selectDetachedWorktree(REPO_ID, '/tmp/detached-worktree')

    expect(useReposStore.getState().repos[REPO_ID]?.ui).toMatchObject({
      selectedBranch: null,
      selectedDetachedWorktreePath: '/tmp/detached-worktree',
      detailTab: 'terminal',
    })
  })

  test('rejects unknown, primary, and prunable paths', () => {
    seedRepo({ selectedBranch: 'main' })
    useReposStore.setState((state) => {
      const repo = state.repos[REPO_ID]!
      return {
        repos: {
          ...state.repos,
          [REPO_ID]: replaceRepo(repo, (draft) => {
            draft.data.worktreesByPath['/tmp/primary-detached'] = {
              path: '/tmp/primary-detached',
              isDetached: true,
              isMain: true,
            }
            draft.data.worktreesByPath['/tmp/prunable-detached'] = {
              path: '/tmp/prunable-detached',
              isDetached: true,
              isMain: false,
              isPrunable: true,
            }
          }),
        },
      }
    })
    const before = useReposStore.getState().repos[REPO_ID]

    useReposStore.getState().selectDetachedWorktree(REPO_ID, '/missing')
    useReposStore.getState().selectDetachedWorktree(REPO_ID, '/tmp/primary-detached')
    useReposStore.getState().selectDetachedWorktree(REPO_ID, '/tmp/prunable-detached')

    expect(useReposStore.getState().repos[REPO_ID]).toBe(before)
  })

  test('remembers explorer tabs independently by detached worktree path', () => {
    seedRepo({ selectedBranch: 'main' })
    useReposStore.setState((state) => {
      const repo = state.repos[REPO_ID]!
      return {
        repos: {
          ...state.repos,
          [REPO_ID]: replaceRepo(repo, (draft) => {
            draft.data.worktreesByPath['/tmp/detached-a'] = {
              path: '/tmp/detached-a',
              isDetached: true,
              isMain: false,
            }
            draft.data.worktreesByPath['/tmp/detached-b'] = {
              path: '/tmp/detached-b',
              isDetached: true,
              isMain: false,
            }
          }),
        },
      }
    })

    useReposStore.getState().selectDetachedWorktree(REPO_ID, '/tmp/detached-a')
    useReposStore.getState().setExplorerTab(REPO_ID, 'history')
    useReposStore.getState().selectDetachedWorktree(REPO_ID, '/tmp/detached-b')
    useReposStore.getState().setExplorerTab(REPO_ID, 'changes')

    expect(useReposStore.getState().repos[REPO_ID]?.ui.explorerTabByBranch).toMatchObject({
      'detached:/tmp/detached-a': 'history',
      'detached:/tmp/detached-b': 'changes',
    })
  })
})

describe('checkoutSelectedInRepo', () => {
  test('plain workspaces with no selected branch do not start checkout work', async () => {
    let checkoutCalls = 0
    rpcHandlers['repo.checkout'] = async () => {
      checkoutCalls += 1
      return { ok: true, message: 'ok' }
    }
    seedRepoState({
      id: REPO_ID,
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })

    await useReposStore.getState().checkoutSelectedInRepo(REPO_ID)
    await useReposStore.getState().checkoutSelected()

    const repo = useReposStore.getState().repos[REPO_ID]
    expect(checkoutCalls).toBe(0)
    expect(repo?.operations.branchAction.phase).toBe('idle')
    expect(repo?.events).toEqual([])
  })

  test('stale branch selection in a plain workspace reaches the non-git action gate', async () => {
    let checkoutCalls = 0
    rpcHandlers['repo.checkout'] = async () => {
      checkoutCalls += 1
      return { ok: true, message: 'ok' }
    }
    seedRepoState({
      id: REPO_ID,
      isGitRepo: false,
      branches: [branch('main'), branch('feature/plain')],
      currentBranch: 'main',
      selectedBranch: 'feature/plain',
    })

    await useReposStore.getState().checkoutSelectedInRepo(REPO_ID)

    const repo = useReposStore.getState().repos[REPO_ID]
    expect(checkoutCalls).toBe(0)
    expect(repo?.operations.branchAction.phase).toBe('idle')
    expect(repo?.events.at(-1)).toMatchObject({
      kind: 'result',
      result: { ok: false, message: 'error.not-git-repo' },
      action: {
        kind: 'checkout',
        branch: 'feature/plain',
      },
    })
  })
})

describe('setDetailTab', () => {
  test('persists the selected detail tab immediately', () => {
    seedRepo({ selectedBranch: 'feature/worktree', detailTab: 'status' })

    useReposStore.getState().setDetailTab(REPO_ID, 'terminal')

    expect(useReposStore.getState().restorableRepoCache[REPO_ID]?.ui.detailTab).toBe('terminal')
  })

  test('does not refresh when reselecting the current tab', () => {
    seedRepo({ selectedBranch: 'main', detailTab: 'status' })
    const before = useReposStore.getState().repos[REPO_ID]
    useReposStore.getState().setDetailTab(REPO_ID, 'status')
    expect(useReposStore.getState().repos[REPO_ID]).toBe(before)
  })

  test('normalizes the moved changes tab to status immediately', async () => {
    seedRepo({ selectedBranch: 'main', detailTab: 'status' })

    useReposStore.getState().setDetailTab(REPO_ID, 'changes')
    await flushAsyncWork()

    expect(useReposStore.getState().repos[REPO_ID]?.ui.detailTab).toBe('status')
    expect(useReposStore.getState().restorableRepoCache[REPO_ID]?.ui.detailTab).toBeUndefined()
  })

  test('opens terminal only for branches with a worktree', () => {
    seedRepo({ selectedBranch: 'feature/worktree', detailTab: 'status' })

    useReposStore.getState().setDetailTab(REPO_ID, 'terminal')

    expect(useReposStore.getState().repos[REPO_ID]?.ui.detailTab).toBe('terminal')
  })

  test('falls back to status when terminal is selected without a worktree', () => {
    seedRepo({ selectedBranch: 'feature/plain', detailTab: 'status' })

    useReposStore.getState().setDetailTab(REPO_ID, 'terminal')

    expect(useReposStore.getState().repos[REPO_ID]?.ui.detailTab).toBe('status')
  })

  test('persists terminal as a cached detail tab', () => {
    seedRepo({ selectedBranch: 'feature/worktree', detailTab: 'status' })

    useReposStore.getState().setDetailTab(REPO_ID, 'terminal')

    expect(useReposStore.getState().restorableRepoCache[REPO_ID]?.ui.detailTab).toBe('terminal')
  })

  test('dismissing the active exited terminal detail falls back to status without collapsing the fixed pane', () => {
    seedRepo({ selectedBranch: 'feature/worktree', detailTab: 'terminal' })
    useReposStore.setState({ workspaceLayout: 'left-right', detailCollapsed: false })

    useReposStore
      .getState()
      .dismissExitedTerminalDetail(REPO_ID, '/tmp/feature-worktree', { affectVisibleWorkspace: true })

    expect(useReposStore.getState().repos[REPO_ID]?.ui.detailTab).toBe('status')
    expect(useReposStore.getState().detailCollapsed).toBe(false)
    expect(useReposStore.getState().restorableRepoCache[REPO_ID]?.ui.detailTab).toBe('status')
  })

  test('dismissing a stale exited terminal session leaves the current detail selection alone', () => {
    seedRepo({ selectedBranch: 'feature/worktree', detailTab: 'terminal' })
    useReposStore.setState({ detailCollapsed: false })

    useReposStore
      .getState()
      .dismissExitedTerminalDetail(REPO_ID, '/tmp/other-worktree', { affectVisibleWorkspace: true })

    expect(useReposStore.getState().repos[REPO_ID]?.ui.detailTab).toBe('terminal')
    expect(useReposStore.getState().detailCollapsed).toBe(false)
  })

  test('dismissing terminal detail keeps the fixed left-right pane visible', () => {
    seedRepo({ selectedBranch: 'feature/worktree', detailTab: 'terminal' })
    useReposStore.getState().setWorkspaceLayout('left-right')

    useReposStore
      .getState()
      .dismissExitedTerminalDetail(REPO_ID, '/tmp/feature-worktree', { affectVisibleWorkspace: true })

    expect(useReposStore.getState().repos[REPO_ID]?.ui.detailTab).toBe('status')
    expect(useReposStore.getState().detailCollapsed).toBe(false)
  })

  test('dismissing a background terminal detail leaves global detail collapse unchanged', () => {
    seedRepo({ selectedBranch: 'feature/worktree', detailTab: 'terminal' })
    useReposStore.setState({ detailCollapsed: false })

    useReposStore
      .getState()
      .dismissExitedTerminalDetail(REPO_ID, '/tmp/feature-worktree', { affectVisibleWorkspace: false })

    expect(useReposStore.getState().repos[REPO_ID]?.ui.detailTab).toBe('status')
    expect(useReposStore.getState().detailCollapsed).toBe(false)
  })
})

describe('setWorkspaceLayout', () => {
  test('stores workspace layout per repo without leaking to other repos', () => {
    const repoA = replaceRepo(emptyRepo(REPO_ID, 'repo-a'), (repo) => {
      repo.ui.workspaceLayout = 'left-right'
    })
    const repoB = replaceRepo(emptyRepo(REPO_B_ID, 'repo-b'), (repo) => {
      repo.ui.workspaceLayout = 'left-right'
    })
    useReposStore.setState({
      repos: { [REPO_ID]: repoA, [REPO_B_ID]: repoB },
      order: [REPO_ID, REPO_B_ID],
      activeId: REPO_ID,
      workspaceLayout: 'left-right',
    })

    useReposStore.getState().setWorkspaceLayout(REPO_ID, 'left-right')

    expect(useReposStore.getState().repos[REPO_ID]?.ui.workspaceLayout).toBe('left-right')
    expect(useReposStore.getState().repos[REPO_B_ID]?.ui.workspaceLayout).toBe('left-right')
    expect(useReposStore.getState().workspaceLayout).toBe('left-right')

    useReposStore.getState().setWorkspaceLayout(REPO_B_ID, 'left-right')

    expect(useReposStore.getState().repos[REPO_ID]?.ui.workspaceLayout).toBe('left-right')
    expect(useReposStore.getState().repos[REPO_B_ID]?.ui.workspaceLayout).toBe('left-right')
    expect(useReposStore.getState().workspaceLayout).toBe('left-right')
  })

  test('allows detail collapse changes in left-right layout', () => {
    useReposStore.getState().setWorkspaceLayout('left-right')
    useReposStore.getState().setDetailCollapsed(false)
    expect(useReposStore.getState().detailCollapsed).toBe(false)

    useReposStore.getState().setDetailCollapsed(true)
    expect(useReposStore.getState().detailCollapsed).toBe(false)
  })

  test('allows detail collapse changes in left-right layout', () => {
    useReposStore.getState().setWorkspaceLayout('left-right')
    useReposStore.getState().setDetailCollapsed(true)

    useReposStore.getState().setWorkspaceLayout('left-right')

    expect(useReposStore.getState().workspaceLayout).toBe('left-right')
    expect(useReposStore.getState().detailCollapsed).toBe(false)

    useReposStore.getState().setDetailCollapsed(false)
    expect(useReposStore.getState().detailCollapsed).toBe(false)

    useReposStore.getState().toggleDetailCollapsed()
    expect(useReposStore.getState().detailCollapsed).toBe(false)
  })

  test('allows collapse again after returning to left-right layout', () => {
    useReposStore.getState().setWorkspaceLayout('left-right')
    useReposStore.getState().setWorkspaceLayout('left-right')

    useReposStore.getState().toggleDetailCollapsed()

    expect(useReposStore.getState().workspaceLayout).toBe('left-right')
    expect(useReposStore.getState().detailCollapsed).toBe(false)
  })

  test('applies session layout state atomically with shared normalization rules', () => {
    useReposStore.getState().applySessionLayoutState({
      workspaceLayout: 'left-right',
      detailCollapsed: true,
      detailFocusMode: false,
      detailPaneSizes: { 'left-right': 45 },
    })

    expect(useReposStore.getState()).toMatchObject({
      workspaceLayout: 'left-right',
      detailCollapsed: false,
      detailPaneSizes: { 'left-right': 45 },
    })
  })
})

describe('terminal Focus state ownership', () => {
  test('keeps terminal Focus global while switching projects until explicitly toggled off', () => {
    seedRepo({ selectedBranch: 'main' })
    const repoB = emptyRepo(REPO_B_ID, 'repo-b')
    useReposStore.setState((state) => ({
      repos: { ...state.repos, [REPO_B_ID]: repoB },
      order: [REPO_ID, REPO_B_ID],
    }))

    expect(useReposStore.getState().detailFocusMode).toBe(false)
    useReposStore.getState().setDetailFocusMode(true)
    useReposStore.getState().setActive(REPO_B_ID)
    expect(useReposStore.getState().detailFocusMode).toBe(true)

    useReposStore.getState().toggleDetailFocusMode()
    expect(useReposStore.getState().detailFocusMode).toBe(false)
  })
})

describe('setDetailPaneSize', () => {
  test('stores detail pane sizes per workspace layout', () => {
    useReposStore.getState().setDetailPaneSize('left-right', 72.28)

    expect(useReposStore.getState().detailPaneSizes).toEqual({ 'left-right': 72.3 })
  })

  test('normalizes invalid and out-of-range sizes', () => {
    useReposStore.getState().setDetailPaneSize('left-right', 200)

    expect(useReposStore.getState().detailPaneSizes).toEqual({ 'left-right': 90 })
  })
})

describe('setWorkspaceRepositoryListHeight', () => {
  test('stores normalized heights independently by workspace root', () => {
    const setHeight = useReposStore.getState().setWorkspaceRepositoryListHeight

    expect(setHeight).toBeTypeOf('function')
    setHeight?.('/tmp/workspace-a', 212.4)
    setHeight?.('/tmp/workspace-b', 240)

    expect(useReposStore.getState().workspaceRepositoryListHeightByRoot).toEqual({
      '/tmp/workspace-a': 212,
      '/tmp/workspace-b': 240,
    })
  })
})

describe('setRepoFileTreePaneSize', () => {
  test('stores file tree pane sizes per repo without leaking to other repos or defaults', () => {
    seedRepo({ selectedBranch: 'main', branches: [branch('main', { worktree: { path: '/repo' } })] })
    const repoB = replaceRepo(emptyRepo(REPO_B_ID, 'repo-b'), (repo) => {
      repo.ui.workspaceLayout = 'left-right'
    })
    useReposStore.setState((s) => ({
      repos: { ...s.repos, [REPO_B_ID]: repoB },
      order: [REPO_ID, REPO_B_ID],
      fileTreePaneSizes: { 'left-right': 55.5 },
    }))

    useReposStore.getState().setRepoFileTreePaneSize(REPO_ID, 'left-right', 44.44)

    expect(useReposStore.getState().repos[REPO_ID]?.ui.fileTreePaneSizes).toEqual({ 'left-right': 44.4 })
    expect(useReposStore.getState().repos[REPO_B_ID]?.ui.fileTreePaneSizes).toBeUndefined()
    expect(useReposStore.getState().fileTreePaneSizes).toEqual({ 'left-right': 55.5 })
    expect(useReposStore.getState().restorableRepoCache[REPO_ID]?.ui.fileTreePaneSizes).toEqual({
      'left-right': 44.4,
    })
  })

  test('ignores resize events for missing repos', () => {
    const before = useReposStore.getState()

    useReposStore.getState().setRepoFileTreePaneSize('/missing', 'left-right', 72)

    expect(useReposStore.getState()).toBe(before)
  })
})

describe('setDefaultFileTreePaneSize', () => {
  test('stores default file tree pane sizes per workspace layout', () => {
    useReposStore.getState().setDefaultFileTreePaneSize('left-right', 35.2)

    expect(useReposStore.getState().fileTreePaneSizes).toEqual({ 'left-right': 35.2 })
  })
})

describe('resetLayout', () => {
  test('restores the initial workspace layout defaults', () => {
    seedRepo({ selectedBranch: 'main', branches: [branch('main', { worktree: { path: '/repo' } })] })
    useReposStore.getState().setRepoFileTreePaneSize(REPO_ID, 'left-right', 42)
    useReposStore.setState({
      workspaceLayout: 'left-right',
      detailCollapsed: true,
      detailPaneSizes: { 'left-right': 70 },
      fileTreePaneSizes: { 'left-right': 38 },
    })

    useReposStore.getState().resetLayout()

    expect(useReposStore.getState().workspaceLayout).toBe('left-right')
    expect(useReposStore.getState().detailCollapsed).toBe(false)
    expect(useReposStore.getState().detailPaneSizes).toBe(DEFAULT_DETAIL_PANE_SIZES)
    expect(useReposStore.getState().fileTreePaneSizes).toBe(DEFAULT_FILE_TREE_PANE_SIZES)
    expect(useReposStore.getState().repos[REPO_ID]?.ui.fileTreePaneSizes).toEqual({ 'left-right': 42 })
  })

  test('is idempotent when layout is already at defaults', () => {
    const before = useReposStore.getState()

    useReposStore.getState().resetLayout()

    expect(useReposStore.getState()).toBe(before)
  })
})

describe('project list expansion', () => {
  test('toggles one global expansion preference', () => {
    expect(useReposStore.getState().projectListExpanded).toBe(false)

    useReposStore.getState().toggleProjectListExpanded()
    expect(useReposStore.getState().projectListExpanded).toBe(true)

    useReposStore.getState().toggleProjectListExpanded()
    expect(useReposStore.getState().projectListExpanded).toBe(false)
  })
})

describe('multi-repository workspace selection', () => {
  const rootId = '/tmp/gbl-workspace'
  const childId = `${rootId}/api`
  const soloId = '/tmp/gbl-solo'

  function seedWorkspaceSelection() {
    const root = replaceRepo(emptyRepo(rootId, 'workspace'), (repo) => {
      repo.isGitRepo = false
    })
    const child = replaceRepo(emptyRepo(childId, 'api'), (repo) => {
      repo.workspaceRootId = rootId
    })
    const solo = emptyRepo(soloId, 'solo')
    useReposStore.setState({
      repos: { [rootId]: root, [childId]: child, [soloId]: solo },
      order: [rootId, soloId],
      activeId: rootId,
      activeProjectId: rootId,
      workspaceProjects: {
        [rootId]: {
          rootId,
          repositoryIds: [childId],
          candidates: [],
          configured: false,
          configurationError: null,
          phase: 'ready',
          skipped: [],
          error: null,
        },
      },
      workspaceActiveContextByRoot: { [rootId]: { kind: 'overview' } },
    })
  }

  test('activates a workspace project at Overview instead of restoring its saved repository', () => {
    seedWorkspaceSelection()

    useReposStore.getState().activateWorkspaceRepository(rootId, childId)
    useReposStore.getState().setActive(soloId)
    useReposStore.getState().activateProject(rootId)

    expect(useReposStore.getState().activeId).toBe(rootId)
    expect(useReposStore.getState().activeProjectId).toBe(rootId)
    expect(useReposStore.getState().workspaceActiveContextByRoot[rootId]).toEqual({ kind: 'overview' })
  })

  test('distinguishes a standalone project from the same repository selected inside a workspace', () => {
    seedWorkspaceSelection()
    useReposStore.setState((state) => ({ order: [rootId, childId, soloId], repos: state.repos }))

    useReposStore.getState().activateProject(childId)

    expect(useReposStore.getState().activeId).toBe(childId)
    expect(useReposStore.getState().activeProjectId).toBe(childId)

    useReposStore.getState().activateWorkspaceRepository(rootId, childId)

    expect(useReposStore.getState().activeId).toBe(childId)
    expect(useReposStore.getState().activeProjectId).toBe(rootId)
  })

  test('selects Overview explicitly', () => {
    seedWorkspaceSelection()
    useReposStore.setState({
      workspaceActiveContextByRoot: { [rootId]: { kind: 'repository', repositoryId: childId } },
    })

    useReposStore.getState().activateWorkspaceOverview(rootId)

    expect(useReposStore.getState().activeId).toBe(rootId)
    expect(useReposStore.getState().workspaceActiveContextByRoot[rootId]).toEqual({ kind: 'overview' })
  })

  test('activates one non-repository branch workspace context under Overview', () => {
    seedWorkspaceSelection()
    seedBranchWorkspaceQuery('branch-1', 'ready')

    useReposStore.getState().activateBranchWorkspace(rootId, 'branch-1')

    expect(useReposStore.getState().activeId).toBe(rootId)
    expect(useReposStore.getState().workspaceActiveContextByRoot[rootId]).toEqual({
      kind: 'branch-workspace',
      branchWorkspaceId: 'branch-1',
    })
  })

  test('activates a branch workspace member while keeping the workspace root active', () => {
    seedWorkspaceSelection()
    seedBranchWorkspaceQuery('branch-1', 'ready')

    useReposStore.getState().activateBranchWorkspace(rootId, 'branch-1', 'web')

    expect(useReposStore.getState().activeId).toBe(rootId)
    expect(useReposStore.getState().workspaceActiveContextByRoot[rootId]).toEqual({
      kind: 'branch-workspace',
      branchWorkspaceId: 'branch-1',
      memberRepositoryName: 'web',
    })

    useReposStore.getState().activateBranchWorkspace(rootId, 'branch-1')
    expect(useReposStore.getState().workspaceActiveContextByRoot[rootId]).toEqual({
      kind: 'branch-workspace',
      branchWorkspaceId: 'branch-1',
    })
  })

  test.each([
    { label: 'missing', selectedId: 'branch-missing', stateName: 'ready' as const },
    { label: 'delete-incomplete', selectedId: 'branch-1', stateName: 'delete-incomplete' as const },
  ])('falls back to Overview for a $label branch workspace', ({ selectedId, stateName }) => {
    seedWorkspaceSelection()
    seedBranchWorkspaceQuery('branch-1', stateName)

    useReposStore.getState().activateBranchWorkspace(rootId, selectedId)

    expect(useReposStore.getState().activeId).toBe(rootId)
    expect(useReposStore.getState().workspaceActiveContextByRoot[rootId]).toEqual({ kind: 'overview' })
  })

  test('keeps repository visibility independent per workspace and defaults missing roots to shown', () => {
    seedWorkspaceSelection()
    const otherRoot = '/tmp/gbl-workspace-other'
    const other = replaceRepo(emptyRepo(otherRoot, 'workspace-other'), (repo) => {
      repo.isGitRepo = false
    })
    useReposStore.setState((state) => ({
      repos: { ...state.repos, [otherRoot]: other },
      workspaceProjects: {
        ...state.workspaceProjects,
        [otherRoot]: { ...state.workspaceProjects[rootId]!, rootId: otherRoot, repositoryIds: [] },
      },
    }))

    useReposStore.getState().toggleWorkspaceRepositoryList(rootId)

    expect(useReposStore.getState().workspaceRepositoryListExpandedByRoot).toEqual({ [rootId]: false })
    useReposStore.getState().toggleWorkspaceRepositoryList(otherRoot)
    expect(useReposStore.getState().workspaceRepositoryListExpandedByRoot).toEqual({
      [rootId]: false,
      [otherRoot]: false,
    })
  })

  test('cycles across top-level projects instead of child repositories', () => {
    seedWorkspaceSelection()
    useReposStore.getState().activateWorkspaceRepository(rootId, childId)

    useReposStore.getState().cycleActive(1)
    expect(useReposStore.getState().activeId).toBe(soloId)

    useReposStore.getState().cycleActive(-1)
    expect(useReposStore.getState().activeId).toBe(rootId)
    expect(useReposStore.getState().workspaceActiveContextByRoot[rootId]).toEqual({ kind: 'overview' })
  })
})

function seedBranchWorkspaceQuery(id: string, stateName: 'ready' | 'delete-incomplete') {
  mainWindowQueryClient.setQueryData(branchWorkspaceQueryKey('/tmp/gbl-workspace'), {
    ok: true,
    rootId: '/tmp/gbl-workspace',
    auxiliaryCandidates: [],
    items: [
      {
        id,
        rootId: '/tmp/gbl-workspace',
        branch: 'feature/auth',
        directoryName: 'goblin-feature',
        path: '/tmp/gbl-workspace/goblin-feature',
        state:
          stateName === 'ready'
            ? { kind: 'ready' as const }
            : { kind: 'needs-action' as const, action: 'continue-delete' as const },
        available: stateName === 'ready',
        issues: [],
        repositories: [],
        auxiliaryEntries: [],
      },
    ],
  })
}

describe('setBranchSearchQuery', () => {
  test('updates runtime search without rewriting durable cache or changing selection', () => {
    seedRepo({ selectedBranch: 'feature/plain' })
    const repo = useReposStore.getState().repos[REPO_ID]!
    const cached = {
      savedAt: 123,
      name: repo.name,
      data: {
        branches: repo.data.branches,
        currentBranch: repo.data.currentBranch,
        status: repo.data.status,
        statusLoaded: repo.data.statusLoaded,
        worktreesByPath: repo.data.worktreesByPath,
      },
      ui: {
        selectedBranch: repo.ui.selectedBranch,
        detailTab: repo.ui.detailTab,
        worktreePathOrder: repo.ui.worktreePathOrder,
      },
    }
    useReposStore.setState({ restorableRepoCache: { [REPO_ID]: cached } })

    useReposStore.getState().setBranchSearchQuery(REPO_ID, 'worktree')

    expect(useReposStore.getState().branchSearchQueries[REPO_ID]).toBe('worktree')
    expect(useReposStore.getState().repos[REPO_ID]?.ui.selectedBranch).toBe('feature/plain')
    expect(useReposStore.getState().restorableRepoCache[REPO_ID]).toBe(cached)
  })

  test('removes runtime search when the query is cleared or the repo is closed', () => {
    seedRepo({ selectedBranch: 'feature/plain' })

    useReposStore.getState().setBranchSearchQuery(REPO_ID, 'worktree')
    useReposStore.getState().setBranchSearchQuery(REPO_ID, '')

    expect(useReposStore.getState().branchSearchQueries[REPO_ID]).toBeUndefined()

    useReposStore.getState().setBranchSearchQuery(REPO_ID, '   ')

    expect(useReposStore.getState().branchSearchQueries[REPO_ID]).toBeUndefined()

    useReposStore.getState().setBranchSearchQuery(REPO_ID, 'feature')
    useReposStore.getState().closeRepo(REPO_ID)

    expect(useReposStore.getState().branchSearchQueries[REPO_ID]).toBeUndefined()
  })
})
