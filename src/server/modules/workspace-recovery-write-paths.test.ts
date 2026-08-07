import { describe, expect, test, vi } from 'vitest'
import {
  createWorkspaceRecoveryWriteService,
  type WorkspaceRecoveryWriteDependencies,
} from '#/server/modules/workspace-recovery-write-paths.ts'
import type { BranchWorkspaceWriteService } from '#/server/modules/branch-workspace-write-paths.ts'
import type { BranchWorkspaceManifest, BranchWorkspacePlan } from '#/shared/branch-workspaces.ts'
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

function branchPlan(
  item: BranchWorkspaceManifest,
  token: string,
  approvals: BranchWorkspacePlan['requiredApprovals'] = [],
) {
  return {
    token,
    rootId: ROOT,
    operation: 'remove' as const,
    branchWorkspaceId: item.id,
    branch: item.branch,
    directoryName: item.directoryName,
    path: item.path,
    manifest: item,
    repositories: [],
    auxiliaryEntries: [],
    requiredApprovals: approvals,
    steps: [],
    terminalSessionIds: [],
    removalOptions: { alsoDeleteBranch: false, alsoDeleteUpstream: false },
  } satisfies BranchWorkspacePlan
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
  const ordinaryTokens = new Map(items.map((item) => [item.id, `sha256:${item.id.padEnd(64, '0').slice(0, 64)}`]))
  const plan = vi.fn<BranchWorkspaceWriteService['plan']>(async (_rootId: string, request: unknown) => {
    const id = (request as { branchWorkspaceId: string }).branchWorkspaceId
    const item = items.find((candidate) => candidate.id === id)!
    return { ok: true as const, plan: branchPlan(item, ordinaryTokens.get(id)!) }
  })
  const execute = vi.fn<BranchWorkspaceWriteService['execute']>(async (_rootId, input) => ({
    ok: true as const,
    branchWorkspaceId: items.find((item) => ordinaryTokens.get(item.id) === input.planToken)?.id ?? '',
  }))
  const branchService = {
    plan,
    execute,
    abort: vi.fn(() => false),
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
  test('composes cleanup disclosure, repository discovery, and per-workspace removal plans', async () => {
    const items = [manifest('one', 'feature/one'), manifest('two', 'feature/two')]
    const state = fixture(items)
    state.inspectConfigCleanup.mockResolvedValue({
      rootId: ROOT,
      scope: 'registry-reset',
      fingerprint: 'sha256:config',
    })
    state.branchService.plan.mockImplementation(async (_rootId, request) => {
      const id = (request as { branchWorkspaceId: string }).branchWorkspaceId
      if (id === 'two') return { ok: false, message: 'workspace.branch-workspace.protected-path' }
      return {
        ok: true,
        plan: branchPlan(items[0]!, `sha256:${'1'.repeat(64)}`, ['discard-member-changes']),
      }
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
          { id: 'one', mode: 'remove', requiredApprovals: ['discard-member-changes'] },
          { id: 'two', mode: 'record-only', message: 'workspace.branch-workspace.protected-path' },
        ],
      },
    })
    if (result.ok) expect(result.plan.token).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(state.branchService.plan).toHaveBeenNthCalledWith(1, ROOT, {
      operation: 'remove',
      branchWorkspaceId: 'one',
      alsoDeleteBranch: false,
      alsoDeleteUpstream: false,
    })
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

  test('removes branch workspaces sequentially, then cleans configuration and imports again', async () => {
    const items = [manifest('one', 'feature/one'), manifest('two', 'feature/two')]
    const state = fixture(items)
    const events: string[] = []
    state.branchService.execute.mockImplementation(async (_rootId, input) => {
      const id = input.planToken.includes('one') ? 'one' : 'two'
      events.push(`remove:${id}`)
      return { ok: true, branchWorkspaceId: id }
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
        { id: 'one', outcome: 'removed' },
        { id: 'two', outcome: 'removed' },
      ],
    })
    expect(events).toEqual(['remove:one', 'remove:two', 'cleanup', 'import'])
    expect(state.importWorkspace).toHaveBeenCalledWith(ROOT, { sourceToken: 'workspace_recovery_1' })
    expect(state.publishInvalidation).toHaveBeenCalledWith(ROOT, 'workspace_recovery_1')
  })

  test('uses record-only fallback when ordinary planning is unavailable', async () => {
    const state = fixture()
    state.branchService.plan.mockResolvedValue({ ok: false, message: 'workspace.branch-workspace.plan-failed' })
    const planned = await state.service.plan(ROOT)
    if (!planned.ok) throw new Error('expected plan')

    const result = await state.service.execute(ROOT, { planToken: planned.plan.token })

    expect(result).toMatchObject({
      ok: true,
      outcome: 'completed-with-residuals',
      branches: [{ id: 'one', outcome: 'record-removed', message: 'workspace.branch-workspace.plan-failed' }],
    })
    expect(state.discardRecords).toHaveBeenCalledWith(ROOT, ['one'])
    expect(state.branchService.execute).not.toHaveBeenCalled()
  })

  test('does not discard records while another branch workspace operation is active', async () => {
    const state = fixture()
    state.branchService.plan.mockResolvedValue({
      ok: false,
      message: 'workspace.branch-workspace.operation-in-progress',
    })

    await expect(state.service.plan(ROOT)).resolves.toEqual({
      ok: false,
      message: 'workspace.recovery.operation-in-progress',
    })
    expect(state.discardRecords).not.toHaveBeenCalled()
  })

  test('falls back to record removal after ordinary execution fails', async () => {
    const state = fixture()
    state.branchService.execute.mockResolvedValue({
      ok: false,
      message: 'workspace.branch-workspace.remove-failed',
      branchWorkspaceId: 'one',
    })
    const planned = await state.service.plan(ROOT)
    if (!planned.ok) throw new Error('expected plan')

    const result = await state.service.execute(ROOT, { planToken: planned.plan.token })

    expect(result).toMatchObject({
      ok: true,
      outcome: 'completed-with-residuals',
      branches: [{ id: 'one', outcome: 'record-removed', message: 'workspace.branch-workspace.remove-failed' }],
    })
    expect(state.discardRecords).toHaveBeenCalledWith(ROOT, ['one'])
  })

  test('does not discard a record when the ordinary removal plan becomes stale', async () => {
    const state = fixture()
    state.branchService.execute.mockResolvedValue({
      ok: false,
      message: 'workspace.branch-workspace.plan-stale',
      branchWorkspaceId: 'one',
    })
    const planned = await state.service.plan(ROOT)
    if (!planned.ok) throw new Error('expected plan')

    await expect(state.service.execute(ROOT, { planToken: planned.plan.token })).resolves.toEqual({
      ok: false,
      message: 'workspace.recovery.plan-stale',
    })
    expect(state.discardRecords).not.toHaveBeenCalled()
    expect(state.cleanupConfig).not.toHaveBeenCalled()
    expect(state.importWorkspace).not.toHaveBeenCalled()
  })

  test('cancellation stops before record fallback, configuration cleanup, and import', async () => {
    const state = fixture()
    let finish: ((value: { ok: false; message: string; branchWorkspaceId: string }) => void) | undefined
    state.branchService.execute.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    state.branchService.abort.mockReturnValue(true)
    const planned = await state.service.plan(ROOT)
    if (!planned.ok) throw new Error('expected plan')

    const executing = state.service.execute(ROOT, { planToken: planned.plan.token })
    await vi.waitFor(() => expect(state.branchService.execute).toHaveBeenCalled())
    expect(state.service.abort(ROOT)).toBe(true)
    finish?.({ ok: false, message: 'cancelled', branchWorkspaceId: 'one' })

    await expect(executing).resolves.toEqual({
      ok: false,
      message: 'workspace.recovery.cancelled',
      cancelled: true,
    })
    expect(state.discardRecords).not.toHaveBeenCalled()
    expect(state.cleanupConfig).not.toHaveBeenCalled()
    expect(state.importWorkspace).not.toHaveBeenCalled()
    expect(state.branchService.abort).toHaveBeenCalledWith(ROOT)
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
