import { describe, expect, test } from 'vitest'
import type {
  BranchWorkspacePlan,
  BranchWorkspacePlanStep,
  BranchWorkspaceProgress,
  BranchWorkspaceRepositorySnapshot,
  BranchWorkspaceSnapshot,
} from '#/shared/branch-workspaces.ts'
import { projectBranchWorkspaceOperationProgress } from '#/web/components/repo-workspace/branch-workspace-operation-progress.ts'

describe('branch workspace operation progress', () => {
  test('starts the first creation step before the first server snapshot arrives', () => {
    const progress = projectBranchWorkspaceOperationProgress(
      plan('create', [
        step('directory', 'create-directory'),
        step('repository:api', 'create-worktree', { repositoryName: 'api' }),
        step('repository:web', 'create-worktree', { repositoryName: 'web' }),
      ]),
      null,
      { executing: true, failed: false },
    )

    expect(statuses(progress)).toEqual([
      ['directory', 'active'],
      ['repository:api', 'pending'],
      ['repository:web', 'pending'],
    ])
    expect(progress.completedCount).toBe(0)
    expect(progress.totalCount).toBe(3)
  })

  test('advances creation through the directory and repository members', () => {
    const progress = projectBranchWorkspaceOperationProgress(
      plan('create', [
        step('directory', 'create-directory'),
        step('repository:api', 'create-worktree', { repositoryName: 'api' }),
        step('repository:web', 'create-worktree', { repositoryName: 'web' }),
        step('auxiliary:docs', 'copy-entry', { entryName: 'docs' }),
      ]),
      snapshot({
        repositories: [member('api', 'complete'), member('web', 'pending')],
        auxiliaryEntries: [
          {
            name: 'docs',
            mode: 'copy',
            sourcePath: '/workspace/docs',
            targetPath: '/workspace/hobgoblin-feature/docs',
            progress: 'pending',
            ready: false,
          },
        ],
      }),
      { executing: true, failed: false },
    )

    expect(statuses(progress)).toEqual([
      ['directory', 'complete'],
      ['repository:api', 'complete'],
      ['repository:web', 'active'],
      ['auxiliary:docs', 'pending'],
    ])
    expect(progress.completedCount).toBe(2)
  })

  test('treats a completed creation auxiliary entry omitted from the read model as complete', () => {
    const progress = projectBranchWorkspaceOperationProgress(
      plan('create', [
        step('repository:api', 'create-worktree', { repositoryName: 'api' }),
        step('auxiliary:docs', 'symlink-entry', { entryName: 'docs' }),
      ]),
      snapshot({ repositories: [member('api', 'complete')] }),
      { executing: true, failed: false },
    )

    expect(statuses(progress)).toEqual([
      ['repository:api', 'complete'],
      ['auxiliary:docs', 'complete'],
    ])
    expect(progress.completedCount).toBe(2)
  })

  test('reports durable removal cleanup failure without advancing later steps', () => {
    const api = member('api', 'removed')
    api.branchCleanupProgress = 'complete'
    api.upstreamCleanupProgress = 'failed'
    const progress = projectBranchWorkspaceOperationProgress(
      plan('remove', [
        step('repository:api', 'remove-worktree', { repositoryName: 'api' }),
        step('branch:api', 'delete-local-branch', { repositoryName: 'api' }),
        step('upstream:api', 'delete-upstream-branch', { repositoryName: 'api' }),
        step('auxiliary:docs', 'remove-entry', { entryName: 'docs' }),
        step('directory', 'remove-directory'),
      ]),
      snapshot({ repositories: [api] }),
      { executing: true, failed: false },
    )

    expect(statuses(progress)).toEqual([
      ['repository:api', 'complete'],
      ['branch:api', 'complete'],
      ['upstream:api', 'failed'],
      ['auxiliary:docs', 'pending'],
      ['directory', 'pending'],
    ])
    expect(progress.completedCount).toBe(2)
  })

  test('infers an earlier unobservable removal step from a later durable completion', () => {
    const progress = projectBranchWorkspaceOperationProgress(
      plan('remove', [
        step('unmanaged:notes', 'remove-entry', { entryName: 'notes' }),
        step('auxiliary:docs', 'remove-entry', { entryName: 'docs' }),
        step('directory', 'remove-directory'),
      ]),
      snapshot({
        auxiliaryEntries: [
          {
            name: 'docs',
            mode: 'copy',
            sourcePath: '/workspace/docs',
            targetPath: '/workspace/hobgoblin-feature/docs',
            progress: 'removed',
            ready: false,
          },
        ],
      }),
      { executing: true, failed: false },
    )

    expect(statuses(progress)).toEqual([
      ['unmanaged:notes', 'complete'],
      ['auxiliary:docs', 'complete'],
      ['directory', 'active'],
    ])
    expect(progress.completedCount).toBe(2)
  })

  test('marks the first unresolved step failed when execution settles without detailed failure state', () => {
    const progress = projectBranchWorkspaceOperationProgress(
      plan('remove', [
        step('repository:api', 'remove-worktree', { repositoryName: 'api' }),
        step('directory', 'remove-directory'),
      ]),
      null,
      { executing: false, failed: true },
    )

    expect(statuses(progress)).toEqual([
      ['repository:api', 'failed'],
      ['directory', 'pending'],
    ])
    expect(progress.completedCount).toBe(0)
  })
})

function statuses(progress: ReturnType<typeof projectBranchWorkspaceOperationProgress>) {
  return progress.steps.map(({ step: current, status }) => [current.id, status])
}

function step(
  id: string,
  kind: BranchWorkspacePlanStep['kind'],
  fields: Pick<BranchWorkspacePlanStep, 'repositoryName' | 'entryName'> = {},
): BranchWorkspacePlanStep {
  return { id, kind, label: id, ...fields }
}

function plan(operation: 'create' | 'remove', steps: BranchWorkspacePlanStep[]): BranchWorkspacePlan {
  return {
    token: 'sha256:plan',
    rootId: '/workspace',
    operation,
    branchWorkspaceId: 'branch-workspace-1',
    branch: 'feature/example',
    directoryName: 'hobgoblin-feature',
    path: '/workspace/hobgoblin-feature',
    manifest: {
      id: 'branch-workspace-1',
      rootId: '/workspace',
      branch: 'feature/example',
      directoryName: 'hobgoblin-feature',
      path: '/workspace/hobgoblin-feature',
      repositories: [],
      auxiliaryEntries: [],
    },
    repositories: [],
    auxiliaryEntries: [],
    requiredApprovals: [],
    steps,
    terminalSessionIds: [],
  }
}

function snapshot(
  fields: Partial<Pick<BranchWorkspaceSnapshot, 'issues' | 'repositories' | 'auxiliaryEntries'>> = {},
): BranchWorkspaceSnapshot {
  return {
    id: 'branch-workspace-1',
    rootId: '/workspace',
    branch: 'feature/example',
    directoryName: 'hobgoblin-feature',
    path: '/workspace/hobgoblin-feature',
    state: { kind: 'needs-action', action: 'repair', reason: 'creation-interrupted' },
    available: true,
    issues: [],
    repositories: [],
    auxiliaryEntries: [],
    ...fields,
  }
}

function member(name: string, progress: BranchWorkspaceProgress): BranchWorkspaceRepositorySnapshot {
  return {
    repositoryName: name,
    targetBranch: 'feature/example',
    baseBranch: 'main',
    branchOrigin: 'created',
    worktreePath: `/workspace/hobgoblin-feature/${name}`,
    progress,
    ready: progress === 'complete',
  }
}
