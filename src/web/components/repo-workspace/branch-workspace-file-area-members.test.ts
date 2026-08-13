import { describe, expect, test } from 'vitest'
import {
  branchWorkspaceFileAreaMemberChangeCount,
  branchWorkspaceFileAreaTotalChangeCount,
  resolveBranchWorkspaceFileAreaMembers,
} from '#/web/components/repo-workspace/branch-workspace-file-area-members.ts'
import { createRepoBranch, seedRepoState } from '#/web/stores/repos/test-utils.ts'
import type { BranchWorkspaceSnapshot } from '#/shared/branch-workspaces.ts'

describe('branch workspace file area members', () => {
  test('resolves members in manifest order by their exact worktree paths', () => {
    const api = seedRepoState({
      id: '/workspace/api',
      branches: [createRepoBranch('feature/auth', { worktree: { path: '/workspace/hobgoblin-auth/api' } })],
    })
    const web = seedRepoState({
      id: '/workspace/web',
      branches: [createRepoBranch('feature/auth', { worktree: { path: '/workspace/hobgoblin-auth/web' } })],
    })
    api.data.status = [
      {
        path: '/workspace/hobgoblin-auth/api',
        branch: 'feature/auth',
        isMain: false,
        entries: [
          { x: 'M', y: ' ', path: 'src/api.ts' },
          { x: '?', y: '?', path: 'src/api.test.ts' },
        ],
      },
    ]
    web.data.status = [
      {
        path: '/workspace/hobgoblin-auth/web',
        branch: 'feature/auth',
        isMain: false,
        entries: [{ x: 'M', y: ' ', path: 'src/page.tsx' }],
      },
      {
        path: '/workspace/unrelated',
        branch: 'feature/unrelated',
        isMain: false,
        entries: [{ x: 'M', y: ' ', path: 'ignored.ts' }],
      },
    ]

    const members = resolveBranchWorkspaceFileAreaMembers({
      workspace: branchWorkspace(),
      project: {
        repositoryIds: [api.id, web.id],
        candidates: [
          { id: web.id, name: 'web', selected: true, available: true },
          { id: api.id, name: 'api', selected: true, available: true },
        ],
      },
      repos: { [api.id]: api, [web.id]: web },
    })

    expect(members.map((member) => member.repositoryName)).toEqual(['api', 'web'])
    expect(members.map((member) => (member.ok ? member.target.worktreePath : null))).toEqual([
      '/workspace/hobgoblin-auth/api',
      '/workspace/hobgoblin-auth/web',
    ])
    expect(members.map(branchWorkspaceFileAreaMemberChangeCount)).toEqual([2, 1])
    expect(branchWorkspaceFileAreaTotalChangeCount(members)).toBe(3)
  })
})

function branchWorkspace(): BranchWorkspaceSnapshot {
  const member = (repositoryName: string) => ({
    repositoryName,
    targetBranch: 'feature/auth',
    creationBase: { kind: 'localBranch' as const, branch: 'main' },
    syncBeforeCreate: false,
    branchOrigin: 'created' as const,
    worktreePath: `/workspace/hobgoblin-auth/${repositoryName}`,
    progress: 'complete' as const,
    ready: true,
  })
  return {
    id: 'branch-1',
    rootId: '/workspace',
    branch: 'feature/auth',
    directoryName: 'hobgoblin-auth',
    path: '/workspace/hobgoblin-auth',
    state: { kind: 'ready' },
    available: true,
    issues: [],
    repositories: [member('api'), member('web')],
    auxiliaryEntries: [],
  }
}
