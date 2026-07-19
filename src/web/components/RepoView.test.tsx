// @vitest-environment jsdom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { RepoView } from '#/web/components/RepoView.tsx'
import { MainWindowNavigationProvider, type MainWindowNavigationActions } from '#/web/main-window-navigation.tsx'
import { resetReposStore, seedRepoState, createRepoBranch } from '#/web/stores/repos/test-utils.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'

vi.mock('#/web/components/BranchDetail.tsx', () => ({
  BranchDetail: ({
    collapsed,
    compactFocusPresentation,
    onRevealPath,
    onShowCompactExplorer,
  }: {
    collapsed?: boolean
    compactFocusPresentation?: boolean
    onRevealPath?: (relativePath: string) => void
    onShowCompactExplorer?: () => void
  }) => (
    <>
      <button
        type="button"
        data-testid="branch-detail"
        data-collapsed={String(collapsed)}
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
    </>
  ),
}))

vi.mock('#/web/components/repo-workspace/RepoExplorerPane.tsx', () => ({
  RepoExplorerPane: ({
    showActions,
    revealRequest,
    plainWorkspaceTerminalPanel,
    fileAreaCollapsed,
    onToggleFileArea,
    onShowCompactDetail,
    onBranchSelected,
  }: {
    showActions?: boolean
    revealRequest?: { relativePath: string } | null
    plainWorkspaceTerminalPanel?: ReactNode
    fileAreaCollapsed?: boolean
    onToggleFileArea?: () => void
    onShowCompactDetail?: () => void
    onBranchSelected?: () => void
  }) => (
    <div
      data-testid="repo-explorer-pane"
      data-show-actions={String(showActions)}
      data-reveal-path={revealRequest?.relativePath ?? ''}
      data-file-area-collapsed={fileAreaCollapsed === undefined ? 'unset' : String(fileAreaCollapsed)}
    >
      {onToggleFileArea && (
        <button type="button" data-testid="toggle-file-area" onClick={onToggleFileArea}>
          toggle files
        </button>
      )}
      {onShowCompactDetail && (
        <button type="button" data-testid="show-compact-detail" onClick={onShowCompactDetail}>
          show detail
        </button>
      )}
      {onBranchSelected && (
        <button type="button" data-testid="select-branch" onClick={onBranchSelected}>
          select branch
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
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  resetReposStore()
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
    expect(container?.querySelector('[data-testid="repo-explorer-pane"]')).not.toBeNull()
    expect(container?.querySelector('[data-testid="split-pane"]')).toBeNull()
  })

  test('keeps compact explorer actions visible when desktop focus preference is restored', async () => {
    seedRepoWithSelectedWorktree()
    useReposStore.setState({ detailFocusMode: true })
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
    expect(container?.querySelector('[data-testid="repo-explorer-pane"]')).not.toBeNull()
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

  test('keeps file-area collapse available without mounting branch detail for non-git local workspaces', () => {
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

  test('does not mount branch detail for non-git remote workspaces', () => {
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
    useReposStore.setState({ workspaceLayout: 'top-bottom', detailCollapsed: false })

    renderRepoView(REMOTE_REPO_ID)

    expect(container?.querySelector('[data-testid="branch-detail"]')).toBeNull()
    expect(container?.querySelector('[data-testid="repo-explorer-pane"]')).not.toBeNull()
    expect(container?.textContent).not.toContain('branches.empty')
  })

  test('does not render repository toolbar controls for non-git local workspaces', () => {
    seedRepoState({
      id: REPO_ID,
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })
    useReposStore.setState({ workspaceLayout: 'top-bottom', detailCollapsed: true })

    renderRepoView()

    expect(container?.querySelector('[aria-label="workspace.layout-label"]')).toBeNull()
    expect(container?.querySelector('[aria-label="branches.filter-label"]')).toBeNull()
    expect(container?.querySelector('[aria-label="branches.search-label"]')).toBeNull()
    expect(container?.querySelector('button[aria-label="action.create-worktree-title"]')).toBeNull()
  })

  test('keeps project navigation beside the unavailable view even when detail focus was active', () => {
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('main')],
      currentBranch: 'main',
      selectedBranch: 'main',
    })
    useReposStore.setState({ detailFocusMode: true })
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
    useReposStore.setState({ workspaceLayout: 'top-bottom', detailCollapsed: true })

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
    useReposStore.setState({ workspaceLayout: 'top-bottom', detailCollapsed: true })
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
    showRepoDetailTab: () => {},
    showRepoBranchDetailTab: () => {},
    openSettings: () => {},
  }
  return Object.assign(base, overrides)
}
