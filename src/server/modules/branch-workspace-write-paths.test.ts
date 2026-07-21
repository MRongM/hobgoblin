import { describe, expect, test, vi } from 'vitest'
import { createBranchWorkspaceWriteService } from '#/server/modules/branch-workspace-write-paths.ts'
import type { BranchWorkspaceManifest, BranchWorkspacePlan } from '#/shared/branch-workspaces.ts'

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

describe('branch workspace write service', () => {
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
      now: () => '2026-07-21T00:00:00.000Z',
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
      now: () => '2026-07-21T00:00:00.000Z',
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

  test('records a created worktree separately when repository dependency bootstrap fails', async () => {
    const plan = planned()
    const dependency = {
      kind: 'materialize' as const,
      candidateScope: 'ignored-only' as const,
      selections: [{ path: 'node_modules', mode: 'symlink' as const }],
    }
    plan.repositories[0] = { ...plan.repositories[0]!, worktreeBootstrap: dependency }
    plan.manifest.repositories[0] = {
      ...plan.manifest.repositories[0]!,
      worktreeBootstrap: dependency,
      bootstrapProgress: 'pending',
    }
    const source = inMemorySource()
    const service = createBranchWorkspaceWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      readManifests: source.readManifests,
      updateManifests: source.updateManifests,
      createDirectory: vi.fn(async () => undefined),
      createWorktree: vi.fn(async () => ({ ok: false, message: 'link failed', repoChanged: true })),
      now: () => '2026-07-21T00:00:00.000Z',
    })
    await service.plan(ROOT, {
      operation: 'create',
      branch: 'feature/auth',
      repositories: [{ repositoryName: 'api', baseBranch: 'main', worktreeBootstrap: dependency }],
      auxiliaryEntries: [],
    })

    await expect(service.execute(ROOT, { planToken: plan.token, approvals: [] })).resolves.toMatchObject({
      ok: false,
      message: 'link failed',
    })
    expect(source.manifests[0]?.repositories[0]).toMatchObject({
      progress: 'complete',
      worktreeBootstrap: dependency,
      bootstrapProgress: 'failed',
      bootstrapLastError: 'link failed',
    })
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
      now: () => '2026-07-21T00:00:00.000Z',
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
    expect(source.manifests[0]?.operation?.phase).toBe('cancelled')
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
      now: () => '2026-07-21T00:00:00.000Z',
    })
    await service.plan(ROOT, { operation: 'repair', branchWorkspaceId: plan.branchWorkspaceId })

    await expect(service.execute(ROOT, { planToken: plan.token, approvals: [] })).resolves.toEqual({
      ok: true,
      branchWorkspaceId: plan.branchWorkspaceId,
    })
    expect(events).toEqual(['mkdir', 'worktree', 'unlink', 'symlink'])
    expect(source.manifests[0]?.operation).toBeUndefined()
    expect(source.manifests[0]?.repositories[0]?.progress).toBe('complete')
    expect(source.manifests[0]?.auxiliaryEntries[0]?.progress).toBe('complete')
  })

  test('repairs only repository dependencies when the worktree already exists', async () => {
    const plan = repairPlanned()
    const dependency = {
      kind: 'materialize' as const,
      candidateScope: 'ignored-only' as const,
      selections: [{ path: 'node_modules', mode: 'symlink' as const }],
    }
    plan.repositories = [
      {
        ...plan.repositories[0]!,
        action: 'bootstrap-worktree',
        worktreeBootstrap: dependency,
      },
    ]
    plan.manifest.repositories[0] = {
      ...plan.manifest.repositories[0]!,
      progress: 'complete',
      worktreeBootstrap: dependency,
      bootstrapProgress: 'pending',
    }
    plan.steps = [
      {
        id: 'repository:api',
        kind: 'bootstrap-worktree',
        label: 'api',
        repositoryName: 'api',
      },
    ]
    plan.auxiliaryEntries = []
    plan.manifest.auxiliaryEntries = []
    const source = inMemorySource([plan.manifest])
    const createWorktree = vi.fn()
    const bootstrapWorktree = vi.fn(async () => ({ ok: true, message: 'linked' }))
    const service = createBranchWorkspaceWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      readManifests: source.readManifests,
      updateManifests: source.updateManifests,
      createWorktree,
      bootstrapWorktree,
      now: () => '2026-07-21T00:00:00.000Z',
    })
    await service.plan(ROOT, { operation: 'repair', branchWorkspaceId: plan.branchWorkspaceId })

    await expect(service.execute(ROOT, { planToken: plan.token, approvals: [] })).resolves.toEqual({
      ok: true,
      branchWorkspaceId: plan.branchWorkspaceId,
    })
    expect(createWorktree).not.toHaveBeenCalled()
    expect(bootstrapWorktree).toHaveBeenCalledWith(
      '/workspace/api',
      '/workspace/goblin-feature-auth/api',
      dependency,
      expect.any(AbortSignal),
    )
    expect(source.manifests[0]?.repositories[0]).toMatchObject({
      progress: 'complete',
      bootstrapProgress: 'complete',
    })
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
      forceRemoveWorktrees: true,
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
      now: () => '2026-07-21T00:00:00.000Z',
    })
    await service.plan(ROOT, {
      operation: 'remove',
      branchWorkspaceId: plan.branchWorkspaceId,
      alsoDeleteBranch: true,
      alsoDeleteUpstream: false,
      forceRemoveWorktrees: true,
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
      { force: false, alsoDeleteUpstream: false },
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
      now: () => '2026-07-21T00:00:00.000Z',
    })
    await service.plan(ROOT, {
      operation: 'remove',
      branchWorkspaceId: plan.branchWorkspaceId,
      alsoDeleteBranch: true,
      alsoDeleteUpstream: false,
      forceRemoveWorktrees: true,
    })

    await expect(service.execute(ROOT, { planToken: plan.token, approvals: [] })).resolves.toMatchObject({
      ok: false,
      message: 'busy',
    })
    expect(source.manifests[0]?.operation).toMatchObject({ kind: 'remove', phase: 'failed' })
    expect(source.manifests[0]?.repositories.map((member) => member.progress)).toEqual(['removed', 'failed'])
    expect(removeEntry).not.toHaveBeenCalled()
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
    removalOptions: { alsoDeleteBranch: true, alsoDeleteUpstream: false, forceRemoveWorktrees: true },
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
