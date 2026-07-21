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
      pull: vi.fn(async (_repoId, branch) => {
        calls.push(`pull:${branch}`)
        return { ok: true, message: 'pulled' }
      }),
      merge: vi.fn(async (_repoId, _worktreePath, branch) => {
        calls.push(`merge:${branch}`)
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
    expect(calls).toEqual(['pull:main', 'merge:feature/a', 'push:main', 'pull:main', 'merge:feature/a', 'push:main'])
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

  test('stops after pull when the target branch HEAD changed before merge', async () => {
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
