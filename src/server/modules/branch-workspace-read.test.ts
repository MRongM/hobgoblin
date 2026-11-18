import path from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { readBranchWorkspaceSnapshot } from '#/server/modules/branch-workspace-read.ts'
import type { BranchWorkspaceManifest, BranchWorkspacePathInspection } from '#/shared/branch-workspaces.ts'
import type { RepoSnapshot } from '#/shared/rpc.ts'

const ROOT = path.resolve('/workspace')

function manifest(branch = 'feature/auth', overrides: Partial<BranchWorkspaceManifest> = {}): BranchWorkspaceManifest {
  const directoryName = `goblin-${branch.replaceAll('/', '-')}`
  const workspacePath = path.join(ROOT, directoryName)
  return {
    id: `branch:${branch}`,
    rootId: ROOT,
    branch,
    directoryName,
    path: workspacePath,
    repositories: [
      {
        repositoryName: 'api',
        targetBranch: branch,
        creationBase: { kind: 'localBranch', branch: 'main' },
        syncBeforeCreate: false,
        branchOrigin: 'created',
        worktreePath: path.join(workspacePath, 'api'),
        progress: 'complete',
      },
    ],
    auxiliaryEntries: [],
    ...overrides,
  }
}

function repoSnapshot(branch: string, worktreePath: string): RepoSnapshot {
  return {
    current: 'main',
    branches: [
      {
        name: branch,
        isCurrent: false,
        ahead: 0,
        behind: 0,
        lastCommitHash: 'abcdef0',
        lastCommitMessage: 'message',
        lastCommitDate: '2026-01-01T00:00:00.000Z',
        lastCommitAuthor: 'Developer',
        worktree: { path: worktreePath },
      },
    ],
  }
}

function inspection(candidatePath: string, kind: BranchWorkspacePathInspection['kind'] = 'directory') {
  return {
    path: candidatePath,
    exists: kind !== 'missing',
    kind,
    ...(kind === 'missing' ? {} : { resolvedPath: candidatePath }),
    directChild: path.dirname(candidatePath) === ROOT,
    outsideRoot: false,
  } satisfies BranchWorkspacePathInspection
}

function dependencies(manifests: BranchWorkspaceManifest[]) {
  return {
    readManifests: vi.fn(async () => ({ kind: 'ready' as const, manifests })),
    readConfig: vi.fn(async () => ({ kind: 'ready' as const, config: { repo: ['api', 'web'] } })),
    readRepositorySnapshot: vi.fn(async (repoId: string) => {
      const members = manifests.flatMap((item) =>
        item.repositories.filter((member) => path.join(ROOT, member.repositoryName) === repoId),
      )
      if (members.length === 0) return null
      return {
        current: 'main',
        branches: members.flatMap((member) => repoSnapshot(member.targetBranch, member.worktreePath).branches),
      }
    }),
    inspectPath: vi.fn(async (_rootId: string, candidatePath: string) => inspection(candidatePath)),
    listCandidates: vi.fn(async () => [
      {
        name: 'README.md',
        path: path.join(ROOT, 'README.md'),
        kind: 'file' as const,
        resolvedPath: path.join(ROOT, 'README.md'),
        outsideRoot: false,
      },
    ]),
  }
}

describe('branch workspace read model', () => {
  test('reads only the target workspace while retaining all repository exclusions', async () => {
    const target = manifest()
    const sibling = manifest('feature/other', {
      repositories: [
        {
          ...manifest().repositories[0]!,
          repositoryName: 'sibling-only',
          worktreePath: '/workspace/goblin-feature-other/sibling-only',
        },
      ],
    })
    const deps = dependencies([target, sibling])
    const discoverDirectories = vi.fn(async () => [])
    const result = await readBranchWorkspaceSnapshot(ROOT, undefined, {
      ...deps,
      branchWorkspaceId: target.id,
      discoverDirectories,
    })
    expect(result).toMatchObject({ ok: true, items: [{ id: target.id }] })
    if (!result.ok) throw new Error('expected snapshot')
    expect(result.items).toHaveLength(1)
    expect(deps.readRepositorySnapshot).not.toHaveBeenCalled()
    expect(deps.inspectPath).toHaveBeenCalledExactlyOnceWith(ROOT, target.path, undefined)
    expect(discoverDirectories).toHaveBeenCalledExactlyOnceWith(
      ROOT,
      undefined,
      { registeredDirectoryNames: [target.directoryName] },
      [target.directoryName],
    )
    expect(deps.listCandidates).toHaveBeenCalledWith(
      ROOT,
      new Set(['api', 'web', target.directoryName, sibling.directoryName]),
      undefined,
    )
  })

  test('reports registry damage without treating unregistered folders as available', async () => {
    const current = manifest()
    const member = current.repositories[0]!
    const result = await readBranchWorkspaceSnapshot(ROOT, undefined, {
      ...dependencies([]),
      readManifests: async () => ({ kind: 'invalid', message: 'workspace.branch-workspace.read-failed' }),
      discoverDirectories: async () => [
        {
          directoryName: current.directoryName,
          path: current.path,
          branch: current.branch,
          members: [
            {
              repositoryName: member.repositoryName,
              repositoryId: path.join(ROOT, 'api'),
              worktreePath: member.worktreePath,
              branch: member.targetBranch,
            },
          ],
        },
      ],
    })
    expect(result).toMatchObject({
      ok: true,
      registryError: 'workspace.branch-workspace.read-failed',
      items: [],
    })
  })

  test('reuses discovered worktrees without checking their repositories and roots again', async () => {
    const current = manifest()
    const deps = dependencies([current])
    const member = current.repositories[0]!
    const result = await readBranchWorkspaceSnapshot(ROOT, undefined, {
      ...deps,
      discoverDirectories: async () => [
        {
          directoryName: current.directoryName,
          path: current.path,
          branch: current.branch,
          members: [
            {
              repositoryName: member.repositoryName,
              repositoryId: path.join(ROOT, 'api'),
              worktreePath: member.worktreePath,
              branch: member.targetBranch,
            },
          ],
        },
      ],
    })
    expect(result).toMatchObject({ ok: true, items: [{ available: true, repositories: [{ ready: true }] }] })
    expect(deps.readRepositorySnapshot).not.toHaveBeenCalled()
    expect(deps.inspectPath).not.toHaveBeenCalled()
  })
  test('projects ready items in persisted manual order with auxiliary candidates', async () => {
    const manifests = [manifest('feature/second'), manifest('feature/first')]
    const deps = dependencies(manifests)

    await expect(readBranchWorkspaceSnapshot(ROOT, undefined, deps)).resolves.toMatchObject({
      ok: true,
      rootId: ROOT,
      items: [
        { id: 'branch:feature/second', state: { kind: 'ready' }, issues: [] },
        { id: 'branch:feature/first', state: { kind: 'ready' }, issues: [] },
      ],
      auxiliaryCandidates: [{ name: 'README.md' }],
    })
    expect(deps.readManifests).toHaveBeenCalledTimes(1)
    expect(deps.readConfig).toHaveBeenCalledTimes(1)
    expect(deps.listCandidates).toHaveBeenCalledWith(
      ROOT,
      new Set(['api', 'web', ...manifests.map((item) => item.directoryName)]),
      undefined,
    )
  })

  test('retains the identity of a registered folder when its directory disappears', async () => {
    const current = manifest()
    const deps = dependencies([current])
    deps.inspectPath.mockImplementation(async (_rootId, candidatePath) =>
      candidatePath === current.path ? inspection(candidatePath, 'missing') : inspection(candidatePath),
    )

    await expect(readBranchWorkspaceSnapshot(ROOT, undefined, deps)).resolves.toMatchObject({
      ok: true,
      items: [
        {
          id: current.id,
          state: { kind: 'ready' },
          available: false,
          issues: [{ kind: 'root-missing' }],
        },
      ],
    })
  })

  test('reports a read failure when the workspace root inspection fails', async () => {
    const current = manifest()
    const deps = dependencies([current])
    deps.inspectPath.mockRejectedValue(new Error('temporary SSH failure'))

    await expect(readBranchWorkspaceSnapshot(ROOT, undefined, deps)).resolves.toEqual({
      ok: false,
      message: 'workspace.branch-workspace.read-failed',
    })
  })

  test('ignores legacy repository dependency recovery fields when projecting readiness', async () => {
    const current = manifest()
    Object.assign(current.repositories[0]!, {
      worktreeBootstrap: {
        kind: 'materialize',
        selections: [{ path: 'node_modules', mode: 'symlink' }],
      },
      bootstrapProgress: 'failed',
      bootstrapLastError: 'link failed',
    })
    const deps = dependencies([current])

    await expect(readBranchWorkspaceSnapshot(ROOT, undefined, deps)).resolves.toMatchObject({
      ok: true,
      items: [
        {
          id: current.id,
          state: { kind: 'ready' },
          issues: [],
          repositories: [{ repositoryName: 'api', ready: true }],
        },
      ],
    })
  })

  test('does not project completed auxiliary materialization as tracked state or drift', async () => {
    const current = manifest('feature/auth', {
      operation: { kind: 'create' },
    })
    current.auxiliaryEntries = [
      {
        name: 'README.md',
        mode: 'copy',
        sourcePath: path.join(ROOT, 'README.md'),
        targetPath: path.join(current.path, 'README.md'),
        progress: 'complete',
      },
    ]
    const deps = dependencies([current])
    deps.inspectPath.mockImplementation(async (_rootId, candidatePath) =>
      candidatePath === current.auxiliaryEntries[0]!.targetPath
        ? inspection(candidatePath, 'missing')
        : inspection(candidatePath),
    )

    await expect(readBranchWorkspaceSnapshot(ROOT, undefined, deps)).resolves.toMatchObject({
      ok: true,
      items: [
        {
          state: { kind: 'ready' },
          issues: [],
          auxiliaryEntries: [],
        },
      ],
    })
  })

  test('marks a Windows and WSL path pair as the same ready member worktree', async () => {
    const current = manifest()
    current.repositories[0] = {
      ...current.repositories[0]!,
      worktreePath: '/mnt/c/Workspace/hobgoblin-feature-auth/api',
    }
    const deps = dependencies([current])
    deps.readRepositorySnapshot.mockResolvedValue(
      repoSnapshot(current.branch, 'C:\\Workspace\\hobgoblin-feature-auth\\api'),
    )

    await expect(readBranchWorkspaceSnapshot(ROOT, undefined, deps)).resolves.toMatchObject({
      ok: true,
      items: [
        {
          state: { kind: 'ready' },
          issues: [],
          repositories: [{ repositoryName: 'api', ready: true }],
        },
      ],
    })
  })

  test('keeps the durable state while exposing a running Git action orthogonally', async () => {
    const current = manifest()
    const deps = {
      ...dependencies([current]),
      readActiveOperation: vi.fn(() => ({
        kind: 'pull' as const,
        currentStep: 1,
        completedCount: 0,
        totalCount: 1,
        cancellable: true,
      })),
    }

    await expect(readBranchWorkspaceSnapshot(ROOT, undefined, deps)).resolves.toMatchObject({
      ok: true,
      items: [
        {
          state: { kind: 'ready' },
          activeOperation: { kind: 'pull', currentStep: 1 },
        },
      ],
    })
  })
})
