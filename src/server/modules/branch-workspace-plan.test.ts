import path from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { buildBranchWorkspacePlan } from '#/server/modules/branch-workspace-plan.ts'
import type { BranchWorkspaceManifestSourceSnapshot } from '#/server/modules/branch-workspace-source.ts'
import type { BranchWorkspaceManifest, BranchWorkspacePathInspection } from '#/shared/branch-workspaces.ts'
import type { RepoSnapshot } from '#/shared/rpc.ts'
import type { BranchSnapshotInfo } from '#/shared/git-types.ts'
import type { WorkspaceConfigSnapshot } from '#/shared/workspace.ts'
import type { WorktreeBootstrapPreviewResult } from '#/shared/worktree-bootstrap-summary.ts'
import type { WorktreeBootstrapPreflightResult } from '#/shared/worktree-bootstrap-summary.ts'
import type { WorktreeBootstrapTargetPreflightResult } from '#/shared/worktree-bootstrap-summary.ts'

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
    getBootstrapPreview: vi.fn(
      async (): Promise<WorktreeBootstrapPreviewResult> => ({
        ok: true,
        preview: {
          hasConfig: false,
          hasOperations: false,
          configHash: null,
          copyCount: 0,
          symlinkCount: 0,
          hardlinkCount: 0,
          excludeCount: 0,
        },
      }),
    ),
    getBootstrapPreflight: vi.fn(
      async (): Promise<WorktreeBootstrapPreflightResult> => ({
        ok: true,
        preflight: { kind: 'candidates', candidates: [] },
      }),
    ),
    getBootstrapTargetPreflight: vi.fn(
      async (): Promise<WorktreeBootstrapTargetPreflightResult> => ({
        ok: true,
        preflight: {
          pending: [{ path: 'node_modules', mode: 'symlink' }],
          satisfied: [],
          conflicts: [],
          hasSetup: false,
        },
      }),
    ),
    inspectPath: vi.fn(
      async (_rootId: string, candidatePath: string): Promise<BranchWorkspacePathInspection> => missing(candidatePath),
    ),
    pathExists: vi.fn(async () => false),
  }
}

function existingManifest(): BranchWorkspaceManifest {
  const workspacePath = path.join(ROOT, 'goblin-feature-auth')
  return {
    id: 'branch-workspace-1',
    rootId: ROOT,
    branch: BRANCH,
    directoryName: 'goblin-feature-auth',
    path: workspacePath,
    repositories: [
      {
        repositoryName: 'api',
        targetBranch: BRANCH,
        baseBranch: 'main',
        branchOrigin: 'created',
        worktreePath: path.join(workspacePath, 'api'),
        progress: 'complete',
      },
    ],
    auxiliaryEntries: [],
  }
}

function failedBootstrapManifest(): BranchWorkspaceManifest {
  const manifest = existingManifest()
  manifest.repositories[0] = {
    ...manifest.repositories[0]!,
    worktreeBootstrap: {
      kind: 'materialize',
      candidateScope: 'ignored-only',
      selections: [{ path: 'node_modules', mode: 'symlink' }],
    },
    bootstrapProgress: 'failed',
    bootstrapLastError: 'link failed',
  }
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
        directoryName: 'goblin-feature-auth',
        repositories: [
          {
            repositoryName: 'api',
            mode: { kind: 'newBranch', newBranch: BRANCH, baseRef: 'main' },
            branchOrigin: 'created',
          },
          {
            repositoryName: 'web',
            mode: { kind: 'newBranch', newBranch: BRANCH, baseRef: 'develop' },
            branchOrigin: 'created',
          },
        ],
      },
    })
    if (!result.ok) throw new Error('Expected a create plan')
    expect(result.plan.steps.find((step) => step.kind === 'create-directory')).toMatchObject({
      label: 'goblin-feature-auth',
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
    const expectedApi = path.join(ROOT, 'goblin-feature-auth', 'api')
    const expectedWeb = path.join(ROOT, 'goblin-feature-auth', 'web')
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
      [path.join(ROOT, 'web')]: snapshot(branch('develop')),
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
        repositories: [{ repositoryName: 'web', baseBranch: 'develop' }],
        auxiliaryEntries: [],
      },
      deps,
    )
    expect(extended).toMatchObject({
      ok: true,
      plan: {
        operation: 'extend',
        branchWorkspaceId: current.id,
        repositories: [{ repositoryName: 'web' }],
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

  test('requires independent outside-root and worktree-bootstrap approvals with a deterministic token', async () => {
    const deps = dependencies({ [path.join(ROOT, 'api')]: snapshot(branch('main')) })
    deps.readConfig.mockResolvedValue({ kind: 'ready', config: { repo: ['api'] } })
    deps.getBootstrapPreflight.mockResolvedValue({
      ok: true,
      preflight: {
        kind: 'configured',
        preview: {
          hasConfig: true,
          hasOperations: true,
          configHash: 'sha256:bootstrap',
          copyCount: 1,
          symlinkCount: 0,
          hardlinkCount: 0,
          excludeCount: 0,
        },
      },
    })
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
        requiredApprovals: ['outside-root-source', 'worktree-bootstrap'],
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

  test('plans selected ignored repository dependencies independently', async () => {
    const deps = dependencies({ [path.join(ROOT, 'api')]: snapshot(branch('main')) })
    deps.readConfig.mockResolvedValue({ kind: 'ready', config: { repo: ['api'] } })
    deps.getBootstrapPreflight.mockResolvedValue({
      ok: true,
      preflight: {
        kind: 'candidates',
        candidates: [
          { path: 'node_modules', kind: 'directory' },
          { path: '.cache', kind: 'directory' },
        ],
      },
    })

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
              candidateScope: 'ignored-only',
              selections: [{ path: 'node_modules', mode: 'symlink' }],
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
              candidateScope: 'ignored-only',
              selections: [{ path: 'node_modules', mode: 'symlink' }],
            },
            confirmationRequired: false,
          },
        ],
        requiredApprovals: [],
      },
    })
    expect(deps.getBootstrapPreflight).toHaveBeenCalledWith(path.join(ROOT, 'api'), undefined, 'ignored-only')
  })

  test('rejects a repository dependency that is no longer ignored', async () => {
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
              baseBranch: 'main',
              worktreeBootstrap: {
                kind: 'materialize',
                candidateScope: 'ignored-only',
                selections: [{ path: '.env', mode: 'copy' }],
              },
            },
          ],
          auxiliaryEntries: [],
        },
        deps,
      ),
    ).resolves.toEqual({ ok: false, message: 'error.worktree-bootstrap-selection-stale' })
  })
})

describe('branch workspace repair planner', () => {
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
    current.operation = { kind: 'create', phase: 'failed', startedAt: '2026-07-22T00:00:00.000Z' }
    const deps = repairDependencies(current)

    await expect(
      buildBranchWorkspacePlan(ROOT, { operation: 'repair', branchWorkspaceId: current.id }, deps),
    ).resolves.toMatchObject({
      ok: true,
      plan: { operation: 'repair', auxiliaryEntries: [], steps: [] },
    })
  })

  test('plans exact approved replacement for persisted repository dependency conflicts', async () => {
    const current = existingManifest()
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
    deps.getBootstrapTargetPreflight.mockResolvedValue({
      ok: true,
      preflight: {
        pending: [],
        satisfied: [],
        conflicts: [{ path: '.env', mode: 'copy' }],
        hasSetup: false,
      },
    })

    const result = await buildBranchWorkspacePlan(ROOT, { operation: 'repair', branchWorkspaceId: current.id }, deps)

    expect(result).toMatchObject({
      ok: true,
      plan: {
        repositories: [
          {
            repositoryName: 'api',
            action: 'bootstrap-worktree',
            worktreeBootstrap: current.repositories[0]!.worktreeBootstrap,
            bootstrapReplacements: [{ path: '.env', mode: 'copy' }],
          },
        ],
        requiredApprovals: ['replace-repository-dependencies'],
        steps: [
          {
            id: 'repository-replacement:api:.env',
            kind: 'replace-repository-dependency',
            label: 'api/.env',
            repositoryName: 'api',
            entryName: '.env',
          },
          { kind: 'bootstrap-worktree', repositoryName: 'api' },
        ],
      },
    })
  })

  test('treats exact satisfied dependencies as repaired without rerunning bootstrap', async () => {
    const current = failedBootstrapManifest()
    const deps = repairDependencies(current)
    deps.getBootstrapTargetPreflight.mockResolvedValue({
      ok: true,
      preflight: {
        pending: [],
        satisfied: [{ path: 'node_modules', mode: 'symlink' }],
        conflicts: [],
        hasSetup: false,
      },
    })

    await expect(
      buildBranchWorkspacePlan(ROOT, { operation: 'repair', branchWorkspaceId: current.id }, deps),
    ).resolves.toEqual({ ok: false, message: 'workspace.branch-workspace.nothing-to-repair' })
  })

  test('reruns bootstrap for pending dependencies and setup-only plans without replacement approval', async () => {
    const current = failedBootstrapManifest()
    const pendingDeps = repairDependencies(current)
    pendingDeps.getBootstrapTargetPreflight.mockResolvedValue({
      ok: true,
      preflight: {
        pending: [{ path: 'node_modules', mode: 'symlink' }],
        satisfied: [],
        conflicts: [],
        hasSetup: false,
      },
    })
    const setupDeps = repairDependencies(current)
    setupDeps.getBootstrapTargetPreflight.mockResolvedValue({
      ok: true,
      preflight: { pending: [], satisfied: [], conflicts: [], hasSetup: true },
    })

    for (const deps of [pendingDeps, setupDeps]) {
      const result = await buildBranchWorkspacePlan(ROOT, { operation: 'repair', branchWorkspaceId: current.id }, deps)
      expect(result).toMatchObject({
        ok: true,
        plan: {
          requiredApprovals: [],
          repositories: [{ action: 'bootstrap-worktree' }],
        },
      })
    }
  })

  test('changes the plan token when the exact dependency conflict set changes', async () => {
    const current = failedBootstrapManifest()
    const deps = repairDependencies(current)
    deps.getBootstrapTargetPreflight.mockResolvedValueOnce({
      ok: true,
      preflight: { pending: [], satisfied: [], conflicts: [{ path: '.env', mode: 'copy' }], hasSetup: false },
    })
    const first = await buildBranchWorkspacePlan(ROOT, { operation: 'repair', branchWorkspaceId: current.id }, deps)
    deps.getBootstrapTargetPreflight.mockResolvedValueOnce({
      ok: true,
      preflight: { pending: [], satisfied: [], conflicts: [{ path: 'cache', mode: 'copy' }], hasSetup: false },
    })
    const second = await buildBranchWorkspacePlan(ROOT, { operation: 'repair', branchWorkspaceId: current.id }, deps)

    expect(first.ok && second.ok && first.plan.token).not.toBe(second.ok && second.plan.token)
  })

  test('repairs only missing roots, worktrees, links, and copies at their recorded paths', async () => {
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
        steps: [
          { kind: 'create-directory', label: 'goblin-feature-auth' },
          { kind: 'create-worktree', repositoryName: 'api' },
          { kind: 'symlink-entry', entryName: '.env' },
          { kind: 'copy-entry', entryName: 'README.md' },
        ],
      },
    })
  })

  test('refuses to overwrite a copied target or claim a worktree checked out elsewhere', async () => {
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
    ).resolves.toEqual({ ok: false, message: 'workspace.branch-workspace.target-exists' })

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
  test.each([
    [{ isPrimary: true }, 'workspace.branch-workspace.primary-worktree'],
    [{ isLocked: true }, 'workspace.branch-workspace.locked-worktree'],
  ])('blocks unsafe worktrees', async (worktreeState, message) => {
    const current = existingManifest()
    const unsafeBranch = {
      ...branch(BRANCH, current.repositories[0]!.worktreePath),
      worktree: { path: current.repositories[0]!.worktreePath, ...worktreeState },
    }
    const deps = dependencies({ [path.join(ROOT, 'api')]: snapshot(branch('main'), unsafeBranch) })
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
      label: 'goblin-feature-auth',
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
  test('plans selected members in configured order with dirty and terminal approvals', async () => {
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
          { repositoryName: 'api', action: 'remove-worktree', dirty: false },
          { repositoryName: 'worker', action: 'remove-worktree', dirty: true },
        ],
        requiredApprovals: ['discard-member-changes', 'close-terminals'],
        terminalSessionIds: ['terminal-api-12345', 'terminal-worker-1'],
        steps: [
          { kind: 'remove-worktree', repositoryName: 'api' },
          { kind: 'remove-worktree', repositoryName: 'worker' },
        ],
      },
    })
    if (!result.ok) throw new Error('Expected a reduction plan')
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

  test('rejects a new reduction when an unselected member has drifted', async () => {
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

    await expect(
      buildBranchWorkspacePlan(
        ROOT,
        { operation: 'reduce', branchWorkspaceId: current.id, repositories: ['api'] },
        deps,
      ),
    ).resolves.toEqual({ ok: false, message: 'workspace.branch-workspace.needs-repair' })
  })

  test('rejects a new reduction when an auxiliary entry has drifted', async () => {
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
    ).resolves.toEqual({ ok: false, message: 'workspace.branch-workspace.needs-repair' })
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
        baseBranch: 'develop',
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
        baseBranch: 'main',
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
