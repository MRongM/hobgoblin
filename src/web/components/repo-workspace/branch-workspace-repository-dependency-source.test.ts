import { describe, expect, test } from 'vitest'
import { repositoryDependencySources } from '#/web/components/repo-workspace/branch-workspace-repository-dependency-source.ts'

describe('branch workspace repository dependency sources', () => {
  test('starts from the selected base worktree and offers only non-base worktrees', () => {
    expect(
      repositoryDependencySources({
        baseBranch: 'develop',
        primaryWorktreePath: '/repo',
        sourceWorktreeByBranch: {
          main: '/repo',
          develop: '/repo-develop',
          feature: '/repo-feature',
        },
      }),
    ).toEqual({
      initial: {
        id: 'branch:develop',
        kind: 'branch',
        branch: 'develop',
        worktreePath: '/repo-develop',
      },
      primary: { id: 'primary', kind: 'primary' },
      alternatives: [
        { id: 'primary', kind: 'primary' },
        {
          id: 'branch:feature',
          kind: 'branch',
          branch: 'feature',
          worktreePath: '/repo-feature',
        },
      ],
    })
  })

  test('starts from the primary worktree when the selected base has no worktree', () => {
    expect(
      repositoryDependencySources({
        baseBranch: 'develop',
        primaryWorktreePath: '/repo',
        sourceWorktreeByBranch: {
          main: '/repo',
          feature: '/repo-feature',
        },
      }),
    ).toEqual({
      initial: { id: 'primary', kind: 'primary' },
      primary: { id: 'primary', kind: 'primary' },
      alternatives: [
        {
          id: 'branch:feature',
          kind: 'branch',
          branch: 'feature',
          worktreePath: '/repo-feature',
        },
      ],
    })
  })

  test('does not duplicate the primary worktree when the selected base occupies it', () => {
    expect(
      repositoryDependencySources({
        baseBranch: 'main',
        primaryWorktreePath: '/repo',
        sourceWorktreeByBranch: {
          main: '/repo',
          develop: '/repo-develop',
        },
      }),
    ).toEqual({
      initial: { id: 'primary', kind: 'primary' },
      primary: { id: 'primary', kind: 'primary' },
      alternatives: [
        {
          id: 'branch:develop',
          kind: 'branch',
          branch: 'develop',
          worktreePath: '/repo-develop',
        },
      ],
    })
  })
})
