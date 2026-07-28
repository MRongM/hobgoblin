import { buildRepositoryBranchMergeOutPlan } from '#/server/modules/repository-branch-merge-plan.ts'
import {
  createRepositoryWorktree,
  mergeRepositoryBranch,
  pullRepositoryBranch,
  pushRepositoryBranch,
  removeRepositoryWorktree,
} from '#/server/modules/repo-write-paths.ts'
import {
  isRepositoryTemporaryWorktreePath,
  repositoryTemporaryWorktreePath,
} from '#/server/modules/repository-temporary-worktree.ts'
import {
  normalizeRepositoryBranchMergeOutExecuteInput,
  type RepositoryBranchMergeOutPlan,
  type RepositoryBranchMergeOutResult,
} from '#/shared/repository-branch-merge.ts'

export interface RepositoryBranchMergeWriteDependencies {
  buildPlan?: typeof buildRepositoryBranchMergeOutPlan
  pull?: typeof pullRepositoryBranch
  merge?: typeof mergeRepositoryBranch
  push?: typeof pushRepositoryBranch
  createWorktree?: typeof createRepositoryWorktree
  removeWorktree?: typeof removeRepositoryWorktree
}

export async function executeRepositoryBranchMergeOut(
  rawInput: unknown,
  dependencies: RepositoryBranchMergeWriteDependencies = {},
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<RepositoryBranchMergeOutResult> {
  const normalized = normalizeRepositoryBranchMergeOutExecuteInput(rawInput)
  if (!normalized.ok) return normalized
  const input = normalized.input
  const buildPlan = dependencies.buildPlan ?? buildRepositoryBranchMergeOutPlan
  const removeWorktree = dependencies.removeWorktree ?? removeRepositoryWorktree
  let activeTemporaryDestination: { branch: string; path: string } | null = null

  try {
    signal?.throwIfAborted()
    const current = await buildPlan(
      {
        repoId: input.repoId,
        sourceBranch: input.sourceBranch,
        sourceWorktreePath: input.sourceWorktreePath,
      },
      {},
      signal,
    )
    if (!current.ok) return current
    if (current.plan.token !== input.planToken) return failure('error.merge-out-plan-changed')
    if (!sameSource(current.plan, input) || !current.plan.ready) {
      return failure(current.plan.message ?? 'error.merge-out-source-unavailable')
    }

    const selectedDestination = current.plan.destinations.find(
      (destination) => destination.branch === input.destinationBranch,
    )
    if (!selectedDestination) return failure('error.merge-out-destination-changed')
    if (!selectedDestination.ready) return failure(destinationUnavailableMessage(selectedDestination.blockReason))
    if (input.mode === 'pull-merge-push' && !selectedDestination.pullMergePushReady) {
      return failure('error.merge-out-destination-upstream-required')
    }

    const temporaryPath = selectedDestination.requiresTemporaryWorktree
      ? repositoryTemporaryWorktreePath(input.repoId, 'merge-out', current.plan.token, input.destinationBranch)
      : null
    if (selectedDestination.requiresTemporaryWorktree && !temporaryPath) {
      return failure('error.merge-out-temporary-worktree-unavailable')
    }

    if (selectedDestination.requiresTemporaryWorktree && selectedDestination.worktreePath) {
      if (!isRepositoryTemporaryWorktreePath(input.repoId, 'merge-out', selectedDestination.worktreePath)) {
        return failure('error.merge-out-destination-worktree-unavailable')
      }
      const staleCleanup = await cleanupTemporaryDestination(
        removeWorktree,
        input.repoId,
        input.destinationBranch,
        selectedDestination.worktreePath,
        sourceToken,
      )
      if (!staleCleanup.ok) return staleCleanup
    }

    const destinationWorktreePath = selectedDestination.requiresTemporaryWorktree
      ? temporaryPath!
      : selectedDestination.worktreePath
    if (!destinationWorktreePath) return failure('error.merge-out-destination-worktree-unavailable')

    let temporaryCreated = false
    if (selectedDestination.requiresTemporaryWorktree) {
      const create = dependencies.createWorktree ?? createRepositoryWorktree
      const createResult = await create(
        input.repoId,
        {
          worktreePath: destinationWorktreePath,
          mode: { kind: 'existingBranch', branch: input.destinationBranch },
        },
        { kind: 'skip' },
        signal,
        sourceToken,
      )
      temporaryCreated = createResult.ok || createResult.repoChanged === true
      if (temporaryCreated) {
        activeTemporaryDestination = { branch: input.destinationBranch, path: destinationWorktreePath }
      }
      if (!createResult.ok) {
        return temporaryCreated
          ? await finishWithTemporaryCleanup(
              createResult,
              removeWorktree,
              input.repoId,
              input.destinationBranch,
              destinationWorktreePath,
              sourceToken,
            )
          : createResult
      }
    }

    const finish = async (result: RepositoryBranchMergeOutResult): Promise<RepositoryBranchMergeOutResult> =>
      temporaryCreated
        ? await finishWithTemporaryCleanup(
            result,
            removeWorktree,
            input.repoId,
            input.destinationBranch,
            destinationWorktreePath,
            sourceToken,
          )
        : result

    if (input.mode === 'pull-merge-push') {
      const pull = dependencies.pull ?? pullRepositoryBranch
      const pullResult = await pull(
        input.repoId,
        input.destinationBranch,
        destinationWorktreePath,
        signal,
        sourceToken,
      )
      if (!pullResult.ok) return await finish(pullResult)

      const refreshed = await buildPlan(
        {
          repoId: input.repoId,
          sourceBranch: input.sourceBranch,
          sourceWorktreePath: input.sourceWorktreePath,
        },
        {},
        signal,
      )
      if (!sourceUnchanged(current.plan, refreshed, input.destinationBranch)) {
        return await finish(failure('error.merge-out-source-changed'))
      }
    }

    const merge = dependencies.merge ?? mergeRepositoryBranch
    const mergeResult = await merge(
      input.repoId,
      destinationWorktreePath,
      input.sourceBranch,
      signal,
      sourceToken,
    )
    if (!mergeResult.ok) {
      if (mergeResult.reason === 'merge-conflict' && !selectedDestination.requiresTemporaryWorktree) {
        return {
          ...mergeResult,
          conflictWorktree: { branch: input.destinationBranch, path: destinationWorktreePath },
        }
      }
      return await finish(mergeResult)
    }

    if (input.mode === 'pull-merge-push') {
      const push = dependencies.push ?? pushRepositoryBranch
      return await finish(await push(input.repoId, input.destinationBranch, signal, sourceToken))
    }
    return await finish(mergeResult)
  } catch (error) {
    const result = failure(safeMessage(error))
    if (!activeTemporaryDestination) return result
    try {
      return await finishWithTemporaryCleanup(
        result,
        removeWorktree,
        input.repoId,
        activeTemporaryDestination.branch,
        activeTemporaryDestination.path,
        sourceToken,
      )
    } catch (cleanupError) {
      return failure(safeMessage(cleanupError))
    }
  }
}

function sameSource(
  plan: RepositoryBranchMergeOutPlan,
  input: { repoId: string; sourceBranch: string; sourceWorktreePath: string },
): boolean {
  return (
    plan.repoId === input.repoId &&
    plan.sourceBranch === input.sourceBranch &&
    plan.sourceWorktreePath === input.sourceWorktreePath
  )
}

function sourceUnchanged(
  original: RepositoryBranchMergeOutPlan,
  refreshed: Awaited<ReturnType<typeof buildRepositoryBranchMergeOutPlan>>,
  destinationBranch: string,
): boolean {
  if (!refreshed.ok) return false
  const destination = refreshed.plan.destinations.find((candidate) => candidate.branch === destinationBranch)
  return (
    refreshed.plan.token === original.token &&
    refreshed.plan.repoId === original.repoId &&
    refreshed.plan.sourceBranch === original.sourceBranch &&
    refreshed.plan.sourceWorktreePath === original.sourceWorktreePath &&
    refreshed.plan.sourceHead === original.sourceHead &&
    refreshed.plan.message !== 'error.merge-out-source-dirty' &&
    destination?.ready === true
  )
}

async function finishWithTemporaryCleanup(
  result: RepositoryBranchMergeOutResult,
  removeWorktree: typeof removeRepositoryWorktree,
  repoId: string,
  branch: string,
  worktreePath: string,
  sourceToken?: string,
): Promise<RepositoryBranchMergeOutResult> {
  const cleanup = await cleanupTemporaryDestination(removeWorktree, repoId, branch, worktreePath, sourceToken)
  return cleanup.ok ? result : cleanup
}

async function cleanupTemporaryDestination(
  removeWorktree: typeof removeRepositoryWorktree,
  repoId: string,
  branch: string,
  worktreePath: string,
  sourceToken?: string,
): Promise<RepositoryBranchMergeOutResult> {
  if (!isRepositoryTemporaryWorktreePath(repoId, 'merge-out', worktreePath)) {
    return failure('error.merge-out-destination-worktree-unavailable')
  }
  return await removeWorktree(
    repoId,
    {
      branch,
      worktreePath,
      alsoDeleteBranch: false,
      forceRemoveWorktree: true,
    },
    undefined,
    sourceToken,
  )
}

function destinationUnavailableMessage(blockReason: 'dirty-worktree' | 'unavailable-worktree' | undefined): string {
  return blockReason === 'dirty-worktree'
    ? 'error.merge-out-destination-dirty'
    : 'error.merge-out-destination-worktree-unavailable'
}

function failure(message: string): RepositoryBranchMergeOutResult {
  return { ok: false, message }
}

function safeMessage(error: unknown): string {
  if (error instanceof Error && error.name === 'AbortError') return 'cancelled'
  if (error instanceof Error && error.message) return error.message
  return 'error.merge-out-failed'
}
