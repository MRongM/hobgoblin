import path from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import {
  buildBranchWorkspaceGitActionPlan,
  validateBranchWorkspaceGitActionPlan,
  type BranchWorkspaceGitActionPlanDependencies,
} from '#/server/modules/branch-workspace-git-action-plan.ts'
import type { BranchWorkspaceManifest } from '#/shared/branch-workspaces.ts'
import type { StatusEntry } from '#/shared/git-types.ts'
import type { RepoSnapshot } from '#/shared/rpc.ts'

const ROOT = path.resolve('fixtures', 'branch-workspace-plan')
const REPOSITORY_NAME = 'api'
const WORKSPACE_ID = 'branch-workspace-1'
const TARGET_BRANCH = 'feature/a'
const TARGET_WORKTREE = path.join(ROOT, 'goblin-feature-a', REPOSITORY_NAME)
const INITIAL_HEAD = '1'.repeat(40)
const CHANGED_HEAD = '2'.repeat(40)
const UPSTREAM = 'origin/feature/a'

function manifest(): BranchWorkspaceManifest {
  return {
    id: WORKSPACE_ID,
    rootId: ROOT,
    branch: TARGET_BRANCH,
    directoryName: 'goblin-feature-a',
    path: path.join(ROOT, 'goblin-feature-a'),
    repositories: [
      {
        repositoryName: REPOSITORY_NAME,
        targetBranch: TARGET_BRANCH,
        creationBase: { kind: 'localBranch', branch: 'main' },
        syncBeforeCreate: false,
        branchOrigin: 'created',
        worktreePath: TARGET_WORKTREE,
        progress: 'complete',
      },
    ],
    auxiliaryEntries: [],
  }
}

function snapshot(head: string, upstream = UPSTREAM): RepoSnapshot {
  return {
    current: 'main',
    branches: [
      {
        name: TARGET_BRANCH,
        isCurrent: false,
        tracking: upstream,
        ahead: 1,
        behind: 0,
        lastCommitHash: head,
        lastCommitMessage: 'target',
        lastCommitDate: '2026-08-30T00:00:00Z',
        lastCommitAuthor: 'developer',
        worktree: { path: TARGET_WORKTREE, head },
      },
    ],
  }
}

function dependencies(
  options: {
    head?: string
    upstream?: string
    entries?: StatusEntry[]
    indexHash?: string
    worktreeTree?: string
  } = {},
): BranchWorkspaceGitActionPlanDependencies {
  return {
    readManifests: vi.fn(async () => ({ kind: 'ready' as const, manifests: [manifest()] })),
    getSnapshot: vi.fn(async () => snapshot(options.head ?? INITIAL_HEAD, options.upstream)),
    getWorktreeStatusEntries: vi.fn(async () => options.entries ?? []),
    getWorktreeContentState: vi.fn(async () => ({
      indexHash: options.indexHash ?? '3'.repeat(40),
      worktreeTree: options.worktreeTree ?? '4'.repeat(40),
    })),
  }
}

async function buildPlan(planDependencies = dependencies()) {
  return await buildBranchWorkspaceGitActionPlan(
    ROOT,
    { kind: 'batch-align-remote', branchWorkspaceId: WORKSPACE_ID },
    planDependencies,
  )
}

describe('branch workspace force remote alignment plan', () => {
  test('accepts discardable local state created after confirmation', async () => {
    const original = await buildPlan()
    expect(original.ok).toBe(true)
    if (!original.ok) return

    const result = await validateBranchWorkspaceGitActionPlan(
      original.plan,
      new Set(),
      dependencies({
        head: CHANGED_HEAD,
        entries: [
          { x: 'M', y: ' ', path: 'src/changed.ts' },
          { x: '?', y: '?', path: 'scratch/new.txt' },
        ],
        indexHash: '5'.repeat(40),
        worktreeTree: '6'.repeat(40),
      }),
    )

    expect(result).toMatchObject({ ok: true, plan: { kind: 'batch-align-remote' } })
  })

  test('rejects an upstream target changed after confirmation', async () => {
    const original = await buildPlan()
    expect(original.ok).toBe(true)
    if (!original.ok) return

    const result = await validateBranchWorkspaceGitActionPlan(
      original.plan,
      new Set(),
      dependencies({ upstream: 'upstream/feature/a' }),
    )

    expect(result).toEqual({
      ok: false,
      message: 'workspace.branch-workspace.git-action.repository-changed',
      repositoryName: REPOSITORY_NAME,
    })
  })
})
