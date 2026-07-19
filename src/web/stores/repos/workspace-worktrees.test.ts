import { describe, expect, test } from 'vitest'
import { emptyRepo, replaceRepo } from '#/web/stores/repos/helpers.ts'
import { createRepoBranch } from '#/web/stores/repos/test-utils.ts'
import { workspaceBatchBranchChoices } from '#/web/stores/repos/workspace-worktrees.ts'
import type { ReposStore } from '#/web/stores/repos/types.ts'

const ROOT = '/workspace'
const API = '/workspace/api'
const WEB = '/workspace/web'

function workspaceState(): Pick<ReposStore, 'repos' | 'workspaceProjects'> {
  const api = replaceRepo(emptyRepo(API, 'api'), (repo) => {
    repo.workspaceRootId = ROOT
    repo.data.branches = [
      createRepoBranch('develop'),
      createRepoBranch('master'),
      createRepoBranch('main', { isDefault: true, worktree: { path: API } }),
      createRepoBranch('feature/a', { worktree: { path: '/worktrees/api-feature-a' } }),
      createRepoBranch('feature/api-only', { worktree: { path: '/worktrees/api-only' } }),
    ]
    repo.data.worktreesByPath = {
      [API]: { path: API, branch: 'main', isMain: true },
      '/worktrees/api-feature-a': { path: '/worktrees/api-feature-a', branch: 'feature/a', isMain: false },
      '/worktrees/api-only': { path: '/worktrees/api-only', branch: 'feature/api-only', isMain: false },
    }
  })
  const web = replaceRepo(emptyRepo(WEB, 'web'), (repo) => {
    repo.workspaceRootId = ROOT
    repo.data.branches = [
      createRepoBranch('master'),
      createRepoBranch('main', { isDefault: true, worktree: { path: WEB } }),
      createRepoBranch('develop'),
      createRepoBranch('feature/a', { worktree: { path: '/worktrees/web-feature-a' } }),
    ]
    repo.data.worktreesByPath = {
      [WEB]: { path: WEB, branch: 'main', isMain: true },
      '/worktrees/web-feature-a': { path: '/worktrees/web-feature-a', branch: 'feature/a', isMain: false },
    }
  })
  return {
    repos: { [API]: api, [WEB]: web },
    workspaceProjects: {
      [ROOT]: {
        rootId: ROOT,
        repositoryIds: [API, WEB],
        candidates: [],
        configured: true,
        configurationError: null,
        phase: 'ready' as const,
        skipped: [],
        error: null,
      },
    },
  }
}

describe('workspace batch branch choices', () => {
  test('intersects local branches and prefers shared defaults, main, and master', () => {
    expect(workspaceBatchBranchChoices(workspaceState(), ROOT)).toEqual({
      baseBranches: ['main', 'master', 'develop', 'feature/a'],
      removableBranches: ['feature/a'],
    })
  })

  test('returns no choices when the workspace is unconfigured or a member is unavailable', () => {
    const state = workspaceState()
    state.workspaceProjects[ROOT]!.configured = false
    expect(workspaceBatchBranchChoices(state, ROOT)).toEqual({ baseBranches: [], removableBranches: [] })

    state.workspaceProjects[ROOT]!.configured = true
    state.repos[WEB] = replaceRepo(state.repos[WEB]!, (repo) => {
      repo.availability = { phase: 'unavailable', reason: 'missing', checkedAt: 1 }
    })
    expect(workspaceBatchBranchChoices(state, ROOT)).toEqual({ baseBranches: [], removableBranches: [] })
  })
})
