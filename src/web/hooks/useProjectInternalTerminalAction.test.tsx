// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { NON_GIT_WORKSPACE_TERMINAL_BRANCH } from '#/shared/terminal.ts'
import {
  resolveProjectInternalTerminalBase,
  useProjectInternalTerminalAction,
  type ProjectInternalTerminalAction,
} from '#/web/hooks/useProjectInternalTerminalAction.ts'
import { MainWindowNavigationProvider, type MainWindowNavigationActions } from '#/web/main-window-navigation.tsx'
import { TerminalSessionContext } from '#/web/components/terminal/terminal-session-context.ts'
import type { TerminalSessionContextValue } from '#/web/components/terminal/types.ts'
import { emptyRepo, replaceRepo } from '#/web/stores/repos/helpers.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { createRepoBranch, resetReposStore } from '#/web/stores/repos/test-utils.ts'
import type { RepoState } from '#/web/stores/repos/types.ts'

describe('resolveProjectInternalTerminalBase', () => {
  test('resolves the selected Git worktree and the plain workspace root', () => {
    const gitRepo = selectedGitRepo('/repo', '/worktrees/demo')
    const plainWorkspace = createRepo('/workspace', (repo) => {
      repo.isGitRepo = false
      repo.data.branches = []
      repo.ui.selectedBranch = null
    })

    expect(resolveProjectInternalTerminalBase(gitRepo)).toEqual({
      repoRoot: '/repo',
      branch: 'feature/demo',
      worktreePath: '/worktrees/demo',
    })
    expect(resolveProjectInternalTerminalBase(plainWorkspace)).toEqual({
      repoRoot: '/workspace',
      branch: NON_GIT_WORKSPACE_TERMINAL_BRANCH,
      worktreePath: '/workspace',
    })
  })

  test('returns null when the selected Git branch has no worktree', () => {
    const repo = createRepo('/repo', (draft) => {
      draft.data.branches = [createRepoBranch('feature/demo')]
      draft.ui.selectedBranch = 'feature/demo'
    })

    expect(resolveProjectInternalTerminalBase(repo)).toBeNull()
  })

  test('resolves a selected detached worktree without inventing a branch', () => {
    const repo = createRepo('/repo', (draft) => {
      draft.data.branches = [createRepoBranch('main', { worktree: { path: '/repo' } })]
      draft.data.worktreesByPath = {
        '/repo': { path: '/repo', branch: 'main', isMain: true },
        '/worktrees/detached': {
          path: '/worktrees/detached',
          head: 'abcdef1234567890',
          isDetached: true,
          isMain: false,
        },
      }
      draft.ui.selectedBranch = null
      draft.ui.selectedDetachedWorktreePath = '/worktrees/detached'
    })

    expect(resolveProjectInternalTerminalBase(repo)).toEqual({
      repoRoot: '/repo',
      branch: 'HEAD@abcdef123456',
      worktreePath: '/worktrees/detached',
    })
  })
})

describe('useProjectInternalTerminalAction', () => {
  let container: HTMLDivElement
  let root: Root | null
  let createTerminal: ReturnType<typeof vi.fn<TerminalSessionContextValue['createTerminal']>>
  let activateWorkspaceOverview: ReturnType<typeof vi.fn<(rootId: string) => void>>
  let setDetailCollapsed: ReturnType<typeof vi.fn<(collapsed: boolean) => void>>
  let navigation: MainWindowNavigationActions
  const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

  beforeEach(() => {
    resetReposStore()
    reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = null
    createTerminal = vi.fn(async () => 'terminal-1')
    activateWorkspaceOverview = vi.fn()
    setDetailCollapsed = vi.fn()
    navigation = navigationWith({})
  })

  afterEach(async () => {
    await act(async () => root?.unmount())
    container.remove()
    reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
  })

  test('activates a Git branch terminal surface before creating its terminal', async () => {
    const repo = selectedGitRepo('/repo', '/worktrees/demo')
    seedProject(repo)
    const action = await renderAction(repo.id)

    await act(async () => await action().onSelect())

    expect(navigation.showRepoBranchDetailTab).toHaveBeenCalledWith(repo.id, 'feature/demo', 'terminal')
    expect(setDetailCollapsed).toHaveBeenCalledWith(false)
    expect(createTerminal).toHaveBeenCalledWith(
      {
        repoRoot: repo.id,
        branch: 'feature/demo',
        worktreePath: '/worktrees/demo',
      },
      'native',
    )

    createTerminal.mockClear()
    await act(async () => await action().onSelect('tmux-if-available'))
    expect(createTerminal).toHaveBeenCalledWith(
      {
        repoRoot: repo.id,
        branch: 'feature/demo',
        worktreePath: '/worktrees/demo',
      },
      'tmux-if-available',
    )
  })

  test('activates a detached worktree terminal surface before creating its terminal', async () => {
    const repo = createRepo('/repo', (draft) => {
      draft.data.branches = [createRepoBranch('main', { worktree: { path: '/repo' } })]
      draft.data.worktreesByPath = {
        '/repo': { path: '/repo', branch: 'main', isMain: true },
        '/worktrees/detached': {
          path: '/worktrees/detached',
          head: 'abcdef1234567890',
          isDetached: true,
          isMain: false,
        },
      }
      draft.ui.selectedBranch = null
      draft.ui.selectedDetachedWorktreePath = '/worktrees/detached'
    })
    seedProject(repo)
    const action = await renderAction(repo.id)

    await act(async () => await action().onSelect())

    expect(navigation.showRepoDetachedWorktreeDetailTab).toHaveBeenCalledWith(
      repo.id,
      '/worktrees/detached',
      'terminal',
    )
    expect(createTerminal).toHaveBeenCalledWith(
      {
        repoRoot: repo.id,
        branch: 'HEAD@abcdef123456',
        worktreePath: '/worktrees/detached',
      },
      'native',
    )
  })

  test('activates a multi-repository workspace overview before creating a root terminal', async () => {
    const workspace = createRepo('/workspace', (repo) => {
      repo.isGitRepo = false
      repo.data.branches = []
      repo.ui.selectedBranch = null
    })
    seedProject(workspace, true)
    const action = await renderAction(workspace.id)

    await act(async () => await action().onSelect())

    expect(activateWorkspaceOverview).toHaveBeenCalledWith(workspace.id)
    expect(navigation.activateRepo).not.toHaveBeenCalled()
    expect(createTerminal).toHaveBeenCalledWith(
      {
        repoRoot: workspace.id,
        branch: NON_GIT_WORKSPACE_TERMINAL_BRANCH,
        worktreePath: workspace.id,
      },
      'native',
    )
  })

  test('activates an ordinary plain workspace before creating a root terminal', async () => {
    const workspace = createRepo('/workspace', (repo) => {
      repo.isGitRepo = false
      repo.data.branches = []
      repo.ui.selectedBranch = null
    })
    seedProject(workspace)
    const action = await renderAction(workspace.id)

    await act(async () => await action().onSelect())

    expect(navigation.activateRepo).toHaveBeenCalledWith(workspace.id)
    expect(activateWorkspaceOverview).not.toHaveBeenCalled()
  })

  test('disables unavailable projects and selected branches without worktrees', async () => {
    const unavailable = selectedGitRepo('/repo', '/repo', (repo) => {
      repo.availability = { phase: 'unavailable', reason: 'missing', checkedAt: 1 }
    })
    seedProject(unavailable)
    const unavailableAction = await renderAction(unavailable.id)
    expect(unavailableAction().disabled).toBe(true)
    await act(async () => await unavailableAction().onSelect())

    const noTarget = createRepo('/other', (repo) => {
      repo.data.branches = [createRepoBranch('feature/demo')]
      repo.ui.selectedBranch = 'feature/demo'
    })
    seedProject(noTarget)
    const noTargetAction = await renderAction(noTarget.id)
    expect(noTargetAction().disabled).toBe(true)
    await act(async () => await noTargetAction().onSelect())

    expect(createTerminal).not.toHaveBeenCalled()
    expect(navigation.showRepoBranchDetailTab).not.toHaveBeenCalled()
  })

  async function renderAction(projectId: string): Promise<() => ProjectInternalTerminalAction> {
    let current: ProjectInternalTerminalAction | null = null
    root ??= createRoot(container)
    await act(async () => {
      root!.render(
        <MainWindowNavigationProvider value={navigation}>
          <TerminalSessionContext.Provider value={terminalCommandContext(createTerminal)}>
            <ActionHarness projectId={projectId} onReady={(value) => (current = value)} />
          </TerminalSessionContext.Provider>
        </MainWindowNavigationProvider>,
      )
    })
    return () => {
      if (!current) throw new Error('project internal terminal action not rendered')
      return current
    }
  }

  function seedProject(repo: RepoState, multiRepositoryWorkspace = false): void {
    useReposStore.setState({
      repos: { [repo.id]: repo },
      workspaceProjects: multiRepositoryWorkspace
        ? {
            [repo.id]: {
              rootId: repo.id,
              repositoryIds: [],
              candidates: [],
              configured: false,
              configurationError: null,
              phase: 'ready',
              skipped: [],
              error: null,
            },
          }
        : {},
      activateWorkspaceOverview,
      setDetailCollapsed,
    })
  }
})

function ActionHarness({
  projectId,
  onReady,
}: {
  projectId: string
  onReady: (action: ProjectInternalTerminalAction) => void
}) {
  onReady(useProjectInternalTerminalAction(projectId))
  return null
}

function createRepo(id: string, mutate: (repo: RepoState) => void): RepoState {
  return replaceRepo(emptyRepo(id, 'Project'), mutate)
}

function selectedGitRepo(id: string, worktreePath: string, mutate?: (repo: RepoState) => void): RepoState {
  return createRepo(id, (repo) => {
    repo.data.branches = [createRepoBranch('feature/demo', { worktree: { path: worktreePath } })]
    repo.ui.selectedBranch = 'feature/demo'
    mutate?.(repo)
  })
}

function navigationWith(overrides: Partial<MainWindowNavigationActions>): MainWindowNavigationActions {
  return {
    activateRepo: vi.fn(),
    closeRepo: vi.fn(),
    cycleRepo: vi.fn(),
    selectRepoBranch: vi.fn(),
    selectRepoDetachedWorktree: vi.fn(),
    showRepoDetailTab: vi.fn(),
    showRepoBranchDetailTab: vi.fn(),
    showRepoDetachedWorktreeDetailTab: vi.fn(),
    openSettings: vi.fn(),
    ...overrides,
  }
}

function terminalCommandContext(
  createTerminal: ReturnType<typeof vi.fn<TerminalSessionContextValue['createTerminal']>>,
): TerminalSessionContextValue {
  return {
    createTerminal,
    restoreTmuxSessions: vi.fn(async () => 0),
    selectTerminal: vi.fn(),
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
}
