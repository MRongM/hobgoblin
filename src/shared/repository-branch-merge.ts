import type { ExecResult } from '#/shared/git-types.ts'

export type RepositoryBranchMergeMode = 'merge' | 'pull-merge-push'

export type RepositoryBranchMergeDestinationBlockReason = 'dirty-worktree' | 'unavailable-worktree'

export interface RepositoryBranchMergeDestinationPlan {
  branch: string
  head: string
  ready: boolean
  worktreePath?: string
  requiresTemporaryWorktree: boolean
  pullMergePushReady: boolean
  blockReason?: RepositoryBranchMergeDestinationBlockReason
}

export interface RepositoryBranchMergeOutPlanRequest {
  repoId: string
  sourceBranch: string
  sourceWorktreePath: string
}

export interface RepositoryBranchMergeOutPlan {
  token: string
  repoId: string
  sourceBranch: string
  sourceWorktreePath: string
  sourceHead: string
  ready: boolean
  message?: string
  destinations: RepositoryBranchMergeDestinationPlan[]
}

export type RepositoryBranchMergeOutPlanResult =
  | { ok: true; plan: RepositoryBranchMergeOutPlan }
  | { ok: false; message: string }

export interface RepositoryBranchMergeOutExecuteInput extends RepositoryBranchMergeOutPlanRequest {
  planToken: string
  destinationBranch: string
  mode: RepositoryBranchMergeMode
}

export interface RepositoryBranchMergeOutConflictWorktree {
  branch: string
  path: string
}

export interface RepositoryBranchMergeOutResult extends ExecResult {
  conflictWorktree?: RepositoryBranchMergeOutConflictWorktree
}

export type RepositoryBranchMergeOutPlanRequestResult =
  | { ok: true; request: RepositoryBranchMergeOutPlanRequest }
  | { ok: false; message: string }

export type RepositoryBranchMergeOutExecuteInputResult =
  | { ok: true; input: RepositoryBranchMergeOutExecuteInput }
  | { ok: false; message: string }

export function normalizeRepositoryBranchMergeOutPlanRequest(
  value: unknown,
): RepositoryBranchMergeOutPlanRequestResult {
  const input = asRecord(value)
  const repoId = normalizedText(input?.repoId)
  const sourceBranch = normalizedText(input?.sourceBranch)
  const sourceWorktreePath = normalizedText(input?.sourceWorktreePath)
  if (!repoId || !sourceBranch || !sourceWorktreePath) return invalidArguments()
  return { ok: true, request: { repoId, sourceBranch, sourceWorktreePath } }
}

export function normalizeRepositoryBranchMergeOutExecuteInput(
  value: unknown,
): RepositoryBranchMergeOutExecuteInputResult {
  const request = normalizeRepositoryBranchMergeOutPlanRequest(value)
  const input = asRecord(value)
  const planToken = normalizedText(input?.planToken)
  const destinationBranch = normalizedText(input?.destinationBranch)
  const mode = input?.mode
  if (
    !request.ok ||
    !planToken ||
    !destinationBranch ||
    destinationBranch === request.request.sourceBranch ||
    (mode !== 'merge' && mode !== 'pull-merge-push')
  ) {
    return invalidArguments()
  }
  return {
    ok: true,
    input: {
      ...request.request,
      planToken,
      destinationBranch,
      mode,
    },
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function normalizedText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text && !/[\x00-\x1f\x7f]/.test(text) ? text : null
}

function invalidArguments(): { ok: false; message: string } {
  return { ok: false, message: 'error.invalid-arguments' }
}
