import { describe, expect, test } from 'vitest'
import type { BranchWorkspaceGitActionResult } from '#/shared/branch-workspace-git-actions.ts'
import type { BranchWorkspaceActiveOperation } from '#/shared/branch-workspaces.ts'
import { projectBranchWorkspaceBatchProgress } from './branch-workspace-batch-progress.ts'

const members = [{ repositoryName: 'api' }, { repositoryName: 'web' }]

describe('projectBranchWorkspaceBatchProgress', () => {
  test('marks unselected members as unselected with empty steps', () => {
    const progress = projectBranchWorkspaceBatchProgress({
      members,
      selectedRepositoryNames: ['api'],
      stepsFor: () => ['commit'],
      activeOperation: null,
      result: null,
    })

    expect(progress.members.find((member) => member.repositoryName === 'web')).toMatchObject({
      selected: false,
      status: 'unselected',
      steps: [],
    })
  })

  test('marks the running member active and later members pending', () => {
    const activeOperation: BranchWorkspaceActiveOperation = {
      kind: 'batch-commit',
      currentStep: 1,
      repositoryName: 'api',
      step: 'commit',
      completedCount: 0,
      totalCount: 2,
      cancellable: true,
    }
    const progress = projectBranchWorkspaceBatchProgress({
      members,
      selectedRepositoryNames: ['api', 'web'],
      stepsFor: () => ['commit'],
      activeOperation,
      result: null,
    })

    expect(progress.members.find((member) => member.repositoryName === 'api')).toMatchObject({
      status: 'active',
      steps: [{ step: 'commit', status: 'active' }],
    })
    expect(progress.members.find((member) => member.repositoryName === 'web')).toMatchObject({
      status: 'pending',
      steps: [{ step: 'commit', status: 'pending' }],
    })
    expect(progress).toMatchObject({ completedCount: 0, totalCount: 2 })
  })

  test('projects a failed result with earlier steps complete and later steps pending', () => {
    const result = {
      ok: false,
      kind: 'push',
      planToken: 'sha256:plan',
      branchWorkspaceId: 'workspace-1',
      members: [{ repositoryName: 'api', phase: 'failed', step: 'push', message: 'failed' }],
    } satisfies BranchWorkspaceGitActionResult
    const progress = projectBranchWorkspaceBatchProgress({
      members: [{ repositoryName: 'api' }],
      selectedRepositoryNames: ['api'],
      stepsFor: () => ['pull', 'push', 'cleanup'],
      activeOperation: null,
      result,
    })

    expect(progress.members[0]?.steps.map((step) => step.status)).toEqual(['complete', 'failed', 'pending'])
    expect(progress.members[0]?.status).toBe('failed')
  })

  test('counts succeeded result members as complete', () => {
    const result = {
      ok: true,
      kind: 'push',
      planToken: 'sha256:plan',
      branchWorkspaceId: 'workspace-1',
      members: members.map((member) => ({ ...member, phase: 'succeeded' as const })),
    } satisfies BranchWorkspaceGitActionResult
    const progress = projectBranchWorkspaceBatchProgress({
      members,
      selectedRepositoryNames: ['api', 'web'],
      stepsFor: () => ['push'],
      activeOperation: null,
      result,
    })

    expect(progress.completedCount).toBe(2)
    expect(progress.members.every((member) => member.status === 'complete')).toBe(true)
  })
})
