// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { defaultSettingsSnapshot } from '#/shared/settings-defaults.ts'
import { RepoToolbar } from '#/web/components/repo-toolbar/RepoToolbar.tsx'
import { TopbarRepoControls } from '#/web/components/topbar/TopbarRepoControls.tsx'
import { MainWindowNavigationProvider, type MainWindowNavigationActions } from '#/web/main-window-navigation.tsx'
import { settingsSnapshotQueryKey } from '#/web/settings-query-cache.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { resetReposStore, seedRepoState, createRepoBranch } from '#/web/stores/repos/test-utils.ts'
import { InlineCommitDraftProvider } from '#/web/components/branch-list/InlineCommitDraftProvider.tsx'
import {
  TerminalSessionContext,
  TerminalSessionReadContext,
} from '#/web/components/terminal/terminal-session-context.ts'
import type {
  TerminalSessionContextValue,
  TerminalSessionReadContextValue,
  WorktreeTerminalSnapshot,
} from '#/web/components/terminal/types.ts'

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
let terminalSnapshotsByWorktree: Map<string, WorktreeTerminalSnapshot>

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  resetReposStore()
  window.matchMedia = createMatchMedia(false)
  repoClientMocks.getCommitMessageProviders.mockResolvedValue({ codex: false, claude: false })
  repoClientMocks.generateRepositoryCommitMessage.mockResolvedValue({ ok: true, message: 'feat: generated message' })
  terminalSnapshotsByWorktree = new Map()
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
  test('keeps workspace layout and refresh controls for non-git local workspaces while hiding git actions', () => {
    const repo = seedRepoState({
      id: REPO_ID,
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })
    useReposStore.setState({
      repos: {
        [REPO_ID]: {
          ...repo,
          projection: { source: 'cache', savedAt: 1 },
        },
      },
    })

    renderControls(navigationWith({}))

    expect(container?.querySelector('button[aria-label="action.refresh"]')).not.toBeNull()
    expect(container?.querySelector('button[aria-label="action.create-worktree-title"]')).toBeNull()
    expect(container?.querySelector('button[aria-label="branches.switch"]')).toBeNull()
    expect(container?.querySelector('button[aria-label="action.menu"]')).toBeNull()
    expect(workspaceLayoutButtons()).toHaveLength(1)
    expect(container?.querySelector<HTMLElement>('[aria-label^="tab.projectiond"]')?.className).toContain(
      'text-topbar-muted-foreground',
    )

    act(() => {
      container?.querySelector<HTMLButtonElement>('button[aria-label="workspace.layout-tooltip.top-bottom"]')?.click()
    })

    expect(useReposStore.getState().workspaceLayout).toBe('top-bottom')
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
    expect(workspaceLayoutButtons()).toHaveLength(1)
    expect(container?.querySelector('button[aria-label="project-theme.menu"]')).not.toBeNull()
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

    expect(workspaceLayoutButtons()).toHaveLength(0)
  })

  test('shows focus-mode branch switcher and branch action menu', () => {
    seedRepoState({
      id: REPO_ID,
      branches: [
        createRepoBranch('main', { worktree: { path: REPO_ID } }),
        createRepoBranch('feature/a', { worktree: { path: `${REPO_ID}-feature-a` } }),
      ],
      currentBranch: 'main',
      selectedBranch: 'feature/a',
      workspaceLayout: 'top-bottom',
    })
    useReposStore.setState({ detailCollapsed: false, detailFocusMode: true })

    renderControls(navigationWith({}))

    const branchSwitcher = container?.querySelector<HTMLButtonElement>('button[aria-label="branches.switch"]')
    expect(branchSwitcher).not.toBeNull()
    expect(branchSwitcher?.className).toContain('text-topbar-muted-foreground')
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
    expect(container?.querySelector('button[aria-label="branches.filter-tooltip.worktrees"]')).toBeNull()
    expect(container?.querySelector('[aria-label="branches.search-label"]')).toBeNull()
    expect(container?.querySelector('button[aria-label="action.create-worktree-title"]')).toBeNull()
    expect(workspaceLayoutButtons()).toHaveLength(1)

    act(() => {
      container?.querySelector<HTMLButtonElement>('button[aria-label="workspace.layout-tooltip.top-bottom"]')?.click()
    })

    expect(useReposStore.getState().workspaceLayout).toBe('top-bottom')
  })

  test('keeps body toolbar branch filters and layout for git-capable repositories', () => {
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('main')],
      currentBranch: 'main',
      selectedBranch: 'main',
    })

    renderWithProviders(<RepoToolbar repoId={REPO_ID} />, navigationWith({}))

    expect(container?.querySelector('button[aria-label="branches.filter-tooltip.worktrees"]')).toBeNull()
    expect(container?.querySelector('button[aria-label="branches.filter-tooltip.all"]')).toBeNull()
    expect(container?.querySelector('[aria-label="branches.search-label"]')).toBeNull()
    expect(container?.querySelector('button[aria-label="action.refresh"]')).toBeNull()
    expect(container?.querySelector('button[aria-label="action.create-worktree-title"]')).toBeNull()
    expect(workspaceLayoutButtons()).toHaveLength(1)
    expect(container?.querySelector('button[aria-label="project-theme.menu"]')).not.toBeNull()
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
  queryClient.setQueryData(settingsSnapshotQueryKey(), defaultSettingsSnapshot())
  act(() => {
    root!.render(
      <QueryClientProvider client={queryClient!}>
        <InlineCommitDraftProvider>
          <TerminalSessionReadContext.Provider value={terminalReadContextValue()}>
            <TerminalSessionContext.Provider value={terminalContextValue()}>
              <MainWindowNavigationProvider value={navigation}>{element}</MainWindowNavigationProvider>
            </TerminalSessionContext.Provider>
          </TerminalSessionReadContext.Provider>
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

function workspaceLayoutButtons(): NodeListOf<HTMLButtonElement> {
  return container!.querySelectorAll<HTMLButtonElement>(
    'button[aria-label="workspace.layout-tooltip.top-bottom"], button[aria-label="workspace.layout-tooltip.left-right"]',
  )
}

function terminalReadContextValue(): TerminalSessionReadContextValue {
  return {
    worktreeSnapshot: (worktreeKey) => {
      const existing = terminalSnapshotsByWorktree.get(worktreeKey)
      if (existing) return existing
      const emptySnapshot = {
        worktreeTerminalKey: worktreeKey,
        selectedDescriptor: null,
        sessions: [],
        count: 0,
      }
      terminalSnapshotsByWorktree.set(worktreeKey, emptySnapshot)
      return emptySnapshot
    },
    subscribeWorktree: () => () => {},
    repoSyncReady: () => true,
    subscribeRepoSync: () => () => {},
    snapshot: () => ({ phase: 'open', message: null, processName: 'terminal' }),
    subscribeSnapshot: () => () => {},
  }
}

function terminalContextValue(): TerminalSessionContextValue {
  return {
    createTerminal: async () => 't1',
    selectTerminal: vi.fn(),
    scrollToBottom: vi.fn(),
    focusTerminal: vi.fn(),
    scrollLines: vi.fn(),
    clearBell: vi.fn(() => false),
    closeTerminalAndDismissDetailIfLast: vi.fn(),
    registerWorktreeHost: vi.fn(),
    attach: vi.fn(),
    detach: vi.fn(),
    restart: vi.fn(),
    isTerminalFocusTarget: vi.fn(() => false),
    findNext: vi.fn(() => ({ resultIndex: 0, resultCount: 0, found: false })),
    findPrevious: vi.fn(() => ({ resultIndex: 0, resultCount: 0, found: false })),
    clearSearch: vi.fn(),
    writeInput: vi.fn(),
    takeover: vi.fn(),
    reorderSessions: vi.fn(async () => true),
    serialize: vi.fn(() => ''),
  }
}
