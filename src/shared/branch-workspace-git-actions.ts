import type { GitConflictWorktree, GitFailureReason } from '#/shared/git-types.ts'
import { isWorkspaceRepositoryName } from '#/shared/workspace.ts'

export type BranchWorkspaceGitActionKind = 'batch-commit' | 'batch-merge-in' | 'batch-merge-out' | 'pull' | 'push'
export type BranchWorkspaceMergeMode = 'merge' | 'pull-merge-push'
export type BranchWorkspaceGitActionStep = 'commit' | 'prepare' | 'pull' | 'merge' | 'push' | 'cleanup'
export type BranchWorkspaceGitActionMemberPhase = 'ready' | 'satisfied' | 'succeeded' | 'failed' | 'not-started'

export interface BranchWorkspaceBatchCommitMemberPlan {
  repositoryName: string
  repoId: string
  targetBranch: string
  targetWorktreePath: string
  dirty: boolean
  changeCount: number
  fingerprint: string
}

export interface BranchWorkspaceBatchMergeInSourcePlan {
  branch: string
  head: string
}

export interface BranchWorkspaceBatchMergeInMemberPlan {
  repositoryName: string
  repoId: string
  targetBranch: string
  targetWorktreePath: string
  targetHead: string
  ready: boolean
  pullMergePushReady: boolean
  message?: string
  sourceBranches: BranchWorkspaceBatchMergeInSourcePlan[]
  fingerprint: string
}

export interface BranchWorkspaceBatchMergeOutDestinationPlan {
  branch: string
  head: string
  ready: boolean
  worktreePath?: string
  requiresTemporaryWorktree: boolean
  pullMergePushReady: boolean
  message?: string
}

export interface BranchWorkspaceBatchMergeOutMemberPlan {
  repositoryName: string
  repoId: string
  targetBranch: string
  targetWorktreePath: string
  targetHead: string
  ready: boolean
  message?: string
  destinationBranches: BranchWorkspaceBatchMergeOutDestinationPlan[]
  fingerprint: string
}

export interface BranchWorkspaceSyncMemberPlan {
  repositoryName: string
  repoId: string
  targetBranch: string
  targetWorktreePath: string
  targetHead: string
  ready: boolean
  message?: string
  fingerprint: string
}

interface BranchWorkspaceGitActionPlanBase {
  token: string
  rootId: string
  branchWorkspaceId: string
}

export interface BranchWorkspaceBatchCommitPlan extends BranchWorkspaceGitActionPlanBase {
  kind: 'batch-commit'
  members: BranchWorkspaceBatchCommitMemberPlan[]
}

export interface BranchWorkspaceBatchMergeInPlan extends BranchWorkspaceGitActionPlanBase {
  kind: 'batch-merge-in'
  members: BranchWorkspaceBatchMergeInMemberPlan[]
}

export interface BranchWorkspaceBatchMergeOutPlan extends BranchWorkspaceGitActionPlanBase {
  kind: 'batch-merge-out'
  members: BranchWorkspaceBatchMergeOutMemberPlan[]
}

export interface BranchWorkspaceSyncPlan extends BranchWorkspaceGitActionPlanBase {
  kind: 'pull' | 'push'
  members: BranchWorkspaceSyncMemberPlan[]
  ready: boolean
}

export type BranchWorkspaceGitActionPlan =
  | BranchWorkspaceBatchCommitPlan
  | BranchWorkspaceBatchMergeInPlan
  | BranchWorkspaceBatchMergeOutPlan
  | BranchWorkspaceSyncPlan

export type BranchWorkspaceGitActionPlanResult =
  | { ok: true; plan: BranchWorkspaceGitActionPlan }
  | { ok: false; message: string; repositoryName?: string }

export interface BranchWorkspaceGitActionPlanRequest {
  kind: BranchWorkspaceGitActionKind
  branchWorkspaceId: string
}

export type BranchWorkspaceGitActionPlanRequestResult =
  | { ok: true; request: BranchWorkspaceGitActionPlanRequest }
  | { ok: false; message: string }

export interface BranchWorkspaceCommitMessageInput {
  repositoryName: string
  message: string
}

export interface BranchWorkspaceBatchMergeInSourceInput {
  repositoryName: string
  sourceBranch: string
}

export interface BranchWorkspaceBatchMergeOutTargetInput {
  repositoryName: string
  destinationBranch: string
}

export type BranchWorkspaceGitActionExecuteInput =
  | {
      kind: 'batch-commit'
      planToken: string
      messages: BranchWorkspaceCommitMessageInput[]
    }
  | {
      kind: 'batch-merge-in'
      planToken: string
      mode: BranchWorkspaceMergeMode
      sources: BranchWorkspaceBatchMergeInSourceInput[]
    }
  | {
      kind: 'batch-merge-out'
      planToken: string
      mode: BranchWorkspaceMergeMode
      targets: BranchWorkspaceBatchMergeOutTargetInput[]
    }
  | {
      kind: 'pull' | 'push'
      planToken: string
    }

export type BranchWorkspaceGitActionExecuteInputResult =
  | { ok: true; input: BranchWorkspaceGitActionExecuteInput }
  | { ok: false; message: string }

export interface BranchWorkspaceGitActionMemberResult {
  repositoryName: string
  phase: BranchWorkspaceGitActionMemberPhase
  step?: BranchWorkspaceGitActionStep
  message?: string
  reason?: GitFailureReason
  conflictWorktree?: GitConflictWorktree
}

export interface BranchWorkspaceGitActionResult {
  ok: boolean
  kind: BranchWorkspaceGitActionKind
  planToken: string
  branchWorkspaceId: string
  members: BranchWorkspaceGitActionMemberResult[]
  message?: string
}

export function normalizeBranchWorkspaceGitActionPlanRequest(
  value: unknown,
): BranchWorkspaceGitActionPlanRequestResult {
  const input = asRecord(value)
  const branchWorkspaceId = normalizedText(input?.branchWorkspaceId)
  if (
    !branchWorkspaceId ||
    (input?.kind !== 'batch-commit' &&
      input?.kind !== 'batch-merge-in' &&
      input?.kind !== 'batch-merge-out' &&
      input?.kind !== 'pull' &&
      input?.kind !== 'push')
  ) {
    return invalidArguments()
  }
  return { ok: true, request: { kind: input.kind, branchWorkspaceId } }
}

export function normalizeBranchWorkspaceGitActionExecuteInput(
  value: unknown,
): BranchWorkspaceGitActionExecuteInputResult {
  const input = asRecord(value)
  const planToken = normalizedText(input?.planToken)
  if (!planToken) return invalidArguments()

  if (input?.kind === 'batch-merge-in') {
    if (input.mode !== 'merge' && input.mode !== 'pull-merge-push') return invalidArguments()
    const sources = normalizedBatchMergeInSources(input.sources)
    if (!sources) return invalidArguments()
    return { ok: true, input: { kind: 'batch-merge-in', planToken, mode: input.mode, sources } }
  }
  if (input?.kind === 'batch-merge-out') {
    if (input.mode !== 'merge' && input.mode !== 'pull-merge-push') return invalidArguments()
    const targets = normalizedBatchMergeTargets(input.targets)
    if (!targets) return invalidArguments()
    return { ok: true, input: { kind: 'batch-merge-out', planToken, mode: input.mode, targets } }
  }
  if (input?.kind === 'pull' || input?.kind === 'push') {
    return { ok: true, input: { kind: input.kind, planToken } }
  }
  if (input?.kind !== 'batch-commit' || !Array.isArray(input.messages)) return invalidArguments()

  const repositoryNames = new Set<string>()
  const messages: BranchWorkspaceCommitMessageInput[] = []
  for (const value of input.messages) {
    const candidate = asRecord(value)
    const repositoryName = normalizedText(candidate?.repositoryName)
    const message = normalizedMessage(candidate?.message)
    if (
      !repositoryName ||
      !isWorkspaceRepositoryName(repositoryName) ||
      !message ||
      repositoryNames.has(repositoryName)
    ) {
      return invalidArguments()
    }
    repositoryNames.add(repositoryName)
    messages.push({ repositoryName, message })
  }
  return { ok: true, input: { kind: 'batch-commit', planToken, messages } }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function normalizedText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text && !text.includes('\0') && !/[\x00-\x1f\x7f]/.test(text) ? text : null
}

function normalizedMessage(value: unknown): string | null {
  if (typeof value !== 'string' || value.includes('\0')) return null
  const message = value.trim()
  return message ? message : null
}

function normalizedBatchMergeInSources(value: unknown): BranchWorkspaceBatchMergeInSourceInput[] | null {
  const mappings = normalizedBatchMergeMappings(value, 'sourceBranch')
  return mappings?.map(({ repositoryName, branch }) => ({ repositoryName, sourceBranch: branch })) ?? null
}

function normalizedBatchMergeTargets(value: unknown): BranchWorkspaceBatchMergeOutTargetInput[] | null {
  const mappings = normalizedBatchMergeMappings(value, 'destinationBranch')
  return mappings?.map(({ repositoryName, branch }) => ({ repositoryName, destinationBranch: branch })) ?? null
}

function normalizedBatchMergeMappings(
  value: unknown,
  branchKey: 'sourceBranch' | 'destinationBranch',
): Array<{ repositoryName: string; branch: string }> | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const names = new Set<string>()
  const mappings: Array<{ repositoryName: string; branch: string }> = []
  for (const candidate of value) {
    const input = asRecord(candidate)
    const name = normalizedText(input?.repositoryName)
    const branch = normalizedText(input?.[branchKey])
    if (!name || !branch || !isWorkspaceRepositoryName(name) || names.has(name)) return null
    names.add(name)
    mappings.push({ repositoryName: name, branch })
  }
  return mappings
}

function invalidArguments(): { ok: false; message: string } {
  return { ok: false, message: 'error.invalid-arguments' }
}
