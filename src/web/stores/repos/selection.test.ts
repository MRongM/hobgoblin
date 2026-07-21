import { beforeEach, describe, expect, test } from 'vitest'
import { emptyRepo, replaceRepo } from '#/web/stores/repos/helpers.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import type { DetailTab, RepoState } from '#/web/stores/repos/types.ts'
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

function updateRepoForTest(mutator: (repo: RepoState) => void) {
  useReposStore.setState((s) => {
    const repo = s.repos[REPO_ID]
    if (!repo) return s
    return { repos: { ...s.repos, [REPO_ID]: replaceRepo(repo, mutator) } }
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

  test('dismissing the active exited terminal detail falls back to status and collapses the pane', () => {
    seedRepo({ selectedBranch: 'feature/worktree', detailTab: 'terminal' })
    useReposStore.setState({ workspaceLayout: 'top-bottom', detailCollapsed: false })

    useReposStore
      .getState()
      .dismissExitedTerminalDetail(REPO_ID, '/tmp/feature-worktree', { affectVisibleWorkspace: true })

    expect(useReposStore.getState().repos[REPO_ID]?.ui.detailTab).toBe('status')
    expect(useReposStore.getState().detailCollapsed).toBe(true)
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

  test('dismissing terminal detail collapses the pane in left-right layout', () => {
    seedRepo({ selectedBranch: 'feature/worktree', detailTab: 'terminal' })
    useReposStore.getState().setWorkspaceLayout('left-right')

    useReposStore
      .getState()
      .dismissExitedTerminalDetail(REPO_ID, '/tmp/feature-worktree', { affectVisibleWorkspace: true })

    expect(useReposStore.getState().repos[REPO_ID]?.ui.detailTab).toBe('status')
    expect(useReposStore.getState().detailCollapsed).toBe(true)
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
      repo.ui.workspaceLayout = 'top-bottom'
    })
    useReposStore.setState({
      repos: { [REPO_ID]: repoA, [REPO_B_ID]: repoB },
      order: [REPO_ID, REPO_B_ID],
      activeId: REPO_ID,
      workspaceLayout: 'left-right',
    })

    useReposStore.getState().setWorkspaceLayout(REPO_ID, 'top-bottom')

    expect(useReposStore.getState().repos[REPO_ID]?.ui.workspaceLayout).toBe('top-bottom')
    expect(useReposStore.getState().repos[REPO_B_ID]?.ui.workspaceLayout).toBe('top-bottom')
    expect(useReposStore.getState().workspaceLayout).toBe('top-bottom')

    useReposStore.getState().setWorkspaceLayout(REPO_B_ID, 'left-right')

    expect(useReposStore.getState().repos[REPO_ID]?.ui.workspaceLayout).toBe('top-bottom')
    expect(useReposStore.getState().repos[REPO_B_ID]?.ui.workspaceLayout).toBe('left-right')
    expect(useReposStore.getState().workspaceLayout).toBe('top-bottom')
  })

  test('allows detail collapse changes in top-bottom layout', () => {
    useReposStore.getState().setWorkspaceLayout('top-bottom')
    useReposStore.getState().setDetailCollapsed(false)
    expect(useReposStore.getState().detailCollapsed).toBe(false)

    useReposStore.getState().setDetailCollapsed(true)
    expect(useReposStore.getState().detailCollapsed).toBe(true)
  })

  test('allows detail collapse changes in left-right layout', () => {
    useReposStore.getState().setWorkspaceLayout('top-bottom')
    useReposStore.getState().setDetailCollapsed(true)

    useReposStore.getState().setWorkspaceLayout('left-right')

    expect(useReposStore.getState().workspaceLayout).toBe('left-right')
    expect(useReposStore.getState().detailCollapsed).toBe(true)

    useReposStore.getState().setDetailCollapsed(false)
    expect(useReposStore.getState().detailCollapsed).toBe(false)

    useReposStore.getState().toggleDetailCollapsed()
    expect(useReposStore.getState().detailCollapsed).toBe(true)
  })

  test('allows collapse again after returning to top-bottom layout', () => {
    useReposStore.getState().setWorkspaceLayout('left-right')
    useReposStore.getState().setWorkspaceLayout('top-bottom')

    useReposStore.getState().toggleDetailCollapsed()

    expect(useReposStore.getState().workspaceLayout).toBe('top-bottom')
    expect(useReposStore.getState().detailCollapsed).toBe(true)
  })

  test('applies session layout state atomically with shared normalization rules', () => {
    useReposStore.getState().applySessionLayoutState({
      workspaceLayout: 'left-right',
      detailCollapsed: true,
      detailFocusMode: true,
      detailPaneSizes: { 'top-bottom': 55, 'left-right': 45 },
    })

    expect(useReposStore.getState()).toMatchObject({
      workspaceLayout: 'left-right',
      detailCollapsed: true,
      detailFocusMode: true,
      detailPaneSizes: { 'top-bottom': 55, 'left-right': 45 },
    })
  })
})

describe('setDetailFocusMode', () => {
  test('enables focus mode and expands detail in top-bottom layout', () => {
    useReposStore.getState().setWorkspaceLayout('top-bottom')
    useReposStore.getState().setDetailCollapsed(true)

    useReposStore.getState().setDetailFocusMode(true)

    expect(useReposStore.getState().detailFocusMode).toBe(true)
    expect(useReposStore.getState().detailCollapsed).toBe(false)
  })

  test('keeps focus mode when detail is collapsed', () => {
    useReposStore.getState().setWorkspaceLayout('top-bottom')
    useReposStore.getState().setDetailFocusMode(true)

    useReposStore.getState().setDetailCollapsed(true)

    expect(useReposStore.getState().detailFocusMode).toBe(true)
    expect(useReposStore.getState().detailCollapsed).toBe(true)
  })

  test('exits focus mode without expanding a collapsed detail panel', () => {
    useReposStore.getState().setWorkspaceLayout('top-bottom')
    useReposStore.getState().setDetailFocusMode(true)
    useReposStore.getState().setDetailCollapsed(true)

    useReposStore.getState().setDetailFocusMode(false)

    expect(useReposStore.getState().detailFocusMode).toBe(false)
    expect(useReposStore.getState().detailCollapsed).toBe(true)
  })

  test('re-expands into focus mode when focus is enabled while collapsed', () => {
    useReposStore.getState().setWorkspaceLayout('top-bottom')
    useReposStore.getState().setDetailFocusMode(true)
    useReposStore.getState().setDetailCollapsed(true)

    useReposStore.getState().toggleDetailCollapsed()

    expect(useReposStore.getState().detailFocusMode).toBe(true)
    expect(useReposStore.getState().detailCollapsed).toBe(false)
  })

  test('preserves focus mode when switching to left-right layout', () => {
    useReposStore.getState().setWorkspaceLayout('top-bottom')
    useReposStore.getState().setDetailFocusMode(true)

    useReposStore.getState().setWorkspaceLayout('left-right')

    expect(useReposStore.getState().workspaceLayout).toBe('left-right')
    expect(useReposStore.getState().detailFocusMode).toBe(true)
    expect(useReposStore.getState().detailCollapsed).toBe(false)
  })

  test('enables focus mode in left-right layout', () => {
    useReposStore.getState().setWorkspaceLayout('left-right')

    useReposStore.getState().setDetailFocusMode(true)

    expect(useReposStore.getState().detailFocusMode).toBe(true)
  })
})

describe('setDetailPaneSize', () => {
  test('stores detail pane sizes per workspace layout', () => {
    useReposStore.getState().setDetailPaneSize('top-bottom', 37.34)
    useReposStore.getState().setDetailPaneSize('left-right', 72.28)

    expect(useReposStore.getState().detailPaneSizes).toEqual({ 'top-bottom': 37.3, 'left-right': 72.3 })
  })

  test('normalizes invalid and out-of-range sizes', () => {
    useReposStore.getState().setDetailPaneSize('top-bottom', Number.NaN)
    useReposStore.getState().setDetailPaneSize('left-right', 200)

    expect(useReposStore.getState().detailPaneSizes).toEqual({
      'top-bottom': DEFAULT_DETAIL_PANE_SIZES['top-bottom'],
      'left-right': 90,
    })
  })
})

describe('setRepoFileTreePaneSize', () => {
  test('stores file tree pane sizes per repo without leaking to other repos or defaults', () => {
    seedRepo({ selectedBranch: 'main', branches: [branch('main', { worktree: { path: '/repo' } })] })
    const repoB = replaceRepo(emptyRepo(REPO_B_ID, 'repo-b'), (repo) => {
      repo.ui.workspaceLayout = 'top-bottom'
    })
    useReposStore.setState((s) => ({
      repos: { ...s.repos, [REPO_B_ID]: repoB },
      order: [REPO_ID, REPO_B_ID],
      fileTreePaneSizes: { 'top-bottom': 66.7, 'left-right': 55.5 },
    }))

    useReposStore.getState().setRepoFileTreePaneSize(REPO_ID, 'top-bottom', 44.44)

    expect(useReposStore.getState().repos[REPO_ID]?.ui.fileTreePaneSizes).toEqual({
      'top-bottom': 44.4,
      'left-right': 55.5,
    })
    expect(useReposStore.getState().repos[REPO_B_ID]?.ui.fileTreePaneSizes).toBeUndefined()
    expect(useReposStore.getState().fileTreePaneSizes).toEqual({ 'top-bottom': 66.7, 'left-right': 55.5 })
    expect(useReposStore.getState().restorableRepoCache[REPO_ID]?.ui.fileTreePaneSizes).toEqual({
      'top-bottom': 44.4,
      'left-right': 55.5,
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
    useReposStore.getState().setDefaultFileTreePaneSize('top-bottom', 44.4)
    useReposStore.getState().setDefaultFileTreePaneSize('left-right', 35.2)

    expect(useReposStore.getState().fileTreePaneSizes).toEqual({
      'top-bottom': 44.4,
      'left-right': 35.2,
    })
  })
})

describe('resetLayout', () => {
  test('restores the initial workspace layout defaults', () => {
    seedRepo({ selectedBranch: 'main', branches: [branch('main', { worktree: { path: '/repo' } })] })
    useReposStore.getState().setRepoFileTreePaneSize(REPO_ID, 'top-bottom', 42)
    useReposStore.setState({
      workspaceLayout: 'top-bottom',
      detailCollapsed: true,
      detailFocusMode: true,
      detailPaneSizes: { 'top-bottom': 35, 'left-right': 70 },
      fileTreePaneSizes: { 'top-bottom': 52, 'left-right': 38 },
    })

    useReposStore.getState().resetLayout()

    expect(useReposStore.getState().workspaceLayout).toBe('left-right')
    expect(useReposStore.getState().detailCollapsed).toBe(false)
    expect(useReposStore.getState().detailFocusMode).toBe(false)
    expect(useReposStore.getState().detailPaneSizes).toBe(DEFAULT_DETAIL_PANE_SIZES)
    expect(useReposStore.getState().fileTreePaneSizes).toBe(DEFAULT_FILE_TREE_PANE_SIZES)
    expect(useReposStore.getState().repos[REPO_ID]?.ui.fileTreePaneSizes).toEqual({
      'top-bottom': 42,
      'left-right': DEFAULT_FILE_TREE_PANE_SIZES['left-right'],
    })
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

  test('selects a child repository and remembers it for top-level project activation', () => {
    seedWorkspaceSelection()

    useReposStore.getState().activateWorkspaceRepository(rootId, childId)
    useReposStore.getState().setActive(soloId)
    useReposStore.getState().activateProject(rootId)

    expect(useReposStore.getState().activeId).toBe(childId)
    expect(useReposStore.getState().workspaceActiveContextByRoot[rootId]).toEqual({
      kind: 'repository',
      repositoryId: childId,
    })
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

  test.each([
    { label: 'missing', selectedId: 'branch-missing', lifecycle: 'ready' as const },
    { label: 'delete-incomplete', selectedId: 'branch-1', lifecycle: 'delete-incomplete' as const },
  ])('falls back to Overview for a $label branch workspace', ({ selectedId, lifecycle }) => {
    seedWorkspaceSelection()
    seedBranchWorkspaceQuery('branch-1', lifecycle)

    useReposStore.getState().activateBranchWorkspace(rootId, selectedId)

    expect(useReposStore.getState().activeId).toBe(rootId)
    expect(useReposStore.getState().workspaceActiveContextByRoot[rootId]).toEqual({ kind: 'overview' })
  })

  test('keeps repository list collapse independent per workspace and defaults missing roots to expanded', () => {
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
    expect(useReposStore.getState().activeId).toBe(childId)
  })
})

function seedBranchWorkspaceQuery(
  id: string,
  lifecycle: 'ready' | 'delete-incomplete',
) {
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
        lifecycle,
        available: lifecycle === 'ready',
        issues: [],
        repositories: [],
        auxiliaryEntries: [],
        ...(lifecycle === 'delete-incomplete'
          ? { operation: { kind: 'remove' as const, phase: 'failed' as const, startedAt: '2026-07-21T00:00:00.000Z' } }
          : {}),
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
