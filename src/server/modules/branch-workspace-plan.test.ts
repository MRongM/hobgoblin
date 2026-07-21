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

function cleanStatus(worktreePath: string) {
  return { path: worktreePath, branch: BRANCH, isMain: false, entries: [] }
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
  test('repairs persisted repository dependencies without recreating an existing worktree', async () => {
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

    const result = await buildBranchWorkspacePlan(ROOT, { operation: 'repair', branchWorkspaceId: current.id }, deps)

    expect(result).toMatchObject({
      ok: true,
      plan: {
        repositories: [
          {
            repositoryName: 'api',
            action: 'bootstrap-worktree',
            worktreeBootstrap: current.repositories[0]!.worktreeBootstrap,
          },
        ],
        steps: [{ kind: 'bootstrap-worktree', repositoryName: 'api' }],
      },
    })
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
    [{ isPrimary: true }, true, 'workspace.branch-workspace.primary-worktree'],
    [{ isLocked: true }, true, 'workspace.branch-workspace.locked-worktree'],
    [{ summary: { dirty: true, changeCount: 1 } }, false, 'workspace.branch-workspace.dirty-worktree'],
  ])(
    'blocks unsafe worktrees outside the dirty-force exception',
    async (worktreeState, forceRemoveWorktrees, message) => {
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
            forceRemoveWorktrees,
          },
          deps,
        ),
      ).resolves.toEqual({ ok: false, message })
    },
  )

  test('plans forced removal for a known dirty worktree after authoritative status succeeds', async () => {
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

    const result = await buildBranchWorkspacePlan(
      ROOT,
      {
        operation: 'remove',
        branchWorkspaceId: current.id,
        alsoDeleteBranch: false,
        alsoDeleteUpstream: false,
        forceRemoveWorktrees: true,
      },
      { ...deps, getStatus, listChildren: vi.fn(async () => ['api']) },
    )

    expect(result).toMatchObject({
      ok: true,
      plan: {
        repositories: [{ repositoryName: 'api', action: 'remove-worktree' }],
        removalOptions: {
          alsoDeleteBranch: false,
          alsoDeleteUpstream: false,
          forceRemoveWorktrees: true,
        },
      },
    })
    expect(getStatus).toHaveBeenCalledWith(path.join(ROOT, 'api'), undefined)
  })

  test('does not treat a missing authoritative worktree status as clean when force is enabled', async () => {
    const current = existingManifest()
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
      buildBranchWorkspacePlan(
        ROOT,
        {
          operation: 'remove',
          branchWorkspaceId: current.id,
          alsoDeleteBranch: false,
          alsoDeleteUpstream: false,
          forceRemoveWorktrees: true,
        },
        { ...deps, getStatus: vi.fn(async () => []), listChildren: vi.fn(async () => ['api']) },
      ),
    ).resolves.toEqual({ ok: false, message: 'workspace.branch-workspace.repository-unavailable' })
  })

  test('changes the plan token when force removal changes', async () => {
    const current = existingManifest()
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
    const planDependencies = {
      ...deps,
      getStatus: vi.fn(async () => [cleanStatus(current.repositories[0]!.worktreePath)]),
      listChildren: vi.fn(async () => ['api']),
    }

    const withoutForce = await buildBranchWorkspacePlan(
      ROOT,
      {
        operation: 'remove',
        branchWorkspaceId: current.id,
        alsoDeleteBranch: false,
        alsoDeleteUpstream: false,
        forceRemoveWorktrees: false,
      },
      planDependencies,
    )
    const withForce = await buildBranchWorkspacePlan(
      ROOT,
      {
        operation: 'remove',
        branchWorkspaceId: current.id,
        alsoDeleteBranch: false,
        alsoDeleteUpstream: false,
        forceRemoveWorktrees: true,
      },
      planDependencies,
    )

    expect(withoutForce.ok).toBe(true)
    expect(withForce.ok).toBe(true)
    if (!withoutForce.ok || !withForce.ok) throw new Error('Expected removal plans')
    expect(withForce.plan.token).not.toBe(withoutForce.plan.token)
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
      getStatus: vi.fn(async () => current.repositories.map((member) => cleanStatus(member.worktreePath))),
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
        forceRemoveWorktrees: false,
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

  test('blocks stale upstream cleanup and protected created branches', async () => {
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
    await expect(
      buildBranchWorkspacePlan(
        ROOT,
        {
          operation: 'remove',
          branchWorkspaceId: current.id,
          alsoDeleteBranch: true,
          alsoDeleteUpstream: true,
          forceRemoveWorktrees: false,
        },
        { ...stale, getStatus: vi.fn(async () => [cleanStatus(current.repositories[0]!.worktreePath)]) },
      ),
    ).resolves.toEqual({ ok: false, message: 'workspace.branch-workspace.upstream-unavailable' })

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
          forceRemoveWorktrees: false,
        },
        { ...protectedDeps, getStatus: vi.fn(async () => [cleanStatus(current.repositories[0]!.worktreePath)]) },
      ),
    ).resolves.toEqual({ ok: false, message: 'workspace.branch-workspace.protected-branch' })
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
