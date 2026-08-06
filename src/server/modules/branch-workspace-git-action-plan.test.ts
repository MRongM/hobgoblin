import { describe, expect, test, vi } from 'vitest'
import {
  buildBranchWorkspaceGitActionPlan,
  validateBranchWorkspaceGitActionPlan,
} from '#/server/modules/branch-workspace-git-action-plan.ts'
import type { BranchWorkspaceManifest } from '#/shared/branch-workspaces.ts'
import type { WorktreeStatus } from '#/shared/git-types.ts'
import type { RepoSnapshot } from '#/shared/rpc.ts'

const ROOT = '/workspace'
const WORKSPACE_ID = 'branch-workspace-1'

function manifest(): BranchWorkspaceManifest {
  return {
    id: WORKSPACE_ID,
    rootId: ROOT,
    branch: 'feature/a',
    directoryName: 'goblin-feature-a',
    path: '/workspace/goblin-feature-a',
    repositories: ['api', 'web'].map((repositoryName) => ({
      repositoryName,
      targetBranch: 'feature/a',
      creationBase: { kind: 'localBranch' as const, branch: 'main' },
      syncBeforeCreate: false,
      branchOrigin: 'created' as const,
      worktreePath: `/workspace/goblin-feature-a/${repositoryName}`,
      progress: 'complete' as const,
    })),
    auxiliaryEntries: [],
  }
}

function snapshot(
  repositoryName: string,
  options: {
    targetTracking?: string
    targetTrackingGone?: boolean
    baseTracking?: string | null
    targetHead?: string
    remotes?: readonly string[]
    mainWorktree?: boolean
    releaseWorktree?: 'clean' | 'dirty' | 'none'
  } = {},
): RepoSnapshot {
  const targetPath = `/workspace/goblin-feature-a/${repositoryName}`
  const basePath = `/workspace/${repositoryName}`
  const baseTracking = options.baseTracking === undefined ? 'origin/main' : options.baseTracking
  return {
    current: 'main',
    branches: [
      {
        name: 'feature/a',
        isCurrent: false,
        ...(options.targetTracking ? { tracking: options.targetTracking } : {}),
        ...(options.targetTrackingGone ? { trackingGone: true } : {}),
        ahead: 1,
        behind: 0,
        lastCommitHash: options.targetHead ?? 'target-head',
        lastCommitMessage: 'target',
        lastCommitDate: '2026-07-21T00:00:00Z',
        lastCommitAuthor: 'dev',
        worktree: { path: targetPath, head: options.targetHead ?? 'target-head' },
      },
      {
        name: 'main',
        isCurrent: true,
        ...(baseTracking ? { tracking: baseTracking } : {}),
        ahead: 0,
        behind: 0,
        lastCommitHash: 'base-head',
        lastCommitMessage: 'base',
        lastCommitDate: '2026-07-21T00:00:00Z',
        lastCommitAuthor: 'dev',
        ...(options.mainWorktree === false ? {} : { worktree: { path: basePath, head: 'base-head', isPrimary: true } }),
      },
      {
        name: 'release/v2',
        isCurrent: false,
        tracking: 'origin/release/v2',
        ahead: 0,
        behind: 0,
        lastCommitHash: 'release-head',
        lastCommitMessage: 'release',
        lastCommitDate: '2026-07-21T00:00:00Z',
        lastCommitAuthor: 'dev',
        ...(options.releaseWorktree && options.releaseWorktree !== 'none'
          ? { worktree: { path: `/workspace/${repositoryName}-release`, head: 'release-head' } }
          : {}),
      },
    ],
    ...(options.remotes
      ? {
          remote: {
            remotes: options.remotes.map((name) => ({
              name,
              fetchUrl: `https://example.com/${name}/repo.git`,
              pushUrl: `https://example.com/${name}/repo.git`,
            })),
            hasRemotes: options.remotes.length > 0,
            hasBrowserRemote: false,
            remoteProviders: {},
            hasGitHubRemote: false,
          },
        }
      : {}),
  }
}

function status(path: string, entries: WorktreeStatus['entries'] = []): WorktreeStatus {
  return { path, branch: path.includes('goblin-') ? 'feature/a' : 'main', head: 'head', isMain: false, entries }
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    readManifests: vi.fn(async () => ({ kind: 'ready' as const, manifests: [manifest()] })),
    getSnapshot: vi.fn(async (repoId: string) => snapshot(repoId.endsWith('/api') ? 'api' : 'web')),
    getStatus: vi.fn(async (repoId: string) => {
      const repositoryName = repoId.endsWith('/api') ? 'api' : 'web'
      const targetPath = `/workspace/goblin-feature-a/${repositoryName}`
      return [
        status(`/workspace/${repositoryName}`),
        status(targetPath, repositoryName === 'api' ? [{ x: ' ', y: 'M', path: 'src/a.ts' }] : []),
      ]
    }),
    getPatch: vi.fn(async () => ({ ok: true, message: 'diff --git a/src/a.ts b/src/a.ts\n+change' })),
    ...overrides,
  }
}

describe('buildBranchWorkspaceGitActionPlan', () => {
  test('skips snapshot worktree status because member status is read separately', async () => {
    const deps = dependencies()

    await buildBranchWorkspaceGitActionPlan(ROOT, { kind: 'batch-merge-in', branchWorkspaceId: WORKSPACE_ID }, deps)

    expect(deps.getSnapshot).toHaveBeenNthCalledWith(1, '/workspace/api', undefined, {
      includeWorktreeStatus: false,
    })
    expect(deps.getSnapshot).toHaveBeenNthCalledWith(2, '/workspace/web', undefined, {
      includeWorktreeStatus: false,
    })
  })

  test('ignores legacy repository dependency recovery fields when checking readiness', async () => {
    const current = manifest()
    Object.assign(current.repositories[0]!, {
      worktreeBootstrap: {
        kind: 'materialize',
        selections: [{ path: 'node_modules', mode: 'symlink' }],
      },
      bootstrapProgress: 'failed',
      bootstrapLastError: 'link failed',
    })
    const deps = dependencies({
      readManifests: vi.fn(async () => ({ kind: 'ready' as const, manifests: [current] })),
    })

    await expect(
      buildBranchWorkspaceGitActionPlan(ROOT, { kind: 'batch-commit', branchWorkspaceId: WORKSPACE_ID }, deps),
    ).resolves.toMatchObject({ ok: true })
  })

  test('preserves manifest order and marks clean batch-commit members satisfied', async () => {
    const result = await buildBranchWorkspaceGitActionPlan(
      ROOT,
      { kind: 'batch-commit', branchWorkspaceId: WORKSPACE_ID },
      dependencies(),
    )

    expect(result).toMatchObject({
      ok: true,
      plan: {
        kind: 'batch-commit',
        members: [
          { repositoryName: 'api', dirty: true, changeCount: 1 },
          { repositoryName: 'web', dirty: false, changeCount: 0 },
        ],
      },
    })
  })

  test('changes the plan token when a status column or full patch changes', async () => {
    const first = await buildBranchWorkspaceGitActionPlan(
      ROOT,
      { kind: 'batch-commit', branchWorkspaceId: WORKSPACE_ID },
      dependencies(),
    )
    const changed = dependencies({
      getStatus: vi.fn(async (repoId: string) => {
        const repositoryName = repoId.endsWith('/api') ? 'api' : 'web'
        return [
          status(`/workspace/${repositoryName}`),
          status(`/workspace/goblin-feature-a/${repositoryName}`, [{ x: 'M', y: ' ', path: 'src/a.ts' }]),
        ]
      }),
      getPatch: vi.fn(async () => ({ ok: true, message: 'different patch' })),
    })
    const second = await buildBranchWorkspaceGitActionPlan(
      ROOT,
      { kind: 'batch-commit', branchWorkspaceId: WORKSPACE_ID },
      changed,
    )

    expect(first.ok && second.ok && first.plan.token).not.toBe(second.ok && second.plan.token)
  })

  test.each([
    ['pull', { targetTracking: 'origin/feature/a' }],
    ['push', { remotes: ['origin'] }],
  ] as const)('builds an ordered ready %s plan for target branches', async (kind, snapshotOptions) => {
    const result = await buildBranchWorkspaceGitActionPlan(
      ROOT,
      { kind, branchWorkspaceId: WORKSPACE_ID },
      dependencies({
        getSnapshot: vi.fn(async (repoId: string) =>
          snapshot(repoId.endsWith('/api') ? 'api' : 'web', snapshotOptions),
        ),
      }),
    )

    expect(result).toMatchObject({
      ok: true,
      plan: {
        kind,
        ready: true,
        members: [
          {
            repositoryName: 'api',
            targetBranch: 'feature/a',
            targetWorktreePath: '/workspace/goblin-feature-a/api',
            targetHead: 'target-head',
            ready: true,
          },
          {
            repositoryName: 'web',
            targetBranch: 'feature/a',
            targetWorktreePath: '/workspace/goblin-feature-a/web',
            targetHead: 'target-head',
            ready: true,
          },
        ],
      },
    })
  })

  test.each([
    [
      'pull',
      { targetTracking: 'origin/feature/a', targetTrackingGone: true },
      'workspace.branch-workspace.git-action.target-upstream-required',
    ],
    ['push', { remotes: [] }, 'workspace.branch-workspace.git-action.remote-required'],
  ] as const)('keeps an unready %s plan visible with its readiness reason', async (kind, snapshotOptions, message) => {
    const result = await buildBranchWorkspaceGitActionPlan(
      ROOT,
      { kind, branchWorkspaceId: WORKSPACE_ID },
      dependencies({
        getSnapshot: vi.fn(async (repoId: string) =>
          snapshot(repoId.endsWith('/api') ? 'api' : 'web', snapshotOptions),
        ),
      }),
    )

    expect(result).toMatchObject({
      ok: true,
      plan: {
        kind,
        ready: false,
        members: [
          { repositoryName: 'api', ready: false, message },
          { repositoryName: 'web', ready: false, message },
        ],
      },
    })
  })

  test('changes a push plan token when the target head or remote set changes', async () => {
    const build = async (targetHead: string, remotes: string[]) =>
      await buildBranchWorkspaceGitActionPlan(
        ROOT,
        { kind: 'push', branchWorkspaceId: WORKSPACE_ID },
        dependencies({
          getSnapshot: vi.fn(async (repoId: string) =>
            snapshot(repoId.endsWith('/api') ? 'api' : 'web', { targetHead, remotes }),
          ),
        }),
      )

    const original = await build('target-head', ['origin'])
    const changedHead = await build('changed-head', ['origin'])
    const changedRemotes = await build('target-head', ['upstream'])

    expect(original.ok && changedHead.ok && original.plan.token).not.toBe(changedHead.ok && changedHead.plan.token)
    expect(original.ok && changedRemotes.ok && original.plan.token).not.toBe(
      changedRemotes.ok && changedRemotes.plan.token,
    )
  })

  test('lists user-selectable local destinations without requiring the persisted base branch to be checked out', async () => {
    const cleanStatuses = vi.fn(async (repoId: string) => {
      const repositoryName = repoId.endsWith('/api') ? 'api' : 'web'
      return [status(`/workspace/goblin-feature-a/${repositoryName}`)]
    })
    const result = await buildBranchWorkspaceGitActionPlan(
      ROOT,
      { kind: 'batch-merge-out', branchWorkspaceId: WORKSPACE_ID },
      dependencies({
        getStatus: cleanStatuses,
        getSnapshot: vi.fn(async (repoId: string) =>
          snapshot(repoId.endsWith('/api') ? 'api' : 'web', { mainWorktree: false }),
        ),
      }),
    )

    expect(result).toMatchObject({
      ok: true,
      plan: {
        kind: 'batch-merge-out',
        members: [
          {
            repositoryName: 'api',
            targetHead: 'target-head',
            ready: true,
            destinationBranches: [
              {
                branch: 'main',
                ready: true,
                requiresTemporaryWorktree: true,
                pullMergePushReady: true,
              },
              {
                branch: 'release/v2',
                ready: true,
                requiresTemporaryWorktree: true,
                pullMergePushReady: true,
              },
            ],
          },
          {
            repositoryName: 'web',
            targetHead: 'target-head',
            ready: true,
          },
        ],
      },
    })
  })

  test('excludes the member target and marks a dirty destination worktree unavailable', async () => {
    const result = await buildBranchWorkspaceGitActionPlan(
      ROOT,
      { kind: 'batch-merge-out', branchWorkspaceId: WORKSPACE_ID },
      dependencies({
        getStatus: vi.fn(async (repoId: string) => {
          const repositoryName = repoId.endsWith('/api') ? 'api' : 'web'
          return [
            status(`/workspace/${repositoryName}`),
            status(`/workspace/${repositoryName}-release`, [{ x: 'M', y: ' ', path: 'src/release.ts' }]),
            status(`/workspace/goblin-feature-a/${repositoryName}`),
          ]
        }),
        getSnapshot: vi.fn(async (repoId: string) =>
          snapshot(repoId.endsWith('/api') ? 'api' : 'web', { releaseWorktree: 'dirty' }),
        ),
      }),
    )

    expect(result.ok && result.plan.kind === 'batch-merge-out' && result.plan.members[0]?.destinationBranches).toEqual([
      expect.objectContaining({ branch: 'main', ready: true, requiresTemporaryWorktree: false }),
      expect.objectContaining({
        branch: 'release/v2',
        ready: false,
        requiresTemporaryWorktree: false,
        message: 'workspace.branch-workspace.git-action.destination-worktree-dirty',
      }),
    ])
  })

  test('lists local source refs for batch merge-in and projects target upstream readiness', async () => {
    const result = await buildBranchWorkspaceGitActionPlan(
      ROOT,
      { kind: 'batch-merge-in', branchWorkspaceId: WORKSPACE_ID },
      dependencies({
        getStatus: vi.fn(async (repoId: string) => {
          const repositoryName = repoId.endsWith('/api') ? 'api' : 'web'
          return [
            status(`/workspace/${repositoryName}`, [{ x: 'M', y: ' ', path: 'src/uncommitted.ts' }]),
            status(`/workspace/goblin-feature-a/${repositoryName}`),
          ]
        }),
        getSnapshot: vi.fn(async (repoId: string) =>
          snapshot(repoId.endsWith('/api') ? 'api' : 'web', { targetTracking: 'origin/feature/a' }),
        ),
      }),
    )

    expect(result).toMatchObject({
      ok: true,
      plan: {
        kind: 'batch-merge-in',
        members: [
          {
            repositoryName: 'api',
            targetBranch: 'feature/a',
            ready: true,
            pullMergePushReady: true,
            sourceBranches: [
              { branch: 'main', head: 'base-head' },
              { branch: 'release/v2', head: 'release-head' },
            ],
          },
          { repositoryName: 'web', ready: true, pullMergePushReady: true },
        ],
      },
    })
  })

  test('keeps a dirty merge-in target visible but unavailable', async () => {
    const result = await buildBranchWorkspaceGitActionPlan(
      ROOT,
      { kind: 'batch-merge-in', branchWorkspaceId: WORKSPACE_ID },
      dependencies(),
    )

    expect(result).toMatchObject({
      ok: true,
      plan: {
        kind: 'batch-merge-in',
        members: [
          {
            repositoryName: 'api',
            ready: false,
            message: 'workspace.branch-workspace.git-action.target-worktree-dirty',
            sourceBranches: [{ branch: 'main', head: 'base-head' }, { branch: 'release/v2' }],
          },
          { repositoryName: 'web', ready: true },
        ],
      },
    })
  })

  test('revalidates every unfinished member while ignoring completed members', async () => {
    const original = await buildBranchWorkspaceGitActionPlan(
      ROOT,
      { kind: 'batch-commit', branchWorkspaceId: WORKSPACE_ID },
      dependencies(),
    )
    expect(original.ok).toBe(true)
    if (!original.ok) return

    const result = await validateBranchWorkspaceGitActionPlan(
      original.plan,
      new Set(['api']),
      dependencies({
        getSnapshot: vi.fn(async (repoId: string) =>
          snapshot(repoId.endsWith('/api') ? 'api' : 'web', {
            targetHead: repoId.endsWith('/api') ? 'new-head' : 'target-head',
          }),
        ),
      }),
    )

    expect(result.ok).toBe(true)
  })
})
