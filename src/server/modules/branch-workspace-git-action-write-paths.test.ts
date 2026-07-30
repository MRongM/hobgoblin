import { describe, expect, test, vi } from 'vitest'
import { createBranchWorkspaceGitActionWriteService } from '#/server/modules/branch-workspace-git-action-write-paths.ts'
import type { BranchWorkspaceGitActionPlan } from '#/shared/branch-workspace-git-actions.ts'
import type { WorktreeBootstrapDecision } from '#/shared/worktree-bootstrap-summary.ts'
import type { CreateWorktreeInput } from '#/shared/worktree-create.ts'

const ROOT = '/workspace'

function batchPlan(): BranchWorkspaceGitActionPlan {
  return {
    kind: 'batch-commit',
    token: 'sha256:batch',
    rootId: ROOT,
    branchWorkspaceId: 'ws-1',
    members: ['api', 'web'].map((repositoryName) => ({
      repositoryName,
      repoId: `${ROOT}/${repositoryName}`,
      targetBranch: 'feature/a',
      targetWorktreePath: `${ROOT}/goblin-feature-a/${repositoryName}`,
      dirty: true,
      changeCount: 1,
      fingerprint: `sha256:${repositoryName}`,
    })),
  }
}

function mergeOutPlan(repositoryNames = ['api', 'web']): BranchWorkspaceGitActionPlan {
  return {
    kind: 'batch-merge-out',
    token: 'sha256:merge',
    rootId: ROOT,
    branchWorkspaceId: 'ws-1',
    members: repositoryNames.map((repositoryName) => ({
      repositoryName,
      repoId: `${ROOT}/${repositoryName}`,
      targetBranch: 'feature/a',
      targetWorktreePath: `${ROOT}/goblin-feature-a/${repositoryName}`,
      targetHead: 'target-head',
      ready: true,
      destinationBranches: [
        {
          branch: 'main',
          head: 'main-head',
          ready: true,
          worktreePath: `${ROOT}/${repositoryName}`,
          requiresTemporaryWorktree: false,
          pullMergePushReady: true,
        },
        {
          branch: 'release/v2',
          head: 'release-head',
          ready: true,
          worktreePath: `${ROOT}/${repositoryName}-release`,
          requiresTemporaryWorktree: false,
          pullMergePushReady: true,
        },
        {
          branch: 'integration',
          head: 'integration-head',
          ready: true,
          worktreePath: `${ROOT}/${repositoryName}-integration`,
          requiresTemporaryWorktree: false,
          pullMergePushReady: false,
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

function mergeOutTargets(
  entries: Array<[string, string]> = [
    ['api', 'main'],
    ['web', 'main'],
  ],
) {
  return entries.map(([repositoryName, destinationBranch]) => ({ repositoryName, destinationBranch }))
}

function mergeInPlan(repositoryNames = ['api', 'web']): BranchWorkspaceGitActionPlan {
  return {
    kind: 'batch-merge-in',
    token: 'sha256:merge-in',
    rootId: ROOT,
    branchWorkspaceId: 'ws-1',
    members: repositoryNames.map((repositoryName) => ({
      repositoryName,
      repoId: `${ROOT}/${repositoryName}`,
      targetBranch: 'feature/a',
      targetWorktreePath: `${ROOT}/goblin-feature-a/${repositoryName}`,
      targetHead: 'target-head',
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

function mergeInSources(
  entries: Array<[string, string]> = [
    ['api', 'main'],
    ['web', 'main'],
  ],
) {
  return entries.map(([repositoryName, sourceBranch]) => ({ repositoryName, sourceBranch }))
}

function syncPlan(kind: 'pull' | 'push', ready = true): BranchWorkspaceGitActionPlan {
  return {
    kind,
    token: `sha256:${kind}`,
    rootId: ROOT,
    branchWorkspaceId: 'ws-1',
    ready,
    members: ['api', 'web'].map((repositoryName, index) => ({
      repositoryName,
      repoId: `${ROOT}/${repositoryName}`,
      targetBranch: 'feature/a',
      targetWorktreePath: `${ROOT}/goblin-feature-a/${repositoryName}`,
      targetHead: `target-head-${index}`,
      ready,
      ...(!ready
        ? {
            message:
              kind === 'pull'
                ? 'workspace.branch-workspace.git-action.target-upstream-required'
                : 'workspace.branch-workspace.git-action.remote-required',
          }
        : {}),
      fingerprint: `sha256:${repositoryName}`,
    })),
  }
}

describe('createBranchWorkspaceGitActionWriteService', () => {
  test('commits serially, stops at the first failure, and retries remaining members only', async () => {
    const commit = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, message: 'committed api' })
      .mockResolvedValueOnce({ ok: false, message: 'web failed' })
      .mockResolvedValueOnce({ ok: true, message: 'committed web' })
    const plan = batchPlan()
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      commit,
      publishInvalidation: vi.fn(),
    })
    await service.plan(ROOT, { kind: 'batch-commit', branchWorkspaceId: 'ws-1' })
    const input = {
      kind: 'batch-commit' as const,
      planToken: plan.token,
      messages: [
        { repositoryName: 'api', message: 'feat: api' },
        { repositoryName: 'web', message: 'feat: web' },
      ],
    }

    await expect(service.execute(ROOT, input)).resolves.toMatchObject({
      ok: false,
      members: [
        { repositoryName: 'api', phase: 'succeeded' },
        { repositoryName: 'web', phase: 'failed', step: 'commit' },
      ],
    })
    await expect(service.execute(ROOT, input)).resolves.toMatchObject({ ok: true })
    expect(commit.mock.calls.map((call) => call[0])).toEqual(['/workspace/api', '/workspace/web', '/workspace/web'])
  })

  test('merges selected sources into member targets in manifest order without temporary worktrees', async () => {
    const plan = mergeInPlan(['api', 'web', 'docs'])
    const merge = vi.fn(async () => ({ ok: true, message: 'merged' }))
    const createWorktree = vi.fn()
    const removeWorktree = vi.fn()
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      merge,
      createWorktree,
      removeWorktree,
      publishInvalidation: vi.fn(),
    })
    await service.plan(ROOT, { kind: 'batch-merge-in', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-merge-in',
        planToken: plan.token,
        mode: 'merge',
        sources: mergeInSources([
          ['web', 'release/v2'],
          ['api', 'main'],
        ]),
      }),
    ).resolves.toMatchObject({ ok: true })
    expect(merge.mock.calls.map((call) => call.slice(0, 3))).toEqual([
      ['/workspace/api', '/workspace/goblin-feature-a/api', 'main'],
      ['/workspace/web', '/workspace/goblin-feature-a/web', 'release/v2'],
    ])
    expect(createWorktree).not.toHaveBeenCalled()
    expect(removeWorktree).not.toHaveBeenCalled()
  })

  test('runs pull and push against merge-in target branches rather than selected sources', async () => {
    const plan = mergeInPlan()
    const calls: string[] = []
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      pull: vi.fn(async (_repoId, branch, worktreePath) => {
        calls.push(`pull:${branch}:${worktreePath}`)
        return { ok: true, message: 'pulled' }
      }),
      merge: vi.fn(async (_repoId, worktreePath, branch) => {
        calls.push(`merge:${branch}:${worktreePath}`)
        return { ok: true, message: 'merged' }
      }),
      push: vi.fn(async (_repoId, branch) => {
        calls.push(`push:${branch}`)
        return { ok: true, message: 'pushed' }
      }),
      publishInvalidation: vi.fn(),
    })
    await service.plan(ROOT, { kind: 'batch-merge-in', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-merge-in',
        planToken: plan.token,
        mode: 'pull-merge-push',
        sources: [{ repositoryName: 'api', sourceBranch: 'release/v2' }],
      }),
    ).resolves.toMatchObject({ ok: true })
    expect(calls).toEqual([
      'pull:feature/a:/workspace/goblin-feature-a/api',
      'merge:release/v2:/workspace/goblin-feature-a/api',
      'push:feature/a',
    ])
  })

  test('stops merge-in at the first conflict and leaves the member worktree as the conflict site', async () => {
    const plan = mergeInPlan()
    const merge = vi.fn(async () => ({ ok: false as const, message: 'conflict', reason: 'merge-conflict' as const }))
    const createWorktree = vi.fn()
    const removeWorktree = vi.fn()
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      merge,
      createWorktree,
      removeWorktree,
      publishInvalidation: vi.fn(),
    })
    await service.plan(ROOT, { kind: 'batch-merge-in', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-merge-in',
        planToken: plan.token,
        mode: 'merge',
        sources: mergeInSources(),
      }),
    ).resolves.toMatchObject({
      ok: false,
      members: [
        {
          repositoryName: 'api',
          phase: 'failed',
          step: 'merge',
          reason: 'merge-conflict',
          conflictWorktree: {
            branch: 'feature/a',
            path: '/workspace/goblin-feature-a/api',
          },
        },
        { repositoryName: 'web', phase: 'not-started' },
      ],
    })
    expect(merge).toHaveBeenCalledTimes(1)
    expect(createWorktree).not.toHaveBeenCalled()
    expect(removeWorktree).not.toHaveBeenCalled()
  })

  test('rejects invalid merge-in sources and missing target upstream before Git writes', async () => {
    const plan = mergeInPlan()
    if (plan.kind !== 'batch-merge-in') throw new Error('expected merge-in plan')
    plan.members[1]!.ready = false
    plan.members[1]!.message = 'workspace.branch-workspace.git-action.target-worktree-dirty'
    const pull = vi.fn()
    const merge = vi.fn()
    const push = vi.fn()
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      pull,
      merge,
      push,
      publishInvalidation: vi.fn(),
    })
    await service.plan(ROOT, { kind: 'batch-merge-in', branchWorkspaceId: 'ws-1' })

    for (const sources of [
      [{ repositoryName: 'missing', sourceBranch: 'main' }],
      [{ repositoryName: 'api', sourceBranch: 'feature/a' }],
      [{ repositoryName: 'web', sourceBranch: 'main' }],
    ]) {
      await expect(
        service.execute(ROOT, {
          kind: 'batch-merge-in',
          planToken: plan.token,
          mode: 'merge',
          sources,
        }),
      ).resolves.toMatchObject({ ok: false })
    }

    plan.members[0]!.pullMergePushReady = false
    await expect(
      service.execute(ROOT, {
        kind: 'batch-merge-in',
        planToken: plan.token,
        mode: 'pull-merge-push',
        sources: [{ repositoryName: 'api', sourceBranch: 'main' }],
      }),
    ).resolves.toEqual({
      ok: false,
      message: 'workspace.branch-workspace.git-action.target-upstream-required',
    })
    expect(pull).not.toHaveBeenCalled()
    expect(merge).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  test('binds merge-in retry to mode and source mapping while resuming completed remote steps', async () => {
    const plan = mergeInPlan()
    const pull = vi.fn(async () => ({ ok: true, message: 'pulled' }))
    const merge = vi.fn(async () => ({ ok: true, message: 'merged' }))
    const push = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, message: 'push failed' })
      .mockResolvedValueOnce({ ok: true, message: 'pushed' })
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      pull,
      merge,
      push,
      publishInvalidation: vi.fn(),
    })
    await service.plan(ROOT, { kind: 'batch-merge-in', branchWorkspaceId: 'ws-1' })
    const input = {
      kind: 'batch-merge-in' as const,
      planToken: plan.token,
      mode: 'pull-merge-push' as const,
      sources: [{ repositoryName: 'api', sourceBranch: 'main' }],
    }

    await expect(service.execute(ROOT, input)).resolves.toMatchObject({ ok: false })
    await expect(
      service.execute(ROOT, {
        ...input,
        sources: [{ repositoryName: 'api', sourceBranch: 'release/v2' }],
      }),
    ).resolves.toEqual({ ok: false, message: 'error.invalid-arguments' })
    await expect(service.execute(ROOT, input)).resolves.toMatchObject({ ok: true })
    expect(pull).toHaveBeenCalledTimes(1)
    expect(merge).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledTimes(2)
  })

  test('stops merge-in after target pull when the selected source head changes', async () => {
    const plan = mergeInPlan()
    const changedPlan = structuredClone(plan)
    if (changedPlan.kind !== 'batch-merge-in') throw new Error('expected merge-in plan')
    changedPlan.members[0]!.sourceBranches[0]!.head = 'changed-main-head'
    const merge = vi.fn()
    const push = vi.fn()
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi
        .fn()
        .mockResolvedValueOnce({ ok: true as const, plan })
        .mockResolvedValueOnce({ ok: true as const, plan: changedPlan }),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      pull: vi.fn(async () => ({ ok: true, message: 'pulled' })),
      merge,
      push,
      publishInvalidation: vi.fn(),
    })
    await service.plan(ROOT, { kind: 'batch-merge-in', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-merge-in',
        planToken: plan.token,
        mode: 'pull-merge-push',
        sources: [{ repositoryName: 'api', sourceBranch: 'main' }],
      }),
    ).resolves.toMatchObject({
      ok: false,
      members: [
        { repositoryName: 'api', phase: 'failed', step: 'merge' },
        { repositoryName: 'web', phase: 'not-started' },
      ],
    })
    expect(merge).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  test('runs each repository pipeline against its explicitly selected destination branch', async () => {
    const calls: string[] = []
    const plan = mergeOutPlan()
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      pull: vi.fn(async (_repoId, branch, worktreePath) => {
        calls.push(`pull:${branch}:${worktreePath}`)
        return { ok: true, message: 'pulled' }
      }),
      merge: vi.fn(async (_repoId, worktreePath, branch) => {
        calls.push(`merge:${branch}:${worktreePath}`)
        return { ok: true, message: 'merged' }
      }),
      push: vi.fn(async (_repoId, branch) => {
        calls.push(`push:${branch}`)
        return { ok: true, message: 'pushed' }
      }),
      publishInvalidation: vi.fn(),
    })
    await service.plan(ROOT, { kind: 'batch-merge-out', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-merge-out',
        planToken: plan.token,
        mode: 'pull-merge-push',
        targets: mergeOutTargets([
          ['web', 'main'],
          ['api', 'release/v2'],
        ]),
      }),
    ).resolves.toMatchObject({ ok: true })
    expect(calls).toEqual([
      'pull:release/v2:/workspace/api-release',
      'merge:feature/a:/workspace/api-release',
      'push:release/v2',
      'pull:main:/workspace/web',
      'merge:feature/a:/workspace/web',
      'push:main',
    ])
  })

  test('merges only selected repositories in plan order and reports selected progress', async () => {
    const plan = mergeOutPlan(['api', 'web', 'docs'])
    const calls: string[] = []
    const operations: Array<
      ReturnType<ReturnType<typeof createBranchWorkspaceGitActionWriteService>['activeOperation']>
    > = []
    let service: ReturnType<typeof createBranchWorkspaceGitActionWriteService>
    service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      merge: vi.fn(async (repoId) => {
        calls.push(repoId)
        operations.push(service.activeOperation(ROOT, 'ws-1'))
        return { ok: true, message: 'merged' }
      }),
      publishInvalidation: vi.fn(),
    })
    await service.plan(ROOT, { kind: 'batch-merge-out', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-merge-out',
        planToken: plan.token,
        mode: 'merge',
        targets: mergeOutTargets([
          ['web', 'main'],
          ['api', 'main'],
        ]),
      }),
    ).resolves.toMatchObject({ ok: true })
    expect(calls).toEqual(['/workspace/api', '/workspace/web'])
    expect(operations).toEqual([
      {
        kind: 'batch-merge-out',
        currentStep: 1,
        completedCount: 0,
        totalCount: 2,
        cancellable: true,
        repositoryName: 'api',
        step: 'merge',
      },
      {
        kind: 'batch-merge-out',
        currentStep: 2,
        completedCount: 1,
        totalCount: 2,
        cancellable: true,
        repositoryName: 'web',
        step: 'merge',
      },
    ])
  })

  test('validates readiness and fingerprints only for selected merge members and destinations', async () => {
    const plan = mergeOutPlan(['api', 'web', 'docs'])
    if (plan.kind !== 'batch-merge-out') throw new Error('expected merge plan')
    plan.members[2]!.destinationBranches[0]!.pullMergePushReady = false
    const ignoredSets: string[][] = []
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async (_plan, ignored) => {
        ignoredSets.push([...ignored].sort())
        return { ok: true as const, plan }
      }),
      pull: vi.fn(async () => ({ ok: true, message: 'pulled' })),
      merge: vi.fn(async () => ({ ok: true, message: 'merged' })),
      push: vi.fn(async () => ({ ok: true, message: 'pushed' })),
      publishInvalidation: vi.fn(),
    })
    await service.plan(ROOT, { kind: 'batch-merge-out', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-merge-out',
        planToken: plan.token,
        mode: 'pull-merge-push',
        targets: mergeOutTargets(),
      }),
    ).resolves.toMatchObject({ ok: true })
    expect(ignoredSets).toEqual([['docs']])
  })

  test('rejects unknown, source-identical, and unavailable destinations before Git writes', async () => {
    const plan = mergeOutPlan()
    if (plan.kind !== 'batch-merge-out') throw new Error('expected merge plan')
    plan.members[1]!.destinationBranches[0]!.ready = false
    plan.members[1]!.destinationBranches[0]!.message =
      'workspace.branch-workspace.git-action.destination-worktree-dirty'
    const merge = vi.fn()
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      merge,
      publishInvalidation: vi.fn(),
    })
    await service.plan(ROOT, { kind: 'batch-merge-out', branchWorkspaceId: 'ws-1' })

    for (const targets of [
      [{ repositoryName: 'missing', destinationBranch: 'main' }],
      [{ repositoryName: 'api', destinationBranch: 'feature/a' }],
      [{ repositoryName: 'web', destinationBranch: 'main' }],
    ]) {
      await expect(
        service.execute(ROOT, {
          kind: 'batch-merge-out',
          planToken: plan.token,
          mode: 'merge',
          targets,
        }),
      ).resolves.toMatchObject({ ok: false })
    }
    expect(merge).not.toHaveBeenCalled()
  })

  test('binds failed merge retries to the original selected members and destinations', async () => {
    const plan = mergeOutPlan()
    const merge = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, message: 'api merged' })
      .mockResolvedValueOnce({ ok: false, message: 'web failed' })
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      merge,
      publishInvalidation: vi.fn(),
    })
    await service.plan(ROOT, { kind: 'batch-merge-out', branchWorkspaceId: 'ws-1' })
    const original = {
      kind: 'batch-merge-out' as const,
      planToken: plan.token,
      mode: 'merge' as const,
      targets: mergeOutTargets(),
    }
    await expect(service.execute(ROOT, original)).resolves.toMatchObject({ ok: false })

    await expect(
      service.execute(ROOT, {
        ...original,
        targets: mergeOutTargets([
          ['api', 'release/v2'],
          ['web', 'main'],
        ]),
      }),
    ).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
    expect(merge).toHaveBeenCalledTimes(2)
  })

  test('binds failed merge retries to the original pipeline mode', async () => {
    const plan = mergeOutPlan()
    const merge = vi.fn().mockResolvedValueOnce({ ok: false, message: 'merge failed' })
    const pull = vi.fn()
    const push = vi.fn()
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      pull,
      merge,
      push,
      publishInvalidation: vi.fn(),
    })
    await service.plan(ROOT, { kind: 'batch-merge-out', branchWorkspaceId: 'ws-1' })
    const original = {
      kind: 'batch-merge-out' as const,
      planToken: plan.token,
      mode: 'merge' as const,
      targets: mergeOutTargets(),
    }
    await expect(service.execute(ROOT, original)).resolves.toMatchObject({ ok: false })

    await expect(service.execute(ROOT, { ...original, mode: 'pull-merge-push' })).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
    expect(pull).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    expect(merge).toHaveBeenCalledTimes(1)
  })

  test('checks pull-merge-push readiness on the selected destination only', async () => {
    const plan = mergeOutPlan()
    const pull = vi.fn()
    const merge = vi.fn()
    const push = vi.fn()
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      pull,
      merge,
      push,
      publishInvalidation: vi.fn(),
    })
    await service.plan(ROOT, { kind: 'batch-merge-out', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-merge-out',
        planToken: plan.token,
        mode: 'pull-merge-push',
        targets: [{ repositoryName: 'api', destinationBranch: 'integration' }],
      }),
    ).resolves.toEqual({
      ok: false,
      message: 'workspace.branch-workspace.git-action.destination-upstream-required',
    })
    expect(pull).not.toHaveBeenCalled()
    expect(merge).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  test('returns an existing merge-out destination worktree as the retained conflict site', async () => {
    const plan = mergeOutPlan()
    const createWorktree = vi.fn()
    const removeWorktree = vi.fn()
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      createWorktree,
      removeWorktree,
      merge: vi.fn(async () => ({
        ok: false as const,
        message: 'conflict',
        reason: 'merge-conflict' as const,
      })),
      publishInvalidation: vi.fn(),
    })
    await service.plan(ROOT, { kind: 'batch-merge-out', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-merge-out',
        planToken: plan.token,
        mode: 'merge',
        targets: [{ repositoryName: 'api', destinationBranch: 'main' }],
      }),
    ).resolves.toMatchObject({
      ok: false,
      members: [
        {
          repositoryName: 'api',
          phase: 'failed',
          step: 'merge',
          reason: 'merge-conflict',
          conflictWorktree: { branch: 'main', path: '/workspace/api' },
        },
        { repositoryName: 'web', phase: 'not-started' },
      ],
    })
    expect(createWorktree).not.toHaveBeenCalled()
    expect(removeWorktree).not.toHaveBeenCalled()
  })

  test('creates and removes an application temporary worktree for an unchecked-out destination', async () => {
    const plan = mergeOutPlan()
    const createWorktree = vi.fn(
      async (
        _repoId: string,
        _input: CreateWorktreeInput,
        _bootstrap: WorktreeBootstrapDecision,
        _signal?: AbortSignal,
        _sourceToken?: string,
      ) => ({ ok: true, message: 'created' }),
    )
    const removeWorktree = vi.fn(async () => ({ ok: true, message: 'removed' }))
    const merge = vi.fn(async () => ({ ok: true, message: 'merged' }))
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      createWorktree,
      removeWorktree,
      merge,
      publishInvalidation: vi.fn(),
    })
    await service.plan(ROOT, { kind: 'batch-merge-out', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-merge-out',
        planToken: plan.token,
        mode: 'merge',
        targets: [{ repositoryName: 'api', destinationBranch: 'staging' }],
      }),
    ).resolves.toMatchObject({ ok: true })

    const temporaryPath = createWorktree.mock.calls[0]?.[1].worktreePath
    expect(temporaryPath).toContain('/workspace/.hobgoblin-batch-merge-api-')
    expect(createWorktree).toHaveBeenCalledWith(
      '/workspace/api',
      { worktreePath: temporaryPath, mode: { kind: 'existingBranch', branch: 'staging' } },
      { kind: 'skip' },
      expect.any(AbortSignal),
    )
    expect(merge).toHaveBeenCalledWith('/workspace/api', temporaryPath, 'feature/a', expect.any(AbortSignal))
    expect(removeWorktree).toHaveBeenCalledWith(
      '/workspace/api',
      {
        branch: 'staging',
        worktreePath: temporaryPath,
        alsoDeleteBranch: false,
        forceRemoveWorktree: true,
      },
      undefined,
    )
  })

  test.each([
    ['merge conflict', { ok: false, message: 'conflict', reason: 'merge-conflict' as const }],
    ['cancellation', { ok: false, message: 'cancelled' }],
  ])('cleans an application temporary worktree after %s', async (_label, mergeResult) => {
    const plan = mergeOutPlan()
    const removeWorktree = vi.fn(async () => ({ ok: true, message: 'removed' }))
    let service: ReturnType<typeof createBranchWorkspaceGitActionWriteService>
    service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      createWorktree: vi.fn(async () => ({ ok: true, message: 'created' })),
      removeWorktree,
      merge: vi.fn(async () => {
        if (mergeResult.message === 'cancelled') service.abort(ROOT)
        return mergeResult
      }),
      publishInvalidation: vi.fn(),
    })
    await service.plan(ROOT, { kind: 'batch-merge-out', branchWorkspaceId: 'ws-1' })

    const result = await service.execute(ROOT, {
      kind: 'batch-merge-out',
      planToken: plan.token,
      mode: 'merge',
      targets: [{ repositoryName: 'api', destinationBranch: 'staging' }],
    })
    expect(result).toMatchObject({ ok: false })
    if ('members' in result) {
      expect(result.members.find((member) => member.repositoryName === 'api')).not.toHaveProperty('conflictWorktree')
    }
    expect(removeWorktree).toHaveBeenCalledTimes(1)
  })

  test('never creates or removes an ordinary selected destination worktree', async () => {
    const plan = mergeOutPlan()
    const createWorktree = vi.fn()
    const removeWorktree = vi.fn()
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      createWorktree,
      removeWorktree,
      merge: vi.fn(async () => ({ ok: true, message: 'merged' })),
      publishInvalidation: vi.fn(),
    })
    await service.plan(ROOT, { kind: 'batch-merge-out', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-merge-out',
        planToken: plan.token,
        mode: 'merge',
        targets: [{ repositoryName: 'api', destinationBranch: 'main' }],
      }),
    ).resolves.toMatchObject({ ok: true })
    expect(createWorktree).not.toHaveBeenCalled()
    expect(removeWorktree).not.toHaveBeenCalled()
  })

  test('pulls target branches serially, stops at the first failure, and retries only remaining members', async () => {
    const plan = syncPlan('pull')
    const pull = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, message: 'pulled api' })
      .mockResolvedValueOnce({ ok: false, message: 'web failed' })
      .mockResolvedValueOnce({ ok: true, message: 'pulled web' })
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      pull,
      publishInvalidation: vi.fn(),
    })
    await service.plan(ROOT, { kind: 'pull', branchWorkspaceId: 'ws-1' })
    const input = { kind: 'pull' as const, planToken: plan.token }

    await expect(service.execute(ROOT, input)).resolves.toMatchObject({
      ok: false,
      members: [
        { repositoryName: 'api', phase: 'succeeded' },
        { repositoryName: 'web', phase: 'failed', step: 'pull' },
      ],
    })
    await expect(service.execute(ROOT, input)).resolves.toMatchObject({ ok: true })
    expect(pull.mock.calls.map((call) => call.slice(0, 3))).toEqual([
      ['/workspace/api', 'feature/a', '/workspace/goblin-feature-a/api'],
      ['/workspace/web', 'feature/a', '/workspace/goblin-feature-a/web'],
      ['/workspace/web', 'feature/a', '/workspace/goblin-feature-a/web'],
    ])
  })

  test('pushes every target branch serially', async () => {
    const plan = syncPlan('push')
    const calls: string[] = []
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      push: vi.fn(async (repoId, branch) => {
        calls.push(`${repoId}:${branch}`)
        return { ok: true, message: 'pushed' }
      }),
      publishInvalidation: vi.fn(),
    })
    await service.plan(ROOT, { kind: 'push', branchWorkspaceId: 'ws-1' })

    await expect(service.execute(ROOT, { kind: 'push', planToken: plan.token })).resolves.toMatchObject({ ok: true })
    expect(calls).toEqual(['/workspace/api:feature/a', '/workspace/web:feature/a'])
  })

  test.each(['pull', 'push'] as const)('does not execute an unready %s plan', async (kind) => {
    const plan = syncPlan(kind, false)
    const pull = vi.fn()
    const push = vi.fn()
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      pull,
      push,
      publishInvalidation: vi.fn(),
    })
    await service.plan(ROOT, { kind, branchWorkspaceId: 'ws-1' })

    await expect(service.execute(ROOT, { kind, planToken: plan.token })).resolves.toMatchObject({
      ok: false,
      message:
        kind === 'pull'
          ? 'workspace.branch-workspace.git-action.target-upstream-required'
          : 'workspace.branch-workspace.git-action.remote-required',
    })
    expect(pull).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  test('rejects a batch when any dirty member message is missing before committing', async () => {
    const commit = vi.fn()
    const plan = batchPlan()
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      commit,
      publishInvalidation: vi.fn(),
    })
    await service.plan(ROOT, { kind: 'batch-commit', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-commit',
        planToken: plan.token,
        messages: [{ repositoryName: 'api', message: 'feat: api' }],
      }),
    ).resolves.toEqual({ ok: false, message: 'error.invalid-arguments' })
    expect(commit).not.toHaveBeenCalled()
  })

  test('continues when pulling the selected destination updates its HEAD', async () => {
    const plan = mergeOutPlan()
    const changedPlan = structuredClone(plan)
    if (changedPlan.kind === 'batch-merge-out') changedPlan.members[0]!.destinationBranches[0]!.head = 'changed-head'
    const merge = vi.fn(async () => ({ ok: true as const, message: 'merged' }))
    const push = vi.fn(async () => ({ ok: true as const, message: 'pushed' }))
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi
        .fn(async () => ({ ok: true as const, plan }))
        .mockResolvedValueOnce({ ok: true as const, plan })
        .mockResolvedValueOnce({ ok: true as const, plan: changedPlan }),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      pull: vi.fn(async () => ({ ok: true, message: 'pulled' })),
      merge,
      push,
      publishInvalidation: vi.fn(),
    })
    await service.plan(ROOT, { kind: 'batch-merge-out', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-merge-out',
        planToken: plan.token,
        mode: 'pull-merge-push',
        targets: mergeOutTargets(),
      }),
    ).resolves.toMatchObject({ ok: true })
    expect(merge).toHaveBeenCalledTimes(2)
    expect(push).toHaveBeenCalledTimes(2)
  })

  test('stops after destination pull when source or destination readiness changes before merge', async () => {
    const plan = mergeOutPlan()
    if (plan.kind !== 'batch-merge-out') throw new Error('expected merge plan')
    const sourceDirtyPlan = structuredClone(plan)
    sourceDirtyPlan.members[0]!.ready = false
    sourceDirtyPlan.members[0]!.message = 'workspace.branch-workspace.git-action.target-worktree-dirty'
    const destinationDirtyPlan = structuredClone(plan)
    destinationDirtyPlan.members[0]!.destinationBranches[0]!.ready = false
    destinationDirtyPlan.members[0]!.destinationBranches[0]!.message =
      'workspace.branch-workspace.git-action.destination-worktree-dirty'

    for (const changedPlan of [sourceDirtyPlan, destinationDirtyPlan]) {
      const merge = vi.fn()
      const push = vi.fn()
      const service = createBranchWorkspaceGitActionWriteService({
        buildPlan: vi
          .fn()
          .mockResolvedValueOnce({ ok: true as const, plan })
          .mockResolvedValueOnce({ ok: true as const, plan: changedPlan }),
        validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
        pull: vi.fn(async () => ({ ok: true, message: 'pulled' })),
        merge,
        push,
        publishInvalidation: vi.fn(),
      })
      await service.plan(ROOT, { kind: 'batch-merge-out', branchWorkspaceId: 'ws-1' })

      await expect(
        service.execute(ROOT, {
          kind: 'batch-merge-out',
          planToken: plan.token,
          mode: 'pull-merge-push',
          targets: mergeOutTargets(),
        }),
      ).resolves.toMatchObject({
        ok: false,
        message: 'workspace.branch-workspace.git-action.repository-changed',
      })
      expect(merge).not.toHaveBeenCalled()
      expect(push).not.toHaveBeenCalled()
    }
  })

  test('stops after destination pull when the target branch changed before merge', async () => {
    const plan = mergeOutPlan()
    const changedPlan = structuredClone(plan)
    if (changedPlan.kind === 'batch-merge-out') changedPlan.members[0]!.targetHead = 'changed-target-head'
    const merge = vi.fn()
    const push = vi.fn()
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi
        .fn()
        .mockResolvedValueOnce({ ok: true as const, plan })
        .mockResolvedValueOnce({ ok: true as const, plan: changedPlan }),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      pull: vi.fn(async () => ({ ok: true, message: 'pulled' })),
      merge,
      push,
      publishInvalidation: vi.fn(),
    })
    await service.plan(ROOT, { kind: 'batch-merge-out', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-merge-out',
        planToken: plan.token,
        mode: 'pull-merge-push',
        targets: mergeOutTargets(),
      }),
    ).resolves.toMatchObject({
      ok: false,
      members: [
        { repositoryName: 'api', phase: 'failed', step: 'merge' },
        { repositoryName: 'web', phase: 'not-started' },
      ],
    })
    expect(merge).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })
})
