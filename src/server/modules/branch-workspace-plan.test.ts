import path from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { buildBranchWorkspacePlan } from '#/server/modules/branch-workspace-plan.ts'
import type { BranchWorkspaceManifestSourceSnapshot } from '#/server/modules/branch-workspace-source.ts'
import type { BranchWorkspaceManifest, BranchWorkspacePathInspection } from '#/shared/branch-workspaces.ts'
import type { RepoSnapshot } from '#/shared/rpc.ts'
import type { BranchSnapshotInfo, WorktreeInfo } from '#/shared/git-types.ts'
import type { WorkspaceConfigSnapshot } from '#/shared/workspace.ts'

const ROOT = path.resolve('/workspace')
const BRANCH = 'feature/auth'

function branch(name: string, worktreePath?: string): BranchSnapshotInfo {
  return {
    name,
    isCurrent: false,
    ahead: 0,
    behind: 0,
    lastCommitHash: 'abcdef0',
    lastCommitMessage: 'message',
    lastCommitDate: '2026-01-01T00:00:00.000Z',
    lastCommitAuthor: 'Developer',
    ...(worktreePath ? { worktree: { path: worktreePath } } : {}),
  }
}

function snapshot(...branches: ReturnType<typeof branch>[]): RepoSnapshot {
  return { current: 'main', branches }
}

function worktree(
  worktreePath: string,
  options: Partial<Pick<WorktreeInfo, 'branch' | 'head' | 'isPrimary' | 'isPrunable'>> = {},
): WorktreeInfo {
  return {
    path: worktreePath,
    isBare: false,
    isPrimary: false,
    ...options,
  }
}

function trackedBranch(name: string, tracking: string, worktreePath?: string): BranchSnapshotInfo {
  return { ...branch(name, worktreePath), tracking }
}

function missing(candidatePath: string): BranchWorkspacePathInspection {
  return {
    path: candidatePath,
    exists: false,
    kind: 'missing',
    directChild: path.dirname(candidatePath) === ROOT,
    outsideRoot: false,
  }
}

function dependencies(snapshots: Record<string, RepoSnapshot | null>) {
  return {
    readConfig: vi.fn(
      async (): Promise<WorkspaceConfigSnapshot> => ({ kind: 'ready', config: { repo: ['api', 'web'] } }),
    ),
    readManifests: vi.fn(async (): Promise<BranchWorkspaceManifestSourceSnapshot> => ({ kind: 'missing' })),
    getSnapshot: vi.fn(async (repoId: string) => snapshots[repoId] ?? null),
    getWorktrees: vi.fn(async (repoId: string): Promise<WorktreeInfo[]> => {
      const repoSnapshot = snapshots[repoId]
      if (!repoSnapshot) return []
      return repoSnapshot.branches.flatMap((candidate) =>
        candidate.worktree?.path
          ? [
              worktree(candidate.worktree.path, {
                branch: candidate.name,
                isPrimary: candidate.worktree.isPrimary ?? candidate.worktree.path === repoId,
                isPrunable: candidate.worktree.isPrunable,
                head: candidate.worktree.head,
              }),
            ]
          : [],
      )
    }),
    getRemoteBranches: vi.fn(async (_repoId: string) => [] as string[]),
    inspectPath: vi.fn(
      async (_rootId: string, candidatePath: string): Promise<BranchWorkspacePathInspection> => missing(candidatePath),
    ),
    pathExists: vi.fn(async () => false),
  }
}

function existingManifest(): BranchWorkspaceManifest {
  const workspacePath = path.join(ROOT, 'hobgoblin-feature-auth')
  return {
    id: 'branch-workspace-1',
    rootId: ROOT,
    branch: BRANCH,
    directoryName: 'hobgoblin-feature-auth',
    path: workspacePath,
    repositories: [
      {
        repositoryName: 'api',
        targetBranch: BRANCH,
        creationBase: { kind: 'localBranch', branch: 'main' },
        syncBeforeCreate: false,
        branchOrigin: 'created',
        worktreePath: path.join(workspacePath, 'api'),
        progress: 'complete',
      },
    ],
    auxiliaryEntries: [],
  }
}

function legacyBootstrapManifest(): BranchWorkspaceManifest {
  const manifest = existingManifest()
  Object.assign(manifest.repositories[0]!, {
    worktreeBootstrap: {
      kind: 'materialize',
      selections: [{ path: 'node_modules', mode: 'symlink' }],
    },
    bootstrapProgress: 'failed',
    bootstrapLastError: 'link failed',
  })
  return manifest
}

function repairDependencies(current: BranchWorkspaceManifest) {
  const deps = dependencies({
    [path.join(ROOT, 'api')]: snapshot(branch('main'), branch(BRANCH, current.repositories[0]!.worktreePath)),
  })
  deps.readConfig.mockResolvedValue({ kind: 'ready', config: { repo: ['api'] } })
  deps.readManifests.mockResolvedValue({ kind: 'ready', manifests: [current] })
  deps.inspectPath.mockImplementation(async (_rootId, candidatePath) => ({
    ...missing(candidatePath),
    exists: true,
    kind: 'directory',
    resolvedPath: candidatePath,
  }))
  return deps
}

describe('branch workspace create planner', () => {
  test('plans synchronized local and remote creation bases', async () => {
    const deps = dependencies({
      [path.join(ROOT, 'api')]: snapshot(trackedBranch('main', 'origin/main')),
      [path.join(ROOT, 'web')]: snapshot(branch('main')),
    })
    deps.getRemoteBranches.mockImplementation(async (repoId: string) =>
      path.basename(repoId) === 'web' ? ['upstream/release'] : [],
    )

    const result = await buildBranchWorkspacePlan(
      ROOT,
      {
        operation: 'create',
        branch: BRANCH,
        repositories: [
          {
            repositoryName: 'api',
            creationBase: { kind: 'localBranch', branch: 'main' },
            syncBeforeCreate: true,
          },
          {
            repositoryName: 'web',
            creationBase: { kind: 'remoteBranch', remoteRef: 'upstream/release' },
            syncBeforeCreate: true,
          },
        ],
        auxiliaryEntries: [],
      },
      deps,
    )

    expect(result).toMatchObject({
      ok: true,
      plan: {
        repositories: [
          {
            repositoryName: 'api',
            creationBase: { kind: 'localBranch', branch: 'main' },
            syncBeforeCreate: true,
            mode: {
              kind: 'newBranch',
              newBranch: BRANCH,
              creationBase: { kind: 'localBranch', branch: 'main' },
            },
          },
          {
            repositoryName: 'web',
            creationBase: { kind: 'remoteBranch', remoteRef: 'upstream/release' },
            syncBeforeCreate: true,
            mode: {
              kind: 'newBranch',
              newBranch: BRANCH,
              creationBase: { kind: 'remoteBranch', remoteRef: 'upstream/release' },
            },
          },
        ],
      },
    })
  })

  test('uses a pre-existing target branch and its upstream instead of the submitted creation base', async () => {
    const deps = dependencies({
      [path.join(ROOT, 'api')]: snapshot(branch('main'), trackedBranch(BRANCH, `origin/${BRANCH}`)),
    })
    deps.readConfig.mockResolvedValue({ kind: 'ready', config: { repo: ['api'] } })
    deps.getRemoteBranches.mockResolvedValue(['upstream/release'])

    const result = await buildBranchWorkspacePlan(
      ROOT,
      {
        operation: 'create',
        branch: BRANCH,
        repositories: [
          {
            repositoryName: 'api',
            creationBase: { kind: 'remoteBranch', remoteRef: 'upstream/release' },
            syncBeforeCreate: true,
          },
        ],
        auxiliaryEntries: [],
      },
      deps,
    )

    expect(result).toMatchObject({
      ok: true,
      plan: {
        repositories: [
          {
            repositoryName: 'api',
            creationBase: { kind: 'localBranch', branch: BRANCH },
            syncBeforeCreate: true,
            mode: { kind: 'existingBranch', branch: BRANCH },
            branchOrigin: 'pre-existing',
          },
        ],
      },
    })
  })

  test('rejects requested synchronization without a usable local upstream', async () => {
    const deps = dependencies({ [path.join(ROOT, 'api')]: snapshot(branch('main')) })
    deps.readConfig.mockResolvedValue({ kind: 'ready', config: { repo: ['api'] } })

    await expect(
      buildBranchWorkspacePlan(
        ROOT,
        {
          operation: 'create',
          branch: BRANCH,
          repositories: [
            {
              repositoryName: 'api',
              creationBase: { kind: 'localBranch', branch: 'main' },
              syncBeforeCreate: true,
            },
          ],
          auxiliaryEntries: [],
        },
        deps,
      ),
    ).resolves.toEqual({ ok: false, message: 'error.worktree-sync-unavailable' })
  })

  test('rejects an unknown remote creation base', async () => {
    const deps = dependencies({ [path.join(ROOT, 'api')]: snapshot(branch('main')) })
    deps.readConfig.mockResolvedValue({ kind: 'ready', config: { repo: ['api'] } })
    deps.getRemoteBranches.mockResolvedValue(['origin/main'])

    await expect(
      buildBranchWorkspacePlan(
        ROOT,
        {
          operation: 'create',
          branch: BRANCH,
          repositories: [
            {
              repositoryName: 'api',
              creationBase: { kind: 'remoteBranch', remoteRef: 'upstream/release' },
              syncBeforeCreate: true,
            },
          ],
          auxiliaryEntries: [],
        },
        deps,
      ),
    ).resolves.toEqual({ ok: false, message: 'workspace.branch-workspace.base-unavailable' })
  })

  test('plans configured-order repositories with different bases and branch provenance', async () => {
    const deps = dependencies({
      [path.join(ROOT, 'api')]: snapshot(branch('main')),
      [path.join(ROOT, 'web')]: snapshot(branch('develop')),
    })

    const result = await buildBranchWorkspacePlan(
      ROOT,
      {
        operation: 'create',
        branch: BRANCH,
        repositories: [
          { repositoryName: 'web', baseBranch: 'develop' },
          { repositoryName: 'api', baseBranch: 'main' },
        ],
        auxiliaryEntries: [],
      },
      deps,
    )

    expect(result).toMatchObject({
      ok: true,
      plan: {
        operation: 'create',
        branch: BRANCH,
        directoryName: 'hob-feature-auth',
        repositories: [
          {
            repositoryName: 'api',
            mode: {
              kind: 'newBranch',
              newBranch: BRANCH,
              creationBase: { kind: 'localBranch', branch: 'main' },
            },
            branchOrigin: 'created',
          },
          {
            repositoryName: 'web',
            mode: {
              kind: 'newBranch',
              newBranch: BRANCH,
              creationBase: { kind: 'localBranch', branch: 'develop' },
            },
            branchOrigin: 'created',
          },
        ],
      },
    })
    if (!result.ok) throw new Error('Expected a create plan')
    expect(result.plan.steps.find((step) => step.kind === 'create-directory')).toMatchObject({
      label: 'hob-feature-auth',
    })
  })

  test('plans repositories concurrently from lightweight snapshots while preserving configured order', async () => {
    const repoSnapshots: Record<string, RepoSnapshot> = {
      [path.join(ROOT, 'api')]: snapshot(branch('main')),
      [path.join(ROOT, 'web')]: snapshot(branch('develop')),
    }
    const deps = dependencies(repoSnapshots)
    let activeSnapshots = 0
    let maxActiveSnapshots = 0
    deps.getSnapshot.mockImplementation(async (repoId: string) => {
      activeSnapshots += 1
      maxActiveSnapshots = Math.max(maxActiveSnapshots, activeSnapshots)
      await new Promise((resolve) => setTimeout(resolve, repoId.endsWith('api') ? 20 : 5))
      activeSnapshots -= 1
      return repoSnapshots[repoId] ?? null
    })

    const result = await buildBranchWorkspacePlan(
      ROOT,
      {
        operation: 'create',
        branch: BRANCH,
        repositories: [
          { repositoryName: 'web', baseBranch: 'develop' },
          { repositoryName: 'api', baseBranch: 'main' },
        ],
        auxiliaryEntries: [],
      },
      deps,
    )

    if (!result.ok) throw new Error('Expected a create plan')
    expect(maxActiveSnapshots).toBe(2)
    expect(result.plan.repositories.map((repository) => repository.repositoryName)).toEqual(['api', 'web'])
    expect(deps.getSnapshot).toHaveBeenNthCalledWith(1, path.join(ROOT, 'api'), undefined, {
      includeWorktreeStatus: false,
      includeRemote: false,
    })
    expect(deps.getSnapshot).toHaveBeenNthCalledWith(2, path.join(ROOT, 'web'), undefined, {
      includeWorktreeStatus: false,
      includeRemote: false,
    })
  })

  test('uses an existing branch and recognizes only its exact expected worktree as satisfied', async () => {
    const expectedApi = path.join(ROOT, 'hob-feature-auth', 'api')
    const expectedWeb = path.join(ROOT, 'hob-feature-auth', 'web')
    const deps = dependencies({
      [path.join(ROOT, 'api')]: snapshot(branch('main'), branch(BRANCH)),
      [path.join(ROOT, 'web')]: snapshot(branch('develop'), branch(BRANCH, expectedWeb)),
    })

    const result = await buildBranchWorkspacePlan(
      ROOT,
      {
        operation: 'create',
        branch: BRANCH,
        repositories: [
          { repositoryName: 'api', baseBranch: 'main' },
          { repositoryName: 'web', baseBranch: 'develop' },
        ],
        auxiliaryEntries: [],
      },
      deps,
    )

    expect(result).toMatchObject({
      ok: true,
      plan: {
        repositories: [
          {
            repositoryName: 'api',
            worktreePath: expectedApi,
            mode: { kind: 'existingBranch', branch: BRANCH },
            branchOrigin: 'pre-existing',
            satisfied: false,
          },
          {
            repositoryName: 'web',
            worktreePath: expectedWeb,
            branchOrigin: 'pre-existing',
            satisfied: true,
          },
        ],
      },
    })
  })

  test('recognizes an existing member worktree across Windows and WSL path spellings', async () => {
    const rootId = process.platform === 'win32' ? 'C:\\Workspace' : '/mnt/c/Workspace'
    const workspacePath = path.join(rootId, 'hobgoblin-feature-auth')
    const expectedPath = path.join(workspacePath, 'api')
    const gitPath =
      process.platform === 'win32'
        ? '/mnt/c/Workspace/hobgoblin-feature-auth/api'
        : 'C:\\Workspace\\hobgoblin-feature-auth\\api'
    const repoId = path.join(rootId, 'api')
    const deps = dependencies({ [repoId]: snapshot(branch('main'), branch(BRANCH, gitPath)) })
    deps.readConfig.mockResolvedValue({ kind: 'ready', config: { repo: ['api'] } })

    const result = await buildBranchWorkspacePlan(
      rootId,
      {
        operation: 'create',
        branch: BRANCH,
        repositories: [{ repositoryName: 'api', baseBranch: 'main' }],
        auxiliaryEntries: [],
      },
      deps,
    )

    if (!result.ok) throw new Error(result.message)
    expect(result).toMatchObject({
      ok: true,
      plan: {
        repositories: [{ repositoryName: 'api', worktreePath: expectedPath, satisfied: true }],
        manifest: { repositories: [{ repositoryName: 'api', progress: 'complete' }] },
      },
    })
  })

  test('blocks unavailable members, occupied targets, and branches checked out elsewhere', async () => {
    const unavailable = dependencies({ [path.join(ROOT, 'api')]: null })
    unavailable.readConfig.mockResolvedValue({ kind: 'ready', config: { repo: ['api'] } })
    await expect(
      buildBranchWorkspacePlan(
        ROOT,
        {
          operation: 'create',
          branch: BRANCH,
          repositories: [{ repositoryName: 'api', baseBranch: 'main' }],
          auxiliaryEntries: [],
        },
        unavailable,
      ),
    ).resolves.toEqual({ ok: false, message: 'workspace.branch-workspace.repository-unavailable' })

    const occupied = dependencies({ [path.join(ROOT, 'api')]: snapshot(branch('main')) })
    occupied.readConfig.mockResolvedValue({ kind: 'ready', config: { repo: ['api'] } })
    occupied.pathExists.mockResolvedValue(true)
    await expect(
      buildBranchWorkspacePlan(
        ROOT,
        {
          operation: 'create',
          branch: BRANCH,
          repositories: [{ repositoryName: 'api', baseBranch: 'main' }],
          auxiliaryEntries: [],
        },
        occupied,
      ),
    ).resolves.toEqual({ ok: false, message: 'workspace.branch-workspace.target-exists' })

    const elsewhere = dependencies({
      [path.join(ROOT, 'api')]: snapshot(branch('main'), branch(BRANCH, path.join(ROOT, 'legacy-api-auth'))),
    })
    elsewhere.readConfig.mockResolvedValue({ kind: 'ready', config: { repo: ['api'] } })
    await expect(
      buildBranchWorkspacePlan(
        ROOT,
        {
          operation: 'create',
          branch: BRANCH,
          repositories: [{ repositoryName: 'api', baseBranch: 'main' }],
          auxiliaryEntries: [],
        },
        elsewhere,
      ),
    ).resolves.toEqual({ ok: false, message: 'workspace.branch-workspace.worktree-elsewhere' })
  })

  test('extends an existing item additively and rejects changes to fixed members', async () => {
    const current = existingManifest()
    const deps = dependencies({
      [path.join(ROOT, 'api')]: snapshot(branch('main'), branch(BRANCH, current.repositories[0]!.worktreePath)),
      [path.join(ROOT, 'web')]: snapshot(trackedBranch('develop', 'origin/develop')),
    })
    deps.readManifests.mockResolvedValue({ kind: 'ready', manifests: [current] })
    deps.inspectPath.mockImplementation(async (_rootId, candidatePath) =>
      candidatePath === current.path
        ? { ...missing(candidatePath), exists: true, kind: 'directory', resolvedPath: candidatePath }
        : missing(candidatePath),
    )

    const extended = await buildBranchWorkspacePlan(
      ROOT,
      {
        operation: 'create',
        branch: BRANCH,
        repositories: [
          {
            repositoryName: 'web',
            creationBase: { kind: 'localBranch', branch: 'develop' },
            syncBeforeCreate: true,
          },
        ],
        auxiliaryEntries: [],
      },
      deps,
    )
    expect(extended).toMatchObject({
      ok: true,
      plan: {
        operation: 'extend',
        branchWorkspaceId: current.id,
        repositories: [{ repositoryName: 'web', syncBeforeCreate: true }],
      },
    })

    await expect(
      buildBranchWorkspacePlan(
        ROOT,
        {
          operation: 'create',
          branch: BRANCH,
          repositories: [{ repositoryName: 'api', baseBranch: 'release' }],
          auxiliaryEntries: [],
        },
        deps,
      ),
    ).resolves.toEqual({ ok: false, message: 'workspace.branch-workspace.member-fixed' })
  })

  test('requires only outside-root approval when no repository dependencies are selected', async () => {
    const sourceWorktreePath = path.join(ROOT, 'api-main')
    const deps = dependencies({ [path.join(ROOT, 'api')]: snapshot(branch('main', sourceWorktreePath)) })
    deps.readConfig.mockResolvedValue({ kind: 'ready', config: { repo: ['api'] } })
    deps.inspectPath.mockImplementation(async (_rootId, candidatePath) => {
      if (candidatePath === path.join(ROOT, 'README.md')) {
        return {
          path: candidatePath,
          exists: true,
          kind: 'symlink',
          resolvedPath: '/opt/shared/README.md',
          linkTarget: '/opt/shared/README.md',
          directChild: true,
          outsideRoot: true,
        }
      }
      return missing(candidatePath)
    })
    const request = {
      operation: 'create' as const,
      branch: BRANCH,
      repositories: [{ repositoryName: 'api', baseBranch: 'main' }],
      auxiliaryEntries: [{ name: 'README.md', mode: 'copy' as const }],
    }

    const first = await buildBranchWorkspacePlan(ROOT, request, deps)
    const second = await buildBranchWorkspacePlan(ROOT, request, deps)

    expect(first).toMatchObject({
      ok: true,
      plan: {
        requiredApprovals: ['outside-root-source'],
        repositories: [
          {
            worktreeBootstrap: { kind: 'skip' },
          },
        ],
        auxiliaryEntries: [
          {
            name: 'README.md',
            resolvedSourcePath: '/opt/shared/README.md',
            outsideRoot: true,
          },
        ],
      },
    })
    expect(second).toMatchObject(first)
    if (first.ok && second.ok) expect(second.plan.token).toBe(first.plan.token)
  })

  test('plans selected deep repository dependencies without candidate preflight', async () => {
    const sourceWorktreePath = path.join(ROOT, 'api-main')
    const deps = dependencies({ [path.join(ROOT, 'api')]: snapshot(branch('main', sourceWorktreePath)) })
    deps.readConfig.mockResolvedValue({ kind: 'ready', config: { repo: ['api'] } })

    const result = await buildBranchWorkspacePlan(
      ROOT,
      {
        operation: 'create',
        branch: BRANCH,
        repositories: [
          {
            repositoryName: 'api',
            baseBranch: 'main',
            worktreeBootstrap: {
              kind: 'materialize',
              selections: [{ path: 'backend/.venv', mode: 'symlink' }],
              sourceWorktreePath,
            },
          },
        ],
        auxiliaryEntries: [],
      },
      deps,
    )

    expect(result).toMatchObject({
      ok: true,
      plan: {
        repositories: [
          {
            repositoryName: 'api',
            worktreeBootstrap: {
              kind: 'materialize',
              selections: [{ path: 'backend/.venv', mode: 'symlink' }],
              sourceWorktreePath,
            },
            confirmationRequired: false,
          },
        ],
        requiredApprovals: [],
      },
    })
  })

  test('plans repository dependencies from another known non-base worktree', async () => {
    const repoId = path.join(ROOT, 'api')
    const alternativeSourcePath = path.join(ROOT, 'api-feature')
    const deps = dependencies({
      [repoId]: snapshot(
        branch('main', repoId),
        branch('develop', path.join(ROOT, 'api-develop')),
        branch('feature/source', alternativeSourcePath),
      ),
    })
    deps.readConfig.mockResolvedValue({ kind: 'ready', config: { repo: ['api'] } })

    const result = await buildBranchWorkspacePlan(
      ROOT,
      {
        operation: 'create',
        branch: BRANCH,
        repositories: [
          {
            repositoryName: 'api',
            baseBranch: 'develop',
            worktreeBootstrap: {
              kind: 'materialize',
              selections: [{ path: '.env', mode: 'copy' }],
              sourceWorktreePath: alternativeSourcePath,
            },
          },
        ],
        auxiliaryEntries: [],
      },
      deps,
    )

    expect(result).toMatchObject({
      ok: true,
      plan: {
        repositories: [
          {
            worktreeBootstrap: {
              kind: 'materialize',
              sourceWorktreePath: alternativeSourcePath,
            },
          },
        ],
      },
    })
  })

  test('downgrades a repository dependency source that is not a known worktree to skip', async () => {
    const repoId = path.join(ROOT, 'api')
    const deps = dependencies({
      [repoId]: snapshot(branch('main', repoId), branch('develop', path.join(ROOT, 'api-develop'))),
    })
    deps.readConfig.mockResolvedValue({ kind: 'ready', config: { repo: ['api'] } })

    await expect(
      buildBranchWorkspacePlan(
        ROOT,
        {
          operation: 'create',
          branch: BRANCH,
          repositories: [
            {
              repositoryName: 'api',
              baseBranch: 'develop',
              worktreeBootstrap: {
                kind: 'materialize',
                selections: [{ path: '.env', mode: 'copy' }],
                sourceWorktreePath: path.join(ROOT, 'unknown-source'),
              },
            },
          ],
          auxiliaryEntries: [],
        },
        deps,
      ),
    ).resolves.toMatchObject({
      ok: true,
      plan: {
        repositories: [{ worktreeBootstrap: { kind: 'skip' } }],
      },
    })
  })

  test('plans repository dependencies from a detached worktree source', async () => {
    const repoId = path.join(ROOT, 'api')
    const detachedSourcePath = path.join(ROOT, 'api-detached')
    const deps = dependencies({ [repoId]: snapshot(branch('main', repoId)) })
    deps.readConfig.mockResolvedValue({ kind: 'ready', config: { repo: ['api'] } })
    deps.getWorktrees.mockResolvedValue([
      worktree(repoId, { branch: 'main', isPrimary: true }),
      worktree(detachedSourcePath, { head: 'abcdef0' }),
    ])

    const result = await buildBranchWorkspacePlan(
      ROOT,
      {
        operation: 'create',
        branch: BRANCH,
        repositories: [
          {
            repositoryName: 'api',
            baseBranch: 'main',
            worktreeBootstrap: {
              kind: 'materialize',
              selections: [{ path: 'frontend/node_modules', mode: 'copy' }],
              sourceWorktreePath: detachedSourcePath,
            },
          },
        ],
        auxiliaryEntries: [],
      },
      deps,
    )

    expect(result).toMatchObject({
      ok: true,
      plan: {
        repositories: [
          {
            worktreeBootstrap: {
              kind: 'materialize',
              selections: [{ path: 'frontend/node_modules', mode: 'copy' }],
              sourceWorktreePath: detachedSourcePath,
            },
          },
        ],
      },
    })
  })
})

describe('branch workspace repair planner', () => {
  test('plans member repairs concurrently from lightweight snapshots while preserving manifest order', async () => {
    const current = existingManifest()
    current.operation = { kind: 'repair' }
    current.repositories.push({
      ...current.repositories[0]!,
      repositoryName: 'web',
      worktreePath: path.join(current.path, 'web'),
    })
    const repoSnapshots: Record<string, RepoSnapshot> = {
      [path.join(ROOT, 'api')]: snapshot(branch('main'), branch(BRANCH, current.repositories[0]!.worktreePath)),
      [path.join(ROOT, 'web')]: snapshot(branch('main'), branch(BRANCH, current.repositories[1]!.worktreePath)),
    }
    const deps = dependencies(repoSnapshots)
    deps.readManifests.mockResolvedValue({ kind: 'ready', manifests: [current] })
    deps.inspectPath.mockImplementation(async (_rootId, candidatePath) => ({
      ...missing(candidatePath),
      exists: true,
      kind: 'directory',
      resolvedPath: candidatePath,
    }))
    let activeSnapshots = 0
    let maxActiveSnapshots = 0
    deps.getSnapshot.mockImplementation(async (repoId: string) => {
      activeSnapshots += 1
      maxActiveSnapshots = Math.max(maxActiveSnapshots, activeSnapshots)
      await new Promise((resolve) => setTimeout(resolve, repoId.endsWith('api') ? 20 : 5))
      activeSnapshots -= 1
      return repoSnapshots[repoId] ?? null
    })

    const result = await buildBranchWorkspacePlan(ROOT, { operation: 'repair', branchWorkspaceId: current.id }, deps)

    if (!result.ok) throw new Error('Expected a repair plan')
    expect(maxActiveSnapshots).toBe(2)
    expect(deps.getSnapshot).toHaveBeenCalledWith(path.join(ROOT, 'api'), undefined, {
      includeWorktreeStatus: false,
      includeRemote: false,
    })
    expect(deps.getSnapshot).toHaveBeenCalledWith(path.join(ROOT, 'web'), undefined, {
      includeWorktreeStatus: false,
      includeRemote: false,
    })
    expect(result.plan.repositories.map((repository) => repository.repositoryName)).toEqual(['api', 'web'])
  })

  test('preserves an earlier structured repair error when a later concurrent check throws', async () => {
    const current = existingManifest()
    current.operation = { kind: 'repair' }
    current.repositories.push({
      ...current.repositories[0]!,
      repositoryName: 'web',
      worktreePath: path.join(current.path, 'web'),
    })
    const deps = dependencies({})
    deps.readManifests.mockResolvedValue({ kind: 'ready', manifests: [current] })
    deps.getSnapshot.mockImplementation(async (repoId) => (repoId.endsWith('api') ? null : snapshot(branch('main'))))
    deps.inspectPath.mockImplementation(async (_rootId, candidatePath) =>
      candidatePath === current.path
        ? { ...missing(candidatePath), exists: true, kind: 'directory', resolvedPath: candidatePath }
        : missing(candidatePath),
    )

    await expect(
      buildBranchWorkspacePlan(ROOT, { operation: 'repair', branchWorkspaceId: current.id }, deps),
    ).resolves.toEqual({ ok: false, message: 'workspace.branch-workspace.repository-unavailable' })
  })

  test('rethrows repair cancellation after concurrent checks settle', async () => {
    const current = existingManifest()
    current.operation = { kind: 'repair' }
    const deps = repairDependencies(current)
    const controller = new AbortController()
    controller.abort()

    await expect(
      buildBranchWorkspacePlan(ROOT, { operation: 'repair', branchWorkspaceId: current.id }, deps, controller.signal),
    ).rejects.toThrow()
  })

  test('does not recreate released auxiliary content during repair', async () => {
    const current = existingManifest()
    const deps = repairDependencies(current)

    await expect(
      buildBranchWorkspacePlan(ROOT, { operation: 'repair', branchWorkspaceId: current.id }, deps),
    ).resolves.toEqual({ ok: false, message: 'workspace.branch-workspace.nothing-to-repair' })
    expect(deps.inspectPath).not.toHaveBeenCalledWith(ROOT, path.join(current.path, 'README.md'), undefined)
  })

  test('clears an incomplete operation after all one-time auxiliary work was released', async () => {
    const current = existingManifest()
    current.operation = { kind: 'create' }
    const deps = repairDependencies(current)

    await expect(
      buildBranchWorkspacePlan(ROOT, { operation: 'repair', branchWorkspaceId: current.id }, deps),
    ).resolves.toMatchObject({
      ok: true,
      plan: { operation: 'repair', auxiliaryEntries: [], steps: [] },
    })
  })

  test('releases retained auxiliary intent without inspecting dependency paths', async () => {
    const current = manifestWithAuxiliaryEntries()
    current.auxiliaryEntries = [
      { ...current.auxiliaryEntries[0]!, progress: 'pending' },
      { ...current.auxiliaryEntries[1]!, progress: 'failed', lastError: 'copy failed' },
    ]
    const deps = repairDependencies(current)

    await expect(
      buildBranchWorkspacePlan(ROOT, { operation: 'repair', branchWorkspaceId: current.id }, deps),
    ).resolves.toMatchObject({
      ok: true,
      plan: {
        operation: 'repair',
        auxiliaryEntries: [],
        manifest: { auxiliaryEntries: [] },
        requiredApprovals: [],
        steps: [],
      },
    })
    expect(deps.inspectPath).toHaveBeenCalledTimes(1)
    expect(deps.inspectPath).toHaveBeenCalledWith(ROOT, current.path, undefined)
  })

  test('ignores legacy dependency recovery fields for an existing member worktree', async () => {
    const current = legacyBootstrapManifest()
    const deps = dependencies({
      [path.join(ROOT, 'api')]: snapshot(branch('main'), branch(BRANCH, current.repositories[0]!.worktreePath)),
    })
    deps.readConfig.mockResolvedValue({ kind: 'ready', config: { repo: ['api'] } })
    deps.readManifests.mockResolvedValue({ kind: 'ready', manifests: [current] })
    deps.inspectPath.mockImplementation(async (_rootId, candidatePath) => ({
      ...missing(candidatePath),
      exists: true,
      kind: 'directory',
      resolvedPath: candidatePath,
    }))

    await expect(
      buildBranchWorkspacePlan(ROOT, { operation: 'repair', branchWorkspaceId: current.id }, deps),
    ).resolves.toEqual({ ok: false, message: 'workspace.branch-workspace.nothing-to-repair' })
  })

  test('recreates a missing legacy member worktree without dependency bootstrap', async () => {
    const current = legacyBootstrapManifest()
    current.operation = { kind: 'create' }
    const deps = dependencies({ [path.join(ROOT, 'api')]: snapshot(branch('main')) })
    deps.readConfig.mockResolvedValue({ kind: 'ready', config: { repo: ['api'] } })
    deps.readManifests.mockResolvedValue({ kind: 'ready', manifests: [current] })
    deps.inspectPath.mockImplementation(async (_rootId, candidatePath) =>
      candidatePath === current.path
        ? { ...missing(candidatePath), exists: true, kind: 'directory', resolvedPath: candidatePath }
        : missing(candidatePath),
    )

    await expect(
      buildBranchWorkspacePlan(ROOT, { operation: 'repair', branchWorkspaceId: current.id }, deps),
    ).resolves.toMatchObject({
      ok: true,
      plan: {
        requiredApprovals: [],
        repositories: [{ action: 'create-worktree', worktreeBootstrap: { kind: 'skip' } }],
        steps: [{ kind: 'create-worktree', repositoryName: 'api' }],
      },
    })
  })

  test('repairs only missing roots and repository worktrees while releasing auxiliary intent', async () => {
    const current = manifestWithAuxiliaryEntries()
    const deps = dependencies({
      [path.join(ROOT, 'api')]: snapshot(branch('main'), branch(BRANCH)),
    })
    deps.readConfig.mockResolvedValue({ kind: 'ready', config: { repo: ['api'] } })
    deps.readManifests.mockResolvedValue({ kind: 'ready', manifests: [current] })
    deps.inspectPath.mockImplementation(async (_rootId, candidatePath) => {
      if (candidatePath === path.join(ROOT, '.env') || candidatePath === path.join(ROOT, 'README.md')) {
        return {
          ...missing(candidatePath),
          exists: true,
          kind: 'file',
          resolvedPath: candidatePath,
          directChild: true,
        }
      }
      return missing(candidatePath)
    })

    const result = await buildBranchWorkspacePlan(ROOT, { operation: 'repair', branchWorkspaceId: current.id }, deps)

    expect(result).toMatchObject({
      ok: true,
      plan: {
        operation: 'repair',
        requiredApprovals: [],
        auxiliaryEntries: [],
        manifest: { auxiliaryEntries: [] },
        steps: [
          { kind: 'create-directory', label: 'hobgoblin-feature-auth' },
          { kind: 'create-worktree', repositoryName: 'api' },
        ],
      },
    })
    expect(deps.inspectPath).not.toHaveBeenCalledWith(ROOT, path.join(ROOT, '.env'), undefined)
    expect(deps.inspectPath).not.toHaveBeenCalledWith(ROOT, path.join(ROOT, 'README.md'), undefined)
    expect(deps.inspectPath).not.toHaveBeenCalledWith(ROOT, path.join(current.path, '.env'), undefined)
    expect(deps.inspectPath).not.toHaveBeenCalledWith(ROOT, path.join(current.path, 'README.md'), undefined)
  })

  test('ignores occupied auxiliary targets but refuses to claim a worktree checked out elsewhere', async () => {
    const current = manifestWithAuxiliaryEntries()
    current.auxiliaryEntries[1] = { ...current.auxiliaryEntries[1]!, progress: 'failed' }
    const occupied = dependencies({
      [path.join(ROOT, 'api')]: snapshot(branch('main'), branch(BRANCH)),
    })
    occupied.readConfig.mockResolvedValue({ kind: 'ready', config: { repo: ['api'] } })
    occupied.readManifests.mockResolvedValue({ kind: 'ready', manifests: [current] })
    occupied.inspectPath.mockImplementation(async (_rootId, candidatePath) => {
      if (candidatePath === current.path) {
        return { ...missing(candidatePath), exists: true, kind: 'directory', resolvedPath: candidatePath }
      }
      if (candidatePath === path.join(ROOT, '.env') || candidatePath === path.join(ROOT, 'README.md')) {
        return {
          ...missing(candidatePath),
          exists: true,
          kind: 'file',
          resolvedPath: candidatePath,
          directChild: true,
        }
      }
      if (candidatePath === path.join(current.path, 'README.md')) {
        return { ...missing(candidatePath), exists: true, kind: 'file', resolvedPath: candidatePath }
      }
      return missing(candidatePath)
    })
    await expect(
      buildBranchWorkspacePlan(ROOT, { operation: 'repair', branchWorkspaceId: current.id }, occupied),
    ).resolves.toMatchObject({
      ok: true,
      plan: { auxiliaryEntries: [], manifest: { auxiliaryEntries: [] }, steps: [{ kind: 'create-worktree' }] },
    })

    const elsewhere = dependencies({
      [path.join(ROOT, 'api')]: snapshot(branch('main'), branch(BRANCH, path.join(ROOT, 'elsewhere'))),
    })
    elsewhere.readConfig.mockResolvedValue({ kind: 'ready', config: { repo: ['api'] } })
    elsewhere.readManifests.mockResolvedValue({ kind: 'ready', manifests: [current] })
    elsewhere.inspectPath.mockImplementation(async (_rootId, candidatePath) =>
      candidatePath === current.path
        ? { ...missing(candidatePath), exists: true, kind: 'directory', resolvedPath: candidatePath }
        : missing(candidatePath),
    )
    await expect(
      buildBranchWorkspacePlan(ROOT, { operation: 'repair', branchWorkspaceId: current.id }, elsewhere),
    ).resolves.toEqual({ ok: false, message: 'workspace.branch-workspace.worktree-elsewhere' })
  })
})

describe('branch workspace remove planner', () => {
  test('builds a force-removal plan from an interrupted manifest after materialization drift', async () => {
    const current = existingManifest()
    current.operation = { kind: 'create' }
    current.repositories[0] = {
      ...current.repositories[0]!,
      progress: 'failed',
      lastError: 'interrupted',
    }
    const deps = dependencies({ [path.join(ROOT, 'api')]: snapshot(branch('main'), branch(BRANCH)) })
    deps.readConfig.mockResolvedValue({ kind: 'ready', config: { repo: ['api'] } })
    deps.readManifests.mockResolvedValue({ kind: 'ready', manifests: [current] })
    deps.inspectPath.mockImplementation(async (_rootId, candidatePath) => missing(candidatePath))

    const result = await buildBranchWorkspacePlan(
      ROOT,
      {
        operation: 'remove',
        branchWorkspaceId: current.id,
        alsoDeleteBranch: false,
        alsoDeleteUpstream: false,
      },
      deps,
    )

    expect(result).toMatchObject({
      ok: true,
      plan: {
        operation: 'remove',
        branchWorkspaceId: current.id,
        repositories: [{ repositoryName: 'api', action: 'satisfied' }],
      },
    })
  })

  test.each([
    [{ isPrimary: true }, 'workspace.branch-workspace.primary-worktree'],
    [{ isLocked: true }, 'workspace.branch-workspace.locked-worktree'],
  ])('blocks unsafe worktrees', async (worktreeState, message) => {
    const current = existingManifest()
    const unsafeBranch = {
      ...branch('release/previous', current.repositories[0]!.worktreePath),
      worktree: { path: current.repositories[0]!.worktreePath, ...worktreeState },
    }
    const deps = dependencies({ [path.join(ROOT, 'api')]: snapshot(branch(BRANCH), unsafeBranch) })
    deps.readConfig.mockResolvedValue({ kind: 'ready', config: { repo: ['api'] } })
    deps.readManifests.mockResolvedValue({ kind: 'ready', manifests: [current] })
    deps.inspectPath.mockImplementation(async (_rootId, candidatePath) =>
      candidatePath === current.path
        ? { ...missing(candidatePath), exists: true, kind: 'directory', resolvedPath: candidatePath }
        : missing(candidatePath),
    )

    await expect(
      buildBranchWorkspacePlan(
        ROOT,
        {
          operation: 'remove',
          branchWorkspaceId: current.id,
          alsoDeleteBranch: false,
          alsoDeleteUpstream: false,
        },
        deps,
      ),
    ).resolves.toEqual({ ok: false, message })
  })

  test('removes the registered worktree at the member path even when its branch drifted', async () => {
    const current = existingManifest()
    const actualBranch = {
      ...branch('release/previous', current.repositories[0]!.worktreePath),
      worktree: {
        path: current.repositories[0]!.worktreePath,
        summary: { dirty: false, changeCount: 0 },
      },
    }
    const deps = dependencies({
      [path.join(ROOT, 'api')]: snapshot(branch(BRANCH, path.join(ROOT, 'elsewhere')), actualBranch),
    })
    deps.readConfig.mockResolvedValue({ kind: 'ready', config: { repo: ['api'] } })
    deps.readManifests.mockResolvedValue({ kind: 'ready', manifests: [current] })
    deps.inspectPath.mockImplementation(async (_rootId, candidatePath) => ({
      ...missing(candidatePath),
      exists: candidatePath === current.path,
      kind: candidatePath === current.path ? 'directory' : 'missing',
      ...(candidatePath === current.path ? { resolvedPath: candidatePath } : {}),
    }))

    const result = await buildBranchWorkspacePlan(
      ROOT,
      {
        operation: 'remove',
        branchWorkspaceId: current.id,
        alsoDeleteBranch: true,
        alsoDeleteUpstream: false,
      },
      { ...deps, listChildren: vi.fn(async () => ['api']) },
    )

    expect(result).toMatchObject({
      ok: true,
      plan: {
        repositories: [
          {
            repositoryName: 'api',
            targetBranch: BRANCH,
            checkedOutBranch: 'release/previous',
            action: 'remove-worktree',
            worktreePresent: true,
            deleteBranch: false,
          },
        ],
      },
    })
  })

  test('treats non-worktree content at a declared member path as unmanaged content', async () => {
    const current = existingManifest()
    const deps = dependencies({ [path.join(ROOT, 'api')]: snapshot(branch(BRANCH)) })
    deps.readConfig.mockResolvedValue({ kind: 'ready', config: { repo: ['api'] } })
    deps.readManifests.mockResolvedValue({ kind: 'ready', manifests: [current] })
    deps.inspectPath.mockImplementation(async (_rootId, candidatePath) => ({
      ...missing(candidatePath),
      exists: true,
      kind: candidatePath === current.path ? 'directory' : 'file',
      resolvedPath: candidatePath,
    }))

    const result = await buildBranchWorkspacePlan(
      ROOT,
      {
        operation: 'remove',
        branchWorkspaceId: current.id,
        alsoDeleteBranch: false,
        alsoDeleteUpstream: false,
      },
      { ...deps, listChildren: vi.fn(async () => ['api']) },
    )

    expect(result).toMatchObject({
      ok: true,
      plan: {
        repositories: [{ repositoryName: 'api', action: 'satisfied', worktreePresent: false }],
        unmanagedEntries: ['api'],
        requiredApprovals: ['unmanaged-content'],
      },
    })
  })

  test('plans removal for a dirty worktree without reading repository status', async () => {
    const current = existingManifest()
    const dirtyBranch = {
      ...branch(BRANCH, current.repositories[0]!.worktreePath),
      worktree: {
        path: current.repositories[0]!.worktreePath,
        summary: { dirty: true, changeCount: 1 },
      },
    }
    const deps = dependencies({ [path.join(ROOT, 'api')]: snapshot(branch('main'), dirtyBranch) })
    const getStatus = vi.fn(async () => [
      {
        path: current.repositories[0]!.worktreePath,
        branch: BRANCH,
        isMain: false,
        entries: [{ x: 'M', y: ' ', path: 'changed.ts' }],
      },
    ])
    deps.readConfig.mockResolvedValue({ kind: 'ready', config: { repo: ['api'] } })
    deps.readManifests.mockResolvedValue({ kind: 'ready', manifests: [current] })
    deps.inspectPath.mockImplementation(async (_rootId, candidatePath) => ({
      ...missing(candidatePath),
      exists: true,
      kind: 'directory',
      resolvedPath: candidatePath,
    }))

    const dependenciesWithStatus = { ...deps, getStatus, listChildren: vi.fn(async () => ['api']) }
    const result = await buildBranchWorkspacePlan(
      ROOT,
      {
        operation: 'remove',
        branchWorkspaceId: current.id,
        alsoDeleteBranch: false,
        alsoDeleteUpstream: false,
      },
      dependenciesWithStatus,
    )

    expect(result).toMatchObject({
      ok: true,
      plan: {
        repositories: [{ repositoryName: 'api', action: 'remove-worktree' }],
        removalOptions: {
          alsoDeleteBranch: false,
          alsoDeleteUpstream: false,
        },
      },
    })
    expect(getStatus).not.toHaveBeenCalled()
  })

  test('treats released auxiliary content as unmanaged when removing the whole workspace', async () => {
    const current = existingManifest()
    const memberBranch = {
      ...branch(BRANCH, current.repositories[0]!.worktreePath),
      worktree: {
        path: current.repositories[0]!.worktreePath,
        summary: { dirty: false, changeCount: 0 },
      },
    }
    const deps = dependencies({ [path.join(ROOT, 'api')]: snapshot(branch('main'), memberBranch) })
    deps.readConfig.mockResolvedValue({ kind: 'ready', config: { repo: ['api'] } })
    deps.readManifests.mockResolvedValue({ kind: 'ready', manifests: [current] })
    deps.inspectPath.mockImplementation(async (_rootId, candidatePath) => ({
      ...missing(candidatePath),
      exists: true,
      kind: candidatePath === current.path ? 'directory' : 'file',
      resolvedPath: candidatePath,
    }))

    const result = await buildBranchWorkspacePlan(
      ROOT,
      {
        operation: 'remove',
        branchWorkspaceId: current.id,
        alsoDeleteBranch: false,
        alsoDeleteUpstream: false,
      },
      { ...deps, listChildren: vi.fn(async () => ['api', 'README.md']) },
    )

    expect(result).toMatchObject({
      ok: true,
      plan: {
        auxiliaryEntries: [],
        unmanagedEntries: ['README.md'],
        requiredApprovals: ['unmanaged-content'],
      },
    })
  })

  test('plans provenance-aware cleanup and independent modified, unmanaged, and terminal approvals', async () => {
    const current = manifestForRemoval()
    const deps = dependencies({
      [path.join(ROOT, 'api')]: snapshot({
        ...branch(BRANCH, current.repositories[0]!.worktreePath),
        tracking: `origin/${BRANCH}`,
      }),
      [path.join(ROOT, 'web')]: snapshot(branch(BRANCH, current.repositories[1]!.worktreePath)),
    })
    deps.readConfig.mockResolvedValue({ kind: 'ready', config: { repo: ['api', 'web'] } })
    deps.readManifests.mockResolvedValue({ kind: 'ready', manifests: [current] })
    deps.inspectPath.mockImplementation(async (_rootId, candidatePath) => ({
      ...missing(candidatePath),
      exists: true,
      kind: candidatePath === current.path ? 'directory' : 'file',
      resolvedPath: candidatePath,
    }))
    const extendedDeps = {
      ...deps,
      fingerprintEntry: vi.fn(async () => 'changed'),
      listChildren: vi.fn(async () => ['api', 'web', 'README.md', 'notes.txt']),
      listTerminalSessions: vi.fn(async (repoId: string) =>
        repoId === ROOT
          ? [terminal('terminal-root-1234', ROOT, current.path)]
          : repoId === path.join(ROOT, 'api')
            ? [terminal('terminal-api-12345', repoId, current.repositories[0]!.worktreePath)]
            : [],
      ),
    }

    const result = await buildBranchWorkspacePlan(
      ROOT,
      {
        operation: 'remove',
        branchWorkspaceId: current.id,
        alsoDeleteBranch: true,
        alsoDeleteUpstream: true,
      },
      extendedDeps,
    )

    expect(result).toMatchObject({
      ok: true,
      plan: {
        operation: 'remove',
        requiredApprovals: ['modified-copy', 'unmanaged-content', 'close-terminals'],
        terminalSessionIds: ['terminal-root-1234', 'terminal-api-12345'],
        repositories: [
          { repositoryName: 'api', deleteBranch: true, deleteUpstream: true, upstream: `origin/${BRANCH}` },
          { repositoryName: 'web', deleteBranch: false, deleteUpstream: false },
        ],
        unmanagedEntries: ['notes.txt'],
      },
    })
    if (!result.ok) throw new Error('Expected a removal plan')
    expect(result.plan.steps.find((step) => step.kind === 'remove-directory')).toMatchObject({
      label: 'hobgoblin-feature-auth',
    })
  })

  test('treats a gone upstream as already cleaned up during removal', async () => {
    const current = existingManifest()
    const stale = dependencies({
      [path.join(ROOT, 'api')]: snapshot({
        ...branch(BRANCH, current.repositories[0]!.worktreePath),
        tracking: `origin/${BRANCH}`,
        trackingGone: true,
      }),
    })
    stale.readConfig.mockResolvedValue({ kind: 'ready', config: { repo: ['api'] } })
    stale.readManifests.mockResolvedValue({ kind: 'ready', manifests: [current] })
    stale.inspectPath.mockImplementation(async (_rootId, candidatePath) => ({
      ...missing(candidatePath),
      exists: true,
      kind: 'directory',
      resolvedPath: candidatePath,
    }))
    const result = await buildBranchWorkspacePlan(
      ROOT,
      {
        operation: 'remove',
        branchWorkspaceId: current.id,
        alsoDeleteBranch: true,
        alsoDeleteUpstream: true,
      },
      { ...stale, listChildren: vi.fn(async () => ['api']) },
    )

    if (!result.ok) throw new Error(result.message)
    expect(result).toMatchObject({
      ok: true,
      plan: {
        repositories: [
          {
            repositoryName: 'api',
            deleteBranch: true,
            deleteUpstream: false,
          },
        ],
      },
    })
    expect(result.plan.repositories[0]).not.toHaveProperty('upstream')
    expect(result.plan.steps.some((step) => step.kind === 'delete-upstream-branch')).toBe(false)
  })

  test('blocks protected created branches during removal', async () => {
    const current = existingManifest()
    const protectedManifest = { ...current, branch: 'main' }
    protectedManifest.repositories = current.repositories.map((member) => ({ ...member, targetBranch: 'main' }))
    const protectedDeps = dependencies({
      [path.join(ROOT, 'api')]: snapshot(branch('main', current.repositories[0]!.worktreePath)),
    })
    protectedDeps.readConfig.mockResolvedValue({ kind: 'ready', config: { repo: ['api'] } })
    protectedDeps.readManifests.mockResolvedValue({ kind: 'ready', manifests: [protectedManifest] })
    protectedDeps.inspectPath.mockImplementation(async (_rootId, candidatePath) => ({
      ...missing(candidatePath),
      exists: true,
      kind: 'directory',
      resolvedPath: candidatePath,
    }))
    await expect(
      buildBranchWorkspacePlan(
        ROOT,
        {
          operation: 'remove',
          branchWorkspaceId: current.id,
          alsoDeleteBranch: true,
          alsoDeleteUpstream: false,
        },
        protectedDeps,
      ),
    ).resolves.toEqual({ ok: false, message: 'workspace.branch-workspace.protected-branch' })
  })
})

describe('branch workspace reduce planner', () => {
  test('plans selected members in configured order without dirty preflight', async () => {
    const current = manifestForReduction()
    const memberBranch = (index: number, dirty: boolean) => ({
      ...branch(BRANCH, current.repositories[index]!.worktreePath),
      worktree: {
        path: current.repositories[index]!.worktreePath,
        summary: { dirty, changeCount: dirty ? 1 : 0 },
      },
    })
    const deps = dependencies({
      [path.join(ROOT, 'api')]: snapshot(branch('main'), memberBranch(0, false)),
      [path.join(ROOT, 'web')]: snapshot(branch('develop'), memberBranch(1, false)),
      [path.join(ROOT, 'worker')]: snapshot(branch('main'), memberBranch(2, true)),
    })
    deps.readConfig.mockResolvedValue({ kind: 'ready', config: { repo: ['api', 'web', 'worker'] } })
    deps.readManifests.mockResolvedValue({ kind: 'ready', manifests: [current] })
    deps.inspectPath.mockImplementation(async (_rootId, candidatePath) => ({
      ...missing(candidatePath),
      exists: candidatePath === current.path,
      kind: candidatePath === current.path ? 'directory' : 'missing',
      ...(candidatePath === current.path ? { resolvedPath: candidatePath } : {}),
    }))
    const listTerminalSessions = vi.fn(async (repoId: string) =>
      repoId === ROOT
        ? [terminal('terminal-root-1234', ROOT, current.path)]
        : repoId === path.join(ROOT, 'api')
          ? [terminal('terminal-api-12345', repoId, current.repositories[0]!.worktreePath)]
          : repoId === path.join(ROOT, 'web')
            ? [terminal('terminal-web-12345', repoId, current.repositories[1]!.worktreePath)]
            : repoId === path.join(ROOT, 'worker')
              ? [terminal('terminal-worker-1', repoId, current.repositories[2]!.worktreePath)]
              : [],
    )

    const result = await buildBranchWorkspacePlan(
      ROOT,
      {
        operation: 'reduce',
        branchWorkspaceId: current.id,
        repositories: ['worker', 'api'],
      },
      { ...deps, listTerminalSessions },
    )

    expect(result).toMatchObject({
      ok: true,
      plan: {
        operation: 'reduce',
        repositories: [
          { repositoryName: 'api', action: 'remove-worktree' },
          { repositoryName: 'worker', action: 'remove-worktree' },
        ],
        requiredApprovals: ['close-terminals'],
        terminalSessionIds: ['terminal-api-12345', 'terminal-worker-1'],
        steps: [
          { kind: 'remove-worktree', repositoryName: 'api' },
          { kind: 'remove-worktree', repositoryName: 'worker' },
        ],
      },
    })
    if (!result.ok) throw new Error('Expected a reduction plan')
    expect(result.plan.repositories.every((repository) => !Object.hasOwn(repository, 'dirty'))).toBe(true)
    expect(deps.getSnapshot).toHaveBeenCalledTimes(2)
    expect(deps.getSnapshot).toHaveBeenNthCalledWith(1, path.join(ROOT, 'api'), undefined, {
      includeWorktreeStatus: false,
      includeRemote: false,
    })
    expect(deps.getSnapshot).toHaveBeenNthCalledWith(2, path.join(ROOT, 'worker'), undefined, {
      includeWorktreeStatus: false,
      includeRemote: false,
    })
    expect(listTerminalSessions.mock.calls.map(([repoId]) => repoId)).toEqual([
      ROOT,
      path.join(ROOT, 'api'),
      path.join(ROOT, 'worker'),
    ])
    expect(result.plan.manifest.repositories.map((member) => [member.repositoryName, member.progress])).toEqual([
      ['api', 'pending'],
      ['web', 'complete'],
      ['worker', 'pending'],
    ])
    expect(result.plan.steps.some((step) => step.kind === 'delete-local-branch')).toBe(false)
    expect(result.plan.steps.some((step) => step.kind === 'delete-upstream-branch')).toBe(false)
    expect(result.plan.steps.some((step) => step.kind === 'remove-directory')).toBe(false)
  })

  test('rejects removing the final member or a repository outside current membership', async () => {
    const current = manifestForRemoval()
    const deps = dependencies({
      [path.join(ROOT, 'api')]: snapshot(branch(BRANCH, current.repositories[0]!.worktreePath)),
      [path.join(ROOT, 'web')]: snapshot(branch(BRANCH, current.repositories[1]!.worktreePath)),
    })
    deps.readManifests.mockResolvedValue({ kind: 'ready', manifests: [current] })

    await expect(
      buildBranchWorkspacePlan(
        ROOT,
        { operation: 'reduce', branchWorkspaceId: current.id, repositories: ['api', 'web'] },
        deps,
      ),
    ).resolves.toEqual({ ok: false, message: 'workspace.branch-workspace.member-required' })
    await expect(
      buildBranchWorkspacePlan(
        ROOT,
        { operation: 'reduce', branchWorkspaceId: current.id, repositories: ['worker'] },
        deps,
      ),
    ).resolves.toEqual({ ok: false, message: 'workspace.branch-workspace.member-unavailable' })
  })

  test('removes a selected member by its registered path when its branch drifted', async () => {
    const current = manifestForReduction()
    const worktreeBranch = (index: number, name = BRANCH) => ({
      ...branch(name, current.repositories[index]!.worktreePath),
      worktree: {
        path: current.repositories[index]!.worktreePath,
        summary: { dirty: false, changeCount: 0 },
      },
    })
    const deps = dependencies({
      [path.join(ROOT, 'api')]: snapshot(branch(BRANCH), worktreeBranch(0, 'release/previous')),
      [path.join(ROOT, 'web')]: snapshot(worktreeBranch(1)),
      [path.join(ROOT, 'worker')]: snapshot(worktreeBranch(2)),
    })
    deps.readConfig.mockResolvedValue({ kind: 'ready', config: { repo: ['api', 'web', 'worker'] } })
    deps.readManifests.mockResolvedValue({ kind: 'ready', manifests: [current] })
    deps.inspectPath.mockImplementation(async (_rootId, candidatePath) => ({
      ...missing(candidatePath),
      exists: candidatePath === current.path,
      kind: candidatePath === current.path ? 'directory' : 'missing',
    }))

    const result = await buildBranchWorkspacePlan(
      ROOT,
      { operation: 'reduce', branchWorkspaceId: current.id, repositories: ['api'] },
      deps,
    )

    expect(result).toMatchObject({
      ok: true,
      plan: {
        repositories: [
          {
            repositoryName: 'api',
            targetBranch: BRANCH,
            checkedOutBranch: 'release/previous',
            action: 'remove-worktree',
          },
        ],
      },
    })
  })

  test('keeps a detached registered member on the Git worktree removal path', async () => {
    const current = manifestForReduction()
    const memberPath = current.repositories[0]!.worktreePath
    const deps = dependencies({
      [path.join(ROOT, 'api')]: snapshot(branch(BRANCH)),
    })
    deps.getWorktrees.mockResolvedValue([worktree(memberPath, { head: 'abcdef0' })])
    deps.readConfig.mockResolvedValue({ kind: 'ready', config: { repo: ['api', 'web', 'worker'] } })
    deps.readManifests.mockResolvedValue({ kind: 'ready', manifests: [current] })
    deps.inspectPath.mockImplementation(async (_rootId, candidatePath) => ({
      ...missing(candidatePath),
      exists: candidatePath === current.path || candidatePath === memberPath,
      kind: 'directory',
    }))

    const result = await buildBranchWorkspacePlan(
      ROOT,
      { operation: 'reduce', branchWorkspaceId: current.id, repositories: ['api'] },
      deps,
    )

    expect(result).toMatchObject({
      ok: true,
      plan: {
        repositories: [
          {
            repositoryName: 'api',
            action: 'remove-worktree',
            worktreePresent: true,
            satisfied: false,
          },
        ],
        requiredApprovals: [],
      },
    })
    if (!result.ok) throw new Error('Expected a reduction plan')
    expect(result.plan.repositories[0]).not.toHaveProperty('checkedOutBranch')
    expect(deps.getWorktrees).toHaveBeenCalledWith(path.join(ROOT, 'api'), undefined)
  })

  test('treats a missing selected member path as satisfied without touching its target branch elsewhere', async () => {
    const current = manifestForReduction()
    const worktreeBranch = (index: number) => ({
      ...branch(BRANCH, current.repositories[index]!.worktreePath),
      worktree: {
        path: current.repositories[index]!.worktreePath,
        summary: { dirty: false, changeCount: 0 },
      },
    })
    const deps = dependencies({
      [path.join(ROOT, 'api')]: snapshot(branch(BRANCH, path.join(ROOT, 'elsewhere'))),
      [path.join(ROOT, 'web')]: snapshot(worktreeBranch(1)),
      [path.join(ROOT, 'worker')]: snapshot(worktreeBranch(2)),
    })
    deps.readConfig.mockResolvedValue({ kind: 'ready', config: { repo: ['api', 'web', 'worker'] } })
    deps.readManifests.mockResolvedValue({ kind: 'ready', manifests: [current] })
    deps.inspectPath.mockImplementation(async (_rootId, candidatePath) => ({
      ...missing(candidatePath),
      exists: candidatePath === current.path,
      kind: candidatePath === current.path ? 'directory' : 'missing',
    }))

    const result = await buildBranchWorkspacePlan(
      ROOT,
      { operation: 'reduce', branchWorkspaceId: current.id, repositories: ['api'] },
      deps,
    )

    expect(result).toMatchObject({
      ok: true,
      plan: {
        repositories: [{ repositoryName: 'api', action: 'satisfied', worktreePresent: false }],
        steps: [],
      },
    })
  })

  test('plans cleanup for a selected member path left behind by interrupted worktree removal', async () => {
    const original = manifestForReduction()
    const current: BranchWorkspaceManifest = {
      ...original,
      operation: { kind: 'reduce' },
      repositories: original.repositories.map((member, index) => ({
        ...member,
        progress: index === 0 ? 'failed' : 'complete',
        ...(index === 0 ? { lastError: 'cancelled' } : {}),
      })),
    }
    const worktreeBranch = (index: number) => ({
      ...branch(BRANCH, current.repositories[index]!.worktreePath),
      worktree: {
        path: current.repositories[index]!.worktreePath,
        summary: { dirty: false, changeCount: 0 },
      },
    })
    const deps = dependencies({
      [path.join(ROOT, 'api')]: snapshot(branch(BRANCH)),
      [path.join(ROOT, 'web')]: snapshot(worktreeBranch(1)),
      [path.join(ROOT, 'worker')]: snapshot(worktreeBranch(2)),
    })
    deps.readConfig.mockResolvedValue({ kind: 'ready', config: { repo: ['api', 'web', 'worker'] } })
    deps.readManifests.mockResolvedValue({ kind: 'ready', manifests: [current] })
    deps.inspectPath.mockImplementation(async (_rootId, candidatePath) => ({
      ...missing(candidatePath),
      exists: candidatePath === current.path || candidatePath === current.repositories[0]!.worktreePath,
      kind: 'directory',
      directChild: path.dirname(candidatePath) === current.path,
    }))

    const result = await buildBranchWorkspacePlan(
      ROOT,
      { operation: 'reduce', branchWorkspaceId: current.id, repositories: ['api'] },
      deps,
    )

    expect(result).toMatchObject({
      ok: true,
      plan: {
        repositories: [
          {
            repositoryName: 'api',
            action: 'remove-entry',
            worktreePresent: false,
            satisfied: false,
          },
        ],
        requiredApprovals: ['unmanaged-content'],
        steps: [
          {
            kind: 'remove-entry',
            repositoryName: 'api',
            entryName: 'api',
          },
        ],
      },
    })
  })

  test.each([
    [{ isPrimary: true }, 'workspace.branch-workspace.primary-worktree'],
    [{ isLocked: true }, 'workspace.branch-workspace.locked-worktree'],
  ])('blocks a drifted selected member when its worktree is unsafe', async (worktreeState, message) => {
    const current = manifestForReduction()
    const worktreeBranch = (index: number, name = BRANCH) => ({
      ...branch(name, current.repositories[index]!.worktreePath),
      worktree: {
        path: current.repositories[index]!.worktreePath,
        summary: { dirty: false, changeCount: 0 },
        ...(index === 0 ? worktreeState : {}),
      },
    })
    const deps = dependencies({
      [path.join(ROOT, 'api')]: snapshot(branch(BRANCH), worktreeBranch(0, 'release/previous')),
      [path.join(ROOT, 'web')]: snapshot(worktreeBranch(1)),
      [path.join(ROOT, 'worker')]: snapshot(worktreeBranch(2)),
    })
    deps.readConfig.mockResolvedValue({ kind: 'ready', config: { repo: ['api', 'web', 'worker'] } })
    deps.readManifests.mockResolvedValue({ kind: 'ready', manifests: [current] })
    deps.inspectPath.mockImplementation(async (_rootId, candidatePath) => ({
      ...missing(candidatePath),
      exists: candidatePath === current.path,
      kind: candidatePath === current.path ? 'directory' : 'missing',
    }))

    await expect(
      buildBranchWorkspacePlan(
        ROOT,
        { operation: 'reduce', branchWorkspaceId: current.id, repositories: ['api'] },
        deps,
      ),
    ).resolves.toEqual({ ok: false, message })
  })

  test('does not inspect unselected member health', async () => {
    const current = manifestForReduction()
    const cleanMember = (index: number) => ({
      ...branch(BRANCH, current.repositories[index]!.worktreePath),
      worktree: {
        path: current.repositories[index]!.worktreePath,
        summary: { dirty: false, changeCount: 0 },
      },
    })
    const deps = dependencies({
      [path.join(ROOT, 'api')]: snapshot(cleanMember(0)),
      [path.join(ROOT, 'web')]: snapshot(branch(BRANCH)),
      [path.join(ROOT, 'worker')]: snapshot(cleanMember(2)),
    })
    deps.readConfig.mockResolvedValue({ kind: 'ready', config: { repo: ['api', 'web', 'worker'] } })
    deps.readManifests.mockResolvedValue({ kind: 'ready', manifests: [current] })
    deps.inspectPath.mockImplementation(async (_rootId, candidatePath) => ({
      ...missing(candidatePath),
      exists: candidatePath === current.path,
      kind: candidatePath === current.path ? 'directory' : 'missing',
    }))

    const result = await buildBranchWorkspacePlan(
      ROOT,
      { operation: 'reduce', branchWorkspaceId: current.id, repositories: ['api'] },
      deps,
    )

    expect(result).toMatchObject({
      ok: true,
      plan: { repositories: [{ repositoryName: 'api', action: 'remove-worktree' }] },
    })
    expect(deps.getSnapshot).toHaveBeenCalledTimes(1)
    expect(deps.getSnapshot).toHaveBeenCalledWith(path.join(ROOT, 'api'), undefined, {
      includeWorktreeStatus: false,
      includeRemote: false,
    })
  })

  test.each(['create', 'extend', 'repair'] as const)(
    'allows explicit member removal from an interrupted %s lifecycle',
    async (operation) => {
      const current = manifestForReduction()
      current.operation = { kind: operation }
      current.repositories[1] = { ...current.repositories[1]!, progress: 'failed', lastError: 'interrupted' }
      const deps = dependencies({
        [path.join(ROOT, 'api')]: snapshot(branch(BRANCH, current.repositories[0]!.worktreePath)),
      })
      deps.readConfig.mockResolvedValue({ kind: 'ready', config: { repo: ['api', 'web', 'worker'] } })
      deps.readManifests.mockResolvedValue({ kind: 'ready', manifests: [current] })
      deps.inspectPath.mockImplementation(async (_rootId, candidatePath) => ({
        ...missing(candidatePath),
        exists: candidatePath === current.path,
        kind: candidatePath === current.path ? 'directory' : 'missing',
      }))

      await expect(
        buildBranchWorkspacePlan(
          ROOT,
          { operation: 'reduce', branchWorkspaceId: current.id, repositories: ['api'] },
          deps,
        ),
      ).resolves.toMatchObject({
        ok: true,
        plan: { operation: 'reduce', repositories: [{ repositoryName: 'api', action: 'remove-worktree' }] },
      })
    },
  )

  test('does not require dirty state for a selected registered worktree', async () => {
    const current = manifestForReduction()
    const deps = dependencies({
      [path.join(ROOT, 'api')]: snapshot(branch(BRANCH, current.repositories[0]!.worktreePath)),
    })
    deps.readConfig.mockResolvedValue({ kind: 'ready', config: { repo: ['api', 'web', 'worker'] } })
    deps.readManifests.mockResolvedValue({ kind: 'ready', manifests: [current] })
    deps.inspectPath.mockImplementation(async (_rootId, candidatePath) => ({
      ...missing(candidatePath),
      exists: candidatePath === current.path,
      kind: candidatePath === current.path ? 'directory' : 'missing',
    }))

    const result = await buildBranchWorkspacePlan(
      ROOT,
      { operation: 'reduce', branchWorkspaceId: current.id, repositories: ['api'] },
      deps,
    )

    expect(result).toMatchObject({
      ok: true,
      plan: {
        repositories: [{ repositoryName: 'api', action: 'remove-worktree' }],
        requiredApprovals: [],
      },
    })
  })

  test('does not inspect one-time auxiliary content before reducing members', async () => {
    const current = manifestForReduction()
    current.auxiliaryEntries = [
      {
        name: 'README.md',
        mode: 'symlink',
        sourcePath: path.join(ROOT, 'README.md'),
        targetPath: path.join(current.path, 'README.md'),
        progress: 'complete',
      },
    ]
    const memberBranch = (index: number) => ({
      ...branch(BRANCH, current.repositories[index]!.worktreePath),
      worktree: {
        path: current.repositories[index]!.worktreePath,
        summary: { dirty: false, changeCount: 0 },
      },
    })
    const deps = dependencies({
      [path.join(ROOT, 'api')]: snapshot(memberBranch(0)),
      [path.join(ROOT, 'web')]: snapshot(memberBranch(1)),
      [path.join(ROOT, 'worker')]: snapshot(memberBranch(2)),
    })
    deps.readConfig.mockResolvedValue({ kind: 'ready', config: { repo: ['api', 'web', 'worker'] } })
    deps.readManifests.mockResolvedValue({ kind: 'ready', manifests: [current] })
    deps.inspectPath.mockImplementation(async (_rootId, candidatePath) =>
      candidatePath === current.path
        ? { ...missing(candidatePath), exists: true, kind: 'directory' }
        : {
            ...missing(candidatePath),
            exists: true,
            kind: 'symlink',
            linkTarget: path.join(ROOT, 'other.md'),
          },
    )

    await expect(
      buildBranchWorkspacePlan(
        ROOT,
        { operation: 'reduce', branchWorkspaceId: current.id, repositories: ['api'] },
        deps,
      ),
    ).resolves.toMatchObject({ ok: true, plan: { operation: 'reduce' } })
    expect(deps.inspectPath).not.toHaveBeenCalledWith(ROOT, current.auxiliaryEntries[0]!.targetPath, undefined)
  })
})

function manifestWithAuxiliaryEntries(): BranchWorkspaceManifest {
  const current = existingManifest()
  return {
    ...current,
    auxiliaryEntries: [
      {
        name: '.env',
        mode: 'symlink',
        sourcePath: path.join(ROOT, '.env'),
        targetPath: path.join(current.path, '.env'),
        progress: 'complete',
      },
      {
        name: 'README.md',
        mode: 'copy',
        sourcePath: path.join(ROOT, 'README.md'),
        targetPath: path.join(current.path, 'README.md'),
        copyBaseline: 'baseline',
        progress: 'complete',
      },
    ],
  }
}

function manifestForRemoval(): BranchWorkspaceManifest {
  const current = manifestWithAuxiliaryEntries()
  return {
    ...current,
    repositories: [
      current.repositories[0]!,
      {
        repositoryName: 'web',
        targetBranch: BRANCH,
        creationBase: { kind: 'localBranch', branch: 'develop' },
        syncBeforeCreate: false,
        branchOrigin: 'pre-existing',
        worktreePath: path.join(current.path, 'web'),
        progress: 'complete',
      },
    ],
    auxiliaryEntries: current.auxiliaryEntries.filter((entry) => entry.mode === 'copy'),
  }
}

function manifestForReduction(): BranchWorkspaceManifest {
  const current = manifestForRemoval()
  return {
    ...current,
    repositories: [
      ...current.repositories,
      {
        repositoryName: 'worker',
        targetBranch: BRANCH,
        creationBase: { kind: 'localBranch', branch: 'main' },
        syncBeforeCreate: false,
        branchOrigin: 'created',
        worktreePath: path.join(current.path, 'worker'),
        progress: 'complete',
      },
    ],
    auxiliaryEntries: [],
  }
}

function terminal(sessionId: string, scope: string, targetPath: string) {
  return {
    sessionId,
    key: `${scope}\0${targetPath}\0terminal-1`,
    cwd: targetPath,
    controller: null,
    processName: 'zsh',
    canonicalTitle: null,
    cols: 80,
    rows: 24,
    displayOrder: 0,
    phase: 'open' as const,
    message: null,
  }
}
