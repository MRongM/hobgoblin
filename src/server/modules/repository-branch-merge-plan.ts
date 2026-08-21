import {
  getRepositoryRemoteBranchInfo,
  getRepositorySnapshot,
  getRepositoryStatus,
} from '#/server/modules/repo-read-paths.ts'
import { isValidRepositoryWorktreePath, type RepoSnapshotOptions } from '#/server/modules/repo-backend.ts'
import { isRepositoryTemporaryWorktreePath } from '#/server/modules/repository-temporary-worktree.ts'
import {
  findRepositoryStatus,
  normalizeRepositoryPath,
  normalizedStatusEntries,
  repositoryPlanFingerprint,
} from '#/server/modules/repository-status-plan.ts'
import type { BranchSnapshotInfo, WorktreeStatus } from '#/shared/git-types.ts'
import { hasUnmergedStatusEntries } from '#/shared/git-conflicts.ts'
import type { RemoteTrackingBranchInfo } from '#/shared/remote-branches.ts'
import { isValidBranch, isValidRepoLocator } from '#/shared/input-validation.ts'
import {
  normalizeRepositoryBranchMergeOutPlanRequest,
  type RepositoryBranchMergeDestinationPlan,
  type RepositoryBranchMergeOutPlanResult,
} from '#/shared/repository-branch-merge.ts'
import {
  repositoryMergeBranchDisplayName,
  repositoryMergeBranchSelectionKey,
} from '#/shared/repository-merge-branch.ts'
import type { RepoSnapshot } from '#/shared/rpc.ts'

export interface RepositoryBranchMergePlanDependencies {
  getSnapshot?: (repoId: string, signal?: AbortSignal, options?: RepoSnapshotOptions) => Promise<RepoSnapshot | null>
  getStatus?: (repoId: string, signal?: AbortSignal) => Promise<WorktreeStatus[]>
  getRemoteBranchInfo?: (repoId: string, signal?: AbortSignal) => Promise<RemoteTrackingBranchInfo[]>
}

export interface ProjectRepositoryMergeDestinationsInput {
  repoId: string
  sourceBranch: string
  branches: BranchSnapshotInfo[]
  statuses: WorktreeStatus[]
  remoteBranches: RemoteTrackingBranchInfo[]
  isOwnedTemporaryWorktree: (repoId: string, candidatePath: string) => boolean
}

export async function buildRepositoryBranchMergeOutPlan(
  request: unknown,
  dependencies: RepositoryBranchMergePlanDependencies = {},
  signal?: AbortSignal,
): Promise<RepositoryBranchMergeOutPlanResult> {
  const normalized = normalizeRepositoryBranchMergeOutPlanRequest(request)
  if (
    !normalized.ok ||
    !isValidRepoLocator(normalized.request.repoId) ||
    !isValidBranch(normalized.request.sourceBranch) ||
    !isValidRepositoryWorktreePath(normalized.request.repoId, normalized.request.sourceWorktreePath)
  ) {
    return { ok: false, message: 'error.invalid-arguments' }
  }

  const { repoId, sourceBranch } = normalized.request
  const sourceWorktreePath = normalizeRepositoryPath(repoId, normalized.request.sourceWorktreePath)
  try {
    signal?.throwIfAborted()
    const [snapshot, statuses, remoteBranches] = await Promise.all([
      (dependencies.getSnapshot ?? getRepositorySnapshot)(repoId, signal, {
        includeWorktreeStatus: false,
        includeRemote: false,
      }),
      (dependencies.getStatus ?? getRepositoryStatus)(repoId, signal),
      (dependencies.getRemoteBranchInfo ?? getRepositoryRemoteBranchInfo)(repoId, signal),
    ])
    signal?.throwIfAborted()
    if (!snapshot) return { ok: false, message: 'error.merge-out-repository-unavailable' }

    const source = snapshot.branches.find((branch) => branch.name === sourceBranch)
    if (!source?.worktree || normalizeRepositoryPath(repoId, source.worktree.path) !== sourceWorktreePath) {
      return { ok: false, message: 'error.merge-out-source-worktree-required' }
    }
    const sourceStatus = findRepositoryStatus(repoId, statuses, sourceWorktreePath)
    if (!sourceStatus) return { ok: false, message: 'error.merge-out-source-worktree-unavailable' }

    const sourceHead = source.worktree.head ?? sourceStatus.head ?? source.lastCommitHash
    const sourceEntries = normalizedStatusEntries(sourceStatus.entries)
    const sourceConflicted = hasUnmergedStatusEntries(sourceEntries)
    const destinations = projectRepositoryMergeDestinations({
      repoId,
      sourceBranch,
      branches: snapshot.branches,
      statuses,
      remoteBranches,
      isOwnedTemporaryWorktree: (candidateRepoId, candidatePath) =>
        isRepositoryTemporaryWorktreePath(candidateRepoId, 'merge-out', candidatePath),
    })
    const ready = !sourceConflicted && destinations.some((destination) => destination.ready)
    const message = sourceConflicted
      ? 'error.merge-out-source-conflicted'
      : destinations.length === 0
        ? 'error.merge-out-destination-required'
        : destinations.some((destination) => destination.ready)
          ? undefined
          : 'error.merge-out-destination-unavailable'
    const token = repositoryPlanFingerprint({
      repoId,
      sourceBranch,
      sourceWorktreePath,
      sourceHead,
      sourceConflicted,
      destinations: destinations.map(({ destination, head }) => ({
        key: repositoryMergeBranchSelectionKey(destination),
        ...(destination.kind === 'remote' ? { head } : {}),
      })),
    })
    return {
      ok: true,
      plan: {
        token,
        repoId,
        sourceBranch,
        sourceWorktreePath,
        sourceHead,
        ready,
        ...(message ? { message } : {}),
        destinations,
      },
    }
  } catch (error) {
    return { ok: false, message: safeMessage(error) }
  }
}

export function projectRepositoryMergeDestinations(
  input: ProjectRepositoryMergeDestinationsInput,
): RepositoryBranchMergeDestinationPlan[] {
  const localDestinations = input.branches
    .filter((branch) => branch.name !== input.sourceBranch)
    .map((branch): RepositoryBranchMergeDestinationPlan => {
      const worktreePath = branch.worktree?.path
      const destinationStatus = worktreePath
        ? findRepositoryStatus(input.repoId, input.statuses, worktreePath)
        : undefined
      const ownedTemporaryWorktree = Boolean(worktreePath && input.isOwnedTemporaryWorktree(input.repoId, worktreePath))
      const lockedTemporaryWorktree = ownedTemporaryWorktree && branch.worktree?.isLocked === true
      const unavailable = Boolean(worktreePath && !destinationStatus && !ownedTemporaryWorktree)
      const dirty = Boolean(destinationStatus && destinationStatus.entries.length > 0 && !ownedTemporaryWorktree)
      const blockReason = dirty
        ? ('dirty-worktree' as const)
        : unavailable || lockedTemporaryWorktree
          ? ('unavailable-worktree' as const)
          : undefined
      return {
        destination: { kind: 'local', branch: branch.name },
        head: branch.worktree?.head ?? destinationStatus?.head ?? branch.lastCommitHash,
        ready: !blockReason,
        ...(worktreePath ? { worktreePath: normalizeRepositoryPath(input.repoId, worktreePath) } : {}),
        requiresTemporaryWorktree: !worktreePath || ownedTemporaryWorktree,
        pullMergePushReady: Boolean(branch.tracking && !branch.trackingGone),
        ...(blockReason ? { blockReason } : {}),
      }
    })
  const remoteDestinations = input.remoteBranches.map(
    ({ remoteRef, head }): RepositoryBranchMergeDestinationPlan => ({
      destination: { kind: 'remote', remoteRef },
      head,
      ready: true,
      requiresTemporaryWorktree: true,
      pullMergePushReady: true,
    }),
  )
  return [...localDestinations, ...remoteDestinations].sort((left, right) => {
    if (left.destination.kind !== right.destination.kind) return left.destination.kind === 'local' ? -1 : 1
    return repositoryMergeBranchDisplayName(left.destination).localeCompare(
      repositoryMergeBranchDisplayName(right.destination),
    )
  })
}

function safeMessage(error: unknown): string {
  if (error instanceof Error && error.name === 'AbortError') return 'cancelled'
  if (error instanceof Error && error.message) return error.message
  return 'error.merge-out-read-failed'
}
