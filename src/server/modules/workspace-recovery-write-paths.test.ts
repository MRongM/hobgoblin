import { describe, expect, test, vi } from 'vitest'
import {
  createWorkspaceRecoveryWriteService,
  type WorkspaceRecoveryWriteDependencies,
} from '#/server/modules/workspace-recovery-write-paths.ts'
import type { BranchWorkspaceWriteService } from '#/server/modules/branch-workspace-write-paths.ts'
import type { BranchWorkspaceManifest } from '#/shared/branch-workspaces.ts'
import type { WorkspaceDiscoveryResult } from '#/shared/workspace.ts'

const ROOT = '/workspace'

function manifest(id: string, branch: string): BranchWorkspaceManifest {
  return {
    id,
    rootId: ROOT,
    branch,
    directoryName: `hobgoblin-${id}`,
    path: `${ROOT}/hobgoblin-${id}`,
    repositories: [],
    auxiliaryEntries: [],
  }
}

function discovery(): Extract<WorkspaceDiscoveryResult, { ok: true }> {
  return {
    ok: true,
    rootId: ROOT,
    repositories: [{ id: `${ROOT}/api`, name: 'api' }],
    candidates: [
      { id: `${ROOT}/api`, name: 'api', selected: true, available: true },
      { id: `${ROOT}/web`, name: 'web', selected: false, available: true },
    ],
    configuration: { kind: 'ready', config: { repo: ['api'] } },
    skipped: [],
  }
}

function fixture(items: BranchWorkspaceManifest[] = [manifest('one', 'feature/one')]) {
  const branchService = {
    plan: vi.fn<BranchWorkspaceWriteService['plan']>(),
    execute: vi.fn<BranchWorkspaceWriteService['execute']>(),
    abort: vi.fn(() => false),
    isActive: vi.fn(() => false),
    reorder: vi.fn(async () => ({ ok: true as const })),
  } satisfies BranchWorkspaceWriteService
  const inspectConfigCleanup = vi.fn<NonNullable<WorkspaceRecoveryWriteDependencies['inspectConfigCleanup']>>(
    async () => ({
      rootId: ROOT,
      scope: 'project' as const,
      fingerprint: 'sha256:config',
    }),
  )
  const cleanupConfig = vi.fn<NonNullable<WorkspaceRecoveryWriteDependencies['cleanupConfig']>>(async () => undefined)
  const discover = vi.fn<NonNullable<WorkspaceRecoveryWriteDependencies['discover']>>(async () => discovery())
  const readManifests = vi.fn<NonNullable<WorkspaceRecoveryWriteDependencies['readManifests']>>(async () => ({
    kind: 'ready' as const,
    manifests: items,
  }))
  const discardRecords = vi.fn<NonNullable<WorkspaceRecoveryWriteDependencies['discardRecords']>>(async () => undefined)
  const importWorkspace = vi.fn<NonNullable<WorkspaceRecoveryWriteDependencies['importWorkspace']>>(async () =>
    discovery(),
  )
  const publishInvalidation = vi.fn<NonNullable<WorkspaceRecoveryWriteDependencies['publishInvalidation']>>()
  const service = createWorkspaceRecoveryWriteService({
    branchService,
    inspectConfigCleanup,
    cleanupConfig,
    discover,
    readManifests,
    discardRecords,
    importWorkspace,
    publishInvalidation,
  })
  return {
    service,
    branchService,
    inspectConfigCleanup,
    cleanupConfig,
    discover,
    readManifests,
    discardRecords,
    importWorkspace,
    publishInvalidation,
  }
}

describe('workspace recovery write service', () => {
  test('composes cleanup disclosure, repository discovery, and registration-only cleanup plans', async () => {
    const items = [manifest('one', 'feature/one'), manifest('two', 'feature/two')]
    const state = fixture(items)
    state.inspectConfigCleanup.mockResolvedValue({
      rootId: ROOT,
      scope: 'registry-reset',
      fingerprint: 'sha256:config',
    })
    const result = await state.service.plan(ROOT)

    expect(result).toMatchObject({
      ok: true,
      plan: {
        rootId: ROOT,
        cleanupScope: 'registry-reset',
        configuredRepositoryNames: ['api'],
        discoveredRepositoryNames: ['api', 'web'],
        branchWorkspaces: [
          { id: 'one', mode: 'record-only', requiredApprovals: [] },
          { id: 'two', mode: 'record-only', requiredApprovals: [] },
        ],
      },
    })
    if (result.ok) expect(result.plan.token).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(state.branchService.plan).not.toHaveBeenCalled()
  })

  test('rejects a stale configuration fingerprint before destructive work', async () => {
    const state = fixture()
    const planned = await state.service.plan(ROOT)
    if (!planned.ok) throw new Error('expected plan')
    state.inspectConfigCleanup.mockResolvedValueOnce({
      rootId: ROOT,
      scope: 'project',
      fingerprint: 'sha256:changed',
    })

    await expect(state.service.execute(ROOT, { planToken: planned.plan.token })).resolves.toEqual({
      ok: false,
      message: 'workspace.recovery.plan-stale',
    })
    expect(state.branchService.execute).not.toHaveBeenCalled()
    expect(state.discardRecords).not.toHaveBeenCalled()
    expect(state.cleanupConfig).not.toHaveBeenCalled()
    expect(state.importWorkspace).not.toHaveBeenCalled()
  })

  test('rejects a changed branch workspace registry before destructive work', async () => {
    const state = fixture()
    const planned = await state.service.plan(ROOT)
    if (!planned.ok) throw new Error('expected plan')
    state.readManifests.mockResolvedValueOnce({
      kind: 'ready',
      manifests: [manifest('two', 'feature/two')],
    })

    await expect(state.service.execute(ROOT, { planToken: planned.plan.token })).resolves.toEqual({
      ok: false,
      message: 'workspace.recovery.plan-stale',
    })
    expect(state.branchService.execute).not.toHaveBeenCalled()
    expect(state.discardRecords).not.toHaveBeenCalled()
    expect(state.cleanupConfig).not.toHaveBeenCalled()
    expect(state.importWorkspace).not.toHaveBeenCalled()
  })

  test('unregisters folders sequentially, then cleans configuration and imports again', async () => {
    const items = [manifest('one', 'feature/one'), manifest('two', 'feature/two')]
    const state = fixture(items)
    const events: string[] = []
    state.discardRecords.mockImplementation(async (_rootId, ids) => {
      events.push(...ids.map((id) => `unregister:${id}`))
    })
    state.cleanupConfig.mockImplementation(async () => {
      events.push('cleanup')
    })
    state.importWorkspace.mockImplementation(async () => {
      events.push('import')
      return discovery()
    })
    const planned = await state.service.plan(ROOT)
    if (!planned.ok) throw new Error('expected plan')

    const result = await state.service.execute(ROOT, {
      planToken: planned.plan.token,
      sourceToken: 'workspace_recovery_1',
    })

    expect(result).toMatchObject({
      ok: true,
      outcome: 'completed',
      branches: [
        { id: 'one', outcome: 'record-removed' },
        { id: 'two', outcome: 'record-removed' },
      ],
    })
    expect(state.branchService.plan).not.toHaveBeenCalled()
    expect(state.branchService.execute).not.toHaveBeenCalled()
    expect(events).toEqual(['unregister:one', 'unregister:two', 'cleanup', 'import'])
    expect(state.importWorkspace).toHaveBeenCalledWith(ROOT, { sourceToken: 'workspace_recovery_1' })
    expect(state.publishInvalidation).toHaveBeenCalledWith(ROOT, 'workspace_recovery_1')
  })

  test('does not discard records while another branch workspace operation is active', async () => {
    const state = fixture()
    state.branchService.isActive.mockReturnValue(true)

    await expect(state.service.plan(ROOT)).resolves.toEqual({
      ok: false,
      message: 'workspace.recovery.operation-in-progress',
    })
    expect(state.discardRecords).not.toHaveBeenCalled()
  })

  test('cancellation during unregistration preserves the remaining records and configuration', async () => {
    const state = fixture([manifest('one', 'feature/one'), manifest('two', 'feature/two')])
    let finish: (() => void) | undefined
    state.discardRecords.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve
      }),
    )
    const planned = await state.service.plan(ROOT)
    if (!planned.ok) throw new Error('expected plan')

    const executing = state.service.execute(ROOT, { planToken: planned.plan.token })
    await vi.waitFor(() => expect(state.discardRecords).toHaveBeenCalledWith(ROOT, ['one']))
    await expect(state.service.plan(ROOT)).resolves.toEqual({
      ok: false,
      message: 'workspace.recovery.operation-in-progress',
    })
    expect(state.service.abort(ROOT)).toBe(true)
    finish?.()

    await expect(executing).resolves.toEqual({
      ok: false,
      message: 'workspace.recovery.cancelled',
      cancelled: true,
    })
    expect(state.discardRecords).toHaveBeenCalledTimes(1)
    expect(state.cleanupConfig).not.toHaveBeenCalled()
    expect(state.importWorkspace).not.toHaveBeenCalled()
    expect(state.branchService.abort).not.toHaveBeenCalled()
  })

  test('does not abort an unrelated branch workspace operation when recovery is inactive', () => {
    const state = fixture()
    state.branchService.abort.mockReturnValue(true)

    expect(state.service.abort(ROOT)).toBe(false)
    expect(state.branchService.abort).not.toHaveBeenCalled()
  })

  test('does not abort the branch service while recovery is in a non-branch stage', async () => {
    const state = fixture()
    const planned = await state.service.plan(ROOT)
    if (!planned.ok) throw new Error('expected plan')
    let finishInspection: (() => void) | undefined
    state.inspectConfigCleanup.mockReturnValueOnce(
      new Promise((resolve) => {
        finishInspection = () =>
          resolve({
            rootId: ROOT,
            scope: 'project',
            fingerprint: 'sha256:config',
          })
      }),
    )

    const executing = state.service.execute(ROOT, { planToken: planned.plan.token })
    await Promise.resolve()
    expect(state.service.abort(ROOT)).toBe(true)
    expect(state.branchService.abort).not.toHaveBeenCalled()
    finishInspection?.()

    await expect(executing).resolves.toEqual({
      ok: false,
      message: 'workspace.recovery.cancelled',
      cancelled: true,
    })
  })
})
