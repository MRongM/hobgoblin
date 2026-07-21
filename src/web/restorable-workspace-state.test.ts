import { describe, expect, test } from 'vitest'
import { localRepoSessionEntry } from '#/shared/remote-repo.ts'
import { restoreRestorableWorkspaceStateFromSession, sessionStateFromRestorableWorkspaceState } from '#/web/restorable-workspace-state.ts'
import { createRepoBranch, seedRepoState } from '#/web/stores/repos/test-utils.ts'
import { workspaceRepositoryListExpanded } from '#/web/stores/repos/workspace-projects.ts'

describe('restorable-workspace-state', () => {
  test('maps restorable workspace state into SessionState', () => {
    const repo = seedRepoState({
      id: '/tmp/repo',
      branches: [createRepoBranch('feature/worktree', { worktree: { path: '/tmp/worktree' } })],
      selectedBranch: 'feature/worktree',
      detailTab: 'terminal',
    })

    expect(
      sessionStateFromRestorableWorkspaceState({
        repos: { [repo.id]: repo },
        restorableWorkspaceState: {
          order: [repo.id],
          activeId: repo.id,
          workspaceActiveContextByRoot: {
            '/tmp/workspace': { kind: 'branch-workspace', branchWorkspaceId: 'branch-1' },
          },
          workspaceRepositoryListExpandedByRoot: { '/tmp/workspace': false },
          projectListExpanded: true,
          detailCollapsed: false,
          detailFocusMode: true,
          workspaceLayout: 'left-right',
          detailPaneSizes: { 'top-bottom': 45, 'left-right': 55 },
          fileTreePaneSizes: { 'top-bottom': 44, 'left-right': 36 },
          selectedTerminalByWorktree: {
            '/tmp/repo\0/tmp/worktree': '/tmp/repo\0/tmp/worktree\0terminal-2',
          },
        },
      }),
    ).toEqual({
      openRepos: [localRepoSessionEntry('/tmp/repo')],
      activeRepo: '/tmp/repo',
      workspaceActiveContextByRoot: {
        '/tmp/workspace': { kind: 'branch-workspace', branchWorkspaceId: 'branch-1' },
      },
      workspaceRepositoryListExpandedByRoot: { '/tmp/workspace': false },
      projectListExpanded: true,
      detailCollapsed: false,
      detailFocusMode: true,
      workspaceLayout: 'left-right',
      detailPaneSizes: { 'top-bottom': 45, 'left-right': 55 },
      fileTreePaneSizes: { 'top-bottom': 44, 'left-right': 36 },
      selectedTerminalByWorktree: {
        '/tmp/repo\0/tmp/worktree': '/tmp/repo\0/tmp/worktree\0terminal-2',
      },
    })
  })

  test('restores restorable workspace state from SessionState', () => {
    expect(
      restoreRestorableWorkspaceStateFromSession({
        openRepos: [localRepoSessionEntry('/tmp/repo')],
        activeRepo: '/tmp/repo',
        workspaceActiveContextByRoot: {
          '/tmp/workspace': { kind: 'repository', repositoryId: '/tmp/workspace/api' },
        },
        workspaceRepositoryListExpandedByRoot: { '/tmp/workspace': true },
        projectListExpanded: true,
        detailCollapsed: true,
        detailFocusMode: false,
        workspaceLayout: 'top-bottom',
        detailPaneSizes: { 'top-bottom': 60, 'left-right': 40 },
        fileTreePaneSizes: { 'top-bottom': 42, 'left-right': 38 },
        selectedTerminalByWorktree: {
          '/tmp/repo\0/tmp/worktree': '/tmp/repo\0/tmp/worktree\0terminal-1',
        },
      }),
    ).toEqual({
      activeId: '/tmp/repo',
      workspaceActiveContextByRoot: {
        '/tmp/workspace': { kind: 'repository', repositoryId: '/tmp/workspace/api' },
      },
      workspaceRepositoryListExpandedByRoot: { '/tmp/workspace': true },
      projectListExpanded: true,
      detailCollapsed: true,
      detailFocusMode: false,
      workspaceLayout: 'top-bottom',
      detailPaneSizes: { 'top-bottom': 60, 'left-right': 40 },
      fileTreePaneSizes: { 'top-bottom': 42, 'left-right': 38 },
      selectedTerminalByWorktree: {
        '/tmp/repo\0/tmp/worktree': '/tmp/repo\0/tmp/worktree\0terminal-1',
      },
    })
  })

  test('migrates legacy overview, root, and child selections and defaults repository lists to expanded', () => {
    const restored = restoreRestorableWorkspaceStateFromSession({
      openRepos: [],
      activeRepo: null,
      workspaceActiveRepoByRoot: {
        '/workspace-overview': null,
        '/workspace-root': '/workspace-root',
        '/workspace-child': '/workspace-child/api',
      },
      projectListExpanded: false,
      detailCollapsed: false,
      detailFocusMode: false,
      workspaceLayout: 'left-right',
      detailPaneSizes: { 'top-bottom': 50, 'left-right': 50 },
    })

    expect(restored.workspaceActiveContextByRoot).toEqual({
      '/workspace-overview': { kind: 'overview' },
      '/workspace-root': { kind: 'overview' },
      '/workspace-child': { kind: 'repository', repositoryId: '/workspace-child/api' },
    })
    expect(restored.workspaceRepositoryListExpandedByRoot).toEqual({})
    expect(workspaceRepositoryListExpanded(restored, '/workspace-child')).toBe(true)
  })

  test('drops malformed tagged contexts and expansion values during renderer restore', () => {
    const restored = restoreRestorableWorkspaceStateFromSession({
      openRepos: [],
      activeRepo: null,
      workspaceActiveContextByRoot: {
        '/workspace': { kind: 'branch-workspace', branchWorkspaceId: '' },
        '/valid': { kind: 'overview' },
      },
      workspaceRepositoryListExpandedByRoot: {
        '/workspace': 'no' as never,
        '/valid': false,
      },
      projectListExpanded: false,
      detailCollapsed: false,
      detailFocusMode: false,
      workspaceLayout: 'left-right',
      detailPaneSizes: { 'top-bottom': 50, 'left-right': 50 },
    })

    expect(restored.workspaceActiveContextByRoot).toEqual({ '/valid': { kind: 'overview' } })
    expect(restored.workspaceRepositoryListExpandedByRoot).toEqual({ '/valid': false })
  })
})
