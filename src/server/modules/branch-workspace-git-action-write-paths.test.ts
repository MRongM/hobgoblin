import { describe, expect, test, vi } from 'vitest'
import { createBranchWorkspaceGitActionWriteService } from '#/server/modules/branch-workspace-git-action-write-paths.ts'
import type { BranchWorkspaceGitActionPlan } from '#/shared/branch-workspace-git-actions.ts'

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

function mergePlan(): BranchWorkspaceGitActionPlan {
  return {
    kind: 'merge-back',
    token: 'sha256:merge',
    rootId: ROOT,
    branchWorkspaceId: 'ws-1',
    pullMergePushReady: true,
    members: ['api', 'web'].map((repositoryName) => ({
      repositoryName,
      repoId: `${ROOT}/${repositoryName}`,
      targetBranch: 'feature/a',
      targetWorktreePath: `${ROOT}/goblin-feature-a/${repositoryName}`,
      targetHead: 'target-head',
      baseBranch: 'main',
      baseWorktreePath: `${ROOT}/${repositoryName}`,
      baseHead: 'base-head',
      mergeSatisfied: false,
      pullMergePushReady: true,
      fingerprint: `sha256:${repositoryName}`,
    })),
  }
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

  test('runs pull, merge, and push as a complete serial pipeline for each repository', async () => {
    const calls: string[] = []
    const plan = mergePlan()
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
    await service.plan(ROOT, { kind: 'merge-back', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, { kind: 'merge-back', planToken: plan.token, mode: 'pull-merge-push' }),
    ).resolves.toMatchObject({ ok: true })
    expect(calls).toEqual([
      'pull:main:/workspace/api',
      'merge:feature/a:/workspace/api',
      'push:main',
      'pull:main:/workspace/web',
      'merge:feature/a:/workspace/web',
      'push:main',
    ])
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

  test('continues when pulling the base branch updates its HEAD', async () => {
    const plan = mergePlan()
    const changedPlan = structuredClone(plan)
    if (changedPlan.kind === 'merge-back') changedPlan.members[0]!.baseHead = 'changed-base-head'
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
    await service.plan(ROOT, { kind: 'merge-back', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, { kind: 'merge-back', planToken: plan.token, mode: 'pull-merge-push' }),
    ).resolves.toMatchObject({ ok: true })
    expect(merge).toHaveBeenCalledTimes(2)
    expect(push).toHaveBeenCalledTimes(2)
  })

  test('stops after base pull when the target branch changed before merge', async () => {
    const plan = mergePlan()
    const changedPlan = structuredClone(plan)
    if (changedPlan.kind === 'merge-back') changedPlan.members[0]!.targetHead = 'changed-target-head'
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
    await service.plan(ROOT, { kind: 'merge-back', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, { kind: 'merge-back', planToken: plan.token, mode: 'pull-merge-push' }),
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
