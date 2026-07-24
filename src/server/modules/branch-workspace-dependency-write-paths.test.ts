import { describe, expect, test, vi } from 'vitest'
import { createBranchWorkspaceDependencyWriteService } from '#/server/modules/branch-workspace-dependency-write-paths.ts'
import type {
  BranchWorkspaceDependencyAddPlan,
  BranchWorkspaceDependencyPlanRequest,
  BranchWorkspaceDependencyRemovePlan,
} from '#/shared/branch-workspace-dependencies.ts'

const ROOT = '/workspace'
const TARGET_ROOT = '/workspace/hobgoblin-feature-auth'
const addRequest: BranchWorkspaceDependencyPlanRequest = {
  operation: 'add',
  branchWorkspaceId: 'branch-1',
  entries: [
    { name: '.env', mode: 'copy' },
    { name: 'config', mode: 'symlink' },
  ],
}
const removeRequest: BranchWorkspaceDependencyPlanRequest = {
  operation: 'remove',
  branchWorkspaceId: 'branch-1',
  names: ['config'],
}

describe('branch workspace dependency write service', () => {
  test('executes copy and symlink additions sequentially and publishes one invalidation', async () => {
    const events: string[] = []
    const plan = addPlan()
    const buildPlan = vi.fn(async () => ({ ok: true as const, plan }))
    const copyEntry = vi.fn(async () => void events.push('copy:.env'))
    const materializeSymlink = vi.fn(async () => void events.push('symlink:config'))
    const publishInvalidation = vi.fn()
    const service = createBranchWorkspaceDependencyWriteService({
      buildPlan,
      copyEntry,
      materializeSymlink,
      publishInvalidation,
    })

    await expect(service.plan(ROOT, addRequest)).resolves.toEqual({ ok: true, plan })
    await expect(
      service.execute(ROOT, { planToken: plan.token, approvals: [], sourceToken: 'renderer-1' }),
    ).resolves.toEqual({
      ok: true,
      operation: 'add',
      branchWorkspaceId: 'branch-1',
      completedNames: ['.env', 'config'],
    })

    expect(events).toEqual(['copy:.env', 'symlink:config'])
    expect(copyEntry).toHaveBeenCalledWith(ROOT, '/workspace/.env', `${TARGET_ROOT}/.env`, expect.any(AbortSignal))
    expect(materializeSymlink).toHaveBeenCalledWith(
      ROOT,
      '/workspace/config',
      `${TARGET_ROOT}/config`,
      expect.any(AbortSignal),
    )
    expect(publishInvalidation).toHaveBeenCalledWith(ROOT, 'renderer-1')
  })

  test('requires every approval in the previewed plan', async () => {
    const plan = addPlan({ requiredApprovals: ['outside-root-source'] })
    const copyEntry = vi.fn()
    const service = createBranchWorkspaceDependencyWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      copyEntry,
    })
    await service.plan(ROOT, addRequest)

    await expect(service.execute(ROOT, { planToken: plan.token, approvals: [] })).resolves.toEqual({
      ok: false,
      message: 'workspace.branch-workspace.dependency.approval-required',
      operation: 'add',
      branchWorkspaceId: 'branch-1',
      completedNames: [],
    })
    expect(copyEntry).not.toHaveBeenCalled()
  })

  test('rejects a plan whose live rebuild has changed', async () => {
    const plan = addPlan()
    const changed = addPlan({ token: 'sha256:changed' })
    const buildPlan = vi
      .fn()
      .mockResolvedValueOnce({ ok: true as const, plan })
      .mockResolvedValueOnce({ ok: true as const, plan: changed })
    const copyEntry = vi.fn()
    const service = createBranchWorkspaceDependencyWriteService({ buildPlan, copyEntry })
    await service.plan(ROOT, addRequest)

    await expect(service.execute(ROOT, { planToken: plan.token, approvals: [] })).resolves.toEqual({
      ok: false,
      message: 'workspace.branch-workspace.dependency.plan-stale',
      operation: 'add',
      branchWorkspaceId: 'branch-1',
      completedNames: [],
    })
    expect(copyEntry).not.toHaveBeenCalled()
  })

  test('removes the exact previewed target', async () => {
    const plan = removePlan()
    const removeEntry = vi.fn(async () => undefined)
    const service = createBranchWorkspaceDependencyWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      removeEntry,
    })
    await service.plan(ROOT, removeRequest)

    await expect(service.execute(ROOT, { planToken: plan.token, approvals: [] })).resolves.toMatchObject({
      ok: true,
      operation: 'remove',
      completedNames: ['config'],
    })
    expect(removeEntry).toHaveBeenCalledWith(ROOT, `${TARGET_ROOT}/config`, expect.any(AbortSignal))
  })

  test('stops on the first failure, reports partial completion, and still invalidates', async () => {
    const plan = addPlan()
    const copyEntry = vi.fn(async () => undefined)
    const materializeSymlink = vi.fn(async () => {
      throw new Error('link failed')
    })
    const publishInvalidation = vi.fn()
    const service = createBranchWorkspaceDependencyWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      copyEntry,
      materializeSymlink,
      publishInvalidation,
    })
    await service.plan(ROOT, addRequest)

    await expect(service.execute(ROOT, { planToken: plan.token, approvals: [] })).resolves.toEqual({
      ok: false,
      message: 'link failed',
      operation: 'add',
      branchWorkspaceId: 'branch-1',
      completedNames: ['.env'],
    })
    expect(publishInvalidation).toHaveBeenCalledWith(ROOT)
  })

  test('aborts the active operation without publishing when nothing completed', async () => {
    const plan = addPlan({ entries: [addPlan().entries[0]!] })
    const copyEntry = vi.fn(
      async (_rootId: string, _sourcePath: string, _targetPath: string, signal?: AbortSignal) =>
        await new Promise<void>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
        }),
    )
    const publishInvalidation = vi.fn()
    const service = createBranchWorkspaceDependencyWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      copyEntry,
      publishInvalidation,
    })
    await service.plan(ROOT, { ...addRequest, entries: [addRequest.entries[0]!] })

    const running = service.execute(ROOT, { planToken: plan.token, approvals: [] })
    await vi.waitFor(() => expect(copyEntry).toHaveBeenCalledOnce())
    expect(service.isActive(ROOT)).toBe(true)
    expect(service.abort(ROOT)).toBe(true)

    await expect(running).resolves.toEqual({
      ok: false,
      message: 'cancelled',
      operation: 'add',
      branchWorkspaceId: 'branch-1',
      completedNames: [],
    })
    expect(service.isActive(ROOT)).toBe(false)
    expect(publishInvalidation).not.toHaveBeenCalled()
  })
})

function addPlan(overrides: Partial<BranchWorkspaceDependencyAddPlan> = {}): BranchWorkspaceDependencyAddPlan {
  return {
    token: 'sha256:add',
    rootId: ROOT,
    operation: 'add',
    branchWorkspaceId: 'branch-1',
    requiredApprovals: [],
    entries: [
      {
        name: '.env',
        mode: 'copy',
        sourcePath: '/workspace/.env',
        sourceKind: 'file',
        targetPath: `${TARGET_ROOT}/.env`,
        outsideRoot: false,
      },
      {
        name: 'config',
        mode: 'symlink',
        sourcePath: '/workspace/config',
        sourceKind: 'directory',
        targetPath: `${TARGET_ROOT}/config`,
        outsideRoot: false,
      },
    ],
    ...overrides,
  }
}

function removePlan(overrides: Partial<BranchWorkspaceDependencyRemovePlan> = {}): BranchWorkspaceDependencyRemovePlan {
  return {
    token: 'sha256:remove',
    rootId: ROOT,
    operation: 'remove',
    branchWorkspaceId: 'branch-1',
    requiredApprovals: [],
    entries: [
      {
        name: 'config',
        sourcePath: '/workspace/config',
        targetPath: `${TARGET_ROOT}/config`,
        targetKind: 'directory',
        fingerprint: 'fingerprint:config',
      },
    ],
    ...overrides,
  }
}
