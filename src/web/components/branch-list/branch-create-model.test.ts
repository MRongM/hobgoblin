import { describe, expect, test } from 'vitest'
import { branchNameValidationKey, remoteTrackingBranchChoices } from '#/web/components/branch-list/branch-create-model.ts'
import type { RepoBranchState } from '#/web/stores/repos/types.ts'

function branch(name: string): RepoBranchState {
  return {
    name,
    isCurrent: false,
    ahead: 0,
    behind: 0,
    lastCommitHash: 'abc1234',
    lastCommitMessage: 'message',
    lastCommitDate: '2024-01-01T00:00:00.000Z',
    lastCommitAuthor: 'dev',
  }
}

describe('branch create model', () => {
  test('validates empty invalid and duplicate branch names', () => {
    const branches = [branch('main'), branch('feature/existing')]

    expect(branchNameValidationKey('', branches)).toBe('action.create-branch-name-required')
    expect(branchNameValidationKey('-bad', branches)).toBe('action.create-worktree-branch-invalid')
    expect(branchNameValidationKey('feature/existing', branches)).toBe('action.create-worktree-branch-exists')
    expect(branchNameValidationKey('feature/new', branches)).toBeNull()
  })

  test('builds remote choices and filters derived local branch duplicates', () => {
    const branches = [branch('main'), branch('feature/existing')]

    expect(
      remoteTrackingBranchChoices(
        ['origin/main', 'origin/feature/existing', 'origin/feature/new', 'origin/HEAD', 'bad remote/feature'],
        branches,
      ),
    ).toEqual([{ remoteRef: 'origin/feature/new', defaultLocalBranch: 'feature/new' }])
  })
})
