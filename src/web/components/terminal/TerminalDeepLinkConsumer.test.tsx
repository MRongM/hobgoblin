// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { TerminalDeepLinkConsumer } from '#/web/components/terminal/TerminalDeepLinkConsumer.tsx'
import {
  TerminalSessionContext,
  TerminalSessionReadContext,
} from '#/web/components/terminal/terminal-session-context.ts'
import type { TerminalSessionContextValue, TerminalSessionReadContextValue } from '#/web/components/terminal/types.ts'
import type { MainWindowNavigationActions } from '#/web/main-window-navigation.tsx'
import { buildTerminalDeepLinkUrl } from '#/web/lib/terminal-deep-link.ts'
import { createRepoBranch, resetReposStore, seedRepoState } from '#/web/stores/repos/test-utils.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'

const toastMocks = vi.hoisted(() => ({ warning: vi.fn() }))

vi.mock('sonner', () => ({ toast: { warning: toastMocks.warning } }))
vi.mock('#/web/stores/i18n.ts', () => ({ useT: () => (key: string) => key }))

const REPO_ID = '/tmp/gbl-terminal-link-repo'
const WORKTREE_PATH = '/tmp/gbl-terminal-link-worktree'

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  resetReposStore()
  toastMocks.warning.mockReset()
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
  test('waits for terminal sync before consuming a deep link and selecting the targeted terminal', async () => {
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

    let syncReady = false
    let notifySync = () => {}
    const selectTerminal = vi.fn<TerminalSessionContextValue['selectTerminal']>()
    renderConsumer({
      selectTerminal,
      repoSyncReady: () => syncReady,
      subscribeRepoSync: (_repoRoot, listener) => {
        notifySync = listener
        return () => {}
      },
    })
    await flush()

    expect(selectTerminal).not.toHaveBeenCalled()
    expect(useReposStore.getState().repos[REPO_ID]?.ui.selectedBranch).toBe('main')
    expect(useReposStore.getState().repos[REPO_ID]?.ui.detailTab).toBe('status')
    expect(useReposStore.getState().detailCollapsed).toBe(false)
    expect(window.location.search).toContain('terminal=terminal-2')

    syncReady = true
    act(() => notifySync())
    await flush()

    const repo = useReposStore.getState().repos[REPO_ID]
    expect(repo?.ui.selectedBranch).toBe('feature/qr')
    expect(repo?.ui.detailTab).toBe('terminal')
    expect(useReposStore.getState().detailCollapsed).toBe(false)
    expect(selectTerminal).toHaveBeenCalledWith(`${REPO_ID}\0${WORKTREE_PATH}`, 'session-key-2')
    expect(window.location.search).toBe('')
  })

  test('opens the terminal normally and warns when the encoded branch workspace scope is stale', async () => {
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('feature/qr', { worktree: { path: WORKTREE_PATH } })],
      selectedBranch: 'main',
      detailTab: 'status',
    })
    window.history.replaceState(
      null,
      '',
      buildTerminalDeepLinkUrl(window.location.origin, {
        repoId: REPO_ID,
        worktreePath: WORKTREE_PATH,
        branch: 'feature/qr',
        terminalId: 'terminal-2',
        branchWorkspaceScope: {
          workspaceRootId: '/missing-workspace',
          branchWorkspaceId: 'branch-1',
        },
      }),
    )
    const selectTerminal = vi.fn<TerminalSessionContextValue['selectTerminal']>()

    renderConsumer({
      selectTerminal,
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
    })
    await flush()

    expect(useReposStore.getState().repos[REPO_ID]?.ui.selectedBranch).toBe('feature/qr')
    expect(useReposStore.getState().repos[REPO_ID]?.ui.detailTab).toBe('terminal')
    expect(selectTerminal).toHaveBeenCalledWith(`${REPO_ID}\0${WORKTREE_PATH}`, 'session-key-2')
    expect(toastMocks.warning).toHaveBeenCalledWith('workspace.branch-workspace.deep-link-fallback')
    expect(window.location.search).toBe('')
  })
})

function renderConsumer(options: {
  selectTerminal: TerminalSessionContextValue['selectTerminal']
  repoSyncReady: TerminalSessionReadContextValue['repoSyncReady']
  subscribeRepoSync: TerminalSessionReadContextValue['subscribeRepoSync']
}) {
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
    repoSyncReady: options.repoSyncReady,
    subscribeRepoSync: options.subscribeRepoSync,
    snapshot: () => ({ phase: 'opening', message: null, processName: 'terminal' }),
    subscribeSnapshot: () => () => {},
  }
  const commandContext: TerminalSessionContextValue = {
    createTerminal: vi.fn(async () => 'session-key-1'),
    restoreTmuxSessions: vi.fn(async () => 0),
    selectTerminal: options.selectTerminal,
    scrollToBottom: vi.fn(),
    pageTmux: vi.fn(),
    focusTerminal: vi.fn(),
    scrollLines: vi.fn(),
    scrollByTouch: vi.fn(),
    beginMobileSelection: vi.fn(() => false),
    extendMobileSelection: vi.fn(),
    finishMobileSelection: vi.fn(),
    cancelMobileSelection: vi.fn(),
    selectionText: vi.fn(() => ''),
    mobileSelectionText: vi.fn(() => ''),
    clearMobileSelection: vi.fn(),
    writeExtraKey: vi.fn(),
    clearBell: vi.fn(() => false),
    closeTerminalAndDismissDetailIfLast: vi.fn(),
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
    selectRepoDetachedWorktree: (repoId, worktreePath) => {
      const state = useReposStore.getState()
      state.setActive(repoId)
      state.selectDetachedWorktree(repoId, worktreePath)
    },
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
    showRepoDetachedWorktreeDetailTab: (repoId, worktreePath, tab) => {
      const state = useReposStore.getState()
      state.setActive(repoId)
      state.selectDetachedWorktree(repoId, worktreePath)
      state.setDetailTab(repoId, tab)
    },
    openSettings: () => {},
  }
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}
