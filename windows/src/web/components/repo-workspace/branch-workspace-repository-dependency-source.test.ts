import { describe, expect, test } from 'vitest'
import { repositoryDependencySources } from '#/web/components/repo-workspace/branch-workspace-repository-dependency-source.ts'

describe('branch workspace repository dependency sources', () => {
  const worktrees = [
    { path: '/repo', branch: 'main', head: '1111111', isMain: true },
    { path: '/repo-develop', branch: 'develop', head: '2222222', isMain: false },
    { path: '/repo-feature', branch: 'feature', head: '3333333', isMain: false },
    { path: '/repo-detached', head: 'abcdef123456', isDetached: true, isMain: false },
    { path: '/repo-prunable', branch: 'old', head: '4444444', isMain: false, isPrunable: true },
  ]

  test('lists every usable existing worktree and starts from the context branch', () => {
    expect(repositoryDependencySources({ contextBranch: 'develop', worktrees })).toEqual({
      initial: {
        id: 'worktree:/repo-develop',
        kind: 'branch',
        branch: 'develop',
        worktreePath: '/repo-develop',
      },
      options: [
        {
          id: 'worktree:/repo',
          kind: 'primary',
          branch: 'main',
          worktreePath: '/repo',
        },
        {
          id: 'worktree:/repo-develop',
          kind: 'branch',
          branch: 'develop',
          worktreePath: '/repo-develop',
        },
        {
          id: 'worktree:/repo-feature',
          kind: 'branch',
          branch: 'feature',
          worktreePath: '/repo-feature',
        },
        {
          id: 'worktree:/repo-detached',
          kind: 'detached',
          head: 'abcdef123456',
          worktreePath: '/repo-detached',
        },
      ],
    })
  })

  test('falls back to the primary worktree and deduplicates paths', () => {
    const result = repositoryDependencySources({
      contextBranch: 'missing',
      worktrees: [...worktrees, { path: '/repo', branch: 'duplicate', isMain: false }],
    })

    expect(result.initial).toEqual({
      id: 'worktree:/repo',
      kind: 'primary',
      branch: 'main',
      worktreePath: '/repo',
    })
    expect(result.options.filter((source) => source.worktreePath === '/repo')).toHaveLength(1)
  })

  test('uses the first usable worktree when no primary exists', () => {
    const result = repositoryDependencySources({
      contextBranch: '',
      worktrees: [
        { path: '/repo-feature', branch: 'feature', isMain: false },
        { path: '/repo-detached', head: 'abcdef1', isDetached: true, isMain: false },
      ],
    })

    expect(result.initial?.worktreePath).toBe('/repo-feature')
  })

  test('returns no source when every worktree is unusable', () => {
    expect(
      repositoryDependencySources({
        contextBranch: 'main',
        worktrees: [
          { path: '', branch: 'main', isMain: true },
          { path: '/repo-old', branch: 'old', isMain: false, isPrunable: true },
        ],
      }),
    ).toEqual({ initial: null, options: [] })
  })
})
