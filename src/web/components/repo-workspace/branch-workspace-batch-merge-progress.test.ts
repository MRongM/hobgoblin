import { describe, expect, test } from 'vitest'
import type {
  BranchWorkspaceBatchMergePlan,
  BranchWorkspaceBatchMergeTargetInput,
  BranchWorkspaceGitActionResult,
} from '#/shared/branch-workspace-git-actions.ts'
import type { BranchWorkspaceActiveOperation } from '#/shared/branch-workspaces.ts'
import { projectBranchWorkspaceBatchMergeProgress } from '#/web/components/repo-workspace/branch-workspace-batch-merge-progress.ts'

describe('branch workspace batch merge progress', () => {
  test('excludes unselected members from local merge totals', () => {
    const progress = projectBranchWorkspaceBatchMergeProgress(
      mergePlan(),
      targets([['web', 'release/v2']]),
      'merge',
      null,
      null,
    )

    expect(progress.completedCount).toBe(0)
    expect(progress.totalCount).toBe(1)
    expect(memberStates(progress)).toEqual([
      ['api', 'unselected', []],
      [
        'web',
        'pending',
        [
          ['prepare', 'pending'],
          ['merge', 'pending'],
        ],
      ],
      ['docs', 'unselected', []],
    ])
  })

  test('projects completed members and the active merge pipeline from server progress', () => {
    const progress = projectBranchWorkspaceBatchMergeProgress(
      mergePlan(),
      targets([
        ['api', 'main'],
        ['web', 'staging'],
      ]),
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
          ['prepare', 'complete'],
          ['pull', 'complete'],
          ['merge', 'complete'],
          ['push', 'complete'],
        ],
      ],
      [
        'web',
        'active',
        [
          ['prepare', 'complete'],
          ['pull', 'complete'],
          ['merge', 'active'],
          ['push', 'pending'],
          ['cleanup', 'pending'],
        ],
      ],
      ['docs', 'unselected', []],
    ])
  })

  test('marks pull and merge complete while push is active', () => {
    const progress = projectBranchWorkspaceBatchMergeProgress(
      mergePlan(),
      targets([['api', 'main']]),
      'pull-merge-push',
      activeOperation({ repositoryName: 'api', step: 'push' }),
      null,
    )

    expect(memberStates(progress)[0]).toEqual([
      'api',
      'active',
      [
        ['prepare', 'complete'],
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
      kind: 'batch-merge',
      planToken: plan.token,
      branchWorkspaceId: plan.branchWorkspaceId,
      message: 'merge failed',
      members: [
        { repositoryName: 'api', phase: 'failed', step: 'merge', message: 'merge failed' },
        { repositoryName: 'web', phase: 'not-started' },
        { repositoryName: 'docs', phase: 'not-started' },
      ],
    }
    const progress = projectBranchWorkspaceBatchMergeProgress(
      plan,
      targets([
        ['api', 'staging'],
        ['web', 'main'],
      ]),
      'pull-merge-push',
      null,
      result,
    )

    expect(memberStates(progress)).toEqual([
      [
        'api',
        'failed',
        [
          ['prepare', 'complete'],
          ['pull', 'complete'],
          ['merge', 'failed'],
          ['push', 'pending'],
          ['cleanup', 'pending'],
        ],
      ],
      [
        'web',
        'pending',
        [
          ['prepare', 'pending'],
          ['pull', 'pending'],
          ['merge', 'pending'],
          ['push', 'pending'],
        ],
      ],
      ['docs', 'unselected', []],
    ])
  })
})

function mergePlan(): BranchWorkspaceBatchMergePlan {
  return {
    kind: 'batch-merge',
    token: 'sha256:merge',
    rootId: '/workspace',
    branchWorkspaceId: 'ws-1',
    members: ['api', 'web', 'docs'].map((repositoryName) => ({
      repositoryName,
      repoId: `/workspace/${repositoryName}`,
      targetBranch: 'feature/a',
      targetWorktreePath: `/workspace/feature-a/${repositoryName}`,
      targetHead: `${repositoryName}-target`,
      ready: true,
      destinationBranches: [
        {
          branch: 'main',
          head: 'main-head',
          ready: true,
          worktreePath: `/workspace/${repositoryName}`,
          requiresTemporaryWorktree: false,
          pullMergePushReady: true,
        },
        {
          branch: 'release/v2',
          head: 'release-head',
          ready: true,
          worktreePath: `/workspace/${repositoryName}-release`,
          requiresTemporaryWorktree: false,
          pullMergePushReady: true,
        },
        {
          branch: 'staging',
          head: 'staging-head',
          ready: true,
          requiresTemporaryWorktree: true,
          pullMergePushReady: true,
        },
      ],
      fingerprint: `sha256:${repositoryName}`,
    })),
  }
}

function activeOperation(fields: Partial<BranchWorkspaceActiveOperation>): BranchWorkspaceActiveOperation {
  return {
    kind: 'batch-merge',
    currentStep: 1,
    completedCount: 0,
    totalCount: 2,
    cancellable: true,
    ...fields,
  }
}

function targets(entries: Array<[string, string]>): BranchWorkspaceBatchMergeTargetInput[] {
  return entries.map(([repositoryName, destinationBranch]) => ({ repositoryName, destinationBranch }))
}

function memberStates(progress: ReturnType<typeof projectBranchWorkspaceBatchMergeProgress>) {
  return progress.members.map((member) => [
    member.repositoryName,
    member.status,
    member.steps.map((step) => [step.step, step.status]),
  ])
}
