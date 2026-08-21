import { describe, expect, test } from 'vitest'
import { normalizeWorktreeBranchSwitchTarget, worktreeBranchSwitchTargetKey } from '#/shared/worktree-branch-switch.ts'

describe('worktree branch switch target', () => {
  test('normalizes valid local and remote targets', () => {
    expect(normalizeWorktreeBranchSwitchTarget({ kind: 'localBranch', branch: ' feature/local ' })).toEqual({
      kind: 'localBranch',
      branch: 'feature/local',
    })
    expect(
      normalizeWorktreeBranchSwitchTarget({
        kind: 'remoteBranch',
        remoteRef: ' origin/feature/remote ',
        localBranch: ' feature/remote ',
      }),
    ).toEqual({
      kind: 'remoteBranch',
      remoteRef: 'origin/feature/remote',
      localBranch: 'feature/remote',
    })
  })

  test('rejects unsafe or incomplete targets', () => {
    expect(normalizeWorktreeBranchSwitchTarget({ kind: 'localBranch', branch: '-bad' })).toBeNull()
    expect(
      normalizeWorktreeBranchSwitchTarget({
        kind: 'remoteBranch',
        remoteRef: 'origin/HEAD',
        localBranch: 'feature/remote',
      }),
    ).toBeNull()
    expect(
      normalizeWorktreeBranchSwitchTarget({
        kind: 'remoteBranch',
        remoteRef: 'origin/feature/remote',
      }),
    ).toBeNull()
    expect(normalizeWorktreeBranchSwitchTarget(null)).toBeNull()
  })

  test('keeps local and remote picker identities distinct', () => {
    expect(worktreeBranchSwitchTargetKey({ kind: 'localBranch', branch: 'origin/main' })).toBe('local:origin/main')
    expect(
      worktreeBranchSwitchTargetKey({
        kind: 'remoteBranch',
        remoteRef: 'origin/main',
        localBranch: 'main',
      }),
    ).toBe('remote:origin/main')
  })
})
