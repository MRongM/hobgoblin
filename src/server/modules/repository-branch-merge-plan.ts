import { createHash } from 'node:crypto'
import path from 'node:path'
import { getRepositorySnapshot, getRepositoryStatus } from '#/server/modules/repo-read-paths.ts'
import { isValidRepositoryWorktreePath, type RepoSnapshotOptions } from '#/server/modules/repo-backend.ts'
import { isRepositoryTemporaryWorktreePath } from '#/server/modules/repository-temporary-worktree.ts'
import type { BranchSnapshotInfo, StatusEntry, WorktreeStatus } from '#/shared/git-types.ts'
import { isValidBranch, isValidRepoLocator } from '#/shared/input-validation.ts'
import {
  normalizeRepositoryBranchMergeOutPlanRequest,
  type RepositoryBranchMergeDestinationPlan,
  type RepositoryBranchMergeOutPlanResult,
} from '#/shared/repository-branch-merge.ts'
import { isRemoteRepoId, type RepoSnapshot } from '#/shared/rpc.ts'

export interface RepositoryBranchMergePlanDependencies {
  getSnapshot?: (repoId: string, signal?: AbortSignal, options?: RepoSnapshotOptions) => Promise<RepoSnapshot | null>
  getStatus?: (repoId: string, signal?: AbortSignal) => Promise<WorktreeStatus[]>
}

export interface ProjectRepositoryMergeDestinationsInput {
  repoId: string
  sourceBranch: string
  branches: BranchSnapshotInfo[]
  statuses: WorktreeStatus[]
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
  const sourceWorktreePath = normalizePath(repoId, normalized.request.sourceWorktreePath)
  try {
    signal?.throwIfAborted()
    const [snapshot, statuses] = await Promise.all([
      (dependencies.getSnapshot ?? getRepositorySnapshot)(repoId, signal, {
        includeWorktreeStatus: false,
        includeRemote: false,
      }),
      (dependencies.getStatus ?? getRepositoryStatus)(repoId, signal),
    ])
    signal?.throwIfAborted()
    if (!snapshot) return { ok: false, message: 'error.merge-out-repository-unavailable' }

    const source = snapshot.branches.find((branch) => branch.name === sourceBranch)
    if (!source?.worktree || normalizePath(repoId, source.worktree.path) !== sourceWorktreePath) {
      return { ok: false, message: 'error.merge-out-source-worktree-required' }
    }
    const sourceStatus = findStatus(repoId, statuses, sourceWorktreePath)
    if (!sourceStatus) return { ok: false, message: 'error.merge-out-source-worktree-unavailable' }

    const sourceHead = source.worktree.head ?? sourceStatus.head ?? source.lastCommitHash
    const sourceEntries = normalizedEntries(sourceStatus.entries)
    const destinations = projectRepositoryMergeDestinations({
      repoId,
      sourceBranch,
      branches: snapshot.branches,
      statuses,
      isOwnedTemporaryWorktree: (candidateRepoId, candidatePath) =>
        isRepositoryTemporaryWorktreePath(candidateRepoId, 'merge-out', candidatePath),
    })
    const ready = sourceEntries.length === 0 && destinations.some((destination) => destination.ready)
    const message =
      sourceEntries.length > 0
        ? 'error.merge-out-source-dirty'
        : destinations.length === 0
          ? 'error.merge-out-destination-required'
          : destinations.some((destination) => destination.ready)
            ? undefined
            : 'error.merge-out-destination-unavailable'
    const token = fingerprint({
      repoId,
      sourceBranch,
      sourceWorktreePath,
      sourceHead,
      sourceStatus: sourceEntries,
      destinationBranches: destinations.map(({ branch }) => branch),
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
  return input.branches
    .filter((branch) => branch.name !== input.sourceBranch)
    .map((branch): RepositoryBranchMergeDestinationPlan => {
      const worktreePath = branch.worktree?.path
      const destinationStatus = worktreePath ? findStatus(input.repoId, input.statuses, worktreePath) : undefined
      const ownedTemporaryWorktree = Boolean(
        worktreePath && input.isOwnedTemporaryWorktree(input.repoId, worktreePath),
      )
      const lockedTemporaryWorktree = ownedTemporaryWorktree && branch.worktree?.isLocked === true
      const unavailable = Boolean(worktreePath && !destinationStatus && !ownedTemporaryWorktree)
      const dirty = Boolean(destinationStatus && destinationStatus.entries.length > 0 && !ownedTemporaryWorktree)
      const blockReason = dirty
        ? ('dirty-worktree' as const)
        : unavailable || lockedTemporaryWorktree
          ? ('unavailable-worktree' as const)
          : undefined
      return {
        branch: branch.name,
        head: branch.worktree?.head ?? destinationStatus?.head ?? branch.lastCommitHash,
        ready: !blockReason,
        ...(worktreePath ? { worktreePath: normalizePath(input.repoId, worktreePath) } : {}),
        requiresTemporaryWorktree: !worktreePath || ownedTemporaryWorktree,
        pullMergePushReady: Boolean(branch.tracking && !branch.trackingGone),
        ...(blockReason ? { blockReason } : {}),
      }
    })
    .sort((left, right) => left.branch.localeCompare(right.branch))
}

function findStatus(repoId: string, statuses: WorktreeStatus[], worktreePath: string): WorktreeStatus | undefined {
  const expected = normalizePath(repoId, worktreePath)
  return statuses.find((status) => normalizePath(repoId, status.path) === expected)
}

function normalizePath(repoId: string, value: string): string {
  return isRemoteRepoId(repoId) ? path.posix.normalize(value) : path.resolve(value)
}

function normalizedEntries(entries: StatusEntry[]): StatusEntry[] {
  return entries
    .map((entry) => ({
      x: entry.x,
      y: entry.y,
      path: entry.path,
      ...(entry.originalPath ? { originalPath: entry.originalPath } : {}),
    }))
    .sort((left, right) =>
      `${left.path}\0${left.originalPath ?? ''}\0${left.x}${left.y}`.localeCompare(
        `${right.path}\0${right.originalPath ?? ''}\0${right.x}${right.y}`,
      ),
    )
}

function fingerprint(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`
}

function safeMessage(error: unknown): string {
  if (error instanceof Error && error.name === 'AbortError') return 'cancelled'
  if (error instanceof Error && error.message) return error.message
  return 'error.merge-out-read-failed'
}
