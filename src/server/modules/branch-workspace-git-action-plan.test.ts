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

function manifest(repositoryNames: string[] = ['api', 'web']): BranchWorkspaceManifest {
  return {
    id: WORKSPACE_ID,
    rootId: ROOT,
    branch: 'feature/a',
    directoryName: 'goblin-feature-a',
    path: '/workspace/goblin-feature-a',
    repositories: repositoryNames.map((repositoryName) => ({
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
    getRemoteBranchInfo: vi.fn(async () => []),
    getWorktreeContentState: vi.fn(async () => ({
      indexHash: '3'.repeat(40),
      worktreeTree: '4'.repeat(40),
    })),
    getPatch: vi.fn(async () => ({ ok: true, message: 'diff --git a/src/a.ts b/src/a.ts\n+change' })),
    ...overrides,
  }
}

function snapshotForMemberTarget(
  repositoryName: string,
  targetBranch: string,
  targetWorktreePath: string,
): RepoSnapshot {
  const result = snapshot(repositoryName)
  const target = result.branches[0]!
  result.branches[0] = {
    ...target,
    name: targetBranch,
    worktree: { ...target.worktree!, path: targetWorktreePath, head: 'target-head' },
  }
  return result
}

describe('buildBranchWorkspaceGitActionPlan', () => {
  test('skips snapshot worktree status and unused remote metadata', async () => {
    const deps = dependencies()

    await buildBranchWorkspaceGitActionPlan(ROOT, { kind: 'batch-merge-in', branchWorkspaceId: WORKSPACE_ID }, deps)

    expect(deps.getSnapshot).toHaveBeenNthCalledWith(1, '/workspace/api', expect.any(AbortSignal), {
      includeWorktreeStatus: false,
      includeRemote: false,
    })
    expect(deps.getSnapshot).toHaveBeenNthCalledWith(2, '/workspace/web', expect.any(AbortSignal), {
      includeWorktreeStatus: false,
      includeRemote: false,
    })
  })

  test('keeps remote metadata in push snapshots to resolve push targets', async () => {
    const deps = dependencies()

    await buildBranchWorkspaceGitActionPlan(ROOT, { kind: 'push', branchWorkspaceId: WORKSPACE_ID }, deps)

    expect(deps.getSnapshot).toHaveBeenNthCalledWith(1, '/workspace/api', expect.any(AbortSignal), {
      includeWorktreeStatus: false,
    })
    expect(deps.getSnapshot).toHaveBeenNthCalledWith(2, '/workspace/web', expect.any(AbortSignal), {
      includeWorktreeStatus: false,
    })
  })

  test('reads only each target worktree status when destinations do not need inspection', async () => {
    const getStatus = vi.fn(async (): Promise<WorktreeStatus[]> => {
      throw new Error('full repository status should not be read')
    })
    const getWorktreeStatusEntries = vi.fn(async () => [] as WorktreeStatus['entries'])

    const result = await buildBranchWorkspaceGitActionPlan(
      ROOT,
      { kind: 'batch-merge-in', branchWorkspaceId: WORKSPACE_ID },
      dependencies({ getStatus, getWorktreeStatusEntries }),
    )

    expect(result).toMatchObject({ ok: true, plan: { kind: 'batch-merge-in' } })
    expect(getWorktreeStatusEntries).toHaveBeenCalledTimes(2)
    expect(getWorktreeStatusEntries).toHaveBeenNthCalledWith(
      1,
      '/workspace/api',
      '/workspace/goblin-feature-a/api',
      expect.any(AbortSignal),
    )
    expect(getWorktreeStatusEntries).toHaveBeenNthCalledWith(
      2,
      '/workspace/web',
      '/workspace/goblin-feature-a/web',
      expect.any(AbortSignal),
    )
    expect(getStatus).not.toHaveBeenCalled()
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

  test.each([
    'batch-commit',
    'batch-discard',
    'batch-align-remote',
    'batch-merge-in',
    'batch-merge-out',
    'batch-set-upstream',
    'pull',
    'push',
  ] as const)('reads %s members with bounded concurrency while preserving manifest order', async (kind) => {
    const repositoryNames = ['api', 'web', 'worker', 'docs', 'admin']
    const currentManifest = manifest(repositoryNames)
    let activeSnapshots = 0
    let maxActiveSnapshots = 0
    const result = await buildBranchWorkspaceGitActionPlan(
      ROOT,
      { kind, branchWorkspaceId: WORKSPACE_ID },
      dependencies({
        readManifests: vi.fn(async () => ({ kind: 'ready' as const, manifests: [currentManifest] })),
        getSnapshot: vi.fn(async (repoId: string) => {
          activeSnapshots += 1
          maxActiveSnapshots = Math.max(maxActiveSnapshots, activeSnapshots)
          await new Promise((resolve) => setTimeout(resolve, 20))
          activeSnapshots -= 1
          return snapshot(repoId.split('/').at(-1)!)
        }),
        getStatus: vi.fn(async (repoId: string) => {
          const repositoryName = repoId.split('/').at(-1)!
          return [status(`/workspace/goblin-feature-a/${repositoryName}`)]
        }),
      }),
    )

    expect(maxActiveSnapshots).toBe(4)
    expect(result.ok && result.plan.members.map((member) => member.repositoryName)).toEqual(repositoryNames)
  })

  test('aborts active reads and does not start queued members after a member read throws', async () => {
    const repositoryNames = ['api', 'web', 'worker', 'docs', 'admin']
    const started: string[] = []
    const activeSignals: AbortSignal[] = []
    const result = await buildBranchWorkspaceGitActionPlan(
      ROOT,
      { kind: 'batch-commit', branchWorkspaceId: WORKSPACE_ID },
      dependencies({
        readManifests: vi.fn(async () => ({ kind: 'ready' as const, manifests: [manifest(repositoryNames)] })),
        getSnapshot: vi.fn(async (repoId: string, signal?: AbortSignal) => {
          const repositoryName = repoId.split('/').at(-1)!
          started.push(repositoryName)
          if (repositoryName === 'api') {
            await new Promise((resolve) => setTimeout(resolve, 10))
            throw new Error('snapshot failed')
          }
          if (!signal) throw new Error('member signal required')
          activeSignals.push(signal)
          return await new Promise<RepoSnapshot>((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
          })
        }),
      }),
    )

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(result).toEqual({ ok: false, message: 'snapshot failed' })
    expect(started).toEqual(['api', 'web', 'worker', 'docs'])
    expect(activeSignals).toHaveLength(3)
    expect(activeSignals.every((signal) => signal.aborted)).toBe(true)
  })

  test('plans exact changed paths for every branch workspace member in manifest order', async () => {
    const deps = dependencies({
      getStatus: vi.fn(async (repoId: string) => {
        const repositoryName = repoId.endsWith('/api') ? 'api' : 'web'
        const entries =
          repositoryName === 'api'
            ? [
                { x: '?', y: '?', path: 'scratch/new.txt' },
                { x: 'R', y: ' ', path: 'src/a.ts', originalPath: 'src/legacy-a.ts' },
              ]
            : []
        return [
          status(`/workspace/${repositoryName}`),
          status(`/workspace/goblin-feature-a/${repositoryName}`, entries),
        ]
      }),
    })

    const result = await buildBranchWorkspaceGitActionPlan(
      ROOT,
      { kind: 'batch-discard', branchWorkspaceId: WORKSPACE_ID },
      deps,
    )

    expect(result).toMatchObject({
      ok: true,
      plan: {
        kind: 'batch-discard',
        members: [
          {
            repositoryName: 'api',
            targetWorktreePath: '/workspace/goblin-feature-a/api',
            paths: ['scratch/new.txt', 'src/legacy-a.ts', 'src/a.ts'],
            changeCount: 2,
          },
          {
            repositoryName: 'web',
            targetWorktreePath: '/workspace/goblin-feature-a/web',
            paths: [],
            changeCount: 0,
          },
        ],
      },
    })
    expect(deps.getPatch).toHaveBeenNthCalledWith(
      1,
      '/workspace/api',
      '/workspace/goblin-feature-a/api',
      expect.any(AbortSignal),
    )
    expect(deps.getPatch).toHaveBeenNthCalledWith(
      2,
      '/workspace/web',
      '/workspace/goblin-feature-a/web',
      expect.any(AbortSignal),
    )
  })

  test('plans destructive remote alignment for every member and blocks missing upstreams', async () => {
    const result = await buildBranchWorkspaceGitActionPlan(
      ROOT,
      { kind: 'batch-align-remote', branchWorkspaceId: WORKSPACE_ID },
      dependencies({
        getSnapshot: vi.fn(async (repoId: string) =>
          snapshot(
            repoId.endsWith('/api') ? 'api' : 'web',
            repoId.endsWith('/api') ? { targetTracking: 'origin/feature/a' } : {},
          ),
        ),
      }),
    )

    expect(result).toMatchObject({
      ok: true,
      plan: {
        kind: 'batch-align-remote',
        ready: false,
        members: [
          {
            repositoryName: 'api',
            upstream: 'origin/feature/a',
            ahead: 1,
            changeCount: 1,
            ready: true,
          },
          {
            repositoryName: 'web',
            upstream: null,
            changeCount: 0,
            ready: false,
            message: 'workspace.branch-workspace.git-action.target-upstream-required',
          },
        ],
      },
    })
  })

  test('rejects a batch discard plan when full patch content changes under the same status', async () => {
    const original = await buildBranchWorkspaceGitActionPlan(
      ROOT,
      { kind: 'batch-discard', branchWorkspaceId: WORKSPACE_ID },
      dependencies(),
    )
    expect(original.ok).toBe(true)
    if (!original.ok) return

    const result = await validateBranchWorkspaceGitActionPlan(
      original.plan,
      new Set(),
      dependencies({
        getPatch: vi.fn(async (repoId: string) => ({
          ok: true,
          message: repoId.endsWith('/api') ? 'same status, newer content' : 'diff --git a/src/a.ts b/src/a.ts\n+change',
        })),
      }),
    )

    expect(result).toEqual({
      ok: false,
      message: 'workspace.branch-workspace.git-action.repository-changed',
      repositoryName: 'api',
    })
  })

  test('rejects batch remote alignment when worktree content changes under the same status', async () => {
    const original = await buildBranchWorkspaceGitActionPlan(
      ROOT,
      { kind: 'batch-align-remote', branchWorkspaceId: WORKSPACE_ID },
      dependencies({
        getSnapshot: vi.fn(async (repoId: string) =>
          snapshot(repoId.endsWith('/api') ? 'api' : 'web', { targetTracking: 'origin/feature/a' }),
        ),
      }),
    )
    expect(original.ok).toBe(true)
    if (!original.ok) return

    const result = await validateBranchWorkspaceGitActionPlan(
      original.plan,
      new Set(),
      dependencies({
        getSnapshot: vi.fn(async (repoId: string) =>
          snapshot(repoId.endsWith('/api') ? 'api' : 'web', { targetTracking: 'origin/feature/a' }),
        ),
        getWorktreeContentState: vi.fn(async (repoId: string) => ({
          indexHash: repoId.endsWith('/api') ? '5'.repeat(40) : '3'.repeat(40),
          worktreeTree: repoId.endsWith('/api') ? '6'.repeat(40) : '4'.repeat(40),
        })),
      }),
    )

    expect(result).toEqual({
      ok: false,
      message: 'workspace.branch-workspace.git-action.repository-changed',
      repositoryName: 'api',
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
    ['pull', { targetTracking: 'origin/feature/a' }, 'origin/feature/a'],
    ['push', { remotes: ['origin'] }, null],
  ] as const)('builds an ordered ready %s plan for target branches', async (kind, snapshotOptions, upstream) => {
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
            upstream,
            trackingGone: false,
            requiresUpstreamCreation: kind === 'push',
            pushRemotes: kind === 'push' ? ['origin'] : [],
            ready: true,
          },
          {
            repositoryName: 'web',
            targetBranch: 'feature/a',
            targetWorktreePath: '/workspace/goblin-feature-a/web',
            targetHead: 'target-head',
            upstream,
            trackingGone: false,
            requiresUpstreamCreation: kind === 'push',
            pushRemotes: kind === 'push' ? ['origin'] : [],
            ready: true,
          },
        ],
      },
    })
  })

  test.each([
    ['usable upstream', { targetTracking: 'origin/feature/a', remotes: ['origin'] }, false, ['origin']],
    [
      'gone tracking branch with an existing remote',
      { targetTracking: 'origin/feature/a', targetTrackingGone: true, remotes: ['origin'] },
      false,
      ['origin'],
    ],
    ['missing upstream', { remotes: ['upstream', 'origin'] }, true, ['origin', 'upstream']],
    ['deleted upstream remote', { targetTracking: 'origin/feature/a', remotes: ['fork'] }, true, ['fork']],
    ['local upstream', { targetTracking: 'feature/base', remotes: ['origin'] }, true, ['origin']],
  ] as const)(
    'projects push target state for %s',
    async (_label, snapshotOptions, requiresUpstreamCreation, pushRemotes) => {
      const result = await buildBranchWorkspaceGitActionPlan(
        ROOT,
        { kind: 'push', branchWorkspaceId: WORKSPACE_ID },
        dependencies({
          getSnapshot: vi.fn(async (repoId: string) =>
            snapshot(repoId.endsWith('/api') ? 'api' : 'web', snapshotOptions),
          ),
        }),
      )

      expect(result).toMatchObject({
        ok: true,
        plan: {
          kind: 'push',
          ready: true,
          members: [
            { repositoryName: 'api', requiresUpstreamCreation, pushRemotes },
            { repositoryName: 'web', requiresUpstreamCreation, pushRemotes },
          ],
        },
      })
    },
  )

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
          {
            repositoryName: 'api',
            upstream: kind === 'pull' ? 'origin/feature/a' : null,
            trackingGone: kind === 'pull',
            requiresUpstreamCreation: kind === 'push',
            pushRemotes: [],
            ready: false,
            message,
          },
          {
            repositoryName: 'web',
            upstream: kind === 'pull' ? 'origin/feature/a' : null,
            trackingGone: kind === 'pull',
            requiresUpstreamCreation: kind === 'push',
            pushRemotes: [],
            ready: false,
            message,
          },
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
    const reordered = await build('target-head', ['upstream', 'origin'])
    const reorderedAgain = await build('target-head', ['origin', 'upstream'])
    const changedHead = await build('changed-head', ['origin'])
    const changedRemotes = await build('target-head', ['upstream'])

    expect(original.ok && changedHead.ok && original.plan.token).not.toBe(changedHead.ok && changedHead.plan.token)
    expect(original.ok && changedRemotes.ok && original.plan.token).not.toBe(
      changedRemotes.ok && changedRemotes.plan.token,
    )
    expect(reordered.ok && reorderedAgain.ok && reordered.plan.token).toBe(
      reorderedAgain.ok && reorderedAgain.plan.token,
    )
  })

  test('projects current upstream and same-repository remote candidates for each batch upstream member', async () => {
    const getRemoteBranchInfo = vi.fn(async (repoId: string) => [
      {
        remoteRef: repoId.endsWith('/api') ? 'origin/release' : 'upstream/release',
        head: 'a'.repeat(40),
      },
    ])
    const result = await buildBranchWorkspaceGitActionPlan(
      ROOT,
      { kind: 'batch-set-upstream', branchWorkspaceId: WORKSPACE_ID },
      dependencies({
        getSnapshot: vi.fn(async (repoId: string) =>
          snapshot(repoId.endsWith('/api') ? 'api' : 'web', {
            targetTracking: repoId.endsWith('/api') ? 'origin/feature/a' : undefined,
          }),
        ),
        getRemoteBranchInfo,
      }),
    )

    expect(result).toMatchObject({
      ok: true,
      plan: {
        kind: 'batch-set-upstream',
        ready: true,
        members: [
          {
            repositoryName: 'api',
            currentUpstream: 'origin/feature/a',
            remoteBranches: [{ remoteRef: 'origin/release' }],
            ready: true,
          },
          {
            repositoryName: 'web',
            currentUpstream: null,
            remoteBranches: [{ remoteRef: 'upstream/release' }],
            ready: true,
          },
        ],
      },
    })
    expect(getRemoteBranchInfo).toHaveBeenNthCalledWith(1, '/workspace/api', expect.any(AbortSignal))
    expect(getRemoteBranchInfo).toHaveBeenNthCalledWith(2, '/workspace/web', expect.any(AbortSignal))
  })

  test('keeps batch upstream members with neither tracking nor remote candidates visible but unselectable', async () => {
    const result = await buildBranchWorkspaceGitActionPlan(
      ROOT,
      { kind: 'batch-set-upstream', branchWorkspaceId: WORKSPACE_ID },
      dependencies({ getRemoteBranchInfo: vi.fn(async () => []) }),
    )

    expect(result).toMatchObject({
      ok: true,
      plan: {
        kind: 'batch-set-upstream',
        ready: false,
        members: [
          { ready: false, currentUpstream: null },
          { ready: false, currentUpstream: null },
        ],
      },
    })
  })

  test('keeps tracked members selectable for upstream removal without remote candidates', async () => {
    const result = await buildBranchWorkspaceGitActionPlan(
      ROOT,
      { kind: 'batch-set-upstream', branchWorkspaceId: WORKSPACE_ID },
      dependencies({
        getSnapshot: vi.fn(async (repoId: string) =>
          snapshot(repoId.endsWith('/api') ? 'api' : 'web', { targetTracking: 'origin/feature/a' }),
        ),
        getRemoteBranchInfo: vi.fn(async () => []),
      }),
    )

    expect(result).toMatchObject({
      ok: true,
      plan: {
        kind: 'batch-set-upstream',
        ready: true,
        members: [
          { ready: true, currentUpstream: 'origin/feature/a', remoteBranches: [] },
          { ready: true, currentUpstream: 'origin/feature/a', remoteBranches: [] },
        ],
      },
    })
  })

  test.each([
    ['target branch', { targetBranch: 'release/v2' }],
    ['member worktree path', { worktreePath: '/workspace/goblin-feature-a/api-next' }],
  ])('rejects a batch upstream plan when selected member identity %s changes', async (_change, apiChange) => {
    const originalManifest = manifest()
    const currentManifest = manifest()
    Object.assign(currentManifest.repositories[0]!, apiChange)
    const planDependencies = (current: BranchWorkspaceManifest) =>
      dependencies({
        readManifests: vi.fn(async () => ({ kind: 'ready' as const, manifests: [current] })),
        getSnapshot: vi.fn(async (repoId: string) => {
          const repositoryName = repoId.endsWith('/api') ? 'api' : 'web'
          const member = current.repositories.find((candidate) => candidate.repositoryName === repositoryName)!
          return snapshotForMemberTarget(repositoryName, member.targetBranch, member.worktreePath)
        }),
        getStatus: vi.fn(async (repoId: string) => {
          const repositoryName = repoId.endsWith('/api') ? 'api' : 'web'
          const member = current.repositories.find((candidate) => candidate.repositoryName === repositoryName)!
          return [status(member.worktreePath)]
        }),
        getRemoteBranchInfo: vi.fn(async () => [{ remoteRef: 'origin/release', head: 'a'.repeat(40) }]),
      })
    const original = await buildBranchWorkspaceGitActionPlan(
      ROOT,
      { kind: 'batch-set-upstream', branchWorkspaceId: WORKSPACE_ID },
      planDependencies(originalManifest),
    )
    expect(original.ok).toBe(true)
    if (!original.ok) return

    await expect(
      validateBranchWorkspaceGitActionPlan(original.plan, new Set(), planDependencies(currentManifest)),
    ).resolves.toMatchObject({ ok: false, repositoryName: 'api' })
  })

  test('keeps a recoverably unreadable batch upstream member visible while a sibling remains selectable', async () => {
    const result = await buildBranchWorkspaceGitActionPlan(
      ROOT,
      { kind: 'batch-set-upstream', branchWorkspaceId: WORKSPACE_ID },
      dependencies({
        getSnapshot: vi.fn(async (repoId: string) => (repoId.endsWith('/api') ? undefined : snapshot('web'))),
        getRemoteBranchInfo: vi.fn(async (repoId: string) => [
          { remoteRef: repoId.endsWith('/api') ? 'origin/release' : 'upstream/release', head: 'a'.repeat(40) },
        ]),
      }),
    )

    expect(result).toMatchObject({
      ok: true,
      plan: {
        kind: 'batch-set-upstream',
        ready: false,
        members: [
          {
            repositoryName: 'api',
            repoId: '/workspace/api',
            targetBranch: 'feature/a',
            targetWorktreePath: '/workspace/goblin-feature-a/api',
            ready: false,
            remoteBranches: [],
            message: 'workspace.branch-workspace.repository-unavailable',
            fingerprint: expect.stringMatching(/^sha256:/),
          },
          { repositoryName: 'web', ready: true, remoteBranches: [{ remoteRef: 'upstream/release' }] },
        ],
      },
    })
  })

  test('keeps an aborted batch upstream member read fatal', async () => {
    await expect(
      buildBranchWorkspaceGitActionPlan(
        ROOT,
        { kind: 'batch-set-upstream', branchWorkspaceId: WORKSPACE_ID },
        dependencies({
          getRemoteBranchInfo: vi.fn(async () => {
            throw new DOMException('Aborted', 'AbortError')
          }),
        }),
      ),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  test.each([
    ['current upstream', { targetTracking: 'origin/next' }, { remoteRef: 'origin/release', head: 'a'.repeat(40) }],
    [
      'tracking gone state',
      { targetTracking: 'origin/feature/a', targetTrackingGone: true },
      { remoteRef: 'origin/release', head: 'a'.repeat(40) },
    ],
    [
      'target head',
      { targetTracking: 'origin/feature/a', targetHead: 'changed-head' },
      { remoteRef: 'origin/release', head: 'a'.repeat(40) },
    ],
    [
      'existing remote candidate head',
      { targetTracking: 'origin/feature/a' },
      { remoteRef: 'origin/release', head: 'b'.repeat(40) },
    ],
  ])(
    'rejects a batch upstream plan when only the selected member %s changes',
    async (_change, apiSnapshot, apiRemote) => {
      const original = await buildBranchWorkspaceGitActionPlan(
        ROOT,
        { kind: 'batch-set-upstream', branchWorkspaceId: WORKSPACE_ID },
        dependencies({
          getSnapshot: vi.fn(async (repoId: string) =>
            snapshot(repoId.endsWith('/api') ? 'api' : 'web', { targetTracking: 'origin/feature/a' }),
          ),
          getRemoteBranchInfo: vi.fn(async () => [{ remoteRef: 'origin/release', head: 'a'.repeat(40) }]),
        }),
      )
      expect(original.ok).toBe(true)
      if (!original.ok) return

      await expect(
        validateBranchWorkspaceGitActionPlan(
          original.plan,
          new Set(),
          dependencies({
            getSnapshot: vi.fn(async (repoId: string) =>
              snapshot(
                repoId.endsWith('/api') ? 'api' : 'web',
                repoId.endsWith('/api') ? apiSnapshot : { targetTracking: 'origin/feature/a' },
              ),
            ),
            getRemoteBranchInfo: vi.fn(async (repoId: string) => [
              repoId.endsWith('/api') ? apiRemote : { remoteRef: 'origin/release', head: 'a'.repeat(40) },
            ]),
          }),
        ),
      ).resolves.toMatchObject({ ok: false, repositoryName: 'api' })
    },
  )

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
                destination: { kind: 'local', branch: 'main' },
                ready: true,
                requiresTemporaryWorktree: true,
                pullMergePushReady: true,
              },
              {
                destination: { kind: 'local', branch: 'release/v2' },
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

  test('keeps a batch merge-out member ready when its source has only ordinary uncommitted changes', async () => {
    const result = await buildBranchWorkspaceGitActionPlan(
      ROOT,
      { kind: 'batch-merge-out', branchWorkspaceId: WORKSPACE_ID },
      dependencies({
        getStatus: vi.fn(async (repoId: string) => {
          const repositoryName = repoId.endsWith('/api') ? 'api' : 'web'
          const sourceEntries =
            repositoryName === 'api'
              ? [
                  { x: 'M', y: ' ', path: 'src/staged.ts' },
                  { x: ' ', y: 'M', path: 'src/unstaged.ts' },
                  { x: '?', y: '?', path: 'scratch/untracked.txt' },
                ]
              : []
          return [
            status(`/workspace/${repositoryName}`),
            status(`/workspace/goblin-feature-a/${repositoryName}`, sourceEntries),
          ]
        }),
      }),
    )

    expect(result).toMatchObject({
      ok: true,
      plan: {
        kind: 'batch-merge-out',
        members: [
          { repositoryName: 'api', ready: true },
          { repositoryName: 'web', ready: true },
        ],
      },
    })
    expect(result.ok && result.plan.members[0]).not.toHaveProperty('message')
  })

  test('keeps a conflicted batch merge-out source visible but unavailable', async () => {
    const result = await buildBranchWorkspaceGitActionPlan(
      ROOT,
      { kind: 'batch-merge-out', branchWorkspaceId: WORKSPACE_ID },
      dependencies({
        getStatus: vi.fn(async (repoId: string) => {
          const repositoryName = repoId.endsWith('/api') ? 'api' : 'web'
          return [
            status(`/workspace/${repositoryName}`),
            status(
              `/workspace/goblin-feature-a/${repositoryName}`,
              repositoryName === 'api' ? [{ x: 'U', y: 'U', path: 'src/conflicted.ts' }] : [],
            ),
          ]
        }),
      }),
    )

    expect(result).toMatchObject({
      ok: true,
      plan: {
        kind: 'batch-merge-out',
        members: [
          {
            repositoryName: 'api',
            ready: false,
            message: 'workspace.branch-workspace.git-action.source-worktree-conflicted',
          },
          { repositoryName: 'web', ready: true },
        ],
      },
    })
  })

  test('ignores ordinary source status changes in batch merge-out tokens but tracks conflicts and HEAD', async () => {
    const build = async (entries: WorktreeStatus['entries'], apiTargetHead = 'target-head') =>
      await buildBranchWorkspaceGitActionPlan(
        ROOT,
        { kind: 'batch-merge-out', branchWorkspaceId: WORKSPACE_ID },
        dependencies({
          getSnapshot: vi.fn(async (repoId: string) =>
            snapshot(repoId.endsWith('/api') ? 'api' : 'web', {
              targetHead: repoId.endsWith('/api') ? apiTargetHead : 'target-head',
            }),
          ),
          getStatus: vi.fn(async (repoId: string) => {
            const repositoryName = repoId.endsWith('/api') ? 'api' : 'web'
            return [
              status(`/workspace/${repositoryName}`),
              status(`/workspace/goblin-feature-a/${repositoryName}`, repositoryName === 'api' ? entries : []),
            ]
          }),
        }),
      )

    const staged = await build([{ x: 'M', y: ' ', path: 'src/a.ts' }])
    const untracked = await build([{ x: '?', y: '?', path: 'scratch/b.txt' }])
    const conflicted = await build([{ x: 'U', y: 'U', path: 'src/a.ts' }])
    const changedHead = await build([{ x: 'M', y: ' ', path: 'src/a.ts' }], 'changed-source-head')

    expect(staged.ok && untracked.ok && staged.plan.token).toBe(untracked.ok && untracked.plan.token)
    expect(staged.ok && conflicted.ok && staged.plan.token).not.toBe(conflicted.ok && conflicted.plan.token)
    expect(staged.ok && changedHead.ok && staged.plan.token).not.toBe(changedHead.ok && changedHead.plan.token)
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
      expect.objectContaining({
        destination: { kind: 'local', branch: 'main' },
        ready: true,
        requiresTemporaryWorktree: false,
      }),
      expect.objectContaining({
        destination: { kind: 'local', branch: 'release/v2' },
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
              { source: { kind: 'local', branch: 'main' }, head: 'base-head' },
              { source: { kind: 'local', branch: 'release/v2' }, head: 'release-head' },
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
            sourceBranches: [
              { source: { kind: 'local', branch: 'main' }, head: 'base-head' },
              { source: { kind: 'local', branch: 'release/v2' } },
            ],
          },
          { repositoryName: 'web', ready: true },
        ],
      },
    })
  })

  test('keeps same-named local and remote refs distinct and includes the target remote counterpart', async () => {
    const cleanStatus = vi.fn(async (repoId: string) => {
      const repositoryName = repoId.endsWith('/api') ? 'api' : 'web'
      return [status(`/workspace/${repositoryName}`), status(`/workspace/goblin-feature-a/${repositoryName}`)]
    })
    const getSnapshot = vi.fn(async (repoId: string) => {
      const repositoryName = repoId.endsWith('/api') ? 'api' : 'web'
      const result = snapshot(repositoryName)
      result.branches.push({
        ...result.branches[1]!,
        name: 'origin/main',
        isCurrent: false,
        worktree: undefined,
        lastCommitHash: 'local-origin-main',
      })
      return result
    })
    const getRemoteBranchInfo = vi.fn(async () => [
      { remoteRef: 'origin/feature/a', head: 'remote-target-head' },
      { remoteRef: 'origin/main', head: 'remote-main-head' },
    ])
    const deps = dependencies({ getStatus: cleanStatus, getSnapshot, getRemoteBranchInfo })

    const mergeIn = await buildBranchWorkspaceGitActionPlan(
      ROOT,
      { kind: 'batch-merge-in', branchWorkspaceId: WORKSPACE_ID },
      deps,
    )
    const mergeOut = await buildBranchWorkspaceGitActionPlan(
      ROOT,
      { kind: 'batch-merge-out', branchWorkspaceId: WORKSPACE_ID },
      deps,
    )

    expect(mergeIn.ok && mergeIn.plan.kind === 'batch-merge-in' && mergeIn.plan.members[0]?.sourceBranches).toEqual([
      expect.objectContaining({ source: { kind: 'local', branch: 'main' }, head: 'base-head' }),
      expect.objectContaining({ source: { kind: 'local', branch: 'release/v2' }, head: 'release-head' }),
      expect.objectContaining({ source: { kind: 'local', branch: 'origin/main' }, head: 'local-origin-main' }),
      expect.objectContaining({
        source: { kind: 'remote', remoteRef: 'origin/feature/a' },
        head: 'remote-target-head',
      }),
      expect.objectContaining({ source: { kind: 'remote', remoteRef: 'origin/main' }, head: 'remote-main-head' }),
    ])
    expect(
      mergeOut.ok && mergeOut.plan.kind === 'batch-merge-out' && mergeOut.plan.members[0]?.destinationBranches,
    ).toEqual([
      expect.objectContaining({ destination: { kind: 'local', branch: 'main' } }),
      expect.objectContaining({ destination: { kind: 'local', branch: 'release/v2' } }),
      expect.objectContaining({ destination: { kind: 'local', branch: 'origin/main' } }),
      expect.objectContaining({
        destination: { kind: 'remote', remoteRef: 'origin/feature/a' },
        ready: true,
        requiresTemporaryWorktree: true,
        pullMergePushReady: true,
      }),
      expect.objectContaining({
        destination: { kind: 'remote', remoteRef: 'origin/main' },
        ready: true,
        requiresTemporaryWorktree: true,
        pullMergePushReady: true,
      }),
    ])
  })

  test('changes the batch merge plan token when a remote-tracking head changes', async () => {
    const build = async (head: string) =>
      await buildBranchWorkspaceGitActionPlan(
        ROOT,
        { kind: 'batch-merge-in', branchWorkspaceId: WORKSPACE_ID },
        dependencies({ getRemoteBranchInfo: vi.fn(async () => [{ remoteRef: 'origin/main', head }]) }),
      )

    const original = await build('remote-head-1')
    const changed = await build('remote-head-2')

    expect(original.ok && changed.ok && original.plan.token).not.toBe(changed.ok && changed.plan.token)
  })

  test('attributes an unavailable remote branch read to the affected member', async () => {
    const result = await buildBranchWorkspaceGitActionPlan(
      ROOT,
      { kind: 'batch-merge-out', branchWorkspaceId: WORKSPACE_ID },
      dependencies({
        getRemoteBranchInfo: vi.fn(async (repoId: string) => {
          if (repoId.endsWith('/api')) throw new Error('remote read failed')
          return []
        }),
      }),
    )

    expect(result).toEqual({
      ok: false,
      message: 'workspace.branch-workspace.git-action.remote-branches-unavailable',
      repositoryName: 'api',
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

  test('does not block selected members when an ignored member is removed', async () => {
    const original = await buildBranchWorkspaceGitActionPlan(
      ROOT,
      { kind: 'push', branchWorkspaceId: WORKSPACE_ID },
      dependencies({
        getSnapshot: vi.fn(async (repoId: string) =>
          snapshot(repoId.endsWith('/api') ? 'api' : 'web', { remotes: ['origin'] }),
        ),
      }),
    )
    expect(original.ok).toBe(true)
    if (!original.ok) return

    const current = manifest()
    current.repositories.pop()
    const result = await validateBranchWorkspaceGitActionPlan(
      original.plan,
      new Set(['web']),
      dependencies({
        readManifests: vi.fn(async () => ({ kind: 'ready' as const, manifests: [current] })),
        getSnapshot: vi.fn(async () => snapshot('api', { remotes: ['origin'] })),
      }),
    )

    expect(result.ok).toBe(true)
  })
})
