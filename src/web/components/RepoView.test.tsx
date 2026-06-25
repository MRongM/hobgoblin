// @vitest-environment jsdom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { RepoView } from '#/web/components/RepoView.tsx'
import { MainWindowNavigationProvider, type MainWindowNavigationActions } from '#/web/main-window-navigation.tsx'
import { resetReposStore, seedRepoState, createRepoBranch } from '#/web/stores/repos/test-utils.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'

vi.mock('#/web/components/BranchDetail.tsx', () => ({
  BranchDetail: ({ onRevealPath }: { onRevealPath?: (relativePath: string) => void }) => (
    <button type="button" data-testid="branch-detail" onClick={() => onRevealPath?.('src/from-terminal.ts')}>
      branch detail
    </button>
  ),
}))

vi.mock('#/web/components/repo-workspace/RepoExplorerPane.tsx', () => ({
  RepoExplorerPane: ({ revealRequest }: { revealRequest?: { relativePath: string } | null }) => (
    <div data-testid="repo-explorer-pane" data-reveal-path={revealRequest?.relativePath ?? ''} />
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
  window.matchMedia = vi.fn((query: string) => ({
    matches: query === '(max-width: 639px)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as typeof window.matchMedia
})

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

  test('routes terminal reveal requests to the repository explorer', async () => {
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('main'), createRepoBranch('feature/a')],
      currentBranch: 'main',
      selectedBranch: 'feature/a',
    })
    useReposStore.setState({ workspaceLayout: 'top-bottom', detailCollapsed: true })

    renderRepoView()

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="branch-detail"]')?.click()
    })

    expect(container?.querySelector('[data-testid="repo-explorer-pane"]')?.getAttribute('data-reveal-path')).toBe(
      'src/from-terminal.ts',
    )
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

function renderRepoView(repoId = REPO_ID) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => {
    root!.render(
      <MainWindowNavigationProvider value={navigationWith({})}>
        <RepoView repoId={repoId} />
      </MainWindowNavigationProvider>,
    )
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
