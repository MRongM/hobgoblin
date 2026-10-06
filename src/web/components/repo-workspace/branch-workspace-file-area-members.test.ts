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

  test.each([
    ['drive paths', 'C:\\workspace\\hob-auth', 'c:/workspace/hob-auth'],
    ['UNC paths', '\\\\host\\share\\workspace\\hob-auth', '//HOST/share/workspace/hob-auth'],
  ])('counts equivalent Windows %s in member and aggregate badges', (_label, memberRoot, gitRoot) => {
    const members = resolveBranchWorkspaceFileAreaMembers(countedMemberInput(memberRoot, gitRoot))
    expect(members.map(branchWorkspaceFileAreaMemberChangeCount)).toEqual([2, 3])
    expect(branchWorkspaceFileAreaTotalChangeCount(members)).toBe(5)
  })

  test('uses known snapshot counts before status arrives and honors a clean status result', () => {
    const input = countedMemberInput('/workspace/hob-auth', '/workspace/hob-auth')
    for (const repo of Object.values(input.repos)) repo.data.status = []
    expect(branchWorkspaceFileAreaTotalChangeCount(resolveBranchWorkspaceFileAreaMembers(input))).toBe(5)
    input.repos['/workspace/api']!.data.status = [
      { path: '/workspace/hob-auth/api', branch: 'feature/auth', isMain: false, entries: [] },
    ]
    expect(resolveBranchWorkspaceFileAreaMembers(input).map(branchWorkspaceFileAreaMemberChangeCount)).toEqual([0, 3])
  })

  test('excludes removed and unavailable members', () => {
    const input = countedMemberInput('/workspace/hob-auth', '/workspace/hob-auth')
    input.workspace.repositories[0]!.progress = 'removed'
    const members = resolveBranchWorkspaceFileAreaMembers(input)
    expect(members.map((member) => member.repositoryName)).toEqual(['web'])
    expect(branchWorkspaceFileAreaTotalChangeCount(members)).toBe(3)
    input.repos['/workspace/web']!.availability = { phase: 'unavailable', reason: 'missing', checkedAt: 1 }
    expect(branchWorkspaceFileAreaTotalChangeCount(resolveBranchWorkspaceFileAreaMembers(input))).toBe(0)
  })

  test('keeps POSIX path case significant and excludes another worktree', () => {
    const input = countedMemberInput('/workspace/Hob-auth', '/workspace/hob-auth')
    expect(branchWorkspaceFileAreaTotalChangeCount(resolveBranchWorkspaceFileAreaMembers(input))).toBe(0)
    input.workspace.repositories[0]!.worktreePath = '/workspace/hob-auth/api'
    input.repos['/workspace/api']!.data.status.push({
      path: '/workspace/another/api',
      branch: 'feature/another',
      isMain: false,
      entries: [{ x: 'M', y: ' ', path: 'unrelated.ts' }],
    })
    expect(branchWorkspaceFileAreaTotalChangeCount(resolveBranchWorkspaceFileAreaMembers(input))).toBe(2)
  })
})

function countedMemberInput(memberRoot: string, gitRoot: string) {
  const workspace = branchWorkspace()
  const names = ['api', 'web']
  workspace.repositories = workspace.repositories.map((member) => ({
    ...member,
    worktreePath: `${memberRoot}${memberRoot.includes('\\') ? '\\' : '/'}${member.repositoryName}`,
  }))
  const repos = Object.fromEntries(
    names.map((name, index) => {
      const id = `/workspace/${name}`
      const worktreePath = `${gitRoot}/${name}`
      const repo = seedRepoState({
        id,
        branches: [createRepoBranch('feature/auth', { worktree: { path: worktreePath } })],
      })
      repo.data.worktreesByPath[worktreePath] = {
        path: worktreePath,
        branch: 'feature/auth',
        isMain: false,
        isDirty: true,
        changeCount: index + 2,
      }
      repo.data.status = [
        {
          path: worktreePath,
          branch: 'feature/auth',
          isMain: false,
          entries: Array.from({ length: index + 2 }, (_, entry) => ({ x: 'M', y: ' ', path: `file-${entry}.ts` })),
        },
      ]
      return [id, repo]
    }),
  )
  return {
    workspace,
    project: {
      repositoryIds: names.map((name) => `/workspace/${name}`),
      candidates: names.map((name) => ({ id: `/workspace/${name}`, name, selected: true, available: true })),
    },
    repos,
  }
}

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
