// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { NON_GIT_WORKSPACE_TERMINAL_BRANCH } from '#/shared/terminal.ts'
import {
  runSelectTerminalCommand,
  runTerminalDeepLinkCommand,
  runTerminalPrimaryActionCommand,
} from '#/web/commands/workspace-commands.ts'
import { setTerminalSessionCommandBridge } from '#/web/components/terminal/terminal-session-command-bridge.ts'
import { createRepoBranch, resetReposStore, seedRepoState } from '#/web/stores/repos/test-utils.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import type { MainWindowNavigationActions } from '#/web/main-window-navigation.tsx'

const REPO_ID = '/tmp/gbl-workspace-command-repo'
const WORKTREE_PATH = '/tmp/gbl-workspace-command-worktree'
const REMOTE_REPO_ID = 'ssh-config://prod/srv/plain'

beforeEach(() => {
  resetReposStore()
})

afterEach(() => {
  setTerminalSessionCommandBridge(null)
})

describe('workspace commands', () => {
  test('terminal primary action opens a non-git workspace terminal rooted at the repo path', async () => {
    seedRepoState({
      id: REPO_ID,
      isGitRepo: false,
      branches: [],
      selectedBranch: null,
      detailTab: 'status',
    })
    const createTerminal = vi.fn(async () => 'terminal-1')
    setTerminalSessionCommandBridge({
      worktreeSnapshot: () => ({ worktreeTerminalKey: `${REPO_ID}\0${REPO_ID}`, selectedDescriptor: null, sessions: [], count: 0 }),
      createTerminal,
      selectTerminal: vi.fn(),
      writeInput: vi.fn(),
    })
    const navigation = navigationWith()
    const setDetailCollapsed = vi.fn((collapsed: boolean) => useReposStore.getState().setDetailCollapsed(collapsed))

    await runTerminalPrimaryActionCommand({ repoId: REPO_ID, navigation, setDetailCollapsed })

    expect(useReposStore.getState().repos[REPO_ID]?.ui.detailTab).toBe('terminal')
    expect(createTerminal).toHaveBeenCalledWith({
      repoRoot: REPO_ID,
      branch: NON_GIT_WORKSPACE_TERMINAL_BRANCH,
      worktreePath: REPO_ID,
    })
  })

  test('terminal primary action opens a non-git remote workspace terminal at the remote path', async () => {
    seedRepoState({
      id: REMOTE_REPO_ID,
      isGitRepo: false,
      branches: [],
      selectedBranch: null,
      detailTab: 'status',
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
    const createTerminal = vi.fn(async () => 'terminal-1')
    setTerminalSessionCommandBridge({
      worktreeSnapshot: () => ({
        worktreeTerminalKey: `${REMOTE_REPO_ID}\0/srv/plain`,
        selectedDescriptor: null,
        sessions: [],
        count: 0,
      }),
      createTerminal,
      selectTerminal: vi.fn(),
      writeInput: vi.fn(),
    })
    const navigation = navigationWith()
    const setDetailCollapsed = vi.fn((collapsed: boolean) => useReposStore.getState().setDetailCollapsed(collapsed))

    await runTerminalPrimaryActionCommand({ repoId: REMOTE_REPO_ID, navigation, setDetailCollapsed })

    expect(useReposStore.getState().repos[REMOTE_REPO_ID]?.ui.detailTab).toBe('terminal')
    expect(createTerminal).toHaveBeenCalledWith({
      repoRoot: REMOTE_REPO_ID,
      branch: NON_GIT_WORKSPACE_TERMINAL_BRANCH,
      worktreePath: '/srv/plain',
    })
  })

  test('terminal primary action opens the terminal tab and creates the first terminal when missing', async () => {
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('feature/worktree', { worktree: { path: WORKTREE_PATH } })],
      selectedBranch: 'feature/worktree',
      detailTab: 'status',
    })
    const createTerminal = vi.fn(async () => 'terminal-1')
    setTerminalSessionCommandBridge({
      worktreeSnapshot: () => ({ worktreeTerminalKey: `${REPO_ID}\0${WORKTREE_PATH}`, selectedDescriptor: null, sessions: [], count: 0 }),
      createTerminal,
      selectTerminal: vi.fn(),
      writeInput: vi.fn(),
    })
    const navigation = navigationWith()
    const setDetailCollapsed = vi.fn((collapsed: boolean) => useReposStore.getState().setDetailCollapsed(collapsed))

    await runTerminalPrimaryActionCommand({ repoId: REPO_ID, navigation, setDetailCollapsed })

    expect(useReposStore.getState().repos[REPO_ID]?.ui.detailTab).toBe('terminal')
    expect(useReposStore.getState().detailCollapsed).toBe(false)
    expect(createTerminal).toHaveBeenCalledWith({
      repoRoot: REPO_ID,
      branch: 'feature/worktree',
      worktreePath: WORKTREE_PATH,
    })
  })

  test('terminal primary action does not create a duplicate terminal when one already exists', async () => {
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('feature/worktree', { worktree: { path: WORKTREE_PATH } })],
      selectedBranch: 'feature/worktree',
      detailTab: 'status',
    })
    const createTerminal = vi.fn(async () => 'terminal-1')
    setTerminalSessionCommandBridge({
      worktreeSnapshot: () => ({
        worktreeTerminalKey: `${REPO_ID}\0${WORKTREE_PATH}`,
        selectedDescriptor: null,
        sessions: [
          {
            key: 'terminal-1',
            worktreeTerminalKey: `${REPO_ID}\0${WORKTREE_PATH}`,
            terminalId: 'terminal-1',
            index: 1,
            title: 'terminal 1',
            phase: 'open',
            selected: true,
            hasBell: false,
          },
        ],
        count: 1,
      }),
      createTerminal,
      selectTerminal: vi.fn(),
      writeInput: vi.fn(),
    })
    const navigation = navigationWith()
    const setDetailCollapsed = vi.fn((collapsed: boolean) => useReposStore.getState().setDetailCollapsed(collapsed))

    await runTerminalPrimaryActionCommand({ repoId: REPO_ID, navigation, setDetailCollapsed })

    expect(useReposStore.getState().repos[REPO_ID]?.ui.detailTab).toBe('terminal')
    expect(createTerminal).not.toHaveBeenCalled()
  })

  test('select terminal command matches the terminal number instead of the array position', () => {
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('feature/worktree', { worktree: { path: WORKTREE_PATH } })],
      selectedBranch: 'feature/worktree',
      detailTab: 'status',
    })
    const selectTerminal = vi.fn()
    setTerminalSessionCommandBridge({
      worktreeSnapshot: () => ({
        worktreeTerminalKey: `${REPO_ID}\0${WORKTREE_PATH}`,
        selectedDescriptor: null,
        sessions: [
          {
            key: 'terminal-2',
            worktreeTerminalKey: `${REPO_ID}\0${WORKTREE_PATH}`,
            terminalId: 'terminal-2',
            index: 2,
            title: 'terminal 2',
            phase: 'open',
            selected: true,
            hasBell: false,
          },
          {
            key: 'terminal-3',
            worktreeTerminalKey: `${REPO_ID}\0${WORKTREE_PATH}`,
            terminalId: 'terminal-3',
            index: 3,
            title: 'terminal 3',
            phase: 'open',
            selected: false,
            hasBell: false,
          },
        ],
        count: 2,
      }),
      createTerminal: vi.fn(async () => 'terminal-3'),
      selectTerminal,
      writeInput: vi.fn(),
    })
    const navigation = navigationWith()
    const setDetailCollapsed = vi.fn((collapsed: boolean) => useReposStore.getState().setDetailCollapsed(collapsed))

    expect(runSelectTerminalCommand({ repoId: REPO_ID, index: 2, navigation, setDetailCollapsed })).toBe(true)
    expect(runSelectTerminalCommand({ repoId: REPO_ID, index: 3, navigation, setDetailCollapsed })).toBe(true)

    expect(useReposStore.getState().repos[REPO_ID]?.ui.detailTab).toBe('terminal')
    expect(selectTerminal.mock.calls).toEqual([
      [`${REPO_ID}\0${WORKTREE_PATH}`, 'terminal-2'],
      [`${REPO_ID}\0${WORKTREE_PATH}`, 'terminal-3'],
    ])
  })

  test('terminal deep link command opens the targeted worktree terminal session', () => {
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('feature/worktree', { worktree: { path: WORKTREE_PATH } })],
      selectedBranch: 'main',
      detailTab: 'status',
    })
    const selectTerminal = vi.fn()
    setTerminalSessionCommandBridge({
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
      createTerminal: vi.fn(async () => 'session-key-2'),
      selectTerminal,
      writeInput: vi.fn(),
    })
    const navigation = navigationWith()
    const setDetailCollapsed = vi.fn((collapsed: boolean) => useReposStore.getState().setDetailCollapsed(collapsed))

    expect(
      runTerminalDeepLinkCommand({
        target: {
          repoId: REPO_ID,
          worktreePath: WORKTREE_PATH,
          branch: 'feature/worktree',
          terminalId: 'terminal-2',
        },
        navigation,
        setDetailCollapsed,
      }),
    ).toBe(true)

    const repo = useReposStore.getState().repos[REPO_ID]
    expect(repo?.ui.selectedBranch).toBe('feature/worktree')
    expect(repo?.ui.detailTab).toBe('terminal')
    expect(useReposStore.getState().detailCollapsed).toBe(false)
    expect(selectTerminal).toHaveBeenCalledWith(`${REPO_ID}\0${WORKTREE_PATH}`, 'session-key-2')
  })
})

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
