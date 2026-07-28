import { describe, expect, test } from 'vitest'
import type {
  BranchWorkspaceGitActionResult,
  BranchWorkspaceMergeBackPlan,
} from '#/shared/branch-workspace-git-actions.ts'
import type { BranchWorkspaceActiveOperation } from '#/shared/branch-workspaces.ts'
import { projectBranchWorkspaceBatchMergeProgress } from '#/web/components/repo-workspace/branch-workspace-batch-merge-progress.ts'

describe('branch workspace batch merge progress', () => {
  test('excludes unselected members from local merge totals', () => {
    const progress = projectBranchWorkspaceBatchMergeProgress(mergePlan(), ['web'], 'merge', null, null)

    expect(progress.completedCount).toBe(0)
    expect(progress.totalCount).toBe(1)
    expect(memberStates(progress)).toEqual([
      ['api', 'unselected', []],
      ['web', 'pending', [['merge', 'pending']]],
      ['docs', 'satisfied', []],
    ])
  })

  test('projects completed members and the active merge pipeline from server progress', () => {
    const progress = projectBranchWorkspaceBatchMergeProgress(
      mergePlan(),
      ['api', 'web'],
      'pull-merge-push',
      activeOperation({
        currentStep: 2,
        completedCount: 1,
        repositoryName: 'web',
        step: 'merge',
      }),
      null,
    )

    expect(progress.completedCount).toBe(1)
    expect(memberStates(progress)).toEqual([
      [
        'api',
        'complete',
        [
          ['pull', 'complete'],
          ['merge', 'complete'],
          ['push', 'complete'],
        ],
      ],
      [
        'web',
        'active',
        [
          ['pull', 'complete'],
          ['merge', 'active'],
          ['push', 'pending'],
        ],
      ],
      ['docs', 'satisfied', []],
    ])
  })

  test('marks pull and merge complete while push is active', () => {
    const progress = projectBranchWorkspaceBatchMergeProgress(
      mergePlan(),
      ['api'],
      'pull-merge-push',
      activeOperation({ repositoryName: 'api', step: 'push' }),
      null,
    )

    expect(memberStates(progress)[0]).toEqual([
      'api',
      'active',
      [
        ['pull', 'complete'],
        ['merge', 'complete'],
        ['push', 'active'],
      ],
    ])
  })

  test('uses the final result to retain a failed step and pending later members', () => {
    const plan = mergePlan()
    const result: BranchWorkspaceGitActionResult = {
      ok: false,
      kind: 'merge-back',
      planToken: plan.token,
      branchWorkspaceId: plan.branchWorkspaceId,
      message: 'merge failed',
      members: [
        { repositoryName: 'api', phase: 'failed', step: 'merge', message: 'merge failed' },
        { repositoryName: 'web', phase: 'not-started' },
        { repositoryName: 'docs', phase: 'not-started' },
      ],
    }
    const progress = projectBranchWorkspaceBatchMergeProgress(plan, ['api', 'web'], 'pull-merge-push', null, result)

    expect(memberStates(progress)).toEqual([
      [
        'api',
        'failed',
        [
          ['pull', 'complete'],
          ['merge', 'failed'],
          ['push', 'pending'],
        ],
      ],
      [
        'web',
        'pending',
        [
          ['pull', 'pending'],
          ['merge', 'pending'],
          ['push', 'pending'],
        ],
      ],
      ['docs', 'satisfied', []],
    ])
  })
})

function mergePlan(): BranchWorkspaceMergeBackPlan {
  return {
    kind: 'merge-back',
    token: 'sha256:merge',
    rootId: '/workspace',
    branchWorkspaceId: 'ws-1',
    pullMergePushReady: true,
    members: ['api', 'web', 'docs'].map((repositoryName) => ({
      repositoryName,
      repoId: `/workspace/${repositoryName}`,
      targetBranch: 'feature/a',
      targetWorktreePath: `/workspace/feature-a/${repositoryName}`,
      targetHead: `${repositoryName}-target`,
      baseBranch: 'main',
      baseWorktreePath: `/workspace/${repositoryName}`,
      baseHead: `${repositoryName}-base`,
      mergeSatisfied: repositoryName === 'docs',
      pullMergePushReady: true,
      fingerprint: `sha256:${repositoryName}`,
    })),
  }
}

function activeOperation(fields: Partial<BranchWorkspaceActiveOperation>): BranchWorkspaceActiveOperation {
  return {
    kind: 'merge-back',
    currentStep: 1,
    completedCount: 0,
    totalCount: 2,
    cancellable: true,
    ...fields,
  }
}

function memberStates(progress: ReturnType<typeof projectBranchWorkspaceBatchMergeProgress>) {
  return progress.members.map((member) => [
    member.repositoryName,
    member.status,
    member.steps.map((step) => [step.step, step.status]),
  ])
}
