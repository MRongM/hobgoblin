import { expect, test } from 'vitest'
import { emptyRepo } from '#/web/stores/repos/helpers.ts'
import { projectDiscoveredBranchWorkspaceRepositories } from '#/web/branch-workspace-repository-projection.ts'
import type { BranchWorkspaceSnapshot } from '#/shared/branch-workspaces.ts'
import { createRepoBranch } from '#/web/stores/repos/test-utils.ts'

test('opens discovered members in the renderer without adding configured project membership', () => {
  const state = {
    repos: { '/workspace': emptyRepo('/workspace', 'workspace') },
    order: ['/workspace'],
    restorableRepoCache: {},
  }
  const items: BranchWorkspaceSnapshot[] = [
    {
      id: 'manual',
      rootId: '/workspace',
      branch: 'feature/manual',
      directoryName: 'hob-manual',
      path: '/workspace/hob-manual',
      state: { kind: 'ready' },
      available: true,
      issues: [],
      auxiliaryEntries: [],
      repositories: [
        {
          repositoryName: 'api',
          repositoryId: '/repositories/api',
          targetBranch: 'feature/manual',
          creationBase: { kind: 'localBranch', branch: 'feature/manual' },
          syncBeforeCreate: false,
          branchOrigin: 'pre-existing',
          worktreePath: '/workspace/hob-manual/api',
          progress: 'complete',
          ready: true,
        },
      ],
    },
  ]
  const result = projectDiscoveredBranchWorkspaceRepositories(state, '/workspace', items)
  expect(result.repos['/repositories/api']?.workspaceRootId).toBe('/workspace')
  expect(result.refreshIds).toEqual(['/repositories/api'])
  expect(state.order).toEqual(['/workspace'])
})

test('does not refresh an already projected member for equivalent Windows worktree paths', () => {
  const rootId = 'C:/workspace'
  const repositoryId = 'C:/repositories/api'
  const repo = emptyRepo(repositoryId, 'api')
  repo.workspaceRootId = rootId
  repo.data.branches = [
    createRepoBranch('feature/manual', {
      worktree: { path: 'c:/workspace/hob-manual/api' },
    }),
  ]
  const items: BranchWorkspaceSnapshot[] = [
    {
      id: 'manual',
      rootId,
      branch: 'feature/manual',
      directoryName: 'hob-manual',
      path: 'C:\\workspace\\hob-manual',
      state: { kind: 'ready' },
      available: true,
      issues: [],
      auxiliaryEntries: [],
      repositories: [
        {
          repositoryName: 'api',
          repositoryId,
          targetBranch: 'feature/manual',
          creationBase: { kind: 'localBranch', branch: 'feature/manual' },
          syncBeforeCreate: false,
          branchOrigin: 'pre-existing',
          worktreePath: 'C:\\workspace\\hob-manual\\api',
          progress: 'complete',
          ready: true,
        },
      ],
    },
  ]
  const state = {
    repos: { [rootId]: emptyRepo(rootId, 'workspace'), [repositoryId]: repo },
    order: [rootId],
    restorableRepoCache: {},
  }
  expect(projectDiscoveredBranchWorkspaceRepositories(state, rootId, items).refreshIds).toEqual([])
})
