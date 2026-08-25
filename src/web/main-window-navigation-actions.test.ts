import { describe, expect, test, vi } from 'vitest'
import { createMainWindowNavigationActions } from '#/web/main-window-navigation-actions.ts'

describe('createMainWindowNavigationActions', () => {
  test('activates top-level projects through the workspace-aware action', () => {
    const activateProject = vi.fn()
    const actions = createMainWindowNavigationActions({
      activeId: '/workspace/api',
      setActive: vi.fn(),
      activateProject,
      closeRepo: vi.fn(),
      cycleActive: vi.fn(),
      selectBranch: vi.fn(),
      selectDetachedWorktree: vi.fn(),
      setDetailTab: vi.fn(),
    })

    actions.activateRepo('/workspace')

    expect(activateProject).toHaveBeenCalledWith('/workspace')
  })

  test('mutates store directly for repo branch detail navigation', () => {
    const setActive = vi.fn()
    const selectBranch = vi.fn()
    const setDetailTab = vi.fn()
    const actions = createMainWindowNavigationActions({
      activeId: '/tmp/repo-a',
      setActive,
      closeRepo: vi.fn(),
      cycleActive: vi.fn(),
      selectBranch,
      selectDetachedWorktree: vi.fn(),
      setDetailTab,
      onOpenSettings: vi.fn(),
    })

    actions.showRepoBranchDetailTab('/tmp/repo-b', 'feature/test', 'terminal')

    expect(setActive).toHaveBeenCalledWith('/tmp/repo-b')
    expect(selectBranch).toHaveBeenCalledWith('/tmp/repo-b', 'feature/test')
    expect(setDetailTab).toHaveBeenCalledWith('/tmp/repo-b', 'terminal')
  })

  test('mutates store directly for detached worktree detail navigation', () => {
    const setActive = vi.fn()
    const selectDetachedWorktree = vi.fn()
    const setDetailTab = vi.fn()
    const actions = createMainWindowNavigationActions({
      activeId: '/tmp/repo-a',
      setActive,
      closeRepo: vi.fn(),
      cycleActive: vi.fn(),
      selectBranch: vi.fn(),
      selectDetachedWorktree,
      setDetailTab,
    })

    actions.showRepoDetachedWorktreeDetailTab('/tmp/repo-b', '/tmp/worktree', 'terminal')

    expect(setActive).toHaveBeenCalledWith('/tmp/repo-b')
    expect(selectDetachedWorktree).toHaveBeenCalledWith('/tmp/repo-b', '/tmp/worktree')
    expect(setDetailTab).toHaveBeenCalledWith('/tmp/repo-b', 'terminal')
  })

  test('cycles repos through the store action', () => {
    const cycleActive = vi.fn()
    const actions = createMainWindowNavigationActions({
      activeId: '/tmp/repo-a',
      setActive: vi.fn(),
      closeRepo: vi.fn(),
      cycleActive,
      selectBranch: vi.fn(),
      selectDetachedWorktree: vi.fn(),
      setDetailTab: vi.fn(),
    })

    actions.cycleRepo(1)

    expect(cycleActive).toHaveBeenCalledWith(1)
  })

  test('closes the repo through the store action', () => {
    const closeRepo = vi.fn()
    const actions = createMainWindowNavigationActions({
      activeId: '/tmp/repo-b',
      setActive: vi.fn(),
      closeRepo,
      cycleActive: vi.fn(),
      selectBranch: vi.fn(),
      selectDetachedWorktree: vi.fn(),
      setDetailTab: vi.fn(),
    })

    actions.closeRepo('/tmp/repo-b')

    expect(closeRepo).toHaveBeenCalledWith('/tmp/repo-b')
  })
})
