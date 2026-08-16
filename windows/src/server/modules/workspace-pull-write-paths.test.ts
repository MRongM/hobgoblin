import { describe, expect, test, vi } from 'vitest'
import { createWorkspacePullService } from '#/server/modules/workspace-pull-write-paths.ts'
import type { WorkspacePullPlan } from '#/shared/workspace-pull.ts'

const ROOT = '/workspace'

describe('workspace pull write service', () => {
  test('pulls sequentially and retries without repeating completed repositories', async () => {
    const planned = plan()
    let webAttempts = 0
    const pullBranch = vi.fn(async (repoId: string) => {
      if (repoId.endsWith('/web') && webAttempts++ === 0) return { ok: false, message: 'busy' }
      return { ok: true, message: 'pulled' }
    })
    const service = createWorkspacePullService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan: planned })),
      validateRetry: vi.fn(async () => ({ ok: true as const })),
      pullBranch,
    })
    await service.plan(ROOT)

    const first = await service.execute(ROOT, { planToken: planned.token })
    const retry = await service.execute(ROOT, { planToken: planned.token })

    expect(first.members.map((member) => member.phase)).toEqual(['succeeded', 'failed'])
    expect(retry.members.map((member) => member.phase)).toEqual(['satisfied', 'succeeded'])
    expect(pullBranch.mock.calls.map(([repoId]) => repoId)).toEqual([
      '/workspace/api',
      '/workspace/web',
      '/workspace/web',
    ])
  })

  test('cancels the active pull and never depends on AGENTS synchronization', async () => {
    const planned = plan()
    const pullBranch = vi.fn(
      async (_repoId: string, _branch: string, _path?: string, signal?: AbortSignal) =>
        await new Promise<{ ok: boolean; message: string }>((resolve) => {
          signal?.addEventListener('abort', () => resolve({ ok: false, message: 'cancelled' }), { once: true })
        }),
    )
    const service = createWorkspacePullService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan: planned })),
      pullBranch,
    })
    await service.plan(ROOT)
    const running = service.execute(ROOT, { planToken: planned.token })
    await vi.waitFor(() => expect(pullBranch).toHaveBeenCalledTimes(1))

    expect(service.abort(ROOT)).toBe(true)
    await expect(running).resolves.toMatchObject({ ok: false, message: 'cancelled' })
    expect('syncAgents' in service).toBe(false)
  })
})

function plan(): WorkspacePullPlan {
  return {
    token: 'sha256:pull',
    rootId: ROOT,
    members: [
      { repoId: '/workspace/api', branch: 'main', worktreePath: '/workspace/api' },
      { repoId: '/workspace/web', branch: 'trunk', worktreePath: '/workspace/web' },
    ],
  }
}
