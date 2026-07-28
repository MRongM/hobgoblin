import { describe, expect, test, vi } from 'vitest'
import {
  buildRepositoryBranchMergeOutPlan,
  projectRepositoryMergeDestinations,
} from '#/server/modules/repository-branch-merge-plan.ts'
import type { BranchSnapshotInfo, StatusEntry, WorktreeStatus } from '#/shared/git-types.ts'
import type { RepoSnapshot } from '#/shared/rpc.ts'

const REPO_ID = '/workspace/repo'
const SOURCE_PATH = '/workspace/feature'

function branch(
  name: string,
  fields: Partial<BranchSnapshotInfo> & { worktreePath?: string; worktreeLocked?: boolean } = {},
): BranchSnapshotInfo {
  const { worktreePath, worktreeLocked, ...rest } = fields
  return {
    name,
    isCurrent: name === 'feature/source',
    ahead: 0,
    behind: 0,
    lastCommitHash: `${name}-head`,
    lastCommitMessage: '',
    lastCommitDate: '',
    lastCommitAuthor: '',
    ...(worktreePath
      ? { worktree: { path: worktreePath, head: `${name}-worktree-head`, ...(worktreeLocked ? { isLocked: true } : {}) } }
      : {}),
    ...rest,
  }
}

function status(path: string, entries: StatusEntry[] = [], fields: Partial<WorktreeStatus> = {}): WorktreeStatus {
  return { path, branch: fields.branch, head: fields.head, isMain: false, entries }
}

function snapshot(branches: BranchSnapshotInfo[]): RepoSnapshot {
  return { branches, current: 'feature/source' }
}

function dependencies(options: {
  branches?: BranchSnapshotInfo[]
  statuses?: WorktreeStatus[]
} = {}) {
  return {
    getSnapshot: vi.fn(async () =>
      snapshot(
        options.branches ?? [
          branch('feature/source', { worktreePath: SOURCE_PATH }),
          branch('main', { tracking: 'origin/main' }),
        ],
      ),
    ),
    getStatus: vi.fn(async () => options.statuses ?? [status(SOURCE_PATH)]),
  }
}

describe('repository branch merge-out plan', () => {
  test.each([
    [
      [branch('main')],
      [status(SOURCE_PATH)],
      'error.merge-out-source-worktree-required',
    ],
    [
      [branch('feature/source', { worktreePath: '/workspace/other' }), branch('main')],
      [status(SOURCE_PATH)],
      'error.merge-out-source-worktree-required',
    ],
    [
      [branch('feature/source', { worktreePath: SOURCE_PATH }), branch('main')],
      [],
      'error.merge-out-source-worktree-unavailable',
    ],
  ])('rejects a missing or unavailable source worktree', async (branches, statuses, message) => {
    await expect(
      buildRepositoryBranchMergeOutPlan(
        { repoId: REPO_ID, sourceBranch: 'feature/source', sourceWorktreePath: SOURCE_PATH },
        dependencies({ branches, statuses }),
      ),
    ).resolves.toEqual({ ok: false, message })
  })

  test('returns a non-ready plan for a dirty source', async () => {
    const result = await buildRepositoryBranchMergeOutPlan(
      { repoId: REPO_ID, sourceBranch: 'feature/source', sourceWorktreePath: SOURCE_PATH },
      dependencies({ statuses: [status(SOURCE_PATH, [{ x: 'M', y: ' ', path: 'src/a.ts' }])] }),
    )

    expect(result).toMatchObject({
      ok: true,
      plan: { ready: false, message: 'error.merge-out-source-dirty' },
    })
  })

  test('projects clean, unchecked, dirty, and unavailable destinations', () => {
    const branches = [
      branch('feature/source', { worktreePath: SOURCE_PATH }),
      branch('clean', { worktreePath: '/workspace/clean', tracking: 'origin/clean' }),
      branch('unchecked'),
      branch('dirty', { worktreePath: '/workspace/dirty' }),
      branch('unavailable', { worktreePath: '/workspace/unavailable' }),
    ]
    const destinations = projectRepositoryMergeDestinations({
      repoId: REPO_ID,
      sourceBranch: 'feature/source',
      branches,
      statuses: [
        status(SOURCE_PATH),
        status('/workspace/clean'),
        status('/workspace/dirty', [{ x: 'M', y: ' ', path: 'src/a.ts' }]),
      ],
      isOwnedTemporaryWorktree: () => false,
    })

    expect(destinations).toEqual([
      expect.objectContaining({
        branch: 'clean',
        ready: true,
        worktreePath: '/workspace/clean',
        requiresTemporaryWorktree: false,
        pullMergePushReady: true,
      }),
      expect.objectContaining({ branch: 'dirty', ready: false, blockReason: 'dirty-worktree' }),
      expect.objectContaining({ branch: 'unavailable', ready: false, blockReason: 'unavailable-worktree' }),
      expect.objectContaining({ branch: 'unchecked', ready: true, requiresTemporaryWorktree: true }),
    ])
  })

  test('uses destination upstream only for pull-merge-push readiness', () => {
    const destinations = projectRepositoryMergeDestinations({
      repoId: REPO_ID,
      sourceBranch: 'feature/source',
      branches: [
        branch('feature/source', { worktreePath: SOURCE_PATH, tracking: 'origin/feature/source' }),
        branch('main'),
        branch('release', { tracking: 'origin/release', trackingGone: true }),
      ],
      statuses: [status(SOURCE_PATH)],
      isOwnedTemporaryWorktree: () => false,
    })

    expect(destinations.map(({ branch, pullMergePushReady }) => ({ branch, pullMergePushReady }))).toEqual([
      { branch: 'main', pullMergePushReady: false },
      { branch: 'release', pullMergePushReady: false },
    ])
  })

  test('reclaims an unlocked owned temporary destination but blocks a locked one', () => {
    const unlocked = '/workspace/.hobgoblin-merge-out-repo-0123456789abcdef'
    const locked = '/workspace/.hobgoblin-merge-out-repo-fedcba9876543210'
    const destinations = projectRepositoryMergeDestinations({
      repoId: REPO_ID,
      sourceBranch: 'feature/source',
      branches: [
        branch('feature/source', { worktreePath: SOURCE_PATH }),
        branch('main', { worktreePath: unlocked }),
        branch('release', { worktreePath: locked, worktreeLocked: true }),
      ],
      statuses: [status(SOURCE_PATH)],
      isOwnedTemporaryWorktree: (_repoId, candidatePath) => candidatePath === unlocked || candidatePath === locked,
    })

    expect(destinations).toEqual([
      expect.objectContaining({ branch: 'main', ready: true, requiresTemporaryWorktree: true }),
      expect.objectContaining({
        branch: 'release',
        ready: false,
        requiresTemporaryWorktree: true,
        blockReason: 'unavailable-worktree',
      }),
    ])
  })

  test('fingerprints source truth and destination identities, not destination head or upstream', async () => {
    const build = async (options: { sourceHead?: string; destinationHead?: string; destinationTracking?: string; name?: string }) =>
      await buildRepositoryBranchMergeOutPlan(
        { repoId: REPO_ID, sourceBranch: 'feature/source', sourceWorktreePath: SOURCE_PATH },
        dependencies({
          branches: [
            branch('feature/source', { worktreePath: SOURCE_PATH, worktree: { path: SOURCE_PATH, head: options.sourceHead ?? 'source-head' } }),
            branch(options.name ?? 'main', {
              lastCommitHash: options.destinationHead ?? 'destination-head',
              tracking: options.destinationTracking,
            }),
          ],
          statuses: [status(SOURCE_PATH)],
        }),
      )
    const original = await build({ destinationTracking: 'origin/main' })
    const changedDestinationFacts = await build({ destinationHead: 'other', destinationTracking: undefined })
    const changedSource = await build({ sourceHead: 'other-source', destinationTracking: 'origin/main' })
    const changedIdentity = await build({ name: 'release', destinationTracking: 'origin/main' })

    expect(original.ok && changedDestinationFacts.ok && original.plan.token).toBe(
      changedDestinationFacts.ok && changedDestinationFacts.plan.token,
    )
    expect(original.ok && changedSource.ok && original.plan.token).not.toBe(changedSource.ok && changedSource.plan.token)
    expect(original.ok && changedIdentity.ok && original.plan.token).not.toBe(
      changedIdentity.ok && changedIdentity.plan.token,
    )
  })
})
