import { describe, expect, test, vi } from 'vitest'
import { executeRepositoryBranchMergeOut } from '#/server/modules/repository-branch-merge-write-paths.ts'
import { repositoryTemporaryWorktreePath } from '#/server/modules/repository-temporary-worktree.ts'
import type {
  RepositoryBranchMergeDestinationPlan,
  RepositoryBranchMergeOutPlan,
} from '#/shared/repository-branch-merge.ts'

const REPO_ID = '/workspace/repo'
const SOURCE_PATH = '/workspace/feature'
const DESTINATION_PATH = '/workspace/main'
const TOKEN = 'sha256:plan'

function destination(fields: Partial<RepositoryBranchMergeDestinationPlan> = {}): RepositoryBranchMergeDestinationPlan {
  return {
    branch: 'main',
    head: 'main-head',
    ready: true,
    worktreePath: DESTINATION_PATH,
    requiresTemporaryWorktree: false,
    pullMergePushReady: true,
    ...fields,
  }
}

function plan(
  fields: Partial<RepositoryBranchMergeOutPlan> & { destination?: RepositoryBranchMergeDestinationPlan } = {},
) {
  const { destination: selectedDestination, ...rest } = fields
  return {
    token: TOKEN,
    repoId: REPO_ID,
    sourceBranch: 'feature/source',
    sourceWorktreePath: SOURCE_PATH,
    sourceHead: 'source-head',
    ready: true,
    destinations: [selectedDestination ?? destination()],
    ...rest,
  } satisfies RepositoryBranchMergeOutPlan
}

function input(mode: 'merge' | 'pull-merge-push' = 'merge') {
  return {
    repoId: REPO_ID,
    planToken: TOKEN,
    sourceBranch: 'feature/source',
    sourceWorktreePath: SOURCE_PATH,
    destinationBranch: 'main',
    mode,
  }
}

function success(message = 'ok') {
  return { ok: true, message }
}

function dependencies(
  options: {
    plans?: RepositoryBranchMergeOutPlan[]
    destinationPlan?: RepositoryBranchMergeDestinationPlan
    pullResult?: { ok: boolean; message: string }
    mergeResult?: { ok: boolean; message: string; reason?: 'merge-conflict' }
    pushResult?: { ok: boolean; message: string }
    createResult?: { ok: boolean; message: string; repoChanged?: boolean }
    cleanupResult?: { ok: boolean; message: string }
  } = {},
) {
  const calls: string[] = []
  const plans = options.plans ?? [plan({ destination: options.destinationPlan })]
  let planIndex = 0
  return {
    calls,
    buildPlan: vi.fn(async () => ({ ok: true as const, plan: plans[Math.min(planIndex++, plans.length - 1)]! })),
    pull: vi.fn(async () => {
      calls.push('pull')
      return options.pullResult ?? success()
    }),
    merge: vi.fn(async () => {
      calls.push('merge')
      return options.mergeResult ?? success()
    }),
    push: vi.fn(async () => {
      calls.push('push')
      return options.pushResult ?? success()
    }),
    createWorktree: vi.fn(async () => {
      calls.push('create')
      return options.createResult ?? success()
    }),
    removeWorktree: vi.fn(async () => {
      calls.push('cleanup')
      return options.cleanupResult ?? success()
    }),
  }
}

describe('repository branch merge-out writes', () => {
  test.each([
    ['existing merge', destination(), 'merge' as const, ['merge']],
    [
      'temporary merge',
      destination({ worktreePath: undefined, requiresTemporaryWorktree: true }),
      'merge' as const,
      ['create', 'merge', 'cleanup'],
    ],
    ['existing remote merge', destination(), 'pull-merge-push' as const, ['pull', 'merge', 'push']],
    [
      'temporary remote merge',
      destination({ worktreePath: undefined, requiresTemporaryWorktree: true }),
      'pull-merge-push' as const,
      ['create', 'pull', 'merge', 'push', 'cleanup'],
    ],
  ])('runs the %s pipeline in destination order', async (_name, destinationPlan, mode, expected) => {
    const deps = dependencies({ destinationPlan })

    await expect(executeRepositoryBranchMergeOut(input(mode), deps)).resolves.toMatchObject({ ok: true })
    expect(deps.calls).toEqual(expected)
  })

  test.each([
    ['expired token', { plans: [plan()], rawInput: { ...input(), planToken: 'sha256:old' } }],
    ['dirty source', { plans: [plan({ ready: false, message: 'error.merge-out-source-dirty' })], rawInput: input() }],
    ['deleted destination', { plans: [plan({ destinations: [] })], rawInput: input() }],
    [
      'dirty destination',
      {
        plans: [plan({ destination: destination({ ready: false, blockReason: 'dirty-worktree' }) })],
        rawInput: input(),
      },
    ],
    [
      'unavailable destination',
      {
        plans: [plan({ destination: destination({ ready: false, blockReason: 'unavailable-worktree' }) })],
        rawInput: input(),
      },
    ],
  ])('rejects %s before Git writes', async (_name, scenario) => {
    const deps = dependencies({ plans: scenario.plans })

    await expect(executeRepositoryBranchMergeOut(scenario.rawInput, deps)).resolves.toMatchObject({ ok: false })
    expect(deps.calls).toEqual([])
  })

  test('rejects remote mode when the destination has no upstream', async () => {
    const deps = dependencies({ destinationPlan: destination({ pullMergePushReady: false }) })

    await expect(executeRepositoryBranchMergeOut(input('pull-merge-push'), deps)).resolves.toEqual({
      ok: false,
      message: 'error.merge-out-destination-upstream-required',
    })
    expect(deps.calls).toEqual([])
  })

  test('stops before merge when source truth changes after pull', async () => {
    const deps = dependencies({ plans: [plan(), plan({ sourceHead: 'changed-source-head' })] })

    await expect(executeRepositoryBranchMergeOut(input('pull-merge-push'), deps)).resolves.toEqual({
      ok: false,
      message: 'error.merge-out-source-changed',
    })
    expect(deps.calls).toEqual(['pull'])
  })

  test('leaves an ordinary destination conflict in place for AI takeover', async () => {
    const deps = dependencies({ mergeResult: { ok: false, message: 'conflict', reason: 'merge-conflict' } })

    await expect(executeRepositoryBranchMergeOut(input(), deps)).resolves.toEqual({
      ok: false,
      message: 'conflict',
      reason: 'merge-conflict',
      conflictWorktree: { branch: 'main', path: DESTINATION_PATH },
    })
    expect(deps.removeWorktree).not.toHaveBeenCalled()
  })

  test('cleans a temporary destination conflict without exposing an AI conflict worktree', async () => {
    const destinationPlan = destination({ worktreePath: undefined, requiresTemporaryWorktree: true })
    const deps = dependencies({
      destinationPlan,
      mergeResult: { ok: false, message: 'conflict', reason: 'merge-conflict' },
    })

    await expect(executeRepositoryBranchMergeOut(input(), deps)).resolves.toEqual({
      ok: false,
      message: 'conflict',
      reason: 'merge-conflict',
    })
    expect(deps.calls).toEqual(['create', 'merge', 'cleanup'])
  })

  test.each([
    ['pull failure', { pullResult: { ok: false, message: 'pull failed' } }],
    ['merge failure', { mergeResult: { ok: false, message: 'merge failed' } }],
    ['push failure', { pushResult: { ok: false, message: 'push failed' } }],
  ])('cleans a temporary destination after %s', async (_name, failure) => {
    const destinationPlan = destination({ worktreePath: undefined, requiresTemporaryWorktree: true })
    const deps = dependencies({ destinationPlan, ...failure })

    await expect(executeRepositoryBranchMergeOut(input('pull-merge-push'), deps)).resolves.toMatchObject({ ok: false })
    expect(deps.calls.at(-1)).toBe('cleanup')
  })

  test('cleans a temporary destination when an operation throws cancellation', async () => {
    const destinationPlan = destination({ worktreePath: undefined, requiresTemporaryWorktree: true })
    const deps = dependencies({ destinationPlan })
    deps.merge.mockImplementationOnce(async () => {
      deps.calls.push('merge')
      throw new DOMException('cancelled', 'AbortError')
    })

    await expect(executeRepositoryBranchMergeOut(input(), deps)).resolves.toEqual({
      ok: false,
      message: 'cancelled',
    })
    expect(deps.calls).toEqual(['create', 'merge', 'cleanup'])
  })

  test('reports cleanup failure because hidden owned state still needs attention', async () => {
    const destinationPlan = destination({ worktreePath: undefined, requiresTemporaryWorktree: true })
    const deps = dependencies({ destinationPlan, cleanupResult: { ok: false, message: 'cleanup failed' } })

    await expect(executeRepositoryBranchMergeOut(input(), deps)).resolves.toEqual({
      ok: false,
      message: 'cleanup failed',
    })
  })

  test('creates and removes a deterministic owned path without deleting the destination branch', async () => {
    const destinationPlan = destination({ worktreePath: undefined, requiresTemporaryWorktree: true })
    const deps = dependencies({ destinationPlan })
    const expectedPath = repositoryTemporaryWorktreePath(REPO_ID, 'merge-out', TOKEN, 'main')

    await executeRepositoryBranchMergeOut(input(), deps)

    expect(deps.createWorktree).toHaveBeenCalledWith(
      REPO_ID,
      {
        worktreePath: expectedPath,
        mode: { kind: 'existingBranch', branch: 'main' },
        syncBeforeCreate: false,
      },
      { kind: 'skip' },
      undefined,
      undefined,
    )
    expect(deps.removeWorktree).toHaveBeenCalledWith(
      REPO_ID,
      {
        branch: 'main',
        worktreePath: expectedPath,
        alsoDeleteBranch: false,
        forceRemoveWorktree: true,
      },
      undefined,
      undefined,
    )
  })

  test('cleans an owned stale temporary worktree before creating the current one', async () => {
    const stalePath = '/workspace/.hobgoblin-merge-out-repo-0123456789abcdef'
    const destinationPlan = destination({ worktreePath: stalePath, requiresTemporaryWorktree: true })
    const deps = dependencies({ destinationPlan })

    await expect(executeRepositoryBranchMergeOut(input(), deps)).resolves.toMatchObject({ ok: true })
    expect(deps.calls).toEqual(['cleanup', 'create', 'merge', 'cleanup'])
    expect(deps.removeWorktree).toHaveBeenNthCalledWith(
      1,
      REPO_ID,
      expect.objectContaining({ worktreePath: stalePath, forceRemoveWorktree: true }),
      undefined,
      undefined,
    )
  })
})
