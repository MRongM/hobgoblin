// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { RepoToolbar } from '#/web/components/repo-toolbar/RepoToolbar.tsx'
import { TopbarRepoControls } from '#/web/components/topbar/TopbarRepoControls.tsx'
import { MainWindowNavigationProvider, type MainWindowNavigationActions } from '#/web/main-window-navigation.tsx'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { resetReposStore, seedRepoState, createRepoBranch } from '#/web/stores/repos/test-utils.ts'
import { InlineCommitDraftProvider } from '#/web/components/branch-list/InlineCommitDraftProvider.tsx'

const REPO_ID = '/tmp/gbl-topbar-controls-repo'

const repoClientMocks = vi.hoisted(() => ({
  getCommitMessageProviders: vi.fn(),
  generateRepositoryCommitMessage: vi.fn(),
}))

vi.mock('#/web/repo-client.ts', async () => {
  const actual = await vi.importActual<typeof import('#/web/repo-client.ts')>('#/web/repo-client.ts')
  return {
    ...actual,
    getCommitMessageProviders: repoClientMocks.getCommitMessageProviders,
    generateRepositoryCommitMessage: repoClientMocks.generateRepositoryCommitMessage,
  }
})

let container: HTMLDivElement | null = null
let root: Root | null = null
let queryClient: QueryClient | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  resetReposStore()
  window.matchMedia = createMatchMedia(false)
  repoClientMocks.getCommitMessageProviders.mockResolvedValue({ codex: false, claude: false })
  repoClientMocks.generateRepositoryCommitMessage.mockResolvedValue({ ok: true, message: 'feat: generated message' })
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  container?.remove()
  root = null
  container = null
  queryClient = null
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('TopbarRepoControls', () => {
  test('keeps workspace layout controls for non-git local workspaces while hiding git actions', () => {
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
    expect(container?.querySelector('button[aria-label="branches.switch"]')).toBeNull()
    expect(container?.querySelector('button[aria-label="action.menu"]')).toBeNull()
    expect(container?.querySelector('[aria-label="workspace.layout-label"]')).not.toBeNull()

    act(() => {
      container?.querySelector<HTMLButtonElement>('button[aria-label="workspace.layout-tooltip.left-right"]')?.click()
    })

    expect(useReposStore.getState().workspaceLayout).toBe('left-right')
  })

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

  test('hides layout control in compact mode', () => {
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('main')],
      currentBranch: 'main',
      selectedBranch: 'main',
    })
    window.matchMedia = createMatchMedia(true)

    renderControls(navigationWith({}))

    expect(container?.querySelector('[aria-label="workspace.layout-label"]')).toBeNull()
  })

  test('shows focus-mode branch switcher and branch action menu', () => {
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('main'), createRepoBranch('feature/a')],
      currentBranch: 'main',
      selectedBranch: 'feature/a',
      workspaceLayout: 'top-bottom',
    })
    useReposStore.setState({ detailCollapsed: false, detailFocusMode: true })

    renderControls(navigationWith({}))

    expect(container?.querySelector('button[aria-label="branches.switch"]')).not.toBeNull()
    expect(container?.querySelector('button[aria-label="action.menu"]')).not.toBeNull()
    expect(container?.querySelector('[aria-label="branches.filter-label"]')).toBeNull()
    expect(container?.querySelector('[aria-label="branches.search-label"]')).toBeNull()
  })
})

describe('RepoToolbar', () => {
  test('keeps body layout controls for non-git local workspaces while hiding branch controls', () => {
    seedRepoState({
      id: REPO_ID,
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })

    renderWithProviders(<RepoToolbar repoId={REPO_ID} />, navigationWith({}))

    expect(container?.querySelector('[aria-label="branches.filter-label"]')).toBeNull()
    expect(container?.querySelector('[aria-label="branches.search-label"]')).toBeNull()
    expect(container?.querySelector('button[aria-label="action.create-worktree-title"]')).toBeNull()
    expect(container?.querySelector('[aria-label="workspace.layout-label"]')).not.toBeNull()

    act(() => {
      container?.querySelector<HTMLButtonElement>('button[aria-label="workspace.layout-tooltip.left-right"]')?.click()
    })

    expect(useReposStore.getState().workspaceLayout).toBe('left-right')
  })

  test('keeps body toolbar branch filters and layout for git-capable repositories', () => {
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('main')],
      currentBranch: 'main',
      selectedBranch: 'main',
    })

    renderWithProviders(<RepoToolbar repoId={REPO_ID} />, navigationWith({}))

    expect(container?.querySelector('[aria-label="branches.filter-label"]')).not.toBeNull()
    expect(container?.querySelector('[aria-label="branches.search-label"]')).toBeNull()
    expect(container?.querySelector('button[aria-label="action.refresh"]')).toBeNull()
    expect(container?.querySelector('button[aria-label="action.create-worktree-title"]')).toBeNull()
    expect(container?.querySelector('[aria-label="workspace.layout-label"]')).not.toBeNull()
  })
})

function renderControls(navigation: MainWindowNavigationActions) {
  renderWithProviders(<TopbarRepoControls repoId={REPO_ID} />, navigation)
}

function renderWithProviders(element: React.ReactNode, navigation: MainWindowNavigationActions) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  queryClient = new QueryClient()
  act(() => {
    root!.render(
      <QueryClientProvider client={queryClient!}>
        <InlineCommitDraftProvider>
          <MainWindowNavigationProvider value={navigation}>
            {element}
          </MainWindowNavigationProvider>
        </InlineCommitDraftProvider>
      </QueryClientProvider>,
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

function createMatchMedia(small: boolean): typeof window.matchMedia {
  return vi.fn((query: string) => ({
    matches: query === '(max-width: 639px)' ? small : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as typeof window.matchMedia
}
