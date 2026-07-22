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
        baseBranch: 'main',
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
  test('projects ready items in persisted manual order with auxiliary candidates', async () => {
    const manifests = [manifest('feature/second'), manifest('feature/first')]
    const deps = dependencies(manifests)

    await expect(readBranchWorkspaceSnapshot(ROOT, undefined, deps)).resolves.toMatchObject({
      ok: true,
      rootId: ROOT,
      items: [
        { id: 'branch:feature/second', lifecycle: 'ready', issues: [] },
        { id: 'branch:feature/first', lifecycle: 'ready', issues: [] },
      ],
      auxiliaryCandidates: [{ name: 'README.md' }],
    })
    expect(deps.readManifests).toHaveBeenCalledTimes(1)
    expect(deps.readConfig).toHaveBeenCalledTimes(1)
    expect(deps.listCandidates).toHaveBeenCalledWith(ROOT, new Set(['api', 'web']), undefined)
  })

  test('keeps a missing materialized workspace as needs-repair', async () => {
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
          lifecycle: 'needs-repair',
          available: false,
          issues: [{ kind: 'root-missing' }],
        },
      ],
    })
  })

  test('normalizes stale create and remove operations into durable incomplete lifecycles', async () => {
    const pending = manifest('feature/pending')
    pending.repositories[0]!.progress = 'pending'
    pending.operation = { kind: 'create', phase: 'running', startedAt: '2026-07-21T00:00:00.000Z' }
    const removing = manifest('feature/removing', {
      operation: { kind: 'remove', phase: 'running', startedAt: '2026-07-21T00:00:00.000Z' },
    })
    const deps = dependencies([pending, removing])
    const result = await readBranchWorkspaceSnapshot(ROOT, undefined, deps)
    expect(result).toMatchObject({
      ok: true,
      items: [
        { id: pending.id, lifecycle: 'create-incomplete' },
        { id: removing.id, lifecycle: 'delete-incomplete', available: false },
      ],
    })
  })

  test('projects interrupted member reduction without reporting removed progress as drift', async () => {
    const reducing = manifest('feature/reducing', {
      operation: { kind: 'reduce', phase: 'failed', startedAt: '2026-07-22T00:00:00.000Z' },
    })
    reducing.repositories[0] = { ...reducing.repositories[0]!, progress: 'removed' }
    const deps = dependencies([reducing])

    await expect(readBranchWorkspaceSnapshot(ROOT, undefined, deps)).resolves.toMatchObject({
      ok: true,
      items: [
        {
          id: reducing.id,
          lifecycle: 'reduce-incomplete',
          available: true,
          issues: [],
          repositories: [{ repositoryName: 'api', progress: 'removed', observedState: 'missing' }],
        },
      ],
    })
  })

  test('projects failed repository dependency bootstrap as repairable state', async () => {
    const current = manifest()
    current.repositories[0] = {
      ...current.repositories[0]!,
      worktreeBootstrap: {
        kind: 'materialize',
        candidateScope: 'ignored-only',
        selections: [{ path: 'node_modules', mode: 'symlink' }],
      },
      bootstrapProgress: 'failed',
      bootstrapLastError: 'link failed',
    }
    const deps = dependencies([current])

    await expect(readBranchWorkspaceSnapshot(ROOT, undefined, deps)).resolves.toMatchObject({
      ok: true,
      items: [
        {
          id: current.id,
          lifecycle: 'create-incomplete',
          issues: [
            {
              kind: 'repository-bootstrap-failed',
              repositoryName: 'api',
              message: 'link failed',
            },
          ],
          repositories: [{ repositoryName: 'api', observedState: 'failed' }],
        },
      ],
    })
  })

  test('does not project completed auxiliary materialization as tracked state or drift', async () => {
    const current = manifest('feature/auth', {
      operation: { kind: 'create', phase: 'failed', startedAt: '2026-07-22T00:00:00.000Z' },
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
      items: [{ lifecycle: 'create-incomplete', issues: [], auxiliaryEntries: [] }],
    })
  })

  test('distinguishes unavailable repositories from worktrees checked out elsewhere', async () => {
    const unavailable = manifest('feature/unavailable')
    const moved = manifest('feature/moved')
    moved.repositories[0] = {
      ...moved.repositories[0]!,
      repositoryName: 'web',
      worktreePath: path.join(moved.path, 'web'),
    }
    const deps = dependencies([unavailable, moved])
    deps.readRepositorySnapshot.mockImplementation(async (repoId) =>
      repoId.endsWith('/api') ? null : repoSnapshot(moved.branch, path.join(ROOT, 'legacy-web-feature-moved')),
    )

    await expect(readBranchWorkspaceSnapshot(ROOT, undefined, deps)).resolves.toMatchObject({
      ok: true,
      items: [
        {
          id: unavailable.id,
          lifecycle: 'needs-repair',
          issues: [{ kind: 'repository-unavailable', repositoryName: 'api' }],
        },
        {
          id: moved.id,
          lifecycle: 'needs-repair',
          issues: [{ kind: 'worktree-path-mismatch', repositoryName: 'web' }],
        },
      ],
    })
  })

})
