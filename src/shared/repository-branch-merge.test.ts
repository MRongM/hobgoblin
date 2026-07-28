import { describe, expect, test } from 'vitest'
import {
  normalizeRepositoryBranchMergeOutExecuteInput,
  normalizeRepositoryBranchMergeOutPlanRequest,
} from '#/shared/repository-branch-merge.ts'

describe('repository branch merge-out protocol', () => {
  test('normalizes a plan request', () => {
    expect(
      normalizeRepositoryBranchMergeOutPlanRequest({
        repoId: ' /workspace/repo ',
        sourceBranch: ' feature/source ',
        sourceWorktreePath: ' /workspace/source ',
      }),
    ).toEqual({
      ok: true,
      request: {
        repoId: '/workspace/repo',
        sourceBranch: 'feature/source',
        sourceWorktreePath: '/workspace/source',
      },
    })
  })

  test('normalizes an explicit merge-out execution', () => {
    expect(
      normalizeRepositoryBranchMergeOutExecuteInput({
        repoId: '/workspace/repo',
        planToken: 'sha256:plan',
        sourceBranch: 'feature/source',
        sourceWorktreePath: '/workspace/source',
        destinationBranch: 'main',
        mode: 'pull-merge-push',
      }),
    ).toEqual({
      ok: true,
      input: {
        repoId: '/workspace/repo',
        planToken: 'sha256:plan',
        sourceBranch: 'feature/source',
        sourceWorktreePath: '/workspace/source',
        destinationBranch: 'main',
        mode: 'pull-merge-push',
      },
    })
  })

  test.each([
    { sourceBranch: 'feature/a', destinationBranch: 'feature/a', mode: 'merge' },
    { sourceBranch: '', destinationBranch: 'main', mode: 'merge' },
    { sourceBranch: 'feature/a', destinationBranch: 'main\0bad', mode: 'merge' },
    { sourceBranch: 'feature/a', destinationBranch: 'main', mode: 'squash' },
  ])('rejects invalid execute input %#', (overrides) => {
    expect(
      normalizeRepositoryBranchMergeOutExecuteInput({
        repoId: '/workspace/repo',
        planToken: 'sha256:plan',
        sourceWorktreePath: '/workspace/source',
        ...overrides,
      }),
    ).toEqual({ ok: false, message: 'error.invalid-arguments' })
  })

  test.each([
    { repoId: '', sourceBranch: 'feature/a', sourceWorktreePath: '/workspace/source' },
    { repoId: '/workspace/repo', sourceBranch: '', sourceWorktreePath: '/workspace/source' },
    { repoId: '/workspace/repo', sourceBranch: 'feature/a', sourceWorktreePath: '' },
    { repoId: '/workspace/repo\0bad', sourceBranch: 'feature/a', sourceWorktreePath: '/workspace/source' },
    { repoId: '/workspace/repo', sourceBranch: 'feature\na', sourceWorktreePath: '/workspace/source' },
    { repoId: '/workspace/repo', sourceBranch: 'feature/a', sourceWorktreePath: '/workspace/source\u007f' },
  ])('rejects invalid plan request %#', (input) => {
    expect(normalizeRepositoryBranchMergeOutPlanRequest(input)).toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
  })
})
