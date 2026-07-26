import { describe, expect, test, vi } from 'vitest'
import { createBranchWorkspaceWriteService } from '#/server/modules/branch-workspace-write-paths.ts'
import type {
  BranchWorkspaceManifest,
  BranchWorkspacePlan,
  BranchWorkspaceSnapshot,
} from '#/shared/branch-workspaces.ts'

const ROOT = '/workspace'

function planned(): BranchWorkspacePlan {
  const workspacePath = '/workspace/goblin-feature-auth'
  const repositories = [
    {
      repositoryName: 'api',
      repoId: '/workspace/api',
      targetBranch: 'feature/auth',
      baseBranch: 'main',
      branchOrigin: 'created' as const,
      worktreePath: `${workspacePath}/api`,
      mode: { kind: 'newBranch' as const, newBranch: 'feature/auth', baseRef: 'main' },
      worktreeBootstrap: { kind: 'skip' as const },
      confirmationRequired: false,
      satisfied: false,
    },
    {
      repositoryName: 'web',
      repoId: '/workspace/web',
      targetBranch: 'feature/auth',
      baseBranch: 'develop',
      branchOrigin: 'pre-existing' as const,
      worktreePath: `${workspacePath}/web`,
      mode: { kind: 'existingBranch' as const, branch: 'feature/auth' },
      worktreeBootstrap: { kind: 'skip' as const },
      confirmationRequired: false,
      satisfied: false,
    },
  ]
  return {
    token: 'sha256:plan',
    rootId: ROOT,
    operation: 'create',
    branchWorkspaceId: 'branch-1',
    branch: 'feature/auth',
    directoryName: 'goblin-feature-auth',
    path: workspacePath,
    manifest: {
      id: 'branch-1',
      rootId: ROOT,
      branch: 'feature/auth',
      directoryName: 'goblin-feature-auth',
      path: workspacePath,
      repositories: repositories.map((member) => ({
        repositoryName: member.repositoryName,
        targetBranch: member.targetBranch,
        baseBranch: member.baseBranch,
        branchOrigin: member.branchOrigin,
        worktreePath: member.worktreePath,
        progress: 'pending' as const,
      })),
      auxiliaryEntries: [],
    },
    repositories,
    auxiliaryEntries: [],
    requiredApprovals: [],
    steps: [
      { id: 'directory', kind: 'create-directory', label: 'directory' },
      { id: 'repository:api', kind: 'create-worktree', label: 'api', repositoryName: 'api' },
      { id: 'repository:web', kind: 'create-worktree', label: 'web', repositoryName: 'web' },
    ],
    terminalSessionIds: [],
  }
}

function inMemorySource(initial: BranchWorkspaceManifest[] = [], onUpdate: () => void = () => {}) {
  let manifests = initial.map(cloneManifest)
  return {
    readManifests: vi.fn(async () =>
      manifests.length > 0
        ? { kind: 'ready' as const, manifests: manifests.map(cloneManifest) }
        : { kind: 'missing' as const },
    ),
    updateManifests: vi.fn(
      async (
        _rootId: string,
        mutate: (items: BranchWorkspaceManifest[]) => BranchWorkspaceManifest[] | Promise<BranchWorkspaceManifest[]>,
      ) => {
        onUpdate()
        manifests = (await mutate(manifests.map(cloneManifest))).map(cloneManifest)
      },
    ),
    get manifests() {
      return manifests.map(cloneManifest)
    },
  }
}

function cloneManifest(manifest: BranchWorkspaceManifest): BranchWorkspaceManifest {
  return {
    ...manifest,
    repositories: manifest.repositories.map((member) => ({ ...member })),
    auxiliaryEntries: manifest.auxiliaryEntries.map((entry) => ({ ...entry })),
    ...(manifest.operation ? { operation: { ...manifest.operation } } : {}),
  }
}

function readySnapshot(plan: BranchWorkspacePlan): BranchWorkspaceSnapshot {
  return {
    id: plan.branchWorkspaceId,
    rootId: plan.rootId,
    branch: plan.branch,
    directoryName: plan.directoryName,
    path: plan.path,
    state: { kind: 'ready' },
    available: true,
    issues: [],
    repositories: plan.manifest.repositories.map((member) => ({ ...member, progress: 'complete', ready: true })),
    auxiliaryEntries: [],
  }
}

describe('branch workspace write service', () => {
  test('returns the final ready snapshot after successful creation', async () => {
    const plan = planned()
    const source = inMemorySource()
    const snapshot = readySnapshot(plan)
    const readSnapshot = vi.fn(async () => ({
      ok: true as const,
      rootId: ROOT,
      items: [snapshot],
      auxiliaryCandidates: [],
    }))
    const publishInvalidation = vi.fn()
    const service = createBranchWorkspaceWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      readManifests: source.readManifests,
      updateManifests: source.updateManifests,
      createDirectory: vi.fn(async () => undefined),
      createWorktree: vi.fn(async () => ({ ok: true, message: 'created' })),
      readSnapshot,
      publishInvalidation,
    })
    await service.plan(ROOT, {
      operation: 'create',
      branch: 'feature/auth',
      repositories: [
        { repositoryName: 'api', baseBranch: 'main' },
        { repositoryName: 'web', baseBranch: 'develop' },
      ],
      auxiliaryEntries: [],
    })

    const result = await service.execute(ROOT, {
      planToken: plan.token,
      approvals: [],
      sourceToken: 'workspace_create_1',
    })

    expect(readSnapshot).toHaveBeenCalledWith(ROOT, expect.any(AbortSignal))
    expect(publishInvalidation).toHaveBeenCalledWith(ROOT, 'workspace_create_1')
    expect(source.manifests[0]?.operation).toBeUndefined()
    expect(result).toEqual({ ok: true, branchWorkspaceId: plan.branchWorkspaceId, snapshot })
  })

  test('does not report creation success when final reconciliation is not ready', async () => {
    const plan = planned()
    const source = inMemorySource()
    const snapshot: BranchWorkspaceSnapshot = {
      ...readySnapshot(plan),
      state: { kind: 'needs-action', action: 'repair', reason: 'drift' },
      issues: [{ kind: 'worktree-missing', repositoryName: 'api' }],
    }
    const service = createBranchWorkspaceWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      readManifests: source.readManifests,
      updateManifests: source.updateManifests,
      createDirectory: vi.fn(async () => undefined),
      createWorktree: vi.fn(async () => ({ ok: true, message: 'created' })),
      readSnapshot: vi.fn(async () => ({
        ok: true as const,
        rootId: ROOT,
        items: [snapshot],
        auxiliaryCandidates: [],
      })),
    })
    await service.plan(ROOT, {
      operation: 'create',
      branch: 'feature/auth',
      repositories: [
        { repositoryName: 'api', baseBranch: 'main' },
        { repositoryName: 'web', baseBranch: 'develop' },
      ],
      auxiliaryEntries: [],
    })

    await expect(service.execute(ROOT, { planToken: plan.token, approvals: [] })).resolves.toEqual({
      ok: false,
      message: 'workspace.branch-workspace.needs-repair',
      branchWorkspaceId: plan.branchWorkspaceId,
    })
  })

  test('persists intent before filesystem mutation and executes repositories sequentially in configured order', async () => {
    const plan = planned()
    const events: string[] = []
    const source = inMemorySource([], () => events.push('persist'))
    const createDirectory = vi.fn(async () => {
      events.push('mkdir')
    })
    const createWorktree = vi.fn(async (repoId: string) => {
      events.push(`git:${repoId}`)
      return { ok: true, message: 'created' }
    })
    const publishInvalidation = vi.fn()
    const service = createBranchWorkspaceWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      readManifests: source.readManifests,
      updateManifests: source.updateManifests,
      createDirectory,
      createWorktree,
      publishInvalidation,
      readSnapshot: vi.fn(async () => ({
        ok: true as const,
        rootId: ROOT,
        items: [readySnapshot(plan)],
        auxiliaryCandidates: [],
      })),
    })
    await service.plan(ROOT, {
      operation: 'create',
      branch: 'feature/auth',
      repositories: [
        { repositoryName: 'api', baseBranch: 'main' },
        { repositoryName: 'web', baseBranch: 'develop' },
      ],
      auxiliaryEntries: [],
    })

    const result = await service.execute(ROOT, { planToken: plan.token, approvals: [] })

    expect(result).toMatchObject({ ok: true, branchWorkspaceId: 'branch-1' })
    expect(events[0]).toBe('persist')
    expect(events.indexOf('persist')).toBeLessThan(events.indexOf('mkdir'))
    expect(createWorktree.mock.calls.map(([repoId]) => repoId)).toEqual(['/workspace/api', '/workspace/web'])
    expect(source.manifests[0]?.repositories.map((member) => member.progress)).toEqual(['complete', 'complete'])
    expect(source.manifests[0]?.operation).toBeUndefined()
    expect(publishInvalidation).toHaveBeenCalledWith(ROOT)
  })

  test('persists completed progress and retries only the failed member without rollback', async () => {
    const plan = planned()
    const source = inMemorySource()
    const createWorktree = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, message: 'created' })
      .mockResolvedValueOnce({ ok: false, message: 'busy' })
      .mockResolvedValueOnce({ ok: true, message: 'created' })
    const service = createBranchWorkspaceWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      readManifests: source.readManifests,
      updateManifests: source.updateManifests,
      createDirectory: vi.fn(async () => undefined),
      createWorktree,
      readSnapshot: vi.fn(async () => ({
        ok: true as const,
        rootId: ROOT,
        items: [readySnapshot(plan)],
        auxiliaryCandidates: [],
      })),
    })
    const request = {
      operation: 'create' as const,
      branch: 'feature/auth',
      repositories: [
        { repositoryName: 'api', baseBranch: 'main' },
        { repositoryName: 'web', baseBranch: 'develop' },
      ],
      auxiliaryEntries: [],
    }
    await service.plan(ROOT, request)

    const first = await service.execute(ROOT, { planToken: plan.token, approvals: [] })
    expect(first).toMatchObject({ ok: false, message: 'busy' })
    expect(source.manifests[0]?.repositories.map((member) => member.progress)).toEqual(['complete', 'failed'])

    const retry = await service.execute(ROOT, { planToken: plan.token, approvals: [] })
    expect(retry.ok).toBe(true)
    expect(createWorktree.mock.calls.map(([repoId]) => repoId)).toEqual([
      '/workspace/api',
      '/workspace/web',
      '/workspace/web',
    ])
  })

  test('continues creation with a transient warning when dependency bootstrap fails after Git creation', async () => {
    const plan = planned()
    const dependency = {
      kind: 'materialize' as const,
      candidateScope: 'ignored-only' as const,
      selections: [{ path: 'node_modules', mode: 'symlink' as const }],
    }
    plan.repositories[0] = { ...plan.repositories[0]!, worktreeBootstrap: dependency }
    const source = inMemorySource()
    const snapshot = readySnapshot(plan)
    const createWorktree = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, message: 'link failed', repoChanged: true })
      .mockResolvedValueOnce({ ok: true, message: 'created' })
    const service = createBranchWorkspaceWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      readManifests: source.readManifests,
      updateManifests: source.updateManifests,
      createDirectory: vi.fn(async () => undefined),
      createWorktree,
      readSnapshot: vi.fn(async () => ({
        ok: true as const,
        rootId: ROOT,
        items: [snapshot],
        auxiliaryCandidates: [],
      })),
    })
    await service.plan(ROOT, {
      operation: 'create',
      branch: 'feature/auth',
      repositories: [{ repositoryName: 'api', baseBranch: 'main', worktreeBootstrap: dependency }],
      auxiliaryEntries: [],
    })

    await expect(service.execute(ROOT, { planToken: plan.token, approvals: [] })).resolves.toEqual({
      ok: true,
      branchWorkspaceId: plan.branchWorkspaceId,
      snapshot,
      warnings: [
        {
          kind: 'repository-dependency-failed',
          repositoryName: 'api',
          message: 'link failed',
        },
      ],
    })
    expect(createWorktree.mock.calls.map(([repoId]) => repoId)).toEqual(['/workspace/api', '/workspace/web'])
    expect(source.manifests[0]?.repositories).toEqual([
      expect.objectContaining({ repositoryName: 'api', progress: 'complete' }),
      expect.objectContaining({ repositoryName: 'web', progress: 'complete' }),
    ])
    expect(source.manifests[0]?.repositories[0]).not.toHaveProperty('worktreeBootstrap')
    expect(source.manifests[0]?.repositories[0]).not.toHaveProperty('bootstrapProgress')
    expect(source.manifests[0]?.repositories[0]).not.toHaveProperty('bootstrapLastError')
  })

  test('keeps a pre-creation worktree failure fatal', async () => {
    const plan = planned()
    plan.repositories[0] = {
      ...plan.repositories[0]!,
      worktreeBootstrap: {
        kind: 'materialize',
        selections: [{ path: 'node_modules', mode: 'symlink' }],
      },
    }
    const source = inMemorySource()
    const createWorktree = vi.fn(async () => ({ ok: false, message: 'git failed' }))
    const service = createBranchWorkspaceWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      readManifests: source.readManifests,
      updateManifests: source.updateManifests,
      createDirectory: vi.fn(async () => undefined),
      createWorktree,
    })
    await service.plan(ROOT, {
      operation: 'create',
      branch: 'feature/auth',
      repositories: [{ repositoryName: 'api', baseBranch: 'main' }],
      auxiliaryEntries: [],
    })

    await expect(service.execute(ROOT, { planToken: plan.token, approvals: [] })).resolves.toMatchObject({
      ok: false,
      message: 'git failed',
    })
    expect(createWorktree).toHaveBeenCalledTimes(1)
    expect(source.manifests[0]?.repositories.map((member) => member.progress)).toEqual(['failed', 'pending'])
  })

  test('requires every plan approval before persisting intent', async () => {
    const plan = planned()
    plan.requiredApprovals = ['outside-root-source', 'worktree-bootstrap']
    const source = inMemorySource()
    const service = createBranchWorkspaceWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      readManifests: source.readManifests,
      updateManifests: source.updateManifests,
      createWorktree: vi.fn(),
    })
    await service.plan(ROOT, {
      operation: 'create',
      branch: 'feature/auth',
      repositories: [{ repositoryName: 'api', baseBranch: 'main' }],
      auxiliaryEntries: [],
    })

    await expect(
      service.execute(ROOT, { planToken: plan.token, approvals: ['outside-root-source'] }),
    ).resolves.toMatchObject({ ok: false, message: 'workspace.branch-workspace.approval-required' })
    expect(source.updateManifests).not.toHaveBeenCalled()
  })

  test('allows one active operation per root and persists cancellation', async () => {
    const plan = planned()
    const source = inMemorySource()
    let resolveCreate: ((result: { ok: boolean; message: string }) => void) | undefined
    const createWorktree = vi.fn(
      async (_repoId: string, _input: unknown, _bootstrap: unknown, signal?: AbortSignal) =>
        await new Promise<{ ok: boolean; message: string }>((resolve) => {
          resolveCreate = resolve
          signal?.addEventListener('abort', () => resolve({ ok: false, message: 'cancelled' }), { once: true })
        }),
    )
    const service = createBranchWorkspaceWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      readManifests: source.readManifests,
      updateManifests: source.updateManifests,
      createDirectory: vi.fn(async () => undefined),
      createWorktree,
    })
    await service.plan(ROOT, {
      operation: 'create',
      branch: 'feature/auth',
      repositories: [{ repositoryName: 'api', baseBranch: 'main' }],
      auxiliaryEntries: [],
    })
    const running = service.execute(ROOT, { planToken: plan.token, approvals: [] })
    await vi.waitFor(() => expect(createWorktree).toHaveBeenCalledTimes(1))

    await expect(service.execute(ROOT, { planToken: plan.token, approvals: [] })).resolves.toMatchObject({
      ok: false,
      message: 'workspace.branch-workspace.operation-in-progress',
    })
    expect(service.abort(ROOT)).toBe(true)
    await expect(running).resolves.toMatchObject({ ok: false, message: 'cancelled' })
    expect(source.manifests[0]?.operation).toEqual({ kind: 'create' })
    resolveCreate?.({ ok: true, message: 'late' })
  })

  test('reorders selected ids and appends omitted manifests in their current order', async () => {
    const items = ['first', 'second', 'third'].map((id) => ({ ...planned().manifest, id, branch: `feature/${id}` }))
    const source = inMemorySource(items)
    const publishInvalidation = vi.fn()
    const service = createBranchWorkspaceWriteService({
      readManifests: source.readManifests,
      updateManifests: source.updateManifests,
      publishInvalidation,
    })

    await expect(service.reorder(ROOT, ['third', 'first'])).resolves.toEqual({ ok: true })
    expect(source.manifests.map((manifest) => manifest.id)).toEqual(['third', 'first', 'second'])
    expect(publishInvalidation).toHaveBeenCalledWith(ROOT)
    await expect(service.reorder(ROOT, ['unknown'])).resolves.toEqual({
      ok: false,
      message: 'workspace.branch-workspace.invalid-order',
    })
  })

  test('repairs missing materialization and replaces only a recorded symlink', async () => {
    const plan = repairPlanned()
    const source = inMemorySource([plan.manifest])
    const events: string[] = []
    const service = createBranchWorkspaceWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      readManifests: source.readManifests,
      updateManifests: source.updateManifests,
      createDirectory: vi.fn(async () => {
        events.push('mkdir')
      }),
      createWorktree: vi.fn(async () => {
        events.push('worktree')
        return { ok: true, message: 'created' }
      }),
      removeEntry: vi.fn(async () => {
        events.push('unlink')
      }),
      materializeSymlink: vi.fn(async () => {
        events.push('symlink')
      }),
    })
    await service.plan(ROOT, { operation: 'repair', branchWorkspaceId: plan.branchWorkspaceId })

    await expect(service.execute(ROOT, { planToken: plan.token, approvals: [] })).resolves.toEqual({
      ok: true,
      branchWorkspaceId: plan.branchWorkspaceId,
    })
    expect(events).toEqual(['mkdir', 'worktree', 'unlink', 'symlink'])
    expect(source.manifests[0]?.operation).toBeUndefined()
    expect(source.manifests[0]?.repositories[0]?.progress).toBe('complete')
    expect(source.manifests[0]?.auxiliaryEntries).toEqual([])
  })

  test('releases each auxiliary entry as soon as its materialization succeeds', async () => {
    const plan = repairPlanned()
    const readmeTargetPath = `${plan.path}/README.md`
    plan.manifest.auxiliaryEntries.push({
      name: 'README.md',
      mode: 'copy',
      sourcePath: '/workspace/README.md',
      targetPath: readmeTargetPath,
      progress: 'pending',
    })
    plan.auxiliaryEntries.push({
      name: 'README.md',
      mode: 'copy',
      sourcePath: '/workspace/README.md',
      targetPath: readmeTargetPath,
      outsideRoot: false,
      satisfied: false,
      action: 'materialize',
    })
    const source = inMemorySource([plan.manifest])
    const service = createBranchWorkspaceWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      readManifests: source.readManifests,
      updateManifests: source.updateManifests,
      createDirectory: vi.fn(async () => undefined),
      createWorktree: vi.fn(async () => ({ ok: true, message: 'created' })),
      removeEntry: vi.fn(async () => undefined),
      materializeSymlink: vi.fn(async () => undefined),
      copyEntry: vi.fn(async () => {
        throw new Error('copy failed')
      }),
    })
    await service.plan(ROOT, { operation: 'repair', branchWorkspaceId: plan.branchWorkspaceId })

    await expect(service.execute(ROOT, { planToken: plan.token, approvals: [] })).resolves.toMatchObject({
      ok: false,
      message: 'copy failed',
    })
    expect(source.manifests[0]?.auxiliaryEntries).toEqual([
      expect.objectContaining({ name: 'README.md', progress: 'failed' }),
    ])
  })

  test('aborts remove before manifest and filesystem mutation when an approved terminal cannot close', async () => {
    const plan = removePlanned()
    const source = inMemorySource([plan.manifest])
    const removeWorktree = vi.fn()
    const removeEntry = vi.fn()
    const service = createBranchWorkspaceWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      readManifests: source.readManifests,
      updateManifests: source.updateManifests,
      closeSessions: vi.fn(async () => ({ closed: [], missing: ['terminal-root-1234'] })),
      removeWorktree,
      removeEntry,
    })
    await service.plan(ROOT, {
      operation: 'remove',
      branchWorkspaceId: plan.branchWorkspaceId,
      alsoDeleteBranch: true,
      alsoDeleteUpstream: false,
    })

    await expect(
      service.execute(ROOT, { planToken: plan.token, approvals: ['close-terminals', 'unmanaged-content'] }),
    ).resolves.toEqual({
      ok: false,
      message: 'workspace.branch-workspace.terminals-close-failed',
      branchWorkspaceId: plan.branchWorkspaceId,
    })
    expect(source.updateManifests).not.toHaveBeenCalled()
    expect(removeWorktree).not.toHaveBeenCalled()
    expect(removeEntry).not.toHaveBeenCalled()
  })

  test('removes worktrees sequentially, honors provenance cleanup, and removes the root last', async () => {
    const plan = removePlanned()
    const source = inMemorySource([plan.manifest])
    const events: string[] = []
    const removeWorktree = vi.fn(async (_repoId: string, input: { worktreePath: string }) => {
      events.push(`worktree:${input.worktreePath}`)
      return { ok: true, message: 'removed' }
    })
    const removeEntry = vi.fn(async (_rootId: string, targetPath: string) => {
      events.push(`entry:${targetPath}`)
    })
    const closeSessions = vi.fn(async () => {
      events.push('close-terminals')
      return { closed: plan.terminalSessionIds, missing: [] }
    })
    const deleteBranch = vi.fn(async (repoId: string) => {
      events.push(`branch:${repoId}`)
      return { ok: true, message: 'deleted' }
    })
    const service = createBranchWorkspaceWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      readManifests: source.readManifests,
      updateManifests: source.updateManifests,
      closeSessions,
      removeWorktree,
      deleteBranch,
      removeEntry,
    })
    await service.plan(ROOT, {
      operation: 'remove',
      branchWorkspaceId: plan.branchWorkspaceId,
      alsoDeleteBranch: true,
      alsoDeleteUpstream: false,
    })

    await expect(
      service.execute(ROOT, { planToken: plan.token, approvals: ['close-terminals', 'unmanaged-content'] }),
    ).resolves.toEqual({ ok: true, branchWorkspaceId: plan.branchWorkspaceId })
    expect(events[0]).toBe('close-terminals')
    expect(removeWorktree.mock.calls.map(([repoId]) => repoId)).toEqual(['/workspace/api', '/workspace/web'])
    expect(removeWorktree.mock.calls[0]?.[1]).toMatchObject({
      alsoDeleteBranch: false,
      alsoDeleteUpstream: false,
      forceRemoveWorktree: true,
      forceDeleteBranch: false,
    })
    expect(removeWorktree.mock.calls[1]?.[1]).toMatchObject({
      alsoDeleteBranch: false,
      alsoDeleteUpstream: false,
      forceRemoveWorktree: true,
      forceDeleteBranch: false,
    })
    expect(deleteBranch).toHaveBeenCalledWith(
      '/workspace/api',
      'feature/auth',
      { force: true, alsoDeleteUpstream: false },
      expect.any(AbortSignal),
    )
    expect(events.at(-1)).toBe(`entry:${plan.path}`)
    expect(source.manifests).toEqual([])
  })

  test('persists remove progress and leaves delete-incomplete state when a later member fails', async () => {
    const plan = removePlanned()
    plan.terminalSessionIds = []
    plan.requiredApprovals = []
    const source = inMemorySource([plan.manifest])
    const removeWorktree = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, message: 'removed' })
      .mockResolvedValueOnce({ ok: false, message: 'busy' })
    const removeEntry = vi.fn()
    const service = createBranchWorkspaceWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      readManifests: source.readManifests,
      updateManifests: source.updateManifests,
      removeWorktree,
      deleteBranch: vi.fn(async () => ({ ok: true, message: 'deleted' })),
      removeEntry,
    })
    await service.plan(ROOT, {
      operation: 'remove',
      branchWorkspaceId: plan.branchWorkspaceId,
      alsoDeleteBranch: true,
      alsoDeleteUpstream: false,
    })

    await expect(service.execute(ROOT, { planToken: plan.token, approvals: [] })).resolves.toMatchObject({
      ok: false,
      message: 'busy',
    })
    expect(source.manifests[0]?.operation).toEqual({ kind: 'remove' })
    expect(source.manifests[0]?.repositories.map((member) => member.progress)).toEqual(['removed', 'failed'])
    expect(removeEntry).not.toHaveBeenCalled()
  })

  test('reduces selected membership after closing terminals without deleting branches', async () => {
    const plan = reducePlanned()
    const source = inMemorySource([plan.manifest])
    const events: string[] = []
    const closeSessions = vi.fn(async () => {
      events.push('close-terminals')
      return { closed: plan.terminalSessionIds, missing: [] }
    })
    const removeWorktree = vi.fn(async (_repoId: string, input: { worktreePath: string }) => {
      events.push(`remove:${input.worktreePath}`)
      return { ok: true, message: 'removed' }
    })
    const deleteBranch = vi.fn()
    const deleteRemoteBranch = vi.fn()
    const service = createBranchWorkspaceWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      readManifests: source.readManifests,
      updateManifests: source.updateManifests,
      closeSessions,
      createWorktree: vi.fn(async () => ({ ok: true, message: 'created' })),
      removeWorktree,
      deleteBranch,
      deleteRemoteBranch,
    })
    await service.plan(ROOT, {
      operation: 'reduce',
      branchWorkspaceId: plan.branchWorkspaceId,
      repositories: ['api'],
    })

    await expect(
      service.execute(ROOT, {
        planToken: plan.token,
        approvals: ['discard-member-changes', 'close-terminals'],
      }),
    ).resolves.toEqual({ ok: true, branchWorkspaceId: plan.branchWorkspaceId })

    expect(events).toEqual(['close-terminals', `remove:${plan.path}/api`])
    expect(removeWorktree).toHaveBeenCalledWith(
      '/workspace/api',
      {
        branch: 'feature/auth',
        worktreePath: `${plan.path}/api`,
        alsoDeleteBranch: false,
        forceRemoveWorktree: true,
        forceDeleteBranch: false,
        alsoDeleteUpstream: false,
      },
      expect.any(AbortSignal),
    )
    expect(source.manifests[0]?.repositories.map((member) => member.repositoryName)).toEqual(['web'])
    expect(source.manifests[0]?.operation).toBeUndefined()
    expect(deleteBranch).not.toHaveBeenCalled()
    expect(deleteRemoteBranch).not.toHaveBeenCalled()
  })

  test('persists partial reduction progress and retries only remaining members', async () => {
    const plan = reducePlanned(['api', 'web'])
    plan.requiredApprovals = []
    plan.terminalSessionIds = []
    const source = inMemorySource([plan.manifest])
    const removeWorktree = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, message: 'removed' })
      .mockResolvedValueOnce({ ok: false, message: 'busy' })
      .mockResolvedValueOnce({ ok: true, message: 'removed' })
    const service = createBranchWorkspaceWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      readManifests: source.readManifests,
      updateManifests: source.updateManifests,
      createWorktree: vi.fn(async () => ({ ok: true, message: 'created' })),
      removeWorktree,
    })
    const request = {
      operation: 'reduce' as const,
      branchWorkspaceId: plan.branchWorkspaceId,
      repositories: ['api', 'web'],
    }
    await service.plan(ROOT, request)

    await expect(service.execute(ROOT, { planToken: plan.token, approvals: [] })).resolves.toMatchObject({
      ok: false,
      message: 'busy',
    })
    expect(source.manifests[0]?.operation).toEqual({ kind: 'reduce' })
    expect(source.manifests[0]?.repositories.map((member) => [member.repositoryName, member.progress])).toEqual([
      ['api', 'removed'],
      ['web', 'failed'],
      ['worker', 'complete'],
    ])

    await expect(service.execute(ROOT, { planToken: plan.token, approvals: [] })).resolves.toEqual({
      ok: true,
      branchWorkspaceId: plan.branchWorkspaceId,
    })
    expect(removeWorktree.mock.calls.map(([repoId]) => repoId)).toEqual([
      '/workspace/api',
      '/workspace/web',
      '/workspace/web',
    ])
    expect(source.manifests[0]?.repositories.map((member) => member.repositoryName)).toEqual(['worker'])
  })
})

function repairPlanned(): BranchWorkspacePlan {
  const plan = planned()
  const targetPath = `${plan.path}/.env`
  return {
    ...plan,
    token: 'sha256:repair',
    operation: 'repair',
    manifest: {
      ...plan.manifest,
      repositories: plan.manifest.repositories.slice(0, 1).map((member) => ({ ...member, progress: 'pending' })),
      auxiliaryEntries: [
        {
          name: '.env',
          mode: 'symlink',
          sourcePath: '/workspace/.env',
          targetPath,
          progress: 'pending',
        },
      ],
    },
    repositories: [{ ...plan.repositories[0]!, action: 'create-worktree', satisfied: false }],
    auxiliaryEntries: [
      {
        name: '.env',
        mode: 'symlink',
        sourcePath: '/workspace/.env',
        targetPath,
        outsideRoot: false,
        satisfied: false,
        action: 'replace-symlink',
      },
    ],
    steps: [
      { id: 'directory', kind: 'create-directory', label: 'directory' },
      { id: 'repository:api', kind: 'create-worktree', label: 'api', repositoryName: 'api' },
      { id: 'auxiliary-remove:.env', kind: 'remove-entry', label: '.env', entryName: '.env' },
      { id: 'auxiliary:.env', kind: 'symlink-entry', label: '.env', entryName: '.env' },
    ],
  }
}

function removePlanned(): BranchWorkspacePlan {
  const plan = planned()
  const repositories = plan.repositories.map((repository, index) => ({
    ...repository,
    branchOrigin: index === 0 ? ('created' as const) : ('pre-existing' as const),
    action: 'remove-worktree' as const,
    worktreePresent: true,
    deleteBranch: index === 0,
    deleteUpstream: false,
    satisfied: false,
  }))
  return {
    ...plan,
    token: 'sha256:remove',
    operation: 'remove',
    manifest: {
      ...plan.manifest,
      repositories: repositories.map((repository) => ({
        repositoryName: repository.repositoryName,
        targetBranch: repository.targetBranch,
        baseBranch: repository.baseBranch,
        branchOrigin: repository.branchOrigin,
        worktreePath: repository.worktreePath,
        progress: 'pending',
        ...(repository.deleteBranch ? { branchCleanupProgress: 'pending' as const } : {}),
      })),
      auxiliaryEntries: [
        {
          name: 'README.md',
          mode: 'copy',
          sourcePath: '/workspace/README.md',
          targetPath: `${plan.path}/README.md`,
          copyBaseline: 'baseline',
          progress: 'pending',
        },
      ],
    },
    repositories,
    auxiliaryEntries: [
      {
        name: 'README.md',
        mode: 'copy',
        sourcePath: '/workspace/README.md',
        targetPath: `${plan.path}/README.md`,
        outsideRoot: false,
        satisfied: false,
        action: 'remove',
      },
    ],
    requiredApprovals: ['unmanaged-content', 'close-terminals'],
    terminalSessionIds: ['terminal-root-1234'],
    unmanagedEntries: ['notes.txt'],
    removalOptions: { alsoDeleteBranch: true, alsoDeleteUpstream: false },
    steps: [
      ...repositories.map((repository) => ({
        id: `repository:${repository.repositoryName}`,
        kind: 'remove-worktree' as const,
        label: repository.repositoryName,
        repositoryName: repository.repositoryName,
      })),
      { id: 'auxiliary:README.md', kind: 'remove-entry', label: 'README.md', entryName: 'README.md' },
      { id: 'unmanaged:notes.txt', kind: 'remove-entry', label: 'notes.txt', entryName: 'notes.txt' },
      { id: 'directory', kind: 'remove-directory', label: 'directory' },
    ],
  }
}

function reducePlanned(selectedNames: string[] = ['api']): BranchWorkspacePlan {
  const plan = planned()
  const allRepositories =
    selectedNames.length > 1
      ? [
          ...plan.repositories,
          {
            ...plan.repositories[0]!,
            repositoryName: 'worker',
            repoId: '/workspace/worker',
            worktreePath: `${plan.path}/worker`,
          },
        ]
      : plan.repositories
  const selected = new Set(selectedNames)
  const repositories = allRepositories
    .filter((repository) => selected.has(repository.repositoryName))
    .map((repository, index) => ({
      ...repository,
      action: 'remove-worktree' as const,
      worktreePresent: true,
      dirty: index === 0,
      satisfied: false,
    }))
  return {
    ...plan,
    token: 'sha256:reduce',
    operation: 'reduce',
    manifest: {
      ...plan.manifest,
      repositories: allRepositories.map((repository) => ({
        repositoryName: repository.repositoryName,
        targetBranch: repository.targetBranch,
        baseBranch: repository.baseBranch,
        branchOrigin: repository.branchOrigin,
        worktreePath: repository.worktreePath,
        progress: selected.has(repository.repositoryName) ? ('pending' as const) : ('complete' as const),
      })),
      auxiliaryEntries: [],
    },
    repositories,
    auxiliaryEntries: [],
    requiredApprovals: ['discard-member-changes', 'close-terminals'],
    terminalSessionIds: ['terminal-api-1234'],
    steps: repositories.map((repository) => ({
      id: `repository:${repository.repositoryName}`,
      kind: 'remove-worktree' as const,
      label: repository.repositoryName,
      repositoryName: repository.repositoryName,
    })),
  }
}
