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
      baseBranch: 'main',
      branchOrigin: 'created' as const,
      worktreePath: `/workspace/goblin-feature-a/${repositoryName}`,
      progress: 'complete' as const,
    })),
    auxiliaryEntries: [],
  }
}

function snapshot(repositoryName: string, options: { tracking?: string; targetHead?: string } = {}): RepoSnapshot {
  const targetPath = `/workspace/goblin-feature-a/${repositoryName}`
  const basePath = `/workspace/${repositoryName}`
  return {
    current: 'main',
    branches: [
      {
        name: 'feature/a',
        isCurrent: false,
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
        tracking: options.tracking ?? 'origin/main',
        ahead: 0,
        behind: 0,
        lastCommitHash: 'base-head',
        lastCommitMessage: 'base',
        lastCommitDate: '2026-07-21T00:00:00Z',
        lastCommitAuthor: 'dev',
        worktree: { path: basePath, head: 'base-head', isPrimary: true },
      },
    ],
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
    isAncestor: vi.fn(async () => false),
    ...overrides,
  }
}

describe('buildBranchWorkspaceGitActionPlan', () => {
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

  test('uses persisted base branches and exposes pull-merge-push readiness', async () => {
    const cleanStatuses = vi.fn(async (repoId: string) => {
      const repositoryName = repoId.endsWith('/api') ? 'api' : 'web'
      return [status(`/workspace/${repositoryName}`), status(`/workspace/goblin-feature-a/${repositoryName}`)]
    })
    const result = await buildBranchWorkspaceGitActionPlan(
      ROOT,
      { kind: 'merge-back', branchWorkspaceId: WORKSPACE_ID },
      dependencies({ getStatus: cleanStatuses }),
    )

    expect(result).toMatchObject({
      ok: true,
      plan: {
        kind: 'merge-back',
        pullMergePushReady: true,
        members: [
          { repositoryName: 'api', targetHead: 'target-head', baseBranch: 'main', baseWorktreePath: '/workspace/api' },
          { repositoryName: 'web', targetHead: 'target-head', baseBranch: 'main', baseWorktreePath: '/workspace/web' },
        ],
      },
    })
  })

  test('rejects merge-back when the persisted base branch has no worktree', async () => {
    const result = await buildBranchWorkspaceGitActionPlan(
      ROOT,
      { kind: 'merge-back', branchWorkspaceId: WORKSPACE_ID },
      dependencies({
        getStatus: vi.fn(async (repoId: string) => {
          const repositoryName = repoId.endsWith('/api') ? 'api' : 'web'
          return [status(`/workspace/${repositoryName}`), status(`/workspace/goblin-feature-a/${repositoryName}`)]
        }),
        getSnapshot: vi.fn(async (repoId: string) => {
          const value = snapshot(repoId.endsWith('/api') ? 'api' : 'web')
          value.branches[1] = { ...value.branches[1]!, worktree: undefined }
          return value
        }),
      }),
    )

    expect(result).toEqual({
      ok: false,
      message: 'workspace.branch-workspace.git-action.base-worktree-required',
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
})
