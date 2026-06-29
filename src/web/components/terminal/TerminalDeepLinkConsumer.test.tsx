// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { TerminalDeepLinkConsumer } from '#/web/components/terminal/TerminalDeepLinkConsumer.tsx'
import { TerminalSessionContext, TerminalSessionReadContext } from '#/web/components/terminal/terminal-session-context.ts'
import type {
  TerminalSessionContextValue,
  TerminalSessionReadContextValue,
} from '#/web/components/terminal/types.ts'
import type { MainWindowNavigationActions } from '#/web/main-window-navigation.tsx'
import { buildTerminalDeepLinkUrl } from '#/web/lib/terminal-deep-link.ts'
import { createRepoBranch, resetReposStore, seedRepoState } from '#/web/stores/repos/test-utils.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'

const REPO_ID = '/tmp/gbl-terminal-link-repo'
const WORKTREE_PATH = '/tmp/gbl-terminal-link-worktree'

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  resetReposStore()
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  container?.remove()
  root = null
  container = null
  window.history.replaceState(null, '', '/')
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('TerminalDeepLinkConsumer', () => {
  test('consumes terminal deep links after session restore and selects the targeted terminal', async () => {
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('feature/qr', { worktree: { path: WORKTREE_PATH } })],
      selectedBranch: 'main',
      detailTab: 'status',
    })
    useReposStore.getState().setDetailCollapsed(true)
    window.history.replaceState(
      null,
      '',
      buildTerminalDeepLinkUrl(window.location.origin, {
        repoId: REPO_ID,
        worktreePath: WORKTREE_PATH,
        branch: 'feature/qr',
        terminalId: 'terminal-2',
      }),
    )

    const selectTerminal = vi.fn<TerminalSessionContextValue['selectTerminal']>()
    renderConsumer({ selectTerminal })
    await flush()

    const repo = useReposStore.getState().repos[REPO_ID]
    expect(repo?.ui.selectedBranch).toBe('feature/qr')
    expect(repo?.ui.detailTab).toBe('terminal')
    expect(useReposStore.getState().detailCollapsed).toBe(false)
    expect(selectTerminal).toHaveBeenCalledWith(`${REPO_ID}\0${WORKTREE_PATH}`, 'session-key-2')
    expect(window.location.search).toBe('')
  })
})

function renderConsumer(options: { selectTerminal: TerminalSessionContextValue['selectTerminal'] }) {
  const readContext: TerminalSessionReadContextValue = {
    worktreeSnapshot: () => ({
      worktreeTerminalKey: `${REPO_ID}\0${WORKTREE_PATH}`,
      selectedDescriptor: null,
      sessions: [
        {
          key: 'session-key-1',
          worktreeTerminalKey: `${REPO_ID}\0${WORKTREE_PATH}`,
          terminalId: 'terminal-1',
          index: 1,
          title: 'terminal 1',
          phase: 'open',
          selected: false,
          hasBell: false,
        },
        {
          key: 'session-key-2',
          worktreeTerminalKey: `${REPO_ID}\0${WORKTREE_PATH}`,
          terminalId: 'terminal-2',
          index: 2,
          title: 'terminal 2',
          phase: 'open',
          selected: true,
          hasBell: false,
        },
      ],
      count: 2,
    }),
    subscribeWorktree: () => () => {},
    repoSyncReady: () => false,
    subscribeRepoSync: () => () => {},
    snapshot: () => ({ phase: 'opening', message: null, processName: 'terminal' }),
    subscribeSnapshot: () => () => {},
  }
  const commandContext: TerminalSessionContextValue = {
    createTerminal: vi.fn(async () => 'session-key-1'),
    selectTerminal: options.selectTerminal,
    scrollToBottom: vi.fn(),
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
      <TerminalSessionContext.Provider value={commandContext}>
        <TerminalSessionReadContext.Provider value={readContext}>
          <TerminalDeepLinkConsumer sessionReady navigation={navigationWith()} />
        </TerminalSessionReadContext.Provider>
      </TerminalSessionContext.Provider>,
    )
  })
}

function navigationWith(): MainWindowNavigationActions {
  return {
    activateRepo: (repoId) => useReposStore.getState().setActive(repoId),
    closeRepo: () => {},
    cycleRepo: () => {},
    selectRepoBranch: () => {},
    showRepoDetailTab: (repoId, tab) => {
      const state = useReposStore.getState()
      state.setActive(repoId)
      state.setDetailTab(repoId, tab)
    },
    showRepoBranchDetailTab: (repoId, branch, tab) => {
      const state = useReposStore.getState()
      state.setActive(repoId)
      state.selectBranch(repoId, branch)
      state.setDetailTab(repoId, tab)
    },
    openSettings: () => {},
  }
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}
