import { describe, expect, test } from 'vitest'
import type {
  BranchWorkspaceBatchMergeInPlan,
  BranchWorkspaceBatchMergeInSourceInput,
  BranchWorkspaceBatchMergeOutPlan,
  BranchWorkspaceBatchMergeOutTargetInput,
  BranchWorkspaceGitActionResult,
} from '#/shared/branch-workspace-git-actions.ts'
import type { BranchWorkspaceActiveOperation } from '#/shared/branch-workspaces.ts'
import {
  projectBranchWorkspaceBatchMergeInProgress,
  projectBranchWorkspaceBatchMergeOutProgress,
} from '#/web/components/repo-workspace/branch-workspace-batch-merge-progress.ts'

describe('branch workspace batch merge progress', () => {
  test('excludes unselected members from local merge totals', () => {
    const progress = projectBranchWorkspaceBatchMergeOutProgress(
      mergeOutPlan(),
      mergeOutTargets([['web', 'release/v2']]),
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
    const progress = projectBranchWorkspaceBatchMergeOutProgress(
      mergeOutPlan(),
      mergeOutTargets([
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
    const progress = projectBranchWorkspaceBatchMergeOutProgress(
      mergeOutPlan(),
      mergeOutTargets([['api', 'main']]),
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

  test('uses the final result to retain a failed step and a later successful member', () => {
    const plan = mergeOutPlan()
    const result: BranchWorkspaceGitActionResult = {
      ok: false,
      kind: 'batch-merge-out',
      planToken: plan.token,
      branchWorkspaceId: plan.branchWorkspaceId,
      message: 'merge failed',
      members: [
        { repositoryName: 'api', phase: 'failed', step: 'merge', message: 'merge failed' },
        { repositoryName: 'web', phase: 'succeeded' },
        { repositoryName: 'docs', phase: 'not-started' },
      ],
    }
    const progress = projectBranchWorkspaceBatchMergeOutProgress(
      plan,
      mergeOutTargets([
        ['api', 'staging'],
        ['web', 'main'],
      ]),
      'pull-merge-push',
      null,
      result,
    )

    expect(progress.completedCount).toBe(1)
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
        'complete',
        [
          ['prepare', 'complete'],
          ['pull', 'complete'],
          ['merge', 'complete'],
          ['push', 'complete'],
        ],
      ],
      ['docs', 'unselected', []],
    ])
  })

  test('projects merge-in without prepare or cleanup steps', () => {
    const progress = projectBranchWorkspaceBatchMergeInProgress(
      mergeInPlan(),
      mergeInSources([['web', 'release/v2']]),
      'merge',
      null,
      null,
    )

    expect(progress.completedCount).toBe(0)
    expect(progress.totalCount).toBe(1)
    expect(memberStates(progress)).toEqual([
      ['api', 'unselected', []],
      ['web', 'pending', [['merge', 'pending']]],
      ['docs', 'unselected', []],
    ])
  })

  test('projects completed and active target-owned merge-in remote steps', () => {
    const progress = projectBranchWorkspaceBatchMergeInProgress(
      mergeInPlan(),
      mergeInSources([
        ['api', 'main'],
        ['web', 'release/v2'],
      ]),
      'pull-merge-push',
      activeOperation({
        kind: 'batch-merge-in',
        currentStep: 2,
        completedCount: 1,
        repositoryName: 'web',
        step: 'merge',
      }),
      null,
    )

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
      ['docs', 'unselected', []],
    ])
  })

  test('retains a failed merge-in step and a later successful member', () => {
    const plan = mergeInPlan()
    const result: BranchWorkspaceGitActionResult = {
      ok: false,
      kind: 'batch-merge-in',
      planToken: plan.token,
      branchWorkspaceId: plan.branchWorkspaceId,
      members: [
        { repositoryName: 'api', phase: 'failed', step: 'merge', message: 'conflict' },
        { repositoryName: 'web', phase: 'succeeded' },
        { repositoryName: 'docs', phase: 'not-started' },
      ],
    }
    const progress = projectBranchWorkspaceBatchMergeInProgress(
      plan,
      mergeInSources([
        ['api', 'main'],
        ['web', 'release/v2'],
      ]),
      'pull-merge-push',
      null,
      result,
    )

    expect(progress.completedCount).toBe(1)
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
        'complete',
        [
          ['pull', 'complete'],
          ['merge', 'complete'],
          ['push', 'complete'],
        ],
      ],
      ['docs', 'unselected', []],
    ])
  })
})

function mergeInPlan(): BranchWorkspaceBatchMergeInPlan {
  return {
    kind: 'batch-merge-in',
    token: 'sha256:merge-in',
    rootId: '/workspace',
    branchWorkspaceId: 'ws-1',
    members: ['api', 'web', 'docs'].map((repositoryName) => ({
      repositoryName,
      repoId: `/workspace/${repositoryName}`,
      targetBranch: 'feature/a',
      targetWorktreePath: `/workspace/feature-a/${repositoryName}`,
      targetHead: `${repositoryName}-target`,
      ready: true,
      pullMergePushReady: true,
      sourceBranches: [
        { branch: 'main', head: 'main-head' },
        { branch: 'release/v2', head: 'release-head' },
      ],
      fingerprint: `sha256:${repositoryName}`,
    })),
  }
}

function mergeOutPlan(): BranchWorkspaceBatchMergeOutPlan {
  return {
    kind: 'batch-merge-out',
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
    kind: 'batch-merge-out',
    currentStep: 1,
    completedCount: 0,
    totalCount: 2,
    cancellable: true,
    ...fields,
  }
}

function mergeOutTargets(entries: Array<[string, string]>): BranchWorkspaceBatchMergeOutTargetInput[] {
  return entries.map(([repositoryName, destinationBranch]) => ({ repositoryName, destinationBranch }))
}

function mergeInSources(entries: Array<[string, string]>): BranchWorkspaceBatchMergeInSourceInput[] {
  return entries.map(([repositoryName, sourceBranch]) => ({ repositoryName, sourceBranch }))
}

function memberStates(progress: ReturnType<typeof projectBranchWorkspaceBatchMergeOutProgress>) {
  return progress.members.map((member) => [
    member.repositoryName,
    member.status,
    member.steps.map((step) => [step.step, step.status]),
  ])
}
