import { describe, expect, test, vi } from 'vitest'
import { createWorkspaceWorktreeService } from '#/server/modules/workspace-worktree-write-paths.ts'
import type { WorkspaceWorktreePlan } from '#/shared/workspace-worktrees.ts'

const ROOT = '/workspace'

function plan(operation: 'create' | 'remove' | 'pull', token = 'sha256:plan'): WorkspaceWorktreePlan {
  return {
    token,
    rootId: ROOT,
    operation,
    branch: operation === 'pull' ? '' : 'feature/a',
    members:
      operation === 'create'
        ? [
            {
              repoId: '/workspace/api',
              branch: 'feature/a',
              baseRef: 'main',
              worktreePath: '/workspace/api-feature-a',
              worktreeBootstrap: { kind: 'skip' },
              confirmationRequired: false,
            },
            {
              repoId: '/workspace/web',
              branch: 'feature/a',
              baseRef: 'trunk',
              worktreePath: '/workspace/web-feature-a',
              worktreeBootstrap: { kind: 'skip' },
              confirmationRequired: false,
            },
          ]
        : operation === 'remove'
          ? [
              {
                repoId: '/workspace/api',
                branch: 'feature/a',
                worktreePath: '/workspace/api-feature-a',
              },
              {
                repoId: '/workspace/web',
                branch: 'feature/a',
                worktreePath: '/workspace/web-feature-a',
              },
            ]
          : [
              { repoId: '/workspace/api', branch: 'main', worktreePath: '/workspace/api' },
              { repoId: '/workspace/web', branch: 'trunk', worktreePath: '/workspace/web' },
            ],
  }
}

describe('workspace worktree write service', () => {
  test('executes creation sequentially in plan order', async () => {
    const planned = plan('create')
    const createWorktree = vi.fn(async (_repoId: string) => ({ ok: true, message: 'created' }))
    const service = createWorkspaceWorktreeService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan: planned })),
      createWorktree,
      removeWorktree: vi.fn(),
    })
    await service.plan(ROOT, { operation: 'create', branch: 'feature/a', baseBranch: 'main' })

    const result = await service.execute(ROOT, { planToken: planned.token, approveBootstrap: false })

    expect(result.ok).toBe(true)
    expect(createWorktree.mock.calls.map(([repoId]) => repoId)).toEqual(['/workspace/api', '/workspace/web'])
    expect(result.members.map((member) => member.phase)).toEqual(['succeeded', 'succeeded'])
  })

  test('stops on failure without rollback and retries completed members as satisfied', async () => {
    const planned = plan('remove')
    planned.removalOptions = { alsoDeleteBranch: true, alsoDeleteUpstream: true }
    let webAttempts = 0
    const removeWorktree = vi.fn(async (repoId: string, _input: unknown) => {
      if (repoId === '/workspace/web' && webAttempts++ === 0) return { ok: false, message: 'busy' }
      return { ok: true, message: 'removed' }
    })
    const service = createWorkspaceWorktreeService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan: planned })),
      createWorktree: vi.fn(),
      removeWorktree,
      validateRetry: vi.fn(async () => ({ ok: true as const })),
    })
    await service.plan(ROOT, {
      operation: 'remove',
      branch: 'feature/a',
      alsoDeleteBranch: true,
      alsoDeleteUpstream: true,
    })

    const first = await service.execute(ROOT, { planToken: planned.token, approveBootstrap: false })
    const retry = await service.execute(ROOT, { planToken: planned.token, approveBootstrap: false })

    expect(first.members.map((member) => member.phase)).toEqual(['succeeded', 'failed'])
    expect(retry.members.map((member) => member.phase)).toEqual(['satisfied', 'succeeded'])
    expect(removeWorktree.mock.calls.map(([repoId]) => repoId)).toEqual([
      '/workspace/api',
      '/workspace/web',
      '/workspace/web',
    ])
    expect(removeWorktree.mock.calls[0]?.[1]).toEqual({
      branch: 'feature/a',
      worktreePath: '/workspace/api-feature-a',
      alsoDeleteBranch: true,
      forceDeleteBranch: true,
      alsoDeleteUpstream: true,
    })
  })

  test('pulls each repository root branch sequentially in configured order', async () => {
    const planned = plan('pull')
    const pullBranch = vi.fn(async (_repoId: string, _branch: string, _worktreePath?: string) => ({
      ok: true,
      message: 'pulled',
    }))
    const service = createWorkspaceWorktreeService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan: planned })),
      createWorktree: vi.fn(),
      removeWorktree: vi.fn(),
      pullBranch,
    })
    await service.plan(ROOT, { operation: 'pull' })

    const result = await service.execute(ROOT, { planToken: planned.token, approveBootstrap: false })

    expect(result.ok).toBe(true)
    expect(pullBranch.mock.calls.map(([repoId, branch, worktreePath]) => [repoId, branch, worktreePath])).toEqual([
      ['/workspace/api', 'main', '/workspace/api'],
      ['/workspace/web', 'trunk', '/workspace/web'],
    ])
  })

  test('rejects stale plans and unapproved bootstrap operations before writes', async () => {
    const planned = plan('create')
    planned.members[0]!.confirmationRequired = true
    planned.members[0]!.worktreeBootstrap = {
      kind: 'run',
      configHash: 'sha256:bootstrap',
      configTrusted: false,
    }
    const createWorktree = vi.fn()
    const buildPlan = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, plan: planned })
      .mockResolvedValueOnce({ ok: true, plan: plan('create', 'sha256:changed') })
    const service = createWorkspaceWorktreeService({ buildPlan, createWorktree, removeWorktree: vi.fn() })
    await service.plan(ROOT, { operation: 'create', branch: 'feature/a', baseBranch: 'main' })

    await expect(service.execute(ROOT, { planToken: planned.token, approveBootstrap: true })).resolves.toMatchObject({
      ok: false,
      message: 'workspace.worktree.plan-stale',
    })
    expect(createWorktree).not.toHaveBeenCalled()

    buildPlan.mockResolvedValue({ ok: true, plan: planned })
    await service.plan(ROOT, { operation: 'create', branch: 'feature/a', baseBranch: 'main' })
    await expect(service.execute(ROOT, { planToken: planned.token, approveBootstrap: false })).resolves.toMatchObject({
      ok: false,
      message: 'workspace.worktree.bootstrap-confirmation-required',
    })
    expect(createWorktree).not.toHaveBeenCalled()
  })

  test('allows only one active operation and forwards cancellation', async () => {
    const planned = plan('create')
    let resolveCreate: ((value: { ok: boolean; message: string }) => void) | undefined
    const createWorktree = vi.fn(
      async (_repoId: string, _input: unknown, _bootstrap: unknown, signal?: AbortSignal) =>
        await new Promise<{ ok: boolean; message: string }>((resolve) => {
          resolveCreate = resolve
          signal?.addEventListener('abort', () => resolve({ ok: false, message: 'cancelled' }), { once: true })
        }),
    )
    const service = createWorkspaceWorktreeService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan: planned })),
      createWorktree,
      removeWorktree: vi.fn(),
    })
    await service.plan(ROOT, { operation: 'create', branch: 'feature/a', baseBranch: 'main' })
    const running = service.execute(ROOT, { planToken: planned.token, approveBootstrap: false })
    await vi.waitFor(() => expect(createWorktree).toHaveBeenCalledTimes(1))

    await expect(service.execute(ROOT, { planToken: planned.token, approveBootstrap: false })).resolves.toMatchObject({
      ok: false,
      message: 'workspace.worktree.operation-in-progress',
    })
    expect(service.abort(ROOT)).toBe(true)
    await expect(running).resolves.toMatchObject({ ok: false })
    resolveCreate?.({ ok: true, message: 'late' })
  })
})
