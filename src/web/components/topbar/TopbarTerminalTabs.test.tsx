// @vitest-environment jsdom
//
// Interaction wiring for the topbar terminal tabs — these behaviors lived in
// BranchDetailToolbar before the tabs moved into the global topbar.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { TopbarTerminalTabs } from '#/web/components/topbar/TopbarTerminalTabs.tsx'
import {
  TerminalSessionContext,
  TerminalSessionReadContext,
} from '#/web/components/terminal/terminal-session-context.ts'
import type {
  TerminalSessionContextValue,
  TerminalSessionReadContextValue,
  TerminalSessionSummary,
  TerminalDescriptor,
  WorktreeTerminalSnapshot,
} from '#/web/components/terminal/types.ts'
import { MainWindowNavigationProvider, type MainWindowNavigationActions } from '#/web/main-window-navigation.tsx'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { createRepoBranch, resetReposStore, seedRepoState } from '#/web/stores/repos/test-utils.ts'

vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => {
  cb(0)
  return 1
}) as typeof requestAnimationFrame)

const REPO_ID = '/tmp/gbl-topbar-terminal-tabs-repo'
const WORKTREE_PATH = '/tmp/gbl-topbar-terminal-tabs-worktree'

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  resetReposStore()
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

describe('TopbarTerminalTabs', () => {
  test('renders nothing when the selected branch has no worktree', () => {
    const { container: c } = renderTabs({ terminalCount: 2, worktree: false, navigation: navigationWith({}) })

    expect(c.querySelector('[data-terminal-tab-tooltip-id]')).toBeNull()
    expect(c.querySelector('button[aria-label="terminal.new"]')).toBeNull()
  })

  test('clicking the new-terminal button navigates and creates a terminal', async () => {
    const showRepoDetailTab = vi.fn()
    const { container: c, mocks } = renderTabs({
      terminalCount: 0,
      navigation: navigationWith({ showRepoDetailTab }),
    })

    const newButton = c.querySelector<HTMLButtonElement>('button[aria-label="terminal.new"]')
    expect(newButton).not.toBeNull()

    act(() => {
      newButton?.click()
    })
    await flush()

    expect(showRepoDetailTab).toHaveBeenCalledWith(REPO_ID, 'terminal')
    expect(mocks.createTerminal).toHaveBeenCalledTimes(1)
    expect(mocks.createTerminal).toHaveBeenCalledWith({
      repoRoot: REPO_ID,
      branch: 'feature/worktree',
      worktreePath: WORKTREE_PATH,
    })
  })

  test('clicking a selected session tab when not in terminal panel navigates to terminal', async () => {
    const showRepoDetailTab = vi.fn()
    const { container: c, mocks } = renderTabs({
      terminalCount: 2,
      navigation: navigationWith({ showRepoDetailTab }),
    })

    const selectedTab = c.querySelector<HTMLButtonElement>('[data-terminal-tab-tooltip-id="t1"] button[role="tab"]')
    expect(selectedTab).not.toBeNull()

    act(() => {
      selectedTab?.click()
    })
    await flush()

    expect(showRepoDetailTab).toHaveBeenCalledWith(REPO_ID, 'terminal')
    expect(mocks.createTerminal).not.toHaveBeenCalled()
    expect(mocks.selectTerminal).toHaveBeenCalledWith(`${REPO_ID}\0${WORKTREE_PATH}`, 't1')
    expect(mocks.focusTerminal).toHaveBeenCalledWith('t1')
  })

  test('clicking a selected session tab in terminal panel scrolls to bottom', async () => {
    const showRepoDetailTab = vi.fn()
    const { container: c, mocks } = renderTabs({
      terminalCount: 2,
      detailTab: 'terminal',
      navigation: navigationWith({ showRepoDetailTab }),
    })

    const selectedTab = c.querySelector<HTMLButtonElement>('[data-terminal-tab-tooltip-id="t1"] button[role="tab"]')

    act(() => {
      selectedTab?.click()
    })
    await flush()

    expect(showRepoDetailTab).not.toHaveBeenCalled()
    expect(mocks.createTerminal).not.toHaveBeenCalled()
    expect(mocks.selectTerminal).not.toHaveBeenCalled()
    expect(mocks.scrollToBottom).toHaveBeenCalledWith('t1')
    expect(mocks.focusTerminal).toHaveBeenCalledWith('t1')
  })

  test('clicking an unselected session tab navigates and selects it', async () => {
    const showRepoDetailTab = vi.fn()
    const { container: c, mocks } = renderTabs({
      terminalCount: 2,
      navigation: navigationWith({ showRepoDetailTab }),
    })

    const unselectedTab = c.querySelector<HTMLButtonElement>('[data-terminal-tab-tooltip-id="t2"] button[role="tab"]')
    expect(unselectedTab).not.toBeNull()

    act(() => {
      unselectedTab?.click()
    })
    await flush()

    expect(showRepoDetailTab).toHaveBeenCalledWith(REPO_ID, 'terminal')
    expect(mocks.createTerminal).not.toHaveBeenCalled()
    expect(mocks.selectTerminal).toHaveBeenCalledWith(`${REPO_ID}\0${WORKTREE_PATH}`, 't2')
    expect(mocks.focusTerminal).toHaveBeenCalledWith('t2')
  })

  test('selecting a session un-collapses the detail pane', async () => {
    const { container: c } = renderTabs({
      terminalCount: 2,
      navigation: navigationWith({}),
    })

    act(() => {
      useReposStore.getState().setDetailCollapsed(true)
    })

    const selectedTab = c.querySelector<HTMLButtonElement>('[data-terminal-tab-tooltip-id="t1"] button[role="tab"]')
    act(() => {
      selectedTab?.click()
    })
    await flush()

    expect(useReposStore.getState().detailCollapsed).toBe(false)
  })

  test('keeps terminal focus when keyboard navigation leaves the first tab', async () => {
    const { container: c } = renderTabs({
      terminalCount: 2,
      detailTab: 'terminal',
      navigation: navigationWith({}),
    })

    const selectedTab = c.querySelector<HTMLButtonElement>('[data-terminal-tab-tooltip-id="t1"] button[role="tab"]')
    if (!selectedTab) throw new Error('missing terminal tab')

    act(() => {
      selectedTab.focus()
      selectedTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    })
    await flush()

    expect(document.activeElement).toBe(selectedTab)
  })
})

function renderTabs(options: {
  terminalCount: number
  navigation: MainWindowNavigationActions
  detailTab?: 'status' | 'changes' | 'terminal'
  worktree?: boolean
}): {
  container: HTMLDivElement
  mocks: {
    createTerminal: ReturnType<typeof vi.fn>
    selectTerminal: ReturnType<typeof vi.fn>
    scrollToBottom: ReturnType<typeof vi.fn>
    focusTerminal: ReturnType<typeof vi.fn>
  }
} {
  const hasWorktree = options.worktree ?? true
  seedRepoState({
    id: REPO_ID,
    branches: [createRepoBranch('feature/worktree', hasWorktree ? { worktree: { path: WORKTREE_PATH } } : {})],
    selectedBranch: 'feature/worktree',
    detailTab: options.detailTab ?? 'status',
  })
  const sessions: TerminalSessionSummary[] = Array.from({ length: options.terminalCount }, (_, index) => ({
    key: `t${index + 1}`,
    worktreeTerminalKey: `${REPO_ID}\0${WORKTREE_PATH}`,
    terminalId: `t${index + 1}`,
    index: index + 1,
    title: `term-${index + 1}`,
    fullTitle: `full-term-${index + 1}`,
    phase: 'open' as const,
    selected: index === 0,
    hasBell: false,
  }))
  const selectedDescriptor: TerminalDescriptor | null = sessions[0]
    ? {
        key: sessions[0].key,
        worktreeTerminalKey: sessions[0].worktreeTerminalKey,
        terminalId: sessions[0].terminalId,
        index: sessions[0].index,
        repoRoot: REPO_ID,
        branch: 'feature/worktree',
        worktreePath: WORKTREE_PATH,
      }
    : null
  const worktreeSnapshot: WorktreeTerminalSnapshot = {
    worktreeTerminalKey: `${REPO_ID}\0${WORKTREE_PATH}`,
    selectedDescriptor,
    sessions,
    count: options.terminalCount,
  }
  const terminalSnapshot = { phase: 'opening' as const, message: null, processName: 'terminal' }
  const readContext: TerminalSessionReadContextValue = {
    worktreeSnapshot: () => worktreeSnapshot,
    subscribeWorktree: () => () => {},
    repoSyncReady: () => false,
    subscribeRepoSync: () => () => {},
    snapshot: () => terminalSnapshot,
    subscribeSnapshot: () => () => {},
  }
  const createTerminal = vi.fn(async () => 'key')
  const selectTerminal = vi.fn()
  const scrollToBottom = vi.fn()
  const focusTerminal = vi.fn()
  const commandContext: TerminalSessionContextValue = {
    createTerminal,
    selectTerminal,
    scrollToBottom,
    focusTerminal,
    scrollLines: vi.fn(),
    clearBell: vi.fn(() => false),
    closeTerminalAndDismissDetailIfLast: vi.fn(() => []),
    registerWorktreeHost: vi.fn(),
    attach: vi.fn(),
    detach: vi.fn(),
    restart: vi.fn(),
    isTerminalFocusTarget: vi.fn(() => false),
    findNext: vi.fn(() => ({ resultIndex: -1, resultCount: 0, found: false })),
    findPrevious: vi.fn(() => ({ resultIndex: -1, resultCount: 0, found: false })),
    clearSearch: vi.fn(),
    writeInput: vi.fn(),
    takeover: vi.fn(),
    reorderSessions: vi.fn(async () => true),
    serialize: vi.fn(() => ''),
  }

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(
      <MainWindowNavigationProvider value={options.navigation}>
        <TerminalSessionContext.Provider value={commandContext}>
          <TerminalSessionReadContext.Provider value={readContext}>
            <TopbarTerminalTabs repoId={REPO_ID} />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>
      </MainWindowNavigationProvider>,
    )
  })

  return {
    container: container!,
    mocks: {
      createTerminal,
      selectTerminal,
      scrollToBottom,
      focusTerminal,
    },
  }
}

function navigationWith(overrides: Partial<MainWindowNavigationActions>): MainWindowNavigationActions {
  return {
    activateRepo: () => {},
    closeRepo: () => {},
    cycleRepo: () => {},
    selectRepoBranch: () => {},
    showRepoDetailTab: () => {},
    showRepoBranchDetailTab: () => {},
    openSettings: () => {},
    ...overrides,
  }
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}
