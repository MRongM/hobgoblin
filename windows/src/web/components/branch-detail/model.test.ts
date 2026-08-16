import { describe, expect, test } from 'vitest'
import { getBranchDetailPresentation } from '#/web/components/branch-detail/model.ts'
import { createRepoBranch, seedRepoState } from '#/web/stores/repos/test-utils.ts'

describe('branch detail presentation', () => {
  test('projects an explicit worktree without changing the selected branch', () => {
    const repo = seedRepoState({
      id: '/workspace/api',
      branches: [
        createRepoBranch('main', { worktree: { path: '/workspace/api' } }),
        createRepoBranch('feature/auth', { worktree: { path: '/workspace/hobgoblin-feature-auth/api' } }),
      ],
      currentBranch: 'main',
      selectedBranch: 'main',
      status: [
        { path: '/workspace/api', branch: 'main', head: 'one', isMain: true, entries: [] },
        {
          path: '/workspace/hobgoblin-feature-auth/api',
          branch: 'feature/auth',
          head: 'two',
          isMain: false,
          entries: [{ path: 'src/auth.ts', x: ' ', y: 'M' }],
        },
      ],
    })

    const detail = getBranchDetailPresentation(repo, {
      branchName: 'feature/auth',
      worktreePath: '/workspace/hobgoblin-feature-auth/api',
    })

    expect(detail.branch?.name).toBe('feature/auth')
    expect(detail.selectedStatus.flatMap((status) => status.entries.map((entry) => entry.path))).toEqual([
      'src/auth.ts',
    ])
    expect(repo.ui.selectedBranch).toBe('main')
  })
})
