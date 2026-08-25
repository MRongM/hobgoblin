// @vitest-environment jsdom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { RepoView } from '#/web/components/RepoView.tsx'
import { MainWindowNavigationProvider, type MainWindowNavigationActions } from '#/web/main-window-navigation.tsx'
import { resetReposStore, seedRepoState, createRepoBranch } from '#/web/stores/repos/test-utils.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { explorerTabForRepo } from '#/web/stores/repos/helpers.ts'

const branchWorkspaceQueryState = vi.hoisted(() => ({
  includeItem: true,
  isFetching: false,
  repositories: [] as Array<{
    repositoryName: string
    targetBranch: string
    baseBranch: string
    branchOrigin: 'created'
    worktreePath: string
    progress: 'complete'
    ready: boolean
  }>,
}))

const branchWorkspacePaneState = vi.hoisted(() => ({ fileAreaOpenRequestCount: 0 }))

vi.mock('#/web/components/BranchDetail.tsx', () => ({
  BranchDetail: ({
    collapsed,
    detailFocusMode,
    compactFocusPresentation,
    onRevealPath,
    onShowCompactExplorer,
    onExitTerminalFocus,
  }: {
    collapsed?: boolean
    detailFocusMode?: boolean
    compactFocusPresentation?: boolean
    onRevealPath?: (relativePath: string) => void
    onShowCompactExplorer?: () => void
    onExitTerminalFocus?: () => void
  }) => (
    <>
      <button
        type="button"
        data-testid="branch-detail"
        data-collapsed={String(collapsed)}
        data-detail-focus-mode={String(detailFocusMode)}
        data-compact-focus-presentation={String(compactFocusPresentation)}
        onClick={() => onRevealPath?.('src/from-terminal.ts')}
      >
        branch detail
      </button>
      {onShowCompactExplorer && (
        <button type="button" data-testid="show-compact-explorer" onClick={onShowCompactExplorer}>
          show explorer
        </button>
      )}
      {onExitTerminalFocus && (
        <button type="button" data-testid="exit-terminal-focus" onClick={onExitTerminalFocus}>
          restore workspace
        </button>
      )}
    </>
  ),
}))

vi.mock('#/web/components/repo-workspace/PlainWorkspaceTerminalPanel.tsx', () => ({
  PlainWorkspaceTerminalPanel: ({
    repoId,
    focusMode,
    compactFocusPresentation,
    onShowCompactOverview,
    onExitTerminalFocus,
  }: {
    repoId: string
    focusMode?: boolean
    compactFocusPresentation?: boolean
    onShowCompactOverview?: () => void
    onExitTerminalFocus?: () => void
  }) => (
    <div
      data-testid="plain-workspace-terminal-panel"
      data-repo-id={repoId}
      data-focus-mode={String(focusMode)}
      data-compact-focus-presentation={String(compactFocusPresentation)}
    >
      {onShowCompactOverview && (
        <button type="button" data-testid="show-compact-overview" onClick={onShowCompactOverview}>
          show overview
        </button>
      )}
      {onExitTerminalFocus && (
        <button type="button" data-testid="exit-plain-terminal-focus" onClick={onExitTerminalFocus}>
          restore workspace
        </button>
      )}
    </div>
  ),
  WorktreeTerminalPanel: ({
    repoId,
    worktreePath,
    terminalLabel,
    compactFocusPresentation,
    onShowCompactOverview,
  }: {
    repoId: string
    worktreePath: string
    terminalLabel: string
    compactFocusPresentation?: boolean
    onShowCompactOverview?: () => void
  }) => (
    <div
      data-testid="worktree-terminal-panel"
      data-repo-id={repoId}
      data-worktree-path={worktreePath}
      data-terminal-label={terminalLabel}
      data-compact-focus-presentation={String(compactFocusPresentation)}
    >
      {onShowCompactOverview && (
        <button type="button" data-testid="show-detached-overview" onClick={onShowCompactOverview}>
          show overview
        </button>
      )}
    </div>
  ),
}))

vi.mock('#/web/branch-workspace-queries.ts', () => ({
  useBranchWorkspaceQuery: () => ({
    data: {
      ok: true,
      rootId: REPO_ID,
      auxiliaryCandidates: [],
      items: branchWorkspaceQueryState.includeItem
        ? [
            {
              id: 'branch-1',
              rootId: REPO_ID,
              branch: 'feature/auth',
              directoryName: 'goblin-feature-auth',
              path: `${REPO_ID}/goblin-feature-auth`,
              state: { kind: 'ready' },
              available: true,
              issues: [],
              repositories: branchWorkspaceQueryState.repositories,
              auxiliaryEntries: [],
            },
          ]
        : [],
    },
    isPending: false,
    isFetching: branchWorkspaceQueryState.isFetching,
  }),
}))

vi.mock('#/web/components/repo-workspace/BranchWorkspacePane.tsx', () => ({
  BranchWorkspacePane: ({
    workspace,
    memberTarget,
    fallbackNotice,
    fileAreaOpenRequested,
    onOpenFileArea,
    onCollapseFileArea,
  }: {
    workspace: { branch: string; path: string }
    memberTarget?: { repositoryId: string } | null
    fallbackNotice?: { repositoryName: string; reason: string } | null
    fileAreaOpenRequested?: boolean
    onOpenFileArea?: () => void
    onCollapseFileArea?: () => void
  }) => {
    if (fileAreaOpenRequested) branchWorkspacePaneState.fileAreaOpenRequestCount += 1
    return (
      <div
        data-testid="branch-workspace-pane"
        data-path={workspace.path}
        data-member-repo-id={memberTarget?.repositoryId ?? ''}
        data-fallback-member={fallbackNotice?.repositoryName ?? ''}
      >
        {workspace.branch}
        {onOpenFileArea ? (
          <button type="button" data-testid="open-member-file-area" onClick={onOpenFileArea}>
            open member file area
          </button>
        ) : null}
        {onCollapseFileArea ? (
          <button type="button" data-testid="collapse-branch-workspace-file-area" onClick={onCollapseFileArea}>
            collapse branch workspace file area
          </button>
        ) : null}
      </div>
    )
  },
}))

vi.mock('#/web/components/repo-workspace/RepoExplorerPane.tsx', () => ({
  RepoExplorerPane: ({
    showActions,
    revealRequest,
    plainWorkspaceTerminalPanel,
    fileAreaCollapsed,
    compactSurface,
    onOpenFileArea,
    onCollapseFileArea,
    onToggleFileArea,
    onShowCompactDetail,
    onShowCompactFiles,
    onBranchSelected,
    onMaximizeTerminal,
    terminalFocusMode,
  }: {
    showActions?: boolean
    revealRequest?: { relativePath: string } | null
    plainWorkspaceTerminalPanel?: ReactNode
    fileAreaCollapsed?: boolean
    compactSurface?: 'scope' | 'files'
    onOpenFileArea?: () => void
    onCollapseFileArea?: () => void
    onToggleFileArea?: () => void
    onShowCompactDetail?: () => void
    onShowCompactFiles?: () => void
    onBranchSelected?: () => void
    onMaximizeTerminal?: () => void
    terminalFocusMode?: boolean
  }) => (
    <div
      data-testid="repo-explorer-pane"
      data-show-actions={String(showActions)}
      data-reveal-path={revealRequest?.relativePath ?? ''}
      data-file-area-collapsed={fileAreaCollapsed === undefined ? 'unset' : String(fileAreaCollapsed)}
      data-compact-surface={compactSurface ?? ''}
      data-terminal-focus-mode={String(!!terminalFocusMode)}
    >
      {onOpenFileArea && (
        <button type="button" data-testid="open-file-area" onClick={onOpenFileArea}>
          open files
        </button>
      )}
      {onToggleFileArea && (
        <button type="button" data-testid="toggle-file-area" onClick={onToggleFileArea}>
          toggle files
        </button>
      )}
      {onCollapseFileArea && (
        <button type="button" data-testid="collapse-file-area" onClick={onCollapseFileArea}>
          collapse files
        </button>
      )}
      {onShowCompactDetail && (
        <button type="button" data-testid="show-compact-detail" onClick={onShowCompactDetail}>
          show detail
        </button>
      )}
      {onShowCompactFiles && (
        <button type="button" data-testid="show-compact-files" onClick={onShowCompactFiles}>
          show files
        </button>
      )}
      {onBranchSelected && (
        <button type="button" data-testid="select-branch" onClick={onBranchSelected}>
          select branch
        </button>
      )}
      {onMaximizeTerminal && (
        <button type="button" data-testid="maximize-terminal" onClick={onMaximizeTerminal}>
          maximize terminal
        </button>
      )}
      {plainWorkspaceTerminalPanel}
    </div>
  ),
}))

vi.mock('#/web/components/SplitPane.tsx', () => ({
  SplitPane: ({ before, after }: { before: ReactNode; after: ReactNode }) => (
    <div data-testid="split-pane">
      {before}
      {after}
    </div>
  ),
}))

const REPO_ID = '/tmp/gbl-repo-view-topbar-actions-repo'
const REMOTE_REPO_ID = 'ssh-config://prod/srv/plain'

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  branchWorkspacePaneState.fileAreaOpenRequestCount = 0
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  resetReposStore()
  branchWorkspaceQueryState.repositories = []
  branchWorkspaceQueryState.includeItem = true
  branchWorkspaceQueryState.isFetching = false
  setCompactUi(true)
})

function setCompactUi(compact: boolean) {
  window.matchMedia = vi.fn((query: string) => ({
    matches: compact && query === '(max-width: 639px)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as typeof window.matchMedia
}

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  container?.remove()
  root = null
  container = null
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('RepoView', () => {
  test('renders the selected detached worktree terminal context in compact detail', () => {
    const detachedPath = '/tmp/detached-worktree'
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('main', { worktree: { path: REPO_ID } })],
      selectedBranch: null,
      selectedDetachedWorktreePath: detachedPath,
      worktreesByPath: {
        [REPO_ID]: { path: REPO_ID, branch: 'main', isMain: true },
        [detachedPath]: {
          path: detachedPath,
          head: 'abcdef1234567890',
          isDetached: true,
          isMain: false,
        },
      },
    })

    renderRepoView()

    const detail = container?.querySelector('[data-testid="worktree-terminal-panel"]')
    expect(detail?.getAttribute('data-worktree-path')).toBe(detachedPath)
    expect(detail?.getAttribute('data-terminal-label')).toBe('HEAD@abcdef123456')
    expect(detail?.getAttribute('data-compact-focus-presentation')).toBe('true')
    expect(container?.querySelector('[data-testid="branch-detail"]')).toBeNull()
  })

  test('renders only detail for a compact Git repository with a selected worktree', () => {
    seedRepoWithSelectedWorktree()

    renderRepoView()

    const detail = container?.querySelector('[data-testid="branch-detail"]')
    expect(detail).not.toBeNull()
    expect(detail?.getAttribute('data-collapsed')).toBe('false')
    expect(detail?.getAttribute('data-compact-focus-presentation')).toBe('true')
    expect(container?.querySelector('[data-testid="repo-explorer-pane"]')).toBeNull()
    expect(container?.querySelector('[data-testid="split-pane"]')).toBeNull()
  })

  test('renders only explorer after the compact detail requests the workspace', async () => {
    seedRepoWithSelectedWorktree()
    renderRepoView()

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="show-compact-explorer"]')?.click()
    })

    expect(container?.querySelector('[data-testid="branch-detail"]')).toBeNull()
    expect(container?.querySelector('[data-testid="repo-explorer-pane"]')?.getAttribute('data-compact-surface')).toBe(
      'scope',
    )
    expect(container?.querySelector('[data-testid="split-pane"]')).toBeNull()
  })

  test('switches a compact Git repository from scope to files without mounting a split pane', async () => {
    seedRepoWithSelectedWorktree()
    renderRepoView()

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="show-compact-explorer"]')?.click()
    })
    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="show-compact-files"]')?.click()
    })

    expect(container?.querySelector('[data-testid="repo-explorer-pane"]')?.getAttribute('data-compact-surface')).toBe(
      'files',
    )
    expect(container?.querySelector('[data-testid="branch-detail"]')).toBeNull()
    expect(container?.querySelector('[data-testid="split-pane"]')).toBeNull()
  })

  test('opens the compact Files surface through the idempotent file area intent', async () => {
    seedRepoWithSelectedWorktree()
    useReposStore.getState().setExplorerTab(REPO_ID, 'changes')
    renderRepoView()

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="show-compact-explorer"]')?.click()
    })
    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="open-file-area"]')?.click()
    })

    expect(container?.querySelector('[data-testid="repo-explorer-pane"]')?.getAttribute('data-compact-surface')).toBe(
      'files',
    )
    expect(explorerTabForRepo(useReposStore.getState().repos[REPO_ID]!)).toBe('files')
  })

  test('keeps an idempotent file area request when the active repository changes in the same interaction', async () => {
    const nextRepoId = '/tmp/gbl-repo-view-next-repo'
    seedRepoState({
      id: nextRepoId,
      branches: [createRepoBranch('main', { worktree: { path: nextRepoId } })],
      currentBranch: 'main',
      selectedBranch: 'main',
    })
    const nextRepo = useReposStore.getState().repos[nextRepoId]!
    seedRepoWithSelectedWorktree()
    useReposStore.setState((state) => ({ repos: { ...state.repos, [nextRepoId]: nextRepo } }))
    useReposStore.getState().setExplorerTab(nextRepoId, 'changes')
    renderRepoView()
    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="show-compact-explorer"]')?.click()
    })
    const requestOpenFileArea = container?.querySelector<HTMLButtonElement>('[data-testid="open-file-area"]')
    expect(requestOpenFileArea).not.toBeNull()

    act(() => {
      root!.render(
        <MainWindowNavigationProvider value={navigationWith({})}>
          <RepoView repoId={nextRepoId} />
        </MainWindowNavigationProvider>,
      )
      requestOpenFileArea?.click()
    })

    expect(container?.querySelector('[data-testid="repo-explorer-pane"]')?.getAttribute('data-compact-surface')).toBe(
      'files',
    )
    expect(explorerTabForRepo(useReposStore.getState().repos[nextRepoId]!)).toBe('files')
  })

  test('keeps compact explorer actions visible without a desktop focus preference', async () => {
    seedRepoWithSelectedWorktree()
    renderRepoView()

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="show-compact-explorer"]')?.click()
    })

    expect(container?.querySelector('[data-testid="repo-explorer-pane"]')?.getAttribute('data-show-actions')).toBe(
      'true',
    )
  })

  test.each(['show-compact-detail', 'select-branch'])(
    'returns to compact detail through the %s callback',
    async (callbackTestId) => {
      seedRepoWithSelectedWorktree()
      renderRepoView()
      await act(async () => {
        container?.querySelector<HTMLButtonElement>('[data-testid="show-compact-explorer"]')?.click()
      })

      await act(async () => {
        container?.querySelector<HTMLButtonElement>(`[data-testid="${callbackTestId}"]`)?.click()
      })

      expect(container?.querySelector('[data-testid="branch-detail"]')).not.toBeNull()
      expect(container?.querySelector('[data-testid="repo-explorer-pane"]')).toBeNull()
    },
  )

  test('renders only explorer in compact mode when the selected branch has no worktree', () => {
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('main')],
      currentBranch: 'main',
      selectedBranch: 'main',
    })

    renderRepoView()

    expect(container?.querySelector('[data-testid="branch-detail"]')).toBeNull()
    expect(container?.querySelector('[data-testid="repo-explorer-pane"]')?.getAttribute('data-compact-surface')).toBe(
      'scope',
    )
    expect(container?.querySelector('[data-testid="split-pane"]')).toBeNull()
  })

  test('keeps the existing split workspace in default UI mode', () => {
    seedRepoWithSelectedWorktree()
    setCompactUi(false)

    renderRepoView()

    expect(container?.querySelector('[data-testid="split-pane"]')).not.toBeNull()
    expect(container?.querySelector('[data-testid="branch-detail"]')).not.toBeNull()
    expect(container?.querySelector('[data-testid="repo-explorer-pane"]')).not.toBeNull()
  })

  test('maximizes only the terminal detail on desktop after an explicit maximize action', async () => {
    seedRepoWithSelectedWorktree()
    setCompactUi(false)

    renderRepoView()

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="maximize-terminal"]')?.click()
    })

    expect(container?.querySelector('[data-testid="split-pane"]')).toBeNull()
    expect(container?.querySelector('[data-testid="repo-explorer-pane"]')).toBeNull()
    expect(container?.querySelector('[data-testid="branch-detail"]')?.getAttribute('data-detail-focus-mode')).toBe(
      'true',
    )
  })

  test('restores the desktop split after terminal focus exits', async () => {
    seedRepoWithSelectedWorktree()
    setCompactUi(false)

    renderRepoView()

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="maximize-terminal"]')?.click()
    })
    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="exit-terminal-focus"]')?.click()
    })

    expect(container?.querySelector('[data-testid="split-pane"]')).not.toBeNull()
    expect(container?.querySelector('[data-testid="repo-explorer-pane"]')).not.toBeNull()
  })

  test('starts desktop in the split without an explicit maximize action', () => {
    seedRepoWithSelectedWorktree()
    setCompactUi(false)

    renderRepoView()

    expect(container?.querySelector('[data-testid="split-pane"]')).not.toBeNull()
    expect(container?.querySelector('[data-testid="repo-explorer-pane"]')).not.toBeNull()
    expect(container?.querySelector('[data-testid="branch-detail"]')?.getAttribute('data-detail-focus-mode')).toBe(
      'false',
    )
  })

  test('keeps desktop terminal focus when the selected Git branch changes', async () => {
    seedRepoState({
      id: REPO_ID,
      branches: [
        createRepoBranch('main', { worktree: { path: REPO_ID } }),
        createRepoBranch('feature/next', { worktree: { path: `${REPO_ID}/feature-next` } }),
      ],
      currentBranch: 'main',
      selectedBranch: 'main',
    })
    setCompactUi(false)
    renderRepoView()

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="maximize-terminal"]')?.click()
    })
    expect(container?.querySelector('[data-testid="split-pane"]')).toBeNull()

    await act(async () => {
      useReposStore.getState().selectBranch(REPO_ID, 'feature/next')
    })

    expect(container?.querySelector('[data-testid="split-pane"]')).toBeNull()
    expect(useReposStore.getState().repos[REPO_ID]?.ui.detailTab).toBe('terminal')
  })

  test('keeps desktop terminal focus while switching projects', async () => {
    const firstRepo = seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('main', { worktree: { path: REPO_ID } })],
      currentBranch: 'main',
      selectedBranch: 'main',
    })
    const nextRepoId = '/tmp/gbl-repo-view-next-project'
    const nextRepo = seedRepoState({
      id: nextRepoId,
      branches: [createRepoBranch('main', { worktree: { path: nextRepoId } })],
      currentBranch: 'main',
      selectedBranch: 'main',
      detailTab: 'status',
    })
    useReposStore.setState({
      repos: { [REPO_ID]: firstRepo, [nextRepoId]: nextRepo },
      order: [REPO_ID, nextRepoId],
      activeId: REPO_ID,
      activeProjectId: REPO_ID,
    })
    setCompactUi(false)
    renderRepoView(REPO_ID)

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="maximize-terminal"]')?.click()
    })
    rerenderRepoView(nextRepoId)

    expect(container?.querySelector('[data-testid="split-pane"]')).toBeNull()
    expect(container?.querySelector('[data-testid="branch-detail"]')?.getAttribute('data-detail-focus-mode')).toBe(
      'true',
    )
    expect(useReposStore.getState().repos[nextRepoId]?.ui.detailTab).toBe('terminal')
  })

  test('restores global terminal focus after a compact responsive transition', async () => {
    seedRepoWithSelectedWorktree()
    setCompactUi(false)
    renderRepoView()
    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="maximize-terminal"]')?.click()
    })
    expect(container?.querySelector('[data-testid="split-pane"]')).toBeNull()

    setCompactUi(true)
    rerenderRepoView(REPO_ID)
    setCompactUi(false)
    rerenderRepoView(REPO_ID)

    expect(container?.querySelector('[data-testid="split-pane"]')).toBeNull()
  })

  test('restores global terminal focus after an unavailable destination recovers', async () => {
    seedRepoWithSelectedWorktree()
    setCompactUi(false)
    renderRepoView()
    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="maximize-terminal"]')?.click()
    })

    await act(async () => markTestRepoUnavailable())
    expect(container?.querySelector('[data-testid="split-pane"]')).not.toBeNull()
    await act(async () => {
      useReposStore.setState((state) => ({
        repos: {
          ...state.repos,
          [REPO_ID]: {
            ...state.repos[REPO_ID]!,
            availability: { phase: 'available' as const, checkedAt: 2 },
          },
        },
      }))
    })

    expect(container?.querySelector('[data-testid="split-pane"]')).toBeNull()
  })

  test('keeps global terminal focus after the active branch workspace is deleted', async () => {
    seedRepoState({ id: REPO_ID, isGitRepo: false, branches: [], currentBranch: '', selectedBranch: null })
    useReposStore.setState({
      workspaceProjects: {
        [REPO_ID]: {
          rootId: REPO_ID,
          repositoryIds: [],
          candidates: [],
          configured: true,
          configurationError: null,
          phase: 'ready',
          skipped: [],
          error: null,
        },
      },
      workspaceActiveContextByRoot: { [REPO_ID]: { kind: 'overview' } },
    })
    setCompactUi(false)
    renderRepoView()
    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="maximize-terminal"]')?.click()
    })
    expect(
      container?.querySelector('[data-testid="repo-explorer-pane"]')?.getAttribute('data-terminal-focus-mode'),
    ).toBe('true')

    await act(async () => {
      useReposStore.setState((state) => ({
        workspaceActiveContextByRoot: {
          ...state.workspaceActiveContextByRoot,
          [REPO_ID]: { kind: 'branch-workspace', branchWorkspaceId: 'branch-1' },
        },
      }))
    })
    expect(container?.querySelector('[data-testid="branch-workspace-pane"]')).not.toBeNull()

    branchWorkspaceQueryState.includeItem = false
    rerenderRepoView(REPO_ID)
    await act(async () => Promise.resolve())

    expect(useReposStore.getState().workspaceActiveContextByRoot[REPO_ID]).toEqual({ kind: 'overview' })
    expect(
      container?.querySelector('[data-testid="repo-explorer-pane"]')?.getAttribute('data-terminal-focus-mode'),
    ).toBe('true')
  })

  test('switches a compact non-git workspace root between terminal focus and overview', async () => {
    seedRepoState({
      id: REPO_ID,
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })
    useReposStore.setState({
      workspaceProjects: {
        [REPO_ID]: {
          rootId: REPO_ID,
          repositoryIds: [],
          candidates: [],
          configured: false,
          configurationError: null,
          phase: 'ready',
          skipped: [],
          error: null,
        },
      },
    })

    renderRepoView()

    const terminalPanel = container?.querySelector('[data-testid="plain-workspace-terminal-panel"]')
    expect(terminalPanel).not.toBeNull()
    expect(terminalPanel?.getAttribute('data-repo-id')).toBe(REPO_ID)
    expect(terminalPanel?.getAttribute('data-compact-focus-presentation')).toBe('true')
    expect(container?.querySelector('[data-testid="repo-explorer-pane"]')).toBeNull()
    expect(container?.querySelector('[data-testid="split-pane"]')).toBeNull()

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="show-compact-overview"]')?.click()
    })

    expect(container?.querySelector('[data-testid="plain-workspace-terminal-panel"]')).toBeNull()
    expect(container?.querySelector('[data-testid="repo-explorer-pane"]')?.getAttribute('data-compact-surface')).toBe(
      'scope',
    )

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="show-compact-detail"]')?.click()
    })

    expect(container?.querySelector('[data-testid="plain-workspace-terminal-panel"]')).not.toBeNull()
    expect(container?.querySelector('[data-testid="repo-explorer-pane"]')).toBeNull()
  })

  test('renders the selected branch workspace as a folder context instead of a nested repository', () => {
    seedRepoState({
      id: REPO_ID,
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })
    useReposStore.setState({
      workspaceProjects: {
        [REPO_ID]: {
          rootId: REPO_ID,
          repositoryIds: [],
          candidates: [],
          configured: true,
          configurationError: null,
          phase: 'ready',
          skipped: [],
          error: null,
        },
      },
      workspaceActiveContextByRoot: {
        [REPO_ID]: { kind: 'branch-workspace', branchWorkspaceId: 'branch-1' },
      },
    })

    renderRepoView()

    expect(container?.querySelector('[data-testid="branch-workspace-pane"]')?.textContent).toContain('feature/auth')
    expect(container?.querySelector('[data-testid="branch-detail"]')).toBeNull()
    expect(container?.querySelector('[data-testid="plain-workspace-terminal-panel"]')).toBeNull()
  })

  test('resolves a selected branch workspace member without changing the active project', () => {
    const memberRepoId = `${REPO_ID}/api`
    const memberWorktreePath = `${REPO_ID}/goblin-feature-auth/api`
    const rootRepo = seedRepoState({
      id: REPO_ID,
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })
    const memberRepo = seedRepoState({
      id: memberRepoId,
      branches: [createRepoBranch('feature/auth', { worktree: { path: memberWorktreePath } })],
      currentBranch: 'main',
      selectedBranch: 'feature/auth',
    })
    branchWorkspaceQueryState.repositories = [
      {
        repositoryName: 'api',
        targetBranch: 'feature/auth',
        baseBranch: 'main',
        branchOrigin: 'created',
        worktreePath: memberWorktreePath,
        progress: 'complete',
        ready: true,
      },
    ]
    useReposStore.setState({
      repos: { [REPO_ID]: rootRepo, [memberRepoId]: memberRepo },
      activeId: REPO_ID,
      workspaceProjects: {
        [REPO_ID]: {
          rootId: REPO_ID,
          repositoryIds: [memberRepoId],
          candidates: [{ id: memberRepoId, name: 'api', selected: true, available: true }],
          configured: true,
          configurationError: null,
          phase: 'ready',
          skipped: [],
          error: null,
        },
      },
      workspaceActiveContextByRoot: {
        [REPO_ID]: {
          kind: 'branch-workspace',
          branchWorkspaceId: 'branch-1',
          memberRepositoryName: 'api',
        },
      },
    })

    renderRepoView()

    const pane = container?.querySelector('[data-testid="branch-workspace-pane"]')
    expect(pane, container?.innerHTML).not.toBeNull()
    expect(pane?.getAttribute('data-member-repo-id')).toBe(memberRepoId)
    expect(useReposStore.getState().activeId).toBe(REPO_ID)
  })

  test('captures an invalid member notice before falling back to the same branch workspace root', () => {
    const memberWorktreePath = `${REPO_ID}/goblin-feature-auth/api`
    seedRepoState({
      id: REPO_ID,
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })
    branchWorkspaceQueryState.repositories = [
      {
        repositoryName: 'api',
        targetBranch: 'feature/auth',
        baseBranch: 'main',
        branchOrigin: 'created',
        worktreePath: memberWorktreePath,
        progress: 'complete',
        ready: true,
      },
    ]
    const activateBranchWorkspace = vi.fn((rootId: string, branchWorkspaceId: string) => {
      useReposStore.setState((state) => ({
        activeId: rootId,
        workspaceActiveContextByRoot: {
          ...state.workspaceActiveContextByRoot,
          [rootId]: { kind: 'branch-workspace', branchWorkspaceId },
        },
      }))
    })
    useReposStore.setState({
      activeId: REPO_ID,
      workspaceProjects: {
        [REPO_ID]: {
          rootId: REPO_ID,
          repositoryIds: [],
          candidates: [],
          configured: true,
          configurationError: null,
          phase: 'ready',
          skipped: [],
          error: null,
        },
      },
      workspaceActiveContextByRoot: {
        [REPO_ID]: {
          kind: 'branch-workspace',
          branchWorkspaceId: 'branch-1',
          memberRepositoryName: 'api',
        },
      },
      activateBranchWorkspace,
    })

    renderRepoView()

    expect(activateBranchWorkspace).toHaveBeenCalledWith(REPO_ID, 'branch-1')
    expect(
      container?.querySelector('[data-testid="branch-workspace-pane"]')?.getAttribute('data-fallback-member'),
    ).toBe('api')
    expect(useReposStore.getState().workspaceActiveContextByRoot[REPO_ID]).toEqual({
      kind: 'branch-workspace',
      branchWorkspaceId: 'branch-1',
    })
  })

  test('keeps the selected member while a stale not-ready snapshot is refetching', () => {
    const memberRepoId = `${REPO_ID}/api`
    const memberWorktreePath = `${REPO_ID}/goblin-feature-auth/api`
    const rootRepo = seedRepoState({
      id: REPO_ID,
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })
    const memberRepo = seedRepoState({
      id: memberRepoId,
      branches: [createRepoBranch('feature/auth', { worktree: { path: memberWorktreePath } })],
      currentBranch: 'main',
      selectedBranch: 'feature/auth',
    })
    branchWorkspaceQueryState.repositories = [
      {
        repositoryName: 'api',
        targetBranch: 'feature/auth',
        baseBranch: 'main',
        branchOrigin: 'created',
        worktreePath: memberWorktreePath,
        progress: 'complete',
        ready: false,
      },
    ]
    branchWorkspaceQueryState.isFetching = true
    const activateBranchWorkspace = vi.fn((rootId: string, branchWorkspaceId: string) => {
      useReposStore.setState((state) => ({
        activeId: rootId,
        workspaceActiveContextByRoot: {
          ...state.workspaceActiveContextByRoot,
          [rootId]: { kind: 'branch-workspace', branchWorkspaceId },
        },
      }))
    })
    useReposStore.setState({
      repos: { [REPO_ID]: rootRepo, [memberRepoId]: memberRepo },
      activeId: REPO_ID,
      workspaceProjects: {
        [REPO_ID]: {
          rootId: REPO_ID,
          repositoryIds: [memberRepoId],
          candidates: [{ id: memberRepoId, name: 'api', selected: true, available: true }],
          configured: true,
          configurationError: null,
          phase: 'ready',
          skipped: [],
          error: null,
        },
      },
      workspaceActiveContextByRoot: {
        [REPO_ID]: {
          kind: 'branch-workspace',
          branchWorkspaceId: 'branch-1',
          memberRepositoryName: 'api',
        },
      },
      activateBranchWorkspace,
    })

    renderRepoView()

    expect(activateBranchWorkspace).not.toHaveBeenCalled()
    expect(useReposStore.getState().workspaceActiveContextByRoot[REPO_ID]).toMatchObject({
      kind: 'branch-workspace',
      memberRepositoryName: 'api',
    })
    expect(
      container?.querySelector('[data-testid="branch-workspace-pane"]')?.getAttribute('data-fallback-member'),
    ).toBe('')

    branchWorkspaceQueryState.repositories[0]!.ready = true
    branchWorkspaceQueryState.isFetching = false
    rerenderRepoView(REPO_ID)

    expect(container?.querySelector('[data-testid="branch-workspace-pane"]')?.getAttribute('data-member-repo-id')).toBe(
      memberRepoId,
    )
  })

  test('expands the persisted file area when a branch workspace member requests navigation', () => {
    seedRepoState({
      id: REPO_ID,
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })
    useReposStore.setState({
      workspaceProjects: {
        [REPO_ID]: {
          rootId: REPO_ID,
          repositoryIds: [],
          candidates: [],
          configured: true,
          configurationError: null,
          phase: 'ready',
          skipped: [],
          error: null,
        },
      },
      workspaceActiveContextByRoot: { [REPO_ID]: { kind: 'overview' } },
    })
    setCompactUi(false)
    renderRepoView()

    act(() => container?.querySelector<HTMLButtonElement>('[data-testid="toggle-file-area"]')?.click())
    expect(
      container?.querySelector('[data-testid="repo-explorer-pane"]')?.getAttribute('data-file-area-collapsed'),
    ).toBe('true')

    act(() => {
      useReposStore.setState({
        workspaceActiveContextByRoot: {
          [REPO_ID]: { kind: 'branch-workspace', branchWorkspaceId: 'branch-1' },
        },
      })
    })
    act(() => container?.querySelector<HTMLButtonElement>('[data-testid="open-member-file-area"]')?.click())
    expect(branchWorkspacePaneState.fileAreaOpenRequestCount).toBe(1)
    act(() => {
      useReposStore.setState({ workspaceActiveContextByRoot: { [REPO_ID]: { kind: 'overview' } } })
    })

    expect(
      container?.querySelector('[data-testid="repo-explorer-pane"]')?.getAttribute('data-file-area-collapsed'),
    ).toBe('false')

    act(() => {
      useReposStore.setState({
        workspaceActiveContextByRoot: {
          [REPO_ID]: { kind: 'branch-workspace', branchWorkspaceId: 'branch-1' },
        },
      })
    })
    act(() =>
      container?.querySelector<HTMLButtonElement>('[data-testid="collapse-branch-workspace-file-area"]')?.click(),
    )
    act(() => {
      useReposStore.setState({ workspaceActiveContextByRoot: { [REPO_ID]: { kind: 'overview' } } })
    })

    expect(
      container?.querySelector('[data-testid="repo-explorer-pane"]')?.getAttribute('data-file-area-collapsed'),
    ).toBe('true')
  })

  test('keeps file-area collapse available without mounting branch detail for desktop non-git workspaces', () => {
    seedRepoState({
      id: REPO_ID,
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })
    useReposStore.setState({ workspaceLayout: 'left-right', detailCollapsed: false })
    setCompactUi(false)

    renderRepoView()

    expect(container?.querySelector('[data-testid="branch-detail"]')).toBeNull()
    expect(container?.querySelector('[data-testid="repo-explorer-pane"]')).not.toBeNull()
    expect(
      container?.querySelector('[data-testid="repo-explorer-pane"]')?.getAttribute('data-file-area-collapsed'),
    ).toBe('false')
    const toggle = container?.querySelector<HTMLButtonElement>('[data-testid="toggle-file-area"]')
    expect(toggle).not.toBeNull()

    act(() => toggle?.click())

    expect(
      container?.querySelector('[data-testid="repo-explorer-pane"]')?.getAttribute('data-file-area-collapsed'),
    ).toBe('true')
    expect(container?.textContent).not.toContain('branches.empty')
  })

  test('switches a compact non-git remote workspace between terminal and files focus', async () => {
    seedRepoState({
      id: REMOTE_REPO_ID,
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
      remote: {
        target: {
          id: REMOTE_REPO_ID,
          alias: 'prod',
          host: 'example.com',
          user: 'alice',
          port: 22,
          remotePath: '/srv/plain',
          displayName: 'prod:plain',
        },
      },
    })
    useReposStore.setState({ workspaceLayout: 'left-right', detailCollapsed: false })

    renderRepoView(REMOTE_REPO_ID)

    expect(container?.querySelector('[data-testid="branch-detail"]')).toBeNull()
    expect(container?.querySelector('[data-testid="repo-explorer-pane"]')).toBeNull()
    const terminalPanel = container?.querySelector('[data-testid="plain-workspace-terminal-panel"]')
    expect(terminalPanel?.getAttribute('data-repo-id')).toBe(REMOTE_REPO_ID)
    expect(terminalPanel?.getAttribute('data-compact-focus-presentation')).toBe('true')
    expect(container?.querySelector('[data-testid="show-compact-overview"]')).not.toBeNull()
    expect(container?.textContent).not.toContain('branches.empty')

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="show-compact-overview"]')?.click()
    })

    expect(container?.querySelector('[data-testid="plain-workspace-terminal-panel"]')).toBeNull()
    expect(container?.querySelector('[data-testid="repo-explorer-pane"]')?.getAttribute('data-compact-surface')).toBe(
      'files',
    )
    expect(container?.querySelector('[data-testid="split-pane"]')).toBeNull()
  })

  test('does not render repository toolbar controls for non-git local workspaces', () => {
    seedRepoState({
      id: REPO_ID,
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })
    useReposStore.setState({ workspaceLayout: 'left-right', detailCollapsed: true })

    renderRepoView()

    expect(container?.querySelector('[aria-label="workspace.layout-label"]')).toBeNull()
    expect(container?.querySelector('[aria-label="branches.filter-label"]')).toBeNull()
    expect(container?.querySelector('[aria-label="branches.search-label"]')).toBeNull()
    expect(container?.querySelector('button[aria-label="action.create-worktree-title"]')).toBeNull()
  })

  test('keeps project navigation beside the unavailable view', () => {
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('main')],
      currentBranch: 'main',
      selectedBranch: 'main',
    })
    markTestRepoUnavailable()

    renderRepoView()

    expect(container?.querySelector('[data-testid="split-pane"]')).not.toBeNull()
    expect(container?.querySelector('[data-testid="repo-explorer-pane"]')).not.toBeNull()
    expect(container?.querySelector('[data-testid="branch-detail"]')).toBeNull()
    expect(container?.textContent).toContain('repo-unavailable.title')
  })

  test('replaces the plain workspace terminal panel with the unavailable view', () => {
    seedRepoState({
      id: REPO_ID,
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })
    markTestRepoUnavailable()

    renderRepoView()

    expect(container?.querySelector('[data-testid="repo-explorer-pane"]')).not.toBeNull()
    expect(container?.querySelector('[data-testid="branch-detail"]')).toBeNull()
    expect(container?.textContent).toContain('repo-unavailable.title')
  })

  test('routes compact terminal reveal requests to the repository explorer', async () => {
    seedRepoState({
      id: REPO_ID,
      branches: [
        createRepoBranch('main'),
        createRepoBranch('feature/a', { worktree: { path: `${REPO_ID}/feature-a` } }),
      ],
      currentBranch: 'main',
      selectedBranch: 'feature/a',
    })
    useReposStore.setState({ workspaceLayout: 'left-right', detailCollapsed: true })

    renderRepoView()

    expect(container?.querySelector('[data-testid="branch-detail"]')).not.toBeNull()
    expect(container?.querySelector('[data-testid="repo-explorer-pane"]')).toBeNull()

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="branch-detail"]')?.click()
    })

    expect(container?.querySelector('[data-testid="branch-detail"]')).toBeNull()
    expect(container?.querySelector('[data-testid="repo-explorer-pane"]')?.getAttribute('data-reveal-path')).toBe(
      'src/from-terminal.ts',
    )
    expect(container?.querySelector('[data-testid="repo-explorer-pane"]')?.getAttribute('data-compact-surface')).toBe(
      'files',
    )
  })

  test('does not replay a compact terminal reveal after returning through ordinary navigation', async () => {
    seedRepoWithSelectedWorktree()
    renderRepoView()

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="branch-detail"]')?.click()
    })
    expect(container?.querySelector('[data-testid="repo-explorer-pane"]')?.getAttribute('data-reveal-path')).toBe(
      'src/from-terminal.ts',
    )

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="show-compact-detail"]')?.click()
    })
    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="show-compact-explorer"]')?.click()
    })

    expect(container?.querySelector('[data-testid="repo-explorer-pane"]')?.getAttribute('data-reveal-path')).toBe('')
  })

  test('does not replay a compact terminal reveal after switching repositories and back', async () => {
    const otherRepoId = `${REPO_ID}-other`
    const firstRepo = seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('main', { worktree: { path: REPO_ID } })],
      currentBranch: 'main',
      selectedBranch: 'main',
    })
    const otherRepo = seedRepoState({
      id: otherRepoId,
      branches: [createRepoBranch('main', { worktree: { path: otherRepoId } })],
      currentBranch: 'main',
      selectedBranch: 'main',
    })
    useReposStore.setState({
      repos: { [REPO_ID]: firstRepo, [otherRepoId]: otherRepo },
      order: [REPO_ID, otherRepoId],
      activeId: REPO_ID,
    })
    renderRepoView()

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="branch-detail"]')?.click()
    })
    expect(container?.querySelector('[data-testid="repo-explorer-pane"]')?.getAttribute('data-reveal-path')).toBe(
      'src/from-terminal.ts',
    )

    rerenderRepoView(otherRepoId)
    rerenderRepoView(REPO_ID)

    expect(container?.querySelector('[data-testid="branch-detail"]')).not.toBeNull()
    expect(container?.querySelector('[data-testid="repo-explorer-pane"]')).toBeNull()
  })

  test('routes desktop terminal reveal requests and expands the file area', async () => {
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('main'), createRepoBranch('feature/a')],
      currentBranch: 'main',
      selectedBranch: 'feature/a',
    })
    useReposStore.setState({ workspaceLayout: 'left-right', detailCollapsed: true })
    setCompactUi(false)
    renderRepoView()

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="toggle-file-area"]')?.click()
    })
    expect(
      container?.querySelector('[data-testid="repo-explorer-pane"]')?.getAttribute('data-file-area-collapsed'),
    ).toBe('true')

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="branch-detail"]')?.click()
    })

    expect(
      container?.querySelector('[data-testid="repo-explorer-pane"]')?.getAttribute('data-file-area-collapsed'),
    ).toBe('false')
    expect(container?.querySelector('[data-testid="repo-explorer-pane"]')?.getAttribute('data-reveal-path')).toBe(
      'src/from-terminal.ts',
    )
  })

  test('toggles the Git workspace file area locally', async () => {
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('main')],
      currentBranch: 'main',
      selectedBranch: 'main',
    })
    setCompactUi(false)

    renderRepoView()

    const explorer = () => container?.querySelector('[data-testid="repo-explorer-pane"]')
    expect(explorer()?.getAttribute('data-file-area-collapsed')).toBe('false')

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="toggle-file-area"]')?.click()
    })

    expect(explorer()?.getAttribute('data-file-area-collapsed')).toBe('true')
  })

  test('collapses the File area through an idempotent workspace navigation intent', () => {
    seedRepoWithSelectedWorktree()
    setCompactUi(false)
    renderRepoView()

    const explorer = () => container?.querySelector('[data-testid="repo-explorer-pane"]')
    expect(explorer()?.getAttribute('data-file-area-collapsed')).toBe('false')

    act(() => container?.querySelector<HTMLButtonElement>('[data-testid="collapse-file-area"]')?.click())

    expect(explorer()?.getAttribute('data-file-area-collapsed')).toBe('true')
  })

  test('switches from plain workspace shell to git workspace shell when repo capability changes', () => {
    seedRepoState({
      id: REPO_ID,
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })
    useReposStore.setState({ workspaceLayout: 'left-right', detailCollapsed: false })

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
})

function markTestRepoUnavailable(repoId = REPO_ID) {
  useReposStore.setState((state) => {
    const repo = state.repos[repoId]
    if (!repo) return state
    return {
      repos: {
        ...state.repos,
        [repoId]: {
          ...repo,
          availability: { phase: 'unavailable' as const, reason: 'path-missing', checkedAt: 1 },
        },
      },
    }
  })
}

function renderRepoView(repoId = REPO_ID) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  rerenderRepoView(repoId)
}

function rerenderRepoView(repoId: string) {
  act(() => {
    root!.render(
      <MainWindowNavigationProvider value={navigationWith({})}>
        <RepoView repoId={repoId} />
      </MainWindowNavigationProvider>,
    )
  })
}

function seedRepoWithSelectedWorktree() {
  seedRepoState({
    id: REPO_ID,
    branches: [createRepoBranch('main', { worktree: { path: REPO_ID } })],
    currentBranch: 'main',
    selectedBranch: 'main',
  })
}

function navigationWith(overrides: Partial<MainWindowNavigationActions>): MainWindowNavigationActions {
  const base: MainWindowNavigationActions = {
    activateRepo: () => {},
    closeRepo: () => {},
    cycleRepo: () => {},
    selectRepoBranch: () => {},
    selectRepoDetachedWorktree: () => {},
    showRepoDetailTab: () => {},
    showRepoBranchDetailTab: () => {},
    showRepoDetachedWorktreeDetailTab: () => {},
    openSettings: () => {},
  }
  return Object.assign(base, overrides)
}
