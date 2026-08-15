import { buildRepositoryBranchMergeOutPlan } from '#/server/modules/repository-branch-merge-plan.ts'
import {
  createRepositoryWorktree,
  fetchRepositoryRemote,
  mergeRepositoryBranch,
  pullRepositoryBranch,
  pushRepositoryBranch,
  pushRepositoryWorktreeHeadToRemoteBranch,
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
import { parseRemoteBranchRef } from '#/shared/remote-branches.ts'
import {
  repositoryMergeBranchFullRef,
  repositoryMergeBranchSelectionKey,
  type RepositoryMergeBranchSelection,
} from '#/shared/repository-merge-branch.ts'

export interface RepositoryBranchMergeWriteDependencies {
  buildPlan?: typeof buildRepositoryBranchMergeOutPlan
  pull?: typeof pullRepositoryBranch
  merge?: typeof mergeRepositoryBranch
  push?: typeof pushRepositoryBranch
  createWorktree?: typeof createRepositoryWorktree
  removeWorktree?: typeof removeRepositoryWorktree
  fetchRemote?: typeof fetchRepositoryRemote
  pushWorktreeHead?: typeof pushRepositoryWorktreeHeadToRemoteBranch
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

    const selectedDestination = current.plan.destinations.find((candidate) =>
      sameDestination(candidate.destination, input.destination),
    )
    if (!selectedDestination) return failure('error.merge-out-destination-changed')
    if (!selectedDestination.ready) return failure(destinationUnavailableMessage(selectedDestination.blockReason))
    if (input.destination.kind === 'remote') {
      if (input.mode !== 'pull-merge-push') return failure('error.merge-out-remote-requires-push')
      const parsed = parseRemoteBranchRef(input.destination.remoteRef)
      if (!parsed) return failure('error.invalid-arguments')
      const fetchRemote = dependencies.fetchRemote ?? fetchRepositoryRemote
      const fetchResult = await fetchRemote(input.repoId, parsed.remote, signal, sourceToken, {
        publishInvalidation: false,
      })
      if (!fetchResult.ok) return fetchResult
      signal?.throwIfAborted()

      const refreshed = await buildPlan(
        {
          repoId: input.repoId,
          sourceBranch: input.sourceBranch,
          sourceWorktreePath: input.sourceWorktreePath,
        },
        {},
        signal,
      )
      const refreshFailure = remoteRefreshFailure(current.plan, refreshed, input.destination)
      if (refreshFailure) return failure(refreshFailure)

      const temporaryPath = repositoryTemporaryWorktreePath(
        input.repoId,
        'merge-out',
        current.plan.token,
        repositoryMergeBranchSelectionKey(input.destination),
      )
      if (!temporaryPath) return failure('error.merge-out-temporary-worktree-unavailable')

      if (selectedDestination.worktreePath) {
        if (!isRepositoryTemporaryWorktreePath(input.repoId, 'merge-out', selectedDestination.worktreePath)) {
          return failure('error.merge-out-destination-worktree-unavailable')
        }
        const staleCleanup = await cleanupTemporaryDestination(
          removeWorktree,
          input.repoId,
          parsed.branch,
          selectedDestination.worktreePath,
          sourceToken,
        )
        if (!staleCleanup.ok) return staleCleanup
      }

      const create = dependencies.createWorktree ?? createRepositoryWorktree
      const createResult = await create(
        input.repoId,
        {
          worktreePath: temporaryPath,
          mode: { kind: 'detached', ref: repositoryMergeBranchFullRef(input.destination) },
          syncBeforeCreate: false,
        },
        { kind: 'skip' },
        signal,
        sourceToken,
      )
      const temporaryCreated = createResult.ok || createResult.repoChanged === true
      if (temporaryCreated) activeTemporaryDestination = { branch: parsed.branch, path: temporaryPath }
      if (!createResult.ok) {
        return temporaryCreated
          ? await finishWithTemporaryCleanup(
              createResult,
              removeWorktree,
              input.repoId,
              parsed.branch,
              temporaryPath,
              sourceToken,
            )
          : createResult
      }

      const finish = async (result: RepositoryBranchMergeOutResult): Promise<RepositoryBranchMergeOutResult> =>
        await finishWithTemporaryCleanup(
          result,
          removeWorktree,
          input.repoId,
          parsed.branch,
          temporaryPath,
          sourceToken,
        )
      const merge = dependencies.merge ?? mergeRepositoryBranch
      const mergeResult = await merge(
        input.repoId,
        temporaryPath,
        repositoryMergeBranchFullRef({ kind: 'local', branch: input.sourceBranch }),
        signal,
        sourceToken,
      )
      if (!mergeResult.ok) return await finish(mergeResult)
      const pushWorktreeHead = dependencies.pushWorktreeHead ?? pushRepositoryWorktreeHeadToRemoteBranch
      return await finish(
        await pushWorktreeHead(
          input.repoId,
          temporaryPath,
          input.destination.remoteRef,
          signal,
          sourceToken,
        ),
      )
    }

    const destinationBranch = input.destination.branch
    if (input.mode === 'pull-merge-push' && !selectedDestination.pullMergePushReady) {
      return failure('error.merge-out-destination-upstream-required')
    }

    const temporaryPath = selectedDestination.requiresTemporaryWorktree
      ? repositoryTemporaryWorktreePath(input.repoId, 'merge-out', current.plan.token, destinationBranch)
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
        destinationBranch,
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
          mode: { kind: 'existingBranch', branch: destinationBranch },
          syncBeforeCreate: false,
        },
        { kind: 'skip' },
        signal,
        sourceToken,
      )
      temporaryCreated = createResult.ok || createResult.repoChanged === true
      if (temporaryCreated) {
        activeTemporaryDestination = { branch: destinationBranch, path: destinationWorktreePath }
      }
      if (!createResult.ok) {
        return temporaryCreated
          ? await finishWithTemporaryCleanup(
              createResult,
              removeWorktree,
              input.repoId,
              destinationBranch,
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
            destinationBranch,
            destinationWorktreePath,
            sourceToken,
          )
        : result

    if (input.mode === 'pull-merge-push') {
      const pull = dependencies.pull ?? pullRepositoryBranch
      const pullResult = await pull(input.repoId, destinationBranch, destinationWorktreePath, signal, sourceToken)
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
      if (!sourceUnchanged(current.plan, refreshed, input.destination)) {
        return await finish(failure('error.merge-out-source-changed'))
      }
    }

    const merge = dependencies.merge ?? mergeRepositoryBranch
    const mergeResult = await merge(input.repoId, destinationWorktreePath, input.sourceBranch, signal, sourceToken)
    if (!mergeResult.ok) {
      if (mergeResult.reason === 'merge-conflict' && !selectedDestination.requiresTemporaryWorktree) {
        return {
          ...mergeResult,
          conflictWorktree: { branch: destinationBranch, path: destinationWorktreePath },
        }
      }
      return await finish(mergeResult)
    }

    if (input.mode === 'pull-merge-push') {
      const push = dependencies.push ?? pushRepositoryBranch
      return await finish(await push(input.repoId, destinationBranch, signal, sourceToken))
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
  selectedDestination: RepositoryMergeBranchSelection,
): boolean {
  if (!refreshed.ok) return false
  const destination = refreshed.plan.destinations.find((candidate) =>
    sameDestination(candidate.destination, selectedDestination),
  )
  return (
    refreshed.plan.repoId === original.repoId &&
    refreshed.plan.sourceBranch === original.sourceBranch &&
    refreshed.plan.sourceWorktreePath === original.sourceWorktreePath &&
    refreshed.plan.sourceHead === original.sourceHead &&
    refreshed.plan.message !== 'error.merge-out-source-dirty' &&
    destination?.ready === true
  )
}

function remoteRefreshFailure(
  original: RepositoryBranchMergeOutPlan,
  refreshed: Awaited<ReturnType<typeof buildRepositoryBranchMergeOutPlan>>,
  selectedDestination: Extract<RepositoryMergeBranchSelection, { kind: 'remote' }>,
): string | null {
  if (!refreshed.ok) return refreshed.message
  if (
    refreshed.plan.repoId !== original.repoId ||
    refreshed.plan.sourceBranch !== original.sourceBranch ||
    refreshed.plan.sourceWorktreePath !== original.sourceWorktreePath ||
    refreshed.plan.sourceHead !== original.sourceHead ||
    refreshed.plan.message === 'error.merge-out-source-dirty'
  ) {
    return 'error.merge-out-source-changed'
  }
  const originalDestination = original.destinations.find((candidate) =>
    sameDestination(candidate.destination, selectedDestination),
  )
  const refreshedDestination = refreshed.plan.destinations.find((candidate) =>
    sameDestination(candidate.destination, selectedDestination),
  )
  return originalDestination &&
    refreshedDestination?.ready === true &&
    refreshedDestination.head === originalDestination.head
    ? null
    : 'error.merge-out-destination-changed'
}

function sameDestination(
  left: RepositoryMergeBranchSelection,
  right: RepositoryMergeBranchSelection,
): boolean {
  return repositoryMergeBranchSelectionKey(left) === repositoryMergeBranchSelectionKey(right)
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
